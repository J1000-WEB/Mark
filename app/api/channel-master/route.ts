import { NextResponse } from "next/server";
import { getSheetValues, updateValues } from "@/lib/googleSheets";
import { CHANNEL_MASTER_SHEET } from "@/lib/channelMaster";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    return NextResponse.json({ ok: true, channels });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500 });
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
