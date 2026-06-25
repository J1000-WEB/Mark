import { NextResponse } from "next/server";
import { saveDailySeoulWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization") || "";
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const saved = await saveDailySeoulWeather();
    return NextResponse.json({ ok: true, saved }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "날씨 자동 저장 실패" }, { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
