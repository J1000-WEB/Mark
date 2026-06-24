import { NextResponse } from "next/server";
import { appendValues, updateValues, ensureSheetExists, getSheetValues, uploadTextFileToDrive, getHistorySheetId, ensureSheetExistsById, appendValuesById, getSheetValuesById } from "@/lib/googleSheets";
import { buildDashboardDataFromGoogleSheet, getFallbackData } from "@/lib/dataBuilder";
import { readDailySalesFromMarkDb, saveDailySalesToHistory } from "@/lib/dailySales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SHEET = "Snapshot_Master";
const HEADER = ["CreatedAt", "Type", "Summary", "Data_JSON", "Drive_URL"];

function n(v: any) {
  const x = Number(v || 0);
  return Number.isFinite(x) ? x : 0;
}

function slimRows(rows: any[], limit = 20) {
  return (rows || []).slice(0, limit).map((r: any) => ({
    storeName: r.storeName,
    styleCode: r.styleCode,
    productName: r.productName,
    weekSales: r.weekSales,
    weekAmount: r.weekAmount,
    weekNet: r.weekNet,
    compareWeekSales: r.compareWeekSales,
    weekChangeRate: r.weekChangeRate,
    amountChangeRate: r.amountChangeRate,
    totalStock: r.totalStock,
    stockWeeks: r.stockWeeks,
    offlineWeeks: r.offlineWeeks,
    promotionLevel: r.promotionLevel,
    action: r.action,
    discountRate: r.discountRate,
    promotionPrice: r.promotionPrice,
    suggestQty: r.suggestQty,
    reason: r.reason,
  }));
}

function safeJson(snapshot: any) {
  let json = JSON.stringify(snapshot);
  if (json.length <= 45000) return json;

  const compact = {
    ...snapshot,
    weekly: {
      ...snapshot.weekly,
      storeTop10: slimRows(snapshot.weekly?.storeTop10 || [], 10),
      companyTop20: slimRows(snapshot.weekly?.companyTop20 || [], 10),
    },
    inventory: {
      ...snapshot.inventory,
      rtSuggestions: slimRows(snapshot.inventory?.rtSuggestions || [], 10),
      allocationSuggestions: slimRows(snapshot.inventory?.allocationSuggestions || [], 10),
      stockoutRisk: slimRows(snapshot.inventory?.stockoutRisk || [], 10),
      overstockRisk: slimRows(snapshot.inventory?.overstockRisk || [], 10),
      promotionSuggestions: slimRows(snapshot.inventory?.promotionSuggestions || [], 10),
    },
  };

  json = JSON.stringify(compact);
  if (json.length <= 45000) return json;

  return JSON.stringify({
    version: snapshot.version,
    createdAt: snapshot.createdAt,
    type: snapshot.type,
    weekly: {
      periodLabel: snapshot.weekly?.periodLabel,
      sales: snapshot.weekly?.sales,
      storeTop5: slimRows(snapshot.weekly?.storeTop10 || [], 5),
      companyTop5: slimRows(snapshot.weekly?.companyTop20 || [], 5),
    },
    inventory: {
      periodLabel: snapshot.inventory?.periodLabel,
      rtCount: snapshot.inventory?.rtSuggestions?.length || 0,
      allocationCount: snapshot.inventory?.allocationSuggestions?.length || 0,
      stockoutCount: snapshot.inventory?.stockoutRisk?.length || 0,
      overstockCount: snapshot.inventory?.overstockRisk?.length || 0,
      promotionCount: snapshot.inventory?.promotionSuggestions?.length || 0,
      promotionTop5: slimRows(snapshot.inventory?.promotionSuggestions || [], 5),
    },
  });
}


const HISTORY_SHEETS = {
  log: "Snapshot_Log",
  product: "Daily_Product_History",
  store: "Daily_Store_History",
  rtPerformance: "RT_Performance",
};

