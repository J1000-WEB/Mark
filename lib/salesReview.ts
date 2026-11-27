// MARK 2026-11-27 소천님: 매출 리뷰를 카카오톡으로 — 매일 8:00 전일 리뷰, 월요일 8:00엔 전주 리뷰도(회의 탭 "지난주" 칸과 같은 내용).
// 데이터: 매출탭 매출_일별_스냅샷(화이트리스트 점포, 새벽 4:00 갱신분), 품번 TOP = PIP 보관 판매_일별(3:00 저장), 기온 = Weather_History 서울,
// 스오크 = 세부일정. ⚠ 8:00엔 무신사(근무일 아침 수동 업로드)가 아직 안 들어와 있을 수 있음 — 메시지에 표시.
// 보낸 기록: MARK_DB "카톡리뷰_로그"(같은 날 같은 종류는 한 번만, force면 다시).
import { readSalesSummaryRowsForReports, normalizeStoreKey } from "@/lib/dataBuilder";
import { readWeatherHistory } from "@/lib/openWeather";
import { readSpecialOfferSheet, parseDate as parseOfferDate } from "@/lib/specialOfferWeek";
import { readOfflineSalesRows } from "@/lib/salesSource";
import { isPromoExcludedStore } from "@/lib/promoReport";
import { buildMeetingAuto, addDays, mondayOf } from "@/lib/meetingReport";
import { chunk } from "@/lib/dailyDigest";
import { getDbSheetId, ensureSheetExistsById, getSheetValuesById, appendValuesById } from "@/lib/googleSheets";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const kstStamp = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
const dw = (d: string) => DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const man = (n: number) => `${Math.round(n / 10000).toLocaleString("ko-KR")}만`;
const eok = (n: number) => (Math.abs(n) >= 1e8 ? `${(n / 1e8).toFixed(2)}억` : man(n));
const pct = (v: number | null) => (v == null || !isFinite(v) ? "-" : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);
const rate = (a: number, b: number) => (b ? a / b - 1 : null);
const short = (n: string) => n.replace(/^오프라인_/, "").replace(/^(롯데|현대|신세계|스타필드)\s*(백화점|아울렛)?\s*/, "").replace(/점$/, "") || n;
const LOG_TAB = "카톡리뷰_로그";

