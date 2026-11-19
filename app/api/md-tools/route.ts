import { NextResponse } from "next/server";
import { computeOnlineTransfer, computeOutlet, computeSlowMovers } from "@/lib/mdTools";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

// MARK 2026-11-19: 재고CTRL 팩토리아울렛·온라인 이관요청·저소진 랭킹(lib/mdTools.ts)
// POST { tool: "outlet"|"online"|"slow", ...옵션 }
export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const t0 = Date.now();
    let result: any;
    if (b.tool === "outlet") result = await computeOutlet(b.config || {});
    else if (b.tool === "online") result = await computeOnlineTransfer({ topN: Number(b.topN) || 50, days: Number(b.days) || 28, styles: Array.isArray(b.styles) ? b.styles : [] });
    else if (b.tool === "slow") result = await computeSlowMovers({ days: Number(b.days) || 28 });
    else return NextResponse.json({ ok: false, error: "tool을 지정해 주세요." }, { status: 400 });
    return NextResponse.json({ ok: true, ...result, computeMs: Date.now() - t0 });
  } catch (e: any) {
    console.error("md-tools failed:", e);
    return NextResponse.json({ ok: false, error: e?.message || "계산 실패" }, { status: 500 });
  }
}
