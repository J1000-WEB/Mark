import { NextRequest, NextResponse } from "next/server";
import { saveRoundingVisit, listRoundingVisits, type SaveRoundingVisitInput } from "@/lib/roundingVisit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

// GET /api/rounding/visits               → 전체 방문기록(최신순)
// GET /api/rounding/visits?store=XXX     → 특정 매장의 방문기록(최신순)
export async function GET(req: NextRequest) {
  try {
    const store = req.nextUrl.searchParams.get("store") || "";
    const visits = await listRoundingVisits(store ? { storeName: store } : {});
    return NextResponse.json({ ok: true, visits }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("rounding visits GET failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SaveRoundingVisitInput;
    if (!body?.storeName) {
      return NextResponse.json({ ok: false, error: "매장을 선택해주세요." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (!body?.autoFill) {
      return NextResponse.json({ ok: false, error: "자동입력 숫자가 비어있어요. 매장을 다시 선택해보세요." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const visit = await saveRoundingVisit(body);
    return NextResponse.json({ ok: true, visit }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("rounding visits POST failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "저장 실패" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
