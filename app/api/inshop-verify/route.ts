import { NextResponse } from "next/server";
import { saveVerify, readLatestVerify } from "@/lib/inshopVerify";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK 2026-11-20: 인샵 매출 업로드 검증(PC verify-inshop-upload.js → 여기). GET = 최근 7일 매출일 결과.
export async function GET(req: Request) {
  try {
    // 2026-11-27 메일 설정 점검(메일은 안 보냄): 키·받는 사람·보내는 주소, Resend에 인증된 도메인
    if (new URL(req.url).searchParams.get("mailcheck") === "1") {
      const key = process.env.RESEND_API_KEY || "";
      const mask = (v?: string) => (v ? v.replace(/^(.{2}).*(@.*)$/, "$1***$2") : "");
      let domains: any = null;
      if (key) {
        const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } }).catch(() => null);
        const j = r ? await r.json().catch(() => ({})) : {};
        domains = r ? { status: r.status, list: (j?.data || []).map((d: any) => ({ name: d.name, status: d.status })), message: j?.message } : "요청 실패";
      }
      return NextResponse.json({
        ok: true,
        hasKey: !!key,
        to: mask(process.env.INSHOP_VERIFY_EMAIL_TO || process.env.ALERT_EMAIL_TO),
        alertTo: mask(process.env.ALERT_EMAIL_TO),
        from: process.env.ALERT_EMAIL_FROM || "(기본) onboarding@resend.dev",
        domains,
      });
    }
    return NextResponse.json({ ok: true, items: await readLatestVerify() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    const r = await saveVerify(items, { alert: body?.alert !== false });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
