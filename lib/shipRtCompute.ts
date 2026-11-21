// MARK 2026-11-19: 출고·RT 제안기(lib/shipRtEngine.ts) 입력을 MARK 데이터로 채움 — 재고MD님 아티팩트에서 손으로 올리던 파일 대신:
//   매장재고DB(가용재고·누계판매·기간판매) → PIP 매장별 재고 스냅샷(재고·누적판매, 새벽 3:00·9:30) + Daily_Sales_History 최근 7일 판매(어제까지)
//   물류재고DB(가용(오프)·바코드)          → 물류가용재고_스냅샷(ERP ONOFF 재고 직접 조회, 7:00·9:40·13:00)
//   재런칭 매핑                            → MARK_DB 상품_기준표 "재런칭"(신품번→통합/구품번)
//   금일 지시현황                          → MARK_DB RT_지시이력의 오늘 지시분(ERP 이동 지시 현황, 7:05에 받음)
//   설정(등급·매장·예외 등)                → MARK_DB "출고RT_설정"(화면에서 고침, 재고MD님과 같이 씀)
import { ensureSheetExistsById, getDbSheetId, getSheetValuesById, safeReplaceSheetValuesById } from "./googleSheets";
import { readStoreStockSnapshot, readWarehouseStockSnapshot } from "./dataBuilder";
import { readOfflineSalesRows } from "./salesSource";
import { buildRefMaps, readProductRefs } from "./productRefs";
import { readRtOrders } from "./rtOrders";
import { DEFAULT_SHIP_RT_CONFIG, runShipRtEngine, type ShipRtConfig, type StoreRequest } from "./shipRtEngine";

const CONFIG_SHEET = "출고RT_설정";

const kstDate = (off = 0) => new Date(Date.now() + 9 * 3600 * 1000 + off * 86400000).toISOString().slice(0, 10);
const up = (v: any) => String(v ?? "").trim().toUpperCase();
const normSize = (v: any) => {
  const s = up(v).replace(/\s+/g, "");
  return /^0+[A-Z]/.test(s) ? s.replace(/^0+/, "") : s;
};
export function normStoreKey(name: string) {
  return String(name || "").replace(/^오프라인[_\s-]*/i, "").replace(/점$/g, "").replace(/[\s_\-·.()]/g, "").toLowerCase();
}

export async function readShipRtConfig(): Promise<{ config: ShipRtConfig; savedAt: string | null; savedBy: string }> {
  const dbId = getDbSheetId();
  const rows = (await getSheetValuesById(dbId, CONFIG_SHEET, "A1:C2").catch(() => [] as any[][])) || [];
  const raw = rows[1]?.[0];
  if (!raw) return { config: DEFAULT_SHIP_RT_CONFIG, savedAt: null, savedBy: "" };
  try {
    return { config: { ...DEFAULT_SHIP_RT_CONFIG, ...JSON.parse(String(raw)) }, savedAt: String(rows[1]?.[1] || "") || null, savedBy: String(rows[1]?.[2] || "") };
  } catch {
    return { config: DEFAULT_SHIP_RT_CONFIG, savedAt: null, savedBy: "" };
  }
}

export async function saveShipRtConfig(config: ShipRtConfig, by = "") {
  const dbId = getDbSheetId();
  await ensureSheetExistsById(dbId, CONFIG_SHEET, ["설정JSON", "저장시각", "저장자"]);
  const json = JSON.stringify({ ...DEFAULT_SHIP_RT_CONFIG, ...config });
  if (json.length > 45000) throw new Error("설정이 너무 길어요(4.5만 자 초과).");
  const savedAt = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
  await safeReplaceSheetValuesById(dbId, CONFIG_SHEET, [["설정JSON", "저장시각", "저장자"], [json, savedAt, by]]);
  return { savedAt };
}

