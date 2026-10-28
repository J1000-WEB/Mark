import { NextRequest, NextResponse } from "next/server";
import { getRoundingInventory } from "@/lib/roundingInventory";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// GET /api/rounding/inventory?store=매장명 — 오늘 계산분(없으면 전 매장 계산 후 저장)에서 그 매장 재고점검
export async function GET(req: NextRequest) {
  try {
    const store = req.nextUrl.searchParams.get("store") || "";
    if (!store) return NextResponse.json({ ok: false, error: "store가 필요해요." }, { status: 400, headers: NO_STORE });
    const res = await getRoundingInventory(store);
    return NextResponse.json({ ok: true, ...res }, { headers: NO_STORE });
  } catch (error: any) {
    console.error("rounding inventory GET failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "재고점검 조회 실패" }, { status: 500, headers: NO_STORE });
  }
}

// POST {store} — 다시 계산(전 매장) 후 그 매장 반환
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const store = String(body?.store || "");
    const res = await getRoundingInventory(store || "-", { force: true });
    return NextResponse.json({ ok: true, ...res }, { headers: NO_STORE });
  } catch (error: any) {
    console.error("rounding inventory POST failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "재고점검 계산 실패" }, { status: 500, headers: NO_STORE });
  }
}
