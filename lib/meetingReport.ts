// MARK 2026-11-20: 회의 탭 — 주간 리더회의 한 장(지난주 / 이번주 / 이번달) 초안 자동 작성 + 저장.
// 팀에서 손으로 만들던 PPT(O.B 오프라인 브랜딩팀) 양식 그대로. 지난주 칸은 MARK 데이터로 거의 다 채움:
//  - 매출실적: 매출탭(매출_일별_스냅샷) 주간 합 / 전주 / 전년(−364일) / 목표, 동일매장 신장·부진 점포
//  - 기온: 날씨 기록(서울 실측) 주 평균 = (최고+최저)/2, 전년 같은 주, 비 온 요일
//  - 프로모션: 상품 탭 IMC 현황(promoReport) 그룹별 판매 수량·금액·전주 대비
//  - 스오크: 스페셜오퍼 세부일정 중 그 주에 걸친 행사 — 목표(있으면)·실적(행사 기간 매출, 지난주 말까지)·진척
// 이번주 칸은 이번 주·다음 주 스오크 일정만 자동, 나머지는 손으로. 이번달 칸(과업·진척)은 지난 회의에서 이어받음.
// 저장: MARK_DB "회의_주간리더"(A 회의주 월요일, B 저장시각, C JSON).
import { readSalesSummaryRowsForReports, normalizeStoreKey } from "@/lib/dataBuilder";
import { readSpecialOfferSheet, parseDate as parseOfferDate } from "@/lib/specialOfferWeek";
import { readWeatherHistory } from "@/lib/openWeather";
import { buildPromoReport } from "@/lib/promoReport";
import { getDbSheetId, getSheetValuesById, ensureSheetExistsById, safeReplaceSheetValuesById } from "@/lib/googleSheets";

const SHEET = "회의_주간리더";
const HEADER = ["회의주", "저장시각", "내용"];
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

export function addDays(d: string, n: number) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
export function mondayOf(d: string) {
  const w = new Date(`${d}T00:00:00Z`).getUTCDay();
  return addDays(d, w === 0 ? -6 : 1 - w);
}
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;

// "2026년 11월 3주차" — 그 주 목요일이 속한 달 기준(팀 PPT: 10/26~11/1 = 10월 5주차, 11/2~8 = 11월 1주차)
export function weekLabel(monday: string) {
  const thu = addDays(monday, 3);
  const n = 1 + Math.floor((+thu.slice(8, 10) - 1) / 7);
  return `${thu.slice(0, 4)}년 ${+thu.slice(5, 7)}월 ${n}주차 (${md(monday)}~${md(addDays(monday, 6))})`;
}

