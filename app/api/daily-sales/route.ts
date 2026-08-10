import { NextResponse } from "next/server";
import { readDailySalesFromMarkDb, readDailySalesFromHistory, saveDailySalesToHistory } from "@/lib/dailySales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    // MARK 6.83: 기본값은 전일(확정치) — ?live=1 주면 오늘 실시간으로 봅니다.
    const url = new URL(req.url);
    const live = url.searchParams.get("live") === "1";
    // MARK 6.75: 화면 표시는 Daily_Sales_History 직접 조회로 통일(매장별 일매출 순위와 같은 소스).
    const data = await readDailySalesFromHistory({ live });
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Daily sales load failed" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST() {
  try {
    // MARK 6.75: "일간 스냅샷 저장" 버튼은 원래 목적(스타일별채널별 시트 → Daily_Sales_History
    // 백필)대로 readDailySalesFromMarkDb를 그대로 씁니다 — 표시용 함수로 바꾸면 순환이 됨.
    const data = await readDailySalesFromMarkDb();
    const saved = await saveDailySalesToHistory(data, "daily-sales-api");
    return NextResponse.json({ ok: true, data, saved }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Daily sales save failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
