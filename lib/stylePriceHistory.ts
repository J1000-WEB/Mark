import { getDbSheetId, getSheetValuesById, ensureSheetExistsById, appendValuesById } from "@/lib/googleSheets";

// MARK 6.15: 일간 대시보드의 "판매금액"이 지금까지 "수량 × 정가"로 추정되고 있었는데,
// 실제로는 할인/프로모션 때문에 실제 판매금액과 차이가 났습니다.
// 대신 금주/전주 시트의 "실제판매금액 ÷ 실제판매수량 = 실제 평균단가"를 매주 계산해서
// 이 시트에 쌓아두고, 일간 대시보드는 매번 계산하지 않고 이 표를 조회만 합니다.
// (이 파일은 googleSheets만 의존합니다 — dataBuilder.ts의 실제 계산 로직과 순환 참조를
//  피하기 위해, 계산은 dataBuilder.ts의 captureWeeklyStylePrices()에서 하고 여기서는
//  저장/조회만 담당합니다.)

const STYLE_PRICE_SHEET = "Style_Price_History";
const STYLE_PRICE_HEADER = ["주차(월요일)", "품번수", "갱신일시", "상세JSON"];
const MAX_CELL_CHARS = 40000;

function text(v: any) {
  return String(v ?? "").trim();
}

function nowKST() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

// 오늘(KST) 기준 이번 주 월요일 날짜(YYYY-MM-DD)를 구합니다.
export function currentWeekMonday(): string {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const day = kst.getDay(); // 0=일 ... 1=월 ... 2=화
  const diffToMonday = day === 0 ? -6 : 1 - day; // 이번 주 월요일까지 며칠 이동해야 하는지
  const monday = new Date(kst);
  monday.setDate(kst.getDate() + diffToMonday);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
}

// 값이 너무 커지면(품번이 아주 많으면) 구글시트 셀 5만자 제한에 걸릴 수 있어 여러 줄로 나눕니다.
function chunkPriceMap(prices: Record<string, number>, maxChars = MAX_CELL_CHARS): Record<string, number>[] {
  const chunks: Record<string, number>[] = [];
  let current: Record<string, number> = {};
  let currentLen = 2;
  for (const [style, price] of Object.entries(prices)) {
    const entryLen = JSON.stringify({ [style]: price }).length;
    if (Object.keys(current).length && currentLen + entryLen > maxChars) {
      chunks.push(current);
      current = {};
      currentLen = 2;
    }
    current[style] = price;
    currentLen += entryLen;
  }
  if (Object.keys(current).length) chunks.push(current);
  return chunks;
}

// 이미 계산된 품번별 평균단가를 이번 주 스냅샷으로 저장합니다. (계산 자체는 호출부 책임)
export async function saveWeeklyStylePrices(prices: Record<string, number>) {
  const dbId = getDbSheetId();
  const weekKey = currentWeekMonday();

  await ensureSheetExistsById(dbId, STYLE_PRICE_SHEET, STYLE_PRICE_HEADER);
  const existing = await getSheetValuesById(dbId, STYLE_PRICE_SHEET, "A:D").catch(() => []);
  const alreadyCaptured = (existing.slice(1) || []).some((r) => text(r[0]) === weekKey);
  if (alreadyCaptured) {
    return { ok: true, skipped: true, weekKey, styleCount: Object.keys(prices).length };
  }

  const chunks = chunkPriceMap(prices);
  const savedAt = nowKST();
  const newRows = chunks.map((chunk) => [weekKey, Object.keys(chunk).length, savedAt, JSON.stringify(chunk)]);
  await appendValuesById(dbId, `'${STYLE_PRICE_SHEET}'!A:D`, newRows);

  return { ok: true, skipped: false, weekKey, styleCount: Object.keys(prices).length, rowsWritten: newRows.length };
}

// 특정 날짜 기준으로 적용할 "실제 평균단가" 맵을 가져옵니다.
// 그 날짜가 속한 주(월요일)에 딱 맞는 스냅샷이 없으면, 그 이전 가장 최근 스냅샷을 사용합니다.
export async function getStylePriceMap(dateKey: string): Promise<Map<string, number>> {
  const dbId = getDbSheetId();
  const rows = await getSheetValuesById(dbId, STYLE_PRICE_SHEET, "A:D").catch(() => []);
  const map = new Map<string, number>();
  if (!rows.length) return map;

  const body = rows.slice(1);
  const weeks = Array.from(new Set(body.map((r) => text(r[0])).filter(Boolean)));
  const eligible = weeks.filter((w) => w <= dateKey).sort();
  const targetWeek = eligible.length ? eligible[eligible.length - 1] : weeks.sort()[0];
  if (!targetWeek) return map;

  for (const row of body) {
    if (text(row[0]) !== targetWeek) continue;
    try {
      const obj = JSON.parse(text(row[3]) || "{}");
      for (const [style, price] of Object.entries(obj)) {
        map.set(style, Number(price));
      }
    } catch {
      // 파싱 실패한 줄은 건너뜁니다.
    }
  }
  return map;
}
