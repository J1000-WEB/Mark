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

function monthTitle(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function startOfMonthCalendar(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const day = first.getDay();
  const mondayIndex = day === 0 ? 6 : day - 1;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayIndex);
  return start;
}

function endOfMonthCalendar(date: Date) {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const day = last.getDay();
  const sundayIndex = day === 0 ? 0 : 7 - day;
  const end = new Date(last);
  end.setDate(last.getDate() + sundayIndex);
  return end;
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

function categoryClass(category: string) {
  if (category === "promotion") return "bg-rose-500 text-white";
  if (category === "vmd") return "bg-emerald-500 text-white";
  if (category === "schedule") return "bg-blue-600 text-white";
  if (category === "performance") return "bg-amber-300 text-slate-900";
  return "bg-slate-200 text-slate-700";
}

function categorySoftClass(category: string) {
  if (category === "promotion") return "border-rose-100 bg-rose-50 text-rose-700";
  if (category === "vmd") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (category === "schedule") return "border-blue-100 bg-blue-50 text-blue-700";
  if (category === "performance") return "border-amber-100 bg-amber-50 text-amber-700";
  return "border-slate-100 bg-slate-50 text-slate-600";
}

function getEventDates(event: any) {
  const start = toDate(event.startDate || event.date);
  const end = toDate(event.endDate || event.startDate || event.date);
  if (!start || !end) return event.date ? [event.date] : [];

  const out: string[] = [];
  const cur = new Date(start);
  const safeEnd = end < start ? start : end;
  while (cur <= safeEnd) {
    out.push(ymd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function eventLabel(event: any) {
  const store = text(event.store);
  return store ? `${store} · ${event.title}` : event.title;
}

export default function ScheduleDashboard() {
  const [data, setData] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(ymd(new Date()));
  const [currentMonth, setCurrentMonth] = useState(new Date());

  async function load() {
    const res = await fetch("/api/schedule", { cache: "no-store" });
    const json = await res.json();
    setData(json);

    const firstEventDate = json?.events?.find((event: any) => event.startDate || event.date)?.startDate || json?.events?.[0]?.date;
    const d = toDate(firstEventDate);
    if (d) {
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
      setSelectedDate(ymd(d));
    }
  }

  useEffect(() => {
    load().catch(() => setData({ ok: false, error: "판매전체상 데이터를 불러오지 못했습니다.", events: [] }));
  }, []);

  const events = data?.events || [];

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((event: any) => {
      const raw = Object.values(event.raw || {}).join(" ");
      return `${event.title} ${event.store} ${event.memo} ${event.categoryLabel} ${raw}`.toLowerCase().includes(q);
    });
  }, [events, query]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const event of filteredEvents) {
      const dates = getEventDates(event);
      for (const date of dates) {
        if (!map.has(date)) map.set(date, []);
        map.get(date)!.push(event);
      }
    }
    return map;
  }, [filteredEvents]);

  const start = startOfMonthCalendar(currentMonth);
  const end = endOfMonthCalendar(currentMonth);
  const days = dateRange(start, end);
  const selectedEvents = eventsByDate.get(selectedDate) || [];

  const counts = useMemo(() => {
    const base: Record<string, number> = { promotion: 0, vmd: 0, schedule: 0, performance: 0, general: 0 };
    for (const event of filteredEvents) base[event.category || "general"] = (base[event.category || "general"] || 0) + 1;
    return base;
  }, [filteredEvents]);

  function moveMonth(delta: number) {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">판매전체상</h1>
            <p className="mt-1 text-sm text-slate-500">Schedule_Simple 기준 전체 판매 운영 캘린더입니다.</p>
            <p className="mt-1 text-xs font-semibold text-blue-600">{data?.sheetName ? `${data.sheetName} · 메인 스프레드시트 실시간 데이터` : "Schedule_Simple"}</p>
          </div>
          <NavTabs active="schedule" />
        </header>

        <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black text-slate-400">MARK SCHEDULE BOARD</p>
              <h2 className="mt-2 text-3xl font-black">{monthTitle(currentMonth)}</h2>
              <p className="mt-2 text-sm font-semibold text-slate-300">수기 판매전체상을 월간 캘린더 형태로 단순화했습니다.</p>
            </div>

            <div className="grid grid-cols-5 gap-2 text-center">
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
              <div className="rounded-2xl bg-blue-500/20 px-4 py-3">
                <p className="text-2xl font-black">{counts.schedule || 0}</p>
                <p className="text-[11px] font-bold text-blue-200">스케줄</p>
              </div>
              <div className="rounded-2xl bg-amber-300/20 px-4 py-3">
                <p className="text-2xl font-black">{counts.performance || 0}</p>
                <p className="text-[11px] font-bold text-amber-100">실적</p>
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
              <button type="button" onClick={() => setCurrentMonth(new Date())} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">이번달</button>
              <button type="button" onClick={() => moveMonth(1)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">다음달</button>
              <button type="button" onClick={load} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white">새로고침</button>
            </div>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="행사/점포/내용 검색"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-slate-400 lg:w-[360px]"
            />
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-7 border-b border-slate-200 text-center text-xs font-black text-slate-500">
              {["월", "화", "수", "목", "금", "토", "일"].map((day) => (
                <div key={day} className="p-3">{day}</div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day) => {
                const dayKey = ymd(day);
                const dayEvents = eventsByDate.get(dayKey) || [];
                const inMonth = day.getMonth() === currentMonth.getMonth();
                const isSelected = selectedDate === dayKey;
                const isToday = dayKey === ymd(new Date());

                return (
                  <button
                    key={dayKey}
                    type="button"
                    onClick={() => setSelectedDate(dayKey)}
                    className={`min-h-[150px] border-b border-r border-slate-100 p-2 text-left transition hover:bg-slate-50 ${
                      !inMonth ? "bg-slate-50/60 text-slate-300" : "bg-white"
                    } ${isSelected ? "ring-2 ring-slate-900" : ""}`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                        isToday ? "bg-slate-900 text-white" : inMonth ? "text-slate-800" : "text-slate-300"
                      }`}>
                        {day.getDate()}
                      </span>
                      {dayEvents.length ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">{dayEvents.length}</span> : null}
                    </div>

                    <div className="space-y-1">
                      {dayEvents.slice(0, 5).map((event: any, idx: number) => (
                        <div key={`${event.id}-${idx}`} className={`truncate rounded-lg px-2 py-1 text-[11px] font-black ${categoryClass(event.category)}`}>
                          {eventLabel(event)}
                        </div>
                      ))}
                      {dayEvents.length > 5 ? (
                        <div className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-500">+{dayEvents.length - 5}개 더보기</div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black text-slate-400">SELECTED DATE</p>
              <h3 className="mt-1 text-2xl font-black text-slate-900">{selectedDate}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">{selectedEvents.length}개 일정</p>
            </section>

            <section className="max-h-[680px] space-y-3 overflow-y-auto pr-1">
              {selectedEvents.length ? selectedEvents.map((event: any) => (
                <article key={event.id} className={`rounded-3xl border p-4 shadow-sm ${categorySoftClass(event.category)}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-black ${categoryClass(event.category)}`}>{event.categoryLabel}</span>
                      <h4 className="mt-3 text-base font-black text-slate-900">{event.title}</h4>
                      {event.store ? <p className="mt-1 text-xs font-bold text-slate-500">{event.store}</p> : null}
                    </div>
                  </div>
                  {event.memo ? <p className="mt-3 rounded-2xl bg-white/70 p-3 text-sm font-semibold leading-6 text-slate-700">{event.memo}</p> : null}
                  <div className="mt-3 space-y-1 text-xs font-semibold text-slate-500">
                    {Object.entries(event.raw || {}).slice(0, 8).map(([key, value]) => (
                      text(value) ? <p key={key}><span className="font-black text-slate-700">{key}</span> · {text(value)}</p> : null
                    ))}
                  </div>
                </article>
              )) : (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-black text-slate-500">선택한 날짜에 일정이 없습니다.</div>
              )}
            </section>
          </aside>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">전체 일정 목록</h2>
          <div className="mt-4 max-h-[420px] overflow-x-auto overflow-y-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2">날짜</th>
                  <th className="px-3 py-2">구분</th>
                  <th className="px-3 py-2">점포</th>
                  <th className="px-3 py-2">내용</th>
                  <th className="px-3 py-2">비고</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((event: any) => (
                  <tr key={`table-${event.id}`} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-bold">{event.startDate || event.date}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${categoryClass(event.category)}`}>{event.categoryLabel}</span></td>
                    <td className="px-3 py-2 font-bold">{event.store}</td>
                    <td className="px-3 py-2">{event.title}</td>
                    <td className="px-3 py-2 text-slate-500">{event.memo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
