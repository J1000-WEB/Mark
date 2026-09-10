import { NextResponse } from "next/server";
import { recordRealtimeHourlySnapshot } from "@/lib/realtimeHourlySnapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK 2026-09: 정시(11~22시)에 GitHub Actions(.github/workflows/realtime-hourly-snapshot.yml,
// UTC 2~13시=KST 11~22시)가 호출해서 오늘 누적매출(전체+점포별)을 Realtime_Hourly_Snapshot에
// 한 줄씩 기록합니다. Vercel Hobby 요금제는 크론을 하루 1회로 제한해서(이 기능은 시간당 1회
// 필요) Vercel 자체 cron 대신 GitHub Actions를 씁니다. 혹시 몰라 recordRealtimeHourlySnapshot
// 안에서도 한 번 더 시간대를 확인합니다(운영시간 밖이면 스스로 건너뜀).

export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization") || "";
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await recordRealtimeHourlySnapshot();
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("auto-realtime-hourly-snapshot failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "시간별 매출 기록 실패" }, { status: 500 });
  }
}
