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

// MARK 2026-09-14: "11시 이후로 시간대별 매출추이가 안 쌓인다" 문의 — 원인을 찾아보니 이
// 라우트만 다른 auto-* 크론 라우트들과 달리 응답에 "Cache-Control: no-store"를 안 붙이고
// 있었습니다. dynamic="force-dynamic"은 Next.js가 이 페이지를 정적으로 빌드하지 않게만
// 막을 뿐, 응답 자체에 캐시하지 말라는 헤더를 안 붙이면 Vercel 엣지/CDN이 GET 응답을
// 캐시해버릴 수 있습니다 — 실제로 이 URL을 다시 호출해보니 몇 시간이 지나도 계속 "11:00"
// 응답이 그대로 돌아왔습니다(=매시 GitHub Actions가 호출해도 실제 함수는 다시 안 돌고
// 캐시된 첫 응답만 반복해서 받은 것). 다른 auto-* 라우트들처럼 명시적으로 no-store를
// 붙여서 매번 실제로 실행되도록 고칩니다.
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization") || "";
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
      }
    }

    const result = await recordRealtimeHourlySnapshot();
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("auto-realtime-hourly-snapshot failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "시간별 매출 기록 실패" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
