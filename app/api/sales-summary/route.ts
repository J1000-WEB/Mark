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
