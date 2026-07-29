import { NextResponse } from "next/server";
import { buildMarkStockMap, lookupMarkStock, isStockDiscrepant } from "@/lib/vmdCrossCheck";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GI_BOARD_BASE = "https://gi-board.vercel.app/api/archive";

// MARK 6.52: gi-board VMD export를 그대로 믿지 않고, MARK 자체 재고(Daily_Sales_History)와
// 교차검증해서 어긋나는 항목에 표시를 붙여 돌려줍니다.
export async function GET(req: Request) {
  try {
    const token = process.env.VMD_TOKEN_OBT;
    if (!token) {
      return NextResponse.json({ ok: false, error: "VMD_TOKEN_OBT 환경변수가 설정되어 있지 않습니다." }, { status: 500 });
    }

    const url = new URL(req.url);
    const store = url.searchParams.get("store") || "";
    const stalled = url.searchParams.get("stalled") || "";
    const thumbs = url.searchParams.get("thumbs") || "";

    const target = new URL(`${GI_BOARD_BASE}/vmd`);
    if (store) target.searchParams.set("store", store);
    if (stalled) target.searchParams.set("stalled", stalled);
    if (thumbs) target.searchParams.set("thumbs", thumbs);

    const giRes = await fetch(target.toString(), {
      headers: { "x-archive-token": token },
      cache: "no-store",
    });

    if (giRes.status === 401) {
      return NextResponse.json({ ok: false, error: "gi-board 토큰이 유효하지 않습니다." }, { status: 401 });
    }
    if (!giRes.ok) {
      return NextResponse.json({ ok: false, error: `gi-board VMD API 호출 실패 (status ${giRes.status})` }, { status: 200 });
    }

    const data = await giRes.json();

    // 매장 하나를 지정한 조회일 때만 교차검증 (매장 목록 조회는 재고 항목이 없어서 대상 아님)
    if (store && Array.isArray(data.items)) {
      const markStockMap = await buildMarkStockMap();
      let discrepancyCount = 0;

      data.items = data.items.map((item: any) => {
        const markStock = lookupMarkStock(markStockMap, store, item.sku);
        const discrepant = isStockDiscrepant(Number(item.stock || 0), markStock);
        if (discrepant) discrepancyCount++;
        return { ...item, markStock, stockDiscrepant: discrepant };
      });

      data.crossCheck = {
        checkedAgainst: "MARK Daily_Sales_History",
        discrepancyCount,
        itemCount: data.items.length,
      };
    }

    return NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("vmd-directives proxy failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "VMD 데이터 조회 실패" }, { status: 500 });
  }
}
