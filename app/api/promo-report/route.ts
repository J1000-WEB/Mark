import { NextResponse } from "next/server";
import { buildPromoReport, readPromoView, savePromoView } from "@/lib/promoReport";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

// MARK 2026-11-17: 주간 IMC 프로모션 결과 — GET ?week=YYYY-MM-DD(그 주 월요일, 없으면 지난주)
// POST {groups:[...]} — IMC 현황 조회 선택 저장
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const groups = Array.isArray(body?.groups) ? body.groups.map(String).filter(Boolean) : [];
    const savedAt = await savePromoView(groups);
    return NextResponse.json({ ok: true, groups, savedAt });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "저장 실패" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    if (sp.get("debugArchive")) {
      // 점검용: ?debugArchive=YYYY-MM-DD,YYYY-MM-DD&style=XXX → 보관 시트의 그 품번 줄(채널·팀별)
      const { readArchivedSales } = await import("@/lib/pipArchive");
      const style = (sp.get("style") || "").toUpperCase();
      const { rows, foundDates } = await readArchivedSales(sp.get("debugArchive")!.split(","));
      const agg = new Map<string, { team: string; store: string; qty: number; amount: number }>();
      for (const r of rows) {
        if (style && r.styleCode !== style) continue;
        const k = `${r.team}|${r.storeName}`;
        const a = agg.get(k) || { team: r.team, store: r.storeName, qty: 0, amount: 0 };
        a.qty += r.qty; a.amount += r.amount; agg.set(k, a);
      }
      const teams = [...new Set(rows.map((r) => r.team))];
      return NextResponse.json({ foundDates, teams, rows: [...agg.values()].sort((a, b) => b.amount - a.amount) });
    }
    if (sp.get("view") === "1") return NextResponse.json({ ok: true, ...(await readPromoView()) }, { headers: { "Cache-Control": "no-store" } });
    const week = sp.get("week") || undefined;
    // ?groups=a|b|c (프로모션 이름에 쉼표가 있을 수 있어 | 로 구분) — 그 프로모션만 계산
    const groups = sp.get("groups") ? sp.get("groups")!.split("|").map((x) => x.trim()).filter(Boolean) : null;
    return NextResponse.json({ ok: true, ...(await buildPromoReport(week, groups)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("promo-report failed:", e);
    return NextResponse.json({ ok: false, error: e?.message || "프로모션 리포트 계산 실패" }, { status: 500 });
  }
}
