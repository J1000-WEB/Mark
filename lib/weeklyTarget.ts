import {
  getSheetId,
  getSheetValuesWithSerialDatesById,
  sheetSerialToDateKey,
  getHistorySheetId,
  ensureSheetExistsById,
  getSheetValuesById,
} from "@/lib/googleSheets";

// MARK 6.12: 진짜 "주간목표"는 일_전일 시트의 I열(주실적 목표)에 있습니다.
// 근데 이 시트는 "기준일: 전일"이라 매번 다른 주를 가리킬 수 있어서(사용자가 새로 갱신할 때마다 바뀜),
// 라이브로 그냥 읽으면 지금 보고 있는 주랑 안 맞는 목표가 나올 위험이 있습니다.
// 그래서 "이 목표가 진짜 몇 주차 것인지" E2로 확인한 뒤, 주차별로 스냅샷(Weekly_Target_History)에
// 저장해두고, 화면에서는 항상 그 저장본에서 "지금 보는 주"와 정확히 일치하는 값만 꺼내 씁니다.

const DAILY_PREV_SHEET = "일_전일";
const TARGET_HISTORY_SHEET = "Weekly_Target_History";
const TARGET_HISTORY_HEADER = ["주차(월요일)", "매장명", "주간목표", "주간실적(참고)", "저장시각"];
const MONTHLY_TARGET_HISTORY_SHEET = "Monthly_Target_History";
const MONTHLY_TARGET_HISTORY_HEADER = ["월(YYYY-MM)", "매장명", "월간목표", "저장시각"];
const COMPANY_TOTAL_KEY = "__COMPANY_TOTAL__";

function text(v: any) {
  return String(v ?? "").trim();
}

function num(v: any) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function mondayOf(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getUTCDay(); // 0=일 ... 1=월
  const diff = day === 0 ? -6 : 1 - day; // 월요일까지 며칠 이동할지
  d.setUTCDate(d.getUTCDate() + diff);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function addDaysKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// 일_전일 시트에서 "지금 이 시트가 가리키는 주"와 그 주의 매장별/전사 주간목표를 읽어옵니다.
async function readLiveWeeklyTargetSnapshot() {
  const spreadsheetId = getSheetId();
  const rows = await getSheetValuesWithSerialDatesById(spreadsheetId, DAILY_PREV_SHEET, "A:L");
  if (!rows || rows.length < 6) return null;

  // E2 = 이 데이터가 갱신된 시각. "기준일: 전일" 기준이므로, 실제 적용 주차는 E2-1일이 속한 주(월~일).
  const e2Raw = rows[1]?.[4];
  const e2Serial = typeof e2Raw === "number" ? e2Raw : Number(text(e2Raw));
  if (!Number.isFinite(e2Serial)) return null;
  const refreshedDate = sheetSerialToDateKey(e2Serial);
  if (!refreshedDate) return null;
  const baseDate = addDaysKey(refreshedDate, -1); // 전일
  const weekMonday = mondayOf(baseDate);
  if (!weekMonday) return null;

  // 헤더 위치 자동 탐지: "채널명"이 있는 행을 그룹헤더 행으로, 그 다음 행을 서브헤더 행으로 봅니다.
  let groupRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if ((rows[i] || []).some((v) => text(v) === "채널명")) {
      groupRowIdx = i;
      break;
    }
  }
  if (groupRowIdx < 0) return null;
  const groupRow = (rows[groupRowIdx] || []).map((v) => text(v));
  const subRow = (rows[groupRowIdx + 1] || []).map((v) => text(v));

  const channelNameCol = groupRow.findIndex((v) => v === "채널명");
  const weekGroupStart = groupRow.findIndex((v) => v.includes("주실적"));
  if (channelNameCol < 0 || weekGroupStart < 0) return null;

  // "주실적" 그룹 시작 컬럼부터 다음 그룹 시작 전까지 범위에서 "목표" 서브헤더를 찾습니다.
  let weekGroupEnd = groupRow.length;
  for (let c = weekGroupStart + 1; c < groupRow.length; c++) {
    if (groupRow[c]) { weekGroupEnd = c; break; }
  }
  let weekTargetCol = -1;
  for (let c = weekGroupStart; c < weekGroupEnd; c++) {
    if (subRow[c] === "목표") { weekTargetCol = c; break; }
  }
  let weekActualCol = -1;
  for (let c = weekGroupStart; c < weekGroupEnd; c++) {
    if (subRow[c] === "실적") { weekActualCol = c; break; }
  }
  if (weekTargetCol < 0) return null;

  // MARK 6.25: "월판매" 그룹의 "기준일목표(A)" 서브컬럼 = 월간목표. 이 목표가 적용되는 월은
  // 기준일(baseDate)이 속한 달입니다.
  const monthGroupStart = groupRow.findIndex((v) => v.includes("월판매"));
  let monthTargetCol = -1;
  if (monthGroupStart >= 0) {
    let monthGroupEnd = groupRow.length;
    for (let c = monthGroupStart + 1; c < groupRow.length; c++) {
      if (groupRow[c]) { monthGroupEnd = c; break; }
    }
    for (let c = monthGroupStart; c < monthGroupEnd; c++) {
      if (subRow[c].includes("기준일목표")) { monthTargetCol = c; break; }
    }
  }
  const monthKey = baseDate.slice(0, 7); // "YYYY-MM"

  const dataStart = groupRowIdx + 2;
  const totalRowIdx = rows.findIndex((r, idx) => idx >= dataStart && text(r?.[1]).includes("합계"));

  const stores: { storeName: string; weekTarget: number; weekActual: number; monthTarget: number }[] = [];
  let companyTotal: { weekTarget: number; weekActual: number; monthTarget: number } | null = null;

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const isTotalRow = i === totalRowIdx;
    const storeName = text(row[channelNameCol]);
    const weekTarget = num(row[weekTargetCol]);
    const weekActual = weekActualCol >= 0 ? num(row[weekActualCol]) : 0;
    const monthTarget = monthTargetCol >= 0 ? num(row[monthTargetCol]) : 0;

    if (isTotalRow) {
      companyTotal = { weekTarget, weekActual, monthTarget };
      continue;
    }
    if (!storeName || !weekTarget) continue;
    stores.push({ storeName, weekTarget, weekActual, monthTarget });
  }

  if (!companyTotal && !stores.length) return null;

  return { weekMonday, monthKey, refreshedDate, baseDate, companyTotal, stores };
}

