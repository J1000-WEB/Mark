import { getHistorySheetId, getSheetValuesById } from "./googleSheets";
import { expandAnyDailyHistoryRows } from "./dailySales";
import { normalizeStoreKey } from "./dataBuilder";

// MARK 6.52: gi-board VMD export의 재고(gi-board 자체 스냅샷 기준)를 MARK의 Daily_Sales_History
// (우리 자체 재고)와 교차검증하기 위한 헬퍼. "이사님이라도 못 믿는다"는 원칙 — gi-board 응답을
// 그대로 신뢰하지 않고, 우리 데이터와 다르면 표시합니다.

export async function buildMarkStockMap(): Promise<Map<string, number>> {
  const historyId = getHistorySheetId();
  const raw = await getSheetValuesById(historyId, "Daily_Sales_History", "A:ZZ").catch(() => []);
  const flatRows = expandAnyDailyHistoryRows(raw || []);

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
