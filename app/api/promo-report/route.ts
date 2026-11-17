import { NextResponse } from "next/server";
import { buildPromoReport } from "@/lib/promoReport";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

// MARK 2026-11-17: 주간 IMC 프로모션 결과 — GET ?week=YYYY-MM-DD(그 주 월요일, 없으면 지난주)
export async function GET(req: Request) {
  try {
    const week = new URL(req.url).searchParams.get("week") || undefined;
    return NextResponse.json({ ok: true, ...(await buildPromoReport(week)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("promo-report failed:", e);
    return NextResponse.json({ ok: false, error: e?.message || "프로모션 리포트 계산 실패" }, { status: 500 });
  }
}
