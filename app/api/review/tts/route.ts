import { NextResponse } from "next/server";
import { synthReview } from "@/lib/reviewTts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 리뷰 소리내어 읽기(lib/reviewTts.ts) — 8:00 리뷰 만들 때 미리 만들어 둬서 보통은 저장본을 바로 돌려줌
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await synthReview(String(body?.text || ""), Number(body?.rate) || undefined);
  return NextResponse.json(r, { status: r.speech ? 200 : 400 });
}
