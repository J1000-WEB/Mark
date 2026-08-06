import {
  ensureSheetExistsById,
  getDbSheetId,
  getDailySourceSheetId,
  getDailyStoreSalesSheetId,
  getHistorySheetId,
  getWeeklyHistorySheetId,
  getSheetId,
  getSheetValuesById,
  replaceSheetValuesById,
  updateValuesById,
} from "@/lib/googleSheets";
import { getSavedWeeklyTarget, getSavedMonthlyTarget } from "@/lib/weeklyTarget";
import { expandAnyDailyHistoryRows } from "@/lib/dailySales";
import { expandStyleChannelRows } from "@/lib/styleChannelCompact";

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
  byStoreStock: Record<string, number>;
  byStoreAmount: Record<string, number>;
};

type WeekInfo = {
  week: string;
  label: string;
  sheetLabel: string;
  analysisLabel: string;
  compareLabel: string;
  analysisStart: string;
  analysisEnd: string;
  compareStart: string;
  compareEnd: string;
};

function text(v: any) {
  return String(v ?? "").trim();
}

function compact(v: any) {
  return text(v).replace(/[\s\/_\-·.()]/g, "");
}

function num(v: any) {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/,/g, "").replace(/%/g, ""));
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
  const md = s.match(/(\d{1,2})[/.](\d{1,2})/);
  if (md) return new Date(new Date().getFullYear(), Number(md[1]) - 1, Number(md[2]));
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
  if (s.startsWith("온라인_") || s.startsWith("글로벌_") || s.startsWith("기타_") || s.startsWith("오프라인_")) return false;
  if (s.includes("온라인") || s.includes("글로벌") || s.includes("직원구매") || s.includes("물류") || s.includes("위탁샵") || s.includes("위탁")) return false;
  return true;
}


function normalizeDailyStoreKey(storeName: string) {
  const raw = text(storeName);
  return raw
    .replace(/^오프라인[_\s-]+/i, "")
    .replace(/점$/g, "")
    .replace(/[\s_\-·.()]/g, "")
    .toLowerCase();
}

function displayDailyStoreName(storeName: string) {
  const raw = text(storeName).replace(/^오프라인[_\s-]+/i, "").trim();
  const key = normalizeDailyStoreKey(raw);
  const aliases: Record<string, string> = {
    "성수플래그십": "성수 플래그십",
    "성수flagship": "성수 플래그십",
    "신사플래그십": "신사 플래그십",
    "광주신세계": "신세계 광주점",
    "신세계광주": "신세계 광주점",
  };
  return aliases[key] || raw;
}

function isDailyOfflineTeamValue(value: any) {
  return text(value).replace(/[\s_\-·.()]/g, "").includes("오프라인팀");
}

function isNonOfflineDailyStore(channelName: string, teamName = "") {
  const raw = text(channelName);
  const team = text(teamName);
  const key = normalizeDailyStoreKey(raw);
  const teamKey = normalizeDailyStoreKey(team);
  return (
    !raw ||
    raw.startsWith("오프라인_") ||
    isOnlineChannelName(raw) ||
    raw.startsWith("글로벌_") ||
    raw.startsWith("기타_") ||
    teamKey.includes("온라인") ||
    teamKey.includes("글로벌") ||
    teamKey.includes("기타") ||
    key.includes("온라인") ||
    key.includes("글로벌") ||
    key === "기타" ||
    key.startsWith("기타") ||
    key.includes("포시즌") ||
    key.includes("위탁") ||
    key.includes("직원구매") ||
    key.includes("물류")
  );
}

function isOnlineChannelName(storeName: string) {
  const s = text(storeName).toLowerCase();
  return (
    s.startsWith("온라인") ||
    s.includes("29cm") ||
    s.includes("ssf") ||
    s.includes("네이버") ||
    s.includes("지그재그") ||
    s.includes("w컨셉") ||
    s.includes("wconcept") ||
    s.includes("eql") ||
    s.includes("한섬")
  );
}

