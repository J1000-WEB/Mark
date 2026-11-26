import { NextResponse } from "next/server";
import { computeShipRt, readShipRtConfig, saveShipRtConfig } from "@/lib/shipRtCompute";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

// MARK 2026-11-19: 재고CTRL 출고·RT 제안기(재고MD님 아티팩트 로직, lib/shipRtEngine.ts)
// GET                       → 저장된 설정
// POST {action:"config", config, by} → 설정 저장(MARK_DB 출고RT_설정)
// POST {action:"run", requests:[{storeCode,style,color,size,qty,note}], config?} → 계산(설정은 저장값 + 이번만 바꾼 값)
export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await readShipRtConfig()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "설정 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action === "config") {
      const r = await saveShipRtConfig(body.config || {}, String(body.by || ""));
      return NextResponse.json({ ok: true, ...r });
    }
    const result = await computeShipRt({ requests: Array.isArray(body?.requests) ? body.requests : [], outRequests: Array.isArray(body?.outRequests) ? body.outRequests : [], config: body?.config || undefined });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("ship-rt failed:", e);
    return NextResponse.json({ ok: false, error: e?.message || "계산 실패" }, { status: 500 });
  }
}
