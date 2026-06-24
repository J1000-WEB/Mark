import data from "./mark-data.json";

export const markData = data as any;

export function isOnlineChannel(storeName: string) {
  const s = String(storeName || "").trim().toLowerCase();
  return (
    s.startsWith("온라인") ||
    s.includes("무신사") ||
    s.includes("29cm") ||
    s.includes("ssf") ||
    s.includes("네이버") ||
    s.includes("지그재그") ||
    s.includes("w컨셉") ||
    s.includes("wconcept") ||
    s.includes("eql") ||
    s.includes("한섬")
  );
}

export function isShopInShop(storeName: string) {
  // MARK 4.90: 매출대시보드는 오프라인 운영 기준입니다.
  // 온라인 채널은 매출/매장 순위에서 제외하고, 재고CTRL의 온라인 이관 판단에서만 사용합니다.
  return isOnlineChannel(storeName);
}

export function isOfflineDashboardStore(storeName: string) {
  const s = String(storeName || "").trim();
  if (!s || s === "합계" || s === "채널명") return false;
  return !isOnlineChannel(s);
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

    // Mark4.8 weekly display fix:
    // 주실적 값이 비어있는 목표 시트에서는 월누계 차액으로 주간 매출을 계산합니다.
    // current week = current month cumulative - previous month cumulative
    const rawWeekSales = Number(r.weekSales || 0);
    const rawPrevWeekSales = Number(prev.weekSales || 0);
    const currentMonthSales = Number(r.monthSales || 0);
    const prevMonthSales = Number(prev.monthSales || 0);

    const weekSales =
      !rawWeekSales && currentMonthSales && prevMonthSales && currentMonthSales >= prevMonthSales
        ? currentMonthSales - prevMonthSales
        : rawWeekSales;

    const compareWeekSales = rawPrevWeekSales || prevMonthSales;

    return {
      ...r,
      weekSales,
      compareDaySales: Number(prev.daySales || 0),
      compareWeekSales,
      compareMonthSales: prevMonthSales,
      prevYearMonthSales: Number(year.monthSales || 0),
      dayChangeRate: rate(Number(r.daySales || 0), Number(prev.daySales || 0)),
      weekChangeRate: rate(weekSales, compareWeekSales),
      monthChangeRate: rate(currentMonthSales, prevMonthSales),
      yearMonthChangeRate: rate(currentMonthSales, Number(year.monthSales || 0)),
    };
  });
}

export function splitStores(rows: any[]) {
  return {
    core: rows.filter((r) => isOfflineDashboardStore(r.storeName)),
    shop: rows.filter((r) => !isOfflineDashboardStore(r.storeName)),
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
