import { NextResponse } from "next/server";
import { appendValues, ensureSheetExists, getSheetValues } from "@/lib/googleSheets";
import { buildDashboardDataFromGoogleSheet, getFallbackData } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SHEET = "Snapshot_Master";
const HEADER = ["CreatedAt", "Type", "Summary", "Data_JSON", "Screenshot_URL"];

function n(v: any) {
  const x = Number(v || 0);
  return Number.isFinite(x) ? x : 0;
}

function makeSnapshot(data: any, type: string) {
  const weeklyRows = data.weekly?.current || [];
  const inv = data.inventory || {};
  const weeklySales = weeklyRows.reduce((s: number, r: any) => s + n(r.weekSales), 0);
  const snapshot = {
    version: "Mark4.3.1",
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
      storeTop10: weeklyRows.slice(0, 10),
      companyTop20: data.weekly?.companyTopProducts || [],
    },
    inventory: {
      periodLabel: inv.periodLabel || "",
      rtSuggestions: inv.rtSuggestions || [],
      allocationSuggestions: inv.allocationSuggestions || [],
      stockoutRisk: inv.stockoutRisk || [],
      overstockRisk: inv.overstockRisk || [],
      promotionSuggestions: inv.promotionSuggestions || [],
    },
    ai: {
      note: "Drive screenshot archive is prepared for Mark4.4. Current snapshot stores JSON only.",
    },
  };

  const summary = `${type} snapshot / 주간매출 ${Math.round(weeklySales).toLocaleString("ko-KR")}원 / RT ${snapshot.inventory.rtSuggestions.length}건 / 프로모션 ${snapshot.inventory.promotionSuggestions.length}건`;
  return { snapshot, summary };
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

    const { snapshot, summary } = makeSnapshot(data, type);
    await ensureSheetExists(SHEET, HEADER);

    const createdAt = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    await appendValues(`'${SHEET}'!A:E`, [[createdAt, type, summary, JSON.stringify(snapshot), ""]]);

    return NextResponse.json({ ok: true, createdAt, type, summary, snapshot }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Snapshot save failed" }, { status: 500 });
  }
}
