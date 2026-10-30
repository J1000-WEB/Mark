// MARK 2026-10-28: 라운딩 탭 "재고 점검" — 매장 방문 때 그 매장 재고를 전사와 비교해서 보고, 바로 조치를 남깁니다.
//
// 블록(소천님과 정리한 것):
//  ① 재고 요약: 총재고, 주간판매(2주 평균), 재고주수, 지난주 대비 재고 증감, 22개 매장 중 순위 — 전사 평균과 비교
//  ②③ 전사 TOP20 품번의 품절·품절임박·사이즈깨짐: 최근 2주 전사(오프라인) 판매 TOP20 중 이 매장에 문제가 있는
//      품번을 전사 순위 높은 순으로 10개. SKU마다 물류 가용(오프) 재고를 같이 표시
//  ④ 보충 대상: 재고 0 · 최근 2주 판매 0 · 누적판매 ≥ 5장(오래 품절된 인기 SKU) — 창고에 있거나 전사에서 아직 팔리는 것만
//  ⑥ 신상품 반응: 최근 3주 안에 처음 판매/입고가 잡힌 품번 중 이 매장 판매율(판매÷(판매+재고))이 전사보다 낮은 것
//
// 데이터(전부 이미 매일 쌓이는 것): PIP 매장별 재고 스냅샷(재고·누적판매), Daily_Sales_History(매장×SKU 일별 판매),
// 물류가용재고_스냅샷(가용(오프)), 매장별_재고_일별합계(지난주 재고 비교용).
//
// 계산은 무거워서(판매이력 6주 + PIP 5만 행) 하루 한 번 전 매장을 한꺼번에 계산해서 MARK_DB "라운딩_재고점검"에
// 저장하고, 매장을 열 때는 저장분에서 그 매장 행만 읽습니다(첫 조회 때 오늘 저장분이 없으면 자동 계산).

import { getDbSheetId, getSheetValuesById, safeReplaceSheetValuesById, ensureSheetExistsById } from "./googleSheets";
import { readStoreStockSnapshot, readWarehouseStockSnapshot, readDailyHistoryFlatRange } from "./dataBuilder";
import { RT_SKU_STORES, RT_SKU_RELAUNCH, normalizeStoreKey } from "./rtSkuEngine";
import { loadStyleLaunchMap } from "./styleLaunchMaster";
import { readStoreStockDailyTotals, recordStoreStockDailyTotals } from "./storeStockDailyTotals";

const CACHE_SHEET = "라운딩_재고점검";
const CHUNK_CHARS = 40000;

export const ROUNDING_INV_SETTINGS = {
  topN: 20, // 전사 TOP N 품번
  topIssueStyles: 20, // 그중 문제 있는 품번(화면에서 창고 필터 후 10개만 보여줌)
  shortageWeeks: 2, // 품절임박: 재고주수 ≤
  boostMinCumQty: 5, // 보충: 누적판매 ≥
  boostMax: 40, // 화면에서 창고 필터 후 15개만 보여줌
  newDays: 21, // 신상품: 최근 N일 안에 처음 잡힌 품번
  newMinStock: 3, // 신상품 저조 판정: 매장 재고 이 이상
  newLowRatio: 0.6, // 매장 판매율 < 전사 판매율 × 이 값 → 저조
  newMinCompanyAvgSold: 2, // 저조 판정은 전사 매장당 3주 판매가 이 이상인(반응이 있는) 품번만
  sizeBreakMinCompany2w: 5, // 사이즈깨짐: 그 SKU 전사 2주 판매가 이 이상일 때만(노이즈 방지)
  newMax: 12,
};

const t = (v: any) => String(v ?? "").trim();
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const up = (v: any) => t(v).toUpperCase();
const r1 = (v: number) => Math.round(v * 10) / 10;

