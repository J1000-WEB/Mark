import { NextResponse } from "next/server";
import { listSavedReviews, getOrBuildReview } from "@/lib/salesReview";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET ?list=1 = 저장된 리뷰 목록 / ?kind=daily|weekly&key=날짜(주는 월요일)[&rebuild=1] = 본문(없으면 만들어서 저장)
export async function GET(req: Request) {
  const u = new URL(req.url);
  try {
    if (u.searchParams.get("list")) return NextResponse.json({ ok: true, items: await listSavedReviews() }, { headers: { "Cache-Control": "no-store" } });
    const kind = u.searchParams.get("kind") === "weekly" ? "weekly" : "daily";
    const key = String(u.searchParams.get("key") || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return NextResponse.json({ ok: false, error: "key=YYYY-MM-DD" }, { status: 400 });
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    if (key >= today) return NextResponse.json({ ok: false, error: "아직 끝나지 않은 날짜예요." }, { status: 400 });
    const r = await getOrBuildReview(kind, key, u.searchParams.get("rebuild") === "1");
    return NextResponse.json({ ok: true, review: r }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
