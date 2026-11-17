import { NextResponse } from "next/server";
import { getHistorySheetId, getSheetValuesById } from "@/lib/googleSheets";
import { readSalesSummaryRowsForReports } from "@/lib/dataBuilder";
import { normalizeWhitelistStoreKey, SALES_SUMMARY_STORE_WHITELIST } from "@/lib/salesStoreWhitelist";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// MARK 2026-11-17: 점검용 — Daily_Sales_History가 언제부터 쌓였는지(월별 날짜 수·점포 수·금액)와
// 같은 점포(매출탭 화이트리스트) 기준 매출탭 금액을 나란히 보여줌. 금액이 매출탭과 맞으면 실제 판매금액, 크게 다르면 추정치(수량×정가) 시절.
export async function GET() {
  try {
    const col = await getSheetValuesById(getHistorySheetId(), "Daily_Sales_History", "A:E");
    const wl = new Set(SALES_SUMMARY_STORE_WHITELIST.map(normalizeWhitelistStoreKey));
    const hist = new Map<string, { days: Set<string>; stores: Set<string>; amount: number; wlAmount: number; qty: number }>();
    const histByDay = new Map<string, number>();
    for (const r of col.slice(1)) {
      const d = String(r?.[0] || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      const m = d.slice(0, 7);
      const e = hist.get(m) || { days: new Set(), stores: new Set(), amount: 0, wlAmount: 0, qty: 0 };
      const amt = Number(r?.[4]) || 0;
      e.days.add(d); e.stores.add(String(r?.[1] || "")); e.amount += amt; e.qty += Number(r?.[3]) || 0;
      if (wl.has(normalizeWhitelistStoreKey(String(r?.[1] || "")))) { e.wlAmount += amt; histByDay.set(d, (histByDay.get(d) || 0) + amt); }
      hist.set(m, e);
    }
    const snap = await readSalesSummaryRowsForReports();
    const snapM = new Map<string, number>();
    for (const r of snap) if (histByDay.has(r.date)) snapM.set(r.date.slice(0, 7), (snapM.get(r.date.slice(0, 7)) || 0) + (r.amount || 0));
    const months = [...hist.keys()].sort().map((m) => {
      const e = hist.get(m)!;
      const days = [...e.days].sort();
      const s = snapM.get(m) || 0;
      return { month: m, days: days.length, first: days[0], last: days[days.length - 1], stores: e.stores.size, qty: e.qty, amount: Math.round(e.amount), whitelistAmount: Math.round(e.wlAmount), salesTabSameDays: Math.round(s), ratio: s ? +(e.wlAmount / s).toFixed(3) : null };
    });
    return NextResponse.json({ ok: true, rows: col.length - 1, months });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
