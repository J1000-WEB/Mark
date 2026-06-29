import { NextResponse } from "next/server";
import { getSalesDataPayload, getWeeklyDashboardPayload } from "@/lib/weeklyDataProvider";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const week = String(url.searchParams.get("week") || "").trim();
    const refresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";
    const dashboard = url.searchParams.get("dashboard") === "1";
    const type = url.searchParams.get("type") === "color" ? "color" : "style";
    const payload = dashboard
      ? await getWeeklyDashboardPayload(week, { refresh })
      : await getSalesDataPayload(type, week, { refresh });
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("weekly-history load failed", error);
    return NextResponse.json({ ok: false, error: error?.message || "Weekly_History를 불러오지 못했습니다." }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const type = body.type === "color" ? "color" : "style";
    const week = String(body.week || "").trim();
    const payload = await getSalesDataPayload(type, week, { refresh: true });
    return NextResponse.json({ ok: true, message: "Weekly_History 갱신 완료", ...payload }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("weekly-history refresh failed", error);
    return NextResponse.json({ ok: false, error: error?.message || "Weekly_History 갱신 실패" }, { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
