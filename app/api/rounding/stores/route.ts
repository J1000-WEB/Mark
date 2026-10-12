import { NextRequest, NextResponse } from "next/server";
import { listRoundingStores, getRoundingAutoFill, getLatestVisitForStore } from "@/lib/roundingVisit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

// GET /api/rounding/stores            → 매장 목록(이름/지역) + 각 매장의 마지막 방문일
// GET /api/rounding/stores?store=XXX  → 그 매장 하나의 자동입력(매출/목표/재고) 숫자
export async function GET(req: NextRequest) {
  try {
    const store = req.nextUrl.searchParams.get("store") || "";

    if (store) {
      const autoFill = await getRoundingAutoFill(store);
      if (!autoFill) {
        return NextResponse.json({ ok: false, error: "매장을 찾지 못했어요." }, { status: 404, headers: NO_STORE_HEADERS });
      }
      return NextResponse.json({ ok: true, autoFill }, { headers: NO_STORE_HEADERS });
    }

    const stores = await listRoundingStores();
    const latestVisits = await Promise.all(
      stores.map((s) => getLatestVisitForStore(s.storeName).catch(() => null))
    );
    const withLastVisit = stores.map((s, i) => ({
      ...s,
      lastVisitDate: latestVisits[i]?.visitDate || "",
      lastGrade: latestVisits[i]?.grade || "",
      lastTotalScore: latestVisits[i]?.totalScore ?? null,
    }));

    return NextResponse.json({ ok: true, stores: withLastVisit }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("rounding stores GET failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
