// MARK 2026-10-20: RT 참고자료 ① — "전주·전전주 매장별 판매" 업로드 스냅샷.
// RT는 주초에 진행하므로, ERP에서 내려받은 채널×스타일(또는 채널×SKU) 기간판매 파일(기간판매1=전주,
// 기간판매2=전전주)을 업로드해두면 RT 계산의 매장별 판매와 전사 TOP20을 이 파일 기준으로 계산합니다.
// (업로드가 없거나 오래됐으면 예전처럼 Daily_Sales_History 최근 7+7일로 계산)
//
// MARK 2026-10-20(2): SKU 방식 RT(재고MD 로직)를 위해 칼라/사이즈 단위 파일(재고MD 엑셀의 "매장재고 DB"와
// 같은 ERP 보고서)도 받습니다. 칼라/사이즈가 있으면 SKU 단위, 없으면 예전처럼 스타일 단위로 저장합니다.
//
// 저장: MARK_DB "RT_주간판매_스냅샷"
//   [채널코드, 채널명, 스타일, 스타일명, 칼라, 사이즈, 재고, 누계판매, 전주수량, 전주금액, 전전주수량, 전전주금액]
//   "RT_주간판매_스냅샷_메타" — [업로드일시, 행수, 원본파일명, 전주기간, 전전주기간, 형식(sku|style)]
// (예전 8열 형식 [채널코드,채널명,스타일,스타일명,전주수량,전주금액,전전주수량,전전주금액]도 그대로 읽힙니다)

import {
  getDbSheetId,
  ensureSheetExistsById,
  safeReplaceSheetValuesById,
  getSheetValuesById,
  updateValuesById,
  clearRangeById,
  ensureGridRowsById,
  getSheetRowCountById,
} from "./googleSheets";

const SHEET = "RT_주간판매_스냅샷";
const META_SHEET = "RT_주간판매_스냅샷_메타";
const HEADER = ["채널코드", "채널명", "스타일", "스타일명", "칼라", "사이즈", "재고", "누계판매", "전주수량", "전주금액", "전전주수량", "전전주금액"];
const META_HEADER = ["업로드일시", "행수", "원본파일명", "전주기간", "전전주기간", "형식"];

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

export type RtWeeklySalesMeta = { uploadedAt: string; rowCount: number; fileName: string; period1: string; period2: string; format: "sku" | "style" };
export type RtWeeklySalesRow = {
  channelCode: string;
  storeName: string;
  styleCode: string;
  productName: string;
  color: string;
  size: string;
  stock: number;
  cumQty: number;
  w1Qty: number;
  w1Amount: number;
  w2Qty: number;
  w2Amount: number;
};

/** 12열 표준 행으로 정리 (입력은 12열 SKU 형식) */
function cleanRows(rows: any[][]) {
  return (rows || [])
    .map((r) => [t(r[0]), t(r[1]), t(r[2]), t(r[3]), t(r[4]), t(r[5]), n(r[6]), n(r[7]), n(r[8]), n(r[9]), n(r[10]), n(r[11])])
    .filter((r) => r[1] && r[2]);
}

async function writeMeta(rowCount: number, meta: { fileName?: string; period1?: string; period2?: string; format?: string }) {
  const dbId = getDbSheetId();
  await ensureSheetExistsById(dbId, META_SHEET, META_HEADER);
  const uploadedAt = nowKST();
  await safeReplaceSheetValuesById(dbId, META_SHEET, [META_HEADER, [uploadedAt, rowCount, t(meta.fileName), t(meta.period1), t(meta.period2), meta.format === "sku" ? "sku" : "style"]]);
  return uploadedAt;
}

/** 한 번에 저장(작은 파일) */
export async function saveRtWeeklySales(rows: any[][], meta: { fileName?: string; period1?: string; period2?: string; format?: string }) {
  const clean = cleanRows(rows);
  if (!clean.length) throw new Error("업로드할 판매 데이터가 없습니다. 채널명/스타일/기간판매 열을 확인해주세요.");
  const dbId = getDbSheetId();
  await ensureSheetExistsById(dbId, SHEET, HEADER);
  await safeReplaceSheetValuesById(dbId, SHEET, [HEADER, ...clean]);
  const uploadedAt = await writeMeta(clean.length, meta);
  return { ok: true, rowCount: clean.length, uploadedAt, period1: t(meta.period1), period2: t(meta.period2) };
}

