// MARK 2026-10-20: SKU 방식 RT (재고MD 엑셀 "RT/출고 제안 시스템" 로직을 MARK로 옮긴 것).
// 기존 RT(품번 단위로 판단 → 칼라/사이즈는 나중에 배분)는 품번 전체로는 안전재고가 남아도 특정 SKU가
// 0이 되는 지시가 나올 수 있었습니다. 여기서는 처음부터 매장×스타일×칼라×사이즈(SKU) 단위로 판단합니다.
//
// 1) 상태 판정(매장×SKU): 재고주수 = 재고 ÷ 주간판매
//    - 보충: 재고 0 · 전주/전전주 판매 0 · 누계판매 ≥ 5 (오래 품절된 인기 SKU) → 등급별 목표수량(A4/B3/C2/D0)만큼 필요
//    - 품절임박: 판매가 있고 재고주수 ≤ 2주 → 등급별 목표재고주수까지 필요
//    - 과잉: 재고주수 ≥ 등급별 과잉기준(판매 없이 재고만 있으면 99주로 과잉) → 보낼 수 있음
//    - 정상: 그 외
//    받는 쪽(출고/RT/보충)은 대상품번(재런칭 목록 또는 GF3·GF4·GF7·GF8로 시작)만.
// 2) 물류 우선: 부족분은 창고 가용(오프)에서 먼저 — 같은 SKU를 여러 매장이 원하면 등급(A→D) → 판매순위 순
// 3) 남는 부족분만 RT — 보내는 매장 재고를 차감해가며 배분(같은 재고를 두 번 지시하지 않음)
//    - 1차: 과잉 매장(과잉량 큰 순). 판매가 있으면 목표재고만큼은 남김, 판매 없는 재고는 3장 이상일 때만 전량 가능
//    - 2차: 정상 매장 중 판매순위 낮은 순 — 목표재고와 "품절임박 기준+1장" 중 큰 값은 반드시 남김
//      (재고MD 엑셀은 2차에서 적정재고를 무시해 보내는 매장 SKU가 품절될 수 있었음 → 막음)
//    - 품절임박/보충 상태인 매장은 보내지 않음
// 재고는 PIP 매장별 재고 스냅샷(매일 갱신)을 우선 쓰고, 없으면 업로드 파일의 재고를 씁니다.

export type Grade = "A" | "B" | "C" | "D";

// 재고MD 엑셀 "매장코드" 시트 그대로(소천님 확인: 등급·순위 그대로 사용)
export const RT_SKU_STORES: { code: string; name: string; grade: Grade; rank: number }[] = [
  { code: "21030", name: "성수 플래그십", grade: "A", rank: 1 },
  { code: "36001", name: "롯데백화점 광복점", grade: "A", rank: 2 },
  { code: "46003", name: "롯데아울렛 김해점", grade: "A", rank: 3 },
  { code: "54001", name: "현대커넥트 청주점", grade: "A", rank: 4 },
  { code: "42002", name: "현대아울렛 송도점", grade: "A", rank: 5 },
  { code: "21011", name: "신사 플래그십", grade: "A", rank: 6 },
  { code: "51018", name: "아이파크몰 용산점", grade: "B", rank: 7 },
  { code: "41001", name: "롯데아울렛 서울역점", grade: "B", rank: 8 },
  { code: "52006", name: "스타필드 고양점", grade: "B", rank: 9 },
  { code: "32005", name: "신세계 의정부점", grade: "B", rank: 10 },
  { code: "51024", name: "타임스퀘어 영등포점", grade: "B", rank: 11 },
  { code: "31001", name: "신세계 센텀시티점", grade: "B", rank: 12 },
  { code: "55001", name: "LF스퀘어 광양점", grade: "B", rank: 13 },
  { code: "32033", name: "롯데백화점 평촌점", grade: "B", rank: 14 },
  { code: "46004", name: "롯데아울렛 동부산", grade: "C", rank: 15 },
  { code: "34002", name: "신세계 대전점", grade: "C", rank: 16 },
  { code: "52034", name: "스타필드 빌리지 운정점", grade: "C", rank: 17 },
  { code: "35002", name: "신세계 광주점", grade: "C", rank: 18 },
  { code: "42004", name: "현대아울렛 남양주점", grade: "C", rank: 19 },
  { code: "21034", name: "서울숲 플래그십", grade: "C", rank: 20 },
  { code: "31031", name: "현대백화점 신촌점", grade: "C", rank: 21 },
  { code: "21012", name: "한남 플래그십", grade: "D", rank: 22 },
];

