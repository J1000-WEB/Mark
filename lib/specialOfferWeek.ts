import { getSheetValuesById, batchUpdateValuesById } from "@/lib/googleSheets";
import { normalizeStoreKey } from "@/lib/dataBuilder";

export const SPECIAL_OFFER_SHEET_ID = "1KfiwexgTnPIrBaV4G7B2c_aXtvhvUoCnjyXAxc_cZN4";
export const SPECIAL_OFFER_SHEET_NAME = "세부일정";

// 7월 1일부터만 자동 반영합니다(그 이전 수기입력값은 절대 건드리지 않음).
export const AUTO_ACTUALS_START_DATE = "2026-07-01";

function text(v: any) {
  return String(v ?? "").trim();
}

function parseDate(v: any) {
  const s = text(v).replace(/[./]/g, "-").slice(0, 10);
  const parts = s.split("-").map((x) => Number(x));
  if (parts.length >= 3 && parts.every((x) => Number.isFinite(x))) {
    const y = parts[0] < 100 ? parts[0] + 2000 : parts[0];
    return `${y}-${String(parts[1]).padStart(2, "0")}-${String(parts[2]).padStart(2, "0")}`;
  }
  const d = new Date(text(v));
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type DailyFlatRow = { date: string; storeName: string; amount: number };

// 헤더 텍스트로 각 컬럼을 찾습니다(고정 열번호 대신 열+헤더 교차검증).
function findColumn(header: string[], labels: string[], fallback: number) {
  for (const label of labels) {
    const idx = header.findIndex((h) => h.replace(/\s/g, "").includes(label.replace(/\s/g, "")));
    if (idx >= 0) return idx;
  }
  return fallback;
}

export async function readSpecialOfferSheet() {
  const rows = await getSheetValuesById(SPECIAL_OFFER_SHEET_ID, SPECIAL_OFFER_SHEET_NAME, "A:T");
  const debug: any = { sheetId: SPECIAL_OFFER_SHEET_ID, sheetName: SPECIAL_OFFER_SHEET_NAME, totalRowsRead: rows?.length || 0 };

  if (!rows || !rows.length) {
    debug.error = "세부일정 시트에서 데이터를 한 줄도 못 읽었습니다 (권한 또는 시트명 확인 필요).";
    return { rows: [] as any[][], headerRowIdx: -1, storeCol: -1, startCol: -1, endCol: -1, completedCol: -1, resultCol: -1, debug };
  }

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const joined = (rows[i] || []).map((v) => text(v)).join("|");
    if ((joined.includes("점포명") || joined.includes("매장명")) && joined.includes("시작일")) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx < 0) {
    debug.error = "헤더 행(점포명/시작일)을 찾지 못했습니다.";
    debug.first5Rows = rows.slice(0, 5);
    return { rows, headerRowIdx: -1, storeCol: -1, startCol: -1, endCol: -1, completedCol: -1, resultCol: -1, debug };
  }

  const header = rows[headerRowIdx].map((v) => text(v));
  const storeCol = findColumn(header, ["점포명", "매장명"], 7);
  const startCol = findColumn(header, ["시작일"], 8);
  const endCol = findColumn(header, ["종료일"], 9);
  const completedCol = findColumn(header, ["완료유무", "완료"], 6);
  const resultCol = findColumn(header, ["실적"], 17);

  debug.headerRowIdx = headerRowIdx;
  debug.storeCol = storeCol;
  debug.startCol = startCol;
  debug.endCol = endCol;
  debug.resultCol = resultCol;

  return { rows, headerRowIdx, storeCol, startCol, endCol, completedCol, resultCol, debug };
}

export function computeStoreSalesForPeriod(dailyFlatRows: DailyFlatRow[], storeName: string, startDate: string, endDate: string) {
  const storeKey = normalizeStoreKey(storeName);
  return dailyFlatRows
    .filter((r) => r.date >= startDate && r.date <= endDate && normalizeStoreKey(r.storeName) === storeKey)
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);
}

// 판매전체상 화면용: 이벤트 목록 + 매칭된 매출.
export async function buildSpecialOfferEvents(dailyFlatRows: DailyFlatRow[]) {
  const { rows, headerRowIdx, storeCol, startCol, endCol, completedCol, debug } = await readSpecialOfferSheet();
  const events: any[] = [];
  if (headerRowIdx < 0) return { events, debug };

  let skippedNoStoreOrDate = 0;

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;

    const storeName = text(row[storeCol]);
    const startDate = parseDate(row[startCol]);
    const endDate = parseDate(row[endCol]) || startDate;
    const completed = text(row[completedCol]);
    if (!storeName || !startDate) {
      skippedNoStoreOrDate++;
      continue;
    }

    const salesAmount = computeStoreSalesForPeriod(dailyFlatRows, storeName, startDate, endDate);

    events.push({
      id: `sow-${i}`,
      startDate,
      endDate,
      largeCategory: "스페셜오퍼위크",
      category: "special_offer_week",
      categoryLabel: "스페셜오퍼위크",
      person: "",
      rowKey: "special_offer_week",
      group: completed,
      content: storeName,
      title: storeName,
      displayTitle: storeName,
      storeName,
      salesAmount,
      raw: { startDate: row[startCol], endDate: row[endCol], storeName: row[storeCol], completed: row[completedCol] },
    });
  }

  debug.skippedNoStoreOrDate = skippedNoStoreOrDate;
  debug.eventCount = events.length;

  return { events, debug };
}

// MARK 6.10.2: 7월 1일 이후 이벤트는 R열(실적)을 매일 자동으로 최신 매출로 갱신합니다.
// 완료유무와 무관하게 갱신하되, 2026-07-01 이전 이벤트(과거 수기입력)는 절대 건드리지 않습니다.
export async function updateSpecialOfferActuals(dailyFlatRows: DailyFlatRow[]) {
  const { rows, headerRowIdx, storeCol, startCol, endCol, resultCol, debug } = await readSpecialOfferSheet();
  if (headerRowIdx < 0) return { updated: 0, debug };

  const escapedSheet = SPECIAL_OFFER_SHEET_NAME.replace(/'/g, "''");
  const colLetter = columnIndexToLetter(resultCol);

  const updates: { range: string; values: any[][] }[] = [];

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;

    const storeName = text(row[storeCol]);
    const startDate = parseDate(row[startCol]);
    const endDate = parseDate(row[endCol]) || startDate;
    if (!storeName || !startDate) continue;
    if (startDate < AUTO_ACTUALS_START_DATE) continue; // 과거는 절대 건드리지 않음

    const salesAmount = computeStoreSalesForPeriod(dailyFlatRows, storeName, startDate, endDate);
    const sheetRowNumber = i + 1; // rows는 0-based, 실제 시트 행은 1-based
    updates.push({ range: `'${escapedSheet}'!${colLetter}${sheetRowNumber}`, values: [[Math.round(salesAmount)]] });
  }

  if (updates.length) {
    await batchUpdateValuesById(SPECIAL_OFFER_SHEET_ID, updates);
  }

  debug.updatedCount = updates.length;
  return { updated: updates.length, debug };
}

function columnIndexToLetter(index: number) {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters || "R";
}
