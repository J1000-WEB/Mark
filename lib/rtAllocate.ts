// MARK 2026-10-20: RT 품번 단위 제안 → 칼라/사이즈 단위 지시수량 배분 로직을 공용으로 분리했습니다.
// (RT 승인 app/api/rt-result 와 전체 엑셀 지시서 app/api/rt-suggestions/export 가 같이 씀)

// MARK 2026-09-17: "RT 제안은 품번 단위인데 지시서는 컬러/사이즈로 나간다" 개선 — 예전엔
// 출고점이 "갖고 있는 재고 비율"대로만 나눴어서, 받는점포가 실제로 어떤 사이즈가 부족한지는
// 전혀 반영이 안 됐습니다(출고점에 비인기 사이즈가 많으면 그 사이즈 위주로 채워지는 문제).
// dataBuilder.ts가 제안 계산 시점에 이미 구해둔 "받는점포 사이즈별 부족량"(needWeights)이
// 있으면 그 비율대로 나누고, 없거나(구버전 제안, 점포요청 수동건 등) 그 사이즈들을 출고점이
// 아예 갖고 있지 않아 가중치 합이 0이면 기존처럼 출고점 재고비율로 안전하게 폴백합니다.
export function allocateByStock(
  rows: { color: string; size: string; stock: number }[],
  qty: number,
  needWeights?: { color: string; size: string; need: number }[]
) {
  const totalStock = rows.reduce((s, r) => s + Math.max(0, Number(r.stock || 0)), 0);
  const target = Math.min(Math.max(0, Math.round(Number(qty || 0))), totalStock);
  if (!target || !totalStock) return [];

  const needMap = new Map((needWeights || []).map((w) => [`${w.color}__${w.size}`, Math.max(0, Number(w.need || 0))]));
  const needOf = (r: { color: string; size: string }) => needMap.get(`${r.color}__${r.size}`) || 0;
  const sumNeedAmongRows = needMap.size ? rows.reduce((s, r) => s + needOf(r), 0) : 0;
  const useNeed = needMap.size > 0 && sumNeedAmongRows > 0;
  const weightOf = (r: { color: string; size: string; stock: number }) =>
    useNeed ? needOf(r) : Math.max(0, Number(r.stock || 0));
  const totalWeight = useNeed ? sumNeedAmongRows : totalStock;

  const seeded = rows.map((r) => {
    const exact = (weightOf(r) / totalWeight) * target;
    const base = Math.min(r.stock, Math.floor(exact));
    return { ...r, qty: base, remain: exact - base };
  });

  let allocated = seeded.reduce((s, r) => s + r.qty, 0);
  const order = [...seeded].sort((a, b) => b.remain - a.remain || b.stock - a.stock);

  for (const r of order) {
    if (allocated >= target) break;
    const add = Math.min(r.stock - r.qty, target - allocated);
    if (add > 0) {
      r.qty += add;
      allocated += add;
    }
  }

  return seeded.filter((r) => r.qty > 0).map((r) => ({
    color: r.color,
    size: r.size,
    qty: r.qty,
  }));
}
