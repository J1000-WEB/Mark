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

    // MARK 2026-09-22: "Your input contains more than the maximum of 50000 characters in a
    // single cell" 에러 수정 — chunkBySize([payload])처럼 styles/suggestions/priceSuggestions를
    // 전부 하나로 뭉친 객체 "1개"를 넘기면, chunkBySize는 "항목 사이"에서만 나누기 때문에
    // (항목 1개짜리 리스트라 나눌 자리가 없음) 그 통짜 객체가 40,000자를 넘는 순간 그대로
    // 하나의 셀에 다 들어가버려서 구글시트 셀당 50,000자 한도를 넘겼습니다. styles/suggestions/
    // priceSuggestions를 각각 원소 단위(품번 1개, 제안 1건)의 작은 "항목"으로 쪼개서 넘기면,
    // chunkBySize가 원래 의도대로 여러 행(part)에 나눠 담습니다(GET 쪽은 이미 여러 part를
    // 순서대로 합치도록 되어 있어서 그대로 동작합니다).
    const styleItems = (styles || []).map((s: any) => ({ styles: [s], suggestions: [], priceSuggestions: [] }));
    const suggestionItems = (suggestions || []).map((s: any) => ({ styles: [], suggestions: [s], priceSuggestions: [] }));
    const priceSuggestionItems = (priceSuggestions || []).map((s: any) => ({ styles: [], suggestions: [], priceSuggestions: [s] }));
    const chunks = chunkBySize([...styleItems, ...suggestionItems, ...priceSuggestionItems]);

    const rows = chunks.map((chunk, i) => [weekLabel, savedAt, i + 1, JSON.stringify(chunk)]);
    await safeReplaceSheetValuesById(spreadsheetId, SHEET_NAME, [HEADER, ...rows]);

    return NextResponse.json({ ok: true, weekLabel, savedAt, styleCount: styles.length });
  } catch (error: any) {
    console.error("sales-data-weekly POST failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "저장 실패" }, { status: 500 });
  }
}

// MARK 2026-09-14: 다른 데이터 라우트들과 동일하게 no-store 명시 (auto-realtime-hourly-snapshot
// 라우트에서 이 헤더가 빠지면 Vercel 엣지가 GET 응답을 캐시해버리는 걸 확인했습니다 — 여기서는
// 새로 업로드(POST)해도 탭을 열 때 캐시된 지난주 데이터가 계속 보일 수 있는 문제로 이어집니다).
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  try {
    const spreadsheetId = getDbSheetId();
    const rows = await getSheetValuesById(spreadsheetId, SHEET_NAME, "A:D").catch(() => []);
    const data = rows.slice(1).filter((r) => r?.[0]);
    if (!data.length) return NextResponse.json({ ok: true, data: null }, { headers: NO_STORE_HEADERS });

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

    return NextResponse.json({ ok: true, data: { weekLabel, savedAt, styles, suggestions, priceSuggestions } }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("sales-data-weekly GET failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
