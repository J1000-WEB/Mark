import { NextResponse } from "next/server";
import { readDailySalesFromMarkDb, saveDailySalesToHistory } from "@/lib/dailySales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const data = await readDailySalesFromMarkDb();
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Daily sales load failed" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST() {
  try {
    const data = await readDailySalesFromMarkDb();
    const saved = await saveDailySalesToHistory(data, "daily-sales-api");
    return NextResponse.json({ ok: true, data, saved }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Daily sales save failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
