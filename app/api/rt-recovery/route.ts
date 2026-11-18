import { NextResponse } from "next/server";
import { buildRtRecovery } from "@/lib/rtRecovery";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

// MARK 2026-11-18: RT 기회로스 회수 분석 — GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (지시일 기준, 기본 최근 30일). 계산 방식은 lib/rtRecovery.ts 맨 위 주석.
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const ok = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
    const data = await buildRtRecovery({ from: ok(sp.get("from")), to: ok(sp.get("to")) });
    return NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("rt-recovery failed", e);
    return NextResponse.json({ ok: false, error: e?.message || "RT 회수 분석 실패" }, { status: 500 });
  }
}
