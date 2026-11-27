import { NextResponse } from "next/server";
import { kakaoKey, kakaoLoginUrl } from "@/lib/kakao";

export const dynamic = "force-dynamic";

// 카카오 로그인(나에게 보내기 허락) — 소천님이 브라우저로 한 번 열면 됨
export async function GET() {
  if (!kakaoKey()) return new NextResponse("KAKAO_REST_KEY 환경변수가 아직 없어요(Vercel에 넣고 다시 배포).", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return NextResponse.redirect(kakaoLoginUrl());
}
