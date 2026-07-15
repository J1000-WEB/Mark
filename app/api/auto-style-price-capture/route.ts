import { NextResponse } from "next/server";
import { captureWeeklyStylePrices } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// MARK 6.15: 매주 화요일 00시(사용자가 월요일에 금주/전주 시트를 갱신하므로, 그 다음날 새벽)
// 품번별 실제 평균단가(실제판매금액÷실제판매수량)를 캡처해서 Style_Price_History에 쌓습니다.
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization") || "";
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await captureWeeklyStylePrices();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("Weekly style price capture failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "품번 단가 캡처 실패" }, { status: 500 });
  }
}
