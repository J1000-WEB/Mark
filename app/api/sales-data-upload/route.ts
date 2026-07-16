import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  parseStockSheet,
  parseProductionSheet,
  parsePeriodSalesSheet,
  parseFlagSheetByStyle,
  parseLineupSheet,
  buildStyleReport,
  buildColorReport,
  saveReportSnapshot,
} from "@/lib/salesDataUpload";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function readWorkbook(file: File | null) {
  if (!file) return null;
  const buf = await file.arrayBuffer();
  return XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
}

// MARK 6.16: 주간판매데이터 업로드 — 재고/생산/기간판매(전주,2주) 필수, 나머지는 선택.
export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const stockWb = await readWorkbook(form.get("재고") as File | null);
    const productionWb = await readWorkbook(form.get("생산") as File | null);
    const periodAWb = await readWorkbook(form.get("기간판매_전주_2주") as File | null);
    const periodBWb = await readWorkbook(form.get("기간판매_3주_4주") as File | null);
    const relaunchWb = await readWorkbook(form.get("재런칭") as File | null);
    const lineupWb = await readWorkbook(form.get("라인업") as File | null);

    if (!stockWb || !productionWb || !periodAWb) {
      return NextResponse.json({
        ok: false,
        error: "재고 / 생산 / 기간판매(전주,2주) 파일은 필수입니다.",
      }, { status: 400 });
    }

    const stockRows = parseStockSheet(stockWb);
    const production = parseProductionSheet(productionWb);
    const periodA = parsePeriodSalesSheet(periodAWb);
    const periodB = periodBWb ? parsePeriodSalesSheet(periodBWb) : { byStyle: new Map(), byStyleColor: new Map() };
    const relaunch = relaunchWb ? parseFlagSheetByStyle(relaunchWb, "재런칭") : new Set<string>();
    const lineup = lineupWb ? parseLineupSheet(lineupWb) : new Map<string, string>();

    if (!stockRows.length) {
      return NextResponse.json({ ok: false, error: "재고 파일에서 데이터를 읽지 못했습니다." }, { status: 400 });
    }

    const inputs = { stockRows, production, periodA, periodB, relaunch, lineup };
    const styleReport = buildStyleReport(inputs);
    const colorReport = buildColorReport(inputs);

    const styleSaved = await saveReportSnapshot("style", styleReport);
    const colorSaved = await saveReportSnapshot("color", colorReport);

    return NextResponse.json({
      ok: true,
      weekKey: styleSaved.weekKey,
      style: { rowCount: styleReport.rowCount, colCount: styleReport.colCount, parts: styleSaved.partCount },
      color: { rowCount: colorReport.rowCount, colCount: colorReport.colCount, parts: colorSaved.partCount },
      stockRowsParsed: stockRows.length,
      productionStylesParsed: production.size,
    });
  } catch (error: any) {
    console.error("sales-data-upload failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "업로드 처리 실패" }, { status: 500 });
  }
}
