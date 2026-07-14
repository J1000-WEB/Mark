import { NextResponse } from "next/server";
import { captureWeeklyTargetSnapshot } from "@/lib/weeklyTarget";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// MARK 6.12: 일_전일 시트는 사용자가 비정기적으로 갱신하므로, 매일 체크해서
// "지금 그 시트가 가리키는 주"의 목표를 Weekly_Target_History에 캡처(upsert)합니다.
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization") || "";
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await captureWeeklyTargetSnapshot();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("Auto weekly-target capture failed:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "주간목표 캡처 실패" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
