import { NextResponse } from "next/server";
import { checkUploadStalenessAndAlert } from "@/lib/uploadAlertState";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization") || "";
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await checkUploadStalenessAndAlert();
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("Upload staleness check failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "지연 확인 실패" }, { status: 500 });
  }
}
