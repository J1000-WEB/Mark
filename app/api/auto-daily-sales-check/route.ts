import { NextResponse } from "next/server";
import { getHistorySheetId, getSheetValuesById } from "@/lib/googleSheets";
import { expandAnyDailyHistoryRows } from "@/lib/dailySales";
import { sendEmailAlert } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DAILY_HISTORY_SHEET = "Daily_Sales_History";

function todayDateKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function addDaysKey(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// MARK 6.14: 일간매출 대시보드는 매일 스냅샷이 안 쌓이면 이후 계산(주간비교, 목표매칭 등)이
// 다 같이 깨지기 때문에, "어제 날짜가 Daily_Sales_History에 실제로 있는지"를 매일 확인하고
// 없으면 이메일로 알립니다.
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization") || "";
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const historyId = getHistorySheetId();
    const raw = await getSheetValuesById(historyId, DAILY_HISTORY_SHEET, "A:ZZ");
    const flatRows = expandAnyDailyHistoryRows(raw || []);

    const dates = new Set(flatRows.map((r) => r.date).filter(Boolean));
    const today = todayDateKey();
    const yesterday = addDaysKey(today, -1);

    const hasYesterday = dates.has(yesterday);

    if (hasYesterday) {
      return NextResponse.json({ ok: true, checked: yesterday, missing: false });
    }

    // 어제 날짜가 없으면, 최근 언제까지 데이터가 있는지도 같이 확인해서 이메일에 담습니다.
    const sortedDates = Array.from(dates).sort();
    const lastDate = sortedDates.length ? sortedDates[sortedDates.length - 1] : "없음";

    const subject = `⚠️ 일간매출 대시보드 업데이트 누락 (${yesterday})`;
    const html = `
      <p>일간매출 대시보드(Daily_Sales_History)에 <b>${yesterday}</b> 날짜 데이터가 없습니다.</p>
      <p>마지막으로 확인된 날짜: <b>${lastDate}</b></p>
      <p>일간매출 스냅샷이 정상적으로 저장됐는지 확인해주세요. 이 날짜가 비어있으면 주간 비교, 목표 달성률 등 관련 수치가 함께 어긋날 수 있습니다.</p>
    `;

    const sendResult = await sendEmailAlert(subject, html);

    return NextResponse.json({
      ok: true,
      checked: yesterday,
      missing: true,
      lastDate,
      emailSent: sendResult.ok,
      emailError: sendResult.ok ? undefined : sendResult.error,
    });
  } catch (error: any) {
    console.error("Daily sales snapshot check failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "일간매출 스냅샷 확인 실패" }, { status: 500 });
  }
}
