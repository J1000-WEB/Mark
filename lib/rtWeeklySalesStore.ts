// MARK 2026-10-20: RT 참고자료 ① — "전주·전전주 매장별 판매" 업로드 스냅샷.
// RT는 주초에 진행하므로, ERP에서 내려받은 채널×스타일 기간판매 파일(기간판매1=전주, 기간판매2=전전주)을
// 업로드해두면 RT 계산의 매장별 판매(금주/전주 자리)와 전사 TOP20을 이 파일 기준으로 계산합니다.
// (업로드가 없거나 오래됐으면 예전처럼 Daily_Sales_History 최근 7+7일로 계산)
//
// 저장: MARK_DB "RT_주간판매_스냅샷" — [채널코드, 채널명, 스타일, 스타일명, 전주수량, 전주금액, 전전주수량, 전전주금액]
//       "RT_주간판매_스냅샷_메타" — [업로드일시, 행수, 원본파일명, 전주기간, 전전주기간]

import { getDbSheetId, ensureSheetExistsById, safeReplaceSheetValuesById, getSheetValuesById } from "./googleSheets";

const SHEET = "RT_주간판매_스냅샷";
const META_SHEET = "RT_주간판매_스냅샷_메타";
const HEADER = ["채널코드", "채널명", "스타일", "스타일명", "전주수량", "전주금액", "전전주수량", "전전주금액"];
const META_HEADER = ["업로드일시", "행수", "원본파일명", "전주기간", "전전주기간"];

const t = (v: any) => String(v ?? "").trim();
const n = (v: any) => {
  const x = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};

function nowKST() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export type RtWeeklySalesMeta = { uploadedAt: string; rowCount: number; fileName: string; period1: string; period2: string };
export type RtWeeklySalesRow = { channelCode: string; storeName: string; styleCode: string; productName: string; w1Qty: number; w1Amount: number; w2Qty: number; w2Amount: number };

export async function saveRtWeeklySales(rows: any[][], meta: { fileName?: string; period1?: string; period2?: string }) {
  const clean = (rows || [])
    .map((r) => [t(r[0]), t(r[1]), t(r[2]), t(r[3]), n(r[4]), n(r[5]), n(r[6]), n(r[7])])
    .filter((r) => r[1] && r[2]);
  if (!clean.length) throw new Error("업로드할 판매 데이터가 없습니다. 채널명/스타일/기간판매 열을 확인해주세요.");
  const dbId = getDbSheetId();
  await ensureSheetExistsById(dbId, SHEET, HEADER);
  await ensureSheetExistsById(dbId, META_SHEET, META_HEADER);
  await safeReplaceSheetValuesById(dbId, SHEET, [HEADER, ...clean]);
  const uploadedAt = nowKST();
  await safeReplaceSheetValuesById(dbId, META_SHEET, [META_HEADER, [uploadedAt, clean.length, t(meta.fileName), t(meta.period1), t(meta.period2)]]);
  return { ok: true, rowCount: clean.length, uploadedAt, period1: t(meta.period1), period2: t(meta.period2) };
}

export async function getRtWeeklySalesMeta(): Promise<RtWeeklySalesMeta | null> {
  const rows = await getSheetValuesById(getDbSheetId(), META_SHEET, "A2:E2").catch(() => [] as any[]);
  const r = rows[0];
  if (!r || !t(r[0])) return null;
  return { uploadedAt: t(r[0]), rowCount: n(r[1]), fileName: t(r[2]), period1: t(r[3]), period2: t(r[4]) };
}

export async function readRtWeeklySales(): Promise<{ rows: RtWeeklySalesRow[]; meta: RtWeeklySalesMeta | null }> {
  const meta = await getRtWeeklySalesMeta();
  if (!meta) return { rows: [], meta: null };
  const data = await getSheetValuesById(getDbSheetId(), SHEET, "A2:H100000");
  const rows = (data || [])
    .filter((r) => r && t(r[1]) && t(r[2]))
    .map((r) => ({ channelCode: t(r[0]), storeName: t(r[1]), styleCode: t(r[2]), productName: t(r[3]), w1Qty: n(r[4]), w1Amount: n(r[5]), w2Qty: n(r[6]), w2Amount: n(r[7]) }));
  return { rows, meta };
}

/** "2026-10-12~2026-10-18" → 끝 날짜 */
export function periodEnd(period: string) {
  const m = String(period || "").match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
  return m ? m[2] : "";
}
