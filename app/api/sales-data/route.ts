import { NextResponse } from "next/server";
import { getSalesDataPayload } from "@/lib/weeklyDataProvider";
import { loadLatestReportSnapshot } from "@/lib/salesDataSnapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") === "color" ? "color" : "style";
    const week = String(url.searchParams.get("week") || "").trim();
    const refresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";

    // MARK 6.16: 특정 주차를 콕 집어서 요청한 게 아니면, 업로드된 스냅샷(있다면)을 우선 보여줍니다.
    if (!week && !refresh) {
      const snapshot = await loadLatestReportSnapshot(type).catch(() => null);
      if (snapshot && snapshot.rows.length) {
        const oldPayload = await getSalesDataPayload(type, "", {}).catch(() => null);
        return NextResponse.json({
          ok: true,
          mode: "upload-snapshot",
          type,
          weeks: oldPayload?.weeks || [],
          selectedWeek: snapshot.weekKey,
          selectedWeekLabel: `${snapshot.weekKey} (업로드)`,
          analysisLabel: snapshot.weekKey,
          compareLabel: "",
          sheetName: `주간판매데이터(업로드) · ${type === "color" ? "컬러" : "품번"}`,
          rows: snapshot.rows,
          rowCount: Math.max(0, snapshot.rows.length - 7),
          colCount: (snapshot.rows[3] || []).length,
          sources: {
            primary: "업로드 스냅샷 (SalesData_Upload_Snapshot)",
            fallback: "금주/전주 시트 실시간 계산",
          },
        }, { headers: { "Cache-Control": "no-store, max-age=0" } });
      }
    }

    const payload = await getSalesDataPayload(type, week, { refresh });
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("sales-data weekly-history load failed", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "판매데이터를 생성하지 못했습니다.",
      weeks: [],
      rows: [],
    }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}