export async function buildDailyReview(day?: string) {
  const d = day || addDays(kstToday(), -1);
  const lw = addDays(d, -7), ly = addDays(d, -364);
  const lines: string[] = [];
  lines.push(`[MARK] 전일 리뷰 ${md(d)}(${dw(d)})`);

  const rows = await readSalesSummaryRowsForReports();
  const byStore = (date: string) => {
    const m = new Map<string, { a: number; t: number; g: string }>();
    for (const r of rows) {
      if (r.date !== date) continue;
      const x = m.get(r.storeName) || { a: 0, t: 0, g: r.channelGroup };
      x.a += r.amount;
      x.t += r.target;
      m.set(r.storeName, x);
    }
    return m;
  };
  const cur = byStore(d), pw = byStore(lw), py = byStore(ly);
  const tot = (m: Map<string, { a: number; t: number }>) => [...m.values()].reduce((s, x) => s + x.a, 0);
  const a = tot(cur), aw = tot(pw), ay = tot(py);
  const tgt = [...cur.values()].reduce((s, x) => s + x.t, 0);
  // 동일매장(그날·전년 같은 요일 둘 다 매출>0)
  let lc = 0, ll = 0;
  for (const [n, x] of cur) {
    const y = py.get(n)?.a || 0;
    if (x.a > 0 && y > 0) { lc += x.a; ll += y; }
  }
  lines.push(`💰 매출 ${eok(a)}${tgt ? ` · 목표 ${Math.round((a / tgt) * 100)}%` : ""}`);
  lines.push(`전주 동요일 ${pct(rate(a, aw))} · 전년 ${pct(rate(a, ay))} · 동일매장 ${pct(rate(lc, ll))}`);

  // 월 누계
  const ms = `${d.slice(0, 8)}01`;
  let ma = 0, mt = 0, mly = 0;
  const msLy = addDays(ms, -364), dLy = ly;
  for (const r of rows) {
    if (r.date >= ms && r.date <= d) { ma += r.amount; mt += r.target; }
    if (r.date >= msLy && r.date <= dLy) mly += r.amount;
  }
  lines.push(`📅 ${+d.slice(5, 7)}월 누계 ${eok(ma)}${mt ? ` · 목표 ${Math.round((ma / mt) * 100)}%` : ""} · 전년 ${pct(rate(ma, mly))}`);

  // 형태별 전주비
  const grp = new Map<string, [number, number]>();
  for (const [n, x] of cur) { const g = grp.get(x.g) || [0, 0]; g[0] += x.a; grp.set(x.g, g); }
  for (const [n, x] of pw) { const g = grp.get(x.g) || [0, 0]; g[1] += x.a; grp.set(x.g, g); }
  const gl = [...grp.entries()].filter(([g, v]) => g && v[0] > 0).sort((p, q) => q[1][0] - p[1][0])
    .map(([g, v]) => `${g.replace(/\(오프\)/, "")} ${man(v[0])}(${pct(rate(v[0], v[1]))})`);
  if (gl.length) lines.push(`형태(전주비) ${gl.join(", ")}`);

  // 매장 신장/부진 — 전주 동요일 대비, 인샵 제외, 차액 큰 순
  const st = [...cur.entries()]
    .filter(([n, x]) => !/^오프라인_/.test(n) && (x.a > 0 || (pw.get(n)?.a || 0) > 0))
    .map(([n, x]) => ({ n, a: x.a, w: pw.get(n)?.a || 0, diff: x.a - (pw.get(n)?.a || 0) }))
    .filter((s) => s.w > 0);
  const good = [...st].sort((p, q) => q.diff - p.diff).filter((s) => s.diff > 0).slice(0, 3);
  const bad = [...st].sort((p, q) => p.diff - q.diff).filter((s) => s.diff < 0).slice(0, 3);
  if (good.length) lines.push(`📈 ${good.map((s) => `${short(s.n)} ${man(s.a)}(${pct(rate(s.a, s.w))})`).join(", ")}`);
  if (bad.length) lines.push(`📉 ${bad.map((s) => `${short(s.n)} ${man(s.a)}(${pct(rate(s.a, s.w))})`).join(", ")}`);

  // 기온
  try {
    const wx = (await readWeatherHistory()) as any[];
    const one = (date: string) => wx.find((w) => w.date === date && w.source === "actual" && (!w.region || w.region === "서울"));
    const w0 = one(d), w1 = one(ly);
    if (w0) {
      const avg = (w: any) => (Number(w.maxTemp) + Number(w.minTemp)) / 2;
      const rain = Number(w0.rainMm) > 0.5 || /비|rain|눈|snow/i.test(String(w0.weather || ""));
      lines.push(`🌡 서울 ${Math.round(w0.minTemp)}~${Math.round(w0.maxTemp)}°C${rain ? " 비/눈" : ""}${w1 ? ` (전년 평균 대비 ${avg(w0) - avg(w1) >= 0 ? "+" : ""}${(avg(w0) - avg(w1)).toFixed(1)}°C)` : ""}`);
    }
  } catch {}

  // 품번 TOP5(수량, 오프라인)
  try {
    const { rows: sr } = await readOfflineSalesRows([d]);
    const by = new Map<string, [number, number]>();
    for (const r of sr) {
      if (!r.styleCode || isPromoExcludedStore(r.storeName)) continue;
      const x = by.get(r.styleCode) || [0, 0];
      x[0] += r.qty; x[1] += r.amount;
      by.set(r.styleCode, x);
    }
    const top = [...by.entries()].sort((p, q) => q[1][0] - p[1][0]).slice(0, 5);
    if (top.length) lines.push(`👕 TOP5 ${top.map(([s, v]) => `${s} ${v[0]}장`).join(", ")}`);
  } catch {}

  // 진행 중 스오크
  try {
    const sheet = await readSpecialOfferSheet();
    if (sheet && sheet.headerRowIdx >= 0) {
      const { rows: or, headerRowIdx, storeCol, startCol, endCol } = sheet as any;
      const head = (or[headerRowIdx] || []).map((v: any) => String(v ?? "").replace(/\s/g, ""));
      const tCol = head.findIndex((h: string) => /목표/.test(h));
      const names = [...new Set(rows.map((r) => r.storeName))];
      const match = (n: string) => {
        const k = normalizeStoreKey(n);
        return names.find((s) => normalizeStoreKey(s) === k) || names.find((s) => { const sk = normalizeStoreKey(s); return sk.includes(k) || k.includes(sk); }) || null;
      };
      const out: string[] = [];
      for (let i = headerRowIdx + 1; i < or.length; i++) {
        const r = or[i] || [];
        const store = String(r[storeCol] ?? "").trim();
        const end = parseOfferDate(r[endCol]) || "";
        const start = parseOfferDate(r[startCol]) || end;
        if (!store || !start || !(start <= d && (end || start) >= d)) continue;
        const m = match(store);
        const act = m ? rows.filter((x) => x.storeName === m && x.date >= start && x.date <= d).reduce((s, x) => s + x.amount, 0) : 0;
        const tv = tCol >= 0 ? Number(String(r[tCol] ?? "").replace(/[^\d.-]/g, "")) : NaN;
        const tw = isFinite(tv) && tv > 0 ? (tv < 100000 ? tv * 1e6 : tv) : 0;
        out.push(`${short(store)} ${man(act)}${tw ? `/${man(tw)} ${Math.round((act / tw) * 100)}%` : ""}`);
      }
      if (out.length) lines.push(`🏷 스오크 진행 ${out.join(", ")}`);
    }
  } catch {}

  const mus = [...cur.entries()].filter(([n, x]) => /무신사/.test(n) && x.a > 0).length;
  if (!mus) lines.push("※ 무신사 매출은 아직 미반영(아침 업로드 후 매출탭에서)");
  return { day: d, lines, sales: { a, aw, ay, tgt, like: rate(lc, ll) } };
}

