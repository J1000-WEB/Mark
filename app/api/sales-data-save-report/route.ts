import { NextResponse } from "next/server";
import { saveReportSnapshot } from "@/lib/salesDataSnapshot";
import { recordUpload } from "@/lib/uploadAlertState";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// MARK 6.17.3: 원본 엑셀 파일은 이제 브라우저에서 직접 파싱/계산하고,
// 여기로는 계산이 끝난 작은 결과(rows)만 보냅니다 — Vercel 함수의 4.5MB 요청 제한을 피하기 위함입니다.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { styleReport, colorReport, uploadedStock, uploadedProduction } = body || {};

    if (!styleReport?.rows?.length || !colorReport?.rows?.length) {
      return NextResponse.json({ ok: false, error: "저장할 리포트 데이터가 없습니다." }, { status: 400 });
    }

    const styleSaved = await saveReportSnapshot("style", styleReport);
    const colorSaved = await saveReportSnapshot("color", colorReport);

    if (uploadedStock) {
      await recordUpload("카테고리가격").catch(() => {});
      await recordUpload("재고물류").catch(() => {});
    }
    if (uploadedProduction) {
      await recordUpload("생산").catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      weekKey: styleSaved.weekKey,
      style: { rowCount: styleReport.rowCount, colCount: styleReport.colCount, parts: styleSaved.partCount },
      color: { rowCount: colorReport.rowCount, colCount: colorReport.colCount, parts: colorSaved.partCount },
    });
  } catch (error: any) {
    console.error("sales-data-save-report failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "저장 실패" }, { status: 500 });
  }
}
