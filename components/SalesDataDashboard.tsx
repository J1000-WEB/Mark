
"use client";

import { useEffect, useMemo, useState } from "react";
import NavTabs from "@/components/NavTabs";

type SortDir = "asc" | "desc";
type GroupState = Record<string, boolean>;

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
  const [collapsedGroups, setCollapsedGroups] = useState<GroupState>({ "점포별 판매/재고": true });
  const [query, setQuery] = useState("");
  const [uploadFiles, setUploadFiles] = useState<Record<string, File | null>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [uploadError, setUploadError] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadStatuses, setUploadStatuses] = useState<any>(null);

  useEffect(() => {
    fetch("/api/upload-status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setUploadStatuses(d); })
      .catch(() => {});
  }, []);

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
    setCollapsedGroups({ "점포별 판매/재고": true });
    setStatus(data.sheetName ? `${data.sheetName} · ${data.rowCount || 0}개 상품 · ${data.colCount || 0}열` : "판매데이터를 생성하지 못했습니다.");
  }

  async function runUpload() {
    setUploading(true);
    setUploadError("");
    setUploadResult(null);
    try {
      const form = new FormData();
      const fieldMap: Record<string, string> = {
        "재고": "재고",
        "생산": "생산",
        "기간판매(전주,2주)": "기간판매_전주_2주",
        "기간판매(3주,4주)": "기간판매_3주_4주",
        "재런칭": "재런칭",
        "라인업": "라인업",
      };
      for (const [label, field] of Object.entries(fieldMap)) {
        const file = uploadFiles[label];
        if (file) form.append(field, file);
      }
      const res = await fetch("/api/sales-data-upload", { method: "POST", body: form });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "업로드 처리 실패");
      setUploadResult(data);
      await load("", type);
      fetch("/api/upload-status", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (d.ok) setUploadStatuses(d); }).catch(() => {});
    } catch (e: any) {
      setUploadError(e?.message || "업로드 처리 실패");
    } finally {
      setUploading(false);
    }
  }

  async function downloadExcel() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type === "color" ? "컬러" : "품번");
    XLSX.writeFile(wb, `주간판매데이터_${week || "latest"}_${type === "color" ? "컬러" : "품번"}.xlsx`);
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

  const columnGroups = useMemo(() => {
    const group = rows[2] || [];
    const groups: { name: string; start: number; end: number }[] = [];
    for (let i = 0; i < maxCols; i++) {
      const name = rawString(group[i]);
      if (!name) continue;
      groups.push({ name, start: i, end: maxCols });
    }
    for (let i = 0; i < groups.length; i++) {
      groups[i].end = i + 1 < groups.length ? groups[i + 1].start : maxCols;
    }
    return groups;
  }, [rows, maxCols]);

  const groupByColumn = useMemo(() => {
    const map = new Map<number, { name: string; start: number; end: number }>();
    columnGroups.forEach((group) => {
      for (let i = group.start; i < group.end; i++) map.set(i, group);
    });
    return map;
  }, [columnGroups]);

  function toggleGroup(name: string) {
    setCollapsedGroups((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  const visibleColIndices = useMemo(() => {
    return Array.from({ length: maxCols })
      .map((_, i) => i)
      .filter((i) => {
        if (i === 0) return true;
        const group = groupByColumn.get(i);
        if (!group) return true;
        return !collapsedGroups[group.name] || i === group.start;
      });
  }, [maxCols, collapsedGroups, groupByColumn]);

  const visibleRows = useMemo(() => {
    if (!rows.length) return [];
    const top = rows.slice(0, dataStartIndex);
    let body = rows.slice(dataStartIndex);
    const q = rawString(query).toLowerCase();
    if (q) {
      body = body.filter((row) => row.some((cell) => rawString(cell).toLowerCase().includes(q)));
    }
    if (sort) {
      body = [...body].sort((a, b) => compareCell(a[sort.col], b[sort.col], sort.dir));
    }
    return [...top, ...body];
  }, [rows, sort, query]);

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
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">MARK 6.0.5</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">주간판매데이터 엑셀을 MARK_DB / MARK_HISTORY 수치로 자동 생성합니다.</p>
            <p className="mt-1 text-xs font-semibold text-blue-600">{status}</p>
          </div>
          <NavTabs active="sales-data" />
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowUpload((v) => !v)}
              className="rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-black text-white hover:bg-indigo-700"
            >
              📤 {showUpload ? "업로드 패널 닫기" : "주간판매데이터 파일 업로드"}
            </button>
            <button
              type="button"
              onClick={downloadExcel}
              disabled={!rows.length}
              className="rounded-2xl border border-emerald-600 px-4 py-2 text-sm font-black text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
            >
              📥 엑셀로 다운로드
            </button>
          </div>

          {showUpload && (
            <div className="mt-4 space-y-3 rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">
                재고 / 생산 / 기간판매(전주,2주)는 필수예요. 기간판매(3주,4주) · 재런칭 · 라인업은 선택이에요(안 올리면 이전 값 유지).
                업로드하면 계산해서 <b>스냅샷으로 저장</b>되고, 다음부터는 페이지 열 때마다 다시 계산하지 않고 저장된 걸 바로 보여줘요.
              </p>
              {uploadStatuses && (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  {Object.entries(uploadStatuses.statuses || {}).map(([kind, info]: [string, any]) => {
                    const threshold = uploadStatuses.thresholds?.[kind] ?? 7;
                    const stale = info.daysSince !== null && info.daysSince >= threshold;
                    return (
                      <div key={kind} className={`rounded-xl border p-2 text-xs font-bold ${stale ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-600"}`}>
                        <p className="font-black">{kind}</p>
                        <p className="mt-0.5">
                          {info.lastUploadedAt ? `마지막 업로드: ${info.lastUploadedAt} (${info.daysSince}일 전)` : "업로드 이력 없음"}
                          {stale ? " ⚠ 기한 초과" : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {["재고", "생산", "기간판매(전주,2주)", "기간판매(3주,4주)", "재런칭", "라인업"].map((label) => (
                  <label key={label} className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3">
                    <span className="text-xs font-black text-slate-700">
                      {label} {["재고", "생산", "기간판매(전주,2주)"].includes(label) && <span className="text-rose-600">*</span>}
                    </span>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => setUploadFiles((prev) => ({ ...prev, [label]: e.target.files?.[0] || null }))}
                      className="text-[11px]"
                    />
                    {uploadFiles[label] && <span className="truncate text-[10px] font-bold text-emerald-600">{uploadFiles[label]!.name}</span>}
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={runUpload}
                disabled={uploading || !uploadFiles["재고"] || !uploadFiles["생산"] || !uploadFiles["기간판매(전주,2주)"]}
                className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-black text-white disabled:opacity-40"
              >
                {uploading ? "계산 중..." : "계산해서 저장"}
              </button>
              {uploadError && <p className="text-xs font-black text-red-600">⚠ {uploadError}</p>}
              {uploadResult && (
                <p className="text-xs font-black text-emerald-700">
                  ✅ {uploadResult.weekKey} 스냅샷 저장 완료 — 품번 {uploadResult.style?.rowCount}건 · 컬러 {uploadResult.color?.rowCount}건
                </p>
              )}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-sm font-black text-slate-700">주차 선택</span>
              <select
                value={week}
                onChange={(e) => load(e.target.value, type)}
                className="min-w-[210px] bg-transparent text-xs font-black text-slate-900 outline-none"
              >
                {weeks.map((w) => (
                  <option key={w.week} value={w.week}>
                    {w.label || w.week} · 분석 {w.analysisLabel} / 비교 {w.compareLabel}
                  </option>
                ))}
              </select>
            </label>
            <div className="ml-auto flex min-w-[260px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-xs font-black text-slate-500">검색</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="품번/품명/컬러/점포"
                className="w-full bg-transparent text-xs font-bold text-slate-800 outline-none placeholder:text-slate-400"
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} className="text-xs font-black text-slate-400 hover:text-slate-700">×</button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1">
              {columnGroups.filter((g) => g.name).map((g) => (
                <button
                  key={g.name}
                  type="button"
                  onClick={() => toggleGroup(g.name)}
                  className={cls(
                    "rounded-xl px-3 py-2 text-[11px] font-black transition",
                    collapsedGroups[g.name] ? "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-white" : "bg-emerald-600 text-white"
                  )}
                  title={`${g.name} 컬럼 ${collapsedGroups[g.name] ? "펼치기" : "접기"}`}
                >
                  {collapsedGroups[g.name] ? "＋" : "－"} {g.name}
                </button>
              ))}
            </div>
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
            <div className="rounded-2xl bg-slate-50 px-3 py-2">소스: 수량 {sources.salesQty || sources.sales || "-"} / 금액·가격 {sources.salesAmountPrice || sources.weeklyPrice || "-"} / 재고 {sources.stock || "-"}</div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-700 px-4 py-3 text-white">
            <p className="text-sm font-black">{sheetName || "판매데이터"}</p>
            <p className="mt-1 text-xs font-semibold text-slate-200">기본 정렬은 금주 판매금액 기준 1위부터 표시합니다. 헤더 클릭 정렬, 검색, 컬럼 그룹 접기·펼치기를 지원합니다.</p>
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
                              ) : isGroup && rawString(value) ? (
                                <button
                                  type="button"
                                  onClick={() => toggleGroup(rawString(value))}
                                  className="inline-flex items-center gap-1 rounded-lg bg-white/80 px-2 py-1 text-[10px] font-black text-blue-800 shadow-sm ring-1 ring-blue-200 hover:bg-blue-50"
                                  title={`${rawString(value)} 컬럼 ${collapsedGroups[rawString(value)] ? "펼치기" : "접기"}`}
                                >
                                  <span>{collapsedGroups[rawString(value)] ? "＋" : "－"}</span>
                                  <span>{displayCell(value)}</span>
                                </button>
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
