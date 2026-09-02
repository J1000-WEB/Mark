// MARK 품번체계 파싱 유틸
//
// 신품번체계(2026~, 9자리)와 구품번체계(2023~2025, 10자리)를 파싱해서 연도/시즌/성별/
// 카테고리를 뽑아내고, "이월" 여부(오늘 날짜 기준 원래 시즌/연도가 지났는지)를 판단합니다.
//
// 배경/근거는 프로젝트 문서("품번체계.md", GitHub 저장소 루트)에 정리되어 있습니다.
// 핵심만 요약:
//  - "러닝"(신체계 시즌자리 5~8) ≠ "이월". 러닝은 "이 상품은 여러 시즌 계속 판매되는
//    상품"이라는 코드일 뿐이고, 이월은 "오늘 날짜 기준으로 원래 시즌/연도가 지난 상품"이라는
//    상대적 개념입니다. 그래서 이월 여부는 코드 하나로 고정되지 않고, 분석 시점마다
//    parseStyleCode() 결과를 오늘 날짜와 비교해서 매번 계산해야 합니다(isCarryover 참고).
//  - 구체계(10자리)는 애초에 "러닝" 전용 코드가 없어서, 오히려 원래 출시 시즌이 코드에
//    그대로 남아있습니다 — 신체계보다 이월 판정에 더 유리합니다.
//
// 참고: 이 프로젝트에는 이미 "기준" 마스터 시트(W열)에 사람이 직접 입력한 이월 플래그가
// 있고(`lib/dataBuilder.ts`의 `buildCarryoverAnnualSales` 참고), "주간판매데이터" 시트에도
// 1=년도, 2=시즌 원본 컬럼이 있습니다(`lib/salesDataSuggestions.ts`의 COL 주석 참고, 다만
// 현재는 안 읽어들이고 있음). 둘 다 이 모듈보다 더 권위 있는 소스일 수 있으니, 두 값이 서로
// 다르면 이 모듈의 추정치보다 그쪽을 우선하는 걸 고려하세요. 이 모듈은 "품번밖에 없을 때도"
// 신뢰성 있게 계산하기 위한 용도입니다.

export type Season = 1 | 2 | 3 | 4; // 1=봄 2=여름 3=가을 4=겨울
export type Gender = "남성" | "여성" | "공용" | "키즈";

export interface ParsedStyleCode {
  raw: string;
  system: "new" | "old"; // new=2026~ 9자리, old=2023~2025 10자리
  brandCode: string; // 신체계에서만 의미 있음(현재 관측값: "G")
  year: number; // 4자리 서기 연도(추정)
  season: Season; // 원래 계절로 정규화(신체계 러닝코드 5~8도 1~4로 환산)
  isRunning: boolean; // 신체계 시즌자리가 5~8(연속판매/러닝 코드)였는지
  gender: Gender;
  categoryCode: string;
  categoryName: string;
  serial: string;
}

const LETTER_TO_DIGIT: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, J: 0 };

const GENDER_MAP: Record<string, Gender> = { M: "남성", L: "여성", U: "공용", K: "키즈" };

// 신체계 아이템 약자(2자리 영문) → 품목명
const NEW_ITEM_MAP: Record<string, string> = {
  TS: "티셔츠", SS: "스웻셔츠", SH: "우븐셔츠", BL: "블라우스", KC: "니트가디건", KP: "니트풀오버",
  KV: "니트베스트", JP: "점퍼", WV: "우븐베스트", JK: "자켓", CT: "코트", PT: "긴바지", HP: "반바지",
  SK: "스커트", JS: "점프수트", JI: "저지세트(이너)", JO: "저지세트(아우터)", KI: "니트세트(이너)",
  KO: "니트세트(아우터)", WI: "우븐세트(이너)", WO: "우븐세트(아우터)", JT: "저지셋업상의",
  JB: "저지셋업하의", KT: "니트셋업상의", KB: "니트셋업하의", WT: "우븐셋업상의", WB: "우븐셋업하의",
  SW: "수영복", CP: "모자", BG: "가방", GO: "장갑", BT: "벨트", SC: "양말", SA: "스카프", SO: "슈즈",
  ET: "기타액세서리", FG: "사은품",
};

// 구체계 아이템 코드(2자리 숫자) → 품목명
const OLD_ITEM_MAP: Record<string, string> = {
  "01": "티셔츠", "02": "스웻셔츠", "03": "우븐셔츠(블라우스)", "04": "니트가디건", "05": "니트풀오버",
  "06": "니트베스트", "07": "점퍼", "08": "우븐베스트", "09": "자켓", "10": "코트", "11": "긴바지",
  "12": "반바지", "13": "스커트", "14": "점프수트", "15": "원피스", "41": "저지세트(아우터)",
  "42": "저지세트(이너)", "43": "니트세트(아우터)", "44": "니트세트(이너)", "45": "우븐세트(아우터)",
  "46": "우븐세트(이너)", "51": "저지셋업상의", "52": "저지셋업하의", "53": "니트셋업상의",
  "54": "니트셋업하의", "55": "우븐셋업상의", "56": "우븐셋업하의", "57": "비옷상의", "58": "비옷하의",
  "60": "기타상하의", "91": "모자", "92": "가방", "93": "장갑", "94": "벨트", "95": "양말",
  "96": "스카프", "97": "슈즈", "98": "기타액세서리",
};

export const SEASON_LABEL: Record<Season, string> = { 1: "봄", 2: "여름", 3: "가을", 4: "겨울" };

