import { NextResponse } from "next/server";
import { readWeatherHistory, saveDailySeoulWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const records = await readWeatherHistory();
    return NextResponse.json({ ok: true, records }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Weather_History를 불러오지 못했습니다.", records: [] }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}

export async function POST() {
  try {
    const saved = await saveDailySeoulWeather();
    const records = await readWeatherHistory();
    return NextResponse.json({ ok: true, saved, records }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "날씨 저장 실패" }, { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
