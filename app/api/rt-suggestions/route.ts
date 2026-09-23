import { NextResponse } from "next/server";
import { buildRtSuggestions } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// MARK 2026-09-24: 첫 배포 후 504(Gateway Timeout, = maxDuration 안에 못 끝나서 플랫폼이
// 강제 종료)가 발생해서, /api/data가 실제로 쓰고 있는 것과 동일한 값(300초/3009MB)으로
// 올립니다. 이 라우트가 하는 일은 /api/data의 부분집합이라 이것보다 적게 걸려야 정상이지만,
// 새로 생긴 라우트라 항상 콜드스타트(캐시된 인증 없음)라는 점도 감안합니다.
export const maxDuration = 300;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

// MARK 2026-09-24: 재고CTRL 탭의 "RT" 칸 전용 — /api/data(대시보드 전체)와 완전히 분리된
// RT 이동 제안 전용 엔드포인트입니다. /api/data처럼 실패를 조용히 내장 fallback으로 감추지
// 않고, 실패하면 실제 에러 메시지를 그대로 돌려줍니다(화면에서 구체적으로 뭐가 문제인지 보여주기 위함).
export async function GET() {
  try {
    const data = await buildRtSuggestions();
    return NextResponse.json({ ok: true, ...data }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("rt-suggestions failed:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "RT 이동 제안 계산 실패" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
