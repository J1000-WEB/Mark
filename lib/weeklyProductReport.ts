// MARK 2026-11-18: 상품탭 "주간데이터" — 팀이 매주 월요일 만들던 "주간판매데이터" 엑셀의 `품번구분`·`컬러구분` 시트를 자동으로.
//
// 기준(소천님 결정 2026-11-18)
//   - 판매: Daily_Sales_History 실판매(오프라인, **매장주문/매장반품 제외**, 온라인 제외 — IMC 현황과 같은 isPromoExcludedStore)
//   - 주간 = 월~일. 수량은 주간·2주전·3주전·4주전, 금액은 주간·2주전·누계(누계는 lib 주석 cumNote 참고)·비중(주간 금액 / 오프라인 전체)
//   - 랭킹 = 주간 판매금액 순위(전사 오프라인, 같은 값은 같은 순위), 2주전 랭킹, 등락(2주전 − 주간)
//   - 상품·가격·라이프사이클·재고 = 대시보드 PIP 시트(최신 1일치, 재고 기준일 = PIP 기준일자)
//       원가=18열, TAG가=소비자가 19열, 판매가=20열, OFF가=판매가×0.9, 프로모션가=판매가×0.8(엑셀과 같은 계산식), 할인율 0.2
//       기획=21, 입고=22, 판매=26(채널 판매 누적), 재고=28(합계재고), 입고%=입고/기획, 판매%=판매/입고
//       총재고 = 물류(25) + 점포(오프라인 매장 채널 재고 합, 매장주문/반품·온라인 제외), 주수 = 물류재고 ÷ 주간 판매수량
//   - 매장 23곳(엑셀과 같은 순서·S/A/B/C 등급): RANK(그 매장 안 주간 판매**수량** 순위 — 엑셀 대조로 확인), 전사비(전사 랭킹 − 매장 랭킹), 판매(주간 수량), 재고(PIP), 주수(재고÷판매)
//   - 빠진 것(소천님 결정): 기간한정가, 물류 온/오프, 초입고/초출고, 액션
//   - 품번구분 = 4주 판매가 있거나 합계재고가 있는 전 품번, 컬러구분 = 올해 상품(년도=기준주 연도)만 품번+칼라
//   - 재런칭·라인업 표시 = MARK_DB "상품_기준표"(lib/productRefs.ts)
// 계산이 1분 넘게 걸려서 결과를 MARK_DB "주간데이터_캐시"에 주차별로 저장(base64 gzip 조각) — 화면은 캐시를 읽고, "다시 계산"으로 갱신.
import { gzipSync, gunzipSync } from "zlib";
import { readDailyHistoryRowsForExactDates, pickDailySheetTitle } from "@/lib/dailySales";
import {
  getDailySourceSheetId,
  getSpreadsheetTitlesById,
  getSheetValuesById,
  getDbSheetId,
  ensureSheetExistsById,
  ensureGridColsById,
  getSheetsClient,
} from "@/lib/googleSheets";
import { expandStyleChannelRows } from "@/lib/styleChannelCompact";
import { loadChannelMaster } from "@/lib/channelMaster";
import { isPromoExcludedStore } from "@/lib/promoReport";
import { readSalesSummarySnapshot, normalizeStoreKey } from "@/lib/dataBuilder";
import { readProductRefs, buildRefMaps } from "@/lib/productRefs";

// 엑셀 `품번구분` 3~5행의 매장 순서·코드·표시명·등급
export const WEEKLY_STORES: { code: string; short: string; grade: "S" | "A" | "B" | "C" }[] = [
  { code: "21030", short: "성수", grade: "S" },
  { code: "42002", short: "H송도", grade: "A" },
  { code: "46003", short: "L김해", grade: "A" },
  { code: "21011", short: "신사", grade: "A" },
  { code: "42004", short: "H남양주", grade: "A" },
  { code: "54001", short: "H청주", grade: "A" },
  { code: "51018", short: "I용산", grade: "A" },
  { code: "31001", short: "S센텀", grade: "A" },
  { code: "51024", short: "T영등포", grade: "A" },
  { code: "36001", short: "L광복", grade: "A" },
  { code: "41001", short: "L서울역", grade: "A" },
  { code: "55001", short: "LF광양", grade: "A" },
  { code: "52006", short: "SP고양", grade: "B" },
  { code: "32033", short: "L평촌", grade: "B" },
  { code: "34002", short: "S대전", grade: "B" },
  { code: "32005", short: "S의정부", grade: "B" },
  { code: "46004", short: "동부산", grade: "B" },
  { code: "21012", short: "한남", grade: "B" },
  { code: "52034", short: "SP운정", grade: "C" },
  { code: "35002", short: "S광주", grade: "C" },
  { code: "31031", short: "H신촌", grade: "C" },
  { code: "21034", short: "서울숲", grade: "C" },
  { code: "21016", short: "포시즌", grade: "C" },
];

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
export function mondayOf(ymd: string) {
  const d = new Date(`${ymd}T00:00:00Z`);
  return addDays(ymd, -((d.getUTCDay() + 6) % 7));
}
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
export const lastCompletedWeek = () => addDays(mondayOf(kstToday()), -7);

