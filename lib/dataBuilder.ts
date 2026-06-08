import fallback from "./mark-data.json";
import { getManySheetValues, getSpreadsheetTitles } from "./googleSheets";

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

function rate(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function isShop(storeName: string) {
  return String(storeName || "").startsWith("오프라인_");
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

    out.push({
      storeName,
      dayTarget: num(row[base]),
      daySales: num(row[base + 1]),
      dayRate: num(row[base + 2]),
      weekTarget: num(row[base + 3]),
      weekSales: num(row[base + 4]),
      weekRate: num(row[base + 5]),
      monthBaseTarget: num(row[base + 6]),
      monthTarget: num(row[base + 7]),
      monthSales: num(row[base + 8]),
      monthRateA: num(row[base + 9]),
      monthRate: num(row[base + 10]),
      yearTarget: num(row[base + 11]),
      yearSales: num(row[base + 12]),
      yearRate: num(row[base + 13]),
    });
  }

  return { sheet: sheetName, rows: out };
}

function parseProducts(rows: any[][]) {
  const out: any[] = [];
  for (let r = 3; r < rows.length; r++) {
    const row = rows[r] || [];
    const storeName = text(row[4]); // E
    const styleCode = text(row[5]); // F
    const productName = text(row[6]); // G
    if (!storeName || !styleCode || !productName) continue;
    if (`${storeName}${styleCode}${productName}`.includes("합계")) continue;

    out.push({
      storeName,
      styleCode,
      productName,
      storeStock: num(row[8]), // I
      weekNet: num(row[22]), // W
      weekAmount: num(row[23]), // X
      prevNet: num(row[26]), // AA
      prevAmount: num(row[27]), // AB
    });
  }
  return out;
}

function parseInventory(rows: any[][]) {
  const out: any[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const styleCode = text(row[4]); // E
    const productName = text(row[5]); // F
    if (!styleCode || styleCode.includes("스타일") || styleCode.includes("합계")) continue;
    const onlineStock = num(row[16]); // Q
    const offlineStock = num(row[17]); // R
    const totalStock = num(row[18]); // S
    if (!onlineStock && !offlineStock && !totalStock) continue;

    out.push({ styleCode, productName, onlineStock, offlineStock, totalStock });
  }
  return out;
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
    .map((x) => ({
      ...x,
      qtyChangeRate: rate(x.weekNet, x.prevNet),
      amountChangeRate: rate(x.weekAmount, x.prevAmount),
      contributionRate: total ? (x.weekAmount / total) * 100 : 0,
    }))
    .sort((a, b) => Number(b.weekAmount || 0) - Number(a.weekAmount || 0))
    .slice(0, top);
}

function mergeStoreRows(currentRows: any[], compareRows: any[], yearRows: any[] = []) {
  const compareMap = new Map(compareRows.map((r: any) => [r.storeName, r]));
  const yearMap = new Map(yearRows.map((r: any) => [r.storeName, r]));
  return currentRows.map((r: any) => {
    const prev: any = compareMap.get(r.storeName) || {};
    const year: any = yearMap.get(r.storeName) || {};
    return {
      ...r,
      compareDaySales: Number(prev.daySales || 0),
      compareWeekSales: Number(prev.weekSales || 0),
      compareMonthSales: Number(prev.monthSales || 0),
      prevYearMonthSales: Number(year.monthSales || 0),
      dayChangeRate: rate(Number(r.daySales || 0), Number(prev.daySales || 0)),
      weekChangeRate: rate(Number(r.weekSales || 0), Number(prev.weekSales || 0)),
      monthChangeRate: rate(Number(r.monthSales || 0), Number(prev.monthSales || 0)),
      yearMonthChangeRate: rate(Number(r.monthSales || 0), Number(year.monthSales || 0)),
    };
  });
}

