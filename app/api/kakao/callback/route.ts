import { NextResponse } from "next/server";
import { kakaoExchangeCode, sendKakaoMemo } from "@/lib/kakao";

export const dynamic = "force-dynamic";

const page = (msg: string) =>
  new NextResponse(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;padding:32px"><h2>${msg}</h2><p><a href="/">대시보드로</a></p></body>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  if (sp.get("error")) return page(`카카오 연결 안 됨: ${sp.get("error_description") || sp.get("error")}`);
  const code = sp.get("code");
  if (!code) return page("카카오에서 코드가 안 왔어요.");
  try {
    const { scope } = await kakaoExchangeCode(code);
    if (!/talk_message/.test(scope)) return page("연결은 됐는데 '카카오톡 메시지 전송' 동의가 빠졌어요 — 동의항목 설정 후 다시 로그인해 주세요.");
    const r = await sendKakaoMemo("[MARK] 카카오톡 알림 연결 완료! 앞으로 확인이 필요한 알림이 여기로 와요.");
    return page(r.ok ? "✅ 카카오톡 알림 연결 완료 — 카톡 '나와의 채팅'을 확인해 보세요." : `연결은 됐는데 테스트 메시지 실패: ${r.error}`);
  } catch (e: any) {
    return page(`연결 실패: ${e?.message || e}`);
  }
}
