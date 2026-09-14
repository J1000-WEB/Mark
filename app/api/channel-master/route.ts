import { NextResponse } from "next/server";
import { getSheetValues, updateValues } from "@/lib/googleSheets";
import { CHANNEL_MASTER_SHEET } from "@/lib/channelMaster";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// MARK 2026-09-14: 다른 데이터 라우트들과 동일하게 no-store 명시 (auto-realtime-hourly-snapshot
// 라우트에서 이 헤더가 빠지면 Vercel 엣지가 GET 응답을 캐시해버리는 걸 확인했습니다 — 여기서는
// 채널 수정(POST) 후에도 화면이 옛날 값을 계속 보여줄 수 있는 문제로 이어집니다).
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  try {
    const rows = await getSheetValues(CHANNEL_MASTER_SHEET, "A:D").catch(() => []);
    const channels = (rows || []).slice(1).map((row, idx) => ({
      rowNumber: idx + 2,
      channelName: row[0] || "",
      channelType: row[1] || "",
      active: String(row[2] || "true").toLowerCase() !== "false",
      updatedAt: row[3] || "",
    }));
    return NextResponse.json({ ok: true, channels }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rowNumber = Number(body.rowNumber);
    const channelType = String(body.channelType || "");
    if (!rowNumber || !channelType) {
      return NextResponse.json({ ok: false, error: "rowNumber와 channelType이 필요합니다." }, { status: 400 });
    }
    await updateValues(`'${CHANNEL_MASTER_SHEET}'!B${rowNumber}:D${rowNumber}`, [[channelType, "true", new Date().toISOString()]]);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "수정 실패" }, { status: 500 });
  }
}
