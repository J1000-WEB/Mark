import { NextResponse } from "next/server";
import { parseDailySalesRows, backfillDailySalesForDate } from "@/lib/dailySales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// MARK 6.48: 과거 일자 파일을 업로드해서 Daily_Sales_History의 그 날짜 데이터를
// (예전에 금액이 없던 시절 값 대신) 정확한 값으로 교체합니다.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows: any[][] = body.rows || [];
    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "업로드된 데이터가 없습니다." }, { status: 400 });
    }

    const data = await parseDailySalesRows(rows, "백필 업로드 파일");
    const result = await backfillDailySalesForDate(data);

    return NextResponse.json({ ok: true, sourceDate: data.sourceDate, ...result });
  } catch (error: any) {
    console.error("daily-sales-backfill failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "백필 실패" }, { status: 500 });
  }
}
