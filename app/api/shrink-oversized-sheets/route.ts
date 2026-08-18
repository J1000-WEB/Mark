import { NextResponse } from "next/server";
import { getHistorySheetId, getSheetsClient, getSheetPropsById, getSheetValuesById } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK 6.106: sheet-grid-diagnostic으로 확인해보니 Weekly_Store_History(519만 셀)와
// Weekly_History(264만 셀)가 워크북 전체 한도(1000만)의 79%를 차지하고 있었습니다 —
// 실제 데이터양에 비해 그리드(rowCount×columnCount)가 훨씬 크게 잡혀있는 것으로 보입니다
// (예전에 데이터는 지워졌는데 그리드 크기만 안 줄어든 케이스, sheet-grid-diagnostic의
// 원래 목적이 바로 이걸 찾는 거였음). 이 엔드포인트는 셀 "내용"은 전혀 안 건드리고,
// 실제로 데이터가 있는 마지막 행/열까지만 확인해서 그보다 큰 그리드만 안전하게 줄입니다.
//
// 사용: POST /api/shrink-oversized-sheets  body: { sheetNames?: string[], dryRun?: boolean }
// sheetNames 생략하면 history 스프레드시트의 모든 시트를 검사합니다.
// dryRun:true면 실제로 줄이지 않고 "얼마나 줄일 수 있는지"만 알려줍니다.
const BUFFER_ROWS = 200; // 앞으로 더 쌓일 데이터를 위한 여유
const BUFFER_COLS = 5;
const MIN_SAVINGS_CELLS = 5000; // 이 정도 이하로 줄어드는 건 굳이 안 건드림(노이즈)

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const onlySheetNames: string[] | null = Array.isArray(body?.sheetNames) ? body.sheetNames : null;
    const dryRun = !!body?.dryRun;

    const spreadsheetId = getHistorySheetId();
    const props = await getSheetPropsById(spreadsheetId);
    const targets = onlySheetNames ? props.filter((p) => onlySheetNames.includes(p.title)) : props;

    const sheets = await getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const gridBySheetId = new Map(
      (meta.data.sheets || []).map((s) => [s.properties?.sheetId, s.properties?.gridProperties])
    );

    const results: any[] = [];
    const resizeRequests: any[] = [];

    for (const t of targets) {
      // __staging_/backup류는 별도 정리 엔드포인트(cleanup-orphaned-sheets) 담당이라 건너뜁니다.
      if (t.title.includes("__staging_")) continue;

      const grid = gridBySheetId.get(t.sheetId) as { rowCount?: number; columnCount?: number } | undefined;
      const currentRows = grid?.rowCount || 0;
      const currentCols = grid?.columnCount || 0;
      if (!currentRows || !currentCols) continue;

      // 실제 데이터가 있는 마지막 행/열을 확인합니다(값만 읽음, 아무것도 안 건드림).
      const values = await getSheetValuesById(spreadsheetId, t.title, "A:ZZ").catch(() => []);
      let lastRow = 0;
      let lastCol = 0;
      for (let r = 0; r < values.length; r++) {
        const row = values[r] || [];
        for (let c = 0; c < row.length; c++) {
          const v = row[c];
          if (v !== null && v !== undefined && String(v).trim() !== "") {
            if (r + 1 > lastRow) lastRow = r + 1;
            if (c + 1 > lastCol) lastCol = c + 1;
          }
        }
      }

      const neededRows = Math.min(currentRows, lastRow + BUFFER_ROWS);
      const neededCols = Math.min(currentCols, Math.max(lastCol + BUFFER_COLS, 1));
      const currentCells = currentRows * currentCols;
      const neededCells = neededRows * neededCols;
      const savings = currentCells - neededCells;

      if (savings < MIN_SAVINGS_CELLS) continue;

      results.push({
        title: t.title,
        before: { rowCount: currentRows, columnCount: currentCols, cells: currentCells },
        after: { rowCount: neededRows, columnCount: neededCols, cells: neededCells },
        actualDataExtent: { lastRow, lastCol },
        savings,
      });

      if (!dryRun) {
        resizeRequests.push({
          updateSheetProperties: {
            properties: { sheetId: t.sheetId, gridProperties: { rowCount: neededRows, columnCount: neededCols } },
            fields: "gridProperties.rowCount,gridProperties.columnCount",
          },
        });
      }
    }

    if (resizeRequests.length) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: resizeRequests } });
    }

    const totalSavings = results.reduce((s, r) => s + r.savings, 0);
    return NextResponse.json({ ok: true, dryRun, resizedCount: dryRun ? 0 : results.length, totalSavings, details: results });
  } catch (error: any) {
    console.error("shrink-oversized-sheets failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "축소 실패" }, { status: 500 });
  }
}
