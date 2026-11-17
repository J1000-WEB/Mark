import { NextResponse } from "next/server";
import { buildDailyAchievement, buildAnnualStores, buildAnnualTeams, saveAnnualInputs } from "@/lib/salesReports";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// MARK 2026-11-17: 매출탭 리포트 — GET ?type=daily&month=YYYY-MM | annual&year= | annualStores&year=
//                                  POST { year, values:[{team,item,months[12]}] } (연간실적 입력값 저장)
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const type = sp.get("type") || "daily";
    const nowKst = new Date(Date.now() + 9 * 3600 * 1000 - 86400000).toISOString();
    if (type === "daily") {
      const month = /^\d{4}-\d{2}$/.test(sp.get("month") || "") ? sp.get("month")! : nowKst.slice(0, 7);
      return NextResponse.json({ ok: true, ...(await buildDailyAchievement(month)) }, { headers: NO_STORE });
    }
    const year = /^\d{4}$/.test(sp.get("year") || "") ? Number(sp.get("year")) : Number(nowKst.slice(0, 4));
    if (type === "annual") return NextResponse.json({ ok: true, ...(await buildAnnualTeams(year)) }, { headers: NO_STORE });
    if (type === "annualStores") return NextResponse.json({ ok: true, ...(await buildAnnualStores(year)) }, { headers: NO_STORE });
    return NextResponse.json({ ok: false, error: "type이 올바르지 않습니다." }, { status: 400, headers: NO_STORE });
  } catch (e: any) {
    console.error("sales-reports failed:", e);
    return NextResponse.json({ ok: false, error: e?.message || "리포트 계산 실패" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const year = Number(body?.year);
    if (!year || !Array.isArray(body?.values)) return NextResponse.json({ ok: false, error: "year/values가 필요합니다." }, { status: 400 });
    return NextResponse.json(await saveAnnualInputs(year, body.values), { headers: NO_STORE });
  } catch (e: any) {
    console.error("sales-reports save failed:", e);
    return NextResponse.json({ ok: false, error: e?.message || "저장 실패" }, { status: 500, headers: NO_STORE });
  }
}
