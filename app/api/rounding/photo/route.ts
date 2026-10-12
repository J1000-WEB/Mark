import { NextRequest, NextResponse } from "next/server";
import { uploadBinaryFileToDrive, downloadDriveFileWritable } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

// MARK 2026-10-12: "라운딩" 사진 첨부(옵션 B: 앱에서 바로 업로드) — 클라이언트가 Canvas로
// 이미 리사이즈(최대 1600px)/압축(JPEG 75~80%)한 base64 데이터를 올립니다. Vercel 요청
// 본문 한도(~4.5MB)에 걸릴 일이 거의 없게(보통 수백KB) 압축을 먼저 강제하는 구조입니다.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dataBase64 = String(body?.dataBase64 || "");
    const mimeType = String(body?.mimeType || "image/jpeg");
    const storeName = String(body?.storeName || "매장");
    if (!dataBase64) {
      return NextResponse.json({ ok: false, error: "업로드할 사진이 없어요." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const base64Part = dataBase64.includes(",") ? dataBase64.split(",").pop()! : dataBase64;
    const buffer = Buffer.from(base64Part, "base64");

    // MARK: 압축 후에도 혹시 너무 크면(예: 압축 실패) 서버에서도 한 번 더 막아서, 드라이브
    // 업로드가 타임아웃나거나 Vercel 응답이 끊기는 것보다 먼저 분명한 에러를 돌려줍니다.
    const MAX_BYTES = 4_000_000;
    if (buffer.length > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: `사진이 너무 커요(${(buffer.length / 1_000_000).toFixed(1)}MB). 조금 더 압축해서 다시 올려주세요.` },
        { status: 413, headers: NO_STORE_HEADERS }
      );
    }

    const ext = mimeType.includes("png") ? "png" : "jpg";
    const fileName = `라운딩_${storeName}_${Date.now()}.${ext}`;
    const uploaded = await uploadBinaryFileToDrive(fileName, buffer, mimeType);

    return NextResponse.json({ ok: true, fileId: uploaded.id, fileName: uploaded.name }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("rounding photo POST failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "업로드 실패" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

// GET /api/rounding/photo?id=<driveFileId> → 사진 바이트를 그대로 내려줌(화면 <img>용)
export async function GET(req: NextRequest) {
  try {
    const fileId = req.nextUrl.searchParams.get("id") || "";
    if (!fileId) {
      return NextResponse.json({ ok: false, error: "id가 필요해요." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const { buffer, mimeType } = await downloadDriveFileWritable(fileId);
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": mimeType, "Cache-Control": "private, max-age=86400" },
    });
  } catch (error: any) {
    console.error("rounding photo GET failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
