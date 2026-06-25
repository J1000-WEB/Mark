import { NextResponse } from "next/server";
import { readWeatherHistory, saveSeoulWeatherSnapshot } from "@/lib/openWeather";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const refresh = url.searchParams.get("refresh") === "1";
    const result = refresh ? await saveSeoulWeatherSnapshot() : { records: await readWeatherHistory() };

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error: any) {
    console.error("Weather API failed:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "날씨 데이터를 불러오지 못했습니다.", records: [] },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
