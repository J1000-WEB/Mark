import { NextResponse } from "next/server";
import { readSpecialOfferSheet } from "@/lib/specialOfferWeek";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// MARK 2026-11-24: 상품탭 SOW(스페셜오퍼위크) 리뷰 — 작업 중(시트 구조 확인용 debug)
export async function GET(req: Request) {
  const u = new URL(req.url);
  try {
    if (u.searchParams.get("debug") === "sheet") {
      const s = await readSpecialOfferSheet();
      return NextResponse.json({ ok: true, header: s.rows[s.headerRowIdx], top: s.rows.slice(0, s.headerRowIdx), sample: s.rows.slice(-25), n: s.rows.length, debug: s.debug });
    }
    return NextResponse.json({ ok: false, error: "준비 중" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