const HISTORY_HEADERS = {
  log: ["SnapshotID", "CreatedAt", "Source", "Status", "Memo"],
  product: ["SnapshotDate", "SnapshotID", "채널코드", "채널명", "스타일", "스타일명", "재고", "판매", "판매금액", "출고", "반품", "재고주수", "순위"],
  store: ["SnapshotDate", "SnapshotID", "채널코드", "채널명", "총재고", "총판매", "총판매금액", "총출고", "총반품", "스타일수"],
  rtPerformance: ["RT_ID", "스타일", "출고점", "입고점", "승인일", "입고예정일", "예상판매", "실제판매", "예상매출", "실제매출", "성공여부", "ROI"],
};

function todayKSTDate() {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function makeSnapshotId() {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  const hh = String(kst.getHours()).padStart(2, "0");
  const mm = String(kst.getMinutes()).padStart(2, "0");
  const ss = String(kst.getSeconds()).padStart(2, "0");
  return `SNAP-${y}${m}${d}-${hh}${mm}${ss}`;
}

function getRowNumber(value: any, fallback = 0) {
  const x = Number(value || fallback);
  return Number.isFinite(x) ? x : fallback;
}

function buildHistoryRows(data: any, snapshotId: string, snapshotDate: string) {
  const weeklyRows = data.weekly?.current || [];
  const companyTop = data.weekly?.companyTopProducts || [];

  const rankMap = new Map<string, number>();
  companyTop.forEach((row: any, idx: number) => {
    const key = String(row.styleCode || "").trim();
    if (key && !rankMap.has(key)) rankMap.set(key, idx + 1);
  });

  const productRows = weeklyRows
    .filter((row: any) => row?.styleCode || row?.productName || row?.storeName)
    .map((row: any) => [
      snapshotDate,
      snapshotId,
      row.channelCode || "",
      row.storeName || row.channelName || "",
      row.styleCode || "",
      row.productName || "",
      getRowNumber(row.totalStock ?? row.storeStock ?? row.stock),
      getRowNumber(row.weekSales ?? row.weekNet),
      getRowNumber(row.weekAmount),
      getRowNumber(row.outQty ?? row.releaseQty ?? row.shipmentQty),
      getRowNumber(row.returnQty),
      getRowNumber(row.stockWeeks ?? row.offlineWeeks),
      rankMap.get(String(row.styleCode || "").trim()) || "",
    ]);

  const storeMap = new Map<string, any>();
  for (const row of weeklyRows) {
    const storeName = String(row.storeName || row.channelName || "").trim();
    if (!storeName) continue;
    const key = storeName;
    if (!storeMap.has(key)) {
      storeMap.set(key, {
        channelCode: row.channelCode || "",
        storeName,
        totalStock: 0,
        totalSales: 0,
        totalAmount: 0,
        totalOut: 0,
        totalReturn: 0,
        styles: new Set<string>(),
      });
    }

    const item = storeMap.get(key);
    item.totalStock += getRowNumber(row.totalStock ?? row.storeStock ?? row.stock);
    item.totalSales += getRowNumber(row.weekSales ?? row.weekNet);
    item.totalAmount += getRowNumber(row.weekAmount);
    item.totalOut += getRowNumber(row.outQty ?? row.releaseQty ?? row.shipmentQty);
    item.totalReturn += getRowNumber(row.returnQty);
    if (row.styleCode) item.styles.add(String(row.styleCode));
  }

  const storeRows = Array.from(storeMap.values()).map((row: any) => [
    snapshotDate,
    snapshotId,
    row.channelCode || "",
    row.storeName || "",
    Math.round(row.totalStock),
    Math.round(row.totalSales),
    Math.round(row.totalAmount),
    Math.round(row.totalOut),
    Math.round(row.totalReturn),
    row.styles.size,
  ]);

  return { productRows, storeRows };
}

async function saveToHistory(data: any, summary: string, type: string) {
  const spreadsheetId = getHistorySheetId();
  const snapshotId = makeSnapshotId();
  const snapshotDate = todayKSTDate();
  const createdAt = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  await ensureSheetExistsById(spreadsheetId, HISTORY_SHEETS.log, HISTORY_HEADERS.log);
  await ensureSheetExistsById(spreadsheetId, HISTORY_SHEETS.product, HISTORY_HEADERS.product);
  await ensureSheetExistsById(spreadsheetId, HISTORY_SHEETS.store, HISTORY_HEADERS.store);
  await ensureSheetExistsById(spreadsheetId, HISTORY_SHEETS.rtPerformance, HISTORY_HEADERS.rtPerformance);

  const existingLog = await getSheetValuesById(spreadsheetId, HISTORY_SHEETS.log, "A:E").catch(() => []);
  const duplicateLog = (existingLog || []).find((row: any[], idx: number) =>
    idx > 0 && String(row?.[2] || "") === type && String(row?.[4] || "").startsWith(summary.split(" / ")[0])
  );
  if (duplicateLog) {
    return { snapshotId: String(duplicateLog?.[0] || ""), snapshotDate, productRows: 0, storeRows: 0, skipped: true };
  }

  const { productRows, storeRows } = buildHistoryRows(data, snapshotId, snapshotDate);

  if (productRows.length) {
    await appendValuesById(spreadsheetId, `'${HISTORY_SHEETS.product}'!A:M`, productRows);
  }

  if (storeRows.length) {
    await appendValuesById(spreadsheetId, `'${HISTORY_SHEETS.store}'!A:J`, storeRows);
  }

  await appendValuesById(spreadsheetId, `'${HISTORY_SHEETS.log}'!A:E`, [[
    snapshotId,
    createdAt,
    type,
    "SUCCESS",
    `${summary} / Product ${productRows.length} rows / Store ${storeRows.length} rows`,
  ]]);

  return { snapshotId, snapshotDate, productRows: productRows.length, storeRows: storeRows.length };
}

async function loadHistoryLog() {
  const spreadsheetId = getHistorySheetId();
  await ensureSheetExistsById(spreadsheetId, HISTORY_SHEETS.log, HISTORY_HEADERS.log);
  const rows = await getSheetValuesById(spreadsheetId, HISTORY_SHEETS.log, "A:E").catch(() => []);
  return (rows || []).slice(1).reverse().slice(0, 20);
}


function makeSnapshotKey(data: any, type: string) {
  const label = String(data.weekly?.periodLabel || data.monthly?.periodLabel || "").trim();
  if (type.includes("weekly") || type === "manual") {
    const m = label.match(/차주\(([^)]+)\)|분석기간:\s*([^/]+)/);
    return `WEEKLY-${(m?.[1] || m?.[2] || todayKSTDate()).replace(/\s/g, "")}`;
  }
  if (type.includes("monthly")) {
    const m = label.match(/분석월:\s*([^/]+)/);
    return `MONTHLY-${(m?.[1] || todayKSTDate().slice(0, 7)).replace(/\s/g, "")}`;
  }
  return `${type}-${todayKSTDate()}`;
}

