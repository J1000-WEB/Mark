import { NextResponse } from "next/server";
import { getUploadStatuses, STALENESS_THRESHOLD_DAYS } from "@/lib/uploadAlertState";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const statuses = await getUploadStatuses();
    return NextResponse.json({ ok: true, statuses, thresholds: STALENESS_THRESHOLD_DAYS }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500 });
  }
}
