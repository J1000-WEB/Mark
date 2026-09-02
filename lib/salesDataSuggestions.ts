// 주간판매데이터(수기로 관리하던 엑셀과 동일한 포맷) 파일을 읽어서, 재고컨트롤의
// RT/이관/프로모션 제안과 비슷한 "제안"을 만들어내는 핵심 로직입니다.
// 브라우저(클라이언트)에서 파일을 읽자마자 바로 계산해서 미리보기를 보여줄 수 있도록,
// googleapis 등 서버 전용 라이브러리는 쓰지 않습니다(서버 저장은 API 라우트가 담당).

// MARK 2026-09: "이월소진" 판별을 품번 파싱 기반으로 고침. 원래는 "판매율 낮고 재고
// 많음"이라는 판매 패턴만으로 "이월"이라고 부르고 있었는데, 이러면 그냥 안 팔리는
// 당해시즌 신상품까지 이월로 잘못 분류됨. "이월" = 오늘 날짜 기준으로 원래 시즌/연도가
// 지난 상품(품번체계.md 참고) 이라는 정의를 품번 파싱(lib/productCode.ts)으로 적용함.
import { parseStyleCode, isCarryover, isSeasonAppropriateNow, SEASON_LABEL } from "./productCode";

// ---- "품번" 시트 컬럼 위치 (2026-08-31 파일 기준으로 실측 확인) ----
// 0=순위, 1=년도,2=시즌,3=품목,4=복종,5=아이템,6=재런칭, 7=품번, 8=품명, 9=STY, 10=COL,
// 11=원가, 12=TAG가, 13=판매가, 14=OFF가, 15=프로모션가, 16=할인율,
// 17=기획, 18=입고%, 19=입고, 20=판매, 21=재고(당기), 22=판매%, 23=초입고, 24=초출고,
// 25=랭킹(주간), 26=랭킹(2주전), 27=랭킹등락(양수=순위 상승/개선, 음수=순위 하락),
// 28=금액판매(주간), 29=금액판매(2주전), 30=비중,
// 31~34=수량판매(주간,2주전,3주전,4주전 — 이 파일의 원래 표기를 그대로 따름),
// 35=총재고, 36=물류, 37=물류(온), 38=물류(오프), 39=점포
//
// 1(년도)/2(시즌) 컬럼은 원본 파일에 있지만 정확한 표기 형식(예: "26" vs "2026" vs
// "FW" 등)을 실측 검증 못 해서 파싱에 쓰지 않고 원본 텍스트 그대로만 참고용으로 들고
// 있습니다(yearRaw/seasonRaw). 실제 이월 판정은 품번(STYLE_CODE) 파싱 기반
// (lib/productCode.ts)으로 합니다 — 이쪽은 품번체계.md 문서로 검증된 규칙이라 더 신뢰 가능.
const COL = {
  YEAR_RAW: 1,
  SEASON_RAW: 2,
  STYLE_CODE: 7,
  PRODUCT_NAME: 8,
  COST: 11,
  SALE_PRICE: 13,
  OFF_PRICE: 14,
  PROMO_PRICE: 15,
  DISCOUNT_RATE: 16,
  SELL_THROUGH_PCT: 22,
  RANK_CURRENT: 25,
  RANK_CHANGE: 27,
  QTY_TREND_START: 31, // 31,32,33,34 (최근→과거 순)
  STOCK_TOTAL: 35,
  STOCK_WAREHOUSE: 36,
  STOCK_STORE: 39,
};

export interface WeeklyStyleRow {
  styleCode: string;
  productName: string;
  yearRaw: string; // 원본 파일의 "년도" 컬럼 원문(참고용, 파싱 안 함)
  seasonRaw: string; // 원본 파일의 "시즌" 컬럼 원문(참고용, 파싱 안 함)
  cost: number;
  salePrice: number;
  offPrice: number;
  promoPrice: number;
  discountRate: number;
  sellThroughPct: number;
  rankCurrent: number;
  rankChange: number;
  qtyTrend: number[]; // [이번주,...,4주전]
  stockTotal: number;
  stockWarehouse: number;
  stockStore: number;
}

