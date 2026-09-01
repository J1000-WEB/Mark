import { NextResponse } from "next/server";
import { getDbSheetId, ensureSheetExistsById, getSheetValuesById, safeReplaceSheetValuesById } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const revalidate = 0;

// MARK: 주간판매데이터(품번 시트 통째로) 업로드 → 클라이언트에서 제안까지 계산한 결과를
// 저장해뒀다가, 다음에 탭을 열 때 다시 계산하지 않고 바로 보여주기 위한 저장소입니다.
//
// MARK 2026-09: 처음 버전은 styles/suggestions/priceSuggestions를 통째로 객체 하나에
// 담아서 JSON으로 만든 다음 "그 객체 하나"를 기준으로 쪼개려고 했는데, 애초에 배열에
// 원소가 1개(그 큰 객체 자체)뿐이라 쪼개는 로직이 사실상 동작을 안 했습니다. 그 결과
// 품번 3000개 이상 담긴 거대한 JSON 문자열을 셀 하나에 그대로 넣으려다 구글시트의
// "셀 하나 5만자 제한"에 걸렸습니다. styles/suggestions/priceSuggestions 각각의
// "배열 안의 개별 항목" 단위로 쪼개도록 고쳤습니다(품번 하나하나를 기준으로 나눔).

const SHEET_NAME = "WeeklySalesReport";
const HEADER = ["weekLabel", "savedAt", "kind", "part", "json"];
const MAX_CELL_CHARS = 35000; // 5만자 제한보다 여유 있게

function chunkArrayBySize(items: any[], maxChars = MAX_CELL_CHARS): any[][] {
  const chunks: any[][] = [];
  let current: any[] = [];
  let currentLen = 2; // "[]" 여유분
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

    const styleChunks = chunkArrayBySize(styles);
    const suggestionChunks = chunkArrayBySize(suggestions || []);
    const priceChunks = chunkArrayBySize(priceSuggestions || []);

    const rows = [
      ...styleChunks.map((c, i) => [weekLabel, savedAt, "styles", i + 1, JSON.stringify(c)]),
      ...suggestionChunks.map((c, i) => [weekLabel, savedAt, "suggestions", i + 1, JSON.stringify(c)]),
      ...priceChunks.map((c, i) => [weekLabel, savedAt, "priceSuggestions", i + 1, JSON.stringify(c)]),
    ];

    await safeReplaceSheetValuesById(spreadsheetId, SHEET_NAME, [HEADER, ...rows]);

    return NextResponse.json({ ok: true, weekLabel, savedAt, styleCount: styles.length, totalRows: rows.length });
  } catch (error: any) {
    console.error("sales-data-weekly POST failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "저장 실패" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const spreadsheetId = getDbSheetId();
    const rows = await getSheetValuesById(spreadsheetId, SHEET_NAME, "A:E").catch(() => []);
    const data = rows.slice(1).filter((r) => r?.[0]);
    if (!data.length) return NextResponse.json({ ok: true, data: null });

    const weekLabel = String(data[0][0]);
    const savedAt = String(data[0][1]);

    function collect(kind: string) {
      const parts = data
        .filter((r) => String(r[2]) === kind)
        .sort((a, b) => Number(a[3]) - Number(b[3]));
      let result: any[] = [];
      for (const r of parts) {
        try {
          result = result.concat(JSON.parse(String(r[4] || "[]")));
        } catch {
          // 파싱 실패한 파트는 건너뜁니다
        }
      }
      return result;
    }

    const styles = collect("styles");
    const suggestions = collect("suggestions");
    const priceSuggestions = collect("priceSuggestions");

    return NextResponse.json({ ok: true, data: { weekLabel, savedAt, styles, suggestions, priceSuggestions } });
  } catch (error: any) {
    console.error("sales-data-weekly GET failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500 });
  }
}

