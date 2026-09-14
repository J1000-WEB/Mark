import { NextResponse } from "next/server";
import { readRealtimeOverview } from "@/lib/dailySales";
import { readRealtimeHourlyTrend } from "@/lib/realtimeHourlySnapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK: 실시간 탭 — 오늘자 실시간 매출 + 추정 재고(새벽 재고 - 오늘 누적판매) +
// 전주 동시간대비 시간별 매출추이/예상 마감 매출을 함께 반환합니다.
//
// MARK 2026-09-14: "14시 넘었는데 시간대별 매출추이가 11시 이후로 안 쌓인다" 문의를 파다가,
// 이 라우트에 "Cache-Control: no-store"가 빠져있는 걸 발견했습니다. dynamic="force-dynamic"은
// Next.js가 이 페이지를 정적으로 빌드하지 않게만 막을 뿐, 응답에 캐시하지 말라는 헤더가
// 없으면 Vercel 엣지가 GET 응답을 캐시해버릴 수 있습니다(auto-realtime-hourly-snapshot
// 라우트에서 실제로 이 문제를 확인했습니다 — 몇 시간이 지나도 첫 응답이 그대로 반복됨).
// 3분마다 자동 갱신되는 화면이 실제로는 캐시된 옛날 데이터를 계속 보여주고 있었을 수
// 있어서, 다른 모든 데이터 라우트와 동일하게 no-store를 명시합니다.
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  try {
    const [overview, trend] = await Promise.all([readRealtimeOverview(), readRealtimeHourlyTrend().catch(() => null)]);
    return NextResponse.json({ ok: true, data: { ...overview, trend } }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("realtime failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "실시간 데이터를 불러오지 못했습니다." }, { status: 200, headers: NO_STORE_HEADERS });
  }
}
