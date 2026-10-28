import { NextResponse } from "next/server";
import { getRefreshStatus } from "@/lib/salesSummaryRefreshStatus";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

// MARK 2026-10-28: 매출탭 상단 배너용 — 자동갱신(4:00/9:30) 기록 + 어제 용인 매출 확인
export async function GET() {
  try {
    const status = await getRefreshStatus();
    return NextResponse.json({ ok: true, ...status }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "상태 조회 실패" }, { status: 500 });
  }
}
