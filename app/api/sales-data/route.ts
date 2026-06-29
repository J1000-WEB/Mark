import { NextResponse } from "next/server";
import { getSalesDataPayload } from "@/lib/weeklyDataProvider";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") === "color" ? "color" : "style";
    const week = String(url.searchParams.get("week") || "").trim();
    const refresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";
    const payload = await getSalesDataPayload(type, week, { refresh });
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("sales-data weekly-history load failed", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "판매데이터를 생성하지 못했습니다.",
      weeks: [],
      rows: [],
    }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
