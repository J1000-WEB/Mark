"use client";

import { useEffect, useMemo, useState } from "react";
import NavTabs from "@/components/NavTabs";

function text(v: any) {
  return String(v ?? "").trim();
}

function guessImportantColumns(headers: string[]) {
  const priorities = ["날짜", "일자", "요일", "구분", "점포", "매장", "내용", "행사", "프로모션", "비고"];
  const picked: string[] = [];
  for (const p of priorities) {
    const found = headers.find((h) => h.includes(p));
    if (found && !picked.includes(found)) picked.push(found);
  }
  for (const h of headers) {
    if (picked.length >= 8) break;
    if (!picked.includes(h)) picked.push(h);
  }
  return picked;
}

function ScheduleCard({ row, columns }: { row: any; columns: string[] }) {
  const titleCol = columns.find((c) => c.includes("점포") || c.includes("매장") || c.includes("구분")) || columns[0];
  const subCol = columns.find((c) => c.includes("날짜") || c.includes("일자") || c.includes("요일")) || columns[1];
  const memoCol = columns.find((c) => c.includes("내용") || c.includes("행사") || c.includes("프로모션") || c.includes("비고"));

  return (
    <article className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-black text-slate-900">{text(row[titleCol]) || "판매 일정"}</p>
          {subCol ? <p className="mt-1 text-xs font-bold text-slate-400">{text(row[subCol])}</p> : null}
        </div>
        <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-black text-white">전체상</span>
      </div>

      {memoCol && text(row[memoCol]) ? (
        <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-700">{text(row[memoCol])}</p>
      ) : null}

      <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-500">
        {columns.filter((c) => c !== titleCol && c !== subCol && c !== memoCol).slice(0, 5).map((col) => (
          text(row[col]) ? (
            <div key={col} className="flex gap-2 rounded-xl bg-slate-50 px-3 py-2">
              <span className="shrink-0 font-black text-slate-700">{col}</span>
              <span className="min-w-0 break-words">{text(row[col])}</span>
            </div>
          ) : null
        ))}
      </div>
    </article>
  );
}

export default function ScheduleDashboard() {
  const [data, setData] = useState<any>(null);
  const [query, setQuery] = useState("");

  async function load() {
    const res = await fetch("/api/schedule", { cache: "no-store" });
    const json = await res.json();
    setData(json);
  }

  useEffect(() => {
    load().catch(() => setData({ ok: false, error: "판매전체상 데이터를 불러오지 못했습니다.", headers: [], rows: [] }));
  }, []);

  const columns = useMemo(() => guessImportantColumns(data?.headers || []), [data]);
  const rows = useMemo(() => {
    const list = data?.rows || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((row: any) => Object.values(row).some((v) => text(v).toLowerCase().includes(q)));
  }, [data, query]);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">판매전체상</h1>
            <p className="mt-1 text-sm text-slate-500">MARK_DB의 Schedule_Simple 시트를 기준으로 전체 판매 일정을 표시합니다.</p>
            <p className="mt-1 text-xs font-semibold text-blue-600">{data?.sheetName ? `${data.sheetName} 실시간 데이터` : "Schedule_Simple"}</p>
          </div>
          <NavTabs active="schedule" />
        </header>

        <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black text-slate-400">MARK SCHEDULE BOARD</p>
              <h2 className="mt-2 text-2xl font-black">전체 판매 일정</h2>
              <p className="mt-2 text-sm font-semibold text-slate-300">Schedule_Simple만 업데이트하면 이 화면이 자동 갱신됩니다.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl bg-white/10 px-5 py-3">
                <p className="text-2xl font-black">{data?.rows?.length || 0}</p>
                <p className="text-[11px] font-bold text-slate-400">전체 행</p>
              </div>
              <div className="rounded-2xl bg-white/10 px-5 py-3">
                <p className="text-2xl font-black">{rows.length}</p>
                <p className="text-[11px] font-bold text-slate-400">표시 행</p>
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
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black">Schedule_Simple</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">수기로 작성하던 전체판매상을 단순화해서 보여줍니다.</p>
            </div>
            <button type="button" onClick={load} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">새로고침</button>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="점포/내용/날짜 검색"
            className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-slate-400"
          />
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {!data ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm font-black text-slate-500">불러오는 중...</div>
          ) : rows.length ? (
            rows.map((row: any, idx: number) => <ScheduleCard key={idx} row={row} columns={columns} />)
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-black text-slate-500">표시할 판매전체상이 없습니다.</div>
          )}
        </section>
      </div>
    </main>
  );
}
