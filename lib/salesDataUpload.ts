import * as XLSX from "xlsx";

// MARK 6.16: 주간판매데이터 워크북(재고/생산/기간판매(전주,2주)/기간판매(3주,4주)/재런칭/라인업/신상리스트)을
// 업로드하면, 그 안의 "원본→ 품번구분/컬러구분" 수식을 코드로 재현해서 판매데이터 페이지에 필요한
// 표(품번 리포트/컬러 리포트)를 만들어줍니다. (1단계: 카테고리/가격/생산라이프사이클/랭킹/금액판매/
// 수량판매/재고총계까지. 매장별 등급 블록·가용재고·액션은 2단계에서 추가 예정)

function text(v: any) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function num(v: any) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/,/g, "").replace(/%/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function sheetToRows(workbook: XLSX.WorkBook, sheetName: string): any[][] {
  const sheet = workbook.Sheets[sheetName] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
}

// 시트 안에서 "스타일" 텍스트가 있는 헤더 행을 찾습니다 (없으면 fallback 행 사용).
function findHeaderRowIdx(rows: any[][], mustIncludeAny: string[], fallback: number): number {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const joined = (rows[i] || []).map((v) => text(v)).join("|");
    if (mustIncludeAny.some((k) => joined.includes(k))) return i;
  }
  return fallback;
}

function findCol(header: any[], labels: string[], fallback: number): number {
  const normalized = (header || []).map((v) => text(v).replace(/\s/g, ""));
  for (const label of labels) {
    const target = label.replace(/\s/g, "");
    const idx = normalized.findIndex((v) => v === target);
    if (idx >= 0) return idx;
  }
  return fallback;
}

// ================= 재고 시트 =================
export type StockRow = {
  barcode: string;
  styleCode: string;
  productName: string;
  colorCode: string;
  colorName: string;
  size: string;
  cost: number;
  tagPrice: number;
  salePrice: number;
  stockQty: number;
  stockOnline: number;
  stockOffline: number;
  stockTotal: number;
  year: string;
  season: string;
  category: string;
  subCategory: string;
  item: string;
};

export function parseStockSheet(workbook: XLSX.WorkBook): StockRow[] {
  const rows = sheetToRows(workbook, "재고");
  const headerIdx = findHeaderRowIdx(rows, ["풀코드", "스타일명"], 3);
  const header = rows[headerIdx] || [];

  const col = {
    barcode: findCol(header, ["풀코드"], 0),
    style: findCol(header, ["스타일"], 6),
    productName: findCol(header, ["스타일명"], 7),
    color: findCol(header, ["칼라"], 8),
    colorName: findCol(header, ["칼라명"], 9),
    size: findCol(header, ["사이즈"], 10),
    cost: findCol(header, ["원가"], 12),
    tagPrice: findCol(header, ["Tag가", "TAG가"], 13),
    salePrice: findCol(header, ["실판매가"], 14),
    stock: findCol(header, ["재고"], 16),
    stockOnline: findCol(header, ["가용(온)"], 18),
    stockOffline: findCol(header, ["가용(오프)"], 19),
    stockTotal: findCol(header, ["가용(합계)"], 20),
    year: findCol(header, ["년도"], 21),
    season: findCol(header, ["시즌"], 22),
    category: findCol(header, ["품목"], 23),
    subCategory: findCol(header, ["복종"], 24),
    item: findCol(header, ["아이템"], 25),
  };

  const out: StockRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.length) continue;
    const styleCode = text(r[col.style]);
    if (!styleCode) continue;
    out.push({
      barcode: text(r[col.barcode]),
      styleCode,
      productName: text(r[col.productName]),
      colorCode: text(r[col.color]),
      colorName: text(r[col.colorName]),
      size: text(r[col.size]),
      cost: num(r[col.cost]),
      tagPrice: num(r[col.tagPrice]),
      salePrice: num(r[col.salePrice]),
      stockQty: num(r[col.stock]),
      stockOnline: num(r[col.stockOnline]),
      stockOffline: num(r[col.stockOffline]),
      stockTotal: num(r[col.stockTotal]),
      year: text(r[col.year]),
      season: text(r[col.season]),
      category: text(r[col.category]),
      subCategory: text(r[col.subCategory]),
      item: text(r[col.item]),
    });
  }
  return out;
}

