import { NextResponse } from "next/server";
import { getHistorySheetId, getSheetValuesById } from "@/lib/googleSheets";
import { expandAnyDailyHistoryRows } from "@/lib/dailySales";
import { updateSpecialOfferActuals } from "@/lib/specialOfferWeek";
import { loadStoreAmountRows } from "@/lib/dailyBriefing";
import { mergeStoreDailyAmounts, flattenMergedAmounts } from "@/lib/storeDailyAmount";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DAILY_HISTORY_SHEET = "Daily_Sales_History";

// MARK 6.10.2: 매일 12시, 스페셜오퍼위크 세부일정의 2026-07-01 이후 이벤트만
// Daily_Sales_History 기준 실제 매출로 R열(실적)을 자동 갱신합니다.
// 그 이전 날짜(수기입력)는 절대 건드리지 않습니다.
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization") || "";
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const historyId = getHistorySheetId();
    const dailyRaw = await getSheetValuesById(historyId, DAILY_HISTORY_SHEET, "A:ZZ");
    const primaryRows = expandAnyDailyHistoryRows(dailyRaw || []).map((r) => ({
      date: r.date,
      storeName: r.storeName,
      amount: r.amount,
    }));
    // MARK 6.57: 일간/매장 탭과 동일하게, Daily_Sales_History가 없는 날짜는 일간매출(26년)으로 보완합니다.
    const fallbackRows = await loadStoreAmountRows().catch(() => []);
    const merged = mergeStoreDailyAmounts(primaryRows, fallbackRows);
    const dailyFlatRows = flattenMergedAmounts(merged);

    const result = await updateSpecialOfferActuals(dailyFlatRows);

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error: any) {
    console.error("Auto special-offer actuals failed:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "스페셜오퍼위크 실적 자동 갱신 실패" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