function buildInventory(productRows: any[], inventoryRows: any[], companyTopProducts: any[]) {
  const coreProducts = productRows.filter((r) => !isShop(r.storeName));
  const invMap = new Map(inventoryRows.map((r) => [r.styleCode, r]));
  const allProducts = aggregateProducts(coreProducts, undefined, 9999);

  const stockoutRisk: any[] = [];
  const overstockRisk: any[] = [];
  const allocationSuggestions: any[] = [];

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

  const byStyle = new Map<string, any[]>();
  for (const r of coreProducts) {
    if (Number(r.weekNet || 0) <= 0) continue;
    if (!byStyle.has(r.styleCode)) byStyle.set(r.styleCode, []);
    byStyle.get(r.styleCode)!.push(r);
  }

  const rtSuggestions: any[] = [];
  for (const [styleCode, rows] of byStyle.entries()) {
    if (rows.length < 2) continue;

    const enriched = rows.map((r) => {
      const weekNet = Number(r.weekNet || 0);
      const stock = Number(r.storeStock || 0);
      const stockWeeks = weekNet > 0 ? stock / weekNet : stock > 0 ? 999 : 0;
      return { ...r, stock, stockWeeks };
    });

    const receivers = enriched.filter((r) => r.weekNet >= 3 && r.stockWeeks <= 2).sort((a, b) => a.stockWeeks - b.stockWeeks);
    const senders = enriched.filter((r) => r.stock > 0 && r.stockWeeks >= 8).sort((a, b) => b.stockWeeks - a.stockWeeks);
    if (!receivers.length || !senders.length) continue;

    const to = receivers[0];
    const from = senders.find((s) => s.storeName !== to.storeName);
    if (!from) continue;

    const toNeed = Math.max(0, Math.round(to.weekNet * 4 - to.stock));
    const fromAllow = Math.max(0, Math.round(from.stock - from.weekNet * 8));
    const suggestQty = Math.max(1, Math.min(toNeed, fromAllow));

    if (!suggestQty || suggestQty <= 0) continue;

    const toAfterWeeks = (to.stock + suggestQty) / to.weekNet;
    const fromAfterWeeks = from.weekNet > 0 ? Math.max(0, (from.stock - suggestQty) / from.weekNet) : 999;
    const priority = to.stockWeeks <= 1 && from.stockWeeks >= 12 ? "A" : to.stockWeeks <= 2 && from.stockWeeks >= 8 ? "B" : "C";
    const stockoutDays = to.stockWeeks * 7;

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
      reason: `${to.storeName} 재고주수 ${to.stockWeeks.toFixed(1)}주 / ${from.storeName} 재고주수 ${from.stockWeeks >= 999 ? "판매없음" : `${from.stockWeeks.toFixed(1)}주`}`,
      weekAmount: to.weekAmount,
    });
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

  const consignmentRecommendations = companyTopProducts.slice(0, 5).map((p) => {
    const inv: any = invMap.get(p.styleCode) || {};
    return {
      ...p,
      onlineStock: inv.onlineStock || 0,
      offlineStock: inv.offlineStock || 0,
      totalStock: inv.totalStock || 0,
      reason: "전사 매출 상위 상품 기준 위탁 채널 투입 후보",
    };
  });

  return {
    periodLabel: "재고CTRL 기준: 금주전주 판매/점포재고 + 온오프재고현황 Q/R/S",
    stockoutRisk: stockoutRisk.sort((a, b) => a.offlineWeeks - b.offlineWeeks).slice(0, 10),
    overstockRisk: overstockRisk.sort((a, b) => b.offlineWeeks - a.offlineWeeks).slice(0, 10),
    allocationSuggestions: allocationSuggestions.sort((a, b) => b.weekAmount - a.weekAmount).slice(0, 5),
    rtSuggestions: rtSuggestions.sort((a, b) => b.weekAmount - a.weekAmount).slice(0, 5),
    consignmentRecommendations,
    stockoutStoreTop5: finalize(recv).sort((a: any, b: any) => b.count - a.count).slice(0, 5),
    overstockStoreTop5: finalize(send).sort((a: any, b: any) => b.count - a.count).slice(0, 5),
    aiBriefing: [
      `RT 이동 우선 검토 대상은 ${rtSuggestions.length}건입니다.`,
      `물류 추가 할당 후보는 ${allocationSuggestions.length}건, 품절 위험 상품은 ${stockoutRisk.length}개입니다.`,
      `과재고 위험 상품은 ${overstockRisk.length}개로, 판매 호조 매장 이동 또는 출고 우선순위 조정이 필요합니다.`,
      "RT는 목표 재고주수 4주를 기준으로 이동수량을 계산합니다.",
    ],
  };
}