// ================= 생산 시트 (기획/입고/판매/재고/초입고/초출고) =================
export type ProductionAgg = {
  styleCode: string;
  planned: number; // 기획
  received: number; // 입고 (생산 시트의 "생산" 그룹)
  sold: number; // 판매 (생산 시트의 "판매(기간)" 그룹)
  stock: number; // 재고 (생산 시트의 재고>전체)
  firstInDate: string; // 초입고
  firstOutDate: string; // 초출고
};

export function parseProductionSheet(workbook: XLSX.WorkBook): Map<string, ProductionAgg> {
  const rows = sheetToRows(workbook, "생산");
  const headerIdx = findHeaderRowIdx(rows, ["스타일", "생산구분"], 4);
  // 생산 시트는 그룹행(5행)+세부행(6행) 2단 헤더 구조라, 세부 라벨은 headerIdx+1에 있습니다.
  const groupHeader = rows[headerIdx] || [];
  const subHeader = rows[headerIdx + 1] || [];

  const styleCol = findCol(subHeader, ["스타일"], 2);
  const firstInCol = findCol(groupHeader, ["초입고"], 15);
  const firstOutCol = findCol(groupHeader, ["초출고"], 16);
  const plannedCol = findCol(groupHeader, ["기획"], 25); // "기획" 그룹의 "수량" 서브컬럼
  const receivedCol = findCol(groupHeader, ["생산"], 34); // "생산" 그룹의 "수량" 서브컬럼
  const soldCol = findCol(groupHeader, ["판매(기간)"], 51); // "판매(기간)" 그룹의 "수량" 서브컬럼
  const stockCol = findCol(groupHeader, ["전체"], 57); // "재고" 그룹의 "전체" 서브컬럼

  const map = new Map<string, ProductionAgg>();
  for (let i = headerIdx + 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.length) continue;
    const styleCode = text(r[styleCol]);
    if (!styleCode || styleCode.includes("합계")) continue;

    if (!map.has(styleCode)) {
      map.set(styleCode, {
        styleCode,
        planned: 0,
        received: 0,
        sold: 0,
        stock: 0,
        firstInDate: "",
        firstOutDate: "",
      });
    }
    const agg = map.get(styleCode)!;
    agg.planned += num(r[plannedCol]);
    agg.received += num(r[receivedCol]);
    agg.sold += num(r[soldCol]);
    agg.stock += num(r[stockCol]);
    if (!agg.firstInDate) {
      const v = text(r[firstInCol]);
      if (v) agg.firstInDate = v;
    }
    if (!agg.firstOutDate) {
      const v = text(r[firstOutCol]);
      if (v) agg.firstOutDate = v;
    }
  }
  return map;
}

// ================= 기간판매(전주,2주) / 기간판매(3주,4주) 시트 =================
export type PeriodSalesAgg = {
  // 회사 전체(품번 기준) 합계
  byStyle: Map<string, { period1Qty: number; period1Amount: number; period2Qty: number; period2Amount: number }>;
  // 품번+칼라 기준 합계
  byStyleColor: Map<string, { period1Qty: number; period1Amount: number; period2Qty: number; period2Amount: number }>;
};

