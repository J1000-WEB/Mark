import fallback from "./mark-data.json";
import { getDbSheetId, getDailySourceSheetId, getHistorySheetId, getWeeklyHistorySheetId, getSheetId, getManySheetValues, getManySheetValuesById, getSpreadsheetTitles, getSpreadsheetTitlesById, getSheetValuesById } from "./googleSheets";
import { isCompactDailyHistoryHeader, expandCompactDailyHistoryRows, expandAnyDailyHistoryRows } from "./dailySales";
import { loadStyleLaunchMap } from "./styleLaunchMaster";
import { saveWeeklyStylePrices, currentWeekMonday } from "./stylePriceHistory";
import { mergeStoreDailyAmounts, getMergedAmount, yesterdayDateKeyKST, getComparisonDateForDaily } from "./storeDailyAmount";

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


function buildInventory(productRows: any[], inventoryRows: any[], companyTopProducts: any[]) {
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
  const byStyle = new Map<string, any[]>();
  const storeAmountMap = new Map<string, number>();

  for (const r of coreProducts) {
    const storeName = r.storeName;
    const amount = Number(r.weekAmount || 0);
    storeAmountMap.set(storeName, Number(storeAmountMap.get(storeName) || 0) + amount);

    if (!byStyle.has(r.styleCode)) byStyle.set(r.styleCode, []);
    byStyle.get(r.styleCode)!.push(r);
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
        senderSafeStock: Math.max(
          3,
          Math.ceil(targetStock),
          Math.ceil(weekNet * 2)
        ),
        transferableQty: Math.max(
          0,
          Math.floor(stock - Math.max(3, Math.ceil(targetStock), Math.ceil(weekNet * 2)))
        ),
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
          reason: [
            `전사 판매순위 ${companyRank === 9999 ? "권외" : `${companyRank}위`} 상품입니다.`,
            `${to.storeName}은 금주 판매 ${Math.round(to.weekNet || 0).toLocaleString("ko-KR")}개, 금주매출 ${Math.round(to.weekAmount || 0).toLocaleString("ko-KR")}원 기준으로 상품판매력 ${to.productPowerScore.toFixed(1)}점입니다.`,
            `현재 ${to.storeName} 재고는 ${Math.round(to.stock).toLocaleString("ko-KR")}개, 재고주수 ${to.stockWeeks >= 999 ? "판매없음" : `${to.stockWeeks.toFixed(1)}주`}로 목표재고 ${Math.round(to.targetStock).toLocaleString("ko-KR")}개 대비 부족하여 재고부족도 ${to.shortageScore.toFixed(1)}점으로 계산되었습니다.`,
            `${from.storeName}은 현재 재고 ${Math.round(from.stock).toLocaleString("ko-KR")}개 중 안전재고 ${Math.round(fromSafeStock).toLocaleString("ko-KR")}개를 남기고 최대 ${Math.round(fromAllow).toLocaleString("ko-KR")}개까지 출고 가능하며, 이번 제안은 ${Math.round(suggestQty).toLocaleString("ko-KR")}개입니다.`,
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
        const stock = Number(r.storeStock || 0);
        const stockWeeks = weekNet > 0 ? stock / weekNet : stock > 0 ? 999 : 0;
        return { ...r, weekNet, stock, stockWeeks };
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

      // 보내는점포: 재고주수가 절대적으로 높은(=정체된) 매장. 진열 유지를 위해 최소수량은 남겨둡니다.
      const senders = rowsEnriched
        .filter((r) => r.stock > RT_UNDERPERFORM_SENDER_KEEP_UNITS && r.stockWeeks >= RT_UNDERPERFORM_SENDER_STOCK_WEEKS_MIN)
        .sort((a, b) => b.stockWeeks - a.stockWeeks);

      if (!receivers.length || !senders.length) continue;

      const remainingSend = new Map<string, number>();
      for (const s of senders) remainingSend.set(s.storeName, Math.max(0, s.stock - RT_UNDERPERFORM_SENDER_KEEP_UNITS));

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
            reason: [
              `전사 판매순위 ${companyRank === 9999 ? "권외" : `${companyRank}위`}로 TOP${RT_ELIGIBLE_RANK} 밖 부진상품입니다.`,
              `${from.storeName}은 이 상품 재고주수 ${from.stockWeeks >= 999 ? "판매없음(장기체화)" : `${from.stockWeeks.toFixed(1)}주`}로 과잉재고 상태입니다 (현재 재고 ${Math.round(from.stock).toLocaleString("ko-KR")}개).`,
              `${to.storeName}은 이 상품 기준 재고주수 ${to.stockWeeks.toFixed(1)}주로, 같은 상품을 파는 다른 매장들 대비 상대적으로 회전이 빠른(하위 ${Math.round(RT_UNDERPERFORM_RECEIVER_PERCENTILE * 100)}% 이내) 매장입니다.`,
              `과잉재고 매장에서 소화 가능한 매장으로 이동해 재고 소진과 판매 기회를 함께 노립니다. 이번 제안 수량은 ${Math.round(suggestQty).toLocaleString("ko-KR")}개입니다.`,
              `출고점은 진열 유지를 위해 최소 ${RT_UNDERPERFORM_SENDER_KEEP_UNITS}개는 남겨두고 계산했습니다.`,
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

  // MARK 6.51: Layer 0(전사지시) — VMD가 "이번주 뭘 밀지" 한 곳에서 보게, 이미 계산된
  // 부진/호조 프로모션 후보 + 신상품(최근 4주 입고)을 하나의 지시 리스트로 합칩니다.
  const nowForDirectives = new Date();
  const styleLaunchInfo = new Map<string, { productName: string; launchTime: number; launchDate: string }>();
  for (const r of productRows) {
    if (!r.launchTime) continue;
    const existing = styleLaunchInfo.get(r.styleCode);
    if (!existing) styleLaunchInfo.set(r.styleCode, { productName: r.productName, launchTime: r.launchTime, launchDate: r.launchDate });
  }
  const newProductDirectives = Array.from(styleLaunchInfo.entries())
    .map(([styleCode, info]) => ({
      styleCode,
      productName: info.productName,
      weeksSinceLaunch: (nowForDirectives.getTime() - info.launchTime) / (1000 * 60 * 60 * 24 * 7),
      launchDate: info.launchDate,
    }))
    .filter((x) => x.weeksSinceLaunch >= 0 && x.weeksSinceLaunch <= 4)
    .sort((a, b) => a.weeksSinceLaunch - b.weeksSinceLaunch);

  const styleDirectives = [
    ...promotion.promotionSuggestions.map((it: any) => ({
      styleCode: it.styleCode,
      productName: it.productName,
      directiveType: "소진" as const,
      reason: it.action,
      priority: Math.round(Math.min(100, (it.stockWeeks || 0) * 5)),
    })),
    ...(promotion.suppressedPromotionCandidates || [])
      .filter((it: any) => it.action && it.action.includes("매출드라이빙"))
      .map((it: any) => ({
        styleCode: it.styleCode,
        productName: it.productName,
        directiveType: "매출드라이빙" as const,
        reason: it.action,
        priority: Math.round(Math.max(0, 100 - (it.companyRank || 100))),
      })),
    ...newProductDirectives.map((it) => ({
      styleCode: it.styleCode,
      productName: it.productName,
      directiveType: "신상품노출" as const,
      reason: `입고 ${it.weeksSinceLaunch.toFixed(1)}주 차 신상품`,
      priority: Math.round(Math.max(0, 100 - it.weeksSinceLaunch * 20)),
    })),
  ].sort((a, b) => b.priority - a.priority);

  return {
    periodLabel: "재고CTRL 기준: RT=오프라인 점포 간 이동 / 온라인 이관=온라인 가용재고→오프라인 배분 / 프로모션=오프라인 운영재고",
    stockoutRisk: stockoutRisk.sort((a, b) => a.offlineWeeks - b.offlineWeeks).slice(0, 10),
    overstockRisk: overstockRisk.sort((a, b) => b.offlineWeeks - a.offlineWeeks).slice(0, 10),
    allocationSuggestions: allocationSuggestions.sort((a, b) => b.weekAmount - a.weekAmount).slice(0, 5),
    onlineTransferSuggestions,
    rtSuggestions: sortedRtSuggestions.slice(0, RT_SUGGESTION_SAFETY_CAP),
    rtEligibleProductRank: RT_ELIGIBLE_RANK,
    rtSuggestionProductCount,
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
export async function buildProductRowsFromDailyHistory(anchorDate = todayKST()) {
  const weekEnd = anchorDate;
  const weekStart = addDaysKST(weekEnd, -6);
  const prevWeekEnd = addDaysKST(weekStart, -1);
  const prevWeekStart = addDaysKST(prevWeekEnd, -6);

  const historyId = getHistorySheetId();
  const raw = await getSheetValuesById(historyId, "Daily_Sales_History", "A:ZZ").catch(() => []);
  const flatRows = expandAnyDailyHistoryRows(raw || []);
  const launchMap = await loadStyleLaunchMap().catch(() => new Map<string, string>());

  const grouped = new Map<string, any>();
  const latestStockDateByStyle = new Map<string, string>();
  const latestStockDateBySku = new Map<string, string>();

  for (const r of flatRows) {
    if (r.date < prevWeekStart || r.date > weekEnd) continue;
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

    // 재고는 "가장 최근 날짜"의 값만 사용 (합산 금지 — 스냅샷 성격)
    const lastStyleDate = latestStockDateByStyle.get(key);
    if (!lastStyleDate || r.date > lastStyleDate) {
      latestStockDateByStyle.set(key, r.date);
      item.storeStock = Number(r.stock || 0);
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

    const skuKey = `${key}__${r.colorCode}__${r.size}`;
    const lastSkuDate = latestStockDateBySku.get(skuKey);
    if (!lastSkuDate || r.date > lastSkuDate) {
      latestStockDateBySku.set(skuKey, r.date);
      sku.stock = Number(r.stock || 0);
    }
  }

  return Array.from(grouped.values());
}

export async function buildRtRequestSuggestion(styleCodeInput: string, toStoreInput: string, desiredQtyInput?: number, colorInput?: string) {
  const styleCode = text(styleCodeInput).toUpperCase();
  if (!styleCode) return { ok: false, error: "품번을 입력해주세요." };
  if (!text(toStoreInput)) return { ok: false, error: "요청 점포를 입력해주세요." };

  const productRowsRaw = await buildProductRowsFromDailyHistory();

  const coreRows = productRowsRaw.filter(
    (r: any) => isCoreOfflineSalesStore(r.storeName) && text(r.styleCode).toUpperCase() === styleCode
  );
  if (!coreRows.length) {
    return { ok: false, error: `품번 "${styleCodeInput}"에 대한 데이터를 최근 2주 판매기록에서 찾지 못했습니다. 품번을 다시 확인해주세요.` };
  }

  const colorCode = text(colorInput).toUpperCase();
  const useColor = !!colorCode;
  if (useColor) {
    const anyColorMatch = coreRows.some((r: any) => colorLevelStats(r, colorCode).found);
    if (!anyColorMatch) {
      return { ok: false, error: `품번 "${styleCodeInput}"에서 칼라 "${colorInput}"를 찾지 못했습니다. 칼라코드를 다시 확인해주세요.` };
    }
  }

  const toKey = normalizeStoreKey(toStoreInput);
  const toRow = coreRows.find((r: any) => normalizeStoreKey(r.storeName) === toKey);
  const toColorStats = toRow && useColor ? colorLevelStats(toRow, colorCode) : null;
  const productName = coreRows[0]?.productName || "";
  const toStoreName = toRow?.storeName || toStoreInput;
  const toStock = useColor ? (toColorStats?.stock || 0) : Number(toRow?.storeStock || 0);
  const toWeekNet = useColor ? (toColorStats?.weekNet || 0) : Number(toRow?.weekNet || 0);
  const toStockWeeks = toWeekNet > 0 ? toStock / toWeekNet : toStock > 0 ? 999 : 0;
  const resolvedColorName = useColor ? (toColorStats?.colorName || coreRows.map((r: any) => colorLevelStats(r, colorCode).colorName).find(Boolean) || "") : "";

  // 호조 엔진과 동일한 "목표재고 3주" 기준을 기본값으로 사용하되, 사용자가 수량을 직접 지정하면 그걸 우선합니다.
  const RT_TARGET_STOCK_WEEKS = 3;
  const defaultTarget = Math.max(1, Math.ceil(toWeekNet * RT_TARGET_STOCK_WEEKS));
  const desiredQty = desiredQtyInput && desiredQtyInput > 0
    ? Math.round(desiredQtyInput)
    : Math.max(1, defaultTarget - toStock);

  const senderCandidates = coreRows
    .filter((r: any) => normalizeStoreKey(r.storeName) !== toKey)
    .map((r: any) => {
      const colorStats = useColor ? colorLevelStats(r, colorCode) : null;
      const weekNet = useColor ? (colorStats?.weekNet || 0) : Number(r.weekNet || 0);
      const stock = useColor ? (colorStats?.stock || 0) : Number(r.storeStock || 0);
      const targetStock = Math.max(1, Math.ceil(weekNet * RT_TARGET_STOCK_WEEKS));
      const safeStock = Math.max(3, targetStock, Math.ceil(weekNet * 2));
      const transferable = Math.max(0, Math.floor(stock - safeStock));
      const stockWeeks = weekNet > 0 ? stock / weekNet : stock > 0 ? 999 : 0;
      return { storeName: r.storeName, stock, weekNet, stockWeeks, transferable, hasColor: !useColor || !!colorStats?.found };
    })
    .filter((r) => r.transferable > 0 && r.hasColor)
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
      ].join("\n"),
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
    const weeklyHistoryId = getWeeklyHistorySheetId();
    const mainId = getSheetId();

    const dbTitles = await getSpreadsheetTitlesById(dbId);
    const historyTitles = await getSpreadsheetTitlesById(historyId).catch(() => []);
    const weeklyHistoryTitles = await getSpreadsheetTitlesById(weeklyHistoryId).catch(() => []);
    const mainTitles = await getSpreadsheetTitlesById(mainId).catch(() => []);

    const performanceSheetName = pickNormalizedTitle(dbTitles, ["Promotion_Performance", "프로모션성과", "RT프로모션성과"], "Promotion_Performance");
    const performanceValues = performanceSheetName && dbTitles.includes(performanceSheetName)
      ? await getSheetValuesById(dbId, performanceSheetName, "A:AZ")
      : [];

    const basePerformanceRows = parsePerformanceRows(performanceValues || []);
    const productNameMap = new Map<string, string>();
    for (const row of basePerformanceRows as any[]) {
      const style = text(row.styleCode);
      const productName = text(row.productName);
      if (style && productName) productNameMap.set(style, productName);
    }

    let dailyValues: any[][] = [];
    let dailySource = "NOT_FOUND";
    const dailySheetName = pickNormalizedTitle(historyTitles, ["Daily_Sales_History", "DailySalesHistory", "Daily_History", "일간스냅샷", "일별판매히스토리"], "Daily_Sales_History");

    if (dailySheetName && historyTitles.includes(dailySheetName)) {
      dailyValues = await getSheetValuesById(historyId, dailySheetName, "A:AZ").catch(() => []);
      dailySource = "MARK_HISTORY";
    } else if (dbTitles.includes("Daily_Sales_History")) {
      dailyValues = await getSheetValuesById(dbId, "Daily_Sales_History", "A:AZ").catch(() => []);
      dailySource = "MARK_DB_FALLBACK";
    }

    const dailyRows = parseDailyHistoryRows(dailyValues || []);

    const weeklyStoreSheetName = weeklyHistoryTitles.includes("Weekly_history") ? "Weekly_history" : "";
    const weeklyStoreValues = weeklyStoreSheetName ? await getSheetValuesById(weeklyHistoryId, weeklyStoreSheetName, "A:S").catch(() => []) : [];
    const weeklyStoreRows = parseWeeklyStoreHistoryRows(weeklyStoreValues || []);

    const weeklyPriceSheetName = pickNormalizedTitle(mainTitles, ["금주전주", "금주/전주", "금주 전주"], "금주전주");
    const weeklyPriceValues = weeklyPriceSheetName && mainTitles.includes(weeklyPriceSheetName)
      ? await getSheetValuesById(mainId, weeklyPriceSheetName, "A:AZ").catch(() => [])
      : [];
    const weeklyUnitPriceMap = parseWeeklyUnitPriceMap(weeklyPriceValues || []);

    for (const row of dailyRows as any[]) {
      const style = text(row.styleCode);
      const productName = text(row.productName);
      if (style && productName && !productNameMap.has(style)) productNameMap.set(style, productName);
    }

    const rtSheetName = mainTitles.includes("RT_Result") ? "RT_Result" : "";
    const channelSheetName = mainTitles.find((title) => normalizeSheetName(title).includes("객_전주")) || "";
    const channelValues = channelSheetName ? await getSheetValuesById(mainId, channelSheetName, "A:AZ").catch(() => []) : [];
    const codeNameMap = buildChannelCodeNameMap(channelValues || []);
    const rtValues = rtSheetName ? await getSheetValuesById(mainId, rtSheetName, "A:AZ").catch(() => []) : [];
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
        weeklyStoreSheetName,
        weeklyStoreRows: weeklyStoreRows.length,
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

async function loadDashboardDailyHistory() {
  const historyId = getHistorySheetId();
  const titles = await getSpreadsheetTitlesById(historyId).catch(() => []);
  const sheetName = pickNormalizedTitle(titles, ["Daily_Sales_History", "DailySalesHistory", "Daily_History", "일간스냅샷", "일별판매히스토리"], "Daily_Sales_History");
  if (!sheetName || !titles.includes(sheetName)) return { sheetName: "", rows: [] as any[] };
  const values = await getSheetValuesById(historyId, sheetName, "A:AZ").catch(() => []);
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
  const dbId = getDailySourceSheetId();
  const titles = await getSpreadsheetTitlesById(dbId).catch(() => []);
  const sheetName = pickNormalizedTitle(titles, ["일간매출(26년)", "일간매출26년", "일간매출", "Daily_Store_Sales", "DailyStoreSales"], "일간매출(26년)");
  if (!sheetName || !titles.includes(sheetName)) return { sheetName: "", rows: [] as any[] };
  const values = await getSheetValuesById(dbId, sheetName, "A:ZZ").catch(() => []);
  return { sheetName, rows: parseDailySalesSheetRows(values || []) };
}

function latestStoreSalesDate(rows: any[]) {
  return [...new Set(rows.map((r: any) => r.date).filter(Boolean))].sort().pop() || "";
}

function normalizeAnchorMondayFromValue(value: any) {
  const d = parseDate(normalizeDateKey(value) || value);
  if (!d) return "";
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + diffToMonday);
  return ymdLocalDate(out);
}

function weeklyAnchorFromWeeklySheet(rows: any[][]) {
  // 금주/전주 시트 B2는 주간 대시보드 기준 월요일입니다.
  // 예: B2=2026-06-29 → 분석기간 2026-06-22~2026-06-28.
  return normalizeAnchorMondayFromValue(rows?.[1]?.[1]);
}

function sumStoreSalesRows(rows: any[], storeName: string, dates: Set<string>) {
  return rows
    .filter((r: any) => r.storeName === storeName && dates.has(r.date))
    .reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
}

function buildDailyStoreSalesDashboardRows(rows: any[], currentDate: string, compareDate = "", weeklyAnchorOverride = "", dailyAmountMap?: Map<string, Map<string, number>>) {
  if (!currentDate) return null as any;

  const weeklyAnchorMonday = weeklyAnchorOverride || mondayAfterDate(currentDate);
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
  const productSheet = pickProductSheet(titles);
  const inventorySheet = pickNormalizedTitle(titles, ["온오프재고현황", "온/오프재고현황", "온오프 재고 현황", "온/오프 재고 현황"], "온오프재고현황");
  const annualSalesSheet = pickNormalizedTitle(titles, ["연간판매", "연간 판매"], "연간판매");
  const standardSheet = pickNormalizedTitle(titles, ["기준"], "기준");

  const needed = [productSheet, inventorySheet, annualSalesSheet, standardSheet]
    .filter((v, i, arr) => v && arr.indexOf(v) === i);
  const values = await getManySheetValues(needed, "A:AZ");

  const history = await loadDashboardDailyHistory();
  const historyRowsAll = history.rows || [];
  const historyRows = historyRowsAll.filter((r: any) => isOfflineSalesStore(r.storeName));
  const coreHistoryRows = historyRows.filter((r: any) => isCoreOfflineSalesStore(r.storeName));

  // MARK 5.0 final:
  // 점포별 일/주/월 매출은 MARK_DB의 `일간매출(26년)` 시트를 우선 사용합니다.
  // 왼쪽 A~G 합산 영역은 제외하고 H열 이후의 `오프라인팀` 채널만 집계합니다.
  const productValues = values[productSheet] || [];
  const weeklyAnchorFromB2 = weeklyAnchorFromWeeklySheet(productValues);
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
    ? buildDailyStoreSalesDashboardRows(dailyStoreRows, currentDate, dailyCompareDate, weeklyAnchorFromB2, dailyAmountMap)
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
  const productRowsRaw = await buildProductRowsFromDailyHistory();
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
  const inventory = { ...buildInventory(productRowsRaw, inventoryRows, companyTopProducts), performance };
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
