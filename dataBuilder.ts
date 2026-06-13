import data from "./mark-data.json";

export const markData = data as any;

export function isShopInShop(storeName: string) {
  return String(storeName || "").startsWith("오프라인_");
}

export function won(value: number) {
  return `${Math.round(value || 0).toLocaleString("ko-KR")}원`;
}

export function fmtNum(value: number) {
  return Math.round(value || 0).toLocaleString("ko-KR");
}

export function pct(value: number) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

export function rate(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export function mergeRows(currentRows: any[] = [], compareRows: any[] = [], yearRows: any[] = []) {
  const compareMap = new Map(compareRows.map((r: any) => [r.storeName, r]));
  const yearMap = new Map(yearRows.map((r: any) => [r.storeName, r]));
  return currentRows.map((r: any) => {
    const prev: any = compareMap.get(r.storeName) || {};
    const year: any = yearMap.get(r.storeName) || {};
    return {
      ...r,
      compareDaySales: Number(prev.daySales || 0),
      compareWeekSales: Number(prev.weekSales || 0),
      compareMonthSales: Number(prev.monthSales || 0),
      prevYearMonthSales: Number(year.monthSales || 0),
      dayChangeRate: rate(Number(r.daySales || 0), Number(prev.daySales || 0)),
      weekChangeRate: rate(Number(r.weekSales || 0), Number(prev.weekSales || 0)),
      monthChangeRate: rate(Number(r.monthSales || 0), Number(prev.monthSales || 0)),
      yearMonthChangeRate: rate(Number(r.monthSales || 0), Number(year.monthSales || 0)),
    };
  });
}

export function splitStores(rows: any[]) {
  return {
    core: rows.filter((r) => !isShopInShop(r.storeName)),
    shop: rows.filter((r) => isShopInShop(r.storeName)),
  };
}

export function totals(rows: any[]) {
  const sum = (field: string) => rows.reduce((s, r) => s + Number(r[field] || 0), 0);
  const dayTarget = sum("dayTarget");
  const daySales = sum("daySales");
  const compareDaySales = sum("compareDaySales");
  const weekTarget = sum("weekTarget");
  const weekSales = sum("weekSales");
  const compareWeekSales = sum("compareWeekSales");
  const monthTarget = sum("monthTarget");
  const monthSales = sum("monthSales");
  const compareMonthSales = sum("compareMonthSales");
  const prevYearMonthSales = sum("prevYearMonthSales");

  return {
    dayTarget,
    daySales,
    dayRate: dayTarget ? (daySales / dayTarget) * 100 : 0,
    dayChange: rate(daySales, compareDaySales),
    weekTarget,
    weekSales,
    weekRate: weekTarget ? (weekSales / weekTarget) * 100 : 0,
    weekChange: rate(weekSales, compareWeekSales),
    monthTarget,
    monthSales,
    monthRate: monthTarget ? (monthSales / monthTarget) * 100 : 0,
    monthChange: rate(monthSales, compareMonthSales),
    yearMonthChange: rate(monthSales, prevYearMonthSales),
  };
}

export function salesRank(rows: any[], field: string) {
  return [...rows].filter((r) => Number(r[field] || 0) > 0).sort((a, b) => Number(b[field] || 0) - Number(a[field] || 0));
}

export function goodWeekly(rows: any[]) {
  return [...rows].filter((r) => Number(r.weekSales || 0) > 0).sort((a, b) => Number(b.weekChangeRate || 0) - Number(a.weekChangeRate || 0)).slice(0, 3);
}

export function badWeekly(rows: any[]) {
  return [...rows].filter((r) => Number(r.weekSales || 0) > 0).sort((a, b) => Number(a.weekChangeRate || 0) - Number(b.weekChangeRate || 0)).slice(0, 3);
}

export function goodMonthly(rows: any[]) {
  return [...rows].filter((r) => Number(r.monthSales || 0) > 0).sort((a, b) => Number(b.monthChangeRate || 0) - Number(a.monthChangeRate || 0)).slice(0, 3);
}

export function badMonthly(rows: any[]) {
  return [...rows].filter((r) => Number(r.monthSales || 0) > 0).sort((a, b) => Number(a.monthChangeRate || 0) - Number(b.monthChangeRate || 0)).slice(0, 3);
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
