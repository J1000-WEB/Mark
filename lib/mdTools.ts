// MARK 2026-11-19: 재고MD님 아티팩트 3개를 MARK 데이터로 — 파일 업로드 없이.
//   ① 팩토리아울렛(용인 42005) 출고 제안  — 원본 "팩토리아울렛 판매분" runAnalysis 그대로(창고 출고만, RT 없음, 매장당 최대 N장)
//   ② 온라인 이관요청 리스트             — 원본 "재고이관 요청 리스트 생성기"(오프라인 BEST SKU 중 오프 가용 < 기준 & 온 가용 ≥ 최소)
//   ③ 저소진 품번 랭킹                   — 원본 "저소진 품번 랭킹"(스타일 단위 소진율 = 기간판매 ÷ (기간판매 + 매장재고 + 물류 가용(오프)))
// 데이터: 매장 재고·누계 = PIP 매장별 재고 스냅샷, 판매 = Daily_Sales_History(어제까지), 물류 가용 = ERP ONOFF 자동 조회 스냅샷,
//         스타일 정보(년도·시즌·품목·이름) = PIP 시트 앞 19열.
import { getDailySourceSheetId, getSheetValuesById, getSpreadsheetTitlesById } from "./googleSheets";
import { readStoreStockSnapshot, readWarehouseStockSnapshot, readDailyHistoryFlatRange, readOnlineTransferStockSnapshot } from "./dataBuilder";
import { pickDailySheetTitle } from "./dailySales";
import { loadChannelMaster } from "./channelMaster";
import { isPromoExcludedStore } from "./promoReport";
import { readShipRtConfig, normStoreKey } from "./shipRtCompute";
import { readArchivedSales } from "./pipArchive";

