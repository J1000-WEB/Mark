import {
  createSheetWithValuesById,
  deleteSheetByTitleIfExistsById,
  getDailySourceSheetId,
  getHistorySheetId,
  getSheetPropsById,
  getSheetValuesById,
  getSpreadsheetTitlesById,
  renameSheetById,
} from "@/lib/googleSheets";
import { getStylePriceMap } from "@/lib/stylePriceHistory";
import { loadChannelMaster, isOnlineType, seedUnknownChannels, type ChannelType } from "@/lib/channelMaster";

function text(v: any) {
  return String(v ?? "").trim();
}

function num(v: any) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/,/g, "").replace(/%/g, "").replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function ymdKST() {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function makeDailySnapshotId() {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  const hh = String(kst.getHours()).padStart(2, "0");
  const mm = String(kst.getMinutes()).padStart(2, "0");
  const ss = String(kst.getSeconds()).padStart(2, "0");
  return `DS-${y}${m}${d}-${hh}${mm}${ss}`;
}

function normalize(v: any) {
  return text(v).replace(/[\s_\-·./()]/g, "").toLowerCase();
}

function findCol(header: any[], names: string[], fallback: number) {
  const target = names.map(normalize);
  const idx = header.findIndex((cell) => target.includes(normalize(cell)));
  return idx >= 0 ? idx : fallback;
}

function toDateText(value: any) {
  if (!value) return ymdKST();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    // Google Sheets / Excel date serial → YYYY-MM-DD
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return String(value);
  }
  const s = text(value);
  const m = s.match(/(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  return s || ymdKST();
}

function isExcludedSalesChannel(channelName: string) {
  const raw = text(channelName);
  const s = raw.toLowerCase();
  return (
    raw.startsWith("글로벌_") ||
    raw.startsWith("기타_") ||
    s.startsWith("글로벌_") ||
    s.startsWith("기타_") ||
    s.includes("글로벌") ||
    s === "기타" ||
    s.startsWith("기타")
  );
}

function isOnlineChannel(channelName: string, masterMap?: Map<string, ChannelType>) {
  if (masterMap) {
    const type = masterMap.get(text(channelName));
    if (type) return isOnlineType(type);
  }
  return isOnlineChannelHeuristic(channelName);
}

// MARK 6.47 이전의 키워드 추측 로직 — Channel_Master에 아직 없는 채널의 폴백으로만 씁니다.
function isOnlineChannelHeuristic(channelName: string) {
  const raw = text(channelName);
  const s = raw.toLowerCase();
  return (
    isExcludedSalesChannel(channelName) ||
    raw.includes("온라인") || // 접두사(startsWith)가 아니라 어디에 있든 매칭해서 더 안전하게
    raw.includes("글로벌") ||
    s.includes("무신사") ||
    s.includes("29cm") ||
    s.includes("ssf") ||
    s.includes("네이버") ||
    s.includes("지그재그") ||
    s.includes("w컨셉") ||
    s.includes("wconcept") ||
    s.includes("eql") ||
    s.includes("한섬") ||
    s.includes("쿠팡") ||
    s.includes("카카오") ||
    s.includes("브랜디") ||
    s.includes("에이블리") ||
    s.includes("티몬") ||
    s.includes("위메프") ||
    s.includes("옥션") ||
    s.includes("11번가") ||
    s.includes("gmarket") ||
    s.includes("g마켓") ||
    s.includes("스마트스토어")
  );
}

function isSummaryChannel(channelName: string) {
  const s = text(channelName);
  return !s || s === "합계" || s === "채널" || s.endsWith("팀") || s === "팀합계" || s === "기타";
}

export function pickDailySheetTitle(titles: string[]) {
  // MARK 6.31: "(금액)" 버전이 실제 판매금액(일간금액) 컬럼이 있는 최신 시트라 우선 사용합니다.
  const exactAmount = titles.find((title) => title === "스타일별 채널별 입고/판매/재고현황(금액)");
  if (exactAmount) return exactAmount;

  const exact = titles.find((title) => title === "스타일별 채널별 입고판매재고현황");
  if (exact) return exact;

  const amountVariant = titles.find((title) => {
    const n = normalize(title);
    return n.includes("스타일별") && n.includes("채널별") && n.includes("금액");
  });
  if (amountVariant) return amountVariant;

  return titles.find((title) => {
    const n = normalize(title);
    return n.includes("스타일별") && n.includes("채널별") && (n.includes("판매") || n.includes("재고"));
  }) || "";
}

function buildChannelBlocks(row2: any[], row3: any[]) {
  const blocks: any[] = [];
  let currentChannel = "";

  for (let c = 0; c < Math.max(row2.length, row3.length); c++) {
    if (text(row2[c])) currentChannel = text(row2[c]);

    if (normalize(row3[c]) === normalize("일간")) {
      const channelName = currentChannel;
      if (isSummaryChannel(channelName) || isExcludedSalesChannel(channelName)) continue;

      // MARK 6.28: "일간" 바로 다음 컬럼이 "일간금액"(실제 판매금액)이면 신규 포맷입니다.
      // 헤더 텍스트로 먼저 확인하고, 그 다음 컬럼들(주간/누적/재고)도 예상 위치에서 실제로
      // 그 이름이 맞는지 한 번 더 교차검증합니다(단순 열 번호만 믿지 않음).
      const hasDailyAmount = normalize(row3[c + 1]) === normalize("일간금액");
      const offset = hasDailyAmount ? 1 : 0;

      const dailyAmountCol = hasDailyAmount ? c + 1 : -1;
      const weeklyCol = normalize(row3[c + 1 + offset]) === normalize("주간") ? c + 1 + offset : -1;
      const cumulativeCol = normalize(row3[c + 2 + offset]) === normalize("누적") ? c + 2 + offset : -1;
      const stockCol = normalize(row3[c + 3 + offset]) === normalize("재고") ? c + 3 + offset : -1;

      blocks.push({
        channelName,
        dailyCol: c,
        dailyAmountCol,
        weeklyCol,
        cumulativeCol,
        stockCol,
      });
    }
  }

  return blocks;
}

export async function readDailySalesFromMarkDb() {
  const spreadsheetId = getDailySourceSheetId();
  const titles = await getSpreadsheetTitlesById(spreadsheetId);
  const sheetName = pickDailySheetTitle(titles);
  if (!sheetName) throw new Error("MARK_DB에서 스타일별 채널별 입고판매재고현황 시트를 찾지 못했습니다.");

  const rows = await getSheetValuesById(spreadsheetId, sheetName, "A:ZZ");
  if (rows.length < 4) throw new Error(`${sheetName} 데이터가 부족합니다.`);

  return parseDailySalesRows(rows, sheetName);
}

// MARK 6.48: 과거 날짜 백필(재업로드) 등에서도 재사용할 수 있도록, "raw rows 2차원 배열"만
// 받으면 파싱해서 표준 데이터 구조를 돌려주는 순수 함수로 분리했습니다.
export async function parseDailySalesRows(rows: any[][], sheetName = "업로드 파일") {
  if (rows.length < 4) throw new Error(`${sheetName} 데이터가 부족합니다.`);
  const row2 = rows[1] || [];
  const row3 = rows[2] || [];

  const dateCol = findCol(row2, ["기준일자"], 1);
  const styleCol = findCol(row2, ["스타일"], 13);
  const nameCol = findCol(row2, ["스타일명"], 14);
  const colorCol = findCol(row2, ["칼라", "컬러"], 15);
  const colorNameCol = findCol(row2, ["칼라명", "컬러명"], 16);
  const sizeCol = findCol(row2, ["사이즈", "SIZE", "size"], 17);
  const priceCol = findCol(row2, ["판매가"], 19);

  const channelBlocks = buildChannelBlocks(row2, row3);
  const items: any[] = [];

  // MARK 6.15: "수량 × 정가" 추정 대신, 금주/전주 시트에서 미리 계산해둔
  // "실제판매금액 ÷ 실제판매수량" 평균단가를 우선 사용합니다. 값이 없는 신규 품번 등은
  // 기존처럼 판매가(정가) 컬럼으로 폴백합니다.
  const stylePriceMap = await getStylePriceMap(ymdKST()).catch(() => new Map<string, number>());

  for (const row of rows.slice(3)) {
    const styleCode = text(row[styleCol]);
    const productName = text(row[nameCol]);
    if (!styleCode || styleCode.includes("스타일")) continue;

    const sourceDate = toDateText(row[dateCol]);
    const colorCode = text(row[colorCol]);
    const colorName = text(row[colorNameCol]);
    const size = text(row[sizeCol]);
    const listPrice = num(row[priceCol]);
    const actualPrice = stylePriceMap.get(styleCode);
    const price = actualPrice && actualPrice > 0 ? actualPrice : listPrice;

    for (const block of channelBlocks) {
      const dailySales = num(row[block.dailyCol]);
      const weeklySales = block.weeklyCol >= 0 ? num(row[block.weeklyCol]) : 0;
      const cumulativeSales = block.cumulativeCol >= 0 ? num(row[block.cumulativeCol]) : 0;
      const stock = block.stockCol >= 0 ? num(row[block.stockCol]) : 0;

      if (!dailySales && !weeklySales && !stock) continue;

      // MARK 6.28: "일간금액"(실제 판매금액) 컬럼이 있으면 그대로 사용합니다 — 수량×정가 추정보다 정확합니다.
      const realDailyAmount = block.dailyAmountCol >= 0 ? num(row[block.dailyAmountCol]) : null;
      const dailyAmount = realDailyAmount !== null && realDailyAmount > 0 ? realDailyAmount : Math.round(dailySales * price);

      items.push({
        sourceDate,
        channelName: block.channelName,
        styleCode,
        productName,
        colorCode,
        colorName,
        size,
        dailySales,
        weeklySales,
        cumulativeSales,
        stock,
        price,
        dailyAmount,
      });
    }
  }

  const channelMasterMap = await loadChannelMaster();
  const allChannelNames = Array.from(new Set(items.map((item) => text(item.channelName)).filter(Boolean)));
  seedUnknownChannels(allChannelNames, (name) =>
    isOnlineChannelHeuristic(name) ? "온라인마켓" : "오프라인매장"
  ).catch(() => {});

  const offlineItems = items.filter((item) => !isOnlineChannel(item.channelName, channelMasterMap));

  const totalDailySales = offlineItems.reduce((sum, item) => sum + num(item.dailySales), 0);
  const totalDailyAmount = offlineItems.reduce((sum, item) => sum + num(item.dailyAmount), 0);
  const activeChannels = new Set(offlineItems.filter((x) => num(x.dailySales) > 0).map((x) => x.channelName)).size;
  const activeProducts = new Set(offlineItems.filter((x) => num(x.dailySales) > 0).map((x) => x.styleCode)).size;

  const topProducts = Array.from(
    offlineItems.reduce((map, item) => {
      const key = `${item.styleCode}__${item.productName}`;
      if (!map.has(key)) {
        map.set(key, { styleCode: item.styleCode, productName: item.productName, dailySales: 0, dailyAmount: 0, stock: 0 });
      }
      const bucket = map.get(key);
      bucket.dailySales += num(item.dailySales);
      bucket.dailyAmount += num(item.dailyAmount);
      bucket.stock += num(item.stock);
      return map;
    }, new Map()).values()
  ).sort((a: any, b: any) => b.dailySales - a.dailySales).slice(0, 30);

  const topChannels = Array.from(
    offlineItems.reduce((map, item) => {
      const key = item.channelName;
      if (!map.has(key)) map.set(key, { channelName: key, dailySales: 0, dailyAmount: 0, skuCount: new Set() });
      const bucket = map.get(key);
      bucket.dailySales += num(item.dailySales);
      bucket.dailyAmount += num(item.dailyAmount);
      if (num(item.dailySales) > 0) bucket.skuCount.add(item.styleCode);
      return map;
    }, new Map()).values()
  ).map((x: any) => ({ ...x, skuCount: x.skuCount.size }))
   .sort((a: any, b: any) => b.dailySales - a.dailySales)
   .slice(0, 30);

  const stockoutRisk = topProducts
    .filter((item: any) => item.dailySales > 0 && item.stock <= item.dailySales * 2)
    .slice(0, 20);

  return {
    source: "MARK_DB",
    sheetName,
    sourceDate: items[0]?.sourceDate || ymdKST(),
    generatedAt: new Date().toISOString(),
    itemCount: offlineItems.length,
    allItemCount: items.length,
    totalDailySales,
    totalDailyAmount,
    activeChannels,
    activeProducts,
    topProducts,
    topChannels,
    stockoutRisk,
    items: offlineItems,
    allItems: items,
  };
}

const DAILY_HISTORY_SHEET = "Daily_Sales_History";

// MARK 6.6: 데이터 폭증 방지를 위해 "일자+점포"당 한 줄만 쓰고,
// 품번/칼라/사이즈 상세는 JSON 문자열 하나에 몰아서 저장합니다.
// 기존 방식(조합마다 한 줄, 하루 약 2만 셀)보다 셀 수가 대폭 줄어듭니다.
const DAILY_HISTORY_HEADER = [
  "일자",
  "점포",
  "품목수",
  "총판매수량",
  "총판매금액",
  "총재고",
  "상세JSON",
];

type DailyDetailEntry = {
  styleCode: string;
  productName: string;
  colorCode: string;
  colorName: string;
  size: string;
  qty: number;
  amount: number;
  stock: number;
  stockUpdatedAt?: string; // MARK 6.72: 재고 값이 마지막으로 갱신된 시각(ISO). stock-refresh.js가 채움.
};

export type FlatDailyHistoryRow = {
  date: string;
  storeName: string;
  styleCode: string;
  productName: string;
  colorCode: string;
  colorName: string;
  size: string;
  qty: number;
  amount: number;
  stock: number;
  stockUpdatedAt?: string;
};

function detailKey(date: string, storeName: string, item: { styleCode: string; colorCode: string; size: string }) {
  return `${date}__${storeName}__${item.styleCode}__${item.colorCode}__${item.size}`;
}

// 기존(구형) 행 형식인지 압축(JSON) 형식인지 헤더로 판별합니다.
export function isCompactDailyHistoryHeader(header: any[]) {
  return (header || []).some((cell) => {
    const n = normalize(text(cell));
    return n.includes("상세json") || n === normalize("상세JSON") || n.includes("json");
  });
}

// 압축(JSON) 형식 행 → 기존에 쓰던 것과 동일한 평면(flat) 행 구조로 펼칩니다.
// 나머지 코드(RT 엔진, 성과분석, 대시보드)는 이 평면 구조만 알면 되므로 손댈 필요가 없습니다.
export function expandCompactDailyHistoryRows(rows: any[][]): FlatDailyHistoryRow[] {
  if (!rows.length) return [];
  const header = rows[0] || [];
  const dateCol = findCol(header, ["일자", "날짜"], 0);
  const storeCol = findCol(header, ["점포", "점포명"], 1);
  const jsonCol = findCol(header, ["상세json", "상세", "json"], 6);

  const out: FlatDailyHistoryRow[] = [];
  for (const row of rows.slice(1)) {
    const date = text(row[dateCol]);
    const storeName = text(row[storeCol]);
    if (!date || !storeName) continue;

    let items: any[] = [];
    try {
      const raw = text(row[jsonCol]);
      items = raw ? JSON.parse(raw) : [];
    } catch {
      items = [];
    }
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      out.push({
        date,
        storeName,
        styleCode: text(item?.styleCode),
        productName: text(item?.productName),
        colorCode: text(item?.colorCode),
        colorName: text(item?.colorName),
        size: text(item?.size),
        qty: num(item?.qty),
        amount: num(item?.amount),
        stock: num(item?.stock),
        stockUpdatedAt: item?.stockUpdatedAt ? text(item.stockUpdatedAt) : undefined,
      });
    }
  }
  return out;
}

// 기존(구형, 조합마다 한 줄) 행 형식을 평면 행 구조로 변환합니다. (마이그레이션/하위호환용)
function expandLegacyDailyHistoryRows(rows: any[][]): FlatDailyHistoryRow[] {
  if (!rows.length) return [];
  const header = rows[0] || [];
  const dateCol = findCol(header, ["일자", "날짜"], 0);
  const storeCol = findCol(header, ["점포", "점포명"], 1);
  const styleCol = findCol(header, ["스타일", "품번"], 2);
  const productCol = findCol(header, ["스타일명", "상품명"], 3);
  const colorCol = findCol(header, ["칼라", "컬러"], 4);
  const colorNameCol = findCol(header, ["칼라명", "컬러명"], 5);
  const sizeCol = findCol(header, ["사이즈"], 6);
  const qtyCol = findCol(header, ["판매수량", "수량"], 7);
  const amountCol = findCol(header, ["판매금액", "금액"], 8);
  const stockCol = findCol(header, ["재고"], 9);

  return rows.slice(1)
    .map((row) => ({
      date: text(row[dateCol]),
      storeName: text(row[storeCol]),
      styleCode: text(row[styleCol]),
      productName: text(row[productCol]),
      colorCode: text(row[colorCol]),
      colorName: text(row[colorNameCol]),
      size: text(row[sizeCol]),
      qty: num(row[qtyCol]),
      amount: num(row[amountCol]),
      stock: num(row[stockCol]),
    }))
    .filter((r) => r.date && r.storeName && r.styleCode);
}

// 시트에 이미 있는 행(구형이든 압축형이든)을 전부 평면 행으로 펼칩니다.
export function expandAnyDailyHistoryRows(rows: any[][]): FlatDailyHistoryRow[] {
  if (!rows.length) return [];
  const header = rows[0] || [];
  return isCompactDailyHistoryHeader(header) ? expandCompactDailyHistoryRows(rows) : expandLegacyDailyHistoryRows(rows);
}

// 평면 행 목록을 "일자+점포"당 한 줄인 압축 형식으로 다시 묶습니다.
// 구글시트 셀 하나는 5만자 제한이 있습니다. 그 아래로 안전마진을 두고 자릅니다.
const MAX_CELL_CHARS = 40000;

// 한 그룹(날짜+점포)의 상세 항목을 JSON 문자열 길이 기준으로 여러 덩어리로 나눕니다.
// (품목수가 아주 많은 매장에서도 셀 하나가 5만자를 넘지 않도록)
function chunkDetailEntriesBySize(items: DailyDetailEntry[], maxChars = MAX_CELL_CHARS): DailyDetailEntry[][] {
  const chunks: DailyDetailEntry[][] = [];
  let current: DailyDetailEntry[] = [];
  let currentLen = 2; // "[]"

  for (const item of items) {
    const addLen = JSON.stringify(item).length + 1; // +1 for comma separator
    if (current.length && currentLen + addLen > maxChars) {
      chunks.push(current);
      current = [];
      currentLen = 2;
    }
    current.push(item);
    currentLen += addLen;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export function buildCompactDailyHistoryRows(flatRows: FlatDailyHistoryRow[]): any[][] {
  const groups = new Map<string, { date: string; storeName: string; items: DailyDetailEntry[] }>();

  for (const r of flatRows) {
    const groupKey = `${r.date}__${r.storeName}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { date: r.date, storeName: r.storeName, items: [] });
    groups.get(groupKey)!.items.push({
      styleCode: r.styleCode,
      productName: r.productName,
      colorCode: r.colorCode,
      colorName: r.colorName,
      size: r.size,
      qty: r.qty,
      amount: r.amount,
      stock: r.stock,
      stockUpdatedAt: r.stockUpdatedAt,
    });
  }

  return Array.from(groups.values())
    .sort((a, b) => (a.date === b.date ? a.storeName.localeCompare(b.storeName) : a.date.localeCompare(b.date)))
    .flatMap((g) => {
      // 날짜+점포당 원래는 한 줄이지만, 품목수가 많아 JSON이 너무 커지면
      // 같은 날짜+점포로 여러 줄에 나눠 씁니다. 읽을 때(expandCompactDailyHistoryRows)는
      // 어차피 날짜+점포별로 모든 줄의 항목을 합쳐서 펼치므로 여러 줄이어도 문제 없습니다.
      const chunks = chunkDetailEntriesBySize(g.items);
      return chunks.map((chunk) => {
        const totalQty = chunk.reduce((s, i) => s + num(i.qty), 0);
        const totalAmount = chunk.reduce((s, i) => s + num(i.amount), 0);
        const totalStock = chunk.reduce((s, i) => s + num(i.stock), 0);
        return [g.date, g.storeName, chunk.length, totalQty, totalAmount, totalStock, JSON.stringify(chunk)];
      });
    });
}

function buildDailyHistoryRows(daily: any): FlatDailyHistoryRow[] {
  const grouped = new Map<string, FlatDailyHistoryRow>();

  for (const item of daily.items || []) {
    const qty = num(item.dailySales);
    const amount = num(item.dailyAmount);

    // 핵심: 판매가 발생한 컬러/사이즈만 저장합니다.
    // 주간판매/누적판매만 있거나 재고만 있는 행은 저장하지 않습니다.
    if (!qty && !amount) continue;

    const date = toDateText(item.sourceDate || daily.sourceDate || ymdKST());
    const storeName = text(item.channelName);
    const styleCode = text(item.styleCode);
    const productName = text(item.productName);
    const colorCode = text(item.colorCode);
    const colorName = text(item.colorName);
    const size = text(item.size);

    if (!date || !storeName || !styleCode || !productName) continue;

    const key = detailKey(date, storeName, { styleCode, colorCode, size });
    if (!grouped.has(key)) {
      grouped.set(key, { date, storeName, styleCode, productName, colorCode, colorName, size, qty: 0, amount: 0, stock: 0 });
    }

    const row = grouped.get(key)!;
    row.qty += qty;
    row.amount += amount;
    row.stock += num(item.stock);
  }

  return Array.from(grouped.values());
}

// MARK 6.6.1: 안전한 교체(clear+write 대신 write-new + 검증 + 이름바꾸기).
// 절대로 기존 Daily_Sales_History를 먼저 지우지 않습니다. 새 시트에 다 쓰고 나서
// 수량/금액/건수를 검증한 뒤에만 이름을 바꿔서 교체합니다. 검증에 실패하면 원본은 그대로 남습니다.
export async function safeWriteCompactDailyHistory(spreadsheetId: string, flatRows: FlatDailyHistoryRow[]) {
  const compactRows = buildCompactDailyHistoryRows(flatRows);
  const expectedRecordCount = flatRows.length;
  const expectedQty = flatRows.reduce((s, r) => s + num(r.qty), 0);
  const expectedAmount = flatRows.reduce((s, r) => s + num(r.amount), 0);

  const stagingTitle = `${DAILY_HISTORY_SHEET}__staging_${Date.now()}`;
  await deleteSheetByTitleIfExistsById(spreadsheetId, stagingTitle).catch(() => {});
  await createSheetWithValuesById(spreadsheetId, stagingTitle, [DAILY_HISTORY_HEADER, ...compactRows]);

  // 방금 새로 쓴 시트를 다시 읽어서 원본과 수량/금액/건수가 일치하는지 확인합니다.
  const verifyRaw = await getSheetValuesById(spreadsheetId, stagingTitle, "A:ZZ").catch(() => []);
  const verifyFlat = expandCompactDailyHistoryRows(verifyRaw);
  const verifyQty = verifyFlat.reduce((s, r) => s + num(r.qty), 0);
  const verifyAmount = verifyFlat.reduce((s, r) => s + num(r.amount), 0);
  const countOk = verifyFlat.length === expectedRecordCount;
  const qtyOk = Math.abs(verifyQty - expectedQty) < 0.01;
  const amountOk = Math.abs(verifyAmount - expectedAmount) < 1;

  if (!countOk || !qtyOk || !amountOk) {
    // 검증 실패: 원본은 절대 건드리지 않고, 방금 만든 임시 시트만 지우고 에러를 던집니다.
    await deleteSheetByTitleIfExistsById(spreadsheetId, stagingTitle).catch(() => {});
    throw new Error(
      `Daily_Sales_History 저장 검증 실패로 중단했습니다(원본은 그대로 보존됨). ` +
      `기대값: 건수 ${expectedRecordCount}/수량 ${expectedQty}/금액 ${expectedAmount}, ` +
      `실제값: 건수 ${verifyFlat.length}/수량 ${verifyQty}/금액 ${verifyAmount}`
    );
  }

  // 검증 통과: 이제 이름만 바꿔서 교체합니다 (셀 내용을 지우거나 다시 쓰지 않습니다).
  const backupTitle = `${DAILY_HISTORY_SHEET}_backup`;
  const props = await getSheetPropsById(spreadsheetId);
  const liveExists = props.some((p) => p.title === DAILY_HISTORY_SHEET);

  if (liveExists) {
    await deleteSheetByTitleIfExistsById(spreadsheetId, backupTitle).catch(() => {});
    await renameSheetById(spreadsheetId, DAILY_HISTORY_SHEET, backupTitle);
  }
  await renameSheetById(spreadsheetId, stagingTitle, DAILY_HISTORY_SHEET);

  return {
    recordCount: expectedRecordCount,
    compactRowCount: compactRows.length,
    totalQty: expectedQty,
    totalAmount: expectedAmount,
    backupSheetName: liveExists ? backupTitle : "",
  };
}

export async function saveDailySalesToHistory(data?: any, source = "manual") {
  const daily = data || await readDailySalesFromMarkDb();
  const spreadsheetId = getHistorySheetId();

  const saveId = makeDailySnapshotId();
  const savedAt = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const snapshotDate = ymdKST();
  const newFlatRows = buildDailyHistoryRows(daily);

  // 기존에 쌓여있던 데이터(구형이든 압축형이든, 아예 없어도 됨)를 전부 평면 구조로 불러옵니다.
  const existingRaw = await getSheetValuesById(spreadsheetId, DAILY_HISTORY_SHEET, "A:ZZ").catch(() => []);
  const existingFlatRows = expandAnyDailyHistoryRows(existingRaw || []);

  // 중복 방지: 같은 일자/점포/스타일/칼라/사이즈는 다시 저장하지 않습니다(기존 값 유지).
  const existingKeys = new Set(existingFlatRows.map((r) => detailKey(r.date, r.storeName, r)));
  const rowsToAdd = newFlatRows.filter((r) => !existingKeys.has(detailKey(r.date, r.storeName, r)));

  const mergedFlatRows = [...existingFlatRows, ...rowsToAdd];

  // MARK 6.6.1: clear+update 대신 새 시트에 쓰고 검증한 뒤 이름만 바꿔서 교체합니다.
  // 검증에 실패하면 원본(Daily_Sales_History)은 전혀 손대지 않고 에러를 던집니다.
  const writeResult = await safeWriteCompactDailyHistory(spreadsheetId, mergedFlatRows);

  return {
    saveId,
    savedAt,
    snapshotDate,
    source,
    mode: "sales-only-color-size-compact-json",
    parsedRows: newFlatRows.length,
    rows: rowsToAdd.length,
    skippedRows: newFlatRows.length - rowsToAdd.length,
    totalDailySales: daily.totalDailySales || 0,
    totalDailyAmount: daily.totalDailyAmount || 0,
    compactRowCount: writeResult.compactRowCount,
    flatRowCount: mergedFlatRows.length,
  };
}

// MARK 6.48: 과거 파일 백필용 — saveDailySalesToHistory와 달리, 같은 날짜의 기존 행이 있으면
// "건너뛰지 않고 통째로 교체"합니다. 예전(금액 없던 시절)에 저장된 부정확한 값을 새로
// 업로드한 정확한 값으로 덮어쓰기 위한 용도입니다.
export async function backfillDailySalesForDate(data: any) {
  const newFlatRows = buildDailyHistoryRows(data);
  if (!newFlatRows.length) throw new Error("업로드한 파일에서 저장할 판매 데이터를 찾지 못했습니다.");
  return backfillFlatRows(newFlatRows);
}

// MARK 6.53: ERP 스크래퍼처럼 이미 "일자/매장/품번/컬러/사이즈/수량/금액" 형태로 만들어진
// flat row를 직접 받는 버전.
// MARK 6.71: 재고 갱신(stock-refresh, 15분)과 매출 갱신(sales-refresh, 40분)이 같은
// "오늘" 날짜를 각자 따로 갱신하게 되면서 모드를 3가지로 나눴습니다:
//   - "replace"(기본): 그 날짜의 기존 행을 통째로 교체. 새벽 배치처럼 완전한 하루치를
//     한 번에 올릴 때 씀 (daily-snapshot.js).
//   - "append": 기존 행은 그대로 두고, 없는 키만 추가. 청크 업로드 2번째 청크부터 씀.
//   - "upsert": 키가 이미 있으면 onlyFields로 지정한 필드만 갱신(나머지 필드는 안 건드림),
//     없으면 새로 만듦. stock-refresh는 onlyFields:["stock"], sales-refresh는
//     onlyFields:["qty","amount"]로 보내서 서로의 값을 안 지우게 합니다.
export async function backfillFlatRows(
  newFlatRows: FlatDailyHistoryRow[],
  options?: { mode?: "replace" | "append" | "upsert"; onlyFields?: (keyof FlatDailyHistoryRow)[]; append?: boolean }
) {
  const spreadsheetId = getHistorySheetId();
  if (!newFlatRows.length) throw new Error("저장할 판매 데이터가 없습니다.");

  // append(구버전 boolean 옵션)와 mode 둘 다 지원 — append:true면 mode:"append"와 동일
  const mode = options?.mode || (options?.append ? "append" : "replace");
  const targetDates = new Set(newFlatRows.map((r) => r.date));

  const existingRaw = await getSheetValuesById(spreadsheetId, DAILY_HISTORY_SHEET, "A:ZZ").catch(() => []);
  const existingFlatRows = expandAnyDailyHistoryRows(existingRaw || []);

  let mergedFlatRows: FlatDailyHistoryRow[];
  let newRowsCount = 0;
  let updatedRowsCount = 0;
  let replacedRows = 0;
  let skippedRows = 0;

  if (mode === "upsert") {
    const onlyFields = options?.onlyFields && options.onlyFields.length ? options.onlyFields : null;
    const existingByKey = new Map(existingFlatRows.map((r) => [detailKey(r.date, r.storeName, r), r]));
    for (const incoming of newFlatRows) {
      const key = detailKey(incoming.date, incoming.storeName, incoming);
      const existing = existingByKey.get(key);
      if (existing) {
        if (onlyFields) {
          for (const f of onlyFields) (existing as any)[f] = (incoming as any)[f];
        } else {
          Object.assign(existing, incoming);
        }
        updatedRowsCount++;
      } else {
        existingByKey.set(key, { ...incoming });
        newRowsCount++;
      }
    }
    mergedFlatRows = Array.from(existingByKey.values());
  } else if (mode === "append") {
    // 이미 들어간(일자+매장+품번+컬러+사이즈) 키는 건너뛰어서, 같은 청크가 재시도로
    // 두 번 들어와도 중복 저장되지 않게 합니다.
    const existingKeys = new Set(existingFlatRows.map((r) => detailKey(r.date, r.storeName, r)));
    const rowsToWrite = newFlatRows.filter((r) => !existingKeys.has(detailKey(r.date, r.storeName, r)));
    newRowsCount = rowsToWrite.length;
    skippedRows = newFlatRows.length - rowsToWrite.length;
    mergedFlatRows = [...existingFlatRows, ...rowsToWrite];
  } else {
    // replace
    const keptRows = existingFlatRows.filter((r) => !targetDates.has(r.date));
    replacedRows = existingFlatRows.length - keptRows.length;
    newRowsCount = newFlatRows.length;
    mergedFlatRows = [...keptRows, ...newFlatRows];
  }

  const writeResult = await safeWriteCompactDailyHistory(spreadsheetId, mergedFlatRows);

  return {
    targetDates: Array.from(targetDates),
    replacedRows,
    newRows: newRowsCount,
    updatedRows: updatedRowsCount,
    skippedRows,
    compactRowCount: writeResult.compactRowCount,
    flatRowCount: mergedFlatRows.length,
  };
}