// 시트 이름이 "MM.DD~MM.DD(품번)" 패턴인 것들 중 가장 최신(마지막 날짜가 가장 늦은) 것을 찾습니다.
export function findLatestWeekSheetName(sheetNames: string[], suffix: "품번" | "컬러"): string | null {
  const pattern = new RegExp(`^(\\d{1,2})\\.(\\d{1,2})~(\\d{1,2})\\.(\\d{1,2})\\(${suffix}\\)$`);
  let best: { name: string; endMonth: number; endDay: number } | null = null;
  for (const name of sheetNames) {
    const m = name.match(pattern);
    if (!m) continue;
    const endMonth = Number(m[3]);
    const endDay = Number(m[4]);
    if (!best || endMonth > best.endMonth || (endMonth === best.endMonth && endDay > best.endDay)) {
      best = { name, endMonth, endDay };
    }
  }
  return best ? best.name : null;
}

function num(v: any) {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// 시트를 통째로 읽은 2차원 배열(rows)에서 실제 품번 데이터 행만 뽑아 파싱합니다.
// 헤더가 6줄(0~5)에 걸쳐있고, 그다음 요약행(품번 없음)이 하나 더 있은 뒤 실제 데이터가
// 시작합니다. "품번" 칸 값만으로 거르면 헤더 행의 다른 라벨(예: "상품현황")이 잘못 섞여
// 들어올 수 있어서, 헤더 구간(앞 6줄)을 확실히 건너뛰고 시작합니다.
const HEADER_ROW_COUNT = 6;

export function parseWeeklyStyleRows(rows: any[][]): WeeklyStyleRow[] {
  const result: WeeklyStyleRow[] = [];
  for (const r of rows.slice(HEADER_ROW_COUNT)) {
    const styleCode = String(r[COL.STYLE_CODE] ?? "").trim();
    if (!styleCode) continue;
    result.push({
      styleCode,
      productName: String(r[COL.PRODUCT_NAME] ?? "").trim(),
      yearRaw: String(r[COL.YEAR_RAW] ?? "").trim(),
      seasonRaw: String(r[COL.SEASON_RAW] ?? "").trim(),
      cost: num(r[COL.COST]),
      salePrice: num(r[COL.SALE_PRICE]),
      offPrice: num(r[COL.OFF_PRICE]),
      promoPrice: num(r[COL.PROMO_PRICE]),
      discountRate: num(r[COL.DISCOUNT_RATE]),
      sellThroughPct: num(r[COL.SELL_THROUGH_PCT]),
      rankCurrent: num(r[COL.RANK_CURRENT]),
      rankChange: num(r[COL.RANK_CHANGE]),
      qtyTrend: [0, 1, 2, 3].map((i) => num(r[COL.QTY_TREND_START + i])),
      stockTotal: num(r[COL.STOCK_TOTAL]),
      stockWarehouse: num(r[COL.STOCK_WAREHOUSE]),
      stockStore: Math.max(0, num(r[COL.STOCK_STORE])), // 데이터에 간혹 음수(조정분 등)가 섞여있어 0 미만은 0으로 보정
    });
  }
  return result;
}

// ---- PIP 파일(사이즈별 재고)에서 스타일별 "사이즈 완성도" 계산 ----
// PIP 파일 컬럼: 13=스타일, 15=칼라, 17=사이즈, 25=재고 (2026-08-31 기준, 사이즈 컬럼 포함 버전)
const PIP_COL = { STYLE: 13, SIZE: 17, STOCK: 25 };

export interface SizeCoverage {
  totalSizes: number;
  sizesInStock: number;
  coverageRatio: number; // 0~1, 1이면 사이즈 다 있음, 낮을수록 많이 빠짐
}

// PIP 파일 헤더는 3줄(0~2)이라, 그 뒤부터가 실제 데이터입니다.
const PIP_HEADER_ROW_COUNT = 3;

export function computeSizeCoverageByStyle(pipRows: any[][]): Map<string, SizeCoverage> {
  const sizesByStyle = new Map<string, Set<string>>();
  const inStockSizesByStyle = new Map<string, Set<string>>();

  for (const r of pipRows.slice(PIP_HEADER_ROW_COUNT)) {
    const styleCode = String(r[PIP_COL.STYLE] ?? "").trim();
    const size = String(r[PIP_COL.SIZE] ?? "").trim();
    if (!styleCode || !size) continue;
    const stock = num(r[PIP_COL.STOCK]);

    if (!sizesByStyle.has(styleCode)) sizesByStyle.set(styleCode, new Set());
    sizesByStyle.get(styleCode)!.add(size);

    if (stock > 0) {
      if (!inStockSizesByStyle.has(styleCode)) inStockSizesByStyle.set(styleCode, new Set());
      inStockSizesByStyle.get(styleCode)!.add(size);
    }
  }

  const result = new Map<string, SizeCoverage>();
  for (const [styleCode, allSizes] of sizesByStyle.entries()) {
    const inStock = inStockSizesByStyle.get(styleCode)?.size || 0;
    result.set(styleCode, {
      totalSizes: allSizes.size,
      sizesInStock: inStock,
      coverageRatio: allSizes.size > 0 ? inStock / allSizes.size : 0,
    });
  }
  return result;
}

// ---- 제안 타입들 ----
export interface Suggestion {
  type: "추가이관" | "프로모션" | "추가투입" | "단종검토" | "이월소진";
  styleCode: string;
  productName: string;
  reason: string;
  detail: Record<string, any>;
}

export interface PriceSuggestion {
  styleCode: string;
  productName: string;
  cost: number;
  currentPrice: number;
  costRatio: number; // 원가/현재가
  suggestedDiscountRate: number; // 0~1
  suggestedPrice: number;
  sizeCoverageRatio: number | null; // PIP 없으면 null
  reason: string;
}

const THRESHOLDS = {
  highSellThrough: 0.7, // 판매% 70% 이상이면 "잘 팔림"
  lowStockForHighSeller: 300, // 잘 팔리는데 재고가 이 이하면 부족
  rankDeclineForPromo: -5, // 등락이 -5 이하(많이 떨어짐)
  minStockForPromo: 500, // 그러면서 재고가 이 이상 남아있으면 프로모션 후보
  noStoreStockMin: 0, // 점포재고가 이 이하
  warehouseStockForInject: 200, // 물류재고가 이 이상이면 추가투입 후보
  decliningTrendMinStock: 300, // 4주 연속 감소 + 재고 이 이상이면 단종검토 후보
  carryoverMaxSellThrough: 0.1, // 판매%가 이 이하면 "거의 안 팔림"
  carryoverMinStock: 300, // 그러면서 재고가 이 이상이면 이월소진 후보
};

export function buildSuggestions(styles: WeeklyStyleRow[]): Suggestion[] {
  const suggestions: Suggestion[] = [];

  for (const s of styles) {
    // 1) 판매율 높은데 재고 적음 → 추가이관(생산) 검토
    if (s.sellThroughPct >= THRESHOLDS.highSellThrough && s.stockTotal > 0 && s.stockTotal <= THRESHOLDS.lowStockForHighSeller) {
      suggestions.push({
        type: "추가이관",
        styleCode: s.styleCode,
        productName: s.productName,
        reason: `판매율 ${(s.sellThroughPct * 100).toFixed(0)}%로 잘 팔리는데 재고가 ${s.stockTotal}개밖에 안 남았어요. 추가 이관/생산을 검토해보세요.`,
        detail: { sellThroughPct: s.sellThroughPct, stockTotal: s.stockTotal },
      });
    }

    // 2) 랭킹 계속 하락 + 재고 많음 → 프로모션 검토
    if (s.rankChange <= THRESHOLDS.rankDeclineForPromo && s.stockTotal >= THRESHOLDS.minStockForPromo) {
      suggestions.push({
        type: "프로모션",
        styleCode: s.styleCode,
        productName: s.productName,
        reason: `순위가 ${Math.abs(s.rankChange)}계단 하락했는데 재고가 ${s.stockTotal}개 남아있어요. 프로모션/할인을 검토해보세요.`,
        detail: { rankChange: s.rankChange, stockTotal: s.stockTotal },
      });
    }

    // 3) 매장 재고 0(또는 매우 적음) + 물류센터엔 넉넉 → 추가투입 검토 (RT 아님)
    if (s.stockStore <= THRESHOLDS.noStoreStockMin && s.stockWarehouse >= THRESHOLDS.warehouseStockForInject) {
      suggestions.push({
        type: "추가투입",
        styleCode: s.styleCode,
        productName: s.productName,
        reason: `매장 재고는 없는데 물류센터에는 ${s.stockWarehouse}개 있어요. 매장에 추가로 투입하는 걸 검토해보세요.`,
        detail: { stockStore: s.stockStore, stockWarehouse: s.stockWarehouse },
      });
    }

    // 4) 4주 연속 판매 감소 + 재고 많음 → 단종/재고소진 검토
    const [w1, w2, w3, w4] = s.qtyTrend;
    const isDeclining = w1 < w2 && w2 < w3 && w3 < w4 && w4 > 0;
    if (isDeclining && s.stockTotal >= THRESHOLDS.decliningTrendMinStock) {
      suggestions.push({
        type: "단종검토",
        styleCode: s.styleCode,
        productName: s.productName,
        reason: `최근 4주 연속 판매량이 줄고 있어요(${w4}→${w3}→${w2}→${w1}). 재고가 ${s.stockTotal}개 남아있어 소진 계획을 검토해보세요.`,
        detail: { qtyTrend: s.qtyTrend, stockTotal: s.stockTotal },
      });
    }

    // 5) 재고 많고 판매 거의 없는 "이월"(과거 시즌) 상품 → 투입+소진 검토(가격제안은 별도 함수에서)
    // "이월" = 오늘 날짜 기준으로 품번의 연도/시즌이 이미 지난 상품(품번체계.md 참고).
    // 판매율+재고만 보면 그냥 안 팔리는 "당해시즌 신상품"까지 이월로 잘못 분류되기 때문에,
    // 품번을 파싱해서 실제로 지난 시즌 상품인지 확인한 뒤에만 "이월소진"으로 표시함.
    const slowMoving = s.sellThroughPct <= THRESHOLDS.carryoverMaxSellThrough && s.stockTotal >= THRESHOLDS.carryoverMinStock;
    if (slowMoving) {
      const parsed = parseStyleCode(s.styleCode);
      // 품번을 못 읽는 경우(형식이 다르거나 손상됨)엔 시즌 판정이 불가능하므로, 예전처럼
      // 판매율+재고만으로 후보에 넣되 detail에 확실히 "판정불가"로 표시해서 구분되게 함.
      const carryover = parsed ? isCarryover(parsed) : null;
      if (carryover !== false) {
        const seasonAppropriate = parsed ? isSeasonAppropriateNow(parsed.season) : null;
        const seasonText = parsed
          ? `${parsed.year}년 ${SEASON_LABEL[parsed.season]} 상품(품번상 ${parsed.isRunning ? "러닝코드" : "정상출시"})`
          : "품번에서 시즌 정보를 못 읽었어요(형식 확인 필요)";
        const fitNote =
          parsed && seasonAppropriate === false
            ? " 다만 지금 계절과는 안 맞는 이월이라, 지금 당장 파는 것보다는 다음 적합 시즌까지 보관하거나 우선순위를 낮추는 게 나을 수 있어요."
            : "";
        suggestions.push({
          type: "이월소진",
          styleCode: s.styleCode,
          productName: s.productName,
          reason: `${seasonText}. 판매율이 ${(s.sellThroughPct * 100).toFixed(0)}%로 거의 안 팔리는데 재고가 ${s.stockTotal}개나 남아있어요.${fitNote} 투입 및 가격 조정을 검토해보세요.`,
          detail: {
            sellThroughPct: s.sellThroughPct,
            stockTotal: s.stockTotal,
            productYear: parsed?.year ?? null,
            productSeason: parsed ? SEASON_LABEL[parsed.season] : null,
            isRunningCode: parsed?.isRunning ?? null,
            isCarryover: carryover, // null이면 품번 파싱 실패로 판정불가
            isSeasonAppropriateNow: seasonAppropriate,
            category: parsed?.categoryName ?? null,
            gender: parsed?.gender ?? null,
          },
        });
      }
    }
  }

  return suggestions;
}

// "이월소진" 대상들에 대해 가격(할인) 제안을 계산합니다.
// PIP 파일(사이즈별 재고)이 있으면 사이즈 완성도를 반영해서 할인폭을 다르게 합니다:
// 사이즈가 골고루 남아있으면(완성도 높음) 할인을 덜, 많이 빠졌으면(완성도 낮음) 할인을 더.
export function buildPriceSuggestions(styles: WeeklyStyleRow[], sizeCoverageMap: Map<string, SizeCoverage> | null): PriceSuggestion[] {
  // buildSuggestions()의 "이월소진" 후보 조건과 동일하게 맞춤(품번 파싱 기반 이월 판정 포함).
  const carryovers = styles.filter((s) => {
    const slowMoving = s.sellThroughPct <= THRESHOLDS.carryoverMaxSellThrough && s.stockTotal >= THRESHOLDS.carryoverMinStock;
    if (!slowMoving) return false;
    const parsed = parseStyleCode(s.styleCode);
    // 품번을 못 읽으면(판정불가) 예전처럼 포함, 읽었는데 당해시즌 신상이면 제외.
    return !parsed || isCarryover(parsed);
  });

  return carryovers.map((s) => {
    const currentPrice = s.promoPrice > 0 ? s.promoPrice : s.offPrice > 0 ? s.offPrice : s.salePrice;
    const costRatio = currentPrice > 0 ? s.cost / currentPrice : 0;
    const coverage = sizeCoverageMap?.get(s.styleCode) || null;
    const parsed = parseStyleCode(s.styleCode);
    const seasonAppropriate = parsed ? isSeasonAppropriateNow(parsed.season) : null;

    // 기본 할인폭: 판매율이 낮을수록, 재고가 많을수록 더 깊게. 사이즈 완성도가 낮으면(결품 많으면)
    // 더 적극적으로 할인해서 빨리 소진, 완성도가 높으면(사이즈 다 있으면) 할인을 덜 함.
    let baseDiscount = 0.3; // 기본 30%
    if (s.stockTotal >= 1000) baseDiscount += 0.1;
    if (s.sellThroughPct <= 0.05) baseDiscount += 0.1;
    // 지금 계절과 안 맞는 이월(예: 가을에 여름 이월)은 시즌이 더 지나기 전에 더 빨리 털어야 하므로
    // 할인폭을 좀 더 키움(간절기 대칭 규칙, 품번체계.md §2 참고).
    if (seasonAppropriate === false) baseDiscount += 0.1;

    if (coverage) {
      // 완성도 1(사이즈 다 있음)이면 -10%p, 완성도 0(다 빠짐)이면 +10%p
      baseDiscount += (0.5 - coverage.coverageRatio) * 0.2;
    }
    const suggestedDiscountRate = Math.min(0.7, Math.max(0.1, baseDiscount));
    const suggestedPrice = Math.round((currentPrice * (1 - suggestedDiscountRate)) / 100) * 100;

    const coverageText = coverage ? `사이즈 ${coverage.sizesInStock}/${coverage.totalSizes}종 보유(완성도 ${(coverage.coverageRatio * 100).toFixed(0)}%)` : "사이즈 데이터 없음";
    const seasonText = parsed ? `${parsed.year}년 ${SEASON_LABEL[parsed.season]}${seasonAppropriate === false ? " · 비시즌 이월" : ""}` : "시즌 판정불가";

    return {
      styleCode: s.styleCode,
      productName: s.productName,
      cost: s.cost,
      currentPrice,
      costRatio,
      suggestedDiscountRate,
      suggestedPrice,
      sizeCoverageRatio: coverage ? coverage.coverageRatio : null,
      reason: `${seasonText} · ${coverageText} — 현재가 대비 ${(suggestedDiscountRate * 100).toFixed(0)}% 할인 제안 (원가율 ${(costRatio * 100).toFixed(0)}%)`,
    };
  });
}
