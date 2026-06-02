import data from "./mark-data.json";

export const markData = data as any;

export function isShopInShop(storeName: string) {
  return String(storeName || "").startsWith("오프라인_");
}

export function formatWon(value: number) {
  return `${Math.round(value || 0).toLocaleString("ko-KR")}원`;
}

export function fmtNum(value: number) {
  return Math.round(value || 0).toLocaleString("ko-KR");
}

export function pct(value: number) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

export function safeRate(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export function splitStores(rows: any[]) {
  return {
    core: rows.filter((r) => !isShopInShop(r.storeName)),
    shopInShop: rows.filter((r) => isShopInShop(r.storeName)),
  };
}

export function mergeRows(currentRows: any[], compareRows: any[], prevYearRows: any[] = []) {
  const compareMap = new Map(compareRows.map((r) => [r.storeName, r]));
  const yearMap = new Map(prevYearRows.map((r) => [r.storeName, r]));
  return currentRows.map((r) => {
    const prev = compareMap.get(r.storeName) || {};
    const year = yearMap.get(r.storeName) || {};
    return {
      ...r,
      compareDaySales: Number(prev.daySales || 0),
      compareWeekSales: Number(prev.weekSales || 0),
      compareMonthSales: Number(prev.monthSales || 0),
      prevYearMonthSales: Number(year.monthSales || 0),
      dayChangeRate: safeRate(Number(r.daySales || 0), Number(prev.daySales || 0)),
      weekChangeRate: safeRate(Number(r.weekSales || 0), Number(prev.weekSales || 0)),
      monthChangeRate: safeRate(Number(r.monthSales || 0), Number(prev.monthSales || 0)),
      yearMonthChangeRate: safeRate(Number(r.monthSales || 0), Number(year.monthSales || 0)),
    };
  });
}

export function totals(rows: any[]) {
  const dayTarget = rows.reduce((s, r) => s + Number(r.dayTarget || 0), 0);
  const daySales = rows.reduce((s, r) => s + Number(r.daySales || 0), 0);
  const compareDaySales = rows.reduce((s, r) => s + Number(r.compareDaySales || 0), 0);
  const weekTarget = rows.reduce((s, r) => s + Number(r.weekTarget || 0), 0);
  const weekSales = rows.reduce((s, r) => s + Number(r.weekSales || 0), 0);
  const compareWeekSales = rows.reduce((s, r) => s + Number(r.compareWeekSales || 0), 0);
  const monthTarget = rows.reduce((s, r) => s + Number(r.monthTarget || 0), 0);
  const monthSales = rows.reduce((s, r) => s + Number(r.monthSales || 0), 0);
  const compareMonthSales = rows.reduce((s, r) => s + Number(r.compareMonthSales || 0), 0);
  const prevYearMonthSales = rows.reduce((s, r) => s + Number(r.prevYearMonthSales || 0), 0);
  return {
    dayTarget,
    daySales,
    dayRate: dayTarget ? (daySales / dayTarget) * 100 : 0,
    dayChange: safeRate(daySales, compareDaySales),
    weekTarget,
    weekSales,
    weekRate: weekTarget ? (weekSales / weekTarget) * 100 : 0,
    weekChange: safeRate(weekSales, compareWeekSales),
    monthTarget,
    monthSales,
    monthRate: monthTarget ? (monthSales / monthTarget) * 100 : 0,
    monthChange: safeRate(monthSales, compareMonthSales),
    yearMonthChange: safeRate(monthSales, prevYearMonthSales),
  };
}

export function positiveStores(rows: any[], field: "weekSales" | "daySales" = "weekSales") {
  const changeField = field === "daySales" ? "dayChangeRate" : "weekChangeRate";
  const rateField = field === "daySales" ? "dayRate" : "weekRate";
  return [...rows]
    .filter((r) => Number(r[field] || 0) > 0)
    .sort((a, b) => (Number(b[changeField] || 0) + Number(b[rateField] || 0) * 0.2) - (Number(a[changeField] || 0) + Number(a[rateField] || 0) * 0.2))
    .slice(0, 3);
}

export function weakStores(rows: any[], field: "weekSales" | "daySales" = "weekSales") {
  const changeField = field === "daySales" ? "dayChangeRate" : "weekChangeRate";
  const rateField = field === "daySales" ? "dayRate" : "weekRate";
  return [...rows]
    .filter((r) => Number(r[field] || 0) > 0 || Number(field === "daySales" ? r.compareDaySales : r.compareWeekSales || 0) > 0)
    .sort((a, b) => (Number(a[changeField] || 0) + Number(a[rateField] || 0) * 0.2) - (Number(b[changeField] || 0) + Number(b[rateField] || 0) * 0.2))
    .slice(0, 3);
}

export function salesRankAll(rows: any[], field: string) {
  return [...rows]
    .filter((r) => Number(r[field] || 0) > 0)
    .sort((a, b) => Number(b[field] || 0) - Number(a[field] || 0));
}

export function shopPositive(rows: any[]) {
  return positiveStores(rows, "weekSales");
}

export function shopWeak(rows: any[]) {
  return weakStores(rows, "weekSales");
}

export function shopInventoryNote(r: any) {
  if (Number(r.weekRate || 0) >= 90 || Number(r.weekChangeRate || 0) >= 25) return "판매 호조 · 재고 확인 후 추가 투입 검토";
  if (Number(r.weekRate || 0) < 60 || Number(r.weekChangeRate || 0) < -20) return "판매 둔화 · 재고 순환/상품 교체 검토";
  return "정상 운영";
}

export function weeklyOneLine(coreRows: any[]) {
  const t = totals(coreRows);
  const good = positiveStores(coreRows)[0];
  const bad = weakStores(coreRows)[0];
  return `이번 주 핵심 매장 매출은 전주 대비 ${t.weekChange >= 0 ? "+" : ""}${pct(t.weekChange)} 흐름이며, ${good?.storeName || "상위 매장"}이 성장을 견인하고 ${bad?.storeName || "부진 매장"}은 추가 점검이 필요합니다.`;
}

export function monthlyReview(coreRows: any[]) {
  const t = totals(coreRows);
  const good = positiveStores(coreRows)[0];
  const bad = weakStores(coreRows)[0];
  return [
    `위탁/샵인샵을 제외한 핵심 매장의 월 누적 매출은 ${formatWon(t.monthSales)}이며, 월 목표 대비 ${pct(t.monthRate)}입니다.`,
    `전월 대비 ${pct(t.monthChange)}, 전년동월 대비 ${pct(t.yearMonthChange)} 흐름입니다.`,
    good ? `${good.storeName}은 전주 대비 신장과 달성률 측면에서 호조 매장으로 분류됩니다.` : "호조 매장 데이터가 충분하지 않습니다.",
    bad ? `${bad.storeName}은 전주 대비 변동폭과 달성률 기준에서 우선 관리가 필요합니다.` : "부진 매장 데이터가 충분하지 않습니다.",
  ];
}
