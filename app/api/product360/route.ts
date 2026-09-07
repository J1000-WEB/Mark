import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GI_BOARD_BASE = "https://gi-board.vercel.app/api/archive";

// MARK 6.32: gi-board의 상품360(판매·재고·소진율·색상별) API 프록시.
// 토큰은 서버 환경변수(PRODUCT360_TOKEN_OBT)에서만 쓰고 브라우저엔 노출하지 않습니다.
export async function GET(req: Request) {
  try {
    const token = process.env.PRODUCT360_TOKEN_OBT;
    if (!token) {
      return NextResponse.json({ ok: false, error: "PRODUCT360_TOKEN_OBT 환경변수가 설정되어 있지 않습니다." }, { status: 500 });
    }

    const url = new URL(req.url);
    const code = url.searchParams.get("code") || "";
    // MARK 6.79: 이사님 쪽에서 새 창구를 열어주셨어요 — include=selling,size,stores 로
    // 셀링포인트(판매가이드)/사이즈 원장/매장별 재고를 한 번에 받아올 수 있습니다.
    // include는 code(품번 단건) 조회에서만 동작하므로, code 없을 때는 안 붙입니다.
    const include = url.searchParams.get("include") || "";

    const target = new URL(`${GI_BOARD_BASE}/product360`);
    if (code) target.searchParams.set("code", code);
    if (code && include) target.searchParams.set("include", include);

    const res = await fetch(target.toString(), {
      headers: { "x-archive-token": token },
      cache: "no-store",
    });

    if (res.status === 404) {
      return NextResponse.json({ ok: false, error: "이 품번의 상품360 데이터가 없어요.", notFound: true }, { status: 200 });
    }
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `상품360 API 호출 실패 (status ${res.status})` }, { status: 200 });
    }

    const data = await res.json();

    // MARK 2026-09: visualTwin(비주얼 트윈, 닮은 상품 추천) 응답 형태가 이사님 쪽에서
    // 확정됨(candidates/gate/dropped/stockAsOf/found). 다만 재고 판단(gate/totalStock/
    // storeStock)은 gi-board 쪽 재고 원장 기준이라 우리 쪽 실시간 재고와 다를 수 있어서
    // 안 쓰고, 클라이언트가 우리 자체 소스(/api/store-stock-lookup)로 다시 확인합니다
    // — "이사님이라도 못 믿는다" 교차검증 원칙(CLAUDESS.md)과 같은 이유입니다.
    // 그래서 여기선 후보 목록(스타일/이미지/컬러/톤유사도)만 클라이언트가 바로 쓸 수
    // 있는 단일 형태(visualTwin.similarNeighbors)로 다듬어서 내려주고, gi-board의
    // 재고 관련 필드(gate/dropped/totalStock/storeStock/stockAsOf)는 내려주지 않습니다.
    if (data && data.visualTwin && typeof data.visualTwin === "object") {
      const vt = data.visualTwin;
      const rawCandidates = Array.isArray(vt.candidates) ? vt.candidates : [];
      const found = vt.found !== false; // 명시적으로 false일 때만 "트윈 없음"
      data.visualTwin = {
        found,
        reason: found ? undefined : vt.reason || "아직 촬영/누끼 작업이 안 끝난 품번이라 비슷한 상품 데이터가 없어요.",
        similarNeighbors: rawCandidates.map((c: any) => ({
          style: c.style,
          heroUrl: c.heroUrl || null,
          color: c.color || null,
          toneSim: typeof c.toneSim === "number" ? c.toneSim : null,
        })),
      };
    }

    return NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("product360 proxy failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "상품360 조회 실패" }, { status: 500 });
  }
}