const eok = (v: number) => `${(v / 1e8).toFixed(1)}억`;
const baek = (v: number) => `${Math.round(v / 1e6).toLocaleString("ko-KR")}백`;
const pct = (v: number | null, d = 1) => (v == null || !isFinite(v) ? "-" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`);
const signN = (v: number, unit = "") => `${v >= 0 ? "+" : ""}${v.toLocaleString("ko-KR")}${unit}`;
const signBaek = (v: number) => `${v >= 0 ? "+" : ""}${(v / 1e6).toFixed(1)}백`;

export type MonthItem = { pri: string; cat: string; text: string; progress: number; done: boolean };
export type MeetingDoc = {
  week: string; // 회의주 월요일
  team: string;
  teamBadge: string;
  teamDesc: string;
  presenter: string;
  lastWeek: string;
  thisWeek: string;
  monthItems: MonthItem[];
  coop: string;
  savedAt?: string;
};

// ---------------------------------------------------------------- 자동 초안
export async function buildMeetingAuto(meetingMonday: string) {
  const rs = addDays(meetingMonday, -7); // 리뷰 주(지난주) 월~일
  const re = addDays(meetingMonday, -1);
  const inWeek = (d: string, s: string) => d >= s && d <= addDays(s, 6);
  const [rows, weather, offerSheet, promo] = await Promise.all([
    readSalesSummaryRowsForReports(),
    readWeatherHistory().catch(() => [] as any[]),
    readSpecialOfferSheet().catch(() => null),
    buildPromoReport(rs).catch((e) => ({ error: String(e?.message || e) }) as any),
  ]);

  // ---- 매출
  const sum = (s: string) => {
    const by = new Map<string, number>();
    let amt = 0, tgt = 0;
    for (const r of rows) {
      if (!inWeek(r.date, s)) continue;
      amt += r.amount;
      tgt += r.target;
      by.set(r.storeName, (by.get(r.storeName) || 0) + r.amount);
    }
    return { amt, tgt, by };
  };
  const cur = sum(rs), lw = sum(addDays(rs, -7)), ly = sum(addDays(rs, -364));
  const daysWithData = new Set(rows.filter((r) => inWeek(r.date, rs) && r.amount).map((r) => r.date)).size;
  const stores = [...cur.by.entries()]
    .map(([name, a]) => ({ name, a, ly: ly.by.get(name) || 0, lw: lw.by.get(name) || 0 }))
    .filter((s) => s.a > 0 && s.ly > 0 && !/^오프라인_/.test(s.name)) // 위탁·무신사 등 인샵은 신장/부진 목록에서 뺌
    .map((s) => ({ ...s, yoy: s.a / s.ly - 1 }));
  const likeCur = stores.reduce((x, s) => x + s.a, 0), likeLy = stores.reduce((x, s) => x + s.ly, 0);
  const good = [...stores].sort((a, b) => b.yoy - a.yoy).filter((s) => s.yoy > 0).slice(0, 3);
  const bad = [...stores].sort((a, b) => a.yoy - b.yoy).filter((s) => s.yoy < 0).slice(0, 3);
  const short = (n: string) => n.replace(/^(롯데|현대|신세계|스타필드)\s*(백화점|아울렛)?\s*/, "").replace(/점$/, "") || n;

  // ---- 날씨(서울 실측)
  const wx = (weather as any[]).filter((w) => w.source === "actual" && (!w.region || w.region === "서울"));
  const wxAvg = (s: string) => {
    const xs = wx.filter((w) => inWeek(w.date, s) && isFinite(w.maxTemp) && isFinite(w.minTemp) && (w.maxTemp || w.minTemp));
    return xs.length ? xs.reduce((a, w) => a + (w.maxTemp + w.minTemp) / 2, 0) / xs.length : null;
  };
  const tCur = wxAvg(rs), tLy = wxAvg(addDays(rs, -364));
  const rainDays = wx
    .filter((w) => inWeek(w.date, rs) && (Number(w.rainMm) > 0.5 || /비|rain/i.test(String(w.weather || ""))))
    .map((w) => DOW[new Date(`${w.date}T00:00:00Z`).getUTCDay()]);

  // ---- 스오크(세부일정)
  const offers: { store: string; start: string; end: string; target: number | null }[] = [];
  let offerHeader: string[] = [];
  if (offerSheet && offerSheet.headerRowIdx >= 0) {
    const { rows: or, headerRowIdx, storeCol, startCol, endCol } = offerSheet;
    offerHeader = (or[headerRowIdx] || []).map((v: any) => String(v ?? "").trim());
    const tCol = offerHeader.findIndex((h) => /목표/.test(h.replace(/\s/g, "")));
    const pd = (v: any) => parseOfferDate(v) || "";
    for (let i = headerRowIdx + 1; i < or.length; i++) {
      const r = or[i] || [];
      const store = String(r[storeCol] ?? "").trim();
      const start = pd(r[startCol]);
      if (!store || !start) continue;
      const end = pd(r[endCol]) || start;
      const tv = tCol >= 0 ? Number(String(r[tCol] ?? "").replace(/[^\d.-]/g, "")) : NaN;
      offers.push({ store, start, end, target: isFinite(tv) && tv > 0 ? tv : null });
    }
  }
  const storeNames = [...new Set(rows.map((r) => r.storeName))];
  const match = (n: string) => {
    const k = normalizeStoreKey(n);
    return storeNames.find((s) => normalizeStoreKey(s) === k) || storeNames.find((s) => { const sk = normalizeStoreKey(s); return sk.includes(k) || k.includes(sk); }) || null;
  };
  const amtOf = (store: string | null, s: string, e: string) => (store ? rows.filter((r) => r.storeName === store && r.date >= s && r.date <= e).reduce((x, r) => x + r.amount, 0) : 0);
  // 목표 단위: 세부일정 목표가 원 단위가 아니라 백만원(예: 200)이면 그대로 백만원으로 봄
  const toWon = (t: number) => (t < 100000 ? t * 1e6 : t);
  const reviewOffers = offers
    .filter((o) => o.start <= re && o.end >= rs)
    .map((o) => {
      const st = match(o.store);
      const actual = amtOf(st, o.start, o.end < re ? o.end : re);
      return { ...o, matched: st, actual, targetWon: o.target != null ? toWon(o.target) : null };
    });
  const upcoming = (s: string) => offers.filter((o) => o.start <= addDays(s, 6) && o.end >= s);

  // ---- 지난주 글
  const L: string[] = [];
  L.push("1. [운영] 주간 리뷰");
  const wowR = lw.amt ? cur.amt / lw.amt - 1 : null;
  const yoyR = ly.amt ? cur.amt / ly.amt - 1 : null;
  L.push(`[1] 매출실적: **매출 ${eok(cur.amt)}, 전주 ${eok(lw.amt)}, ${pct(wowR)}**`);
  const tail: string[] = [];
  if (ly.amt) tail.push(`전년 ${eok(ly.amt)} ${pct(yoyR)}`);
  if (likeLy) tail.push(`동일매장 ${pct(likeCur / likeLy - 1)}`);
  if (cur.tgt) tail.push(`목표 ${eok(cur.tgt)} 달성 ${Math.round((cur.amt / cur.tgt) * 100)}%`);
  if (tail.length) L.push(`- ${tail.join(" · ")}`);
  if (tCur != null) L.push(`- 기온: ${tCur.toFixed(1)}°C${tLy != null ? ` (전년 ${tLy.toFixed(1)}°C / ${tCur - tLy >= 0 ? "+" : ""}${(tCur - tLy).toFixed(1)}°C)` : ""}${rainDays.length ? ` → ${rainDays.join("/")} 우천` : ""}`);
  if (good.length) L.push(`- 신장: ${good.map((s) => `${short(s.name)} ${pct(s.yoy, 0)}`).join(", ")}`);
  if (bad.length) L.push(`- 부진: ${bad.map((s) => `${short(s.name)} ${pct(s.yoy, 0)}`).join(", ")}`);
  L.push("- 이슈: ");

  let n = 2;
  // 그룹 제목 "아르노 윈터위크 (10/23~11/12) → 블랙…" → "아르노 윈터위크"
  const shortTitle = (t: string) => t.replace(/^[①-⑳\d.\s]+/, "").split(/\s*[(→/★]|\s\d{1,3},\d{3}원|\s\d+개소/)[0].trim() || t;
  const pg = Array.isArray(promo?.groups) ? promo.groups.filter((g: any) => g.cur.qty > 0 || g.prev.qty > 0) : [];
  if (pg.length) {
    const tq = pg.reduce((a: number, g: any) => a + g.cur.qty, 0), ta = pg.reduce((a: number, g: any) => a + g.cur.amount, 0);
    const pq = pg.reduce((a: number, g: any) => a + g.prev.qty, 0), pa = pg.reduce((a: number, g: any) => a + g.prev.amount, 0);
    L.push("");
    L.push(`[${n++}] 프로모션: **${[...pg].sort((a: any, b: any) => b.cur.amount - a.cur.amount).slice(0, 3).map((g: any) => shortTitle(g.title)).join(" + ")}**`);
    L.push(`- 실적: 판매 ${tq.toLocaleString("ko-KR")}장, ${eok(ta)}, 비중 ${cur.amt ? Math.round((ta / cur.amt) * 1000) / 10 : "-"}% / 전주 ${pq.toLocaleString("ko-KR")}장, ${eok(pa)}${pa ? `, ${pct(ta / pa - 1, 0)}` : ""}`);
    L.push("- 카테고리별 판매분석 :");
    for (const g of pg) {
      const t = shortTitle(g.title);
      L.push(`  · ${t} ${g.cur.qty.toLocaleString("ko-KR")}장·${baek(g.cur.amount)} (전주 ${signN(g.cur.qty - g.prev.qty, "장")}, ${signBaek(g.cur.amount - g.prev.amount)})`);
    }
  }
  if (reviewOffers.length) {
    const withT = reviewOffers.filter((o) => o.targetWon);
    const ts = withT.reduce((a, o) => a + (o.targetWon || 0), 0), as = withT.reduce((a, o) => a + o.actual, 0);
    L.push("");
    L.push(`[${n++}] 스오크: ${short(reviewOffers[0].store)}${reviewOffers.length > 1 ? ` 외 ${reviewOffers.length - 1}개소` : ""} 운영`);
    if (ts) L.push(`- **목표 ${baek(ts)}, 실적 ${baek(as)}, 진척 ${Math.round((as / ts) * 100)}%**`);
    for (const o of reviewOffers) L.push(`  · ${o.store} ${md(o.start)}~${md(o.end)}: ${baek(o.actual)}${o.targetWon ? ` / 목표 ${baek(o.targetWon)} (${Math.round((o.actual / o.targetWon) * 100)}%)` : ""}${o.end > re ? " 진행중" : ""}`);
  }
  L.push("");
  L.push(`[${n++}] 기타 업무`);
  L.push("- ");

  // ---- 이번주 글(스오크 일정만 자동)
  const T: string[] = [];
  T.push("1. [운영] 핵심 추진 업무");
  T.push("[1] 프로모션: ");
  T.push("- ");
  const w1 = upcoming(meetingMonday), w2 = upcoming(addDays(meetingMonday, 7));
  if (w1.length || w2.length) {
    T.push("");
    T.push(`[2] 스오크: **금주 행사 ${w1.length}개소 + 차주 행사 준비(${w2.length}개소)**`);
    if (w1.length) T.push(`- 금주: ${w1.map((o) => `${short(o.store)}(${md(o.start)}~${md(o.end)})`).join(", ")}`);
    if (w2.length) T.push(`- 차주: ${w2.map((o) => `${short(o.store)}(${md(o.start)})`).join(", ")}`);
  }
  T.push("");
  T.push(`[${w1.length || w2.length ? 3 : 2}] 기타 업무`);
  T.push("- ");

  return {
    reviewStart: rs,
    reviewEnd: re,
    lastWeek: L.join("\n"),
    thisWeek: T.join("\n"),
    facts: {
      sales: { cur: Math.round(cur.amt), lw: Math.round(lw.amt), ly: Math.round(ly.amt), target: Math.round(cur.tgt), daysWithData, likeYoy: likeLy ? likeCur / likeLy - 1 : null },
      tempAvg: tCur, tempLy: tLy, rainDays,
      promoGroups: pg.length, promoError: promo?.error || null,
      offers: reviewOffers.map((o) => ({ store: o.store, matched: o.matched, start: o.start, end: o.end, target: o.targetWon, actual: Math.round(o.actual) })),
      offerHeader,
    },
  };
}

// ---------------------------------------------------------------- 저장/읽기
async function readAll() {
  const id = getDbSheetId();
  await ensureSheetExistsById(id, SHEET, HEADER);
  const rows = (await getSheetValuesById(id, SHEET, "A:C").catch(() => [])) as any[][];
  return rows.slice(1).filter((r) => r && r[0]);
}

export async function readMeeting(week: string): Promise<{ doc: MeetingDoc | null; prev: MeetingDoc | null }> {
  const rows = await readAll();
  const parse = (r: any[]) => {
    try {
      return { ...JSON.parse(String(r[2] || "{}")), week: String(r[0]), savedAt: String(r[1] || "") } as MeetingDoc;
    } catch {
      return null;
    }
  };
  const mine = rows.find((r) => String(r[0]) === week);
  const prevRow = rows.filter((r) => String(r[0]) < week).sort((a, b) => String(b[0]).localeCompare(String(a[0])))[0];
  return { doc: mine ? parse(mine) : null, prev: prevRow ? parse(prevRow) : null };
}

export async function saveMeeting(doc: MeetingDoc) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.week)) throw new Error("회의주가 잘못됐어요");
  const id = getDbSheetId();
  const rows = await readAll();
  const savedAt = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
  const { savedAt: _s, ...rest } = doc as any;
  const json = JSON.stringify(rest);
  if (json.length > 45000) throw new Error("내용이 너무 길어요(구글시트 한 칸 한도)");
  const others = rows.filter((r) => String(r[0]) !== doc.week);
  const all = [...others, [doc.week, savedAt, json]].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  await safeReplaceSheetValuesById(id, SHEET, [HEADER, ...all]);
  return { savedAt };
}

export function defaultMeetingWeek() {
  return mondayOf(kstToday());
}
