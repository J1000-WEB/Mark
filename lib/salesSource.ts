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
