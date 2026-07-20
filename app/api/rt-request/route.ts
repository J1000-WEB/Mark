import { NextResponse } from "next/server";
import { buildRtRequestSuggestion } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const styleCode = url.searchParams.get("styleCode") || "";
    const toStore = url.searchParams.get("toStore") || "";
    const qtyParam = url.searchParams.get("qty");
    const qty = qtyParam ? Number(qtyParam) : undefined;
    const color = url.searchParams.get("color") || "";

    const result = await buildRtRequestSuggestion(styleCode, toStore, qty, color);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "점포요청 RT 계산 실패" }, { status: 500 });
  }
}
