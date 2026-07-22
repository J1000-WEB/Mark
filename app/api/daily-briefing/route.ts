import { NextResponse } from "next/server";
import { buildDailyStoreBriefing, listCoreStoreNames } from "@/lib/dailyBriefing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const store = url.searchParams.get("store") || "";
    const date = url.searchParams.get("date") || "";
    const withStoreList = url.searchParams.get("stores") === "1";

    const briefing = await buildDailyStoreBriefing(store || undefined, date || undefined);
    const stores = withStoreList ? await listCoreStoreNames() : undefined;

    return NextResponse.json({ ok: true, briefing, stores }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("daily-briefing failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "일간 브리핑 생성 실패" }, { status: 500 });
  }
}
