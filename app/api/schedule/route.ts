import { NextResponse } from "next/server";
import { getSheetId, getSheetValuesById, getSpreadsheetTitlesById, getHistorySheetId } from "@/lib/googleSheets";
import { isCoreOfflineSalesStore, normalizeStoreKey } from "@/lib/dataBuilder";
import { expandAnyDailyHistoryRows } from "@/lib/dailySales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function text(v: any) {
  return String(v ?? "").trim();
}

function normalizeSheetName(name: string) {
  return text(name).replace(/[\\/\s_\-·.]/g, "").replace(/[()]/g, "");
}

function pickScheduleSheet(titles: string[]) {
  if (titles.includes("Schedule_Simple")) return "Schedule_Simple";
  const found = titles.find((t) => normalizeSheetName(t).includes("ScheduleSimple") || normalizeSheetName(t).includes("판매전체상"));
  return found || "Schedule_Simple";
}

function parseDate(v: any) {
  const s = text(v).replace(/[./]/g, "-").slice(0, 10);
  const parts = s.split("-").map((x) => Number(x));
  if (parts.length >= 3 && parts.every((x) => Number.isFinite(x))) {
    const y = parts[0] < 100 ? parts[0] + 2000 : parts[0];
    return `${y}-${String(parts[1]).padStart(2, "0")}-${String(parts[2]).padStart(2, "0")}`;
  }
  const d = new Date(text(v));
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TEAM_MEMBERS = ["지승현", "최다은", "손민지", "한선아", "소재천", "이용훈", "조지현"];

function categoryOf(largeCategory: string, group: string, content: string) {
  const s = `${largeCategory} ${group} ${content}`.toLowerCase();
  if (/스페셜\s*오퍼\s*위크|special\s*offer\s*week/.test(s)) return "special_offer_week";
  if (/프로모션|행사|promotion|sale/.test(s)) return "promotion";
  if (/vmd|비주얼|집기|연출/.test(s)) return "vmd";
  if (/회의|미팅|meeting/.test(s)) return "meeting";
  if (/상품|입고|출시|product/.test(s)) return "product";
  if (/실적|성과|performance/.test(s)) return "performance";
  if (/휴무|스케줄|근무|연차|반차/.test(s)) return "schedule";
  return "general";
}

const SPECIAL_OFFER_SHEET_ID = "1KfiwexgTnPIrBaV4G7B2c_aXtvhvUoCnjyXAxc_cZN4";
const SPECIAL_OFFER_SHEET_NAME = "세부일정";
const DAILY_HISTORY_SHEET = "Daily_Sales_History";

// MARK 6.10: 스페셜오퍼위크 전용 스케줄러 시트에서 이벤트(점포+기간)를 읽어오고,
// 해당 점포가 그 기간 동안 실제로 얼마 팔았는지 Daily_Sales_History와 매칭해서 같이 반환합니다.
async function buildSpecialOfferEvents(dailyFlatRows: { date: string; storeName: string; amount: number }[]) {
  try {
    const rows = await getSheetValuesById(SPECIAL_OFFER_SHEET_ID, SPECIAL_OFFER_SHEET_NAME, "A:J");
    // 헤더는 4행(0-based index 2), 데이터는 5행(index 3)부터.
    const events: any[] = [];

    for (let i = 3; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.length) continue;

      const storeName = text(row[7]); // H열
      const startDate = parseDate(row[8]); // I열
      const endDate = parseDate(row[9]) || startDate; // J열
      const completed = text(row[6]); // G열
      if (!storeName || !startDate) continue;

      const storeKey = normalizeStoreKey(storeName);
      const salesAmount = dailyFlatRows
        .filter((r) => r.date >= startDate && r.date <= endDate && normalizeStoreKey(r.storeName) === storeKey)
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);

      events.push({
        id: `sow-${i}`,
        startDate,
        endDate,
        largeCategory: "스페셜오퍼위크",
        category: "special_offer_week",
        categoryLabel: "스페셜오퍼위크",
        person: "",
        rowKey: "special_offer_week",
        group: completed,
        content: storeName,
        title: storeName,
        displayTitle: storeName,
        storeName,
        salesAmount,
        raw: { startDate: row[8], endDate: row[9], storeName: row[7], completed: row[6] },
      });
    }

    return events;
  } catch (error) {
    console.error("Special offer week events failed:", error);
    return [];
  }
}