// 재고MD 엑셀 "재런칭" 시트(신규코드, 기존코드)
export const RT_SKU_RELAUNCH: [string, string][] = [
  ["GF7LCT501", "GF1LCT501"], ["GF7LHP504", "WBE1L12504"], ["GF7LJK502", "WBE3L09502"], ["GF7LJK506", "GF1LJK506"], ["GF7LJK507", "GF1LJK507"],
  ["GF7LJP536", "WBE4L07536"], ["GF7LKC501", "WBD3L04501"], ["GF7LKC503", "WBD3L04503"], ["GF7LKC505", "WBD3L04505"], ["GF7LKC507", "WBE1L04507"],
  ["GF7LKC509", "GF1LKC509"], ["GF7LKC511", "WBE3L04511"], ["GF7LKC524", "WBD3L04524"], ["GF7LKC530", "WBE3L04530"], ["GF7LKP502", "GF1LKP502"],
  ["GF7LKP504", "WBE3L05504"], ["GF7LKP510", "GF1LKP510"], ["GF7LKP512", "WBE3L05512"], ["GF7LKP527", "WBD3L05527"], ["GF7LKV519", "WBE3L06519"],
  ["GF7LPT501", "GF1LPT501"], ["GF7LPT505", "WBE2L11505"], ["GF7LSH507", "WBE1L03507"], ["GF7LSK505", "WBE1L13505"], ["GF7LTS502", "WBE3L01502"],
  ["GF7LTS503", "WBE3L01503"], ["GF7LTS505", "GF1LTS505"], ["GF7MPT005", "GF1MPT005"], ["GF7MPT006", "GF1MPT006"], ["GF7UJP006", "SBE3U07006"],
  ["GF8LCT522", "WBE4L10522"], ["GF8LJP538", "WBE4L07538"], ["GF8LKC550", "WBD4L04550"], ["GF8LKP550", "WBE4L05550"], ["GF8LPT502", "WBD3L11502"],
  ["GF8LPT517", "WBE4L11517"],
];

export const RT_SKU_SETTINGS = {
  grades: { A: { targetWeeks: 4, overWeeks: 7, boostQty: 4 }, B: { targetWeeks: 3, overWeeks: 5.5, boostQty: 3 }, C: { targetWeeks: 3, overWeeks: 4.3, boostQty: 2 }, D: { targetWeeks: 2, overWeeks: 3, boostQty: 0 } } as Record<Grade, { targetWeeks: number; overWeeks: number; boostQty: number }>,
  shortageWeeks: 2, // 품절임박 기준(재고주수 ≤)
  boostMinCumQty: 5, // 보충: 누계판매 이 이상
  noSalesMinStock: 3, // MARK 2026-10-20: 판매 없는(전주·전전주 0) 재고는 그 매장 SKU 재고가 이 장수 이상일 때만 RT로 가져옴(1~2장 자잘한 이동 방지)
  targetPrefixes: ["GF3", "GF4", "GF7", "GF8"],
};

const GRADE_ORDER: Record<Grade, number> = { A: 1, B: 2, C: 3, D: 4 };

export function normalizeStoreKey(storeName: string) {
  return String(storeName || "")
    .replace(/^오프라인[_\s-]*/i, "")
    .replace(/점$/g, "")
    .replace(/[\s_\-·.()]/g, "")
    .toLowerCase();
}

export type SkuSalesRow = { storeName: string; styleCode: string; productName: string; color: string; size: string; stock: number; cumQty: number; w1Qty: number; w2Qty: number };
export type SkuStockRow = { storeName: string; styleCode: string; color: string; size: string; stock: number };
export type WarehouseRow = { styleCode: string; color: string; size: string; offlineStock: number; barcode?: string };

