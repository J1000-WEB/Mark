import { getHistorySheetId, getSheetValuesById } from "@/lib/googleSheets";
import { expandAnyDailyHistoryRows } from "@/lib/dailySales";
import { isCoreOfflineSalesStore, normalizeStoreKey } from "@/lib/dataBuilder";
import { getWeatherForStoreOnDate } from "@/lib/storeRegion";

// MARK 6.20: 일간(매장) AI 브리핑 — 전사 + 점포별.
// 요일별 비교 규칙 (평일/전환일/주말 그룹이 바뀌는 경계에서는 "어제"가 아니라 "전주 같은 요일"과 비교):
//  화,수,목 → 어제
//  금       → 전주 금요일 (목→금 전환)
//  토       → 전주 토요일 (금→토 전환)
//  일       → 어제(토)   (같은 주말 그룹이라 예외적으로 허용)
//  월       → 전주 월요일 (일→월 전환)

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

function dayOfWeek(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).getDay(); // 0=일 1=월 2=화 ... 6=토
}

// 주어진 날짜의 "비교 대상 날짜"를 요일 규칙에 따라 계산합니다.
export function getComparisonDateForDaily(dateKey: string): { compareDate: string; compareLabel: string } {
  const dow = dayOfWeek(dateKey);
  if (dow === 5 || dow === 6 || dow === 1) {
    // 금(5), 토(6), 월(1) — 그룹이 바뀌는 경계라 전주 같은 요일과 비교
    return { compareDate: addDays(dateKey, -7), compareLabel: "전주 동요일" };
  }
  // 화,수,목,일 — 어제와 비교
  return { compareDate: addDays(dateKey, -1), compareLabel: "어제" };
}

function yesterdayDateKey() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  d.setDate(d.getDate() - 1);
  return ymd(d);
}

async function loadDailyFlatRows() {
  const historyId = getHistorySheetId();
  const raw = await getSheetValuesById(historyId, "Daily_Sales_History", "A:ZZ").catch(() => []);
  return expandAnyDailyHistoryRows(raw || []);
}

type FlatRow = { date: string; storeName: string; styleCode: string; productName: string; qty: number; amount: number; stock: number };

function filterByStore(rows: FlatRow[], storeName?: string) {
  if (!storeName) return rows.filter((r) => isCoreOfflineSalesStore(r.storeName));
  const key = normalizeStoreKey(storeName);
  return rows.filter((r) => normalizeStoreKey(r.storeName) === key);
}

function sumAmount(rows: FlatRow[], dateKey: string) {
  return rows.filter((r) => r.date === dateKey).reduce((s, r) => s + Number(r.amount || 0), 0);
}

function topProductMovers(rows: FlatRow[], targetDate: string, compareDate: string) {
  const byStyleTarget = new Map<string, { productName: string; amount: number }>();
  const byStyleCompare = new Map<string, number>();

  for (const r of rows) {
    if (r.date === targetDate) {
      if (!byStyleTarget.has(r.styleCode)) byStyleTarget.set(r.styleCode, { productName: r.productName, amount: 0 });
      byStyleTarget.get(r.styleCode)!.amount += Number(r.amount || 0);
    } else if (r.date === compareDate) {
      byStyleCompare.set(r.styleCode, (byStyleCompare.get(r.styleCode) || 0) + Number(r.amount || 0));
    }
  }

  const movers = Array.from(byStyleTarget.entries())
    .map(([styleCode, v]) => {
      const compareAmount = byStyleCompare.get(styleCode) || 0;
      const changeRate = compareAmount ? ((v.amount - compareAmount) / compareAmount) * 100 : v.amount ? 100 : 0;
      return { styleCode, productName: v.productName, amount: v.amount, compareAmount, changeRate, hasCompare: compareAmount > 0 };
    })
    .filter((m) => m.hasCompare);

  const best = [...movers].sort((a, b) => b.changeRate - a.changeRate)[0];
  const worst = [...movers].sort((a, b) => a.changeRate - b.changeRate)[0];
  return { best, worst };
}

