
"use client";

import { useEffect, useMemo, useState } from "react";
import NavTabs from "@/components/NavTabs";

type SortDir = "asc" | "desc";

function cls(...items: string[]) {
  return items.filter(Boolean).join(" ");
}

function rawString(value: any) {
  return String(value ?? "").trim();
}

function toNumber(value: any) {
  const s = rawString(value).replace(/,/g, "").replace(/%/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function displayCell(value: any) {
  const s = rawString(value);
  if (!s) return "";
  const n = toNumber(s);
  if (n !== null && /^-?\d+(\.\d+)?%?$/.test(s.replace(/,/g, ""))) {
    if (s.includes("%")) return `${Math.round(n * 10) / 10}%`;
    if (Math.abs(n) > 0 && Math.abs(n) < 1) return `${Math.round(n * 1000) / 10}%`;
    if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString("ko-KR");
    if (!Number.isInteger(n)) return (Math.round(n * 10) / 10).toLocaleString("ko-KR");
  }
  return s;
}

function isNumeric(value: any) {
  return toNumber(value) !== null && /^-?\d+(\.\d+)?%?$/.test(rawString(value).replace(/,/g, ""));
}

function compareCell(a: any, b: any, dir: SortDir) {
  const an = toNumber(a);
  const bn = toNumber(b);
  let result = 0;
  if (an !== null && bn !== null) result = an - bn;
  else result = rawString(a).localeCompare(rawString(b), "ko", { numeric: true, sensitivity: "base" });
  return dir === "asc" ? result : -result;
}

function valueTone(header: string, value: any, rowIndex: number) {
  const h = rawString(header);
  const n = toNumber(value);
  if (h === "순위") {
    if (n === 1) return "bg-amber-100 text-amber-900 font-black";
    if (n === 2) return "bg-slate-200 text-slate-900 font-black";
    if (n === 3) return "bg-orange-100 text-orange-900 font-black";
    if (n !== null && n <= 10) return "bg-blue-50 text-blue-700 font-black";
    return "text-slate-600 font-bold";
  }
  if (h.includes("비중") || h.includes("할인율") || h.includes("판매%") || h.includes("입고%")) {
    if (n !== null && n > 0) return "text-emerald-700 font-bold";
  }
  if (h.includes("등락")) {
    if (n !== null && n > 0) return "text-emerald-700 font-black";
    if (n !== null && n < 0) return "text-rose-600 font-black";
    return "text-slate-400 font-bold";
  }
  if (h.includes("재고") || h.includes("물류") || h.includes("점포")) {
    if (n === 0) return "bg-rose-50 text-rose-700 font-bold";
    if (n !== null && n <= 5) return "bg-orange-50 text-orange-700 font-bold";
    if (n !== null && n <= 20) return "bg-yellow-50 text-yellow-700 font-bold";
  }
  if (h === "주간" && rowIndex >= 7) return "font-black text-slate-900";
  return "";
}

function rankLabel(value: any) {
  const n = toNumber(value);
  if (n === 1) return "🥇 1";
  if (n === 2) return "🥈 2";
  if (n === 3) return "🥉 3";
  return displayCell(value);
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
  const [sort, setSort] = useState<{ col: number; dir: SortDir } | null>(null);
  const [showStores, setShowStores] = useState(false);

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
    setSort(null);
    setShowStores(false);
    setStatus(data.sheetName ? `${data.sheetName} · ${data.rowCount || 0}개 상품 · ${data.colCount || 0}열` : "판매데이터를 생성하지 못했습니다.");
  }

  useEffect(() => {
    load("", "style").catch((e) => setStatus(e?.message || "불러오기 실패"));
  }, []);

  const headerRowIndex = 3;
  const dataStartIndex = 7;
  const headers = rows[headerRowIndex] || [];
  const maxCols = useMemo(() => Math.max(0, ...rows.map((r) => r.length)), [rows]);
  const amountCol = useMemo(() => {
    const group = rows[2] || [];
    const idx = group.findIndex((x) => rawString(x) === "금액판매");
    return idx >= 0 ? idx : headers.findIndex((x) => rawString(x) === "주간");
  }, [rows, headers]);

  const storeStartCol = useMemo(() => {
    const group = rows[2] || [];
    const idx = group.findIndex((x) => rawString(x).includes("점포별"));
    return idx >= 0 ? idx : maxCols;
  }, [rows, maxCols]);

  const visibleColIndices = useMemo(() => {
    return Array.from({ length: maxCols })
      .map((_, i) => i)
      .filter((i) => showStores || i < storeStartCol);
  }, [maxCols, showStores, storeStartCol]);

  const visibleRows = useMemo(() => {
    if (!rows.length) return [];
    const top = rows.slice(0, dataStartIndex);
    let body = rows.slice(dataStartIndex);
    if (sort) {
      body = [...body].sort((a, b) => compareCell(a[sort.col], b[sort.col], sort.dir));
    }
    return [...top, ...body];
  }, [rows, sort]);

  function onHeaderClick(col: number) {
    setSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: "desc" };
      return { col, dir: prev.dir === "desc" ? "asc" : "desc" };
    });
  }

  const totalAmount = useMemo(() => rows[5]?.[amountCol] || 0, [rows, amountCol]);
  const qtyCol = useMemo(() => {
    const group = rows[2] || [];
    return group.findIndex((x) => rawString(x) === "수량판매");
  }, [rows]);
  const totalQty = useMemo(() => rows[5]?.[qtyCol] || 0, [rows, qtyCol]);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
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
            <button
              type="button"
              onClick={() => setShowStores((v) => !v)}
              className={cls(
                "ml-auto rounded-xl px-4 py-2 text-xs font-black transition",
                showStores ? "bg-emerald-600 text-white" : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
              )}
            >
              {showStores ? "점포별 판매/재고 접기" : "점포별 판매/재고 펼치기"}
            </button>
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button type="button" onClick={() => load(week, "style")} className={cls("rounded-lg px-4 py-2 text-xs font-black", type === "style" ? "bg-blue-600 text-white" : "text-slate-600")}>품번</button>
              <button type="button" onClick={() => load(week, "color")} className={cls("rounded-lg px-4 py-2 text-xs font-black", type === "color" ? "bg-blue-600 text-white" : "text-slate-600")}>컬러</button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-600 md:grid-cols-5">
            <div className="rounded-2xl bg-slate-50 px-3 py-2">분석기간: <b className="text-slate-900">{meta.analysisLabel || "-"}</b></div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2">비교기간: <b className="text-slate-900">{meta.compareLabel || "-"}</b></div>
            <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-emerald-800">총판매금액: <b>{displayCell(totalAmount)}</b></div>
            <div className="rounded-2xl bg-blue-50 px-3 py-2 text-blue-800">총판매수량: <b>{displayCell(totalQty)}</b></div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2">소스: {sources.sales || "-"} / 가격: {sources.weeklyPrice || "-"} / 재고: {sources.stock || "-"}</div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-700 px-4 py-3 text-white">
            <p className="text-sm font-black">{sheetName || "판매데이터"}</p>
            <p className="mt-1 text-xs font-semibold text-slate-200">기본 정렬은 금주 판매금액 기준 1위부터 표시합니다. 헤더 클릭 정렬, 점포별 판매/재고 접기·펼치기를 지원합니다.</p>
          </div>
          <div className="max-h-[calc(100vh-300px)] overflow-auto">
            {!rows.length ? (
              <div className="p-12 text-center text-sm font-semibold text-slate-500">표시할 판매데이터가 없습니다.</div>
            ) : (
              <table className="min-w-max border-collapse text-[11px] leading-tight">
                <tbody>
                  {visibleRows.map((row, r) => {
                    const isHeader = r === headerRowIndex;
                    const isGroup = r === 2;
                    const isSummary = r === 5;
                    return (
                      <tr
                        key={r}
                        className={cls(
                          isHeader ? "bg-slate-800 text-white" : "",
                          isGroup ? "bg-blue-100 font-black text-blue-900" : "",
                          isSummary ? "bg-emerald-50 font-black text-emerald-900" : "",
                          !isHeader && !isGroup && !isSummary && r < dataStartIndex ? "bg-slate-100 font-black" : "",
                          r >= dataStartIndex ? (r % 2 ? "bg-white" : "bg-slate-50/70") : ""
                        )}
                      >
                        {visibleColIndices.map((c) => {
                          const value = row[c];
                          const header = headers[c] || "";
                          const sortMark = sort?.col === c ? (sort.dir === "desc" ? "▼" : "▲") : "⇅";
                          return (
                            <td
                              key={c}
                              onClick={isHeader ? () => onHeaderClick(c) : undefined}
                              className={cls(
                                "max-w-[190px] whitespace-nowrap border border-slate-200 px-2 py-1 align-middle",
                                isHeader ? "sticky top-0 z-20 cursor-pointer select-none border-slate-600 bg-slate-800 text-center font-black text-white hover:bg-slate-700" : "",
                                r < dataStartIndex && !isHeader ? "text-center" : "text-slate-700",
                                isNumeric(value) ? "text-right tabular-nums" : "",
                                r >= dataStartIndex ? valueTone(header, value, r) : "",
                                c === amountCol && r >= dataStartIndex ? "bg-emerald-50/80" : ""
                              )}
                              title={String(value ?? "")}
                            >
                              {isHeader ? (
                                <span className="inline-flex items-center gap-1">
                                  <span>{displayCell(value)}</span>
                                  <span className={cls("text-[9px]", sort?.col === c ? "text-yellow-300" : "text-slate-400")}>{sortMark}</span>
                                </span>
                              ) : header === "순위" && r >= dataStartIndex ? (
                                rankLabel(value)
                              ) : (
                                displayCell(value)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
