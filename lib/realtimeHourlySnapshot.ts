import { getHistorySheetId, getSheetValuesById, ensureSheetExistsById, appendValuesById, updateValuesById } from "@/lib/googleSheets";
import { readTodayDailyHistoryRows } from "@/lib/dailySales";
import { getCompanyProjectionRatio, getFirstStableProjectionHour } from "@/lib/hourlyPaceProfile";

// MARK 2026-09: "전주 동시간대비 증감율" 추적을 위한 시간별 매출 기록. 요청 배경:
// "실시간으로 다 기록하면 너무 양이 많으니까 정시에 기록하는 루틴으로 하고 싶고, 매장운영이
// 보통 10시부터라 11시~22시까지만 기록하면 될 것 같아. 기록이 쌓이면 무거워질 수 있으니까
// 최대한 줄여서 기록하고 싶어."
// → 품번/컬러 등 상세는 안 담고, "전체 수량/금액" + "점포별 수량/금액"만 시간당 한 줄로
//   기록합니다(Daily_Sales_History처럼 품목 단위로 쌓이는 걸 피함). 하루 최대 12줄,
//   1년이어도 4,400줄 안팎이라 계속 쌓여도 가벼움.

export const HOURLY_SNAPSHOT_SHEET = "Realtime_Hourly_Snapshot";
export const HOURLY_SNAPSHOT_HEADER = ["일자", "시각", "전체수량", "전체금액", "점포별JSON"];

const OPERATING_START_HOUR = 11;
const OPERATING_END_HOUR = 22;

function num(v: any) {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nowKST() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}

