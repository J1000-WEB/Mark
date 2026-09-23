import fallback from "./mark-data.json";
import { getDbSheetId, getDailySourceSheetId, getDailyStoreSalesSheetId, getHistorySheetId, getSheetId, getManySheetValues, getManySheetValuesById, getSpreadsheetTitles, getSpreadsheetTitlesById, getSheetValuesById, getSheetRowCountById, readRecentTailRowsById, ensureSheetExistsById, safeReplaceSheetValuesById } from "./googleSheets";
import { isCompactDailyHistoryHeader, expandCompactDailyHistoryRows, expandAnyDailyHistoryRows, DAILY_HISTORY_HEADER } from "./dailySales";
import { loadStyleLaunchMap } from "./styleLaunchMaster";
import { saveWeeklyStylePrices, currentWeekMonday } from "./stylePriceHistory";
import { mergeStoreDailyAmounts, getMergedAmount, yesterdayDateKeyKST, getComparisonDateForDaily } from "./storeDailyAmount";
import { readFirstAvailableSheet, buildProductMaster } from "./weeklyDataProvider";
import { expandStyleChannelRows } from "./styleChannelCompact";

function text(v: any) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function num(v: any) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/,/g, "").replace(/%/g, "").replace(/[^0-9.\-]/g, "");
  if (!s || s === "-" || s === "." || s === "-.") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}


