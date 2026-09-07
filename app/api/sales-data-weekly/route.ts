import { NextResponse } from "next/server";
import { getDbSheetId, ensureSheetExistsById, getSheetValuesById, safeReplaceSheetValuesById } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const revalidate = 0;

// MARK: 주간판매데이터(품번 시트 통째로) 업로드 → 클라이언트에서 제안까지 계산한 결과를
// 저장해뒀다가, 다음에 탭을 열 때 다시 계산하지 않고 바로 보여주기 위한 저장소입니다.
// 셀 용량 문제를 피하려고 청크(chunk)로 나눠서 저장합니다(salesDataSnapshot.ts와 같은 패턴).

const SHEET_NAME = "WeeklySalesReport";
const HEADER = ["weekLabel", "savedAt", "part", "json"];
const MAX_CELL_CHARS = 40000;

function chunkBySize(items: any[], maxChars = MAX_CELL_CHARS): any[][] {
  const chunks: any[][] = [];
  let current: any[] = [];
  let currentLen = 2;
  for (const item of items) {
    const len = JSON.stringify(item).length + 1;
    if (current.length && currentLen + len > maxChars) {
      chunks.push(current);
      current = [];
      currentLen = 2;
    }
    current.push(item);
    currentLen += len;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { weekLabel, styles, suggestions, priceSuggestions } = body || {};
    if (!weekLabel || !Array.isArray(styles)) {
      return NextResponse.json({ ok: false, error: "weekLabel/styles가 필요합니다." }, { status: 400 });
    }

    const spreadsheetId = getDbSheetId();
    await ensureSheetExistsById(spreadsheetId, SHEET_NAME, HEADER);

    const savedAt = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const payload = { styles, suggestions: suggestions || [], priceSuggestions: priceSuggestions || [] };
    const chunks = chunkBySize([payload]); // 보통 한 덩어리로 충분하지만, 커지면 자동으로 나뉨

    const rows = chunks.map((chunk, i) => [weekLabel, savedAt, i + 1, JSON.stringify(chunk)]);
    await safeReplaceSheetValuesById(spreadsheetId, SHEET_NAME, [HEADER, ...rows]);

    return NextResponse.json({ ok: true, weekLabel, savedAt, styleCount: styles.length });
  } catch (error: any) {
    console.error("sales-data-weekly POST failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "저장 실패" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const spreadsheetId = getDbSheetId();
    const rows = await getSheetValuesById(spreadsheetId, SHEET_NAME, "A:D").catch(() => []);
    const data = rows.slice(1).filter((r) => r?.[0]);
    if (!data.length) return NextResponse.json({ ok: true, data: null });

    const weekLabel = String(data[0][0]);
    const savedAt = String(data[0][1]);
    const parts = data.sort((a, b) => Number(a[2]) - Number(b[2]));

    let styles: any[] = [];
    let suggestions: any[] = [];
    let priceSuggestions: any[] = [];
    for (const r of parts) {
      try {
        const chunk = JSON.parse(String(r[3] || "[]"));
        for (const payload of chunk) {
          styles = styles.concat(payload.styles || []);
          suggestions = suggestions.concat(payload.suggestions || []);
          priceSuggestions = priceSuggestions.concat(payload.priceSuggestions || []);
        }
      } catch {
        // 파싱 실패한 파트는 건너뜁니다
      }
    }

    return NextResponse.json({ ok: true, data: { weekLabel, savedAt, styles, suggestions, priceSuggestions } });
  } catch (error: any) {
    console.error("sales-data-weekly GET failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500 });
  }
}
