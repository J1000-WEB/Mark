import { NextResponse } from "next/server";
import { buildDashboardDataFromGoogleSheet } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// MARK 6.51: Layer 0(전사지시) — VMD가 "이번주 뭘 밀지" 한 곳에서 볼 수 있게.
export async function GET() {
  try {
    const data = await buildDashboardDataFromGoogleSheet();
    const directives = (data as any)?.inventory?.styleDirectives || [];
    return NextResponse.json({ ok: true, directives }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("style-directives failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500 });
  }
}
