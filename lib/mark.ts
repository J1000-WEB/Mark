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

export function attentionStores(rows: any[]) {
  return [...rows]
    .filter((r) => Number(r.weekSales || 0) > 0 || Number(r.compareWeekSales || 0) > 0)
    .map((r) => ({
      ...r,
      riskScore:
        Math.max(0, 85 - Number(r.weekRate || 0)) +
        Math.max(0, -Number(r.weekChangeRate || 0)) * 1.2 +
        Math.abs(Number(r.weekChangeRate || 0)) * 0.15,
    }))
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 8);
}

export function salesRank(rows: any[], field: string) {
  return [...rows]
    .filter((r) => Number(r[field] || 0) > 0)
    .sort((a, b) => Number(b[field] || 0) - Number(a[field] || 0))
    .slice(0, 10);
}

export function shopSummary(rows: any[]) {
  return [...rows]
    .map((r) => ({
      ...r,
      inventoryNote:
        Number(r.weekRate || 0) >= 90
          ? "재고 추가 투입 검토"
          : Number(r.weekRate || 0) < 60
            ? "재고 순환/상품 교체 검토"
            : "정상 운영",
    }))
    .sort((a, b) => Number(b.weekSales || 0) - Number(a.weekSales || 0));
}

export function monthlyReview(coreRows: any[]) {
  const t = totals(coreRows);
  const worst = attentionStores(coreRows)[0];
  return [
    `위탁/샵인샵을 제외한 핵심 매장의 월 누적 매출은 ${formatWon(t.monthSales)}이며, 월 목표 대비 ${pct(t.monthRate)}입니다.`,
    `전월 대비 ${pct(t.monthChange)}, 전년동월 대비 ${pct(t.yearMonthChange)} 흐름입니다.`,
    worst ? `${worst.storeName}은 주간 달성률과 비교기간 대비 변동폭 기준으로 우선 점검이 필요한 매장입니다.` : "관리 필요 매장 데이터가 충분하지 않습니다.",
  ];
}
