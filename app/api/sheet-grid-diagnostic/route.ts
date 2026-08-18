import { NextResponse } from "next/server";
import { getHistorySheetId, getDailySourceSheetId, getSheetsClient } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// MARK 6.60: 구글시트의 "1000만 셀" 한도는 실제 데이터가 있는 칸이 아니라, 각 시트에
// 할당된 격자 크기(rowCount × columnCount)를 기준으로 계산됩니다. 예전에 시트가 커졌다가
// 데이터만 지워지고 격자 크기는 안 줄어든 경우를 찾기 위한 진단 엔드포인트입니다.
// MARK 6.105: 예전엔 getDailySourceSheetId()(스타일별채널별 시트가 있는 곳)만 봤는데,
// Daily_Sales_History는 getHistorySheetId() 쪽 스프레드시트에 있어서(서로 다른 스프레드시트일
// 수 있음) 정작 지금 문제가 되는 쪽을 안 보고 있었습니다 — 둘 다 확인하도록 고쳤고,
// 스프레드시트 링크도 같이 돌려줘서 브라우저로 바로 열어볼 수 있게 했습니다.
async function inspectSpreadsheet(spreadsheetId: string) {
  const sheets = await getSheetsClient();
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

  return {
    spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    totalGridCells,
    percentOfLimit: Math.round((totalGridCells / 10000000) * 1000) / 10,
    sheets: sheetInfo,
  };
}

export async function GET() {
  try {
    const historyId = getHistorySheetId();
    const dailySourceId = getDailySourceSheetId();

    const results: any = { ok: true, history: await inspectSpreadsheet(historyId) };
    // 같은 스프레드시트면 중복으로 또 안 보여줍니다.
    if (dailySourceId !== historyId) {
      results.dailySource = await inspectSpreadsheet(dailySourceId);
    }

    return NextResponse.json(results, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("sheet-grid-diagnostic failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "진단 실패" }, { status: 500 });
  }
}
