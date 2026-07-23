import { getHistorySheetId, getSheetValuesById } from "@/lib/googleSheets";
import { expandAnyDailyHistoryRows } from "@/lib/dailySales";
import { isCoreOfflineSalesStore, normalizeStoreKey, loadDailyStoreSalesFromMarkDb } from "@/lib/dataBuilder";
import { getWeatherForStoreOnDate } from "@/lib/storeRegion";
import { mergeDateTotals } from "@/lib/storeDailyAmount";

// MARK 6.27: "스타일별 채널별 입고/판매/재고현황"(→Daily_Sales_History, qty×Style_Price_History 단가로
// 금액을 역산) 은 수량은 정확하지만 금액에 오차가 있을 수 있습니다. 그래서 "매출 총액/누계/추이"처럼
// 순수 금액이 중요한 계산은, 이미 실적으로 정확히 기록되는 "일간매출(26년)" 시트를 우선 사용합니다.
// 품번 단위 TOP10/재고 확인처럼 스타일 상세가 필요한 계산만 계속 Daily_Sales_History를 씁니다.
type StoreAmountRow = { date: string; storeName: string; amount: number };
let cachedStoreAmountRows: StoreAmountRow[] | null = null;
async function loadStoreAmountRows(): Promise<StoreAmountRow[]> {
  if (cachedStoreAmountRows) return cachedStoreAmountRows;
  try {
    const { rows } = await loadDailyStoreSalesFromMarkDb();
    cachedStoreAmountRows = (rows || []).map((r: any) => ({ date: r.date, storeName: r.storeName, amount: Number(r.amount || 0) }));
  } catch {
    cachedStoreAmountRows = [];
  }
  return cachedStoreAmountRows;
}

function filterAmountRowsByStore(rows: StoreAmountRow[], storeName?: string) {
  if (!storeName) return rows.filter((r) => isCoreOfflineSalesStore(r.storeName));
  const key = normalizeStoreKey(storeName);
  return rows.filter((r) => normalizeStoreKey(r.storeName) === key);
}

