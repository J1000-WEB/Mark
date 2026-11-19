import { NextResponse } from "next/server";
import { getSheetValuesById } from "@/lib/googleSheets";
import { PIP_ARCHIVE_SHEET_ID } from "@/lib/pipArchive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// MARK 2026-11-19: 스타일 → 성별(MARK_PIP_ARCHIVE "상품정보" L열). 상품탭 구성비의 여성·공용·남성 구분용.
let cache: { at: number; map: Record<string, string> } | null = null;

export async function GET() {
  try {
    if (!cache || Date.now() - cache.at > 3600 * 1000) {
      const [b, l] = await Promise.all([
        getSheetValuesById(PIP_ARCHIVE_SHEET_ID, "상품정보", "B:B"),
        getSheetValuesById(PIP_ARCHIVE_SHEET_ID, "상품정보", "L:L"),
      ]);
      const map: Record<string, string> = {};
      for (let i = 1; i < b.length; i++) {
        const st = String(b[i]?.[0] ?? "").trim().toUpperCase();
        const sx = String(l[i]?.[0] ?? "").trim();
        if (st && sx && !map[st]) map[st] = sx;
      }
      cache = { at: Date.now(), map };
    }
    const values: Record<string, number> = {};
    for (const v of Object.values(cache.map)) values[v] = (values[v] || 0) + 1;
    return NextResponse.json({ ok: true, map: cache.map, values }, { headers: { "Cache-Control": "s-maxage=600" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "조회 실패" }, { status: 500 });
  }
}
