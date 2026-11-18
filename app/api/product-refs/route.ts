import { NextResponse } from "next/server";
import { readProductRefs, saveProductRefs } from "@/lib/productRefs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// MARK 2026-11-18: 상품 기준표(재런칭·라인업) — GET 목록, POST {items} 전체 교체
export async function GET() {
  try {
    return NextResponse.json({ ok: true, items: await readProductRefs() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "읽기 실패" }, { status: 500 });
  }
}
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!Array.isArray(body?.items)) return NextResponse.json({ ok: false, error: "items가 필요합니다." }, { status: 400 });
    return NextResponse.json(await saveProductRefs(body.items));
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "저장 실패" }, { status: 500 });
  }
}
