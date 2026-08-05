import { NextResponse } from "next/server";
import { saveWeeklyTargetSnapshot } from "@/lib/weeklyTarget";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// MARK 6.74: target-refresh.js(erp-agent)가 SL1030(ERP 목표대비실적 화면)에서 직접 긁어온
// 매출목표를 여기로 올립니다. "일_전일" 시트를 사람이 갱신할 필요 없이, 매주 월요일 자동으로
// 앞뒤 몇 주치를 한 번에 갱신하기 위한 용도입니다 (기존 captureWeeklyTargetSnapshot과 저장
// 로직은 완전히 동일 — saveWeeklyTargetSnapshot 공용 함수를 씀).
//
// body: { weeks: [{ weekMonday, monthKey, refreshedDate, baseDate, companyTotal, stores }] }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const weeks = Array.isArray(body.weeks) ? body.weeks : [];
    if (!weeks.length) {
      return NextResponse.json({ ok: false, error: "weeks가 비어있습니다." }, { status: 400 });
    }

    const results = [];
    for (const w of weeks) {
      if (!w.weekMonday) continue;
      const live = {
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
          ? w.stores.map((s: any) => ({
              storeName: String(s.storeName || ""),
              weekTarget: Number(s.weekTarget || 0),
              weekActual: Number(s.weekActual || 0),
              monthTarget: Number(s.monthTarget || 0),
            })).filter((s: any) => s.storeName)
          : [],
      };
      const result = await saveWeeklyTargetSnapshot(live);
      results.push(result);
    }

    return NextResponse.json({ ok: true, savedWeeks: results.length, results });
  } catch (error: any) {
    console.error("weekly-target-import failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "저장 실패" }, { status: 500 });
  }
}
