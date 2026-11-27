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

/** date(기본: 어제) 용인·무신사 매출 합계
 *  MARK 2026-11-22 소천님: 무신사는 근무일(월~금, 공휴일 제외) 아침에만 ERP에 올라감 → 금·토·일(공휴일) 매출은 다음 근무일 아침에 한꺼번에.
 *  그래서 오늘이 쉬는 날이면 무신사는 확인 안 함(musinsaSkipped), 근무일이면 직전 근무일~어제 모든 날짜에 무신사 매출이 있는지 확인(월요일 = 금·토·일). */
export async function checkLateStores(date?: string) {
  const today = kstNowParts().date;
  const checkDate = date || addDays(today, -1);
  const { rows } = await readSalesSummarySnapshot();
  // MARK 2026-11-27 소천님: 무신사는 이제 매일 밤 10~12시에 받아 올림(주말 포함) → 매일 어제 하루만 확인
  const musinsaSkipped = false;
  const musinsaDates: string[] = [checkDate];
  let yongin = 0, musinsa = 0, yonginRow = false;
  const musinsaUpdated = new Set<string>(); // 매출(수량 또는 금액)이 들어온 무신사 매장(어제)
  const musinsaByDate = new Map<string, number>(); // 날짜별 매출 들어온 무신사 매장 수
  for (const r of rows) {
    if (r.storeName.includes("무신사") && musinsaDates.includes(r.date) && (n(r.amount) || n(r.qty))) musinsaByDate.set(r.date, (musinsaByDate.get(r.date) || 0) + 1);
    if (r.date !== checkDate) continue;
    if (r.storeName.includes("용인")) {
      yongin += n(r.amount);
      yonginRow = true;
    }
    if (r.storeName.includes("무신사")) {
      musinsa += n(r.amount);
      if (n(r.amount) || n(r.qty)) musinsaUpdated.add(r.storeName);
    }
  }
  // MARK 2026-11-02: 무신사는 매장이 작아 하루 0인 곳이 많음 → 무신사 매장 중 하나라도 들어와 있으면 "업데이트됨"으로 봄
  const musinsaMissingDates = musinsaSkipped ? [] : musinsaDates.filter((d) => !musinsaByDate.get(d));
  return {
    checkDate, yongin, musinsa, yonginRow, yonginOk: yongin !== 0,
    musinsaOk: musinsaSkipped || musinsaMissingDates.length === 0,
    musinsaUpdatedStores: musinsaUpdated.size, musinsaSkipped, musinsaDates, musinsaMissingDates,
  };
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
 *  - "pending": 오늘 9:30 갱신 전 → "[용인, 무신사 매출 업데이트 전 · 9:20 자동업데이트예정]"
 *  - "missing": 9:30 갱신 후 어제 용인/무신사 매출 없음 → "용인·무신사 업데이트 확인필요!!!"
 *  - "ok": 9:30 갱신 후 용인 매출 확인됨
 * 용인 여부는 저장된 매출탭 데이터를 지금 다시 확인(수동으로 다시 가져오면 바로 반영)
 */
export async function getRefreshStatus() {
  const now = kstNowParts();
  const [runs, live] = await Promise.all([readRecentRuns(), checkLateStores()]);
  const todayRuns = runs.filter((r) => r.at.slice(0, 10) === now.date);
  // MARK 2026-11-27: 무신사를 밤에 올리므로 새벽 4:00 갱신이면 다 들어와 있어야 함 → 오늘 4:00 갱신(또는 그 뒤 갱신)이 있으면 바로 판정, 9:20은 빠진 날 다시 가져오기
  const after930 = todayRuns.find((r) => r.ok && r.at.slice(11, 16) >= "09:20");
  const afterDawn = todayRuns.find((r) => r.ok && r.at.slice(11, 16) >= "03:50") || null;
  const lastOk = runs.find((r) => r.ok) || null;
  const missing: string[] = [];
  if (!live.yonginOk) missing.push("용인");
  if (!live.musinsaOk) missing.push("무신사");
  let phase: "pending" | "missing" | "ok";
  if (!missing.length) phase = "ok";
  else phase = afterDawn || now.hhmm >= "05:00" ? "missing" : "pending";
  return {
    now: now.label,
    phase,
    missing,
    check: live,
    after930: after930 || null,
    afterDawn,
    lastOk,
    todayRuns,
  };
}