type Acc = { qty: number[]; amt: number[] }; // 주 index 0=주간,1=2주전,2=3주전,3=4주전
const newAcc = (): Acc => ({ qty: [0, 0, 0, 0], amt: [0, 0, 0, 0] });

export async function computeWeeklyProductReport(weekStart: string) {
  const weeks = [0, 1, 2, 3].map((i) => addDays(weekStart, -7 * i));
  const dates = weeks.flatMap((w) => [0, 1, 2, 3, 4, 5, 6].map((d) => addDays(w, d)));
  const weekIdx = new Map<string, number>();
  weeks.forEach((w, i) => [0, 1, 2, 3, 4, 5, 6].forEach((d) => weekIdx.set(addDays(w, d), i)));

  // 매장 코드 → 이름(매출탭 스냅샷 채널코드)
  const snap = (await readSalesSummarySnapshot().catch(() => ({ rows: [] as any[] }))).rows;
  const codeName = new Map<string, string>();
  for (const r of snap) if (t(r.channelCode) && r.storeName && !codeName.has(t(r.channelCode))) codeName.set(t(r.channelCode), String(r.storeName));
  const storeKeys = WEEKLY_STORES.map((s) => normalizeStoreKey(codeName.get(s.code) || s.short));
  const storeIdxByKey = new Map(storeKeys.map((k, i) => [k, i]));

  const master = await loadChannelMaster().catch(() => new Map());
  const exCache = new Map<string, boolean>();
  const isOff = (s: string) => {
    let e = exCache.get(s);
    if (e === undefined) { e = isPromoExcludedStore(s, master); exCache.set(s, e); }
    return !e;
  };

  // ── 판매(Daily_Sales_History) ──
  const byStyle = new Map<string, Acc>();
  const byColor = new Map<string, Acc>();
  const storeStyleW0 = new Map<string, { qty: number; amt: number }>(); // storeIdx|style
  const storeColorW0 = new Map<string, { qty: number; amt: number }>(); // storeIdx|style|color
  const total = newAcc();
  const seen = new Set<string>();
  for (let i = 0; i < dates.length; i += 7) {
    const chunk = dates.slice(i, i + 7);
    let rows = await readDailyHistoryRowsForExactDates(chunk);
    // 시트 읽기가 가끔 빈 결과를 줌 → 빠진 날짜만 최대 3번 더 읽음(11/19 실제로 주간 판매가 전부 0으로 저장된 적 있음)
    for (let attempt = 0; attempt < 3; attempt++) {
      const got = new Set(rows.map((r) => r.date));
      const miss = chunk.filter((d) => !got.has(d) && d < kstToday());
      if (!miss.length) break;
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
      rows = rows.concat(await readDailyHistoryRowsForExactDates(miss));
    }
    for (const r of rows) {
      const wi = weekIdx.get(r.date);
      if (wi === undefined || !isOff(r.storeName)) continue;
      seen.add(r.date);
      const q = Number(r.qty) || 0, a = Number(r.amount) || 0;
      if (!q && !a) continue;
      const style = t(r.styleCode).toUpperCase();
      const color = t(r.colorCode).toUpperCase();
      total.qty[wi] += q; total.amt[wi] += a;
      const s = byStyle.get(style) || newAcc(); s.qty[wi] += q; s.amt[wi] += a; byStyle.set(style, s);
      const ck = `${style}|${color}`;
      const c = byColor.get(ck) || newAcc(); c.qty[wi] += q; c.amt[wi] += a; byColor.set(ck, c);
      if (wi === 0) {
        const si = storeIdxByKey.get(normalizeStoreKey(r.storeName));
        if (si !== undefined) {
          const k1 = `${si}|${style}`; const v1 = storeStyleW0.get(k1) || { qty: 0, amt: 0 }; v1.qty += q; v1.amt += a; storeStyleW0.set(k1, v1);
          const k2 = `${si}|${ck}`; const v2 = storeColorW0.get(k2) || { qty: 0, amt: 0 }; v2.qty += q; v2.amt += a; storeColorW0.set(k2, v2);
        }
      }
    }
  }

  // 그 주(주간) 날짜를 하루라도 못 읽었으면 저장하지 않고 실패로 돌려보냄(0으로 둔갑한 결과가 캐시에 남는 것 방지)
  const missWeek0 = dates.filter((d) => weekIdx.get(d) === 0 && d < kstToday() && !seen.has(d));
  if (missWeek0.length) throw new Error(`판매 기록을 못 읽은 날짜가 있어요(${missWeek0.join(", ")}). 잠시 뒤 다시 계산해 주세요.`);

  // ── PIP(상품·가격·라이프사이클·재고) ──
  const pipId = getDailySourceSheetId();
  const pipTitle = pickDailySheetTitle(await getSpreadsheetTitlesById(pipId));
  const pipRows = expandStyleChannelRows(await getSheetValuesById(pipId, pipTitle, "A:ZZ"));
  const h1 = pipRows[1] || [], h2 = pipRows[2] || [];
  // 채널 블록: h1에 채널명, h2에 일간/일간금액/주간/누적/재고
  const blocks: { name: string; stockCol: number }[] = [];
  for (let c = 29; c < h2.length; c++) {
    if (t(h2[c]) === "일간" && t(h1[c])) {
      let sc = -1;
      for (let k = c + 1; k < c + 6; k++) if (t(h2[k]) === "재고") { sc = k; break; }
      blocks.push({ name: t(h1[c]), stockCol: sc });
    }
  }
  // 점포 재고 = 오프라인 매장 채널 재고 합(팀 소계·매장주문/반품·온라인·기타 제외) — 오프라인팀 소계엔 매장주문 마이너스 재고가 섞여 있었음
  const TEAM_NAMES = new Set(["온라인팀", "오프라인팀", "글로벌팀", "기타", "팀합계", "합계"]);
  // 창고·본사·후원·브랜딩팀·외부(제이미/위즈원)·무신사 물류센터·"오프라인_채널"(매장주문) 같은 비매장 채널도 뺌 — 안 빼면 01.정상창고 재고가 점포로 잡혔음
  // 2026-11-19: "오프라인_…" 위탁·면세·무신사·한컬렉션 채널도 뺌 — 판매만 올라가고 재고는 관리 안 돼 마이너스로 쌓임(WBD3L04501 면세 −3,646 등)
  const NOT_STORE = /창고|물류|본사|브랜딩|후원|기부|위즈원|제이미|샘플|^오프라인_/;
  const offStoreCols = blocks.filter((b) => b.stockCol >= 0 && !TEAM_NAMES.has(b.name) && !NOT_STORE.test(b.name) && isOff(b.name)).map((b) => b.stockCol);
  const storeStockCols = WEEKLY_STORES.map((_, i) => blocks.find((b) => normalizeStoreKey(b.name) === storeKeys[i])?.stockCol ?? -1);
  let stockDate = "";
  type P = {
    year: string; season: string; cat: string; bok: string; item: string; name: string; colorName: string;
    cost: number; tag: number; price: number;
    plan: number; inQty: number; sold: number; stock: number; wh: number; store: number; storeStock: number[]; colors: Set<string>;
  };
  const pStyle = new Map<string, P>();
  const pColor = new Map<string, P>();
  const newP = (r: any[]): P => ({
    year: t(r[3]), season: t(r[4]), cat: t(r[6]), bok: t(r[7]), item: t(r[8]), name: t(r[14]), colorName: t(r[16]),
    cost: n(r[18]), tag: n(r[19]), price: n(r[20]),
    plan: 0, inQty: 0, sold: 0, stock: 0, wh: 0, store: 0, storeStock: WEEKLY_STORES.map(() => 0), colors: new Set(),
  });
  for (const r of pipRows.slice(3)) {
    const style = t(r[13]).toUpperCase();
    if (!style || style === "스타일") continue;
    if (!stockDate && r[1]) stockDate = t(r[1]);
    const color = t(r[15]).toUpperCase();
    for (const [map, key] of [[pStyle, style], [pColor, `${style}|${color}`]] as [Map<string, P>, string][]) {
      const p = map.get(key) || newP(r);
      p.plan += n(r[21]); p.inQty += n(r[22]); p.wh += n(r[25]); p.sold += n(r[26]); p.stock += n(r[28]);
      for (const c of offStoreCols) p.store += n(r[c]);
      storeStockCols.forEach((c, i) => { if (c >= 0) p.storeStock[i] += n(r[c]); });
      if (color) p.colors.add(color);
      map.set(key, p);
    }
  }
  if (/^\d{5}$/.test(stockDate)) stockDate = new Date(Math.round((Number(stockDate) - 25569) * 86400000)).toISOString().slice(0, 10);

  const refs = buildRefMaps(await readProductRefs().catch(() => []));
  const baseYear = weekStart.slice(0, 4);

  // 순위: 값이 같으면 같은 순위(엑셀 RANK와 같게, 1,2,3,4,4,6…). 값 0 이하는 순위 밖(last).
  function rankMap(keys: string[], valOf: (k: string) => number) {
    const arr = keys.map((k) => [k, valOf(k)] as [string, number]).filter(([, a]) => a > 0).sort((a, b) => b[1] - a[1]);
    const m = new Map<string, number>();
    arr.forEach(([k, v], i) => m.set(k, i > 0 && arr[i - 1][1] === v ? m.get(arr[i - 1][0])! : i + 1));
    return { m, last: arr.length + 1 };
  }

  function build(level: "style" | "color") {
    const pMap = level === "style" ? pStyle : pColor;
    const sMap = level === "style" ? byStyle : byColor;
    const storeMap = level === "style" ? storeStyleW0 : storeColorW0;
    const keys = new Set<string>([...pMap.keys(), ...sMap.keys()]);
    // 컬러구분 = 올해 상품만. 단 러닝 재런칭 예전 품번(상품_기준표 재런칭)은 "러닝 합산"용으로 같이 내려보내고 extra 표시(순위 계산엔 안 넣음)
    const isExtra = (k: string) => level === "color" && (pMap.get(k)?.year || "") !== baseYear;
    const list = [...keys].filter((k) => {
      const p = pMap.get(k), s = sMap.get(k);
      if (isExtra(k) && !refs.relaunch.has(k.split("|")[0])) return false;
      return (s && s.qty.some((x) => x !== 0)) || (p && p.stock > 0);
    });
    const rankList = list.filter((k) => !isExtra(k));
    const r0 = rankMap(rankList, (k) => sMap.get(k)?.amt[0] || 0);
    const r1 = rankMap(rankList, (k) => sMap.get(k)?.amt[1] || 0);
    // 매장별 랭킹 = 그 매장 주간 판매 **수량** 순(엑셀 확인: 전사 랭킹은 금액, 매장 RANK는 수량)
    const storeRanks = WEEKLY_STORES.map((_, si) => rankMap(rankList, (k) => storeMap.get(`${si}|${k}`)?.qty || 0));
    return list
      .map((k) => {
        const [style, color = ""] = k.split("|");
        const p = pMap.get(k);
        const s = sMap.get(k) || newAcc();
        const rank = r0.m.get(k) || r0.last;
        const prevRank = r1.m.get(k) || r1.last;
        return {
          k,
          style,
          color,
          colorName: level === "color" ? p?.colorName || "" : "",
          year: p?.year || "",
          season: p?.season || "",
          cat: p?.cat || "",
          bok: p?.bok || "",
          item: p?.item || "",
          relaunch: refs.relaunch.has(style),
          main: refs.mainOf(style),
          extra: isExtra(k),
          lineup: refs.lineupOf(style, level === "color" ? color : ""),
          name: p?.name || "",
          nColors: p?.colors.size || 0,
          cost: p?.cost || 0,
          tag: p?.tag || 0,
          price: p?.price || 0,
          plan: p?.plan || 0,
          inQty: p?.inQty || 0,
          sold: p?.sold || 0,
          stock: p?.stock || 0,
          rank,
          prevRank,
          amt: [Math.round(s.amt[0]), Math.round(s.amt[1])],
          share: total.amt[0] ? s.amt[0] / total.amt[0] : 0,
          qty: s.qty,
          totalStock: (p?.wh || 0) + (p?.store || 0),
          wh: p?.wh || 0,
          storeStockSum: p?.store || 0,
          stores: WEEKLY_STORES.map((_, si) => {
            const v = storeMap.get(`${si}|${k}`);
            const sr = storeRanks[si];
            // [그 매장 순위, 주간수량, 매장재고, 주간금액(2026-11-19 추가 — 구성비 점포별 그래프용)]
            return [v?.qty && v.qty > 0 ? sr.m.get(k) || sr.last : 0, v?.qty || 0, p?.storeStock[si] || 0, Math.round(v?.amt || 0)];
          }),
        };
      })
      .sort((a, b) => a.rank - b.rank || b.totalStock - a.totalStock);
  }

  const styles = build("style");
  const colors = build("color");
  return {
    weekStart,
    weekEnd: addDays(weekStart, 6),
    weeks: weeks.map((w) => ({ start: w, end: addDays(w, 6) })),
    stockDate,
    storeChannels: blocks.filter((b) => offStoreCols.includes(b.stockCol)).map((b) => b.name),
    stores: WEEKLY_STORES.map((s, i) => ({ ...s, name: codeName.get(s.code) || s.short, stockCol: storeStockCols[i] >= 0 })),
    total: { qty: total.qty, amt: total.amt.map(Math.round) },
    datesWithData: seen.size,
    generatedAt: new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19),
    styles,
    colors,
  };
}

