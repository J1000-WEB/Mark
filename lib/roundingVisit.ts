// MARK 2026-10-12: "라운딩" 탭 — 소천님(SV)이 매장에 방문해서 체크하는 걸 디지털화.
// 기존에 엑셀 1개=방문 1회로 관리하던 걸(매장방문기록_모듈.xlsx) 참고해서, 그 안의
// O/X 24개 체크리스트(인사관리/매장관리/매출관리/재고관리, 각 항목 배점·총점·등급 공식)는
// 그대로 가져오고, 숫자(매출/재고/목표)는 MARK에 이미 있는 데이터에서 자동으로 채웁니다
// (엑셀에선 사람이 ERP에서 보고 직접 타이핑하던 값들).
//
// 저장 방식은 Action_Log와 같은 "계속 쌓이는 로그" 패턴(appendValues) — 방문 1회 = 1행.
// 매장별_재고_스냅샷 같은 "덮어쓰기 스냅샷"이 아니라, 방문 기록은 지우지 않고 쌓아야
// 나중에 "직전 방문 대비"/점포 관리 히스토리로 쓸 수 있습니다.

import {
  getDbSheetId,
  getSheetValuesById,
  ensureSheetExistsById,
  appendValuesById,
  updateValuesById,
} from "./googleSheets";
import { buildStoreSalesSummary, normalizeStoreKey, readStoreStockSnapshot } from "./dataBuilder";
import { getRegionForStore } from "./storeRegion";
import { getStylePriceMap } from "./stylePriceHistory";
import {
  ROUNDING_CHECKLIST,
  ROUNDING_CATEGORY_MAX,
  ROUNDING_CATEGORIES,
  computeRoundingScore,
  type RoundingCategory,
  type RoundingChecklistItem,
  type RoundingCheckValue,
  type RoundingChecklistState,
} from "./roundingChecklist";

export {
  ROUNDING_CHECKLIST,
  ROUNDING_CATEGORY_MAX,
  ROUNDING_CATEGORIES,
  computeRoundingScore,
  type RoundingCategory,
  type RoundingChecklistItem,
  type RoundingCheckValue,
  type RoundingChecklistState,
};

function text(v: any) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function num(v: any) {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: any) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function nowKSTDateTime() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const iso = now.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

function todayKSTDateKey() {
  return nowKSTDateTime().slice(0, 10);
}

function dateAddDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function safeJsonParse<T>(s: any, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(String(s));
  } catch {
    return fallback;
  }
}

// ========================= 시트 스키마 =========================
const VISIT_SHEET = "라운딩_방문기록";
const VISIT_HEADER = [
  "방문ID", "방문일", "매장명", "지역", "담당자",
  "금주목표", "금주실적", "금주달성율", "전주매출", "전전주매출", "전주대비신장률",
  "금주객수", "금주객단가", "총재고수량", "총재고금액",
  "체크리스트JSON", "인사점수", "매장점수", "매출점수", "재고점수", "총점", "등급",
  "코멘트_인사관리", "코멘트_매장관리", "코멘트_매출관리", "코멘트_재고관리",
  "사진JSON", "알람JSON", "작성자", "생성일시",
];
const VISIT_RANGE = "A:AD"; // 30개 컬럼(A~AD)

const ISSUE_SHEET = "라운딩_지적사항";
const ISSUE_HEADER = [
  "지적ID", "방문ID", "지적일", "매장명", "영역", "항목", "지적내용", "조치_피드백", "상태", "완료일", "생성일시",
  // MARK 2026-10-28: 라운딩 재고점검에서 남기는 조치 — 대상(STYLE|COLOR|SIZE 또는 STYLE), 조치유형, 기한, 당시수치JSON
  "대상", "조치유형", "기한", "당시수치",
];
const ISSUE_RANGE = "A:O";

