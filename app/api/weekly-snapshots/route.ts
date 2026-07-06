import { NextResponse } from "next/server";
import { appendValuesById, ensureSheetExistsById, getHistorySheetId, getSheetValuesById, updateValuesById } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SHEET_NAME = "Weekly_Snapshot";
const CHUNK_SIZE = 45000;

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
];

type SnapshotRecord = {
  rowIndex: number;
  snapshotId: string;
  createdAt: string;
  snapshotType: string;
  periodLabel: string;
  memo: string;
  payloadJson: string;
  anchorMonday: string;
};

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
  return row.slice(5).map(text).join("");
}

function extractAnchorMonday(periodLabel: string, payloadJson = "") {
  const payloadMatch = payloadJson.match(/"anchorMonday"\s*:\s*"(20\d{2}-\d{2}-\d{2})"/);
  if (payloadMatch) return payloadMatch[1];

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

function sortByBasisThenLatest(a: SnapshotRecord, b: SnapshotRecord) {
  const basis = text(b.anchorMonday).localeCompare(text(a.anchorMonday));
  if (basis) return basis;
  const timeDiff = parseDateText(b.createdAt) - parseDateText(a.createdAt);
  if (timeDiff) return timeDiff;
  return b.rowIndex - a.rowIndex;
}

function latestByBasis(records: SnapshotRecord[]) {
  const latest = new Map<string, SnapshotRecord>();
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

async function readSnapshotRecords(spreadsheetId: string) {
  const rows = await getSheetValuesById(spreadsheetId, SHEET_NAME, "A:AZ").catch(() => []);
  return rows.slice(1)
    .map((row: any[], index: number): SnapshotRecord => {
      const payloadJson = joinPayloadChunks(row);
      return {
        rowIndex: index + 2,
        snapshotId: text(row[0]),
        createdAt: text(row[1]),
        snapshotType: text(row[2]),
        periodLabel: text(row[3]),
        memo: text(row[4]),
        payloadJson,
        anchorMonday: extractAnchorMonday(text(row[3]), payloadJson),
      };
    })
    .filter((row: SnapshotRecord) => row.snapshotId);
}

function toListItem(record: SnapshotRecord) {
  const { payloadJson, rowIndex, ...item } = record;
  return item;
}

export async function GET(req: Request) {
  try {
    const spreadsheetId = getHistorySheetId();
    await ensureWeeklySnapshotSheet(spreadsheetId);

    const url = new URL(req.url);
    const id = text(url.searchParams.get("id"));
    const records = await readSnapshotRecords(spreadsheetId);

    if (id) {
      const found = records.find((row) => row.snapshotId === id) || null;
      return NextResponse.json({
        ok: true,
        snapshot: found ? { ...toListItem(found), payload: safeJsonParse(found.payloadJson) } : null,
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
    const spreadsheetId = getHistorySheetId();
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
    const records = await readSnapshotRecords(spreadsheetId);
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
      ...chunks.slice(0, HEADER.length - 5),
    ];
    while (rowValues.length < HEADER.length) rowValues.push("");

    if (existing) {
      await updateValuesById(spreadsheetId, `'${SHEET_NAME}'!A${existing.rowIndex}:O${existing.rowIndex}`, [rowValues]);
    } else {
      await appendValuesById(spreadsheetId, `'${SHEET_NAME}'!A:O`, [rowValues]);
    }

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