// ── 캐시(MARK_DB "주간데이터_캐시": [주시작, 저장시각, 조각수, 조각…]) ──
const CACHE_SHEET = "주간데이터_캐시";
const CHUNK = 45000;
const MAX_COLS = 80;

export async function readWeeklyCache(weekStart: string) {
  const id = getDbSheetId();
  await ensureSheetExistsById(id, CACHE_SHEET, ["주시작", "저장시각", "조각수", "데이터"]);
  const col = await getSheetValuesById(id, CACHE_SHEET, "A:A");
  const rowNo = col.findIndex((r, i) => i > 0 && t(r?.[0]) === weekStart);
  if (rowNo < 0) return null;
  const row = (await getSheetValuesById(id, CACHE_SHEET, `A${rowNo + 1}:CB${rowNo + 1}`))[0] || [];
  const k = n(row[2]);
  if (!k) return null;
  const b64 = row.slice(3, 3 + k).map((c: any) => t(c)).join("");
  return JSON.parse(gunzipSync(Buffer.from(b64, "base64")).toString("utf8"));
}

export async function writeWeeklyCache(weekStart: string, data: any) {
  const id = getDbSheetId();
  await ensureSheetExistsById(id, CACHE_SHEET, ["주시작", "저장시각", "조각수", "데이터"]);
  await ensureGridColsById(id, CACHE_SHEET, MAX_COLS);
  const b64 = gzipSync(Buffer.from(JSON.stringify(data), "utf8"), { level: 9 }).toString("base64");
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += CHUNK) chunks.push(b64.slice(i, i + CHUNK));
  if (chunks.length + 3 > MAX_COLS) throw new Error(`캐시가 너무 커요(${chunks.length}조각)`);
  const col = await getSheetValuesById(id, CACHE_SHEET, "A:A");
  let rowNo = col.findIndex((r, i) => i > 0 && t(r?.[0]) === weekStart) + 1;
  if (rowNo <= 0) rowNo = Math.max(col.length, 1) + 1;
  const row = [weekStart, data.generatedAt, chunks.length, ...chunks];
  while (row.length < MAX_COLS) row.push("");
  // RAW: base64 조각이 "+"·"="로 시작하면 USER_ENTERED에선 수식으로 읽혀 깨짐
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({ spreadsheetId: id, range: `'${CACHE_SHEET}'!A${rowNo}`, valueInputOption: "RAW", requestBody: { values: [row] } });
  return { chunks: chunks.length, kb: Math.round(b64.length / 1024) };
}

/** 점검용: 한 품번의 채널별 재고(PIP 시트, 사이즈·컬러 합) */
export async function debugStyleChannelStock(style: string) {
  const pipId = getDailySourceSheetId();
  const pipTitle = pickDailySheetTitle(await getSpreadsheetTitlesById(pipId));
  const pipRows = expandStyleChannelRows(await getSheetValuesById(pipId, pipTitle, "A:ZZ"));
  const h1 = pipRows[1] || [], h2 = pipRows[2] || [];
  const out = new Map<string, number>();
  for (const r of pipRows.slice(3)) {
    if (String(r[13] ?? "").trim().toUpperCase() !== style.toUpperCase()) continue;
    for (let c = 29; c < h2.length; c++) {
      if (String(h2[c] ?? "").trim() !== "일간" || !String(h1[c] ?? "").trim()) continue;
      for (let k = c + 1; k < c + 6; k++) if (String(h2[k] ?? "").trim() === "재고") { out.set(String(h1[c]).trim(), (out.get(String(h1[c]).trim()) || 0) + (Number(r[k]) || 0)); break; }
    }
  }
  return [...out.entries()].filter(([, v]) => v !== 0).sort((a, b) => a[1] - b[1]);
}
