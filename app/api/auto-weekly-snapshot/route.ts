import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Weekly automatic snapshot is intentionally separated from the generic MARK_HISTORY flow.
 * 1) refresh dedicated Weekly_history (product/store detail)
 * 2) calculate live weekly dashboard
 * 3) replace the matching Monday payload in dedicated Weekly_Snapshot
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization") || "";
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const origin = new URL(req.url).origin;
    const detailRes = await fetch(`${origin}/api/weekly-history?type=style&refresh=1`, {
      cache: "no-store",
    });
    const detail = await detailRes.json();
    if (!detail?.ok) throw new Error(detail?.error || "Weekly_history 저장 실패");

    const dashboardRes = await fetch(`${origin}/api/weekly-history?dashboard=1&refresh=1`, {
      cache: "no-store",
    });
    const payload = await dashboardRes.json();
    if (!payload?.ok || !payload?.weekly) throw new Error(payload?.error || "주간 대시보드 원본 갱신 실패");

    const snapshotRes = await fetch(`${origin}/api/weekly-snapshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        periodLabel: payload.weekly?.periodLabel || "자동 주간 스냅샷",
        memo: "auto-weekly-snapshot",
        payload,
      }),
    });
    const snapshot = await snapshotRes.json();
    if (!snapshot?.ok) throw new Error(snapshot?.error || "Weekly_Snapshot 저장 실패");

    return NextResponse.json({
      ok: true,
      weeklyHistory: { selectedWeek: detail.selectedWeek, rowCount: detail.rowCount },
      snapshot,
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Weekly Snapshot 자동 저장 실패" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
