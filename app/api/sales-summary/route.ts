import { NextResponse } from "next/server";
import { buildStoreSalesSummary } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK 2026-09-22: 일간 블록 날짜선택(date)과 커스텀 기간비교(rangeStart~rangeEnd) 쿼리
// 파라미터를 받습니다. 셋 다 없으면 예전과 완전히 동일하게 동작(기본값=최신 날짜, 기간비교 없음).
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const data = await buildStoreSalesSummary({
      dailyDate: searchParams.get("date") || undefined,
      rangeStart: searchParams.get("rangeStart") || undefined,
      rangeEnd: searchParams.get("rangeEnd") || undefined,
    });
    return NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("sales-summary GET failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "매출탭 계산 실패" }, { status: 500 });
  }
}