/** 회의 탭 "지난주" 칸 자동 초안을 카톡용 줄로 */
export async function buildWeeklyReview(weekMonday?: string) {
  const wk = weekMonday || addDays(mondayOf(kstToday()), -7);
  const auto = await buildMeetingAuto(wk);
  const lines: string[] = [`[MARK] 주간 리뷰 ${md(wk)}~${md(addDays(wk, 6))}`];
  const src = String(auto.lastWeek || "").split("\n");
  for (let raw of src) {
    const l = raw.replace(/\*\*/g, "").replace(/\s+$/, "");
    if (!l.trim()) continue;
    if (/^1\. \[운영\]/.test(l)) continue;
    if (/^-\s*(이슈:)?\s*$/.test(l.trim()) || /^-\s*이슈:\s*$/.test(l.trim())) continue;
    if (/기타 업무/.test(l)) continue;
    if (/카테고리별 판매분석/.test(l)) continue;
    lines.push(l.replace(/^\s+·/, "·"));
  }
  // 이번주 스오크 일정
  const tw = String(auto.thisWeek || "").split("\n").map((l) => l.replace(/\*\*/g, "").trim()).filter((l) => /^- (금주|차주)/.test(l));
  if (tw.length) { lines.push("[이번주 스오크]"); lines.push(...tw); }
  return { week: wk, lines };
}

async function alreadySent(kind: string, key: string) {
  const id = getDbSheetId();
  await ensureSheetExistsById(id, LOG_TAB, ["보낸시각", "종류", "기준", "결과"]);
  const v = await getSheetValuesById(id, LOG_TAB, "A:D").catch(() => [] as any[][]);
  return (v || []).some((r) => r?.[1] === kind && r?.[2] === key && r?.[3] === "ok");
}
async function logSent(kind: string, key: string, ok: boolean) {
  await appendValuesById(getDbSheetId(), `'${LOG_TAB}'!A:D`, [[kstStamp(), kind, key, ok ? "ok" : "fail"]]).catch(() => {});
}

async function send(lines: string[]) {
  const { sendKakaoMemo, } = await import("@/lib/kakao");
  const msgs = chunk(lines);
  const results = [];
  for (const m of msgs) results.push(await sendKakaoMemo(m, `${process.env.NEXT_PUBLIC_SITE_URL || "https://mark-khaki.vercel.app"}/meeting`));
  return { ok: results.every((r: any) => r.ok), messages: msgs, results };
}

/** kind: auto(매일 전일 + 월요일이면 전주도) | daily | weekly. dryRun이면 안 보내고 글만. */
export async function runSalesReview(opts: { kind?: "auto" | "daily" | "weekly"; day?: string; week?: string; dryRun?: boolean; force?: boolean } = {}) {
  const kind = opts.kind || "auto";
  const out: any = { ok: true };
  const today = kstToday();
  const doDaily = kind === "auto" || kind === "daily";
  const doWeekly = kind === "weekly" || (kind === "auto" && dw(today) === "월");
  if (doDaily) {
    const r = await buildDailyReview(opts.day);
    out.daily = { day: r.day, text: r.lines.join("\n") };
    if (!opts.dryRun) {
      if (!opts.force && (await alreadySent("daily", r.day))) out.daily.skipped = "이미 보냄";
      else { const s = await send(r.lines); out.daily.sent = s; await logSent("daily", r.day, s.ok); out.ok = out.ok && s.ok; }
    }
  }
  if (doWeekly) {
    const r = await buildWeeklyReview(opts.week);
    out.weekly = { week: r.week, text: r.lines.join("\n") };
    if (!opts.dryRun) {
      if (!opts.force && (await alreadySent("weekly", r.week))) out.weekly.skipped = "이미 보냄";
      else { const s = await send(r.lines); out.weekly.sent = s; await logSent("weekly", r.week, s.ok); out.ok = out.ok && s.ok; }
    }
  }
  return out;
}