function parseDate(v: any) {
  if (!v) return null as Date | null;
  if (v instanceof Date) return v;
  const s = text(v);
  if (!s) return null as Date | null;
  const normalized = s.replace(/[./]/g, "-").slice(0, 10);
  const parts = normalized.split("-").map((x) => Number(x));
  if (parts.length >= 3 && parts.every((x) => Number.isFinite(x))) {
    let year = parts[0];
    if (year < 100) year += 2000;
    const d = new Date(year, parts[1] - 1, parts[2]);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function rate(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function isShop(storeName: string) {
  return String(storeName || "").startsWith("오프라인_");
}

function isExcludedStore(storeName: string) {
  const raw = String(storeName || "").trim();
  const lower = raw.toLowerCase();
  const key = normalizeStoreKey(storeName);
  // 포시즌 아울렛은 프로젝트성 매장이라 핵심 매장 호조/부진/랭킹/합산에서 제외합니다.
  // 주간/일간 매출 집계에서 글로벌_ / 기타_ 채널은 오프라인 매출이 아니므로 제외합니다.
  return (
    key.includes("포시즌아울렛") ||
    key.includes("포시즌") ||
    raw.startsWith("글로벌_") ||
    raw.startsWith("기타_") ||
    lower.startsWith("global_") ||
    lower.startsWith("etc_") ||
    key === "기타" ||
    key.startsWith("기타") ||
    key.includes("글로벌")
  );
}

function isOnlineChannel(storeName: string) {
  const s = String(storeName || "").trim().toLowerCase();
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

function isConsignmentChannel(storeName: string) {
  const raw = String(storeName || "").trim();
  const s = raw.toLowerCase();
  return (
    raw.startsWith("오프라인_") ||
    s.includes("위탁") ||
    s.includes("면세") ||
    s.includes("한컬렉션") ||
    s.includes("han collection") ||
    s.includes("hancollection") ||
    s.includes("무신사")
  );
}

function isOfflineSalesStore(storeName: string) {
  const s = String(storeName || "").trim();
  if (!s || s === "합계" || s === "채널명") return false;
  return !isOnlineChannel(s) && !isExcludedStore(s);
}

export function isCoreOfflineSalesStore(storeName: string) {
  return isOfflineSalesStore(storeName) && !isConsignmentChannel(storeName);
}

export function normalizeStoreKey(storeName: string) {
  const raw = String(storeName || "").trim();
  return raw
    .replace(/^오프라인[_\s-]*/i, "")
    .replace(/점$/g, "")
    .replace(/[\s_\-·.()]/g, "")
    .toLowerCase();
}

function displayStoreName(storeName: string) {
  const raw = String(storeName || "").replace(/^오프라인[_\s-]*/i, "").trim();
  const key = normalizeStoreKey(raw);
  const aliases: Record<string, string> = {
    "성수플래그십": "성수 플래그십",
    "성수flagship": "성수 플래그십",
    "신사플래그십": "신사 플래그십",
    "광주신세계": "신세계 광주점",
    "신세계광주": "신세계 광주점",
  };
  return aliases[key] || raw;
}

function isPriorityStore(storeName: string) {
  const key = normalizeStoreKey(storeName);
  return key.includes("성수") || key.includes("신사") || key.includes("플래그십") || key.includes("강남");
}

function weeksSince(dateMs: number) {
  if (!dateMs) return 999;
  return (Date.now() - Number(dateMs || 0)) / (1000 * 60 * 60 * 24 * 7);
}


function normalizeSheetName(name: string) {
  return String(name || "")
    .replace(/[\\/\s_\-·.]/g, "")
    .replace(/[()]/g, "")
    .trim();
}

function pickNormalizedTitle(titles: string[], candidates: string[], fallback: string) {
  const normalized = titles.map((title) => ({ title, norm: normalizeSheetName(title) }));
  for (const candidate of candidates) {
    const c = normalizeSheetName(candidate);
    const exact = normalized.find((x) => x.title === candidate || x.norm === c);
    if (exact) return exact.title;
  }
  for (const candidate of candidates) {
    const c = normalizeSheetName(candidate);
    const partial = normalized.find((x) => x.norm.includes(c) || c.includes(x.norm));
    if (partial) return partial.title;
  }
  return fallback;
}

function pickTitle(titles: string[], exact: string, fallbackPrefix?: string) {
  if (titles.includes(exact)) return exact;
  if (fallbackPrefix) {
    const found = titles.find((t) => t.startsWith(fallbackPrefix));
    if (found) return found;
  }
  return exact;
}

function pickWeeklyCurrent(titles: string[]) {
  const candidates = titles.filter((t) => t.startsWith("차주("));
  return candidates[candidates.length - 1] || "차주(0614)";
}

function pickWeeklyCompare(titles: string[]) {
  const candidates = titles.filter((t) => t.startsWith("전주("));
  return candidates[candidates.length - 1] || "전주(531)";
}


export function pickProductSheet(titles: string[]) {
  // 실제 탭명은 보통 "금주/전주"입니다.
  // 없는 이름("금주전주")을 fallback으로 반환하면 Google Sheets batchGet 전체가 실패합니다.
  const exact = titles.find((t) => t === "금주/전주");
  if (exact) return exact;

  const found = titles.find((t) => {
    const n = normalizeSheetName(t);
    return n.includes("금주") && n.includes("전주");
  });
  return found || "";
}


function parseTargetSheet(sheetName: string, rows: any[][]) {
  let headerRow = -1;
  let storeCol = -1;

  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const idx = rows[r].map(text).indexOf("채널명");
    if (idx >= 0) {
      headerRow = r;
      storeCol = idx;
      break;
    }
  }

  if (headerRow < 0 || storeCol < 0) return { sheet: sheetName, rows: [] as any[] };

  const noCol = Math.max(0, storeCol - 3);
  const base = storeCol + 1;
  const out: any[] = [];

  for (let r = headerRow + 2; r < rows.length; r++) {
    const row = rows[r] || [];
    let storeName = text(row[storeCol]);
    const no = text(row[noCol]);
    if (!storeName && no.startsWith("합계")) storeName = "합계";
    if (!storeName || storeName === "합계" || storeName === "채널명") continue;

    const dayTarget = num(row[base]);
    const daySales = num(row[base + 1]);
    const dayRate = num(row[base + 2]);
    const weekTarget = num(row[base + 3]);
    const rawWeekSales = num(row[base + 4]);
    const rawWeekRate = num(row[base + 5]);
    const monthBaseTarget = num(row[base + 6]);
    const monthTarget = num(row[base + 7]);
    const monthSales = num(row[base + 8]);
    const monthRateA = num(row[base + 9]);
    const monthRate = num(row[base + 10]);

    // 일부 차주 시트는 주실적의 실적 칸이 비어 있고, 실제 누적 매출이 월판매 실적 칸에 들어옵니다.
    // 주간 화면/매장 순위는 이 값을 현재 주간 실적으로 사용해야 하므로 fallback 처리합니다.
    const weekSales = rawWeekSales;
    const weekRate = rawWeekRate || (weekTarget ? (weekSales / weekTarget) * 100 : 0);

    out.push({
      storeName,
      dayTarget,
      daySales,
      dayRate,
      weekTarget,
      weekSales,
      weekRate,
      monthBaseTarget,
      monthTarget,
      monthSales,
      monthRateA,
      monthRate,
      yearTarget: num(row[base + 11]),
      yearSales: num(row[base + 12]),
      yearRate: num(row[base + 13]),
    });
  }

  return { sheet: sheetName, rows: out };
}

function findHeaderRow(rows: any[][], labels: string[]) {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const joined = (rows[r] || []).map(text).join("|");
    if (labels.every((label) => joined.includes(label))) return r;
  }
  return -1;
}

function findCol(row: any[], labels: string[], fallback = -1) {
  const normalized = (row || []).map((v) => text(v).replace(/\s/g, ""));
  for (const label of labels) {
    const target = label.replace(/\s/g, "");
    const idx = normalized.findIndex((v) => v === target || v.includes(target));
    if (idx >= 0) return idx;
  }
  return fallback;
}

function normalizedHeader(v: any) {
  return text(v).replace(/[\s_\-·.()]/g, "");
}

function findGroupStart(groupHeader: any[], labels: string[]) {
  const normalized = (groupHeader || []).map(normalizedHeader);
  for (const label of labels) {
    const target = normalizedHeader(label);
    const idx = normalized.findIndex((v) => v === target || v.includes(target));
    if (idx >= 0) return idx;
  }
  return -1;
}

function findGroupEnd(groupHeader: any[], start: number, maxLength: number) {
  if (start < 0) return maxLength;
  for (let i = start + 1; i < maxLength; i++) {
    if (text(groupHeader[i])) return i;
  }
  return maxLength;
}

function findMetricInGroup(groupHeader: any[], header: any[], start: number, metricLabels: string[], fallback = -1) {
  if (start < 0) return fallback;
  const end = findGroupEnd(groupHeader, start, header.length);
  const normalized = (header || []).map(normalizedHeader);

  for (const label of metricLabels) {
    const target = normalizedHeader(label);
    for (let i = start; i < end; i++) {
      if (normalized[i] === target || normalized[i].includes(target)) return i;
    }
  }

  return fallback;
}

export function parseProducts(rows: any[][]) {
  const headerRow = findHeaderRow(rows, ["채널명", "스타일"]);
  const header = headerRow >= 0 ? rows[headerRow] || [] : [];
  const groupHeader = headerRow > 0 ? rows[headerRow - 1] || [] : [];

  const storeCol = findCol(header, ["채널명"], 1);
  const styleCol = findCol(header, ["스타일"], 2);
  const productCol = findCol(header, ["스타일명"], 3);
  const colorCol = findCol(header, ["칼라"], 4);
  const colorNameCol = findCol(header, ["칼라명"], 5);
  const sizeCol = findCol(header, ["사이즈"], 6);
  // 금주전주 시트는 헤더상 H="재고", I="수량"으로 보이지만 실제 점포 재고 수량은 I열(수량)에 들어옵니다.
  // 이전처럼 "재고" 텍스트만 따라가면 성수 플래그십 같은 점포 재고가 0으로 표시됩니다.
  const stockQtyCol = findCol(header, ["수량"], -1);
  const stockHeaderCol = findCol(header, ["재고"], 7);
  const stockCol = stockQtyCol >= 0 ? stockQtyCol : stockHeaderCol;
  const launchCol = findCol(header, ["최초출고일"], 27);

  const currentGroupCol = findGroupStart(groupHeader, ["금주", "기간판매1"]);
  const previousGroupCol = findGroupStart(groupHeader, ["전주", "기간판매2"]);
  const period1Col = findCol(header, ["기간판매1"], -1);
  const period2Col = findCol(header, ["기간판매2"], -1);

  // MARK 4.80.3:
  // 금주/전주 원본은 열 위치가 자주 바뀌므로 I/H 같은 고정 열을 쓰지 않고
  // 상단 그룹 헤더(금주/전주) + 세부 헤더(합계/판매금액)를 확인해서 매핑합니다.
  // 현재 시트 구조 예:
  // 2행: ... 금주 ... 전주 ...
  // 3행: ... 판매/반품/합계/판매금액 ...
  const weekNetCol = findMetricInGroup(groupHeader, header, currentGroupCol, ["합계"], period1Col >= 0 ? period1Col + 2 : 20);
  const weekAmountCol = findMetricInGroup(groupHeader, header, currentGroupCol, ["판매금액", "금액"], period1Col >= 0 ? period1Col + 3 : 21);
  const prevNetCol = findMetricInGroup(groupHeader, header, previousGroupCol, ["합계"], period2Col >= 0 ? period2Col + 2 : 24);
  const prevAmountCol = findMetricInGroup(groupHeader, header, previousGroupCol, ["판매금액", "금액"], period2Col >= 0 ? period2Col + 3 : 25);

  const startRow = headerRow >= 0 ? headerRow + 1 : 3;
  const grouped = new Map<string, any>();

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r] || [];
    const rawStoreName = text(row[storeCol]);
    const storeName = displayStoreName(rawStoreName);
    const storeKey = normalizeStoreKey(rawStoreName);
    const styleCode = text(row[styleCol]);
    const productName = text(row[productCol]);
    if (!storeName || !styleCode || !productName) continue;
    if (`${storeName}${styleCode}${productName}`.includes("합계")) continue;
    if (styleCode.includes("스타일") || productName.includes("스타일")) continue;

    const color = text(row[colorCol]);
    const colorName = text(row[colorNameCol]);
    const size = text(row[sizeCol]);
    const stock = Math.max(0, num(row[stockCol]));
    const weekNet = num(row[weekNetCol]);
    const weekAmount = num(row[weekAmountCol]);
    const prevNet = num(row[prevNetCol]);
    const prevAmount = num(row[prevAmountCol]);
    const launch = parseDate(row[launchCol]);

    // RT 판단은 스타일 단위로 해야 하므로 채널+스타일 기준으로 먼저 합산합니다.
    // 단, RT_Result 지시서 생성을 위해 칼라/사이즈별 실제 재고는 skuRows에 보존합니다.
    const key = `${storeKey || normalizeStoreKey(storeName)}__${styleCode}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        season: normalizeSeasonValue(text(row[0]) || "미지정"),
        storeName,
        storeKey: storeKey || normalizeStoreKey(storeName),
        styleCode,
        productName,
        storeStock: 0,
        weekNet: 0,
        weekAmount: 0,
        prevNet: 0,
        prevAmount: 0,
        launchDate: launch ? launch.toISOString().slice(0, 10) : "",
        launchTime: launch ? launch.getTime() : 0,
        skuRows: [] as any[],
      });
    }

    const item = grouped.get(key);
    item.storeStock += stock;
    item.weekNet += weekNet;
    item.weekAmount += weekAmount;
    item.prevNet += prevNet;
    item.prevAmount += prevAmount;
    if (!item.launchTime && launch) {
      item.launchDate = launch.toISOString().slice(0, 10);
      item.launchTime = launch.getTime();
    }
    if (color || colorName || size || stock) {
      item.skuRows.push({
        color,
        colorName,
        size,
        stock,
        weekNet,
        weekAmount,
        prevNet,
        prevAmount,
      });
    }
  }

  return Array.from(grouped.values());
}

function parseInventory(rows: any[][]) {
  const grouped = new Map<string, any>();
  if (!rows.length) return [];

  const headerRow = findHeaderRow(rows, ["스타일", "가용(온)"]);
  const header = headerRow >= 0 ? rows[headerRow] || [] : rows[0] || [];

  // 온오프재고현황 시즌은 V열입니다.
  // "시즌" 유사 문자열이 다른 행/열에 잡히면 21030 같은 점포/그룹 코드가 시즌으로 들어가므로
  // 헤더가 정확히 "시즌"인 경우만 우선하고, 실패 시 V열(0-base 21)로 고정합니다.
  const exactSeasonCol = (header || []).map(text).findIndex((v) => v.replace(/\s/g, "") === "시즌");
  const seasonCol = exactSeasonCol >= 0 ? exactSeasonCol : 21;       // V
  const styleCol = findCol(header, ["스타일"], 5);       // F
  const productCol = findCol(header, ["스타일명"], 6);   // G
  const tagPriceCol = findCol(header, ["Tag가", "TAG가"], 12);       // M
  const currentPriceCol = findCol(header, ["실판매가"], 13);          // N

  // 온오프재고현황 실제 구조:
  // P 재고 / Q 할당 / R 가용(온) / S 가용(오프) / T 가용(합계)
  // 이 시트는 컬러/사이즈별 행이므로 반드시 스타일 단위로 합산해야 합니다.
  const stockCol = findCol(header, ["재고"], 15);                 // P
  const allocatedCol = findCol(header, ["할당"], 16);             // Q
  const onlineStockCol = findCol(header, ["가용(온)", "가용온"], 17);   // R
  const offlineStockCol = findCol(header, ["가용(오프)", "가용오프"], 18); // S
  const totalStockCol = findCol(header, ["가용(합계)", "가용합계"], 19);  // T

  const startRow = headerRow >= 0 ? headerRow + 1 : 1;

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r] || [];
    const season = text(row[seasonCol]) || "";
    const styleCode = text(row[styleCol]);
    const productName = text(row[productCol]);
    if (!styleCode || styleCode.includes("스타일") || styleCode.includes("합계")) continue;

    const tagPrice = num(row[tagPriceCol]);
    const currentPrice = num(row[currentPriceCol]);
    const stock = num(row[stockCol]);
    const allocatedStock = num(row[allocatedCol]);
    const onlineStock = num(row[onlineStockCol]);
    const offlineStock = num(row[offlineStockCol]);
    const totalStock = num(row[totalStockCol]) || onlineStock + offlineStock;

    if (!onlineStock && !offlineStock && !totalStock && !tagPrice && !currentPrice && !stock) continue;

    if (!grouped.has(styleCode)) {
      grouped.set(styleCode, {
        season,
        styleCode,
        productName,
        tagPrice,
        currentPrice,
        stock: 0,
        allocatedStock: 0,
        onlineStock: 0,
        offlineStock: 0,
        totalStock: 0,
        skuRowCount: 0,
      });
    }

    const item = grouped.get(styleCode);
    if (!item.season && season) item.season = season;
    if (!item.productName && productName) item.productName = productName;
    if (!item.tagPrice && tagPrice) item.tagPrice = tagPrice;
    if (!item.currentPrice && currentPrice) item.currentPrice = currentPrice;

    item.stock += stock;
    item.allocatedStock += allocatedStock;
    item.onlineStock += onlineStock;
    item.offlineStock += offlineStock;
    item.totalStock += totalStock;
    item.skuRowCount += 1;
  }

  return Array.from(grouped.values());
}

// MARK 2026-09-17: "판매분 배분" 탭의 물류가용재고가 부정확하다는 피드백 — 원인은 두 가지:
// (1) parseInventory()류가 읽던 라이브 "온오프재고현황" 시트는 17,000행 넘게 매번 통째로
//     읽어야 해서(이 세션에서 여러 번 고친 OOM 패턴과 동일) 무겁고, 갱신 시점도 이 탭과
//     안 맞을 수 있었습니다.
// (2) 그래서 담당자가 ERP에서 내려받은 "온오프재고현황" 엑셀을 직접 업로드하면, 필요한
//     4열(스타일/칼라/사이즈/가용(오프))만 압축해서 이 전용 스냅샷 시트에 저장해두고,
//     판매분 배분은 항상 이 가벼운 스냅샷만 읽습니다. 업데이트 일시도 같이 저장해서
//     화면에 "마지막 업데이트: ..."로 보여줄 수 있게 합니다.
const WAREHOUSE_SNAPSHOT_SHEET = "물류가용재고_스냅샷";
const WAREHOUSE_SNAPSHOT_META_SHEET = "물류가용재고_스냅샷_메타";
const WAREHOUSE_SNAPSHOT_HEADER = ["스타일", "칼라", "사이즈", "가용재고(오프)"];
const WAREHOUSE_SNAPSHOT_META_HEADER = ["업로드일시", "행수", "원본파일명"];

function nowKSTDateTime() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 업로드(app/api/warehouse-stock-upload)에서 호출합니다. rows는 클라이언트에서 이미
// [스타일,칼라,사이즈,가용(오프)]로 압축해서 보낸 값입니다(헤더/열 위치를 둘 다 확인해서
// 뽑은 값 — 클라이언트 쪽 parseWarehouseStockWorkbook 참고).
export async function saveWarehouseStockSnapshot(rows: any[][], fileName?: string) {
  const clean = (rows || [])
    .map((r) => [text(r[0]), text(r[1]), text(r[2]), num(r[3])])
    .filter((r) => r[0] && r[1] && r[2]);
  if (!clean.length) {
    throw new Error("업로드할 재고 데이터를 찾지 못했습니다. 스타일/칼라/사이즈 열을 확인해주세요.");
  }

  const dbId = getDbSheetId();
  await ensureSheetExistsById(dbId, WAREHOUSE_SNAPSHOT_SHEET, WAREHOUSE_SNAPSHOT_HEADER);
  await ensureSheetExistsById(dbId, WAREHOUSE_SNAPSHOT_META_SHEET, WAREHOUSE_SNAPSHOT_META_HEADER);

  await safeReplaceSheetValuesById(dbId, WAREHOUSE_SNAPSHOT_SHEET, [WAREHOUSE_SNAPSHOT_HEADER, ...clean]);

  const uploadedAt = nowKSTDateTime();
  await safeReplaceSheetValuesById(dbId, WAREHOUSE_SNAPSHOT_META_SHEET, [
    WAREHOUSE_SNAPSHOT_META_HEADER,
    [uploadedAt, clean.length, text(fileName)],
  ]);

  return { ok: true, rowCount: clean.length, uploadedAt };
}

export async function getWarehouseStockSnapshotMeta() {
  const dbId = getDbSheetId();
  const rows = await getSheetValuesById(dbId, WAREHOUSE_SNAPSHOT_META_SHEET, "A2:C2").catch(() => [] as any[]);
  const row = rows[0];
  if (!row || !text(row[0])) return null;
  return { uploadedAt: text(row[0]), rowCount: num(row[1]), fileName: text(row[2]) };
}

async function readWarehouseStockSnapshot() {
  const dbId = getDbSheetId();
  const [dataRows, metaRows] = await Promise.all([
    getSheetValuesById(dbId, WAREHOUSE_SNAPSHOT_SHEET, "A2:D200000").catch(() => [] as any[]),
    getSheetValuesById(dbId, WAREHOUSE_SNAPSHOT_META_SHEET, "A2:C2").catch(() => [] as any[]),
  ]);
  const rows = dataRows
    .filter((r) => r && text(r[0]))
    .map((r) => ({ styleCode: text(r[0]), color: text(r[1]), size: text(r[2]), offlineStock: num(r[3]) }));
  const metaRow = metaRows[0];
  const meta = metaRow && text(metaRow[0])
    ? { uploadedAt: text(metaRow[0]), rowCount: num(metaRow[1]), fileName: text(metaRow[2]) }
    : null;
  return { rows, meta };
}

// MARK 2026-09-21: "점포요청 RT 재고가 너무 부정확하다" — 소천님이 매일 아침 올리시는 PIP
// 파일이 실제로는 매장별 재고를 정확히 갖고 있는데(스타일/칼라/사이즈별로 24개 매장 각각의
// "재고" 컬럼이 있음, 클라이언트 쪽 lib/salesDataSuggestions.ts의 extractStoreStockRows가
// 헤더+하위라벨을 둘 다 확인해서 뽑아옴), 점포요청 RT는 지금까지 Daily_Sales_History(판매된
// 것만 기록되는 판매이력)로만 재고를 추정하고 있었습니다. PIP 업로드 시 이 매장별 재고도
// 같이 압축 저장해서(물류가용재고_스냅샷과 동일한 패턴), 점포요청 RT가 훨씬 정확한 이
// 소스를 재고 판단에 우선 사용하도록 합니다.
const STORE_STOCK_SNAPSHOT_SHEET = "매장별_재고_스냅샷";
const STORE_STOCK_SNAPSHOT_META_SHEET = "매장별_재고_스냅샷_메타";
const STORE_STOCK_SNAPSHOT_HEADER = ["스타일", "스타일명", "칼라", "칼라명", "사이즈", "매장", "재고"];
const STORE_STOCK_SNAPSHOT_META_HEADER = ["업로드일시", "행수", "매장수", "원본파일명"];

// 업로드(app/api/store-stock-upload)에서 호출합니다. rows는 클라이언트에서 이미
// [스타일,스타일명,칼라,칼라명,사이즈,매장,재고]로 압축해서 보낸 값입니다
// (헤더/하위라벨을 둘 다 확인해서 뽑은 값 — lib/salesDataSuggestions.ts의 extractStoreStockRows 참고).
export async function saveStoreStockSnapshot(rows: any[][], fileName?: string) {
  const clean = (rows || [])
    .map((r) => [text(r[0]), text(r[1]), text(r[2]), text(r[3]), text(r[4]), text(r[5]), num(r[6])])
    .filter((r) => r[0] && r[2] && r[4] && r[5]); // 스타일/칼라/사이즈/매장 필수(스타일명/칼라명은 없어도 됨)
  if (!clean.length) {
    throw new Error("업로드할 매장별 재고 데이터를 찾지 못했습니다. PIP 파일의 매장 컬럼을 확인해주세요.");
  }

  const dbId = getDbSheetId();
  await ensureSheetExistsById(dbId, STORE_STOCK_SNAPSHOT_SHEET, STORE_STOCK_SNAPSHOT_HEADER);
  await ensureSheetExistsById(dbId, STORE_STOCK_SNAPSHOT_META_SHEET, STORE_STOCK_SNAPSHOT_META_HEADER);

  await safeReplaceSheetValuesById(dbId, STORE_STOCK_SNAPSHOT_SHEET, [STORE_STOCK_SNAPSHOT_HEADER, ...clean]);

  const storeCount = new Set(clean.map((r) => r[5])).size;
  const uploadedAt = nowKSTDateTime();
  await safeReplaceSheetValuesById(dbId, STORE_STOCK_SNAPSHOT_META_SHEET, [
    STORE_STOCK_SNAPSHOT_META_HEADER,
    [uploadedAt, clean.length, storeCount, text(fileName)],
  ]);

  return { ok: true, rowCount: clean.length, storeCount, uploadedAt };
}

export async function getStoreStockSnapshotMeta() {
  const dbId = getDbSheetId();
  const rows = await getSheetValuesById(dbId, STORE_STOCK_SNAPSHOT_META_SHEET, "A2:D2").catch(() => [] as any[]);
  const row = rows[0];
  if (!row || !text(row[0])) return null;
  return { uploadedAt: text(row[0]), rowCount: num(row[1]), storeCount: num(row[2]), fileName: text(row[3]) };
}

export type StoreStockSnapshotRow = { styleCode: string; productName: string; color: string; colorName: string; size: string; storeName: string; stock: number };

// MARK 2026-09-22: RT 승인(app/api/rt-result)의 "출고점 칼라/사이즈별 재고 배분"이 이 스냅샷을
// 폴백으로 쓸 수 있도록 export합니다 — 원래 "금주/전주" 시트만 보고 있었는데, 그 시트에
// 아직 안 올라온 신규 매장(예: 팩토리아울렛 용인점처럼 최근에 생긴 매장)은 칼라/사이즈별
// 재고를 못 찾아서 승인 자체가 실패했습니다.
export async function readStoreStockSnapshot(): Promise<{ rows: StoreStockSnapshotRow[]; meta: { uploadedAt: string; rowCount: number; storeCount: number; fileName: string } | null }> {
  const dbId = getDbSheetId();
  // MARK 2026-09-22: 실제 데이터는 PIP 24개 매장 기준 4만 행 안팎인데 "A2:G500000"으로
  // 12배 넓게 요청하고 있었습니다 — /api/data(대시보드 전체) 타임아웃 원인 조사 중 눈에 띄어서,
  // 여유(6만 행)만 남기고 좁혔습니다. 매장이 더 늘어나도 6만 행이면 한동안 충분합니다.
  const [dataRows, metaRows] = await Promise.all([
    getSheetValuesById(dbId, STORE_STOCK_SNAPSHOT_SHEET, "A2:G60000").catch(() => [] as any[]),
    getSheetValuesById(dbId, STORE_STOCK_SNAPSHOT_META_SHEET, "A2:D2").catch(() => [] as any[]),
  ]);
  const rows = dataRows
    .filter((r) => r && text(r[0]))
    .map((r) => ({
      styleCode: text(r[0]),
      productName: text(r[1]),
      color: text(r[2]),
      colorName: text(r[3]),
      size: text(r[4]),
      storeName: text(r[5]),
      stock: num(r[6]),
    }));
  const metaRow = metaRows[0];
  const meta = metaRow && text(metaRow[0])
    ? { uploadedAt: text(metaRow[0]), rowCount: num(metaRow[1]), storeCount: num(metaRow[2]), fileName: text(metaRow[3]) }
    : null;
  return { rows, meta };
}

export function aggregateProducts(rows: any[], storeName?: string, top = 10) {
  const map = new Map<string, any>();
  for (const r of rows) {
    if (storeName && r.storeName !== storeName) continue;
    const key = r.styleCode || r.productName;
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        styleCode: r.styleCode,
        productName: r.productName,
        weekNet: 0,
        weekAmount: 0,
        prevNet: 0,
        prevAmount: 0,
      });
    }
    const item = map.get(key);
    item.weekNet += Number(r.weekNet || 0);
    item.weekAmount += Number(r.weekAmount || 0);
    item.prevNet += Number(r.prevNet || 0);
    item.prevAmount += Number(r.prevAmount || 0);
  }

  const all = [...map.values()];
  const total = all.reduce((s, x) => s + Number(x.weekAmount || 0), 0);
  return all
    .map((x) => {
      // 상품 단위 증감률 보정:
      // 전주 판매가 0인 상품을 +100%로 처리하면 신규/전주미판매 상품이
      // 호조/부진상품 TOP에 잘못 노출됩니다.
      // 전주값이 없으면 증감률은 0으로 두고, 실제 호조/부진 판단은
      // 전주 데이터가 있는 상품 위주로 정렬되도록 합니다.
      const hasPrevQty = Number(x.prevNet || 0) > 0;
      const hasPrevAmount = Number(x.prevAmount || 0) > 0;

      return {
        ...x,
        hasPrevProductSales: hasPrevAmount || hasPrevQty,
        qtyChangeRate: hasPrevQty ? rate(x.weekNet, x.prevNet) : 0,
        amountChangeRate: hasPrevAmount ? rate(x.weekAmount, x.prevAmount) : 0,
        contributionRate: total ? (x.weekAmount / total) * 100 : 0,
      };
    })
    .sort((a, b) => Number(b.weekAmount || 0) - Number(a.weekAmount || 0))
    .slice(0, top);
}

// MARK 6.15: 금주/전주 시트에서 품번별 "실제판매금액 ÷ 실제판매수량 = 실제 평균단가"를 계산해서
// Style_Price_History에 이번 주 스냅샷으로 저장합니다. (parseProducts/aggregateProducts를
// 이미 이 파일이 갖고 있어서, 순환 참조 없이 여기서 계산합니다.)
// MARK 6.16.1: 화요일에 캡처할 때 "금주"(방금 시작한 주, 데이터 거의 없음) 대신
// "전주"(막 끝난, 데이터가 완전한 주)를 사용해야 정확합니다. 그래서 저장하는 주차도
// "이번 주 월요일"이 아니라 "지난 주 월요일"로 기록합니다.
export async function captureWeeklyStylePrices() {
  const dbId = getDbSheetId();
  const titles = await getSpreadsheetTitlesById(dbId);
  const productSheet = pickProductSheet(titles);
  if (!productSheet) return { ok: false, error: "금주/전주 시트를 찾지 못했습니다." };

  const rows = await getSheetValuesById(dbId, productSheet, "A:AZ");
  const productRows = parseProducts(rows);
  const allProducts = aggregateProducts(productRows, undefined, 999999);

  const prices: Record<string, number> = {};
  for (const p of allProducts) {
    if (p.styleCode && Number(p.prevNet || 0) > 0) {
      prices[p.styleCode] = Math.round(Number(p.prevAmount || 0) / Number(p.prevNet || 0));
    }
  }

  const thisMonday = currentWeekMonday();
  const lastMonday = (() => {
    const d = new Date(`${thisMonday}T00:00:00`);
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  return saveWeeklyStylePrices(prices, lastMonday);
}

function mergeStoreRows(currentRows: any[], compareRows: any[], yearRows: any[] = []) {
  const compareMap = new Map(compareRows.map((r: any) => [r.storeName, r]));
  const yearMap = new Map(yearRows.map((r: any) => [r.storeName, r]));

  return currentRows.map((r: any) => {
    const prev: any = compareMap.get(r.storeName) || {};
    const year: any = yearMap.get(r.storeName) || {};

    // Mark4.8 weekly fix:
    // 일부 차주/전주 목표 시트는 주실적 실적칸이 비어 있고 월누계만 들어옵니다.
    // 이때 월누계 전체를 주간매출로 쓰면 전전주+전주가 합산되어 과대계상됩니다.
    // 따라서 현재 월누계 - 비교 월누계를 주간 실적으로 보정합니다.
    const currentRawWeekSales = Number(r.weekSales || 0);
    const prevRawWeekSales = Number(prev.weekSales || 0);
    const currentMonthSales = Number(r.monthSales || 0);
    const prevMonthSales = Number(prev.monthSales || 0);

    const inferredWeekSales =
      !currentRawWeekSales && currentMonthSales && prevMonthSales && currentMonthSales >= prevMonthSales
        ? currentMonthSales - prevMonthSales
        : currentRawWeekSales;

    const inferredPrevWeekSales = prevRawWeekSales || prevMonthSales;

    return {
      ...r,
      weekSales: inferredWeekSales,
      compareDaySales: Number(prev.daySales || 0),
      compareWeekSales: inferredPrevWeekSales,
      compareMonthSales: prevMonthSales,
      prevYearMonthSales: Number(year.monthSales || 0),
      dayChangeRate: rate(Number(r.daySales || 0), Number(prev.daySales || 0)),
      weekChangeRate: rate(inferredWeekSales, inferredPrevWeekSales),
      monthChangeRate: rate(currentMonthSales, prevMonthSales),
      yearMonthChangeRate: rate(currentMonthSales, Number(year.monthSales || 0)),
    };
  });
}



function normalizeSeasonValue(value: any) {
  const s = text(value);
  if (!s || s === "#N/A") return "미지정";
  const compact = s.replace(/\s/g, "");

  // 점포코드/그룹코드처럼 숫자만 있는 값은 시즌이 아닙니다. 예: 21030
  if (/^\d+$/.test(compact)) return "미지정";

  // 정상 시즌 키워드만 통과
  if (
    compact.includes("봄") ||
    compact.includes("여름") ||
    compact.includes("가을") ||
    compact.includes("겨울") ||
    compact.toUpperCase().includes("SS") ||
    compact.toUpperCase().includes("FW") ||
    compact.toUpperCase().includes("SP") ||
    compact.toUpperCase().includes("SU")
  ) {
    return s;
  }

  return "미지정";
}

function seasonBonus(season: string) {
  if (season.includes("여름")) return 35;
  if (season.includes("봄")) return -25;
  if (season.includes("이월")) return 5;
  return 0;
}


function buildPriceSuggestion(tagPrice: number, currentPrice: number, levelColor: string, stockWeeks: number, salesChangeRate: number) {
  const basePrice = currentPrice || tagPrice || 0;
  let discountRate = 0;

  if (levelColor === "red" || stockWeeks >= 20 || salesChangeRate <= -30) discountRate = 20;
  else if (levelColor === "orange" || stockWeeks >= 12 || salesChangeRate <= -20) discountRate = 10;
  else discountRate = 0;

  const promotionPrice = basePrice ? Math.round((basePrice * (100 - discountRate)) / 100 / 100) * 100 : 0;
  return {
    tagPrice: tagPrice || 0,
    currentPrice: currentPrice || 0,
    promotionPrice,
    discountRate,
  };
}

function buildPromotionSuggestions(productRows: any[], inventoryRows: any[], companyTopProducts: any[] = []) {
  const invMap = new Map(inventoryRows.map((r) => [r.styleCode, r]));
  const topProductRankMap = new Map<string, number>();
  companyTopProducts.forEach((p: any, idx: number) => {
    if (p?.styleCode) topProductRankMap.set(p.styleCode, idx + 1);
  });

  const map = new Map<string, any>();

  for (const r of productRows.filter((x) => isOfflineSalesStore(x.storeName))) {
    const season = r.season || "미지정";
    const key = `${season}__${r.styleCode}`;
    if (!map.has(key)) {
      map.set(key, {
        season,
        styleCode: r.styleCode,
        productName: r.productName,
        launchDate: r.launchDate || "",
        launchTime: r.launchTime || 0,
        storeStock: 0,
        weekNet: 0,
        weekAmount: 0,
        prevNet: 0,
        prevAmount: 0,
      });
    }
    const item = map.get(key);
    if (r.launchTime && (!item.launchTime || r.launchTime < item.launchTime)) {
      item.launchTime = r.launchTime;
      item.launchDate = r.launchDate || "";
    }
    item.storeStock += Number(r.storeStock || 0);
    item.weekNet += Number(r.weekNet || 0);
    item.weekAmount += Number(r.weekAmount || 0);
    item.prevNet += Number(r.prevNet || 0);
    item.prevAmount += Number(r.prevAmount || 0);
  }

  const now = new Date();
  const suggestions: any[] = [];
  const suppressedPromotionCandidates: any[] = [];
  const rtSuppressedPromotionCandidates: any[] = [];

  for (const item of map.values()) {
    const inv: any = invMap.get(item.styleCode) || {};
    if (inv.season && (!item.season || item.season === "미지정" || item.season === "#N/A")) item.season = inv.season;
    const onlineStock = Number(inv.onlineStock || 0);
    const warehouseOfflineStock = Number(inv.offlineStock || 0);
    const storeStock = Number(item.storeStock || 0);
    const offlineStock = storeStock + warehouseOfflineStock;
    const totalStock = Number(inv.totalStock || 0) || warehouseOfflineStock + onlineStock + storeStock;

    // 프로모션은 온라인 포함 합산재고가 아니라 오프라인 운영재고와 오프라인 판매추이 기준으로 판단합니다.
    // 오프라인 운영재고 = 매장총재고(금주/전주 시트) + 창고 오프라인 가용재고(온오프재고현황 S열)
    // item.weekNet/weekAmount는 금주/전주 시트의 오프라인 점포 판매를 집계한 값입니다.
    const weekNet = Math.max(0, Number(item.weekNet || 0));
    const prevNet = Math.max(0, Number(item.prevNet || 0));
    const stockWeeks = weekNet > 0 ? offlineStock / weekNet : offlineStock > 0 ? 999 : 0;
    const weeksSinceLaunch = item.launchTime ? (now.getTime() - Number(item.launchTime)) / (1000 * 60 * 60 * 24 * 7) : 0;
    const salesChangeRate = prevNet > 0 ? ((weekNet - prevNet) / prevNet) * 100 : weekNet > 0 ? 100 : 0;
    const amountChangeRate = Number(item.prevAmount || 0) > 0 ? ((item.weekAmount - item.prevAmount) / item.prevAmount) * 100 : Number(item.weekAmount || 0) > 0 ? 100 : 0;
    const companyRank = topProductRankMap.get(item.styleCode) || 9999;

    // 프로모션 보호 필터 V2
    // 잘 팔리는 상품은 프로모션 제안에서 제외하고 정가 판매를 우선합니다.
    const protectReasons = [
      companyRank <= 50 ? `전사 판매 TOP${companyRank}` : "",
      salesChangeRate >= 20 ? `전주 대비 판매 +${salesChangeRate.toFixed(1)}%` : "",
    ].filter(Boolean);

    if (protectReasons.length) {
      // MARK 6.46: 호조상품(TOP/판매상승)은 소진용 할인이 아니라 "매출 드라이빙"용 가벼운
      // 세트/번들 프로모션을 제안합니다. 재고가 얇으면 아예 프로모션 없이 정가 유지를 권장합니다.
      const salesDrivingEligible = offlineStock >= 15;
      const drivingDiscountRate = salesDrivingEligible ? (companyRank <= 20 ? 5 : 10) : 0;
      const drivingBasePrice = Number(inv.currentPrice || 0) || Number(inv.tagPrice || 0) || 0;
      const drivingPromotionPrice = drivingBasePrice ? Math.round((drivingBasePrice * (100 - drivingDiscountRate)) / 100 / 100) * 100 : 0;

      suppressedPromotionCandidates.push({
        ...item,
        onlineStock,
        warehouseOfflineStock,
        storeStock,
        offlineStock,
        totalStock,
        companyRank,
        stockWeeks,
        salesChangeRate,
        amountChangeRate,
        suppressedReason: protectReasons.join(" / "),
        action: salesDrivingEligible ? "세트/번들 매출드라이빙 프로모션 검토" : "정가 판매 유지 (재고 부족)",
        tagPrice: Number(inv.tagPrice || 0),
        currentPrice: drivingBasePrice,
        promotionPrice: drivingPromotionPrice,
        discountRate: drivingDiscountRate,
      });
      continue;
    }

    let score = 0;
    score += seasonBonus(item.season);
    score += Math.min(45, Math.max(0, weeksSinceLaunch - 2) * 3);
    score += Math.min(70, stockWeeks >= 999 ? 70 : stockWeeks * 3);

    // 오프라인 운영재고 기준 가중치
    if (offlineStock >= 30) score += 8;
    if (offlineStock >= 80) score += 8;
    if (offlineStock >= 150) score += 10;
    if (offlineStock >= 300) score += 12;

    // 오프라인 판매 둔화 기준 가중치
    if (salesChangeRate <= 0) score += 10;
    if (salesChangeRate <= -10) score += 10;
    if (salesChangeRate <= -20) score += 10;
    if (weekNet <= 2 && offlineStock >= 50) score += 12;

    // 오프라인 재고가 적으면 프로모션 후보에서 제외합니다.
    if (offlineStock < 20) continue;
    if (!(stockWeeks >= 5 || offlineStock >= 80 || salesChangeRate <= 0)) continue;

    const rtSuppressedPromo = salesChangeRate <= -25 && offlineStock >= 200;

    let action = "노출/진열 강화";
    let promotionLevel = "관찰";
    let levelColor = "yellow";

    if (rtSuppressedPromo) {
      action = salesChangeRate <= -40 ? "직접 가격 할인 검토" : "번들/채널 이벤트 검토";
      promotionLevel = "RT 억제 → 프로모션 검토";
      levelColor = salesChangeRate <= -40 ? "red" : "orange";
    } else if (stockWeeks >= 20) {
      action = "세트/쿠폰 프로모션 검토";
      promotionLevel = "즉시 프로모션 검토";
      levelColor = "red";
    } else if (stockWeeks >= 12 || salesChangeRate <= -20) {
      action = "10% 프로모션 검토";
      promotionLevel = "프로모션 검토";
      levelColor = "orange";
    } else if (String(item.season).includes("여름")) {
      action = "노출/진열 강화 및 반응 체크";
      promotionLevel = "여름상품 관찰";
      levelColor = "yellow";
    }

    const priceSuggestion = buildPriceSuggestion(Number(inv.tagPrice || 0), Number(inv.currentPrice || 0), levelColor, stockWeeks, salesChangeRate);

    suggestions.push({
      ...item,
      onlineStock,
      warehouseOfflineStock,
      storeStock,
      offlineStock,
      totalStock,
      promotionStockBasis: "store+warehouse_offline",
      promotionSalesBasis: "offline",
      tagPrice: priceSuggestion.tagPrice,
      currentPrice: priceSuggestion.currentPrice,
      promotionPrice: priceSuggestion.promotionPrice,
      discountRate: priceSuggestion.discountRate,
      weeksSinceLaunch,
      stockWeeks,
      salesChangeRate,
      amountChangeRate,
      companyRank,
      rtSuppressedPromo,
      promotionScore: score,
      promotionLevel,
      levelColor,
      action,
      reasons: [
        `최초 출고 후 ${weeksSinceLaunch.toFixed(1)}주 경과`,
        `오프라인 운영재고 ${Math.round(offlineStock).toLocaleString("ko-KR")}개 = 매장 ${Math.round(storeStock).toLocaleString("ko-KR")}개 + 창고오프 ${Math.round(warehouseOfflineStock).toLocaleString("ko-KR")}개`,
        stockWeeks >= 999 ? "오프라인 주간 판매 없음" : `오프라인 운영재고주수 ${stockWeeks.toFixed(1)}주`,
        `전주 대비 판매수량 ${salesChangeRate >= 0 ? "+" : ""}${salesChangeRate.toFixed(1)}%`,
        `시즌 ${item.season}`,
        rtSuppressedPromo ? `RT 억제 전환 후보: 전주 대비 ${salesChangeRate.toFixed(1)}%, 오프라인 운영재고 ${Math.round(offlineStock).toLocaleString("ko-KR")}개` : "",
      ].filter(Boolean),
    });

    if (rtSuppressedPromo) {
      rtSuppressedPromotionCandidates.push({
        ...item,
        companyRank,
        offlineStock,
        stockWeeks,
        salesChangeRate,
        action,
        promotionLevel,
      });
    }
  }

  const seasons = [...new Set(
    suggestions
      .map((x: any) => normalizeSeasonValue(x.season))
      .filter((x: string) => x && x !== "미지정")
  )].sort();
  return {
    promotionSeasons: ["전체", ...seasons],
    promotionSuggestions: suggestions.sort((a, b) => Number(b.promotionScore || 0) - Number(a.promotionScore || 0)),
    suppressedPromotionCandidates: suppressedPromotionCandidates.sort((a, b) => (a.companyRank || 9999) - (b.companyRank || 9999)).slice(0, 20),
    rtSuppressedPromotionCandidates: rtSuppressedPromotionCandidates.sort((a, b) => Number(a.salesChangeRate || 0) - Number(b.salesChangeRate || 0)).slice(0, 20),
  };
}


function buildProductAnalysisList(productRows: any[], inventoryRows: any[]) {
  const invMap = new Map(inventoryRows.map((r) => [r.styleCode, r]));
  const map = new Map<string, any>();

  for (const r of productRows.filter((x) => isOfflineSalesStore(x.storeName))) {
    const key = r.styleCode;
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        season: normalizeSeasonValue(r.season || "미지정"),
        styleCode: r.styleCode,
        productName: r.productName,
        launchDate: r.launchDate || "",
        launchTime: r.launchTime || 0,
        storeStock: 0,
        weekNet: 0,
        weekAmount: 0,
        prevNet: 0,
        prevAmount: 0,
        stores: [] as any[],
      });
    }
    const item = map.get(key);
    if (r.launchTime && (!item.launchTime || r.launchTime < item.launchTime)) {
      item.launchTime = r.launchTime;
      item.launchDate = r.launchDate || "";
    }
    item.storeStock += Number(r.storeStock || 0);
    item.weekNet += Number(r.weekNet || 0);
    item.weekAmount += Number(r.weekAmount || 0);
    item.prevNet += Number(r.prevNet || 0);
    item.prevAmount += Number(r.prevAmount || 0);
    item.stores.push({
      storeName: r.storeName,
      storeStock: Number(r.storeStock || 0),
      weekNet: Number(r.weekNet || 0),
      weekAmount: Number(r.weekAmount || 0),
    });
  }

  const now = new Date();
  return [...map.values()].map((item: any) => {
    const inv: any = invMap.get(item.styleCode) || {};
    if (inv.season && (!item.season || item.season === "미지정" || item.season === "#N/A")) item.season = inv.season;
    const onlineStock = Number(inv.onlineStock || 0);
    const offlineStock = Number(inv.offlineStock || 0);
    const totalStock = Number(inv.totalStock || 0) || item.storeStock + onlineStock;
    const weekNet = Math.max(0, Number(item.weekNet || 0));
    const prevNet = Math.max(0, Number(item.prevNet || 0));
    const stockWeeks = weekNet > 0 ? totalStock / weekNet : totalStock > 0 ? 999 : 0;
    const weeksSinceLaunch = item.launchTime ? (now.getTime() - Number(item.launchTime)) / (1000 * 60 * 60 * 24 * 7) : 0;
    const salesChangeRate = prevNet > 0 ? ((weekNet - prevNet) / prevNet) * 100 : 0;
    const amountChangeRate = Number(item.prevAmount || 0) > 0 ? ((item.weekAmount - item.prevAmount) / item.prevAmount) * 100 : 0;

    let levelColor = "yellow";
    let promotionLevel = "정상/관찰";
    let action = "가격 유지 + 노출 반응 체크";

    if (stockWeeks >= 20 || salesChangeRate <= -30) {
      levelColor = "red";
      promotionLevel = "부진/즉시 가격조정 검토";
      action = "20% 가격조정 또는 세트/쿠폰 검토";
    } else if (stockWeeks >= 12 || salesChangeRate <= -20) {
      levelColor = "orange";
      promotionLevel = "프로모션 검토";
      action = "10% 가격조정 검토";
    } else if (stockWeeks >= 8 || salesChangeRate < 0) {
      promotionLevel = "관찰";
      action = "노출/진열 강화 후 1~2주 반응 체크";
    }

    const priceSuggestion = buildPriceSuggestion(Number(inv.tagPrice || 0), Number(inv.currentPrice || 0), levelColor, stockWeeks, salesChangeRate);
    const topStores = [...item.stores].sort((a: any, b: any) => b.weekAmount - a.weekAmount).slice(0, 5);
    const riskyStores = [...item.stores]
      .map((s: any) => ({
        ...s,
        stockWeeks: Number(s.weekNet || 0) > 0 ? Number(s.storeStock || 0) / Number(s.weekNet || 0) : Number(s.storeStock || 0) > 0 ? 999 : 0,
      }))
      .sort((a: any, b: any) => a.stockWeeks - b.stockWeeks)
      .slice(0, 5);

    return {
      ...item,
      ...priceSuggestion,
      onlineStock,
      offlineStock,
      totalStock,
      stockWeeks,
      weeksSinceLaunch,
      salesChangeRate,
      amountChangeRate,
      promotionLevel,
      levelColor,
      action,
      topStores,
      riskyStores,
      aiReview: `${item.productName}은 출고 후 ${weeksSinceLaunch.toFixed(1)}주 경과, 전주 대비 판매수량 ${salesChangeRate >= 0 ? "+" : ""}${salesChangeRate.toFixed(1)}%, 오프라인 재고 ${Math.round(totalStock).toLocaleString("ko-KR")}개, 재고주수 ${stockWeeks >= 999 ? "판매없음" : `${stockWeeks.toFixed(1)}주`}입니다. ${action}가 적절합니다.`,
    };
  });
}


function buildOnlineTransferSuggestions(offlineRows: any[], onlineRows: any[], inventoryRows: any[]) {
  const invMap = new Map(inventoryRows.map((r: any) => [r.styleCode, r]));
  const offlineAgg = aggregateProducts(offlineRows, undefined, 9999);
  const onlineAgg = aggregateProducts(onlineRows, undefined, 9999);
  const onlineSalesMap = new Map(onlineAgg.map((r: any) => [r.styleCode, r]));

  return offlineAgg
    .map((item: any) => {
      const inv: any = invMap.get(item.styleCode) || {};
      const onlineSales: any = onlineSalesMap.get(item.styleCode) || {};
      const offlineStock = Number(inv.offlineStock || 0);
      const onlineStock = Number(inv.onlineStock || 0);
      const weekNet = Math.max(0, Number(item.weekNet || 0));
      const prevNet = Math.max(0, Number(item.prevNet || 0));
      const offlineWeeks = weekNet > 0 ? offlineStock / weekNet : offlineStock > 0 ? 999 : 0;
      const onlineRatio = offlineStock > 0 ? onlineStock / offlineStock : onlineStock > 0 ? 999 : 0;
      const salesChangeRate = prevNet > 0 ? rate(weekNet, prevNet) : weekNet > 0 ? 100 : 0;
      const needQty = Math.max(0, Math.ceil(weekNet * 3 - offlineStock));
      const suggestQty = Math.max(0, Math.min(onlineStock, needQty || Math.ceil(weekNet * 2)));

      let score = 0;
      if (offlineWeeks <= 2 && weekNet > 0) score += 40;
      if (onlineStock >= 50) score += 15;
      if (onlineStock >= 200) score += 15;
      if (onlineRatio >= 2) score += 15;
      if (salesChangeRate >= 20) score += 10;
      if (suggestQty > 0) score += 10;

      return {
        ...item,
        onlineWeekNet: Number(onlineSales.weekNet || 0),
        onlineWeekAmount: Number(onlineSales.weekAmount || 0),
        offlineStock,
        onlineStock,
        offlineWeeks,
        onlineRatio,
        salesChangeRate,
        suggestQty,
        transferScore: score,
        reason: [
          `오프라인 주간판매 ${Math.round(weekNet).toLocaleString("ko-KR")}개 / 재고주수 ${offlineWeeks >= 999 ? "판매없음" : `${offlineWeeks.toFixed(1)}주`}`,
          `온라인 가용재고 ${Math.round(onlineStock).toLocaleString("ko-KR")}개 / 오프라인 가용재고 ${Math.round(offlineStock).toLocaleString("ko-KR")}개`,
          `온라인 재고 비율 ${onlineRatio >= 999 ? "오프라인 재고 없음" : `${onlineRatio.toFixed(1)}배`}`,
          `추천 이관수량 ${Math.round(suggestQty).toLocaleString("ko-KR")}개`,
        ].join("\\n"),
      };
    })
    .filter((item: any) =>
      Number(item.suggestQty || 0) > 0 &&
      Number(item.onlineStock || 0) >= 20 &&
      Number(item.weekNet || 0) > 0 &&
      (Number(item.offlineWeeks || 0) <= 3 || Number(item.onlineRatio || 0) >= 2)
    )
    .sort((a: any, b: any) => Number(b.transferScore || 0) - Number(a.transferScore || 0))
    .slice(0, 10);
}


// MARK 2026-09-17: "RT 제안은 품번 단위인데, 실제 지시서(RT_Result)는 컬러/사이즈로 쪼개서
// 나간다" 개선 — 지금까지는 승인 시점에 출고점이 "갖고 있는 재고 비율"대로만 컬러/사이즈를
// 나눴어서(allocateByStock), 받는점포가 실제로 어떤 사이즈가 부족한지는 전혀 반영이 안
// 됐습니다(예: 출고점에 비인기 사이즈가 많으면 그 사이즈 위주로 채워짐). 제안을 만드는 이
// 단계에서 받는점포의 사이즈(컬러+사이즈)별 목표재고 대비 부족량을 같이 계산해서
// suggestQty와 함께 실어두고, 승인 시(app/api/rt-result/route.ts)에는 이 값으로 실제
// 출고점 재고를 "부족한 사이즈 우선"으로 나누도록 합니다. skuRows(컬러+사이즈별 재고/판매)는
// buildProductRowsFromDailyHistory가 이미 만들어서 각 점포×품번 row에 갖고 있습니다.
function computeSkuNeedWeights(receiverSkuRows: any[], targetWeeks: number) {
  return (receiverSkuRows || [])
    .filter((s: any) => s.color && s.size)
    .map((s: any) => {
      const stock = Math.max(0, Number(s.stock || 0));
      const weekNet = Math.max(0, Number(s.weekNet || 0));
      // 그 사이즈가 이번 기간 판매가 없으면(weekNet=0) 목표재고를 0으로 둬서 "부족 없음"으로
      // 봅니다 — 안 팔리는 사이즈까지 부족으로 잡아 억지로 채우지 않기 위함입니다.
      const targetStock = weekNet > 0 ? Math.ceil(weekNet * targetWeeks) : 0;
      const need = Math.max(0, targetStock - stock);
      return { color: s.color, colorName: s.colorName || "", size: s.size, stock, weekNet, targetStock, need };
    });
}

function summarizeSkuNeeds(weights: any[], limit = 3) {
  const withNeed = weights.filter((w) => w.need > 0).sort((a, b) => b.need - a.need);
  if (!withNeed.length) return "";
  const parts = withNeed.slice(0, limit).map((w) => `${w.size}${w.colorName ? `(${w.colorName})` : ""} ${Math.round(w.need).toLocaleString("ko-KR")}장`);
  const rest = withNeed.length > limit ? ` 외 ${withNeed.length - limit}건` : "";
  return `사이즈별로 보면 ${parts.join(", ")}${rest} 부족합니다.`;
}

async function buildInventory(
  productRows: any[],
  inventoryRows: any[],
  companyTopProducts: any[],
  storeStockSnapshot?: { rows: StoreStockSnapshotRow[]; meta: any } | null
) {
  const promotion = buildPromotionSuggestions(productRows, inventoryRows, companyTopProducts);
  const productAnalysisList = buildProductAnalysisList(productRows, inventoryRows);
  const coreProducts = productRows.filter((r) => isCoreOfflineSalesStore(r.storeName));
  const onlineProducts = productRows.filter((r) => isOnlineChannel(r.storeName));
  const consignmentProducts = productRows.filter((r) => isOfflineSalesStore(r.storeName) && isConsignmentChannel(r.storeName));
  const invMap = new Map(inventoryRows.map((r) => [r.styleCode, r]));
  const allProducts = aggregateProducts(coreProducts, undefined, 9999);

  const stockoutRisk: any[] = [];
  const overstockRisk: any[] = [];
  const allocationSuggestions: any[] = [];
  const onlineTransferSuggestions = buildOnlineTransferSuggestions(coreProducts, onlineProducts, inventoryRows);

  for (const p of allProducts) {
    const inv: any = invMap.get(p.styleCode);
    if (!inv) continue;
    const weekNet = Math.max(0, Number(p.weekNet || 0));
    const offlineStock = Number(inv.offlineStock || 0);
    const onlineStock = Number(inv.onlineStock || 0);
    const offlineWeeks = weekNet > 0 ? offlineStock / weekNet : offlineStock > 0 ? 999 : 0;
    const item = { ...p, ...inv, storeStock: offlineStock, offlineWeeks };

    if (weekNet > 0 && offlineWeeks <= 2) {
      stockoutRisk.push(item);
      const need = Math.max(0, Math.round(weekNet * 3 - offlineStock));
      const qty = Math.min(need, Math.max(0, Math.round(onlineStock)));
      if (qty > 0) {
        allocationSuggestions.push({
          ...item,
          suggestQty: qty,
          reason: `점포 재고주수 ${offlineWeeks.toFixed(1)}주 / 온라인 가용 ${Math.round(onlineStock).toLocaleString("ko-KR")}개`,
        });
      }
    }

    if (offlineStock > 0 && (weekNet === 0 || offlineWeeks >= 8)) {
      overstockRisk.push(item);
    }
  }

  // RT Smart Transfer Engine V2
  // 목적: 단순 재고 이동이 아니라 "판매 전환 가능성이 높은 점포"로 재고를 이동합니다.
  // 핵심 가중치: 상품 판매력 70% + 재고 부족도 20% + 점포 매출력 10%
  // MARK 6.5: RT 대상 품번을 전사 판매순위 TOP 20으로 고정합니다 (기존 TOP 50 → TOP 20).
  const RT_ELIGIBLE_RANK = 20;
  // MARK 6.7: 호조상품 RT의 입고점 목표재고를 2주 → 3주로 늘립니다.
  // (시뮬레이션 결과 이 값이 이동물량을 가장 크게 좌우하는 레버였습니다.)
  const RT_TARGET_STOCK_WEEKS = 3;
  // MARK 2026-09-17: "판매가 사실상 없는 매장은 안전재고 없이 전량 이동" — 안전재고는
  // 원래 "앞으로도 팔릴 것"을 전제로 품절 방지용으로 남겨두는 완충재고인데, 최근 2주
  // (금주+전주) 합산 판매가 사실상 없으면 지킬 판매 자체가 없어서 의미가 없습니다. 재고도
  // 소량일 때만(대량 재고는 별도 검토가 필요하므로 자동으로 전량 이동시키지 않음) 적용하고,
  // 우수매장/플래그십은 구색 유지가 필요할 수 있어 예외로 항상 안전재고를 남깁니다.
  const RT_FULL_CLEAR_RECENT_SALES_MAX = 1; // 최근 2주 합산 판매가 이 이하
  const RT_FULL_CLEAR_STOCK_CAP = 5; // 재고가 이 이하일 때만 전량이동 후보
  const byStyle = new Map<string, any[]>();
  const storeAmountMap = new Map<string, number>();

  for (const r of coreProducts) {
    const storeName = r.storeName;
    const amount = Number(r.weekAmount || 0);
    storeAmountMap.set(storeName, Number(storeAmountMap.get(storeName) || 0) + amount);

    if (!byStyle.has(r.styleCode)) byStyle.set(r.styleCode, []);
    byStyle.get(r.styleCode)!.push(r);
  }

  // MARK 2026-09-21: "호조/부진 RT도 점포요청 RT처럼 PIP 재고를 쓰는 게 낫지 않겠냐" — 맞는
  // 지적이라 반영합니다. Daily_Sales_History만으로는 "이 상품을 최근에 한 번도 안 판 매장"은
  // 행 자체가 없어서(위 byStyle 그룹에 아예 안 잡히고, 심하면 rows.length<2에 걸려 그 품번
  // 전체가 RT 후보에서 통째로 빠지기도 함) 재고가 있어도 이동 후보로 안 보였습니다. byStyle에
  // 만 국한해서(= RT 제안에만 영향, 프로모션/재고위험 등 다른 섹션은 그대로) 다음을 합니다:
  // (1) 이미 있는 행은 재고를 PIP 값으로 덮어쓰고(판매 추이는 여전히 Daily_Sales_History 사용),
  // (2) PIP엔 재고가 있는데 행 자체가 없던 매장은 판매 0인 행을 추가해 출고 후보로는 잡히게
  // 합니다(입고 후보/부진 받는점포는 둘 다 weekNet>0을 요구해서 자동으로 걸러짐 — 안 팔리는
  // 매장이 받는 쪽으로 잘못 뽑힐 위험은 없음). 원본 coreProducts/productRows 배열의 행 객체는
  // 건드리지 않고, byStyle이 들고 있는 배열/항목만 복제해서 바꿔치기하므로 다른 섹션(프로모션
  // 제안, 재고위험 리스트 등)에는 영향이 없습니다.
  if (storeStockSnapshot?.rows?.length) {
    const pipByStyle = new Map<string, StoreStockSnapshotRow[]>();
    for (const r of storeStockSnapshot.rows) {
      const key = r.styleCode.toUpperCase();
      if (!pipByStyle.has(key)) pipByStyle.set(key, []);
      pipByStyle.get(key)!.push(r);
    }

    for (const [styleCode, rows] of byStyle.entries()) {
      const pipRows = pipByStyle.get(styleCode.toUpperCase());
      if (!pipRows || !pipRows.length) continue;

      const pipStoreTotals = new Map<string, number>();
      const pipStoreDisplayName = new Map<string, string>();
      for (const r of pipRows) {
        const key = normalizeStoreKey(r.storeName);
        pipStoreTotals.set(key, (pipStoreTotals.get(key) || 0) + r.stock);
        if (!pipStoreDisplayName.has(key)) pipStoreDisplayName.set(key, r.storeName);
      }

      const seenStoreKeys = new Set<string>();
      for (let i = 0; i < rows.length; i++) {
        const key = normalizeStoreKey(rows[i].storeName);
        seenStoreKeys.add(key);
        if (pipStoreTotals.has(key)) {
          rows[i] = { ...rows[i], storeStock: pipStoreTotals.get(key) };
        }
      }

      const sample = rows[0];
      for (const [storeKey, stock] of pipStoreTotals.entries()) {
        if (seenStoreKeys.has(storeKey)) continue;
        const storeName = pipStoreDisplayName.get(storeKey) || storeKey;
        if (!isCoreOfflineSalesStore(storeName)) continue;
        rows.push({
          styleCode,
          storeName,
          productName: sample?.productName || pipRows[0]?.productName || "",
          weekNet: 0,
          prevNet: 0,
          weekAmount: 0,
          storeStock: stock,
          launchTime: sample?.launchTime || 0,
          skuRows: [],
        });
      }
    }
  }

  const maxStoreAmount = Math.max(1, ...Array.from(storeAmountMap.values()));
  const topProductRankMap = new Map<string, number>();
  companyTopProducts.forEach((p: any, idx: number) => {
    if (p?.styleCode) topProductRankMap.set(p.styleCode, idx + 1);
  });

  const rtSuggestions: any[] = [];

  for (const [styleCode, rows] of byStyle.entries()) {
    if (rows.length < 2) continue;

    // 전사 판매 상위 상품을 우선 대상으로 봅니다.
    // 단, top 리스트가 비어있으면 기존 데이터 전체를 대상으로 동작합니다.
    const companyRank = topProductRankMap.get(styleCode) || 9999;
    const isCompanyTopProduct = companyTopProducts.length ? companyRank <= RT_ELIGIBLE_RANK : true;
    if (!isCompanyTopProduct) continue;

    const maxStyleWeekNet = Math.max(1, ...rows.map((r: any) => Number(r.weekNet || 0)));
    const maxStyleWeekAmount = Math.max(1, ...rows.map((r: any) => Number(r.weekAmount || 0)));

    const enriched = rows.map((r) => {
      const weekNet = Number(r.weekNet || 0);
      const prevNet = Number(r.prevNet || 0);
      const weekAmount = Number(r.weekAmount || 0);
      const stock = Number(r.storeStock || 0);
      const stockWeeks = weekNet > 0 ? stock / weekNet : stock > 0 ? 999 : 0;
      const salesChangeRate = rate(weekNet, prevNet);
      const isNewProduct = weeksSince(Number(r.launchTime || 0)) <= 4;
      const priorityStore = isPriorityStore(r.storeName);

      let productPowerScore = Math.min(
        100,
        ((weekNet / maxStyleWeekNet) * 75) + ((weekAmount / maxStyleWeekAmount) * 25)
      );

      // MARK 4.74: Agent 제안 반영
      // - 신상품 4주 이내 + 판매 발생 시 판매력 가중
      // - 판매 급락 상품은 RT Score 감점
      if (isNewProduct && weekNet > 0) productPowerScore = Math.min(100, productPowerScore * 1.2);
      if (prevNet > 0 && salesChangeRate <= -25) productPowerScore = Math.max(0, productPowerScore - 20);

      const storePowerScore = Math.min(
        100,
        (Number(storeAmountMap.get(r.storeName) || 0) / maxStoreAmount) * 100
      );

      const targetStock = Math.max(1, Math.ceil(weekNet * RT_TARGET_STOCK_WEEKS));
      const shortageScore = weekNet > 0
        ? Math.max(0, Math.min(100, (1 - stock / targetStock) * 100))
        : 0;

      let rtScore = (productPowerScore * 0.7) + (shortageScore * 0.2) + (storePowerScore * 0.1);
      if (priorityStore && companyRank <= 30 && weekNet > 0 && stock <= 0) rtScore += 15;
      if (prevNet > 0 && salesChangeRate <= -40) rtScore -= 10;
      rtScore = Math.max(0, Math.min(100, rtScore));

      const isFullClearCandidate =
        !priorityStore &&
        (weekNet + prevNet) <= RT_FULL_CLEAR_RECENT_SALES_MAX &&
        stock <= RT_FULL_CLEAR_STOCK_CAP;
      const senderSafeStock = isFullClearCandidate
        ? 0
        : Math.max(3, Math.ceil(targetStock), Math.ceil(weekNet * 2));

      return {
        ...r,
        stock,
        stockWeeks,
        targetStock,
        productPowerScore,
        shortageScore,
        storePowerScore,
        rtScore,
        salesChangeRate,
        isNewProduct,
        priorityStore,
        isFullClearCandidate,
        senderSafeStock,
        transferableQty: Math.max(0, Math.floor(stock - senderSafeStock)),
      };
    });

    // 입고점: 해당 상품 판매력이 있고, 재고가 부족한 점포.
    const receivers = enriched
      .filter((r) => Number(r.weekNet || 0) > 0)
      .filter((r) => !(Number(r.prevNet || 0) > 0 && Number(r.salesChangeRate || 0) <= -50))
      .filter((r) => r.stock < r.targetStock || r.stockWeeks <= 2)
      .sort((a, b) => b.rtScore - a.rtScore);

    // 출고점: 안전재고를 남기고도 이동 가능한 점포.
    // MARK 4.90 RT 2.0
    // - 특정 점포 재고를 전량에 가깝게 털지 않도록 안전재고를 강화합니다.
    // - 안전재고 = max(3장, 목표재고, 최근 주간판매 × 2주)
    // - 한 점포가 부족수량 전체를 부담하지 않도록 다중 출고점으로 분산합니다.
    const senderPool = enriched
      .filter((r) => r.stock > 0)
      .filter((r) => Number(r.transferableQty || 0) > 0);

    const hasNonPrioritySender = senderPool.some((r) => !r.priorityStore);
    const senders = senderPool
      .filter((r) => hasNonPrioritySender ? !r.priorityStore : true)
      .sort((a, b) => {
        const aOver = Number(a.transferableQty || 0) / Math.max(1, a.stock);
        const bOver = Number(b.transferableQty || 0) / Math.max(1, b.stock);
        return bOver - aOver || a.productPowerScore - b.productPowerScore;
      });

    if (!receivers.length || !senders.length) continue;

    const remainingTransferable = new Map<string, number>();
    for (const sender of senders) {
      remainingTransferable.set(sender.storeName, Number(sender.transferableQty || 0));
    }

    for (const to of receivers.slice(0, 5)) {
      const toNeed = Math.max(0, Math.ceil(to.targetStock - to.stock));
      const twoWeekCap = Math.max(1, Math.ceil(to.weekNet * RT_TARGET_STOCK_WEEKS));
      let remainingNeed = Math.max(0, Math.min(toNeed, twoWeekCap));
      if (!remainingNeed) continue;

      for (const from of senders) {
        if (remainingNeed <= 0) break;
        if (normalizeStoreKey(from.storeName) === normalizeStoreKey(to.storeName)) continue;

        const available = Math.max(0, Math.floor(Number(remainingTransferable.get(from.storeName) || 0)));
        if (!available) continue;

        // 한 점포가 한 번에 너무 많이 부담하지 않도록 출고 가능량의 60%까지만 우선 제안합니다.
        // 단, 최소 1장은 이동 가능하도록 보정합니다.
        const senderShareCap = Math.max(1, Math.ceil(available * 0.6));
        const suggestQty = Math.max(0, Math.min(remainingNeed, available, senderShareCap));
        if (!suggestQty || suggestQty <= 0) continue;

        remainingTransferable.set(from.storeName, available - suggestQty);
        remainingNeed -= suggestQty;

        const toAfterWeeks = to.weekNet > 0 ? (to.stock + (toNeed - remainingNeed)) / to.weekNet : 999;
        const fromAfterStock = Math.max(0, from.stock - suggestQty);
        const fromAfterWeeks = from.weekNet > 0 ? fromAfterStock / from.weekNet : 999;
        const stockoutDays = to.stockWeeks * 7;
        const fromSafeStock = Number(from.senderSafeStock || 0);
        const fromAllow = Number(from.transferableQty || 0);

        const priority =
          to.priorityStore && companyRank <= 30 && to.stock <= 0 ? "A" :
          to.rtScore >= 80 && companyRank <= 20 ? "A" :
          to.rtScore >= 65 && companyRank <= 50 ? "B" :
          "C";

        const skuNeedWeights = computeSkuNeedWeights(to.skuRows, RT_TARGET_STOCK_WEEKS);
        const skuNeedSummary = summarizeSkuNeeds(skuNeedWeights);

        rtSuggestions.push({
          moveType: "호조",
          styleCode,
          productName: to.productName,
          fromStore: from.storeName,
          toStore: to.storeName,
          fromStock: from.stock,
          fromStockWeeks: from.stockWeeks,
          fromAfterWeeks,
          toStock: to.stock,
          toStockWeeks: to.stockWeeks,
          toAfterWeeks,
          suggestQty,
          priority,
          stockoutDays,
          weekAmount: to.weekAmount,
          rtScore: Number(to.rtScore.toFixed(1)),
          productPowerScore: Number(to.productPowerScore.toFixed(1)),
          shortageScore: Number(to.shortageScore.toFixed(1)),
          storePowerScore: Number(to.storePowerScore.toFixed(1)),
          companyRank,
          salesChangeRate: Number(to.salesChangeRate.toFixed(1)),
          isNewProduct: to.isNewProduct,
          priorityStore: to.priorityStore,
          fromFullClear: !!from.isFullClearCandidate,
          // MARK 2026-09-17: 승인 시(rt-result/route.ts)에 출고점 재고를 컬러/사이즈로 나눌 때
          // 이 값을 우선 씁니다 — 받는점포가 실제로 부족한 사이즈 비중대로 배분됩니다.
          skuNeedWeights,
          reason: [
            `전사 판매순위 ${companyRank === 9999 ? "권외" : `${companyRank}위`} 상품입니다.`,
            `${to.storeName}은 금주 판매 ${Math.round(to.weekNet || 0).toLocaleString("ko-KR")}개, 금주매출 ${Math.round(to.weekAmount || 0).toLocaleString("ko-KR")}원 기준으로 상품판매력 ${to.productPowerScore.toFixed(1)}점입니다.`,
            `현재 ${to.storeName} 재고는 ${Math.round(to.stock).toLocaleString("ko-KR")}개, 재고주수 ${to.stockWeeks >= 999 ? "판매없음" : `${to.stockWeeks.toFixed(1)}주`}로 목표재고 ${Math.round(to.targetStock).toLocaleString("ko-KR")}개 대비 부족하여 재고부족도 ${to.shortageScore.toFixed(1)}점으로 계산되었습니다.`,
            skuNeedSummary,
            from.isFullClearCandidate
              ? `${from.storeName}은 이 상품 최근 2주 판매가 합산 ${Math.round(Number(from.weekNet || 0) + Number(from.prevNet || 0))}개로 사실상 없고 재고도 ${Math.round(from.stock).toLocaleString("ko-KR")}개로 소량이라, 안전재고 없이 전량(최대 ${Math.round(fromAllow).toLocaleString("ko-KR")}개) 이동 후보로 계산했습니다. 이번 제안은 ${Math.round(suggestQty).toLocaleString("ko-KR")}개입니다.`
              : `${from.storeName}은 현재 재고 ${Math.round(from.stock).toLocaleString("ko-KR")}개 중 안전재고 ${Math.round(fromSafeStock).toLocaleString("ko-KR")}개를 남기고 최대 ${Math.round(fromAllow).toLocaleString("ko-KR")}개까지 출고 가능하며, 이번 제안은 ${Math.round(suggestQty).toLocaleString("ko-KR")}개입니다.`,
            `동일 상품 부족수량은 여러 출고점으로 분산 보충하도록 계산하여 특정 점포 재고를 전량 이동하지 않도록 했습니다.`,
            to.isNewProduct ? "신상품 4주 이내 판매 발생 상품으로 판매력 가중치가 반영되었습니다." : "",
            to.priorityStore && to.stock <= 0 ? "우수매장/플래그십 결품 상태라 판매기회 손실 방지를 위해 우선순위가 상승했습니다." : "",
            `RT Score ${to.rtScore.toFixed(1)}점 = 상품판매력 70% + 재고부족도 20% + 점포매출력 10% 기준입니다.`,
          ].filter(Boolean).join("\n"),
        });
      }
    }
  }

  // MARK 6.7: 부진상품(TOP20 밖) 리밸런싱 엔진 — 신규.
  // 목적: 과잉재고(잘 안 팔리는데 재고만 쌓인) 매장 → 그 상품 기준 상대적으로 잘 나가는 매장으로 이동.
  // 호조 엔진과 반대 방향: 호조는 "재고주수를 늘려주는" 쪽, 부진은 "재고주수를 줄여주는" 쪽입니다.
  const RT_UNDERPERFORM_SENDER_STOCK_WEEKS_MIN = 8;
  const RT_UNDERPERFORM_SENDER_KEEP_UNITS = 2;
  const RT_UNDERPERFORM_RECEIVER_PERCENTILE = 0.33;
  const RT_UNDERPERFORM_FILL_TARGET_WEEKS = 3;

  if (companyTopProducts.length) {
    for (const [styleCode, rows] of byStyle.entries()) {
      if (rows.length < 2) continue;
      const companyRank = topProductRankMap.get(styleCode) || 9999;
      if (companyRank <= RT_ELIGIBLE_RANK) continue; // 호조상품(TOP20)은 위 엔진에서 이미 처리

      const rowsEnriched = rows.map((r: any) => {
        const weekNet = Number(r.weekNet || 0);
        const prevNet = Number(r.prevNet || 0);
        const stock = Number(r.storeStock || 0);
        const stockWeeks = weekNet > 0 ? stock / weekNet : stock > 0 ? 999 : 0;
        const priorityStore = isPriorityStore(r.storeName);
        // 위 호조 엔진과 같은 기준(RT_FULL_CLEAR_RECENT_SALES_MAX/RT_FULL_CLEAR_STOCK_CAP) —
        // 최근 2주 판매가 사실상 없고 재고도 소량이면 최소 보유수량 없이 전량 이동 후보입니다.
        const isFullClearCandidate =
          !priorityStore &&
          (weekNet + prevNet) <= RT_FULL_CLEAR_RECENT_SALES_MAX &&
          stock <= RT_FULL_CLEAR_STOCK_CAP;
        return { ...r, weekNet, prevNet, stock, stockWeeks, priorityStore, isFullClearCandidate };
      });

      // 받는점포 후보: 그 품번을 실제로 팔고 있는 매장들 중,
      // 재고주수가 상대적으로 짧은 편(하위 33%ile)인 매장만 봅니다.
      // 부진상품은 원래 회전이 느려서, 절대 주수(예: 2~3주)로 거르면 후보가 거의 안 남습니다.
      const selling = rowsEnriched.filter((r) => r.weekNet > 0);
      if (!selling.length) continue;

      const weeksSorted = selling.map((r) => r.stockWeeks).sort((a, b) => a - b);
      const cutoffIdx = Math.max(0, Math.ceil(weeksSorted.length * RT_UNDERPERFORM_RECEIVER_PERCENTILE) - 1);
      const cutoffWeeks = weeksSorted[cutoffIdx];

      const receivers = selling
        .filter((r) => r.stockWeeks <= cutoffWeeks)
        .sort((a, b) => a.stockWeeks - b.stockWeeks);

      // 보내는점포: 재고주수가 절대적으로 높은(=정체된) 매장. 진열 유지를 위해 최소수량은
      // 남겨두되, isFullClearCandidate(최근 판매 사실상 없음+재고 소량)면 0까지 남깁니다.
      const senders = rowsEnriched
        .filter((r) => r.stock > (r.isFullClearCandidate ? 0 : RT_UNDERPERFORM_SENDER_KEEP_UNITS) && r.stockWeeks >= RT_UNDERPERFORM_SENDER_STOCK_WEEKS_MIN)
        .sort((a, b) => b.stockWeeks - a.stockWeeks);

      if (!receivers.length || !senders.length) continue;

      const remainingSend = new Map<string, number>();
      for (const s of senders) remainingSend.set(s.storeName, Math.max(0, s.stock - (s.isFullClearCandidate ? 0 : RT_UNDERPERFORM_SENDER_KEEP_UNITS)));

      for (const to of receivers) {
        const targetStock = Math.max(1, Math.ceil(to.weekNet * RT_UNDERPERFORM_FILL_TARGET_WEEKS));
        const initialNeed = Math.max(0, targetStock - to.stock);
        let remainingNeed = initialNeed;
        if (!remainingNeed) continue;

        for (const from of senders) {
          if (remainingNeed <= 0) break;
          if (normalizeStoreKey(from.storeName) === normalizeStoreKey(to.storeName)) continue;

          const available = Math.max(0, Math.floor(Number(remainingSend.get(from.storeName) || 0)));
          if (!available) continue;

          const suggestQty = Math.max(0, Math.min(remainingNeed, available));
          if (!suggestQty) continue;

          remainingSend.set(from.storeName, available - suggestQty);
          remainingNeed -= suggestQty;

          const received = initialNeed - remainingNeed;
          const toAfterWeeks = to.weekNet > 0 ? (to.stock + received) / to.weekNet : 999;
          const fromAfterStock = Math.max(0, from.stock - suggestQty);
          const fromAfterWeeks = from.weekNet > 0 ? fromAfterStock / from.weekNet : 999;

          const priority = from.stockWeeks >= 20 ? "A" : from.stockWeeks >= 12 ? "B" : "C";

          const skuNeedWeights = computeSkuNeedWeights(to.skuRows, RT_UNDERPERFORM_FILL_TARGET_WEEKS);
          const skuNeedSummary = summarizeSkuNeeds(skuNeedWeights);

          rtSuggestions.push({
            moveType: "부진",
            styleCode,
            productName: to.productName,
            fromStore: from.storeName,
            toStore: to.storeName,
            fromStock: from.stock,
            fromStockWeeks: from.stockWeeks,
            fromAfterWeeks,
            toStock: to.stock,
            toStockWeeks: to.stockWeeks,
            toAfterWeeks,
            suggestQty,
            priority,
            stockoutDays: 0,
            weekAmount: to.weekAmount,
            rtScore: 0,
            companyRank,
            isNewProduct: false,
            priorityStore: isPriorityStore(to.storeName),
            fromFullClear: !!from.isFullClearCandidate,
            skuNeedWeights,
            reason: [
              `전사 판매순위 ${companyRank === 9999 ? "권외" : `${companyRank}위`}로 TOP${RT_ELIGIBLE_RANK} 밖 부진상품입니다.`,
              `${from.storeName}은 이 상품 재고주수 ${from.stockWeeks >= 999 ? "판매없음(장기체화)" : `${from.stockWeeks.toFixed(1)}주`}로 과잉재고 상태입니다 (현재 재고 ${Math.round(from.stock).toLocaleString("ko-KR")}개).`,
              `${to.storeName}은 이 상품 기준 재고주수 ${to.stockWeeks.toFixed(1)}주로, 같은 상품을 파는 다른 매장들 대비 상대적으로 회전이 빠른(하위 ${Math.round(RT_UNDERPERFORM_RECEIVER_PERCENTILE * 100)}% 이내) 매장입니다.`,
              skuNeedSummary,
              `과잉재고 매장에서 소화 가능한 매장으로 이동해 재고 소진과 판매 기회를 함께 노립니다. 이번 제안 수량은 ${Math.round(suggestQty).toLocaleString("ko-KR")}개입니다.`,
              from.isFullClearCandidate
                ? `${from.storeName}은 이 상품 최근 2주 판매가 합산 ${Math.round(Number(from.weekNet || 0) + Number(from.prevNet || 0))}개로 사실상 없고 재고도 소량이라, 최소 보유수량 없이 전량 이동 대상으로 계산했습니다.`
                : `출고점은 진열 유지를 위해 최소 ${RT_UNDERPERFORM_SENDER_KEEP_UNITS}개는 남겨두고 계산했습니다.`,
            ].filter(Boolean).join("\n"),
          });
        }
      }
    }
  }

  const recv: Record<string, any> = {};
  const send: Record<string, any> = {};
  for (const x of rtSuggestions) {
    if (!recv[x.toStore]) recv[x.toStore] = { storeName: x.toStore, count: 0, weeks: [], avgWeeks: 0 };
    recv[x.toStore].count++;
    recv[x.toStore].weeks.push(x.toStockWeeks);

    if (!send[x.fromStore]) send[x.fromStore] = { storeName: x.fromStore, count: 0, weeks: [], avgWeeks: 0 };
    send[x.fromStore].count++;
    send[x.fromStore].weeks.push(x.fromStockWeeks);
  }
  const finalize = (obj: Record<string, any>) =>
    Object.values(obj).map((v: any) => {
      const weeks = v.weeks.filter((w: any) => Number.isFinite(Number(w)));
      return { ...v, avgWeeks: weeks.length ? weeks.reduce((s: number, w: number) => s + w, 0) / weeks.length : 0 };
    });

  const sortedRtSuggestions = rtSuggestions.sort(
    (a, b) => (b.rtScore || 0) - (a.rtScore || 0) || (a.companyRank || 9999) - (b.companyRank || 9999)
  );
  // MARK 6.5: 기존에는 결과를 10건으로 강제 컷했습니다.
  // TOP 20 품번 전체에서 나온 제안을 보여주되, 안전장치로만 넉넉한 상한(300건)을 둡니다.
  // MARK 6.7: 부진 엔진이 추가되면서 건수가 늘어나 상한을 넉넉하게 올립니다.
  const RT_SUGGESTION_SAFETY_CAP = 1000;
  const rtSuggestionProductCount = new Set(sortedRtSuggestions.map((s) => s.styleCode)).size;

  const consignmentTopProducts = aggregateProducts(consignmentProducts, undefined, 10);
  const consignmentRecommendations = (consignmentTopProducts.length ? consignmentTopProducts : companyTopProducts).slice(0, 5).map((p) => {
    const inv: any = invMap.get(p.styleCode) || {};
    return {
      ...p,
      onlineStock: inv.onlineStock || 0,
      offlineStock: inv.offlineStock || 0,
      totalStock: inv.totalStock || 0,
      reason: consignmentTopProducts.length
        ? "위탁 채널 판매 기준 효율 점검 상품"
        : "핵심 오프라인 TOP 상품 기준 위탁 채널 투입 후보",
    };
  });

  // MARK 6.55: Layer 0(전사지시) 재설계 — 매장 확산도 기반
  // 1단계(자격): 오프라인 매장 12개 이상이 각각 재고 10장 이상 보유해야 후보
  // 2단계(태깅): 창고가용재고 500장 이상 여부 + 2주 판매추이(양호/부진)로 4갈래 분류
  // 3단계(매장갭): 자격 통과한 스타일인데 이 매장엔 재고 10장 미만 → "투입필요"
  const trendRows = await buildProductRowsFromDailyHistory(todayKST(), 14);

  const styleStoreMap = new Map<string, { storeName: string; stock: number }[]>();
  const styleWeekNet = new Map<string, number>();
  const stylePrevNet = new Map<string, number>();
  const styleProductName = new Map<string, string>();

  for (const r of trendRows) {
    if (!styleStoreMap.has(r.styleCode)) styleStoreMap.set(r.styleCode, []);
    styleStoreMap.get(r.styleCode)!.push({ storeName: r.storeName, stock: r.storeStock });
    styleWeekNet.set(r.styleCode, (styleWeekNet.get(r.styleCode) || 0) + r.weekNet);
    stylePrevNet.set(r.styleCode, (stylePrevNet.get(r.styleCode) || 0) + r.prevNet);
    if (!styleProductName.has(r.styleCode)) styleProductName.set(r.styleCode, r.productName);
  }

  const allCoreStoreNames = Array.from(new Set(trendRows.map((r) => r.storeName)));

  const styleDirectives: any[] = [];
  for (const [styleCode, storeStocks] of styleStoreMap.entries()) {
    const qualifyingStores = storeStocks.filter((s) => s.stock >= 10);
    if (qualifyingStores.length < 12) continue; // 1단계 자격 미달 — 확산도 부족

    const warehouseStock = Number(invMap.get(styleCode)?.offlineStock || 0);
    const weekNet = styleWeekNet.get(styleCode) || 0;
    const prevNet = stylePrevNet.get(styleCode) || 0;
    const salesGood = weekNet >= prevNet; // 2주 추세: 유지/증가=양호

    let directiveType: string;
    let reason: string;
    let priority: number;
    if (warehouseStock >= 500 && salesGood) {
      directiveType = "주력상품-공급형";
      reason = `${qualifyingStores.length}개 매장 확산 + 창고재고 ${Math.round(warehouseStock)}장 + 2주 판매 양호 — 적극 확대 가능`;
      priority = 90;
    } else if (warehouseStock >= 500 && !salesGood) {
      directiveType = "소진필요";
      reason = `${qualifyingStores.length}개 매장 확산 + 창고재고 ${Math.round(warehouseStock)}장인데 2주 판매 둔화 — 소진 필요`;
      priority = 75;
    } else if (warehouseStock < 500 && salesGood) {
      directiveType = "주력상품-회전형";
      reason = `${qualifyingStores.length}개 매장 확산 + 2주 판매 양호 (창고 추가공급 제한적, 이미 매장 중심으로 퍼짐)`;
      priority = 60;
    } else {
      directiveType = "관찰";
      reason = `${qualifyingStores.length}개 매장 확산됐지만 2주 판매 둔화, 창고재고도 제한적`;
      priority = 30;
    }

    // 매장 갭: 이 스타일이 자격 기준(10장)에 못 미치는 매장들 → 투입필요 알림 대상
    const gapStores = allCoreStoreNames.filter((storeName) => {
      const found = storeStocks.find((s) => s.storeName === storeName);
      return !found || found.stock < 10;
    });

    const topQualifyingStore = [...qualifyingStores].sort((a, b) => b.stock - a.stock)[0]?.storeName || "";

    styleDirectives.push({
      styleCode,
      productName: styleProductName.get(styleCode) || "",
      directiveType,
      reason,
      priority,
      qualifyingStoreCount: qualifyingStores.length,
      topQualifyingStore,
      warehouseStock,
      weekNet,
      prevNet,
      gapStores: gapStores.slice(0, 10),
      gapStoreCount: gapStores.length,
    });
  }
  styleDirectives.sort((a, b) => b.priority - a.priority);

  return {
    periodLabel: "재고CTRL 기준: RT=오프라인 점포 간 이동 / 온라인 이관=온라인 가용재고→오프라인 배분 / 프로모션=오프라인 운영재고",
    stockoutRisk: stockoutRisk.sort((a, b) => a.offlineWeeks - b.offlineWeeks).slice(0, 10),
    overstockRisk: overstockRisk.sort((a, b) => b.offlineWeeks - a.offlineWeeks).slice(0, 10),
    allocationSuggestions: allocationSuggestions.sort((a, b) => b.weekAmount - a.weekAmount).slice(0, 5),
    onlineTransferSuggestions,
    rtSuggestions: sortedRtSuggestions.slice(0, RT_SUGGESTION_SAFETY_CAP),
    rtEligibleProductRank: RT_ELIGIBLE_RANK,
    rtSuggestionProductCount,
    // MARK 2026-09-21: 이 RT 제안들이 PIP 매장별 재고 스냅샷을 참고했는지 화면에 보여주기 위한 메타.
    rtStockSource: storeStockSnapshot?.rows?.length ? "pip" : "daily_sales_history",
    rtPipUpdatedAt: storeStockSnapshot?.meta?.uploadedAt || null,
    consignmentRecommendations,
    stockoutStoreTop5: finalize(recv).sort((a: any, b: any) => b.count - a.count).slice(0, 5),
    overstockStoreTop5: finalize(send).sort((a: any, b: any) => b.count - a.count).slice(0, 5),
    ...promotion,
    styleDirectives,
    productAnalysisList,
    aiBriefing: [
      `RT 이동 우선 검토 대상은 ${rtSuggestions.length}건입니다.`,
      `온라인 이관 후보는 ${onlineTransferSuggestions.length}건, 품절 위험 상품은 ${stockoutRisk.length}개입니다.`,
      `과재고 위험 상품은 ${overstockRisk.length}개로, 판매 호조 매장 이동 또는 출고 우선순위 조정이 필요합니다.`,
      `프로모션 검토 후보는 ${promotion.promotionSuggestions.length}개이며, TOP상품/판매상승 보호 제외 ${promotion.suppressedPromotionCandidates?.length || 0}개, RT 억제 전환 후보 ${promotion.rtSuppressedPromotionCandidates?.length || 0}개입니다.`,
      "RT는 전사 판매 상위 상품을 우선으로 상품 판매력 70%, 재고 부족도 20%, 점포 매출력 10% 기준으로 입고점을 선정하며, 출고점 안전재고를 남기고 다중 점포로 분산 보충합니다.",
    ],
  };
}

// MARK 2026-09-24: "RT 이동 제안이 계속 안 됨" — 원인은 RT 제안이 buildDashboardDataFromGoogleSheet()
// (일간/주간/월간 매출, 프로모션 성과 등 훨씬 무거운 다른 계산들까지 전부 한 요청/한 함수 안에
// 같이 묶여 있는 재고CTRL 탭의 "대시보드 전체" 엔드포인트, /api/data)의 극히 일부라는 점이었습니다.
// 그 함수 안의 다른 어떤 부분이 느리거나 OOM/에러가 나면, RT 제안 자체는 멀쩡히 계산 가능했어도
// 응답 전체가 실패해서 같이 죽어버렸습니다(그리고 /api/data는 실패하면 조용히 내장 fallback
// 데이터로 대체해서 반환하기 때문에 정확히 뭐가 문제인지도 화면에서 알 수 없었습니다).
//
// 그래서 RT 제안 계산에 실제로 필요한 입력만 따로 모아서 buildInventory()를 호출하는 훨씬 가벼운
// 전용 경로를 만듭니다 — 나머지 대시보드(일간/주간/월간 매출, 프로모션 성과 등)와 완전히 분리되어
// 있어서, 그쪽에서 무슨 일이 나도 이 함수는 영향을 안 받습니다(반대도 마찬가지). 재고CTRL 탭의
// 다른 위젯들(품절/과재고 위험, 온라인 이관 제안, 프로모션 제안 등)은 여전히 /api/data(=
// buildDashboardDataFromGoogleSheet)를 그대로 씁니다 — 여긴 RT 제안만 분리한 것이라, RT 제안에
// 필요한 입력(온오프재고현황 시트, 최근 7일 판매, 전사 TOP20 상품, PIP 매장별 재고 스냅샷)은
// /api/data 쪽에서도 어차피 다시 읽으므로 약간의 중복 조회는 있지만, 그 대신 완전히 독립적으로
// 성공/실패합니다.
export async function buildRtSuggestions() {
  // MARK 2026-09-24: 배포 후 504(=maxDuration 안에 못 끝나서 강제종료, 즉 이 함수가 정말
  // 오래 걸렸다는 뜻)가 발생해서, 어느 단계가 오래 걸리는지 다음번엔 Vercel 함수 로그에서
  // 바로 보이도록 단계별로 소요시간을 남깁니다. 또한 titles/판매이력/PIP스냅샷/Daily_Sales_History
  // 넷 다 서로 의존관계가 없는데 기존엔 titles→재고시트 읽기를 먼저 끝내고서야 나머지 3개를
  // 시작했습니다 — 넷 다 한번에 병렬로 돌리도록 바꿔서 그만큼 시간을 아낍니다.
  const t0 = Date.now();
  const elapsed = () => `${Date.now() - t0}ms`;

  const [titles, productRowsRaw, storeStockSnapshotForRt, history] = await Promise.all([
    getSpreadsheetTitles(),
    buildProductRowsFromDailyHistory(),
    readStoreStockSnapshot().catch(() => ({ rows: [] as StoreStockSnapshotRow[], meta: null })),
    loadDashboardDailyHistory(),
  ]);
  console.log(`[rt-suggestions] titles+productRows+pip+history 완료 (${elapsed()})`);

  const inventorySheet = pickNormalizedTitle(titles, ["온오프재고현황", "온/오프재고현황", "온오프 재고 현황", "온/오프 재고 현황"], "온오프재고현황");
  const values = await getManySheetValues([inventorySheet], "A:AZ");
  const inventoryRows = parseInventory(values[inventorySheet] || []);
  console.log(`[rt-suggestions] 온오프재고현황 읽기 완료, ${inventoryRows.length}행 (${elapsed()})`);

  const currentDate = yesterdayDateKeyKST();
  const historyRowsAll = history.rows || [];
  const historyRows = historyRowsAll.filter((r: any) => isOfflineSalesStore(r.storeName));
  const coreHistoryRows = historyRows.filter((r: any) => isCoreOfflineSalesStore(r.storeName));
  const historyProductRows = buildHistoryProductRows(coreHistoryRows, currentDate);
  const companyTopProducts = aggregateProducts(historyProductRows, undefined, 20);

  const inventory = await buildInventory(productRowsRaw, inventoryRows, companyTopProducts, storeStockSnapshotForRt);
  console.log(`[rt-suggestions] buildInventory 완료, RT 제안 ${inventory.rtSuggestions?.length || 0}건 (${elapsed()})`);

  return {
    rtSuggestions: inventory.rtSuggestions,
    rtEligibleProductRank: inventory.rtEligibleProductRank,
    rtSuggestionProductCount: inventory.rtSuggestionProductCount,
    rtStockSource: inventory.rtStockSource,
    rtPipUpdatedAt: inventory.rtPipUpdatedAt,
  };
}

function buildCarryoverAnnualSales(annualRows: any[][], standardRows: any[][]) {
  // 임시 월간 카드용: 기준!E 품번 + 기준!W = 이월 상품만 연간판매에서 합산
  // 연간판매: D 품번, AG 판매수량, AH 판매금액
  const carryoverStyles = new Set<string>();

  for (const row of standardRows.slice(1)) {
    const styleCode = text(row[4]); // E
    const flag = text(row[22]); // W
    if (styleCode && flag.includes("이월")) carryoverStyles.add(styleCode);
  }

  let qty = 0;
  let amount = 0;
  let rowCount = 0;

  for (const row of annualRows.slice(1)) {
    const styleCode = text(row[3]); // D
    if (!styleCode || !carryoverStyles.has(styleCode)) continue;
    qty += num(row[32]); // AG
    amount += num(row[33]); // AH
    rowCount += 1;
  }

  return {
    qty,
    amount,
    styleCount: carryoverStyles.size,
    matchedRows: rowCount,
    note: "기준!W=이월 / 기준!E 품번 ↔ 연간판매!D 품번 / AG 판매수량 / AH 판매금액",
  };
}



function looksLikeStoreName(value: string) {
  const s = String(value || "").trim();
  if (!s || /^\d+$/.test(s)) return false;
  return /(점|플래그십|아울렛|백화점|몰|현대|롯데|신세계|LF|타임스퀘어|성수|신사|한남|센텀|용산|광주|송도|김포|잠실|강남|대전|평촌|광양|운정)/i.test(s);
}

function buildChannelCodeNameMap(rows: any[][]): Map<string, string> {
  const map = new Map<string, string>();
  const setMap = (code: string, name: string) => {
    const c = text(code);
    const n = displayStoreName(text(name));
    if (!c || !n || !/^\d+$/.test(c)) return;
    map.set(c, n);
    map.set(normalizeStoreKey(c), n);
    map.set(normalizeStoreKey(n), n);
  };

  for (const row of rows.slice(1)) {
    // 표준 객_전주: C=채널코드, D=점포명 우선
    setMap(text(row[2]), text(row[3]));
    // 일부 파일은 A/B/C/D가 다르게 들어오므로 같은 행의 숫자 코드와 점포명 후보를 전부 연결합니다.
    const codes = row.map(text).filter((v) => /^\d{4,6}$/.test(v));
    const names = row.map(text).filter(looksLikeStoreName);
    for (const code of codes) {
      for (const name of names) setMap(code, name);
    }
  }

  // 자주 쓰는 점포 코드는 객_전주 매핑 실패 시에도 RT 화면이 깨지지 않도록 최소 fallback을 둡니다.
  const fallback: Record<string, string> = {
    "21030": "성수 플래그십",
    "21034": "서울숲 플래그십",
    "21003": "신세계 대전점",
    "21007": "신세계 광주점",
    "21011": "신사 플래그십",
    "21012": "한남 플래그십",
    "21016": "포시즌 아울렛 신사",
    "21001": "현대아울렛 송도점",
    "41001": "롯데아울렛 서울역점",
    "42002": "현대아울렛 송도점",
    "42004": "현대아울렛 남양주점",
    "35002": "신세계 광주점",
    "46003": "롯데아울렛 김해점",
    "52034": "스타필드 빌리지 운정점",
    "36001": "롯데백화점 광복점",
  };
  for (const [code, name] of Object.entries(fallback)) {
    if (!map.has(code)) setMap(code, name);
  }
  return map;
}

// MARK 6.83: 매장별 개별 URL(/store/[code]) 배포용 — 코드→매장명 매핑을 독립적으로 가져옵니다.
// buildChannelCodeNameMap과 같은 "객_전주" 시트를 쓰지만, 이건 그 시트 fetch까지 포함한
// 완결형 함수라 라우트에서 바로 호출하면 됩니다.
export async function getStoreCodeNameMap(): Promise<Map<string, string>> {
  try {
    const mainId = getSheetId();
    const mainTitles = await getSpreadsheetTitlesById(mainId).catch(() => []);
    const channelSheetName = mainTitles.find((title) => normalizeSheetName(title).includes("객_전주")) || "";
    const channelValues = channelSheetName ? await getSheetValuesById(mainId, channelSheetName, "A1:AZ10000").catch(() => []) : [];
    return buildChannelCodeNameMap(channelValues || []);
  } catch {
    return buildChannelCodeNameMap([]); // 시트를 못 읽어도 최소 fallback 매핑은 반환됨
  }
}

function parseRtResultRows(rows: any[][], codeNameMap = new Map<string, string>(), productNameMap = new Map<string, string>()) {
  const headerRow = findHeaderRow(rows, ["스타일", "수량"]);
  const header = headerRow >= 0 ? rows[headerRow] || [] : rows[0] || [];
  const startRow = headerRow >= 0 ? headerRow + 1 : 1;

  const fromCol = findCol(header, ["보낼채널코드", "보내채널", "출고점", "보낸점포"], 0);
  const toCol = findCol(header, ["받을채널코드", "받는채널", "입고점", "받는점포"], 1);
  const styleCol = findCol(header, ["스타일", "품번"], 2);
  const colorCol = findCol(header, ["칼라", "컬러"], 3);
  const sizeCol = findCol(header, ["사이즈"], 4);
  const qtyCol = findCol(header, ["지시수량", "수량"], 5);

  // MARK 6.1.5:
  // RT_Result 표준 헤더는 G=승인날짜, H=저장날짜입니다.
  // 성과 시작일/필터 기준은 승인날짜를 우선 사용하고, 비어있을 때만 저장날짜를 fallback으로 씁니다.
  const approvalDateCol = findCol(header, ["승인날짜", "제안날짜", "승인일"], 6);
  const savedDateCol = findCol(header, ["저장한날짜", "저장날짜", "지시일", "지시날짜", "다운로드날짜"], 7);
  const dateCol = approvalDateCol >= 0 ? approvalDateCol : 6;
  const fallbackDateCol = savedDateCol >= 0 ? savedDateCol : 7;

  const grouped = new Map<string, any>();

  for (const row of rows.slice(startRow)) {
    const styleCode = text(row[styleCol]);
    const directiveDate = normalizeDateKey(row[dateCol]) || normalizeDateKey(row[fallbackDateCol]);
    const qty = num(row[qtyCol]);
    if (!styleCode || !directiveDate || !qty) continue;

    const rawFrom = text(row[fromCol]);
    const rawTo = text(row[toCol]);
    const fromStore = codeNameMap.get(rawFrom) || codeNameMap.get(normalizeStoreKey(rawFrom)) || (/^\d+$/.test(rawFrom) ? `미확인점포(${rawFrom})` : displayStoreName(rawFrom));
    const toStore = codeNameMap.get(rawTo) || codeNameMap.get(normalizeStoreKey(rawTo)) || (/^\d+$/.test(rawTo) ? `미확인점포(${rawTo})` : displayStoreName(rawTo));
    const color = text(row[colorCol]);
    const size = text(row[sizeCol]);
    // 여러 매장에서 같은 상품을 한 점포로 보낸 RT는 성과표에서 상품 1행으로 봅니다.
    // 따라서 결과 그룹은 승인날짜 + 스타일 기준입니다.
    const key = `${directiveDate}__${styleCode}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        category: "RT",
        styleCode,
        productName: productNameMap.get(styleCode) || "",
        color: "",
        colorName: "",
        tagPrice: 0,
        salePrice: 0,
        saleType: "",
        discountRate: 0,
        marginRate: 0,
        channel: "",
        note: "",
        rtQty: 0,
        startDate: directiveDate,
        endDate: "",
        fromStore,
        fromStores: [] as string[],
        fromCodes: [] as string[],
        toStore,
        toStores: [] as string[],
        toCodes: [] as string[],
        beforeQty: 0,
        duringQty: 0,
        addedQty: 0,
        beforeAmount: 0,
        duringAmount: 0,
        addedAmount: 0,
        colorSizeSummary: [] as string[],
        source: "RT_Result",
      });
    }

    const item = grouped.get(key);
    item.rtQty += qty;
    if (fromStore && !item.fromStores.includes(fromStore)) item.fromStores.push(fromStore);
    if (toStore && !item.toStores.includes(toStore)) item.toStores.push(toStore);
    if (rawFrom && !item.fromCodes.includes(rawFrom)) item.fromCodes.push(rawFrom);
    if (rawTo && !item.toCodes.includes(rawTo)) item.toCodes.push(rawTo);
    item.fromStore = item.fromStores.join(", ");
    item.toStore = item.toStores.join(", ") || item.toStore;
    if (color || size) item.colorSizeSummary.push(`${color || "-"} / ${size || "-"} ${qty.toLocaleString("ko-KR")}개`);
  }

  return Array.from(grouped.values()).map((item: any) => ({
    ...item,
    note: item.colorSizeSummary.length ? `RT_Result G열 승인날짜 기준: ${item.colorSizeSummary.slice(0, 8).join(", ")}${item.colorSizeSummary.length > 8 ? " ..." : ""}` : "RT_Result G열 승인날짜 기준",
  }));
}

