// MARK 2026-11-24: 스페셜오퍼위크(SOW) — 상품탭 리뷰 + 재고CTRL 계획(소천님 요청, 팀 "행사실적 리뷰" PPT 2~4쪽 참고).
//  행사 목록 = 세부일정 시트(점포·시작/종료·위치·VMD·MNQ·매대·행거·PT·목표·실적).
//  리뷰: 점포 일별 매출(매출탭 매출_일별_스냅샷) vs 전주 동기간(−7일), 행사기간 판매 상품(PIP 보관 판매_일별, 채널코드로),
//        이월 상세(품번체계 isCarryover — 행사 시작일 기준) — 판매·할인율(실판매가 ÷ PIP 판매가)·소진율(판매 ÷ (판매+종료 재고)).
//  계획: 매출 예측(그 점포 행사 전 8주 같은 요일 평균 × 과거 SOW 증가율) → 투입 목표 = 예측(또는 목표) × 2배,
//        매대 1대 20 바코드 · 행거 1대 8 바코드, 바코드당 5장(창고 가용(오프)이 적으면 있는 만큼), 계절 맞는 이월만(isSeasonAppropriateNow).
import { readSpecialOfferSheet, parseDate } from "@/lib/specialOfferWeek";
import { readSalesSummaryRowsForReports, normalizeStoreKey, readWarehouseStockSnapshot, readStoreStockSnapshot } from "@/lib/dataBuilder";
import { readArchivedSales, readArchivedStock } from "@/lib/pipArchive";
import { readStyleInfo } from "@/lib/weeklyTrend";
import { parseStyleCode, isCarryover, isSeasonAppropriateNow, SEASON_LABEL } from "@/lib/productCode";
import { readProductRefs, buildRefMaps } from "@/lib/productRefs";
import { getDailySourceSheetId, getSpreadsheetTitlesById, getSheetValuesById, getDbSheetId, ensureSheetExistsById, appendValuesById } from "@/lib/googleSheets";
import { pickDailySheetTitle } from "@/lib/dailySales";
import { isKoreanHoliday } from "@/lib/koreanHolidays";

