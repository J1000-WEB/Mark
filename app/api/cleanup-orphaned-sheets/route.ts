import { NextResponse } from "next/server";
import { getHistorySheetId, getSheetsClient, getSheetPropsById } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK 6.106: 예전 safeWriteCompactDailyHistory(6.104 이전)가 "임시 시트 만들기 → 검증 →
// 이름 바꿔서 교체" 방식을 쓰다가, 실패할 때마다(2026-08-15~18 1000만 셀 사고 기간 동안)
// 그 실행에서 만든 "Daily_Sales_History__staging_<타임스탬프>" 임시 시트가 이름을 못 바꾸고
// 그대로 버려졌습니다. 이게 48개나 쌓여서 워크북 전체를 99.3%까지 채우고 있었습니다
// (실제 원인은 Daily_Sales_History 자체가 아니라 이 버려진 임시 시트들이었음).
// 이 엔드포인트는 그 버려진 시트들을 한 번에 찾아서 지웁니다. "Daily_Sales_History" 본체와
// "Daily_Sales_History_backup"은 절대 안 건드립니다 — __staging_ 이 붙은 것만 지웁니다.
export async function POST() {
  try {
    const spreadsheetId = getHistorySheetId();
    const props = await getSheetPropsById(spreadsheetId);

    const orphaned = props.filter((p) => p.title.includes("__staging_"));

    if (!orphaned.length) {
      return NextResponse.json({ ok: true, deletedCount: 0, deleted: [], message: "정리할 임시 시트가 없습니다." });
    }

    const sheets = await getSheetsClient();
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: orphaned.map((p) => ({ deleteSheet: { sheetId: p.sheetId } })),
      },
    });

    return NextResponse.json({
      ok: true,
      deletedCount: orphaned.length,
      deleted: orphaned.map((p) => p.title),
    });
  } catch (error: any) {
    console.error("cleanup-orphaned-sheets failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "정리 실패" }, { status: 500 });
  }
}
