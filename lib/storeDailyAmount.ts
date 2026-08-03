// MARK 6.40: 일간 탭과 매장 탭이 "매장별 일자별 매출"을 각자 따로 계산하고 있어서 숫자가
// 어긋났습니다. 이 파일은 순수 함수(다른 lib 파일을 import하지 않음)로 만들어서, 순환 참조
// 걱정 없이 dataBuilder.ts와 lib/dailyBriefing.ts 양쪽에서 똑같이 가져다 쓸 수 있게 합니다.
//
// 규칙: Daily_Sales_History(이제 실제 판매금액을 담고 있어 정확함)를 우선 쓰고,
// 그 날짜에 데이터가 없을 때만 일간매출(26년)(참고용, 업데이트 시차가 있을 수 있음)으로 보완합니다.

type AmountRow = { date: string; storeName: string; amount: number };

export function mergeStoreDailyAmounts(
  primaryRows: AmountRow[],
  fallbackRows: AmountRow[],
  dates?: string[]
): Map<string, Map<string, number>> {
  const dateSet = dates ? new Set(dates) : null;
  const result = new Map<string, Map<string, number>>();
  const covered = new Set<string>();

  for (const r of primaryRows) {
    if (dateSet && !dateSet.has(r.date)) continue;
    covered.add(`${r.storeName}__${r.date}`);
    if (!result.has(r.storeName)) result.set(r.storeName, new Map());
    const m = result.get(r.storeName)!;
    m.set(r.date, (m.get(r.date) || 0) + Number(r.amount || 0));
  }

  for (const r of fallbackRows) {
    if (dateSet && !dateSet.has(r.date)) continue;
    const key = `${r.storeName}__${r.date}`;
    if (covered.has(key)) continue;
    if (!result.has(r.storeName)) result.set(r.storeName, new Map());
    const m = result.get(r.storeName)!;
    m.set(r.date, (m.get(r.date) || 0) + Number(r.amount || 0));
  }

  return result;
}

export function getMergedAmount(map: Map<string, Map<string, number>>, storeName: string, date: string): number {
  return map.get(storeName)?.get(date) || 0;
}

// mergeStoreDailyAmounts()의 결과(매장별×날짜별 맵)를 다시 평평한 {date, storeName, amount}[]로
// 되돌립니다. 기존에 flat rows를 기대하는 함수(스페셜오퍼위크 등)에 그대로 꽂아 쓰기 위함입니다.
export function flattenMergedAmounts(map: Map<string, Map<string, number>>): { date: string; storeName: string; amount: number }[] {
  const out: { date: string; storeName: string; amount: number }[] = [];
  for (const [storeName, byDate] of map.entries()) {
    for (const [date, amount] of byDate.entries()) {
      out.push({ date, storeName, amount });
    }
  }
  return out;
}

// 매장 구분 없이(단일 매장이든, 여러 매장 합계든) 날짜별 합계만 필요할 때 쓰는 단순 버전.
export function mergeDateTotals(primaryRows: AmountRow[], fallbackRows: AmountRow[]): Map<string, number> {
  const byDate = new Map<string, number>();
  const coveredDates = new Set<string>();
  for (const r of primaryRows) {
    byDate.set(r.date, (byDate.get(r.date) || 0) + Number(r.amount || 0));
    coveredDates.add(r.date);
  }
  const fallbackByDate = new Map<string, number>();
  for (const r of fallbackRows) {
    fallbackByDate.set(r.date, (fallbackByDate.get(r.date) || 0) + Number(r.amount || 0));
  }
  for (const [date, amount] of fallbackByDate.entries()) {
    if (!coveredDates.has(date)) byDate.set(date, amount);
  }
  return byDate;
}

// KST 기준 "어제" 날짜(YYYY-MM-DD). 두 탭 모두 기본 기준일을 통일할 때 사용합니다.
export function yesterdayDateKeyKST(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysStr(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayOfWeekOf(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).getDay(); // 0=일 1=월 2=화 ... 6=토
}

// 요일별 비교 규칙(일간 탭/매장 탭 공통): 화,수,목,일 → 어제 / 금,토,월(그룹 전환 경계) → 전주 동요일
export function getComparisonDateForDaily(dateKey: string): { compareDate: string; compareLabel: string } {
  const dow = dayOfWeekOf(dateKey);
  if (dow === 5 || dow === 6 || dow === 1) {
    return { compareDate: addDaysStr(dateKey, -7), compareLabel: "전주 동요일" };
  }
  return { compareDate: addDaysStr(dateKey, -1), compareLabel: "어제" };
}
