import { NextResponse } from "next/server";
import { readRtOrders, saveRtOrders } from "@/lib/rtOrders";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

// MARK 2026-11-19: ERP 이동 지시 현황 → MARK_DB "RT_지시이력" (lib/rtOrders.ts 참고)
// POST { from:"YYYYMMDD", to:"YYYYMMDD", rows:[[지시일,차수,보낼코드,보낼명,받을코드,받을명,스타일,칼라,사이즈,지시량,이행량,이행상태,이행일자,확정일자,미이행사유,지시자,비고]] }
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD → 저장된 줄(확인용)
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const from = u.searchParams.get("from") || "2000-01-01";
    const to = u.searchParams.get("to") || "2999-12-31";
    const { rows, coverFrom, coverTo } = await readRtOrders(from, to);
    const sum = (k: "ordQty" | "doneQty") => rows.reduce((a, r) => a + r[k], 0);
    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status || "(빈칸)"] = (byStatus[r.status || "(빈칸)"] || 0) + 1;
    return NextResponse.json(
      { ok: true, coverFrom, coverTo, count: rows.length, ordQty: sum("ordQty"), doneQty: sum("doneQty"), byStatus, sample: rows.slice(0, 20) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "조회 실패" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const result = await saveRtOrders(String(body?.from || ""), String(body?.to || ""), rows);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("rt-orders save failed:", e);
    return NextResponse.json({ ok: false, error: e?.message || "저장 실패" }, { status: 500 });
  }
}
