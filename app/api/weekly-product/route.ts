import { NextResponse } from "next/server";
import { computeWeeklyProductReport, readWeeklyCache, writeWeeklyCache, lastCompletedWeek, mondayOf } from "@/lib/weeklyProductReport";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

// MARK 2026-11-18: 상품탭 주간데이터 — GET ?week=YYYY-MM-DD(그 주 아무 날)&mode=style|color[&refresh=1]
// 캐시(MARK_DB 주간데이터_캐시)가 있으면 그걸, 없거나 refresh=1이면 계산 후 저장. 응답은 mode 한쪽만(용량 때문에).
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const w = sp.get("week");
    const week = w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? mondayOf(w) : lastCompletedWeek();
    const mode = sp.get("mode") === "color" ? "color" : "style";
    let data: any = sp.get("refresh") === "1" ? null : await readWeeklyCache(week).catch(() => null);
    let cache = "hit";
    if (!data) {
      data = await computeWeeklyProductReport(week);
      cache = "computed";
      try {
        const info = await writeWeeklyCache(week, data);
        cache = `computed+saved(${info.chunks}조각 ${info.kb}KB)`;
      } catch (e: any) {
        cache = `computed(저장 실패: ${e?.message || e})`;
      }
    }
    const { styles, colors, ...meta } = data;
    return NextResponse.json({ ok: true, ...meta, mode, cache, rows: mode === "color" ? colors : styles }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("weekly-product failed", e);
    return NextResponse.json({ ok: false, error: e?.message || "주간데이터 계산 실패" }, { status: 500 });
  }
}
