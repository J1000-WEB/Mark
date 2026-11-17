// MARK 2026-11-17: 매출탭 안 리포트 3종 — 팀에서 쓰던 "📊 매출 통합 대시보드 2026 (NEW)" 시트의
// "일별 매출달성", "연간실적", "연간실적(점포)"를 매출탭 데이터(매출_일별_스냅샷)로 자동 계산.
// - 일별: 목표·실적·달성·누적·전년(52주 전 같은 요일)·전주비 + 스오크(그날 행사 점포별 실적) + 특이매출(평소보다 확 높은 점포)
// - 연간실적: 오프라인(O.B)만 자동, 온라인(E-GI)·글로벌(G.P)·오프라인 목표는 입력값(MARK_DB "연간실적_입력")
// - 연간실적(점포): 매장별 월 실적·전년(달력 기준 작년 같은 달)·신장
import { readSalesSummaryRowsForReports, normalizeStoreKey } from "@/lib/dataBuilder";
import { readSpecialOfferPeriods } from "@/lib/specialOfferWeek";
import { readWeatherHistory } from "@/lib/openWeather";
import { isKoreanHoliday } from "@/lib/koreanHolidays";
import { getDbSheetId, getSheetValuesById, ensureSheetExistsById, safeReplaceSheetValuesById } from "@/lib/googleSheets";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function addDays(dateKey: string, n: number) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dowOf(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}
function yesterdayKST() {
  return addDays(new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10), -1);
}
function num(v: any) {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// 스오크 일정의 점포명("커넥트 현대 청주", "신세계 광주")을 매출탭 점포명("현대커넥트 청주점", "신세계 광주점")에 맞춤
function matchStore(name: string, storeNames: string[]): string | null {
  const k = normalizeStoreKey(name);
  if (!k) return null;
  const sorted = (x: string) => x.split("").sort().join("");
  for (const s of storeNames) if (normalizeStoreKey(s) === k) return s;
  for (const s of storeNames) if (sorted(normalizeStoreKey(s)) === sorted(k)) return s;
  const hits = storeNames.filter((s) => {
    const sk = normalizeStoreKey(s);
    return sk.includes(k) || k.includes(sk);
  });
  return hits.length === 1 ? hits[0] : null;
}

// ========================= 일별 매출달성 =========================
// 특이매출: 그 점포 최근 8주 같은 요일 평균(공휴일·0원 제외)의 1.5배 이상 + 300만원 이상 더 나온 날
const SPIKE_RATIO = 1.5;
const SPIKE_MIN_DIFF = 3_000_000;

export async function buildDailyAchievement(month: string) {
  const [rows, offers, weather] = await Promise.all([
    readSalesSummaryRowsForReports(),
    readSpecialOfferPeriods().catch(() => []),
    readWeatherHistory().catch(() => [] as any[]),
  ]);
  const asOf = yesterdayKST();
  const byStoreDate = new Map<string, Map<string, { amount: number; target: number }>>();
  const totalByDate = new Map<string, { amount: number; target: number }>();
  for (const r of rows) {
    if (!byStoreDate.has(r.storeName)) byStoreDate.set(r.storeName, new Map());
    const m = byStoreDate.get(r.storeName)!;
    const prev = m.get(r.date) || { amount: 0, target: 0 };
    m.set(r.date, { amount: prev.amount + r.amount, target: prev.target + r.target });
    const t = totalByDate.get(r.date) || { amount: 0, target: 0 };
    totalByDate.set(r.date, { amount: t.amount + r.amount, target: t.target + r.target });
  }
  const storeNames = [...byStoreDate.keys()];
  const offerPeriods = offers
    .map((o) => ({ ...o, store: matchStore(o.storeName, storeNames) }))
    .filter((o) => o.store);

  const [y, mo] = month.split("-").map(Number);
  const days: string[] = [];
  for (let d = 1; d <= 31; d++) {
    const key = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (new Date(`${key}T00:00:00Z`).getUTCMonth() + 1 !== mo) break;
    days.push(key);
  }

  let cumActual = 0, cumTarget = 0, cumTargetToDate = 0, cumPrevYear = 0;
  const out = days.map((date) => {
    const tot = totalByDate.get(date) || { amount: 0, target: 0 };
    const hasActual = date <= asOf;
    const actual = hasActual ? tot.amount : 0;
    const prevYearDate = addDays(date, -364);
    const prevYear = (totalByDate.get(prevYearDate) || { amount: 0 }).amount;
    const lastWeek = (totalByDate.get(addDays(date, -7)) || { amount: 0 }).amount;
    cumTarget += tot.target;
    if (hasActual) {
      cumActual += actual;
      cumTargetToDate += tot.target;
      cumPrevYear += prevYear;
    }

    // 스오크: 그날 행사 중인 점포 + 그날 실적
    const sok = offerPeriods
      .filter((o) => o.startDate <= date && date <= o.endDate)
      .map((o) => ({
        store: o.store as string,
        name: o.storeName,
        period: `${o.startDate.slice(5)}~${o.endDate.slice(5)}`,
        amount: hasActual ? Math.round(byStoreDate.get(o.store as string)?.get(date)?.amount || 0) : null,
      }));

    // 특이매출
    const spikes: { store: string; amount: number; usual: number; ratio: number }[] = [];
    if (hasActual) {
      const w = dowOf(date);
      for (const [store, m] of byStoreDate.entries()) {
        const amt = m.get(date)?.amount || 0;
        if (amt < SPIKE_MIN_DIFF) continue;
        const xs: number[] = [];
        for (let k = 1; k <= 8; k++) {
          const d = addDays(date, -7 * k);
          const v = m.get(d)?.amount || 0;
          if (v > 0 && !isKoreanHoliday(d) && dowOf(d) === w) xs.push(v);
        }
        if (xs.length < 3) continue;
        const usual = xs.reduce((a, b) => a + b, 0) / xs.length;
        if (amt >= usual * SPIKE_RATIO && amt - usual >= SPIKE_MIN_DIFF) {
          spikes.push({ store, amount: Math.round(amt), usual: Math.round(usual), ratio: Math.round((amt / usual) * 10) / 10 });
        }
      }
      spikes.sort((a, b) => b.amount - b.usual - (a.amount - a.usual));
    }

    // 서울 기준, 실측(actual) 우선·없으면 예보
    const wxList = (weather as any[]).filter((w) => w.date === date && (!w.region || w.region === "서울"));
    const wx = wxList.find((w) => w.source === "actual") || wxList[wxList.length - 1] || null;
    return {
      date,
      dow: DOW[dowOf(date)],
      holiday: isKoreanHoliday(date),
      maxTemp: wx && wx.maxTemp !== "" ? num(wx.maxTemp) : null,
      minTemp: wx && wx.minTemp !== "" ? num(wx.minTemp) : null,
      target: Math.round(tot.target),
      actual: hasActual ? Math.round(actual) : null,
      achievement: hasActual && tot.target ? actual / tot.target : null,
      prevYearDate,
      prevYear: Math.round(prevYear),
      yoy: hasActual && prevYear ? actual / prevYear - 1 : null,
      lastWeek: Math.round(lastWeek),
      wow: hasActual && lastWeek ? actual / lastWeek - 1 : null,
      cumActual: hasActual ? Math.round(cumActual) : null,
      cumTarget: Math.round(cumTarget),
      cumAchievement: hasActual && cumTargetToDate ? cumActual / cumTargetToDate : null,
      cumPrevYear: hasActual ? Math.round(cumPrevYear) : null,
      cumYoy: hasActual && cumPrevYear ? cumActual / cumPrevYear - 1 : null,
      specialOffers: sok,
      spikes,
    };
  });

  const weekdays = days.filter((d) => { const w = dowOf(d); return w >= 1 && w <= 5 && !isKoreanHoliday(d); }).length;
  return {
    month,
    asOf,
    monthTarget: Math.round(cumTarget),
    weekdays,
    weekendOrHoliday: days.length - weekdays,
    spikeRule: { ratio: SPIKE_RATIO, minDiff: SPIKE_MIN_DIFF },
    days: out,
  };
}

// ========================= 연간실적(점포) =========================
export async function buildAnnualStores(year: number) {
  const rows = await readSalesSummaryRowsForReports();
  const asOf = yesterdayKST();
  const ys = String(year), py = String(year - 1);
  type S = { storeName: string; channelGroup: string; channelCode: string; actual: number[]; prevYear: number[] };
  const stores = new Map<string, S>();
  for (const r of rows) {
    const yy = r.date.slice(0, 4);
    if (yy !== ys && yy !== py) continue;
    if (yy === ys && r.date > asOf) continue;
    if (!stores.has(r.storeName)) stores.set(r.storeName, { storeName: r.storeName, channelGroup: "", channelCode: "", actual: Array(12).fill(0), prevYear: Array(12).fill(0) });
    const s = stores.get(r.storeName)!;
    if (yy === ys) {
      s.channelGroup = r.channelGroup || s.channelGroup;
      s.channelCode = r.channelCode || s.channelCode;
    } else if (!s.channelGroup) {
      s.channelGroup = r.channelGroup;
      s.channelCode = r.channelCode;
    }
    const mi = Number(r.date.slice(5, 7)) - 1;
    if (yy === ys) s.actual[mi] += r.amount;
    else s.prevYear[mi] += r.amount;
  }
  // 올해 매출이 하나도 없는 점포(폐점 등)는 빼되, 전년만 있는 점포는 남겨서 전년 합계가 맞게
  const list = [...stores.values()]
    .filter((s) => s.actual.some((v) => v) || s.prevYear.some((v) => v))
    .map((s) => ({ ...s, actual: s.actual.map(Math.round), prevYear: s.prevYear.map(Math.round) }));
  const monthsElapsed = asOf.slice(0, 4) === ys ? Number(asOf.slice(5, 7)) : asOf.slice(0, 4) > ys ? 12 : 0;
  return { year, asOf, monthsElapsed, stores: list };
}

// ========================= 연간실적(팀) =========================
const INPUT_SHEET = "연간실적_입력";
const INPUT_HEADER = ["연도", "팀", "항목", "1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월", "수정시각"];
export type TeamKey = "OB" | "EGI" | "GP";
export type ItemKey = "target" | "actual" | "prevYear";
// 팀 시트 "연간실적"(2026-11-17 받은 파일)에 이미 적혀 있던 값 — 입력 시트에 아직 없을 때 기본값
const SEED_2026: Record<string, (number | null)[]> = {
  "OB|target": [1700007280, 1612752118, 1696179144, 1727802508, 2256884853, 2082040165, 2090000000, 1750000000, 3190000000, 4230000000, 3970000000, 3270000000],
  "EGI|target": [2503164018, 3236954612, 3624525636, 2928973545, 2295996882, 3426267683, 2360000000, 2060000000, 4320000000, 4870000000, 5220000000, 3850000000],
  "EGI|actual": [2503164018, 3236954612, 3624525636, 2928973545, 2295996882, 3426267683, 2144344814, 1658843382, 3014068127, null, null, null],
  "EGI|prevYear": [1980933997, 2813791455, 3720639130, 3643368972, 3488147134, 3760192821, 1982135854, 1391093360, 3515758542, 3765835233, 4520234604, 3500000000],
  "GP|target": [516769808, 392732438, 885873324, 1529732438, 834261587, 805133886, 774800000, 704100000, 782100000, 1281500000, 1086450000, 1187050000],
  "GP|actual": [516769808, 392732438, 885873324, 1529732438, 834261587, 805133886, null, null, null, null, null, null],
  "GP|prevYear": [521176600, 642579169, 678549484, 415579550, 544370896, 410673776, 478149318, 325639414, 308094074, 297651164, 547976385, 528503363],
};
// 입력 가능한 칸(오프라인 실적·전년은 자동이라 입력 안 받음)
export const EDITABLE: Record<TeamKey, ItemKey[]> = { OB: ["target"], EGI: ["target", "actual", "prevYear"], GP: ["target", "actual", "prevYear"] };

async function readInputs() {
  const id = getDbSheetId();
  await ensureSheetExistsById(id, INPUT_SHEET, INPUT_HEADER);
  const raw = await getSheetValuesById(id, INPUT_SHEET, "A:P").catch(() => [] as any[]);
  const map = new Map<string, (number | null)[]>();
  for (const r of raw.slice(1)) {
    const key = `${String(r?.[0] ?? "").trim()}|${String(r?.[1] ?? "").trim()}|${String(r?.[2] ?? "").trim()}`;
    if (key.split("|").some((x) => !x)) continue;
    map.set(key, Array.from({ length: 12 }, (_, i) => (r?.[3 + i] === "" || r?.[3 + i] == null ? null : num(r[3 + i]))));
  }
  return { id, map };
}

export async function buildAnnualTeams(year: number) {
  const [rows, inputs] = await Promise.all([readSalesSummaryRowsForReports(), readInputs()]);
  const asOf = yesterdayKST();
  const obActual = Array(12).fill(0), obPrev = Array(12).fill(0);
  for (const r of rows) {
    const yy = Number(r.date.slice(0, 4));
    const mi = Number(r.date.slice(5, 7)) - 1;
    if (yy === year && r.date <= asOf) obActual[mi] += r.amount;
    else if (yy === year - 1) obPrev[mi] += r.amount;
  }
  const get = (team: TeamKey, item: ItemKey) => {
    const saved = inputs.map.get(`${year}|${team}|${item}`);
    if (saved) return saved;
    if (year === 2026 && SEED_2026[`${team}|${item}`]) return SEED_2026[`${team}|${item}`];
    return Array(12).fill(null);
  };
  const monthsElapsed = asOf.slice(0, 4) === String(year) ? Number(asOf.slice(5, 7)) : Number(asOf.slice(0, 4)) > year ? 12 : 0;
  return {
    year,
    asOf,
    monthsElapsed,
    teams: [
      { key: "OB", label: "오프라인 (O.B)", target: get("OB", "target"), actual: obActual.map((v, i) => (i < monthsElapsed ? Math.round(v) : null)), prevYear: obPrev.map(Math.round), auto: ["actual", "prevYear"] },
      { key: "EGI", label: "온라인 (E-GI)", target: get("EGI", "target"), actual: get("EGI", "actual"), prevYear: get("EGI", "prevYear"), auto: [] },
      { key: "GP", label: "글로벌 (G.P, NMV)", target: get("GP", "target"), actual: get("GP", "actual"), prevYear: get("GP", "prevYear"), auto: [] },
    ],
  };
}

export async function saveAnnualInputs(year: number, values: { team: TeamKey; item: ItemKey; months: (number | null)[] }[]) {
  const { id, map } = await readInputs();
  for (const v of values) {
    if (!EDITABLE[v.team]?.includes(v.item) || !Array.isArray(v.months) || v.months.length !== 12) continue;
    map.set(`${year}|${v.team}|${v.item}`, v.months.map((x) => (x === null || x === undefined || (x as any) === "" ? null : num(x))));
  }
  const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
  const out = [...map.entries()].sort().map(([k, months]) => {
    const [yy, team, item] = k.split("|");
    return [yy, team, item, ...months.map((x) => (x === null ? "" : x)), stamp];
  });
  await safeReplaceSheetValuesById(id, INPUT_SHEET, [INPUT_HEADER, ...out]);
  return { ok: true, saved: values.length };
}
