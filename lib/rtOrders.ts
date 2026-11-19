// MARK 2026-11-19: RT 지시 이력(ERP 이동 지시 현황 FSSPRD0040을 PC erp-agent fetch-rt-orders.js가 매일 받아 보냄).
// 저장 위치: MARK_DB "RT_지시이력". RT 성과(lib/rtRecovery.ts)는 여기를 1순위로 읽음 — 예전 MARK 메인 시트 RT_Result는
// 대시보드에서 승인한 것만 들어가서 재고MD님이 ERP에 직접 올린 RT가 빠졌음.
import { ensureSheetExistsById, getDbSheetId, getSheetValuesById, safeReplaceSheetValuesById } from "./googleSheets";

export const RT_ORDERS_SHEET = "RT_지시이력";
export const RT_ORDERS_HEADER = [
  "지시일", "차수", "보낼채널코드", "보낼채널", "받을채널코드", "받을채널", "스타일", "칼라", "사이즈",
  "지시량", "이행량", "이행상태", "이행일자", "확정일자", "미이행사유", "지시자", "비고", "받은시각",
];

const t = (v: any) => (v == null ? "" : String(v).trim());
const n = (v: any) => {
  const x = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};
export function normYmd(v: any) {
  const s = t(v).replace(/[^0-9]/g, "");
  return s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : "";
}

export type RtOrder = {
  date: string; seq: string; fromCode: string; from: string; toCode: string; to: string;
  style: string; color: string; size: string; ordQty: number; doneQty: number; status: string;
  doneDate: string; fixDate: string; reject: string; orderer: string; note: string;
};

/** PC가 보낸 기간[from,to]의 줄을 통째로 바꿔 끼움(이행상태가 며칠 뒤 바뀌므로 매일 최근 45일을 다시 받음) */
export async function saveRtOrders(fromRaw: string, toRaw: string, rows: any[][]) {
  const from = normYmd(fromRaw), to = normYmd(toRaw);
  if (!from || !to) throw new Error("기간(from/to)이 없어요.");
  const dbId = getDbSheetId();
  await ensureSheetExistsById(dbId, RT_ORDERS_SHEET, RT_ORDERS_HEADER);
  const existing = (await getSheetValuesById(dbId, RT_ORDERS_SHEET, "A2:R200000").catch(() => [] as any[][])) || [];
  const keep = existing.filter((r) => {
    const d = normYmd(r?.[0]);
    return d && (d < from || d > to);
  });
  const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
  const fresh = rows
    .map((r) => [
      normYmd(r[0]), t(r[1]), t(r[2]), t(r[3]), t(r[4]), t(r[5]), t(r[6]).toUpperCase(), t(r[7]), t(r[8]),
      n(r[9]), n(r[10]), t(r[11]), normYmd(r[12]), normYmd(r[13]), t(r[14]), t(r[15]), t(r[16]), stamp,
    ])
    .filter((r) => r[0] && r[0] >= from && r[0] <= to && r[6]);
  const all = [...keep, ...fresh].sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0));
  await safeReplaceSheetValuesById(dbId, RT_ORDERS_SHEET, [RT_ORDERS_HEADER, ...all]);
  return { saved: fresh.length, replaced: existing.length - keep.length, total: all.length };
}

export async function readRtOrders(fromDate: string, toDate: string): Promise<{ rows: RtOrder[]; coverFrom: string; coverTo: string }> {
  const dbId = getDbSheetId();
  const vals = (await getSheetValuesById(dbId, RT_ORDERS_SHEET, "A2:R200000").catch(() => [] as any[][])) || [];
  let coverFrom = "", coverTo = "";
  const rows: RtOrder[] = [];
  for (const r of vals) {
    const date = normYmd(r?.[0]);
    if (!date) continue;
    if (!coverFrom || date < coverFrom) coverFrom = date;
    if (!coverTo || date > coverTo) coverTo = date;
    if (date < fromDate || date > toDate) continue;
    rows.push({
      date, seq: t(r[1]), fromCode: t(r[2]), from: t(r[3]), toCode: t(r[4]), to: t(r[5]),
      style: t(r[6]).toUpperCase(), color: t(r[7]), size: t(r[8]), ordQty: n(r[9]), doneQty: n(r[10]),
      status: t(r[11]), doneDate: normYmd(r[12]), fixDate: normYmd(r[13]), reject: t(r[14]), orderer: t(r[15]), note: t(r[16]),
    });
  }
  return { rows, coverFrom, coverTo };
}
