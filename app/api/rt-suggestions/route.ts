import { NextResponse } from "next/server";
import { buildRtSuggestions } from "@/lib/dataBuilder";
import { loadSavedRtSuggestions, saveRtSuggestions } from "@/lib/rtSuggestionStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// MARK 2026-09-24: 첫 배포 후 504(Gateway Timeout)가 나서 /api/data와 같은 300초로 둡니다
// (vercel.json에도 300초/3009MB로 설정되어 있음). 실제 무거운 계산은 POST(버튼)에서만 돕니다.
export const maxDuration = 300;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

// MARK 2026-10-19: 재고CTRL "RT" 칸 — 계산과 조회를 분리했습니다.
//  GET  : 저장된 RT 제안만 읽어옵니다(계산 없음, 가벼움). ?date=YYYY-MM-DD로 지난 날짜 조회.
//  POST : 사용자가 "RT 제안 계산" 버튼을 눌렀을 때만 계산하고, 그날 결과로 저장합니다
//         (같은 날 다시 누르면 그날 결과를 교체).
// 실패는 내장 데이터로 감추지 않고 실제 에러 메시지를 그대로 돌려줍니다.
export async function GET(req: Request) {
  try {
    const date = new URL(req.url).searchParams.get("date") || undefined;
    const { saved, savedDates } = await loadSavedRtSuggestions(date);
    return NextResponse.json({ ok: true, saved, savedDates }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("rt-suggestions load failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "저장된 RT 제안을 불러오지 못했습니다." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function POST() {
  try {
    const data = await buildRtSuggestions();
    let saveError = "";
    let savedMeta: any = null;
    try {
      savedMeta = await saveRtSuggestions(data);
    } catch (e: any) {
      // 계산은 됐는데 저장만 실패한 경우 — 결과는 그대로 보여주고 저장 실패만 알립니다.
      console.error("rt-suggestions save failed:", e);
      saveError = e?.message || "저장 실패";
    }
    const { savedDates } = await loadSavedRtSuggestions().catch(() => ({ savedDates: [] as string[] }));
    return NextResponse.json(
      {
        ok: true,
        saved: { ...(savedMeta || {}), ...data, isToday: true, savedAt: savedMeta?.savedAt || data.computedAt },
        savedDates,
        saveError,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error: any) {
    console.error("rt-suggestions compute failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "RT 이동 제안 계산 실패" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
