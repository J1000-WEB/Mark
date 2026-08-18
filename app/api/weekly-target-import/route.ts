import { NextResponse } from "next/server";
import { saveWeeklyTargetSnapshots } from "@/lib/weeklyTarget";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const revalidate = 0;

// MARK 6.74: target-refresh.js(erp-agent)가 SL1030(ERP 목표대비실적 화면)에서 직접 긁어온
// 매출목표를 여기로 올립니다. "일_전일" 시트를 사람이 갱신할 필요 없이, 매주 월요일 자동으로
// 앞뒤 몇 주치를 한 번에 갱신하기 위한 용도입니다.
// MARK 6.90: 주차마다 따로 저장하면 구글시트 API를 너무 많이 불러서 할당량 초과가 났던 문제가
// 있어(주차당 최대 4번 호출 × 10주차 = 40번+) — saveWeeklyTargetSnapshots로 한 번에 배치
// 저장하도록 바꿨습니다(시트 읽기/쓰기 총 4번으로 고정, 주차 개수와 무관).
//
// body: { weeks: [{ weekMonday, monthKey, refreshedDate, baseDate, companyTotal, stores }] }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const weeks = Array.isArray(body.weeks) ? body.weeks : [];
    if (!weeks.length) {
      return NextResponse.json({ ok: false, error: "weeks가 비어있습니다." }, { status: 400 });
    }

    const lives = weeks
      .filter((w: any) => w.weekMonday)
      .map((w: any) => ({
        weekMonday: String(w.weekMonday),
        monthKey: String(w.monthKey || ""),
        refreshedDate: String(w.refreshedDate || ""),
        baseDate: String(w.baseDate || ""),
        companyTotal: w.companyTotal
          ? {
              weekTarget: Number(w.companyTotal.weekTarget || 0),
              weekActual: Number(w.companyTotal.weekActual || 0),
              monthTarget: Number(w.companyTotal.monthTarget || 0),
            }
          : null,
        stores: Array.isArray(w.stores)
          ? w.stores
              .map((s: any) => ({
                storeName: String(s.storeName || ""),
                weekTarget: Number(s.weekTarget || 0),
                weekActual: Number(s.weekActual || 0),
                monthTarget: Number(s.monthTarget || 0),
              }))
              .filter((s: any) => s.storeName)
          : [],
      }));

    const results = await saveWeeklyTargetSnapshots(lives);

    return NextResponse.json({ ok: true, savedWeeks: results.length, results });
  } catch (error: any) {
    console.error("weekly-target-import failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "저장 실패" }, { status: 500 });
  }
}