function normalizeDateKey(value: any) {
  const d = parseDate(value);
  if (d) return isoDate(d);
  const s = text(value);
  const m = s.match(/(20\d{2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  const korean = s.match(/(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (korean) return `${korean[1]}-${String(korean[2]).padStart(2, "0")}-${String(korean[3]).padStart(2, "0")}`;
  return s;
}

type DailyStoreSaleRecord = {
  date: string;
  storeName: string;
  amount: number;
  channelCode?: string;
  weekTarget?: number;
};

function parseDailyStoreSalesRows(rows: Row[]) {
  if (!rows?.length) return [] as DailyStoreSaleRecord[];
  const metaLimit = Math.min(rows.length, 20);
  let teamRow = -1;
  for (let r = 0; r < metaLimit; r++) {
    const count = (rows[r] || []).filter((cell) => isDailyOfflineTeamValue(cell)).length;
    if (count >= 1) {
      teamRow = r;
      break;
    }
  }
  if (teamRow < 0) return [] as DailyStoreSaleRecord[];

  const channelNameRow = Math.max(0, teamRow - 1);
  const channelCodeRow = Math.max(0, teamRow - 2);
  const team = rows[teamRow] || [];
  const channelNames = rows[channelNameRow] || [];
  const channelCodes = rows[channelCodeRow] || [];
  const targetRow = rows.find((row) => (row || []).some((cell) => text(cell).replace(/[\s_\-·.()]/g, "").includes("기간목표"))) || [];

  const targetCols: { col: number; storeName: string; channelCode: string; weekTarget: number }[] = [];
  for (let c = 7; c < Math.max(team.length, channelNames.length, channelCodes.length); c++) {
    const teamName = text(team[c]);
    if (!isDailyOfflineTeamValue(teamName)) continue;
    const rawName = text(channelNames[c]) || text(channelCodes[c]);
    if (isNonOfflineDailyStore(rawName, teamName)) continue;
    const storeName = displayDailyStoreName(rawName);
    if (!isOfflineStore(storeName)) continue;
    targetCols.push({ col: c, storeName, channelCode: text(channelCodes[c]), weekTarget: num(targetRow[c]) });
  }

  const records: DailyStoreSaleRecord[] = [];
  for (let r = teamRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const date = normalizeDateKey(row[0]) || normalizeDateKey(row[1]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    for (const colInfo of targetCols) {
      const amount = num(row[colInfo.col]);
      if (!amount) continue;
      records.push({
        date,
        storeName: colInfo.storeName,
        amount,
        channelCode: colInfo.channelCode,
        weekTarget: colInfo.weekTarget,
      });
    }
  }
  return records;
}

function dateRangeKeys(start: string, end: string) {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return [] as string[];
  const out: string[] = [];
  for (let d = new Date(s); d.getTime() <= e.getTime(); d = addDays(d, 1)) out.push(isoDate(d));
  return out;
}

function buildStoreSummaryFromDailySales(rows: DailyStoreSaleRecord[], selected: WeekInfo) {
  const currentDates = new Set(dateRangeKeys(selected.analysisStart, selected.analysisEnd));
  const compareDates = new Set(dateRangeKeys(selected.compareStart, selected.compareEnd));
  const monthStart = selected.analysisEnd.slice(0, 8) + "01";
  const monthDates = new Set(dateRangeKeys(monthStart, selected.analysisEnd));
  const stores = [...new Set(rows.map((r) => r.storeName).filter(Boolean))].filter(isOfflineStore).sort((a, b) => a.localeCompare(b, "ko"));
  const targetMap = new Map<string, number>();
  for (const r of rows) {
    if (r.weekTarget) targetMap.set(r.storeName, Math.max(targetMap.get(r.storeName) || 0, r.weekTarget));
  }
  const sum = (storeName: string, dates: Set<string>) => rows
    .filter((r) => r.storeName === storeName && dates.has(r.date))
    .reduce((acc, r) => acc + num(r.amount), 0);
  const current = stores.map((storeName) => {
    const weekSales = sum(storeName, currentDates);
    const compareWeekSales = sum(storeName, compareDates);
    const monthSales = sum(storeName, monthDates);
    const weekTarget = targetMap.get(storeName) || 0;
    return {
      storeName,
      weekSales,
      compareWeekSales,
      weekChangeRate: percentChange(weekSales, compareWeekSales),
      weekTarget,
      weekTargetAvailable: false,
      weekRate: weekTarget ? (weekSales / weekTarget) * 100 : 0,
      monthSales,
      monthTarget: 0,
      monthTargetAvailable: false,
      monthRate: 0,
    };
  }).filter((r) => r.weekSales || r.compareWeekSales || r.monthSales).sort((a, b) => b.weekSales - a.weekSales);
  const compare = stores.map((storeName) => ({ storeName, weekSales: sum(storeName, compareDates) })).filter((r) => r.weekSales);
  return { current, compare, productStoreNames: current.map((r) => r.storeName) };
}


function latestRecordDateFromDailyStoreRows(rows: DailyStoreSaleRecord[]) {
  const dates = rows.map((r) => parseDate(r.date)).filter(Boolean) as Date[];
  return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
}

function effectiveWeeklyBasisFromB2(b2Basis: string, latestDataDate: Date | null) {
  // 주간 대시보드의 기준일은 항상 `금주/전주!B2`의 월요일을 사용한다.
  // 일간매출 최신일자는 데이터 갱신 상태를 확인하는 용도일 뿐, B2 기준주차를 덮어쓰지 않는다.
  if (b2Basis) return b2Basis;
  return latestDataDate ? isoDate(mondayOfWeek(latestDataDate)) : "";
}

function pickHeaderIndex(header: string[], candidates: string[]) {
  const normalized = header.map((x) => compact(x));
  for (const c of candidates) {
    const target = c.replace(/\s/g, "");
    const idx = normalized.findIndex((h) => h === target || h.includes(target));
    if (idx >= 0) return idx;
  }
  return -1;
}

function emptyAgg(): SalesAgg {
  return { amount: 0, qty: 0, byStore: {}, byStoreStock: {}, byStoreAmount: {} };
}

function addAggValue(map: Map<string, SalesAgg>, key: string, patch: Partial<SalesAgg>) {
  const agg = map.get(key) || emptyAgg();
  agg.amount += patch.amount || 0;
  agg.qty += patch.qty || 0;
  for (const [store, v] of Object.entries(patch.byStore || {})) agg.byStore[store] = (agg.byStore[store] || 0) + v;
  for (const [store, v] of Object.entries(patch.byStoreAmount || {})) agg.byStoreAmount[store] = (agg.byStoreAmount[store] || 0) + v;
  for (const [store, v] of Object.entries(patch.byStoreStock || {})) agg.byStoreStock[store] = (agg.byStoreStock[store] || 0) + v;
  map.set(key, agg);
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
    const colorEntry = maps.byColor.get(key) || ({
      style,
      color,
      styleName: text(r[idxStyleName]),
      colorName: text(r[idxColorName]),
    } as ProductMaster);
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
    colorEntry.storeStock = colorEntry.offlineStock || 0;
    maps.byColor.set(key, colorEntry);

    const styleEntry = maps.byStyle.get(style) || ({ style, styleName: text(r[idxStyleName]) } as ProductMaster);
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
    styleEntry.storeStock = styleEntry.offlineStock || 0;
    maps.byStyle.set(style, styleEntry);
  }
}

function aggregateSalesQtyOnly(rows: Row[], start: Date, end: Date, type: SalesType) {
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
    const qty = num(r[7]);
    const key = salesKey(style, color, type);
    addAggValue(map, key, { qty, byStore: { [store]: qty } });
    stores.add(store);
  }
  return { map, stores };
}

function findGroupColumn(rows: Row[], groupName: string, headerName: string, fallback: number) {
  const groupRow = (rows[1] || []).map(text);
  // 금주/전주 시트는 3~4행에 같은 상세 헤더가 반복될 수 있습니다.
  // 컬럼 번호(U/V/Y/Z 등)를 고정하지 않고, 상단 그룹명 + 상세 헤더명으로 찾습니다.
  const headerRows = [(rows[2] || []).map(text), (rows[3] || []).map(text)];
  const groupTarget = compact(groupName);
  const headerTarget = compact(headerName);

  for (let headerIdx = 0; headerIdx < headerRows.length; headerIdx++) {
    const headerRow = headerRows[headerIdx];
    const groupStart = groupRow.findIndex((x) => compact(x) === groupTarget);
    if (groupStart < 0) continue;

    let groupEnd = headerRow.length;
    for (let i = groupStart + 1; i < groupRow.length; i++) {
      if (text(groupRow[i])) {
        groupEnd = i;
        break;
      }
    }

    for (let i = groupStart; i < groupEnd; i++) {
      const h = compact(headerRow[i]);
      if (h === headerTarget || h.includes(headerTarget)) return i;
    }
  }
  return fallback;
}

function assertWeeklyColumns(columns: Record<string, number>) {
  const bad = Object.entries(columns).filter(([, idx]) => idx < 0);
  if (bad.length) {
    throw new Error(`금주/전주 시트 컬럼 매핑 실패: ${bad.map(([k]) => k).join(", ")}`);
  }
}

function aggregateWeeklyPriceSheet(rows: Row[], type: SalesType) {
  const current = new Map<string, SalesAgg>();
  const previous = new Map<string, SalesAgg>();
  const stores = new Set<string>();
  const productNames = new Map<string, string>();
  if (!rows?.length) return { current, previous, stores, productNames, columns: {} };

  const curQtyCol = findGroupColumn(rows, "금주", "합계", 20); // 헤더 기준: 금주 합계수량(예: U열)
  const curAmountCol = findGroupColumn(rows, "금주", "판매금액", 21); // 헤더 기준: 금주 판매금액(예: V열)
  const prevQtyCol = findGroupColumn(rows, "전주", "합계", 24); // 헤더 기준: 전주 합계수량(예: Y열)
  const prevAmountCol = findGroupColumn(rows, "전주", "판매금액", 25); // 헤더 기준: 전주 판매금액(예: Z열)
  assertWeeklyColumns({ curQtyCol, curAmountCol, prevQtyCol, prevAmountCol });
  const stockCol = 7;

  for (const r of rows.slice(3)) {
    const channelName = text(r[1]);
    if (!isOfflineStore(channelName)) continue;
    const style = text(r[2]);
    const color = text(r[4]);
    if (!style) continue;
    const key = salesKey(style, color, type);
    const stock = num(r[stockCol]);

    // MARK 6.11: 상품명(스타일명, D열)도 같이 잡아둡니다 — 없으면 첫 유효값을 사용합니다.
    const styleName = text(r[3]);
    if (styleName && !productNames.get(style)) productNames.set(style, styleName);

    // 주간 데이터는 회사 검증 기준인 금주/전주 시트의 집계영역을 Source of Truth로 사용합니다.
    // 금주/전주 컬럼은 헤더명으로 찾으며, 원본 붙여넣기 영역(I/J 등)은 매출 fallback으로 사용하지 않습니다.
    const currentQty = num(r[curQtyCol]);
    const currentAmount = num(r[curAmountCol]);
    const prevQty = num(r[prevQtyCol]);
    const prevAmount = num(r[prevAmountCol]);

    addAggValue(current, key, {
      qty: currentQty,
      amount: currentAmount,
      byStore: { [channelName]: currentQty },
      byStoreAmount: { [channelName]: currentAmount },
      byStoreStock: { [channelName]: stock },
    });
    addAggValue(previous, key, {
      qty: prevQty,
      amount: prevAmount,
      byStore: { [channelName]: prevQty },
      byStoreAmount: { [channelName]: prevAmount },
      byStoreStock: { [channelName]: stock },
    });
    stores.add(channelName);
  }
  return { current, previous, stores, productNames, columns: { curQtyCol, curAmountCol, prevQtyCol, prevAmountCol } };
}

// MARK 6.50: "이번주"(아직 스냅샷 없는 현재 주차)는 "금주/전주" 대신 Daily_Sales_History를
// 직접 집계합니다. 과거 주차는 이미 저장된 스냅샷(Weekly_History)을 그대로 쓰므로 안 건드립니다.
// 재고(byStoreStock)는 합산하면 안 되므로(스냅샷 성격) 그 기간 중 가장 최근 날짜의 값만 씁니다.
async function aggregateWeeklyFromDailyHistory(type: SalesType, weekStart: string, weekEnd: string) {
  const current = new Map<string, SalesAgg>();
  const previous = new Map<string, SalesAgg>();
  const stores = new Set<string>();
  const productNames = new Map<string, string>();

  const historyId = getHistorySheetId();
  const raw = await getSheetValuesById(historyId, "Daily_Sales_History", "A:ZZ").catch(() => []);
  const flatRows = expandAnyDailyHistoryRows(raw || []);

  const prevWeekEnd = (() => {
    const d = new Date(`${weekStart}T00:00:00`);
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const prevWeekStart = (() => {
    const d = new Date(`${prevWeekEnd}T00:00:00`);
    d.setDate(d.getDate() - 6);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  // 1차: 각 (key+매장)별로 이번주/전주 범위 안에서 가장 최근 날짜가 언제인지 파악합니다.
  const latestCurDate = new Map<string, string>();
  const latestPrevDate = new Map<string, string>();
  for (const r of flatRows) {
    if (!isOfflineStore(r.storeName)) continue;
    const key = `${salesKey(r.styleCode, r.colorCode, type)}__${r.storeName}`;
    if (r.date >= weekStart && r.date <= weekEnd) {
      if (!latestCurDate.has(key) || r.date > latestCurDate.get(key)!) latestCurDate.set(key, r.date);
    } else if (r.date >= prevWeekStart && r.date <= prevWeekEnd) {
      if (!latestPrevDate.has(key) || r.date > latestPrevDate.get(key)!) latestPrevDate.set(key, r.date);
    }
  }

  // 2차: 실제 집계. qty/amount는 합산, stock은 "가장 최근 날짜" 행에서만 반영.
  for (const r of flatRows) {
    if (!isOfflineStore(r.storeName)) continue;
    const key = salesKey(r.styleCode, r.colorCode, type);
    const storeStockKey = `${key}__${r.storeName}`;
    if (r.productName && !productNames.get(r.styleCode)) productNames.set(r.styleCode, r.productName);

    if (r.date >= weekStart && r.date <= weekEnd) {
      stores.add(r.storeName);
      const isLatest = latestCurDate.get(storeStockKey) === r.date;
      addAggValue(current, key, {
        qty: Number(r.qty || 0),
        amount: Number(r.amount || 0),
        byStore: { [r.storeName]: Number(r.qty || 0) },
        byStoreAmount: { [r.storeName]: Number(r.amount || 0) },
        byStoreStock: isLatest ? { [r.storeName]: Number(r.stock || 0) } : {},
      });
    } else if (r.date >= prevWeekStart && r.date <= prevWeekEnd) {
      const isLatest = latestPrevDate.get(storeStockKey) === r.date;
      addAggValue(previous, key, {
        qty: Number(r.qty || 0),
        amount: Number(r.amount || 0),
        byStore: { [r.storeName]: Number(r.qty || 0) },
        byStoreAmount: { [r.storeName]: Number(r.amount || 0) },
        byStoreStock: isLatest ? { [r.storeName]: Number(r.stock || 0) } : {},
      });
    }
  }

  return { current, previous, stores, productNames, columns: {} };
}

function preferQtyFromDailyAndAmountFromPrice(daily: Map<string, SalesAgg>, price: Map<string, SalesAgg>) {
  const out = new Map<string, SalesAgg>();
  for (const key of new Set([...daily.keys(), ...price.keys()])) {
    const d = daily.get(key) || emptyAgg();
    const p = price.get(key) || emptyAgg();
    const merged = emptyAgg();
    merged.qty = d.qty || p.qty;
    merged.amount = p.amount; // 판매금액/가격은 금주전주 시트 기준. Daily 금액은 상품 가격 계산에 사용하지 않음.
    merged.byStore = Object.keys(p.byStore).length ? { ...p.byStore } : { ...d.byStore };
    merged.byStoreAmount = { ...p.byStoreAmount };
    merged.byStoreStock = { ...p.byStoreStock };
    out.set(key, merged);
  }
  return out;
}

function makeWeeks(salesRows: Row[]) {
  const dates = salesRows.slice(1).map((r) => parseDate(r[0])).filter(Boolean) as Date[];
  const latest = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date();
  const base = mondayOfWeek(latest);
  return Array.from({ length: 12 }).map((_, i) => {
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
    } satisfies WeekInfo;
  });
}

function rankMap(aggs: Map<string, SalesAgg>) {
  const sorted = [...aggs.entries()]
    .filter(([, a]) => (a.amount || 0) !== 0)
    .sort((a, b) => (b[1].amount || 0) - (a[1].amount || 0));
  const out = new Map<string, number>();
  let rank = 0;
  let lastAmount: number | null = null;
  sorted.forEach(([key, agg], idx) => {
    if (lastAmount === null || agg.amount !== lastAmount) rank = idx + 1;
    lastAmount = agg.amount;
    out.set(key, rank);
  });
  return out;
}

function ratio(n: number, d: number) {
  return d ? n / d : 0;
}

function priceByAmountQty(amount: number, qty: number) {
  return qty ? Math.round(amount / qty) : "";
}

function buildExcelLikeRows(args: {
  type: SalesType;
  selected: WeekInfo;
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
    ? ["품번+컬러", "년도", "시즌", "품목", "복종", "아이템", "재런칭", "라인업", "연출강화", "품번", "컬러", "컬러명", "품명", "STY", "COL", "원가", "TAG가", "실판매가", "주간평균가", "전주평균가", "평균가등락", "할인율"]
    : ["", "년도", "시즌", "품목", "복종", "아이템", "재런칭", "품번", "품명", "STY", "COL", "원가", "TAG가", "실판매가", "주간평균가", "전주평균가", "평균가등락", "할인율"];
  const lifecycle = ["기획", "입고%", "입고", "판매", "재고", "판매%", "초입고", "초출고"];
  const ranking = ["주간", "2주전", "등락"];
  const amount = ["주간", "2주전", "비중"];
  const qty = ["주간", "2주전", "3주전", "4주전", "증감"];
  const stock = ["총재고", "물류", "물류(온)", "물류(오프)", "점포"];
  const storeHeaders = stores.flatMap((store) => [`${store} 판매`, `${store} 재고`]);
  const headers = ["순위", ...prefix, ...lifecycle, ...ranking, ...amount, ...qty, ...stock, ...storeHeaders];

  const groupRow = Array(headers.length).fill("");
  groupRow[1] = "카테고리";
  groupRow[type === "color" ? 10 : 8] = "상품현황";
  groupRow[type === "color" ? 16 : 13] = "가격";
  groupRow[1 + prefix.length] = "제품라이프사이클";
  groupRow[1 + prefix.length + lifecycle.length] = "랭킹";
  groupRow[1 + prefix.length + lifecycle.length + ranking.length] = "금액판매";
  groupRow[1 + prefix.length + lifecycle.length + ranking.length + amount.length] = "수량판매";
  groupRow[1 + prefix.length + lifecycle.length + ranking.length + amount.length + qty.length] = "재고";
  groupRow[1 + prefix.length + lifecycle.length + ranking.length + amount.length + qty.length + stock.length] = "점포별 판매/재고";

  const summaryRow = Array(headers.length).fill("");
  const offStockTotal = keys.reduce((sum, key) => sum + (productMap.get(key)?.offlineStock || 0), 0);
  const onStockTotal = keys.reduce((sum, key) => sum + (productMap.get(key)?.onlineStock || 0), 0);
  const totalStock = keys.reduce((sum, key) => sum + (productMap.get(key)?.totalStock || 0), 0);
  summaryRow[1 + prefix.length + lifecycle.length + ranking.length] = totalAmount;
  summaryRow[1 + prefix.length + lifecycle.length + ranking.length + amount.length] = totalQty;
  summaryRow[1 + prefix.length + lifecycle.length + ranking.length + amount.length + qty.length] = totalStock;
  summaryRow[1 + prefix.length + lifecycle.length + ranking.length + amount.length + qty.length + 2] = onStockTotal;
  summaryRow[1 + prefix.length + lifecycle.length + ranking.length + amount.length + qty.length + 3] = offStockTotal;

  const titleRow = Array(headers.length).fill("");
  titleRow[1] = `Top Item Sales (Store/WK) · MARK 6.0.5 자동생성`;
  titleRow[8] = selected.sheetLabel;
  titleRow[headers.length - 1] = keys.length;

  const periodRow = Array(headers.length).fill("");
  periodRow[0] = `${selected.label} / 분석 ${selected.analysisLabel} / 비교 ${selected.compareLabel}`;

  const rows: Row[] = [
    titleRow,
    periodRow,
    groupRow,
    headers,
    Array(headers.length).fill(""),
    summaryRow,
    Array(headers.length).fill(""),
  ];

  for (const key of keys) {
    const p = productMap.get(key) || ({ style: type === "color" ? key.split("__")[0] : key } as ProductMaster);
    const c = current.get(key) || emptyAgg();
    const p1 = prev1.get(key) || emptyAgg();
    const p2 = prev2.get(key) || emptyAgg();
    const p3 = prev3.get(key) || emptyAgg();
    const rank = currentRank.get(key) || "";
    const oldRank = prevRank.get(key) || "";
    const diff = rank && oldRank ? Number(oldRank) - Number(rank) : "";
    const stockTotal = p.totalStock || (p.onlineStock || 0) + (p.offlineStock || 0) + (p.whStock || 0);
    const soldCume = p.cumulativeSalesAmount || 0;
    const avgSalePrice = priceByAmountQty(c.amount, c.qty);
    const prevAvgSalePrice = priceByAmountQty(p1.amount, p1.qty);
    const avgPriceDelta = avgSalePrice && prevAvgSalePrice ? Number(avgSalePrice) - Number(prevAvgSalePrice) : "";
    const displaySalePrice = p.salePrice || avgSalePrice || "";
    const planned = soldCume + stockTotal * (Number(avgSalePrice) || p.salePrice || 0);
    const saleRate = ratio(c.qty, c.qty + stockTotal);
    const markdown = avgSalePrice && p.tagPrice ? 1 - Number(avgSalePrice) / p.tagPrice : "";
    const row: Row = [rank || ""];

    if (type === "color") {
      row.push(
        `${p.style || ""}${p.color || ""}`,
        p.year || "",
        p.season || "",
        p.itemGroup || "",
        p.category || "",
        p.item || "",
        p.className === "재런칭" ? "재런칭" : "",
        p.line || "",
        "",
        p.style || "",
        p.color || "",
        p.colorName || "",
        p.styleName || "",
        p.style ? 1 : 0,
        p.color ? 1 : 0,
        p.cost || "",
        p.tagPrice || "",
        displaySalePrice,
        avgSalePrice,
        prevAvgSalePrice,
        avgPriceDelta,
        markdown
      );
    } else {
      row.push(
        "",
        p.year || "",
        p.season || "",
        p.itemGroup || "",
        p.category || "",
        p.item || "",
        p.className === "재런칭" ? "재런칭" : "",
        p.style || "",
        p.styleName || "",
        p.style ? 1 : 0,
        "",
        p.cost || "",
        p.tagPrice || "",
        displaySalePrice,
        avgSalePrice,
        prevAvgSalePrice,
        avgPriceDelta,
        markdown
      );
    }

    row.push(planned || "", saleRate || "", soldCume || "", c.qty || "", stockTotal || "", saleRate || "", "", "");
    row.push(rank, oldRank, diff);
    row.push(c.amount || "", p1.amount || "", ratio(c.amount, totalAmount));
    row.push(c.qty || "", p1.qty || "", p2.qty || "", p3.qty || "", c.qty - p1.qty || "");
    row.push(stockTotal || "", p.whStock || "", p.onlineStock || "", p.offlineStock || "", p.storeStock || p.offlineStock || "");
    for (const store of stores) row.push(c.byStore[store] || "", c.byStoreStock[store] || "");
    rows.push(row);
  }
  return { rows, rowCount: keys.length, colCount: headers.length };
}

type SheetReadResult = { spreadsheetId: string; sheetName: string; rows: Row[] };
type SheetReadOptions = { refresh?: boolean; ttlMs?: number };

// 주간 화면은 최초 진입·스냅샷 목록·버튼 클릭에서 같은 원본을 짧은 시간에 반복 조회할 수 있다.
// 서버 인스턴스 내 45초 캐시 + in-flight 공유로 Sheets Read quota를 보호한다.
const weeklySheetReadCache = new Map<string, { expiresAt: number; value: SheetReadResult }>();
const weeklySheetReadInflight = new Map<string, Promise<SheetReadResult>>();

async function readFirstAvailableSheet(ids: string[], candidates: string[], range: string, options: SheetReadOptions = {}): Promise<SheetReadResult> {
  const normalizedIds = [...new Set(ids.filter(Boolean))];
  const key = `${normalizedIds.join("|")}::${candidates.join("|")}::${range}`;
  const ttlMs = options.ttlMs ?? 45_000;
  const now = Date.now();
  const cached = weeklySheetReadCache.get(key);
  if (!options.refresh && cached && cached.expiresAt > now) return cached.value;

  const pending = weeklySheetReadInflight.get(key);
  if (!options.refresh && pending) return pending;

  const load = (async (): Promise<SheetReadResult> => {
    // 예상 시트명부터 바로 조회한다. 이전처럼 매 요청마다 spreadsheets.get(메타데이터)를 먼저 호출하지 않는다.
    for (const spreadsheetId of normalizedIds) {
      for (const sheetName of candidates) {
        const rows = await getSheetValuesById(spreadsheetId, sheetName, range).catch(() => [] as Row[]);
        if (rows.length) {
          const value = { spreadsheetId, sheetName, rows };
          weeklySheetReadCache.set(key, { expiresAt: Date.now() + ttlMs, value });
          return value;
        }
      }
    }
    const value = { spreadsheetId: "", sheetName: "", rows: [] as Row[] };
    weeklySheetReadCache.set(key, { expiresAt: Date.now() + Math.min(ttlMs, 10_000), value });
    return value;
  })();

  if (!options.refresh) weeklySheetReadInflight.set(key, load);
  try {
    return await load;
  } finally {
    weeklySheetReadInflight.delete(key);
  }
}


export type WeeklyProviderPayload = {
  ok: boolean;
  mode: string;
  version: string;
  type: SalesType;
  weeks: WeekInfo[];
  selectedWeek: string;
  selectedWeekLabel: string;
  analysisLabel: string;
  compareLabel: string;
  sheetName: string;
  rows: Row[];
  rowCount: number;
  colCount: number;
  stores: string[];
  sources: Record<string, any>;
  error?: string;
};

export const WEEKLY_HISTORY_SHEET = "Weekly_history";
export const WEEKLY_HISTORY_VERSION = "MARK 6.4 WEEKLY_HISTORY_ISOLATED";

/**
 * Dedicated weekly history workbook schema supplied by the operations team.
 * One row represents a weekly style/color record at an offline store level.
 */
export const WEEKLY_HISTORY_HEADER = [
  "기준일", "분석시작일", "분석종료일", "비교시작일", "비교종료일", "구분",
  "스타일", "스타일명", "칼라", "칼라명", "사이즈", "점포명",
  "금주판매수량", "금주판매금액", "전주판매수량", "전주판매금액", "재고", "Snapshot일시", "SnapshotVersion"
];

function columnLetter(n: number) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function nowKST() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function parseJsonObject(value: any): Record<string, number> {
  try {
    const parsed = JSON.parse(text(value));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) out[k] = num(v);
    return out;
  } catch {
    return {};
  }
}

function mapByHeader(header: Row) {
  const out = new Map<string, number>();
  header.forEach((h, i) => {
    const key = text(h);
    if (key && !out.has(key)) out.set(key, i);
  });
  return out;
}

async function ensureWeeklyHistorySheet(historyId: string) {
  await ensureSheetExistsById(historyId, WEEKLY_HISTORY_SHEET);
  const endCol = columnLetter(WEEKLY_HISTORY_HEADER.length);
  await updateValuesById(historyId, `'${WEEKLY_HISTORY_SHEET}'!A1:${endCol}1`, [WEEKLY_HISTORY_HEADER]);
}

function latestByKey<T extends { snapshotAt?: string }>(items: T[], keyFn: (x: T) => string) {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = keyFn(item);
    const prev = map.get(key);
    if (!prev || text(item.snapshotAt) >= text(prev.snapshotAt)) map.set(key, item);
  }
  return [...map.values()];
}

function weeklyStoreRecordFromRow(header: Row, r: Row) {
  const h = mapByHeader(header);
  const get = (name: string) => r[h.get(name) ?? -1];
  return {
    basis: isoDate(parseDate(get("기준일")) || new Date(text(get("기준일")))),
    analysisStart: text(get("분석시작일")),
    analysisEnd: text(get("분석종료일")),
    compareStart: text(get("비교시작일")),
    compareEnd: text(get("비교종료일")),
    typeLabel: text(get("구분")),
    style: text(get("스타일")),
    styleName: text(get("스타일명")),
    color: text(get("칼라")),
    colorName: text(get("칼라명")),
    size: text(get("사이즈")),
    store: text(get("점포명")),
    currentQty: num(get("금주판매수량")),
    currentAmount: num(get("금주판매금액")),
    prevQty: num(get("전주판매수량")),
    prevAmount: num(get("전주판매금액")),
    stock: num(get("재고")),
    snapshotAt: text(get("Snapshot일시")),
  };
}

function aggregateWeeklyStoreRecords(records: any[]) {
  const grouped = new Map<string, any>();
  for (const row of latestByKey(records, (r) => `${r.basis}__${r.typeLabel}__${r.style}__${r.color}__${r.size}__${r.store}`)) {
    const key = `${row.basis}__${row.typeLabel}__${row.style}__${row.color}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        basis: row.basis,
        analysisStart: row.analysisStart,
        analysisEnd: row.analysisEnd,
        compareStart: row.compareStart,
        compareEnd: row.compareEnd,
        typeLabel: row.typeLabel,
        style: row.style,
        styleName: row.styleName,
        color: row.color,
        colorName: row.colorName,
        currentQty: 0,
        currentAmount: 0,
        prevQty: 0,
        prevAmount: 0,
        onlineStock: 0,
        offlineStock: 0,
        totalStock: 0,
        rank: 0,
        byStore: {},
        byStoreAmount: {},
        prevByStoreAmount: {},
        byStoreStock: {},
        snapshotAt: row.snapshotAt,
      });
    }
    const out = grouped.get(key);
    out.currentQty += num(row.currentQty);
    out.currentAmount += num(row.currentAmount);
    out.prevQty += num(row.prevQty);
    out.prevAmount += num(row.prevAmount);
    out.offlineStock += num(row.stock);
    out.totalStock += num(row.stock);
    if (text(row.snapshotAt) > text(out.snapshotAt)) out.snapshotAt = row.snapshotAt;
  }
  return [...grouped.values()];
}

async function readDedicatedWeeklyHistory(historyId: string) {
  // 조회 중에는 시트를 새로 만들거나 헤더를 덮어쓰지 않는다.
  const rows = await getSheetValuesById(historyId, WEEKLY_HISTORY_SHEET, "A:S").catch(() => [] as Row[]);
  const header = rows[0] || WEEKLY_HISTORY_HEADER;
  const storeRecords = rows.slice(1)
    .filter((r) => text(r[0]) && text(r[5]) && text(r[6]) && text(r[11]))
    .map((r) => weeklyStoreRecordFromRow(header, r));
  return {
    storeRecords,
    productRecords: aggregateWeeklyStoreRecords(storeRecords),
  };
}

function weekInfoFromMonday(monday: Date): WeekInfo {
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
}

function makeWeeksFromBases(basisDates: string[], fallbackSalesRows: Row[], currentBasis?: string, extraBases: string[] = []) {
  const set = new Set<string>();
  basisDates.forEach((d) => { const parsed = parseSelectedMonday(d); if (parsed) set.add(isoDate(parsed)); });
  [currentBasis, ...extraBases].filter(Boolean).forEach((basis) => {
    const parsed = parseSelectedMonday(basis);
    if (parsed) set.add(isoDate(parsed));
  });
  if (!set.size) return makeWeeks(fallbackSalesRows);
  return [...set].sort((a, b) => b.localeCompare(a)).map((d) => weekInfoFromMonday(parseSelectedMonday(d) || new Date(d)));
}

function explicitWeekInfo(requestedWeek = "") {
  const monday = parseSelectedMonday(requestedWeek);
  return monday ? weekInfoFromMonday(monday) : null;
}

function makeWeeklyHistoryRows(args: {
  type: SalesType;
  selected: WeekInfo;
  current: Map<string, SalesAgg>;
  prev1: Map<string, SalesAgg>;
  productMap: Map<string, ProductMaster>;
}) {
  const { type, selected, current, prev1, productMap } = args;
  const ranks = rankMap(current);
  const snapshotAt = nowKST();
  const keys = [...new Set([...current.keys(), ...prev1.keys(), ...productMap.keys()])].filter((key) => {
    const c = current.get(key);
    const p = productMap.get(key);
    return (c?.amount || 0) || (c?.qty || 0) || (p?.totalStock || 0) || (p?.offlineStock || 0) || (p?.onlineStock || 0);
  }).sort((a, b) => (current.get(b)?.amount || 0) - (current.get(a)?.amount || 0));

  return keys.map((key) => {
    const p = productMap.get(key) || ({ style: type === "color" ? key.split("__")[0] : key } as ProductMaster);
    const c = current.get(key) || emptyAgg();
    const old = prev1.get(key) || emptyAgg();
    const avgPrice = priceByAmountQty(c.amount, c.qty);
    const prevAvgPrice = priceByAmountQty(old.amount, old.qty);
    const qtyDelta = c.qty - old.qty;
    const amountDelta = c.amount - old.amount;
    const totalStock = p.totalStock || (p.onlineStock || 0) + (p.offlineStock || 0) + (p.whStock || 0);
    return [
      selected.week,
      selected.analysisStart,
      selected.analysisEnd,
      selected.compareStart,
      selected.compareEnd,
      type === "color" ? "컬러" : "품번",
      p.style || "",
      p.styleName || "",
      type === "color" ? (p.color || key.split("__")[1] || "") : "",
      type === "color" ? (p.colorName || "") : "",
      "",
      "",
      p.season || "",
      p.gender || "",
      p.itemGroup || "",
      p.category || "",
      p.line || "",
      p.className || "",
      p.tagPrice || "",
      p.salePrice || avgPrice || "",
      c.qty || 0,
      c.amount || 0,
      old.qty || 0,
      old.amount || 0,
      avgPrice || "",
      prevAvgPrice || "",
      qtyDelta || 0,
      amountDelta || 0,
      ratio(qtyDelta, old.qty),
      ratio(amountDelta, old.amount),
      p.onlineStock || 0,
      p.offlineStock || 0,
      totalStock || 0,
      ratio(c.qty, c.qty + totalStock),
      ranks.get(key) || "",
      snapshotAt,
      WEEKLY_HISTORY_VERSION,
    ];
  });
}

function makeWeeklyStoreHistoryRows(args: {
  type: SalesType;
  selected: WeekInfo;
  current: Map<string, SalesAgg>;
  prev1: Map<string, SalesAgg>;
  productMap: Map<string, ProductMaster>;
}) {
  const { type, selected, current, prev1, productMap } = args;
  const snapshotAt = nowKST();
  const rows: Row[] = [];
  const allKeys = [...new Set([...current.keys(), ...prev1.keys(), ...productMap.keys()])];
  for (const key of allKeys) {
    const c = current.get(key) || emptyAgg();
    const p = productMap.get(key) || ({ style: type === "color" ? key.split("__")[0] : key } as ProductMaster);
    const old = prev1.get(key) || emptyAgg();
    const stores = new Set([...Object.keys(c.byStore || {}), ...Object.keys(c.byStoreAmount || {}), ...Object.keys(c.byStoreStock || {}), ...Object.keys(old.byStore || {}), ...Object.keys(old.byStoreAmount || {})]);
    for (const store of [...stores].filter(isOfflineStore).sort((a, b) => a.localeCompare(b, "ko"))) {
      const currentQty = num(c.byStore[store]);
      const currentAmount = num(c.byStoreAmount[store]);
      const prevQty = num(old.byStore[store]);
      const prevAmount = num(old.byStoreAmount[store]);
      const stock = num(c.byStoreStock[store]);
      if (!currentQty && !currentAmount && !prevQty && !prevAmount && !stock) continue;
      rows.push([
        selected.week,
        selected.analysisStart,
        selected.analysisEnd,
        selected.compareStart,
        selected.compareEnd,
        type === "color" ? "컬러" : "품번",
        p.style || "",
        p.styleName || "",
        type === "color" ? (p.color || key.split("__")[1] || "") : "",
        type === "color" ? (p.colorName || "") : "",
        "",
        store,
        currentQty || 0,
        currentAmount || 0,
        prevQty || 0,
        prevAmount || 0,
        stock || 0,
        snapshotAt,
        WEEKLY_HISTORY_VERSION,
      ]);
    }
  }
  return rows;
}

function historyBasisFromRow(header: Row, row: Row) {
  const basisIndex = mapByHeader(header).get("기준일") ?? 0;
  const parsed = parseDate(row[basisIndex]);
  return parsed ? isoDate(parsed) : text(row[basisIndex]);
}

function latestHistoryRowsByKey(rows: Row[], header: Row, includeStore: boolean) {
  const h = mapByHeader(header);
  const basisIndex = h.get("기준일") ?? 0;
  const typeIndex = h.get("구분") ?? 5;
  const styleIndex = h.get("스타일") ?? 6;
  const colorIndex = h.get("칼라") ?? 8;
  const storeIndex = h.get("점포명") ?? -1;
  const sizeIndex = h.get("사이즈") ?? -1;
  const latest = new Map<string, { row: Row; index: number }>();

  rows.forEach((row, index) => {
    const basis = historyBasisFromRow(header, row);
    const type = text(row[typeIndex]);
    const style = text(row[styleIndex]);
    const color = text(row[colorIndex]);
    const size = sizeIndex >= 0 ? text(row[sizeIndex]) : "";
    const store = includeStore && storeIndex >= 0 ? text(row[storeIndex]) : "";
    // Empty/legacy rows are kept individually. Valid business rows use the latest physical row.
    const key = basis && type && style ? `${basis}__${type}__${style}__${color}__${size}__${store}` : `__legacy_${index}`;
    latest.set(key, { row, index });
  });

  return [...latest.values()].sort((a, b) => a.index - b.index).map((item) => item.row);
}

async function replaceHistoryBasisRows(args: {
  historyId: string;
  sheetName: string;
  header: Row;
  selectedBasis: string;
  replacementRows: Row[];
  clearRange: string;
}) {
  const existing = await getSheetValuesById(args.historyId, args.sheetName, args.clearRange).catch(() => [] as Row[]);
  const header = existing[0]?.length ? existing[0] : args.header;
  const kept = existing.slice(1).filter((row) => historyBasisFromRow(header, row) !== args.selectedBasis);
  await replaceSheetValuesById(args.historyId, args.sheetName, [header, ...kept, ...args.replacementRows], args.clearRange);
  return { keptRows: kept.length, writtenRows: args.replacementRows.length };
}

/**
 * One 기준일 must have exactly one latest raw product snapshot. The old implementation
 * appended every refresh and caused duplicate Weekly_History / Weekly_Store_History rows.
 */
async function upsertWeeklyHistorySnapshot(args: {
  historyId: string;
  selected: WeekInfo;
  styleCurrent: Map<string, SalesAgg>;
  stylePrev: Map<string, SalesAgg>;
  colorCurrent: Map<string, SalesAgg>;
  colorPrev: Map<string, SalesAgg>;
  productMaps: { byStyle: Map<string, ProductMaster>; byColor: Map<string, ProductMaster> };
}) {
  await ensureWeeklyHistorySheet(args.historyId);
  const styleRows = makeWeeklyStoreHistoryRows({ type: "style", selected: args.selected, current: args.styleCurrent, prev1: args.stylePrev, productMap: args.productMaps.byStyle });
  const colorRows = makeWeeklyStoreHistoryRows({ type: "color", selected: args.selected, current: args.colorCurrent, prev1: args.colorPrev, productMap: args.productMaps.byColor });
  const values = [...styleRows, ...colorRows];

  // Dedicated Weekly_history keeps one latest complete snapshot per 기준일.
  await replaceHistoryBasisRows({
    historyId: args.historyId,
    sheetName: WEEKLY_HISTORY_SHEET,
    header: WEEKLY_HISTORY_HEADER,
    selectedBasis: args.selected.week,
    replacementRows: values,
    clearRange: "A:S",
  });
  return values.length;
}

/** Keeps one latest business row per 주차/구분/스타일/컬러(/점포) across legacy duplicates. */
export async function cleanupWeeklyHistoryDuplicates() {
  const historyId = getWeeklyHistorySheetId();
  await ensureWeeklyHistorySheet(historyId);
  const existing = await getSheetValuesById(historyId, WEEKLY_HISTORY_SHEET, "A:S").catch(() => [] as Row[]);
  const header = existing[0]?.length ? existing[0] : WEEKLY_HISTORY_HEADER;
  const sourceRows = existing.slice(1).filter((row) => row.some((cell) => text(cell)));
  const compacted = latestHistoryRowsByKey(sourceRows, header, true);
  await replaceSheetValuesById(historyId, WEEKLY_HISTORY_SHEET, [header, ...compacted], "A:S");
  const result = { beforeRows: sourceRows.length, afterRows: compacted.length, removedRows: sourceRows.length - compacted.length };
  return { ok: true, history: result, product: result, store: result, removedRows: result.removedRows };
}

function historyRecordsToMaps(records: any[], basis: string, type: SalesType, storeRecords: any[] = []) {
  const typeLabel = type === "color" ? "컬러" : "품번";
  const selectedRows = latestByKey(records.filter((r) => r.basis === basis && r.typeLabel === typeLabel), (r) => salesKey(r.style, r.color, type));
  const current = new Map<string, SalesAgg>();
  const prev1 = new Map<string, SalesAgg>();
  const productMap = new Map<string, ProductMaster>();
  const stores = new Set<string>();

  for (const r of selectedRows) {
    const key = salesKey(r.style, r.color, type);
    current.set(key, { amount: r.currentAmount, qty: r.currentQty, byStore: r.byStore || {}, byStoreAmount: r.byStoreAmount || {}, byStoreStock: r.byStoreStock || {} });
    prev1.set(key, { amount: r.prevAmount, qty: r.prevQty, byStore: {}, byStoreAmount: {}, byStoreStock: {} });
    productMap.set(key, {
      style: r.style,
      styleName: r.styleName,
      color: r.color,
      colorName: r.colorName,
      season: r.season,
      gender: r.gender,
      itemGroup: r.itemGroup,
      category: r.category,
      line: r.line,
      className: r.className,
      tagPrice: r.tagPrice,
      salePrice: r.salePrice,
      onlineStock: r.onlineStock,
      offlineStock: r.offlineStock,
      totalStock: r.totalStock,
      storeStock: r.offlineStock,
    });
  }

  for (const sr of latestByKey(storeRecords.filter((r) => r.basis === basis && r.typeLabel === typeLabel), (r) => `${salesKey(r.style, r.color, type)}__${r.size || ""}__${r.store}`)) {
    if (!isOfflineStore(sr.store)) continue;
    const key = salesKey(sr.style, sr.color, type);
    const c = current.get(key) || emptyAgg();
    const p = prev1.get(key) || emptyAgg();
    c.byStore[sr.store] = (c.byStore[sr.store] || 0) + sr.currentQty;
    c.byStoreAmount[sr.store] = (c.byStoreAmount[sr.store] || 0) + sr.currentAmount;
    c.byStoreStock[sr.store] = (c.byStoreStock[sr.store] || 0) + sr.stock;
    p.byStore[sr.store] = (p.byStore[sr.store] || 0) + sr.prevQty;
    p.byStoreAmount[sr.store] = (p.byStoreAmount[sr.store] || 0) + sr.prevAmount;
    current.set(key, c);
    prev1.set(key, p);
    stores.add(sr.store);
  }

  const prev2Basis = isoDate(addDays(parseSelectedMonday(basis) || new Date(basis), -7));
  const prev3Basis = isoDate(addDays(parseSelectedMonday(basis) || new Date(basis), -14));
  const prev2 = new Map<string, SalesAgg>();
  const prev3 = new Map<string, SalesAgg>();
  for (const r of latestByKey(records.filter((r) => r.basis === prev2Basis && r.typeLabel === typeLabel), (r) => salesKey(r.style, r.color, type))) {
    prev2.set(salesKey(r.style, r.color, type), { amount: r.currentAmount, qty: r.currentQty, byStore: {}, byStoreAmount: {}, byStoreStock: {} });
  }
  for (const r of latestByKey(records.filter((r) => r.basis === prev3Basis && r.typeLabel === typeLabel), (r) => salesKey(r.style, r.color, type))) {
    prev3.set(salesKey(r.style, r.color, type), { amount: r.currentAmount, qty: r.currentQty, byStore: {}, byStoreAmount: {}, byStoreStock: {} });
  }

  return { current, prev1, prev2, prev3, productMap, stores: [...stores].sort((a, b) => a.localeCompare(b, "ko")), rowCount: selectedRows.length };
}

async function buildCurrentWeeklySnapshotFromSource(args: { selected: WeekInfo; historyId: string; dbId: string; mainId: string }) {
  const { selected, historyId, dbId, mainId } = args;
  const ids = [...new Set([dbId, historyId, mainId].filter(Boolean))];
  const productIds = [...new Set([getDailySourceSheetId(), dbId, historyId, mainId].filter(Boolean))];
  const productRaw = await readFirstAvailableSheet(productIds, ["스타일별 채널별 입고판매재고현황"], "A:AZ");
  const stockRaw = await readFirstAvailableSheet(ids, ["온오프재고현황", "재고_ON", "재고_OFF", "재고_물류"], "A:AZ");
  // MARK 6.73: 업로드 쪽(InventoryDashboard.tsx)에서 compactStyleChannelRows로 압축해서 올리므로,
  // 읽을 때 원래(594열) 모양으로 되돌립니다. buildProductMaster는 이 사실을 몰라도 되게(원본과
  // 완전히 동일한 열 위치로 복원되므로) 그대로 둡니다.
  const productMaps = buildProductMaster(expandStyleChannelRows(productRaw.rows));
  mergeOnOffStock(stockRaw.rows, productMaps);
  // MARK 6.50: "금주/전주"(주 1회 갱신) 대신 Daily_Sales_History(매일 갱신)를 직접 집계합니다.
  const styleAgg = await aggregateWeeklyFromDailyHistory("style", selected.analysisStart, selected.analysisEnd);
  const colorAgg = await aggregateWeeklyFromDailyHistory("color", selected.analysisStart, selected.analysisEnd);
  const appended = await upsertWeeklyHistorySnapshot({
    historyId,
    selected,
    styleCurrent: styleAgg.current,
    stylePrev: styleAgg.previous,
    colorCurrent: colorAgg.current,
    colorPrev: colorAgg.previous,
    productMaps,
  });
  return { appended, productRaw, stockRaw };
}

export async function getSalesDataPayload(type: SalesType, requestedWeek = "", options: { refresh?: boolean } = {}): Promise<WeeklyProviderPayload> {
  const weeklyHistoryId = getWeeklyHistorySheetId();
  const legacyHistoryId = getHistorySheetId();
  const dbId = getDbSheetId();
  const mainId = getSheetId();

  const salesRows = await getSheetValuesById(legacyHistoryId, "Daily_Sales_History", "A:J").catch(() => [] as Row[]);
  // MARK 6.50: "이번주가 언제인지"도 이제 "금주/전주" B2 셀 대신 오늘(KST) 기준 월요일로 계산합니다.
  // (금주/전주는 주 1회만 갱신되어 최대 6일까지 최신 주차 판단이 늦어질 수 있었음)
  const currentBasis = isoDate(mondayOfWeek(new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))));
  const requested = explicitWeekInfo(requestedWeek);
  let historyBundle = await readDedicatedWeeklyHistory(weeklyHistoryId);
  let historyRecords = historyBundle.productRecords;
  let storeHistoryRecords = historyBundle.storeRecords;
  let weeks = makeWeeksFromBases(historyRecords.map((r) => r.basis), salesRows, currentBasis, requested ? [requested.week] : []);
  // 스냅샷에서 7/6 같은 특정 주차를 선택해 갱신하면, B2의 현재 주차와 무관하게 그 선택 주차를 우선한다.
  let selected = requested || weeks.find((w) => w.week === currentBasis) || weeks[0] || weekInfoFromMonday(mondayOfWeek(new Date()));

  const selectedTypeLabel = type === "color" ? "컬러" : "품번";
  const hasSelected = historyRecords.some((r) => r.basis === selected.week && r.typeLabel === selectedTypeLabel);
  if (options.refresh || (!hasSelected && (!requestedWeek || selected.week === currentBasis))) {
    await buildCurrentWeeklySnapshotFromSource({ selected, historyId: weeklyHistoryId, dbId, mainId });
    historyBundle = await readDedicatedWeeklyHistory(weeklyHistoryId);
    historyRecords = historyBundle.productRecords;
    storeHistoryRecords = historyBundle.storeRecords;
    weeks = makeWeeksFromBases(historyRecords.map((r) => r.basis), salesRows, currentBasis, requested ? [requested.week] : []);
    selected = requested || weeks.find((w) => w.week === currentBasis) || selected;
  }

  const mapped = historyRecordsToMaps(historyRecords, selected.week, type, storeHistoryRecords);
  const built = buildExcelLikeRows({
    type,
    selected,
    current: mapped.current,
    prev1: mapped.prev1,
    prev2: mapped.prev2,
    prev3: mapped.prev3,
    productMap: mapped.productMap,
    stores: mapped.stores,
  });

  return {
    ok: true,
    mode: "weekly-history",
    version: WEEKLY_HISTORY_VERSION,
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
    stores: mapped.stores,
    sources: {
      primary: "MARK_WEEKLY_HISTORY / Weekly_history",
      fallback: "Daily_Sales_History 직접 집계 → 전용 Weekly_history 자동 Snapshot",
      currentWeeklySheet: "Daily_Sales_History",
      basisCell: "오늘(KST) 기준 월요일",
      historySheet: WEEKLY_HISTORY_SHEET,
      historyWorkbook: "MARK_WEEKLY_HISTORY",
    },
  };
}


function percentChange(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function storeSummaryFromRecords(records: any[], storeRecords: any[], basis: string) {
  const styleRows = latestByKey(records.filter((r) => r.basis === basis && r.typeLabel === "품번"), (r) => salesKey(r.style, r.color, "style"));
  const styleByKey = new Map(styleRows.map((r) => [salesKey(r.style, r.color, "style"), r]));
  const latestStoreRows = latestByKey(storeRecords.filter((r) => r.basis === basis && r.typeLabel === "품번"), (r) => `${salesKey(r.style, r.color, "style")}__${r.store}`);
  const storeCurrent: Record<string, number> = {};
  const storePrevious: Record<string, number> = {};
  const storeTopProducts: Record<string, any[]> = {};

  for (const sr of latestStoreRows) {
    if (!isOfflineStore(sr.store)) continue;
    storeCurrent[sr.store] = (storeCurrent[sr.store] || 0) + num(sr.currentAmount);
    storePrevious[sr.store] = (storePrevious[sr.store] || 0) + num(sr.prevAmount);
    if (!storeTopProducts[sr.store]) storeTopProducts[sr.store] = [];
    const pr = styleByKey.get(salesKey(sr.style, sr.color, "style"));
    storeTopProducts[sr.store].push({
      styleCode: sr.style,
      productName: sr.styleName || pr?.styleName || "",
      weekAmount: num(sr.currentAmount),
      prevAmount: num(sr.prevAmount),
      amountChangeRate: percentChange(num(sr.currentAmount), num(sr.prevAmount)),
    });
  }

  const storeNames = [...new Set([...Object.keys(storeCurrent), ...Object.keys(storePrevious)])].sort((a, b) => a.localeCompare(b, "ko"));
  const current = storeNames.map((storeName) => ({
    storeName,
    weekSales: storeCurrent[storeName] || 0,
    compareWeekSales: storePrevious[storeName] || 0,
    weekChangeRate: percentChange(storeCurrent[storeName] || 0, storePrevious[storeName] || 0),
    weekTarget: 0,
    weekRate: 0,
    monthSales: 0,
    monthTarget: 0,
    monthRate: 0,
  })).sort((a, b) => b.weekSales - a.weekSales);
  const compare = storeNames.map((storeName) => ({ storeName, weekSales: storePrevious[storeName] || 0 }));

  Object.keys(storeTopProducts).forEach((store) => {
    storeTopProducts[store] = storeTopProducts[store]
      .sort((a, b) => Number(b.weekAmount || 0) - Number(a.weekAmount || 0))
      .slice(0, 20);
  });

  const companyTopProducts = styleRows
    .map((r) => ({
      styleCode: r.style,
      productName: r.styleName,
      weekAmount: r.currentAmount,
      prevAmount: r.prevAmount,
      amountChangeRate: percentChange(r.currentAmount, r.prevAmount),
      currentRank: r.rank || 0,
      previousRank: 0,
    }))
    .sort((a, b) => Number(b.weekAmount || 0) - Number(a.weekAmount || 0))
    .slice(0, 20);

  return { current, compare, companyTopProducts, storeTopProducts, productStoreNames: storeNames };
}

/**
 * 주간 대시보드의 상품 TOP.
 * MARK 6.74: 예전엔 "금주/전주" 시트에서만 읽었는데(주 1회 갱신이라 최대 6일 지연 가능),
 * 이제 aggregateWeeklyFromDailyHistory()가 만드는 것과 완전히 같은 형태(SalesAgg map)를
 * 받도록 바꿔서 Daily_Sales_History(매일 갱신) 기준으로 계산합니다. aggregate 구조가
 * 우연히 productSummaryFromWeeklyPrice가 기대하던 입력과 호환되어서, 아래 로직 자체는
 * 거의 그대로 두고 "어디서 aggregate를 받아오는지"만 바꿨습니다.
 */
function productSummaryFromDailyHistory(aggregate: { current: Map<string, SalesAgg>; previous: Map<string, SalesAgg>; productNames: Map<string, string> }) {
  const current = aggregate.current;
  const previous = aggregate.previous;
  const productNames = aggregate.productNames;

  const totalWeekAmount = [...current.values()].reduce((sum, agg) => sum + num(agg.amount), 0);

  const companyTopProducts = [...current.entries()]
    .map(([styleCode, currentAgg]) => {
      const prevAgg = previous.get(styleCode) || emptyAgg();
      const weekAmount = num(currentAgg.amount);
      return {
        styleCode,
        productName: productNames.get(styleCode) || styleCode,
        weekAmount,
        weekNet: num(currentAgg.qty),
        prevAmount: num(prevAgg.amount),
        prevNet: num(prevAgg.qty),
        amountChangeRate: percentChange(weekAmount, num(prevAgg.amount)),
        contributionRate: totalWeekAmount ? (weekAmount / totalWeekAmount) * 100 : 0,
      };
    })
    .filter((row) => row.weekAmount || row.prevAmount)
    .sort((a, b) => b.weekAmount - a.weekAmount)
    .slice(0, 20);

  const storeTopProducts: Record<string, any[]> = {};
  const storeTotals: Record<string, number> = {};
  for (const [, currentAgg] of current.entries()) {
    for (const [rawStore, amount] of Object.entries(currentAgg.byStoreAmount || {})) {
      if (!isOfflineStore(rawStore)) continue;
      storeTotals[rawStore] = (storeTotals[rawStore] || 0) + num(amount);
    }
  }

  for (const [styleCode, currentAgg] of current.entries()) {
    const prevAgg = previous.get(styleCode) || emptyAgg();
    const storeKeys = new Set([
      ...Object.keys(currentAgg.byStoreAmount || {}),
      ...Object.keys(prevAgg.byStoreAmount || {}),
    ]);
    for (const rawStore of storeKeys) {
      if (!isOfflineStore(rawStore)) continue;
      const storeName = displayDailyStoreName(rawStore);
      const weekAmount = num(currentAgg.byStoreAmount?.[rawStore]);
      const prevAmount = num(prevAgg.byStoreAmount?.[rawStore]);
      if (!weekAmount && !prevAmount) continue;
      if (!storeTopProducts[storeName]) storeTopProducts[storeName] = [];
      const storeTotal = storeTotals[rawStore] || 0;
      storeTopProducts[storeName].push({
        styleCode,
        productName: productNames.get(styleCode) || styleCode,
        weekAmount,
        weekNet: num(currentAgg.byStore?.[rawStore]),
        prevAmount,
        prevNet: num(prevAgg.byStore?.[rawStore]),
        amountChangeRate: percentChange(weekAmount, prevAmount),
        contributionRate: storeTotal ? (weekAmount / storeTotal) * 100 : 0,
      });
    }
  }
  Object.values(storeTopProducts).forEach((items) => items.sort((a, b) => b.weekAmount - a.weekAmount).splice(20));
  return { companyTopProducts, storeTopProducts };
}

function fmtWon(n: number) {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

async function buildWeeklyAiBriefing(params: {
  weekLabel: string;
  weekSales: number;
  compareWeekSales: number;
  weeklyTargetSummary: { available: boolean; companyTarget: number };
  storeRows: any[];
  companyTopProducts: any[];
}) {
  const { weekLabel, weekSales, compareWeekSales, weeklyTargetSummary, storeRows, companyTopProducts } = params;
  const lines: string[] = [];

  if (weeklyTargetSummary.available && weeklyTargetSummary.companyTarget > 0) {
    const rate = (weekSales / weeklyTargetSummary.companyTarget) * 100;
    lines.push(`이번 주(${weekLabel}) 매출은 ${fmtWon(weekSales)}으로, 주간 목표(${fmtWon(weeklyTargetSummary.companyTarget)}) 대비 ${rate.toFixed(0)}% 달성했어요.`);
  } else {
    const changeRate = compareWeekSales ? ((weekSales - compareWeekSales) / compareWeekSales) * 100 : 0;
    lines.push(`이번 주(${weekLabel}) 매출은 ${fmtWon(weekSales)}으로, 전주 대비 ${changeRate >= 0 ? "+" : ""}${changeRate.toFixed(1)}%예요.`);
  }

  const withTarget = storeRows.filter((r) => Number(r.weekTarget || 0) > 0);
  if (withTarget.length >= 2) {
    const sorted = [...withTarget].sort((a, b) => Number(a.weekRate || 0) - Number(b.weekRate || 0));
    const worst = sorted[0];
    const best = sorted[sorted.length - 1];
    if (worst && best && worst.storeName !== best.storeName) {
      lines.push(`${worst.storeName}이 목표 대비 ${Number(worst.weekRate || 0).toFixed(0)}%로 가장 부진했고, ${best.storeName}은 ${Number(best.weekRate || 0).toFixed(0)}%로 가장 좋았어요.`);
    }
  } else if (storeRows.length >= 2) {
    const sorted = [...storeRows].sort((a, b) => Number(a.weekChangeRate || 0) - Number(b.weekChangeRate || 0));
    const worst = sorted[0];
    const best = sorted[sorted.length - 1];
    if (worst && best && worst.storeName !== best.storeName) {
      lines.push(`${worst.storeName}이 전주 대비 ${Number(worst.weekChangeRate || 0).toFixed(0)}%로 가장 부진했고, ${best.storeName}은 ${Number(best.weekChangeRate || 0).toFixed(0)}%로 가장 좋았어요.`);
    }
  }

  const withPrev = companyTopProducts.filter((p) => p.hasPrevProductSales);
  if (withPrev.length) {
    const best = [...withPrev].sort((a, b) => Number(b.amountChangeRate || 0) - Number(a.amountChangeRate || 0))[0];
    if (best && Number(best.amountChangeRate || 0) > 0) {
      lines.push(`호조상품 ${best.styleCode}(${best.productName || ""})가 전주 대비 +${Number(best.amountChangeRate).toFixed(0)}%로 크게 늘었어요.`);
    }
    const worst = [...withPrev].sort((a, b) => Number(a.amountChangeRate || 0) - Number(b.amountChangeRate || 0))[0];
    if (worst && Number(worst.amountChangeRate || 0) < 0) {
      lines.push(`${worst.styleCode}(${worst.productName || ""})는 전주 대비 ${Number(worst.amountChangeRate).toFixed(0)}%로 줄었어요.`);
    }
  }

  try {
    const { readSpecialOfferSheet } = await import("@/lib/specialOfferWeek");
    const { rows, headerRowIdx: headerIdx } = await readSpecialOfferSheet();
    if (headerIdx >= 0 && rows.length > headerIdx + 1) {
      const count = rows.length - headerIdx - 1;
      if (count > 0) {
        lines.push(`스페셜오퍼위크 세부일정이 ${count}건 등록되어 있어요. 자세한 건 판매전체상에서 확인해보세요.`);
      }
    }
  } catch {
    // 스페셜오퍼위크 조회 실패는 브리핑 생성 자체를 막지 않습니다.
  }

  return lines.length ? lines : [`이번 주(${weekLabel}) 매출은 ${fmtWon(weekSales)}이에요.`];
}

export async function getWeeklyDashboardPayload(requestedWeek = "", options: { refresh?: boolean } = {}) {
  const dbId = getDbSheetId();
  const mainId = getSheetId();
  const historyId = getHistorySheetId();
  const requested = explicitWeekInfo(requestedWeek);

  // MARK 6.74: B2 기준일과 상품 TOP을 예전엔 "금주/전주" 시트에서 읽었는데(주 1회 갱신이라
  // 최대 6일 지연 가능), 이제 getSalesDataPayload와 같은 방식으로 "오늘(KST) 기준 월요일"을
  // 기준일로 쓰고, 상품 TOP도 Daily_Sales_History에서 직접 집계합니다(매일 갱신, 지연 없음).
  const b2Basis = isoDate(mondayOfWeek(new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))));

  const selected = requested || weekInfoFromMonday(parseSelectedMonday(b2Basis) || new Date(b2Basis));
  // MARK 6.75: "일간매출(26년)"을 이제 전용 스프레드시트(getDailyStoreSalesSheetId)에서 먼저
  // 찾습니다. 전환 기간이라 기존 MARK_DB 등도 계속 후보로 남겨둡니다(새 소스에 없으면 구 소스로 폴백).
  const dailyStoreRaw = await readFirstAvailableSheet(
    [getDailyStoreSalesSheetId(), dbId, mainId, historyId].filter(Boolean),
    ["일간매출(26년)", "일간매출26년", "일간매출", "Daily_Store_Sales", "DailyStoreSales"],
    "A:ZZ",
    { refresh: options.refresh }
  );
  const dailyStoreRows = parseDailyStoreSalesRows(dailyStoreRaw.rows || []);
  const dailyStoreSummary = dailyStoreRows.length ? buildStoreSummaryFromDailySales(dailyStoreRows, selected) : { current: [], compare: [], productStoreNames: [] as string[] };

  // MARK 6.12: 예전엔 일간매출(26년) 시트의 "기간목표"(연간 스케일) 값을 그대로 주간목표로 썼던 버그가 있었습니다.
  // 이제는 일_전일!I열에서 주차별로 캡처해둔 스냅샷(Weekly_Target_History)에서, 지금 보는 주(selected.week)와
  // 정확히 일치하는 주차 목표만 사용합니다. 저장된 게 없으면 목표 없이("-") 보여줍니다.
  const savedWeeklyTarget = await getSavedWeeklyTarget(selected.week).catch(() => null);
  const currentMonthKey = (selected.analysisEnd || selected.week || "").slice(0, 7);
  const savedMonthlyTarget = currentMonthKey ? await getSavedMonthlyTarget(currentMonthKey).catch(() => null) : null;
  for (const row of dailyStoreSummary.current) {
    const matched = savedWeeklyTarget?.byStore.get(row.storeName);
    row.weekTarget = matched || 0;
    row.weekTargetAvailable = !!savedWeeklyTarget;
    row.weekRate = row.weekTarget ? (Number(row.weekSales || 0) / row.weekTarget) * 100 : 0;

    const matchedMonth = savedMonthlyTarget?.byStore.get(row.storeName);
    row.monthTarget = matchedMonth || 0;
    row.monthTargetAvailable = !!savedMonthlyTarget;
    row.monthRate = row.monthTarget ? (Number(row.monthSales || 0) / row.monthTarget) * 100 : 0;
  }
  const weeklyTargetSummary = {
    available: !!savedWeeklyTarget,
    weekMonday: selected.week,
    companyTarget: savedWeeklyTarget?.companyTarget || 0,
  };
  const monthlyTargetSummary = {
    available: !!savedMonthlyTarget,
    monthKey: currentMonthKey,
    companyTarget: savedMonthlyTarget?.companyTarget || 0,
  };

  // MARK 6.74: 상품 TOP은 B2와 동일한 현재 주차에서만 노출한다(Daily_Sales_History 직접 집계).
  // 과거 주차는 Weekly_Snapshot을 선택하면 당시 저장된 상품 TOP을 그대로 본다.
  const productSummary = !requested || requested.week === b2Basis || options.refresh
    ? productSummaryFromDailyHistory(await aggregateWeeklyFromDailyHistory("style", selected.analysisStart, selected.analysisEnd))
    : { companyTopProducts: [] as any[], storeTopProducts: {} as Record<string, any[]> };
  const aggregation = {
    source: "MARK_DB / 일간매출(26년)",
    requestedWeek: requested?.week || "",
    basisMonday: selected.week,
    analysisStart: selected.analysisStart,
    analysisEnd: selected.analysisEnd,
    compareStart: selected.compareStart,
    compareEnd: selected.compareEnd,
    storeCount: dailyStoreSummary.current.length,
    weekSales: dailyStoreSummary.current.reduce((sum, row) => sum + num(row.weekSales), 0),
    compareWeekSales: dailyStoreSummary.current.reduce((sum, row) => sum + num(row.compareWeekSales), 0),
    monthSales: dailyStoreSummary.current.reduce((sum, row) => sum + num(row.monthSales), 0),
  };
  return {
    ok: true,
    mode: "weekly-live-dashboard",
    selectedWeek: selected.week,
    selectedWeekLabel: selected.label,
    weeks: [selected],
    weekly: {
      periodLabel: `선택주차: ${selected.label} / 분석기간: ${selected.analysisLabel} / 비교기간: ${selected.compareLabel}`,
      anchorMonday: selected.week,
      selectedWeek: selected.week,
      currentPeriod: { start: selected.analysisStart, end: selected.analysisEnd },
      comparePeriod: { start: selected.compareStart, end: selected.compareEnd },
      current: dailyStoreSummary.current,
      compare: dailyStoreSummary.compare,
      weeklyTargetSummary,
      monthlyTargetSummary,
      companyTopProducts: productSummary.companyTopProducts,
      storeTopProducts: productSummary.storeTopProducts,
      productStoreNames: dailyStoreSummary.productStoreNames,
      top10Concentration: (() => {
        const total = dailyStoreSummary.current.reduce((sum, x) => sum + Number(x.weekSales || 0), 0);
        const top10 = dailyStoreSummary.current.slice(0, 10).reduce((sum, x) => sum + Number(x.weekSales || 0), 0);
        return total ? top10 / total : 0;
      })(),
      newTop10Entrants: [],
      aiBriefing: await buildWeeklyAiBriefing({
        weekLabel: selected.analysisLabel,
        weekSales: aggregation.weekSales,
        compareWeekSales: aggregation.compareWeekSales,
        weeklyTargetSummary,
        storeRows: dailyStoreSummary.current,
        companyTopProducts: productSummary.companyTopProducts,
      }),
    },
    inventory: {},
    sources: {
      primary: "MARK_DB / 일간매출(26년)",
      currentWeeklySheet: "Daily_Sales_History 직접 집계",
      dailyStoreSalesSheet: dailyStoreRaw.sheetName || "not found",
      storeDashboardSource: "MARK_DB / 일간매출(26년)",
      basisCell: "오늘(KST) 기준 월요일",
      basisRule: requested ? "선택한 기준 월요일 우선" : "오늘(KST) 기준 월요일 고정",
      b2Basis,
      effectiveBasis: selected.week,
      latestDailyStoreDate: latestRecordDateFromDailyStoreRows(dailyStoreRows) ? isoDate(latestRecordDateFromDailyStoreRows(dailyStoreRows)!) : "",
      productTopSource: productSummary.companyTopProducts.length ? "Daily_Sales_History 현재 주차" : "과거 주차는 Weekly_Snapshot 저장본 사용",
      aggregation,
    },
  };
}

export async function getWeeklyDashboardBase(requestedWeek = "", options: { refresh?: boolean } = {}) {
  const dashboard = await getWeeklyDashboardPayload(requestedWeek, options);
  const payload = await getSalesDataPayload("style", requestedWeek, options);
  const header = payload.rows[3] || [];
  const amountCol = header.findIndex((x) => text(x) === "주간");
  const qtyGroupStart = (payload.rows[2] || []).findIndex((x) => text(x) === "수량판매");
  const rows = payload.rows.slice(7);
  const totalAmount = rows.reduce((sum, r) => sum + num(r[amountCol]), 0);
  const totalQty = rows.reduce((sum, r) => sum + num(r[qtyGroupStart]), 0);
  return {
    ok: true,
    selectedWeek: payload.selectedWeek,
    selectedWeekLabel: payload.selectedWeekLabel,
    analysisLabel: payload.analysisLabel,
    compareLabel: payload.compareLabel,
    totalAmount,
    totalQty,
    rows,
    sources: payload.sources,
  };
}
