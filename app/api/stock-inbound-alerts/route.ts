import { NextResponse } from "next/server";
import { getDbSheetId, getSheetValuesById } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const revalidate = 0;

const HISTORY_SHEET = "재고입고이력";
const COMPARE_DAYS_AGO = 2; // 요청: "2일전 대비"
const INCREASE_THRESHOLD = 100; // 요청: "100장 이상 입고되면"

// 재고입고이력 시트를 읽어서, 최신 날짜 vs (그보다 COMPARE_DAYS_AGO일 전에 가장 가까운
// 실제 데이터가 있는 날짜)를 비교해서, 스타일+컬러별로 100장 이상 늘어난 것을 찾습니다.
export async function GET() {
  try {
    const spreadsheetId = getDbSheetId();
    const rows = await getSheetValuesById(spreadsheetId, HISTORY_SHEET, "A:D").catch(() => []);
    const data = rows.slice(1).filter((r) => r?.[0]); // 헤더 제외, 빈 행 제외

    if (!data.length) {
      return NextResponse.json({ ok: true, alerts: [], latestDate: null, compareDate: null });
    }

    const dates = Array.from(new Set(data.map((r) => String(r[0])))).sort();
    const latestDate = dates[dates.length - 1];

    const target = new Date(latestDate);
    target.setDate(target.getDate() - COMPARE_DAYS_AGO);
    const targetStr = target.toISOString().slice(0, 10);
    // 정확히 2일 전 데이터가 없을 수도 있어서(주말 등), 그보다 이전 중 가장 가까운 날짜를 씁니다.
    const compareDate = [...dates].filter((d) => d <= targetStr).pop() || dates[0];

    function stockMapAt(dateKey: string) {
      const map = new Map<string, { productName: string; stock: number }>();
      for (const r of data) {
        if (String(r[0]) !== dateKey) continue;
        const styleCode = String(r[1] || "");
        const colorCode = String(r[2] || "");
        const stock = Number(r[3] || 0);
        if (!styleCode) continue;
        const key = `${styleCode}_${colorCode}`;
        map.set(key, { productName: styleCode, stock });
      }
      return map;
    }

    const latestMap = stockMapAt(latestDate);
    const oldMap = stockMapAt(compareDate);

    const alerts = Array.from(latestMap.entries())
      .map(([key, latest]) => {
        const old = oldMap.get(key);
        const oldStock = old?.stock || 0;
        const increase = latest.stock - oldStock;
        const [styleCode, colorCode] = key.split("_");
        return { styleCode, colorCode, oldStock, latestStock: latest.stock, increase };
      })
      .filter((x) => x.increase >= INCREASE_THRESHOLD)
      .sort((a, b) => b.increase - a.increase);

    return NextResponse.json({ ok: true, alerts, latestDate, compareDate });
  } catch (error: any) {
    console.error("stock-inbound-alerts failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500 });
  }
}
