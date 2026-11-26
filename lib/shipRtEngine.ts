// MARK 2026-11-19: 재고MD님 "판매분출고&RT" 아티팩트(출고·RT 제안기) 계산 엔진을 그대로 옮긴 것.
// 원본: 소천님이 준 HTML(runAnalysis) — 단계·규칙·숫자를 바꾸지 않고 옮김. 입력만 파일 업로드 대신 MARK 데이터로 채움(lib/shipRtCompute.ts).
//
//  step 1  매장×SKU 상태: 재고주수 = 재고 ÷ (7일판매/분석일수×7)
//          보충(7일판매0·재고0·누계>0) / 과잉(재고주수 ≥ 등급 과잉기준) / 품절임박(≤ 품절임박기준) / 정상
//          적정재고 = 목표재고주수(매장 예외 > 등급) × 주판매, 판매0이면 min(최소잔여, 재고)
//          부족수량 = 품절임박·보충이고 대상품번(재런칭 목록 또는 GF3/GF4/GF7/GF8, "특정 품번" 설정 시 그것만)일 때 적정재고−재고
//          보충제안 = 대상품번·누계≥5·7일판매0·재고0 → 등급별 A4/B3/C2/D0
//  매장요청  창고(가용오프) 먼저 → 남은 건 같은 SKU 과잉 매장에서 RT(과잉량 큰 순 상위 N곳, 재고−2 / A등급 최대 5장)
//  step 2  창고 출고: SKU별 우선순위(등급순×100+매장순위) 순으로 가용(오프) 배분(water-fill), 못 채운 건 RT 필요량
//  step 4  RT: 주간판매 TOP N(자동=7일판매 합) 품번만, SKU별 재고주수 급한 매장부터,
//          과잉 매장(과잉량 큰 순)에서 균등 분할(evenSplitInt), 보내는 매장 cap = A등급 min(5, 재고−2) / 그 외 min(10, 재고−2)
//          매칭 매장 수 기본 2곳, 필요량 ≥10이면 4곳. 과잉 매장으로 모자라면 판매순위 낮은 매장(재고>0)에서 순서대로.
//  step 4.5 재런칭 구품번 보충: 신품번 부족분을 구품번 창고 잔여 → 구품번 과잉 매장 RT로
//  step 5  보충제안(완전품절) 출고/RT
//  step 6  이동 후 예상재고
// 금일 지시현황(이미 나간 RT)은 보내는 매장 재고에서 먼저 뺌(받는 매장엔 안 더함).

export type Grade = "A" | "B" | "C" | "D";
export type ShipRtStore = { code: string; name: string; grade: Grade | string; rank: number };
export type ShipRtConfig = {
  defaultWeeks: number;
  defaultExcess: number;
  soldoutTh: number;
  periodDays: number;
  minStock: number;
  topN: number;
  rtMaxSuppliers: number;
  bigNeedThreshold: number;
  bigNeedMaxSuppliers: number;
  grades: Record<string, { weeks: number; excess: number }>;
  stores: ShipRtStore[];
  storeWeeksOverride: Record<string, number>; // 매장코드 → 재고주수
  storeStyleExclude: Record<string, string[]>; // 매장코드 → RT로 빼지 않을 품번
  shipStoreFilter: string[]; // 오늘 출고/RT 받을 매장만(비면 전체)
  specificStyles: string[]; // 이 품번만 처리(비면 평소 기준)
  bestAuto: boolean;
  bestList: string[]; // bestAuto 꺼졌을 때 수동 순위
  shipRound: string; // 출고차수
};

export const DEFAULT_SHIP_RT_CONFIG: ShipRtConfig = {
  defaultWeeks: 3,
  defaultExcess: 4.3,
  soldoutTh: 2,
  periodDays: 7,
  minStock: 2,
  topN: 30,
  rtMaxSuppliers: 2,
  bigNeedThreshold: 10,
  bigNeedMaxSuppliers: 4,
  grades: { A: { weeks: 3, excess: 7 }, B: { weeks: 3, excess: 5.5 }, C: { weeks: 2, excess: 4.3 }, D: { weeks: 2, excess: 3 } },
  stores: [
    ["21030", "성수 플래그십", "A", 1], ["36001", "롯데백화점 광복점", "A", 2], ["46003", "롯데아울렛 김해점", "A", 3],
    ["54001", "현대커넥트 청주점", "A", 4], ["42002", "현대아울렛 송도점", "A", 5], ["21011", "신사 플래그십", "A", 6],
    ["51018", "아이파크몰 용산점", "B", 7], ["41001", "롯데아울렛 서울역점", "B", 8], ["52006", "스타필드 고양점", "B", 9],
    ["32005", "신세계 의정부점", "B", 10], ["51024", "타임스퀘어 영등포점", "B", 11], ["31001", "신세계 센텀시티점", "B", 12],
    ["55001", "LF스퀘어 광양점", "B", 13], ["32033", "롯데백화점 평촌점", "B", 14], ["46004", "롯데아울렛 동부산", "C", 15],
    ["34002", "신세계 대전점", "C", 16], ["52034", "스타필드 빌리지 운정점", "C", 17], ["35002", "신세계 광주점", "C", 18],
    ["42004", "현대아울렛 남양주점", "C", 19], ["21034", "서울숲 플래그십", "C", 20], ["31031", "현대백화점 신촌점", "C", 21],
    ["21012", "한남 플래그십", "D", 22],
  ].map(([code, name, grade, rank]) => ({ code: String(code), name: String(name), grade: String(grade), rank: Number(rank) })),
  storeWeeksOverride: { "21030": 2 },
  storeStyleExclude: { "46004": ["GF7LKC503", "WBD3L04503", "WBD3L04501", "GF7LKC501", "GF3LSH504", "GF3LSH508", "GF7LSH507"] },
  shipStoreFilter: [],
  specificStyles: [],
  bestAuto: true,
  bestList: [],
  shipRound: "",
};

