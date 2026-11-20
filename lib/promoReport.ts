// MARK 2026-11-17: 주간 IMC 프로모션 결과 리포트 — 팀이 매주 월요일 엑셀로 만들던 "N월 N주차 판매실적"의 "프로모션총요약"을
// 대시보드 데이터(Daily_Sales_History)로 계산. 품번 목록은 MARK_DB "프로모션_품번"(lib/promoGroups.ts).
// 범위: 오프라인 채널(위탁·면세 포함) — 온라인·글로벌·기타·매장주문·매장반품은 뺌(팀 파일 판매DB와 같은 범위).
import { readDailyHistoryRowsForExactDates, isOnlineChannel } from "@/lib/dailySales";
import { loadChannelMaster } from "@/lib/channelMaster";
import { getDailySourceSheetId, getSpreadsheetTitlesById, getSheetValuesById } from "@/lib/googleSheets";
import { pickDailySheetTitle } from "@/lib/dailySales";
import { readPromoItems, type PromoItem } from "@/lib/promoGroups";
import { readArchivedSales } from "@/lib/pipArchive";

// 2026-09-01 전 날짜는 PIP 과거 보관 시트(MARK_PIP_ARCHIVE)에서 읽음 — Daily_Sales_History는 2026-06-09부터 있지만 8월까지 금액이 추정치.
const ARCHIVE_BEFORE = "2026-09-01";

const t = (v: any) => String(v ?? "").trim();
const n = (v: any) => {
  const x = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};

function addDays(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function mondayOf(ymd: string) {
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 월=0
  return addDays(ymd, -dow);
}
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const range7 = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

export function isPromoExcludedStore(storeName: string, master?: Map<string, any>) {
  const s = t(storeName);
  if (!s || /매장주문|매장반품/.test(s)) return true;
  // "오프라인_무신사(강남)" 같은 위탁 매장은 이름에 무신사가 있어도 오프라인(키워드 추측이 온라인으로 잘못 봤음, 2026-11-17 팀 파일 대조로 확인)
  if (/^오프라인_/.test(s)) return false;
  if (/외부판매|샘플|직원구매/.test(s)) return true;
  return isOnlineChannel(s, master as any);
}

type Agg = { qty: number; amount: number };
type WeekAgg = { byStyle: Map<string, Agg>; unitPrices: Map<string, Map<number, number>>; total: Agg; dates: string[]; datesWithData: string[] };

async function aggregateWeek(start: string, styles: Set<string>, master: Map<string, any>): Promise<WeekAgg> {
  const dates = range7(start);
  const histDates = dates.filter((d) => d >= ARCHIVE_BEFORE);
  const archDates = dates.filter((d) => d < ARCHIVE_BEFORE);
  const rows: { date: string; storeName: string; styleCode: string; qty: number; amount: number }[] = histDates.length
    ? await readDailyHistoryRowsForExactDates(histDates)
    : [];
  if (archDates.length) {
    const arch = await readArchivedSales(archDates).catch(() => ({ rows: [] as any[] }));
    // 보관 시트엔 ERP 팀명이 있어서 오프라인팀만(무신사 위탁 매장도 오프라인팀), 매장주문/반품은 아래 isPromoExcludedStore가 뺌
    for (const r of arch.rows) if (r.team === "오프라인팀") rows.push(r);
  }
  const byStyle = new Map<string, Agg>();
  const unitPrices = new Map<string, Map<number, number>>(); // 스타일 → (개당 판매가 → 수량) — 현판가 추정용
  const total: Agg = { qty: 0, amount: 0 };
  const seenDates = new Set<string>();
  const excludedCache = new Map<string, boolean>();
  for (const r of rows) {
    if (!dates.includes(r.date)) continue;
    let ex = excludedCache.get(r.storeName);
    if (ex === undefined) {
      ex = isPromoExcludedStore(r.storeName, master);
      excludedCache.set(r.storeName, ex);
    }
    if (ex) continue;
    seenDates.add(r.date);
    total.qty += r.qty;
    total.amount += r.amount;
    const st = t(r.styleCode).toUpperCase();
    if (!styles.has(st)) continue;
    const a = byStyle.get(st) || { qty: 0, amount: 0 };
    a.qty += r.qty;
    a.amount += r.amount;
    byStyle.set(st, a);
    if (r.qty > 0 && r.amount > 0) {
      const unit = Math.round(r.amount / r.qty / 100) * 100;
      const m = unitPrices.get(st) || new Map<number, number>();
      m.set(unit, (m.get(unit) || 0) + r.qty);
      unitPrices.set(st, m);
    }
  }
  return { byStyle, unitPrices, total, dates, datesWithData: [...seenDates].sort() };
}

// 소비자가: PIP(스타일별 채널별, 금액) 마스터 열 20(판매가) — 팀 파일의 "소비자가"(ERP 현판가 메뉴 소비자가)와 같은 값.
// PIP 19열은 최초 TAG가라 안 씀. ERP "현판가"(할인 적용가)는 PIP에 없어서, 그 주 판매 줄의 개당 판매가 중 가장 많이 팔린 값으로 추정.
async function readStylePrices(styles: Set<string>) {
  const out = new Map<string, { consumer: number; current: number; colors: number }>();
  try {
    const id = getDailySourceSheetId();
    const title = pickDailySheetTitle(await getSpreadsheetTitlesById(id));
    if (!title) return out;
    const raw = await getSheetValuesById(id, title, "N4:U");
    const votes = new Map<string, Map<string, number>>();
    const colors = new Map<string, Set<string>>(); // MARK 2026-11-20: 품번별 컬러 수(PIP P열 칼라)
    for (const r of raw) {
      const st = t(r?.[0]).toUpperCase();
      if (!styles.has(st)) continue;
      const c = t(r?.[2]).toUpperCase();
      if (c) (colors.get(st) || colors.set(st, new Set()).get(st)!).add(c);
      const key = `${n(r?.[6])}|${n(r?.[7])}`;
      const m = votes.get(st) || new Map<string, number>();
      m.set(key, (m.get(key) || 0) + 1);
      votes.set(st, m);
    }
    for (const [st, m] of votes) {
      const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0].split("|").map(Number);
      out.set(st, { consumer: best[1], current: 0, colors: colors.get(st)?.size || 0 });
    }
  } catch (e) {
    console.error("promo prices read failed", e);
  }
  return out;
}