export function parsePeriodSalesSheet(workbook: XLSX.WorkBook): PeriodSalesAgg {
  const rows = sheetToRows(workbook, workbook.SheetNames.find((n) => n.startsWith("기간판매")) || "");
  const headerIdx = findHeaderRowIdx(rows, ["스타일", "채널"], 3);
  const groupHeader = rows[headerIdx] || [];
  const subHeader = rows[headerIdx + 1] || [];

  const styleCol = findCol(groupHeader, ["스타일"], 4);
  const colorCol = findCol(groupHeader, ["칼라"], 6);
  // "기간판매1"/"기간판매2" 그룹의 "합계"(순판매수량)/"판매금액" 서브컬럼
  const p1GroupStart = findCol(groupHeader, ["기간판매1"], 22);
  const p2GroupStart = findCol(groupHeader, ["기간판매2"], 26);
  const p1QtyCol = p1GroupStart + 2; // 판매,반품,합계,판매금액 순서 중 "합계"
  const p1AmountCol = p1GroupStart + 3;
  const p2QtyCol = p2GroupStart + 2;
  const p2AmountCol = p2GroupStart + 3;

  const byStyle = new Map<string, { period1Qty: number; period1Amount: number; period2Qty: number; period2Amount: number }>();
  const byStyleColor = new Map<string, { period1Qty: number; period1Amount: number; period2Qty: number; period2Amount: number }>();

  for (let i = headerIdx + 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.length) continue;
    const styleCode = text(r[styleCol]);
    if (!styleCode) continue;
    const colorCode = text(r[colorCol]);

    const p1Qty = num(r[p1QtyCol]);
    const p1Amount = num(r[p1AmountCol]);
    const p2Qty = num(r[p2QtyCol]);
    const p2Amount = num(r[p2AmountCol]);

    if (!byStyle.has(styleCode)) byStyle.set(styleCode, { period1Qty: 0, period1Amount: 0, period2Qty: 0, period2Amount: 0 });
    const s = byStyle.get(styleCode)!;
    s.period1Qty += p1Qty;
    s.period1Amount += p1Amount;
    s.period2Qty += p2Qty;
    s.period2Amount += p2Amount;

    const scKey = `${styleCode}__${colorCode}`;
    if (!byStyleColor.has(scKey)) byStyleColor.set(scKey, { period1Qty: 0, period1Amount: 0, period2Qty: 0, period2Amount: 0 });
    const sc = byStyleColor.get(scKey)!;
    sc.period1Qty += p1Qty;
    sc.period1Amount += p1Amount;
    sc.period2Qty += p2Qty;
    sc.period2Amount += p2Amount;
  }

  return { byStyle, byStyleColor };
}

// ================= 재런칭 / 라인업 / 신상리스트 (기준→ 시트) =================
export function parseFlagSheetByStyle(workbook: XLSX.WorkBook, label: string): Set<string> {
  const sheetName = workbook.SheetNames[0];
  const rows = sheetToRows(workbook, sheetName);
  const set = new Set<string>();
  for (const r of rows) {
    if (!r || !r.length) continue;
    // 품번처럼 보이는 값(영문+숫자 조합, 6자 이상)을 찾아서 등록합니다.
    for (const cell of r) {
      const v = text(cell);
      if (/^[A-Z]{1,4}\d[A-Z0-9]{4,}$/.test(v)) {
        set.add(v);
        break;
      }
    }
  }
  return set;
}

export function parseLineupSheet(workbook: XLSX.WorkBook): Map<string, string> {
  const rows = sheetToRows(workbook, workbook.SheetNames[0]);
  const map = new Map<string, string>();
  for (const r of rows) {
    if (!r || !r.length) continue;
    const style = r.find((c: any) => /^[A-Z]{1,4}\d[A-Z0-9]{4,}$/.test(text(c)));
    const lineupName = r[r.length - 1];
    if (style && text(lineupName)) map.set(text(style), text(lineupName));
  }
  return map;
}

// ================= 스냅샷 저장/조회 =================
import { getDbSheetId, getSheetValuesById, ensureSheetExistsById, appendValuesById } from "@/lib/googleSheets";

const SNAPSHOT_SHEET = "SalesData_Upload_Snapshot";
const SNAPSHOT_HEADER = ["주차", "구분", "파트", "갱신일시", "행수", "상세JSON"];
const MAX_CELL_CHARS = 40000;

function nowKST() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function currentWeekMonday(): string {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const day = kst.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(kst);
  monday.setDate(kst.getDate() + diffToMonday);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
}

