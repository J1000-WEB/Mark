import { NextResponse } from "next/server";
import { debugStyleChannelStock, computeWeeklyProductReport, readWeeklyCache, writeWeeklyCache, lastCompletedWeek, mondayOf } from "@/lib/weeklyProductReport";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

// MARK 2026-11-18: 상품탭 주간데이터 — GET ?week=YYYY-MM-DD(그 주 아무 날)&mode=style|color[&refresh=1]
// 캐시(MARK_DB 주간데이터_캐시)가 있으면 그걸, 없거나 refresh=1이면 계산 후 저장. 응답은 mode 한쪽만(용량 때문에).
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    if (sp.get("debugStyle")) return NextResponse.json({ ok: true, channels: await debugStyleChannelStock(sp.get("debugStyle")!) });
    const w = sp.get("week");
    const week = w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? mondayOf(w) : lastCompletedWeek();
    if (sp.get("ly") === "1") {
      // MARK 2026-11-20: 구성비 전년비 — 전년 같은 주(−364일) 품번별 오프라인 판매(PIP 보관 시트, 오프라인팀·매장주문/반품 제외)
      const { readArchivedSales } = await import("@/lib/pipArchive");
      const { isPromoExcludedStore } = await import("@/lib/promoReport");
      const add = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
      const lyStart = add(week, -364);
      const dates = Array.from({ length: 7 }, (_, i) => add(lyStart, i));
      const { rows, foundDates } = await readArchivedSales(dates);
      const map: Record<string, [number, number]> = {};
      for (const r of rows) {
        if (r.team !== "오프라인팀" || isPromoExcludedStore(r.storeName)) continue;
        const k = String(r.styleCode || "").toUpperCase();
        const a = (map[k] = map[k] || [0, 0]);
        a[0] += r.qty || 0;
        a[1] += r.amount || 0;
      }
      return NextResponse.json({ ok: true, week, lyStart, lyEnd: add(lyStart, 6), foundDates, map }, { headers: { "Cache-Control": "no-store" } });
    }
    const mode = sp.get("mode") === "color" ? "color" : "style";
    let data: any = sp.get("refresh") === "1" ? null : await readWeeklyCache(week).catch(() => null);
    let cache = "hit";
    if (!data) {
      data = await computeWeeklyProductReport(week);
      cache = "computed";
      // nosave=1: 계산만(비교·점검용, 캐시 안 덮음)
      if (sp.get("nosave") === "1") cache = "computed(nosave)";
      else try {
        const info = await writeWeeklyCache(week, data);
        cache = `computed+saved(${info.chunks}조각 ${info.kb}KB)`;
      } catch (e: any) {
        cache = `computed(저장 실패: ${e?.message || e})`;
      }
    }
    const { styles, colors, ...meta } = data;
    let rows = mode === "color" ? colors : styles;
    // MARK 2026-11-21: 금액·수량 누계(PIP 보관 시트 전체, 그 주 일요일까지) — 캐시와 상관없이 응답할 때 붙임
    let cum: any = null;
    try {
      const { readSalesCumulative } = await import("@/lib/salesCumulative");
      const c = await readSalesCumulative(meta.weekEnd);
      const map = mode === "color" ? c.color : c.style;
      rows = rows.map((r: any) => {
        const v = map[r.k];
        return v ? { ...r, cumQty: v[0], cumAmt: Math.round(v[1]) } : { ...r, cumQty: 0, cumAmt: 0 };
      });
      cum = { from: c.from, to: c.to, days: c.days, computedMonths: c.computedMonths };
    } catch (e: any) {
      cum = { error: e?.message || String(e) };
    }
    return NextResponse.json({ ok: true, ...meta, mode, cache, cum, rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("weekly-product failed", e);
    return NextResponse.json({ ok: false, error: e?.message || "주간데이터 계산 실패" }, { status: 500 });
  }
}
