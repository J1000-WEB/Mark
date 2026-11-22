import { NextResponse } from "next/server";
import { buildMeetingAuto, readMeeting, saveMeeting, autoUpdateMeeting, defaultMeetingWeek, mondayOf, weekLabel } from "@/lib/meetingReport";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

// MARK 2026-11-20: 회의 탭(주간 리더회의 한 장)
// GET ?week=YYYY-MM-DD(회의주 월요일, 없으면 이번 주) → 저장본 + 지난 회의(이번달 과업 이어받기)
// GET ?week=&auto=1 → MARK 데이터로 만든 지난주/이번주 초안
// POST {doc} → 저장
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const w = sp.get("week");
    const week = w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? mondayOf(w) : defaultMeetingWeek();
    if (sp.get("auto")) return NextResponse.json({ ok: true, week, label: weekLabel(week), ...(await buildMeetingAuto(week)) }, { headers: { "Cache-Control": "no-store" } });
    const { doc, prev } = await readMeeting(week);
    return NextResponse.json({ ok: true, week, label: weekLabel(week), doc, prev }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    if (sp.get("autoSave")) {
      // MARK 2026-11-22: PC 스케줄러(월 6:00·9:50) — 지난주 회의 초안 자동 갱신·저장(손으로 고친 칸은 안 건드림)
      const w = sp.get("week");
      const week = w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? mondayOf(w) : defaultMeetingWeek();
      return NextResponse.json({ ok: true, ...(await autoUpdateMeeting(week)) });
    }
    const body = await req.json();
    const r = await saveMeeting(body.doc);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
