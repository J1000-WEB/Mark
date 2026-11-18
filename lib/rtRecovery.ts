// MARK 2026-11-18: RT(점포간 이동) 성과 = "기회로스 회수" 분석.
//
// ─────────────────────────────────────────────────────────────────────────────
// 왜 이렇게 보나 (소천님과 정한 기준, 2026-11-18)
//   RT는 창고 가용재고가 없어 발주로 못 채우는 상품을 매장끼리 옮기는 것.
//   그래서 "판매가 늘었나(전주 대비)"가 아니라
//   "RT를 안 했으면 놓쳤을 매출(예상 기회로스)이 얼마였고, RT로 실제 얼마를 만들었나"로 본다.
//   (예전 재고CTRL 성과표 = 받은 매장 실행주 vs 전주 판매증감 → 너무 단순해서 검증이 어려웠음)
//
// 단위: RT 한 건 = RT_Result 한 줄(지시일·보낸매장·받은매장·스타일·칼라·사이즈·수량).
//       같은 지시일·같은 매장쌍·같은 SKU 줄은 수량을 합침.
//
// 기간 (D = RT_Result G열 승인날짜 = 지시일)
//   - 평가기간 W: D+1 ~ D+18 (18일) — 입고까지 약 4일 + 입고 후 2주. 소천님 결정.
//   - 기준기간 B: D-28 ~ D-1 (28일) — 판매속도(수요) 추정용.
//   - 어제까지 데이터만 씀. W가 아직 안 끝났으면 "진행중"(지난 일수만큼만 계산, 예상도 그 일수로).
//
// 계산 (q = RT 수량, S0 = 지시일 받은 매장 그 SKU 재고, T0 = 지시일 보낸 매장 그 SKU 재고)
//   ① 받은 매장 일 판매속도 r (개/일) — 아래 순서로 먼저 되는 것:
//      a. 그 매장·그 SKU, B 중 "재고가 있던 날"(재고>0 또는 판매>0)만으로 계산. 그런 날이 7일 이상일 때.
//      b. 그 매장·같은 스타일(전 칼라·사이즈) B 일평균 × 전사(오프라인) B에서 그 SKU가 스타일 판매에서 차지하는 비중.
//      c. 전사(오프라인) 그 SKU B 일평균 × 그 매장의 B 오프라인 매출 비중.
//   ② 예상 수요 E = r × 평가일수(18).
//   ③ 예상 기회로스(수량) = clamp(E − S0, 0, q)   — RT 없이 기존 재고로 못 채웠을 수요(최대 RT 수량까지).
//   ④ RT 기여 판매(수량) = clamp(A − min(S0, E), 0, q)   — A = W 동안 받은 매장 그 SKU 실판매(반품 차감).
//      (기존 재고로 팔 수 있었던 만큼은 RT 덕이 아니라고 보고 뺌)
//   ⑤ 보낸 매장 포기(수량) = clamp(min(T0, Es) − min(max(T0 − q, 0), Es), 0, q)   — Es = 보낸 매장 판매속도(①과 같은 방식) × 평가일수.
//   ⑥ 금액 = 수량 × 단가. 단가 = W 동안 받은 매장 그 SKU 실판매 평균가 → 없으면 전사 그 SKU B·W 평균가.
//      (실판매가 기준, 정가×수량 추정 금지 원칙)
//   ⑦ 순 회수 매출 = ④금액 − ⑤금액,  회수율 = ④금액 ÷ ③금액(③이 0이면 표시 안 함).
//   ⑧ 기말재고 = D+18(또는 어제) 받은 매장 그 SKU 재고 — 옮긴 물량이 또 묶였는지.
//   판정: 회수율 70%↑ "회수", 30~70% "부분회수", 30% 미만 "미회수", 예상 기회로스 0 "수요없음(판단보류)", 진행중은 "진행중".
//
// 데이터: Daily_Sales_History(매장×SKU×일 판매수량·금액·재고, 2026-09부터 실제 금액), RT_Result(MARK 메인 시트),
//         채널코드→매장명 = getStoreCodeNameMap(객_전주 시트 + 기본 매핑). 오프라인 범위 = 프로모션 결과와 같은 isPromoExcludedStore.
// ─────────────────────────────────────────────────────────────────────────────
import { readDailyHistoryRowsForExactDates } from "@/lib/dailySales";
import { getSheetId, getSpreadsheetTitlesById, readRecentTailRowsById } from "@/lib/googleSheets";
import { getStoreCodeNameMap, normalizeStoreKey } from "@/lib/dataBuilder";
import { loadChannelMaster } from "@/lib/channelMaster";
import { isPromoExcludedStore } from "@/lib/promoReport";

