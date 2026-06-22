import { NextResponse } from "next/server";
import { appendValuesById, ensureSheetExistsById, getHistorySheetId, getSheetValuesById } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SHEET_NAME = "Weekly_Snapshot";
const HEADER = [
  "snapshot_id",
  "created_at",
  "snapshot_type",
  "period_label",
  "memo",
  "payload_json",
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
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function safeJsonParse(value: any) {
  try {
    return JSON.parse(text(value));
  } catch {
    return null;
  }
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

    const rows = await getSheetValuesById(spreadsheetId, SHEET_NAME, "A:F").catch(() => []);
    const records = rows.slice(1)
      .map((row: any[]) => ({
        snapshotId: text(row[0]),
        createdAt: text(row[1]),
        snapshotType: text(row[2]),
        periodLabel: text(row[3]),
        memo: text(row[4]),
        payloadJson: text(row[5]),
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
    const payload = body.payload || {};

    if (!payload?.weekly) {
      return NextResponse.json({
        ok: false,
        error: "저장할 weekly payload가 없습니다.",
      }, { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    const payloadJson = JSON.stringify(payload);

    await appendValuesById(spreadsheetId, `'${SHEET_NAME}'!A:F`, [[
      snapshotId,
      createdAt,
      "weekly",
      periodLabel,
      memo,
      payloadJson,
    ]]);

    return NextResponse.json({
      ok: true,
      snapshotId,
      createdAt,
      periodLabel,
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