/** 청크 저장(SKU 파일처럼 큰 경우): startRow=2부터 이어서 → finish */
export async function saveRtWeeklySalesChunk(rows: any[][], startRow: number) {
  const clean = cleanRows(rows);
  if (!clean.length) return { ok: true, written: 0 };
  if (!Number.isInteger(startRow) || startRow < 2) throw new Error("startRow는 2 이상이어야 합니다.");
  const dbId = getDbSheetId();
  if (startRow === 2) {
    await ensureSheetExistsById(dbId, SHEET, HEADER);
    await updateValuesById(dbId, `'${SHEET}'!A1:L1`, [HEADER]);
  }
  await ensureGridRowsById(dbId, SHEET, startRow + clean.length - 1);
  await updateValuesById(dbId, `'${SHEET}'!A${startRow}`, clean);
  return { ok: true, written: clean.length };
}

export async function finishRtWeeklySales(totalRows: number, meta: { fileName?: string; period1?: string; period2?: string; format?: string }) {
  if (!Number.isInteger(totalRows) || totalRows < 1) throw new Error("totalRows가 올바르지 않습니다.");
  const dbId = getDbSheetId();
  const lastRow = totalRows + 1;
  const tail = await getSheetValuesById(dbId, SHEET, `A${lastRow}:B${lastRow}`).catch(() => [] as any[]);
  if (!t(tail?.[0]?.[1])) throw new Error(`마지막 행(${lastRow})이 비어 있어요 — 업로드가 덜 된 것 같아요. 다시 시도해주세요.`);
  const gridRows = await getSheetRowCountById(dbId, SHEET).catch(() => 0);
  if (gridRows > lastRow) await clearRangeById(dbId, SHEET, `A${lastRow + 1}:L${gridRows}`);
  // 예전 8열 형식 데이터가 오른쪽(I~L)에 남지 않도록 헤더 행 전체를 표준 헤더로 맞춥니다(위 chunk에서 이미 씀)
  const uploadedAt = await writeMeta(totalRows, meta);
  return { ok: true, rowCount: totalRows, uploadedAt, period1: t(meta.period1), period2: t(meta.period2) };
}

export async function getRtWeeklySalesMeta(): Promise<RtWeeklySalesMeta | null> {
  const rows = await getSheetValuesById(getDbSheetId(), META_SHEET, "A2:F2").catch(() => [] as any[]);
  const r = rows[0];
  if (!r || !t(r[0])) return null;
  return { uploadedAt: t(r[0]), rowCount: n(r[1]), fileName: t(r[2]), period1: t(r[3]), period2: t(r[4]), format: t(r[5]) === "sku" ? "sku" : "style" };
}

export async function readRtWeeklySales(): Promise<{ rows: RtWeeklySalesRow[]; meta: RtWeeklySalesMeta | null }> {
  const meta = await getRtWeeklySalesMeta();
  if (!meta) return { rows: [], meta: null };
  const data = await getSheetValuesById(getDbSheetId(), SHEET, "A1:L120000");
  const header = (data[0] || []).map(t);
  const isSkuLayout = header[4] === "칼라";
  const rows = (data || [])
    .slice(1)
    .filter((r) => r && t(r[1]) && t(r[2]))
    .map((r) =>
      isSkuLayout
        ? { channelCode: t(r[0]), storeName: t(r[1]), styleCode: t(r[2]), productName: t(r[3]), color: t(r[4]), size: t(r[5]), stock: n(r[6]), cumQty: n(r[7]), w1Qty: n(r[8]), w1Amount: n(r[9]), w2Qty: n(r[10]), w2Amount: n(r[11]) }
        : { channelCode: t(r[0]), storeName: t(r[1]), styleCode: t(r[2]), productName: t(r[3]), color: "", size: "", stock: 0, cumQty: 0, w1Qty: n(r[4]), w1Amount: n(r[5]), w2Qty: n(r[6]), w2Amount: n(r[7]) }
    );
  return { rows, meta: { ...meta, format: isSkuLayout && meta.format === "sku" ? "sku" : "style" } };
}

/** "2026-10-12~2026-10-18" → 끝 날짜 */
export function periodEnd(period: string) {
  const m = String(period || "").match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
  return m ? m[2] : "";
}
