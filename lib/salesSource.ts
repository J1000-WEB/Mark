// MARK 2026-11-21: 판매 읽기 공용 — PIP 과거 보관(MARK_PIP_ARCHIVE 판매_일별, ERP 실제 금액·인샵(용인·무신사) 포함)을 1순위로,
// 보관에 아직 없는 날짜(새벽 3시 전의 어제·오늘 등)만 Daily_Sales_History에서 채움.
// 보관 줄은 ERP 팀 "오프라인팀"만(무신사·면세·한컬렉션 위탁도 오프라인팀). 매장주문/반품·온라인 등은 부르는 쪽이 isPromoExcludedStore로 거름.
import { readArchivedSales } from "@/lib/pipArchive";
import { readDailyHistoryRowsForExactDates } from "@/lib/dailySales";

export type SaleRow = { date: string; storeName: string; channelCode?: string; styleCode: string; colorCode: string; size: string; qty: number; amount: number; stock?: number; productName?: string; colorName?: string };

const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export async function readOfflineSalesRows(dates: string[], opts: { maxGap?: number } = {}): Promise<{ rows: SaleRow[]; archiveDates: string[]; historyDates: string[] }> {
  const rows: SaleRow[] = [];
  const arch = await readArchivedSales(dates, { maxGap: opts.maxGap ?? 40 }).catch(() => ({ rows: [] as any[], foundDates: [] as string[] }));
  for (const r of arch.rows) {
    if (r.team !== "오프라인팀") continue;
    rows.push({ date: r.date, storeName: r.storeName, channelCode: r.channelCode, styleCode: r.styleCode, colorCode: r.colorCode, size: r.size, qty: r.qty, amount: r.amount });
  }
  const found = new Set(arch.foundDates);
  const missing = dates.filter((d) => !found.has(d) && d <= kstToday());
  const historyDates: string[] = [];
  if (missing.length) {
    const hist = await readDailyHistoryRowsForExactDates(missing).catch(() => [] as any[]);
    const seen = new Set<string>();
    for (const r of hist as any[]) {
      seen.add(r.date);
      rows.push({ date: r.date, storeName: r.storeName, styleCode: r.styleCode, colorCode: r.colorCode, size: r.size, qty: Number(r.qty) || 0, amount: Number(r.amount) || 0, stock: r.stock, productName: r.productName, colorName: r.colorName });
    }
    historyDates.push(...[...seen].sort());
  }
  return { rows, archiveDates: [...found].sort(), historyDates };
}

/** from~to(포함) 날짜 범위 판매 줄(판매 수량·금액 있는 줄만). 한 주씩 읽음. */
export async function readOfflineSalesRange(from: string, to: string): Promise<SaleRow[]> {
  const dates: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) dates.push(d.toISOString().slice(0, 10));
  const out: SaleRow[] = [];
  for (let i = 0; i < dates.length; i += 14) {
    const { rows } = await readOfflineSalesRows(dates.slice(i, i + 14));
    for (const r of rows) if (r.qty || r.amount) out.push(r);
  }
  return out;
}

/** 매장탭 등 "품목 상세 + 재고"가 같이 필요한 곳용: dates 판매(보관 1순위) + stockDate에 PIP 매장별 재고 스냅샷(전 SKU)을 붙인 줄.
 *  Daily_Sales_History 줄과 같은 모양(date, storeName, styleCode, colorCode, size, qty, amount, stock, productName, colorName). */
