import { NextResponse } from "next/server";
import {
  getDbSheetId,
  getHistorySheetId,
  getSheetId,
  getSheetValuesById,
  getSpreadsheetTitlesById,
} from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SalesType = "style" | "color";
type Row = any[];

type ProductMaster = {
  year?: string;
  season?: string;
  gender?: string;
  itemGroup?: string;
  category?: string;
  item?: string;
  line?: string;
  className?: string;
  style: string;
  styleName?: string;
  color?: string;
  colorName?: string;
  cost?: number;
  tagPrice?: number;
  salePrice?: number;
  whStock?: number;
  onlineStock?: number;
  offlineStock?: number;
  totalStock?: number;
  storeStock?: number;
  cumulativeSalesQty?: number;
  cumulativeSalesAmount?: number;
};

type SalesAgg = {
  amount: number;
  qty: number;
  byStore: Record<string, number>;
};

function text(v: any) {
  return String(v ?? "").trim();
}

function num(v: any) {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function excelSerialToDate(serial: number) {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

function parseDate(v: any): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "number") return excelSerialToDate(v);
  const s = text(v);
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n) && n > 30000 && n < 70000) return excelSerialToDate(n);
  const m = s.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  out.setHours(0, 0, 0, 0);
  return out;
}

function mondayOfWeek(d: Date) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(out, diff);
}

