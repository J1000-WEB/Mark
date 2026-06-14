import { NextResponse } from "next/server";
import { appendValues, ensureSheetExists, getSheetValues, uploadTextFileToDrive } from "@/lib/googleSheets";
import { buildDashboardDataFromGoogleSheet, getFallbackData } from "@/lib/dataBuilder";

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

function makeSnapshot(data: any, type: string) {
  const weeklyRows = data.weekly?.current || [];
  const inv = data.inventory || {};
  const weeklySales = weeklyRows.reduce((s: number, r: any) => s + n(r.weekSales), 0);
  const snapshot = {
    version: "Mark4.8.1",
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
  const summary = `${type} snapshot / 주간매출 ${Math.round(weeklySales).toLocaleString("ko-KR")}원 / RT ${snapshot.inventory.rtSuggestions.length}건 / 프로모션 ${snapshot.inventory.promotionSuggestions.length}건 / JSON ${dataJson.length.toLocaleString("ko-KR")}자`;
  return { snapshot, summary, dataJson };
}

export async function GET() {
  try {
    await ensureSheetExists(SHEET, HEADER);
    const rows = await getSheetValues(SHEET, "A:E");
    const dataRows = (rows || []).slice(1).reverse().slice(0, 20);
    return NextResponse.json({ ok: true, rows: dataRows }, { headers: { "Cache-Control": "no-store" } });
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

    const { snapshot, summary, dataJson } = makeSnapshot(data, type);
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
    await appendValues(`'${SHEET}'!A:E`, [[createdAt, type, summary, dataJson, driveUrl]]);

    return NextResponse.json({ ok: true, createdAt, type, summary, snapshot, driveUrl, driveFileName }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Snapshot save failed" }, { status: 500 });
  }
}
