// MARK 2026-10-12: "라운딩" 체크리스트 — 소천님이 올려주신 매장방문기록_모듈.xlsx의
// "방문기록" 시트 Q~AN열(24개 O/X 항목, 배점은 3행 "배점 →")을 그대로 가져왔습니다.
// 카테고리별 만점: 인사관리 28점 · 매장관리 24점 · 매출관리 30점 · 재고관리 18점 = 총 100점.
// 등급: A 91↑ · B 81↑ · C 71↑ · D 61↑ · E 51↑ · F 51미만 (원본 등급 공식과 동일).
//
// 이 파일은 googleapis 등 서버 전용 모듈을 전혀 안 써서, 서버(lib/roundingVisit.ts)와
// 클라이언트 컴포넌트(components/RoundingDashboard.tsx) 양쪽에서 그대로 import해 씁니다
// (서버 전용 코드가 섞인 파일을 "use client" 컴포넌트에서 import하면 빌드가 깨집니다).

export type RoundingCategory = "인사관리" | "매장관리" | "매출관리" | "재고관리";

export interface RoundingChecklistItem {
  key: string;
  label: string;
  category: RoundingCategory;
  weight: number;
}

export const ROUNDING_CHECKLIST: RoundingChecklistItem[] = [
  { key: "mws", label: "MWS(TO)", category: "인사관리", weight: 4 },
  { key: "wws", label: "WWS", category: "인사관리", weight: 4 },
  { key: "dws", label: "DWS", category: "인사관리", weight: 5 },
  { key: "cs", label: "CS", category: "인사관리", weight: 5 },
  { key: "staffMove", label: "직원 움직임", category: "인사관리", weight: 5 },
  { key: "training", label: "육성계획", category: "인사관리", weight: 5 },
  { key: "storeCheck", label: "매장체크", category: "매장관리", weight: 4 },
  { key: "opsPlan", label: "운영계획", category: "매장관리", weight: 4 },
  { key: "cleaning", label: "청소", category: "매장관리", weight: 4 },
  { key: "merchArrange", label: "상품정리", category: "매장관리", weight: 4 },
  { key: "merchFillUp", label: "상품필업", category: "매장관리", weight: 4 },
  { key: "backRoom", label: "후방관리", category: "매장관리", weight: 4 },
  { key: "salesAnalysis", label: "판매분석", category: "매출관리", weight: 5 },
  { key: "salesPlan", label: "판매계획", category: "매출관리", weight: 5 },
  { key: "stockPlan", label: "재고계획", category: "매출관리", weight: 5 },
  { key: "layout", label: "레이아웃", category: "매출관리", weight: 5 },
  { key: "vmd", label: "VMD", category: "매출관리", weight: 5 },
  { key: "infoAwareness", label: "정보숙지", category: "매출관리", weight: 5 },
  { key: "warehousePlan", label: "창고계획", category: "재고관리", weight: 3 },
  { key: "warehouseOps", label: "창고운영", category: "재고관리", weight: 3 },
  { key: "warehouseInfo", label: "정보숙지", category: "재고관리", weight: 3 },
  { key: "bGradeMgmt", label: "B품관리", category: "재고관리", weight: 3 },
  { key: "rtMgmt", label: "RT관리", category: "재고관리", weight: 3 },
  { key: "lossResponse", label: "로스대응", category: "재고관리", weight: 3 },
];

export const ROUNDING_CATEGORY_MAX: Record<RoundingCategory, number> = {
  인사관리: 28,
  매장관리: 24,
  매출관리: 30,
  재고관리: 18,
};

export const ROUNDING_CATEGORIES: RoundingCategory[] = ["인사관리", "매장관리", "매출관리", "재고관리"];

export type RoundingCheckValue = "O" | "X" | "";
export type RoundingChecklistState = Record<string, RoundingCheckValue>;

export function computeRoundingScore(checks: RoundingChecklistState) {
  const byCategory: Record<RoundingCategory, number> = { 인사관리: 0, 매장관리: 0, 매출관리: 0, 재고관리: 0 };
  for (const item of ROUNDING_CHECKLIST) {
    if (checks[item.key] === "O") byCategory[item.category] += item.weight;
  }
  const totalScore = ROUNDING_CATEGORIES.reduce((sum, c) => sum + byCategory[c], 0);
  const grade =
    totalScore >= 91 ? "A" : totalScore >= 81 ? "B" : totalScore >= 71 ? "C" : totalScore >= 61 ? "D" : totalScore >= 51 ? "E" : "F";
  return { byCategory, totalScore, grade };
}
