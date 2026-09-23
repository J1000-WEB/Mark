import { NextResponse } from "next/server";
import { getDbSheetId, getSheetValuesById, safeReplaceSheetValuesById } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const revalidate = 0;

const ACTIVE_ALERTS_SHEET = "재고입고알림_활성";
const ACTIVE_ALERTS_HEADER = ["styleCode", "colorCode", "firstAlertedDate", "baselineStock", "peakStock"];

// MARK 2026-09-24: 재고가 peak 대비 30% 이상 줄어야(/api/upload-stock-history 쪽) 알림이
// 해제되는데, 실제로 재고가 안 줄어드는 품목은 몇 주가 지나도 계속 활성 목록에 남아서
// "계속 쌓이고 있다"는 제보가 있었습니다. 그래서 조회할 때마다 1주 넘은 건(재고 변화와
// 무관하게) 자동으로 정리합니다 — 다음 업로드를 기다릴 필요 없이 화면을 볼 때마다 정리됨.
const ALERT_MAX_AGE_DAYS = 7;

// MARK: 실제 스파이크 감지+해제 판단은 /api/upload-stock-history(업로드할 때마다)에서
// 이미 다 처리해서 "재고입고알림_활성" 시트에 저장해두기 때문에, 여기서는 그 목록을
// 그대로 읽어서 보여주기만 합니다 — 그래서 "한번 뜬 알림이 확인 전에 사라지는" 문제가
// 없고, 실제로 재고가 줄어들 때까지(투입될 때까지) 계속 남아있습니다.
// MARK 2026-09-14: 다른 데이터 라우트들과 동일하게 no-store 명시 (auto-realtime-hourly-snapshot
// 라우트에서 이 헤더가 빠지면 Vercel 엣지가 GET 응답을 캐시해버리는 걸 확인했습니다).
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  try {
    const spreadsheetId = getDbSheetId();
    const rows = await getSheetValuesById(spreadsheetId, ACTIVE_ALERTS_SHEET, "A:E").catch(() => []);
    const data = rows.slice(1).filter((r) => r?.[0]);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ALERT_MAX_AGE_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const kept = data.filter((r) => String(r[2] || "") >= cutoffStr);

    // 1주 넘은 게 있었다면 시트에서도 실제로 지웁니다(계속 쌓이는 것 방지). 정리 자체가
    // 실패해도 화면 표시(아래 alerts)는 이미 걸러진 kept 기준이라 정상 동작합니다 — 다음
    // 조회 때 다시 정리를 시도합니다.
    if (kept.length !== data.length) {
      await safeReplaceSheetValuesById(spreadsheetId, ACTIVE_ALERTS_SHEET, [ACTIVE_ALERTS_HEADER, ...kept]).catch((e) => {
        console.error("stock-inbound-alerts: 오래된 알림 정리 실패(다음 조회 때 재시도):", e);
      });
    }

    const alerts = kept
      .map((r) => {
        const baselineStock = Number(r[3] || 0);
        const peakStock = Number(r[4] || 0);
        return {
          styleCode: String(r[0]),
          colorCode: String(r[1]),
          firstAlertedDate: String(r[2]),
          baselineStock,
          peakStock,
          increase: peakStock - baselineStock,
        };
      })
      .sort((a, b) => b.increase - a.increase);

    return NextResponse.json({ ok: true, alerts }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("stock-inbound-alerts failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
