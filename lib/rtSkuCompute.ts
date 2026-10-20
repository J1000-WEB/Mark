// MARK 2026-10-20: SKU 방식 RT 계산 래퍼 — 저장된 자료(① SKU 판매 업로드, PIP 매장별 재고, ② 물류 가용재고)를
// 읽어서 lib/rtSkuEngine.ts로 계산하고, 기존 방식(품번 단위) 오늘 계산분과 비교 지표를 같이 만듭니다.

import { readRtWeeklySales } from "./rtWeeklySalesStore";
import { readStoreStockSnapshot, readWarehouseStockSnapshot, readDailyHistoryFlatRange } from "./dataBuilder";
import { periodEnd } from "./rtWeeklySalesStore";
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
  // MARK 2026-10-20(2): ERP SKU 보고서는 너무 커서 받기 어려움 → 기본은 이미 매일 쌓이는 데이터로 계산:
  //   판매(전주·전전주) = Daily_Sales_History(매일 새벽 ERP 일간판매, 매장×SKU)
  //   누계판매 = PIP 매장별 "누적"(새벽 매장별 재고 스냅샷 8번째 열), 재고 = PIP 재고
  // SKU 버전 판매 파일을 (여러 개로 나눠서라도) 올려두고 기간이 최근이면 그 파일을 우선 씁니다.
  const today = kstDate(0);
  const fileUsable = weekly.meta?.format === "sku" && periodEnd(weekly.meta.period1) >= kstDate(-10);
  let period1 = "", period2 = "";
  if (weekly.meta && periodEnd(weekly.meta.period1) >= kstDate(-10) && periodEnd(weekly.meta.period2)) {
    period1 = weekly.meta.period1;
    period2 = weekly.meta.period2;
  } else {
    // 오늘 기준 지난주 월~일 / 그 전주
    const now = new Date(`${today}T00:00:00Z`);
    const dow = now.getUTCDay();
    const lastMon = new Date(now.getTime() - ((dow === 0 ? 7 : dow) + 6) * 86400000);
    const f = (d: Date) => d.toISOString().slice(0, 10);
    const add = (d: Date, k: number) => new Date(d.getTime() + k * 86400000);
    period1 = `${f(lastMon)}~${f(add(lastMon, 6))}`;
    period2 = `${f(add(lastMon, -7))}~${f(add(lastMon, -1))}`;
  }
  const [p1s, p1e] = period1.split("~");
  const [p2s, p2e] = period2.split("~");

  let sales: any[];
  let salesSource: "upload" | "daily_sales_history";
  if (fileUsable) {
    salesSource = "upload";
    sales = weekly.rows
      .filter((r) => r.color && r.size)
      .map((r) => ({ storeName: r.storeName, styleCode: r.styleCode, productName: r.productName, color: r.color, size: r.size, stock: r.stock, cumQty: r.cumQty, w1Qty: r.w1Qty, w2Qty: r.w2Qty }));
  } else {
    salesSource = "daily_sales_history";
    const flat = await readDailyHistoryFlatRange(p2s, p1e, { strict: true });
    const agg = new Map<string, any>();
    for (const r of flat as any[]) {
      if (!r.colorCode || !r.size || !r.styleCode) continue;
      const inW1 = r.date >= p1s && r.date <= p1e;
      const inW2 = r.date >= p2s && r.date <= p2e;
      if (!inW1 && !inW2) continue;
      const k = `${normalizeStoreKey(r.storeName)}|${String(r.styleCode).toUpperCase()}|${String(r.colorCode).toUpperCase()}|${String(r.size).toUpperCase()}`;
      let a = agg.get(k);
      if (!a) {
        a = { storeName: r.storeName, styleCode: r.styleCode, productName: r.productName || "", color: r.colorCode, size: r.size, stock: 0, cumQty: 0, w1Qty: 0, w2Qty: 0 };
        agg.set(k, a);
      }
      if (inW1) a.w1Qty += Number(r.qty || 0);
      else a.w2Qty += Number(r.qty || 0);
    }
    // 누계판매·상품명은 PIP에서(판매가 없던 SKU도 PIP에 누적이 있으면 엔트리 생성 → "보충" 판정 가능)
    for (const r of pip.rows) {
      const k = `${normalizeStoreKey(r.storeName)}|${r.styleCode.toUpperCase()}|${r.color.toUpperCase()}|${r.size.toUpperCase()}`;
      let a = agg.get(k);
      if (!a) {
        if (!(Number(r.cumQty || 0) > 0)) continue;
        a = { storeName: r.storeName, styleCode: r.styleCode, productName: r.productName || "", color: r.color, size: r.size, stock: 0, cumQty: 0, w1Qty: 0, w2Qty: 0 };
        agg.set(k, a);
      }
      a.cumQty = Number(r.cumQty || 0);
      if (!a.productName) a.productName = r.productName || "";
    }
    sales = [...agg.values()];
  }
  const pipHasCum = pip.rows.some((r: any) => Number(r.cumQty || 0) > 0);

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
      sales: {
        source: salesSource,
        uploadedAt: salesSource === "upload" ? weekly.meta?.uploadedAt : null,
        fileName: salesSource === "upload" ? weekly.meta?.fileName : "Daily_Sales_History",
        period1, period2, rows: sales.length,
        cumSource: salesSource === "upload" ? "upload" : pipHasCum ? "pip" : "none",
      },
      pip: { uploadedAt: pip.meta?.uploadedAt || null, used: pipFresh, rows: pip.rows.length },
      warehouse: { uploadedAt: (wh as any).meta?.uploadedAt || null, used: whFresh, rows: wh.rows.length },
    },
    settings: { ...RT_SKU_SETTINGS, stores: RT_SKU_STORES },
    computeMs: Date.now() - t0,
  };
}
