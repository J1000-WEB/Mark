import { NextResponse } from "next/server";
import { buildDashboardDataFromGoogleSheet, getFallbackData } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// MARK 2026-09-22: "RT 이동 제안이 계속 안 됨(500같음)" 제보 확인 중 1차로 maxDuration=60을
// 추가했었는데, 다시 찾아보니 vercel.json에는 이 라우트가 이미 maxDuration:120(메모리
// 3009MB)로 별도 설정되어 있었습니다. Next.js App Router(13.5+)에서는 vercel.json의
// functions.maxDuration이 아니라 이 파일의 export const maxDuration이 실제로 적용되는
// 설정값이라, 60을 넣은 게 오히려 기존 120초보다 짧게 깎아버린 것이었을 가능성이 있습니다
// (원인 진단 실수). vercel.json 쪽 값과 맞춰 300초로 올립니다 — 대시보드 전체(RT 이동 제안
// 포함)를 만드는 가장 무거운 엔드포인트이고, PIP 매장별 재고 스냅샷까지 같이 읽게 되면서
// 더 늘어났기 때문에 여유를 넉넉히 둡니다.
export const maxDuration = 300;

export async function GET() {
  try {
    const data = await buildDashboardDataFromGoogleSheet();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: any) {
    console.error("Google Sheet data load failed:", error);
    const fallback = getFallbackData();
    return NextResponse.json(
      {
        ...fallback,
        source: "fallback",
        googleError: error?.message || "Google Sheet data load failed",
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