function mergeRtRows(performanceRows: any[], rtRows: any[]) {
  const keyOf = (row: any) => `${row.startDate}__${row.category || "RT"}__${row.styleCode}`;
  const map = new Map<string, any>();

  for (const row of performanceRows) {
    const key = keyOf(row);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...row, fromStores: row.fromStore ? [row.fromStore] : [] });
      continue;
    }
    const fromStores = new Set([...(existing.fromStores || []), row.fromStore].filter(Boolean));
    map.set(key, {
      ...existing,
      ...row,
      productName: existing.productName || row.productName,
      toStore: existing.toStore || row.toStore,
      channel: existing.channel || row.channel,
      rtQty: Number(existing.rtQty || 0) + Number(row.rtQty || 0),
      fromStores: Array.from(fromStores),
      fromStore: Array.from(fromStores).join(", "),
      toStores: Array.from(new Set([...(existing.toStores || []), row.toStore].filter(Boolean))),
      note: [existing.note, row.note].filter(Boolean).join(" / "),
    });
  }

  for (const rt of rtRows) {
    const key = keyOf(rt);
    if (map.has(key)) {
      const existing = map.get(key);
      const fromStores = new Set([...(existing.fromStores || []), ...(rt.fromStores || []), existing.fromStore, rt.fromStore].filter(Boolean));
      map.set(key, {
        ...existing,
        ...rt,
        productName: existing.productName || rt.productName,
        toStore: existing.toStore || rt.toStore,
        channel: existing.channel || rt.channel,
        // MARK 6.17.1: 같은 RT 건이 Promotion_Performance와 RT_Result 양쪽에 각각 기록되어 있어서,
        // 예전엔 두 값을 더해서 수량이 2배로 집계되는 버그가 있었습니다.
        // RT_Result가 실제 수량 컬럼을 그대로 합산한 더 신뢰도 높은 값이라 이걸 우선하고,
        // 혹시 비어있으면(0이면) 기존 값을 그대로 씁니다 — 더하지 않습니다.
        rtQty: Number(rt.rtQty || 0) || Number(existing.rtQty || 0),
        fromStores: Array.from(fromStores),
        fromStore: Array.from(fromStores).join(", "),
        toStores: Array.from(new Set([...(existing.toStores || []), ...(rt.toStores || []), existing.toStore, rt.toStore].filter(Boolean))),
        note: [existing.note, rt.note].filter(Boolean).join(" / "),
        source: `${existing.source || "Promotion_Performance"}+RT_Result`,
        // MARK 6.7: RT_Result에는 호조/부진 구분이 없으므로, Promotion_Performance 쪽에 이미
        // 기록된 saleType(RT-호조/RT-부진)이 있으면 그걸 우선하고 없을 때만 rt 쪽 값을 씁니다.
        saleType: existing.saleType || rt.saleType,
      });
    } else {
      map.set(key, rt);
    }
  }

  return Array.from(map.values()).map((row: any) => {
    if (row.category !== "RT") return row;
    return {
      ...row,
      saleType: row.saleType || "RT",
      // 같은 승인날짜/같은 상품은 여러 매장에서 이동해도 성과표 1행으로 봅니다.
      note: row.note || "RT_Result G열 승인날짜 기준 / 동일 상품 통합",
    };
  });
}