export type SkuEntry = {
  sku: string;
  styleCode: string;
  productName: string;
  color: string;
  size: string;
  storeCode: string;
  storeName: string;
  grade: Grade;
  rank: number;
  stock: number;
  cumQty: number;
  w1Qty: number;
  w2Qty: number;
  weekly: number;
  weeks: number;
  targetWeeks: number;
  overWeeks: number;
  targetStock: number;
  status: "보충" | "품절임박" | "과잉" | "정상";
  isTargetStyle: boolean;
  need: number;
  keep: number;
  giveable: number;
};

const skuKey = (style: string, color: string, size: string) => `${style.toUpperCase()}-${color.toUpperCase()}-${size.toUpperCase()}`;

/** 주간판매: 전전주 판매가 없으면(신상품) 전주 값, 아니면 2주 평균 */
function weeklyOf(w1: number, w2: number) {
  const a = Math.max(0, w1), b = Math.max(0, w2);
  if (a > 0 && b === 0) return a;
  return (a + b) / 2;
}

export function runRtSkuEngine(input: {
  sales: SkuSalesRow[];
  pipStock?: SkuStockRow[] | null;
  warehouse?: WarehouseRow[] | null;
}) {
  const S = RT_SKU_SETTINGS;
  const storeByKey = new Map(RT_SKU_STORES.map((s) => [normalizeStoreKey(s.name), s]));
  const relaunch = new Set(RT_SKU_RELAUNCH.flat().map((x) => x.toUpperCase()));
  const isTargetStyle = (style: string) => {
    const u = style.toUpperCase();
    return relaunch.has(u) || S.targetPrefixes.some((p) => u.startsWith(p));
  };

  // PIP 재고(매장×SKU)
  const pip = new Map<string, number>();
  const usePip = !!input.pipStock?.length;
  for (const r of input.pipStock || []) {
    const st = storeByKey.get(normalizeStoreKey(r.storeName));
    if (!st) continue;
    const k = `${st.code}|${skuKey(r.styleCode, r.color, r.size)}`;
    pip.set(k, (pip.get(k) || 0) + Math.max(0, r.stock));
  }

  // 매장×SKU 엔트리(판매 파일 + PIP에만 있는 재고)
  const entries = new Map<string, SkuEntry>();
  const ensure = (store: (typeof RT_SKU_STORES)[number], style: string, productName: string, color: string, size: string) => {
    const sku = skuKey(style, color, size);
    const k = `${store.code}|${sku}`;
    let e = entries.get(k);
    if (!e) {
      e = {
        sku, styleCode: style.toUpperCase(), productName, color: color.toUpperCase(), size: size.toUpperCase(),
        storeCode: store.code, storeName: store.name, grade: store.grade, rank: store.rank,
        stock: 0, cumQty: 0, w1Qty: 0, w2Qty: 0, weekly: 0, weeks: 0, targetWeeks: 0, overWeeks: 0, targetStock: 0,
        status: "정상", isTargetStyle: isTargetStyle(style), need: 0, keep: 0, giveable: 0,
      };
      entries.set(k, e);
    }
    if (!e.productName && productName) e.productName = productName;
    return e;
  };
  for (const r of input.sales) {
    if (!r.color || !r.size) continue;
    const st = storeByKey.get(normalizeStoreKey(r.storeName));
    if (!st) continue;
    const e = ensure(st, r.styleCode, r.productName, r.color, r.size);
    e.cumQty += r.cumQty;
    e.w1Qty += r.w1Qty;
    e.w2Qty += r.w2Qty;
    if (!usePip) e.stock += Math.max(0, r.stock);
  }
  if (usePip) {
    for (const r of input.pipStock || []) {
      const st = storeByKey.get(normalizeStoreKey(r.storeName));
      if (!st || !(r.stock > 0)) continue;
      ensure(st, r.styleCode, "", r.color, r.size);
    }
    for (const e of entries.values()) e.stock = pip.get(`${e.storeCode}|${e.sku}`) || 0;
  }

  // 1) 상태 판정
  for (const e of entries.values()) {
    const g = S.grades[e.grade];
    e.targetWeeks = g.targetWeeks;
    e.overWeeks = g.overWeeks;
    e.weekly = weeklyOf(e.w1Qty, e.w2Qty);
    e.weeks = e.weekly > 0 ? e.stock / e.weekly : e.stock > 0 ? 99 : 0;
    e.targetStock = Math.ceil(g.targetWeeks * e.weekly);
    if (e.stock === 0 && e.w1Qty <= 0 && e.w2Qty <= 0 && e.cumQty >= S.boostMinCumQty) {
      e.status = "보충";
      e.need = e.isTargetStyle ? g.boostQty : 0;
    } else if (e.weekly > 0 && e.weeks <= S.shortageWeeks) {
      e.status = "품절임박";
      e.need = e.isTargetStyle ? Math.max(0, e.targetStock - e.stock) : 0;
    } else if (e.weeks >= g.overWeeks) {
      e.status = "과잉";
    } else {
      e.status = "정상";
    }
    if (e.status === "과잉") {
      // 판매가 있으면 목표재고만큼 남김. 판매 없는 재고는 noSalesMinStock장 이상일 때만 전량 가능(미만이면 안 가져옴)
      e.keep = e.weekly > 0 ? e.targetStock : e.stock >= S.noSalesMinStock ? 0 : e.stock;
    } else if (e.status === "정상") {
      e.keep = Math.max(e.targetStock, Math.ceil(S.shortageWeeks * e.weekly) + 1);
    } else {
      e.keep = e.stock; // 품절임박/보충 매장은 보내지 않음
    }
    e.giveable = Math.max(0, e.stock - e.keep);
  }

  // SKU별 묶기
  const bySku = new Map<string, SkuEntry[]>();
  for (const e of entries.values()) {
    if (!bySku.has(e.sku)) bySku.set(e.sku, []);
    bySku.get(e.sku)!.push(e);
  }
  const wh = new Map<string, { avail: number; barcode: string }>();
  for (const r of input.warehouse || []) {
    const k = skuKey(r.styleCode, r.color, r.size);
    const prev = wh.get(k);
    wh.set(k, { avail: (prev?.avail || 0) + Math.max(0, r.offlineStock), barcode: prev?.barcode || r.barcode || "" });
  }

  const shipLines: any[] = []; // 물류 출고
  const rtLines: any[] = []; // 매장 간 RT
  const unmet: any[] = []; // 채울 곳 없음
  const byPriority = (a: SkuEntry, b: SkuEntry) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] || a.rank - b.rank;

  for (const [sku, list] of bySku.entries()) {
    const receivers = list.filter((e) => e.need > 0).sort(byPriority);
    if (!receivers.length) continue;
    const w = wh.get(sku);
    let whLeft = w?.avail || 0;
    const remain = new Map(receivers.map((r) => [r, r.need]));

    // 2) 물류 우선
    for (const r of receivers) {
      if (whLeft <= 0) break;
      const q = Math.min(remain.get(r)!, whLeft);
      if (q <= 0) continue;
      whLeft -= q;
      remain.set(r, remain.get(r)! - q);
      shipLines.push({ type: r.status === "보충" ? "보충출고" : "출고", entry: r, qty: q, warehouseAvail: w?.avail || 0, barcode: w?.barcode || "" });
    }

    // 3) 남는 부족분 RT — 보내는 매장 재고 차감
    const tier1 = list.filter((e) => e.status === "과잉" && e.giveable > 0).sort((a, b) => b.giveable - a.giveable || b.rank - a.rank);
    const tier2 = list.filter((e) => e.status === "정상" && e.giveable > 0).sort((a, b) => b.rank - a.rank);
    const cap = new Map<SkuEntry, number>([...tier1, ...tier2].map((e) => [e, e.giveable]));
    for (const r of receivers) {
      let left = remain.get(r)!;
      for (const from of [...tier1, ...tier2]) {
        if (left <= 0) break;
        if (from.storeCode === r.storeCode) continue;
        const c = cap.get(from) || 0;
        if (c <= 0) continue;
        const q = Math.min(left, c);
        cap.set(from, c - q);
        left -= q;
        rtLines.push({ type: r.status === "보충" ? "보충RT" : "RT", tier: from.status === "과잉" ? "과잉매장" : "하위판매매장", from, to: r, qty: q, warehouseAvail: w?.avail || 0 });
      }
      remain.set(r, left);
      if (left > 0) unmet.push({ entry: r, qty: left, warehouseAvail: w?.avail || 0 });
    }
  }

  // 출력 정리(근거 포함)
  const wk = (x: number) => (x >= 99 ? 99 : Math.round(x * 10) / 10);
  const after = (e: SkuEntry, delta: number) => (e.weekly > 0 ? wk((e.stock + delta) / e.weekly) : e.stock + delta > 0 ? 99 : 0);
  const fromSent = new Map<SkuEntry, number>();
  for (const l of rtLines) fromSent.set(l.from, (fromSent.get(l.from) || 0) + l.qty);
  const toRecv = new Map<SkuEntry, number>();
  for (const l of [...shipLines, ...rtLines]) toRecv.set(l.to || l.entry, (toRecv.get(l.to || l.entry) || 0) + l.qty);

  const fmtEntry = (e: SkuEntry) => ({
    storeCode: e.storeCode, storeName: e.storeName, grade: e.grade, rank: e.rank, stock: e.stock, w1Qty: e.w1Qty, w2Qty: e.w2Qty,
    weekly: Math.round(e.weekly * 10) / 10, weeks: wk(e.weeks), status: e.status, targetStock: e.targetStock, cumQty: e.cumQty, keep: e.keep,
  });

  const rt = rtLines.map((l) => ({
    type: l.type, tier: l.tier, styleCode: l.to.styleCode, productName: l.to.productName || l.from.productName, color: l.to.color, size: l.to.size, qty: l.qty,
    from: { ...fmtEntry(l.from), afterStock: l.from.stock - (fromSent.get(l.from) || 0), afterWeeks: after(l.from, -(fromSent.get(l.from) || 0)) },
    to: { ...fmtEntry(l.to), need: l.to.need, afterStock: l.to.stock + (toRecv.get(l.to) || 0), afterWeeks: after(l.to, toRecv.get(l.to) || 0) },
    warehouseAvail: l.warehouseAvail,
  }));
  const ship = shipLines.map((l) => ({
    type: l.type, styleCode: l.entry.styleCode, productName: l.entry.productName, color: l.entry.color, size: l.entry.size, qty: l.qty, barcode: l.barcode,
    to: { ...fmtEntry(l.entry), need: l.entry.need, afterStock: l.entry.stock + (toRecv.get(l.entry) || 0), afterWeeks: after(l.entry, toRecv.get(l.entry) || 0) },
    warehouseAvail: l.warehouseAvail,
  }));
  const unmetOut = unmet.map((u) => ({ styleCode: u.entry.styleCode, productName: u.entry.productName, color: u.entry.color, size: u.entry.size, qty: u.qty, to: fmtEntry(u.entry), warehouseAvail: u.warehouseAvail }));

  const statusCount: Record<string, number> = {};
  for (const e of entries.values()) statusCount[e.status] = (statusCount[e.status] || 0) + 1;
  const sum = (arr: any[]) => arr.reduce((s, x) => s + Number(x.qty || 0), 0);
  return {
    ship,
    rt,
    unmet: unmetOut,
    entriesForCheck: entries, // 비교용(저장하지 않음)
    summary: {
      skuEntries: entries.size,
      statusCount,
      shipCount: ship.length, shipQty: sum(ship),
      boostShipCount: ship.filter((x) => x.type === "보충출고").length,
      rtCount: rt.length, rtQty: sum(rt),
      boostRtCount: rt.filter((x) => x.type === "보충RT").length,
      rtTier1: rt.filter((x) => x.tier === "과잉매장").length,
      rtTier2: rt.filter((x) => x.tier === "하위판매매장").length,
      unmetCount: unmetOut.length, unmetQty: sum(unmetOut),
      rtFromNoSales: rt.filter((x) => x.from.weekly === 0).length,
      rtStorePairs: new Set(rt.map((x) => `${x.from.storeCode}>${x.to.storeCode}`)).size,
      shipStores: new Set(ship.map((x) => x.to.storeCode)).size,
      stockSource: usePip ? "pip" : "upload",
    },
  };
}