export async function buildDailyStoreBriefing(storeName?: string, dateOverride?: string) {
  const targetDate = dateOverride || yesterdayDateKey();
  const { compareDate, compareLabel } = getComparisonDateForDaily(targetDate);

  const allRows = await loadDailyFlatRows();
  const scoped = filterByStore(allRows, storeName);

  const targetAmount = sumAmount(scoped, targetDate);
  const compareAmount = sumAmount(scoped, compareDate);
  const changeRate = compareAmount ? ((targetAmount - compareAmount) / compareAmount) * 100 : targetAmount ? 100 : 0;

  const { best, worst } = topProductMovers(scoped, targetDate, compareDate);

  const lines: string[] = [];
  const scopeLabel = storeName ? storeName : "전사";
  lines.push(
    `${scopeLabel} ${targetDate} 매출은 ${Math.round(targetAmount).toLocaleString("ko-KR")}원으로, ${compareLabel}(${compareDate}) 대비 ${changeRate >= 0 ? "+" : ""}${changeRate.toFixed(1)}%예요.`
  );
  if (best && best.changeRate > 0) {
    lines.push(`호조상품 ${best.styleCode}(${best.productName})가 ${compareLabel} 대비 +${best.changeRate.toFixed(0)}%로 늘었어요.`);
  }
  if (worst && worst.changeRate < 0) {
    lines.push(`${worst.styleCode}(${worst.productName})는 ${compareLabel} 대비 ${worst.changeRate.toFixed(0)}%로 줄었어요.`);
  }
  if (lines.length === 1) lines.push("아직 상품별로 비교할 만한 전일 실적이 충분하지 않아요.");

  let weather: any = null;
  if (storeName) {
    weather = await getWeatherForStoreOnDate(storeName, targetDate).catch(() => null);
    if (weather) {
      lines.push(`${storeName}의 오늘 날씨는 ${weather.weather}(최고 ${weather.maxTemp}°/최저 ${weather.minTemp}°, 강수확률 ${weather.rainChance}%)이었어요.`);
    }
  }

  return {
    scope: scopeLabel,
    targetDate,
    compareDate,
    compareLabel,
    targetAmount,
    compareAmount,
    changeRate,
    bestProduct: best || null,
    worstProduct: worst || null,
    weather,
    briefing: lines,
  };
}

export async function listCoreStoreNames(): Promise<string[]> {
  const rows = await loadDailyFlatRows();
  const names = new Set<string>();
  for (const r of rows) {
    if (isCoreOfflineSalesStore(r.storeName)) names.add(r.storeName);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, "ko"));
}

