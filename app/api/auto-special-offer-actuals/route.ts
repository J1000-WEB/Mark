import { NextResponse } from "next/server";
import { readDailyHistoryRowsForDateRangeWithDebug } from "@/lib/dailySales";
import { updateSpecialOfferActuals, AUTO_ACTUALS_START_DATE } from "@/lib/specialOfferWeek";
import { loadStoreAmountRows } from "@/lib/dailyBriefing";
import { mergeStoreDailyAmounts, flattenMergedAmounts } from "@/lib/storeDailyAmount";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK 6.10.2→6.97: 스페셜오퍼위크 세부일정의 2026-07-01 이후 이벤트만
// Daily_Sales_History 기준 실제 매출로 R열(실적)을 자동 갱신합니다.
// 예전엔 소천님이 오전 10시쯤 수기로 확인하시던 습관에 맞춰 낮 12시로 잡았었는데, 지금은
// ERP 자동화(daily-snapshot.js, 새벽 4시경 완료)가 Daily_Sales_History를 직접 채워주고
// 있어서 그럴 필요가 없어졌습니다 — 자동화가 끝난 직후인 오전 5시(KST)로 최대한 앞당겼습니다.
// 그 이전 날짜(수기입력)는 절대 건드리지 않습니다.
//
// MARK 2026-09-11: 여태 Daily_Sales_History 전체(A:ZZ, 지금은 수십만 건의 상세행으로 펼쳐짐)를
// 매번 통째로 읽고 있었는데, 9월 들어 시트가 계속 커지면서(실시간 탭 upsert가 10~15분마다
// 돌기 시작한 뒤로 더 빠르게) 결국 응답이 타임아웃나서 갱신이 멈췄습니다(9월 5일 이후 문의로
// 확인). 실제로 필요한 건 AUTO_ACTUALS_START_DATE(2026-07-01)부터 오늘까지뿐이라,
// targeted로 읽도록 바꿨습니다.
//
// MARK 2026-09-11b: 바꾸자마자 targeted 읽기가 뭔가 이유로 0건을 반환해서, 실적(R열) 전체가
// 0으로 덮어써지는 사고가 있었습니다(원본 Daily_Sales_History는 안 건드려져서 데이터 자체는
// 안전했지만, 요약 컬럼이 잘못 지워짐). 재발 방지로 안전장치를 추가합니다 — 읽은 기간이
// 넓은데(14일 이상) 결과가 비정상적으로 적으면(20건 미만) 실제로 매출이 없는 게 아니라 읽기
// 자체가 실패했을 가능성이 크므로, 쓰기를 건너뛰고 에러로 중단합니다. 원인을 바로 알 수
// 있게 읽기 진단(rangeDebug)도 응답에 같이 실어둡니다.
async function runUpdate() {
  const { rows: primaryRowsRaw, debug: rangeDebug } = await readDailyHistoryRowsForDateRangeWithDebug(AUTO_ACTUALS_START_DATE);

  const daySpan = Math.max(
    1,
    Math.round((new Date(`${rangeDebug.end}T00:00:00`).getTime() - new Date(`${rangeDebug.startDate}T00:00:00`).getTime()) / 86400000)
  );
  if (daySpan >= 14 && primaryRowsRaw.length < 20) {
    throw new Error(
      `Daily_Sales_History에서 ${rangeDebug.startDate}~${rangeDebug.end}(${daySpan}일치) 데이터를 ${primaryRowsRaw.length}건밖에 못 읽었습니다 ` +
        `— 정상이라면 훨씬 많아야 해서, 읽기 실패로 보고 실적을 0으로 덮어쓰지 않고 중단합니다. 진단: ${JSON.stringify(rangeDebug)}`
    );
  }

  const primaryRows = primaryRowsRaw.map((r) => ({
    date: r.date,
    storeName: r.storeName,
    amount: r.amount,
  }));
  // MARK 6.57: 일간/매장 탭과 동일하게, Daily_Sales_History가 없는 날짜는 일간매출(26년)으로 보완합니다.
  const fallbackRows = await loadStoreAmountRows().catch(() => []);
  const merged = mergeStoreDailyAmounts(primaryRows, fallbackRows);
  const dailyFlatRows = flattenMergedAmounts(merged);
  const result = await updateSpecialOfferActuals(dailyFlatRows);
  return { ...result, rangeDebug };
}

export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization") || "";
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await runUpdate();

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error: any) {
    console.error("Auto special-offer actuals failed:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "스페셜오퍼위크 실적 자동 갱신 실패" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}

// MARK 6.98: 크론(GET)은 CRON_SECRET이 걸려있어서 브라우저로 바로 못 부릅니다 — 지금처럼
// "수동으로 한 번 확인해보고 싶을 때"를 위해 인증 없는 POST를 따로 둡니다(로직은 완전히 동일).
export async function POST() {
  try {
    const result = await runUpdate();

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error: any) {
    console.error("Manual special-offer actuals failed:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "스페셜오퍼위크 실적 수동 갱신 실패" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
