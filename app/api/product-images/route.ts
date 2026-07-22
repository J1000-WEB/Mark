import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GI_BOARD_BASE = "https://gi-board.vercel.app/api/archive";

// MARK 6.29: gi-board(임원 브리핑 보드)의 상품 이미지 API를 대신 호출해서 결과만 브라우저에 넘깁니다.
// 토큰은 절대 프론트엔드에 노출하지 않고, 여기(서버)에서만 씁니다.
export async function GET(req: Request) {
  try {
    const token = process.env.GALLERY_TOKEN_OBT;
    if (!token) {
      return NextResponse.json({ ok: false, error: "GALLERY_TOKEN_OBT 환경변수가 설정되어 있지 않습니다." }, { status: 500 });
    }

    const url = new URL(req.url);
    const code = url.searchParams.get("code") || "";

    const target = new URL(`${GI_BOARD_BASE}/images`);
    if (code) target.searchParams.set("code", code);

    const res = await fetch(target.toString(), {
      headers: { "x-archive-token": token },
      cache: "no-store",
    });

    if (res.status === 404) {
      return NextResponse.json({ ok: false, error: "이 품번의 이미지가 아직 등록되지 않았어요.", notFound: true }, { status: 200 });
    }
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `이미지 API 호출 실패 (status ${res.status})` }, { status: 200 });
    }

    const data = await res.json();
    return NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("product-images proxy failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "이미지 조회 실패" }, { status: 500 });
  }
}