const kstDate = (off = 0) => new Date(Date.now() + 9 * 3600 * 1000 + off * 86400000).toISOString().slice(0, 10);
function addDays(ymd: string, d: number) {
  const x = new Date(`${ymd}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}
const up = (v: any) => String(v ?? "").trim().toUpperCase();
const normSize = (v: any) => {
  const s = up(v).replace(/\s+/g, "");
  return /^0+[A-Z]/.test(s) ? s.replace(/^0+/, "") : s;
};
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Daily_Sales_History를 7일씩 나눠 읽고 판매가 있는 줄만 남김(하루치에 전 SKU 재고 줄이 있어 통째로 모으면 너무 큼 —
 *  라운딩 탭에서 문자열 한도, 여기선 배열 spread로 콜스택 초과를 겪음) */
async function readFlatChunks(from: string, to: string) {
  const out: any[] = [];
  for (let s = from; s <= to; s = addDays(s, 7)) {
    const e = addDays(s, 6) < to ? addDays(s, 6) : to;
    const part = await readDailyHistoryFlatRange(s, e, { strict: true });
    for (const r of part) if (Number(r.qty || 0) !== 0) out.push({ date: r.date, storeName: r.storeName, styleCode: r.styleCode, colorCode: r.colorCode, size: r.size, qty: r.qty });
  }
  return out;
}

/** PIP 시트 스타일 정보 */
async function readStyleInfo() {
  const id = getDailySourceSheetId();
  const title = pickDailySheetTitle(await getSpreadsheetTitlesById(id));
  const rows = await getSheetValuesById(id, title, "A:S");
  const m = new Map<string, { year: string; season: string; cat: string; bok: string; name: string }>();
  for (const r of rows.slice(3)) {
    const st = up(r[13]);
    if (!st || st === "스타일" || m.has(st)) continue;
    m.set(st, { year: String(r[3] ?? "").trim(), season: String(r[4] ?? "").trim(), cat: String(r[6] ?? "").trim(), bok: String(r[7] ?? "").trim(), name: String(r[14] ?? "").trim() });
  }
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// ① 팩토리아울렛 출고 제안
export type OutletConfig = { defaultWeeks: number; defaultExcess: number; soldoutTh: number; periodDays: number; minStock: number; maxHold: number; storeKeyword: string; shipRound: string };
export const DEFAULT_OUTLET_CONFIG: OutletConfig = { defaultWeeks: 3, defaultExcess: 4.3, soldoutTh: 2, periodDays: 7, minStock: 2, maxHold: 10, storeKeyword: "용인", shipRound: "" };

export async function computeOutlet(cfgIn: Partial<OutletConfig> = {}) {
  const cfg: OutletConfig = { ...DEFAULT_OUTLET_CONFIG, ...cfgIn };
  const yesterday = kstDate(-1);
  const from = addDays(yesterday, -(cfg.periodDays - 1));
  const kw = normStoreKey(cfg.storeKeyword || "용인");
  const isOutlet = (name: string) => normStoreKey(name).includes(kw);
  // 용인 같은 인샵 매장은 Daily_Sales_History에 없음(2026-11-19 확인) → 판매는 PIP 보관 시트(판매_일별, 전 채널)에서
  const dates: string[] = [];
  for (let d = from; d <= yesterday; d = addDays(d, 1)) dates.push(d);
  const [pip, wh, arch, info] = await Promise.all([readStoreStockSnapshot({ strict: true }), readWarehouseStockSnapshot(), readArchivedSales(dates), readStyleInfo().catch(() => new Map())]);
  const flat = arch.rows.map((r) => ({ storeName: r.storeName, styleCode: r.styleCode, colorCode: r.colorCode, size: r.size, qty: r.qty }));
  // 보관 시트에 아직 없는 날이 있으면 있는 날 수로 주간 판매를 환산(없는 날을 판매 0으로 보지 않게)
  const effDays = arch.foundDates.length || cfg.periodDays;
  const codeOf = (name: string) => (/용인/.test(name) ? "42005" : name);
  const agg = new Map<string, any>();
  for (const r of pip.rows as any[]) {
    if (!isOutlet(r.storeName)) continue;
    const st = up(r.styleCode), c = up(r.color), z = normSize(r.size);
    const k = `${r.storeName}|${st}|${c}|${z}`;
    const e = agg.get(k) || { storeCode: codeOf(r.storeName), storeName: r.storeName, style: st, color: c, size: z, stock: 0, cum: 0, period: 0 };
    e.stock += Number(r.stock || 0);
    e.cum = Math.max(e.cum, Number(r.cumQty || 0));
    agg.set(k, e);
  }
  const stores = new Set([...agg.values()].map((e) => e.storeName));
  for (const r of flat) {
    if (!isOutlet(r.storeName) || !r.styleCode || !r.colorCode || !r.size) continue;
    const name = [...stores].find((s) => normStoreKey(s) === normStoreKey(r.storeName)) || r.storeName;
    const st = up(r.styleCode), c = up(r.colorCode), z = normSize(r.size);
    const k = `${name}|${st}|${c}|${z}`;
    const e = agg.get(k) || { storeCode: codeOf(name), storeName: name, style: st, color: c, size: z, stock: 0, cum: 0, period: 0 };
    e.period += Number(r.qty || 0);
    agg.set(k, e);
  }
  const whMap = new Map<string, { availOff: number; barcode: string }>();
  for (const r of wh.rows as any[]) {
    const k = `${up(r.styleCode)}|${up(r.color)}|${normSize(r.size)}`;
    const e = whMap.get(k) || { availOff: 0, barcode: r.barcode || "" };
    e.availOff += Number(r.offlineStock || 0);
    if (!e.barcode) e.barcode = r.barcode || "";
    whMap.set(k, e);
  }

  // step 1 (원본 그대로)
  const rows: any[] = [];
  for (const r of agg.values()) {
    const mask = r.period > 0 || r.stock > 0 || (r.stock === 0 && r.cum > 0);
    if (!mask) continue;
    const stock = Math.max(0, r.stock);
    const weekly = (r.period / effDays) * 7;
    const stockWeeks = r.period === 0 ? (stock === 0 ? 0 : 99) : stock / weekly;
    const properStock = r.period === 0 ? (stock === 0 ? 0 : Math.min(cfg.minStock, stock)) : cfg.defaultWeeks * weekly;
    const diff = stock - properStock;
    let status: string;
    if (r.period === 0 && stock === 0 && r.cum > 0) status = "보충";
    else if (stockWeeks >= cfg.defaultExcess) status = "과잉";
    else if (stockWeeks <= cfg.soldoutTh) status = "품절임박";
    else status = "정상";
    const wh0 = whMap.get(`${r.style}|${r.color}|${r.size}`);
    const shortage = status === "품절임박" || status === "보충" ? Math.max(0, cfg.maxHold - stock) : 0;
    rows.push({
      storeCode: r.storeCode, storeName: r.storeName, style: r.style, styleName: info.get(r.style)?.name || "", color: r.color, size: r.size,
      skuKey: `${r.style}-${r.color}-${r.size}`, cum: r.cum, period: r.period, stock, stockWeeks, properStock, diff, status,
      availOff: wh0 ? wh0.availOff : 0, barcode: wh0 ? wh0.barcode : "", shortage, shipQty: 0, unmet: 0,
    });
  }
  // step 2: 같은 SKU를 여러 매장이 원하면 재고주수 급한 매장부터
  const bySku = new Map<string, any[]>();
  rows.forEach((r) => (bySku.get(r.skuKey) || bySku.set(r.skuKey, []).get(r.skuKey)!).push(r));
  bySku.forEach((group) => {
    const sorted = group.slice().sort((a, b) => a.stockWeeks - b.stockWeeks || (a.storeCode < b.storeCode ? -1 : 1));
    let remaining = sorted.length ? sorted[0].availOff : 0;
    sorted.forEach((r) => {
      if (r.shortage <= 0) return;
      const alloc = Math.min(r.shortage, Math.max(0, remaining));
      r.shipQty = alloc;
      r.unmet = r.shortage - alloc;
      remaining -= alloc;
    });
  });
  const chulgoRows = rows.filter((r) => r.shipQty > 0).map((r) => ({
    style: r.style, styleName: r.styleName, color: r.color, size: r.size, storeCode: r.storeCode, storeName: r.storeName,
    stock: r.stock, period: r.period, status: r.status, shortage: r.shortage, availOff: r.availOff, qty: r.shipQty, unmet: r.unmet, barcode: r.barcode,
  }));
  const chulgoUpload = chulgoRows.map((r) => ({ 채널: r.storeCode, 바코드: r.barcode, 출고차수: cfg.shipRound, 의뢰수량: r.qty, 대분류: "", 비고: "부족재고보충" }));
  const statusCounts: Record<string, number> = { 정상: 0, 품절임박: 0, 과잉: 0, 보충: 0 };
  rows.forEach((r) => statusCounts[r.status]++);
  return {
    config: cfg,
    stores: [...stores],
    statusCounts,
    chulgoUpload,
    chulgoRows,
    analysisRows: rows
      .filter((r) => r.status !== "정상" || r.shipQty > 0)
      .sort((a, b) => b.shipQty - a.shipQty || a.stockWeeks - b.stockWeeks)
      .slice(0, 8000)
      .map((r) => ({ storeName: r.storeName, style: r.style, styleName: r.styleName, color: r.color, size: r.size, cum: r.cum, period: r.period, stock: r.stock, stockWeeks: r1(r.stockWeeks), properStock: r1(r.properStock), status: r.status, availOff: r.availOff, shortage: r.shortage, shipQty: r.shipQty, unmet: r.unmet })),
    totals: { shipQtySum: chulgoRows.reduce((a, r) => a + r.qty, 0), unmetTotal: rows.reduce((a, r) => a + Math.max(0, r.unmet), 0), skuRows: rows.length },
    inputs: { period: `${from}~${yesterday}`, salesDates: `${arch.foundDates.length}/${dates.length}일(PIP 보관)`, pip: (pip as any).meta?.uploadedAt || null, warehouse: (wh as any).meta?.uploadedAt || null },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ② 온라인 이관요청 리스트
export async function computeOnlineTransfer(opts: { topN?: number; days?: number; maxOffline?: number; minOnline?: number; styles?: string[] } = {}) {
  const topN = opts.topN ?? 50, days = opts.days ?? 28;
  const yesterday = kstDate(-1);
  const from = addDays(yesterday, -(days - 1));
  const manual = (opts.styles || []).map(up).filter(Boolean);
  const [stock, wh, info] = await Promise.all([readOnlineTransferStockSnapshot(), readWarehouseStockSnapshot(), readStyleInfo().catch(() => new Map())]);
  const barcodeOf = new Map((wh.rows as any[]).map((r) => [`${up(r.styleCode)}|${up(r.color)}|${normSize(r.size)}`, r.barcode || ""]));
  const inv = new Map<string, any>();
  for (const r of stock.rows) {
    const k = `${up(r.styleCode)}|${up(r.color)}|${normSize(r.size)}`;
    const e = inv.get(k) || { style: up(r.styleCode), styleName: r.productName, color: up(r.color), colorName: r.colorName, size: normSize(r.size), online: 0, offline: 0 };
    e.online += r.onlineStock;
    e.offline += r.offlineStock;
    inv.set(k, e);
  }
  let rows: any[];
  if (manual.length) {
    const set = new Set(manual);
    rows = [...inv.values()].filter((e) => set.has(e.style)).map((e) => ({ rank: null, ...e, monthly: null, w1: null, w2: null, w3: null, found: true }));
  } else {
    const master = await loadChannelMaster().catch(() => new Map());
    const flat = await readFlatChunks(from, yesterday);
    const w1s = addDays(yesterday, -6), w2s = addDays(yesterday, -13), w3s = addDays(yesterday, -20);
    const sku = new Map<string, any>();
    for (const r of flat) {
      if (!r.styleCode || !r.colorCode || !r.size || isPromoExcludedStore(r.storeName, master as any)) continue;
      const k = `${up(r.styleCode)}|${up(r.colorCode)}|${normSize(r.size)}`;
      const e = sku.get(k) || { k, style: up(r.styleCode), color: up(r.colorCode), size: normSize(r.size), colorName: "", monthly: 0, w1: 0, w2: 0, w3: 0 };
      const q = Number(r.qty || 0);
      e.monthly += q;
      if (r.date >= w1s) e.w1 += q;
      else if (r.date >= w2s) e.w2 += q;
      else if (r.date >= w3s) e.w3 += q;
      sku.set(k, e);
    }
    rows = [...sku.values()]
      .sort((a, b) => b.monthly - a.monthly)
      .slice(0, topN)
      .map((e, i) => {
        const v = inv.get(e.k);
        return { rank: i + 1, style: e.style, styleName: v?.styleName || info.get(e.style)?.name || "", color: e.color, colorName: v?.colorName || "", size: e.size, monthly: e.monthly, w1: e.w1, w2: e.w2, w3: e.w3, online: v ? v.online : null, offline: v ? v.offline : null, found: !!v };
      });
  }
  rows.forEach((r) => (r.barcode = barcodeOf.get(`${r.style}|${r.color}|${r.size}`) || `${r.style}${r.color}${r.size}`));
  return { mode: manual.length ? "manual" : "best", period: `${from}~${yesterday}`, rows, stockAt: stock.meta?.uploadedAt || null };
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ 저소진 품번 랭킹
export async function computeSlowMovers(opts: { days?: number } = {}) {
  const days = opts.days ?? 28;
  const yesterday = kstDate(-1);
  const from = addDays(yesterday, -(days - 1));
  const [{ config }, pip, wh, flat, info] = await Promise.all([readShipRtConfig(), readStoreStockSnapshot({ strict: true }), readWarehouseStockSnapshot(), readFlatChunks(from, yesterday), readStyleInfo().catch(() => new Map())]);
  // 원본과 같은 22개 매장(출고·RT 설정의 매장 목록) — 매장반품·주문 같은 사유 채널 제외
  const known = new Set(config.stores.map((s) => normStoreKey(s.name)));
  const agg = new Map<string, { style: string; storeStock: number; period: number; whStock: number }>();
  const get = (st: string) => agg.get(st) || agg.set(st, { style: st, storeStock: 0, period: 0, whStock: 0 }).get(st)!;
  for (const r of pip.rows as any[]) if (known.has(normStoreKey(r.storeName))) get(up(r.styleCode)).storeStock += Math.max(0, Number(r.stock || 0));
  for (const r of flat) if (r.styleCode && known.has(normStoreKey(r.storeName))) get(up(r.styleCode)).period += Number(r.qty || 0);
  for (const r of wh.rows as any[]) get(up(r.styleCode)).whStock += Math.max(0, Number(r.offlineStock || 0));
  const rows = [...agg.values()]
    .map((e) => {
      const period = Math.max(0, e.period);
      const totalStock = e.storeStock + e.whStock;
      const denom = period + totalStock;
      const i = info.get(e.style);
      return { style: e.style, styleName: i?.name || "", year: i?.year || "", season: i?.season || "", category: i?.cat || "", bok: i?.bok || "", storeStock: e.storeStock, whStock: e.whStock, totalStock, period, rate: denom > 0 ? period / denom : null };
    })
    .filter((r) => r.rate !== null);
  return { period: `${from}~${yesterday}`, days, rows, stores: config.stores.length, inputs: { pip: (pip as any).meta?.uploadedAt || null, warehouse: (wh as any).meta?.uploadedAt || null } };
}
