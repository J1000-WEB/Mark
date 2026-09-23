import { NextResponse } from "next/server";
import { saveSalesSummarySnapshot, getSalesSummaryMeta } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK 2026-09-22: "전체매출" 원본 다운로드 파일(매장×날짜별 일간 실적+목표)을 매일
// 업로드하면 매출탭(점포별)을 자동으로 만들어주는 기능의 저장 라우트입니다.
// (매장별_재고_스냅샷/store-stock-upload와 동일한 패턴 — 업로드할 때마다 전체 교체.)

// GET: 마지막 업로드 정보 조회
export async function GET() {
  try {
    const meta = await getSalesSummaryMeta();
    return NextResponse.json({ ok: true, meta }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500 });
  }
}

// POST: 압축된 매출 스냅샷 저장 { rows: [{date,channelGroup,channelCode,storeName,qty,amount,receiptCount,target}, ...], fileName }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rows = Array.isArray(body?.rows) ? body.rows : null;
    const fileName = typeof body?.fileName === "string" ? body.fileName : "";
    if (!rows || !rows.length) {
      return NextResponse.json({ ok: false, error: "업로드할 데이터(rows)가 없습니다." }, { status: 400 });
    }
    const result = await saveSalesSummarySnapshot(rows, fileName);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("sales-summary-upload failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "매출 스냅샷 업로드 실패" }, { status: 500 });
  }
}
