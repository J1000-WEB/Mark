import {
  appendValuesById,
  ensureSheetExistsById,
  getDbSheetId,
  getHistorySheetId,
  getSheetValuesById,
  getSpreadsheetTitlesById,
} from "@/lib/googleSheets";

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
  if (typeof value === "number") return String(value);
  const s = text(value);
  const m = s.match(/(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  return s || ymdKST();
}

function isSummaryChannel(channelName: string) {
  const s = text(channelName);
  return !s || s === "합계" || s === "채널" || s.endsWith("팀") || s === "팀합계" || s === "기타";
}

function pickDailySheetTitle(titles: string[]) {
  const exact = titles.find((title) => title === "스타일별 채널별 입고판매재고현황");
  if (exact) return exact;

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
      if (isSummaryChannel(channelName)) continue;

      const weeklyCol = normalize(row3[c + 1]) === normalize("주간") ? c + 1 : -1;
      const cumulativeCol = normalize(row3[c + 2]) === normalize("누적") ? c + 2 : -1;
      const stockCol = normalize(row3[c + 3]) === normalize("재고") ? c + 3 : -1;

      blocks.push({
        channelName,
        dailyCol: c,
        weeklyCol,
        cumulativeCol,
        stockCol,
      });
    }
  }

  return blocks;
}

export async function readDailySalesFromMarkDb() {
  const spreadsheetId = getDbSheetId();
  const titles = await getSpreadsheetTitlesById(spreadsheetId);
  const sheetName = pickDailySheetTitle(titles);
  if (!sheetName) throw new Error("MARK_DB에서 스타일별 채널별 입고판매재고현황 시트를 찾지 못했습니다.");

  const rows = await getSheetValuesById(spreadsheetId, sheetName, "A:ZZ");
  if (rows.length < 4) throw new Error(`${sheetName} 데이터가 부족합니다.`);

  const row2 = rows[1] || [];
  const row3 = rows[2] || [];

  const dateCol = findCol(row2, ["기준일자"], 1);
  const styleCol = findCol(row2, ["스타일"], 13);
  const nameCol = findCol(row2, ["스타일명"], 14);
  const colorCol = findCol(row2, ["칼라", "컬러"], 15);
  const colorNameCol = findCol(row2, ["칼라명", "컬러명"], 16);
  const priceCol = findCol(row2, ["판매가"], 19);

  const channelBlocks = buildChannelBlocks(row2, row3);
  const items: any[] = [];

  for (const row of rows.slice(3)) {
    const styleCode = text(row[styleCol]);
    const productName = text(row[nameCol]);
    if (!styleCode || styleCode.includes("스타일")) continue;

    const sourceDate = toDateText(row[dateCol]);
    const colorCode = text(row[colorCol]);
    const colorName = text(row[colorNameCol]);
    const price = num(row[priceCol]);

    for (const block of channelBlocks) {
      const dailySales = num(row[block.dailyCol]);
      const weeklySales = block.weeklyCol >= 0 ? num(row[block.weeklyCol]) : 0;
      const cumulativeSales = block.cumulativeCol >= 0 ? num(row[block.cumulativeCol]) : 0;
      const stock = block.stockCol >= 0 ? num(row[block.stockCol]) : 0;

      if (!dailySales && !weeklySales && !stock) continue;

      items.push({
        sourceDate,
        channelName: block.channelName,
        styleCode,
        productName,
        colorCode,
        colorName,
        dailySales,
        weeklySales,
        cumulativeSales,
        stock,
        price,
        dailyAmount: Math.round(dailySales * price),
      });
    }
  }

  const totalDailySales = items.reduce((sum, item) => sum + num(item.dailySales), 0);
  const totalDailyAmount = items.reduce((sum, item) => sum + num(item.dailyAmount), 0);
  const activeChannels = new Set(items.filter((x) => num(x.dailySales) > 0).map((x) => x.channelName)).size;
  const activeProducts = new Set(items.filter((x) => num(x.dailySales) > 0).map((x) => x.styleCode)).size;

  const topProducts = Array.from(
    items.reduce((map, item) => {
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
    items.reduce((map, item) => {
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
    itemCount: items.length,
    totalDailySales,
    totalDailyAmount,
    activeChannels,
    activeProducts,
    topProducts,
    topChannels,
    stockoutRisk,
    items,
  };
}

const DAILY_HISTORY_SHEET = "Daily_Sales_History";
const DAILY_HISTORY_HEADER = [
  "SaveID",
  "SavedAt",
  "SnapshotDate",
  "기준일자",
  "채널명",
  "스타일",
  "스타일명",
  "칼라",
  "칼라명",
  "일간판매",
  "주간판매",
  "누적판매",
  "재고",
  "판매가",
  "일간판매금액",
];

export async function saveDailySalesToHistory(data?: any, source = "manual") {
  const daily = data || await readDailySalesFromMarkDb();
  const spreadsheetId = getHistorySheetId();
  await ensureSheetExistsById(spreadsheetId, DAILY_HISTORY_SHEET, DAILY_HISTORY_HEADER);

  const saveId = makeDailySnapshotId();
  const savedAt = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const snapshotDate = ymdKST();

  const rows = (daily.items || []).map((item: any) => [
    saveId,
    savedAt,
    snapshotDate,
    item.sourceDate || daily.sourceDate || "",
    item.channelName || "",
    item.styleCode || "",
    item.productName || "",
    item.colorCode || "",
    item.colorName || "",
    num(item.dailySales),
    num(item.weeklySales),
    num(item.cumulativeSales),
    num(item.stock),
    num(item.price),
    num(item.dailyAmount),
  ]);

  if (rows.length) {
    await appendValuesById(spreadsheetId, `'${DAILY_HISTORY_SHEET}'!A:O`, rows);
  }

  return {
    saveId,
    savedAt,
    snapshotDate,
    source,
    rows: rows.length,
    totalDailySales: daily.totalDailySales || 0,
    totalDailyAmount: daily.totalDailyAmount || 0,
  };
}