export async function ensureRoundingSheets() {
  const dbId = getDbSheetId();
  await Promise.all([
    ensureSheetExistsById(dbId, VISIT_SHEET, VISIT_HEADER),
    ensureSheetExistsById(dbId, ISSUE_SHEET, ISSUE_HEADER),
  ]);
  // 예전(11열) 헤더로 만들어진 시트면 L~O 헤더를 채움
  const head = await getSheetValuesById(dbId, ISSUE_SHEET, "A1:O1").catch(() => [] as any[]);
  if ((head?.[0] || []).length < ISSUE_HEADER.length) {
    await updateValuesById(dbId, `'${ISSUE_SHEET}'!A1:O1`, [ISSUE_HEADER]);
  }
}

// ========================= 방문기록 =========================
export interface RoundingVisitRecord {
  visitId: string;
  visitDate: string;
  storeName: string;
  region: string;
  visitedBy: string;
  periodTarget: number;
  periodActual: number;
  achievementRate: number | null;
  prevWeekAmount: number;
  prevPrevWeekAmount: number;
  wowGrowthRate: number | null;
  receiptCount: number;
  avgReceiptAmount: number | null;
  totalStockQty: number;
  totalStockAmount: number;
  checklist: RoundingChecklistState;
  scoreByCategory: Record<RoundingCategory, number>;
  totalScore: number;
  grade: string;
  comments: Record<RoundingCategory, string>;
  photos: string[]; // Drive file id 목록
  alerts: { text: string; level: string }[];
  author: string;
  createdAt: string;
}

export interface SaveRoundingVisitInput {
  storeName: string;
  visitDate?: string;
  visitedBy?: string;
  autoFill: {
    region: string;
    periodTarget: number;
    periodActual: number;
    achievementRate: number | null;
    prevWeekAmount: number;
    prevPrevWeekAmount: number;
    wowGrowthRate: number | null;
    receiptCount: number;
    avgReceiptAmount: number | null;
    totalStockQty: number;
    totalStockAmount: number;
  };
  checklist: RoundingChecklistState;
  comments: Partial<Record<RoundingCategory, string>>;
  photos?: string[];
  alerts?: { text: string; level: string }[];
  author?: string;
}

function rowToVisitRecord(r: any[]): RoundingVisitRecord | null {
  if (!r || !text(r[0])) return null;
  const checklist = safeJsonParse<RoundingChecklistState>(r[15], {});
  return {
    visitId: text(r[0]),
    visitDate: text(r[1]),
    storeName: text(r[2]),
    region: text(r[3]),
    visitedBy: text(r[4]),
    periodTarget: num(r[5]),
    periodActual: num(r[6]),
    achievementRate: numOrNull(r[7]),
    prevWeekAmount: num(r[8]),
    prevPrevWeekAmount: num(r[9]),
    wowGrowthRate: numOrNull(r[10]),
    receiptCount: num(r[11]),
    avgReceiptAmount: numOrNull(r[12]),
    totalStockQty: num(r[13]),
    totalStockAmount: num(r[14]),
    checklist,
    scoreByCategory: {
      인사관리: num(r[16]),
      매장관리: num(r[17]),
      매출관리: num(r[18]),
      재고관리: num(r[19]),
    },
    totalScore: num(r[20]),
    grade: text(r[21]),
    comments: {
      인사관리: text(r[22]),
      매장관리: text(r[23]),
      매출관리: text(r[24]),
      재고관리: text(r[25]),
    },
    photos: safeJsonParse<string[]>(r[26], []),
    alerts: safeJsonParse<{ text: string; level: string }[]>(r[27], []),
    author: text(r[28]),
    createdAt: text(r[29]),
  };
}

