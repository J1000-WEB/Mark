import { NextResponse } from "next/server";
import { appendValuesById, ensureSheetExistsById, getSheetValuesById, getWeeklyHistorySheetId, updateValuesById } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SHEET_NAME = "Weekly_Snapshot";
const CHUNK_SIZE = 45000;
const PAYLOAD_CHUNK_COLS = 10; // payload_json_1..10 (column F~O) — 항상 이 칸 수로 고정.

const HEADER = [
  "snapshot_id",
  "created_at",
  "snapshot_type",
  "period_label",
  "memo",
  "payload_json_1",
  "payload_json_2",
  "payload_json_3",
  "payload_json_4",
  "payload_json_5",
  "payload_json_6",
  "payload_json_7",
  "payload_json_8",
  "payload_json_9",
  "payload_json_10",
  "anchor_monday",
];

// MARK 2026-09: 목록 조회와 "스냅샷 저장" 시 중복(같은 주차) 확인은 예전엔 매번 A:AZ 전체를
// 읽어서 (payload_json 10칸, 칸당 최대 45,000자 — 행 하나가 최대 45만자) anchorMonday만
// 정규식으로 뽑아 쓰고 나머지는 버렸습니다. 페이지를 열 때마다(주간 탭 로드 시 스냅샷 목록도
// 같이 불러옴)와 스냅샷을 저장할 때마다 이 무거운 전체 읽기가 매번 실행되고 있었던 것 —
// 정작 필요한 건 각 행의 anchorMonday뿐인데도. 이제 저장 시점에 anchorMonday를 별도 칸(P열,
// anchor_monday)에 바로 써두고, 목록/중복확인은 A:E(가벼운 메타)와 P열만 읽습니다 —
// payload_json 칸은 아예 네트워크로 받아오지 않습니다. 실제 payload가 필요한 건 스냅샷 하나를
// 펼쳐볼 때(GET ?id=)뿐이라, 그때는 그 한 행만 targeted로 읽습니다.
type SnapshotListRecord = {
  rowIndex: number;
  snapshotId: string;
  createdAt: string;
  snapshotType: string;
  periodLabel: string;
  memo: string;
  anchorMonday: string;
};

// 목록 조회와 특정 스냅샷 조회가 연속으로 발생하므로 짧은 서버 캐시를 둔다.
// 저장 POST 직후에는 캐시를 비워 항상 최신 행을 다시 읽는다.
let snapshotListCache: { spreadsheetId: string; expiresAt: number; records: SnapshotListRecord[] } | null = null;

function text(v: any) {
  return String(v ?? "").trim();
}

function kstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function nowKST() {
  const p = kstParts();
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+09:00`;
}

function makeId() {
  const p = kstParts();
  return `WEEKLY-${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}`;
}

function parseDateText(value: any) {
  const s = text(value);
  const direct = new Date(s);
  if (!Number.isNaN(direct.getTime())) return direct.getTime();

  const ko = s.match(/(20\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)?\s*(\d{1,2})?\s*:\s*(\d{1,2})?\s*:\s*(\d{1,2})?/);
  if (!ko) return 0;
  let hour = Number(ko[5] || 0);
  if (ko[4] === "오후" && hour < 12) hour += 12;
  if (ko[4] === "오전" && hour === 12) hour = 0;
  return new Date(Number(ko[1]), Number(ko[2]) - 1, Number(ko[3]), hour, Number(ko[6] || 0), Number(ko[7] || 0)).getTime();
}

function chunkText(value: string, size = CHUNK_SIZE) {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += size) chunks.push(value.slice(i, i + size));
  return chunks.length ? chunks : [""];
}

function safeJsonParse(value: any) {
  try {
    return JSON.parse(text(value));
  } catch {
    return null;
  }
}

function joinPayloadChunks(row: any[]) {
  return row.slice(5, 5 + PAYLOAD_CHUNK_COLS).map(text).join("");
}

// anchor_monday(P열)이 없는 예전 행을 위한 최선의 추정 — periodLabel 텍스트만으로 판단하고
// payload_json은 읽지 않습니다(무거운 칸이라 목록/중복확인 경로에서는 아예 안 건드림).
function extractAnchorMondayFromLabel(periodLabel: string) {
  const label = text(periodLabel);
  const full = label.match(/(?:선택주차|기준주차|기준일)\s*:\s*(20\d{2})[./-]\s*(\d{1,2})[./-]\s*(\d{1,2})\s*월요일/);
  if (full) return `${full[1]}-${String(full[2]).padStart(2, "0")}-${String(full[3]).padStart(2, "0")}`;

  const short = label.match(/(?:선택주차|기준주차|기준일)\s*:\s*(\d{1,2})[./](\d{1,2})\s*월요일/);
  if (short) {
    const year = new Date().getFullYear();
    return `${year}-${String(short[1]).padStart(2, "0")}-${String(short[2]).padStart(2, "0")}`;
  }
  return "";
}

// 저장 시점에는 방금 만든 payloadJson이 이미 메모리에 있으므로(추가 읽기 없음) payload 안의
// anchorMonday까지 확인해 더 정확하게 뽑습니다.
function extractAnchorMonday(periodLabel: string, payloadJson = "") {
  const payloadMatch = payloadJson.match(/"anchorMonday"\s*:\s*"(20\d{2}-\d{2}-\d{2})"/);
  if (payloadMatch) return payloadMatch[1];
  return extractAnchorMondayFromLabel(periodLabel);
}

function sortByBasisThenLatest(a: SnapshotListRecord, b: SnapshotListRecord) {
  const basis = text(b.anchorMonday).localeCompare(text(a.anchorMonday));
  if (basis) return basis;
  const timeDiff = parseDateText(b.createdAt) - parseDateText(a.createdAt);
  if (timeDiff) return timeDiff;
  return b.rowIndex - a.rowIndex;
}

function latestByBasis(records: SnapshotListRecord[]) {
  const latest = new Map<string, SnapshotListRecord>();
  for (const record of [...records].sort(sortByBasisThenLatest)) {
    const key = record.anchorMonday || `id:${record.snapshotId}`;
    if (!latest.has(key)) latest.set(key, record);
  }
  return [...latest.values()].sort(sortByBasisThenLatest);
}

function shrinkWeeklyPayload(payload: any) {
  const weekly = payload?.weekly || {};
  return {
    savedAt: payload?.savedAt || new Date().toISOString(),
    weekly: {
      periodLabel: weekly.periodLabel || "",
      current: weekly.current || [],
      compare: weekly.compare || [],
      companyTopProducts: weekly.companyTopProducts || [],
      storeTopProducts: weekly.storeTopProducts || {},
      productStoreNames: weekly.productStoreNames || [],
      anchorMonday: weekly.anchorMonday || "",
      selectedWeek: weekly.selectedWeek || weekly.anchorMonday || "",
      currentPeriod: weekly.currentPeriod || {},
      comparePeriod: weekly.comparePeriod || {},
      top10Concentration: weekly.top10Concentration || 0,
      newTop10Entrants: weekly.newTop10Entrants || [],
      aiBriefing: weekly.aiBriefing || [],
    },
    inventory: {
      rtSuggestions: payload?.inventory?.rtSuggestions || [],
      allocationSuggestions: payload?.inventory?.allocationSuggestions || [],
      stockoutRisk: payload?.inventory?.stockoutRisk || [],
      overstockRisk: payload?.inventory?.overstockRisk || [],
    },
    sources: payload?.sources || {},
  };
}

async function ensureWeeklySnapshotSheet(spreadsheetId: string) {
  await ensureSheetExistsById(spreadsheetId, SHEET_NAME, HEADER);
}

async function readSnapshotListMeta(spreadsheetId: string, force = false): Promise<SnapshotListRecord[]> {
  if (!force && snapshotListCache?.spreadsheetId === spreadsheetId && snapshotListCache.expiresAt > Date.now()) {
    return snapshotListCache.records;
  }
  // A:E(가벼운 메타)와 P열(anchor_monday)만 읽는다 — payload_json 10칸(F:O)은 안 읽음.
  const [metaRows, anchorRows] = await Promise.all([
    getSheetValuesById(spreadsheetId, SHEET_NAME, "A:E").catch(() => [] as any[]),
    getSheetValuesById(spreadsheetId, SHEET_NAME, "P:P").catch(() => [] as any[]),
  ]);
  const records: SnapshotListRecord[] = [];
  for (let i = 1; i < metaRows.length; i++) {
    const row = metaRows[i] || [];
    const snapshotId = text(row[0]);
    if (!snapshotId) continue;
    const periodLabel = text(row[3]);
    const storedAnchor = text(anchorRows[i]?.[0]);
    records.push({
      rowIndex: i + 1,
      snapshotId,
      createdAt: text(row[1]),
      snapshotType: text(row[2]),
      periodLabel,
      memo: text(row[4]),
      anchorMonday: storedAnchor || extractAnchorMondayFromLabel(periodLabel),
    });
  }
  snapshotListCache = { spreadsheetId, expiresAt: Date.now() + 45_000, records };
  return records;
}

async function readSnapshotPayloadByRowIndex(spreadsheetId: string, rowIndex: number) {
  const rows = await getSheetValuesById(spreadsheetId, SHEET_NAME, `A${rowIndex}:O${rowIndex}`).catch(() => [] as any[]);
  return joinPayloadChunks(rows[0] || []);
}

function toListItem(record: SnapshotListRecord) {
  const { rowIndex, ...item } = record;
  return item;
}

export async function GET(req: Request) {
  try {
    const spreadsheetId = getWeeklyHistorySheetId();

    const url = new URL(req.url);
    const id = text(url.searchParams.get("id"));
    const records = await readSnapshotListMeta(spreadsheetId);

    if (id) {
      const found = records.find((row) => row.snapshotId === id) || null;
      if (!found) {
        return NextResponse.json({ ok: true, snapshot: null }, { headers: { "Cache-Control": "no-store, max-age=0" } });
      }
      // payload는 이 한 행만 targeted로 읽는다 — 다른 스냅샷 행의 payload_json은 안 건드림.
      const payloadJson = await readSnapshotPayloadByRowIndex(spreadsheetId, found.rowIndex);
      return NextResponse.json({
        ok: true,
        snapshot: { ...toListItem(found), payload: safeJsonParse(payloadJson) },
      }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    const snapshots = latestByBasis(records).map(toListItem);
    return NextResponse.json({
      ok: true,
      snapshots,
      count: snapshots.length,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("Weekly snapshot load failed:", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "Weekly Snapshot을 불러오지 못했습니다.",
      snapshots: [],
      count: 0,
    }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const spreadsheetId = getWeeklyHistorySheetId();
    await ensureWeeklySnapshotSheet(spreadsheetId);

    if (!body?.payload?.weekly) {
      return NextResponse.json({ ok: false, error: "저장할 weekly payload가 없습니다." }, { status: 400 });
    }

    const payload = shrinkWeeklyPayload(body.payload);
    const createdAt = nowKST();
    const periodLabel = text(body.periodLabel) || text(payload.weekly?.periodLabel) || "주간 스냅샷";
    const memo = text(body.memo);
    const payloadJson = JSON.stringify(payload);
    const chunks = chunkText(payloadJson);
    const anchorMonday = text(payload.weekly?.anchorMonday) || extractAnchorMonday(periodLabel, payloadJson);

    // 같은 기준 월요일의 스냅샷은 새 행을 계속 쌓지 않고 최신 원본으로 교체한다.
    // 이렇게 해야 잘못 저장된 과거 payload가 7/6 같은 동일 주차 선택값으로 다시 노출되지 않는다.
    // (가벼운 메타+anchor열만 읽는 readSnapshotListMeta로 찾음 — payload_json은 안 읽음)
    const records = await readSnapshotListMeta(spreadsheetId, true);
    const existing = anchorMonday
      ? records
          .filter((record) => record.anchorMonday === anchorMonday)
          .sort((a, b) => {
            const time = parseDateText(b.createdAt) - parseDateText(a.createdAt);
            return time || b.rowIndex - a.rowIndex;
          })[0]
      : null;
    const snapshotId = text(body.snapshotId) || existing?.snapshotId || makeId();
    const rowValues = [
      snapshotId,
      createdAt,
      "weekly",
      periodLabel,
      memo,
      ...chunks.slice(0, PAYLOAD_CHUNK_COLS),
    ];
    while (rowValues.length < 5 + PAYLOAD_CHUNK_COLS) rowValues.push("");
    rowValues.push(anchorMonday); // P열: anchor_monday

    if (existing) {
      await updateValuesById(spreadsheetId, `'${SHEET_NAME}'!A${existing.rowIndex}:P${existing.rowIndex}`, [rowValues]);
    } else {
      await appendValuesById(spreadsheetId, `'${SHEET_NAME}'!A:P`, [rowValues]);
    }
    snapshotListCache = null;

    return NextResponse.json({
      ok: true,
      snapshotId,
      createdAt,
      periodLabel,
      anchorMonday,
      replaced: Boolean(existing),
      chunkCount: chunks.length,
      payloadLength: payloadJson.length,
      message: existing ? "Weekly Snapshot 최신 원본으로 교체 완료" : "Weekly Snapshot 저장 완료",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("Weekly snapshot save failed:", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "Weekly Snapshot 저장 실패",
    }, { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
