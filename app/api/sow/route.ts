import { NextResponse } from "next/server";
import { readSpecialOfferSheet } from "@/lib/specialOfferWeek";
import { buildSowReview, buildSowPlan, readSowEvents, readSowPriceHistory, appendSowPriceHistory } from "@/lib/sow";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// MARK 2026-11-24: 스페셜오퍼위크(SOW) — GET ?ids=행,행(리뷰, 없으면 가장 최근 끝난 행사 묶음) / GET ?plan=행&basis=forecast|target&ratio=2&perSku=5&desks=&hangers=
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (k: string) => u.searchParams.get(k);
  const num = (k: string) => (q(k) !== null && q(k) !== "" ? Number(q(k)) : undefined);
  try {
    if (q("debug") === "sheet") {
      const s = await readSpecialOfferSheet();
      return NextResponse.json({ ok: true, header: s.rows[s.headerRowIdx], rows: s.rows.slice(s.headerRowIdx + 1).filter((r) => r && r[7]), debug: s.debug });
    }
    if (q("prices")) return NextResponse.json({ ok: true, rows: await readSowPriceHistory() });
    if (q("list")) return NextResponse.json({ ok: true, events: await readSowEvents() });
    if (q("plan")) {
      const r = await buildSowPlan({
        id: q("plan")!,
        basis: q("basis") === "target" ? "target" : "forecast",
        ratio: num("ratio"), perSku: num("perSku"), deskSku: num("deskSku"), hangerSku: num("hangerSku"), desks: num("desks"), hangers: num("hangers"), layoutMode: q("layout") === "price" ? "price" : "sku", tol: num("tol"),
        exclude: q("exclude") !== null ? q("exclude")!.split(",").filter(Boolean) : undefined,
      });
      return NextResponse.json({ ok: true, ...r });
    }
    const ids = q("ids") ? q("ids")!.split(",").filter(Boolean) : null;
    const r = await buildSowReview({ ids });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    console.error("sow", e);
    return NextResponse.json({ ok: false, error: e?.message || "조회 실패" }, { status: 500 });
  }
}

// POST {prices:[{date,store,style,name,consumer,price}]} — SOW 가격조정 이력 추가(행사 때 낸 가격조정 엑셀 내용)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const n = await appendSowPriceHistory(Array.isArray(body?.prices) ? body.prices : []);
    return NextResponse.json({ ok: true, saved: n });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "저장 실패" }, { status: 500 });
  }
}
