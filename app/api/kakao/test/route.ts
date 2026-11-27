import { NextResponse } from "next/server";
import { kakaoStatus, sendKakaoMemo } from "@/lib/kakao";

export const dynamic = "force-dynamic";

// GET = 연결 상태, POST {text} = 테스트 발송
export async function GET() {
  return NextResponse.json({ ok: true, ...(await kakaoStatus()) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await sendKakaoMemo(String(body?.text || "[MARK] 테스트 메시지예요."));
  return NextResponse.json(r);
}
