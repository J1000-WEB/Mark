import { NextResponse } from "next/server";
import { sendEmailAlert } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// MARK 2026-09: 이 라우트가 (조용히) 실패하면 매주 새 스냅샷이 안 쌓이고, 대시보드는
// 계속 예전 스냅샷으로 조용히 폴백해버려서 몇 주가 지나도록 아무도 못 알아채는 사고가
// 실제로 있었음(8/17 이후 스냅샷이 3주째 안 쌓임 — 원인은 이 라우트가 부르는
// /api/weekly-history의 실시간 집계가 메모리 부족으로 죽어서였음). 그래서 실패하면
// 무조건 이메일로 알립니다(기존 일간 업로드 지연 알림과 같은 인프라, lib/alerts.ts).
async function fetchJsonOrThrow(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const raw = await res.text();
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`${url} 응답이 JSON이 아님 (status ${res.status}) — 서버 함수가 죽었을 가능성 높음`);
  }
}

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
    const detail = await fetchJsonOrThrow(`${origin}/api/weekly-history?type=style&refresh=1`, { cache: "no-store" });
    if (!detail?.ok) throw new Error(detail?.error || "Weekly_history 저장 실패");

    const payload = await fetchJsonOrThrow(`${origin}/api/weekly-history?dashboard=1&refresh=1`, { cache: "no-store" });
    if (!payload?.ok || !payload?.weekly) throw new Error(payload?.error || "주간 대시보드 원본 갱신 실패");

    const snapshot = await fetchJsonOrThrow(`${origin}/api/weekly-snapshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        periodLabel: payload.weekly?.periodLabel || "자동 주간 스냅샷",
        memo: "auto-weekly-snapshot",
        payload,
      }),
    });
    if (!snapshot?.ok) throw new Error(snapshot?.error || "Weekly_Snapshot 저장 실패");

    return NextResponse.json({
      ok: true,
      weeklyHistory: { selectedWeek: detail.selectedWeek, rowCount: detail.rowCount },
      snapshot,
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: any) {
    const message = error?.message || "Weekly Snapshot 자동 저장 실패";
    console.error("auto-weekly-snapshot failed:", message);
    await sendEmailAlert(
      "⚠️ 주간 스냅샷 자동 저장 실패",
      `<p>매주 월요일 자동으로 실행되는 주간 스냅샷 저장(auto-weekly-snapshot)이 실패했습니다.</p><p><b>에러:</b> ${message}</p><p>이번 주 스냅샷이 안 쌓였을 수 있으니, 대시보드에서 "실시간 갱신" 또는 "스냅샷 저장"을 눌러 수동으로 확인해주세요.</p>`
    ).catch(() => {});
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