function formatMD(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatWeekRange(start: Date, end: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(start.getMonth() + 1)}.${pad(start.getDate())}~${pad(end.getMonth() + 1)}.${pad(end.getDate())}`;
}

function parseSelectedMonday(value: string) {
  const d = parseDate(value);
  return d ? mondayOfWeek(d) : null;
}

function salesKey(style: string, color?: string, type: SalesType = "style") {
  return type === "color" ? `${style}__${color || ""}` : style;
}

function isOfflineStore(store: string) {
  const s = text(store);
  if (!s) return false;
  if (s.startsWith("온라인_")) return false;
  if (s.startsWith("글로벌_")) return false;
  if (s.startsWith("기타_")) return false;
  if (s.includes("온라인")) return false;
  if (s.includes("글로벌")) return false;
  if (s.includes("직원구매")) return false;
  if (s.includes("물류")) return false;
  return true;
}

function pickHeaderIndex(header: string[], candidates: string[]) {
  const normalized = header.map((x) => text(x).replace(/\s/g, ""));
  for (const c of candidates) {
    const target = c.replace(/\s/g, "");
    const idx = normalized.findIndex((h) => h === target || h.includes(target));
    if (idx >= 0) return idx;
  }
  return -1;
}

function buildProductMaster(rows: Row[]) {
  const byStyle = new Map<string, ProductMaster>();
  const byColor = new Map<string, ProductMaster>();
  if (!rows?.length) return { byStyle, byColor };

  // 스타일별 채널별 입고판매재고현황은 2~3행이 다단 헤더이고 실제 데이터는 4행부터입니다.
  for (const r of rows.slice(3)) {
    const style = text(r[13]);
    if (!style) continue;
    const color = text(r[15]);
    const base: ProductMaster = {
      year: text(r[3]),
      season: text(r[4]),
      gender: text(r[5]),
      itemGroup: text(r[6]),
      category: text(r[7]),
      item: text(r[8]),
      line: text(r[9]),
      className: text(r[10]),
      style,
      styleName: text(r[14]),
      color,
      colorName: text(r[16]),
      cost: num(r[17]),
      tagPrice: num(r[18]),
      salePrice: num(r[19]),
      whStock: num(r[24]),
      totalStock: num(r[27]),
      onlineStock: num(r[31]),
      offlineStock: num(r[35]),
      cumulativeSalesQty: num(r[25]),
      cumulativeSalesAmount: num(r[34]) + num(r[30]) + num(r[38]),
    };

    const existing = byStyle.get(style);
    if (existing) {
      existing.whStock = (existing.whStock || 0) + (base.whStock || 0);
      existing.totalStock = (existing.totalStock || 0) + (base.totalStock || 0);
      existing.onlineStock = (existing.onlineStock || 0) + (base.onlineStock || 0);
      existing.offlineStock = (existing.offlineStock || 0) + (base.offlineStock || 0);
      existing.cumulativeSalesQty = (existing.cumulativeSalesQty || 0) + (base.cumulativeSalesQty || 0);
      existing.cumulativeSalesAmount = (existing.cumulativeSalesAmount || 0) + (base.cumulativeSalesAmount || 0);
    } else {
      byStyle.set(style, { ...base, color: "", colorName: "" });
    }
    if (color) byColor.set(salesKey(style, color, "color"), base);
  }
  return { byStyle, byColor };
}

function mergeOnOffStock(rows: Row[], maps: { byStyle: Map<string, ProductMaster>; byColor: Map<string, ProductMaster> }) {
  if (!rows?.length) return;
  const header = (rows[0] || []).map(text);
  const idxStyle = pickHeaderIndex(header, ["스타일", "품번"]);
  const idxStyleName = pickHeaderIndex(header, ["스타일명", "품명"]);
  const idxColor = pickHeaderIndex(header, ["칼라", "컬러"]);
  const idxColorName = pickHeaderIndex(header, ["칼라명", "컬러명"]);
  const idxCost = pickHeaderIndex(header, ["원가"]);
  const idxTag = pickHeaderIndex(header, ["Tag가", "TAG가", "소비자가"]);
  const idxSale = pickHeaderIndex(header, ["실판매가", "판매가"]);
  const idxStock = pickHeaderIndex(header, ["재고"]);
  const idxOnline = pickHeaderIndex(header, ["가용(온)", "가용온"]);
  const idxOffline = pickHeaderIndex(header, ["가용(오프)", "가용오프"]);
  const idxTotal = pickHeaderIndex(header, ["가용(합계)", "가용합계"]);
  const idxYear = pickHeaderIndex(header, ["년도"]);
  const idxSeason = pickHeaderIndex(header, ["시즌"]);
  const idxItemGroup = pickHeaderIndex(header, ["품목"]);
  const idxCategory = pickHeaderIndex(header, ["복종"]);
  const idxItem = pickHeaderIndex(header, ["아이템"]);

  for (const r of rows.slice(1)) {
    const style = text(r[idxStyle]);
    if (!style) continue;
    const color = text(r[idxColor]);
    const key = salesKey(style, color, "color");
    const colorEntry = maps.byColor.get(key) || {
      style,
      color,
      styleName: text(r[idxStyleName]),
      colorName: text(r[idxColorName]),
    } as ProductMaster;
    colorEntry.year ||= text(r[idxYear]);
    colorEntry.season ||= text(r[idxSeason]);
    colorEntry.itemGroup ||= text(r[idxItemGroup]);
    colorEntry.category ||= text(r[idxCategory]);
    colorEntry.item ||= text(r[idxItem]);
    colorEntry.cost ||= num(r[idxCost]);
    colorEntry.tagPrice ||= num(r[idxTag]);
    colorEntry.salePrice ||= num(r[idxSale]);
    colorEntry.totalStock = (colorEntry.totalStock || 0) + (idxTotal >= 0 ? num(r[idxTotal]) : num(r[idxStock]));
    colorEntry.onlineStock = (colorEntry.onlineStock || 0) + (idxOnline >= 0 ? num(r[idxOnline]) : 0);
    colorEntry.offlineStock = (colorEntry.offlineStock || 0) + (idxOffline >= 0 ? num(r[idxOffline]) : 0);
    colorEntry.storeStock = (colorEntry.offlineStock || 0);
    maps.byColor.set(key, colorEntry);

    const styleEntry = maps.byStyle.get(style) || { style, styleName: text(r[idxStyleName]) } as ProductMaster;
    styleEntry.year ||= colorEntry.year;
    styleEntry.season ||= colorEntry.season;
    styleEntry.itemGroup ||= colorEntry.itemGroup;
    styleEntry.category ||= colorEntry.category;
    styleEntry.item ||= colorEntry.item;
    styleEntry.cost ||= colorEntry.cost;
    styleEntry.tagPrice ||= colorEntry.tagPrice;
    styleEntry.salePrice ||= colorEntry.salePrice;
    styleEntry.totalStock = (styleEntry.totalStock || 0) + (idxTotal >= 0 ? num(r[idxTotal]) : num(r[idxStock]));
    styleEntry.onlineStock = (styleEntry.onlineStock || 0) + (idxOnline >= 0 ? num(r[idxOnline]) : 0);
    styleEntry.offlineStock = (styleEntry.offlineStock || 0) + (idxOffline >= 0 ? num(r[idxOffline]) : 0);
    styleEntry.storeStock = (styleEntry.offlineStock || 0);
    maps.byStyle.set(style, styleEntry);
  }
}

function emptyAgg(): SalesAgg {
  return { amount: 0, qty: 0, byStore: {} };
}

function aggregateSales(rows: Row[], start: Date, end: Date, type: SalesType) {
  const map = new Map<string, SalesAgg>();
  const stores = new Set<string>();
  const startMs = start.getTime();
  const endMs = end.getTime();

  for (const r of rows.slice(1)) {
    const d = parseDate(r[0]);
    if (!d) continue;
    const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (ts < startMs || ts > endMs) continue;

    const store = text(r[1]);
    if (!isOfflineStore(store)) continue;
    const style = text(r[2]);
    const color = text(r[4]);
    if (!style) continue;
    const key = salesKey(style, color, type);
    const agg = map.get(key) || emptyAgg();
    const qty = num(r[7]);
    const amount = num(r[8]);
    agg.qty += qty;
    agg.amount += amount;
    agg.byStore[store] = (agg.byStore[store] || 0) + qty;
    map.set(key, agg);
    stores.add(store);
  }
  return { map, stores };
}

function makeWeeks(salesRows: Row[]) {
  const dates = salesRows.slice(1).map((r) => parseDate(r[0])).filter(Boolean) as Date[];
  const latest = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date();
  const base = mondayOfWeek(latest);
  return Array.from({ length: 10 }).map((_, i) => {
    const monday = addDays(base, -7 * i);
    const analysisStart = addDays(monday, -7);
    const analysisEnd = addDays(monday, -1);
    const compareStart = addDays(monday, -14);
    const compareEnd = addDays(monday, -8);
    return {
      week: isoDate(monday),
      label: `${formatMD(monday)} 월요일 기준`,
      sheetLabel: formatWeekRange(analysisStart, analysisEnd),
      analysisLabel: `${formatMD(analysisStart)}~${formatMD(analysisEnd)}`,
      compareLabel: `${formatMD(compareStart)}~${formatMD(compareEnd)}`,
      analysisStart: isoDate(analysisStart),
      analysisEnd: isoDate(analysisEnd),
      compareStart: isoDate(compareStart),
      compareEnd: isoDate(compareEnd),
    };
  });
}

function rankMap(aggs: Map<string, SalesAgg>) {
  return new Map([...aggs.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([key], idx) => [key, idx + 1]));
}

function ratio(n: number, d: number) {
  return d ? n / d : 0;
}

function buildExcelLikeRows(args: {
  type: SalesType;
  selected: any;
  current: Map<string, SalesAgg>;
  prev1: Map<string, SalesAgg>;
  prev2: Map<string, SalesAgg>;
  prev3: Map<string, SalesAgg>;
  productMap: Map<string, ProductMaster>;
  stores: string[];
}) {
  const { type, selected, current, prev1, prev2, prev3, productMap, stores } = args;
  const totalAmount = [...current.values()].reduce((sum, x) => sum + x.amount, 0);
  const totalQty = [...current.values()].reduce((sum, x) => sum + x.qty, 0);
  const currentRank = rankMap(current);
  const prevRank = rankMap(prev1);

  const dataKeys = new Set<string>([...productMap.keys(), ...current.keys(), ...prev1.keys(), ...prev2.keys(), ...prev3.keys()]);
  const keys = [...dataKeys].filter((key) => {
    const c = current.get(key);
    const p = productMap.get(key);
    return (c?.amount || 0) || (c?.qty || 0) || (p?.totalStock || 0) || (p?.offlineStock || 0) || (p?.onlineStock || 0);
  }).sort((a, b) => (current.get(b)?.amount || 0) - (current.get(a)?.amount || 0));

  const prefix = type === "color"
    ? ["품번+컬러", "년도", "시즌", "품목", "복종", "아이템", "재런칭", "라인업", "연출강화", "품번", "컬러", "품명", "STY", "COL", "원가", "TAG가", "판매가", "OFF가", "프로모션가", "할인율", "기간한정가", "할인율"]
    : ["", "년도", "시즌", "품목", "복종", "아이템", "재런칭", "품번", "품명", "STY", "COL", "원가", "TAG가", "판매가", "OFF가", "프로모션가", "할인율"];
  const lifecycle = ["기획", "입고%", "입고", "판매", "재고", "판매%", "초입고", "초출고"];
  const ranking = ["주간", "2주전", "등락"];
  const amount = ["주간", "2주전", "비중"];
  const qty = ["주간", "2주전", "3주전", "4주전"];
  const stock = ["총재고", "물류", "물류(온)", "물류(오프)", "점포"];
  const headers = [...prefix, ...lifecycle, ...ranking, ...amount, ...qty, ...stock, ...stores];

  const groupRow = Array(headers.length).fill("");
  groupRow[1] = "카테고리";
  groupRow[type === "color" ? 9 : 7] = "상품현황";
  groupRow[type === "color" ? 14 : 11] = "상품가격";
  groupRow[prefix.length] = "제품라이프사이클";
  groupRow[prefix.length + lifecycle.length] = "랭킹";
  groupRow[prefix.length + lifecycle.length + ranking.length] = "금액판매";
  groupRow[prefix.length + lifecycle.length + ranking.length + amount.length] = "수량판매";
  groupRow[prefix.length + lifecycle.length + ranking.length + amount.length + qty.length] = "재고";
  groupRow[prefix.length + lifecycle.length + ranking.length + amount.length + qty.length + stock.length] = "점포별 주간판매수량";

  const summaryRow = Array(headers.length).fill("");
  const offStockTotal = keys.reduce((sum, key) => sum + (productMap.get(key)?.offlineStock || 0), 0);
  const onStockTotal = keys.reduce((sum, key) => sum + (productMap.get(key)?.onlineStock || 0), 0);
  const totalStock = keys.reduce((sum, key) => sum + (productMap.get(key)?.totalStock || 0), 0);
  summaryRow[prefix.length + lifecycle.length + ranking.length] = totalAmount;
  summaryRow[prefix.length + lifecycle.length + ranking.length + amount.length] = totalQty;
  summaryRow[prefix.length + lifecycle.length + ranking.length + amount.length + qty.length] = totalStock;
  summaryRow[prefix.length + lifecycle.length + ranking.length + amount.length + qty.length + 2] = onStockTotal;
  summaryRow[prefix.length + lifecycle.length + ranking.length + amount.length + qty.length + 3] = offStockTotal;

  const rows: Row[] = [
    ["", `Top Item Sales (Store/WK) · MARK 6.0 자동생성`, "", "", "", "", "", selected.sheetLabel, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", keys.length],
    [`${selected.label} / 분석 ${selected.analysisLabel} / 비교 ${selected.compareLabel}`, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    groupRow,
    headers,
    Array(headers.length).fill(""),
    summaryRow,
    Array(headers.length).fill(""),
  ];

  for (const key of keys) {
    const p = productMap.get(key) || { style: type === "color" ? key.split("__")[0] : key } as ProductMaster;
    const c = current.get(key) || emptyAgg();
    const p1 = prev1.get(key) || emptyAgg();
    const p2 = prev2.get(key) || emptyAgg();
    const p3 = prev3.get(key) || emptyAgg();
    const rank = currentRank.get(key) || "";
    const oldRank = prevRank.get(key) || "";
    const diff = rank && oldRank ? Number(oldRank) - Number(rank) : "";
    const stockTotal = p.totalStock || (p.onlineStock || 0) + (p.offlineStock || 0) + (p.whStock || 0);
    const soldCume = p.cumulativeSalesAmount || 0;
    const planned = soldCume + stockTotal * (p.salePrice || 0);
    const saleRate = ratio(soldCume, planned);
    const markdown = p.salePrice && p.tagPrice ? 1 - p.salePrice / p.tagPrice : 0;
    const row: Row = [];

    if (type === "color") {
      row.push(`${p.style || ""}${p.color || ""}`, p.year || "", p.season || "", p.itemGroup || "", p.category || "", p.item || "", p.className === "재런칭" ? "재런칭" : "", p.line || "", "", p.style || "", p.color || "", p.styleName || "", p.style ? 1 : 0, p.color ? 1 : 0, p.cost || "", p.tagPrice || "", p.salePrice || "", Math.round((p.salePrice || 0) * 0.9), Math.round((p.salePrice || 0) * 0.8), markdown, "", "");
    } else {
      row.push("", p.year || "", p.season || "", p.itemGroup || "", p.category || "", p.item || "", p.className === "재런칭" ? "재런칭" : "", p.style || "", p.styleName || "", p.style ? 1 : 0, "", p.cost || "", p.tagPrice || "", p.salePrice || "", Math.round((p.salePrice || 0) * 0.9), Math.round((p.salePrice || 0) * 0.8), markdown);
    }

    row.push(planned || "", saleRate || "", soldCume || "", c.amount || "", Math.max(0, planned - soldCume) || stockTotal || "", saleRate || "", "", "");
    row.push(rank, oldRank, diff);
    row.push(c.amount || "", p1.amount || "", ratio(c.amount, totalAmount));
    row.push(c.qty || "", p1.qty || "", p2.qty || "", p3.qty || "");
    row.push(stockTotal || "", p.whStock || "", p.onlineStock || "", p.offlineStock || "", p.storeStock || p.offlineStock || "");
    for (const store of stores) row.push(c.byStore[store] || "");
    rows.push(row);
  }
  return { rows, rowCount: keys.length, colCount: headers.length };
}

async function readFirstAvailableSheet(ids: string[], candidates: string[], range: string) {
  for (const spreadsheetId of ids) {
    const titles = await getSpreadsheetTitlesById(spreadsheetId).catch(() => []);
    const found = titles.find((title) => candidates.includes(title)) || titles.find((title) => candidates.some((c) => title.replace(/\s/g, "").includes(c.replace(/\s/g, ""))));
    if (found) {
      const rows = await getSheetValuesById(spreadsheetId, found, range).catch(() => []);
      return { spreadsheetId, sheetName: found, rows };
    }
  }
  return { spreadsheetId: "", sheetName: "", rows: [] as Row[] };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const type: SalesType = url.searchParams.get("type") === "color" ? "color" : "style";
    const requestedWeek = text(url.searchParams.get("week"));

    const historyId = getHistorySheetId();
    const dbId = getDbSheetId();
    const mainId = getSheetId();
    const ids = [...new Set([dbId, historyId, mainId].filter(Boolean))];

    const salesRows = await getSheetValuesById(historyId, "Daily_Sales_History", "A:J");
    const weeks = makeWeeks(salesRows);
    const selected = weeks.find((w) => w.week === requestedWeek) || weeks[0];
    const monday = parseSelectedMonday(selected.week) || mondayOfWeek(new Date());

    const currentStart = addDays(monday, -7);
    const currentEnd = addDays(monday, -1);
    const prev1Start = addDays(monday, -14);
    const prev1End = addDays(monday, -8);
    const prev2Start = addDays(monday, -21);
    const prev2End = addDays(monday, -15);
    const prev3Start = addDays(monday, -28);
    const prev3End = addDays(monday, -22);

    const productRaw = await readFirstAvailableSheet(ids, ["스타일별 채널별 입고판매재고현황"], "A:AZ");
    const stockRaw = await readFirstAvailableSheet(ids, ["온오프재고현황", "재고_ON", "재고_OFF", "재고_물류"], "A:AZ");
    const productMaps = buildProductMaster(productRaw.rows);
    mergeOnOffStock(stockRaw.rows, productMaps);

    const cur = aggregateSales(salesRows, currentStart, currentEnd, type);
    const prev1 = aggregateSales(salesRows, prev1Start, prev1End, type);
    const prev2 = aggregateSales(salesRows, prev2Start, prev2End, type);
    const prev3 = aggregateSales(salesRows, prev3Start, prev3End, type);
    const stores = [...cur.stores].sort((a, b) => a.localeCompare(b, "ko"));
    const productMap = type === "color" ? productMaps.byColor : productMaps.byStyle;
    const built = buildExcelLikeRows({
      type,
      selected,
      current: cur.map,
      prev1: prev1.map,
      prev2: prev2.map,
      prev3: prev3.map,
      productMap,
      stores,
    });

    return NextResponse.json({
      ok: true,
      mode: "generated",
      version: "MARK 6.0",
      type,
      weeks,
      selectedWeek: selected.week,
      selectedWeekLabel: selected.label,
      analysisLabel: selected.analysisLabel,
      compareLabel: selected.compareLabel,
      sheetName: `${selected.sheetLabel}(${type === "color" ? "컬러" : "품번"})`,
      rows: built.rows,
      rowCount: built.rowCount,
      colCount: built.colCount,
      stores,
      sources: {
        sales: "MARK_HISTORY / Daily_Sales_History",
        product: productRaw.sheetName || "not found",
        stock: stockRaw.sheetName || "not found",
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("sales-data generated load failed", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "판매데이터를 생성하지 못했습니다.",
      weeks: [],
      rows: [],
    }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
