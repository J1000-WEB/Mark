import data from "./mark-data.json";

export const markData = data as any;

export const SHOP_IN_SHOP_STORES = [
  "오프라인_롯데면세점",
  "오프라인_무신사(강남)",
  "오프라인_무신사(대구)",
  "오프라인_무신사(백&캡클럽 서울숲)",
  "오프라인_무신사(성수)",
  "오프라인_무신사(수원)",
  "오프라인_무신사(은평)",
  "오프라인_무신사(홍대)",
  "오프라인_한컬렉션",
];

export function formatWon(value: number) {
  return `${Math.round(value || 0).toLocaleString("ko-KR")}원`;
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
    core: rows.filter((r) => !SHOP_IN_SHOP_STORES.includes(r.storeName)),
    shopInShop: rows.filter((r) => SHOP_IN_SHOP_STORES.includes(r.storeName)),
  };
}

export function mergeCurrentCompare(currentRows: any[], compareRows: any[]) {
  const compareMap = new Map(compareRows.map((r) => [r.storeName, r]));
  return currentRows.map((r) => {
    const prev = compareMap.get(r.storeName) || {};
    return {
      ...r,
      compareWeekSales: Number(prev.weekSales || 0),
      compareDailySales: Number(prev.dailySales || 0),
      compareMonthSales: Number(prev.monthSales || 0),
      weekChangeRate: safeRate(Number(r.weekSales || 0), Number(prev.weekSales || 0)),
      dailyChangeRate: safeRate(Number(r.dailySales || 0), Number(prev.dailySales || 0)),
      monthChangeRate: safeRate(Number(r.monthSales || 0), Number(prev.monthSales || 0)),
    };
  });
}

export function totalsFromRows(rows: any[]) {
  const weekSales = rows.reduce((s, r) => s + Number(r.weekSales || 0), 0);
  const weekTarget = rows.reduce((s, r) => s + Number(r.weekTarget || 0), 0);
  const compareWeekSales = rows.reduce((s, r) => s + Number(r.compareWeekSales || 0), 0);
  const dailySales = rows.reduce((s, r) => s + Number(r.dailySales || 0), 0);
  const dailyTarget = rows.reduce((s, r) => s + Number(r.dailyTarget || 0), 0);
  const compareDailySales = rows.reduce((s, r) => s + Number(r.compareDailySales || 0), 0);
  const monthSales = rows.reduce((s, r) => s + Number(r.monthSales || 0), 0);
  const monthTarget = rows.reduce((s, r) => s + Number(r.monthTarget || 0), 0);
  const compareMonthSales = rows.reduce((s, r) => s + Number(r.compareMonthSales || 0), 0);
  return {
    weekSales,
    weekTarget,
    weekRate: weekTarget ? (weekSales / weekTarget) * 100 : 0,
    weekChange: safeRate(weekSales, compareWeekSales),
    dailySales,
    dailyTarget,
    dailyRate: dailyTarget ? (dailySales / dailyTarget) * 100 : 0,
    dailyChange: safeRate(dailySales, compareDailySales),
    monthSales,
    monthTarget,
    monthRate: monthTarget ? (monthSales / monthTarget) * 100 : 0,
    monthChange: safeRate(monthSales, compareMonthSales),
  };
}

export function attentionStores(rows: any[]) {
  return [...rows]
    .map((r) => ({
      ...r,
      riskScore: Math.max(0, 90 - Number(r.weekRate || 0)) + Math.abs(Number(r.weekChangeRate || 0)),
    }))
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 8);
}

export function salesRank(rows: any[], field = "weekSales") {
  return [...rows].sort((a, b) => Number(b[field] || 0) - Number(a[field] || 0)).slice(0, 10);
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

export function monthlyReview(coreRows: any[], shopRows: any[]) {
  const t = totalsFromRows(coreRows);
  const shop = totalsFromRows(shopRows);
  const worst = attentionStores(coreRows)[0];
  return [
    `직영/백화점 월 누적 매출은 ${formatWon(t.monthSales)}이며, 월 목표 대비 ${pct(t.monthRate)} 수준입니다.`,
    `위탁/샵인샵 주간 매출은 ${formatWon(shop.weekSales)}로, 매출보다 재고 순환과 상품 투입 여부 중심의 관리가 필요합니다.`,
    worst ? `${worst.storeName}은 주간 달성률과 비교기간 대비 변동폭 기준으로 우선 점검이 필요한 매장입니다.` : "관리 필요 매장 데이터가 충분하지 않습니다.",
  ];
}
