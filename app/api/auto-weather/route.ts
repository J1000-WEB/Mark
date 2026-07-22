import { NextResponse } from "next/server";
import { saveAllRegionsWeatherSnapshot } from "@/lib/openWeather";
import { listDistinctRegions } from "@/lib/storeRegion";

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

    // MARK 6.21: 점포형태 시트에 등록된 매장들의 지역(시/도)을 전부 모아서 각각 날씨를 갱신합니다.
    const regions = await listDistinctRegions().catch(() => ["서울"]);
    const result = await saveAllRegionsWeatherSnapshot(regions.length ? regions : ["서울"]);
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error: any) {
    console.error("Auto weather failed:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "자동 날씨 저장 실패" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}