function kstNow() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), label: `${iso.slice(0, 10)} ${iso.slice(11, 16)}` };
}
function addDays(date: string, k: number) {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + k * 86400000).toISOString().slice(0, 10);
}
/** 주간판매: 전전주 판매가 없으면(신상품) 전주 값, 아니면 2주 평균 (SKU 방식 RT와 동일) */
function weeklyOf(w1: number, w2: number) {
  const a = Math.max(0, w1), b = Math.max(0, w2);
  if (a > 0 && b === 0) return a;
  return (a + b) / 2;
}
function weeksOf(stock: number, weekly: number) {
  if (weekly > 0) return r1(stock / weekly);
  return stock > 0 ? 99 : 0;
}

type Store = { code: string; name: string; grade: string; rank: number; key: string };
type Sku = { style: string; color: string; size: string; productName: string; colorName: string; stock: number; cumQty: number; w1: number; w2: number; sold21: number };

export type RoundingInventoryStore = {
  storeName: string;
  storeCode: string;
  grade: string;
  salesRank: number | null;
  summary: {
    stock: number;
    w1Qty: number;
    w2Qty: number;
    weekly: number;
    weeks: number;
    stockRank: number;
    weeksRank: number;
    storeCount: number;
    prevStock: number | null;
    prevStockDate: string | null;
    stockDelta: number | null;
    company: { avgStock: number; avgWeekly: number; weeks: number; totalStock: number; avgPrevStock: number | null };
  };
  topIssues: {
    companyRank: number;
    styleCode: string;
    productName: string;
    companyQty2w: number;
    companyAvgWeekly: number; // 매장당 평균 주간판매
    storeWeekly: number; // 이 매장 품번 주간판매(2주 평균)
    storeWeeks: number; // 이 매장 품번 재고주수(판매 없으면 99)
    companyWeeks: number; // 전사(오프라인) 품번 재고주수
    storeQty2w: number;
    storeStock: number;
    notCarried: boolean;
    warehouseStyle: number;
    skus: { color: string; colorName: string; size: string; type: "품절" | "품절임박" | "사이즈깨짐"; stock: number; weekly: number; weeks: number; companyQty2w: number; warehouse: number }[];
  }[];
  boost: { styleCode: string; productName: string; color: string; colorName: string; size: string; cumQty: number; companyQty2w: number; warehouse: number }[];
  newProducts: {
    styleCode: string;
    productName: string;
    firstSeen: string;
    storeStock: number;
    storeSold: number;
    storeSellThrough: number;
    companySellThrough: number;
    companyAvgSold: number;
    carryingStores: number;
    storeSTRank: number;
    low: boolean;
    warehouse: number;
  }[];
  /** 조치 추적용: "STYLE|COLOR|SIZE" → [재고, 전주판매, 전전주판매] (재고나 판매가 있는 SKU만) */
  skuMap: Record<string, [number, number, number]>;
};

export type RoundingInventoryMeta = {
  computedAt: string;
  computedDate: string;
  anchorDate: string;
  week1: string;
  week2: string;
  pipUploadedAt: string | null;
  warehouseUploadedAt: string | null;
  warehouseUsed: boolean;
  computeMs: number;
  settings: typeof ROUNDING_INV_SETTINGS;
  stores: Record<string, { name: string; startRow: number; rows: number }>;
};

let inFlight: Promise<any> | null = null;
export function computeRoundingInventory() {
  if (inFlight) return inFlight;
  inFlight = doCompute().finally(() => (inFlight = null));
  return inFlight;
}