// 스냅샷을 Weekly_Target_History / Monthly_Target_History에 upsert합니다(같은 주차/월+매장이면 최신값으로 교체).
// MARK 6.74: 저장 로직 자체를 재사용 가능하게 분리했습니다 — "일_전일" 시트에서 읽어오든(기존),
// SL1030(ERP 목표대비실적 화면)에서 읽어오든(신규, target-refresh.js) 이 함수 하나로 저장합니다.
type LiveWeeklyTarget = {
  weekMonday: string;
  monthKey: string;
  refreshedDate: string;
  baseDate: string;
  companyTotal: { weekTarget: number; weekActual: number; monthTarget: number } | null;
  stores: { storeName: string; weekTarget: number; weekActual: number; monthTarget: number }[];
};

export async function saveWeeklyTargetSnapshot(live: LiveWeeklyTarget) {
  const historyId = getHistorySheetId();
  const savedAt = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  // ---- 주간목표 저장 ----
  await ensureSheetExistsById(historyId, TARGET_HISTORY_SHEET, TARGET_HISTORY_HEADER);
  const existingRaw = await getSheetValuesById(historyId, TARGET_HISTORY_SHEET, "A:E").catch(() => []);
  const existingRows = (existingRaw || []).slice(1);
  const keep = existingRows.filter((r) => text(r?.[0]) !== live.weekMonday);

  const newRows: any[][] = [];
  if (live.companyTotal) {
    newRows.push([live.weekMonday, COMPANY_TOTAL_KEY, live.companyTotal.weekTarget, live.companyTotal.weekActual, savedAt]);
  }
  for (const s of live.stores) {
    newRows.push([live.weekMonday, s.storeName, s.weekTarget, s.weekActual, savedAt]);
  }

  const { replaceSheetValuesById } = await import("@/lib/googleSheets");
  await replaceSheetValuesById(historyId, TARGET_HISTORY_SHEET, [TARGET_HISTORY_HEADER, ...keep, ...newRows]);

  // ---- 월간목표 저장 ----
  let monthlySaved = false;
  if (live.monthKey) {
    await ensureSheetExistsById(historyId, MONTHLY_TARGET_HISTORY_SHEET, MONTHLY_TARGET_HISTORY_HEADER);
    const existingMonthlyRaw = await getSheetValuesById(historyId, MONTHLY_TARGET_HISTORY_SHEET, "A:D").catch(() => []);
    const existingMonthlyRows = (existingMonthlyRaw || []).slice(1);
    const keepMonthly = existingMonthlyRows.filter((r) => text(r?.[0]) !== live.monthKey);

    const newMonthlyRows: any[][] = [];
    if (live.companyTotal?.monthTarget) {
      newMonthlyRows.push([live.monthKey, COMPANY_TOTAL_KEY, live.companyTotal.monthTarget, savedAt]);
    }
    for (const s of live.stores) {
      if (s.monthTarget) newMonthlyRows.push([live.monthKey, s.storeName, s.monthTarget, savedAt]);
    }
    if (newMonthlyRows.length) {
      await replaceSheetValuesById(historyId, MONTHLY_TARGET_HISTORY_SHEET, [MONTHLY_TARGET_HISTORY_HEADER, ...keepMonthly, ...newMonthlyRows]);
      monthlySaved = true;
    }
  }

  return {
    ok: true,
    weekMonday: live.weekMonday,
    monthKey: live.monthKey,
    refreshedDate: live.refreshedDate,
    storeCount: live.stores.length,
    hasCompanyTotal: !!live.companyTotal,
    monthlySaved,
  };
}