function getMondayOf(dateKey: string) {
  const d = new Date(`${dateKey}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return ymd(d);
}

function getMonthRange(dateKey: string) {
  const d = new Date(`${dateKey}T00:00:00`);
  const start = ymd(new Date(d.getFullYear(), d.getMonth(), 1));
  const end = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  return { start, end };
}

function daysBetweenInclusive(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000) + 1;
}

// MARK 6.24: 매장별 탭 카드 — 주간/월간 누계·예상달성, 전사 vs 점포 TOP10, 재고/RT, 진행 이벤트, 최근추이.
export async function buildStoreCards(storeName: string, dateOverride?: string) {
  const targetDate = dateOverride || yesterdayDateKey();
  const allRows = await loadDailyFlatRows();
  const storeRows = filterByStore(allRows, storeName);
  const companyRows = filterByStore(allRows, undefined);

  // ---- STEP1 이번주 누계/예상달성 ----
  const weekStart = getMondayOf(targetDate);
  const weekEnd = addDays(weekStart, 6);
  const weekElapsedDays = Math.min(7, daysBetweenInclusive(weekStart, targetDate));
  const weekCumulative = storeRows.filter((r) => r.date >= weekStart && r.date <= targetDate).reduce((s, r) => s + Number(r.amount || 0), 0);
  const weekProjected = weekElapsedDays > 0 ? (weekCumulative / weekElapsedDays) * 7 : 0;

  let weekTarget = 0;
  try {
    const { getSavedWeeklyTarget } = await import("@/lib/weeklyTarget");
    const saved = await getSavedWeeklyTarget(weekStart);
    weekTarget = saved?.byStore?.get(storeName) || 0;
  } catch {
    weekTarget = 0;
  }
  const weekProjectedRate = weekTarget ? (weekProjected / weekTarget) * 100 : 0;

  // ---- STEP2 이번달 누계/예상달성 ----
  const { start: monthStart, end: monthEnd } = getMonthRange(targetDate);
  const monthElapsedDays = Math.min(daysBetweenInclusive(monthStart, monthEnd), daysBetweenInclusive(monthStart, targetDate));
  const monthTotalDays = daysBetweenInclusive(monthStart, monthEnd);
  const monthCumulative = storeRows.filter((r) => r.date >= monthStart && r.date <= targetDate).reduce((s, r) => s + Number(r.amount || 0), 0);
  const monthProjected = monthElapsedDays > 0 ? (monthCumulative / monthElapsedDays) * monthTotalDays : 0;
  // 월 목표는 별도 저장본이 없어서, 주간목표 × (이번달 일수/7)로 추정합니다(추정치임을 명시).
  const monthTargetEstimate = weekTarget ? weekTarget * (monthTotalDays / 7) : 0;
  const monthProjectedRate = monthTargetEstimate ? (monthProjected / monthTargetEstimate) * 100 : 0;

  // ---- STEP3 전사 TOP10 vs 점포 TOP10 ----
  function top10ForDate(rows: FlatRow[]) {
    const byStyle = new Map<string, { productName: string; amount: number }>();
    for (const r of rows) {
      if (r.date !== targetDate) continue;
      if (!byStyle.has(r.styleCode)) byStyle.set(r.styleCode, { productName: r.productName, amount: 0 });
      byStyle.get(r.styleCode)!.amount += Number(r.amount || 0);
    }
    return Array.from(byStyle.entries())
      .map(([styleCode, v]) => ({ styleCode, productName: v.productName, amount: v.amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }
  const companyTop10 = top10ForDate(companyRows);
  const storeTop10 = top10ForDate(storeRows);
  const storeRankMap = new Map(storeTop10.map((p, i) => [p.styleCode, i + 1]));
  const top10Comparison = companyTop10.map((p, i) => {
    const storeRank = storeRankMap.get(p.styleCode) || null;
    return { styleCode: p.styleCode, productName: p.productName, companyRank: i + 1, storeRank, diff: storeRank ? i + 1 - storeRank : null };
  });

  // ---- STEP4 재고확인 AI 제안: 전사에서 잘 팔리는데 이 매장에서 유독 안 팔리는 상품 ----
  const companyAmountByStyle = new Map<string, number>();
  for (const p of companyTop10) companyAmountByStyle.set(p.styleCode, p.amount);
  const storeAmountByStyle = new Map<string, number>();
  for (const p of storeTop10) storeAmountByStyle.set(p.styleCode, p.amount);
  const storeStockByStyle = new Map<string, number>();
  for (const r of storeRows) {
    if (r.date === targetDate) storeStockByStyle.set(r.styleCode, Number(r.stock || 0));
  }

  const stockInsights = companyTop10
    .filter((p) => !storeAmountByStyle.has(p.styleCode) || (storeAmountByStyle.get(p.styleCode) || 0) === 0)
    .slice(0, 5)
    .map((p) => {
      const stock = storeStockByStyle.get(p.styleCode);
      const hasStockInfo = stock !== undefined;
      const isStockout = hasStockInfo && stock === 0;
      return {
        styleCode: p.styleCode,
        productName: p.productName,
        companyAmount: p.amount,
        storeStock: hasStockInfo ? stock : null,
        type: isStockout ? "stockout" : hasStockInfo ? "slow" : "unknown",
        suggestion: isStockout
          ? "재고가 없어서 못 팔고 있어요(결품). 재입고/RT 이동을 검토해보세요."
          : hasStockInfo
          ? `재고는 ${stock}개 있는데 안 팔리고 있어요. 진열 위치나 프로모션을 점검해보세요.`
          : "이 매장에서 취급 이력 자체가 확인되지 않아요. 입고 여부를 확인해보세요.",
      };
    });

  // ---- STEP5 재고/RT 현황 ----
  const totalStock = Array.from(
    storeRows.filter((r) => r.date === targetDate).reduce((map, r) => {
      map.set(r.styleCode, Number(r.stock || 0));
      return map;
    }, new Map<string, number>()).values()
  ).reduce((s, v) => s + v, 0);

  let rtIn = 0;
  let rtOut = 0;
  try {
    const { getHistorySheetId: getHId, getSheetValuesById: getVals } = await import("@/lib/googleSheets");
    const dbId = getHId();
    const rtRows = await getVals(dbId, "RT_Result", "A:H").catch(() => []);
    const cutoff = addDays(targetDate, -30);
    for (const r of (rtRows || []).slice(1)) {
      const fromStore = String(r?.[0] ?? "").trim();
      const toStore = String(r?.[1] ?? "").trim();
      const qty = Number(r?.[5] || 0);
      const proposedDate = String(r?.[6] ?? "").slice(0, 10);
      if (!proposedDate || proposedDate < cutoff || proposedDate > targetDate) continue;
      if (normalizeStoreKey(toStore) === normalizeStoreKey(storeName)) rtIn += qty;
      if (normalizeStoreKey(fromStore) === normalizeStoreKey(storeName)) rtOut += qty;
    }
  } catch {
    // RT_Result 조회 실패는 카드 전체를 막지 않습니다.
  }

  // ---- STEP6 날씨 ----
  const weather = await getWeatherForStoreOnDate(storeName, targetDate).catch(() => null);

  // ---- STEP7 진행중 이벤트 스페셜오퍼위크 ----
  let activeEvents: any[] = [];
  try {
    const { buildSpecialOfferEvents } = await import("@/lib/specialOfferWeek");
    const flatForEvents = allRows.map((r) => ({ date: r.date, storeName: r.storeName, amount: r.amount }));
    const { events } = await buildSpecialOfferEvents(flatForEvents);
    activeEvents = events.filter(
      (e: any) => normalizeStoreKey(e.storeName) === normalizeStoreKey(storeName) && e.startDate <= targetDate && e.endDate >= targetDate
    );
  } catch {
    activeEvents = [];
  }

  // ---- STEP8 최근 14일 매출 추이 ----
  const trendStart = addDays(targetDate, -13);
  const byDate = new Map<string, number>();
  for (const r of storeRows) {
    if (r.date < trendStart || r.date > targetDate) continue;
    byDate.set(r.date, (byDate.get(r.date) || 0) + Number(r.amount || 0));
  }
  const trend: { date: string; amount: number }[] = [];
  for (let d = trendStart; d <= targetDate; d = addDays(d, 1)) {
    trend.push({ date: d, amount: byDate.get(d) || 0 });
  }

  return {
    storeName,
    targetDate,
    week: { start: weekStart, end: weekEnd, elapsedDays: weekElapsedDays, cumulative: weekCumulative, target: weekTarget, projected: weekProjected, projectedRate: weekProjectedRate },
    month: { start: monthStart, end: monthEnd, elapsedDays: monthElapsedDays, totalDays: monthTotalDays, cumulative: monthCumulative, targetEstimate: monthTargetEstimate, projected: monthProjected, projectedRate: monthProjectedRate },
    top10Comparison,
    stockInsights,
    inventory: { totalStock, rtIn, rtOut },
    weather,
    activeEvents,
    trend,
  };
}