function kstDateKey() {
  const kst = nowKST();
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function kstHour() {
  return nowKST().getHours();
}

export type StoreHourlyAmount = { storeName: string; qty: number; amount: number };

export async function recordRealtimeHourlySnapshot(options?: { force?: boolean }) {
  const hour = kstHour();
  if (!options?.force && (hour < OPERATING_START_HOUR || hour > OPERATING_END_HOUR)) {
    return {
      skipped: true,
      reason: `매장 운영시간(${OPERATING_START_HOUR}~${OPERATING_END_HOUR}시) 밖이라 기록하지 않았습니다 (현재 ${hour}시).`,
    };
  }

  const { today, rows } = await readTodayDailyHistoryRows();

  const totalQty = rows.reduce((sum, r) => sum + num(r.qty), 0);
  const totalAmount = rows.reduce((sum, r) => sum + num(r.amount), 0);

  const byStore = new Map<string, StoreHourlyAmount>();
  for (const r of rows) {
    const key = r.storeName;
    if (!byStore.has(key)) byStore.set(key, { storeName: key, qty: 0, amount: 0 });
    const bucket = byStore.get(key)!;
    bucket.qty += num(r.qty);
    bucket.amount += num(r.amount);
  }
  const stores = Array.from(byStore.values()).sort((a, b) => b.amount - a.amount);

  const historyId = getHistorySheetId();
  await ensureSheetExistsById(historyId, HOURLY_SNAPSHOT_SHEET, HOURLY_SNAPSHOT_HEADER);

  // 이 시트는 하루 최대 12줄만 늘어나므로(운영시간 11~22시, 정시 1회), 날짜+시각 열만
  // 전체 읽어서 이미 기록된 줄인지 찾는 것도 충분히 가볍습니다(Daily_Sales_History처럼
  // 수십만 건이 쌓이는 시트가 아님 — 그 문제를 겪었던 targeted-read 패턴까지는 필요 없음).
  const hourLabel = `${String(hour).padStart(2, "0")}:00`;
  const existing = await getSheetValuesById(historyId, HOURLY_SNAPSHOT_SHEET, "A:B").catch(() => [] as any[]);
  let targetRow = -1;
  for (let i = 1; i < existing.length; i++) {
    if (String(existing[i]?.[0] ?? "").trim() === today && String(existing[i]?.[1] ?? "").trim() === hourLabel) {
      targetRow = i + 1; // 1-based 시트 행 번호
      break;
    }
  }

  const rowValues = [today, hourLabel, totalQty, totalAmount, JSON.stringify(stores)];
  if (targetRow > 0) {
    await updateValuesById(historyId, `'${HOURLY_SNAPSHOT_SHEET}'!A${targetRow}:E${targetRow}`, [rowValues]);
  } else {
    await appendValuesById(historyId, `'${HOURLY_SNAPSHOT_SHEET}'!A:E`, [rowValues]);
  }

  return {
    skipped: false,
    date: today,
    hour: hourLabel,
    totalQty,
    totalAmount,
    storeCount: stores.length,
    mode: targetRow > 0 ? "updated" : "appended",
  };
}

// MARK 2026-09: "맨상단에 전주 시간대별 매출추이 그래프" + "매출예측도 계산할 수 있는 것도
// 미리 준비해놓자" 요청.
// - 오늘/지난주 같은 요일의 시간대별 누적매출을 나란히 돌려줘서 그래프로 그릴 수 있게 합니다.
// - 예상 마감 매출은 "오늘 지금까지 페이스 ÷ 지난주 같은 시각 페이스 × 지난주 최종매출"
//   (단순 run-rate 추정)로 계산합니다. 지금은 비교 가능한 과거가 지난주 1주뿐이라 그걸로
//   계산하지만, WEEKS_LOOKBACK을 늘리고 여러 주 평균을 내도록 쉽게 확장할 수 있게
//   구조를 짜뒀습니다(몇 주 더 쌓이면 그때 정확도를 올리면 됩니다).
const WEEKS_LOOKBACK = 1;

function kstDateKeyOffset(offsetDays: number) {
  const kst = nowKST();
  kst.setDate(kst.getDate() + offsetDays);
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function hourLabelList() {
  const hours: string[] = [];
  for (let h = OPERATING_START_HOUR; h <= OPERATING_END_HOUR; h++) hours.push(`${String(h).padStart(2, "0")}:00`);
  return hours;
}

// 이 시트는 정시(11~22시)에만 한 줄씩 늘어나서 하루 최대 12줄입니다(Daily_Sales_History처럼
// 항목 단위로 폭증하는 시트가 아님) — 몇 년이 쌓여도 전체를 한 번에 읽어도 가볍습니다.
async function readHourlyAmountsByDate(historyId: string, dateKeys: string[]): Promise<Map<string, Map<string, number>>> {
  const wanted = new Set(dateKeys);
  const result = new Map<string, Map<string, number>>();
  const raw = await getSheetValuesById(historyId, HOURLY_SNAPSHOT_SHEET, "A:E").catch(() => [] as any[]);
  for (let i = 1; i < raw.length; i++) {
    const date = String(raw[i]?.[0] ?? "").trim();
    if (!wanted.has(date)) continue;
    const hour = String(raw[i]?.[1] ?? "").trim();
    const amount = num(raw[i]?.[3]);
    if (!result.has(date)) result.set(date, new Map());
    result.get(date)!.set(hour, amount);
  }
  return result;
}

export type HourlyTrendPoint = { hour: string; todayAmount: number | null; lastWeekAmount: number | null };

// MARK 2026-09-21: "매출예측은 소천님이 주신 시간대별 배율표(hourlyPaceProfile.ts)만으로
// 계산되게 하자, 그거면 충분히 표시할 수 있잖아" 요청 — 예전엔 Realtime_Hourly_Snapshot에
// 오늘 이번 시각 기록이 있어야만 예측이 나왔는데(정시 기록이 GitHub Actions 스케줄러
// 불안정 문제로 빠지는 시간대가 많아서 예측도 같이 안 나오는 문제가 있었습니다), 이제는
// "오늘 지금까지의 실시간 누적매출"(todayLiveAmount — 호출부인 app/api/realtime이 매번
// Daily_Sales_History에서 직접 계산해서 넘겨줌, 정시 기록과 무관하게 항상 최신값)과
// 정적 배율표만으로 계산합니다. 그래서 예측은 이제 Realtime_Hourly_Snapshot이 하나도
// 없어도 항상 뜹니다. 정시 기록 자체는 이 함수 위쪽의 "오늘 vs 지난주" 시간대별 추이
// 그래프(과거 시점별 비교가 반드시 필요한 용도)를 위해 계속 쌓아둡니다.
export async function readRealtimeHourlyTrend(todayLiveAmount?: number) {
  const historyId = getHistorySheetId();
  const today = kstDateKey();
  const currentHourLabel = `${String(kstHour()).padStart(2, "0")}:00`;
  const lookbackDates = Array.from({ length: WEEKS_LOOKBACK }, (_, i) => kstDateKeyOffset(-7 * (i + 1)));
  const primaryLastWeekDate = lookbackDates[0] || "";

  const amountsByDate = await readHourlyAmountsByDate(historyId, [today, ...lookbackDates]);
  const hours = hourLabelList();
  const todayMap = amountsByDate.get(today) || new Map<string, number>();
  const lastWeekMap = amountsByDate.get(primaryLastWeekDate) || new Map<string, number>();

  const series: HourlyTrendPoint[] = hours.map((hour) => ({
    hour,
    todayAmount: todayMap.has(hour) ? todayMap.get(hour)! : null,
    lastWeekAmount: lastWeekMap.has(hour) ? lastWeekMap.get(hour)! : null,
  }));

  const primaryLastWeekFinalAmount: number | null = (() => {
    const map = amountsByDate.get(primaryLastWeekDate);
    if (!map || !map.size) return null;
    return hours.reduce((latest: number | null, h) => (map.has(h) ? map.get(h)! : latest), null as number | null);
  })();

  const todayDow = nowKST().getDay();
  const isWeekendToday = todayDow === 0 || todayDow === 6;
  const staticRatio = getCompanyProjectionRatio(currentHourLabel, isWeekendToday);
  // 라이브 값이 넘어오면 그걸 우선 쓰고(정시 기록 여부와 무관하게 항상 최신), 안 넘어온
  // 호출부(과거 호환)에서만 그날 기록된 스냅샷 값으로 대체합니다.
  const todaySoFar = todayLiveAmount ?? todayMap.get(currentHourLabel) ?? null;

  const projectedEndOfDayAmount = todaySoFar && staticRatio ? Math.round(todaySoFar * staticRatio) : null;
  // 예측이 아직 없을 때(대부분 이른 시간대) "언제부터 뜨는지" 화면에 정확히 알려주기 위한 값.
  const projectionAvailableFromHour = projectedEndOfDayAmount ? null : getFirstStableProjectionHour(isWeekendToday);

  return {
    today,
    lastWeekDate: primaryLastWeekDate,
    hours: series,
    hasLastWeekData: lastWeekMap.size > 0,
    lastWeekFinalAmount: primaryLastWeekFinalAmount,
    projectedEndOfDayAmount,
    projectionSource: projectedEndOfDayAmount ? ("historical_profile" as const) : null,
    projectionAvailableFromHour,
  };
}