export async function captureWeeklyTargetSnapshot() {
  const live = await readLiveWeeklyTargetSnapshot();
  if (!live) return { ok: false, reason: "일_전일 시트에서 유효한 주간목표를 읽지 못했습니다." };
  return saveWeeklyTargetSnapshot(live);
}

// 특정 주(월요일 기준)의 저장된 목표를 조회합니다. 없으면 null(=화면에서 "-" 처리).
export async function getSavedWeeklyTarget(weekMonday: string) {
  try {
    const historyId = getHistorySheetId();
    const raw = await getSheetValuesById(historyId, TARGET_HISTORY_SHEET, "A:E").catch(() => []);
    const rows = (raw || []).slice(1);
    let companyTarget = 0;
    let companyActual = 0;
    let found = false;
    const byStore = new Map<string, number>();

    for (const r of rows) {
      if (text(r?.[0]) !== weekMonday) continue;
      const store = text(r?.[1]);
      const target = num(r?.[2]);
      const actual = num(r?.[3]);
      found = true;
      if (store === COMPANY_TOTAL_KEY) {
        companyTarget = target;
        companyActual = actual;
      } else if (store) {
        byStore.set(store, target);
      }
    }

    if (!found) return null;
    return { weekMonday, companyTarget, companyActual, byStore };
  } catch {
    return null;
  }
}

// 특정 월(YYYY-MM)의 저장된 월간목표를 조회합니다. 없으면 null(=화면에서 "-" 처리).
export async function getSavedMonthlyTarget(monthKey: string) {
  try {
    const historyId = getHistorySheetId();
    const raw = await getSheetValuesById(historyId, MONTHLY_TARGET_HISTORY_SHEET, "A:D").catch(() => []);
    const rows = (raw || []).slice(1);
    let companyTarget = 0;
    let found = false;
    const byStore = new Map<string, number>();

    for (const r of rows) {
      if (text(r?.[0]) !== monthKey) continue;
      const store = text(r?.[1]);
      const target = num(r?.[2]);
      found = true;
      if (store === COMPANY_TOTAL_KEY) {
        companyTarget = target;
      } else if (store) {
        byStore.set(store, target);
      }
    }

    if (!found) return null;
    return { monthKey, companyTarget, byStore };
  } catch {
    return null;
  }
}