function makeSnapshot(data: any, type: string) {
  const weeklyRows = data.weekly?.current || [];
  const inv = data.inventory || {};
  const weeklySales = weeklyRows.reduce((s: number, r: any) => s + n(r.weekSales), 0);
  const snapshot = {
    version: "MARK 4.77",
    createdAt: new Date().toISOString(),
    type,
    schedules: {
      daily: { time: "15:00", enabled: false },
      weekly: { day: "Monday", time: "11:00", enabled: false },
      monthly: { day: 2, time: "11:00", enabled: false },
    },
    weekly: {
      periodLabel: data.weekly?.periodLabel || "",
      sales: weeklySales,
      storeTop10: slimRows(weeklyRows, 10),
      companyTop20: slimRows(data.weekly?.companyTopProducts || [], 20),
    },
    inventory: {
      periodLabel: inv.periodLabel || "",
      rtSuggestions: slimRows(inv.rtSuggestions || [], 20),
      allocationSuggestions: slimRows(inv.allocationSuggestions || [], 20),
      stockoutRisk: slimRows(inv.stockoutRisk || [], 20),
      overstockRisk: slimRows(inv.overstockRisk || [], 20),
      promotionSuggestions: slimRows(inv.promotionSuggestions || [], 20),
    },
    ai: {
      note: "Snapshot compact JSON is stored in Google Sheet and uploaded to Google Drive. Screenshot archive is prepared for next step.",
    },
  };

  const dataJson = safeJson(snapshot);
  const snapshotKey = makeSnapshotKey(data, type);
  const summary = `${snapshotKey} / ${type} snapshot / 주간매출 ${Math.round(weeklySales).toLocaleString("ko-KR")}원 / RT ${snapshot.inventory.rtSuggestions.length}건 / 온라인이관 ${snapshot.inventory.allocationSuggestions.length}건 / 프로모션 ${snapshot.inventory.promotionSuggestions.length}건 / JSON ${dataJson.length.toLocaleString("ko-KR")}자`;
  return { snapshot, summary, dataJson, snapshotKey };
}

