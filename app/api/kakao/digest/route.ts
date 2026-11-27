import { NextResponse } from "next/server";
import { checkLateStores } from "@/lib/salesSummaryRefreshStatus";
import { sendDailyDigest } from "@/lib/dailyDigest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 매일 7:50 KST(UTC 22:50) 카톡 아침 점검 알림 — 새벽 4:00 매출탭 갱신 결과 기준(무신사는 전날 밤에 올림, 2026-11-27 소천님)
export async function GET(req: Request) {
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1"; // 안 보내고 글만
  try {
    const check = await checkLateStores().catch(() => null);
    return NextResponse.json(await sendDailyDigest(check, { dryRun }), { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
