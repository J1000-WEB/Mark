import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  parseStockSheet,
  parseProductionSheet,
  parsePeriodSalesSheet,
  parseFlagSheetByStyle,
  parseLineupSheet,
  mergeProductionMaps,
  mergePeriodSalesAggs,
  mergeFlagSets,
  mergeLineupMaps,
  buildStyleReport,
  buildColorReport,
  buildPeriodSalesFromDailyHistory,
} from "@/lib/salesDataUpload";
import { saveReportSnapshot } from "@/lib/salesDataSnapshot";
import { recordUpload } from "@/lib/uploadAlertState";
import { getHistorySheetId, getSheetValuesById } from "@/lib/googleSheets";
import { expandAnyDailyHistoryRows } from "@/lib/dailySales";
import { getStylePriceMap } from "@/lib/stylePriceHistory";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function readWorkbooks(form: FormData, field: string) {
  const files = form.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
  const workbooks: XLSX.WorkBook[] = [];
  for (const file of files) {
    const buf = await file.arrayBuffer();
    workbooks.push(XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true }));
  }
  return workbooks;
}

// MARK 6.16~6.17: 주간판매데이터 업로드 — 재고/생산은 필수, 나머지는 선택.
// MARK 6.17.2: 카테고리(재고/생산 등)별로 여러 파일(용량 커서 나뉜 파트) 업로드를 지원합니다.
export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const stockWbs = await readWorkbooks(form, "재고");
    const productionWbs = await readWorkbooks(form, "생산");
    const periodAWbs = await readWorkbooks(form, "기간판매_전주_2주");
    const periodBWbs = await readWorkbooks(form, "기간판매_3주_4주");
    const relaunchWbs = await readWorkbooks(form, "재런칭");
    const lineupWbs = await readWorkbooks(form, "라인업");

    if (!stockWbs.length || !productionWbs.length) {
      return NextResponse.json({
        ok: false,
        error: "재고 / 생산 파일은 필수입니다.",
      }, { status: 400 });
    }

    const stockRows = stockWbs.flatMap((wb) => parseStockSheet(wb));
    const production = mergeProductionMaps(productionWbs.map((wb) => parseProductionSheet(wb)));

    // MARK 6.17: 기간판매 파일을 안 올리면, 이미 쌓고 있는 Daily_Sales_History로 자동 계산합니다.
    let periodA;
    let periodB: { byStyle: Map<string, any>; byStyleColor: Map<string, any> } = { byStyle: new Map(), byStyleColor: new Map() };
    let periodSource = "업로드 파일";
    if (periodAWbs.length) {
      periodA = mergePeriodSalesAggs(periodAWbs.map((wb) => parsePeriodSalesSheet(wb)));
      if (periodBWbs.length) periodB = mergePeriodSalesAggs(periodBWbs.map((wb) => parsePeriodSalesSheet(wb)));
    } else {
      const historyId = getHistorySheetId();
      const dailyRaw = await getSheetValuesById(historyId, "Daily_Sales_History", "A:ZZ").catch(() => []);
      const dailyFlatRows = expandAnyDailyHistoryRows(dailyRaw || []);
      const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

      // 날짜별로 다시 조회하면 API 호출이 너무 많아지므로, "주(월요일)" 단위로 묶어서 한 번씩만 조회합니다.
      const mondayOf = (dateKey: string) => {
        const d = new Date(`${dateKey}T00:00:00`);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };
      const uniqueDates = Array.from(new Set(dailyFlatRows.map((r) => r.date))).filter(Boolean);
      const uniqueWeeks = Array.from(new Set(uniqueDates.map(mondayOf)));
      const priceMapsByWeek = new Map<string, Map<string, number>>();
      for (const w of uniqueWeeks) {
        priceMapsByWeek.set(w, await getStylePriceMap(w));
      }
      const priceMapsByDate = new Map<string, Map<string, number>>();
      for (const d of uniqueDates) {
        priceMapsByDate.set(d, priceMapsByWeek.get(mondayOf(d)) || new Map());
      }

      const flatForPeriod = dailyFlatRows.map((r) => ({
        date: r.date,
        storeName: r.storeName,
        styleCode: r.styleCode,
        qty: Number(r.qty || 0),
      }));
      periodA = buildPeriodSalesFromDailyHistory(flatForPeriod, priceMapsByDate, todayKey);
      periodSource = "Daily_Sales_History 자동 집계";
    }

    const relaunch = relaunchWbs.length ? mergeFlagSets(relaunchWbs.map((wb) => parseFlagSheetByStyle(wb, "재런칭"))) : new Set<string>();
    const lineup = lineupWbs.length ? mergeLineupMaps(lineupWbs.map((wb) => parseLineupSheet(wb))) : new Map<string, string>();

    if (!stockRows.length) {
      return NextResponse.json({ ok: false, error: "재고 파일에서 데이터를 읽지 못했습니다." }, { status: 400 });
    }

    const inputs = { stockRows, production, periodA, periodB, relaunch, lineup };
    const styleReport = buildStyleReport(inputs);
    const colorReport = buildColorReport(inputs);

    const styleSaved = await saveReportSnapshot("style", styleReport);
    const colorSaved = await saveReportSnapshot("color", colorReport);

    if (stockWbs.length) {
      await recordUpload("카테고리가격").catch(() => {});
      await recordUpload("재고물류").catch(() => {});
    }
    if (productionWbs.length) {
      await recordUpload("생산").catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      weekKey: styleSaved.weekKey,
      periodSource,
      style: { rowCount: styleReport.rowCount, colCount: styleReport.colCount, parts: styleSaved.partCount },
      color: { rowCount: colorReport.rowCount, colCount: colorReport.colCount, parts: colorSaved.partCount },
      stockRowsParsed: stockRows.length,
      stockFileCount: stockWbs.length,
      productionFileCount: productionWbs.length,
      productionStylesParsed: production.size,
    });
  } catch (error: any) {
    console.error("sales-data-upload failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "업로드 처리 실패" }, { status: 500 });
  }
}
