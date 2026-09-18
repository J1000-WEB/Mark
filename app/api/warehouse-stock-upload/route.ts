import { NextResponse } from "next/server";
import { saveWarehouseStockSnapshot, getWarehouseStockSnapshotMeta } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK 2026-09-17: "판매분 배분" 탭의 물류가용재고 정확도 개선 — 담당자가 ERP에서 내려받은
// "온오프재고현황" 엑셀을 업로드하면, 클라이언트에서 이미 [스타일,칼라,사이즈,가용(오프)]
// 4열로 압축해서 보내고(원본 17,000행대 24열을 그대로 올리면 무겁고 느립니다), 여기서는
// 그걸 그대로 전용 스냅샷 시트에 저장만 합니다. 업로드 일시도 같이 저장해서 GET으로
// "마지막 업데이트: ..."를 언제든 조회할 수 있게 합니다(화면 진입 시 상시 표시용).

// GET: 마지막 업로드 정보 조회
export async function GET() {
  try {
    const meta = await getWarehouseStockSnapshotMeta();
    return NextResponse.json({ ok: true, meta }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500 });
  }
}

// POST: 압축된 재고 스냅샷 저장 { rows: [[스타일,칼라,사이즈,가용(오프)], ...], fileName }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rows = Array.isArray(body?.rows) ? body.rows : null;
    const fileName = typeof body?.fileName === "string" ? body.fileName : "";
    if (!rows || !rows.length) {
      return NextResponse.json({ ok: false, error: "업로드할 데이터(rows)가 없습니다." }, { status: 400 });
    }
    const result = await saveWarehouseStockSnapshot(rows, fileName);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("warehouse-stock-upload failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "재고 스냅샷 업로드 실패" }, { status: 500 });
  }
}
