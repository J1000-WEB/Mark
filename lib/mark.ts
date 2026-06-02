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

export function toNumber(value: any) {
  if (value === undefined || value === null) return 0;
  return Number(String(value).replace(/,/g, "").replace(/%/g, "").replace(/[^\d.-]/g, "").trim()) || 0;
}

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

export function findSheet(sheets: Record<string, any[][]>, names: string[]) {
  const keys = Object.keys(sheets);
  const key = keys.find((k) => names.some((n) => k.includes(n)));
  return key ? sheets[key] : [];
}

export function findHeaderRow(matrix: any[][], keywords: string[]) {
  return matrix.findIndex((row) => keywords.every((k) => row.map(String).some((v) => v.trim() === k || v.includes(k))));
}

export function rowToObjects(matrix: any[][], keywords: string[]) {
  const headerIndex = findHeaderRow(matrix, keywords);
  if (headerIndex < 0) return [];
  const headers = matrix[headerIndex].map((h) => String(h).trim());
  return matrix.slice(headerIndex + 1).map((row) => {
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => {
      if (!h) return;
      obj[h] = row[i];
    });
    return obj;
  });
}

function valueByCandidates(row: Record<string, any>, candidates: string[]) {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const exact = keys.find((k) => k === c);
    if (exact) return row[exact];
    const partial = keys.find((k) => k.includes(c));
    if (partial) return row[partial];
  }
  return "";
}

export type StoreRow = {
  storeName: string;
  target: number;
  currentSales: number;
  achievementRate: number;
  prevSales: number;
  prevRate: number;
  monthlyTarget: number;
  monthlySales: number;
  monthlyProgress: number;
};

export function parseLeaderBoard(sheets: Record<string, any[][]>): StoreRow[] {
  const matrix = findSheet(sheets, ["리더회의판", "점포별", "점포"]);
  const objects = rowToObjects(matrix, ["운영몰"]);
  return objects
    .map((row) => {
      const storeName = String(valueByCandidates(row, ["운영몰", "매장", "점포", "채널명"])).trim();
      return {
        storeName,
        target: toNumber(valueByCandidates(row, ["주간 목표", "금주목표", "목표"])),
        currentSales: toNumber(valueByCandidates(row, ["주간 실적", "금주실적", "실적"])),
        achievementRate: toNumber(valueByCandidates(row, ["달성률"])),
        prevSales: toNumber(valueByCandidates(row, ["전주"])),
        prevRate: toNumber(valueByCandidates(row, ["전주대비", "전주 대비"])),
        monthlyTarget: toNumber(valueByCandidates(row, ["월 누적 목표", "월목표"])),
        monthlySales: toNumber(valueByCandidates(row, ["월 누적 실적", "월실적", "누적 실적"])),
        monthlyProgress: toNumber(valueByCandidates(row, ["진척률", "월 달성률"])),
      };
    })
    .filter((r) => r.storeName && r.storeName !== "합계");
}

export function splitStores(rows: StoreRow[]) {
  const shopInShop = rows.filter((r) => SHOP_IN_SHOP_STORES.includes(r.storeName));
  const core = rows.filter((r) => !SHOP_IN_SHOP_STORES.includes(r.storeName));
  return { core, shopInShop };
}

export function totals(rows: StoreRow[]) {
  const weeklyTarget = rows.reduce((s, r) => s + r.target, 0);
  const weeklySales = rows.reduce((s, r) => s + r.currentSales, 0);
  const prevSales = rows.reduce((s, r) => s + r.prevSales, 0);
  const monthlyTarget = rows.reduce((s, r) => s + r.monthlyTarget, 0);
  const monthlySales = rows.reduce((s, r) => s + r.monthlySales, 0);
  return {
    weeklyTarget,
    weeklySales,
    prevSales,
    weeklyRate: weeklyTarget ? (weeklySales / weeklyTarget) * 100 : 0,
    weeklyChange: safeRate(weeklySales, prevSales),
    monthlyTarget,
    monthlySales,
    monthlyRate: monthlyTarget ? (monthlySales / monthlyTarget) * 100 : 0,
  };
}

export function attentionStores(rows: StoreRow[]) {
  return [...rows]
    .map((r) => ({
      ...r,
      changeRate: r.prevRate || safeRate(r.currentSales, r.prevSales),
      riskScore: Math.max(0, 90 - (r.achievementRate || 0)) + Math.abs(r.prevRate || safeRate(r.currentSales, r.prevSales)),
    }))
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 8);
}

export function shopInShopSummary(rows: StoreRow[]) {
  return [...rows]
    .map((r) => ({
      ...r,
      changeRate: r.prevRate || safeRate(r.currentSales, r.prevSales),
      inventoryNote:
        (r.achievementRate || 0) >= 90
          ? "재고 추가 투입 검토"
          : (r.achievementRate || 0) < 60
            ? "재고 순환/상품 교체 검토"
            : "정상 운영",
    }))
    .sort((a, b) => b.currentSales - a.currentSales);
}

export function detectPeriodLabel(type: "daily" | "weekly" | "monthly") {
  const now = new Date();
  if (type === "daily") {
    const today = new Date(now);
    const compare = new Date(now);
    compare.setDate(compare.getDate() - 7);
    return `분석일 ${fmtDate(today)} / 비교일 ${fmtDate(compare)} (전주 동요일)`;
  }
  if (type === "weekly") {
    const monday = getLastCompletedMonday(now);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const prevMonday = new Date(monday);
    prevMonday.setDate(monday.getDate() - 7);
    const prevSunday = new Date(sunday);
    prevSunday.setDate(sunday.getDate() - 7);
    return `분석기간 ${fmtDate(monday)} ~ ${fmtDate(sunday)} / 비교기간 ${fmtDate(prevMonday)} ~ ${fmtDate(prevSunday)}`;
  }
  const month = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastYear = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  return `분석월 ${month} / 비교월 ${prev.getFullYear()}.${String(prev.getMonth() + 1).padStart(2, "0")} / 전년동월 ${lastYear.getFullYear()}.${String(lastYear.getMonth() + 1).padStart(2, "0")}`;
}

function getLastCompletedMonday(date: Date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day - 6);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtDate(date: Date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

export function monthlyReview(rows: StoreRow[], shopRows: StoreRow[]) {
  const t = totals(rows);
  const shop = totals(shopRows);
  return [
    `월 누적 매출은 ${formatWon(t.monthlySales)}이며, 월 목표 대비 ${pct(t.monthlyRate)} 수준입니다.`,
    `샵인샵/위탁채널 매출은 ${formatWon(shop.weeklySales)}로 별도 재고 순환 관점의 관리가 필요합니다.`,
    `직영/백화점 채널은 달성률과 전주 대비 변동폭을 기준으로 관리 필요 매장을 우선 점검하는 것이 좋습니다.`,
  ];
}
