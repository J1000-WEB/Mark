// MARK 2026-11-21: 품번·품번+칼라별 판매 "누계"(오프라인팀 실판매 수량·금액) — PIP 과거 보관(MARK_PIP_ARCHIVE 판매_일별) 전체를 더함.
// ERP PIP엔 누계 금액 필드가 없어서(누계 수량만) 보관 시트로 계산. 보관 시작일(지금 2025-11-01, 그 전은 밤마다 거꾸로 채우는 중)부터.
// 범위 = ERP 팀 "오프라인팀" 채널 중 매장주문/반품 등 isPromoExcludedStore 제외(구성비 전년비·IMC와 같은 기준).
// 속도: 한 달치씩 묶어 MARK_DB "판매누계_월별"에 저장(월, 저장시각, 일수, 조각수, 조각…). 지난달까지는 저장본, 이번 달은 그때그때 계산.
// 저장된 달의 일수가 보관 시트의 그 달 일수와 다르면(뒤늦게 채워진 날) 다시 계산.
import { gzipSync, gunzipSync } from "zlib";
import { archivedSalesDates, readArchivedSales } from "@/lib/pipArchive";
import { isPromoExcludedStore } from "@/lib/promoReport";
import { getDbSheetId, ensureSheetExistsById, ensureGridColsById, getSheetValuesById, getSheetsClient } from "@/lib/googleSheets";

const TAB = "판매누계_월별";
const HEADER = ["월", "저장시각", "일수", "조각수", "데이터"];
const CHUNK = 45000;
const MAX_COLS = 60;
type QA = [number, number];
type MonthAgg = { s: Record<string, QA>; c: Record<string, QA> };

const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

function addInto(dst: Record<string, QA>, k: string, q: number, a: number) {
  const v = dst[k] || (dst[k] = [0, 0]);
  v[0] += q;
  v[1] += a;
}

async function aggregateDates(dates: string[]): Promise<MonthAgg> {
  const out: MonthAgg = { s: {}, c: {} };
  for (let i = 0; i < dates.length; i += 8) {
    const { rows } = await readArchivedSales(dates.slice(i, i + 8));
    for (const r of rows) {
      if (r.team !== "오프라인팀" || isPromoExcludedStore(r.storeName)) continue;
      const q = Number(r.qty) || 0, a = Number(r.amount) || 0;
      if (!q && !a) continue;
      const st = String(r.styleCode || "").toUpperCase();
      const co = String(r.colorCode || "").toUpperCase();
      addInto(out.s, st, q, a);
      addInto(out.c, `${st}|${co}`, q, a);
    }
  }
  return out;
}

async function readMonthCache(): Promise<Map<string, { days: number; row: number; data: () => MonthAgg }>> {
  const id = getDbSheetId();
  await ensureSheetExistsById(id, TAB, HEADER);
  const vals = await getSheetValuesById(id, TAB, `A:BH`).catch(() => [] as any[][]);
  const m = new Map<string, { days: number; row: number; data: () => MonthAgg }>();
  vals.forEach((r, i) => {
    if (i === 0 || !/^\d{4}-\d{2}$/.test(String(r?.[0] || ""))) return;
    const k = Number(r[3]) || 0;
    m.set(String(r[0]), {
      days: Number(r[2]) || 0,
      row: i + 1,
      data: () => JSON.parse(gunzipSync(Buffer.from(r.slice(4, 4 + k).map((x: any) => String(x ?? "")).join(""), "base64")).toString("utf8")),
    });
  });
  return m;
}

async function writeMonthCache(month: string, days: number, agg: MonthAgg, row?: number) {
  const id = getDbSheetId();
  await ensureGridColsById(id, TAB, MAX_COLS);
  const b64 = gzipSync(Buffer.from(JSON.stringify(agg), "utf8"), { level: 9 }).toString("base64");
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += CHUNK) chunks.push(b64.slice(i, i + CHUNK));
  if (chunks.length + 4 > MAX_COLS) throw new Error(`누계 캐시가 너무 커요(${month} ${chunks.length}조각)`);
  let rowNo = row;
  if (!rowNo) {
    const col = await getSheetValuesById(id, TAB, "A:A");
    rowNo = Math.max(col.length, 1) + 1;
  }
  const vals = [month, new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19), days, chunks.length, ...chunks];
  while (vals.length < MAX_COLS) vals.push("");
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({ spreadsheetId: id, range: `'${TAB}'!A${rowNo}`, valueInputOption: "RAW", requestBody: { values: [vals] } });
}

const memo = new Map<string, { at: number; v: any }>();

/** throughDate(포함)까지 보관된 모든 날짜의 누계. { from, to, days, style: {품번:[수량,금액]}, color: {품번|칼라:[수량,금액]} } */
export async function readSalesCumulative(throughDate: string) {
  const hit = memo.get(throughDate);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.v;
  const all = (await archivedSalesDates()).filter((d) => d <= throughDate);
  const byMonth = new Map<string, string[]>();
  for (const d of all) (byMonth.get(d.slice(0, 7)) || byMonth.set(d.slice(0, 7), []).get(d.slice(0, 7))!).push(d);
  const curMonth = kstToday().slice(0, 7);
  const cache = await readMonthCache();
  const style: Record<string, QA> = {}, color: Record<string, QA> = {};
  const add = (agg: MonthAgg) => {
    for (const [k, v] of Object.entries(agg.s)) addInto(style, k, v[0], v[1]);
    for (const [k, v] of Object.entries(agg.c)) addInto(color, k, v[0], v[1]);
  };
  let computed = 0;
  for (const [month, dates] of [...byMonth.entries()].sort()) {
    const throughInMonth = throughDate.slice(0, 7) === month;
    // 지난달까지(그리고 throughDate가 그 달 말까지 다 포함하는 경우)는 저장본 사용
    const complete = month < curMonth && !throughInMonth;
    const c = cache.get(month);
    if (complete && c && c.days === dates.length) {
      add(c.data());
      continue;
    }
    const agg = await aggregateDates(dates);
    computed++;
    add(agg);
    if (complete) await writeMonthCache(month, dates.length, agg, c?.row).catch((e) => console.error("누계 월 저장 실패", month, e?.message));
    // throughDate가 지난달 중간이면(예: 지난주 일요일) 그 달은 저장 안 함 — 일부 날짜만이라서
  }
  const v = { from: all[0] || "", to: all[all.length - 1] || "", days: all.length, computedMonths: computed, style, color };
  memo.set(throughDate, { at: Date.now(), v });
  return v;
}
