import { NextResponse } from "next/server";
import {
  appendValuesById,
  ensureSheetExistsById,
  getDbSheetId,
  getHistorySheetId,
  getManySheetValuesById,
  getSheetValuesById,
  getSpreadsheetTitlesById,
} from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SOURCE_CANDIDATES = [
  "스타일별 채널별 입고/판매/재고현황",
  "스타일별채널별입고판매재고현황",
  "입고/판매/재고현황",
  "입고판매재고현황",
];

const HISTORY_SHEET = "Daily_Sales_History";

// MARK 4.90 Daily Snapshot V2
// 원본 전체 7만행을 저장하지 않고,
// 일간판매가 발생한 행만 점포+스타일 단위로 집계 저장합니다.
// 프로모션/RT 성과 분석에 필요한 최소 핵심 필드만 보존합니다.
const HISTORY_HEADER = [
  "일자",
  "점포",
  "스타일",
  "스타일명",
  "판매수량",
  "판매금액",
  "저장시각",
  "source_sheet",
  "skuRowCount",
];

function text(v: any) {
  return String(v ?? "").trim();
}

function num(v: any) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/,/g, "").replace(/%/g, "").replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSheetName(name: string) {
  return String(name || "").replace(/[\\/\s_\-·.()]/g, "").trim();
}

function pickNormalizedTitle(titles: string[], candidates: string[], fallback: string) {
  const normalized = titles.map((title) => ({ title, norm: normalizeSheetName(title) }));
  for (const candidate of candidates) {
    const c = normalizeSheetName(candidate);
    const exact = normalized.find((x) => x.title === candidate || x.norm === c);
    if (exact) return exact.title;
  }
  for (const candidate of candidates) {
    const c = normalizeSheetName(candidate);
    const partial = normalized.find((x) => x.norm.includes(c) || c.includes(x.norm));
    if (partial) return partial.title;
  }
  return fallback;
}

function findHeaderRow(rows: any[][], labels: string[]) {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const joined = (rows[r] || []).map(text).join("|").replace(/\s/g, "");
    if (labels.every((label) => joined.includes(label.replace(/\s/g, "")))) return r;
  }
  return -1;
}

function findCol(row: any[], labels: string[], fallback = -1) {
  const normalized = (row || []).map((v) => text(v).replace(/\s/g, ""));
  for (const label of labels) {
    const target = label.replace(/\s/g, "");
    const idx = normalized.findIndex((v) => v === target || v.includes(target));
    if (idx >= 0) return idx;
  }
  return fallback;
}

function todayKST() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value || "0000";
  const m = parts.find((p) => p.type === "month")?.value || "00";
  const d = parts.find((p) => p.type === "day")?.value || "00";
  return `${y}-${m}-${d}`;
}

