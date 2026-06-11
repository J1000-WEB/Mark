import { NextResponse } from "next/server";
import { buildDashboardDataFromGoogleSheet, getFallbackData } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const data = await buildDashboardDataFromGoogleSheet();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: any) {
    console.error("Google Sheet data load failed:", error);
    const fallback = getFallbackData();
    return NextResponse.json(
      {
        ...fallback,
        source: "fallback",
        googleError: error?.message || "Google Sheet data load failed",
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
