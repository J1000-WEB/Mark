"use client";

import { useEffect, useMemo, useState } from "react";
import NavTabs from "@/components/NavTabs";

function text(v: any) {
  return String(v ?? "").trim();
}

function toDate(value: string) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ymd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function displayDay(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function dayName(date: Date) {
  return ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
}

function monthTitle(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function dateRange(start: Date, end: Date) {
  const out: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function diffDays(a: Date, b: Date) {
  const day = 24 * 60 * 60 * 1000;
  return Math.round((ymd(b as Date) as any, (b.getTime() - a.getTime()) / day));
}

function clampDate(date: Date, start: Date, end: Date) {
  if (date < start) return start;
  if (date > end) return end;
  return date;
}

function categoryClass(category: string) {
  if (category === "promotion") return "bg-rose-500 text-white";
  if (category === "vmd") return "bg-emerald-500 text-white";
  if (category === "meeting") return "bg-violet-500 text-white";
  if (category === "product") return "bg-cyan-500 text-white";
  if (category === "schedule") return "bg-blue-600 text-white";
  if (category === "performance") return "bg-amber-300 text-slate-900";
  return "bg-slate-300 text-slate-800";
}

function categorySoftClass(category: string) {
  if (category === "promotion") return "border-rose-100 bg-rose-50 text-rose-700";
  if (category === "vmd") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (category === "meeting") return "border-violet-100 bg-violet-50 text-violet-700";
  if (category === "product") return "border-cyan-100 bg-cyan-50 text-cyan-700";
  if (category === "schedule") return "border-blue-100 bg-blue-50 text-blue-700";
  if (category === "performance") return "border-amber-100 bg-amber-50 text-amber-700";
  return "border-slate-100 bg-slate-50 text-slate-600";
}

const TEAM_MEMBERS = ["지승현", "최다은", "손민지", "한선아", "소재천", "이용훈", "조지현"];

const CATEGORY_ROWS = [
  { key: "promotion", label: "프로모션" },
  { key: "vmd", label: "VMD" },
  { key: "meeting", label: "회의" },
  ...TEAM_MEMBERS.map((name) => ({ key: `staff:${name}`, label: name, category: "schedule" })),
  { key: "schedule", label: "기타 일정" },
  { key: "general", label: "기타" },
];

function eventDurationDays(event: any) {
  const s = toDate(event.startDate);
  const e = toDate(event.endDate || event.startDate);
  if (!s || !e) return 1;
  return Math.max(1, diffDays(s, e) + 1);
}

function EventBar({ event, monthStartDate, monthEndDate, dayWidth }: { event: any; monthStartDate: Date; monthEndDate: Date; dayWidth: number }) {
  const start = toDate(event.startDate) || monthStartDate;
  const end = toDate(event.endDate || event.startDate) || start;
  const visibleStart = clampDate(start, monthStartDate, monthEndDate);
  const visibleEnd = clampDate(end < start ? start : end, monthStartDate, monthEndDate);
  const left = diffDays(monthStartDate, visibleStart) * dayWidth;
  const width = (diffDays(visibleStart, visibleEnd) + 1) * dayWidth - 8;
  const isLong = eventDurationDays(event) > 1;

  return (
    <div
      className={`absolute top-1 rounded-xl px-3 py-2 text-xs font-black shadow-sm ${categoryClass(event.category)} ${isLong ? "h-9" : "h-8"}`}
      style={{ left: `${left + 4}px`, width: `${Math.max(90, width)}px` }}
      title={`${event.startDate}${event.endDate && event.endDate !== event.startDate ? ` ~ ${event.endDate}` : ""} / ${event.person || ""} / ${event.group || ""} / ${event.content || event.title}`}
    >
      <div className="truncate">
        {isLong ? "━━ " : "● "} {event.displayTitle || event.title}
      </div>
    </div>
  );
}

function stackEvents(events: any[]) {
  const sorted = [...events].sort((a, b) => {
    const aStart = text(a.startDate);
    const bStart = text(b.startDate);
    if (aStart !== bStart) return aStart.localeCompare(bStart);
    return eventDurationDays(b) - eventDurationDays(a);
  });

  const lanes: any[][] = [];
  for (const event of sorted) {
    const s = toDate(event.startDate);
    const e = toDate(event.endDate || event.startDate);
    const startMs = s?.getTime() || 0;
    const endMs = e?.getTime() || startMs;

    let placed = false;
    for (const lane of lanes) {
      const last = lane[lane.length - 1];
      const lastEnd = toDate(last.endDate || last.startDate)?.getTime() || 0;
      if (startMs > lastEnd) {
        lane.push(event);
        placed = true;
        break;
      }
    }
    if (!placed) lanes.push([event]);
  }
  return lanes;
}

export default function ScheduleDashboard() {
  const [data, setData] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [hiddenSchedule, setHiddenSchedule] = useState(true);

  async function load() {
    const res = await fetch("/api/schedule", { cache: "no-store" });
    const json = await res.json();
    setData(json);

    // MARK 4.91: 판매전체상 기준일은 항상 오늘 기준으로 시작합니다.
    // 과거/미래 첫 일정으로 자동 이동하지 않습니다.
  }

  useEffect(() => {
    load().catch(() => setData({ ok: false, error: "판매전체상 데이터를 불러오지 못했습니다.", events: [] }));
  }, []);

  const events = data?.events || [];
  const monthStartDate = monthStart(currentMonth);
  const monthEndDate = monthEnd(currentMonth);
  const days = dateRange(monthStartDate, monthEndDate);
  const dayWidth = 96;
  const timelineWidth = days.length * dayWidth;

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((event: any) => {
      const s = toDate(event.startDate);
      const e = toDate(event.endDate || event.startDate);
      const overlaps = s && e && e >= monthStartDate && s <= monthEndDate;
      if (!overlaps) return false;
      if (hiddenSchedule && event.category === "schedule" && /휴무/.test(`${event.title} ${event.group} ${event.content} ${event.displayTitle}`)) return false;
      if (!q) return true;
      const raw = Object.values(event.raw || {}).join(" ");
      return `${event.title} ${event.displayTitle || ""} ${event.person || ""} ${event.group} ${event.largeCategory} ${raw}`.toLowerCase().includes(q);
    });
  }, [events, query, currentMonth, hiddenSchedule]);

  const eventsByCategory = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const row of CATEGORY_ROWS) map.set(row.key, []);
    for (const event of filteredEvents) {
      const key = event.rowKey || event.category || "general";
      if (!map.has(key)) {
        const fallbackKey = event.category || "general";
        if (!map.has(fallbackKey)) map.set(fallbackKey, []);
        map.get(fallbackKey)!.push(event);
      } else {
        map.get(key)!.push(event);
      }
    }
    return map;
  }, [filteredEvents]);

  const counts = useMemo(() => {
    const base: Record<string, number> = {};
    for (const row of CATEGORY_ROWS) base[row.key] = 0;
    for (const event of filteredEvents) base[event.category || "general"] = (base[event.category || "general"] || 0) + 1;
    return base;
  }, [filteredEvents]);

  function moveMonth(delta: number) {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-[1800px] space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">판매전체상</h1>
            <p className="mt-1 text-sm text-slate-500">Schedule_Simple 기준 전체 판매 운영 로드맵입니다.</p>
            <p className="mt-1 text-xs font-semibold text-blue-600">{data?.sheetName ? `${data.sheetName} · 메인 스프레드시트 실시간 데이터` : "Schedule_Simple"}</p>
          </div>
          <NavTabs active="schedule" />
        </header>

        <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black text-slate-400">MARK 4.80 SCHEDULE ROADMAP</p>
              <h2 className="mt-2 text-3xl font-black">{monthTitle(currentMonth)}</h2>
              <p className="mt-2 text-sm font-semibold text-slate-300">가로는 날짜, 세로는 운영 구분입니다. 기간 일정은 막대로 연결됩니다.</p>
            </div>

            <div className="grid grid-cols-6 gap-2 text-center">
              <div className="rounded-2xl bg-white/10 px-4 py-3">
                <p className="text-2xl font-black">{filteredEvents.length}</p>
                <p className="text-[11px] font-bold text-slate-400">전체</p>
              </div>
              <div className="rounded-2xl bg-rose-500/20 px-4 py-3">
                <p className="text-2xl font-black">{counts.promotion || 0}</p>
                <p className="text-[11px] font-bold text-rose-200">프로모션</p>
              </div>
              <div className="rounded-2xl bg-emerald-500/20 px-4 py-3">
                <p className="text-2xl font-black">{counts.vmd || 0}</p>
                <p className="text-[11px] font-bold text-emerald-200">VMD</p>
              </div>
              <div className="rounded-2xl bg-violet-500/20 px-4 py-3">
                <p className="text-2xl font-black">{counts.marketing || 0}</p>
                <p className="text-[11px] font-bold text-violet-200">마케팅</p>
              </div>
              <div className="rounded-2xl bg-cyan-500/20 px-4 py-3">
                <p className="text-2xl font-black">{counts.product || 0}</p>
                <p className="text-[11px] font-bold text-cyan-200">상품</p>
              </div>
              <div className="rounded-2xl bg-blue-500/20 px-4 py-3">
                <p className="text-2xl font-black">{counts.schedule || 0}</p>
                <p className="text-[11px] font-bold text-blue-200">스케줄</p>
              </div>
            </div>
          </div>
        </section>

        {data && !data.ok ? (
          <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm font-black text-rose-700">
            {data.error}
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => moveMonth(-1)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">이전달</button>
              <button type="button" onClick={() => setCurrentMonth(new Date())} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">오늘</button>
              <button type="button" onClick={() => moveMonth(1)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">다음달</button>
              <button type="button" onClick={load} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white">새로고침</button>
              <button
                type="button"
                onClick={() => setHiddenSchedule((v) => !v)}
                className={`rounded-xl px-4 py-2 text-sm font-black ${hiddenSchedule ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"}`}
              >
                {hiddenSchedule ? "휴무 숨김" : "휴무 표시"}
              </button>
            </div>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="행사/구분/내용 검색"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-slate-400 lg:w-[360px]"
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex border-b border-slate-200 bg-slate-50">
            <div className="sticky left-0 z-20 w-36 shrink-0 border-r border-slate-200 bg-slate-50 p-3 text-xs font-black text-slate-500">
              구분
            </div>
            <div className="overflow-x-auto">
              <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, ${dayWidth}px)`, width: `${timelineWidth}px` }}>
                {days.map((day) => {
                  const isToday = ymd(day) === ymd(new Date());
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <div key={ymd(day)} className={`border-r border-slate-200 p-2 text-center ${isWeekend ? "bg-slate-100" : "bg-white"} ${isToday ? "bg-slate-900 text-white" : ""}`}>
                      <p className="text-xs font-black">{displayDay(day)}</p>
                      <p className="mt-1 text-[11px] font-bold opacity-70">{dayName(day)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="max-h-[720px] overflow-auto">
            {CATEGORY_ROWS.map((row) => {
              const categoryEvents = eventsByCategory.get(row.key) || [];
              const lanes = stackEvents(categoryEvents);
              const rowHeight = Math.max(58, lanes.length * 44 + 12);

              return (
                <div key={row.key} className="flex border-b border-slate-100">
                  <div className={`sticky left-0 z-10 flex w-36 shrink-0 items-center justify-between border-r border-slate-200 bg-white p-3 ${categorySoftClass((row as any).category || row.key)}`}>
                    <div>
                      <p className="text-sm font-black">{row.label}</p>
                      <p className="mt-1 text-[11px] font-bold opacity-70">{categoryEvents.length}건</p>
                    </div>
                  </div>

                  <div className="relative" style={{ width: `${timelineWidth}px`, height: `${rowHeight}px` }}>
                    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, ${dayWidth}px)` }}>
                      {days.map((day) => (
                        <div key={ymd(day)} className={`border-r border-slate-100 ${day.getDay() === 0 || day.getDay() === 6 ? "bg-slate-50" : ""}`} />
                      ))}
                    </div>

                    {lanes.map((lane, laneIndex) => (
                      <div key={`${row.key}-lane-${laneIndex}`} className="absolute left-0 right-0" style={{ top: `${laneIndex * 44 + 8}px`, height: "40px" }}>
                        {lane.map((event: any) => (
                          <EventBar key={event.id} event={event} monthStartDate={monthStartDate} monthEndDate={monthEndDate} dayWidth={dayWidth} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">전체 일정 목록</h2>
          <div className="mt-4 max-h-[420px] overflow-x-auto overflow-y-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2">시작일</th>
                  <th className="px-3 py-2">종료일</th>
                  <th className="px-3 py-2">대분류</th>
                  <th className="px-3 py-2">성명</th>
                  <th className="px-3 py-2">구분</th>
                  <th className="px-3 py-2">내용</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((event: any) => (
                  <tr key={`table-${event.id}`} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-bold">{event.startDate}</td>
                    <td className="px-3 py-2 font-bold">{event.endDate}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${categoryClass(event.category)}`}>{event.largeCategory || event.categoryLabel}</span></td>
                    <td className="px-3 py-2 font-bold">{event.person || "-"}</td>
                    <td className="px-3 py-2 font-bold">{event.group}</td>
                    <td className="px-3 py-2 text-slate-600">{event.content || event.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">4.80 운영 메모</h2>
          <div className="mt-3 grid gap-3 text-sm font-semibold leading-6 text-slate-600 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">자동 Snapshot: 매일 12:00 Daily_Sales_History 저장</div>
            <div className="rounded-2xl bg-slate-50 p-4">주간 Snapshot: 매주 월요일 12:10 Product/Store/RT Performance 저장 예정</div>
            <div className="rounded-2xl bg-slate-50 p-4">Agent Growth Loop: Logic_Master → 성과검산 → 개선제안 로드맵 반영</div>
          </div>
        </section>
      </div>
    </main>
  );
}
