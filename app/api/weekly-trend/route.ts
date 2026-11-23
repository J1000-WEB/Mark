import { NextResponse } from "next/server";
import { readWeeklyTrend } from "@/lib/weeklyTrend";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// MARK 2026-11-23: 상품탭 구성비 52주 매출추이. GET ?end=월요일&weeks=52&ly=8 — 계산 안 된 주는 pending(다시 부르면 이어서 계산).
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const r = await readWeeklyTrend({
      endWeek: u.searchParams.get("end") || undefined,
      weeks: Number(u.searchParams.get("weeks") || 52),
      lyWeeks: Number(u.searchParams.get("ly") || 8),
      budgetMs: Number(u.searchParams.get("budget") || 200000),
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "조회 실패" }, { status: 500 });
  }
}