function modeUnit(m?: Map<number, number>) {
  if (!m || !m.size) return 0;
  return [...m.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

export type PromoStyleRow = {
  order: number;
  style: string;
  name: string;
  shipped: string;
  consumerPrice: number;
  currentPrice: number;
  discountRate: number | null;
  cur: Agg;
  prev: Agg;
  prevYear?: Agg;
  runningGap?: Agg | null; // 같은 품명(재런칭 코드 포함) 금주 합 − 전년
  colors: number; // 컬러 수(PIP 기준, 출고여부가 "BE만"처럼 한 컬러면 1)
};

export type PromoGroupReport = {
  group: string;
  title: string;
  note: string;
  prevYear: boolean;
  rows: PromoStyleRow[];
  cur: Agg;
  prev: Agg;
  prevYearTotal?: Agg;
};

export async function buildPromoReport(weekStartInput?: string) {
  const items = await readPromoItems();
  const lastMonday = addDays(mondayOf(kstToday()), -7);
  const weekStart = weekStartInput && /^\d{4}-\d{2}-\d{2}$/.test(weekStartInput) ? mondayOf(weekStartInput) : lastMonday;
  const prevStart = addDays(weekStart, -7);
  const lyStart = addDays(weekStart, -364);
  const styles = new Set(items.map((i) => i.style));
  const needLy = items.some((i) => i.prevYear);
  const lyStyles = new Set(items.filter((i) => i.prevYear).map((i) => i.style));

  const master = await loadChannelMaster().catch(() => new Map());
  // 7일씩 나눠 읽음(하루치에 전 SKU가 담겨 있어 한 번에 많이 읽으면 문자열 한도 초과)
  const cur = await aggregateWeek(weekStart, styles, master);
  const prev = await aggregateWeek(prevStart, styles, master);
  const ly = needLy ? await aggregateWeek(lyStart, lyStyles, master) : null;
  const prices = await readStylePrices(styles);

  const groupsOrder: string[] = [];
  for (const i of items) if (!groupsOrder.includes(i.group)) groupsOrder.push(i.group);
  const zero = (): Agg => ({ qty: 0, amount: 0 });

  const groups: PromoGroupReport[] = groupsOrder.map((g) => {
    const list = items.filter((i) => i.group === g).sort((a, b) => a.order - b.order);
    const head = list[0] as PromoItem;
    const rows: PromoStyleRow[] = list.map((i) => {
      const p = prices.get(i.style);
      const consumer = p?.consumer || 0;
      const current = modeUnit(cur.unitPrices.get(i.style)) || modeUnit(prev.unitPrices.get(i.style));
      return {
        order: i.order,
        style: i.style,
        name: i.name,
        shipped: i.shipped,
        colors: /^[A-Z0-9]{2,3}\s*만$/i.test(String(i.shipped || "").trim()) ? 1 : p?.colors || 0,
        consumerPrice: consumer,
        currentPrice: current,
        discountRate: consumer > 0 && current > 0 ? 1 - current / consumer : null,
        cur: cur.byStyle.get(i.style) || zero(),
        prev: prev.byStyle.get(i.style) || zero(),
        prevYear: head.prevYear && ly ? ly.byStyle.get(i.style) || zero() : undefined,
      };
    });
    if (head.prevYear) {
      // 러닝합산: 같은 품명(예: 재런칭 GF7LKC501 + 예전 WBD3L04501) 금주 합계 − 전년(전년 판매가 있는 코드 줄에만 표시)
      for (const r of rows) {
        if (!r.prevYear || (!r.prevYear.qty && !r.prevYear.amount)) {
          r.runningGap = null;
          continue;
        }
        const same = rows.filter((x) => x.name === r.name);
        const sumCur = same.reduce((s, x) => ({ qty: s.qty + x.cur.qty, amount: s.amount + x.cur.amount }), zero());
        const sumLy = same.reduce((s, x) => ({ qty: s.qty + (x.prevYear?.qty || 0), amount: s.amount + (x.prevYear?.amount || 0) }), zero());
        r.runningGap = { qty: sumCur.qty - sumLy.qty, amount: sumCur.amount - sumLy.amount };
      }
    }
    const sum = (k: "cur" | "prev" | "prevYear") =>
      rows.reduce((s, r) => ({ qty: s.qty + (r[k]?.qty || 0), amount: s.amount + (r[k]?.amount || 0) }), zero());
    return {
      group: g,
      title: head.title || g,
      note: head.note,
      prevYear: head.prevYear,
      rows,
      cur: sum("cur"),
      prev: sum("prev"),
      prevYearTotal: head.prevYear ? sum("prevYear") : undefined,
    };
  });

  return {
    weekStart,
    weekEnd: addDays(weekStart, 6),
    prevStart,
    prevEnd: addDays(prevStart, 6),
    lyStart: needLy ? lyStart : null,
    lyEnd: needLy ? addDays(lyStart, 6) : null,
    total: { cur: cur.total, prev: prev.total },
    dataDates: { cur: cur.datesWithData, prev: prev.datesWithData, ly: ly?.datesWithData || [] },
    groups,
  };
}