// 연도 끝자리 숫자(0~9, 신체계 1글자용) → 실제 4자리 연도. referenceYear에 가장 가까운 연도로 추정.
function yearFromLastDigit(digit: number, referenceYear: number): number {
  const base = Math.floor(referenceYear / 10) * 10;
  const candidates = [base + digit, base + digit - 10, base + digit + 10];
  return candidates.reduce((best, c) => (Math.abs(c - referenceYear) < Math.abs(best - referenceYear) ? c : best));
}

/**
 * 품번 문자열을 파싱합니다. 신체계(9자리)/구체계(10자리) 둘 다 지원.
 * 형식이 안 맞거나 필수 코드값을 못 알아보면 null을 반환합니다(호출부에서 반드시 null 체크).
 */
export function parseStyleCode(code: string | null | undefined, referenceYear: number = new Date().getFullYear()): ParsedStyleCode | null {
  const raw = String(code || "").trim().toUpperCase();

  if (raw.length === 9) {
    const brandCode = raw[0];
    const yearDigit = LETTER_TO_DIGIT[raw[1]];
    const seasonRaw = Number(raw[2]);
    const genderChar = raw[3];
    const categoryCode = raw.slice(4, 6);
    const serial = raw.slice(6, 9);

    if (yearDigit === undefined) return null;
    if (!Number.isFinite(seasonRaw) || seasonRaw < 1 || seasonRaw > 8) return null;
    if (!GENDER_MAP[genderChar]) return null;
    if (!/^\d{3}$/.test(serial)) return null;

    const isRunning = seasonRaw >= 5;
    const season = (isRunning ? seasonRaw - 4 : seasonRaw) as Season;

    return {
      raw,
      system: "new",
      brandCode,
      year: yearFromLastDigit(yearDigit, referenceYear),
      season,
      isRunning,
      gender: GENDER_MAP[genderChar],
      categoryCode,
      categoryName: NEW_ITEM_MAP[categoryCode] || categoryCode,
      serial,
    };
  }

  if (raw.length === 10) {
    const lineCode = raw[0];
    const y1 = LETTER_TO_DIGIT[raw[1]];
    const y2 = LETTER_TO_DIGIT[raw[2]];
    const seasonRaw = Number(raw[3]);
    const genderChar = raw[4];
    const categoryCode = raw.slice(5, 7);
    const serial = raw.slice(7, 10);

    if (y1 === undefined || y2 === undefined) return null;
    if (!Number.isFinite(seasonRaw) || seasonRaw < 1 || seasonRaw > 4) return null;
    if (!GENDER_MAP[genderChar]) return null;
    if (!/^\d{3}$/.test(serial)) return null;

    const twoDigitYear = y1 * 10 + y2;
    const century = Math.floor(referenceYear / 100) * 100;

    return {
      raw,
      system: "old",
      brandCode: lineCode, // 구체계는 브랜드 대신 라인(S/W/Q)
      year: century + twoDigitYear,
      season: seasonRaw as Season,
      isRunning: false,
      gender: GENDER_MAP[genderChar],
      categoryCode,
      categoryName: OLD_ITEM_MAP[categoryCode] || categoryCode,
      serial,
    };
  }

  return null;
}

/** 오늘(또는 지정한 날짜) 기준 현재 시즌. 한국 패션 시즌 관례상 12~2월은 "겨울"이고,
 * 1~2월은 "작년 FW의 연장"으로 취급합니다(예: 2027년 1월 → {year:2026, season:4}). */
export function getCurrentSeason(date: Date = new Date()): { year: number; season: Season } {
  // Asia/Seoul 기준으로 월을 구합니다(서버가 다른 타임존이어도 일관되게 계산하기 위함).
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric" }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);

  if (month >= 3 && month <= 5) return { year, season: 1 };
  if (month >= 6 && month <= 8) return { year, season: 2 };
  if (month >= 9 && month <= 11) return { year, season: 3 };
  // 12월 또는 1~2월 = 겨울. 1~2월은 전년도 FW로 취급.
  return { year: month === 12 ? year : year - 1, season: 4 };
}

/**
 * 이월 여부 = 오늘 날짜 기준으로 상품의 연도/시즌이 이미 지났는지.
 * "러닝(isRunning)" 코드 여부와는 무관합니다 — 신체계든 구체계든 이 비교로 통일해서 판단합니다.
 */
export function isCarryover(parsed: ParsedStyleCode, today: Date = new Date()): boolean {
  const cur = getCurrentSeason(today);
  if (parsed.year < cur.year) return true;
  if (parsed.year === cur.year && parsed.season < cur.season) return true;
  return false;
}

// 간절기 대칭 규칙(소천님 도메인 지식): 지금 계절에 "팔기 적합한" 이월 시즌들.
// 봄=겨울+봄, 여름=여름만, 가을=봄+가을, 겨울=가을+겨울.
const APPROPRIATE_CARRYOVER_SEASONS: Record<Season, Season[]> = {
  1: [4, 1],
  2: [2],
  3: [1, 3],
  4: [3, 4],
};

/** 지정한 시즌의 이월 재고를, 지금(또는 지정한 날짜) 시점에 파는 게 날씨상 적합한지. */
export function isSeasonAppropriateNow(season: Season, today: Date = new Date()): boolean {
  const cur = getCurrentSeason(today);
  return APPROPRIATE_CARRYOVER_SEASONS[cur.season].includes(season);
}

/** 지금(또는 지정한 날짜) 시점에 팔기 적합한 이월 시즌 목록(한글 라벨). */
export function getAppropriateCarryoverSeasonLabels(today: Date = new Date()): string[] {
  const cur = getCurrentSeason(today);
  return APPROPRIATE_CARRYOVER_SEASONS[cur.season].map((s) => SEASON_LABEL[s]);
}
