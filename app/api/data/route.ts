import { NextResponse } from "next/server";
import { buildDashboardDataFromGoogleSheet, getFallbackData } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// MARK 2026-09-22: "RT 이동 제안이 계속 안 됨(500같음)" 제보로 확인 — 이 라우트(대시보드
// 전체를 만드는 가장 무거운 엔드포인트)에만 다른 라우트들과 달리 maxDuration이 아예
// 없었습니다(이 코드베이스의 다른 무거운 라우트 26개는 전부 maxDuration=60을 명시). Next.js/
// Vercel 기본 제한 시간을 쓰게 되는데, 이번에 buildInventory가 PIP 매장별 재고 스냅샷
// (최대 5만 행)까지 같이 읽도록 늘어나면서 그 기본 제한을 넘겼을 가능성이 큽니다. 다른
// 무거운 라우트들과 동일하게 60초로 맞춥니다.
export const maxDuration = 60;

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
