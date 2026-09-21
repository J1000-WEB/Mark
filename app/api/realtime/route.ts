import { NextResponse } from "next/server";
import { readRealtimeOverview } from "@/lib/dailySales";
import { readRealtimeHourlyTrend, recordRealtimeHourlySnapshot } from "@/lib/realtimeHourlySnapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK: 실시간 탭 — 오늘자 실시간 매출 + 추정 재고(새벽 재고 - 오늘 누적판매) +
// 전주 동시간대비 시간별 매출추이/예상 마감 매출을 함께 반환합니다.
//
// MARK 2026-09-14: "14시 넘었는데 시간대별 매출추이가 11시 이후로 안 쌓인다" 문의를 파다가,
// 이 라우트에 "Cache-Control: no-store"가 빠져있는 걸 발견했습니다. dynamic="force-dynamic"은
// Next.js가 이 페이지를 정적으로 빌드하지 않게만 막을 뿐, 응답에 캐시하지 말라는 헤더가
// 없으면 Vercel 엣지가 GET 응답을 캐시해버릴 수 있습니다(auto-realtime-hourly-snapshot
// 라우트에서 실제로 이 문제를 확인했습니다 — 몇 시간이 지나도 첫 응답이 그대로 반복됨).
// 3분마다 자동 갱신되는 화면이 실제로는 캐시된 옛날 데이터를 계속 보여주고 있었을 수
// 있어서, 다른 모든 데이터 라우트와 동일하게 no-store를 명시합니다.
//
// MARK 2026-09-21: "시간대별 매출추이 기록이 제대로 안 쌓인다" 확인 — GitHub Actions의
// 정시(매시) 스케줄러가 실제로는 하루 12번이 아니라 3~4번 정도만 불규칙하게 실행되고
// 있었습니다(GitHub 저장소 활동이 적은 편이라 스케줄 이벤트가 상당수 드롭되는, GitHub
// Actions의 잘 알려진 한계 — 실행될 때는 매번 성공했으므로 코드 문제는 아니었습니다).
// GitHub Actions 하나에만 의존하지 않도록, 이 화면을 조회할 때마다(3분 자동 새로고침 포함)
// "이번 시각이 아직 기록 안 됐으면 지금 기록"하도록 여기서도 같이 호출합니다.
// recordRealtimeHourlySnapshot은 같은 시각이면 새로 추가하지 않고 업데이트만 하도록
// 이미 멱등적으로 짜여있어서, 여러 명이 동시에 보고 있어도 안전합니다 — 운영시간 중
// 누군가 화면을 한 번이라도 열어보면 그 시각은 반드시 기록됩니다. GitHub Actions는
// 아무도 화면을 안 보는 시간대를 위한 백업으로 그대로 둡니다.
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  try {
    // MARK 2026-09-21: "매출예측은 배율표만으로 계산되게" 요청 — readRealtimeOverview()가
    // 이미 Daily_Sales_History에서 직접 계산해서 주는 "오늘 지금까지 누적매출"
    // (totalDailyAmount)을 readRealtimeHourlyTrend에 넘겨서, 정시 기록(Realtime_Hourly_Snapshot)
    // 여부와 무관하게 항상 최신값으로 예측이 계산되게 합니다. 정시 기록 자체(recordRealtimeHourlySnapshot)는
    // 위쪽 "오늘 vs 지난주" 추이 그래프용으로 계속 병행해서 쌓습니다 — 실패해도 나머지 응답에는 영향 없게 분리.
    const [overview] = await Promise.all([
      readRealtimeOverview(),
      recordRealtimeHourlySnapshot().catch((err) => console.error("realtime: opportunistic hourly snapshot failed:", err)),
    ]);
    const trend = await readRealtimeHourlyTrend(overview.totalDailyAmount).catch(() => null);
    return NextResponse.json({ ok: true, data: { ...overview, trend } }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("realtime failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "실시간 데이터를 불러오지 못했습니다." }, { status: 200, headers: NO_STORE_HEADERS });
  }
}
