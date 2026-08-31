import { NextResponse } from "next/server";
import { getDbSheetId, getSheetValuesById } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const revalidate = 0;

const ACTIVE_ALERTS_SHEET = "재고입고알림_활성";

// MARK: 실제 스파이크 감지+해제 판단은 /api/upload-stock-history(업로드할 때마다)에서
// 이미 다 처리해서 "재고입고알림_활성" 시트에 저장해두기 때문에, 여기서는 그 목록을
// 그대로 읽어서 보여주기만 합니다 — 그래서 "한번 뜬 알림이 확인 전에 사라지는" 문제가
// 없고, 실제로 재고가 줄어들 때까지(투입될 때까지) 계속 남아있습니다.
export async function GET() {
  try {
    const spreadsheetId = getDbSheetId();
    const rows = await getSheetValuesById(spreadsheetId, ACTIVE_ALERTS_SHEET, "A:E").catch(() => []);
    const data = rows.slice(1).filter((r) => r?.[0]);

    const alerts = data
      .map((r) => {
        const baselineStock = Number(r[3] || 0);
        const peakStock = Number(r[4] || 0);
        return {
          styleCode: String(r[0]),
          colorCode: String(r[1]),
          firstAlertedDate: String(r[2]),
          baselineStock,
          peakStock,
          increase: peakStock - baselineStock,
        };
      })
      .sort((a, b) => b.increase - a.increase);

    return NextResponse.json({ ok: true, alerts });
  } catch (error: any) {
    console.error("stock-inbound-alerts failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500 });
  }
}