function dateList(from: string, to: string) {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

export async function computeShipRt(opts: { requests?: StoreRequest[]; config?: Partial<ShipRtConfig> } = {}) {
  const t0 = Date.now();
  const saved = await readShipRtConfig();
  const cfg: ShipRtConfig = { ...saved.config, ...(opts.config || {}) };
  const today = kstDate(0);
  const yesterday = kstDate(-1);
  const periodFrom = kstDate(-cfg.periodDays);
  const [pip, wh, flat, refs, orders] = await Promise.all([
    readStoreStockSnapshot({ strict: true }),
    readWarehouseStockSnapshot(),
    // MARK 2026-11-21: Daily_Sales_History 구간 찾기가 가끔 실패("구간을 찾지 못했어요") → PIP 보관 1순위(없는 날짜만 DSH)
    readOfflineSalesRows(dateList(periodFrom, yesterday)).then((x) => x.rows),
    readProductRefs().catch(() => [] as any[]),
    readRtOrders(today, today).catch(() => ({ rows: [] as any[], coverFrom: "", coverTo: "" })),
  ]);

  const storeByKey = new Map(cfg.stores.map((s) => [normStoreKey(s.name), s]));
  const storeByCode = new Map(cfg.stores.map((s) => [String(s.code), s]));
  const unmatched = new Map<string, number>();
  const codeOf = (name: string) => {
    const s = storeByKey.get(normStoreKey(name));
    if (!s) unmatched.set(name, (unmatched.get(name) || 0) + 1);
    return s;
  };

  // 매장×SKU: PIP 재고·누적 + 최근 7일 판매
  const agg = new Map<string, any>();
  const keyOf = (code: string, st: string, c: string, z: string) => `${code}|${st}|${c}|${z}`;
  for (const r of pip.rows as any[]) {
    const s = codeOf(r.storeName);
    if (!s) continue;
    const st = up(r.styleCode), c = up(r.color), z = normSize(r.size);
    if (!st || !c || !z) continue;
    const k = keyOf(s.code, st, c, z);
    const e = agg.get(k) || { storeCode: s.code, storeName: s.name, style: st, color: c, size: z, stock: 0, cum: 0, period: 0 };
    e.stock += Number(r.stock || 0);
    e.cum = Math.max(e.cum, Number(r.cumQty || 0));
    agg.set(k, e);
  }
  for (const r of flat as any[]) {
    if (!r.colorCode || !r.size || !r.styleCode) continue;
    const s = (r.channelCode && storeByCode.get(String(r.channelCode))) || storeByKey.get(normStoreKey(r.storeName));
    if (!s) continue;
    const st = up(r.styleCode), c = up(r.colorCode), z = normSize(r.size);
    const k = keyOf(s.code, st, c, z);
    const e = agg.get(k) || { storeCode: s.code, storeName: s.name, style: st, color: c, size: z, stock: 0, cum: 0, period: 0 };
    e.period += Number(r.qty || 0);
    agg.set(k, e);
  }
  const storeRaw = [...agg.values()];

  const whRaw = (wh.rows as any[]).map((r) => ({ style: up(r.styleCode), color: up(r.color), size: normSize(r.size), availOff: Number(r.offlineStock || 0), barcode: String(r.barcode || "") }));

  const maps = buildRefMaps(refs as any);
  const relaunchNewToOld = new Map<string, string>();
  for (const r of refs as any[]) {
    if (r.kind === "재런칭" && r.value && up(r.value) !== up(r.style)) relaunchNewToOld.set(up(r.style), up(r.value));
  }

  const issuedToday = orders.rows.map((o: any) => ({ fromStore: o.fromCode, style: up(o.style), color: up(o.color), size: normSize(o.size), qty: Number(o.ordQty || 0) }));

  const requests = (opts.requests || [])
    .map((r) => ({ ...r, storeCode: String(r.storeCode).trim(), style: up(r.style), color: up(r.color), size: normSize(r.size), qty: Number(r.qty || 0) }))
    .filter((r) => r.storeCode && r.style && r.qty > 0);

  const result = runShipRtEngine({ cfg, storeRaw, whRaw, issuedToday, storeRequests: requests, relaunchNewToOld, relaunchSet: maps.relaunch });

  return {
    ...result,
    // 응답 크기 때문에(전체 8만 줄 ≈ 20MB) 재고분석은 부족·출고·RT가 걸린 줄만, 보충RT 매칭 원본(bonusRt)은 업로드 양식만 보냄
    analysisRows: result.analysisRows.filter((r) => r.shortage > 0 || r.shipQty > 0 || r.rtNeed > 0).slice(0, 15000),
    bonusRt: undefined,
    analysisTotal: result.analysisRows.length,
    inputs: {
      today,
      period: `${periodFrom}~${yesterday}`,
      pip: { uploadedAt: (pip as any).meta?.uploadedAt || null, rows: pip.rows.length },
      warehouse: { uploadedAt: (wh as any).meta?.uploadedAt || null, rows: wh.rows.length, source: (wh as any).meta?.fileName || "" },
      issuedToday: { lines: issuedToday.length, qty: issuedToday.reduce((a, r) => a + r.qty, 0), coverTo: orders.coverTo },
      relaunchPairs: relaunchNewToOld.size,
      storeSkuRows: storeRaw.length,
      unmatchedStores: [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, n]) => `${name}(${n})`),
    },
    config: cfg,
    configSavedAt: saved.savedAt,
    computeMs: Date.now() - t0,
  };
}
