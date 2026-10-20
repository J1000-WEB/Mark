// MARK 2026-10-20: SKU 방식 RT 계산 래퍼 — 저장된 자료(① SKU 판매 업로드, PIP 매장별 재고, ② 물류 가용재고)를
// 읽어서 lib/rtSkuEngine.ts로 계산하고, 기존 방식(품번 단위) 오늘 계산분과 비교 지표를 같이 만듭니다.

import { readRtWeeklySales } from "./rtWeeklySalesStore";
import { readStoreStockSnapshot, readWarehouseStockSnapshot } from "./dataBuilder";
import { loadSavedRtSuggestions } from "./rtSuggestionStore";
import { allocateByStock } from "./rtAllocate";
import { runRtSkuEngine, normalizeStoreKey, RT_SKU_SETTINGS, RT_SKU_STORES } from "./rtSkuEngine";

function kstDate(offsetDays = 0) {
  return new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);
}

let inFlight: Promise<any> | null = null;
export function computeRtSku() {
  if (inFlight) return inFlight;
  inFlight = doCompute().finally(() => (inFlight = null));
  return inFlight;
}

async function doCompute() {
  const t0 = Date.now();
  const [weekly, pip, wh] = await Promise.all([
    readRtWeeklySales(),
    readStoreStockSnapshot({ strict: true }),
    readWarehouseStockSnapshot().catch(() => ({ rows: [] as any[], meta: null })),
  ]);
  if (!weekly.meta || weekly.meta.format !== "sku") {
    throw new Error("SKU 방식은 칼라·사이즈가 있는 판매 파일이 필요해요. RT 참고자료 ①에 SKU 버전(재고MD 엑셀의 '매장재고 DB'와 같은 ERP 보고서)을 올려주세요.");
  }
  const sales = weekly.rows
    .filter((r) => r.color && r.size)
    .map((r) => ({ storeName: r.storeName, styleCode: r.styleCode, productName: r.productName, color: r.color, size: r.size, stock: r.stock, cumQty: r.cumQty, w1Qty: r.w1Qty, w2Qty: r.w2Qty }));

  // PIP는 3일 안에 올라온 것만(새벽 자동 갱신) — 아니면 업로드 파일의 재고를 씀
  const pipFresh = !!pip.meta?.uploadedAt && String(pip.meta.uploadedAt).slice(0, 10) >= kstDate(-3) && pip.rows.length > 0;
  const whFresh = !!(wh as any).meta?.uploadedAt && String((wh as any).meta.uploadedAt).slice(0, 10) >= kstDate(-7) && wh.rows.length > 0;
  const result = runRtSkuEngine({ sales, pipStock: pipFresh ? pip.rows : null, warehouse: whFresh ? wh.rows : null });

  // ── 기존 방식 비교: 오늘(최근) 기존 계산분을 칼라/사이즈로 펼쳤을 때 "보내는 매장 SKU를 0으로 만드는데
  //    그 SKU가 최근 2주 그 매장에서 팔리고 있던" 지시가 몇 건인지 ──
  let legacy: any = null;
  try {
    const { saved } = await loadSavedRtSuggestions(undefined, "style");
    if (saved?.rtSuggestions?.length) {
      const sold = new Map<string, number>();
      for (const r of sales) {
        const k = `${normalizeStoreKey(r.storeName)}|${r.styleCode.toUpperCase()}|${r.color.toUpperCase()}|${r.size.toUpperCase()}`;
        sold.set(k, (sold.get(k) || 0) + Math.max(0, r.w1Qty) + Math.max(0, r.w2Qty));
      }
      const pool = new Map<string, { color: string; size: string; stock: number }[]>();
      for (const r of pip.rows) {
        if (!(r.stock > 0)) continue;
        const k = `${normalizeStoreKey(r.storeName)}|${r.styleCode.toUpperCase()}`;
        if (!pool.has(k)) pool.set(k, []);
        pool.get(k)!.push({ color: r.color, size: r.size, stock: r.stock });
      }
      let lines = 0, qty = 0, stockoutLines = 0, stockoutQty = 0;
      const examples: any[] = [];
      for (const it of saved.rtSuggestions) {
        const k = `${normalizeStoreKey(it.fromStore)}|${String(it.styleCode).toUpperCase()}`;
        const p = pool.get(k) || [];
        const alloc = allocateByStock(p, Number(it.suggestQty || 0), it.skuNeedWeights);
        for (const a of alloc) {
          const src = p.find((x) => x.color === a.color && x.size === a.size);
          if (!src) continue;
          src.stock -= a.qty;
          lines++;
          qty += a.qty;
          const soldQty = sold.get(`${normalizeStoreKey(it.fromStore)}|${String(it.styleCode).toUpperCase()}|${a.color.toUpperCase()}|${a.size.toUpperCase()}`) || 0;
          if (src.stock <= 0 && soldQty > 0) {
            stockoutLines++;
            stockoutQty += a.qty;
            if (examples.length < 30) examples.push({ styleCode: it.styleCode, productName: it.productName, color: a.color, size: a.size, fromStore: it.fromStore, toStore: it.toStore, qty: a.qty, fromSold2w: soldQty });
          }
        }
      }
      legacy = { savedAt: saved.savedAt, suggestionCount: saved.rtSuggestions.length, skuLines: lines, skuQty: qty, stockoutLines, stockoutQty, examples };
    }
  } catch (e) {
    console.error("[rt-sku] 기존 방식 비교 실패(무시):", e);
  }

  const skuCheckStockout = result.rt.filter((x: any) => x.from.afterStock <= 0 && x.from.weekly > 0).length;
  return {
    lines: [
      ...result.ship.map((x: any) => ({ kind: "ship", ...x })),
      ...result.rt.map((x: any) => ({ kind: "rt", ...x })),
      ...result.unmet.slice(0, 1500).map((x: any) => ({ kind: "unmet", ...x })),
    ],
    summary: { ...result.summary, senderStockoutLines: skuCheckStockout },
    legacy,
    inputs: {
      sales: { uploadedAt: weekly.meta.uploadedAt, fileName: weekly.meta.fileName, period1: weekly.meta.period1, period2: weekly.meta.period2, rows: sales.length },
      pip: { uploadedAt: pip.meta?.uploadedAt || null, used: pipFresh, rows: pip.rows.length },
      warehouse: { uploadedAt: (wh as any).meta?.uploadedAt || null, used: whFresh, rows: wh.rows.length },
    },
    settings: { ...RT_SKU_SETTINGS, stores: RT_SKU_STORES },
    computeMs: Date.now() - t0,
  };
}