function parsePerformanceRows(rows: any[][]) {
  const headerRow = findHeaderRow(rows, ["구분", "스타일", "시작일"]);
  const header = headerRow >= 0 ? rows[headerRow] || [] : [];
  const startRow = headerRow >= 0 ? headerRow + 1 : 1;

  const typeCol = findCol(header, ["구분"], 0);
  const styleCol = findCol(header, ["스타일"], 1);
  const productCol = findCol(header, ["스타일명"], 2);
  const colorCol = findCol(header, ["칼라"], 3);
  const colorNameCol = findCol(header, ["칼라명"], 4);
  const tagPriceCol = findCol(header, ["소비자가"], 5);
  const salePriceCol = findCol(header, ["판매단가"], 6);
  const saleTypeCol = findCol(header, ["판매유형"], 7);
  const discountRateCol = findCol(header, ["할인율"], 8);
  const marginRateCol = findCol(header, ["마진율"], 9);
  const channelCol = findCol(header, ["유통몰채널"], 10);
  const noteCol = findCol(header, ["상세비고"], 11);
  const startDateCol = findCol(header, ["시작일"], 12);
  const endDateCol = findCol(header, ["종료일"], 13);
  const fromStoreCol = findCol(header, ["보낸점포"], 14);
  const toStoreCol = findCol(header, ["받는점포"], 15);
  const beforeQtyCol = findCol(header, ["행사전판매"], 16);
  const duringQtyCol = findCol(header, ["행사중판매"], 17);
  const beforeAmountCol = findCol(header, ["행사전매출"], 18);
  const duringAmountCol = findCol(header, ["행사중매출"], 19);

  return rows.slice(startRow)
    .map((row) => {
      const category = text(row[typeCol]).toUpperCase();
      const styleCode = text(row[styleCol]);
      const productName = text(row[productCol]);
      const startDate = normalizeDateKey(row[startDateCol]);
      if (!category && !styleCode && !productName) return null;

      const beforeQty = num(row[beforeQtyCol]);
      const duringQty = num(row[duringQtyCol]);
      const beforeAmount = num(row[beforeAmountCol]);
      const duringAmount = num(row[duringAmountCol]);
      const addedQty = duringQty - beforeQty;
      const addedAmount = duringAmount - beforeAmount;

      return {
        category: category || "PROMOTION",
        styleCode,
        productName,
        color: text(row[colorCol]),
        colorName: text(row[colorNameCol]),
        tagPrice: num(row[tagPriceCol]),
        salePrice: num(row[salePriceCol]),
        saleType: text(row[saleTypeCol]),
        discountRate: num(row[discountRateCol]),
        marginRate: num(row[marginRateCol]),
        channel: text(row[channelCol]),
        note: text(row[noteCol]),
        rtQty: category === "RT" ? extractRtQty({ note: text(row[noteCol]) }) : 0,
        startDate,
        endDate: normalizeDateKey(row[endDateCol]),
        fromStore: text(row[fromStoreCol]),
        toStore: text(row[toStoreCol]),
        beforeQty,
        duringQty,
        addedQty,
        beforeAmount,
        duringAmount,
        addedAmount,
        changeRate: beforeAmount ? ((duringAmount - beforeAmount) / beforeAmount) * 100 : duringAmount ? 100 : 0,
        result: addedAmount > 0 ? "성공" : addedAmount < 0 ? "부진" : "관찰",
      };
    })
    .filter(Boolean);
}

