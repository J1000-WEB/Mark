import { NextResponse } from "next/server";
import { readPromoItems, savePromoItems } from "@/lib/promoGroups";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// MARK 2026-11-17: 프로모션 품번리스트 — GET 목록, POST { items: PromoItem[] } 전체 교체 저장(MARK_DB "프로모션_품번")
export async function GET() {
  try {
    return NextResponse.json({ ok: true, items: await readPromoItems({ all: true }) }, { headers: NO_STORE });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "읽기 실패" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!Array.isArray(body?.items)) return NextResponse.json({ ok: false, error: "items가 필요합니다." }, { status: 400 });
    return NextResponse.json(await savePromoItems(body.items), { headers: NO_STORE });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "저장 실패" }, { status: 500, headers: NO_STORE });
  }
}
