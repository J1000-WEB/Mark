import { NextResponse } from "next/server";
import { saveWarehouseStockSnapshot, saveOnlineTransferStockSnapshot, getWarehouseStockSnapshotMeta, getOnlineTransferStockSnapshotMeta } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

// MARK 2026-11-19: ERP "ONOFF 재고현황"(FSDSSR0140, /fs/dssr/Dssr0140.do) 직접 조회 결과 받기.
// PC erp-agent의 fetch-onoff-stock.js가 매일 자동으로 조회해서 SKU별로 합친 값을 보내면,
// 예전에 손으로 엑셀을 올려야 갱신되던 두 스냅샷을 한 번에 갱신합니다.
//   - 물류가용재고_스냅샷(스타일·칼라·사이즈·가용(오프)·바코드) → 판매분 배분, SKU RT, 라운딩 재고 점검의 창고 가용
//   - 온라인이관_재고_스냅샷(스타일·스타일명·칼라·칼라명·사이즈·가용(온)·가용(오프)) → 온라인 이관 요청
// body: { rows: [[스타일,스타일명,칼라,칼라명,사이즈,바코드,재고,할당,가용(온),가용(오프),가용(합계)], ...], source }

export async function GET() {
  try {
    const [warehouse, online] = await Promise.all([getWarehouseStockSnapshotMeta(), getOnlineTransferStockSnapshotMeta()]);
    return NextResponse.json({ ok: true, warehouse, online }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rows: any[][] = Array.isArray(body?.rows) ? body.rows : [];
    const source = typeof body?.source === "string" ? body.source : "ERP 직접조회";
    if (rows.length < 1000) {
      // 평소 1만 행 이상 — 너무 적으면 조회가 잘못된 것으로 보고 기존 스냅샷을 지키기 위해 저장하지 않음
      return NextResponse.json({ ok: false, error: `행 수가 너무 적어요(${rows.length}행) — 저장하지 않았습니다.` }, { status: 400 });
    }
    const t = (v: any) => (v == null ? "" : String(v).trim());
    const n = (v: any) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : 0;
    };
    const warehouseRows = rows.map((r) => [t(r[0]), t(r[2]), t(r[4]), n(r[9]), t(r[5])]);
    const onlineRows = rows.map((r) => ({
      styleCode: t(r[0]),
      productName: t(r[1]),
      colorCode: t(r[2]),
      colorName: t(r[3]),
      size: t(r[4]),
      stockOnline: n(r[8]),
      stockOffline: n(r[9]),
    }));
    const warehouse = await saveWarehouseStockSnapshot(warehouseRows, source);
    const online = await saveOnlineTransferStockSnapshot(onlineRows, source);
    const sum = (i: number) => rows.reduce((a, r) => a + n(r[i]), 0);
    return NextResponse.json({
      ok: true,
      rows: rows.length,
      totals: { stock: sum(6), assigned: sum(7), availOnline: sum(8), availOffline: sum(9), availTotal: sum(10) },
      warehouse,
      online,
    });
  } catch (error: any) {
    console.error("onoff-stock-upload failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "온오프 재고 저장 실패" }, { status: 500 });
  }
}
