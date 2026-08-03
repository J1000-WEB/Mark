import { NextResponse } from "next/server";
import { getDailySourceSheetId, getSheetsClient } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// MARK 6.60: 구글시트의 "1000만 셀" 한도는 실제 데이터가 있는 칸이 아니라, 각 시트에
// 할당된 격자 크기(rowCount × columnCount)를 기준으로 계산됩니다. 예전에 시트가 커졌다가
// 데이터만 지워지고 격자 크기는 안 줄어든 경우를 찾기 위한 진단 엔드포인트입니다.
export async function GET() {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getDailySourceSheetId();
    const meta = await sheets.spreadsheets.get({ spreadsheetId });

    const sheetInfo = (meta.data.sheets || []).map((s) => {
      const props = s.properties;
      const grid = props?.gridProperties;
      const rowCount = grid?.rowCount || 0;
      const columnCount = grid?.columnCount || 0;
      return {
        title: props?.title || "",
        rowCount,
        columnCount,
        gridCells: rowCount * columnCount,
      };
    });

    const totalGridCells = sheetInfo.reduce((sum, s) => sum + s.gridCells, 0);
    sheetInfo.sort((a, b) => b.gridCells - a.gridCells);

    return NextResponse.json({ ok: true, totalGridCells, sheets: sheetInfo }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("sheet-grid-diagnostic failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "진단 실패" }, { status: 500 });
  }
}
