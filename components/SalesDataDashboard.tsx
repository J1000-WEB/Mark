"use client";

import { useEffect, useMemo, useState } from "react";
import NavTabs from "@/components/NavTabs";

function cls(...items: string[]) {
  return items.filter(Boolean).join(" ");
}

function displayCell(value: any) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  const n = Number(s.replace(/,/g, ""));
  if (/^-?\d+(\.\d+)?$/.test(s.replace(/,/g, "")) && Number.isFinite(n) && Math.abs(n) >= 1000) {
    return Math.round(n).toLocaleString("ko-KR");
  }
  return s;
}

export default function SalesDataDashboard() {
  const [weeks, setWeeks] = useState<any[]>([]);
  const [week, setWeek] = useState("");
  const [type, setType] = useState<"style" | "color">("style");
  const [rows, setRows] = useState<any[][]>([]);
  const [sheetName, setSheetName] = useState("");
  const [status, setStatus] = useState("불러오는 중...");

  async function load(nextWeek = week, nextType = type) {
    setStatus("불러오는 중...");
    const params = new URLSearchParams();
    if (nextWeek) params.set("week", nextWeek);
    params.set("type", nextType);
    const res = await fetch(`/api/sales-data?${params.toString()}`, { cache: "no-store" });
    const data = await res.json();
    if (!data.ok) {
      setStatus(data.error || "불러오기 실패");
      setRows([]);
      return;
    }
    setWeeks(data.weeks || []);
    setWeek(data.selectedWeek || nextWeek || data.weeks?.[0]?.week || "");
    setType(data.type === "color" ? "color" : "style");
    setRows(data.rows || []);
    setSheetName(data.sheetName || "");
    setStatus(data.sheetName ? `${data.sheetName} · ${data.rowCount || 0}행 × ${data.colCount || 0}열` : "판매데이터 시트를 찾지 못했습니다.");
  }

  useEffect(() => {
    load("", "style").catch((e) => setStatus(e?.message || "불러오기 실패"));
  }, []);

  const maxCols = useMemo(() => Math.max(0, ...rows.map((r) => r.length)), [rows]);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-[1800px] space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">판매데이터</h1>
            <p className="mt-1 text-sm text-slate-500">주간판매데이터 엑셀의 품번/컬러 탭을 웹 화면에서 전체 펼침으로 확인합니다.</p>
            <p className="mt-1 text-xs font-semibold text-blue-600">{status}</p>
          </div>
          <NavTabs active="sales-data" />
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-sm font-black text-slate-700">주차 선택</span>
            {weeks.map((w) => (
              <button
                key={w.week}
                type="button"
                onClick={() => load(w.week, type)}
                className={cls(
                  "rounded-xl px-4 py-2 text-xs font-black transition",
                  week === w.week ? "bg-slate-900 text-white" : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                )}
              >
                {w.week}
              </button>
            ))}
            <div className="ml-auto flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button type="button" onClick={() => load(week, "style")} className={cls("rounded-lg px-4 py-2 text-xs font-black", type === "style" ? "bg-blue-600 text-white" : "text-slate-600")}>품번</button>
              <button type="button" onClick={() => load(week, "color")} className={cls("rounded-lg px-4 py-2 text-xs font-black", type === "color" ? "bg-blue-600 text-white" : "text-slate-600")}>컬러</button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[calc(100vh-260px)] overflow-auto">
            {!rows.length ? (
              <div className="p-12 text-center text-sm font-semibold text-slate-500">표시할 판매데이터가 없습니다.</div>
            ) : (
              <table className="min-w-max border-collapse text-[11px] leading-tight">
                <tbody>
                  {rows.map((row, r) => (
                    <tr key={r} className={r < 6 ? "bg-slate-100 font-black" : r % 2 ? "bg-white" : "bg-slate-50/40"}>
                      {Array.from({ length: maxCols }).map((_, c) => (
                        <td
                          key={c}
                          className={cls(
                            "max-w-[180px] whitespace-nowrap border border-slate-200 px-2 py-1 align-middle",
                            c < 2 ? "sticky left-0 z-10 bg-inherit" : "",
                            r < 6 ? "text-center text-slate-900" : "text-slate-700",
                            c >= 2 && /^-?\d/.test(String(row[c] ?? "")) ? "text-right tabular-nums" : ""
                          )}
                          title={String(row[c] ?? "")}
                        >
                          {displayCell(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