function normalizeDateKey(value: any) {
  const s = text(value);
  if (!s) return "";

  // Google Sheets에서 "2026. 6. 22"처럼 들어오는 값을 Date 생성보다 먼저 직접 정규화합니다.
  // 기존 parseDate가 slice(0, 10)을 먼저 적용하면서 "2026. 6. 22"를 "2026- 6- 2"로 잘라
  // 2026-06-02로 오인하는 문제가 있었습니다.
  const m = s.match(/(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;

  const korean = s.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (korean) return `${korean[1]}-${String(korean[2]).padStart(2, "0")}-${String(korean[3]).padStart(2, "0")}`;

  const d = parseDate(value);
  if (d) return d.toISOString().slice(0, 10);

  return s;
}


function dateAddDays(dateKey: string, days: number) {
  const d = parseDate(dateKey);
  if (!d) return "";
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateRange(startKey: string, endKey: string) {
  const start = parseDate(startKey);
  const end = parseDate(endKey);
  if (!start || !end) return [];
  const out: string[] = [];
  const cur = new Date(start.getTime());
  while (cur.getTime() <= end.getTime()) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function weekWindow(dateKey: string, offsetWeeks = 0) {
  const d = parseDate(dateKey);
  if (!d) return { start: "", end: "", dates: [] as string[] };

  // 시작일이 포함된 주의 월~일 기준
  const day = d.getDay(); // 0 Sun, 1 Mon
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday + offsetWeeks * 7);

  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const endDate = new Date(d.getTime());
  endDate.setDate(endDate.getDate() + 6);
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { start, end, dates: dateRange(start, end) };
}

function extractRtQty(row: any) {
  const direct = num(row.rtQty || row.suggestQty || row.transferQty);
  if (direct) return direct;
  const joined = `${row.note || ""} ${row.saleType || ""} ${row.detail || ""}`;
  const m = joined.match(/RT\s*수량\s*([0-9,]+)/i) || joined.match(/([0-9,]+)\s*개/);
  return m ? num(m[1]) : 0;
}

function rtGrade(rateValue: number) {
  if (rateValue >= 80) return "S";
  if (rateValue >= 60) return "A";
  if (rateValue >= 30) return "B";
  return "C";
}

function todayDateKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function performancePeriods(row: any) {
  const startDate = row.startDate;
  if (!startDate) {
    return {
      beforeDates: [] as string[],
      duringDates: [] as string[],
      basis: "",
      beforeLabel: "",
      duringLabel: "",
    };
  }

  const isRt = row.category === "RT";

  if (isRt) {
    const beforeWeek = weekWindow(startDate, -1);
    const duringWeek = weekWindow(startDate, 0);
    return {
      beforeDates: beforeWeek.dates,
      duringDates: duringWeek.dates,
      basis: `RT 비교: RT_Result G열 승인날짜 기준 / 실행전주 ${beforeWeek.start}~${beforeWeek.end} ↔ 실행주 ${duringWeek.start}~${duringWeek.end}`,
      beforeLabel: `${beforeWeek.start}~${beforeWeek.end}`,
      duringLabel: `${duringWeek.start}~${duringWeek.end}`,
    };
  }

  // MARK 6.7.3: 프로모션은 "고정 3일"이 아니라 실제 행사기간(시작일~종료일)으로 비교합니다.
  // 실행후 기간은 행사기간 전체(단, 아직 안 끝났으면 오늘까지로 제한)이고,
  // 실행전 기간은 그 직전에 같은 일수만큼(겹치지 않게) 비교합니다.
  const today = todayDateKey();
  const duringStart = startDate;
  const rawEndDate = row.endDate || startDate;
  const duringEnd = rawEndDate > today ? today : rawEndDate; // 미래 종료일/진행중인 행사는 오늘까지만
  const safeDuringEnd = duringEnd < duringStart ? duringStart : duringEnd;

  const duringDates = dateRange(duringStart, safeDuringEnd);
  const durationDays = Math.max(1, duringDates.length);

  const beforeEnd = dateAddDays(duringStart, -1);
  const beforeStart = dateAddDays(beforeEnd, -(durationDays - 1));

  return {
    beforeDates: dateRange(beforeStart, beforeEnd),
    duringDates,
    basis: `프로모션 비교: 핵심 오프라인 매장 기준 / 실행 전 ${beforeStart}~${beforeEnd}(${durationDays}일) ↔ 실행 ${duringStart}~${safeDuringEnd}(${durationDays}일)`,
    beforeLabel: `${beforeStart}~${beforeEnd}`,
    duringLabel: `${duringStart}~${safeDuringEnd}`,
  };
}

function parseDailyHistoryRows(rows: any[][]) {
  // MARK 6.6: Daily_Sales_History가 "일자+점포당 한 줄 + 상세JSON" 압축 형식으로 바뀌었습니다.
  // 압축 형식이면 JSON을 펼쳐서 기존과 동일한 평면 구조로 변환합니다.
  // (헤더 탐색용 findHeaderRow는 데이터 안 상품명에 "스타일"이 포함될 수 있어 오탐 위험이 있으므로,
  //  압축 형식 여부는 항상 0행을 직접 확인합니다.)
  if (isCompactDailyHistoryHeader(rows[0] || [])) {
    return expandCompactDailyHistoryRows(rows)
      .map((r) => ({
        date: normalizeDateKey(r.date),
        storeName: displayStoreName(r.storeName),
        storeKey: normalizeStoreKey(r.storeName),
        styleCode: r.styleCode,
        productName: r.productName,
        qty: r.qty,
        amount: r.amount,
        unitPrice: r.qty ? r.amount / r.qty : 0,
      }))
      .filter((r) => r.date && r.styleCode);
  }

  const headerRow = findHeaderRow(rows, ["스타일"]);
  const header = headerRow >= 0 ? rows[headerRow] || [] : rows[0] || [];
  const startRow = headerRow >= 0 ? headerRow + 1 : 1;

  const dateCol = findCol(header, ["일자", "날짜", "기준일", "판매일", "snapshot_date", "date"], 0);
  const storeCol = findCol(header, ["점포", "점포명", "채널명", "매장", "받는점포", "storeName"], 1);
  const styleCol = findCol(header, ["스타일", "품번", "styleCode"], 2);
  const productCol = findCol(header, ["스타일명", "상품명", "productName"], 3);
  const qtyCol = findCol(header, ["판매수량", "수량", "판매", "weekNet", "dayNet", "qty"], 7);
  const amountCol = findCol(header, ["판매금액", "매출", "금액", "daySales", "amount"], 8);

  return rows.slice(startRow)
    .map((row) => {
      const qty = num(row[qtyCol]);
      const amount = num(row[amountCol]);
      return {
        date: normalizeDateKey(row[dateCol]),
        storeName: displayStoreName(text(row[storeCol])),
        storeKey: normalizeStoreKey(text(row[storeCol])),
        styleCode: text(row[styleCol]),
        productName: text(row[productCol]),
        qty,
        amount,
        unitPrice: qty ? amount / qty : 0,
      };
    })
    .filter((r) => r.date && r.styleCode);
}



function groupedHeaderLabel(rows: any[][], headerRow: number, col: number) {
  // 엑셀 병합 헤더는 병합 시작 셀에만 값이 들어옵니다.
  // 예: 금주 그룹이 S:V로 병합되면 T/U/V 열의 상단 셀은 빈값입니다.
  // 따라서 같은 상단 행에서 왼쪽으로 거슬러 올라가 가장 가까운 그룹명을 찾습니다.
  for (let r = headerRow - 1; r >= 0 && r >= headerRow - 3; r--) {
    for (let c = col; c >= 0; c--) {
      const v = text(rows[r]?.[c]);
      if (v) return v;
    }
  }
  return "";
}

function parseWeeklyUnitPriceMap(rows: any[][]) {
  const map = new Map<string, number>();
  const headerRow = findHeaderRow(rows, ["스타일", "판매금액"]);
  if (headerRow < 0) return map;

  const header = rows[headerRow] || [];
  const styleCol = findCol(header, ["스타일", "품번"], 2);
  const currentQtyCol = header.findIndex((h, c) => {
    const hText = normalizedHeader(h);
    const gText = normalizedHeader(groupedHeaderLabel(rows, headerRow, c));
    return gText.includes(normalizedHeader("금주")) && (hText === normalizedHeader("합계") || hText.includes(normalizedHeader("판매수량")) || hText === normalizedHeader("판매"));
  });
  const currentAmountCol = header.findIndex((h, c) => {
    const hText = normalizedHeader(h);
    const gText = normalizedHeader(groupedHeaderLabel(rows, headerRow, c));
    return gText.includes(normalizedHeader("금주")) && hText.includes(normalizedHeader("판매금액"));
  });

  // 금주/전주 시트 표준 구조 fallback:
  // 실제 시트는 S=금주 판매, T=금주 반품, U=금주 합계수량, V=금주 판매금액입니다.
  // 과거 딕셔너리의 T/U 표기와 화면 열명이 어긋날 수 있으므로 헤더 탐색을 우선하고,
  // 실패했을 때만 U/V(0-base 20/21)를 사용합니다.
  const qtyCol = currentQtyCol >= 0 ? currentQtyCol : 20;
  const amountCol = currentAmountCol >= 0 ? currentAmountCol : 21;

  for (const row of rows.slice(headerRow + 1)) {
    const styleCode = text(row[styleCol]);
    if (!styleCode) continue;
    const qty = num(row[qtyCol]);
    const amount = num(row[amountCol]);
    if (!qty || !amount) continue;
    const prev = map.get(styleCode) || 0;
    // 스타일 기준 평균가를 위해 amount/qty를 바로 평균내지 않고 누적용 임시 키를 사용합니다.
    map.set(`${styleCode}__amount`, (map.get(`${styleCode}__amount`) || 0) + amount);
    map.set(`${styleCode}__qty`, (map.get(`${styleCode}__qty`) || 0) + qty);
    if (!prev) map.set(styleCode, amount / qty);
  }

  for (const key of Array.from(map.keys())) {
    if (!key.endsWith("__amount")) continue;
    const style = key.replace(/__amount$/, "");
    const amount = map.get(`${style}__amount`) || 0;
    const qty = map.get(`${style}__qty`) || 0;
    if (qty) map.set(style, amount / qty);
    map.delete(`${style}__amount`);
    map.delete(`${style}__qty`);
  }

  return map;
}

function parseWeeklyStoreHistoryRows(rows: any[][]) {
  const header = rows[0] || [];
  const basisCol = findCol(header, ["기준일"], 0);
  const analysisStartCol = findCol(header, ["분석시작일"], 1);
  const analysisEndCol = findCol(header, ["분석종료일"], 2);
  const typeCol = findCol(header, ["구분"], 5);
  const styleCol = findCol(header, ["스타일", "품번"], 6);
  const productCol = findCol(header, ["스타일명", "품명"], 7);
  const storeCol = findCol(header, ["점포명", "점포", "매장"], 11);
  const currentQtyCol = findCol(header, ["금주판매수량"], 12);
  const currentAmountCol = findCol(header, ["금주판매금액"], 13);
  const prevQtyCol = findCol(header, ["전주판매수량"], 14);
  const prevAmountCol = findCol(header, ["전주판매금액"], 15);

  return rows.slice(1).map((row) => ({
    basis: normalizeDateKey(row[basisCol]),
    analysisStart: normalizeDateKey(row[analysisStartCol]),
    analysisEnd: normalizeDateKey(row[analysisEndCol]),
    typeLabel: text(row[typeCol]),
    styleCode: text(row[styleCol]),
    productName: text(row[productCol]),
    storeName: displayStoreName(text(row[storeCol])),
    storeKey: normalizeStoreKey(text(row[storeCol])),
    currentQty: num(row[currentQtyCol]),
    currentAmount: num(row[currentAmountCol]),
    prevQty: num(row[prevQtyCol]),
    prevAmount: num(row[prevAmountCol]),
  })).filter((r) => r.basis && r.styleCode && r.storeName);
}

function sumWeeklyPerformance(weeklyStoreRows: any[], row: any) {
  const startDate = row.startDate;
  if (!startDate) return null;
  const duringWeek = weekWindow(startDate, 0);
  const basis = mondayAfterDate(duringWeek.end || startDate);
  const targetStore = normalizeStoreKey(row.toStore || row.channel || "");
  const styleCode = text(row.styleCode);
  const matches = weeklyStoreRows.filter((r) => {
    if (r.typeLabel && r.typeLabel !== "품번") return false;
    if (r.styleCode !== styleCode) return false;
    if (r.basis !== basis && !(r.analysisStart === duringWeek.start && r.analysisEnd === duringWeek.end)) return false;
    if (!targetStore) return true;
    return r.storeKey === targetStore || r.storeKey.includes(targetStore) || targetStore.includes(r.storeKey);
  });
  if (!matches.length) return null;
  return matches.reduce((acc, r) => {
    acc.beforeQty += Number(r.prevQty || 0);
    acc.duringQty += Number(r.currentQty || 0);
    acc.beforeAmount += Number(r.prevAmount || 0);
    acc.duringAmount += Number(r.currentAmount || 0);
    if (!acc.productName && r.productName) acc.productName = r.productName;
    return acc;
  }, { beforeQty: 0, duringQty: 0, beforeAmount: 0, duringAmount: 0, productName: "", basis, beforePeriodLabel: "", duringPeriodLabel: "" });
}

function applyWeeklyPerformance(rows: any[], weeklyStoreRows: any[], override?: PerformanceOverride) {
  if (!weeklyStoreRows.length || override?.beforeStart || override?.beforeEnd || override?.duringStart || override?.duringEnd) return rows;
  return rows.map((row: any) => {
    const weekly = row.category === "RT" ? sumWeeklyPerformance(weeklyStoreRows, row) : null;
    if (!weekly) return row;
    const periods = performancePeriods(row);
    const beforeQty = Number(row.beforeQty || 0) || weekly.beforeQty;
    const duringQty = Number(row.duringQty || 0) || weekly.duringQty;
    const beforeAmount = Number(row.beforeAmount || 0) || weekly.beforeAmount;
    const duringAmount = Number(row.duringAmount || 0) || weekly.duringAmount;
    const addedQty = duringQty - beforeQty;
    const addedAmount = duringAmount - beforeAmount;
    const rtQty = row.category === "RT" ? extractRtQty(row) : 0;
    const depletionRate = row.category === "RT" && rtQty ? (duringQty / rtQty) * 100 : 0;
    return {
      ...row,
      productName: row.productName || weekly.productName || "",
      rtQty,
      depletionRate,
      rtGrade: row.category === "RT" && rtQty ? rtGrade(depletionRate) : "",
      beforeQty,
      duringQty,
      addedQty,
      beforeAmount,
      duringAmount,
      addedAmount,
      changeRate: beforeAmount ? ((duringAmount - beforeAmount) / beforeAmount) * 100 : duringAmount ? 100 : 0,
      result: addedAmount > 0 ? "성공" : addedAmount < 0 ? "부진" : "관찰",
      compareBasis: `RT 비교: MARK_WEEKLY_HISTORY / Weekly_history 기준 / 실행전주 ${periods.beforeLabel} ↔ 실행주 ${periods.duringLabel}`,
      beforePeriodLabel: periods.beforeLabel || "",
      duringPeriodLabel: periods.duringLabel || "",
      beforeDates: periods.beforeDates,
      duringDates: periods.duringDates,
      performanceSource: "MARK_WEEKLY_HISTORY / Weekly_history",
    };
  });
}

type PerformanceOverride = {
  categoryFilter?: "ALL" | "RT" | "PROMOTION";
  selectedDate?: string;
  beforeStart?: string;
  beforeEnd?: string;
  duringStart?: string;
  duringEnd?: string;
};

function overridePeriods(row: any, override?: PerformanceOverride) {
  if (!override?.beforeStart || !override?.beforeEnd || !override?.duringStart || !override?.duringEnd) {
    return null;
  }
  return {
    beforeDates: dateRange(override.beforeStart, override.beforeEnd),
    duringDates: dateRange(override.duringStart, override.duringEnd),
    basis: `사용자 지정 비교: 실행 전 ${override.beforeStart}~${override.beforeEnd} ↔ 실행 후 ${override.duringStart}~${override.duringEnd}`,
    beforeLabel: `${override.beforeStart}~${override.beforeEnd}`,
    duringLabel: `${override.duringStart}~${override.duringEnd}`,
  };
}

// MARK 2026-09: buildPerformanceAnalysis가 RT/프로모션 성과 수량 추이를 계산하려고
// Daily_Sales_History 전체를 매번 새로 읽고 있었습니다(dataBuilder.ts의 다른 곳에서
// 이미 겪고 고친 것과 같은 OOM 위험). 이 함수가 실제로 보는 날짜는 각 성과 행의
// before/during 기간뿐이므로, 그 중 가장 이른 날짜를 먼저 계산해서 그 이후만 읽으면 됩니다.
// (performancePeriods/overridePeriods는 나중에 sumDailyPerformance가 쓰는 것과 똑같은
// 함수라 여기서 미리 불러도 결과가 어긋나지 않습니다 — 순수 날짜 계산이라 비용도 거의 없음.)
function earliestNeededDailyHistoryDate(performanceRows: any[], override?: PerformanceOverride): string {
  let earliest = "";
  for (const row of performanceRows) {
    const periods = overridePeriods(row, override) || performancePeriods(row);
    for (const d of [...(periods.beforeDates || []), ...(periods.duringDates || [])]) {
      if (!earliest || d < earliest) earliest = d;
    }
  }
  return earliest;
}

function targetStoreKeys(row: any) {
  const rawTargets: string[] = [];
  if (Array.isArray(row.toStores)) rawTargets.push(...row.toStores);
  if (row.toStore) rawTargets.push(...String(row.toStore).split(/[,/]/g));
  if (row.channel) rawTargets.push(String(row.channel));
  return [...new Set(rawTargets.map((v) => normalizeStoreKey(v)).filter(Boolean))];
}

function storeMatchesTarget(storeName: string, targets: string[]) {
  if (!targets.length) return true;
  const key = normalizeStoreKey(storeName);
  return targets.some((target) => key === target || key.includes(target) || target.includes(key));
}

function sumDailyPerformance(dailyRows: any[], row: any, dates: string[]) {
  const dateSet = new Set(dates);
  const targets = targetStoreKeys(row);
  const styleCode = text(row.styleCode);
  const isPromotion = row.category === "PROMOTION";

  const strict = dailyRows
    .filter((r) => dateSet.has(r.date))
    .filter((r) => !styleCode || r.styleCode === styleCode)
    // 프로모션은 오프라인 핵심매장만 집계합니다. 온라인/위탁은 제외합니다.
    .filter((r) => !isPromotion || isCoreOfflineSalesStore(r.storeName))
    // RT는 받는점포 기준으로 성과를 확인합니다. 여러 출고점에서 한 점포로 보낸 경우에도 받는점포만 봅니다.
    .filter((r) => row.category !== "RT" || storeMatchesTarget(r.storeName, targets))
    .reduce((acc, r) => {
      acc.qty += Number(r.qty || 0);
      acc.amount += Number(r.amount || 0);
      return acc;
    }, { qty: 0, amount: 0 });

  // 점포명 매핑 실패로 받는점포가 숫자 코드로 남으면 0이 될 수 있습니다.
  // 이 경우 화면을 0으로 죽이지 않고 스타일 기준 일별 수량을 보조로 사용하되, source에서 확인 가능하게 합니다.
  if (row.category === "RT" && targets.length && !strict.qty && !strict.amount) {
    const fallback = dailyRows
      .filter((r) => dateSet.has(r.date))
      .filter((r) => !styleCode || r.styleCode === styleCode)
      .reduce((acc, r) => {
        acc.qty += Number(r.qty || 0);
        acc.amount += Number(r.amount || 0);
        return acc;
      }, { qty: 0, amount: 0, fallback: true });
    return fallback;
  }

  return strict;
}

function applyDailyPerformance(rows: any[], dailyRows: any[], override?: PerformanceOverride, weeklyUnitPriceMap = new Map<string, number>()) {
  if (!dailyRows.length) return rows;

  return rows.map((row: any) => {
    const periods = overridePeriods(row, override) || performancePeriods(row);
    const before = sumDailyPerformance(dailyRows, row, periods.beforeDates);
    const during = sumDailyPerformance(dailyRows, row, periods.duringDates);

    // 시트에 값을 직접 입력한 경우에는 수동값을 우선합니다.
    // 비어있거나 0이면 Daily_Sales_History 기준 자동 계산값을 사용합니다.
    const beforeQty = row.category === "RT" ? before.qty : (Number(row.beforeQty || 0) || before.qty);
    const duringQty = row.category === "RT" ? during.qty : (Number(row.duringQty || 0) || during.qty);
    const weeklyUnitPrice = weeklyUnitPriceMap.get(text(row.styleCode)) || 0;
    // RT 금액은 Daily_Sales_History의 금액/단가를 쓰지 않습니다.
    // Daily는 실행 전/후 수량 추이만 담당하고, 단가는 금주/전주 시트(U/V 기준 평균판매가)에서 가져옵니다.
    const unitPrice = row.category === "RT" ? (weeklyUnitPrice || Number(row.salePrice || 0) || 0) : 0;
    const beforeAmount = row.category === "RT"
      ? beforeQty * unitPrice
      : (Number(row.beforeAmount || 0) || before.amount);
    const duringAmount = row.category === "RT"
      ? duringQty * unitPrice
      : (Number(row.duringAmount || 0) || during.amount);
    const addedQty = duringQty - beforeQty;
    const addedAmount = row.category === "RT" ? addedQty * unitPrice : duringAmount - beforeAmount;

    const rtQty = row.category === "RT" ? extractRtQty(row) : 0;
    const depletionRate = row.category === "RT" && rtQty ? (duringQty / rtQty) * 100 : 0;

    return {
      ...row,
      salePrice: row.category === "RT" ? unitPrice : row.salePrice,
      rtQty,
      depletionRate,
      rtGrade: row.category === "RT" && rtQty ? rtGrade(depletionRate) : "",
      // MARK 6.7: RT 호조/부진 엔진 구분(saleType=RT-호조/RT-부진)을 화면에서 쓰기 쉬운 필드로 노출합니다.
      // (아래 result의 "부진"은 실행 결과 평가 라벨이라 의미가 다릅니다 — 헷갈리지 않게 별도 필드로 둡니다.)
      moveType: row.category === "RT" ? (String(row.saleType || "").includes("점포요청") ? "점포요청" : String(row.saleType || "").includes("부진") ? "부진" : "호조") : "",
      beforeQty,
      duringQty,
      addedQty,
      beforeAmount,
      duringAmount,
      addedAmount,
      changeRate: beforeAmount ? ((duringAmount - beforeAmount) / beforeAmount) * 100 : duringAmount ? 100 : 0,
      result: addedAmount > 0 ? "성공" : addedAmount < 0 ? "부진" : "관찰",
      compareBasis: periods.basis,
      beforePeriodLabel: periods.beforeLabel || "",
      duringPeriodLabel: periods.duringLabel || "",
      beforeDates: periods.beforeDates,
      duringDates: periods.duringDates,
      performanceSource: (before as any).fallback || (during as any).fallback ? "Daily_Sales_History(style fallback)" : (before.amount || during.amount || before.qty || during.qty ? "Daily_Sales_History" : "Manual/Empty"),
    };
  });
}


function buildPerformanceSummary(rows: any[]) {
  const dates = [...new Set(rows.map((r: any) => r.startDate).filter(Boolean))].sort().reverse();
  const byDate: Record<string, any> = {};

  for (const date of dates) {
    const dateRows = rows.filter((r: any) => r.startDate === date);
    const totalAddedAmount = dateRows.reduce((s: number, r: any) => s + Number(r.addedAmount || 0), 0);
    const totalBeforeAmount = dateRows.reduce((s: number, r: any) => s + Number(r.beforeAmount || 0), 0);
    const totalDuringAmount = dateRows.reduce((s: number, r: any) => s + Number(r.duringAmount || 0), 0);
    const totalAddedQty = dateRows.reduce((s: number, r: any) => s + Number(r.addedQty || 0), 0);
    const successCount = dateRows.filter((r: any) => Number(r.addedAmount || 0) > 0).length;

    const byCategory = ["RT", "PROMOTION"].map((category) => {
      const items = dateRows.filter((r: any) => r.category === category);
      const addedAmount = items.reduce((s: number, r: any) => s + Number(r.addedAmount || 0), 0);
      const beforeAmount = items.reduce((s: number, r: any) => s + Number(r.beforeAmount || 0), 0);
      const duringAmount = items.reduce((s: number, r: any) => s + Number(r.duringAmount || 0), 0);
      const addedQty = items.reduce((s: number, r: any) => s + Number(r.addedQty || 0), 0);
      const success = items.filter((r: any) => Number(r.addedAmount || 0) > 0).length;

      return {
        category,
        count: items.length,
        beforeAmount,
        duringAmount,
        addedAmount,
        addedQty,
        rtQty: items.reduce((s: number, r: any) => s + Number(r.rtQty || 0), 0),
        avgDepletionRate: category === "RT" && items.length ? items.reduce((s: number, r: any) => s + Number(r.depletionRate || 0), 0) / items.length : 0,
        successRate: items.length ? (success / items.length) * 100 : 0,
        topItems: [...items].sort((a: any, b: any) => Number(b.addedAmount || 0) - Number(a.addedAmount || 0)).slice(0, 5),
      };
    });

    byDate[date] = {
      startDate: date,
      count: dateRows.length,
      beforeAmount: totalBeforeAmount,
      duringAmount: totalDuringAmount,
      addedAmount: totalAddedAmount,
      addedQty: totalAddedQty,
      successRate: dateRows.length ? (successCount / dateRows.length) * 100 : 0,
      byCategory,
      rows: [...dateRows].sort((a: any, b: any) => Number(b.addedAmount || 0) - Number(a.addedAmount || 0)),
    };
  }

  return {
    dates,
    latestDate: dates[0] || "",
    byDate,
    rows,
  };
}

// MARK 6.9: 점포에서 직접 요청한 RT — 품번+요청점포를 받아서 어디서 이동하면 좋을지 제안합니다.
// 호조/부진 자동 엔진과 별개로, 담당자가 수동으로 입력한 요청 1건에 대해 즉시 계산합니다.
// 특정 매장 row에서, 주어진 칼라코드에 해당하는 재고/주간판매를 skuRows에서 합산합니다.
// (금주/전주 시트는 칼라+사이즈별로 skuRows에 상세를 보존하고 있습니다.)
function colorLevelStats(row: any, colorCode: string) {
  const target = text(colorCode).toUpperCase();
  const matches = (row.skuRows || []).filter((s: any) => text(s.color).toUpperCase() === target);
  const stock = matches.reduce((sum: number, s: any) => sum + Number(s.stock || 0), 0);
  const weekNet = matches.reduce((sum: number, s: any) => sum + Number(s.weekNet || 0), 0);
  const colorName = matches[0]?.colorName || "";
  return { stock, weekNet, colorName, found: matches.length > 0 };
}

function todayKST() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysKST(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// MARK 6.49: "금주/전주" 시트(주 1회 갱신, 최대 6일 지연) 대신 Daily_Sales_History(매일 갱신,
// 실제 판매금액 포함)를 직접 집계해서 RT제안/재고이관/프로모션제안이 쓰는 것과 같은 모양의
// productRows를 만듭니다. 재고(storeStock)는 합산이 아니라 "그 기간 중 가장 최근 날짜의 값"을
// 씁니다(재고는 누적이 아니라 스냅샷이라서). 입고일은 Style_Launch_Master에서 보완합니다.
//
// MARK 2026-09-21: "점포요청 RT — 재고가 있는데 0장이라고 나와" 버그 조사 — Daily_Sales_History는
// "그날 팔린 것만" 한 줄로 남기는 판매이력 시트라서(하루도 안 팔린 컬러/사이즈는 그 날짜엔
// 아예 행 자체가 없음), weekNet 계산 창(기본 2주)과 똑같은 기간만 읽으면 최근에 딱 안 팔린
// 재고는 "데이터가 없어서" 0으로 보였습니다(실제 창고엔 있는데도).
//
// 처음엔 이 함수 전체의 읽기 구간을 45일로 넓혔는데, 이 함수는 호조/부진 RT 엔진과 전사지시
// (여기는 원래도 회사 전체 23개 매장 데이터를 한 번에 읽는 무거운 호출)에서도 공용으로
// 쓰이는 함수라, 모든 호출부가 다 같이 45일치를 읽게 되면서 오히려 /api/data와 다른 RT
// 탭까지 같이 느려지고 타임아웃(500)이 나는 부작용이 있었습니다(소천님이 실제로 겪으신
// "제안 계산 실패" + "너무 많아서 500 뜨는 것 같다"가 바로 이것이었습니다). 그래서 기본
// 동작은 원래대로(windowDays 기준, 보통 2주)로 되돌리고, 재고 조회 구간을 넓히는 건
// stockLookbackDays 파라미터로 옵션화해서 실제로 필요한 곳(점포요청 RT 하나)에서만,
// 그것도 45일이 아니라 21일(store-stock-lookup에서 이미 검증된 폭)로 좁혀서 켭니다 —
// 나머지 호출부(호조/부진/전사지시/추이)는 예전과 완전히 동일한 속도를 유지합니다.
//
// 스타일 단위 storeStock을 "그 스타일의 아무 SKU나 마지막에 스캔된 값 하나"로 덮어쓰던
// 버그도 고쳐서, 실제로는 skuRows(컬러+사이즈별로 정확히 추적된 재고)의 합계를 쓰도록
// 했습니다 — 한 스타일에 컬러/사이즈가 여럿이면 예전엔 그중 하나만 반영되고 나머지는
// 무시되고 있었습니다. 이건 읽는 데이터량과 무관한 순수 계산 버그라 항상 켜둡니다.
export async function buildProductRowsFromDailyHistory(anchorDate = todayKST(), windowDays = 7, stockLookbackDays?: number) {
  const weekEnd = anchorDate;
  const weekStart = addDaysKST(weekEnd, -(windowDays - 1));
  const prevWeekEnd = addDaysKST(weekStart, -1);
  const prevWeekStart = addDaysKST(prevWeekEnd, -(windowDays - 1));
  // stockLookbackDays가 주어진 호출부만 재고 조회 구간을 prevWeekStart보다 더 과거까지 넓힙니다
  // (기본값 없음 = 예전과 동일한 동작, 다른 호출부에 영향 없음).
  const stockLookbackStart = stockLookbackDays ? addDaysKST(weekEnd, -(stockLookbackDays - 1)) : prevWeekStart;
  const readSince = stockLookbackStart < prevWeekStart ? stockLookbackStart : prevWeekStart;

  // loadDashboardDailyHistory와 같은 이유(전체 읽기 OOM)로, 이 함수가 실제로 쓰는 구간
  // (readSince~weekEnd)만 읽습니다. 시트 이름이 고정된 "Daily_Sales_History"라
  // 포맷(압축)이 항상 보장되므로 바로 지름길을 씁니다.
  const historyId = getHistorySheetId();
  const range = await findDailyHistoryRowRangeIn(historyId, "Daily_Sales_History", readSince, weekEnd);
  let raw: any[][];
  if (range) {
    const tailRows = await getSheetValuesById(historyId, "Daily_Sales_History", `A${range.startRow}:ZZ${range.endRow}`).catch(() => [] as any[]);
    raw = [DAILY_HISTORY_HEADER, ...tailRows];
  } else {
    // MARK 2026-09-15: startRow를 못 찾은 건 "그 기간엔 데이터가 없다"는 뜻이라, 예전처럼
    // 전체("A:ZZ")를 다시 읽지 않고 빈 결과로 안전하게 넘어갑니다(findDailyHistoryRowRangeIn
    // 참고 — 최근 3만 행 안에서도 못 찾았다면 실제로 데이터가 없는 것과 같습니다).
    raw = [DAILY_HISTORY_HEADER];
  }
  const flatRows = expandAnyDailyHistoryRows(raw || []);
  const launchMap = await loadStyleLaunchMap().catch(() => new Map<string, string>());

  const grouped = new Map<string, any>();
  const latestStockDateBySku = new Map<string, string>();

  for (const r of flatRows) {
    if (r.date < readSince || r.date > weekEnd) continue;
    if (!isCoreOfflineSalesStore(r.storeName)) continue;

    const storeKey = normalizeStoreKey(r.storeName);
    const key = `${storeKey}__${r.styleCode}`;
    if (!grouped.has(key)) {
      const launchDate = launchMap.get(r.styleCode) || "";
      grouped.set(key, {
        season: "미지정",
        storeName: r.storeName,
        storeKey,
        styleCode: r.styleCode,
        productName: r.productName,
        storeStock: 0,
        weekNet: 0,
        weekAmount: 0,
        prevNet: 0,
        prevAmount: 0,
        launchDate,
        launchTime: launchDate ? new Date(launchDate).getTime() : 0,
        skuRows: [] as any[],
      });
    }
    const item = grouped.get(key);

    if (r.date >= weekStart && r.date <= weekEnd) {
      item.weekNet += Number(r.qty || 0);
      item.weekAmount += Number(r.amount || 0);
    } else if (r.date >= prevWeekStart && r.date <= prevWeekEnd) {
      item.prevNet += Number(r.qty || 0);
      item.prevAmount += Number(r.amount || 0);
    }

    // 컬러/사이즈별 상세 (skuRows) — RT 컬러 지정 이관에 쓰임 (기존 parseProducts와 같은 필드명 사용)
    let sku = item.skuRows.find((s: any) => s.color === r.colorCode && s.size === r.size);
    if (!sku) {
      sku = { color: r.colorCode, colorName: r.colorName, size: r.size, stock: 0, weekNet: 0, weekAmount: 0, prevNet: 0, prevAmount: 0 };
      item.skuRows.push(sku);
    }
    if (r.date >= weekStart && r.date <= weekEnd) {
      sku.weekNet += Number(r.qty || 0);
      sku.weekAmount += Number(r.amount || 0);
    } else if (r.date >= prevWeekStart && r.date <= prevWeekEnd) {
      sku.prevNet += Number(r.qty || 0);
      sku.prevAmount += Number(r.amount || 0);
    }

    // 재고는 "가장 최근 날짜"의 값만 사용 (합산 금지 — 스냅샷 성격). SKU(컬러+사이즈) 단위로
    // 정확히 추적하고, 스타일 전체 재고(storeStock)는 아래 루프 종료 후 skuRows 합계로 구합니다
    // (스타일 하나에 컬러/사이즈가 여럿인데 "마지막으로 스캔된 SKU 하나"만 반영되던 버그 수정).
    const skuKey = `${key}__${r.colorCode}__${r.size}`;
    const lastSkuDate = latestStockDateBySku.get(skuKey);
    if (!lastSkuDate || r.date > lastSkuDate) {
      latestStockDateBySku.set(skuKey, r.date);
      sku.stock = Number(r.stock || 0);
    }
  }

  const result = Array.from(grouped.values());
  for (const item of result) {
    item.storeStock = item.skuRows.reduce((sum: number, sku: any) => sum + Number(sku.stock || 0), 0);
  }
  return result;
}

// MARK 2026-09-17: "재고컨트롤 > 판매분 배분" 탭 — 사용자가 고른 기간에 매장별로 팔린
// 수량만큼(배분율 적용) 물류(창고)에서 매장으로 보충 지시수량을 계산합니다.
// Daily_Sales_History를 이 세션에서 이미 여러 번 겪은 OOM 문제와 같은 방식(시작행+끝행만
// 찾아서 딱 그 구간만 읽기)으로 읽고, 전사 TOP50(기간 내 판매량 기준) 품번까지만 다룹니다.
const SALES_ALLOCATION_MAX_RANGE_DAYS = 90;
const SALES_ALLOCATION_STYLE_LIMIT = 50;

async function readSalesAllocationFlatRows(startDate: string, endDate: string) {
  const historyId = getHistorySheetId();
  const range = await findDailyHistoryRowRangeIn(historyId, "Daily_Sales_History", startDate, endDate);
  let raw: any[][];
  if (range) {
    const tailRows = await getSheetValuesById(historyId, "Daily_Sales_History", `A${range.startRow}:ZZ${range.endRow}`).catch(() => [] as any[]);
    raw = [DAILY_HISTORY_HEADER, ...tailRows];
  } else {
    // 그 기간엔 데이터가 없다는 뜻 — 예전처럼 전체를 다시 읽지 않고 빈 결과로 넘어갑니다.
    raw = [DAILY_HISTORY_HEADER];
  }
  return expandAnyDailyHistoryRows(raw || []);
}

export async function buildSalesAllocationPlan(startDateInput: string, endDateInput: string, ratioPercentInput?: number) {
  const startDate = normalizeDateKey(startDateInput);
  const endDate = normalizeDateKey(endDateInput) || startDate;
  if (!startDate || !endDate) throw new Error("기간을 올바르게 선택해주세요.");
  if (startDate > endDate) throw new Error("시작일이 종료일보다 늦을 수 없습니다.");

  const spanDays = Math.round(((parseDate(endDate) as Date).getTime() - (parseDate(startDate) as Date).getTime()) / 86400000) + 1;
  if (spanDays > SALES_ALLOCATION_MAX_RANGE_DAYS) {
    throw new Error(`기간은 최대 ${SALES_ALLOCATION_MAX_RANGE_DAYS}일까지 선택할 수 있습니다(지금 ${spanDays}일).`);
  }

  const ratioPercent = [50, 100, 150, 200].includes(Number(ratioPercentInput)) ? Number(ratioPercentInput) : 100;

  const flatRows = await readSalesAllocationFlatRows(startDate, endDate);

  // 1) 전사(핵심 오프라인 매장 전체) 기준 스타일별 기간 판매량 — TOP50 선정 + "전매장누계판매" 값으로 재사용.
  const companyStyleTotals = new Map<string, { productName: string; qty: number }>();
  // 2) 매장×스타일 집계(기간판매량, 매장재고는 그 기간 중 가장 최근 스냅샷) + 매장×스타일×컬러×사이즈 집계.
  const byStoreStyle = new Map<string, any>();
  const latestStockByKey = new Map<string, string>();
  const latestStockBySku = new Map<string, string>();

  for (const r of flatRows) {
    if (r.date < startDate || r.date > endDate) continue;
    if (!isCoreOfflineSalesStore(r.storeName)) continue;
    const qty = Number(r.qty || 0);

    const companyTotal = companyStyleTotals.get(r.styleCode) || { productName: r.productName, qty: 0 };
    companyTotal.qty += qty;
    if (!companyTotal.productName && r.productName) companyTotal.productName = r.productName;
    companyStyleTotals.set(r.styleCode, companyTotal);

    const storeKey = normalizeStoreKey(r.storeName);
    const key = `${storeKey}__${r.styleCode}`;
    if (!byStoreStyle.has(key)) {
      byStoreStyle.set(key, {
        storeName: r.storeName,
        storeKey,
        styleCode: r.styleCode,
        productName: r.productName,
        periodQty: 0,
        storeStock: 0,
        skuRows: [] as any[],
      });
    }
    const item = byStoreStyle.get(key);
    item.periodQty += qty;
    if (!item.productName && r.productName) item.productName = r.productName;

    const lastStyleDate = latestStockByKey.get(key);
    if (!lastStyleDate || r.date > lastStyleDate) {
      latestStockByKey.set(key, r.date);
      item.storeStock = Number(r.stock || 0);
    }

    let sku = item.skuRows.find((s: any) => s.color === r.colorCode && s.size === r.size);
    if (!sku) {
      sku = { color: r.colorCode, colorName: r.colorName, size: r.size, periodQty: 0, stock: 0 };
      item.skuRows.push(sku);
    }
    sku.periodQty += qty;
    const skuKey = `${key}__${r.colorCode}__${r.size}`;
    const lastSkuDate = latestStockBySku.get(skuKey);
    if (!lastSkuDate || r.date > lastSkuDate) {
      latestStockBySku.set(skuKey, r.date);
      sku.stock = Number(r.stock || 0);
    }
  }

  // 전사 판매량 기준 TOP50만 남깁니다 — 기간을 아무리 길게 잡아도 화면/엑셀이 무거워지지 않도록.
  const topStyleCodes = new Set(
    Array.from(companyStyleTotals.entries())
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, SALES_ALLOCATION_STYLE_LIMIT)
      .map(([styleCode]) => styleCode)
  );

  // 물류(창고) 가용재고 — 담당자가 업로드해둔 "온오프재고현황" 압축 스냅샷에서 가져옵니다
  // (라이브 시트를 매번 통째로 읽지 않아 가볍고, 온/오프 합계가 아니라 가용(오프)만 정확히 읽습니다).
  // 스타일 누적판매(전체기간, 기간 필터와 무관)는 "스타일별 채널별" 업로드 마스터 시트에서 가져옵니다.
  const [warehouseSnapshot, productRaw] = await Promise.all([
    readWarehouseStockSnapshot(),
    readFirstAvailableSheet(
      [getDailySourceSheetId(), getDbSheetId(), getSheetId()],
      ["스타일별 채널별 입고판매재고현황"],
      "A:AZ"
    ).catch(() => ({ rows: [] as any[] })),
  ]);
  const skuStockMap = new Map(
    warehouseSnapshot.rows.map((r) => [`${r.styleCode}__${r.color}__${r.size}`, r.offlineStock])
  );
  const warehouseSnapshotAvailable = warehouseSnapshot.rows.length > 0;

  const productMaster = buildProductMaster(expandStyleChannelRows(productRaw.rows || []));
  const cumulativeSalesAvailable = productMaster.byStyle.size > 0;

  const rows = Array.from(byStoreStyle.values()).filter((r) => topStyleCodes.has(r.styleCode));

  // "지시후물류유효재고"는 같은 스타일×컬러×사이즈를 여러 매장이 함께 나눠 쓰는 공용 창고
  // 재고이므로, 그 SKU에 걸린 모든 매장의 지시수량을 합산해서 한 번만 차감해야 정확합니다.
  const skuOrderedTotal = new Map<string, number>();

  const planRows: any[] = [];
  for (const r of rows) {
    const companyQty = companyStyleTotals.get(r.styleCode)?.qty || 0;
    const cumulativeQty = productMaster.byStyle.get(r.styleCode)?.cumulativeSalesQty;

    for (const sku of r.skuRows) {
      // "기간판매가 0인건 제외해달라" 요청 — 재고 스냅샷만 있고 그 기간엔 안 팔린 SKU는 뺍니다.
      if (!sku.periodQty) continue;

      const orderQty = Math.max(0, Math.round(sku.periodQty * (ratioPercent / 100)));
      const skuKey = `${r.styleCode}__${sku.color}__${sku.size}`;
      const hasWarehouseStock = skuStockMap.has(skuKey);
      const skuWarehouseStock = hasWarehouseStock ? skuStockMap.get(skuKey)! : null;

      skuOrderedTotal.set(skuKey, (skuOrderedTotal.get(skuKey) || 0) + orderQty);

      planRows.push({
        storeName: r.storeName,
        styleCode: r.styleCode,
        productName: r.productName,
        color: sku.color,
        colorName: sku.colorName,
        size: sku.size,
        periodQty: sku.periodQty,
        companyPeriodQty: companyQty,
        cumulativeSalesQty: cumulativeQty ?? null,
        storePeriodQty: r.periodQty,
        storeStock: sku.stock,
        warehouseStock: skuWarehouseStock,
        orderQty,
        skuKey,
      });
    }
  }

  // 최종 "지시후" 값들을 채웁니다(같은 SKU의 다른 매장 지시수량까지 다 합산된 뒤).
  for (const row of planRows) {
    row.storeStockAfter = row.storeStock + row.orderQty;
    if (row.warehouseStock === null) {
      row.warehouseStockAfter = null;
    } else {
      const totalOrdered = skuOrderedTotal.get(row.skuKey) || 0;
      row.warehouseStockAfter = row.warehouseStock - totalOrdered;
    }
    delete row.skuKey;
  }

  planRows.sort((a, b) => {
    const rankDiff = (companyStyleTotals.get(b.styleCode)?.qty || 0) - (companyStyleTotals.get(a.styleCode)?.qty || 0);
    if (rankDiff) return rankDiff;
    if (a.styleCode !== b.styleCode) return a.styleCode < b.styleCode ? -1 : 1;
    if (a.storeName !== b.storeName) return a.storeName.localeCompare(b.storeName, "ko");
    return a.size.localeCompare(b.size);
  });

  // MARK 2026-09-17: "??"는 daily-snapshot.js가 아직 이름을 확정 못한 사이즈 슬롯(SIZE_6 이상)
  // 표시입니다(store-stock-lookup/route.ts의 같은 문구 참고) — 이 탭의 버그가 아니라 상위 ERP
  // 스냅샷 단계의 기존 데이터 이슈라, 조용히 숨기지 않고 화면에 안내 문구로 알려줍니다.
  // 실제로 화면에 나온(TOP50 + 기간판매>0 필터를 통과한) 품번만 셉니다.
  const sizeUnknownStyleCount = new Set(planRows.filter((r) => r.size === "??").map((r) => r.styleCode)).size;

  return {
    startDate,
    endDate,
    ratioPercent,
    styleCount: topStyleCodes.size,
    warehouseSnapshotAvailable,
    warehouseUpdatedAt: warehouseSnapshot.meta?.uploadedAt || null,
    warehouseRowCount: warehouseSnapshot.meta?.rowCount || 0,
    cumulativeSalesAvailable,
    sizeUnknownStyleCount,
    rows: planRows,
  };
}

// MARK 2026-09-21: store-stock-lookup/route.ts가 이미 21일 폭으로 검증해서 쓰고 있는 것과
// 같은 값입니다 — 45일까지 넓혔다가 회사 전체(23개 매장) 데이터량이 너무 커져서 실제로
// "제안 계산 실패"(타임아웃/500)가 나는 걸 확인하고 21일로 되돌렸습니다.
const RT_REQUEST_STOCK_LOOKBACK_DAYS = 21;

// MARK 2026-09-21: "점포요청 RT 재고랑 판매를 어디서 보고 있는 거야? 너무 부정확한 거 같아"
// — 재고 소스를 Daily_Sales_History(판매된 것만 기록되는 판매이력) 하나에서, 소천님이
// 매일 아침 올리시는 PIP 파일 기반 매장별 재고 스냅샷(readStoreStockSnapshot, 있으면)을
// 최우선으로 쓰도록 바꿨습니다. PIP는 실제 매장별 재고 전체를 담고 있어서(안 팔린 것 포함)
// Daily_Sales_History보다 훨씬 정확하고, "최근에 안 팔린 매장"도 후보에서 빠지지 않습니다
// (이게 바로 "재고가 있는데 0으로 나온다"던 원래 버그의 진짜 원인이었습니다 — Daily_Sales_History는
// 그 매장이 최근에 이 품번을 한 번도 안 팔았으면 데이터 자체가 없었음). 판매 페이스(weekNet,
// 안전재고 계산용)는 여전히 Daily_Sales_History에서 가져옵니다 — PIP는 재고 스냅샷이라
// 판매 추이 데이터를 담고 있지 않습니다. PIP 스냅샷이 아직 없거나 이 품번이 PIP에 없으면
// 예전처럼 Daily_Sales_History만으로 추정하고 "확인 안됨"으로 표시합니다.
export async function buildRtRequestSuggestion(styleCodeInput: string, toStoreInput: string, desiredQtyInput?: number, colorInput?: string) {
  const styleCode = text(styleCodeInput).toUpperCase();
  if (!styleCode) return { ok: false, error: "품번을 입력해주세요." };
  if (!text(toStoreInput)) return { ok: false, error: "요청 점포를 입력해주세요." };

  // MARK 2026-09-21: "21030이 성수 플래그십인데 성수를 아예 인식 못하는 것 같아" — 요청 점포에
  // 매장명 대신 ERP 채널코드("21030" 등)를 입력하는 경우가 있는데, 이 함수는 productRowsRaw의
  // storeName(매장명 문자열)과 직접 normalizeStoreKey 비교만 하고 있어서 코드로 입력하면 그
  // 매장을 전혀 못 찾고 있었습니다(RT_Result 저장 때 쓰는 rt-result/route.ts의
  // channelCodeMap과 동일한 문제). getStoreCodeNameMap()이 이미 "객_전주" 시트 기준 코드→매장명
  // 매핑을 제공하고(21030→성수 플래그십 등 자주 쓰는 코드는 fallback까지 갖춰둠) 있으므로,
  // 코드로 입력된 경우 먼저 매장명으로 변환해서 나머지 로직은 그대로 매장명 기준으로 동작하게 합니다.
  const [productRowsRaw, storeCodeNameMap, storeStockSnapshot] = await Promise.all([
    buildProductRowsFromDailyHistory(todayKST(), 7, RT_REQUEST_STOCK_LOOKBACK_DAYS),
    getStoreCodeNameMap().catch(() => new Map<string, string>()),
    readStoreStockSnapshot().catch(() => ({ rows: [] as StoreStockSnapshotRow[], meta: null })),
  ]);
  const resolvedToStoreInput =
    storeCodeNameMap.get(text(toStoreInput)) || storeCodeNameMap.get(normalizeStoreKey(toStoreInput)) || toStoreInput;

  const colorCode = text(colorInput).toUpperCase();
  const useColor = !!colorCode;

  const pipRowsForStyleAllColors = storeStockSnapshot.rows.filter((r) => r.styleCode.toUpperCase() === styleCode);
  const styleInPip = pipRowsForStyleAllColors.length > 0;
  const pipRowsForStyle = useColor ? pipRowsForStyleAllColors.filter((r) => r.color.toUpperCase() === colorCode) : pipRowsForStyleAllColors;

  const coreRows = productRowsRaw.filter(
    (r: any) => isCoreOfflineSalesStore(r.storeName) && text(r.styleCode).toUpperCase() === styleCode
  );
  const salesByStoreKey = new Map(coreRows.map((r: any) => [normalizeStoreKey(r.storeName), r]));

  if (useColor) {
    const colorExistsAnywhere =
      pipRowsForStyleAllColors.some((r) => r.color.toUpperCase() === colorCode) ||
      coreRows.some((r: any) => colorLevelStats(r, colorCode).found);
    if (!colorExistsAnywhere) {
      return { ok: false, error: `품번 "${styleCodeInput}"에서 칼라 "${colorInput}"를 찾지 못했습니다. 칼라코드를 다시 확인해주세요.` };
    }
  }

  // 후보 매장 목록: PIP에 이 품번이 있으면 PIP 스냅샷 전체(모든 매장, 이 품번과 무관하게)에
  // 등장하는 매장 목록을 씁니다 — Daily_Sales_History 기준으로만 후보를 뽑던 예전 방식은
  // "이 품번을 최근에 안 판 매장"을 후보에서 통째로 제외해버렸는데, 점포요청은 오히려 그런
  // 매장(재고는 있는데 최근 안 팔린 곳)에서 받아오려는 경우가 많았습니다.
  const candidateStoreNames = styleInPip
    ? Array.from(new Set(storeStockSnapshot.rows.map((r) => r.storeName))).filter((name) => isCoreOfflineSalesStore(name))
    : Array.from(new Set(coreRows.map((r: any) => r.storeName)));

  if (!candidateStoreNames.length) {
    return { ok: false, error: `품번 "${styleCodeInput}"${useColor ? `(칼라 ${colorInput})` : ""}에 대한 매장별 재고/판매 데이터를 찾지 못했습니다. 품번을 다시 확인해주세요.` };
  }

  function pipStockForStore(storeName: string): number | null {
    const key = normalizeStoreKey(storeName);
    const matches = pipRowsForStyle.filter((r) => normalizeStoreKey(r.storeName) === key);
    if (!matches.length) return null; // PIP에 이 매장의 해당 SKU 행이 없음 = 재고 0(스냅샷이 nonzero만 담고 있음)
    return matches.reduce((s, r) => s + r.stock, 0);
  }
  function weekNetForStore(storeName: string): number {
    const row = salesByStoreKey.get(normalizeStoreKey(storeName));
    if (!row) return 0;
    return useColor ? colorLevelStats(row, colorCode).weekNet : Number(row.weekNet || 0);
  }
  // 재고: PIP에 이 품번이 있으면(styleInPip) PIP를 확정값으로 쓰고(행이 없으면 확인된 0),
  // 없으면 예전처럼 Daily_Sales_History에서 추정하되 "확인 안됨"으로 표시합니다.
  function stockForStore(storeName: string): { stock: number; confirmed: boolean } {
    if (styleInPip) {
      return { stock: pipStockForStore(storeName) ?? 0, confirmed: true };
    }
    const row = salesByStoreKey.get(normalizeStoreKey(storeName));
    if (!row) return { stock: 0, confirmed: false };
    const stats = useColor ? colorLevelStats(row, colorCode) : null;
    const stock = useColor ? (stats?.stock || 0) : Number(row.storeStock || 0);
    const confirmed = useColor ? !!stats?.found : true;
    return { stock, confirmed };
  }

  const toStoreName = resolvedToStoreInput;
  const { stock: toStock, confirmed: toStockConfirmed } = stockForStore(toStoreName);
  const toWeekNet = weekNetForStore(toStoreName);
  const toStockWeeks = toWeekNet > 0 ? toStock / toWeekNet : toStock > 0 ? 999 : 0;
  const productName = pipRowsForStyleAllColors[0]?.productName || coreRows[0]?.productName || "";
  const resolvedColorName = useColor
    ? (pipRowsForStyle[0]?.colorName || coreRows.map((r: any) => colorLevelStats(r, colorCode).colorName).find(Boolean) || "")
    : "";

  // 호조 엔진과 동일한 "목표재고 3주" 기준을 기본값으로 사용하되, 사용자가 수량을 직접 지정하면 그걸 우선합니다.
  const RT_TARGET_STOCK_WEEKS = 3;
  const defaultTarget = Math.max(1, Math.ceil(toWeekNet * RT_TARGET_STOCK_WEEKS));
  const desiredQty = desiredQtyInput && desiredQtyInput > 0
    ? Math.round(desiredQtyInput)
    : Math.max(1, defaultTarget - toStock);

  const toKey = normalizeStoreKey(toStoreName);
  const senderCandidates = candidateStoreNames
    .filter((name) => normalizeStoreKey(name) !== toKey)
    .map((name) => {
      const { stock } = stockForStore(name);
      const weekNet = weekNetForStore(name);
      const targetStock = Math.max(1, Math.ceil(weekNet * RT_TARGET_STOCK_WEEKS));
      const safeStock = Math.max(3, targetStock, Math.ceil(weekNet * 2));
      const transferable = Math.max(0, Math.floor(stock - safeStock));
      const stockWeeks = weekNet > 0 ? stock / weekNet : stock > 0 ? 999 : 0;
      return { storeName: name, stock, weekNet, stockWeeks, transferable };
    })
    .filter((r) => r.transferable > 0)
    .sort((a, b) => b.transferable - a.transferable || b.stockWeeks - a.stockWeeks);

  let remaining = desiredQty;
  const suggestions: any[] = [];
  for (const s of senderCandidates) {
    if (remaining <= 0) break;
    const qty = Math.min(remaining, s.transferable);
    if (qty <= 0) continue;

    suggestions.push({
      styleCode,
      colorCode: useColor ? colorCode : "",
      colorName: resolvedColorName,
      productName,
      fromStore: s.storeName,
      toStore: toStoreName,
      suggestQty: qty,
      fromStock: s.stock,
      fromStockWeeks: s.stockWeeks,
      toStock,
      toStockWeeks,
      moveType: "점포요청",
      companyRank: 0,
      reason: [
        `${toStoreName} 매장에서 품번 ${styleCode}${useColor ? `(칼라 ${colorCode}${resolvedColorName ? " " + resolvedColorName : ""})` : ""} 이동을 직접 요청했습니다.`,
        `목표 수량은 ${desiredQty}개이며, 이 중 ${qty}개를 ${s.storeName}에서 이동하는 안입니다.`,
        `${s.storeName}의 현재 재고는 ${Math.round(s.stock).toLocaleString("ko-KR")}개(재고주수 ${s.stockWeeks >= 999 ? "판매없음" : `${s.stockWeeks.toFixed(1)}주`})로, 자체 안전재고를 제외한 이동 가능 여유분입니다.`,
        styleInPip ? "" : `⚠ PIP 재고 스냅샷에서 이 품번을 찾지 못해, 최근 ${RT_REQUEST_STOCK_LOOKBACK_DAYS}일 판매이력으로 추정한 값입니다.`,
        toStockConfirmed ? "" : `⚠ ${toStoreName}은 최근 ${RT_REQUEST_STOCK_LOOKBACK_DAYS}일간 이 품번(칼라) 판매 이력이 없어 재고 데이터를 찾지 못했습니다 — 목표수량 계산에 쓰인 "현재 재고 0"은 확인된 값이 아니니, 실제 재고를 매장에 다시 확인해주세요.`,
      ].filter(Boolean).join("\n"),
    });
    remaining -= qty;
  }

  return {
    ok: true,
    styleCode,
    colorCode: useColor ? colorCode : "",
    colorName: resolvedColorName,
    productName,
    toStore: toStoreName,
    toStock,
    toStockWeeks,
    toStockConfirmed,
    stockSource: styleInPip ? "pip" : "daily_sales_history",
    pipUpdatedAt: storeStockSnapshot.meta?.uploadedAt || null,
    desiredQty,
    fulfilledQty: desiredQty - remaining,
    shortfall: Math.max(0, remaining),
    suggestions,
  };
}


export async function buildPerformanceAnalysis(override: PerformanceOverride = {}) {
  try {
    const dbId = getDbSheetId();
    const historyId = getHistorySheetId();
    const mainId = getSheetId();

    // MARK 2026-09-22: 아래 여러 read가 다 같이 참조하도록 맨 위로 끌어올렸습니다 — override만
    // 보면 바로 알 수 있는 값이라 데이터를 먼저 읽을 필요가 없습니다. 성과분석 화면에서 사용자가
    // 직접 날짜를 고른 경우(hasExplicitDateFilter=true)는 정확한 과거 조회가 우선이라 지금처럼
    // 전체를 읽고, 대시보드가 "날짜 필터 없이" 블라인드로 부르는 경우에만 아래 Promotion_Performance
    // /RT_Result 읽기도 "최근 N행"으로 좁힙니다(바로 아래 PERFORMANCE_LOG_BLIND_TAIL_ROWS 참고).
    const hasExplicitDateFilter = !!(override.selectedDate || override.beforeStart || override.duringStart);

    const dbTitles = await getSpreadsheetTitlesById(dbId);
    const historyTitles = await getSpreadsheetTitlesById(historyId).catch(() => []);
    const mainTitles = await getSpreadsheetTitlesById(mainId).catch(() => []);

    // MARK 2026-09-22: Promotion_Performance는 RT/프로모션 지시마다 계속 쌓이기만 하는 로그라,
    // 대시보드의 블라인드 호출(날짜 필터 없음)에서 매번 전체("A:AZ")를 읽으면 시트가 커질수록
    // OOM 위험이 커집니다 — 바로 아래 RT_Result, 그리고 이 파일의 Daily_Sales_History/금주전주가
    // 이미 겪은 것과 같은 패턴입니다. 사용자가 성과분석 화면에서 직접 날짜를 고른 경우엔 예전처럼
    // 전체를 읽어 정확한 과거 조회를 보장하고, 블라인드 호출일 때만 "최근 2만 행"으로 좁힙니다.
    const PERFORMANCE_LOG_BLIND_TAIL_ROWS = 20000;
    const performanceSheetName = pickNormalizedTitle(dbTitles, ["Promotion_Performance", "프로모션성과", "RT프로모션성과"], "Promotion_Performance");
    const performanceValues = performanceSheetName && dbTitles.includes(performanceSheetName)
      ? hasExplicitDateFilter
        ? await getSheetValuesById(dbId, performanceSheetName, "A:AZ")
        : await readRecentTailRowsById(dbId, performanceSheetName, "A:AZ", PERFORMANCE_LOG_BLIND_TAIL_ROWS, 20)
      : [];

    const basePerformanceRows = parsePerformanceRows(performanceValues || []);
    const productNameMap = new Map<string, string>();
    for (const row of basePerformanceRows as any[]) {
      const style = text(row.styleCode);
      const productName = text(row.productName);
      if (style && productName) productNameMap.set(style, productName);
    }

    // MARK 2026-09: RT_Result/채널 읽기를 Daily_Sales_History 읽기보다 먼저 하도록 순서를
    // 바꿨습니다 — performanceRows(RT/프로모션 성과 행)의 실제 시작일들을 먼저 알아야, 그 아래
    // Daily_Sales_History 읽기를 "필요한 기간만"으로 좁힐 수 있기 때문입니다.
    // MARK 2026-09-22: RT_Result도 Promotion_Performance와 같은 이유(계속 쌓이는 로그)로,
    // 블라인드 호출일 때만 "최근 2만 행"으로 좁힙니다.
    const rtSheetName = mainTitles.includes("RT_Result") ? "RT_Result" : "";
    // MARK 2026-09-22: "객_전주"는 채널코드↔점포명 매핑용 참조표라 순서와 무관하게 고유 코드/
    // 이름 쌍만 있으면 충분합니다(실제 매장 수만큼, 보통 수십 행). 로그성 시트는 아니지만
    // 혹시 모를 이상 증식에 대비해 다른 곳들과 같은 방식으로 넉넉히(1만 행) 상한만 걸어둡니다 —
    // buildChannelCodeNameMap엔 이미 알려진 매장 코드 fallback도 있어 이 상한으로 실제 매핑이
    // 빠질 위험은 없습니다.
    const channelSheetName = mainTitles.find((title) => normalizeSheetName(title).includes("객_전주")) || "";
    const channelValues = channelSheetName ? await getSheetValuesById(mainId, channelSheetName, "A1:AZ10000").catch(() => []) : [];
    const codeNameMap = buildChannelCodeNameMap(channelValues || []);
    const rtValues = rtSheetName
      ? hasExplicitDateFilter
        ? await getSheetValuesById(mainId, rtSheetName, "A:AZ").catch(() => [])
        : await readRecentTailRowsById(mainId, rtSheetName, "A:AZ", PERFORMANCE_LOG_BLIND_TAIL_ROWS, 20).catch(() => [])
      : [];
    const rtRows = parseRtResultRows(rtValues || [], codeNameMap, productNameMap);

    let performanceRows = mergeRtRows(basePerformanceRows, rtRows);
    for (const row of performanceRows as any[]) {
      if (!row.productName && productNameMap.has(row.styleCode)) row.productName = productNameMap.get(row.styleCode) || "";
    }

    if (override.selectedDate) {
      performanceRows = performanceRows.filter((row: any) => row.startDate === override.selectedDate);
    }
    if (override.categoryFilter && override.categoryFilter !== "ALL") {
      performanceRows = performanceRows.filter((row: any) => row.category === override.categoryFilter);
    }

    // MARK 2026-09: Daily_Sales_History는 계속 쌓이기만 하는 시트라 매번 전체를("A:AZ") 읽으면
    // OOM 위험이 큽니다(dataBuilder.ts 다른 곳에서 이미 겪고 고친 문제와 동일 — /api/data가
    // try/catch로도 못 잡는 크래시를 내던 원인 중 하나였습니다). 이 함수가 실제로 보는 날짜는
    // 위에서 구한 performanceRows들의 before/during 기간뿐이므로, 그 중 가장 이른 날짜부터만
    // 읽습니다. sheetName이 확정된 압축 포맷("Daily_Sales_History")일 때만 이 지름길을 쓰고,
    // 다른 후보 이름으로 폴백된 경우엔 포맷이 보장되지 않으므로 전체 읽기로 안전하게 폴백합니다.
    //
    // MARK 2026-09-14: "RT 성과분석 들어가면 가끔 안 불러와진다" 문의 — 원인을 찾아보니
    // performanceRows가 비어있거나(RT/프로모션 실적이 아직 없는 카테고리/날짜를 골랐을 때)
    // earliestNeededDailyHistoryDate가 빈 문자열을 반환하면 neededSinceDate가 falsy가 되어
    // 아래 "전체 읽기" 폴백(A:AZ, 수십만 행 + 행당 JSON 펼치기)으로 빠지고 있었습니다.
    // 그래서 항상 최근 60일치를 기본 하한으로 둬서 neededSinceDate가 절대 비지 않게 합니다.
    const DEFAULT_PERFORMANCE_LOOKBACK_DAYS = 60;

    // MARK 2026-09-22: /api/data가 4GB 메모리에서도 계속 OOM으로 죽는 진짜 원인을 찾았습니다 —
    // 대시보드가 매번 부르는 loadPromotionPerformance()는 override 없이(= 날짜 필터 없이)
    // buildPerformanceAnalysis()를 호출하는데, 이러면 위 earliestNeededDailyHistoryDate가
    // "지금까지 쌓인 모든 RT/프로모션 행" 각각의 실제 실행 시점까지 다 훑어서 "그중 가장 이른
    // 날짜"를 찾습니다. RT/프로모션은 계속 쌓이기만 하는 로그라 이 값이 시간이 갈수록 점점 더
    // 과거로 밀리고, 그 결과 바로 아래에서 "필요한 기간만" 읽으려던 Daily_Sales_History 읽기가
    // 사실상 거의 전체 히스토리를 다시 펼치는 것과 같아집니다(행마다 최대 4만자 JSON —
    // 이 파일의 다른 주석들이 경고하는 바로 그 OOM 패턴). 사용자가 성과분석 화면에서 직접 날짜를
    // 고른 경우(app/api/performance가 selectedDate/beforeStart/duringStart를 넘길 때)는 그
    // 선택을 그대로 존중하고, "날짜 필터 없이" 부른 경우(대시보드의 블라인드 호출)에만 최근
    // 90일로 하한을 둡니다 — 대시보드는 어차피 "최근 성과 요약"만 보여주면 되므로 이걸로
    // 화면상 의미있는 손실은 없습니다.
    const PERFORMANCE_BLIND_LOOKBACK_CAP_DAYS = 90;
    // hasExplicitDateFilter는 함수 맨 위(Promotion_Performance/RT_Result 읽기 범위를 정할 때)로
    // 옮겼습니다 — 여기서는 그대로 재사용합니다.
    const rawEarliestNeeded = earliestNeededDailyHistoryDate(performanceRows, override);
    const blindLookbackFloor = dateAddDays(todayDateKey(), -PERFORMANCE_BLIND_LOOKBACK_CAP_DAYS);
    const boundedEarliestNeeded = hasExplicitDateFilter
      ? rawEarliestNeeded
      : rawEarliestNeeded && rawEarliestNeeded > blindLookbackFloor
      ? rawEarliestNeeded
      : blindLookbackFloor;
    const neededSinceDate = boundedEarliestNeeded || dateAddDays(todayDateKey(), -DEFAULT_PERFORMANCE_LOOKBACK_DAYS);

    let dailyValues: any[][] = [];
    let dailySource = "NOT_FOUND";
    const dailySheetName = pickNormalizedTitle(historyTitles, ["Daily_Sales_History", "DailySalesHistory", "Daily_History", "일간스냅샷", "일별판매히스토리"], "Daily_Sales_History");

    if (dailySheetName && historyTitles.includes(dailySheetName)) {
      if (dailySheetName === "Daily_Sales_History" && neededSinceDate) {
        const range = await findDailyHistoryRowRangeIn(historyId, dailySheetName, neededSinceDate, todayDateKey());
        if (range) {
          const tailRows = await getSheetValuesById(historyId, dailySheetName, `A${range.startRow}:AZ${range.endRow}`).catch(() => [] as any[]);
          dailyValues = [DAILY_HISTORY_HEADER, ...tailRows];
        } else {
          // MARK 2026-09-14: startRow를 못 찾은 건(=neededSinceDate 이후 날짜가 A열에 없음)
          // "그 기간엔 매칭될 데이터가 아직 없다"는 뜻이지 "다시 전체를 읽어야 한다"는 뜻이
          // 아닙니다. 예전엔 여기서도 전체("A:AZ")를 다시 읽었는데, 이게 바로 RT탭 성과분석이
          // 가끔 멈추거나 안 불러와지던 실제 원인이었습니다(수십만 행 + 행당 JSON 펼치기).
          // 빈 결과로 안전하게 넘어갑니다 — 실제로 해당 기간에 판매 실적이 없다면 결과도
          // 어차피 0이라 화면상 차이가 없습니다.
          dailyValues = [DAILY_HISTORY_HEADER];
        }
      } else {
        dailyValues = await getSheetValuesById(historyId, dailySheetName, "A:AZ").catch(() => []);
      }
      dailySource = "MARK_HISTORY";
    } else if (dbTitles.includes("Daily_Sales_History")) {
      dailyValues = await getSheetValuesById(dbId, "Daily_Sales_History", "A:AZ").catch(() => []);
      dailySource = "MARK_DB_FALLBACK";
    }

    const dailyRows = parseDailyHistoryRows(dailyValues || []);

    // MARK 2026-09-22: 여기서 예전엔 Weekly_history 시트 전체(A:S, "지금까지 쌓인 모든 주차·
    // 스타일·컬러·점포 조합" — weeklyDataProvider.ts 주석 참고)를 매번 통째로 읽고 있었는데,
    // 그 결과(weeklyStoreRows)를 실제로 쓰는 곳이 이 함수 안에 없다는 걸 발견했습니다 —
    // applyWeeklyPerformance()가 이 값을 쓰도록 정의는 돼있지만 이 함수 어디서도 호출되지
    // 않고(RT 성과 수량 추이는 주석에 적힌 대로 Daily_Sales_History만 씁니다), weeklyStoreRows는
    // 아래 debug.weeklyStoreRows(단순 개수 표시)에만 쓰였습니다. "금주/전주" 시트가 예상과 달리
    // 121,197행까지 자랐던 것과 완전히 같은 패턴(형제 시트)이라 Weekly_history도 이미 비슷하게
    // 커져 있을 가능성이 높고, 아무 데도 안 쓰는 값 때문에 전체를 읽는 건 순수 낭비 + OOM
    // 위험이라 이 읽기 자체를 없앴습니다(다른 화면들이 쓰는 자기 자신의 Weekly_history 읽기는
    // weeklyDataProvider.ts 쪽에서 이미 별도로 안전하게(타겟 읽기) 처리하고 있어 영향 없습니다).
    const weeklyStoreRows: any[] = [];

    // MARK 2026-09: "금주/전주" 시트가 원래 예상(매주 새로 쓰는 작은 시트)과 달리
    // 121,197행(약 400만 셀)까지 자라있는 게 발견됐습니다 — 계속 growing 상태라면 매번
    // 전체를("A:AZ") 읽는 순간 OOM 크래시로 이어집니다. parseWeeklyUnitPriceMap이 찾는 헤더는
    // 항상 맨 위 20행 안에 있으므로(findHeaderRow), 헤더+이후 데이터를 넉넉히(5,000행)만
    // 읽도록 안전장치를 걸어뒀습니다 — 원래 의도대로 작은 시트면 전혀 영향 없고, 지금처럼
    // 비정상적으로 커진 경우에도 최소한 크래시는 막습니다. 다만 이 시트가 왜 계속 쌓이고
    // 있는지(매주 덮어쓰기가 안 되고 있는 건지)는 별도로 확인이 필요합니다.
    const weeklyPriceSheetName = pickNormalizedTitle(mainTitles, ["금주전주", "금주/전주", "금주 전주"], "금주전주");
    const weeklyPriceValues = weeklyPriceSheetName && mainTitles.includes(weeklyPriceSheetName)
      ? await getSheetValuesById(mainId, weeklyPriceSheetName, "A1:AZ5000").catch(() => [])
      : [];
    const weeklyUnitPriceMap = parseWeeklyUnitPriceMap(weeklyPriceValues || []);

    for (const row of dailyRows as any[]) {
      const style = text(row.styleCode);
      const productName = text(row.productName);
      if (style && productName && !productNameMap.has(style)) productNameMap.set(style, productName);
    }
    for (const row of performanceRows as any[]) {
      if (!row.productName && productNameMap.has(row.styleCode)) row.productName = productNameMap.get(row.styleCode) || "";
    }

    // RT/프로모션 성과의 수량 추이는 Daily_Sales_History 기준으로 봅니다.
    // MARK_WEEKLY_HISTORY / Weekly_history는 주간 대시보드·판매데이터용이며, RT 성과 수량에는 섞지 않습니다.
    const weeklyApplied = performanceRows;
    const rows = applyDailyPerformance(weeklyApplied, dailyRows, override, weeklyUnitPriceMap);
    const summary = buildPerformanceSummary(rows);

    return {
      ...summary,
      override,
      debug: {
        performanceSheetName,
        dailySheetName: dailySheetName || "",
        rtSheetName,
        performanceRows: basePerformanceRows.length,
        rtRows: rtRows.length,
        mergedRows: performanceRows.length,
        dailyRows: dailyRows.length,
        dailySource,
        weeklyStoreRows: weeklyStoreRows.length, // MARK 2026-09-22: 더는 안 읽음(위 주석 참고) — 항상 0
        weeklyPriceSheetName: weeklyPriceSheetName || "",
        weeklyUnitPriceCount: weeklyUnitPriceMap.size,
      },
    };
  } catch (error: any) {
    console.error("buildPerformanceAnalysis failed:", error);
    return buildPerformanceSummary([]);
  }
}

async function loadPromotionPerformance() {
  return buildPerformanceAnalysis();
}



function ymdLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}


function mondayAfterDate(dateKey: string) {
  const d = parseDate(dateKey);
  if (!d) return "";
  const day = d.getDay(); // 0 Sun, 1 Mon
  const add = day === 1 ? 7 : day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + add);
  return ymdLocalDate(d);
}

function weekWindowBeforeMonday(anchorMonday: string, offsetWeeks = 0) {
  const anchor = parseDate(anchorMonday);
  if (!anchor) return { anchorMonday: "", start: "", end: "", dates: [] as string[] };
  const startDate = new Date(anchor.getTime());
  startDate.setDate(startDate.getDate() - 7 + offsetWeeks * 7);
  const endDate = new Date(startDate.getTime());
  endDate.setDate(endDate.getDate() + 6);
  const start = ymdLocalDate(startDate);
  const end = ymdLocalDate(endDate);
  return { anchorMonday, start, end, dates: dateRange(start, end) };
}

function formatMd(dateKey: string) {
  const d = parseDate(dateKey);
  if (!d) return "-";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function weeklyPeriodLabelFromAnchor(anchorMonday: string, currentWeek: any, prevWeek: any) {
  return `기준주차: ${formatMd(anchorMonday)} 월요일 / 분석기간: ${formatMd(currentWeek?.start)}~${formatMd(currentWeek?.end)} / 비교기간: ${formatMd(prevWeek?.start)}~${formatMd(prevWeek?.end)}`;
}

function monthKey(dateKey: string) {
  return String(dateKey || "").slice(0, 7);
}

function latestHistoryDate(rows: any[]) {
  return [...new Set(rows.map((r: any) => r.date).filter(Boolean))].sort().pop() || "";
}

function firstDayOfMonth(dateKey: string) {
  const d = parseDate(dateKey);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function lastDayOfMonth(dateKey: string) {
  const d = parseDate(dateKey);
  if (!d) return "";
  return ymdLocalDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function previousMonthKey(dateKey: string) {
  const d = parseDate(dateKey);
  if (!d) return "";
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function sumHistory(rows: any[], storeName: string, dates: Set<string>) {
  return rows
    .filter((r: any) => r.storeName === storeName && dates.has(r.date))
    .reduce((acc: any, r: any) => {
      acc.qty += Number(r.qty || 0);
      acc.amount += Number(r.amount || 0);
      return acc;
    }, { qty: 0, amount: 0 });
}

function buildHistoryStoreRows(rows: any[], currentDate: string, compareDate = "") {
  if (!currentDate) return { dailyCur: [], dailyCmp: [], weeklyCur: [], weeklyCmp: [], monthCur: [], monthCmp: [], monthYear: [] };

  const weeklyAnchorMonday = mondayAfterDate(currentDate);
  const currentWeek = weekWindowBeforeMonday(weeklyAnchorMonday, 0);
  const prevWeek = weekWindowBeforeMonday(weeklyAnchorMonday, -1);
  const currentMonthStart = firstDayOfMonth(currentDate);
  const currentMonthEnd = currentDate;
  const prevMonth = previousMonthKey(currentDate);
  const prevMonthStart = prevMonth ? `${prevMonth}-01` : "";
  const prevMonthEnd = prevMonthStart ? lastDayOfMonth(prevMonthStart) : "";

  const dayDates = new Set([currentDate]);
  const compareDayDates = new Set([compareDate || dateAddDays(currentDate, -7)]);
  const weekDates = new Set(currentWeek.dates);
  const prevWeekDates = new Set(prevWeek.dates);
  const monthDates = new Set(dateRange(currentMonthStart, currentMonthEnd));
  const prevMonthDates = new Set(dateRange(prevMonthStart, prevMonthEnd));

  const stores = [...new Set(rows.map((r: any) => r.storeName).filter(Boolean))].sort();

  const makeRows = (dates: Set<string>, mode: "day" | "week" | "month") => stores.map((storeName) => {
    const day = sumHistory(rows, storeName, dayDates);
    const sum = sumHistory(rows, storeName, dates);
    const month = sumHistory(rows, storeName, monthDates);
    return {
      storeName,
      dayTarget: 0,
      daySales: mode === "day" ? sum.amount : day.amount,
      dayRate: 0,
      weekTarget: 0,
      weekSales: mode === "week" ? sum.amount : sum.amount,
      weekRate: 0,
      monthBaseTarget: 0,
      monthTarget: 0,
      monthSales: mode === "month" ? sum.amount : month.amount,
      monthRateA: 0,
      monthRate: 0,
      yearTarget: 0,
      yearSales: month.amount,
      yearRate: 0,
    };
  }).filter((r) => Number(r.daySales || 0) || Number(r.weekSales || 0) || Number(r.monthSales || 0));

  return {
    dailyCur: makeRows(dayDates, "day"),
    dailyCmp: makeRows(compareDayDates, "day"),
    weeklyCur: makeRows(weekDates, "week"),
    weeklyCmp: makeRows(prevWeekDates, "week"),
    monthCur: makeRows(monthDates, "month"),
    monthCmp: makeRows(prevMonthDates, "month"),
    monthYear: [],
    weeklyAnchorMonday,
    currentWeek,
    prevWeek,
    currentMonthStart,
    currentMonthEnd,
    prevMonthStart,
    prevMonthEnd,
  };
}

function buildHistoryProductRows(rows: any[], currentDate: string) {
  if (!currentDate) return [] as any[];
  const weeklyAnchorMonday = mondayAfterDate(currentDate);
  const currentWeek = weekWindowBeforeMonday(weeklyAnchorMonday, 0);
  const prevWeek = weekWindowBeforeMonday(weeklyAnchorMonday, -1);
  const currentSet = new Set(currentWeek.dates);
  const prevSet = new Set(prevWeek.dates);
  const map = new Map<string, any>();

  for (const r of rows) {
    const key = `${r.storeName}__${r.styleCode}`;
    if (!map.has(key)) {
      map.set(key, {
        storeName: r.storeName,
        storeKey: normalizeStoreKey(r.storeName),
        styleCode: r.styleCode,
        productName: r.productName,
        weekNet: 0,
        weekAmount: 0,
        prevNet: 0,
        prevAmount: 0,
        storeStock: 0,
        skuRows: [],
      });
    }
    const item = map.get(key);
    if (currentSet.has(r.date)) {
      item.weekNet += Number(r.qty || 0);
      item.weekAmount += Number(r.amount || 0);
    }
    if (prevSet.has(r.date)) {
      item.prevNet += Number(r.qty || 0);
      item.prevAmount += Number(r.amount || 0);
    }
  }

  return Array.from(map.values()).filter((r: any) => Number(r.weekNet || 0) || Number(r.weekAmount || 0) || Number(r.prevNet || 0) || Number(r.prevAmount || 0));
}

// MARK 2026-09: Daily_Sales_History는 매일 계속 쌓이기만 하는 시트라(압축 형식이어도 반년
// 넘으면 수만 행 + 행마다 최대 4만자 JSON), "A:AZ"/"A:ZZ"로 매번 전체를 읽어서 펼치면 서버가
// 감당 못 하고 그대로 죽어버립니다(try/catch도 못 잡는 OOM 크래시 — /api/data가 통째로 500
// HTML을 뱉던 원인). weeklyDataProvider.ts에서 이미 겪고 고친 것과 완전히 같은 문제라 같은
// 패턴을 씁니다: A열(날짜)만 먼저 가볍게 읽어서 필요한 구간이 시작되는 행을 찾고, 그 아래만
// 읽습니다. 쓰기 쪽이 항상 날짜 오름차순으로 저장하므로 안전하고, 못 찾으면 전체 읽기로 폴백합니다.
//
// MARK 2026-09-15: "주간탭 목표/실적이 업데이트 안 된다" 점검 — 위 설명의 "A열만 가볍게
// 읽는다"는 부분이 사실은 안 가벼워졌습니다. Daily_Sales_History가 계속 쌓이면서(지금은
// 수십만 행) A열 "전체"를 매번 읽는 것 자체가 무거워졌습니다(한 열이어도 행이 수십만 개면
// 응답이 커지고 느려짐) — dailySales.ts의 readDailyHistoryRowsForDateRange가 이미 겪고
// 고친 문제와 똑같습니다("행 수 조회 → 최근 N행만 읽기", getSheetRowCountById는 셀 데이터를
// 전혀 안 읽는 메타데이터 조회라 시트가 아무리 커져도 항상 빠름). 여기서도 A열 전체 스캔
// 대신 "행 수만 가볍게 확인 → 최근 3만 행만" 방식으로 바꿔서, 시트가 앞으로 계속 커져도
// 이 함수의 속도가 절대 느려지지 않도록 했습니다.
const FIND_START_ROW_TAIL_WINDOW_ROWS = 30000;

// MARK 2026-09-17: "RT 엔진이 새 품번 제안을 안 해준다" 점검 — startRow를 찾는 것까지는
// 가벼워졌는데(위 설명), 그 다음 실제 데이터를 읽는 부분(`A${startRow}:ZZ`, 끝행 지정 없음)이
// 여전히 "시작행부터 시트 끝까지 전부"를 읽고 있었습니다. 시트가 계속 커지면서 이 구간 자체가
// 최대 3만 행(+행마다 최대 4만자 JSON)까지 커질 수 있는데, 호출부가 실제로 필요한 기간은
// 보통 2~6주치뿐이라 나머지는 읽고 펼쳤다가 버려지는 낭비입니다 — 프로덕션에서 /api/data가
// 500(OOM 추정)로 죽는 걸 직접 확인했습니다. 그래서 시작행뿐 아니라 끝행(요청한 기간의
// 마지막 날짜)까지 같은 A열 스캔 한 번으로 같이 찾아서, 실제 데이터 읽기를 필요한 구간으로만
// 좁힙니다.
async function findDailyHistoryRowRangeIn(
  historyId: string,
  sheetName: string,
  sinceDateKey: string,
  untilDateKey: string
): Promise<{ startRow: number; endRow: number } | null> {
  try {
    const totalRows = await getSheetRowCountById(historyId, sheetName);
    if (!totalRows || totalRows < 2) return null;

    const tailStart = Math.max(2, totalRows - FIND_START_ROW_TAIL_WINDOW_ROWS + 1); // 2행부터(1행=헤더)
    const dateCol = await getSheetValuesById(historyId, sheetName, `A${tailStart}:A${totalRows}`).catch(() => [] as any[]);
    if (!dateCol.length) return null;

    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < dateCol.length; i++) {
      const d = normalizeDateKey(dateCol[i]?.[0]);
      if (!d) continue;
      if (startIdx === -1) {
        if (d < sinceDateKey) continue;
        startIdx = i;
      }
      if (d <= untilDateKey) {
        endIdx = i;
      } else {
        break; // 날짜 오름차순 저장이라, 여기서부턴 전부 범위 밖입니다.
      }
    }
    // 최근 3만 행 안에서도 sinceDateKey 이후 날짜를 못 찾았다면(=요청한 기간이 그만큼도 안
    // 된 데이터), 실제로 그 기간엔 데이터가 없는 것과 같습니다. 호출부가 "못 찾음"으로
    // 안전하게 처리하도록 null을 돌려줍니다(예전처럼 전체 재읽기로 폴백하지 않음).
    if (startIdx === -1) return null;
    return { startRow: tailStart + startIdx, endRow: tailStart + (endIdx === -1 ? startIdx : endIdx) };
  } catch {
    return null;
  }
}

async function loadDashboardDailyHistory() {
  const historyId = getHistorySheetId();
  const titles = await getSpreadsheetTitlesById(historyId).catch(() => []);
  const sheetName = pickNormalizedTitle(titles, ["Daily_Sales_History", "DailySalesHistory", "Daily_History", "일간스냅샷", "일별판매히스토리"], "Daily_Sales_History");
  if (!sheetName || !titles.includes(sheetName)) return { sheetName: "", rows: [] as any[] };

  // 이 함수 결과가 쓰이는 곳 중 가장 넓은 범위는 월간 비교(이번 달 + 지난 달)라, 지난달 1일부터
  // 여유(10일)를 두고 그 이후만 읽으면 daily/weekly/monthly 전부 충분합니다.
  const currentDate = yesterdayDateKeyKST();
  const prevMonthKey = previousMonthKey(currentDate);
  const prevMonthStart = prevMonthKey ? `${prevMonthKey}-01` : firstDayOfMonth(currentDate);
  const bufferedSinceDate = dateAddDays(prevMonthStart, -10);

  // sheetName이 확정된 압축 포맷("Daily_Sales_History")일 때만 헤더를 직접 붙이는 지름길을
  // 씁니다. 다른 후보 이름으로 폴백된 경우 포맷이 보장되지 않으므로 원래의 전체 읽기로 갑니다.
  let values: any[][];
  if (sheetName === "Daily_Sales_History") {
    const range = await findDailyHistoryRowRangeIn(historyId, sheetName, bufferedSinceDate, todayKST());
    if (range) {
      const tailRows = await getSheetValuesById(historyId, sheetName, `A${range.startRow}:AZ${range.endRow}`).catch(() => [] as any[]);
      values = [DAILY_HISTORY_HEADER, ...tailRows];
    } else {
      // MARK 2026-09-15: startRow를 못 찾은 건 "그 기간엔 데이터가 없다"는 뜻이라, 예전처럼
      // 전체("A:AZ")를 다시 읽지 않고 빈 결과로 안전하게 넘어갑니다.
      values = [DAILY_HISTORY_HEADER];
    }
  } else {
    values = await getSheetValuesById(historyId, sheetName, "A:AZ").catch(() => []);
  }
  return { sheetName, rows: parseDailyHistoryRows(values || []) };
}

function isOfflineTeamValue(value: any) {
  return normalizeStoreKey(text(value)).includes("오프라인팀");
}

function isNonOfflineDailyChannel(channelName: string, teamName = "") {
  const raw = text(channelName);
  const team = text(teamName);
  const key = normalizeStoreKey(raw);
  const teamKey = normalizeStoreKey(team);
  return (
    isOnlineChannel(raw) ||
    isExcludedStore(raw) ||
    teamKey.includes("온라인") ||
    teamKey.includes("글로벌") ||
    teamKey.includes("기타") ||
    key.includes("온라인") ||
    key.includes("글로벌") ||
    key === "기타" ||
    key.startsWith("기타")
  );
}

function parseDailySalesSheetRows(rows: any[][]) {
  if (!rows.length) return [] as any[];

  const metaLimit = Math.min(rows.length, 20);
  let teamRow = -1;
  for (let r = 0; r < metaLimit; r++) {
    const count = (rows[r] || []).filter((cell) => isOfflineTeamValue(cell)).length;
    if (count >= 1) {
      teamRow = r;
      break;
    }
  }
  if (teamRow < 0) return [] as any[];

  const channelNameRow = Math.max(0, teamRow - 1);
  const channelCodeRow = Math.max(0, teamRow - 2);
  const team = rows[teamRow] || [];
  const channelNames = rows[channelNameRow] || [];
  const channelCodes = rows[channelCodeRow] || [];

  const targetRow = rows.find((row) => (row || []).some((cell) => normalizeStoreKey(text(cell)).includes("기간목표"))) || [];
  const targetCols: { col: number; storeName: string; channelCode: string; teamName: string; weekTarget: number }[] = [];
  for (let c = 7; c < Math.max(team.length, channelNames.length, channelCodes.length); c++) {
    const teamName = text(team[c]);
    if (!isOfflineTeamValue(teamName)) continue;
    const rawName = text(channelNames[c]) || text(channelCodes[c]);
    if (!rawName || isNonOfflineDailyChannel(rawName, teamName)) continue;
    const storeName = displayStoreName(rawName);
    if (!storeName || storeName === "합계" || storeName === "채널명") continue;
    targetCols.push({ col: c, storeName, channelCode: text(channelCodes[c]), teamName, weekTarget: num(targetRow[c]) });
  }

  if (!targetCols.length) return [] as any[];

  const records: any[] = [];
  for (let r = teamRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const first = text(row[0]);
    const second = text(row[1]);
    const date = normalizeDateKey(first) || normalizeDateKey(second);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    for (const colInfo of targetCols) {
      const amount = num(row[colInfo.col]);
      if (!amount) continue;
      records.push({
        date,
        storeName: colInfo.storeName,
        storeKey: normalizeStoreKey(colInfo.storeName),
        amount,
        channelCode: colInfo.channelCode,
        teamName: colInfo.teamName,
        weekTarget: colInfo.weekTarget,
      });
    }
  }

  return records;
}

export async function loadDailyStoreSalesFromMarkDb() {
  // MARK 6.75: "일간매출(26년)"을 이제 전용 스프레드시트(getDailyStoreSalesSheetId)에서 먼저
  // 찾습니다. 전환 기간이라 기존 소스도 계속 후보로 남겨둡니다.
  const candidates = [getDailyStoreSalesSheetId(), getDailySourceSheetId()];
  for (const dbId of candidates) {
    const titles = await getSpreadsheetTitlesById(dbId).catch(() => []);
    const sheetName = pickNormalizedTitle(titles, ["일간매출(26년)", "일간매출26년", "일간매출", "Daily_Store_Sales", "DailyStoreSales"], "일간매출(26년)");
    if (!sheetName || !titles.includes(sheetName)) continue;
    const values = await getSheetValuesById(dbId, sheetName, "A:ZZ").catch(() => []);
    if (values && values.length) return { sheetName, rows: parseDailySalesSheetRows(values) };
  }
  return { sheetName: "", rows: [] as any[] };
}

function latestStoreSalesDate(rows: any[]) {
  return [...new Set(rows.map((r: any) => r.date).filter(Boolean))].sort().pop() || "";
}

function sumStoreSalesRows(rows: any[], storeName: string, dates: Set<string>) {
  return rows
    .filter((r: any) => r.storeName === storeName && dates.has(r.date))
    .reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
}

function buildDailyStoreSalesDashboardRows(rows: any[], currentDate: string, compareDate = "", dailyAmountMap?: Map<string, Map<string, number>>) {
  if (!currentDate) return null as any;

  const weeklyAnchorMonday = mondayAfterDate(currentDate);
  const currentWeek = weekWindowBeforeMonday(weeklyAnchorMonday, 0);
  const prevWeek = weekWindowBeforeMonday(weeklyAnchorMonday, -1);
  const currentMonthStart = firstDayOfMonth(currentDate);
  const currentMonthEnd = currentDate;
  const prevMonth = previousMonthKey(currentDate);
  const prevMonthStart = prevMonth ? `${prevMonth}-01` : "";
  const prevMonthEnd = prevMonthStart ? lastDayOfMonth(prevMonthStart) : "";

  const dayDates = new Set([currentDate]);
  const compareDayDates = new Set([compareDate || dateAddDays(currentDate, -7)]);
  const weekDates = new Set(currentWeek.dates);
  const prevWeekDates = new Set(prevWeek.dates);
  const monthDates = new Set(dateRange(currentMonthStart, currentMonthEnd));
  const prevMonthDates = new Set(dateRange(prevMonthStart, prevMonthEnd));
  const stores = [...new Set(rows.map((r: any) => r.storeName).filter(Boolean))].sort();
  const targetMap = new Map<string, number>();
  for (const r of rows) {
    const target = Number(r.weekTarget || 0);
    if (target) targetMap.set(r.storeName, Math.max(targetMap.get(r.storeName) || 0, target));
  }

  const makeRows = (dates: Set<string>, dayDateOverride?: string) => stores.map((storeName) => {
    const dayDateKey = dayDateOverride || currentDate;
    const daySales = dailyAmountMap
      ? getMergedAmount(dailyAmountMap, storeName, dayDateKey)
      : sumStoreSalesRows(rows, storeName, new Set([dayDateKey]));
    const weekSales = sumStoreSalesRows(rows, storeName, dates);
    const monthSales = sumStoreSalesRows(rows, storeName, monthDates);
    const weekTarget = targetMap.get(storeName) || 0;
    return {
      storeName,
      dayTarget: 0,
      daySales,
      dayRate: 0,
      weekTarget,
      weekSales,
      weekRate: weekTarget ? (weekSales / weekTarget) * 100 : 0,
      monthBaseTarget: 0,
      monthTarget: 0,
      monthSales,
      monthRateA: 0,
      monthRate: 0,
      yearTarget: 0,
      yearSales: monthSales,
      yearRate: 0,
    };
  }).filter((r) => Number(r.daySales || 0) || Number(r.weekSales || 0) || Number(r.monthSales || 0));

  return {
    dailyCur: makeRows(dayDates, currentDate),
    dailyCmp: makeRows(compareDayDates, [...compareDayDates][0]),
    weeklyCur: makeRows(weekDates),
    weeklyCmp: makeRows(prevWeekDates),
    monthCur: makeRows(monthDates),
    monthCmp: makeRows(prevMonthDates),
    monthYear: [],
    weeklyAnchorMonday,
    currentWeek,
    prevWeek,
    currentMonthStart,
    currentMonthEnd,
    prevMonthStart,
    prevMonthEnd,
  };
}

export async function buildDashboardDataFromGoogleSheet() {
  const titles = await getSpreadsheetTitles();

  // MARK 5.0.1:
  // 일간/주간/월간 매출대시보드는 Daily_Sales_History 누적 데이터로 집계합니다.
  // ERP 원본 시트는 Daily_Sales_History 생성/재고CTRL/재고현황 보조용으로만 최소 조회합니다.
  const inventorySheet = pickNormalizedTitle(titles, ["온오프재고현황", "온/오프재고현황", "온오프 재고 현황", "온/오프 재고 현황"], "온오프재고현황");
  const annualSalesSheet = pickNormalizedTitle(titles, ["연간판매", "연간 판매"], "연간판매");
  const standardSheet = pickNormalizedTitle(titles, ["기준"], "기준");

  // MARK 2026-09: "금주/전주" 시트 B2(주간 기준 월요일)를 읽어와 override로 쓰던 걸 완전히
  // 없앴습니다 — 확인 결과 그 값을 사람이 계산값과 다르게 수동으로 바꿔두는 경우가 없어서,
  // 이 파일의 다른 모든 곳과 똑같이 mondayAfterDate(currentDate) 계산값만 쓰면 충분합니다.
  // (시트 읽기 자체를 없앤 거라 B2만 가볍게 읽던 것보다 한 걸음 더 나갑니다.)
  const needed = [inventorySheet, annualSalesSheet, standardSheet]
    .filter((v, i, arr) => v && arr.indexOf(v) === i);
  const values = await getManySheetValues(needed, "A:AZ");

  const history = await loadDashboardDailyHistory();
  const historyRowsAll = history.rows || [];
  const historyRows = historyRowsAll.filter((r: any) => isOfflineSalesStore(r.storeName));
  const coreHistoryRows = historyRows.filter((r: any) => isCoreOfflineSalesStore(r.storeName));

  // MARK 5.0 final:
  // 점포별 일/주/월 매출은 MARK_DB의 `일간매출(26년)` 시트를 우선 사용합니다.
  // 왼쪽 A~G 합산 영역은 제외하고 H열 이후의 `오프라인팀` 채널만 집계합니다.
  const dailyStoreSales = await loadDailyStoreSalesFromMarkDb();
  const dailyStoreRows = (dailyStoreSales.rows || []).filter((r: any) => isOfflineSalesStore(r.storeName));
  // MARK 6.40: 일간 탭과 매장 탭의 기준일을 통일합니다 — 둘 다 기본값은 "어제"(KST)이고,
  // 비교일도 같은 요일 규칙(평일=어제, 금/토/월=전주 동요일)을 씁니다.
  const currentDate = yesterdayDateKeyKST();
  const { compareDate: dailyCompareDate } = getComparisonDateForDaily(currentDate);

  // 매장별 일자별 매출은 Daily_Sales_History(실제 금액, 우선)와 일간매출(26년)(보완)을 병합해서
  // 계산합니다 — 매장 탭(lib/dailyBriefing.ts)과 완전히 같은 규칙(lib/storeDailyAmount.ts)입니다.
  const dailyAmountMap = mergeStoreDailyAmounts(
    coreHistoryRows.filter((r: any) => r.date === currentDate || r.date === dailyCompareDate),
    dailyStoreRows.filter((r: any) => r.date === currentDate || r.date === dailyCompareDate)
  );

  const historyStores = dailyStoreRows.length
    ? buildDailyStoreSalesDashboardRows(dailyStoreRows, currentDate, dailyCompareDate, dailyAmountMap)
    : buildHistoryStoreRows(historyRows, currentDate);
  const dailyCur = historyStores?.dailyCur || [];
  const dailyCmp = historyStores?.dailyCmp || [];
  const weeklyCur = historyStores?.weeklyCur || [];
  const weeklyCmp = historyStores?.weeklyCmp || [];
  const monthCur = historyStores?.monthCur || [];
  const monthCmp = historyStores?.monthCmp || [];
  const monthYear = historyStores?.monthYear || [];

  // MARK 6.49: RT제안/재고이관/프로모션제안은 이제 "금주/전주"(주 1회 갱신) 대신
  // Daily_Sales_History(매일 갱신, 실제 판매금액 포함)를 직접 집계해서 씁니다.
  // MARK 2026-09-21: 호조/부진 RT도 점포요청 RT와 같은 PIP 매장별 재고 스냅샷을 같이 읽어와서
  // buildInventory에 넘깁니다(스냅샷이 없으면 예전처럼 Daily_Sales_History만으로 동작).
  // MARK 2026-09-22: 임시로 여기서 PIP 읽기를 꺼서 OOM 원인을 격리해봤는데, 꺼도 OOM이
  // 그대로 재현돼서 범인이 아닌 걸로 확인됐습니다(진짜 원인은 loadPromotionPerformance() —
  // 아래 buildPerformanceAnalysis 관련 주석 참고). 다시 켭니다.
  const [productRowsRaw, storeStockSnapshotForRt] = await Promise.all([
    buildProductRowsFromDailyHistory(),
    readStoreStockSnapshot().catch(() => ({ rows: [] as StoreStockSnapshotRow[], meta: null })),
  ]);
  const inventoryRows = parseInventory(values[inventorySheet] || []);
  const performance = await loadPromotionPerformance();
  const carryoverAnnualSales = buildCarryoverAnnualSales(values[annualSalesSheet] || [], values[standardSheet] || []);

  const historyProductRows = buildHistoryProductRows(coreHistoryRows, currentDate);
  const companyTopProducts = aggregateProducts(historyProductRows, undefined, 20);
  const storeNames = [...new Set(historyProductRows.map((r: any) => r.storeName).filter(Boolean))].sort();
  const storeTopProducts: Record<string, any[]> = {};
  for (const store of storeNames) storeTopProducts[store] = aggregateProducts(historyProductRows, store, 20);

  const mergedWeekly = mergeStoreRows(weeklyCur, weeklyCmp).filter((r) => isOfflineSalesStore(r.storeName));
  const coreMergedWeekly = mergedWeekly.filter((r) => isCoreOfflineSalesStore(r.storeName));
  const totalOfflineWeekSales = mergedWeekly.reduce((s, r) => s + Number(r.weekSales || 0), 0);
  const coreWeekSales = coreMergedWeekly.reduce((s, r) => s + Number(r.weekSales || 0), 0);
  const top10Amount = companyTopProducts.slice(0, 10).reduce((s, p) => s + Number(p.weekAmount || 0), 0);
  const top10Concentration = coreWeekSales ? (top10Amount / coreWeekSales) * 100 : 0;

  const entrants = companyTopProducts
    .map((p, i) => ({ ...p, currentRank: i + 1, previousRank: p.prevAmount ? "급상승" : "신규" }))
    .filter((p) => !p.prevAmount || Number(p.amountChangeRate || 0) >= 50)
    .slice(0, 5);

  const good = [...coreMergedWeekly].filter((r) => r.weekSales > 0).sort((a, b) => b.weekChangeRate - a.weekChangeRate).slice(0, 3);
  const bad = [...coreMergedWeekly].filter((r) => r.weekSales > 0).sort((a, b) => a.weekChangeRate - b.weekChangeRate).slice(0, 3);
  const weeklyTotal = mergedWeekly.reduce((s, r) => s + Number(r.weekSales || 0), 0);
  const weeklyPrev = mergedWeekly.reduce((s, r) => s + Number(r.compareWeekSales || 0), 0);
  const weeklyChange = rate(weeklyTotal, weeklyPrev);
  const topProduct = companyTopProducts[0];

  // 재고CTRL은 현재 ERP 상품/재고 데이터 기준 유지
  const inventory = { ...(await buildInventory(productRowsRaw, inventoryRows, companyTopProducts, storeStockSnapshotForRt)), performance };
  const latestPerformance = performance?.byDate?.[performance?.latestDate || ""] || {};
  const rtBucket = (latestPerformance.byCategory || []).find((b: any) => b.category === "RT") || {};
  const promoBucket = (latestPerformance.byCategory || []).find((b: any) => b.category === "PROMOTION") || {};
  const performanceBriefing = [
    rtBucket.count ? `RT 성과: ${Math.round(Number(rtBucket.count || 0)).toLocaleString("ko-KR")}건 / 평균 소진율 ${Number(rtBucket.avgDepletionRate || 0).toFixed(1)}% / 추가매출 ${Math.round(Number(rtBucket.addedAmount || 0)).toLocaleString("ko-KR")}원` : "",
    promoBucket.count ? `프로모션 성과: ${Math.round(Number(promoBucket.count || 0)).toLocaleString("ko-KR")}건 / 성공률 ${Number(promoBucket.successRate || 0).toFixed(1)}% / 추가매출 ${Math.round(Number(promoBucket.addedAmount || 0)).toLocaleString("ko-KR")}원` : "",
  ].filter(Boolean);

  return {
    ...(fallback as any),
    source: "daily-sales-history",
    updatedAt: new Date().toISOString(),
    historySource: {
      sheetName: history.sheetName,
      latestDate: currentDate,
      rows: historyRows.length,
      storeSalesSheetName: dailyStoreSales.sheetName || "",
      storeSalesRows: dailyStoreRows.length,
      storeSalesSource: dailyStoreRows.length ? "일간매출(26년)" : "Daily_Sales_History fallback",
    },
    daily: {
      periodLabel: `기준일자: ${currentDate || "Daily_Sales_History 없음"} / Daily_Sales_History 기준`,
      current: dailyCur,
      compare: dailyCmp,
    },
    weekly: {
      periodLabel: weeklyPeriodLabelFromAnchor(historyStores.weeklyAnchorMonday || "", historyStores.currentWeek, historyStores.prevWeek),
      anchorMonday: historyStores.weeklyAnchorMonday || "",
      currentPeriod: historyStores.currentWeek || {},
      comparePeriod: historyStores.prevWeek || {},
      current: weeklyCur,
      compare: weeklyCmp,
      companyTopProducts,
      storeTopProducts,
      productStoreNames: storeNames,
      top10Concentration,
      newTop10Entrants: entrants,
      aiBriefing: [
        `일간매출(26년) 기준 오프라인 주간 매출은 ${Math.round(totalOfflineWeekSales).toLocaleString("ko-KR")}원이며 전주 대비 ${weeklyChange >= 0 ? "+" : ""}${weeklyChange.toFixed(1)}% 흐름입니다.`,
        `호조 매장은 ${good.map((r) => r.storeName).join(", ") || "데이터 없음"} 중심으로 확인됩니다.`,
        `부진 매장은 ${bad.map((r) => r.storeName).join(", ") || "데이터 없음"}이며 상품 구성과 재고 보강 점검이 필요합니다.`,
        `핵심 오프라인 TOP 상품은 ${topProduct?.productName || "데이터 없음"}이며 TOP10 상품 매출 비중은 ${top10Concentration.toFixed(1)}%입니다.`,
        ...performanceBriefing,
        "주간 매장 매출은 MARK_DB 일간매출(26년)의 날짜 범위 합산으로 집계합니다.",
      ],
    },
    monthly: {
      periodLabel: `분석월: ${historyStores.currentMonthStart || "-"}~${historyStores.currentMonthEnd || "-"} / 비교월: ${historyStores.prevMonthStart || "-"}~${historyStores.prevMonthEnd || "-"}`,
      current: monthCur,
      compare: monthCmp,
      year: monthYear,
      carryoverAnnualSales,
    },
    inventory,
  };
}

export function getFallbackData() {
  return fallback as any;
}

// =====================================================================
// MARK 2026-09-22: 매출탭(점포별) — "전체매출" 원본 다운로드 파일(매장×날짜별 일간
// 실적+목표)을 매일 업로드하면, 그동안 여러 시트를 수기로 붙여넣어서 만들던 "점포별"
// 표(일간/주간/월간/전월/연간, 목표·달성율·전년대비)를 자동으로 만들어줍니다.
// - "차주"(다음주) 목표는 원본 파일이 지난 실적만 담고 있어서 계산할 수 없어 뺐습니다
//   (소천님 확인 완료).
// - 구분(로드샵/백화점/쇼핑몰/아울렛/위탁(오프))은 원본 파일에 있는 값을 그대로 씁니다.
// - 이번 달/올해처럼 아직 안 끝난 기간은 "월목표"(그 달 전체 목표) 대신 "기간목표"(지금까지
//   지난 날짜들의 목표 합)만 계산합니다 — 안 지난 날짜는 목표 자체가 원본 파일에 없어서
//   전체 월/연 목표를 미리 알 수 없기 때문입니다. 완결된 지난달은 전체 월목표를 그대로 씁니다.
// =====================================================================

const SALES_SUMMARY_SHEET = "매출_일별_스냅샷";
const SALES_SUMMARY_META_SHEET = "매출_일별_스냅샷_메타";
const SALES_SUMMARY_HEADER = ["날짜", "구분", "채널코드", "매장명", "수량", "금액", "건수", "목표"];
// MARK 2026-09-22: "매일 전체매출 파일 통째로" 대신 "어제 하루치만" 매일 올리는 방식으로
// 바뀌면서, 메타 시트도 "누적 전체" 정보와 "이번(가장 최근) 업로드" 정보를 구분해서 기록합니다.
// 앞 6칸(업로드일시~원본파일명)은 기존과 자리가 같아 옛날 방식대로 이해해도 되지만, 이제
// 업로드일시/행수/시작일/종료일은 "누적 전체" 기준이고, 뒤 3칸이 "이번 업로드분"만의 정보입니다.
const SALES_SUMMARY_META_HEADER = [
  "마지막업로드일시", "누적행수", "누적매장수", "누적시작일", "누적종료일", "최근업로드파일명",
  "최근업로드행수", "최근업로드시작일", "최근업로드종료일",
];

export type SalesSummaryDailyRow = {
  date: string;
  channelGroup: string;
  channelCode: string;
  storeName: string;
  qty: number;
  amount: number;
  receiptCount: number;
  target: number;
};

// MARK 2026-09-22: 처음엔 "전체매출 파일을 매일 통째로 다시 올린다"는 전제로 매번 전체
// 덮어쓰기(safeReplaceSheetValuesById에 새로 올라온 행만 넘김)였는데, 소천님이 "매일은
// 하루치만 올려서 그게 기록되어 쌓이게 하고 싶다"고 확인해주셔서 구조를 바꿨습니다.
// 이제는 "날짜+채널코드+매장명"을 고유 키로 삼아 기존에 쌓여있던 행 위에 새로 올라온 행만
// upsert(있으면 새 값으로 덮어쓰고, 없으면 추가)합니다 — 과거 행은 그대로 남고, 같은 날을
// (정정 등의 이유로) 다시 올려도 중복되지 않고 최신 값으로만 갱신됩니다. 최초 1회 올렸던
// 전체 히스토리(2025-01~)는 이미 시트에 쌓여있으므로 별도 마이그레이션 없이 그 위에
// 계속 하루치씩 쌓으면 됩니다.
export async function saveSalesSummarySnapshot(rows: SalesSummaryDailyRow[], fileName?: string) {
  const clean = (rows || [])
    .map((r) => ({
      date: text(r.date),
      channelGroup: text(r.channelGroup),
      channelCode: text(r.channelCode),
      storeName: text(r.storeName),
      qty: num(r.qty),
      amount: num(r.amount),
      receiptCount: num(r.receiptCount),
      target: num(r.target),
    }))
    .filter((r) => r.date && r.storeName);
  if (!clean.length) {
    throw new Error("업로드할 매출 데이터를 찾지 못했습니다. 파일 형식을 확인해주세요.");
  }

  const dbId = getDbSheetId();
  await ensureSheetExistsById(dbId, SALES_SUMMARY_SHEET, SALES_SUMMARY_HEADER);
  await ensureSheetExistsById(dbId, SALES_SUMMARY_META_SHEET, SALES_SUMMARY_META_HEADER);

  const keyOf = (r: { date: string; channelCode: string; storeName: string }) => `${r.date}__${r.channelCode || r.storeName}__${r.storeName}`;

  // 기존에 쌓여있던 전체를 먼저 읽어옵니다(이미 A2:H60000 상한 — readSalesSummarySnapshot과
  // 동일한 캡, 하루 38~60행씩 늘어나는 정도라 앞으로 몇 년치 여유가 있습니다).
  const existingRaw = await getSheetValuesById(dbId, SALES_SUMMARY_SHEET, "A2:H60000").catch(() => [] as any[]);
  const merged = new Map<string, SalesSummaryDailyRow>();
  for (const r of existingRaw) {
    const date = text(r?.[0]);
    const storeName = text(r?.[3]);
    if (!date || !storeName) continue;
    const row: SalesSummaryDailyRow = {
      date,
      channelGroup: text(r?.[1]),
      channelCode: text(r?.[2]),
      storeName,
      qty: num(r?.[4]),
      amount: num(r?.[5]),
      receiptCount: num(r?.[6]),
      target: num(r?.[7]),
    };
    merged.set(keyOf(row), row);
  }
  for (const r of clean) merged.set(keyOf(r), r); // 새로 올라온 행이 같은 키를 덮어씀(정정 포함)

  const mergedRows = Array.from(merged.values()).sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  const sheetRows = mergedRows.map((r) => [r.date, r.channelGroup, r.channelCode, r.storeName, r.qty, r.amount, r.receiptCount, r.target]);
  await safeReplaceSheetValuesById(dbId, SALES_SUMMARY_SHEET, [SALES_SUMMARY_HEADER, ...sheetRows]);

  const storeCount = new Set(mergedRows.map((r) => r.storeName)).size;
  const cumulativeStart = mergedRows[0]?.date || "";
  const cumulativeEnd = mergedRows[mergedRows.length - 1]?.date || "";
  const newDates = clean.map((r) => r.date).sort();
  const newStartDate = newDates[0] || "";
  const newEndDate = newDates[newDates.length - 1] || "";
  const uploadedAt = nowKSTDateTime();

  await safeReplaceSheetValuesById(dbId, SALES_SUMMARY_META_SHEET, [
    SALES_SUMMARY_META_HEADER,
    [uploadedAt, mergedRows.length, storeCount, cumulativeStart, cumulativeEnd, text(fileName), clean.length, newStartDate, newEndDate],
  ]);

  return {
    ok: true,
    rowCount: mergedRows.length,
    storeCount,
    startDate: cumulativeStart,
    endDate: cumulativeEnd,
    uploadedAt,
    newRowCount: clean.length,
    newStartDate,
    newEndDate,
  };
}

export async function getSalesSummaryMeta() {
  const dbId = getDbSheetId();
  const rows = await getSheetValuesById(dbId, SALES_SUMMARY_META_SHEET, "A2:I2").catch(() => [] as any[]);
  const row = rows[0];
  if (!row || !text(row[0])) return null;
  return {
    uploadedAt: text(row[0]), // 마지막 업로드 시각
    rowCount: num(row[1]), // 누적 전체 행수
    storeCount: num(row[2]), // 누적 전체 매장수
    startDate: text(row[3]), // 누적 시작일
    endDate: text(row[4]), // 누적 종료일(=대개 어제)
    fileName: text(row[5]), // 최근 업로드 파일명
    newRowCount: num(row[6]), // 최근 업로드분 행수
    newStartDate: text(row[7]), // 최근 업로드분 시작일
    newEndDate: text(row[8]), // 최근 업로드분 종료일
  };
}

export async function readSalesSummarySnapshot(): Promise<{ rows: SalesSummaryDailyRow[]; meta: Awaited<ReturnType<typeof getSalesSummaryMeta>> }> {
  const dbId = getDbSheetId();
  // MARK: 원본 파일은 38개 매장 × (2025-01-02 ~ 오늘)치라 지금 기준 약 2만6천 행 정도입니다.
  // 매일 하루씩만 늘어나므로 6만 행이면 앞으로 몇 년치 여유가 있습니다(오늘 겪은 OOM 교훈으로
  // "A2:G500000" 같은 과도하게 넓은 범위는 처음부터 쓰지 않습니다).
  const [dataRows, meta] = await Promise.all([
    getSheetValuesById(dbId, SALES_SUMMARY_SHEET, "A2:H60000").catch(() => [] as any[]),
    getSalesSummaryMeta().catch(() => null),
  ]);
  const rows: SalesSummaryDailyRow[] = dataRows
    .filter((r) => r && text(r[0]) && text(r[3]))
    .map((r) => ({
      date: text(r[0]),
      channelGroup: text(r[1]),
      channelCode: text(r[2]),
      storeName: text(r[3]),
      qty: num(r[4]),
      amount: num(r[5]),
      receiptCount: num(r[6]),
      target: num(r[7]),
    }));
  return { rows, meta };
}

function daysInMonth(year: number, month1to12: number) {
  return new Date(year, month1to12, 0).getDate();
}

function dayOfYear(dateKey: string) {
  const d = parseDate(dateKey);
  if (!d) return 0;
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.round((d.getTime() - start.getTime()) / 86400000) + 1;
}

// 기간 [startKey, endKey](양끝 포함)의 실적/목표 합계. seen store rows만 대상으로 하므로
// 호출부에서 이미 storeRows(그 매장의 행만)를 넘겨야 합니다.
function sumPeriod(storeRows: SalesSummaryDailyRow[], startKey: string, endKey: string) {
  let amount = 0;
  let target = 0;
  let qty = 0;
  let receiptCount = 0;
  let dayCount = 0;
  for (const r of storeRows) {
    if (r.date < startKey || r.date > endKey) continue;
    amount += r.amount;
    target += r.target;
    qty += r.qty;
    receiptCount += r.receiptCount;
    dayCount++;
  }
  return { amount, target, qty, receiptCount, dayCount };
}

// 객단가 = 매출금액 / 영수건수. 건수가 0이면(데이터 없음) 의미가 없으니 null로 둡니다.
function avgReceiptAmount(amount: number, receiptCount: number): number | null {
  return receiptCount > 0 ? amount / receiptCount : null;
}

// MARK 2026-09-24: 매출탭 초기 매장 나열 순서 — 채널구분(로드샵→백화점→쇼핑몰→아울렛→위탁)
// 우선, 그 안에서는 점포코드 오름차순. includes()로 매칭해서 원본 파일의 "위탁(오프)" 같은
// 표기도 그대로 걸립니다. 목록에 없는 구분은 맨 뒤로(순서는 유지).
const SALES_SUMMARY_CHANNEL_GROUP_ORDER = ["로드샵", "백화점", "쇼핑몰", "아울렛", "위탁"];
function channelGroupRank(group: string): number {
  const idx = SALES_SUMMARY_CHANNEL_GROUP_ORDER.findIndex((k) => group.includes(k));
  return idx === -1 ? SALES_SUMMARY_CHANNEL_GROUP_ORDER.length : idx;
}

// 점포코드 자연 정렬(숫자 구간은 숫자로 비교) — "2"가 "10"보다 앞에 오도록, 코드가
// 0으로 안 채워져 있어도(패딩 없어도) 사람이 보기에 자연스러운 순서로 정렬됩니다.
function naturalCompare(a: string, b: string): number {
  const ax = a.match(/\d+|\D+/g) || [a];
  const bx = b.match(/\d+|\D+/g) || [b];
  const len = Math.max(ax.length, bx.length);
  for (let i = 0; i < len; i++) {
    const as = ax[i] ?? "";
    const bs = bx[i] ?? "";
    const an = Number(as);
    const bn = Number(bs);
    if (as !== "" && bs !== "" && !Number.isNaN(an) && !Number.isNaN(bn)) {
      if (an !== bn) return an - bn;
    } else if (as !== bs) {
      return as < bs ? -1 : 1;
    }
  }
  return 0;
}

function growthRate(current: number, previous: number, storeExistedInPrevPeriod: boolean): number | null {
  if (!storeExistedInPrevPeriod) return null; // "동일"(같은 매장) 조건 미충족 — 신규 매장 등
  if (!previous) return current > 0 ? null : 0; // 전년 실적 0이면 배율이 무의미 — 신장률 표기 안 함
  return (current - previous) / previous;
}

export interface StoreSalesSummaryRow {
  storeName: string;
  channelGroup: string;
  channelCode: string;
  // MARK 2026-09-23: 각 기간 블록에 avgReceiptAmount(객단가=매출금액/영수건수)를 추가했습니다 —
  // 화면에서 기본은 숨기고 토글로 펼쳐볼 수 있게 할 예정이라, 매 기간마다 하나씩만 있으면 됩니다.
  // MARK 2026-09-25: 매출탭 상단 "합계" 줄에서 객단가를 (매장별 객단가의 단순평균이 아니라)
  // 매출금액합계/영수건수합계로 정확히 계산할 수 있도록, 원본 영수건수(receiptCount)도 같이
  // 내려줍니다(화면에 직접 표시하진 않고, 합계 계산에만 씀).
  daily: { date: string; target: number; actual: number; achievementRate: number | null; qty: number; avgReceiptAmount: number | null; receiptCount: number; prevYearAmount: number; yoyGrowthRate: number | null };
  weekly: { start: string; end: string; target: number; actual: number; achievementRate: number | null; avgReceiptAmount: number | null; receiptCount: number; prevWeekAmount: number; wowGrowthRate: number | null; prevYearAmount: number; yoyGrowthRate: number | null };
  // MARK 2026-09-25: fullMonthTarget = 이번달 "전체"(월말까지) 목표 — "이대로가면 착지금액"을
  // 계산할 때 착지 달성률을 비교할 분모로 씁니다(periodTarget은 asOfDate까지만이라 착지 비교엔 부적합).
  monthly: { month: string; periodTarget: number; actual: number; achievementRate: number | null; avgReceiptAmount: number | null; receiptCount: number; progressRate: number; prevYearAmount: number; yoyGrowthRate: number | null; fullMonthTarget: number };
  prevMonth: { month: string; target: number; actual: number; achievementRate: number | null; avgReceiptAmount: number | null; receiptCount: number; prevYearAmount: number; yoyGrowthRate: number | null };
  annual: { year: number; ytdTarget: number; ytdActual: number; achievementRate: number | null; avgReceiptAmount: number | null; receiptCount: number; progressRate: number; prevYearAmount: number; yoyGrowthRate: number | null };
  // MARK 2026-09-22: 사용자가 시작~끝 날짜를 직접 골라 조회했을 때만 채워짐(기본 조회에는 없음).
  customPeriod?: {
    start: string; end: string; target: number; actual: number; achievementRate: number | null; qty: number; avgReceiptAmount: number | null; receiptCount: number;
    prevYearStart: string; prevYearEnd: string; prevYearAmount: number; yoyGrowthRate: number | null;
  };
}

export interface SalesSummaryQueryOptions {
  dailyDate?: string; // "일간" 블록에서 보고 싶은 날짜(기본값=데이터상 가장 최근 날짜)
  rangeStart?: string; // 커스텀 기간비교 시작일
  rangeEnd?: string; // 커스텀 기간비교 종료일
}

const SALES_SUMMARY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// MARK 2026-09-24: 매출탭(점포별)에 실제로 표시할 점포 화이트리스트 — 소천님이 지정한 이
// 34개 점포만 보여주고, 업로드 원본 파일에 섞여 있는 그 외 매장(테스트/중단 매장 등)은
// 화면에서 제외합니다. normalizeStoreKey()로 비교해서 "오프라인_" 접두어나 공백/구두점
// 차이는 무시하고 매칭합니다 — 화면에 보여줄 이름 자체는 업로드 원본 데이터의 표기를 그대로
// 씁니다(이 목록은 매칭용). 오픈 등으로 점포가 늘어나면 이 배열에 이름만 추가하면 됩니다.
const SALES_SUMMARY_STORE_WHITELIST = [
  "성수 플래그십",
  "신사 플래그십",
  "한남 플래그십",
  "서울숲 플래그십",
  "포시즌 아울렛 신사점",
  "신세계 센텀시티점",
  "신세계 광주점",
  "롯데백화점 평촌점",
  "롯데백화점 광복점",
  "신세계 의정부점",
  "신세계 대전점",
  "현대백화점 신촌점",
  "LF스퀘어 광양점",
  "아이파크몰 용산점",
  "스타필드 고양점",
  "현대커넥트 청주점",
  "스타필드 빌리지 운정점",
  "타임스퀘어 영등포점",
  "롯데아울렛 서울역점",
  "현대아울렛 송도점",
  "롯데아울렛 김해점",
  "롯데아울렛 동부산",
  "현대아울렛 남양주점",
  "팩토리아울렛 용인점",
  "오프라인_롯데면세점",
  "오프라인_무신사(강남)",
  "오프라인_무신사(대구)",
  "오프라인_무신사(백&캡클럽 서울숲)",
  "오프라인_무신사(성수)",
  "오프라인_무신사(수원)",
  "오프라인_무신사(은평)",
  "오프라인_무신사(홍대)",
  "오프라인_무신사(송도)",
  "오프라인_한컬렉션",
];
const SALES_SUMMARY_STORE_WHITELIST_KEYS = new Set(SALES_SUMMARY_STORE_WHITELIST.map((n) => normalizeStoreKey(n)));

// MARK 2026-09-25: "오프라인_롯데면세점"이 원본 파일에 점포코드 2개(21029/81028)로 겹쳐서
// 들어오는 바람에 매출탭에 같은 이름이 두 줄로 나뉘어 표시되는 문제가 있었습니다 —
// 소천님 확인: 21029는 빼고 81028만 남깁니다. 이름이 아니라 코드로 제외하므로, 같은 이름을
// 쓰는 다른 코드가 나중에 생겨도 여기 코드만 더 추가하면 됩니다.
const SALES_SUMMARY_STORE_CODE_EXCLUDE = new Set(["21029"]);

export async function buildStoreSalesSummary(options: SalesSummaryQueryOptions = {}): Promise<{
  asOfDate: string;
  dailyDate: string;
  customPeriod: { start: string; end: string; prevYearStart: string; prevYearEnd: string } | null;
  stores: StoreSalesSummaryRow[];
  meta: Awaited<ReturnType<typeof getSalesSummaryMeta>>;
}> {
  const { rows: rawRows, meta } = await readSalesSummarySnapshot();
  const rows = rawRows.filter(
    (r) => SALES_SUMMARY_STORE_WHITELIST_KEYS.has(normalizeStoreKey(r.storeName)) && !SALES_SUMMARY_STORE_CODE_EXCLUDE.has(text(r.channelCode))
  );
  if (!rows.length) return { asOfDate: "", dailyDate: "", customPeriod: null, stores: [], meta };

  const byStore = new Map<string, SalesSummaryDailyRow[]>();
  for (const r of rows) {
    if (!byStore.has(r.storeName)) byStore.set(r.storeName, []);
    byStore.get(r.storeName)!.push(r);
  }

  const earliestOverall = rows.reduce((min, r) => (r.date < min ? r.date : min), rows[0].date);
  const latestRowDate = rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0].date);

  // MARK 2026-09-24: 이제 매출목표를 미리(예: 다음달 치까지) 입력해두는 방식으로 운영하다 보니,
  // 데이터의 "가장 최근 날짜"가 목표만 있고 실적은 0인 미래 날짜로 밀리는 일이 생깁니다. 그
  // 미래 날짜를 그대로 asOfDate로 쓰면 일간/주간/월간/연간이 전부 텅 빈 미래 기준으로 계산돼서
  // 화면이 다 빈칸으로 보이는 문제가 있었습니다 — 그래서 asOfDate는 항상 실제 달력 기준
  // "어제"(KST)를 기본으로 쓰고, 업로드가 밀려서 데이터 자체가 어제보다 오래됐으면(아직 어제치가
  // 안 들어왔으면) 실제 있는 가장 최근 날짜로 폴백합니다.
  const yesterdayKST = yesterdayDateKeyKST();
  const asOfDate =
    yesterdayKST >= earliestOverall && yesterdayKST <= latestRowDate
      ? yesterdayKST
      : yesterdayKST > latestRowDate
      ? latestRowDate
      : earliestOverall;
  const asOfDateObj = parseDate(asOfDate)!;

  // MARK 2026-09-22: "일간" 블록만 원하는 날짜를 골라볼 수 있게 합니다(기본값=asOfDate=보통 어제)
  // — 주간/월간/전월/연간은 그대로 "지금 기준" 리포트라 dailyDate와 무관하게 asOfDate를 계속
  // 씁니다. 형식이 틀리거나 데이터 범위(가장 이른 날짜~asOfDate) 밖이면 조용히 무시하고 최신
  // 날짜로 폴백합니다(첫 파일은 과거 조회가 아예 안 됐던 것과 달리, 이제 쌓인 데이터 안에서는
  // 자유롭게 과거 하루를 골라볼 수 있습니다).
  const requestedDailyDate = options.dailyDate && SALES_SUMMARY_DATE_RE.test(options.dailyDate) ? options.dailyDate : "";
  const dailyDate = requestedDailyDate && requestedDailyDate >= earliestOverall && requestedDailyDate <= asOfDate ? requestedDailyDate : asOfDate;
  // MARK 2026-09-25: 전년 같은 날짜(-365일)로 비교하면 매년 요일이 하루(윤년엔 이틀)씩 밀려서
  // "월요일 vs 화요일"처럼 요일이 어긋나게 비교되는 문제가 있었습니다 — 주간 비교가 이미
  // -364일(정확히 52주 전)을 써서 요일을 맞추고 있는 것과 똑같이, 일간도 -364일로 맞춥니다.
  const prevYearDailyDate = dateAddDays(dailyDate, -364);

  // MARK 2026-09-22: 커스텀 기간비교 — 시작~끝 날짜를 직접 골라 그 기간의 목표달성률과
  // 전년동기 신장률을 같이 봅니다. 형식 오류거나 시작일이 종료일보다 뒤면 유효하지 않은
  // 것으로 보고 customPeriod는 null(=요청 안 한 것과 동일하게 처리).
  // MARK 2026-09-25: 여기도 위 일간과 같은 이유로 -365일이 아니라 -364일(52주 전)을 써서,
  // 예를 들어 "26-09-07(월)~26-09-13(일)"을 고르면 전년동기가 "25-09-08(월)~25-09-14(일)"처럼
  // 같은 요일로 맞춰지게 합니다.
  const rangeStartValid = options.rangeStart && SALES_SUMMARY_DATE_RE.test(options.rangeStart) ? options.rangeStart : "";
  const rangeEndValid = options.rangeEnd && SALES_SUMMARY_DATE_RE.test(options.rangeEnd) ? options.rangeEnd : "";
  const customPeriod = rangeStartValid && rangeEndValid && rangeStartValid <= rangeEndValid
    ? { start: rangeStartValid, end: rangeEndValid, prevYearStart: dateAddDays(rangeStartValid, -364), prevYearEnd: dateAddDays(rangeEndValid, -364) }
    : null;

  // 이번주(월~일) — asOfDate가 속한 주
  const dow = asOfDateObj.getDay(); // 0=일 ... 6=토
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const weekStart = dateAddDays(asOfDate, mondayOffset);
  const weekEnd = dateAddDays(weekStart, 6);
  const prevWeekStart = dateAddDays(weekStart, -7);
  const prevWeekEnd = dateAddDays(weekEnd, -7);
  const prevYearWeekStart = dateAddDays(weekStart, -364); // 정확히 52주 전 = 같은 요일
  const prevYearWeekEnd = dateAddDays(weekEnd, -364);

  const monthStart = firstDayOfMonth(asOfDate);
  // MARK 2026-09-25: "이대로가면 이번달 착지금액" 계산에 쓸 이번달 "전체" 목표(월말까지) —
  // monthNow.target은 asOfDate까지만 더해서 착지 달성률 비교엔 안 맞습니다. 소천님이 목표를
  // 미리(다음달치까지) 입력해두는 방식으로 운영 중이라 월말치 목표도 이미 들어있는 경우가
  // 많아서, 있으면 그대로 쓰고 없으면(아직 입력 전이면) 0으로 자연히 처리됩니다.
  const monthEndFull = lastDayOfMonth(monthStart);
  const prevYearMonthStart = dateAddDays(monthStart, -365);
  const prevYearAsOfDate = dateAddDays(asOfDate, -365);
  const prevYearMonthPeriodEnd = prevYearAsOfDate; // 같은 "1일~이맘때" 구간 비교

  const prevMonthKeyStr = previousMonthKey(asOfDate); // "YYYY-MM"
  const prevMonthStart = `${prevMonthKeyStr}-01`;
  const prevMonthEnd = lastDayOfMonth(prevMonthStart);
  const prevYearPrevMonthStart = dateAddDays(prevMonthStart, -365);
  const prevYearPrevMonthEnd = dateAddDays(prevMonthEnd, -365);

  const yearStart = `${asOfDateObj.getFullYear()}-01-01`;
  const prevYearYtdStart = `${asOfDateObj.getFullYear() - 1}-01-01`;
  const prevYearYtdEnd = prevYearAsOfDate;

  const dim = daysInMonth(asOfDateObj.getFullYear(), asOfDateObj.getMonth() + 1);
  const monthProgressRate = asOfDateObj.getDate() / dim;
  const yearProgressRate = dayOfYear(asOfDate) / (new Date(asOfDateObj.getFullYear(), 1, 29).getMonth() === 1 ? 366 : 365);

  const stores: StoreSalesSummaryRow[] = [];
  for (const [storeName, storeRowsUnsorted] of byStore.entries()) {
    const storeRows = [...storeRowsUnsorted].sort((a, b) => (a.date < b.date ? -1 : 1));
    const earliestDate = storeRows[0].date;
    const sample = storeRows[storeRows.length - 1];

    const existedBefore = (periodStart: string) => earliestDate <= periodStart;

    // 일간 — dailyDate 기준(기본값 asOfDate와 동일, 사용자가 날짜를 고르면 그 날짜)
    const todayRow = storeRows.find((r) => r.date === dailyDate);
    const prevYearDayRow = storeRows.find((r) => r.date === prevYearDailyDate);
    const dailyActual = todayRow?.amount || 0;
    const dailyTarget = todayRow?.target || 0;
    const dailyPrevYear = prevYearDayRow?.amount || 0;

    // 주간
    const weekNow = sumPeriod(storeRows, weekStart, weekEnd);
    const weekPrev = sumPeriod(storeRows, prevWeekStart, prevWeekEnd);
    const weekPrevYear = sumPeriod(storeRows, prevYearWeekStart, prevYearWeekEnd);

    // 이번달(월초~asOfDate = 기간목표만 — 아직 안 지난 날짜의 목표는 원본에 없을 수 있음)
    const monthNow = sumPeriod(storeRows, monthStart, asOfDate);
    const monthPrevYear = sumPeriod(storeRows, prevYearMonthStart, prevYearMonthPeriodEnd);
    // 착지금액 계산용 — 월말까지의 전체 목표(미리 입력해둔 경우에만 값이 있고, 아직이면 0)
    const monthFull = sumPeriod(storeRows, monthStart, monthEndFull);

    // 전월(완결된 달 — 전체 월 목표 사용 가능)
    const prevMonthNow = sumPeriod(storeRows, prevMonthStart, prevMonthEnd);
    const prevMonthPrevYear = sumPeriod(storeRows, prevYearPrevMonthStart, prevYearPrevMonthEnd);

    // 연간(올해 1/1~asOfDate = 기간목표만)
    const yearNow = sumPeriod(storeRows, yearStart, asOfDate);
    const yearPrevYear = sumPeriod(storeRows, prevYearYtdStart, prevYearYtdEnd);

    // 커스텀 기간비교(요청했을 때만)
    let customPeriodRow: StoreSalesSummaryRow["customPeriod"];
    if (customPeriod) {
      const cur = sumPeriod(storeRows, customPeriod.start, customPeriod.end);
      const prev = sumPeriod(storeRows, customPeriod.prevYearStart, customPeriod.prevYearEnd);
      customPeriodRow = {
        start: customPeriod.start,
        end: customPeriod.end,
        target: cur.target,
        actual: cur.amount,
        achievementRate: cur.target ? cur.amount / cur.target : null,
        qty: cur.qty,
        avgReceiptAmount: avgReceiptAmount(cur.amount, cur.receiptCount),
        receiptCount: cur.receiptCount,
        prevYearStart: customPeriod.prevYearStart,
        prevYearEnd: customPeriod.prevYearEnd,
        prevYearAmount: prev.amount,
        yoyGrowthRate: growthRate(cur.amount, prev.amount, existedBefore(customPeriod.prevYearStart)),
      };
    }

    stores.push({
      storeName,
      channelGroup: sample.channelGroup,
      channelCode: sample.channelCode,
      daily: {
        date: dailyDate,
        target: dailyTarget,
        actual: dailyActual,
        achievementRate: dailyTarget ? dailyActual / dailyTarget : null,
        qty: todayRow?.qty || 0,
        avgReceiptAmount: avgReceiptAmount(dailyActual, todayRow?.receiptCount || 0),
        receiptCount: todayRow?.receiptCount || 0,
        prevYearAmount: dailyPrevYear,
        yoyGrowthRate: growthRate(dailyActual, dailyPrevYear, existedBefore(prevYearDailyDate)),
      },
      weekly: {
        start: weekStart,
        end: weekEnd,
        target: weekNow.target,
        actual: weekNow.amount,
        achievementRate: weekNow.target ? weekNow.amount / weekNow.target : null,
        avgReceiptAmount: avgReceiptAmount(weekNow.amount, weekNow.receiptCount),
        receiptCount: weekNow.receiptCount,
        prevWeekAmount: weekPrev.amount,
        wowGrowthRate: growthRate(weekNow.amount, weekPrev.amount, existedBefore(prevWeekStart)),
        prevYearAmount: weekPrevYear.amount,
        yoyGrowthRate: growthRate(weekNow.amount, weekPrevYear.amount, existedBefore(prevYearWeekStart)),
      },
      monthly: {
        month: monthStart.slice(0, 7),
        periodTarget: monthNow.target,
        actual: monthNow.amount,
        achievementRate: monthNow.target ? monthNow.amount / monthNow.target : null,
        avgReceiptAmount: avgReceiptAmount(monthNow.amount, monthNow.receiptCount),
        receiptCount: monthNow.receiptCount,
        progressRate: monthProgressRate,
        prevYearAmount: monthPrevYear.amount,
        yoyGrowthRate: growthRate(monthNow.amount, monthPrevYear.amount, existedBefore(prevYearMonthStart)),
        fullMonthTarget: monthFull.target,
      },
      prevMonth: {
        month: prevMonthKeyStr,
        target: prevMonthNow.target,
        actual: prevMonthNow.amount,
        achievementRate: prevMonthNow.target ? prevMonthNow.amount / prevMonthNow.target : null,
        avgReceiptAmount: avgReceiptAmount(prevMonthNow.amount, prevMonthNow.receiptCount),
        receiptCount: prevMonthNow.receiptCount,
        prevYearAmount: prevMonthPrevYear.amount,
        yoyGrowthRate: growthRate(prevMonthNow.amount, prevMonthPrevYear.amount, existedBefore(prevYearPrevMonthStart)),
      },
      annual: {
        year: asOfDateObj.getFullYear(),
        ytdTarget: yearNow.target,
        ytdActual: yearNow.amount,
        achievementRate: yearNow.target ? yearNow.amount / yearNow.target : null,
        avgReceiptAmount: avgReceiptAmount(yearNow.amount, yearNow.receiptCount),
        receiptCount: yearNow.receiptCount,
        progressRate: yearProgressRate,
        prevYearAmount: yearPrevYear.amount,
        yoyGrowthRate: growthRate(yearNow.amount, yearPrevYear.amount, existedBefore(prevYearYtdStart)),
      },
      ...(customPeriodRow ? { customPeriod: customPeriodRow } : {}),
    });
  }

  // MARK 2026-09-24: 기존엔 주간 실적 내림차순이었는데, 소천님 요청으로 채널구분(로드샵→
  // 백화점→쇼핑몰→아울렛→위탁) → 점포코드 오름차순으로 변경했습니다.
  stores.sort((a, b) => {
    const rankDiff = channelGroupRank(a.channelGroup) - channelGroupRank(b.channelGroup);
    if (rankDiff !== 0) return rankDiff;
    const codeDiff = naturalCompare(a.channelCode || "", b.channelCode || "");
    if (codeDiff !== 0) return codeDiff;
    return a.storeName < b.storeName ? -1 : a.storeName > b.storeName ? 1 : 0;
  });

  return { asOfDate, dailyDate, customPeriod, stores, meta };
}
