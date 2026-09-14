import { NextResponse } from "next/server";
import { readDailyHistoryRowsForExactDates } from "@/lib/dailySales";
import { getStylePriceMap } from "@/lib/stylePriceHistory";
import { buildPeriodSalesFromDailyHistory } from "@/lib/salesDataUpload";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK 6.17.3: 기간판매 파일을 안 올렸을 때, Daily_Sales_History 기반으로 계산한
// 품번별 기간판매(수량/금액)를 작은 JSON으로 반환합니다 (브라우저에서 리포트 조립에 사용).
//
// MARK 2026-09-14: "전체적으로 무거워짐" 점검 — buildPeriodSalesFromDailyHistory가 실제로
// 보는 기간은 today 기준 최근 28일뿐인데(period1~4, 각 7일씩), 매번 전체("A:ZZ", 수십만 행)를
// 읽고 행당 JSON까지 펼치고 있었습니다. 필요한 날짜만 targeted하게 읽도록 바꿨습니다.
function recentKstDateKeys(days: number, fromKey: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(`${fromKey}T00:00:00`);
    d.setDate(d.getDate() - i);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return keys;
}

export async function GET() {
  try {
    const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    const dailyFlatRows = await readDailyHistoryRowsForExactDates(recentKstDateKeys(28, todayKey));

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
    const periodA = buildPeriodSalesFromDailyHistory(flatForPeriod, priceMapsByDate, todayKey);

    // Map은 JSON으로 못 보내니 일반 객체로 변환합니다.
    const byStyle: Record<string, any> = {};
    for (const [k, v] of periodA.byStyle.entries()) byStyle[k] = v;

    return NextResponse.json({ ok: true, byStyle, todayKey }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("daily-history-period-sales failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500 });
  }
}
