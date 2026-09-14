import { NextResponse } from "next/server";
import { loadRecentActions } from "@/lib/actionLog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// MARK 2026-09-14: 다른 데이터 라우트들과 동일하게 no-store 명시 (auto-realtime-hourly-snapshot
// 라우트에서 이 헤더가 빠지면 Vercel 엣지가 GET 응답을 캐시해버리는 걸 확인했습니다).
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  try {
    const actions = await loadRecentActions(50);
    return NextResponse.json({ ok: true, actions }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