export async function saveRoundingVisit(input: SaveRoundingVisitInput): Promise<RoundingVisitRecord> {
  await ensureRoundingSheets();
  const dbId = getDbSheetId();

  const { byCategory, totalScore, grade } = computeRoundingScore(input.checklist);
  const visitId = makeId("V");
  const visitDate = input.visitDate || todayKSTDateKey();
  const createdAt = nowKSTDateTime();
  const comments: Record<RoundingCategory, string> = {
    인사관리: text(input.comments?.인사관리),
    매장관리: text(input.comments?.매장관리),
    매출관리: text(input.comments?.매출관리),
    재고관리: text(input.comments?.재고관리),
  };

  const row = [
    visitId,
    visitDate,
    input.storeName,
    input.autoFill.region,
    input.visitedBy || "소천",
    input.autoFill.periodTarget,
    input.autoFill.periodActual,
    input.autoFill.achievementRate ?? "",
    input.autoFill.prevWeekAmount,
    input.autoFill.prevPrevWeekAmount,
    input.autoFill.wowGrowthRate ?? "",
    input.autoFill.receiptCount,
    input.autoFill.avgReceiptAmount ?? "",
    input.autoFill.totalStockQty,
    input.autoFill.totalStockAmount,
    JSON.stringify(input.checklist || {}),
    byCategory.인사관리,
    byCategory.매장관리,
    byCategory.매출관리,
    byCategory.재고관리,
    totalScore,
    grade,
    comments.인사관리,
    comments.매장관리,
    comments.매출관리,
    comments.재고관리,
    JSON.stringify(input.photos || []),
    JSON.stringify(input.alerts || []),
    input.author || input.visitedBy || "소천",
    createdAt,
  ];

  await appendValuesById(dbId, `'${VISIT_SHEET}'!${VISIT_RANGE}`, [row]);

  return rowToVisitRecord(row) as RoundingVisitRecord;
}

export async function listRoundingVisits(opts: { storeName?: string } = {}): Promise<RoundingVisitRecord[]> {
  const dbId = getDbSheetId();
  const rows = await getSheetValuesById(dbId, VISIT_SHEET, "A2:AD20000").catch(() => [] as any[]);
  let records = rows.map(rowToVisitRecord).filter(Boolean) as RoundingVisitRecord[];
  if (opts.storeName) {
    const key = normalizeStoreKey(opts.storeName);
    records = records.filter((r) => normalizeStoreKey(r.storeName) === key);
  }
  // 최신 방문이 먼저 오도록(날짜 → 생성시각 순)
  records.sort((a, b) => (a.visitDate === b.visitDate ? (a.createdAt < b.createdAt ? 1 : -1) : a.visitDate < b.visitDate ? 1 : -1));
  return records;
}

export async function getLatestVisitForStore(storeName: string): Promise<RoundingVisitRecord | null> {
  const list = await listRoundingVisits({ storeName });
  return list[0] || null;
}

// ========================= 지적사항 =========================
export type RoundingIssueStatus = "미해결" | "해결";

export interface RoundingIssueRecord {
  issueId: string;
  visitId: string;
  issueDate: string;
  storeName: string;
  area: string;
  item: string;
  content: string;
  action: string;
  status: RoundingIssueStatus;
  resolvedAt: string;
  createdAt: string;
  target: string;
  actionType: string;
  dueDate: string;
  snapshot: any | null;
}

export interface SaveRoundingIssueInput {
  visitId?: string;
  storeName: string;
  issueDate?: string;
  area: string;
  item: string;
  content: string;
  action?: string;
  target?: string;
  actionType?: string;
  dueDate?: string;
  snapshot?: any;
}

function rowToIssueRecord(r: any[]): RoundingIssueRecord | null {
  if (!r || !text(r[0])) return null;
  return {
    issueId: text(r[0]),
    visitId: text(r[1]),
    issueDate: text(r[2]),
    storeName: text(r[3]),
    area: text(r[4]),
    item: text(r[5]),
    content: text(r[6]),
    action: text(r[7]),
    status: (text(r[8]) || "미해결") as RoundingIssueStatus,
    resolvedAt: text(r[9]),
    createdAt: text(r[10]),
    target: text(r[11]),
    actionType: text(r[12]),
    dueDate: text(r[13]),
    snapshot: safeJsonParse<any>(r[14], null),
  };
}

