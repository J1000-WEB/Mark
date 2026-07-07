import { NextResponse } from "next/server";
import { getHistorySheetId, getSheetValuesById } from "@/lib/googleSheets";
import { expandAnyDailyHistoryRows, safeWriteCompactDailyHistory } from "@/lib/dailySales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DAILY_HISTORY_SHEET = "Daily_Sales_History";

// MARK 6.6.1: Daily_Sales_History 전체를 "일자+점포당 한 줄 + 상세JSON" 압축 형식으로 일괄 변환합니다.
// 절대로 원본을 먼저 지우지 않습니다. 새 시트에 쓰고 검증한 뒤에만 이름을 바꿔서 교체하고,
// 교체 직전의 원본은 `Daily_Sales_History_backup` 이라는 이름으로 그대로 남습니다.
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

    if (!flatRows.length) {
      return NextResponse.json({
        ok: false,
        error:
          "기존 시트에서 데이터를 한 건도 읽어내지 못했습니다. 실수로 다 지울 위험이 있어 저장하지 않고 중단했습니다. " +
          "헤더/컬럼 구조를 확인해주세요.",
        before: { rows: beforeRowCount, columnsPerRow: beforeColCount, approxCells: beforeCellCount },
      }, { status: 400 });
    }

    if (!confirm) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        message: "실제 저장 전 미리보기입니다. ?confirm=1 을 붙여서 다시 호출하면 실제로 변환/저장합니다. (원본은 절대 먼저 지우지 않고, 변환 후 Daily_Sales_History_backup으로 보존됩니다.)",
        before: { rows: beforeRowCount, columnsPerRow: beforeColCount, approxCells: beforeCellCount },
        flatRecordCount: flatRows.length,
      });
    }

    const result = await safeWriteCompactDailyHistory(spreadsheetId, flatRows);
    const afterCellCount = result.compactRowCount * 7;

    return NextResponse.json({
      ok: true,
      dryRun: false,
      written: true,
      message: `Daily_Sales_History를 압축(JSON) 형식으로 변환 완료했습니다. 변환 직전 원본은 '${result.backupSheetName || "(신규 시트라 없음)"}' 시트에 그대로 남아있습니다.`,
      before: { rows: beforeRowCount, columnsPerRow: beforeColCount, approxCells: beforeCellCount },
      after: { rows: result.compactRowCount, columnsPerRow: 7, approxCells: afterCellCount },
      flatRecordCount: flatRows.length,
      backupSheetName: result.backupSheetName,
      reductionRate: beforeCellCount ? Math.round((1 - afterCellCount / beforeCellCount) * 100) : 0,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "마이그레이션 실패" }, { status: 500 });
  }
}
