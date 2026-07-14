import { NextResponse } from "next/server";
import { getHistorySheetId, getSheetValuesById, ensureSheetExistsById, appendValuesById, updateValuesById } from "@/lib/googleSheets";
import { expandAnyDailyHistoryRows } from "@/lib/dailySales";
import { sendEmailAlert } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DAILY_HISTORY_SHEET = "Daily_Sales_History";
const ALERT_STATE_SHEET = "Daily_Sales_Alert_State";
const ALERT_STATE_HEADER = ["날짜", "상태", "최초알림", "해결알림"];

function todayDateKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function addDaysKey(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function nowKST() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function text(v: any) {
  return String(v ?? "").trim();
}

// MARK 6.14.1: 데이터가 자정에 바로 안 올라오는 걸 감안해서, "어제"가 아니라 "그저께" 기준으로
// 누락을 확인합니다. 그리고 한 번 누락으로 알림을 보낸 날짜는 상태 시트에 기록해뒀다가,
// 나중에 데이터가 채워지면 "해결됐습니다" 후속 알림도 보냅니다(계속 같은 알림을 반복하진 않음).
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
    const checkDate = addDaysKey(today, -2); // 그저께

    await ensureSheetExistsById(historyId, ALERT_STATE_SHEET, ALERT_STATE_HEADER);
    const stateRows = await getSheetValuesById(historyId, ALERT_STATE_SHEET, "A:D");
    const stateHeader = stateRows[0] || ALERT_STATE_HEADER;
    const stateBody = stateRows.slice(1);

    const stateByDate = new Map<string, { rowIndex: number; status: string }>();
    stateBody.forEach((row, idx) => {
      const date = text(row[0]);
      if (date) stateByDate.set(date, { rowIndex: idx + 2, status: text(row[1]) }); // +2: 헤더(1행) + 0-based -> 1-based
    });

    const updates: { range: string; values: any[][] }[] = [];
    const newRows: any[][] = [];
    const notes: string[] = [];

    // [체크1] 그저께 데이터가 없는지 확인 (새로 누락이 발견된 경우만 신규 알림)
    const checkDateHasData = dates.has(checkDate);
    const existingState = stateByDate.get(checkDate);

    if (!checkDateHasData && !existingState) {
      const sortedDates = Array.from(dates).sort();
      const lastDate = sortedDates.length ? sortedDates[sortedDates.length - 1] : "없음";

      const subject = `⚠️ 일간매출 대시보드 업데이트 누락 (${checkDate})`;
      const html = `
        <p>일간매출 대시보드(Daily_Sales_History)에 <b>${checkDate}</b>(그저께) 날짜 데이터가 없습니다.</p>
        <p>마지막으로 확인된 날짜: <b>${lastDate}</b></p>
        <p>일간매출 스냅샷이 정상적으로 저장됐는지 확인해주세요. 데이터가 채워지면 다시 확인해서 해결 알림을 보내드립니다.</p>
      `;
      const sendResult = await sendEmailAlert(subject, html);
      newRows.push([checkDate, "missing", nowKST(), ""]);
      notes.push(`신규 누락 알림: ${checkDate} (이메일 ${sendResult.ok ? "발송됨" : "발송실패: " + sendResult.error})`);
    }

    // [체크2] 이전에 "missing"으로 기록된 날짜들 중, 지금은 데이터가 채워진 게 있는지 확인 → 해결 알림
    for (const [date, info] of stateByDate.entries()) {
      if (info.status !== "missing") continue;
      if (!dates.has(date)) continue; // 아직도 없음 -> 그대로 둠 (반복 알림 안 보냄)

      const subject = `✅ 일간매출 대시보드 데이터 채워짐 (${date})`;
      const html = `<p><b>${date}</b> 날짜 데이터가 이제 Daily_Sales_History에 채워진 것을 확인했습니다.</p>`;
      const sendResult = await sendEmailAlert(subject, html);

      updates.push({
        range: `'${ALERT_STATE_SHEET}'!A${info.rowIndex}:D${info.rowIndex}`,
        values: [[date, "resolved", stateBody[info.rowIndex - 2]?.[2] || "", nowKST()]],
      });
      notes.push(`해결 알림: ${date} (이메일 ${sendResult.ok ? "발송됨" : "발송실패: " + sendResult.error})`);
    }

    if (newRows.length) {
      await appendValuesById(historyId, `'${ALERT_STATE_SHEET}'!A:D`, newRows);
    }
    for (const u of updates) {
      await updateValuesById(historyId, u.range, u.values);
    }

    return NextResponse.json({
      ok: true,
      checkedDate: checkDate,
      checkDateHasData,
      newlyFlagged: newRows.length,
      resolved: updates.length,
      notes,
    });
  } catch (error: any) {
    console.error("Daily sales snapshot check failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "일간매출 스냅샷 확인 실패" }, { status: 500 });
  }
}