async function doCompute() {
  const t0 = Date.now();
  const now = kstNow();
  const [pip, wh, launchMap, totals] = await Promise.all([
    readStoreStockSnapshot({ strict: true }),
    readWarehouseStockSnapshot().catch(() => ({ rows: [] as any[], meta: null as any })),
    loadStyleLaunchMap().catch(() => new Map<string, string>()),
    readStoreStockDailyTotals().catch(() => []),
  ]);
  if (!pip.rows.length) throw new Error("PIP 매장별 재고 스냅샷이 비어 있어요. 새벽 PIP 업로드를 확인해주세요.");

  // 판매이력: 어제 기준 3주를 7일씩 나눠 읽음(Daily_Sales_History는 하루치에 전 SKU 재고까지 담겨 있어
  // 6주를 한 번에 읽으면 문자열 한도를 넘음 — 2026-10-28 실측). 가장 최근 7일을 먼저 읽어 기준일(anchor)을 정함.
  const yesterday = addDays(now.date, -1);
  const chunk1: any[] = await readDailyHistoryFlatRange(addDays(yesterday, -6), yesterday, { strict: true });
  let anchor = "";
  for (const r of chunk1) if (r.date > anchor && r.date <= yesterday) anchor = r.date;
  if (!anchor) anchor = yesterday;
  const w1s = addDays(anchor, -6), w2s = addDays(anchor, -13), w2e = addDays(anchor, -7);
  const newSince = addDays(anchor, -(ROUNDING_INV_SETTINGS.newDays - 1));

  // 매장 목록: 재고MD 매장코드 22개 + PIP에만 있는 오프라인 매장(등급 없음)
  const stores = new Map<string, Store>();
  for (const s of RT_SKU_STORES) stores.set(normalizeStoreKey(s.name), { ...s, key: normalizeStoreKey(s.name) });
  const pipStoreName = new Map<string, string>();
  for (const r of pip.rows) {
    const k = normalizeStoreKey(r.storeName);
    if (!pipStoreName.has(k)) pipStoreName.set(k, r.storeName);
  }
  for (const [k, name] of pipStoreName) {
    if (stores.has(k)) continue;
    // 온라인/위탁 채널은 PIP에도 매장처럼 나올 수 있음 → 이름으로 거름
    if (/몰|온라인|무신사|29cm|위탁|면세|컬렉션|쿠팡|자사|지그재그|W컨셉|wconcept|에이블리/i.test(name)) continue;
    stores.set(k, { code: "", name: name.replace(/^오프라인[_\s-]*/i, ""), grade: "-", rank: 0, key: k });
  }

  // 매장×SKU
  const skuByStore = new Map<string, Map<string, Sku>>();
  const getSku = (storeKey: string, style: string, color: string, size: string) => {
    let m = skuByStore.get(storeKey);
    if (!m) skuByStore.set(storeKey, (m = new Map()));
    const k = `${style}|${color}|${size}`;
    let s = m.get(k);
    if (!s) m.set(k, (s = { style, color, size, productName: "", colorName: "", stock: 0, cumQty: 0, w1: 0, w2: 0, sold21: 0 }));
    return s;
  };
  const productName = new Map<string, string>();
  const colorName = new Map<string, string>();
  for (const r of pip.rows) {
    const k = normalizeStoreKey(r.storeName);
    if (!stores.has(k)) continue;
    const style = up(r.styleCode), color = up(r.color), size = up(r.size);
    if (!style || !color || !size) continue;
    const s = getSku(k, style, color, size);
    s.stock += Math.max(0, n(r.stock));
    s.cumQty += Math.max(0, n(r.cumQty));
    if (r.productName && !productName.has(style)) productName.set(style, r.productName);
    if (r.colorName && !colorName.has(`${style}|${color}`)) colorName.set(`${style}|${color}`, r.colorName);
  }
  // 매장별 판매이력 재고 합계(날짜별) — 일별합계 로그가 아직 없을 때 지난주 재고 대체용(검증 후 사용)
  const dhStockByStoreDate = new Map<string, number>();
  const fold = (rows: any[]) => {
    for (const r of rows) {
      if (!r.styleCode || r.date < newSince || r.date > anchor) continue;
      const k = normalizeStoreKey(r.storeName);
      if (!stores.has(k)) continue;
      const stock = n(r.stock);
      if (stock > 0) dhStockByStoreDate.set(`${k}|${r.date}`, (dhStockByStoreDate.get(`${k}|${r.date}`) || 0) + stock);
      const q = n(r.qty);
      if (!q || !r.colorCode || !r.size) continue;
      const style = up(r.styleCode);
      if (r.productName && !productName.has(style)) productName.set(style, r.productName);
      const s = getSku(k, style, up(r.colorCode), up(r.size));
      if (r.date >= w1s) s.w1 += q;
      else if (r.date >= w2s && r.date <= w2e) s.w2 += q;
      s.sold21 += q;
      if (r.colorName && !colorName.has(`${style}|${up(r.colorCode)}`)) colorName.set(`${style}|${up(r.colorCode)}`, r.colorName);
    }
  };
  fold(chunk1);
  chunk1.length = 0;
  for (const [from, to] of [[addDays(yesterday, -13), addDays(yesterday, -7)], [addDays(yesterday, -20), addDays(yesterday, -14)], [addDays(yesterday, -21), addDays(yesterday, -21)]]) {
    if (to < newSince) continue;
    const rows: any[] = await readDailyHistoryFlatRange(from, to, { strict: true }).catch((e) => {
      // 3주차 이전 구간이 비어 있으면(데이터 없음) 그냥 넘어감 — 최근 2주는 필수
      if (to >= w2s) throw e;
      return [];
    });
    fold(rows);
  }

  // 물류 가용(오프)
  // 창고는 가장 최근 업로드분을 쓰고 화면에 기준일을 같이 보여줌(오래됐으면 경고)
  const whFresh = wh.rows.length > 0;
  const whSku = new Map<string, number>();
  const whStyle = new Map<string, number>();
  if (whFresh) {
    for (const r of wh.rows) {
      const style = up(r.styleCode);
      const v = Math.max(0, n(r.offlineStock));
      const k = `${style}|${up(r.color)}|${up(r.size)}`;
      whSku.set(k, (whSku.get(k) || 0) + v);
      whStyle.set(style, (whStyle.get(style) || 0) + v);
    }
  }

  // 전사 집계(오프라인 매장 전체)
  const coSku = new Map<string, { qty2w: number; stock: number }>();
  const coStyle = new Map<string, { qty2w: number; stock: number }>();
  const coSizes = new Map<string, Set<string>>(); // style|color → sizes
  const storeStats = new Map<string, { stock: number; w1: number; w2: number }>();
  for (const [sk, m] of skuByStore) {
    const st = { stock: 0, w1: 0, w2: 0 };
    for (const s of m.values()) {
      st.stock += s.stock;
      st.w1 += s.w1;
      st.w2 += s.w2;
      const k = `${s.style}|${s.color}|${s.size}`;
      const a = coSku.get(k) || { qty2w: 0, stock: 0 };
      a.qty2w += Math.max(0, s.w1) + Math.max(0, s.w2);
      a.stock += s.stock;
      coSku.set(k, a);
      const b = coStyle.get(s.style) || { qty2w: 0, stock: 0 };
      b.qty2w += Math.max(0, s.w1) + Math.max(0, s.w2);
      b.stock += s.stock;
      coStyle.set(s.style, b);
      const ck = `${s.style}|${s.color}`;
      if (!coSizes.has(ck)) coSizes.set(ck, new Set());
      if (s.stock > 0 || s.w1 + s.w2 > 0 || s.cumQty > 0) coSizes.get(ck)!.add(s.size);
    }
    storeStats.set(sk, st);
  }
  // 품번×매장 합계(신상품 판매율 계산용, 한 번만)
  const styleStore = new Map<string, Map<string, { stock: number; sold21: number; cum: number }>>();
  for (const [sk, m] of skuByStore) {
    for (const s of m.values()) {
      let mm = styleStore.get(s.style);
      if (!mm) styleStore.set(s.style, (mm = new Map()));
      const a = mm.get(sk) || { stock: 0, sold21: 0, cum: 0 };
      a.stock += s.stock;
      a.sold21 += Math.max(0, s.sold21);
      a.cum += s.cumQty;
      mm.set(sk, a);
    }
  }
  const activeStores = [...stores.values()].filter((s) => (storeStats.get(s.key)?.stock || 0) > 0);
  const storeCount = activeStores.length || 1;
  const top = [...coStyle.entries()].filter(([, v]) => v.qty2w > 0).sort((a, b) => b[1].qty2w - a[1].qty2w).slice(0, ROUNDING_INV_SETTINGS.topN);

  // 순위(재고 많은 순, 재고주수 많은 순)
  const statOf = (k: string) => {
    const s = storeStats.get(k) || { stock: 0, w1: 0, w2: 0 };
    const weekly = weeklyOf(s.w1, s.w2);
    return { ...s, weekly, weeks: weeksOf(s.stock, weekly) };
  };
  const byStock = [...activeStores].sort((a, b) => statOf(b.key).stock - statOf(a.key).stock).map((s) => s.key);
  const byWeeks = [...activeStores].sort((a, b) => statOf(b.key).weeks - statOf(a.key).weeks).map((s) => s.key);
  const coTotalStock = activeStores.reduce((a, s) => a + statOf(s.key).stock, 0);
  const coTotalW1 = activeStores.reduce((a, s) => a + statOf(s.key).w1, 0);
  const coTotalW2 = activeStores.reduce((a, s) => a + statOf(s.key).w2, 0);
  const coWeekly = weeklyOf(coTotalW1, coTotalW2);

  // 지난주 재고: 일별합계 로그(6~9일 전 중 7일 전에 가장 가까운 날) → 없으면 판매이력 재고합계(PIP와 ±20% 안일 때만)
  const pipDate = t(pip.meta?.uploadedAt).slice(0, 10) || now.date;
  const target = addDays(pipDate, -7);
  const totalsByStore = new Map<string, { date: string; stock: number }[]>();
  for (const r of totals) {
    const k = normalizeStoreKey(r.storeName);
    if (!totalsByStore.has(k)) totalsByStore.set(k, []);
    totalsByStore.get(k)!.push({ date: r.date, stock: r.stock });
  }
  const pickPrev = (k: string): { date: string; stock: number } | null => {
    const list = (totalsByStore.get(k) || []).filter((x) => x.date >= addDays(target, -2) && x.date <= addDays(target, 2));
    if (list.length) return list.sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(target)) - Math.abs(Date.parse(b.date) - Date.parse(target)))[0];
    // 판매이력 재고 합계로 대체: 최근 날짜 합계가 PIP 합계와 비슷할 때만(판매이력에 전 SKU 재고가 담겨 있다는 확인)
    let latestD = "";
    for (const key of dhStockByStoreDate.keys()) if (key.startsWith(`${k}|`) && key.slice(k.length + 1) > latestD) latestD = key.slice(k.length + 1);
    const latest = latestD ? dhStockByStoreDate.get(`${k}|${latestD}`) || 0 : 0;
    const pipStock = statOf(k).stock;
    if (!latest || !pipStock || Math.abs(latest / pipStock - 1) > 0.2) return null;
    const d7 = addDays(latestD, -7);
    for (const dd of [d7, addDays(d7, -1), addDays(d7, 1)]) {
      const v = dhStockByStoreDate.get(`${k}|${dd}`);
      if (v) return { date: `${dd}(판매이력)`, stock: v };
    }
    return null;
  };
  const prevs = new Map(activeStores.map((s) => [s.key, pickPrev(s.key)]));
  const prevList = [...prevs.values()].filter(Boolean) as { stock: number }[];
  const avgPrevStock = prevList.length >= Math.ceil(storeCount / 2) ? Math.round(prevList.reduce((a, b) => a + b.stock, 0) / prevList.length) : null;

  // 매장별 결과
  const S = ROUNDING_INV_SETTINGS;
  // 재런칭으로 새 코드가 생긴 예전 품번은 보충 대상에서 뺌(새 코드로 이미 운영)
  const relaunchOld = new Set(RT_SKU_RELAUNCH.map(([, oldCode]) => oldCode.toUpperCase()));
  const results: RoundingInventoryStore[] = [];
  // 신상품: 전사(오프라인) 누적판매(PIP)의 대부분(≥85%)이 최근 3주 판매 = 최근 3주 안에 판매 시작한 품번
  //  (누적판매가 아직 없으면 Style_Launch_Master 입고일로 보조 판정)
  const newStyles = new Set<string>();
  const firstSeen = new Map<string, string>();
  for (const [style, mm] of styleStore) {
    let cum = 0, sold = 0;
    for (const a of mm.values()) { cum += a.cum; sold += a.sold21; }
    if (cum >= 5 && sold >= cum * 0.85) newStyles.add(style);
  }
  for (const [style, d] of launchMap) {
    const ld = t(d).slice(0, 10);
    if (ld >= newSince) { newStyles.add(up(style)); firstSeen.set(up(style), ld); }
  }
  for (const st of stores.values()) {
    const m = skuByStore.get(st.key);
    if (!m) continue;
    const byStyle = new Map<string, Sku[]>();
    for (const s of m.values()) {
      if (!byStyle.has(s.style)) byStyle.set(s.style, []);
      byStyle.get(s.style)!.push(s);
    }
    const ss = statOf(st.key);
    if (!(ss.stock > 0) && !(ss.w1 + ss.w2 > 0)) continue;
    const prev = prevs.get(st.key) || null;

    // ②③ TOP20 품절/품절임박/사이즈깨짐
    const topIssues: RoundingInventoryStore["topIssues"] = [];
    top.forEach(([style, co], i) => {
      const mine = byStyle.get(style) || [];
      const storeStock = mine.reduce((a, s) => a + s.stock, 0);
      const storeQty2w = mine.reduce((a, s) => a + Math.max(0, s.w1) + Math.max(0, s.w2), 0);
      const storeWeekly = weeklyOf(mine.reduce((a, s) => a + s.w1, 0), mine.reduce((a, s) => a + s.w2, 0));
      const notCarried = storeStock === 0 && storeQty2w === 0;
      const skus: RoundingInventoryStore["topIssues"][number]["skus"] = [];
      if (!notCarried) {
        const carriedColors = new Set(mine.filter((s) => s.stock > 0 || s.w1 + s.w2 > 0).map((s) => s.color));
        for (const color of carriedColors) {
          for (const size of coSizes.get(`${style}|${color}`) || []) {
            const s = m.get(`${style}|${color}|${size}`);
            const stock = s?.stock || 0;
            const weekly = s ? weeklyOf(s.w1, s.w2) : 0;
            const weeks = weeksOf(stock, weekly);
            const coQ = coSku.get(`${style}|${color}|${size}`)?.qty2w || 0;
            let type: "품절" | "품절임박" | "사이즈깨짐" | null = null;
            if (stock <= 0 && weekly > 0) type = "품절";
            else if (stock > 0 && weekly > 0 && weeks <= S.shortageWeeks) type = "품절임박";
            else if (stock <= 0 && coQ >= S.sizeBreakMinCompany2w) type = "사이즈깨짐";
            if (!type) continue;
            skus.push({ color, colorName: colorName.get(`${style}|${color}`) || "", size, type, stock, weekly: r1(weekly), weeks, companyQty2w: coQ, warehouse: whSku.get(`${style}|${color}|${size}`) || 0 });
          }
        }
      }
      if (!notCarried && !skus.length) return;
      const order = { 품절: 0, 품절임박: 1, 사이즈깨짐: 2 } as const;
      skus.sort((a, b) => order[a.type] - order[b.type] || b.companyQty2w - a.companyQty2w);
      topIssues.push({
        companyRank: i + 1,
        styleCode: style,
        productName: productName.get(style) || "",
        companyQty2w: co.qty2w,
        companyAvgWeekly: r1(co.qty2w / 2 / storeCount),
        storeWeekly: r1(storeWeekly),
        storeWeeks: weeksOf(storeStock, storeWeekly),
        companyWeeks: weeksOf(co.stock, co.qty2w / 2),
        storeQty2w,
        storeStock,
        notCarried,
        warehouseStyle: whStyle.get(style) || 0,
        skus,
      });
    });

    // ④ 보충 대상
    const boost = [...m.values()]
      .filter((s) => !relaunchOld.has(s.style) && s.stock <= 0 && s.w1 <= 0 && s.w2 <= 0 && s.cumQty >= S.boostMinCumQty)
      .map((s) => ({
        styleCode: s.style,
        productName: productName.get(s.style) || "",
        color: s.color,
        colorName: colorName.get(`${s.style}|${s.color}`) || "",
        size: s.size,
        cumQty: s.cumQty,
        companyQty2w: coSku.get(`${s.style}|${s.color}|${s.size}`)?.qty2w || 0,
        warehouse: whSku.get(`${s.style}|${s.color}|${s.size}`) || 0,
      }))
      // 전사에서 최근 2주 아직 팔리는 SKU만(시즌 지난 품번 제외), 전사 판매 많은 순
      .filter((x) => x.companyQty2w >= 2)
      .sort((a, b) => b.companyQty2w - a.companyQty2w || b.cumQty - a.cumQty)
      .slice(0, S.boostMax);

    // ⑥ 신상품 반응
    const newProducts: RoundingInventoryStore["newProducts"] = [];
    for (const style of newStyles) {
      const ssm = styleStore.get(style);
      const myAgg = ssm?.get(st.key);
      const storeStock = myAgg?.stock || 0;
      const storeSold = myAgg?.sold21 || 0;
      if (storeStock + storeSold <= 0) continue;
      // 전사: 이 품번을 가진(재고 또는 판매) 매장들
      const per: { key: string; st: number; sold: number; stock: number }[] = [];
      for (const [okey, a] of ssm || []) {
        if (!stores.has(okey)) continue;
        if (a.stock + a.sold21 > 0) per.push({ key: okey, st: a.sold21 / (a.sold21 + a.stock), sold: a.sold21, stock: a.stock });
      }
      const coSold = per.reduce((a, x) => a + x.sold, 0);
      const coStock = per.reduce((a, x) => a + x.stock, 0);
      const coST = coSold + coStock > 0 ? coSold / (coSold + coStock) : 0;
      const myST = storeSold / (storeSold + storeStock);
      const rank = [...per].sort((a, b) => b.st - a.st).findIndex((x) => x.key === st.key) + 1;
      const coAvgSold = per.length ? coSold / per.length : 0;
      const low = storeStock >= S.newMinStock && coAvgSold >= S.newMinCompanyAvgSold && myST < coST * S.newLowRatio;
      newProducts.push({
        styleCode: style,
        productName: productName.get(style) || "",
        firstSeen: firstSeen.get(style) || "",
        storeStock,
        storeSold,
        storeSellThrough: Math.round(myST * 1000) / 10,
        companySellThrough: Math.round(coST * 1000) / 10,
        companyAvgSold: per.length ? r1(coSold / per.length) : 0,
        carryingStores: per.length,
        storeSTRank: rank,
        low,
        warehouse: whStyle.get(style) || 0,
      });
    }
    // 저조 먼저 → 전사 반응 큰(매장당 판매 많은) 품번 순
    newProducts.sort((a, b) => Number(b.low) - Number(a.low) || b.companyAvgSold - a.companyAvgSold);

    const skuMap: RoundingInventoryStore["skuMap"] = {};
    for (const s of m.values()) if (s.stock > 0 || s.w1 || s.w2) skuMap[`${s.style}|${s.color}|${s.size}`] = [s.stock, s.w1, s.w2];

    results.push({
      storeName: st.name,
      storeCode: st.code,
      grade: st.grade,
      salesRank: st.rank || null,
      summary: {
        stock: ss.stock,
        w1Qty: ss.w1,
        w2Qty: ss.w2,
        weekly: r1(ss.weekly),
        weeks: ss.weeks,
        stockRank: byStock.indexOf(st.key) + 1,
        weeksRank: byWeeks.indexOf(st.key) + 1,
        storeCount,
        prevStock: prev?.stock ?? null,
        prevStockDate: prev?.date ?? null,
        stockDelta: prev ? ss.stock - prev.stock : null,
        company: {
          avgStock: Math.round(coTotalStock / storeCount),
          avgWeekly: r1(coWeekly / storeCount),
          weeks: weeksOf(coTotalStock, coWeekly),
          totalStock: coTotalStock,
          avgPrevStock,
        },
      },
      topIssues: topIssues.slice(0, S.topIssueStyles),
      boost,
      newProducts: newProducts.slice(0, S.newMax),
      skuMap,
    });
  }

  // 저장: 1행 meta, 이후 [매장키, 조각번호, JSON 조각] — meta에 매장별 행 위치를 적어서 매장 하나만 읽게 함
  const rows: any[][] = [];
  const index: RoundingInventoryMeta["stores"] = {};
  for (const r of results) {
    const json = JSON.stringify(r);
    const parts = Math.ceil(json.length / CHUNK_CHARS) || 1;
    const key = normalizeStoreKey(r.storeName);
    index[key] = { name: r.storeName, startRow: rows.length + 2, rows: parts };
    // 앞에 ' 를 붙여 USER_ENTERED가 조각 앞부분("-12,…" 등)을 숫자/수식으로 바꾸지 않게 함(' 는 저장 안 됨)
    for (let i = 0; i < parts; i++) rows.push([key, i, `'${json.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS)}`]);
  }
  const meta: RoundingInventoryMeta = {
    computedAt: now.label,
    computedDate: now.date,
    anchorDate: anchor,
    week1: `${w1s}~${anchor}`,
    week2: `${w2s}~${w2e}`,
    pipUploadedAt: pip.meta?.uploadedAt || null,
    warehouseUploadedAt: wh.meta?.uploadedAt || null,
    warehouseUsed: whFresh,
    computeMs: Date.now() - t0,
    settings: S,
    stores: index,
  };
  const dbId = getDbSheetId();
  await ensureSheetExistsById(dbId, CACHE_SHEET);
  // meta JSON이 5만자를 넘지 않게(매장 수십 개면 수 KB) — 넘으면 저장 실패를 그대로 알림
  await safeReplaceSheetValuesById(dbId, CACHE_SHEET, [["meta", 0, `'${JSON.stringify(meta)}`], ...rows]);

  // 오늘 PIP 기준 매장별 총재고 기록(지난주 비교용, 실패해도 무시)
  await recordStoreStockDailyTotals(pipDate, pip.rows).catch((e) => console.error("[rounding-inv] 일별합계 기록 실패(무시):", e));

  return { meta, results };
}

