// MARK 2026-10-28: 매출탭 자동갱신(드라이브 "전체매출" 파일 가져오기) 상태 — 새벽 4:00 · 오전 9:30 두 번.
// 용인(팩토리아울렛 용인점)·무신사 매출은 오전에 들어오므로, 9:30 갱신 때 "어제 용인 매출이 들어왔는지" 확인해서
// 매출탭 상단 배너로 보여줍니다(안 들어왔으면 "용인 업데이트 확인필요!!!").
//   로그 시트(MARK_DB) "매출탭_자동갱신_로그": [실행시각(KST), 구분, 성공, 오류, 확인일, 용인매출, 무신사매출, 반영행수]

import { getDbSheetId, ensureSheetExistsById, appendValuesById, getSheetValuesById } from "./googleSheets";
import { readSalesSummarySnapshot } from "./dataBuilder";

const LOG_SHEET = "매출탭_자동갱신_로그";
const LOG_HEADER = ["실행시각", "구분", "성공", "오류", "확인일", "용인매출", "무신사매출", "반영행수"];

const t = (v: any) => String(v ?? "").trim();
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function kstNowParts() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), hhmm: iso.slice(11, 16), label: `${iso.slice(0, 10)} ${iso.slice(11, 16)}` };
}
function addDays(date: string, k: number) {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + k * 86400000).toISOString().slice(0, 10);
}

/** 자동 실행 시각(KST)으로 구분 이름 정하기 */
export function slotOf(hhmm: string) {
  if (hhmm < "07:00") return "04:00";
  if (hhmm >= "09:00" && hhmm < "11:00") return "09:30";
  return "자동";
}

/** date(기본: 어제) 용인·무신사 매출 합계 */
export async function checkLateStores(date?: string) {
  const checkDate = date || addDays(kstNowParts().date, -1);
  const { rows } = await readSalesSummarySnapshot();
  let yongin = 0, musinsa = 0, yonginRow = false;
  for (const r of rows) {
    if (r.date !== checkDate) continue;
    if (r.storeName.includes("용인")) {
      yongin += n(r.amount);
      yonginRow = true;
    }
    if (r.storeName.includes("무신사")) musinsa += n(r.amount);
  }
  return { checkDate, yongin, musinsa, yonginRow, yonginOk: yongin !== 0 };
}

export async function logRefreshRun(entry: { slot: string; ok: boolean; error?: string; checkDate?: string; yongin?: number; musinsa?: number; newRowCount?: number }) {
  const dbId = getDbSheetId();
  await ensureSheetExistsById(dbId, LOG_SHEET, LOG_HEADER);
  await appendValuesById(dbId, `'${LOG_SHEET}'!A:H`, [
    [kstNowParts().label, entry.slot, entry.ok ? "Y" : "N", t(entry.error).slice(0, 300), entry.checkDate || "", n(entry.yongin), n(entry.musinsa), n(entry.newRowCount)],
  ]);
}

export type RefreshRun = { at: string; slot: string; ok: boolean; error: string; checkDate: string; yongin: number; musinsa: number; newRowCount: number };

async function readRecentRuns(limit = 30): Promise<RefreshRun[]> {
  const rows = await getSheetValuesById(getDbSheetId(), LOG_SHEET, "A2:H5000").catch(() => [] as any[]);
  return rows
    .filter((r) => r && t(r[0]))
    .slice(-limit)
    .map((r) => ({ at: t(r[0]), slot: t(r[1]), ok: t(r[2]) === "Y", error: t(r[3]), checkDate: t(r[4]), yongin: n(r[5]), musinsa: n(r[6]), newRowCount: n(r[7]) }))
    .reverse();
}

/**
 * 배너 상태:
 *  - "pending": 오늘 9:30 갱신 전 → "[용인, 무신사 매출 업데이트 전 · 9:30 자동업데이트예정]"
 *  - "yonginMissing": 9:30 갱신 후 어제 용인 매출 없음 → "용인 업데이트 확인필요!!!"
 *  - "ok": 9:30 갱신 후 용인 매출 확인됨
 * 용인 여부는 저장된 매출탭 데이터를 지금 다시 확인(수동으로 다시 가져오면 바로 반영)
 */
export async function getRefreshStatus() {
  const now = kstNowParts();
  const [runs, live] = await Promise.all([readRecentRuns(), checkLateStores()]);
  const todayRuns = runs.filter((r) => r.at.slice(0, 10) === now.date);
  const after930 = todayRuns.find((r) => r.ok && r.at.slice(11, 16) >= "09:30");
  const lastOk = runs.find((r) => r.ok) || null;
  let phase: "pending" | "yonginMissing" | "ok";
  if (live.yonginOk) phase = after930 || now.hhmm >= "09:30" ? "ok" : "pending";
  // 9:30 갱신이 10시까지 기록이 없으면(실패/지연) 기다리지 않고 확인필요로 띄움
  else phase = after930 || now.hhmm >= "10:00" ? "yonginMissing" : "pending";
  return {
    now: now.label,
    phase,
    check: live,
    after930: after930 || null,
    lastOk,
    todayRuns,
  };
}
