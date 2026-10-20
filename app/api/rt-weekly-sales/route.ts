import { NextResponse } from "next/server";
import { getRtWeeklySalesMeta, saveRtWeeklySales, saveRtWeeklySalesChunk, finishRtWeeklySales } from "@/lib/rtWeeklySalesStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

// MARK 2026-10-20: RT 참고자료 ① 전주·전전주 매장별 판매 업로드.
// GET: 마지막 업로드 정보
// POST(작은 파일): { rows: [[채널코드,채널명,스타일,스타일명,칼라,사이즈,재고,누계판매,전주수량,전주금액,전전주수량,전전주금액]], fileName, period1, period2, format }
// POST(큰 SKU 파일): { mode:"chunk", rows, startRow } … → { mode:"finish", totalRows, fileName, period1, period2, format }
export async function GET() {
  try {
    const meta = await getRtWeeklySalesMeta();
    return NextResponse.json({ ok: true, meta }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const meta = { fileName: body?.fileName, period1: body?.period1, period2: body?.period2, format: body?.format };
    if (body?.mode === "chunk") return NextResponse.json(await saveRtWeeklySalesChunk(Array.isArray(body.rows) ? body.rows : [], Number(body.startRow)));
    if (body?.mode === "finish") return NextResponse.json(await finishRtWeeklySales(Number(body.totalRows), meta));
    const rows = Array.isArray(body?.rows) ? body.rows : null;
    if (!rows || !rows.length) return NextResponse.json({ ok: false, error: "업로드할 데이터(rows)가 없습니다." }, { status: 400 });
    return NextResponse.json(await saveRtWeeklySales(rows, meta));
  } catch (error: any) {
    console.error("rt-weekly-sales upload failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "업로드 실패" }, { status: 500 });
  }
}
