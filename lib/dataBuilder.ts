import fallback from "./mark-data.json";
import { getDbSheetId, getManySheetValues, getManySheetValuesById, getSpreadsheetTitles, getSpreadsheetTitlesById } from "./googleSheets";

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
  const key = normalizeStoreKey(storeName);
  // 포시즌 아울렛은 프로젝트성 매장이라 핵심 매장 호조/부진/랭킹/합산에서 제외합니다.
  return key.includes("포시즌아울렛") || key.includes("포시즌");
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

function isCoreOfflineSalesStore(storeName: string) {
  return isOfflineSalesStore(storeName) && !isConsignmentChannel(storeName);
}

function normalizeStoreKey(storeName: string) {
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


function pickProductSheet(titles: string[]) {
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

function parseProducts(rows: any[][]) {
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

function aggregateProducts(rows: any[], storeName?: string, top = 10) {
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
        action: "정가 판매 유지",
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
    const isCompanyTopProduct = companyTopProducts.length ? companyRank <= 50 : true;
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

      const targetStock = Math.max(1, Math.ceil(weekNet * 2));
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
      const twoWeekCap = Math.max(1, Math.ceil(to.weekNet * 2));
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

  return {
    periodLabel: "재고CTRL 기준: RT=오프라인 점포 간 이동 / 온라인 이관=온라인 가용재고→오프라인 배분 / 프로모션=오프라인 운영재고",
    stockoutRisk: stockoutRisk.sort((a, b) => a.offlineWeeks - b.offlineWeeks).slice(0, 10),
    overstockRisk: overstockRisk.sort((a, b) => b.offlineWeeks - a.offlineWeeks).slice(0, 10),
    allocationSuggestions: allocationSuggestions.sort((a, b) => b.weekAmount - a.weekAmount).slice(0, 5),
    onlineTransferSuggestions,
    rtSuggestions: rtSuggestions.sort((a, b) => (b.rtScore || 0) - (a.rtScore || 0) || (a.companyRank || 9999) - (b.companyRank || 9999)).slice(0, 10),
    consignmentRecommendations,
    stockoutStoreTop5: finalize(recv).sort((a: any, b: any) => b.count - a.count).slice(0, 5),
    overstockStoreTop5: finalize(send).sort((a: any, b: any) => b.count - a.count).slice(0, 5),
    ...promotion,
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
  return d.toISOString().slice(0, 10);
}

function dateRange(startKey: string, endKey: string) {
  const start = parseDate(startKey);
  const end = parseDate(endKey);
  if (!start || !end) return [];
  const out: string[] = [];
  const cur = new Date(start.getTime());
  while (cur.getTime() <= end.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function performancePeriods(row: any) {
  const startDate = row.startDate;
  if (!startDate) return { beforeDates: [] as string[], duringDates: [] as string[], basis: "" };

  const isRt = row.category === "RT";

  // PROMOTION:
  // 금요일 시작 프로모션은 월요일에 전주 금토일 성과를 보게 되므로,
  // 시작일~시작일+2일(금토일)을 행사중 기간으로 보고, 그 전주 동일 요일을 행사전 기간으로 비교합니다.
  //
  // RT:
  // 월요일 지시 → 목요일 입고 → 금토일 판매를 보는 운영 루틴이므로,
  // 지시일+4일~지시일+6일을 RT 후 기간으로 보고, 그 전주 동일 요일을 RT 전 기간으로 비교합니다.
  const duringStart = isRt ? dateAddDays(startDate, 4) : startDate;
  const duringEnd = row.endDate || (isRt ? dateAddDays(startDate, 6) : dateAddDays(startDate, 2));

  const beforeStart = dateAddDays(duringStart, -7);
  const beforeEnd = dateAddDays(duringEnd, -7);

  return {
    beforeDates: dateRange(beforeStart, beforeEnd),
    duringDates: dateRange(duringStart, duringEnd),
    basis: isRt
      ? `RT 지시일 기준: ${duringStart}~${duringEnd} vs ${beforeStart}~${beforeEnd}`
      : `프로모션 시작일 기준: ${duringStart}~${duringEnd} vs ${beforeStart}~${beforeEnd}`,
  };
}

function parseDailyHistoryRows(rows: any[][]) {
  const headerRow = findHeaderRow(rows, ["스타일"]);
  const header = headerRow >= 0 ? rows[headerRow] || [] : rows[0] || [];
  const startRow = headerRow >= 0 ? headerRow + 1 : 1;

  const dateCol = findCol(header, ["일자", "날짜", "기준일", "판매일", "snapshot_date", "date"], 0);
  const storeCol = findCol(header, ["점포", "점포명", "채널명", "매장", "받는점포", "storeName"], 1);
  const styleCol = findCol(header, ["스타일", "품번", "styleCode"], 2);
  const productCol = findCol(header, ["스타일명", "상품명", "productName"], 3);
  const qtyCol = findCol(header, ["판매수량", "수량", "판매", "weekNet", "dayNet", "qty"], 4);
  const amountCol = findCol(header, ["판매금액", "매출", "금액", "daySales", "amount"], 5);

  return rows.slice(startRow)
    .map((row) => ({
      date: normalizeDateKey(row[dateCol]),
      storeName: displayStoreName(text(row[storeCol])),
      storeKey: normalizeStoreKey(text(row[storeCol])),
      styleCode: text(row[styleCol]),
      productName: text(row[productCol]),
      qty: num(row[qtyCol]),
      amount: num(row[amountCol]),
    }))
    .filter((r) => r.date && r.styleCode);
}

function sumDailyPerformance(dailyRows: any[], row: any, dates: string[]) {
  const dateSet = new Set(dates);
  const targetStore = normalizeStoreKey(row.toStore || row.channel || "");
  const hasStoreFilter = Boolean(targetStore);
  const styleCode = text(row.styleCode);

  return dailyRows
    .filter((r) => dateSet.has(r.date))
    .filter((r) => !styleCode || r.styleCode === styleCode)
    .filter((r) => !hasStoreFilter || r.storeKey === targetStore || normalizeStoreKey(r.storeName).includes(targetStore) || targetStore.includes(r.storeKey))
    .reduce((acc, r) => {
      acc.qty += Number(r.qty || 0);
      acc.amount += Number(r.amount || 0);
      return acc;
    }, { qty: 0, amount: 0 });
}

function applyDailyPerformance(rows: any[], dailyRows: any[]) {
  if (!dailyRows.length) return rows;

  return rows.map((row: any) => {
    const periods = performancePeriods(row);
    const before = sumDailyPerformance(dailyRows, row, periods.beforeDates);
    const during = sumDailyPerformance(dailyRows, row, periods.duringDates);

    // 시트에 값을 직접 입력한 경우에는 수동값을 우선합니다.
    // 비어있거나 0이면 Daily_Sales_History 기준 자동 계산값을 사용합니다.
    const beforeQty = Number(row.beforeQty || 0) || before.qty;
    const duringQty = Number(row.duringQty || 0) || during.qty;
    const beforeAmount = Number(row.beforeAmount || 0) || before.amount;
    const duringAmount = Number(row.duringAmount || 0) || during.amount;
    const addedQty = duringQty - beforeQty;
    const addedAmount = duringAmount - beforeAmount;

    return {
      ...row,
      beforeQty,
      duringQty,
      addedQty,
      beforeAmount,
      duringAmount,
      addedAmount,
      changeRate: beforeAmount ? ((duringAmount - beforeAmount) / beforeAmount) * 100 : duringAmount ? 100 : 0,
      result: addedAmount > 0 ? "성공" : addedAmount < 0 ? "부진" : "관찰",
      compareBasis: periods.basis,
      beforeDates: periods.beforeDates,
      duringDates: periods.duringDates,
      performanceSource: before.amount || during.amount || before.qty || during.qty ? "Daily_Sales_History" : "Manual/Empty",
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

async function loadPromotionPerformance() {
  try {
    const dbId = getDbSheetId();
    const titles = await getSpreadsheetTitlesById(dbId);
    const performanceSheetName = pickNormalizedTitle(titles, ["Promotion_Performance", "프로모션성과", "RT프로모션성과"], "Promotion_Performance");
    const dailySheetName = pickNormalizedTitle(titles, ["Daily_Sales_History", "DailySalesHistory", "Daily_History", "일간스냅샷", "일별판매히스토리"], "Daily_Sales_History");

    if (!performanceSheetName || !titles.includes(performanceSheetName)) return buildPerformanceSummary([]);

    const sheetNames = [performanceSheetName];
    if (dailySheetName && titles.includes(dailySheetName)) sheetNames.push(dailySheetName);

    const values = await getManySheetValuesById(dbId, sheetNames, "A:AZ");
    const performanceRows = parsePerformanceRows(values[performanceSheetName] || []);
    const dailyRows = dailySheetName && titles.includes(dailySheetName)
      ? parseDailyHistoryRows(values[dailySheetName] || [])
      : [];

    const rows = applyDailyPerformance(performanceRows, dailyRows);
    return buildPerformanceSummary(rows);
  } catch {
    return buildPerformanceSummary([]);
  }
}


export async function buildDashboardDataFromGoogleSheet() {
  const titles = await getSpreadsheetTitles();

  const dailyCurrent = pickTitle(titles, "일_전일");
  const dailyCompare = pickTitle(titles, "일_전주");
  const weeklyCurrent = pickWeeklyCurrent(titles);
  const weeklyCompare = pickWeeklyCompare(titles);
  const prevMonth = pickTitle(titles, "전월마감(2604)", "전월마감");
  const prevYear = pickTitle(titles, "전년마감(2505)", "전년마감");
  const productSheet = pickProductSheet(titles);
  const inventorySheet = pickNormalizedTitle(titles, ["온오프재고현황", "온/오프재고현황", "온오프 재고 현황", "온/오프 재고 현황"], "온오프재고현황");
  const annualSalesSheet = pickNormalizedTitle(titles, ["연간판매", "연간 판매"], "연간판매");
  const standardSheet = pickNormalizedTitle(titles, ["기준"], "기준");

  const needed = [dailyCurrent, dailyCompare, weeklyCurrent, weeklyCompare, prevMonth, prevYear, productSheet, inventorySheet, annualSalesSheet, standardSheet]
    .filter((v, i, arr) => v && arr.indexOf(v) === i);
  const values = await getManySheetValues(needed, "A:AZ");

  const filterVisibleStores = (rows: any[]) => rows.filter((r) => isOfflineSalesStore(r.storeName));

  const dailyCur = filterVisibleStores(parseTargetSheet(dailyCurrent, values[dailyCurrent] || []).rows);
  const dailyCmp = filterVisibleStores(parseTargetSheet(dailyCompare, values[dailyCompare] || []).rows);
  const weeklyCur = filterVisibleStores(parseTargetSheet(weeklyCurrent, values[weeklyCurrent] || []).rows);
  const weeklyCmp = filterVisibleStores(parseTargetSheet(weeklyCompare, values[weeklyCompare] || []).rows);
  const monthCur = weeklyCur;
  const monthCmp = filterVisibleStores(parseTargetSheet(prevMonth, values[prevMonth] || []).rows);
  const monthYear = filterVisibleStores(parseTargetSheet(prevYear, values[prevYear] || []).rows);

  const productRows = parseProducts(values[productSheet] || []);
  const offlineProductRows = productRows.filter((r) => isOfflineSalesStore(r.storeName));
  const coreProductRows = productRows.filter((r) => isCoreOfflineSalesStore(r.storeName));
  const consignmentProductRows = productRows.filter((r) => isOfflineSalesStore(r.storeName) && isConsignmentChannel(r.storeName));
  const inventoryRows = parseInventory(values[inventorySheet] || []);
  const performance = await loadPromotionPerformance();
  const carryoverAnnualSales = buildCarryoverAnnualSales(values[annualSalesSheet] || [], values[standardSheet] || []);

  const storeNames = [...new Set(coreProductRows.map((r) => r.storeName).filter(Boolean))].sort();
  const storeTopProducts: Record<string, any[]> = {};
  for (const store of storeNames) storeTopProducts[store] = aggregateProducts(coreProductRows, store, 20);
  const companyTopProducts = aggregateProducts(coreProductRows, undefined, 20);

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

  const inventory = { ...buildInventory(productRows, inventoryRows, companyTopProducts), performance };

  return {
    ...(fallback as any),
    source: "google-sheet",
    updatedAt: new Date().toISOString(),
    daily: {
      periodLabel: `기준일자: ${dailyCurrent} / 오프라인 매장 기준`,
      current: dailyCur,
      compare: dailyCmp,
    },
    weekly: {
      periodLabel: `분석기간: ${weeklyCurrent} / 비교기간: ${weeklyCompare}`,
      current: weeklyCur,
      compare: weeklyCmp,
      companyTopProducts,
      storeTopProducts,
      productStoreNames: storeNames,
      top10Concentration,
      newTop10Entrants: entrants,
      aiBriefing: [
        `위탁 포함 오프라인 주간 매출은 ${Math.round(totalOfflineWeekSales).toLocaleString("ko-KR")}원이며 전주 대비 ${weeklyChange >= 0 ? "+" : ""}${weeklyChange.toFixed(1)}% 흐름입니다.`,
        `호조 매장은 ${good.map((r) => r.storeName).join(", ") || "데이터 없음"} 중심으로 확인됩니다.`,
        `부진 매장은 ${bad.map((r) => r.storeName).join(", ") || "데이터 없음"}이며 상품 구성과 재고 보강 점검이 필요합니다.`,
        `전사 TOP 상품은 ${topProduct?.productName || "데이터 없음"}이며 TOP10 상품 매출 비중은 ${top10Concentration.toFixed(1)}%입니다.`,
        "위탁 채널은 재고 효율과 가용재고를 함께 보며 투입 후보를 관리하는 것이 좋습니다.",
      ],
    },
    monthly: {
      periodLabel: `분석월: ${weeklyCurrent} 월누적 / 비교월: ${prevMonth} / 전년동월: ${prevYear}`,
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
