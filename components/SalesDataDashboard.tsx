
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
  const [uploadFiles, setUploadFiles] = useState<Record<string, File[]>>({});
  const [dragOverLabel, setDragOverLabel] = useState("");
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
      const XLSX = await import("xlsx");
      const salesDataUpload = await import("@/lib/salesDataUpload");

      async function readWorkbooks(label: string) {
        const files = uploadFiles[label] || [];
        const wbs = [];
        for (const file of files) {
          const buf = await file.arrayBuffer();
          wbs.push(XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true }));
        }
        return wbs;
      }

      const stockWbs = await readWorkbooks("재고");
      const productionWbs = await readWorkbooks("생산");
      const periodAWbs = await readWorkbooks("기간판매(전주,2주)");
      const periodBWbs = await readWorkbooks("기간판매(3주,4주)");
      const relaunchWbs = await readWorkbooks("재런칭");
      const lineupWbs = await readWorkbooks("라인업");

      if (!stockWbs.length || !productionWbs.length) {
        throw new Error("재고 / 생산 파일은 필수입니다.");
      }

      const stockRows = stockWbs.flatMap((wb) => salesDataUpload.parseStockSheet(wb));
      const production = salesDataUpload.mergeProductionMaps(productionWbs.map((wb) => salesDataUpload.parseProductionSheet(wb)));

      let periodA;
      let periodB: any = { byStyle: new Map(), byStyleColor: new Map() };
      if (periodAWbs.length) {
        periodA = salesDataUpload.mergePeriodSalesAggs(periodAWbs.map((wb) => salesDataUpload.parsePeriodSalesSheet(wb)));
        if (periodBWbs.length) periodB = salesDataUpload.mergePeriodSalesAggs(periodBWbs.map((wb) => salesDataUpload.parsePeriodSalesSheet(wb)));
      } else {
        // 기간판매 파일이 없으면 Daily_Sales_History 기반 자동 집계를 서버에서 가져옵니다(작은 JSON).
        const res = await fetch("/api/daily-history-period-sales", { cache: "no-store" });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "자동 기간판매 집계 조회 실패");
        const byStyle = new Map<string, any>();
        for (const [k, v] of Object.entries(data.byStyle || {})) byStyle.set(k, v);
        periodA = { byStyle, byStyleColor: new Map() };
      }

      const relaunch = relaunchWbs.length ? salesDataUpload.mergeFlagSets(relaunchWbs.map((wb) => salesDataUpload.parseFlagSheetByStyle(wb, "재런칭"))) : new Set<string>();
      const lineup = lineupWbs.length ? salesDataUpload.mergeLineupMaps(lineupWbs.map((wb) => salesDataUpload.parseLineupSheet(wb))) : new Map<string, string>();

      if (!stockRows.length) throw new Error("재고 파일에서 데이터를 읽지 못했습니다.");

      const inputs = { stockRows, production, periodA, periodB, relaunch, lineup };
      const styleReport = salesDataUpload.buildStyleReport(inputs);
      const colorReport = salesDataUpload.buildColorReport(inputs);

      // 원본 파일이 아니라 계산이 끝난 작은 결과만 서버로 보냅니다 (요청 용량 제한 회피).
      const res = await fetch("/api/sales-data-save-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleReport, colorReport, uploadedStock: true, uploadedProduction: true }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "저장 실패");
      setUploadResult({ ...data, stockRowsParsed: stockRows.length, productionStylesParsed: production.size });
      await load("", type);
      fetch("/api/upload-status", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (d.ok) setUploadStatuses(d); }).catch(() => {});
    } catch (e: any) {
      setUploadError(e?.message || "업로드 처리 실패");
    } finally {
      setUploading(false);
    }
  }

  async function downloadExcel() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(type === "color" ? "컬러" : "품번");

    const groupRow = rows[2] || [];
    const headerRow = rows[3] || [];
    const totalRowIdx = 5;
    const dataStart = 7;
    const colCount = headerRow.length || (rows[0] || []).length || 1;

    // 헤더 텍스트로 "증감/등락/신장률" 계열 컬럼, "액션" 컬럼, "비중" 컬럼을 찾아둡니다.
    const changeCols = new Set<number>();
    let actionCol = -1;
    headerRow.forEach((h: any, i: number) => {
      const t = String(h || "");
      if (t.includes("등락") || t.includes("증감") || t.includes("신장률")) changeCols.add(i);
      if (t === "액션") actionCol = i;
    });

    rows.forEach((row, r) => {
      const excelRow = ws.getRow(r + 1);
      const values = row.length ? row : new Array(colCount).fill("");
      values.forEach((v: any, c: number) => {
        excelRow.getCell(c + 1).value = v === "" || v === null || v === undefined ? null : v;
      });
      excelRow.commit();
    });

    // 제목 행
    ws.mergeCells(1, 1, 1, Math.max(colCount, 4));
    const titleCell = ws.getCell(1, 1);
    titleCell.font = { bold: true, size: 14, color: { argb: "FF1E293B" } };

    // 그룹 헤더 행(3행) — 그룹별로 색을 다르게
    const groupColors: Record<string, string> = {
      "제품라이프사이클": "FFDCEEFB",
      "랭킹": "FFEDE9FE",
      "금액판매": "FFDCFCE7",
      "수량판매": "FFFEF3C7",
      "재고": "FFE2E8F0",
    };
    let lastGroupColor = "";
    for (let c = 0; c < colCount; c++) {
      const label = String(groupRow[c] || "");
      if (label && groupColors[label]) lastGroupColor = groupColors[label];
      const cell = ws.getCell(3, c + 1);
      if (lastGroupColor) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: lastGroupColor } };
      cell.font = { bold: true, size: 10 };
      if (label) lastGroupColor = groupColors[label] || lastGroupColor;
    }

    // 컬럼 헤더 행(4행) — 진한 남색 배경 + 흰 글씨
    for (let c = 0; c < colCount; c++) {
      const cell = ws.getCell(4, c + 1);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }

    // 합계 행 — 연한 노랑 + 굵게
    for (let c = 0; c < colCount; c++) {
      const cell = ws.getCell(totalRowIdx + 1, c + 1);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } };
      cell.font = { bold: true };
    }

    // 데이터 행 — 줄무늬 배경 + 증감 컬럼 빨강/파랑 + 액션 컬럼 색상
    for (let r = dataStart; r < rows.length; r++) {
      const stripe = (r - dataStart) % 2 === 1;
      for (let c = 0; c < colCount; c++) {
        const cell = ws.getCell(r + 1, c + 1);
        if (stripe) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

        if (changeCols.has(c)) {
          const num = Number(String(cell.value ?? "").toString().replace(/[^0-9.\-]/g, ""));
          if (Number.isFinite(num) && num !== 0) {
            cell.font = { color: { argb: num > 0 ? "FF2563EB" : "FFDC2626" }, bold: true };
          }
        }
        if (c === actionCol) {
          const v = String(cell.value || "");
          if (v.includes("품절") || v.includes("과다")) cell.font = { color: { argb: "FFDC2626" }, bold: true };
          else if (v.includes("발주") || v.includes("소진")) cell.font = { color: { argb: "FFD97706" }, bold: true };
          else if (v === "정상") cell.font = { color: { argb: "FF16A34A" } };
        }
      }
    }

    // 헤더 고정 + 열 너비 대략 조정
    ws.views = [{ state: "frozen", ySplit: dataStart, xSplit: 2 }];
    for (let c = 0; c < colCount; c++) {
      const headerText = String(headerRow[c] || "");
      ws.getColumn(c + 1).width = Math.max(8, Math.min(22, headerText.length + 6));
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `주간판매데이터_${week || "latest"}_${type === "color" ? "컬러" : "품번"}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
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
                재고 / 생산은 필수예요. 기간판매(전주,2주)/(3주,4주)는 <b>선택</b>이에요 — 안 올리면 이미 쌓고 있는 Daily_Sales_History로 자동 계산해요(단, 컬러별 세부 수치는 기간판매 파일을 올렸을 때가 더 정확해요). 재런칭·라인업도 선택이에요(안 올리면 이전 값 유지).
                <br />파일은 <b>브라우저에서 바로 계산</b>돼서 서버로 원본 파일 전체를 보내지 않아요(용량 큰 파일도 안전해요). 업로드하면 계산해서 <b>스냅샷으로 저장</b>되고, 다음부터는 페이지 열 때마다 다시 계산하지 않고 저장된 걸 바로 보여줘요.
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
                {["재고", "생산", "기간판매(전주,2주)", "기간판매(3주,4주)", "재런칭", "라인업"].map((label) => {
                  const files = uploadFiles[label] || [];
                  const isDragOver = dragOverLabel === label;
                  return (
                    <div
                      key={label}
                      onDragOver={(e) => { e.preventDefault(); setDragOverLabel(label); }}
                      onDragLeave={() => setDragOverLabel((cur) => (cur === label ? "" : cur))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverLabel("");
                        const dropped = Array.from(e.dataTransfer.files || []);
                        if (dropped.length) setUploadFiles((prev) => ({ ...prev, [label]: [...(prev[label] || []), ...dropped] }));
                      }}
                      className={`flex flex-col gap-1 rounded-xl border-2 border-dashed p-3 transition ${isDragOver ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}
                    >
                      <span className="text-xs font-black text-slate-700">
                        {label} {["재고", "생산"].includes(label) && <span className="text-rose-600">*</span>}
                      </span>
                      <label className="cursor-pointer text-[11px] font-black text-blue-600 underline">
                        파일 선택 (여러 개 가능)
                        <input
                          type="file"
                          accept=".xlsx,.xls"
                          multiple
                          onChange={(e) => {
                            const picked = Array.from(e.target.files || []);
                            if (picked.length) setUploadFiles((prev) => ({ ...prev, [label]: [...(prev[label] || []), ...picked] }));
                            e.target.value = "";
                          }}
                          className="hidden"
                        />
                      </label>
                      <p className="text-[10px] text-slate-400">여기로 드래그해서 놓아도 돼요 (용량 커서 여러 파일로 나뉜 경우 다 올려주세요)</p>
                      {files.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {files.map((f, i) => (
                            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-1 text-[10px] font-bold text-emerald-600">
                              <span className="truncate">{f.name}</span>
                              <button
                                type="button"
                                onClick={() => setUploadFiles((prev) => ({ ...prev, [label]: (prev[label] || []).filter((_, idx) => idx !== i) }))}
                                className="shrink-0 text-red-500"
                              >
                                ✕
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={runUpload}
                disabled={uploading || !(uploadFiles["재고"]?.length) || !(uploadFiles["생산"]?.length)}
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
