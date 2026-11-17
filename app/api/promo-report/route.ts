import { NextResponse } from "next/server";
import { buildPromoReport } from "@/lib/promoReport";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

// MARK 2026-11-17: 주간 IMC 프로모션 결과 — GET ?week=YYYY-MM-DD(그 주 월요일, 없으면 지난주)
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    if (sp.get("debugArchive")) {
      // 점검용: ?debugArchive=YYYY-MM-DD,YYYY-MM-DD&style=XXX → 보관 시트의 그 품번 줄(채널·팀별)
      const { readArchivedSales } = await import("@/lib/pipArchive");
      const style = (sp.get("style") || "").toUpperCase();
      const { rows, foundDates } = await readArchivedSales(sp.get("debugArchive")!.split(","));
      const agg = new Map<string, { team: string; store: string; qty: number; amount: number }>();
      for (const r of rows) {
        if (style && r.styleCode !== style) continue;
        const k = `${r.team}|${r.storeName}`;
        const a = agg.get(k) || { team: r.team, store: r.storeName, qty: 0, amount: 0 };
        a.qty += r.qty; a.amount += r.amount; agg.set(k, a);
      }
      const teams = [...new Set(rows.map((r) => r.team))];
      return NextResponse.json({ foundDates, teams, rows: [...agg.values()].sort((a, b) => b.amount - a.amount) });
    }
    const week = sp.get("week") || undefined;
    return NextResponse.json({ ok: true, ...(await buildPromoReport(week)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("promo-report failed:", e);
    return NextResponse.json({ ok: false, error: e?.message || "프로모션 리포트 계산 실패" }, { status: 500 });
  }
}
