import { NextResponse } from "next/server";
import { buildDashboardDataFromGoogleSheet } from "@/lib/dataBuilder";
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

function kstDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value || "0000";
  const m = parts.find((p) => p.type === "month")?.value || "00";
  const d = parts.find((p) => p.type === "day")?.value || "00";
  return `${y}-${m}-${d}`;
}

function makeId() {
  return `AUTO-WEEKLY-${kstDateKey().replace(/-/g, "")}`;
}

function chunkText(value: string, size = CHUNK_SIZE) {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += size) {
    chunks.push(value.slice(i, i + size));
  }
  return chunks.length ? chunks : [""];
}

function shrinkWeeklyPayload(payload: any) {
  const weekly = payload?.weekly || {};

  return {
    savedAt: new Date().toISOString(),
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

async function alreadySavedToday(spreadsheetId: string, snapshotId: string) {
  const rows = await getSheetValuesById(spreadsheetId, SHEET_NAME, "A:A").catch(() => []);
  return rows.some((row) => text(row?.[0]) === snapshotId);
}

async function saveAutoWeeklySnapshot() {
  const spreadsheetId = getHistorySheetId();
  await ensureSheetExistsById(spreadsheetId, SHEET_NAME, HEADER);

  const snapshotId = makeId();

  if (await alreadySavedToday(spreadsheetId, snapshotId)) {
    return {
      ok: true,
      skipped: true,
      snapshotId,
      message: "이미 오늘 자동 주간 스냅샷이 저장되어 있습니다.",
    };
  }

  const data = await buildDashboardDataFromGoogleSheet();
  const payload = shrinkWeeklyPayload(data);
  const payloadJson = JSON.stringify(payload);
  const chunks = chunkText(payloadJson);
  const periodLabel = text(data?.weekly?.periodLabel) || "주간 스냅샷";

  await appendValuesById(spreadsheetId, `'${SHEET_NAME}'!A:AZ`, [[
    snapshotId,
    nowKST(),
    "weekly_auto",
    periodLabel,
    "Vercel Cron 자동 저장",
    ...chunks,
  ]]);

  return {
    ok: true,
    skipped: false,
    snapshotId,
    periodLabel,
    chunkCount: chunks.length,
    payloadLength: payloadJson.length,
    message: "자동 주간 스냅샷 저장 완료",
  };
}

export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization") || "";
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await saveAutoWeeklySnapshot();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("Auto weekly snapshot failed:", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "자동 주간 스냅샷 저장 실패",
    }, { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
