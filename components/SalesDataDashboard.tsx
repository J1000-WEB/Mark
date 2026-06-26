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
  if (/^-?\d+(\.\d+)?$/.test(s.replace(/,/g, "")) && Number.isFinite(n)) {
    if (Math.abs(n) > 0 && Math.abs(n) < 1) return `${Math.round(n * 1000) / 10}%`;
    if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString("ko-KR");
    if (!Number.isInteger(n)) return (Math.round(n * 10) / 10).toLocaleString("ko-KR");
  }
  return s;
}

function isNumeric(value: any) {
  const s = String(value ?? "").trim().replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(s);
}

export default function SalesDataDashboard() {
  const [weeks, setWeeks] = useState<any[]>([]);
  const [week, setWeek] = useState("");
  const [type, setType] = useState<"style" | "color">("style");
  const [rows, setRows] = useState<any[][]>([]);
  const [sheetName, setSheetName] = useState("");
  const [status, setStatus] = useState("불러오는 중...");
  const [sources, setSources] = useState<any>({});
  const [meta, setMeta] = useState<any>({});

  async function load(nextWeek = week, nextType = type) {
    setStatus("MARK 데이터로 판매데이터 생성 중...");
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
    setSources(data.sources || {});
    setMeta(data || {});
    setStatus(data.sheetName ? `${data.sheetName} · ${data.rowCount || 0}개 상품 · ${data.colCount || 0}열` : "판매데이터를 생성하지 못했습니다.");
  }

  useEffect(() => {
    load("", "style").catch((e) => setStatus(e?.message || "불러오기 실패"));
  }, []);

  const maxCols = useMemo(() => Math.max(0, ...rows.map((r) => r.length)), [rows]);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-[1900px] space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">판매데이터</h1>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">MARK 6.0</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">주간판매데이터 엑셀을 MARK_DB / MARK_HISTORY 수치로 자동 생성합니다.</p>
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
                title={`분석 ${w.analysisLabel} / 비교 ${w.compareLabel}`}
                className={cls(
                  "rounded-xl px-4 py-2 text-xs font-black transition",
                  week === w.week ? "bg-slate-900 text-white" : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                )}
              >
                {w.label || w.week}
              </button>
            ))}
            <div className="ml-auto flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button type="button" onClick={() => load(week, "style")} className={cls("rounded-lg px-4 py-2 text-xs font-black", type === "style" ? "bg-blue-600 text-white" : "text-slate-600")}>품번</button>
              <button type="button" onClick={() => load(week, "color")} className={cls("rounded-lg px-4 py-2 text-xs font-black", type === "color" ? "bg-blue-600 text-white" : "text-slate-600")}>컬러</button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-600 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 px-3 py-2">분석기간: <b className="text-slate-900">{meta.analysisLabel || "-"}</b></div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2">비교기간: <b className="text-slate-900">{meta.compareLabel || "-"}</b></div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2">소스: {sources.sales || "-"} / 재고: {sources.stock || "-"}</div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-black text-slate-800">{sheetName || "판매데이터"}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">초기 버전은 엑셀과 동일하게 전체 컬럼을 펼쳐서 보여줍니다. 이후 필요 없는 컬럼은 접거나 줄이면 됩니다.</p>
          </div>
          <div className="max-h-[calc(100vh-300px)] overflow-auto">
            {!rows.length ? (
              <div className="p-12 text-center text-sm font-semibold text-slate-500">표시할 판매데이터가 없습니다.</div>
            ) : (
              <table className="min-w-max border-collapse text-[11px] leading-tight">
                <tbody>
                  {rows.map((row, r) => (
                    <tr key={r} className={r < 7 ? "bg-slate-100 font-black" : r % 2 ? "bg-white" : "bg-slate-50/40"}>
                      {Array.from({ length: maxCols }).map((_, c) => {
                        const value = row[c];
                        const sticky = type === "color" ? c === 0 : c === 7;
                        return (
                          <td
                            key={c}
                            className={cls(
                              "max-w-[190px] whitespace-nowrap border border-slate-200 px-2 py-1 align-middle",
                              sticky ? "sticky left-0 z-10 bg-inherit" : "",
                              r < 7 ? "text-center text-slate-900" : "text-slate-700",
                              isNumeric(value) ? "text-right tabular-nums" : ""
                            )}
                            title={String(value ?? "")}
                          >
                            {displayCell(value)}
                          </td>
                        );
                      })}
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
