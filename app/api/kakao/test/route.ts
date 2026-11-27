import { NextResponse } from "next/server";
import { kakaoStatus, sendKakaoMemo } from "@/lib/kakao";

export const dynamic = "force-dynamic";

// GET = 연결 상태, POST {text} = 테스트 발송, POST {digest:true} = 아침 알림 지금 한 번(쌓인 알림도 보낸 걸로 표시)
export async function GET() {
  return NextResponse.json({ ok: true, ...(await kakaoStatus()) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body?.digest) {
    const { checkLateStores } = await import("@/lib/salesSummaryRefreshStatus");
    const { sendDailyDigest } = await import("@/lib/dailyDigest");
    const check = await checkLateStores().catch(() => null);
    return NextResponse.json(await sendDailyDigest(check));
  }
  const r = await sendKakaoMemo(String(body?.text || "[MARK] 테스트 메시지예요."), undefined, body?.noButton ? { button: false } : {});
  return NextResponse.json(r);
}
