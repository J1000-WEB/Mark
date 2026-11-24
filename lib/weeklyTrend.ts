// MARK 2026-11-23: 상품탭 구성비 "52주 매출추이" — 주(월~일)마다 품번별 오프라인 실판매 [수량, 금액]을 미리 계산해 저장.
// 판매 = PIP 보관(MARK_PIP_ARCHIVE 판매_일별), 범위 = ERP "오프라인팀" 채널 중 isPromoExcludedStore 제외(누계·구성비 전년비와 같은 기준).
// 저장 = MARK_DB "주간추이_캐시"(주시작, 저장시각, 일수, 조각수, 조각…) — 다 끝난 주만 저장, 보관 시트의 그 주 일수가 바뀌면 다시 계산.
// 분류(품목·복종·아이템·년도·성별·품명) = 보관 시트 "상품정보"(B 스타일, C 스타일명, G 년도, H 시즌, I 아이템, L 성별, M 품목, N 복종).
import { gzipSync, gunzipSync } from "zlib";
import { archivedSalesDates, readArchivedSales, PIP_ARCHIVE_SHEET_ID } from "@/lib/pipArchive";
import { isPromoExcludedStore } from "@/lib/promoReport";
import { readWeatherHistory } from "@/lib/openWeather";
import { getDbSheetId, ensureSheetExistsById, ensureGridColsById, getSheetValuesById, getSheetsClient } from "@/lib/googleSheets";

const TAB = "주간추이_캐시";
const HEADER = ["주시작", "저장시각", "일수", "조각수", "데이터"];
const CHUNK = 45000;
const MAX_COLS = 30;
type QA = [number, number];

