import { NextResponse } from "next/server";
import { buildRtRequestSuggestion } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK 2026-09-14: 다른 auto-*/RT 관련 라우트들처럼 no-store를 명시합니다 — 이게 빠지면
// 같은 품번/매장 조합을 다시 조회했을 때 캐시된 옛날 재고 기준 제안이 나올 수 있습니다
// (auto-realtime-hourly-snapshot에서 실제로 이 캐시 문제를 확인했습니다).
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const styleCode = url.searchParams.get("styleCode") || "";
    const toStore = url.searchParams.get("toStore") || "";
    const qtyParam = url.searchParams.get("qty");
    const qty = qtyParam ? Number(qtyParam) : undefined;
    const color = url.searchParams.get("color") || "";

    const result = await buildRtRequestSuggestion(styleCode, toStore, qty, color);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400, headers: NO_STORE_HEADERS });
    }
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "점포요청 RT 계산 실패" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