function chunkRowsBySize(rows: any[][], maxChars = MAX_CELL_CHARS): any[][][] {
  const chunks: any[][][] = [];
  let current: any[][] = [];
  let currentLen = 2;
  for (const row of rows) {
    const len = JSON.stringify(row).length + 1;
    if (current.length && currentLen + len > maxChars) {
      chunks.push(current);
      current = [];
      currentLen = 2;
    }
    current.push(row);
    currentLen += len;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export async function saveReportSnapshot(kind: "style" | "color", report: { rows: any[][]; rowCount: number; colCount: number }) {
  const dbId = getDbSheetId();
  const weekKey = currentWeekMonday();
  await ensureSheetExistsById(dbId, SNAPSHOT_SHEET, SNAPSHOT_HEADER);

  const chunks = chunkRowsBySize(report.rows);
  const savedAt = nowKST();
  const newRows = chunks.map((chunk, i) => [weekKey, kind, i + 1, savedAt, report.rowCount, JSON.stringify(chunk)]);
  await appendValuesById(dbId, `'${SNAPSHOT_SHEET}'!A:F`, newRows);

  return { weekKey, partCount: chunks.length, rowCount: report.rowCount };
}

export async function loadLatestReportSnapshot(kind: "style" | "color"): Promise<{ rows: any[][]; weekKey: string } | null> {
  const dbId = getDbSheetId();
  const rows = await getSheetValuesById(dbId, SNAPSHOT_SHEET, "A:F").catch(() => []);
  if (!rows.length) return null;

  const body = rows.slice(1).filter((r) => text(r[1]) === kind);
  if (!body.length) return null;

  const weeks = Array.from(new Set(body.map((r) => text(r[0])))).sort();
  const latestWeek = weeks[weeks.length - 1];
  const partsForWeek = body
    .filter((r) => text(r[0]) === latestWeek)
    .sort((a, b) => num(a[2]) - num(b[2]));

  let combined: any[][] = [];
  for (const r of partsForWeek) {
    try {
      const chunk = JSON.parse(text(r[5]) || "[]");
      combined = combined.concat(chunk);
    } catch {
      // 파싱 실패한 파트는 건너뜁니다.
    }
  }
  return { rows: combined, weekKey: latestWeek };
}

// ================= 최종 리포트 조립 =================
// 프론트엔드(SalesDataDashboard.tsx)가 그대로 읽을 수 있는 "엑셀형 rows" 배열을 만듭니다.
// rows[0]=제목, rows[2]=그룹헤더, rows[3]=서브헤더(컬럼명), rows[5]=합계행, rows[7]부터 데이터.
const HEADER_ROW_COUNT = 7;

const GROUP_ROW = 2;
const SUB_HEADER_ROW = 3;
const TOTAL_ROW = 5;

type ReportInputs = {
  stockRows: StockRow[];
  production: Map<string, ProductionAgg>;
  periodA: PeriodSalesAgg; // 기간판매(전주,2주)
  periodB: PeriodSalesAgg; // 기간판매(3주,4주)
  relaunch: Set<string>;
  lineup: Map<string, string>;
};

function buildColumnLayout(withColor: boolean) {
  const cols: string[] = [];
  cols.push("순위", "품번");
  if (withColor) cols.push("컬러", "컬러명");
  cols.push("품명", "년도", "시즌", "품목", "복종", "아이템", "재런칭", "라인업", "TAG가", "판매가");
  const lifecycleStart = cols.length;
  cols.push("기획", "입고", "입고%", "판매", "재고", "판매%", "초입고", "초출고");
  const rankStart = cols.length;
  cols.push("주간", "2주전", "등락");
  const amountStart = cols.length;
  cols.push("주간", "2주전", "비중");
  const qtyStart = cols.length;
  cols.push("주간", "2주전", "3주전", "4주전");
  const stockStart = cols.length;
  cols.push("총재고", "물류", "물류(온)", "물류(오프)", "점포");
  return { cols, lifecycleStart, rankStart, amountStart, qtyStart, stockStart };
}

function buildHeaderRows(withColor: boolean) {
  const layout = buildColumnLayout(withColor);
  const rows: any[][] = [];
  rows.push([`주간판매데이터 자동생성 (${withColor ? "컬러" : "품번"})`]);
  rows.push([]);
  const groupRow: any[] = new Array(layout.cols.length).fill("");
  groupRow[layout.lifecycleStart] = "제품라이프사이클";
  groupRow[layout.rankStart] = "랭킹";
  groupRow[layout.amountStart] = "금액판매";
  groupRow[layout.qtyStart] = "수량판매";
  groupRow[layout.stockStart] = "재고";
  rows.push(groupRow);
  rows.push(layout.cols);
  rows.push([]);
  rows.push([]); // TOTAL_ROW는 아래에서 채움
  rows.push([]);
  return { rows, layout };
}

function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

export function buildStyleReport(inputs: ReportInputs) {
  const { stockRows, production, periodA, periodB, relaunch, lineup } = inputs;

  // 품번 단위 재고/가격 정보 (같은 품번의 여러 칼라/사이즈 행을 합산)
  const styleMaster = new Map<string, {
    productName: string; year: string; season: string; category: string; subCategory: string; item: string;
    tagPrice: number; salePrice: number;
    stockTotal: number; stockOnline: number; stockOffline: number;
  }>();
  for (const r of stockRows) {
    if (!styleMaster.has(r.styleCode)) {
      styleMaster.set(r.styleCode, {
        productName: r.productName, year: r.year, season: r.season, category: r.category, subCategory: r.subCategory, item: r.item,
        tagPrice: r.tagPrice, salePrice: r.salePrice,
        stockTotal: 0, stockOnline: 0, stockOffline: 0,
      });
    }
    const m = styleMaster.get(r.styleCode)!;
    m.stockTotal += r.stockTotal;
    m.stockOnline += r.stockOnline;
    m.stockOffline += r.stockOffline;
  }

  const styleCodes = Array.from(styleMaster.keys());

  // 랭킹 계산을 위해 전체 스타일의 금액판매(주간)를 먼저 구합니다.
  const amountByStyle = new Map<string, number>();
  const prevAmountByStyle = new Map<string, number>();
  for (const s of styleCodes) {
    amountByStyle.set(s, periodA.byStyle.get(s)?.period1Amount || 0);
    prevAmountByStyle.set(s, periodA.byStyle.get(s)?.period2Amount || 0);
  }
  const rankOrder = [...styleCodes].sort((a, b) => (amountByStyle.get(b) || 0) - (amountByStyle.get(a) || 0));
  const rankMap = new Map<string, number>();
  rankOrder.forEach((s, i) => rankMap.set(s, i + 1));
  const prevRankOrder = [...styleCodes].sort((a, b) => (prevAmountByStyle.get(b) || 0) - (prevAmountByStyle.get(a) || 0));
  const prevRankMap = new Map<string, number>();
  prevRankOrder.forEach((s, i) => prevRankMap.set(s, i + 1));

  const totalCompanyAmount = styleCodes.reduce((sum, s) => sum + (amountByStyle.get(s) || 0), 0);

  const { rows: headerRows, layout } = buildHeaderRows(false);

  const dataRows = styleCodes.map((styleCode) => {
    const master = styleMaster.get(styleCode)!;
    const prod = production.get(styleCode);
    const pA = periodA.byStyle.get(styleCode);
    const pB = periodB.byStyle.get(styleCode);

    const planned = prod?.planned || 0;
    const received = prod?.received || 0;
    const sold = prod?.sold || 0;
    const prodStock = prod?.stock || 0;

    const rank = rankMap.get(styleCode) || 0;
    const prevRank = prevRankMap.get(styleCode) || 0;

    const row: any[] = [];
    row.push(rank, styleCode, master.productName, master.year, master.season, master.category, master.subCategory, master.item,
      relaunch.has(styleCode) ? "재런칭" : "", lineup.get(styleCode) || "", master.tagPrice, master.salePrice);
    // 제품라이프사이클
    row.push(planned, received, pct(received, planned), sold, prodStock, pct(sold, received), prod?.firstInDate || "", prod?.firstOutDate || "");
    // 랭킹
    row.push(rank, prevRank, prevRank - rank);
    // 금액판매
    row.push(pA?.period1Amount || 0, pA?.period2Amount || 0, pct(pA?.period1Amount || 0, totalCompanyAmount));
    // 수량판매 (전주,2주,3주전,4주전)
    row.push(pA?.period1Qty || 0, pA?.period2Qty || 0, pB?.period1Qty || 0, pB?.period2Qty || 0);
    // 재고
    row.push(master.stockTotal, master.stockOnline + master.stockOffline, master.stockOnline, master.stockOffline, Math.max(0, master.stockTotal - master.stockOnline - master.stockOffline));

    return row;
  });

  // 합계 행 채우기
  const totalRow: any[] = new Array(layout.cols.length).fill("");
  totalRow[layout.amountStart] = totalCompanyAmount;
  totalRow[layout.qtyStart] = styleCodes.reduce((sum, s) => sum + (periodA.byStyle.get(s)?.period1Qty || 0), 0);
  headerRows[TOTAL_ROW] = totalRow;

  return { headers: headerRows, rows: [...headerRows, ...dataRows], rowCount: dataRows.length, colCount: layout.cols.length };
}

export function buildColorReport(inputs: ReportInputs) {
  const { stockRows, production, periodA, periodB, relaunch, lineup } = inputs;

  const colorMaster = new Map<string, {
    styleCode: string; colorCode: string; colorName: string; productName: string;
    year: string; season: string; category: string; subCategory: string; item: string;
    tagPrice: number; salePrice: number;
    stockTotal: number; stockOnline: number; stockOffline: number;
  }>();
  for (const r of stockRows) {
    const key = `${r.styleCode}__${r.colorCode}`;
    if (!colorMaster.has(key)) {
      colorMaster.set(key, {
        styleCode: r.styleCode, colorCode: r.colorCode, colorName: r.colorName, productName: r.productName,
        year: r.year, season: r.season, category: r.category, subCategory: r.subCategory, item: r.item,
        tagPrice: r.tagPrice, salePrice: r.salePrice,
        stockTotal: 0, stockOnline: 0, stockOffline: 0,
      });
    }
    const m = colorMaster.get(key)!;
    m.stockTotal += r.stockTotal;
    m.stockOnline += r.stockOnline;
    m.stockOffline += r.stockOffline;
  }

  const keys = Array.from(colorMaster.keys());
  const amountByKey = new Map<string, number>();
  const prevAmountByKey = new Map<string, number>();
  for (const k of keys) {
    const m = colorMaster.get(k)!;
    const scKey = `${m.styleCode}__${m.colorCode}`;
    amountByKey.set(k, periodA.byStyleColor.get(scKey)?.period1Amount || 0);
    prevAmountByKey.set(k, periodA.byStyleColor.get(scKey)?.period2Amount || 0);
  }
  const rankOrder = [...keys].sort((a, b) => (amountByKey.get(b) || 0) - (amountByKey.get(a) || 0));
  const rankMap = new Map<string, number>();
  rankOrder.forEach((k, i) => rankMap.set(k, i + 1));
  const prevRankOrder = [...keys].sort((a, b) => (prevAmountByKey.get(b) || 0) - (prevAmountByKey.get(a) || 0));
  const prevRankMap = new Map<string, number>();
  prevRankOrder.forEach((k, i) => prevRankMap.set(k, i + 1));

  const totalCompanyAmount = keys.reduce((sum, k) => sum + (amountByKey.get(k) || 0), 0);

  const { rows: headerRows, layout } = buildHeaderRows(true);

  const dataRows = keys.map((key) => {
    const m = colorMaster.get(key)!;
    const scKey = `${m.styleCode}__${m.colorCode}`;
    const prod = production.get(m.styleCode); // 초입고/초출고/기획/입고/판매/재고는 품번 단위로만 존재
    const pA = periodA.byStyleColor.get(scKey);
    const pB = periodB.byStyleColor.get(scKey);

    const planned = prod?.planned || 0;
    const received = prod?.received || 0;
    const sold = prod?.sold || 0;
    const prodStock = prod?.stock || 0;

    const rank = rankMap.get(key) || 0;
    const prevRank = prevRankMap.get(key) || 0;

    const row: any[] = [];
    row.push(rank, m.styleCode, m.colorCode, m.colorName, m.productName, m.year, m.season, m.category, m.subCategory, m.item,
      relaunch.has(m.styleCode) ? "재런칭" : "", lineup.get(m.styleCode) || "", m.tagPrice, m.salePrice);
    row.push(planned, received, pct(received, planned), sold, prodStock, pct(sold, received), prod?.firstInDate || "", prod?.firstOutDate || "");
    row.push(rank, prevRank, prevRank - rank);
    row.push(pA?.period1Amount || 0, pA?.period2Amount || 0, pct(pA?.period1Amount || 0, totalCompanyAmount));
    row.push(pA?.period1Qty || 0, pA?.period2Qty || 0, pB?.period1Qty || 0, pB?.period2Qty || 0);
    row.push(m.stockTotal, m.stockOnline + m.stockOffline, m.stockOnline, m.stockOffline, Math.max(0, m.stockTotal - m.stockOnline - m.stockOffline));

    return row;
  });

  const totalRow: any[] = new Array(layout.cols.length).fill("");
  totalRow[layout.amountStart] = totalCompanyAmount;
  totalRow[layout.qtyStart] = keys.reduce((sum, k) => {
    const m = colorMaster.get(k)!;
    return sum + (periodA.byStyleColor.get(`${m.styleCode}__${m.colorCode}`)?.period1Qty || 0);
  }, 0);
  headerRows[TOTAL_ROW] = totalRow;

  return { headers: headerRows, rows: [...headerRows, ...dataRows], rowCount: dataRows.length, colCount: layout.cols.length };
}

