import { NextResponse } from "next/server";
import { readDailySalesFromMarkDb, saveDailySalesToHistory } from "@/lib/dailySales";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const revalidate = 0;

// 자동/수동 일간 스냅샷은 모두 lib/dailySales.ts의 동일 저장 로직을 사용합니다.
// 저장 단위: 일자 + 점포 + 스타일 + 칼라 + 사이즈
// 저장 조건: 일간 판매 발생 건만 저장
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization") || "";
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const data = await readDailySalesFromMarkDb();
    const saved = await saveDailySalesToHistory(data, "auto-daily-sales-snapshot");

    return NextResponse.json(
      { ok: true, data, saved },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error: any) {
    console.error("Auto daily sales snapshot failed:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Daily Sales History 자동 저장 실패" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}

export async function POST() {
  try {
    const data = await readDailySalesFromMarkDb();
    const saved = await saveDailySalesToHistory(data, "manual-auto-daily-sales-snapshot");

    return NextResponse.json(
      { ok: true, data, saved },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error: any) {
    console.error("Manual daily sales snapshot failed:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Daily Sales History 수동 저장 실패" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