export async function buildDashboardDataFromGoogleSheet() {
  const titles = await getSpreadsheetTitles();

  const dailyCurrent = pickTitle(titles, "일_전일");
  const dailyCompare = pickTitle(titles, "일_전주");
  const weeklyCurrent = pickWeeklyCurrent(titles);
  const weeklyCompare = pickWeeklyCompare(titles);
  const prevMonth = pickTitle(titles, "전월마감(2604)", "전월마감");
  const prevYear = pickTitle(titles, "전년마감(2505)", "전년마감");
  const productSheet = pickTitle(titles, "금주전주");
  const inventorySheet = pickTitle(titles, "온오프재고현황");

  const needed = [dailyCurrent, dailyCompare, weeklyCurrent, weeklyCompare, prevMonth, prevYear, productSheet, inventorySheet]
    .filter((v, i, arr) => v && arr.indexOf(v) === i);
  const values = await getManySheetValues(needed, "A:AZ");

  const dailyCur = parseTargetSheet(dailyCurrent, values[dailyCurrent] || []).rows;
  const dailyCmp = parseTargetSheet(dailyCompare, values[dailyCompare] || []).rows;
  const weeklyCur = parseTargetSheet(weeklyCurrent, values[weeklyCurrent] || []).rows;
  const weeklyCmp = parseTargetSheet(weeklyCompare, values[weeklyCompare] || []).rows;
  const monthCur = weeklyCur;
  const monthCmp = parseTargetSheet(prevMonth, values[prevMonth] || []).rows;
  const monthYear = parseTargetSheet(prevYear, values[prevYear] || []).rows;

  const productRows = parseProducts(values[productSheet] || []);
  const coreProductRows = productRows.filter((r) => !isShop(r.storeName));
  const inventoryRows = parseInventory(values[inventorySheet] || []);

  const storeNames = [...new Set(coreProductRows.map((r) => r.storeName).filter(Boolean))].sort();
  const storeTopProducts: Record<string, any[]> = {};
  for (const store of storeNames) storeTopProducts[store] = aggregateProducts(coreProductRows, store, 10);
  const companyTopProducts = aggregateProducts(coreProductRows, undefined, 10);

  const mergedWeekly = mergeStoreRows(weeklyCur, weeklyCmp).filter((r) => !isShop(r.storeName));
  const coreWeekSales = mergedWeekly.reduce((s, r) => s + Number(r.weekSales || 0), 0);
  const top10Amount = companyTopProducts.reduce((s, p) => s + Number(p.weekAmount || 0), 0);
  const top10Concentration = coreWeekSales ? (top10Amount / coreWeekSales) * 100 : 0;

  const entrants = companyTopProducts
    .map((p, i) => ({ ...p, currentRank: i + 1, previousRank: p.prevAmount ? "급상승" : "신규" }))
    .filter((p) => !p.prevAmount || Number(p.amountChangeRate || 0) >= 50)
    .slice(0, 5);

  const good = [...mergedWeekly].filter((r) => r.weekSales > 0).sort((a, b) => b.weekChangeRate - a.weekChangeRate).slice(0, 3);
  const bad = [...mergedWeekly].filter((r) => r.weekSales > 0).sort((a, b) => a.weekChangeRate - b.weekChangeRate).slice(0, 3);
  const weeklyTotal = mergedWeekly.reduce((s, r) => s + Number(r.weekSales || 0), 0);
  const weeklyPrev = mergedWeekly.reduce((s, r) => s + Number(r.compareWeekSales || 0), 0);
  const weeklyChange = rate(weeklyTotal, weeklyPrev);
  const topProduct = companyTopProducts[0];

  const inventory = buildInventory(productRows, inventoryRows, companyTopProducts);

  return {
    ...(fallback as any),
    source: "google-sheet",
    updatedAt: new Date().toISOString(),
    daily: {
      periodLabel: `분석일: ${dailyCurrent} / 비교일: ${dailyCompare}`,
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
        `핵심 매장 기준 주간 매출은 전주 대비 ${weeklyChange >= 0 ? "+" : ""}${weeklyChange.toFixed(1)}% 흐름입니다.`,
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
    },
    inventory,
  };
}

export function getFallbackData() {
  return fallback as any;
}