async function readMeta(): Promise<RoundingInventoryMeta | null> {
  const rows = await getSheetValuesById(getDbSheetId(), CACHE_SHEET, "A1:C1").catch(() => [] as any[]);
  if (t(rows?.[0]?.[0]) !== "meta") return null;
  try {
    return JSON.parse(t(rows[0][2]));
  } catch {
    return null;
  }
}

function findStoreKey(meta: RoundingInventoryMeta, storeName: string) {
  const k = normalizeStoreKey(storeName);
  if (meta.stores[k]) return k;
  // 이름 표기가 조금 다른 경우(예: "성수 플래그십" vs "성수플래그십점") — 포함 관계로 한 번 더
  return Object.keys(meta.stores).find((x) => x.includes(k) || k.includes(x)) || null;
}

/** 저장분에서 매장 하나 읽기. 오늘 저장분이 없으면(또는 force) 계산 후 반환 */
export async function getRoundingInventory(storeName: string, opts: { force?: boolean } = {}) {
  let meta = opts.force ? null : await readMeta();
  let computedNow = false;
  if (!meta || meta.computedDate !== kstNow().date) {
    const res = await computeRoundingInventory();
    meta = res.meta as RoundingInventoryMeta;
    computedNow = true;
    const key = findStoreKey(meta, storeName);
    const store = key ? (res.results as RoundingInventoryStore[]).find((r) => normalizeStoreKey(r.storeName) === key) || null : null;
    return { meta: slimMeta(meta), store, computedNow };
  }
  const key = findStoreKey(meta, storeName);
  if (!key) return { meta: slimMeta(meta), store: null, computedNow };
  const pos = meta.stores[key];
  const rows = await getSheetValuesById(getDbSheetId(), CACHE_SHEET, `A${pos.startRow}:C${pos.startRow + pos.rows - 1}`);
  const json = rows.filter((r) => t(r[0]) === key).sort((a, b) => n(a[1]) - n(b[1])).map((r) => String(r[2] ?? "")).join("");
  let store: RoundingInventoryStore | null = null;
  try {
    store = JSON.parse(json);
  } catch {
    store = null;
  }
  return { meta: slimMeta(meta), store, computedNow };
}

function slimMeta(meta: RoundingInventoryMeta) {
  const { stores, ...rest } = meta;
  return { ...rest, storeNames: Object.values(stores).map((s) => s.name) };
}