export async function GET() {
  try {
    await ensureSheetExists(SHEET, HEADER);
    const rows = await getSheetValues(SHEET, "A:E");
    const dataRows = (rows || []).slice(1).reverse().slice(0, 20);
    const historyRows = await loadHistoryLog().catch(() => []);
    return NextResponse.json({ ok: true, rows: dataRows, historyRows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Snapshot load failed" }, { status: 500 });
  }
}


function fileSafeDate() {
  const now = new Date();
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const type = body.type || "manual";

    let data: any;
    try {
      data = await buildDashboardDataFromGoogleSheet();
    } catch {
      data = getFallbackData();
    }

    const { snapshot, summary, dataJson, snapshotKey } = makeSnapshot(data, type);
    await ensureSheetExists(SHEET, HEADER);

    let driveUrl = "";
    let driveFileName = "";
    try {
      driveFileName = `snapshot-${type}-${fileSafeDate()}.json`;
      const uploaded = await uploadTextFileToDrive(driveFileName, dataJson, "application/json");
      driveUrl = uploaded.webViewLink || "";
    } catch (driveError) {
      console.error("Drive upload failed:", driveError);
    }

    const createdAt = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const existingMasterRows = await getSheetValues(SHEET, "A:E").catch(() => []);
    const existingMasterIndex = (existingMasterRows || []).findIndex((row: any[], idx: number) =>
      idx > 0 && String(row?.[1] || "") === type && String(row?.[2] || "").startsWith(snapshotKey)
    );

    if (existingMasterIndex > 0) {
      await updateValues(`'${SHEET}'!A${existingMasterIndex + 1}:E${existingMasterIndex + 1}`, [[createdAt, type, summary, dataJson, driveUrl]]);
    } else {
      await appendValues(`'${SHEET}'!A:E`, [[createdAt, type, summary, dataJson, driveUrl]]);
    }

    let history: any = null;
    try {
      history = await saveToHistory(data, summary, type);
    } catch (historyError: any) {
      console.error("History save failed:", historyError);
      history = { error: historyError?.message || "History save failed" };
    }

    let dailyHistory: any = null;
    try {
      const daily = await readDailySalesFromMarkDb();
      dailyHistory = await saveDailySalesToHistory(daily, "snapshot");
    } catch (dailyError: any) {
      console.error("Daily history save failed:", dailyError);
      dailyHistory = { error: dailyError?.message || "Daily history save failed" };
    }

    return NextResponse.json({ ok: true, createdAt, type, summary, snapshot, driveUrl, driveFileName, history, dailyHistory }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Snapshot save failed" }, { status: 500 });
  }
}
