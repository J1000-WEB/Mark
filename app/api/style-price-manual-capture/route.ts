import { NextResponse } from "next/server";
import { captureWeeklyStylePrices } from "@/lib/dataBuilder";
import { getLatestStylePriceMeta } from "@/lib/stylePriceHistory";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET: 마지막 갱신 정보 조회 (재고컨트롤 화면에 상시 표시용)
export async function GET() {
  try {
    const meta = await getLatestStylePriceMeta();
    return NextResponse.json({ ok: true, meta }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500 });
  }
}

// POST: 수동으로 지금 바로 캡처 실행 (버튼 클릭용 — 크론 시크릿 검사 없음)
export async function POST() {
  try {
    const result = await captureWeeklyStylePrices();
    const meta = await getLatestStylePriceMeta();
    return NextResponse.json({ ok: true, result, meta }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("Manual style price capture failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "갱신 실패" }, { status: 500 });
  }
}