export const RT_EVAL_DAYS = 18;
export const RT_BASE_DAYS = 28;
const MIN_INSTOCK_DAYS = 7;

const t = (v: any) => String(v ?? "").trim();
const n = (v: any) => {
  const x = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};
function addDays(ymd: string, d: number) {
  const x = new Date(`${ymd}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}
function dateRange(a: string, b: string) {
  const out: string[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}
const kstYesterday = () => addDays(new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10), -1);
function normDate(v: any) {
  const s = t(v);
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Math.round((Number(s) - 25569) * 86400000)).toISOString().slice(0, 10);
  const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
}
// 칼라·사이즈 표기 맞춤("0XL"→"XL", "00S"→"S", 공백 제거, 대문자)
const normColor = (v: any) => t(v).toUpperCase().replace(/\s+/g, "");
const normSize = (v: any) => {
  const s = t(v).toUpperCase().replace(/\s+/g, "");
  return /^0+[A-Z]/.test(s) ? s.replace(/^0+/, "") : s;
};
const skuKey = (style: string, color: string, size: string) => `${t(style).toUpperCase()}|${normColor(color)}|${normSize(size)}`;

export type RtLine = { date: string; fromCode: string; toCode: string; from: string; to: string; style: string; color: string; size: string; qty: number };

async function readRtLines(fromDate: string, toDate: string): Promise<RtLine[]> {
  const mainId = getSheetId();
  const titles = await getSpreadsheetTitlesById(mainId).catch(() => [] as string[]);
  if (!titles.includes("RT_Result")) return [];
  const rows = await readRecentTailRowsById(mainId, "RT_Result", "A:H", 20000, 1);
  const codeMap = await getStoreCodeNameMap();
  const nameOf = (code: string) => codeMap.get(code) || codeMap.get(normalizeStoreKey(code)) || code;
  const agg = new Map<string, RtLine>();
  for (const r of rows.slice(1)) {
    const date = normDate(r?.[6]) || normDate(r?.[7]);
    const style = t(r?.[2]).toUpperCase();
    const qty = n(r?.[5]);
    if (!date || !style || !qty || date < fromDate || date > toDate) continue;
    const fromCode = t(r?.[0]), toCode = t(r?.[1]);
    const color = normColor(r?.[3]), size = normSize(r?.[4]);
    const k = [date, fromCode, toCode, style, color, size].join("|");
    const e = agg.get(k) || { date, fromCode, toCode, from: nameOf(fromCode), to: nameOf(toCode), style, color, size, qty: 0 };
    e.qty += qty;
    agg.set(k, e);
  }
  return [...agg.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.to.localeCompare(b.to)));
}

type Cell = { qty: number; amount: number; stock: number | null };

export async function buildRtRecovery(opts: { from?: string; to?: string } = {}) {
  const yesterday = kstYesterday();
  const to = opts.to || yesterday;
  const from = opts.from || addDays(to, -29);
  const lines = await readRtLines(from, to);
  if (!lines.length) return { from, to, evalDays: RT_EVAL_DAYS, baseDays: RT_BASE_DAYS, lines: [], summary: null, note: "기간 안에 RT_Result 지시가 없어요." };

  // 필요한 날짜·키
  const minD = lines.reduce((m, l) => (l.date < m ? l.date : m), lines[0].date);
  const maxD = lines.reduce((m, l) => (l.date > m ? l.date : m), lines[0].date);
  const allDates = dateRange(addDays(minD, -RT_BASE_DAYS), [addDays(maxD, RT_EVAL_DAYS), yesterday].sort()[0]);
  const storeKeyOf = (name: string) => normalizeStoreKey(name);
  const neededStoreSku = new Set<string>(); // storeKey|sku
  const neededSku = new Set<string>();
  const neededStyle = new Set<string>();
  const neededStoreStyle = new Set<string>(); // 받은 매장|스타일
  for (const l of lines) {
    const sk = skuKey(l.style, l.color, l.size);
    neededSku.add(sk);
    neededStyle.add(l.style);
    neededStoreSku.add(`${storeKeyOf(l.to)}|${sk}`);
    neededStoreSku.add(`${storeKeyOf(l.from)}|${sk}`);
    neededStoreStyle.add(`${storeKeyOf(l.to)}|${l.style}`);
  }

  const master = await loadChannelMaster().catch(() => new Map());
  const excluded = new Map<string, boolean>();
  const isOff = (store: string) => {
    let ex = excluded.get(store);
    if (ex === undefined) { ex = isPromoExcludedStore(store, master); excluded.set(store, ex); }
    return !ex;
  };

  // 날짜별 집계
  const storeSkuDay = new Map<string, Map<string, Cell>>(); // storeKey|sku → date → cell
  const storeStyleDay = new Map<string, Map<string, number>>(); // storeKey|style → date → qty
  const coSkuDay = new Map<string, Map<string, { qty: number; amount: number }>>(); // sku → date
  const coStyleDay = new Map<string, Map<string, number>>(); // style → date → qty
  const storeAmtDay = new Map<string, Map<string, number>>(); // storeKey → date → 매출(오프라인)
  const offAmtDay = new Map<string, number>();
  const datesWithData = new Set<string>();
  const bump = <V>(m: Map<string, Map<string, V>>, k: string, d: string, f: (v: V | undefined) => V) => {
    let inner = m.get(k);
    if (!inner) { inner = new Map(); m.set(k, inner); }
    inner.set(d, f(inner.get(d)));
  };

  for (let i = 0; i < allDates.length; i += 7) {
    const chunk = allDates.slice(i, i + 7);
    const rows = await readDailyHistoryRowsForExactDates(chunk);
    for (const r of rows) {
      if (!chunk.includes(r.date) || !isOff(r.storeName)) continue;
      datesWithData.add(r.date);
      const st = storeKeyOf(r.storeName);
      const style = t(r.styleCode).toUpperCase();
      const sk = skuKey(style, r.colorCode, r.size);
      const amt = Number(r.amount) || 0, qty = Number(r.qty) || 0;
      if (amt) {
        bump(storeAmtDay, st, r.date, (v) => (v || 0) + amt);
        offAmtDay.set(r.date, (offAmtDay.get(r.date) || 0) + amt);
      }
      if (neededSku.has(sk) && (qty || amt)) bump(coSkuDay, sk, r.date, (v) => ({ qty: (v?.qty || 0) + qty, amount: (v?.amount || 0) + amt }));
      if (neededStyle.has(style) && qty) bump(coStyleDay, style, r.date, (v) => (v || 0) + qty);
      if (neededStoreStyle.has(`${st}|${style}`) && qty) bump(storeStyleDay, `${st}|${style}`, r.date, (v) => (v || 0) + qty);
      const ssk = `${st}|${sk}`;
      if (neededStoreSku.has(ssk))
        bump(storeSkuDay, ssk, r.date, (v) => ({ qty: (v?.qty || 0) + qty, amount: (v?.amount || 0) + amt, stock: Number.isFinite(Number(r.stock)) ? (v?.stock || 0) + Number(r.stock) : v?.stock ?? null }));
    }
  }

  const sumRange = (m: Map<string, number> | undefined, ds: string[]) => ds.reduce((s, d) => s + (m?.get(d) || 0), 0);
  const stockOn = (cells: Map<string, Cell> | undefined, date: string) => {
    // 그 날짜 이전(포함) 가장 최근 재고
    if (!cells) return 0;
    let best = "", val = 0;
    for (const [d, c] of cells) if (d <= date && d > best && c.stock !== null) { best = d; val = c.stock || 0; }
    return val;
  };

  function rateFor(storeName: string, sk: string, style: string, base: string[]) {
    const st = storeKeyOf(storeName);
    const cells = storeSkuDay.get(`${st}|${sk}`);
    const baseData = base.filter((d) => datesWithData.has(d));
    if (!baseData.length) return { rate: 0, method: "데이터없음" };
    // a. 재고 있던 날만
    let inDays = 0, inQty = 0;
    for (const d of baseData) {
      const c = cells?.get(d);
      if (c && ((c.stock || 0) > 0 || c.qty > 0)) { inDays++; inQty += c.qty; }
    }
    if (inDays >= MIN_INSTOCK_DAYS) return { rate: Math.max(0, inQty) / inDays, method: `매장 SKU(재고있던 ${inDays}일)` };
    // b. 같은 스타일 × 전사 사이즈·칼라 비중
    const styleQty = sumRange(storeStyleDay.get(`${st}|${style}`), baseData);
    const coStyle = sumRange(coStyleDay.get(style), baseData);
    const coSku = baseData.reduce((s, d) => s + (coSkuDay.get(sk)?.get(d)?.qty || 0), 0);
    if (styleQty > 0 && coStyle > 0 && coSku > 0) return { rate: (styleQty / baseData.length) * (coSku / coStyle), method: "매장 스타일×전사 SKU비중" };
    // c. 전사 SKU × 매장 매출 비중
    const storeAmt = sumRange(storeAmtDay.get(st), baseData);
    const offAmt = baseData.reduce((s, d) => s + (offAmtDay.get(d) || 0), 0);
    if (coSku > 0 && storeAmt > 0 && offAmt > 0) return { rate: (coSku / baseData.length) * (storeAmt / offAmt), method: "전사 SKU×매장 비중" };
    return { rate: 0, method: "판매이력없음" };
  }

  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  const out = lines.map((l) => {
    const sk = skuKey(l.style, l.color, l.size);
    const base = dateRange(addDays(l.date, -RT_BASE_DAYS), addDays(l.date, -1));
    const evalEnd = addDays(l.date, RT_EVAL_DAYS);
    const win = dateRange(addDays(l.date, 1), [evalEnd, yesterday].sort()[0]);
    const evalDays = win.length;
    const done = evalEnd <= yesterday;
    const rc = storeSkuDay.get(`${storeKeyOf(l.to)}|${sk}`);
    const sc = storeSkuDay.get(`${storeKeyOf(l.from)}|${sk}`);
    const S0 = Math.max(0, stockOn(rc, l.date));
    const T0 = Math.max(0, stockOn(sc, l.date));
    const rr = rateFor(l.to, sk, l.style, base);
    const sr = rateFor(l.from, sk, l.style, base);
    const E = rr.rate * evalDays;
    const Es = sr.rate * evalDays;
    const A = win.reduce((s, d) => s + (rc?.get(d)?.qty || 0), 0);
    const Aamt = win.reduce((s, d) => s + (rc?.get(d)?.amount || 0), 0);
    const lossQty = clamp(E - S0, 0, l.qty);
    const gainQty = clamp(A - Math.min(S0, E), 0, l.qty);
    const forgoneQty = clamp(Math.min(T0, Es) - Math.min(Math.max(T0 - l.qty, 0), Es), 0, l.qty);
    // 단가: 받은 매장 W 실판매가 → 전사 그 SKU (B+W) 평균가
    let price = A > 0 && Aamt > 0 ? Aamt / A : 0;
    if (!price) {
      let q = 0, a = 0;
      for (const d of [...base, ...win]) { const c = coSkuDay.get(sk)?.get(d); if (c && c.qty > 0) { q += c.qty; a += c.amount; } }
      price = q > 0 ? a / q : 0;
    }
    const lossAmt = Math.round(lossQty * price);
    const gainAmt = Math.round(gainQty * price);
    const forgoneAmt = Math.round(forgoneQty * price);
    const recovery = lossAmt > 0 ? gainAmt / lossAmt : null;
    const endStock = Math.max(0, stockOn(rc, win[win.length - 1] || l.date));
    const verdict = !done ? "진행중" : lossAmt <= 0 ? "수요없음(판단보류)" : recovery! >= 0.7 ? "회수" : recovery! >= 0.3 ? "부분회수" : "미회수";
    return {
      ...l,
      evalStart: win[0] || "",
      evalEnd,
      evalDays,
      done,
      receiverStockAtRt: S0,
      senderStockAtRt: T0,
      receiverRate: +rr.rate.toFixed(3),
      receiverRateMethod: rr.method,
      senderRate: +sr.rate.toFixed(3),
      senderRateMethod: sr.method,
      expectedDemand: +E.toFixed(1),
      actualSold: A,
      price: Math.round(price),
      lossQty: +lossQty.toFixed(1),
      lossAmt,
      gainQty: +gainQty.toFixed(1),
      gainAmt,
      forgoneQty: +forgoneQty.toFixed(1),
      forgoneAmt,
      netAmt: gainAmt - forgoneAmt,
      recovery,
      endStock,
      verdict,
    };
  });

  const doneLines = out.filter((x) => x.done);
  const sum = (arr: typeof out, k: "lossAmt" | "gainAmt" | "forgoneAmt" | "netAmt" | "qty") => arr.reduce((s, x) => s + (x[k] as number), 0);
  const summary = {
    lines: out.length,
    doneLines: doneLines.length,
    rtQty: sum(out, "qty"),
    lossAmt: sum(doneLines, "lossAmt"),
    gainAmt: sum(doneLines, "gainAmt"),
    forgoneAmt: sum(doneLines, "forgoneAmt"),
    netAmt: sum(doneLines, "netAmt"),
    recovery: sum(doneLines, "lossAmt") > 0 ? sum(doneLines, "gainAmt") / sum(doneLines, "lossAmt") : null,
    verdicts: out.reduce((m, x) => ((m[x.verdict] = (m[x.verdict] || 0) + 1), m), {} as Record<string, number>),
  };
  return { from, to, evalDays: RT_EVAL_DAYS, baseDays: RT_BASE_DAYS, yesterday, lines: out, summary, datesRead: allDates.length, datesWithData: datesWithData.size };
}