function sumAmountRows(rows: StoreAmountRow[], dateKey: string) {
  return rows.filter((r) => r.date === dateKey).reduce((s, r) => s + Number(r.amount || 0), 0);
}

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
// (실제 로직은 lib/storeDailyAmount.ts에 있고, 일간 탭 쪽(dataBuilder.ts)과 공유합니다.)
export { getComparisonDateForDaily } from "@/lib/storeDailyAmount";

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

  // MARK 6.40: 일간 탭과 매장 탭이 같은 병합 로직(lib/storeDailyAmount.ts)을 공유합니다.
  const amountRows = await loadStoreAmountRows();
  const scopedAmountRows = filterAmountRowsByStore(amountRows, storeName);
  const byDateAmount = mergeDateTotals(scoped, scopedAmountRows);

  function amountForDate(dateKey: string) {
    return byDateAmount.get(dateKey) || 0;
  }

  const targetAmount = amountForDate(targetDate);
  const compareAmount = amountForDate(compareDate);
  const changeRate = compareAmount ? ((targetAmount - compareAmount) / compareAmount) * 100 : targetAmount ? 100 : 0;

  const { best, worst } = topProductMovers(scoped, targetDate, compareDate);

  const lines: string[] = [];
  const scopeLabel = storeName ? storeName : "전사";
  lines.push(
    `${scopeLabel} ${targetDate} 매출은 ${Math.round(targetAmount).toLocaleString("ko-KR")}원으로, ${compareLabel}(${compareDate}) 대비 ${changeRate >= 0 ? "+" : ""}${changeRate.toFixed(1)}%예요.`
  );

  // MARK 6.26: 연속 추세(모멘텀) — 최근 며칠간 매일 전일 대비 같은 방향(증가/감소)으로 움직였는지 확인.
  {
    let streak = 0;
    let direction: "up" | "down" | null = null;
    let cursor = targetDate;
    for (let i = 0; i < 6; i++) {
      const prevDate = addDays(cursor, -1);
      const cur = amountForDate(cursor);
      const prev = amountForDate(prevDate);
      if (!prev) break;
      const dir: "up" | "down" = cur >= prev ? "up" : "down";
      if (direction === null) direction = dir;
      if (dir !== direction) break;
      streak++;
      cursor = prevDate;
    }
    if (streak >= 2 && direction) {
      lines.push(`최근 ${streak}일 연속 ${direction === "up" ? "증가" : "감소"} 중이에요.`);
    }
  }

  if (best && best.changeRate > 0) {
    lines.push(`호조상품 ${best.styleCode}(${best.productName})가 ${compareLabel} 대비 +${best.changeRate.toFixed(0)}%로 늘었어요.`);
  }
  if (worst && worst.changeRate < 0) {
    lines.push(`${worst.styleCode}(${worst.productName})는 ${compareLabel} 대비 ${worst.changeRate.toFixed(0)}%로 줄었어요.`);
  }
  if (lines.length === 1) lines.push("아직 상품별로 비교할 만한 전일 실적이 충분하지 않아요.");

  let weather: any = null;
  if (storeName) {
    try {
      const cards = await buildStoreCards(storeName, targetDate);
      weather = cards.weather;

      // 목표 페이스 코멘트
      if (cards.week.target > 0) {
        lines.push(`이 페이스면 이번 주 목표 대비 ${cards.week.projectedRate.toFixed(0)}% 달성이 예상돼요.`);
      }

      // 이벤트 효과 코멘트: 진행중 이벤트가 있으면 시작 전 대비 효과 비교
      if (cards.activeEvents.length) {
        const ev = cards.activeEvents[0];
        const eventDays: string[] = [];
        for (let d = ev.startDate; d <= targetDate && d <= ev.endDate; d = addDays(d, 1)) eventDays.push(d);
        const eventAvg = eventDays.length ? eventDays.reduce((s, d) => s + amountForDate(d), 0) / eventDays.length : 0;
        const beforeDays: string[] = [];
        for (let i = 1; i <= eventDays.length; i++) beforeDays.push(addDays(ev.startDate, -i));
        const beforeAvg = beforeDays.length ? beforeDays.reduce((s, d) => s + amountForDate(d), 0) / beforeDays.length : 0;
        if (beforeAvg > 0) {
          const eventChangeRate = ((eventAvg - beforeAvg) / beforeAvg) * 100;
          lines.push(`행사(${ev.content || ev.title}) 시작 전 대비 일평균 매출이 ${eventChangeRate >= 0 ? "+" : ""}${eventChangeRate.toFixed(0)}%${eventChangeRate >= 0 ? " 늘었어요." : "예요."}`);
        }
      }

      // 재고 이슈 요약
      const urgentCount = cards.stockInsights.length;
      if (urgentCount > 0) {
        lines.push(`발주 필요 상품이 ${urgentCount}개 있어요.`);
      }
    } catch {
      weather = null;
    }
    if (weather) {
      lines.push(`${storeName}의 오늘 날씨는 ${weather.weather}(최고 ${weather.maxTemp}°/최저 ${weather.minTemp}°, 강수확률 ${weather.rainChance}%)이었어요.`);
    }
  }

  // 마무리 총평(어제 총평)
  {
    let tone = "무난한 하루였어요.";
    if (changeRate >= 20) tone = "아주 좋은 하루였어요.";
    else if (changeRate >= 5) tone = "좋은 흐름의 하루였어요.";
    else if (changeRate <= -20) tone = "많이 아쉬운 하루였어요.";
    else if (changeRate <= -5) tone = "다소 부진한 하루였어요.";
    lines.push(`종합적으로 ${targetDate}은 ${tone}`);
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

  // MARK 6.38: Daily_Sales_History가 이제 "(금액)" 시트의 실제 판매금액을 담고 있어서
  // 오차가 없습니다. Daily_Sales_History를 우선 쓰고, 그 날짜 데이터가 없을 때만
  // "일간매출(26년)"(참고용, 시차 있을 수 있음)으로 보완합니다.
  const amountRows = await loadStoreAmountRows();
  const scopedAmountRows = filterAmountRowsByStore(amountRows, storeName);
  const companyAmountRows = filterAmountRowsByStore(amountRows, undefined);

  // MARK 6.26: 이벤트(스페셜오퍼위크) 기간을 먼저 구해둡니다 — 주간 예측 계산에서
  // 이벤트 기간의 매출을 요일가중치 기준값 계산에서 빼기 위해 필요합니다.
  let storeEvents: any[] = [];
  try {
    const { buildSpecialOfferEvents } = await import("@/lib/specialOfferWeek");
    const flatForEvents = allRows.map((r) => ({ date: r.date, storeName: r.storeName, amount: r.amount }));
    const { events } = await buildSpecialOfferEvents(flatForEvents);
    storeEvents = events.filter((e: any) => normalizeStoreKey(e.storeName) === normalizeStoreKey(storeName));
  } catch {
    storeEvents = [];
  }
  const isEventDate = (dateKey: string) => storeEvents.some((e: any) => dateKey >= e.startDate && dateKey <= e.endDate);

  // 요일별 가중치: 평일(월~목)=1.0, 금=1.4, 토/일=1.7 (주말이 평일보다 매출이 더 나오는 걸 반영)
  const WEEKDAY_WEIGHT: Record<number, number> = { 0: 1.7, 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0, 5: 1.4, 6: 1.7 };

  // ---- STEP1 이번주 누계/예상달성 (요일가중치 + 이벤트기간 제외 반영) ----
  const weekStart = getMondayOf(targetDate);
  const weekEnd = addDays(weekStart, 6);
  const weekDates: string[] = [];
  for (let d = weekStart; d <= weekEnd; d = addDays(d, 1)) weekDates.push(d);

  const weekAmountByDate = mergeDateTotals(
    storeRows.filter((r) => r.date >= weekStart && r.date <= weekEnd),
    scopedAmountRows.filter((r) => r.date >= weekStart && r.date <= weekEnd)
  );

  const pastDates = weekDates.filter((d) => d <= targetDate);
  const futureDates = weekDates.filter((d) => d > targetDate);
  const weekElapsedDays = pastDates.length;
  const weekCumulative = pastDates.reduce((s, d) => s + (weekAmountByDate.get(d) || 0), 0);

  // 가중치당 기준매출: 이벤트 기간이 아닌 "이미 지난" 날짜만 사용합니다(이벤트 매출이 평균을 뻥튀기하는 걸 방지).
  const nonEventPast = pastDates.filter((d) => !isEventDate(d));
  const nonEventPastAmount = nonEventPast.reduce((s, d) => s + (weekAmountByDate.get(d) || 0), 0);
  const nonEventPastWeight = nonEventPast.reduce((s, d) => s + WEEKDAY_WEIGHT[dayOfWeek(d)], 0);
  const perWeightAmount = nonEventPastWeight > 0 ? nonEventPastAmount / nonEventPastWeight : 0;

  // 남은 날짜 예측: 이벤트 기간이면 가중치 없이(1.0) 그냥 기준매출을 적용, 아니면 요일가중치 적용.
  let futureEstimate = 0;
  for (const d of futureDates) {
    futureEstimate += isEventDate(d) ? perWeightAmount : perWeightAmount * WEEKDAY_WEIGHT[dayOfWeek(d)];
  }
  const weekProjected = weekCumulative + futureEstimate;

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
  const monthAmountByDate = mergeDateTotals(
    storeRows.filter((r) => r.date >= monthStart && r.date <= targetDate),
    scopedAmountRows.filter((r) => r.date >= monthStart && r.date <= targetDate)
  );
  const monthCumulative = Array.from(monthAmountByDate.values()).reduce((s, v) => s + v, 0);
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
    const storeMatch = storeTop10.find((s) => s.styleCode === p.styleCode);
    return {
      styleCode: p.styleCode,
      productName: p.productName,
      companyRank: i + 1,
      companyAmount: p.amount,
      storeRank,
      storeAmount: storeMatch ? storeMatch.amount : 0,
      diff: storeRank ? i + 1 - storeRank : null,
    };
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
          ? "재고가 없어서 못 팔고 있어요(결품). 발주/RT 이동을 검토해보세요."
          : hasStockInfo
          ? `재고는 ${stock}개 있는데 안 팔리고 있어요. 진열 위치나 프로모션을 점검해보세요.`
          : "이 매장에서 취급 이력 자체가 확인되지 않아요. 입고 여부를 확인해보세요.",
      };
    })
    // MARK 6.26: 재고 10개 미만(0 포함)은 매장에서 판매하기 어려워 빼놓은 경우가 많아 제외합니다.
    .filter((s) => s.storeStock === null || s.storeStock >= 10)
    .slice(0, 5);

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
  const activeEvents = storeEvents.filter((e: any) => e.startDate <= targetDate && e.endDate >= targetDate);

  // ---- STEP8 최근 14일 매출 추이 (전사 비교 포함, Daily_Sales_History 우선) ----
  const trendStart = addDays(targetDate, -13);
  const inTrendRange = (r: { date: string }) => r.date >= trendStart && r.date <= targetDate;
  const byDate = mergeDateTotals(storeRows.filter(inTrendRange), scopedAmountRows.filter(inTrendRange));
  const companyByDate = mergeDateTotals(companyRows.filter(inTrendRange), companyAmountRows.filter(inTrendRange));
  const trend: { date: string; amount: number; companyAmount: number }[] = [];
  for (let d = trendStart; d <= targetDate; d = addDays(d, 1)) {
    trend.push({ date: d, amount: byDate.get(d) || 0, companyAmount: companyByDate.get(d) || 0 });
  }

  return {
    storeName,
    targetDate,
    amountSource: "Daily_Sales_History(실제금액) 우선, 일간매출(26년) 보완",
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
