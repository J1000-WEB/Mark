import { NextResponse } from "next/server";
import { computeRtSku } from "@/lib/rtSkuCompute";
import { loadSavedRtSuggestions, saveRtSuggestions } from "@/lib/rtSuggestionStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// MARK 2026-10-20: SKU 방식 RT(재고MD 로직) — 기존 RT와 나란히 비교하기 위한 별도 계산.
//  GET: 저장된 결과(요약+비교만; 목록은 엑셀 다운로드로) / POST: 계산 후 그날 결과로 저장(RTSKU_날짜 탭)
function slim(saved: any) {
  if (!saved) return null;
  const lines = saved.rtSuggestions || [];
  return {
    savedDate: saved.savedDate,
    savedAt: saved.savedAt,
    isToday: saved.isToday,
    computeMs: saved.computeMs,
    summary: saved.summary,
    legacy: saved.legacy,
    inputs: saved.inputs,
    preview: {
      rt: lines.filter((x: any) => x.kind === "rt").slice(0, 30),
      ship: lines.filter((x: any) => x.kind === "ship").slice(0, 30),
    },
  };
}

export async function GET(req: Request) {
  try {
    const date = new URL(req.url).searchParams.get("date") || undefined;
    const { saved, savedDates } = await loadSavedRtSuggestions(date, "sku");
    return NextResponse.json({ ok: true, saved: slim(saved), savedDates }, { headers: NO_STORE });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST() {
  try {
    const r = await computeRtSku();
    let saveError = "";
    try {
      await saveRtSuggestions({ rtSuggestions: r.lines, computeMs: r.computeMs, extraMeta: { summary: r.summary, legacy: r.legacy, inputs: r.inputs } }, "sku");
    } catch (e: any) {
      console.error("rt-sku save failed:", e);
      saveError = e?.message || "저장 실패";
    }
    const { saved, savedDates } = await loadSavedRtSuggestions(undefined, "sku").catch(() => ({ saved: null, savedDates: [] as string[] }));
    return NextResponse.json({ ok: true, saved: slim(saved), savedDates, saveError }, { headers: NO_STORE });
  } catch (error: any) {
    console.error("rt-sku compute failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "SKU 방식 RT 계산 실패" }, { status: 500, headers: NO_STORE });
  }
}