export async function readItemRowsWithStock(dates: string[], stockDate: string): Promise<any[]> {
  const { readStoreStockSnapshot } = await import("@/lib/dataBuilder");
  const [{ rows }, snap] = await Promise.all([readOfflineSalesRows(dates), readStoreStockSnapshot().catch(() => ({ rows: [] as any[], meta: null }))]);
  const up = (v: any) => String(v ?? "").trim().toUpperCase();
  const pName = new Map<string, string>(), cName = new Map<string, string>();
  for (const r of snap.rows as any[]) {
    if (r.productName && !pName.has(up(r.styleCode))) pName.set(up(r.styleCode), r.productName);
    if (r.colorName && !cName.has(`${up(r.styleCode)}|${up(r.color)}`)) cName.set(`${up(r.styleCode)}|${up(r.color)}`, r.colorName);
  }
  const out: any[] = [];
  const byKey = new Map<string, any>();
  for (const r of rows) {
    const o: any = { ...r, productName: r.productName || pName.get(up(r.styleCode)) || "", colorName: r.colorName || cName.get(`${up(r.styleCode)}|${up(r.colorCode)}`) || "" };
    if (snap.rows.length && r.date === stockDate) o.stock = 0; // 그날 재고는 스냅샷으로
    out.push(o);
    if (r.date === stockDate) byKey.set(`${normKey(r.storeName)}|${up(r.styleCode)}|${up(r.colorCode)}|${up(r.size)}`, o);
  }
  for (const s of snap.rows as any[]) {
    const k = `${normKey(s.storeName)}|${up(s.styleCode)}|${up(s.color)}|${up(s.size)}`;
    const hit = byKey.get(k);
    if (hit) hit.stock = (hit.stock || 0) + (Number(s.stock) || 0);
    else {
      const o = { date: stockDate, storeName: s.storeName, styleCode: s.styleCode, colorCode: s.color, size: s.size, qty: 0, amount: 0, stock: Number(s.stock) || 0, productName: s.productName || "", colorName: s.colorName || "" };
      byKey.set(k, o);
      out.push(o);
    }
  }
  return out;
}
const normKey = (s: any) => String(s ?? "").replace(/\s+/g, "").toLowerCase();

/** 매장×날짜 매출 금액(실제 금액) — 1순위 매출탭 `매출_일별_스냅샷`(ERP 점포 매출, 화이트리스트 점포), 그 매장·날짜가 없을 때만 Daily_Sales_History.
 *  (Daily_Sales_History는 2026-08 중순 전 금액이 수량×정가 추정치.) 매장 이름은 Daily_Sales_History 쪽 이름으로 맞춰서 돌려줌
 *  (매장탭 필터·isCoreOfflineSalesStore가 그 이름 기준이라). 결과 debug: 소스별 줄 수·이름이 안 맞은 매출탭 매장. */
export const lastAmountSourceDebug: { snapshotRows: number; historyRows: number; renamed: Record<string, string>; unmatched: string[] } = { snapshotRows: 0, historyRows: 0, renamed: {}, unmatched: [] };
export async function readActualStoreAmountRows(from: string, to: string): Promise<{ date: string; storeName: string; amount: number }[]> {
  const { readSalesSummaryRowsForReports, normalizeStoreKey } = await import("@/lib/dataBuilder");
  const { readDailyHistoryRowsForDateRange } = await import("@/lib/dailySales");
  const [snapAll, hist] = await Promise.all([
    readSalesSummaryRowsForReports().catch(() => [] as any[]),
    readDailyHistoryRowsForDateRange(from, to).catch(() => [] as any[]),
  ]);
  const histName = new Map<string, string>();
  for (const r of hist as any[]) { const k = normalizeStoreKey(r.storeName); if (!histName.has(k)) histName.set(k, r.storeName); }
  const histKeys = [...histName.keys()];
  const nameMap = new Map<string, string>();
  const renamed: Record<string, string> = {};
  const unmatched = new Set<string>();
  const resolve = (name: string) => {
    if (nameMap.has(name)) return nameMap.get(name)!;
    const k = normalizeStoreKey(name);
    let out = histName.get(k);
    if (!out) {
      const cands = histKeys.filter((h) => h.length >= 2 && k.length >= 2 && (h.includes(k) || k.includes(h)));
      if (cands.length === 1) { out = histName.get(cands[0])!; renamed[name] = out; }
    }
    if (!out) { out = name; unmatched.add(name); }
    nameMap.set(name, out);
    return out;
  };
  const out: { date: string; storeName: string; amount: number }[] = [];
  const covered = new Set<string>();
  let snapCount = 0;
  for (const r of snapAll as any[]) {
    if (r.date < from || r.date > to) continue;
    const storeName = resolve(r.storeName);
    const k = `${normalizeStoreKey(storeName)}__${r.date}`;
    covered.add(k);
    out.push({ date: r.date, storeName, amount: Number(r.amount) || 0 });
    snapCount++;
  }
  let histCount = 0;
  for (const r of hist as any[]) {
    if (covered.has(`${normalizeStoreKey(r.storeName)}__${r.date}`)) continue;
    out.push({ date: r.date, storeName: r.storeName, amount: Number(r.amount) || 0 });
    histCount++;
  }
  Object.assign(lastAmountSourceDebug, { snapshotRows: snapCount, historyRows: histCount, renamed, unmatched: [...unmatched].filter((n) => (snapAll as any[]).some((r) => r.storeName === n && r.date >= to.slice(0, 4) + "-01-01" && r.amount)) });
  return out;
}
