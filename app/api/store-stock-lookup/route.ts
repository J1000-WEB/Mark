import { NextResponse } from "next/server";
import { getHistorySheetId, getSheetValuesById } from "@/lib/googleSheets";
import { expandAnyDailyHistoryRows } from "@/lib/dailySales";
import { normalizeStoreKey } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// MARK 6.65: 매장 직원이 품번(또는 바코드로 읽은 품번)을 입력하면, 그 매장의 컬러별
// 현재 재고를 바로 보여줍니다. Daily_Sales_History의 가장 최근 날짜 값을 사용합니다
// (ERP 새벽 재고 스냅샷이 매일 반영되면 그 값이 최신 기준이 됩니다).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const store = url.searchParams.get("store") || "";
    const rawStyleCode = (url.searchParams.get("styleCode") || "").trim().toUpperCase();
    const barcode = (url.searchParams.get("barcode") || "").trim().toUpperCase();

    if (!store || (!rawStyleCode && !barcode)) {
      return NextResponse.json({ ok: false, error: "매장과 품번(또는 바코드)을 입력해주세요." }, { status: 400 });
    }

    const historyId = getHistorySheetId();
    const raw = await getSheetValuesById(historyId, "Daily_Sales_History", "A:ZZ").catch(() => []);
    const flatRows = expandAnyDailyHistoryRows(raw || []);

    const storeKey = normalizeStoreKey(store);
    const storeRows = flatRows.filter((r) => normalizeStoreKey(r.storeName) === storeKey);

    let styleCode = rawStyleCode;
    let matchedColorCode = "";

    // MARK 6.65: 바코드는 "품번+컬러코드+사이즈"가 구분자 없이 붙어있어서, 이 매장에
    // 실제 존재하는 "품번+컬러코드" 조합 중 바코드가 그걸로 시작하는 걸 찾습니다
    // (가장 긴 일치를 우선 — 짧은 품번이 긴 품번의 앞부분과 우연히 겹치는 걸 방지).
    if (!styleCode && barcode) {
      const knownPrefixes = Array.from(
        new Set(storeRows.map((r) => `${r.styleCode.toUpperCase()}${r.colorCode.toUpperCase()}`))
      ).sort((a, b) => b.length - a.length);

      const matchedPrefix = knownPrefixes.find((p) => barcode.startsWith(p));
      if (!matchedPrefix) {
        return NextResponse.json({ ok: true, found: false, colors: [], error: "이 매장 재고에서 일치하는 품번+컬러를 찾지 못했어요." });
      }
      const matchedRow = storeRows.find((r) => `${r.styleCode.toUpperCase()}${r.colorCode.toUpperCase()}` === matchedPrefix);
      styleCode = matchedRow!.styleCode.toUpperCase();
      matchedColorCode = matchedRow!.colorCode.toUpperCase();
    }

    const matched = storeRows.filter((r) => r.styleCode.toUpperCase() === styleCode);

    if (!matched.length) {
      return NextResponse.json({ ok: true, found: false, colors: [] });
    }

    // 컬러별로 가장 최근 날짜의 재고만 사용 (합산 금지 — 재고는 스냅샷)
    const latestByColor = new Map<string, { date: string; stock: number; colorName: string }>();
    for (const r of matched) {
      const existing = latestByColor.get(r.colorCode);
      if (!existing || r.date > existing.date) {
        latestByColor.set(r.colorCode, { date: r.date, stock: Number(r.stock || 0), colorName: r.colorName });
      }
    }

    const colors = Array.from(latestByColor.entries())
      .map(([colorCode, v]) => ({ colorCode, colorName: v.colorName, stock: v.stock, asOfDate: v.date, scanned: colorCode.toUpperCase() === matchedColorCode }))
      .sort((a, b) => b.stock - a.stock);

    return NextResponse.json({
      ok: true,
      found: true,
      styleCode,
      productName: matched[0].productName,
      storeName: matched[0].storeName,
      colors,
    });
  } catch (error: any) {
    console.error("store-stock-lookup failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500 });
  }
}
