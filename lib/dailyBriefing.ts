import { getHistorySheetId, getSheetValuesById } from "@/lib/googleSheets";
import { expandAnyDailyHistoryRows } from "@/lib/dailySales";
import { isCoreOfflineSalesStore, normalizeStoreKey } from "@/lib/dataBuilder";

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

function todayDateKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

async function loadDailyFlatRows() {
  const historyId = getHistorySheetId();
  const raw = await getSheetValuesById(historyId, "Daily_Sales_History", "A:ZZ").catch(() => []);
  return expandAnyDailyHistoryRows(raw || []);
}

type FlatRow = { date: string; storeName: string; styleCode: string; productName: string; qty: number; amount: number };

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
  const targetDate = dateOverride || todayDateKey();
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