export type StoreSkuRow = { storeCode: string; storeName: string; style: string; color: string; size: string; stock: number; cum: number; period: number };
export type WhRow = { style: string; color: string; size: string; availOff: number; barcode: string };
export type IssuedRt = { fromStore: string; style: string; color: string; size: string; qty: number };
export type StoreRequest = { storeCode: string; style: string; color: string; size: string; qty: number; note?: string };
// 2026-11-26 소천님: 매장요청(반출) — 매장이 빼고 싶은 품번. 칼라·사이즈를 비우면 그 매장 그 품번(칼라) 재고 전부, 수량 0/비우면 그 SKU 재고 전부
export type StoreOutRequest = { storeCode: string; style: string; color?: string; size?: string; qty?: number; note?: string };

const GRADE_ORDER = ["A", "B", "C", "D"];
const r1 = (x: number) => Math.round(x * 10) / 10;

export function runShipRtEngine(input: {
  cfg: ShipRtConfig;
  storeRaw: StoreSkuRow[];
  whRaw: WhRow[];
  issuedToday?: IssuedRt[];
  storeRequests?: StoreRequest[];
  storeOutRequests?: StoreOutRequest[];
  relaunchNewToOld?: Map<string, string>; // 신품번 → 구품번
  relaunchSet?: Set<string>; // 재런칭 목록(신·구 모두)
}) {
  const cfg = input.cfg;
  const storeRaw = input.storeRaw, whRaw = input.whRaw;
  const relaunchNewToOld = input.relaunchNewToOld || new Map<string, string>();
  const relaunchSet = input.relaunchSet || new Set<string>();
  const stores = new Map(cfg.stores.map((s) => [String(s.code), s]));
  const specificStyles = new Set(cfg.specificStyles || []);
  const shipStoreFilter = new Set((cfg.shipStoreFilter || []).map(String));
  const exclude = new Map(Object.entries(cfg.storeStyleExclude || {}).map(([k, v]) => [String(k), new Set(v)]));
  const isStoreStyleExcluded = (code: string, style: string) => !!exclude.get(String(code))?.has(style);

  // 주판BEST 자동계산(7일판매 합 순위) — 끄면 수동 목록
  let autoBestTop = new Set((cfg.bestList || []).slice(0, cfg.topN));
  if (cfg.bestAuto) {
    const periodByStyle = new Map<string, number>();
    storeRaw.forEach((r) => periodByStyle.set(r.style, (periodByStyle.get(r.style) || 0) + (r.period || 0)));
    autoBestTop = new Set([...periodByStyle.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]).slice(0, cfg.topN));
  }

  const whMap = new Map<string, { availOff: number; barcode: string }>();
  whRaw.forEach((r) => {
    const key = `${r.style}|${r.color}|${r.size}`;
    if (!whMap.has(key)) whMap.set(key, { availOff: 0, barcode: r.barcode });
    const e = whMap.get(key)!;
    e.availOff += r.availOff;
    if (!e.barcode) e.barcode = r.barcode;
  });

  const issuedTodayMap = new Map<string, number>();
  (input.issuedToday || []).forEach((r) => {
    const key = `${r.fromStore}|${r.style}|${r.color}|${r.size}`;
    issuedTodayMap.set(key, (issuedTodayMap.get(key) || 0) + r.qty);
  });

  // ── 매장요청: 창고 먼저 ──
  const requestShipLines: any[] = [];
  const requestRemaining: any[] = [];
  (input.storeRequests || []).forEach((req) => {
    const si = stores.get(String(req.storeCode));
    const storeName = si ? si.name : req.storeCode;
    const key = `${req.style}|${req.color}|${req.size}`;
    const wh = whMap.get(key);
    const availOff = wh ? wh.availOff : 0;
    const shipQty = Math.min(req.qty, Math.max(0, availOff));
    if (shipQty > 0 && wh) {
      requestShipLines.push({ storeCode: String(req.storeCode), storeName, style: req.style, color: req.color, size: req.size, qty: shipQty, barcode: wh.barcode, note: req.note || "" });
      wh.availOff -= shipQty;
    }
    const remain = req.qty - shipQty;
    if (remain > 1e-9) requestRemaining.push({ storeCode: String(req.storeCode), storeName, style: req.style, color: req.color, size: req.size, need: remain, note: req.note || "" });
  });

  const targetStyle = (style: string) => {
    if (relaunchSet.has(style)) return true;
    const p = style.slice(0, 3).toUpperCase();
    return p === "GF3" || p === "GF4" || p === "GF7" || p === "GF8";
  };

  // ── step 1 ──
  const rows: any[] = [];
  storeRaw.forEach((r) => {
    const si = stores.get(String(r.storeCode));
    if (!si) return;
    const issuedQty = issuedTodayMap.get(`${r.storeCode}|${r.style}|${r.color}|${r.size}`) || 0;
    const stock = Math.max(0, r.stock - issuedQty);
    const mask = r.period > 0 || stock > 0 || (stock === 0 && r.cum > 0);
    if (!mask) return;
    const skuKey = `${r.style}-${r.color}-${r.size}`;
    const grade = String(si.grade);
    const gradeCfg = cfg.grades[grade];
    const storeWeeksOv = cfg.storeWeeksOverride?.[String(r.storeCode)];
    const weeksTarget = storeWeeksOv != null ? storeWeeksOv : gradeCfg ? gradeCfg.weeks : cfg.defaultWeeks;
    const excessTh = gradeCfg ? gradeCfg.excess : cfg.defaultExcess;
    const rank = si.rank != null ? si.rank : 99;
    const weekly = (r.period / cfg.periodDays) * 7;
    const stockWeeks = r.period === 0 ? (stock === 0 ? 0 : 99) : stock / weekly;
    const properStock = r.period === 0 ? (stock === 0 ? 0 : Math.min(cfg.minStock, stock)) : weeksTarget * weekly;
    const diff = stock - properStock;
    let status: string;
    if (r.period === 0 && stock === 0 && r.cum > 0) status = "보충";
    else if (stockWeeks >= excessTh) status = "과잉";
    else if (stockWeeks <= cfg.soldoutTh) status = "품절임박";
    else status = "정상";
    const wh = whMap.get(`${r.style}|${r.color}|${r.size}`);
    const availOff = wh ? wh.availOff : 0;
    const gradeRankIdx = GRADE_ORDER.indexOf(grade);
    const gradeRank = gradeRankIdx >= 0 ? gradeRankIdx + 1 : 99;
    const priorityScore = gradeRank * 100 + rank;
    const isTarget = specificStyles.size > 0 ? specificStyles.has(r.style) : targetStyle(r.style);
    const shortage = (status === "품절임박" || status === "보충") && isTarget ? Math.max(0, -diff) : 0;
    const bonusTargetMet = isTarget && r.cum >= 5 && r.period === 0 && stock === 0;
    const bonusTarget = grade === "A" ? 4 : grade === "B" ? 3 : grade === "C" ? 2 : 0;
    const bonusShortage = bonusTargetMet ? bonusTarget : 0;
    rows.push({
      storeCode: String(r.storeCode), storeName: si.name || r.storeName, style: r.style, color: r.color, size: r.size, skuKey,
      cum: r.cum, period: r.period, stock, issuedQty, stockWeeks, properStock, diff, status,
      grade, weeksTarget, excessTh, rank, availOff, barcode: wh ? wh.barcode : "",
      gradeRank, priorityScore, isTarget, shortage, bonusTargetMet, bonusTarget, bonusShortage,
      shipQty: 0, rtNeed: 0, bonusShipQty: 0, bonusRtNeed: 0,
    });
  });

  const bySku = new Map<string, any[]>();
  rows.forEach((r) => {
    if (!bySku.has(r.skuKey)) bySku.set(r.skuKey, []);
    bySku.get(r.skuKey)!.push(r);
  });

  function recalcStatus(r: any) {
    if (r.period === 0) {
      r.stockWeeks = r.stock === 0 ? 0 : 99;
      r.properStock = r.stock === 0 ? 0 : Math.min(cfg.minStock, r.stock);
    } else {
      r.stockWeeks = r.stock / ((r.period / cfg.periodDays) * 7);
      r.properStock = r.weeksTarget * ((r.period / cfg.periodDays) * 7);
    }
    r.diff = r.stock - r.properStock;
    if (r.period === 0 && r.stock === 0 && r.cum > 0) r.status = "보충";
    else if (r.stockWeeks >= r.excessTh) r.status = "과잉";
    else if (r.stockWeeks <= cfg.soldoutTh) r.status = "품절임박";
    else r.status = "정상";
  }
  const capOf = (r: any) => (r.grade === "A" ? Math.max(0, Math.min(5, r.stock - 2)) : Math.max(0, Math.min(10, r.stock - 2)));

  // 정수 균등 분할: 너무 작은 공급처는 다 쓰고 나머지를 다시 나눔. eligible 원소의 .cap을 줄임
  function evenSplitInt(target: number, eligible: { row: any; cap: number }[]) {
    target = Math.max(0, target);
    const result = new Map<any, number>();
    if (target <= 1e-9 || !eligible.length) return result;
    const pool = eligible.map((s) => ({ s, remCap: s.cap, alloc: 0 }));
    let demand = target, guard = 0;
    while (demand > 1e-9 && guard++ < 200) {
      const active = pool.filter((p) => p.remCap - p.alloc > 1e-9);
      if (!active.length) break;
      const share = demand / active.length;
      let given = 0;
      active.forEach((p) => {
        const give = Math.min(share, p.remCap - p.alloc);
        p.alloc += give;
        given += give;
      });
      demand -= given;
      if (given < 1e-9) break;
    }
    const totalCap = pool.reduce((a, p) => a + p.remCap, 0);
    const actualTotal = Math.round(Math.min(target, totalCap) * 1000) / 1000;
    const withFrac = pool.map((p) => ({ p, floor: Math.floor(p.alloc + 1e-6), frac: p.alloc + 1e-6 - Math.floor(p.alloc + 1e-6) }));
    const flooredTotal = withFrac.reduce((a, x) => a + x.floor, 0);
    let deficit = Math.round(actualTotal) - flooredTotal;
    withFrac.sort((a, b) => b.frac - a.frac);
    withFrac.forEach((x) => result.set(x.p.s, x.floor));
    let i = 0, spins = 0;
    while (deficit > 0 && spins < withFrac.length * 3) {
      const x = withFrac[i % withFrac.length];
      const cur = result.get(x.p.s)!;
      if (cur < x.p.remCap) {
        result.set(x.p.s, cur + 1);
        deficit--;
      }
      i++;
      spins++;
    }
    result.forEach((qty, s) => (s.cap -= qty));
    return result;
  }

  // ── 매장요청 RT ──
  const requestRtLines: any[] = [];
  const requestReasons = new Map<any, string>();
  const baseMaxSup = Math.max(1, cfg.rtMaxSuppliers || 2);
  const bigNeedTh = Math.max(0, cfg.bigNeedThreshold ?? 10);
  const bigNeedMaxSup = Math.max(baseMaxSup, cfg.bigNeedMaxSuppliers ?? 4);
  const maxSupFor = (need: number) => (need >= bigNeedTh ? bigNeedMaxSup : baseMaxSup);
  requestRemaining.forEach((req) => {
    const skuKey = `${req.style}-${req.color}-${req.size}`;
    const group = bySku.get(skuKey) || [];
    const suppliers = group
      .filter((r) => r.status === "과잉" && r.storeCode !== String(req.storeCode) && !isStoreStyleExcluded(r.storeCode, r.style))
      .sort((a, b) => b.diff - a.diff)
      .slice(0, maxSupFor(req.need))
      .map((r) => ({ row: r, cap: capOf(r) }));
    const totalCap = suppliers.reduce((a, s) => a + s.cap, 0);
    if (!group.length) {
      requestReasons.set(req, `매장 재고에 이 SKU(${skuKey}) 자체가 없어요(스타일/칼라/사이즈 철자 확인).`);
      return;
    }
    if (!suppliers.length) {
      requestReasons.set(req, `창고 가용 없음 + 같은 SKU를 "과잉"으로 가진 다른 매장이 없어 RT로도 못 채웠어요(보유 매장 ${group.length}곳 중 과잉 0곳).`);
      return;
    }
    if (totalCap < req.need - 1e-6) {
      requestReasons.set(req, `과잉 매장(${suppliers.map((s) => `${s.row.storeName} ${Math.round(s.cap)}개`).join(", ")})의 보낼 수 있는 양이 모자라 요청 ${req.need}개를 다 못 채웠어요(재고−2장, A등급 5장 제한).`);
    }
    const alloc = evenSplitInt(req.need, suppliers);
    alloc.forEach((qty, supplier) => {
      if (qty > 0) {
        requestRtLines.push({ storeCode: req.storeCode, storeName: req.storeName, style: req.style, color: req.color, size: req.size, qty, exportStoreCode: supplier.row.storeCode, exportStoreName: supplier.row.storeName, exportGrade: supplier.row.grade, note: req.note || "" });
        (supplier.row.rtOutDetail = supplier.row.rtOutDetail || []).push({ name: req.storeName, qty });
        supplier.row.stock -= qty;
        recalcStatus(supplier.row);
      }
    });
  });

  // ── step 2: 창고 출고 water-fill ──
  function waterfill(group: any[], demandKey: string, capField: string, outAlloc: string, outRem: string) {
    const sorted = group.slice().sort((a, b) => a.priorityScore - b.priorityScore);
    let cumulative = 0, pending = 0, lastScore: number | null = null;
    sorted.forEach((r) => {
      if (lastScore !== null && r.priorityScore !== lastScore) {
        cumulative += pending;
        pending = 0;
      }
      lastScore = r.priorityScore;
      const demand = r[demandKey];
      const cap = r[capField];
      let alloc = 0;
      if (demand > 0) alloc = Math.min(demand, Math.max(0, cap - cumulative));
      r[outAlloc] = alloc;
      r[outRem] = demand - alloc;
      pending += demand;
    });
  }
  const shipFilterOn = shipStoreFilter.size > 0;
  bySku.forEach((group) => {
    const active = shipFilterOn ? group.filter((r) => shipStoreFilter.has(String(r.storeCode))) : group;
    waterfill(active, "shortage", "availOff", "shipQty", "rtNeed");
    waterfill(active, "bonusShortage", "availOff", "bonusShipQty", "bonusRtNeed");
  });

  // ── step 3: 출고 ──
  const chulgoRows = rows.filter((r) => r.shipQty > 0).map((r) => ({
    style: r.style, color: r.color, size: r.size, storeCode: r.storeCode, storeName: r.storeName,
    shortage: r1(r.shortage), availOff: r.availOff, qty: r.shipQty, barcode: r.barcode,
    reason: `[${r.storeName}] 품절임박/보충(부족 ${r1(r.shortage)}개) ← 우선배분 후 출고 ${r1(r.shipQty)}개 (물류 가용(오프) ${r1(r.availOff)}개 중 상위매장 순차배분)`,
  }));
  const chulgoUpload = chulgoRows.map((r) => ({ 채널: r.storeCode, 바코드: r.barcode, 출고차수: cfg.shipRound, 의뢰수량: r.qty, 대분류: "", 비고: "부족재고보충" }));

  // ── step 4: RT ──
  const byStoreSku = new Map<string, any>();
  rows.forEach((r) => byStoreSku.set(`${r.storeCode}|${r.skuKey}`, r));
  [...requestShipLines, ...requestRtLines].forEach((l) => {
    const r = byStoreSku.get(`${l.storeCode}|${l.style}-${l.color}-${l.size}`);
    if (r) r.requestInQty = (r.requestInQty || 0) + l.qty;
  });

  const rtEligible = (s: string) => (specificStyles.size > 0 ? specificStyles.has(s) : autoBestTop.has(s));
  const candidatesBySku = new Map<string, any[]>();
  rows.filter((r) => r.rtNeed > 0 && rtEligible(r.style)).forEach((c) => {
    if (!candidatesBySku.has(c.skuKey)) candidatesBySku.set(c.skuKey, []);
    candidatesBySku.get(c.skuKey)!.push(c);
  });

  const idongLines: any[] = [];
  candidatesBySku.forEach((demanders, skuKey) => {
    const group = bySku.get(skuKey) || [];
    const suppliersAll = group
      .filter((r) => r.status === "과잉" && !isStoreStyleExcluded(r.storeCode, r.style))
      .sort((a, b) => b.diff - a.diff)
      .map((r) => ({ row: r, cap: capOf(r) }));
    const excessCodes = new Set(suppliersAll.map((s) => s.row.storeCode));
    const fallbackPoolAll = group
      .filter((r) => r.stock > 0 && !excessCodes.has(r.storeCode) && !isStoreStyleExcluded(r.storeCode, r.style))
      .map((r) => ({ row: r, cap: capOf(r) }))
      .sort((a, b) => (b.row.rank || 0) - (a.row.rank || 0));
    demanders.slice().sort((a, b) => a.stockWeeks - b.stockWeeks).forEach((c) => {
      let remaining = c.rtNeed;
      let anyGiven = false;
      const thisMaxSup = maxSupFor(c.rtNeed);
      const eligible = suppliersAll.slice(0, thisMaxSup).filter((s) => s.cap > 1e-9 && s.row.storeCode !== c.storeCode);
      if (eligible.length && remaining > 1e-9) {
        const alloc = evenSplitInt(remaining, eligible);
        let given = 0;
        alloc.forEach((qty, supplier) => {
          if (qty > 0) {
            idongLines.push({ c, exportStore: supplier.row, qty, matchType: "과잉재고매장" });
            given += qty;
            anyGiven = true;
            c.rtInQty = (c.rtInQty || 0) + qty;
            supplier.row.rtOutQty = (supplier.row.rtOutQty || 0) + qty;
            (supplier.row.rtOutDetail = supplier.row.rtOutDetail || []).push({ name: c.storeName, qty });
          }
        });
        remaining -= given;
      }
      if (remaining > 1e-9) {
        for (const f of fallbackPoolAll.slice(0, thisMaxSup)) {
          if (remaining <= 1e-9) break;
          if (f.row.storeCode === c.storeCode || f.cap <= 1e-9) continue;
          const take = Math.min(remaining, f.cap);
          if (take > 1e-9) {
            idongLines.push({ c, exportStore: f.row, qty: take, matchType: "하위판매매장" });
            c.rtInQty = (c.rtInQty || 0) + take;
            f.row.rtOutQty = (f.row.rtOutQty || 0) + take;
            (f.row.rtOutDetail = f.row.rtOutDetail || []).push({ name: c.storeName, qty: take });
            f.cap -= take;
            remaining -= take;
            anyGiven = true;
          }
        }
      }
      if (!anyGiven) idongLines.push({ c, exportStore: null, qty: 0, matchType: "매칭없음" });
    });
  });

  const rtUpload = idongLines.filter((l) => l.qty > 0).map((l) => ({
    보낼채널코드: l.exportStore.storeCode, 받을채널코드: l.c.storeCode, 스타일: l.c.style, 칼라: l.c.color, 사이즈: l.c.size,
    지시수량: l.qty, 승인날짜: "", 보낼매장명: l.exportStore.storeName, 받을매장명: l.c.storeName,
  }));
  const byDemander = new Map<string, any[]>();
  idongLines.forEach((l) => {
    const key = `${l.c.storeCode}|${l.c.skuKey}`;
    if (!byDemander.has(key)) byDemander.set(key, []);
    byDemander.get(key)!.push(l);
  });
  const splitSummaries = new Map<any, string>();
  byDemander.forEach((lines) => {
    const matched = lines.filter((l) => l.qty > 0);
    const summary = matched.length > 1 ? `${matched.length}개 매장 분산: ` + matched.map((l) => `${l.exportStore.storeName} ${l.qty}개`).join(" + ") : "";
    lines.forEach((l) => splitSummaries.set(l, summary));
  });
  const idongDetail = idongLines.map((l) => ({
    style: l.c.style, color: l.c.color, size: l.c.size,
    exportStoreCode: l.exportStore ? l.exportStore.storeCode : "", exportStoreName: l.exportStore ? l.exportStore.storeName : "매칭없음",
    exportGrade: l.exportStore ? l.exportStore.grade : "", exportStock: l.exportStore ? l.exportStore.stock : "",
    exportExcess: l.exportStore && l.matchType === "과잉재고매장" ? r1(l.exportStore.diff) : "", matchType: l.matchType,
    importStoreCode: l.c.storeCode, importStoreName: l.c.storeName, needQty: r1(l.c.rtNeed),
    importStock: l.c.stock, importWeeks: r1(l.c.stockWeeks), allocQty: l.qty, splitNote: splitSummaries.get(l) || "",
  }));

  // ── step 4.5: 재런칭 구품번 보충 ──
  const relaunchFallback: any[] = [];
  const oldSkuPools = new Map<string, any>();
  function getOldSkuPool(oldStyle: string, color: string, size: string) {
    const oldSkuKey = `${oldStyle}-${color}-${size}`;
    if (oldSkuPools.has(oldSkuKey)) return oldSkuPools.get(oldSkuKey);
    const oldWh = whMap.get(`${oldStyle}|${color}|${size}`);
    const oldGroup = bySku.get(oldSkuKey) || [];
    const oldOwnShipped = oldGroup.reduce((a, r) => a + (r.shipQty || 0), 0);
    const whRemain = Math.max(0, (oldWh ? oldWh.availOff : 0) - oldOwnShipped);
    const storeSuppliers = oldGroup
      .filter((r) => r.status === "과잉" && !isStoreStyleExcluded(r.storeCode, oldStyle))
      .map((r) => ({ row: r, cap: Math.max(0, (r.grade === "A" ? Math.min(5, r.stock - 2) : Math.min(10, r.stock - 2)) - (r.rtOutQty || 0) - (r.bonusRtOutQty || 0)) }))
      .filter((s) => s.cap > 1e-9)
      .sort((a, b) => b.cap - a.cap);
    const pool = { whRemain, whBarcode: oldWh ? oldWh.barcode : "", storeSuppliers };
    oldSkuPools.set(oldSkuKey, pool);
    return pool;
  }
  rows
    .filter((r) => relaunchNewToOld.has(r.style) && Math.max(0, (r.rtNeed || 0) - (r.rtInQty || 0)) > 1e-9)
    .sort((a, b) => a.stockWeeks - b.stockWeeks)
    .forEach((r) => {
      const oldStyle = relaunchNewToOld.get(r.style)!;
      let remaining = Math.max(0, (r.rtNeed || 0) - (r.rtInQty || 0));
      if (remaining <= 1e-9) return;
      const pool = getOldSkuPool(oldStyle, r.color, r.size);
      if (pool.whRemain > 1e-9) {
        const take = Math.min(remaining, pool.whRemain);
        if (take > 1e-9) {
          relaunchFallback.push({ row: r, oldStyle, qty: take, source: "물류", barcode: pool.whBarcode });
          pool.whRemain -= take;
          remaining -= take;
          r.relaunchInQty = (r.relaunchInQty || 0) + take;
        }
      }
      if (remaining > 1e-9 && pool.storeSuppliers.length) {
        const eligible = pool.storeSuppliers.filter((s: any) => s.cap > 1e-9 && s.row.storeCode !== r.storeCode).slice(0, maxSupFor(remaining));
        if (eligible.length) {
          evenSplitInt(remaining, eligible).forEach((qty, supplier) => {
            if (qty > 0) {
              relaunchFallback.push({ row: r, oldStyle, qty, source: "매장RT", fromStore: supplier.row });
              supplier.row.rtOutQty = (supplier.row.rtOutQty || 0) + qty;
              (supplier.row.rtOutDetail = supplier.row.rtOutDetail || []).push({ name: `${r.storeName} (재런칭:${oldStyle}→${r.style})`, qty });
              r.relaunchInQty = (r.relaunchInQty || 0) + qty;
              remaining -= qty;
            }
          });
        }
      }
    });
  const relaunchFallbackShipUpload = relaunchFallback.filter((f) => f.source === "물류").map((f) => ({
    채널: f.row.storeCode, 바코드: f.barcode, 출고차수: cfg.shipRound, 의뢰수량: f.qty, 대분류: "", 비고: `재런칭보충(구품번 ${f.oldStyle} 창고재고 → 신품번 ${f.row.style})`,
  }));
  const relaunchFallbackRtUpload = relaunchFallback.filter((f) => f.source === "매장RT").map((f) => ({
    보낼채널코드: f.fromStore.storeCode, 받을채널코드: f.row.storeCode, 스타일: f.oldStyle, 칼라: f.row.color, 사이즈: f.row.size,
    지시수량: f.qty, 승인날짜: "", 보낼매장명: f.fromStore.storeName, 받을매장명: `${f.row.storeName} (재런칭:${f.oldStyle}→${f.row.style})`,
  }));
  const relaunchFallbackDetail = relaunchFallback.map((f) => ({
    신품번: f.row.style, 구품번: f.oldStyle, 칼라: f.row.color, 사이즈: f.row.size, 매장코드: f.row.storeCode, 매장명: f.row.storeName,
    충당방식: f.source === "물류" ? "구품번 물류출고" : "구품번 매장RT", 출처매장: f.source === "물류" ? "물류창고" : f.fromStore?.storeName || "", 충당수량: f.qty,
  }));

  // ── step 5: 보충제안(완전품절) ──
  const bonusShip = rows.filter((r) => r.bonusShipQty > 0).map((r) => ({
    style: r.style, color: r.color, size: r.size, storeCode: r.storeCode, storeName: r.storeName, grade: r.grade,
    cum: r.cum, target: r.bonusTarget, availOff: r.availOff, qty: r.bonusShipQty, barcode: r.barcode,
  }));
  const bonusShipUpload = bonusShip.map((r) => ({ 채널: r.storeCode, 바코드: r.barcode, 출고차수: cfg.shipRound, 의뢰수량: r.qty, 대분류: "", 비고: "보충제안(완전품절)" }));
  const bonusRtBySku = new Map<string, any[]>();
  rows.filter((r) => r.bonusRtNeed > 0).forEach((c) => {
    if (!bonusRtBySku.has(c.skuKey)) bonusRtBySku.set(c.skuKey, []);
    bonusRtBySku.get(c.skuKey)!.push(c);
  });
  const bonusRt: any[] = [];
  bonusRtBySku.forEach((demanders, skuKey) => {
    const suppliers = (bySku.get(skuKey) || [])
      .filter((r) => r.status === "과잉" && !isStoreStyleExcluded(r.storeCode, r.style))
      .sort((a, b) => b.diff - a.diff)
      .map((r) => ({ row: r, cap: capOf(r) }));
    demanders.forEach((c) => {
      const base = { skuKey: c.skuKey, style: c.style, color: c.color, size: c.size, storeCode: c.storeCode, storeName: c.storeName, need: r1(c.bonusRtNeed) };
      const eligible = suppliers.filter((s) => s.cap > 1e-9 && s.row.storeCode !== c.storeCode);
      if (!eligible.length) {
        bonusRt.push({ ...base, exportStoreCode: "", exportStoreName: "매칭없음", exportGrade: "", qty: 0 });
        return;
      }
      let given = 0;
      evenSplitInt(c.bonusRtNeed, eligible).forEach((qty, supplier) => {
        if (qty > 0) {
          given += qty;
          c.bonusRtInQty = (c.bonusRtInQty || 0) + qty;
          supplier.row.bonusRtOutQty = (supplier.row.bonusRtOutQty || 0) + qty;
          (supplier.row.rtOutDetail = supplier.row.rtOutDetail || []).push({ name: c.storeName, qty });
          bonusRt.push({ ...base, exportStoreCode: supplier.row.storeCode, exportStoreName: supplier.row.storeName, exportGrade: supplier.row.grade, qty });
        }
      });
      if (given < 1e-9) bonusRt.push({ ...base, exportStoreCode: "", exportStoreName: "매칭없음", exportGrade: "", qty: 0 });
    });
  });
  const bonusRtUpload = bonusRt.filter((l) => l.qty > 0).map((l) => ({
    보낼채널코드: l.exportStoreCode, 받을채널코드: l.storeCode, 스타일: l.style, 칼라: l.color, 사이즈: l.size,
    지시수량: l.qty, 승인날짜: "", 보낼매장명: l.exportStoreName, 받을매장명: l.storeName,
  }));

  // ── 매장요청(반출) — 2026-11-26 소천님 ──
  // 위 출고·RT를 다 반영한 "예상 재고" 기준으로 받을 매장을 고름:
  //  ① 같은 SKU가 적정재고보다 모자란 매장(모자란 양 큰 순, 같으면 등급·순위 높은 순) — 모자란 만큼
  //  ② 그래도 남으면 같은 품번(스타일)이 최근 잘 팔리는데 이 SKU가 1장 이하인 매장 — 2장씩(품번 판매 많은 순)
  //  ③ 그래도 남으면 창고 반품 권장
  const plannedOf = (r: any) => r.stock + (r.shipQty || 0) + (r.bonusShipQty || 0) + (r.rtInQty || 0) + (r.bonusRtInQty || 0) + (r.requestInQty || 0) + (r.relaunchInQty || 0) + (r.outReqInQty || 0) - (r.rtOutQty || 0) - (r.bonusRtOutQty || 0) - (r.outReqOutQty || 0);
  const styleSalesByStore = new Map<string, number>(); // 스타일|매장 → 기간판매
  rows.forEach((r) => styleSalesByStore.set(`${r.style}|${r.storeCode}`, (styleSalesByStore.get(`${r.style}|${r.storeCode}`) || 0) + (r.period || 0)));
  const outReqRtLines: any[] = [];
  const outReqReturn: any[] = [];
  const outReqNoMatch: any[] = [];
  (input.storeOutRequests || []).forEach((req) => {
    const code = String(req.storeCode).trim();
    const style = String(req.style || "").trim().toUpperCase();
    const color = String(req.color || "").trim().toUpperCase();
    const size = String(req.size || "").trim().toUpperCase();
    const si = stores.get(code);
    const fromName = si ? si.name : code;
    const mine = rows.filter((r) => r.storeCode === code && r.style === style && (!color || r.color === color) && (!size || r.size === size) && plannedOf(r) > 0);
    if (!mine.length) {
      outReqNoMatch.push({ exportStoreCode: code, storeCode: code, storeName: fromName, style, color, size, need: req.qty || 0, note: req.note || "", reason: si ? "이 매장에 그 품번(칼라·사이즈) 재고가 없어요 — 철자 확인" : "출고·RT 설정의 매장 목록에 없는 매장코드예요" });
      return;
    }
    let left = req.qty && req.qty > 0 ? req.qty : Infinity; // 수량 비우면 재고 전부
    for (const from of mine) {
      if (left <= 0) break;
      let give = Math.min(left, Math.floor(plannedOf(from)));
      if (give <= 0) continue;
      left -= give;
      const group = (bySku.get(from.skuKey) || []).filter((r) => r.storeCode !== code && !isStoreStyleExcluded(r.storeCode, r.style));
      const send = (to: any, qty: number, why: string) => {
        const before = plannedOf(to);
        outReqRtLines.push({
          exportStoreCode: code, exportStoreName: fromName, storeCode: to.storeCode, storeName: to.storeName, style: from.style, color: from.color, size: from.size, qty,
          importStock: r1(before), importWeeks: to.period > 0 ? r1(before / ((to.period / cfg.periodDays) * 7)) : null, why, note: req.note || "",
        });
        to.outReqInQty = (to.outReqInQty || 0) + qty;
        from.outReqOutQty = (from.outReqOutQty || 0) + qty;
        give -= qty;
      };
      // ①
      const needers = group
        .map((r) => {
          const target = r.period > 0 ? r.properStock : r.status === "보충" ? Math.max(1, r.bonusTarget || 1) : 0;
          return { r, need: Math.floor(target - plannedOf(r) + 1e-6) };
        })
        .filter((x) => x.need > 0)
        .sort((a, b) => b.need - a.need || a.r.priorityScore - b.r.priorityScore);
      for (const x of needers) {
        if (give <= 0) break;
        const q = Math.min(give, x.need);
        send(x.r, q, x.r.status === "보충" ? "품절(예전 판매 있음) 보충" : `적정재고보다 ${x.need}장 모자람`);
      }
      // ②
      if (give > 0) {
        const fans = [...stores.values()]
          .filter((st) => String(st.code) !== code && !isStoreStyleExcluded(String(st.code), from.style) && (styleSalesByStore.get(`${from.style}|${st.code}`) || 0) > 0)
          .map((st) => {
            let row = group.find((r) => r.storeCode === String(st.code));
            if (!row) {
              const g = cfg.grades[String(st.grade)];
              const wOv = cfg.storeWeeksOverride?.[String(st.code)];
              row = { storeCode: String(st.code), storeName: st.name, style: from.style, color: from.color, size: from.size, skuKey: from.skuKey, stock: 0, period: 0, cum: 0, status: "정상", grade: String(st.grade), rank: st.rank, priorityScore: 999, properStock: 0, diff: 0, stockWeeks: 0, weeksTarget: wOv != null ? wOv : g ? g.weeks : cfg.defaultWeeks, excessTh: g ? g.excess : cfg.defaultExcess, availOff: 0, shortage: 0, shipQty: 0, rtNeed: 0 };
              rows.push(row);
              (bySku.get(from.skuKey) || bySku.set(from.skuKey, []).get(from.skuKey)!).push(row);
            }
            return { r: row, sales: styleSalesByStore.get(`${from.style}|${st.code}`) || 0 };
          })
          .filter((x) => plannedOf(x.r) <= 1)
          .sort((a, b) => b.sales - a.sales);
        for (const x of fans) {
          if (give <= 0) break;
          send(x.r, Math.min(give, 2), `이 품번 최근 ${cfg.periodDays}일 ${x.sales}장 판매 · 이 사이즈 ${Math.max(0, Math.round(plannedOf(x.r)))}장`);
        }
      }
      // ③
      if (give > 0) {
        const wh = whMap.get(`${from.style}|${from.color}|${from.size}`);
        outReqReturn.push({ exportStoreCode: code, storeCode: code, storeName: fromName, style: from.style, color: from.color, size: from.size, qty: give, barcode: (wh && wh.barcode) || from.barcode || "", note: req.note || "", reason: "받을 만한 매장이 없어요(모자란 매장·이 품번 잘 팔리는 매장 없음) — 창고 반품 권장" });
        from.outReqOutQty = (from.outReqOutQty || 0) + give;
      }
    }
  });
  const requestOutRtUpload = outReqRtLines.map((l) => ({
    보낼채널코드: l.exportStoreCode, 받을채널코드: l.storeCode, 스타일: l.style, 칼라: l.color, 사이즈: l.size,
    지시수량: l.qty, 승인날짜: "", 보낼매장명: l.exportStoreName, 받을매장명: l.storeName,
  }));
  const requestOutDetail = outReqRtLines.map((l) => ({
    exportStoreCode: l.exportStoreCode, exportStoreName: l.exportStoreName, style: l.style, color: l.color, size: l.size,
    importStoreCode: l.storeCode, importStoreName: l.storeName, allocQty: l.qty, importStock: l.importStock, importWeeks: l.importWeeks, reason: l.why, note: l.note,
  }));
  const requestOutReturn = outReqReturn;
  // 2026-11-26 소천님 ERP 반품 업로드 양식: 채널·스타일·칼라·사이즈·수량(모두 텍스트, 수량만 숫자)
  const requestOutReturnUpload = outReqReturn.map((r) => ({ 채널: r.storeCode, 스타일: r.style, 칼라: r.color, 사이즈: r.size, 수량: r.qty }));
  const requestOutNoMatch = outReqNoMatch;

  // ── 매장요청 업로드/상세 ──
  const requestShipUpload = requestShipLines.map((l) => ({ 채널: l.storeCode, 바코드: l.barcode, 출고차수: cfg.shipRound, 의뢰수량: l.qty, 대분류: "", 비고: "매장요청" + (l.note ? " - " + l.note : "") }));
  const requestRtUpload = requestRtLines.map((l) => ({
    보낼채널코드: l.exportStoreCode, 받을채널코드: l.storeCode, 스타일: l.style, 칼라: l.color, 사이즈: l.size,
    지시수량: l.qty, 승인날짜: "", 보낼매장명: l.exportStoreName, 받을매장명: l.storeName,
  }));
  const requestNoMatch = requestRemaining
    .map((req) => {
      const gotten = requestRtLines.filter((l) => l.storeCode === req.storeCode && l.style === req.style && l.color === req.color && l.size === req.size).reduce((a, l) => a + l.qty, 0);
      return { req, gotten };
    })
    .filter(({ req, gotten }) => gotten < req.need - 1e-6)
    .map(({ req, gotten }) => ({
      storeCode: req.storeCode, storeName: req.storeName, style: req.style, color: req.color, size: req.size,
      need: r1(req.need), unmatched: r1(req.need - gotten), note: req.note,
      reason: requestReasons.get(req) || "창고 출고로 일부 채웠지만 남은 수량은 과잉 매장에서 못 채웠어요.",
    }));

  // ── step 6: 이동 후 예상재고 ──
  const statusCounts: Record<string, number> = { 정상: 0, 품절임박: 0, 과잉: 0, 보충: 0 };
  rows.forEach((r) => statusCounts[r.status]++);
  function calcStatusFor(stock: number, period: number, cum: number, weeksTarget: number, excessTh: number) {
    const weekly = (period / cfg.periodDays) * 7;
    const stockWeeks = period === 0 ? (stock === 0 ? 0 : 99) : stock / weekly;
    let status: string;
    if (period === 0 && stock === 0 && cum > 0) status = "보충";
    else if (stockWeeks >= excessTh) status = "과잉";
    else if (stockWeeks <= cfg.soldoutTh) status = "품절임박";
    else status = "정상";
    return { stockWeeks, status };
  }
  const summarizeOut = (d?: { name: string; qty: number }[]) => {
    if (!d || !d.length) return "";
    const m = new Map<string, number>();
    d.forEach((x) => m.set(x.name, (m.get(x.name) || 0) + x.qty));
    return [...m.entries()].map(([n, q]) => `${n} ${r1(q)}개`).join(", ");
  };
  const projRows = rows
    .map((r) => {
      const inbound = (r.shipQty || 0) + (r.bonusShipQty || 0) + (r.rtInQty || 0) + (r.bonusRtInQty || 0) + (r.requestInQty || 0) + (r.relaunchInQty || 0) + (r.outReqInQty || 0);
      const outbound = (r.rtOutQty || 0) + (r.bonusRtOutQty || 0) + (r.outReqOutQty || 0);
      const projStock = Math.max(0, r.stock + inbound - outbound);
      const calc = calcStatusFor(projStock, r.period, r.cum, r.weeksTarget, r.excessTh);
      return {
        storeCode: r.storeCode, storeName: r.storeName, style: r.style, color: r.color, size: r.size, grade: r.grade,
        stock: r.stock, status: r.status, inbound: r1(inbound), outbound: r1(outbound),
        statusChange: r.status === calc.status ? r.status : `${r.status} → ${calc.status}`,
        receivingStores: summarizeOut(r.rtOutDetail),
        projStock: r1(projStock), projStockWeeks: r1(calc.stockWeeks), projStatus: calc.status,
      };
    })
    .filter((r) => r.inbound > 0 || r.outbound > 0);

  const analysisRows = rows.map((r) => ({
    storeCode: r.storeCode, storeName: r.storeName, style: r.style, color: r.color, size: r.size, grade: r.grade,
    cum: r.cum, period: r.period, stock: r.stock, issuedQty: r.issuedQty, stockWeeks: r1(r.stockWeeks), properStock: r1(r.properStock),
    diff: r1(r.diff), status: r.status, availOff: r.availOff, shortage: r1(r.shortage), shipQty: r.shipQty, rtNeed: r1(r.rtNeed),
  }));

  return {
    statusCounts,
    chulgoUpload, chulgoRows, rtUpload, idongDetail,
    bonusShip, bonusShipUpload, bonusRt, bonusRtUpload,
    relaunchFallbackShipUpload, relaunchFallbackRtUpload, relaunchFallbackDetail,
    requestShipUpload, requestRtUpload, requestNoMatch,
    requestOutRtUpload, requestOutDetail, requestOutReturn, requestOutReturnUpload, requestOutNoMatch,
    projRows, analysisRows,
    autoBestTopList: cfg.bestAuto ? [...autoBestTop] : null,
    totals: {
      shipQtySum: chulgoRows.reduce((a, r) => a + r.qty, 0),
      rtQtySum: rtUpload.reduce((a, r) => a + r.지시수량, 0),
      noMatch: idongLines.filter((l) => l.matchType === "매칭없음").length,
      matched: idongLines.filter((l) => l.matchType !== "매칭없음").length,
      bonusShipQtySum: bonusShipUpload.reduce((a, r) => a + r.의뢰수량, 0),
      bonusRtQtySum: bonusRtUpload.reduce((a, r) => a + r.지시수량, 0),
      requestShipQtySum: requestShipUpload.reduce((a, r) => a + r.의뢰수량, 0),
      requestRtQtySum: requestRtUpload.reduce((a, r) => a + r.지시수량, 0),
      requestOutRtQtySum: requestOutRtUpload.reduce((a, r) => a + r.지시수량, 0),
      requestOutReturnQtySum: requestOutReturn.reduce((a, r) => a + r.qty, 0),
      relaunchFallbackQtySum: relaunchFallback.reduce((a, f) => a + f.qty, 0),
    },
  };
}
