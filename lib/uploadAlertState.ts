import { getDbSheetId, getSheetValuesById, ensureSheetExistsById, appendValuesById, updateValuesById } from "@/lib/googleSheets";
import { sendEmailAlert } from "@/lib/alerts";

// MARK 6.16.1: 카테고리·가격(재고시트)/생산/재고(물류) — 가끔 업로드하는 3개 파일의
// "마지막 업로드 시각"을 기록하고, 각자 정한 기한(일)을 넘기면 이메일로 알려줍니다.

const ALERT_SHEET = "Upload_Alert_State";
const ALERT_HEADER = ["파일종류", "마지막업로드", "알림상태", "알림발송일시"];

export type UploadFileKind = "카테고리가격" | "생산" | "재고물류";

export const STALENESS_THRESHOLD_DAYS: Record<UploadFileKind, number> = {
  "카테고리가격": 14,
  "생산": 7,
  "재고물류": 7,
};

function text(v: any) {
  return String(v ?? "").trim();
}

function nowKST() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function todayDateKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function daysBetween(fromDateKey: string, toDateKey: string) {
  const from = new Date(`${fromDateKey}T00:00:00`);
  const to = new Date(`${toDateKey}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

// 파일이 업로드될 때마다 호출 — "마지막업로드"를 갱신하고 알림상태를 초기화(정상)합니다.
export async function recordUpload(kind: UploadFileKind) {
  const dbId = getDbSheetId();
  await ensureSheetExistsById(dbId, ALERT_SHEET, ALERT_HEADER);
  const rows = await getSheetValuesById(dbId, ALERT_SHEET, "A:D").catch(() => []);
  const body = rows.slice(1);
  const rowIdx = body.findIndex((r) => text(r[0]) === kind);
  const savedAt = nowKST();

  if (rowIdx >= 0) {
    await updateValuesById(dbId, `'${ALERT_SHEET}'!A${rowIdx + 2}:D${rowIdx + 2}`, [[kind, savedAt, "정상", ""]]);
  } else {
    await appendValuesById(dbId, `'${ALERT_SHEET}'!A:D`, [[kind, savedAt, "정상", ""]]);
  }
}

export async function getUploadStatuses(): Promise<Record<UploadFileKind, { lastUploadedAt: string; daysSince: number | null }>> {
  const dbId = getDbSheetId();
  const rows = await getSheetValuesById(dbId, ALERT_SHEET, "A:D").catch(() => []);
  const body = rows.slice(1);
  const today = todayDateKey();

  const result: any = {};
  for (const kind of Object.keys(STALENESS_THRESHOLD_DAYS) as UploadFileKind[]) {
    const row = body.find((r) => text(r[0]) === kind);
    if (!row || !text(row[1])) {
      result[kind] = { lastUploadedAt: "", daysSince: null };
      continue;
    }
    const lastDateKey = text(row[1]).slice(0, 10);
    result[kind] = { lastUploadedAt: text(row[1]), daysSince: daysBetween(lastDateKey, today) };
  }
  return result;
}

// MARK 6.16.1: 매일 체크해서 기한을 넘긴 파일이 있으면 이메일 알림 (같은 건은 한 번만 알림).
export async function checkUploadStalenessAndAlert() {
  const dbId = getDbSheetId();
  await ensureSheetExistsById(dbId, ALERT_SHEET, ALERT_HEADER);
  const rows = await getSheetValuesById(dbId, ALERT_SHEET, "A:D").catch(() => []);
  const body = rows.slice(1);
  const today = todayDateKey();

  const updates: { range: string; values: any[][] }[] = [];
  const alerted: string[] = [];

  for (const kind of Object.keys(STALENESS_THRESHOLD_DAYS) as UploadFileKind[]) {
    const threshold = STALENESS_THRESHOLD_DAYS[kind];
    const rowIdx = body.findIndex((r) => text(r[0]) === kind);
    if (rowIdx < 0) continue; // 업로드 이력 자체가 없으면(아직 한 번도 안 올림) 스킵

    const row = body[rowIdx];
    const lastUploadedAt = text(row[1]);
    if (!lastUploadedAt) continue;
    const daysSince = daysBetween(lastUploadedAt.slice(0, 10), today);
    const alreadyAlerted = text(row[2]) === "지연알림";

    if (daysSince >= threshold && !alreadyAlerted) {
      const subject = `⚠️ ${kind} 파일 업데이트 지연 (${daysSince}일 경과)`;
      const html = `<p><b>${kind}</b> 파일이 마지막 업로드(${lastUploadedAt}) 이후 <b>${daysSince}일</b> 지났습니다 (기준 ${threshold}일).</p><p>새 파일을 업로드해주세요.</p>`;
      const sendResult = await sendEmailAlert(subject, html);
      updates.push({ range: `'${ALERT_SHEET}'!A${rowIdx + 2}:D${rowIdx + 2}`, values: [[kind, lastUploadedAt, "지연알림", nowKST()]] });
      alerted.push(`${kind}(이메일 ${sendResult.ok ? "발송됨" : "실패:" + sendResult.error})`);
    }
  }

  for (const u of updates) await updateValuesById(dbId, u.range, u.values);
  return { checked: Object.keys(STALENESS_THRESHOLD_DAYS), alerted };
}
