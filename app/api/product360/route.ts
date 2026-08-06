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
    return NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("product360 proxy failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "상품360 조회 실패" }, { status: 500 });
  }
}
