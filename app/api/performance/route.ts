import { NextResponse } from "next/server";
import { buildPerformanceAnalysis } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function clean(value: string | null) {
  return String(value || "").trim();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const category = clean(url.searchParams.get("category")) as "ALL" | "RT" | "PROMOTION";
    const selectedDate = clean(url.searchParams.get("selectedDate"));
    const beforeStart = clean(url.searchParams.get("beforeStart"));
    const beforeEnd = clean(url.searchParams.get("beforeEnd"));
    const duringStart = clean(url.searchParams.get("duringStart"));
    const duringEnd = clean(url.searchParams.get("duringEnd"));

    const data = await buildPerformanceAnalysis({
      categoryFilter: category || "ALL",
      selectedDate,
      beforeStart,
      beforeEnd,
      duringStart,
      duringEnd,
    });

    return NextResponse.json({ ok: true, performance: data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Performance analysis failed" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
