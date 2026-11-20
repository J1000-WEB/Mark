import { NextResponse } from "next/server";
import { saveVerify, readLatestVerify } from "@/lib/inshopVerify";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK 2026-11-20: 인샵 매출 업로드 검증(PC verify-inshop-upload.js → 여기). GET = 최근 7일 매출일 결과.
export async function GET() {
  try {
    return NextResponse.json({ ok: true, items: await readLatestVerify() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    const r = await saveVerify(items, { alert: body?.alert !== false });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
