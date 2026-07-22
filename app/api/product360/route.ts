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

    const target = new URL(`${GI_BOARD_BASE}/product360`);
    if (code) target.searchParams.set("code", code);

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
