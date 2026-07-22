import { NextResponse } from "next/server";
import { buildStoreCards } from "@/lib/dailyBriefing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const store = url.searchParams.get("store") || "";
    const date = url.searchParams.get("date") || "";
    if (!store) {
      return NextResponse.json({ ok: false, error: "매장을 선택해주세요." }, { status: 400 });
    }

    const cards = await buildStoreCards(store, date || undefined);
    return NextResponse.json({ ok: true, cards }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("store-cards failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "매장 카드 생성 실패" }, { status: 500 });
  }
}
