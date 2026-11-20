import { NextResponse } from "next/server";
import { readWeatherHistory, saveSeoulWeatherSnapshot, backfillWeatherArchive } from "@/lib/openWeather";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const maxDuration = 120;

// MARK 2026-11-20: 과거(전년) 날씨 채우기 — POST ?from=2025-01-01&to=2026-08-31&regions=서울,부산[&dryRun=1]
export async function POST(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const from = sp.get("from") || "", to = sp.get("to") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error("from/to 형식: YYYY-MM-DD");
    const regions = (sp.get("regions") || "서울").split(",").map((x) => x.trim()).filter(Boolean);
    return NextResponse.json({ ok: true, ...(await backfillWeatherArchive({ from, to, regions, dryRun: sp.get("dryRun") === "1" })) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
}

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
