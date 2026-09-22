import { NextResponse } from "next/server";
import { saveStoreStockSnapshot, getStoreStockSnapshotMeta } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK 2026-09-21: 점포요청 RT의 재고 정확도 개선 — 소천님이 "판매데이터 제안" 탭에 매일
// 아침 올리시는 PIP 파일에서 매장별 재고를 뽑아(클라이언트의 extractStoreStockRows) 이
// 전용 스냅샷 시트에 저장합니다(물류가용재고_스냅샷과 동일한 패턴). 점포요청 RT는 항상
// 이 가벼운 스냅샷을 우선 재고 소스로 읽습니다.

// GET: 마지막 업로드 정보 조회
export async function GET() {
  try {
    const meta = await getStoreStockSnapshotMeta();
    return NextResponse.json({ ok: true, meta }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500 });
  }
}

// POST: 압축된 매장별 재고 스냅샷 저장 { rows: [[스타일,스타일명,칼라,칼라명,사이즈,매장,재고], ...], fileName }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rows = Array.isArray(body?.rows) ? body.rows : null;
    const fileName = typeof body?.fileName === "string" ? body.fileName : "";
    if (!rows || !rows.length) {
      return NextResponse.json({ ok: false, error: "업로드할 데이터(rows)가 없습니다." }, { status: 400 });
    }
    const result = await saveStoreStockSnapshot(rows, fileName);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("store-stock-upload failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "매장별 재고 스냅샷 업로드 실패" }, { status: 500 });
  }
}