const t = (v: any) => String(v ?? "").trim();
const n = (v: any) => {
  const x = Number(String(v ?? "").replace(/[,\s원]/g, ""));
  return Number.isFinite(x) ? x : 0;
};
const up = (v: any) => t(v).toUpperCase();
const normSize = (v: any) => {
  const s = up(v).replace(/\s+/g, "");
  return /^0+[A-Z]/.test(s) ? s.replace(/^0+/, "") : s;
};
export function addDays(ymd: string, d: number) {
  const x = new Date(`${ymd}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const dateRange = (a: string, b: string) => {
  const out: string[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
};
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

export type SowEvent = {
  id: string; // 세부일정 시트 행 번호
  year: string; month: string; week: string; status: string;
  store: string; start: string; end: string; days: number;
  location: string; vmd: string; mnq: string; desks: number; hangers: number; pt: string;
  target: number; actual: number;
};

/** 세부일정 → 행사 목록(점포·시작일 있는 줄만) */
export async function readSowEvents(): Promise<SowEvent[]> {
  const s = await readSpecialOfferSheet();
  if (s.headerRowIdx < 0) return [];
  const h = s.rows[s.headerRowIdx].map((x: any) => t(x).replace(/\s/g, ""));
  const col = (name: string, fb: number) => {
    const i = h.findIndex((x: string) => x === name || x.includes(name));
    return i >= 0 ? i : fb;
  };
  const c = { year: col("연도", 3), month: col("월", 4), week: col("주차", 5), loc: col("위치", 11), vmd: col("VMD", 12), mnq: col("MNQ", 13), desk: col("매대", 14), hanger: col("행거", 15), pt: col("PT", 16), target: col("목표", 17) };
  const out: SowEvent[] = [];
  for (let i = s.headerRowIdx + 1; i < s.rows.length; i++) {
    const r = s.rows[i] || [];
    const store = t(r[s.storeCol]);
    const ok = (d: string) => /^20[2-3]\d-\d{2}-\d{2}$/.test(d) && !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime());
    let start = parseDate(r[s.startCol]);
    let end = parseDate(r[s.endCol]);
    if (!ok(end)) end = "";
    if (!ok(start)) start = end; // 시작일 칸이 깨진 줄(예: -620045)은 종료일로
    if (!store || !start) continue;
    if (!end || end < start || dateRange(start, end).length > 45) end = start;
    let target = n(r[c.target]);
    if (target > 0 && target < 100000) target *= 1_000_000; // 백만원 단위로 적힌 경우
    out.push({
      id: String(i + 1), year: t(r[c.year]), month: t(r[c.month]), week: t(r[c.week]), status: t(r[s.completedCol]),
      store, start, end, days: dateRange(start, end).length,
      location: t(r[c.loc]), vmd: t(r[c.vmd]), mnq: t(r[c.mnq]), desks: n(r[c.desk]), hangers: n(r[c.hanger]), pt: t(r[c.pt]),
      target, actual: n(r[s.resultCol]),
    });
  }
  return out.sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : a.store.localeCompare(b.store)));
}

// 세부일정 점포명 → 매출탭 점포(이름·채널코드). "커넥트현대 청주" ↔ "현대커넥트 청주점"처럼 글자 순서가 달라도 맞춤.
function buildStoreMatcher(rows: { storeName: string; channelCode?: string }[]) {
  const names = new Map<string, string>(); // 매출탭 이름 → 채널코드
  for (const r of rows) if (r.storeName && !names.has(r.storeName)) names.set(r.storeName, t((r as any).channelCode));
  const list = [...names.keys()];
  const sorted = (x: string) => x.split("").sort().join("");
  return (name: string): { name: string; code: string } | null => {
    const k = normalizeStoreKey(name);
    if (!k) return null;
    let hit = list.find((s) => normalizeStoreKey(s) === k) || list.find((s) => sorted(normalizeStoreKey(s)) === sorted(k));
    if (!hit) {
      const cands = list.filter((s) => {
        const sk = normalizeStoreKey(s);
        return sk.includes(k) || k.includes(sk);
      });
      if (cands.length === 1) hit = cands[0];
    }
    return hit ? { name: hit, code: names.get(hit) || "" } : null;
  };
}

// PIP 시트(최신) — 바코드(스타일|칼라|사이즈)별 이름·소비자가·판매가
type PipInfo = { name: string; colorName: string; consumer: number; price: number };
let pipCache: { at: number; map: Map<string, PipInfo> } | null = null;
async function readPipInfo() {
  if (pipCache && Date.now() - pipCache.at < 30 * 60 * 1000) return pipCache.map;
  const map = new Map<string, PipInfo>();
  try {
    const id = getDailySourceSheetId();
    const title = pickDailySheetTitle(await getSpreadsheetTitlesById(id));
    if (title) {
      const raw = await getSheetValuesById(id, title, "N4:U");
      for (const r of raw) {
        const st = up(r?.[0]);
        if (!st) continue;
        const v = { name: t(r?.[1]), colorName: t(r?.[3]), consumer: n(r?.[6]), price: n(r?.[7]) };
        map.set(`${st}|${up(r?.[2])}|${normSize(r?.[4])}`, v);
        if (!map.has(`${st}||`)) map.set(`${st}||`, v);
        if (!map.has(`${st}|${up(r?.[2])}|`)) map.set(`${st}|${up(r?.[2])}|`, v);
      }
    }
  } catch (e) {
    console.error("SOW PIP 정보 읽기 실패", e);
  }
  pipCache = { at: Date.now(), map };
  return map;
}

const seasonLabelOf = (style: string, ref: Date) => {
  const p = parseStyleCode(style, ref.getFullYear());
  if (!p) return { carry: false, label: "기타", sort: 0 };
  const carry = isCarryover(p, ref);
  const label = carry ? `${String(p.year).slice(2)} ${SEASON_LABEL[p.season]}` : "신상·당시즌";
  return { carry, label, sort: carry ? p.year * 10 + p.season : 99999 };
};

// ============================== 리뷰 ==============================

/** 리뷰할 행사 고르기 — ids 없으면 "가장 최근에 끝난 행사 묶음"(마지막 종료일 기준 10일 안에 끝난 행사, 어제까지 시작한 것) */
function pickEvents(all: SowEvent[], ids: string[] | null) {
  const today = kstToday();
  if (ids && ids.length) return all.filter((e) => ids.includes(e.id));
  const started = all.filter((e) => e.start < today);
  if (!started.length) return [];
  const lastEnd = started.map((e) => (e.end < today ? e.end : addDays(today, -1))).sort().pop()!;
  return started.filter((e) => e.end >= addDays(lastEnd, -10) && e.start <= lastEnd);
}

export async function buildSowReview(opts: { ids?: string[] | null } = {}) {
  const t0 = Date.now();
  const today = kstToday();
  const yesterday = addDays(today, -1);
  const [all, salesRows, info, refs, pip] = await Promise.all([
    readSowEvents(),
    readSalesSummaryRowsForReports(),
    readStyleInfo().catch(() => ({} as Record<string, string[]>)),
    readProductRefs().catch(() => [] as any[]),
    readPipInfo(),
  ]);
  const { mainOf } = buildRefMaps(refs as any);
  const match = buildStoreMatcher(salesRows as any);
  const events = pickEvents(all, opts.ids || null);

  // 매출탭 일별(점포 이름 → 날짜 → 금액)
  const daily = new Map<string, Map<string, number>>();
  for (const r of salesRows as any[]) {
    const m = daily.get(r.storeName) || daily.set(r.storeName, new Map()).get(r.storeName)!;
    m.set(r.date, (m.get(r.date) || 0) + Number(r.amount || 0));
  }

  // 보관 판매: 행사 기간 + 전주 동기간 날짜 전부
  const needDates = new Set<string>();
  const stockDates = new Set<string>();
  const evInfo = events.map((e) => {
    const to = e.end < today ? e.end : yesterday;
    const dates = to >= e.start ? dateRange(e.start, to) : [];
    dates.forEach((d) => (needDates.add(d), needDates.add(addDays(d, -7))));
    stockDates.add(addDays(e.start, -1));
    if (dates.length) stockDates.add(to);
    return { e, to, dates, m: match(e.store) };
  });
  const [{ rows: sales, foundDates }, stockMap] = await Promise.all([
    readArchivedSales([...needDates].sort(), { maxGap: 40 }),
    readArchivedStock([...stockDates].sort()).catch(() => new Map()),
  ]);
  const found = new Set(foundDates);

  const out = evInfo.map(({ e, to, dates, m }) => {
    const code = m?.code || "";
    const dm = m ? daily.get(m.name) : undefined;
    const dayRows = dates.map((d) => {
      const amt = dm?.get(d) || 0;
      const prev = dm?.get(addDays(d, -7)) || 0;
      return { date: d, dow: dow(d), holiday: isKoreanHoliday(d), amt, prev, prevDate: addDays(d, -7) };
    });
    const sum = dayRows.reduce((a, r) => a + r.amt, 0), prevSum = dayRows.reduce((a, r) => a + r.prev, 0);

    // 상품(보관 판매, 이 점포 채널)
    const evSet = new Set(dates), prevSet = new Set(dates.map((d) => addDays(d, -7)));
    const ref = new Date(`${e.start}T00:00:00+09:00`);
    type Agg = { key: string; style: string; color: string; name: string; colorName: string; qty: number; amt: number; pq: number; pa: number; byDay: Record<string, number>; consumerAmt: number; priceAmt: number; carryQty: number };
    const byStyle = new Map<string, Agg>(), byColor = new Map<string, Agg>();
    const add = (map: Map<string, Agg>, key: string, st: string, co: string, r: any, cur: boolean) => {
      let a = map.get(key);
      if (!a) {
        const p = pip.get(`${st}|${co}|`) || pip.get(`${st}||`);
        a = { key, style: st, color: co, name: p?.name || info[st]?.[5] || "", colorName: p?.colorName || "", qty: 0, amt: 0, pq: 0, pa: 0, byDay: {}, consumerAmt: 0, priceAmt: 0, carryQty: 0 };
        map.set(key, a);
      }
      const q = Number(r.qty) || 0, am = Number(r.amount) || 0;
      if (cur) {
        a.qty += q;
        a.amt += am;
        a.byDay[r.date] = (a.byDay[r.date] || 0) + q;
        if (seasonLabelOf(up(r.styleCode), ref).carry) a.carryQty += q; // 재런칭 합산 줄은 실제 판매 품번 기준으로 이월 여부
        const p = pip.get(`${up(r.styleCode)}|${up(r.colorCode)}|${normSize(r.size)}`) || pip.get(`${up(r.styleCode)}||`);
        a.consumerAmt += q * (p?.consumer || 0);
        a.priceAmt += q * (p?.price || 0);
      } else {
        a.pq += q;
        a.pa += am;
      }
    };
    if (code) {
      for (const r of sales) {
        if (String(r.channelCode) !== code) continue;
        const cur = evSet.has(r.date), prv = prevSet.has(r.date);
        if (!cur && !prv) continue;
        const st = up(r.styleCode), co = up(r.colorCode);
        add(byStyle, mainOf(st), mainOf(st), "", r, cur); // 재런칭 구+신 합산
        add(byColor, `${st}|${co}`, st, co, r, cur);
      }
    }
    // 재고(행사 전날·마지막 날) — 품번|칼라
    const stockOf = (d: string) => {
      const mm = new Map<string, number>();
      const s = (stockMap as Map<string, any>).get(d);
      for (const r of s?.rows || []) if (String(r.channelCode) === code) mm.set(`${up(r.styleCode)}|${up(r.colorCode)}`, (mm.get(`${up(r.styleCode)}|${up(r.colorCode)}`) || 0) + Number(r.stock || 0));
      return { m: mm, used: s?.usedDate || "" };
    };
    const s0 = stockOf(addDays(e.start, -1)), s1 = dates.length ? stockOf(to) : { m: new Map<string, number>(), used: "" };

    const styles = [...byStyle.values()].filter((a) => a.qty || a.pq).sort((a, b) => b.amt - a.amt);
    const totQty = styles.reduce((x, a) => x + a.qty, 0), totAmt = styles.reduce((x, a) => x + a.amt, 0);
    const top = styles.slice(0, 10).map((a) => ({ style: a.style, name: a.name, qty: a.qty, amt: a.amt, pq: a.pq, pa: a.pa, share: totAmt ? a.amt / totAmt : 0, byDay: dates.map((d) => a.byDay[d] || 0), carry: a.qty > 0 ? a.carryQty * 2 > a.qty : seasonLabelOf(a.style, ref).carry }));

    // 이월 상세(품번|칼라)
    const colors = [...byColor.values()].map((a) => {
      const sl = seasonLabelOf(a.style, ref);
      const k = `${a.style}|${a.color}`;
      const endStock = s1.m.get(k) ?? null, startStock = s0.m.get(k) ?? null;
      return {
        style: a.style, color: a.color, name: a.name, colorName: a.colorName, season: sl.label, sort: sl.sort, carry: sl.carry,
        qty: a.qty, amt: a.amt, pq: a.pq, pa: a.pa, startStock, endStock,
        avgPrice: a.qty ? a.amt / a.qty : 0,
        discount: a.consumerAmt > 0 ? 1 - a.amt / a.consumerAmt : null, // 소비자가(최초 TAG) 대비
        sellThru: a.qty > 0 && endStock !== null ? a.qty / (a.qty + Math.max(0, endStock)) : null,
      };
    });
    const carryRows = colors.filter((c) => c.carry && (c.qty || c.pq || (c.startStock || 0) > 0));
    const groups = new Map<string, { label: string; sort: number; qty: number; amt: number; pq: number; pa: number; startStock: number; endStock: number; consumerAmt: number }>();
    for (const c of colors) {
      const g = groups.get(c.season) || { label: c.season, sort: c.sort, qty: 0, amt: 0, pq: 0, pa: 0, startStock: 0, endStock: 0, consumerAmt: 0 };
      g.qty += c.qty; g.amt += c.amt; g.pq += c.pq; g.pa += c.pa;
      g.startStock += Math.max(0, c.startStock || 0); g.endStock += Math.max(0, c.endStock || 0);
      g.consumerAmt += c.discount !== null && c.amt ? c.amt / (1 - c.discount) : 0;
      groups.set(c.season, g);
    }
    // 판매 없던 이월 재고도 그룹 재고엔 포함
    for (const [k, v] of s1.m) {
      if (byColor.has(k) || v <= 0) continue;
      const sl = seasonLabelOf(k.split("|")[0], ref);
      const g = groups.get(sl.label) || { label: sl.label, sort: sl.sort, qty: 0, amt: 0, pq: 0, pa: 0, startStock: 0, endStock: 0, consumerAmt: 0 };
      g.endStock += v;
      g.startStock += Math.max(0, s0.m.get(k) || 0);
      groups.set(sl.label, g);
    }
    const carryAmt = colors.filter((c) => c.carry).reduce((x, c) => x + c.amt, 0);
    const carryQty = colors.filter((c) => c.carry).reduce((x, c) => x + c.qty, 0);
    const carryPrev = colors.filter((c) => c.carry).reduce((x, c) => x + c.pa, 0);

    return {
      event: e,
      matched: m,
      period: { from: e.start, to, done: e.end < today, days: dates.length, missingDates: dates.filter((d) => !found.has(d)) },
      daily: dayRows,
      sum, prevSum,
      products: { totQty, totAmt, styleCount: styles.length, top },
      carry: {
        amt: carryAmt, qty: carryQty, prevAmt: carryPrev, share: totAmt ? carryAmt / totAmt : 0,
        groups: [...groups.values()].sort((a, b) => b.sort - a.sort).map((g) => ({ ...g, discount: g.consumerAmt > 0 ? 1 - g.amt / g.consumerAmt : null, sellThru: g.qty + g.endStock > 0 ? g.qty / (g.qty + g.endStock) : null })),
        rows: carryRows.sort((a, b) => b.amt - a.amt || (b.endStock || 0) - (a.endStock || 0)).slice(0, 300),
        stockDates: { start: s0.used, end: s1.used },
      },
    };
  });

  const upcoming = all.filter((e) => e.start >= today).sort((a, b) => (a.start < b.start ? -1 : 1)).slice(0, 8);
  return {
    asOf: yesterday,
    events: out,
    list: all.map((e) => ({ id: e.id, store: e.store, start: e.start, end: e.end, status: e.status, target: e.target, actual: e.actual })),
    upcoming,
    ms: Date.now() - t0,
  };
}

// ============================== 계획(투입 추천) ==============================

export type SowPlanOpts = {
  id: string; // 세부일정 행
  basis?: "forecast" | "target";
  ratio?: number; // 투입 ÷ 매출 (기본 2)
  perSku?: number; // 바코드당 장수(기본 5)
  deskSku?: number; // 매대 1대 바코드 수(20)
  hangerSku?: number; // 행거 1대 바코드 수(8)
  desks?: number; hangers?: number; // 시트 값 대신
  exclude?: string[]; // 품목 제외(기본 ACC·기타·SHOES·SWIM)
  layoutMode?: "sku" | "price"; // 배치 기준: sku = 칸당 바코드 수 지킴(가격 섞일 수 있음) / price = 한 칸 한 가격(바코드 수 조금 넘거나 가격 단계 합침)
  tol?: number; // 가격 우선일 때 칸당 바코드 초과 허용(%, 기본 20)
};

const HANGER_CATS = /OUTER|아우터/i; // 행거 = 아우터(코트·자켓·점퍼 등), 나머지는 매대

/** 점포 기준선 = 시작 전 8주 같은 요일 평균(0원·공휴일 제외) */
function baselineFor(dm: Map<string, number> | undefined, date: string, before: string) {
  if (!dm) return 0;
  const xs: number[] = [];
  for (let w = 1; w <= 8; w++) {
    const d = addDays(date, -7 * w);
    if (d >= before) continue;
    const v = dm.get(d) || 0;
    if (v > 0 && !isKoreanHoliday(d)) xs.push(v);
  }
  // 행사일이 기준선 날짜보다 너무 미래면(예: 2주 뒤 행사) 시작 전 8주 같은 요일로 다시
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// ---- SOW 가격조정 이력(MARK_DB "SOW_가격조정이력") — 팀이 행사 때 낸 가격조정 엑셀(의정부 10/30·영등포 11/12·청주 11/13·서울역 11/16)에서 시작
const PRICE_TAB = "SOW_가격조정이력";
const PRICE_HEADER = ["적용일", "점포", "스타일", "스타일명", "소비자가", "행사가", "저장시각"];
// 팀이 쓰는 행사가 단계(위 4개 파일에 나온 값) — 비슷한 가격끼리 묶어 매대 가격을 맞추려고 이 단계 중 하나로 맞춤
export const SOW_PRICE_TIERS = [9900, 16000, 18000, 20000, 25000, 30000, 35000, 40000, 49000, 59000, 75000, 88000, 99000, 129000, 159000];
const SOW_PRICE_RATIO = 0.54; // 4개 파일 129줄 행사가 ÷ 소비자가 중앙값

export async function readSowPriceHistory() {
  const id = getDbSheetId();
  await ensureSheetExistsById(id, PRICE_TAB, PRICE_HEADER);
  const vals = await getSheetValuesById(id, PRICE_TAB, "A:G").catch(() => [] as any[][]);
  return vals.slice(1).filter((r) => t(r?.[2])).map((r) => ({ date: t(r[0]), store: t(r[1]), style: up(r[2]), name: t(r[3]), consumer: n(r[4]), price: n(r[5]) }));
}
export async function appendSowPriceHistory(rows: { date: string; store: string; style: string; name?: string; consumer: number; price: number }[]) {
  const id = getDbSheetId();
  await ensureSheetExistsById(id, PRICE_TAB, PRICE_HEADER);
  const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
  const vals = rows.filter((r) => r.style && r.price > 0).map((r) => [r.date, r.store, up(r.style), r.name || "", r.consumer || "", r.price, stamp]);
  if (vals.length) await appendValuesById(id, `'${PRICE_TAB}'!A:G`, vals);
  return vals.length;
}

/** 행사가 제안: ① 지난 SOW 때 같은 품번 행사가(가장 최근) ② 없으면 소비자가 × 0.54를 가장 가까운 단계로(현재 판매가보다 높으면 그 아래 단계) */
// ⚠ 팀 가격조정 파일의 "소비자가"는 PIP 판매가(현재 조정된 가격)와 같음(예: WBE3L10511 214,000 = PIP 판매가, 최초 TAG는 269,000) → 기준 = 현재 판매가
function suggestPrice(consumer: number, current: number, hist?: { price: number; date: string; store: string }) {
  if (hist && hist.price > 0) return { price: hist.price, why: `지난 행사가(${hist.store} ${hist.date.slice(5)})` };
  const base = current || consumer;
  if (!base) return { price: 0, why: "가격 정보 없음" };
  const target = base * SOW_PRICE_RATIO;
  let best = SOW_PRICE_TIERS[0];
  for (const x of SOW_PRICE_TIERS) if (Math.abs(x - target) < Math.abs(best - target)) best = x;
  if (current > 0 && best > current) best = [...SOW_PRICE_TIERS].reverse().find((x) => x <= current) || current;
  return { price: best, why: `현재가×${SOW_PRICE_RATIO} → ${best.toLocaleString("ko-KR")} 단계` };
}

/** 매대·행거 배치: 행사가 높은 순으로 품번칼라를 칸(매대 20·행거 8 바코드)에 채움. 가격이 바뀔 때 지금 칸이 절반 이상 찼으면 새 칸 → "3만원 매대"처럼 가격을 맞춤.
 *  그렇게 했을 때 칸 수가 모자라면 가격을 섞어 빈틈없이 채움. */
function layoutFixtures(items: any[], perFixture: number, count: number, kind: "매대" | "행거") {
  const pack = (breakOnPrice: boolean) => {
    const fx: { no: number; items: any[]; used: number }[] = [];
    let cur: { no: number; items: any[]; used: number } | null = null;
    for (const it of items) {
      const need = it.skus.length;
      const lastPrice = cur?.items[cur.items.length - 1]?.sowPrice;
      const priceBreak = breakOnPrice && cur && cur.items.length && lastPrice !== it.sowPrice && cur.used >= perFixture / 2;
      if (!cur || cur.used + need > perFixture || priceBreak) {
        cur = { no: fx.length + 1, items: [], used: 0 };
        fx.push(cur);
      }
      cur.items.push(it);
      cur.used += need;
    }
    return fx;
  };
  // 칸이 모자라면 ① 가격 순서는 지키되 앞 칸 빈자리부터 채우고(first-fit) ② 그래도 모자라면 품번칼라 사이즈를 나눠 빈자리에 넣음
  const firstFit = (split: boolean) => {
    const fx: { no: number; items: any[]; used: number }[] = [];
    for (const it of items) {
      let rest = it.skus;
      while (rest.length) {
        let f = fx.find((x) => x.used + rest.length <= perFixture);
        if (!f && split) f = fx.find((x) => x.used < perFixture && fx.length >= count);
        if (!f) {
          f = { no: fx.length + 1, items: [], used: 0 };
          fx.push(f);
        }
        const take = Math.min(rest.length, perFixture - f.used);
        const part = take === rest.length ? { ...it, skus: rest } : { ...it, skus: rest.slice(0, take), qty: rest.slice(0, take).reduce((a: number, k: any) => a + k.qty, 0) };
        f.items.push(part);
        f.used += take;
        rest = rest.slice(take);
      }
    }
    return fx;
  };
  let fx = pack(true);
  let mixed = false;
  if (fx.length > count) {
    fx = firstFit(false);
    mixed = true;
    if (fx.length > count) fx = firstFit(true);
  }
  return fx.map((f) => {
    const prices = [...new Set(f.items.map((i) => i.sowPrice))].sort((a, b) => b - a);
    return { kind, no: f.no, used: f.used, cap: perFixture, prices, label: `${kind} ${f.no} — ${prices.map((p) => `${(p / 10000).toLocaleString("ko-KR")}만원`).join("·")}`, items: f.items, mixed };
  });
}

/** 가격 우선 배치(2026-11-24 소천님): 한 칸엔 한 가격만.
 *  ① 가격 단계마다 칸 수 = ceil(바코드 ÷ 칸당 바코드), 단 칸당 바코드를 tol% 넘겨서 한 칸 줄일 수 있으면 줄임
 *  ② 그래도 칸이 모자라면 바코드가 가장 적은 가격 단계를 바로 아래 단계로 합침(행사가를 내림, 가장 싼 단계면 위 단계로) — 칸 수에 맞을 때까지
 *  ③ 단계 하나만 남았는데도 모자라면 칸 수에 맞춰 바코드를 나눠 담음(칸당 바코드 초과) */
function layoutFixturesByPrice(items: any[], perFixture: number, count: number, kind: "매대" | "행거", tolPct: number) {
  const tol = Math.max(0, tolPct) / 100;
  const groups = new Map<number, any[]>();
  for (const it of items) (groups.get(it.sowPrice) || groups.set(it.sowPrice, []).get(it.sowPrice)!).push(it);
  const n = (g: any[]) => g.reduce((s, it) => s + it.skus.length, 0);
  const need = (g: any[], withTol: boolean) => {
    const c = n(g);
    let k = Math.max(1, Math.ceil(c / perFixture));
    if (withTol) while (k > 1 && c <= (k - 1) * perFixture * (1 + tol)) k--;
    return k;
  };
  const total = (withTol: boolean) => [...groups.values()].reduce((s, g) => s + need(g, withTol), 0);
  const merged: { from: number; to: number; n: number }[] = [];
  let withTol = total(false) > count;
  while (withTol && total(true) > count && groups.size > 1) {
    const tiers = [...groups.keys()].sort((a, b) => b - a);
    const small = tiers.reduce((m, p) => (n(groups.get(p)!) < n(groups.get(m)!) ? p : m), tiers[0]);
    const i = tiers.indexOf(small);
    const to = i < tiers.length - 1 ? tiers[i + 1] : tiers[i - 1];
    for (const it of groups.get(small)!) {
      it.priceWhy = `${it.priceWhy || ""} → ${to.toLocaleString("ko-KR")}로 맞춤(가격 우선 배치)`;
      it.sowPrice = to;
      it.discount = (it.current || it.consumer) ? 1 - to / (it.current || it.consumer) : null;
    }
    merged.push({ from: small, to, n: n(groups.get(small)!) });
    groups.get(to)!.push(...groups.get(small)!);
    groups.delete(small);
  }
  const tiers = [...groups.keys()].sort((a, b) => b - a);
  const ks = tiers.map((p) => need(groups.get(p)!, withTol));
  // 단계 하나로도 모자라면 칸 수만큼으로 줄임(남는 칸이 있으면 큰 단계에 칸을 더 줘서 바코드 수를 맞춤)
  while (ks.reduce((a, b) => a + b, 0) > count && ks.some((k) => k > 1)) ks[ks.indexOf(Math.max(...ks))]--;
  const fx: any[] = [];
  tiers.forEach((p, ti) => {
    const g = groups.get(p)!.slice().sort((a, b) => (b.sowQty || 0) - (a.sowQty || 0));
    const k = ks[ti];
    const per = Math.ceil(n(g) / k);
    let cur: any = null;
    for (const it of g) {
      if (!cur || (cur.used && cur.used + it.skus.length > per && fx.filter((f) => f.price === p).length < k)) {
        cur = { no: fx.length + 1, items: [], used: 0, price: p };
        fx.push(cur);
      }
      cur.items.push(it);
      cur.used += it.skus.length;
    }
  });
  return {
    merged,
    fx: fx.map((f) => ({ kind, no: f.no, used: f.used, cap: perFixture, prices: [f.price], label: `${kind} ${f.no} — ${(f.price / 10000).toLocaleString("ko-KR")}만원`, items: f.items, mixed: false, over: f.used > perFixture })),
  };
}

export async function buildSowPlan(o: SowPlanOpts) {
  const t0 = Date.now();
  const today = kstToday();
  const [all, salesRows, info, wh, storeStock, pip, refs] = await Promise.all([
    readSowEvents(),
    readSalesSummaryRowsForReports(),
    readStyleInfo().catch(() => ({} as Record<string, string[]>)),
    readWarehouseStockSnapshot(),
    readStoreStockSnapshot().catch(() => ({ rows: [] as any[], meta: null })),
    readPipInfo(),
    readProductRefs().catch(() => [] as any[]),
  ]);
  const priceHist = new Map<string, { price: number; date: string; store: string }>();
  for (const h of await readSowPriceHistory().catch(() => [] as any[])) {
    const cur = priceHist.get(h.style);
    if (!cur || h.date > cur.date) priceHist.set(h.style, { price: h.price, date: h.date, store: h.store });
  }
  // 2026-11-24 소천님: 러닝의 예전(구)품번도 출고 후보에서 빼야 함(예: WBD3L04501·WBD3L04503 = GF7LKC501·503의 구품번).
  // 러닝 묶음 = 상품_기준표 재런칭(새↔예전) + 보관 상품정보 P열 통합품번이 자기와 다른 품번·그 통합품번
  const runningFamily = new Set<string>(buildRefMaps(refs as any).relaunch);
  for (const [st, v] of Object.entries(info)) {
    const main = up(v[7]);
    if (main && main !== st) {
      runningFamily.add(st);
      runningFamily.add(main);
    }
  }
  const ev = all.find((e) => e.id === String(o.id));
  if (!ev) throw new Error("행사를 찾지 못했어요(세부일정 행 번호 확인).");
  const match = buildStoreMatcher(salesRows as any);
  const daily = new Map<string, Map<string, number>>();
  for (const r of salesRows as any[]) {
    const m = daily.get(r.storeName) || daily.set(r.storeName, new Map()).get(r.storeName)!;
    m.set(r.date, (m.get(r.date) || 0) + Number(r.amount || 0));
  }

  // ---- 매출 예측: 기준선 × 증가율(과거 SOW 실적 ÷ 그때 기준선)
  const baseCut = (e: SowEvent) => (e.start <= today ? e.start : today); // 기준선은 시작 전(또는 오늘 전) 8주
  const baseOf = (e: SowEvent) => {
    const m = match(e.store);
    const dm = m ? daily.get(m.name) : undefined;
    const cut = baseCut(e);
    // 미래 행사는 "가장 최근 같은 요일" 8주로
    return dateRange(e.start, e.end).map((d) => {
      let ref = d;
      while (ref >= cut) ref = addDays(ref, -7);
      return { date: d, base: baselineFor(dm, addDays(ref, 7), cut) };
    });
  };
  const past = all.filter((e) => e.end < today && e.start >= addDays(today, -400) && e.id !== ev.id);
  const lifts: { id: string; store: string; start: string; end: string; actual: number; base: number; lift: number; same: boolean }[] = [];
  for (const e of past) {
    const m = match(e.store);
    const dm = m ? daily.get(m.name) : undefined;
    if (!dm) continue;
    const act = dateRange(e.start, e.end).reduce((a, d) => a + (dm.get(d) || 0), 0);
    const base = baseOf(e).reduce((a, x) => a + x.base, 0);
    if (act > 0 && base > 0) lifts.push({ id: e.id, store: e.store, start: e.start, end: e.end, actual: act, base, lift: act / base, same: !!(m && match(ev.store)?.name === m.name) });
  }
  const median = (xs: number[]) => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  const sameStore = lifts.filter((l) => l.same);
  const liftAll = median(lifts.map((l) => l.lift));
  const lift = sameStore.length ? (median(sameStore.map((l) => l.lift)) * sameStore.length + liftAll) / (sameStore.length + 1) : liftAll || 1;
  const days = baseOf(ev).map((x) => ({ ...x, dow: dow(x.date), forecast: x.base * lift }));
  const baseSum = days.reduce((a, x) => a + x.base, 0);
  const forecast = baseSum * lift;

  const ratio = o.ratio && o.ratio > 0 ? o.ratio : 1.75; // 2026-11-24 소천님: 재고 배수 1.75배
  const basis = o.basis === "target" && ev.target > 0 ? "target" : "forecast";
  const goalAmt = (basis === "target" ? ev.target : forecast) * ratio;

  // ---- 진열 용량
  const desks = o.desks ?? ev.desks;
  const hangers = o.hangers ?? ev.hangers;
  const deskSku = o.deskSku || 20, hangerSku = o.hangerSku || 8, perSku = o.perSku || 5;
  const cap = { desk: desks * deskSku, hanger: hangers * hangerSku };

  // ---- 후보: 창고 가용(오프) 있는 바코드 중 "행사 시작일 기준 이월 + 지금 계절에 맞는 시즌"
  const ref = new Date(`${ev.start}T00:00:00+09:00`);
  const exclude = new Set((o.exclude || ["ACC", "기타", "SHOES", "SWIM"]).map((x) => x.toUpperCase()));
  const m = match(ev.store);
  const storeKey = m ? normalizeStoreKey(m.name) : normalizeStoreKey(ev.store);
  const storeHave = new Map<string, number>();
  for (const r of storeStock.rows as any[]) {
    if (normalizeStoreKey(r.storeName) !== storeKey) continue;
    const k = `${up(r.styleCode)}|${up(r.color)}|${normSize(r.size)}`;
    storeHave.set(k, (storeHave.get(k) || 0) + Number(r.stock || 0));
  }
  type Sku = { style: string; color: string; size: string; barcode: string; avail: number; qty: number; baseQty: number; price: number; consumer: number; storeStock: number };
  const groups = new Map<string, { style: string; color: string; name: string; colorName: string; cat: string; bok: string; item: string; season: string; slot: "desk" | "hanger"; skus: Sku[]; avail: number }>();
  for (const r of wh.rows as any[]) {
    const avail = Number(r.offlineStock || 0);
    if (avail <= 0) continue;
    const st = up(r.styleCode), co = up(r.color), sz = normSize(r.size);
    const p = parseStyleCode(st, ref.getFullYear());
    // 러닝(신품번 시즌자리 5~8)은 계속 파는 상품이라 이월 행사 후보에서 뺌(소천님: 계절 맞는 이월만)
    if (!p || p.isRunning || runningFamily.has(st) || !isCarryover(p, ref) || !isSeasonAppropriateNow(p.season, ref)) continue;
    const inf = info[st] || [];
    const cat = up(inf[0]);
    if (exclude.has(cat)) continue;
    const k = `${st}|${co}`;
    const pi = pip.get(`${st}|${co}|${sz}`) || pip.get(`${st}|${co}|`) || pip.get(`${st}||`);
    const g = groups.get(k) || { style: st, color: co, name: pi?.name || inf[5] || "", colorName: pi?.colorName || "", cat: inf[0] || "", bok: inf[1] || "", item: inf[2] || "", season: `${String(p.year).slice(2)} ${SEASON_LABEL[p.season]}`, slot: HANGER_CATS.test(cat) ? "hanger" : "desk", skus: [], avail: 0 };
    g.skus.push({ style: st, color: co, size: sz, barcode: t(r.barcode), avail, qty: Math.min(perSku, avail), baseQty: Math.min(perSku, avail), price: pi?.price || 0, consumer: pi?.consumer || 0, storeStock: storeHave.get(`${st}|${co}|${sz}`) || 0 });
    g.avail += avail;
    groups.set(k, g);
  }

  // ---- 순위: 과거 SOW(최근 120일) 행사 기간 판매 수량(전 점포) → 최근 28일 오프라인 판매 → 창고 가용
  const recentEvents = all.filter((e) => e.end < today && e.start >= addDays(today, -120));
  const sowDates = new Set<string>();
  for (const e of recentEvents) dateRange(e.start, e.end).forEach((d) => sowDates.add(d));
  const recent28 = dateRange(addDays(today, -28), addDays(today, -1));
  const codeOfEvent = new Map<string, Set<string>>(); // 날짜 → 그날 SOW 중이던 채널코드
  for (const e of recentEvents) {
    const c = match(e.store)?.code;
    if (!c) continue;
    for (const d of dateRange(e.start, e.end)) (codeOfEvent.get(d) || codeOfEvent.set(d, new Set()).get(d)!).add(c);
  }
  const { rows: hist } = await readArchivedSales([...new Set([...sowDates, ...recent28])].sort(), { maxGap: 60 });
  const sowQty = new Map<string, number>(), recQty = new Map<string, number>();
  const r28 = new Set(recent28);
  for (const r of hist) {
    if (r.team !== "오프라인팀") continue;
    const k = `${up(r.styleCode)}|${up(r.colorCode)}`;
    if (!groups.has(k)) continue;
    if (codeOfEvent.get(r.date)?.has(String(r.channelCode))) sowQty.set(k, (sowQty.get(k) || 0) + (Number(r.qty) || 0));
    if (r28.has(r.date)) recQty.set(k, (recQty.get(k) || 0) + (Number(r.qty) || 0));
  }
  const ranked = [...groups.entries()]
    .map(([k, g]) => ({ k, g, sow: sowQty.get(k) || 0, rec: recQty.get(k) || 0 }))
    .sort((a, b) => b.sow - a.sow || b.rec - a.rec || b.g.avail - a.g.avail);

  // ---- 채우기: 매대·행거 칸(바코드 수)이 남고 투입 금액이 목표(×배수)에 못 미치는 동안
  const used = { desk: 0, hanger: 0 };
  let amt = 0, qty = 0;
  const picked: any[] = [];
  // 행거(아우터)를 먼저 칸만큼 채우고, 매대는 투입 목표 금액까지(칸이 남으면 남은 대로)
  const order = [...ranked.filter((x) => x.g.slot === "hanger"), ...ranked.filter((x) => x.g.slot === "desk")];
  for (const x of order) {
    const slot = x.g.slot;
    if (slot === "desk" && amt >= goalAmt && goalAmt > 0) break;
    const skus = x.g.skus.sort((a, b) => a.size.localeCompare(b.size, "en", { numeric: true }));
    if (used[slot] + skus.length > cap[slot]) continue;
    used[slot] += skus.length;
    const a = skus.reduce((s, k) => s + k.qty * k.price, 0);
    const q = skus.reduce((s, k) => s + k.qty, 0);
    amt += a;
    qty += q;
    picked.push({ ...x.g, skus, sowQty: x.sow, recentQty: x.rec, qty: q, amt: a, consumerAmt: skus.reduce((s, k) => s + k.qty * k.consumer, 0) });
    if (used.desk >= cap.desk && used.hanger >= cap.hanger) break;
  }
  // 2026-11-24 소천님: 칸×바코드당 장수 = 기초 재고. 그래도 투입 목표(현재 판매가 기준)에 못 미치면 같은 바코드를 유지한 채
  // 수량을 1장씩 더 얹음(순위 높은 품번칼라부터 돌아가며, 창고 가용까지).
  const baseAmt = amt, baseQtySum = qty;
  if (goalAmt > 0 && amt < goalAmt) {
    let progressed = true;
    while (amt < goalAmt && progressed) {
      progressed = false;
      for (const p of picked) {
        for (const k of p.skus as Sku[]) {
          if (amt >= goalAmt) break;
          if (k.qty >= k.avail || !k.price) continue;
          k.qty += 1;
          p.qty += 1;
          p.amt += k.price;
          p.consumerAmt += k.consumer;
          amt += k.price;
          qty += 1;
          progressed = true;
        }
        if (amt >= goalAmt) break;
      }
    }
  }
  picked.sort((a, b) => (a.slot === b.slot ? 0 : a.slot === "hanger" ? -1 : 1));
  const store = m;
  // ---- 행사가 제안(품번 단위, 칼라 공통) + 매대·행거 배치(2026-11-24 소천님)
  for (const p of picked) {
    const k0 = p.skus[0] || {};
    const sg = suggestPrice(k0.consumer || 0, k0.price || 0, priceHist.get(p.style));
    p.sowPrice = sg.price;
    p.priceWhy = sg.why;
    p.consumer = k0.consumer || 0;
    p.current = k0.price || 0;
    p.discount = (p.current || p.consumer) ? 1 - p.sowPrice / (p.current || p.consumer) : null; // 현재가 대비
  }
  // 바코드가 아주 적은 가격 단계(3개 미만)는 바로 아래 단계로 합쳐 가격 종류를 줄임(지난 행사가 있는 품번은 그대로)
  for (const slot of ["desk", "hanger"] as const) {
    const cnt = new Map<number, number>();
    for (const p of picked.filter((x) => x.slot === slot)) cnt.set(p.sowPrice, (cnt.get(p.sowPrice) || 0) + p.skus.length);
    const tiers = [...cnt.keys()].sort((a, b) => b - a);
    for (const p of picked.filter((x) => x.slot === slot)) {
      if ((cnt.get(p.sowPrice) || 0) >= 3 || priceHist.has(p.style)) continue;
      const lower = tiers.find((x) => x < p.sowPrice && (cnt.get(x) || 0) >= 3);
      if (lower) {
        p.sowPrice = lower;
        p.priceWhy += ` → ${lower.toLocaleString("ko-KR")}로 맞춤(가격 종류 줄이기)`;
        p.discount = (p.current || p.consumer) ? 1 - lower / (p.current || p.consumer) : null;
      }
    }
  }
  const byPrice = (a: any, b: any) => b.sowPrice - a.sowPrice || (b.sowQty || 0) - (a.sowQty || 0);
  const layoutMode = o.layoutMode === "price" ? "price" : "sku";
  const tol = o.tol ?? 20;
  const priceMerges: { kind: string; from: number; to: number; n: number }[] = [];
  const lay = (slot: "hanger" | "desk", per: number, cnt: number, kind: "매대" | "행거") => {
    const its = picked.filter((p) => p.slot === slot).sort(byPrice);
    if (layoutMode === "sku") return layoutFixtures(its, per, cnt, kind);
    const r = layoutFixturesByPrice(its, per, cnt, kind, tol);
    priceMerges.push(...r.merged.map((x) => ({ kind, ...x })));
    return r.fx;
  };
  const layout = [...lay("hanger", hangerSku, hangers, "행거"), ...lay("desk", deskSku, desks, "매대")].map((f) => ({ ...f, items: f.items.map((p: any) => ({ style: p.style, color: p.color, name: p.name, colorName: p.colorName, cat: p.cat, bok: p.bok, season: p.season, consumer: p.consumer, current: p.current, sowPrice: p.sowPrice, discount: p.discount, qty: p.qty, sizes: p.skus.map((k: any) => ({ size: k.size, qty: k.qty, barcode: k.barcode })) })) }));
  const priceList = [...new Map(picked.map((p) => [p.style, p])).values()]
    .sort((a, b) => b.sowPrice - a.sowPrice || a.style.localeCompare(b.style))
    .map((p) => ({ style: p.style, name: p.name, consumer: p.consumer, current: p.current, sowPrice: p.sowPrice, discount: p.discount, cat: p.cat, why: p.priceWhy }));
  const sowValue = picked.reduce((s, p) => s + p.sowPrice * p.qty, 0);

  const upload = picked.flatMap((p) => p.skus.map((k: Sku) => ({ 채널: store?.code || "", 바코드: k.barcode, 출고차수: "1", 의뢰수량: k.qty, 대분류: "", 비고: `SOW ${ev.start.slice(5)}~${ev.end.slice(5)} ${p.slot === "hanger" ? "행거" : "매대"}` })));

  return {
    event: ev,
    store,
    forecast: { baseSum, lift, liftAll, sameStoreLifts: sameStore, lifts: lifts.sort((a, b) => (a.start < b.start ? 1 : -1)).slice(0, 30), days, amount: forecast },
    basis, ratio, goalAmt,
    capacity: { desks, hangers, deskSku, hangerSku, perSku, desk: cap.desk, hanger: cap.hanger, usedDesk: used.desk, usedHanger: used.hanger },
    plan: { amt, qty, baseAmt, baseQty: baseQtySum, addAmt: amt - baseAmt, addQty: qty - baseQtySum, consumerAmt: picked.reduce((s, p) => s + p.consumerAmt, 0), styles: picked.length, ratioToForecast: forecast ? amt / forecast : 0, ratioToTarget: ev.target ? amt / ev.target : 0 },
    picked,
    layout,
    layoutMode,
    tol,
    priceMerges,
    priceList,
    sowValue,
    candidates: ranked.length,
    upload,
    inputs: { warehouse: (wh as any).meta?.uploadedAt || "", storeStock: (storeStock as any).meta?.uploadedAt || "", sowHistoryEvents: recentEvents.length },
    ms: Date.now() - t0,
  };
}