export async function saveRoundingIssue(input: SaveRoundingIssueInput): Promise<RoundingIssueRecord> {
  await ensureRoundingSheets();
  const dbId = getDbSheetId();
  const issueId = makeId("I");
  const createdAt = nowKSTDateTime();
  const row = [
    issueId,
    input.visitId || "",
    input.issueDate || todayKSTDateKey(),
    input.storeName,
    input.area,
    input.item,
    input.content,
    input.action || "",
    "미해결",
    "",
    createdAt,
    input.target || "",
    input.actionType || "",
    input.dueDate || "",
    input.snapshot ? `'${JSON.stringify(input.snapshot)}` : "",
  ];
  await appendValuesById(dbId, `'${ISSUE_SHEET}'!${ISSUE_RANGE}`, [row]);
  return rowToIssueRecord(row.map((v, i) => (i === 14 && typeof v === "string" ? v.replace(/^'/, "") : v))) as RoundingIssueRecord;
}

export async function listRoundingIssues(opts: { storeName?: string; status?: RoundingIssueStatus } = {}): Promise<RoundingIssueRecord[]> {
  const dbId = getDbSheetId();
  const rows = await getSheetValuesById(dbId, ISSUE_SHEET, "A2:O20000").catch(() => [] as any[]);
  let records = rows.map(rowToIssueRecord).filter(Boolean) as RoundingIssueRecord[];
  if (opts.storeName) {
    const key = normalizeStoreKey(opts.storeName);
    records = records.filter((r) => normalizeStoreKey(r.storeName) === key);
  }
  if (opts.status) records = records.filter((r) => r.status === opts.status);
  records.sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
  return records;
}

// MARK 2026-10-12: "같은 매장·같은 항목이 다시 지적되면 반복 표시" — 원본 모듈은 시트
// 수식(COUNTIFS)으로 계산했는데, 여기서는 읽을 때마다 동적으로 계산합니다(저장 안 해도
// 항상 최신 상태로 맞음 — 나중에 과거 지적이 추가/삭제돼도 수식처럼 깨질 일이 없음).
export function annotateIssueRepeats(issues: RoundingIssueRecord[]): (RoundingIssueRecord & { repeatCount: number; isRepeat: boolean })[] {
  const sorted = [...issues].sort((a, b) => (a.issueDate < b.issueDate ? -1 : 1));
  const counters = new Map<string, number>();
  const withCount = sorted.map((issue) => {
    // 재고점검 조치는 대상(SKU/품번)까지 같아야 반복으로 봄
    const key = `${normalizeStoreKey(issue.storeName)}|${issue.area}|${issue.item}|${issue.target || ""}`;
    const count = (counters.get(key) || 0) + 1;
    counters.set(key, count);
    return { ...issue, repeatCount: count, isRepeat: count >= 2 };
  });
  // 최신순으로 돌려줌(목록 표시용)
  return withCount.sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
}

export async function updateRoundingIssueStatus(issueId: string, status: RoundingIssueStatus): Promise<boolean> {
  const dbId = getDbSheetId();
  const rows = await getSheetValuesById(dbId, ISSUE_SHEET, "A2:K20000").catch(() => [] as any[]);
  const idx = rows.findIndex((r) => text(r?.[0]) === issueId);
  if (idx === -1) return false;
  const sheetRow = idx + 2; // 헤더(1행) + 0-index 보정
  const resolvedAt = status === "해결" ? todayKSTDateKey() : "";
  await updateValuesById(dbId, `'${ISSUE_SHEET}'!I${sheetRow}:J${sheetRow}`, [[status, resolvedAt]]);
  return true;
}

// ========================= 매장 목록 + 자동입력 =========================
// MARK 2026-10-12: "입점이력이라는게 결국은 수치기반으로 우선 평가" + "수치 기록은 마크에서
// 자동으로 불러올 수 있게" 요청 — 매출탭(점포별)이 이미 계산해둔 매출/목표(buildStoreSalesSummary)와
// PIP 재고스냅샷(readStoreStockSnapshot)을 그대로 재사용해서, 라운딩 화면에서 타이핑 없이
// 숫자가 채워지게 합니다. "기간"은 방문이 보통 평일 중 하루라 "이번주(진행중) 목표/실적"을
// 기준으로 쓰고, 전주/전전주 금액은 신장률 비교용으로 따로 계산합니다.
//
// 참고: 전주 "객수/객단가"는 buildStoreSalesSummary가 지난 완료주 영수건수를 따로 안 내려줘서
// (매출탭도 이번주 분만 보여줌) 정확히 못 채웁니다 — 대신 이번주(진행중) 객수/객단가를
// "금주객수/금주객단가"로 보여줍니다. 전주매출 "금액"은 weekly.prevWeekAmount로 정확합니다.
export interface RoundingStoreInfo {
  storeName: string;
  region: string;
}

export async function listRoundingStores(): Promise<RoundingStoreInfo[]> {
  const summary = await buildStoreSalesSummary();
  const regions = await Promise.all(summary.stores.map((s) => getRegionForStore(s.storeName).catch(() => "")));
  return summary.stores
    .map((s, i) => ({ storeName: s.storeName, region: regions[i] || "" }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName, "ko"));
}

export interface RoundingAutoFill {
  storeName: string;
  region: string;
  weekStart: string;
  weekEnd: string;
  periodTarget: number;
  periodActual: number;
  achievementRate: number | null;
  prevWeekAmount: number;
  prevPrevWeekAmount: number;
  wowGrowthRate: number | null; // 전주매출 대비 전전주매출 신장률
  receiptCount: number;
  avgReceiptAmount: number | null;
  totalStockQty: number;
  totalStockAmount: number;
  monthlyAchievementRate: number | null; // 참고용(이번달 진행 상황)
}

export async function getRoundingAutoFill(storeName: string): Promise<RoundingAutoFill | null> {
  const summary = await buildStoreSalesSummary();
  const row = summary.stores.find((s) => s.storeName === storeName) || summary.stores.find((s) => normalizeStoreKey(s.storeName) === normalizeStoreKey(storeName));
  if (!row) return null;

  // 전전주(= 전주보다 한 주 더 전) 매출 금액 — buildStoreSalesSummary의 커스텀 기간조회를
  // 그대로 재사용해서 "전전주 월요일~일요일" 구간만 다시 조회합니다.
  const prevPrevWeekStart = dateAddDays(row.weekly.start, -14);
  const prevPrevWeekEnd = dateAddDays(row.weekly.start, -8);
  let prevPrevWeekAmount = 0;
  try {
    const summary2 = await buildStoreSalesSummary({ rangeStart: prevPrevWeekStart, rangeEnd: prevPrevWeekEnd });
    const row2 = summary2.stores.find((s) => s.storeName === row.storeName);
    prevPrevWeekAmount = row2?.customPeriod?.actual ?? 0;
  } catch {
    prevPrevWeekAmount = 0;
  }

  const [{ rows: stockRows }, priceMap, region] = await Promise.all([
    readStoreStockSnapshot().catch(() => ({ rows: [] as any[] })),
    getStylePriceMap(todayKSTDateKey()).catch(() => new Map<string, number>()),
    getRegionForStore(row.storeName).catch(() => ""),
  ]);

  const targetKey = normalizeStoreKey(row.storeName);
  let totalStockQty = 0;
  let totalStockAmount = 0;
  for (const r of stockRows) {
    if (normalizeStoreKey(r.storeName) !== targetKey) continue;
    totalStockQty += num(r.stock);
    const price = priceMap.get(r.styleCode) || 0;
    totalStockAmount += num(r.stock) * price;
  }

  return {
    storeName: row.storeName,
    region,
    weekStart: row.weekly.start,
    weekEnd: row.weekly.end,
    periodTarget: row.weekly.target,
    periodActual: row.weekly.actual,
    achievementRate: row.weekly.achievementRate,
    prevWeekAmount: row.weekly.prevWeekAmount,
    prevPrevWeekAmount,
    wowGrowthRate: prevPrevWeekAmount ? row.weekly.prevWeekAmount / prevPrevWeekAmount - 1 : null,
    receiptCount: row.weekly.receiptCount,
    avgReceiptAmount: row.weekly.avgReceiptAmount,
    totalStockQty,
    totalStockAmount,
    monthlyAchievementRate: row.monthly.achievementRate,
  };
}
