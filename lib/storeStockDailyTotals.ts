// MARK 2026-10-28: 라운딩 재고점검의 "지난주 대비 재고 증감"용 — 매장별 총재고를 날짜별로 한 줄씩 남깁니다.
// 매장별_재고_스냅샷(PIP)은 매일 덮어쓰는 스냅샷이라 지난주 값이 남지 않아서, 새벽 PIP 업로드가 끝날 때
// (finishStoreStockSnapshot)와 라운딩 재고점검 계산 때 그날 합계를 기록합니다(같은 날짜는 덮어씀, 90일 보관).
//   시트(MARK_DB) "매장별_재고_일별합계": [날짜, 매장명, 총재고, 누적판매합계]

import { getDbSheetId, ensureSheetExistsById, getSheetValuesById, safeReplaceSheetValuesById } from "./googleSheets";

const SHEET = "매장별_재고_일별합계";
const HEADER = ["날짜", "매장명", "총재고", "누적판매합계"];
const KEEP_DAYS = 90;

const t = (v: any) => String(v ?? "").trim();
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export type StoreStockTotal = { date: string; storeName: string; stock: number; cumQty: number };

export async function readStoreStockDailyTotals(): Promise<StoreStockTotal[]> {
  const rows = await getSheetValuesById(getDbSheetId(), SHEET, "A2:D20000").catch(() => [] as any[]);
  return rows.filter((r) => r && t(r[0]) && t(r[1])).map((r) => ({ date: t(r[0]).slice(0, 10), storeName: t(r[1]), stock: n(r[2]), cumQty: n(r[3]) }));
}

/** rows: 매장별 재고 스냅샷 행(storeName/stock/cumQty) — 매장별로 합산해서 date 날짜로 기록 */
export async function recordStoreStockDailyTotals(date: string, rows: { storeName: string; stock: number; cumQty?: number }[]) {
  if (!date || !rows?.length) return { ok: false, written: 0 };
  const agg = new Map<string, { stock: number; cumQty: number }>();
  for (const r of rows) {
    const k = t(r.storeName);
    if (!k) continue;
    const a = agg.get(k) || { stock: 0, cumQty: 0 };
    a.stock += Math.max(0, n(r.stock));
    a.cumQty += Math.max(0, n(r.cumQty));
    agg.set(k, a);
  }
  const dbId = getDbSheetId();
  await ensureSheetExistsById(dbId, SHEET, HEADER);
  const existing = await readStoreStockDailyTotals();
  const minDate = new Date(new Date(`${date}T00:00:00Z`).getTime() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  const kept = existing.filter((r) => r.date !== date && r.date >= minDate);
  const fresh = [...agg.entries()].map(([storeName, a]) => ({ date, storeName, stock: a.stock, cumQty: a.cumQty }));
  const all = [...kept, ...fresh].sort((a, b) => (a.date === b.date ? a.storeName.localeCompare(b.storeName, "ko") : a.date < b.date ? -1 : 1));
  await safeReplaceSheetValuesById(dbId, SHEET, [HEADER, ...all.map((r) => [r.date, r.storeName, r.stock, r.cumQty])]);
  return { ok: true, written: fresh.length };
}
