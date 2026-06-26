import { NextResponse } from "next/server";
import { appendValuesById, ensureSheetExistsById, getHistorySheetId, getSheetValuesById } from "@/lib/googleSheets";

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

function text(v: any) {
  return String(v ?? "").trim();
}

function nowKST() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function makeId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `WEEKLY-${y}${m}${day}-${hh}${mm}${ss}`;
}

function parseDateText(value: any) {
  const s = text(value);
  const korean = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(AM|PM|오전|오후)?\s*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?/i);
  if (korean) {
    let hour = Number(korean[5] || 0);
    const ampm = korean[4] || "";
    if ((ampm === "PM" || ampm === "오후") && hour < 12) hour += 12;
    if ((ampm === "AM" || ampm === "오전") && hour === 12) hour = 0;
    const d = new Date(Number(korean[1]), Number(korean[2]) - 1, Number(korean[3]), hour, Number(korean[6] || 0), Number(korean[7] || 0));
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function chunkText(value: string, size = CHUNK_SIZE) {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += size) {
    chunks.push(value.slice(i, i + size));
  }
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
  };
}

async function ensureWeeklySnapshotSheet(spreadsheetId: string) {
  await ensureSheetExistsById(spreadsheetId, SHEET_NAME, HEADER);
}

export async function GET(req: Request) {
  try {
    const spreadsheetId = getHistorySheetId();
    await ensureWeeklySnapshotSheet(spreadsheetId);

    const url = new URL(req.url);
    const id = text(url.searchParams.get("id"));

    const rows = await getSheetValuesById(spreadsheetId, SHEET_NAME, "A:AZ").catch(() => []);
    const records = rows.slice(1)
      .map((row: any[]) => ({
        snapshotId: text(row[0]),
        createdAt: text(row[1]),
        snapshotType: text(row[2]),
        periodLabel: text(row[3]),
        memo: text(row[4]),
        payloadJson: joinPayloadChunks(row),
      }))
      .filter((row: any) => row.snapshotId)
      .sort((a: any, b: any) => parseDateText(b.createdAt) - parseDateText(a.createdAt));

    if (id) {
      const found = records.find((row: any) => row.snapshotId === id) || null;
      return NextResponse.json({
        ok: true,
        snapshot: found ? { ...found, payload: safeJsonParse(found.payloadJson) } : null,
      }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    return NextResponse.json({
      ok: true,
      snapshots: records.map(({ payloadJson, ...row }: any) => row),
      count: records.length,
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

    const snapshotId = text(body.snapshotId) || makeId();
    const createdAt = nowKST();
    const periodLabel = text(body.periodLabel) || text(body?.payload?.weekly?.periodLabel) || "주간 스냅샷";
    const memo = text(body.memo);

    const payload = shrinkWeeklyPayload(body.payload || {});

    if (!payload?.weekly) {
      return NextResponse.json({
        ok: false,
        error: "저장할 weekly payload가 없습니다.",
      }, { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    const payloadJson = JSON.stringify(payload);
    const chunks = chunkText(payloadJson);

    await appendValuesById(spreadsheetId, `'${SHEET_NAME}'!A:AZ`, [[
      snapshotId,
      createdAt,
      "weekly",
      periodLabel,
      memo,
      ...chunks,
    ]]);

    return NextResponse.json({
      ok: true,
      snapshotId,
      createdAt,
      periodLabel,
      chunkCount: chunks.length,
      payloadLength: payloadJson.length,
      message: "Weekly Snapshot 저장 완료",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("Weekly snapshot save failed:", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "Weekly Snapshot 저장 실패",
    }, { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
