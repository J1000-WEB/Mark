import { NextResponse } from "next/server";
import { buildStoreSalesSummary, readSalesSummarySnapshot } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK 2026-09-22: 일간 블록 날짜선택(date)과 커스텀 기간비교(rangeStart~rangeEnd) 쿼리
// 파라미터를 받습니다.
// MARK 2026-09-24: rangeStart/rangeEnd를 둘 다 안 보내면 이제 기본으로 "이번주 월요일~어제"
// 기간비교를 계산해서 내려줍니다(예전엔 기간비교 없음이 기본이었음). 사용자가 "기간비교
// 지우기"를 눌러서 진짜로 기간비교를 끄고 싶을 땐 noRange=1을 보냅니다.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    // MARK 2026-10-20: 점검용 — ?rawDate=YYYY-MM-DD 이면 그 날짜의 원본 스냅샷 행을 그대로 돌려줍니다(중복 확인용).
    // ?checkSameDays=1 — 매장별로 "연속된 두 날짜의 금액·수량·건수가 완전히 같은" 행(복사 붙여넣기 의심)을 찾습니다.
    if (searchParams.get("checkSameDays") === "1") {
      const { rows } = await readSalesSummarySnapshot();
      const byStore = new Map<string, any[]>();
      for (const r of rows) {
        if (!byStore.has(r.storeName)) byStore.set(r.storeName, []);
        byStore.get(r.storeName)!.push(r);
      }
      const hits: any[] = [];
      for (const [store, list] of byStore.entries()) {
        list.sort((a, b) => (a.date < b.date ? -1 : 1));
        for (let i = 1; i < list.length; i++) {
          const p = list[i - 1], c = list[i];
          if (c.amount > 0 && c.amount === p.amount && c.qty === p.qty && c.receiptCount === p.receiptCount) {
            hits.push({ store, dates: [p.date, c.date], amount: c.amount, qty: c.qty, receiptCount: c.receiptCount });
          }
        }
      }
      const byDatePair = new Map<string, number>();
      for (const h of hits) byDatePair.set(h.dates.join("~"), (byDatePair.get(h.dates.join("~")) || 0) + 1);
      return NextResponse.json({ ok: true, hitCount: hits.length, byDatePair: [...byDatePair.entries()].sort((a, b) => b[1] - a[1]), hits: hits.slice(0, 200) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }
    const rawDate = searchParams.get("rawDate");
    if (rawDate) {
      const { rows } = await readSalesSummarySnapshot();
      const dayRows = rows.filter((r) => r.date === rawDate);
      const keyCount = new Map<string, number>();
      for (const r of dayRows) keyCount.set(r.storeName, (keyCount.get(r.storeName) || 0) + 1);
      return NextResponse.json({
        ok: true,
        date: rawDate,
        rowCount: dayRows.length,
        duplicateStores: [...keyCount.entries()].filter(([, c]) => c > 1).map(([name, c]) => ({ name, count: c, rows: dayRows.filter((r) => r.storeName === name) })),
        totalAmount: dayRows.reduce((s, r) => s + r.amount, 0),
        distinctDateFormats: [...new Set(rows.map((r) => (/^\d{4}-\d{2}-\d{2}$/.test(r.date) ? "YYYY-MM-DD" : r.date)))].slice(0, 20),
      }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }
    const data = await buildStoreSalesSummary({
      dailyDate: searchParams.get("date") || undefined,
      rangeStart: searchParams.get("rangeStart") || undefined,
      rangeEnd: searchParams.get("rangeEnd") || undefined,
      noRange: searchParams.get("noRange") === "1",
    });
    return NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("sales-summary GET failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "매출탭 계산 실패" }, { status: 500 });
  }
}
