// MARK 2026-09-14: "실시간 매출추이 데이터 쌓을 필요없이 내가 주차별로 해서 주면되는거였네" —
// 실시간 탭의 "예상 마감 매출"이 Realtime_Hourly_Snapshot에 최소 1주치 데이터가 쌓여야만
// 계산 가능했는데(막 GitHub Actions로 기록을 시작해서 사실상 데이터가 없었음), 소천님이
// 대신 2026년 8월~9월 6개 주차 분량의 "시간대별 매출추이"(평일/주말 구분) 엑셀을 직접
// 뽑아서 주셨습니다. 이 파일은 그 6주치를 미리 집계한 정적 스냅샷입니다 — 매번 시트를
// 읽을 필요 없이 즉시 예상치를 계산할 수 있고, 실시간 기록이 쌓이길 기다릴 필요가 없습니다.
//
// 원본 엑셀의 숫자는 시간대별 "합계"(판매수량으로 추정 — 금액이라 하기엔 스케일이 작음)이지만,
// 여기서는 절대값이 아니라 "하루 총량 대비 이 시각까지 누적된 비율의 역수"(배율)만 쓰기
// 때문에 수량/금액 어느 쪽이든 시간대별 분포 형태가 비슷하다면 근사치로 문제없이 씁니다.
//
// 데이터 범위: 2026-08-01주차 ~ 2026-09-01주차(6주), 매장 23곳, 평일(월~금)/주말(토~일) 구분.
// 나중에 더 최근 주차 엑셀을 받으면 이 파일 전체를 다시 생성해서 교체하면 됩니다.

export const HOURLY_PACE_PROFILE_SOURCE = {
  weeksAggregated: 6,
  dateRange: "2026-08-01 ~ 2026-09-01주차",
  note: "평일=월~금, 주말=토~일 (엑셀 파일 자체가 이렇게 구분되어 있음)",
};

// 시각(H:00) 기준 "하루 총량 ÷ 그 시각까지 누적량" 배율. todaySoFar * ratio = 예상 마감치.
// 이른 시간대(11~13시)는 누적량이 너무 적어 배율이 극단적으로 커지므로(노이즈), 실제 계산
// 단계에서 MAX_STABLE_RATIO 이상이면 사용하지 않고 "예상치 계산 중"으로 남겨둡니다.
export const COMPANY_WEEKDAY_PROJECTION_RATIO: Record<string, number> = {
  "11:00": 263.1287,
  "12:00": 21.4009,
  "13:00": 7.5388,
  "14:00": 4.1551,
  "15:00": 2.7206,
  "16:00": 2.0073,
  "17:00": 1.5886,
  "18:00": 1.3466,
  "19:00": 1.1807,
  "20:00": 1.0643,
  "21:00": 1.0101,
  "22:00": 1.0002,
};

export const COMPANY_WEEKEND_PROJECTION_RATIO: Record<string, number> = {
  "11:00": 296.0585,
  "12:00": 25.669,
  "13:00": 9.3805,
  "14:00": 5.049,
  "15:00": 3.1365,
  "16:00": 2.1168,
  "17:00": 1.5908,
  "18:00": 1.3141,
  "19:00": 1.1511,
  "20:00": 1.0563,
  "21:00": 1.0074,
  "22:00": 1.0002,
};

// 배율이 이 값 이상이면(이른 시간대) 너무 불안정해서 예상치로 안 씁니다.
const MAX_STABLE_RATIO = 6;

export function getCompanyProjectionRatio(hourLabel: string, isWeekend: boolean): number | null {
  const table = isWeekend ? COMPANY_WEEKEND_PROJECTION_RATIO : COMPANY_WEEKDAY_PROJECTION_RATIO;
  const ratio = table[hourLabel];
  if (!ratio || !Number.isFinite(ratio) || ratio >= MAX_STABLE_RATIO) return null;
  return ratio;
}

// MARK 2026-09-14: "실시간 탭에 매출예측이 어디 나오는지 모르겠다" 문의 — 이른 시간대(11~13시)는
// 배율이 너무 불안정해서 일부러 안 보여주는 건데, "언제부터 뜨는지"를 화면에 정확히 알려주는 게
// 훨씬 친절합니다. 배율이 안정권(MAX_STABLE_RATIO 미만)에 처음 들어오는 시각을 찾아줍니다.
export function getFirstStableProjectionHour(isWeekend: boolean): string | null {
  const table = isWeekend ? COMPANY_WEEKEND_PROJECTION_RATIO : COMPANY_WEEKDAY_PROJECTION_RATIO;
  const hours = Object.keys(table).sort();
  for (const h of hours) {
    if (table[h] < MAX_STABLE_RATIO) return h;
  }
  return null;
}

// 매장별 "주말(토/일) 일평균 ÷ 평일(월~금) 일평균" 배율. buildStoreCards의 요일가중치
// (예전엔 전 매장 공통 1.7 하나였음)를 매장별 실측치로 교체하는 데 씁니다.
// 데이터에 없는 매장(엑셀 이후 신규 매장 등)은 DEFAULT_WEEKEND_WEIGHT로 폴백합니다.
export const DEFAULT_WEEKEND_WEIGHT = 1.7;

export const STORE_WEEKEND_WEIGHT: Record<string, number> = {
  "LF스퀘어 광양점": 2.626,
  "롯데백화점 광복점": 1.908,
  "롯데백화점 평촌점": 2.269,
  "롯데아울렛 김해점": 4.04,
  "롯데아울렛 동부산": 2.735,
  "롯데아울렛 서울역점": 1.649,
  "서울숲 플래그십": 1.625,
  "성수 플래그십": 1.622,
  "스타필드 고양점": 2.191,
  "스타필드 빌리지 운정점": 1.898,
  "신사 플래그십": 1.501,
  "신세계 광주점": 2.274,
  "신세계 대전점": 2.829,
  "신세계 센텀시티점": 2.059,
  "신세계 의정부점": 2.848,
  "아이파크몰 용산점": 2.034,
  "타임스퀘어 영등포점": 2.393,
  "포시즌 아울렛 신사점": 1.551,
  "한남 플래그십": 1.336,
  "현대백화점 신촌점": 1.52,
  "현대아울렛 남양주점": 3.014,
  "현대아울렛 송도점": 2.925,
  "현대커넥트 청주점": 2.465,
};

function normalizeStoreKeyLocal(storeName: string) {
  const raw = String(storeName || "").trim();
  return raw
    .replace(/^오프라인[_\s-]*/i, "")
    .replace(/점$/g, "")
    .replace(/[\s_\-·.()]/g, "")
    .toLowerCase();
}

const STORE_WEEKEND_WEIGHT_BY_KEY: Record<string, number> = Object.fromEntries(
  Object.entries(STORE_WEEKEND_WEIGHT).map(([name, weight]) => [normalizeStoreKeyLocal(name), weight])
);

export function getStoreWeekendWeight(storeName: string): number {
  const key = normalizeStoreKeyLocal(storeName);
  return STORE_WEEKEND_WEIGHT_BY_KEY[key] ?? DEFAULT_WEEKEND_WEIGHT;
}
