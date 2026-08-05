import { NextResponse } from "next/server";
import { backfillFlatRows } from "@/lib/dailySales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// MARK 6.53: 로컬 ERP 스크래퍼(erp-agent)가 긁어온 "채널별 매출현황"(스타일/컬러/사이즈별)을
// Daily_Sales_History에 바로 반영합니다.
// MARK 6.71: mode로 3가지 반영 방식을 선택합니다 — "replace"(기본, 그날짜 통째 교체),
// "append"(이어붙이기, 청크 업로드용), "upsert"(onlyFields로 지정한 필드만 부분 갱신 —
// stock-refresh.js/sales-refresh.js가 서로의 값을 안 지우고 각자 필드만 갱신할 때 씀).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const date = String(body.date || "");
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const mode = body.mode === "upsert" || body.mode === "append" ? body.mode : body.append ? "append" : "replace";
    const onlyFields = Array.isArray(body.onlyFields) ? body.onlyFields : undefined;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ ok: false, error: "date가 YYYY-MM-DD 형식으로 필요합니다." }, { status: 400 });
    }
    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "rows가 비어있습니다." }, { status: 400 });
    }

    const flatRows = rows.map((r: any) => ({
      date,
      storeName: String(r.storeName || ""),
      styleCode: String(r.styleCode || ""),
      productName: String(r.productName || ""),
      colorCode: String(r.colorCode || ""),
      colorName: String(r.colorName || r.colorCode || ""),
      size: String(r.size || ""),
      qty: Number(r.qty || 0),
      amount: Number(r.amount || 0),
      stock: Number(r.stock || 0),
    })).filter((r: any) => r.storeName && r.styleCode);

    const result = await backfillFlatRows(flatRows, { mode, onlyFields });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("erp-daily-sales-import failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "가져오기 실패" }, { status: 500 });
  }
}
