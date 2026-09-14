import { readDailyHistoryRowsForExactDates } from "./dailySales";
import { normalizeStoreKey } from "./dataBuilder";

// MARK 6.52: gi-board VMD export의 재고(gi-board 자체 스냅샷 기준)를 MARK의 Daily_Sales_History
// (우리 자체 재고)와 교차검증하기 위한 헬퍼. "이사님이라도 못 믿는다"는 원칙 — gi-board 응답을
// 그대로 신뢰하지 않고, 우리 데이터와 다르면 표시합니다.

// MARK 2026-09-14: "전체적으로 무거워짐" 점검 — 여기도 매번 Daily_Sales_History 전체를
// 읽고 있었습니다(다른 곳에서 이미 겪고 고친 것과 동일한 패턴). 필요한 건 "가장 최근
// 재고 스냅샷"뿐이라(매일 새벽 반영), 최근 N일치만 targeted하게 읽으면 충분합니다.
const RECENT_DAYS_WINDOW = 21;

function recentKstDateKeys(days: number): string[] {
  const kst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(kst);
    d.setDate(d.getDate() - i);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return keys;
}

export async function buildMarkStockMap(): Promise<Map<string, number>> {
  const flatRows = await readDailyHistoryRowsForExactDates(recentKstDateKeys(RECENT_DAYS_WINDOW));

  const latestDateByKey = new Map<string, string>();
  const stockByKey = new Map<string, number>();

  for (const r of flatRows) {
    const key = `${normalizeStoreKey(r.storeName)}__${r.styleCode}__${r.colorCode}`;
    const lastDate = latestDateByKey.get(key);
    if (!lastDate || r.date > lastDate) {
      latestDateByKey.set(key, r.date);
      stockByKey.set(key, Number(r.stock || 0));
    }
  }

  return stockByKey;
}

export function lookupMarkStock(stockMap: Map<string, number>, storeName: string, sku: string): number | null {
  const [styleCode, colorCode] = String(sku || "").split("::");
  if (!styleCode) return null;
  const key = `${normalizeStoreKey(storeName)}__${styleCode}__${colorCode || ""}`;
  return stockMap.has(key) ? stockMap.get(key)! : null;
}

// 두 값이 눈에 띄게 다른지 판단합니다. 완전 일치를 요구하면 사소한 시차로도 계속 경고가 뜨므로,
// 어느 정도(더 큰 값의 30% 이상 또는 절대 2개 이상) 차이날 때만 "불일치"로 표시합니다.
export function isStockDiscrepant(giBoardStock: number, markStock: number | null): boolean {
  if (markStock === null) return false; // MARK에 해당 SKU 기록이 아예 없으면 판단 보류(불일치로 단정 안 함)
  const diff = Math.abs(giBoardStock - markStock);
  if (diff < 2) return false;
  const base = Math.max(giBoardStock, markStock, 1);
  return diff / base >= 0.3;
}