const kstNow = () => new Date(Date.now() + 9 * 3600 * 1000);
const kstToday = () => kstNow().toISOString().slice(0, 10);
export function addDays(ymd: string, d: number) {
  const x = new Date(`${ymd}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}
export function mondayOf(ymd: string) {
  const x = new Date(`${ymd}T00:00:00Z`);
  return addDays(ymd, -((x.getUTCDay() + 6) % 7));
}
const weekDates = (ws: string) => Array.from({ length: 7 }, (_, i) => addDays(ws, i));

// 2026-11-23 소천님: 온라인(채널명 앞 3글자 "온라인")도 참고용으로 따로 — 오프라인 합계·구성비엔 안 넣음
type WeekAgg = { v: 2; s: Record<string, QA>; o: Record<string, QA> };
async function aggregateWeek(dates: string[]): Promise<{ agg: WeekAgg; days: number }> {
  const { rows, foundDates } = await readArchivedSales(dates, { maxGap: 20 });
  const agg: WeekAgg = { v: 2, s: {}, o: {} };
  for (const r of rows) {
    const name = String(r.storeName || "").trim();
    const online = name.startsWith("온라인");
    if (!online && (r.team !== "오프라인팀" || isPromoExcludedStore(r.storeName))) continue;
    const q = Number(r.qty) || 0, a = Number(r.amount) || 0;
    if (!q && !a) continue;
    const st = String(r.styleCode || "").toUpperCase();
    const dst = online ? agg.o : agg.s;
    const v = dst[st] || (dst[st] = [0, 0]);
    v[0] += q;
    v[1] += a;
  }
  return { agg, days: foundDates.length };
}

type CacheRow = { days: number; row: number; data: () => any };
async function readCache(): Promise<Map<string, CacheRow>> {
  const id = getDbSheetId();
  await ensureSheetExistsById(id, TAB, HEADER);
  const vals = await getSheetValuesById(id, TAB, "A:AD").catch(() => [] as any[][]);
  const m = new Map<string, CacheRow>();
  vals.forEach((r, i) => {
    if (i === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(r?.[0] || ""))) return;
    const k = Number(r[3]) || 0;
    m.set(String(r[0]), {
      days: Number(r[2]) || 0,
      row: i + 1,
      data: () => JSON.parse(gunzipSync(Buffer.from(r.slice(4, 4 + k).map((x: any) => String(x ?? "")).join(""), "base64")).toString("utf8")),
    });
  });
  return m;
}

async function writeCache(ws: string, days: number, s: WeekAgg, row?: number) {
  const id = getDbSheetId();
  await ensureGridColsById(id, TAB, MAX_COLS);
  const b64 = gzipSync(Buffer.from(JSON.stringify(s), "utf8"), { level: 9 }).toString("base64");
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += CHUNK) chunks.push(b64.slice(i, i + CHUNK));
  if (chunks.length + 4 > MAX_COLS) throw new Error(`주간추이 캐시가 너무 커요(${ws})`);
  let rowNo = row;
  if (!rowNo) {
    const col = await getSheetValuesById(id, TAB, "A:A");
    rowNo = Math.max(col.length, 1) + 1;
  }
  const vals: any[] = [ws, kstNow().toISOString().replace("T", " ").slice(0, 19), days, chunks.length, ...chunks];
  while (vals.length < MAX_COLS) vals.push("");
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({ spreadsheetId: id, range: `'${TAB}'!A${rowNo}`, valueInputOption: "RAW", requestBody: { values: [vals] } });
}

let infoCache: { at: number; map: Record<string, string[]> } | null = null;
/** 스타일 → [품목, 복종, 아이템, 년도, 성별, 스타일명, 시즌] */
export async function readStyleInfo(): Promise<Record<string, string[]>> {
  if (infoCache && Date.now() - infoCache.at < 3600 * 1000) return infoCache.map;
  const vals = await getSheetValuesById(PIP_ARCHIVE_SHEET_ID, "상품정보", "B:N");
  const map: Record<string, string[]> = {};
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i] || [];
    const st = String(r[0] ?? "").trim().toUpperCase();
    if (!st) continue;
    const t = (j: number) => String(r[j] ?? "").trim();
    const v = [t(11), t(12), t(7), t(5), t(10), t(1), t(6)];
    const cur = map[st];
    if (!cur) map[st] = v;
    else v.forEach((x, j) => !cur[j] && x && (cur[j] = x)); // 빈 칸은 다른 줄 값으로
  }
  infoCache = { at: Date.now(), map };
  return map;
}

/**
 * endWeek(월요일, 기본 = 다 끝난 지난주)까지 weeks주 + 그 전년(−364일) lyWeeks주.
 * 계산 안 된 주는 이번 호출에서 budgetMs 안에서만 계산(나머지는 pending — 다시 부르면 이어서).
 */
export async function readWeeklyTrend(opts: { endWeek?: string; weeks?: number; lyWeeks?: number; budgetMs?: number } = {}) {
  const t0 = Date.now();
  const lastDone = addDays(mondayOf(kstToday()), -7);
  const end = opts.endWeek ? mondayOf(opts.endWeek) : lastDone;
  const nW = Math.min(Math.max(opts.weeks ?? 52, 1), 104);
  const nLy = Math.min(Math.max(opts.lyWeeks ?? 8, 0), nW);
  const wanted: string[] = [];
  for (let i = nW - 1; i >= 0; i--) wanted.push(addDays(end, -7 * i));
  const lyList: string[] = [];
  for (let i = nLy - 1; i >= 0; i--) lyList.push(addDays(end, -7 * i - 364));
  const all = [...new Set([...wanted, ...lyList])].sort();

  const [archived, cache, info, weather] = await Promise.all([
    archivedSalesDates(),
    readCache(),
    readStyleInfo().catch(() => ({} as Record<string, string[]>)),
    readWeatherHistory().catch(() => [] as any[]),
  ]);
  if (!archived.length) throw new Error("PIP 보관 시트 날짜 목록을 읽지 못했어요 — 잠시 뒤 다시 시도해 주세요.");
  const archSet = new Set(archived);
  const budget = opts.budgetMs ?? 200000;
  const data: Record<string, WeekAgg> = {};
  const days: Record<string, number> = {};
  const pending: string[] = [];
  let computed = 0;
  // 최근 주부터 계산(화면에 먼저 보이는 쪽)
  for (const ws of [...all].reverse()) {
    const dates = weekDates(ws);
    const have = dates.filter((d) => archSet.has(d)).length;
    const done = addDays(ws, 6) < kstToday();
    const c = cache.get(ws);
    // 예전 형식(온라인 없음, v 없음) 저장본은 다시 계산
    const cd = c ? c.data() : null;
    const fresh = cd && cd.v === 2;
    if (c && fresh && c.days === have && done) {
      data[ws] = cd;
      days[ws] = c.days;
      continue;
    }
    if (!have) {
      if (fresh) {
        data[ws] = cd;
        days[ws] = c!.days;
        continue;
      }
      data[ws] = { v: 2, s: {}, o: {} };
      days[ws] = 0;
      continue;
    }
    if (Date.now() - t0 > budget) {
      pending.push(ws);
      if (cd) {
        data[ws] = cd.v === 2 ? cd : { v: 2, s: cd, o: {} };
        days[ws] = c!.days;
      }
      continue;
    }
    const { agg, days: nd } = await aggregateWeek(dates);
    computed++;
    data[ws] = agg;
    days[ws] = nd;
    if (done) await writeCache(ws, nd, agg, c?.row).catch((e) => console.error("주간추이 저장 실패", ws, e?.message));
  }

  // 날씨(서울 실측, (최고+최저)/2 주 평균)
  const wx = (weather as any[]).filter((w) => w.source === "actual" && (!w.region || w.region === "서울") && Number.isFinite(w.maxTemp) && Number.isFinite(w.minTemp) && (w.maxTemp || w.minTemp));
  const byDate = new Map<string, number>();
  for (const w of wx) byDate.set(String(w.date).slice(0, 10), (w.maxTemp + w.minTemp) / 2);
  const temp = (ws: string) => {
    const xs = weekDates(ws).map((d) => byDate.get(d)).filter((x): x is number => x !== undefined);
    return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
  };

  // 응답 압축: 스타일 목록 + 주마다 [스타일i, 수량, 금액]
  const styles: string[] = [];
  const sIdx = new Map<string, number>();
  const pack = (m: Record<string, QA> | undefined) => {
    const rows: number[][] = [];
    for (const [st, [q, a]] of Object.entries(m || {})) {
      let i = sIdx.get(st);
      if (i === undefined) sIdx.set(st, (i = styles.push(st) - 1));
      rows.push([i, q, Math.round(a)]);
    }
    return rows;
  };
  const weeksOut = all.map((ws) => ({ ws, days: days[ws] ?? 0, temp: temp(ws), rows: pack(data[ws]?.s), on: pack(data[ws]?.o) }));
  const infoOut = styles.map((st) => info[st] || ["", "", "", "", "", "", ""]);
  return {
    endWeek: end,
    weeks: wanted,
    lyWeeks: lyList,
    data: weeksOut,
    styles,
    info: infoOut, // [품목, 복종, 아이템, 년도, 성별, 스타일명, 시즌]
    pending,
    computed,
    archiveFrom: archived[0] || "",
    ms: Date.now() - t0,
  };
}
