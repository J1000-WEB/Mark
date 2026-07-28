import { NextResponse } from "next/server";
import { loadRecentActions } from "@/lib/actionLog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const actions = await loadRecentActions(50);
    return NextResponse.json({ ok: true, actions });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500 });
  }
}