function nowKST() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function normalizeDateKey(value: any) {
  const s = text(value);
  if (!s) return todayKST();

  const m = s.match(/(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;

  const korean = s.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (korean) return `${korean[1]}-${String(korean[2]).padStart(2, "0")}-${String(korean[3]).padStart(2, "0")}`;

  return s;
}

function parseDailyRows(rows: any[][], snapshotDate: string, sourceSheet: string) {
  const headerRow = findHeaderRow(rows, ["채널명", "스타일"]);
  const header = headerRow >= 0 ? rows[headerRow] || [] : rows[0] || [];
  const startRow = headerRow >= 0 ? headerRow + 1 : 1;

  const storeCol = findCol(header, ["채널명", "점포", "점포명", "매장", "유통몰채널"], 4);
  const styleCol = findCol(header, ["스타일", "품번"], 5);
  const productCol = findCol(header, ["스타일명", "상품명"], 6);

  // 일간 스냅샷은 반드시 일간판매/일간판매금액을 우선 사용합니다.
  // 주간판매/누적판매/재고 컬럼을 잘못 잡으면 7만행 전체가 저장될 수 있습니다.
  const dailyQtyCol = findCol(header, ["일간판매"], 9);
  const dailyAmountCol = findCol(header, ["일간판매금액"], 14);

  const savedAt = nowKST();
  const grouped = new Map<string, any>();

  for (const row of rows.slice(startRow)) {
    const storeName = text(row[storeCol]);
    const styleCode = text(row[styleCol]);
    const productName = text(row[productCol]);
    const qty = num(row[dailyQtyCol]);
    const amount = num(row[dailyAmountCol]);

    if (!storeName || !styleCode || !productName) continue;
    if (`${storeName}${styleCode}${productName}`.includes("합계")) continue;

    // 핵심: 판매 발생 건만 저장합니다.
    // 판매수량/판매금액이 모두 0이면 프로모션/RT 성과 분석에 필요 없는 행이므로 제외합니다.
    if (!qty && !amount) continue;

    const key = `${snapshotDate}__${storeName}__${styleCode}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        snapshotDate,
        storeName,
        styleCode,
        productName,
        qty: 0,
        amount: 0,
        skuRowCount: 0,
      });
    }

    const item = grouped.get(key);
    item.qty += qty;
    item.amount += amount;
    item.skuRowCount += 1;
    if (!item.productName && productName) item.productName = productName;
  }

  return Array.from(grouped.values()).map((item) => [
    item.snapshotDate,
    item.storeName,
    item.styleCode,
    item.productName,
    item.qty,
    item.amount,
    savedAt,
    sourceSheet,
    item.skuRowCount,
  ]);
}

async function saveDailySalesSnapshot(snapshotDate: string) {
  const dbId = getDbSheetId();
  const historyId = getHistorySheetId();

  const dbTitles = await getSpreadsheetTitlesById(dbId);
  const sourceSheet = pickNormalizedTitle(dbTitles, SOURCE_CANDIDATES, SOURCE_CANDIDATES[0]);

  if (!dbTitles.includes(sourceSheet)) {
    throw new Error(`MARK_DB에서 일간 원본 시트를 찾지 못했습니다: ${SOURCE_CANDIDATES.join(", ")}`);
  }

  await ensureSheetExistsById(historyId, HISTORY_SHEET, HISTORY_HEADER);

  const values = await getManySheetValuesById(dbId, [sourceSheet], "A:AZ");
  const parsedRows = parseDailyRows(values[sourceSheet] || [], snapshotDate, sourceSheet);

  if (!parsedRows.length) {
    return {
      ok: true,
      savedRows: 0,
      snapshotDate,
      sourceSheet,
      message: "판매 발생 데이터가 없어 저장하지 않았습니다.",
    };
  }

  const existing = await getSheetValuesById(historyId, HISTORY_SHEET, "A:C").catch(() => []);
  const existingKeys = new Set(
    existing.slice(1).map((row) => `${text(row[0])}__${text(row[1])}__${text(row[2])}`)
  );

  const rowsToAppend = parsedRows.filter((row) => {
    const key = `${text(row[0])}__${text(row[1])}__${text(row[2])}`;
    return !existingKeys.has(key);
  });

  if (rowsToAppend.length) {
    await appendValuesById(historyId, `'${HISTORY_SHEET}'!A:I`, rowsToAppend);
  }

  return {
    ok: true,
    mode: "sales-only-store-style-aggregated",
    snapshotDate,
    sourceSheet,
    parsedRows: parsedRows.length,
    savedRows: rowsToAppend.length,
    skippedRows: parsedRows.length - rowsToAppend.length,
    message: rowsToAppend.length
      ? "Daily Sales History 저장 완료: 판매 발생 건만 점포+스타일 단위로 집계했습니다."
      : "이미 저장된 일자/점포/스타일 데이터입니다.",
  };
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

    const url = new URL(req.url);
    const snapshotDate = normalizeDateKey(url.searchParams.get("date") || todayKST());
    const result = await saveDailySalesSnapshot(snapshotDate);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("Auto daily sales snapshot failed:", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "Daily Sales History 저장 실패",
    }, { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const snapshotDate = normalizeDateKey(body.date || body.snapshotDate || todayKST());
    const result = await saveDailySalesSnapshot(snapshotDate);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("Manual daily sales snapshot failed:", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "Daily Sales History 수동 저장 실패",
    }, { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
