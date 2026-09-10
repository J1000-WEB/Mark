import { NextResponse } from "next/server";
import { readRealtimeOverview } from "@/lib/dailySales";
import { readRealtimeHourlyTrend } from "@/lib/realtimeHourlySnapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK: 실시간 탭 — 오늘자 실시간 매출 + 추정 재고(새벽 재고 - 오늘 누적판매) +
// 전주 동시간대비 시간별 매출추이/예상 마감 매출을 함께 반환합니다.
export async function GET() {
  try {
    const [overview, trend] = await Promise.all([readRealtimeOverview(), readRealtimeHourlyTrend().catch(() => null)]);
    return NextResponse.json({ ok: true, data: { ...overview, trend } });
  } catch (error: any) {
    console.error("realtime failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "실시간 데이터를 불러오지 못했습니다." }, { status: 200 });
  }
}
