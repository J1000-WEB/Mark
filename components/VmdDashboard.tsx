"use client";

import { useEffect, useMemo, useState } from "react";
import NavTabs from "@/components/NavTabs";
import { Card, Empty, Kpi } from "@/components/Shared";

type VmdEvent = {
  date: string;
  month: string;
  dayLabel: string;
  who: string;
  content: string;
};

type VmdPayload = {
  ok: boolean;
  error?: string;
  events: VmdEvent[];
  stores: string[];
  unvisited: string[];
  longNoVisit: string[];
  upcoming: VmdEvent[];
  insights: { tone: string; title: string; body: string }[];
  source?: { scheduleSheet?: string; storeSource?: string };
};

const dow = ["일", "월", "화", "수", "목", "금", "토"];

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function md(dateKey: string) {
  const parts = dateKey.split("-").map(Number);
  if (parts.length < 3) return dateKey;
  return `${parts[1]}/${parts[2]}`;
}

function monthTitle(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${y}년 ${m}월`;
}

function normalizeKey(v: any) {
  return String(v ?? "")
    .trim()
    .replace(/^오프라인[_\s-]*/i, "")
    .replace(/점$/g, "")
    .replace(/[\s_\-·.()]/g, "")
    .toLowerCase();
}

function isStoreEvent(event: VmdEvent, stores: string[]) {
  const set = new Set(stores.map(normalizeKey));
  return set.has(normalizeKey(event.content));
}

function eventColor(who: string) {
  const key = String(who || "");
  if (key === "전체") return "bg-emerald-500";
  if (key === "기타") return "bg-slate-400";
  if (key.includes("민지")) return "bg-violet-500";
  if (key.includes("다은")) return "bg-pink-500";
  return "bg-blue-500";
}

function toneClass(tone: string) {
  if (tone === "green") return "border-emerald-100 bg-emerald-50 text-emerald-900";
  if (tone === "amber") return "border-amber-100 bg-amber-50 text-amber-900";
  if (tone === "rose") return "border-rose-100 bg-rose-50 text-rose-900";
  return "border-violet-100 bg-violet-50 text-violet-900";
}

function Calendar({ month, events, stores }: { month: string; events: VmdEvent[]; stores: string[] }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const today = ymd(new Date());
  const byDate = new Map<string, VmdEvent[]>();
  for (const ev of events) {
    if (!byDate.has(ev.date)) byDate.set(ev.date, []);
    byDate.get(ev.date)!.push(ev);
  }
  const cells = [] as (number | null)[];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400">
        {dow.map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} className="min-h-[92px] rounded-2xl bg-slate-50/50" />;
          const dateKey = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const rows = byDate.get(dateKey) || [];
          return (
            <div key={dateKey} className={`min-h-[92px] rounded-2xl border p-2 ${dateKey === today ? "border-slate-900 bg-slate-50" : "border-slate-100 bg-white"}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-700">{day}</span>
                {rows.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{rows.length}</span>}
              </div>
              <div className="mt-2 space-y-1">
                {rows.slice(0, 3).map((ev, i) => (
                  <div key={`${ev.date}-${ev.who}-${ev.content}-${i}`} title={`${ev.who} · ${ev.content}`} className="flex items-center gap-1 truncate text-[11px] font-semibold text-slate-600">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${eventColor(ev.who)}`} />
                    <span className="truncate">{isStoreEvent(ev, stores) ? ev.content : `[${ev.who}] ${ev.content}`}</span>
                  </div>
                ))}
                {rows.length > 3 && <div className="text-[10px] font-bold text-slate-400">+{rows.length - 3}건</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function VmdDashboard() {
  const [payload, setPayload] = useState<VmdPayload | null>(null);
  const [month, setMonth] = useState(ymd(new Date()).slice(0, 7));
  const [whoFilter, setWhoFilter] = useState("전체");

  async function load() {
    const res = await fetch("/api/vmd", { cache: "no-store" });
    const json = await res.json();
    setPayload(json);
  }

  useEffect(() => {
    load().catch(() => setPayload({ ok: false, error: "VMD 데이터를 불러오지 못했습니다.", events: [], stores: [], unvisited: [], longNoVisit: [], upcoming: [], insights: [] }));
  }, []);

  const events = payload?.events || [];
  const stores = payload?.stores || [];
  const monthOptions = useMemo(() => {
    const set = new Set(events.map((e) => e.month).filter(Boolean));
    set.add(month);
    return Array.from(set).sort();
  }, [events, month]);

  const staffOptions = useMemo(() => ["전체", ...Array.from(new Set(events.map((e) => e.who).filter((x) => x && x !== "전체" && x !== "기타"))).sort(), "기타"], [events]);
  const monthEvents = useMemo(() => events.filter((e) => e.month === month && (whoFilter === "전체" || e.who === whoFilter)), [events, month, whoFilter]);
  const monthVisitEvents = useMemo(() => monthEvents.filter((e) => isStoreEvent(e, stores)), [monthEvents, stores]);
  const monthVisitedStores = useMemo(() => new Set(monthVisitEvents.map((e) => normalizeKey(e.content))), [monthVisitEvents]);
  const monthUnvisited = useMemo(() => stores.filter((s) => !monthVisitedStores.has(normalizeKey(s))), [stores, monthVisitedStores]);
  const monthEtc = monthEvents.filter((e) => !isStoreEvent(e, stores));
  const progress = stores.length ? Math.round((monthVisitedStores.size / stores.length) * 100) : 0;

  const staffRows = useMemo(() => {
    const names = staffOptions.filter((x) => x !== "전체" && x !== "기타");
    return names.map((name) => {
      const own = events.filter((e) => e.month === month && e.who === name);
      const team = events.filter((e) => e.month === month && e.who === "전체");
      return { name, own: own.length, team: team.length, total: own.length + team.length, ownEvents: own };
    });
  }, [events, month, staffOptions]);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">VMD 라운딩</h1>
            <p className="mt-1 text-sm text-slate-500">VMD_SCHEDULE 기준 라운딩 일정과 매장 커버리지를 확인합니다.</p>
          </div>
          <NavTabs active="vmd" />
        </header>

        {payload?.error && <div className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{payload.error}</div>}

        <section className="grid gap-4 md:grid-cols-4">
          <Kpi title="이달 라운딩" value={`${monthVisitedStores.size} / ${stores.length}개소`} sub={`진행률 ${progress}%`} tone="blue" />
          <Kpi title="기준 매장" value={`${stores.length}개`} sub={payload?.source?.storeSource || "일간매출(26년)"} />
          <Kpi title="이달 미방문" value={`${monthUnvisited.length}개소`} sub={monthUnvisited.length ? monthUnvisited.slice(0, 2).join(", ") : "전체 방문 일정 있음"} tone={monthUnvisited.length ? "orange" : "green"} />
          <Kpi title="기타 일정" value={`${monthEtc.length}건`} sub="휴무·교육·행사 포함" tone="purple" />
        </section>

        <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card title="라운딩 캘린더" right={
            <div className="flex flex-wrap gap-2">
              <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
                {monthOptions.map((m) => <option key={m} value={m}>{monthTitle(m)}</option>)}
              </select>
              <select value={whoFilter} onChange={(e) => setWhoFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
                {staffOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button type="button" onClick={load} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white">갱신</button>
            </div>
          }>
            <Calendar month={month} events={monthEvents} stores={stores} />
            <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold text-slate-500">
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" />전체</span>
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-violet-500" />민지</span>
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-pink-500" />다은</span>
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-slate-400" />기타</span>
            </div>
          </Card>

          <Card title="AI 인사이트" tone="purple">
            <div className="space-y-3">
              {!payload?.insights?.length && <Empty />}
              {(payload?.insights || []).map((ins, i) => (
                <div key={`${ins.title}-${i}`} className={`rounded-2xl border p-4 ${toneClass(ins.tone)}`}>
                  <p className="font-black">{ins.title}</p>
                  <p className="mt-1 text-sm font-semibold leading-6 opacity-80">{ins.body}</p>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card title="담당자 현황">
            <div className="grid gap-3 sm:grid-cols-2">
              {staffRows.length === 0 && <Empty />}
              {staffRows.map((row) => (
                <div key={row.name} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-black">{row.name}</p>
                      <p className="text-xs font-bold text-slate-500">단독 {row.own} · 전체 {row.team}</p>
                    </div>
                    <p className="text-2xl font-black text-slate-900">{row.total}</p>
                  </div>
                  <div className="mt-3 space-y-1 text-xs font-semibold text-slate-600">
                    {row.ownEvents.slice(0, 4).map((ev) => <p key={`${row.name}-${ev.date}-${ev.content}`}>{ev.dayLabel} · {ev.content}</p>)}
                    {!row.ownEvents.length && <p className="text-slate-400">단독 일정 없음</p>}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="이번 달 일정 요약">
            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-2">
              {monthEvents.length === 0 && <Empty />}
              {monthEvents.map((ev, i) => (
                <div key={`${ev.date}-${ev.who}-${ev.content}-${i}`} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm">
                  <span className="w-12 text-xs font-black text-slate-400">{ev.dayLabel}</span>
                  <span className={`h-2 w-2 rounded-full ${eventColor(ev.who)}`} />
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-500">{ev.who}</span>
                  <span className="min-w-0 flex-1 truncate font-bold text-slate-700">{ev.content}</span>
                  {isStoreEvent(ev, stores) && <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">매장</span>}
                </div>
              ))}
            </div>
          </Card>
        </section>

        <Card title="매장 커버리지">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {stores.map((store, i) => {
              const visited = monthVisitedStores.has(normalizeKey(store));
              const ev = monthVisitEvents.find((e) => normalizeKey(e.content) === normalizeKey(store));
              return (
                <div key={store} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3">
                  <span className="w-6 text-xs font-black text-slate-400">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-700">{store}</span>
                  <span className={`rounded-full px-2 py-1 text-xs font-black ${visited ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{visited ? `${ev?.dayLabel} 예정/완료` : "미방문"}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </main>
  );
}