// MARK 6.10: 날짜별 핵심 오프라인 매장 전체 매출 + 전주 동요일 대비 신장률.
function buildDailyRevenueSeries(dailyFlatRows: { date: string; storeName: string; amount: number }[]) {
  const byDate = new Map<string, number>();
  for (const r of dailyFlatRows) {
    if (!isCoreOfflineSalesStore(r.storeName)) continue;
    byDate.set(r.date, (byDate.get(r.date) || 0) + Number(r.amount || 0));
  }

  const shiftDate = (dateKey: string, days: number) => {
    const d = new Date(`${dateKey}T00:00:00`);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  return Array.from(byDate.keys()).sort().map((date) => {
    const amount = byDate.get(date) || 0;
    const prevDate = shiftDate(date, -7);
    const prevAmount = byDate.get(prevDate) || 0;
    const growthRate = prevAmount ? ((amount - prevAmount) / prevAmount) * 100 : amount ? 100 : 0;
    return { date, amount, prevDate, prevAmount, growthRate };
  });
}

export async function GET() {
  try {
    const spreadsheetId = getSheetId();
    const titles = await getSpreadsheetTitlesById(spreadsheetId);
    const sheetName = pickScheduleSheet(titles);
    const rows = await getSheetValuesById(spreadsheetId, sheetName, "A:E");

    const events = rows.slice(1).map((row, idx) => {
      const startDate = parseDate(row[0]);
      const endDate = parseDate(row[1]) || startDate;
      const largeCategory = text(row[2]);
      const group = text(row[3]);
      const content = text(row[4]);
      const category = categoryOf(largeCategory, group, content);
      const person = TEAM_MEMBERS.find((name) => `${largeCategory} ${group} ${content}`.includes(name)) || "";
      return {
        id: `schedule-${idx + 2}`,
        startDate,
        endDate,
        largeCategory,
        category,
        categoryLabel: largeCategory || category,
        person,
        rowKey: person ? `staff:${person}` : category,
        group,
        content,
        title: content || group || largeCategory || "일정",
        displayTitle: content || group || largeCategory || "일정",
        raw: { startDate: row[0], endDate: row[1], largeCategory: row[2], group: row[3], content: row[4] },
      };
    }).filter((event) => event.startDate && event.title);

    // MARK 6.10: Daily_Sales_History를 한 번 읽어서 스페셜오퍼위크 매장별 매출 매칭 + 일별 매출 시리즈에 같이 사용합니다.
    let dailyFlatRows: { date: string; storeName: string; amount: number }[] = [];
    try {
      const historyId = getHistorySheetId();
      const dailyRaw = await getSheetValuesById(historyId, DAILY_HISTORY_SHEET, "A:ZZ");
      dailyFlatRows = expandAnyDailyHistoryRows(dailyRaw || []).map((r) => ({ date: r.date, storeName: r.storeName, amount: r.amount }));
    } catch (error) {
      console.error("Daily_Sales_History load failed (schedule):", error);
    }

    const specialOfferEvents = await buildSpecialOfferEvents(dailyFlatRows);
    const dailyRevenue = buildDailyRevenueSeries(dailyFlatRows);

    const allEvents = [...events, ...specialOfferEvents];

    return NextResponse.json(
      { ok: true, sheetName, events: allEvents, dailyRevenue },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Schedule_Simple을 불러오지 못했습니다.", events: [], dailyRevenue: [] }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
