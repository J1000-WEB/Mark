import { NextResponse } from "next/server";
import { runSalesReview } from "@/lib/salesReview";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 매일 8:00 KST 크론(UTC 23:00) = 전일 리뷰, 월요일엔 전주 리뷰도. 카톡 "나에게 보내기".
// 수동: ?kind=daily|weekly&day=YYYY-MM-DD&week=월요일&dryRun=1(안 보내고 글만)&force=1(이미 보낸 날도 다시)
export async function GET(req: Request) {
  const u = new URL(req.url);
  const k = u.searchParams.get("kind");
  try {
    const r = await runSalesReview({
      kind: k === "daily" || k === "weekly" ? k : "auto",
      day: u.searchParams.get("day") || undefined,
      week: u.searchParams.get("week") || undefined,
      dryRun: u.searchParams.get("dryRun") === "1",
      force: u.searchParams.get("force") === "1",
    });
    return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
