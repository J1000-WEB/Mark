import { NextResponse } from "next/server";
import { getHistorySheetId, getSheetValuesById, replaceSheetValuesById } from "@/lib/googleSheets";
import { expandAnyDailyHistoryRows, buildCompactDailyHistoryRows } from "@/lib/dailySales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DAILY_HISTORY_SHEET = "Daily_Sales_History";
const DAILY_HISTORY_HEADER = ["일자", "점포", "품목수", "총판매수량", "총판매금액", "총재고", "상세JSON"];

// MARK 6.6: Daily_Sales_History 전체를 "일자+점포당 한 줄 + 상세JSON" 압축 형식으로 일괄 변환합니다.
// 안전장치: ?confirm=1 없이 호출하면 실제로 쓰지 않고 변환 전/후 규모만 보여줍니다(dry-run).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const confirm = url.searchParams.get("confirm") === "1";

    const spreadsheetId = getHistorySheetId();
    const existingRaw = await getSheetValuesById(spreadsheetId, DAILY_HISTORY_SHEET, "A:ZZ").catch(() => []);

    if (!existingRaw.length) {
      return NextResponse.json({ ok: true, message: "Daily_Sales_History에 데이터가 없습니다.", before: null, after: null, written: false });
    }

    const beforeRowCount = Math.max(existingRaw.length - 1, 0);
    const beforeColCount = existingRaw[0]?.length || 0;
    const beforeCellCount = existingRaw.slice(1).reduce((sum, row) => sum + (row?.length || 0), 0);

    const flatRows = expandAnyDailyHistoryRows(existingRaw);
    const compactRows = buildCompactDailyHistoryRows(flatRows);
    const afterCellCount = compactRows.reduce((sum, row) => sum + row.length, 0);

    const summary = {
      before: {
        rows: beforeRowCount,
        columnsPerRow: beforeColCount,
        approxCells: beforeCellCount,
      },
      after: {
        rows: compactRows.length,
        columnsPerRow: DAILY_HISTORY_HEADER.length,
        approxCells: afterCellCount,
      },
      flatRecordCount: flatRows.length,
      reductionRate: beforeCellCount ? Math.round((1 - afterCellCount / beforeCellCount) * 100) : 0,
    };

    if (!confirm) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        message: "실제 저장 전 미리보기입니다. ?confirm=1 을 붙여서 다시 호출하면 실제로 변환/저장합니다.",
        ...summary,
      });
    }

    await replaceSheetValuesById(spreadsheetId, DAILY_HISTORY_SHEET, [DAILY_HISTORY_HEADER, ...compactRows]);

    return NextResponse.json({
      ok: true,
      dryRun: false,
      written: true,
      message: "Daily_Sales_History를 압축(JSON) 형식으로 변환 완료했습니다.",
      ...summary,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "마이그레이션 실패" }, { status: 500 });
  }
}
