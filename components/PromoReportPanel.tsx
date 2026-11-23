"use client";

// MARK 2026-11-17: 주간 IMC 프로모션 결과 — 팀이 매주 월요일 엑셀("N월 N주차 판매실적" 프로모션총요약)로 만들던 표를 자동 계산.
// 데이터: /api/promo-report (lib/promoReport.ts, Daily_Sales_History 오프라인·매장주문/반품 제외), 품번: MARK_DB "프로모션_품번".
import { Fragment, useEffect, useMemo, useState } from "react";
import ProductThumb from "@/components/ProductThumb";

type Agg = { qty: number; amount: number };

const won = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString("ko-KR") : "-");
const num = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString("ko-KR") : "-");
const pct1 = (n: number | null) => (n === null || !Number.isFinite(n) ? "-" : `${(n * 100).toFixed(1)}%`);
const signed = (n: number) => (n > 0 ? `+${num(n)}` : num(n));
const gColor = (n: number | null) => (n === null || !Number.isFinite(n) || n === 0 ? "text-slate-500" : n > 0 ? "text-blue-600" : "text-rose-600");
const md = (ymd: string) => (ymd ? `${Number(ymd.slice(5, 7))}.${ymd.slice(8, 10)}` : "");
const share = (a: number, b: number) => (b ? a / b : null);

function addDays(ymd: string, d: number) {
  const x = new Date(`${ymd}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}

const TH = "whitespace-nowrap px-2 py-1.5 text-right font-black";
const TD = "whitespace-nowrap px-2 py-1.5 text-right tabular-nums";

function growthOf(cur: Agg, prev: Agg): { v: number | null; label: string } {
  if (!prev.amount && cur.amount) return { v: 1, label: "신규" };
  if (!prev.amount) return { v: null, label: "-" };
  const g = cur.amount / prev.amount - 1;
  return { v: g, label: `${g >= 0 ? "+" : ""}${(g * 100).toFixed(1)}%` };
}

// MARK 2026-11-23: 생산(입고)·누적판매·판매율(PIP 최신)
const lifeOf = (rows: any[]) => rows.reduce((s: any, r: any) => ({ inQty: s.inQty + (r.inQty || 0), sold: s.sold + (r.sold || 0), stock: s.stock + (r.stock || 0) }), { inQty: 0, sold: 0, stock: 0 });
const sellThru = (l: { inQty: number; sold: number }) => (l.inQty > 0 ? l.sold / l.inQty : null);

// MARK 2026-11-20: 프로모션 구성 "N품번 M컬러"(컬러 = PIP 기준 품번별 컬러 수 합)
function mixOf(g: any) {
  const colors = (g.rows || []).reduce((a: number, r: any) => a + (r.colors || 0), 0);
  return `${(g.rows || []).length}품번${colors ? ` ${colors}컬러` : ""}`;
}

export default function PromoReportPanel() {
  const [week, setWeek] = useState(""); // 월요일 YYYY-MM-DD, 비우면 지난주
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [showShare, setShowShare] = useState(false);
  // 보고 싶은 프로모션만 체크(브라우저에 기억) — 저장값 없으면 전부
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      setHidden(JSON.parse(localStorage.getItem("promoReportHidden") || "{}") || {});
    } catch {}
  }, []);
  const toggleGroup = (g: string) =>
    setHidden((h) => {
      const next = { ...h, [g]: !h[g] };
      try {
        localStorage.setItem("promoReportHidden", JSON.stringify(next));
      } catch {}
      return next;
    });
  const setAll = (show: boolean, list: string[]) => {
    const next: Record<string, boolean> = {};
    if (!show) list.forEach((g) => (next[g] = true));
    setHidden(next);
    try {
      localStorage.setItem("promoReportHidden", JSON.stringify(next));
    } catch {}
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    fetch(`/api/promo-report${week ? `?week=${week}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.ok) setData(j);
        else setError(j.error || "불러오지 못했어요.");
      })
      .catch(() => alive && setError("불러오지 못했어요."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [week]);

  const allGroups: any[] = data?.groups || [];
  const groups: any[] = allGroups.filter((g) => !hidden[g.group]);
  const total = data?.total;
  const isOpen = (g: string) => open[g] !== false; // 기본 펼침

  const summary = useMemo(
    () =>
      groups.map((g) => {
        const gr = growthOf(g.cur, g.prev);
        return { group: g.group, cur: g.cur, prev: g.prev, gr, mix: mixOf(g), life: lifeOf(g.rows || []) };
      }),
    [groups]
  );
  // MARK 2026-11-20: 요약 맨 아래 합계(체크된 프로모션 전체)
  const sumAll = useMemo(() => {
    const cur = { qty: 0, amount: 0 }, prev = { qty: 0, amount: 0 };
    let styles = 0, colors = 0;
    for (const g of groups) {
      cur.qty += g.cur.qty; cur.amount += g.cur.amount; prev.qty += g.prev.qty; prev.amount += g.prev.amount;
      styles += g.rows.length; colors += g.rows.reduce((a: number, r: any) => a + (r.colors || 0), 0);
    }
    return { cur, prev, gr: growthOf(cur, prev), mix: `${styles}품번 ${colors}컬러`, life: lifeOf(groups.flatMap((g: any) => g.rows || [])) };
  }, [groups]);

  // MARK 2026-11-19: 엑셀 다운로드(소천님 요청) — 지금 화면에 체크된 프로모션만, 요약 시트 + 상세 시트(팀 "프로모션총요약"처럼 블록으로)
  const [downloading, setDownloading] = useState(false);
  async function downloadExcel() {
    if (!data) return;
    setDownloading(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const HEAD = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF1E293B" } };
      const SUM = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF1F5F9" } };
      const TITLE = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFEF3C7" } };
      const thin = { style: "thin" as const, color: { argb: "FFCBD5E1" } };
      const border = { top: thin, bottom: thin, left: thin, right: thin };
      const styleHead = (row: any) => row.eachCell((c: any) => { c.fill = HEAD; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; c.border = border; });
      const styleBody = (row: any, numFrom = 2) => row.eachCell((c: any, i: number) => { c.border = border; if (i >= numFrom && typeof c.value === "number") c.numFmt = Math.abs(c.value) < 1 && c.value !== 0 ? "0.0%" : "#,##0"; });
      const g2 = (cur: Agg, prev: Agg) => (prev.amount ? cur.amount / prev.amount - 1 : cur.amount ? "신규" : "");
      const period = `${md(data.weekStart)}~${md(data.weekEnd)}`;

      // 요약
      const ws = wb.addWorksheet("프로모션총요약");
      ws.addRow([`IMC 프로모션 결과 (${data.weekStart} ~ ${data.weekEnd}) · 오프라인(위탁·면세 포함), 매장주문/반품·온라인 제외 · 전주 ${data.prevStart} ~ ${data.prevEnd}`]).font = { bold: true, size: 13 };
      ws.addRow([]);
      ws.addRow(["", "금주 전체매출(오프)", total.cur.amount, "전주 전체매출(오프)", total.prev.amount, "전주비", g2(total.cur, total.prev)]).eachCell((c: any) => { if (typeof c.value === "number") c.numFmt = Math.abs(c.value) < 1 ? "0.0%" : "#,##0"; });
      ws.addRow([]);
      styleHead(ws.addRow(["프로모션", "생산(입고)", "누적판매", "판매율", "재고", "구성", "금주 수량", "금주 금액", "전체매출비중", "전주 수량", "전주 금액", "GAP 수량", "GAP 금액", "신장률"]));
      for (const s of summary) {
        styleBody(ws.addRow([s.group, s.life.inQty, s.life.sold, sellThru(s.life) ?? "", s.life.stock, s.mix, s.cur.qty, s.cur.amount, share(s.cur.amount, total.cur.amount) ?? "", s.prev.qty, s.prev.amount, s.cur.qty - s.prev.qty, s.cur.amount - s.prev.amount, g2(s.cur, s.prev)]));
      }
      if (summary.length > 1) {
        const tr = ws.addRow(["합계", sumAll.life.inQty, sumAll.life.sold, sellThru(sumAll.life) ?? "", sumAll.life.stock, sumAll.mix, sumAll.cur.qty, sumAll.cur.amount, share(sumAll.cur.amount, total.cur.amount) ?? "", sumAll.prev.qty, sumAll.prev.amount, sumAll.cur.qty - sumAll.prev.qty, sumAll.cur.amount - sumAll.prev.amount, g2(sumAll.cur, sumAll.prev)]);
        styleBody(tr, 3);
        tr.eachCell((c: any) => { c.fill = SUM; c.font = { bold: true }; });
      }
      ws.columns = [{ width: 22 }, { width: 12 }, { width: 12 }, { width: 9 }, { width: 11 }, { width: 16 }, { width: 12 }, { width: 16 }, { width: 13 }, { width: 12 }, { width: 16 }, { width: 11 }, { width: 14 }, { width: 10 }];

      // 상세(프로모션별 블록)
      const wd = wb.addWorksheet("프로모션별 상세");
      wd.columns = [{ width: 6 }, { width: 13 }, { width: 30 }, { width: 11 }, { width: 11 }, { width: 8 }, { width: 9 }, { width: 13 }, { width: 9 }, { width: 13 }, { width: 9 }, { width: 13 }, { width: 9 }, { width: 9 }, { width: 13 }, { width: 10 }, { width: 13 }];
      for (const g of groups) {
        const title = wd.addRow([`${g.title}  (${mixOf(g)})`]);
        title.font = { bold: true, size: 12 };
        title.getCell(1).fill = TITLE;
        if (g.note) wd.addRow([String(g.note).replace(/\n/g, " / ")]).font = { italic: true, color: { argb: "FF64748B" } };
        const head = ["출고", "품번", "품명", "생산(입고)", "누적판매", "판매율", "재고", "소비자가", "현판가", "할인율", `금주(${period}) 수량`, "금주 금액", `전주 수량`, "전주 금액", "GAP 수량", "GAP 금액", "신장률"];
        if (g.prevYear) head.push("전년 수량", "전년 금액", "러닝−전년 수량", "러닝−전년 금액");
        styleHead(wd.addRow(head));
        for (const r of g.rows) {
          const row = [r.shipped, r.style, r.name, r.inQty || 0, r.sold || 0, sellThru(r) ?? "", r.stock || 0, r.consumerPrice || "", r.currentPrice || "", r.consumerPrice && r.currentPrice ? 1 - r.currentPrice / r.consumerPrice : "", r.cur.qty, r.cur.amount, r.prev.qty, r.prev.amount, r.cur.qty - r.prev.qty, r.cur.amount - r.prev.amount, g2(r.cur, r.prev)];
          if (g.prevYear) row.push(r.prevYear?.qty ?? "", r.prevYear?.amount ?? "", r.runningGap?.qty ?? "", r.runningGap?.amount ?? "");
          styleBody(wd.addRow(row), 4);
        }
        const gl = lifeOf(g.rows);
        const sum = [`합계 (${g.rows.length}종)`, "", "", gl.inQty, gl.sold, sellThru(gl) ?? "", gl.stock, "", "", "", g.cur.qty, g.cur.amount, g.prev.qty, g.prev.amount, g.cur.qty - g.prev.qty, g.cur.amount - g.prev.amount, g2(g.cur, g.prev)];
        if (g.prevYear) sum.push(g.prevYearTotal?.qty ?? "", g.prevYearTotal?.amount ?? "", "", "");
        const sr = wd.addRow(sum);
        styleBody(sr, 4);
        sr.eachCell((c: any) => { c.fill = SUM; c.font = { bold: true }; });
        wd.addRow([]);
      }
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `IMC_프로모션결과_${data.weekStart.replace(/-/g, "")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-400">WEEKLY PROMOTION RESULT</p>
          <h2 className="text-2xl font-black tracking-tight">
            ★ IMC 프로모션 결과 {data ? `(${md(data.weekStart)}~${md(data.weekEnd)})` : ""}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            오프라인(위탁·면세 포함) 기준 · 매장주문/매장반품·온라인 제외 · 금주 vs 전주(7일 전) · 품번 목록은 MARK_DB "프로모션_품번"
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {allGroups.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1.5">
              <span className="px-1 text-xs font-black text-slate-400">조회</span>
              {allGroups.map((g) => (
                <label
                  key={g.group}
                  className={`flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${hidden[g.group] ? "text-slate-400" : "bg-slate-100 text-slate-800"}`}
                >
                  <input type="checkbox" checked={!hidden[g.group]} onChange={() => toggleGroup(g.group)} className="h-3.5 w-3.5" />
                  {g.group}
                </label>
              ))}
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-[11px] font-black text-slate-500 hover:bg-slate-100"
                onClick={() => setAll(groups.length !== allGroups.length, allGroups.map((g) => g.group))}
              >
                {groups.length !== allGroups.length ? "전체" : "전체해제"}
              </button>
            </div>
          )}
          <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black" onClick={() => data && setWeek(addDays(data.weekStart, -7))}>
            ◀ 전주
          </button>
          <input
            type="date"
            value={week || data?.weekStart || ""}
            onChange={(e) => e.target.value && setWeek(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
            title="그 주 아무 날짜나 고르면 월요일 기준 주로 맞춰요"
          />
          <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black" onClick={() => data && setWeek(addDays(data.weekStart, 7))}>
            다음주 ▶
          </button>
          <button
            type="button"
            onClick={downloadExcel}
            disabled={!data || downloading}
            className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-black text-white disabled:opacity-50"
          >
            {downloading ? "만드는 중..." : "⬇ 엑셀"}
          </button>
          <button
            type="button"
            onClick={() => setShowShare((v) => !v)}
            className={`rounded-xl px-3 py-2 text-sm font-black ${showShare ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
          >
            비중 {showShare ? "숨기기" : "보기"}
          </button>
        </div>
      </div>

      {loading && <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">계산 중… (20초 정도 걸려요)</div>}
      {error && <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div>}

      {!loading && data && (
        <>
          {/* 요약 */}
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-xs font-bold text-slate-400">금주 전체매출(오프)</span>
                <div className="text-lg font-black">{won(total.cur.amount)}</div>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400">전주 전체매출(오프)</span>
                <div className="text-lg font-black text-slate-600">{won(total.prev.amount)}</div>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400">전주비</span>
                <div className={`text-lg font-black ${gColor(growthOf(total.cur, total.prev).v)}`}>{growthOf(total.cur, total.prev).label}</div>
              </div>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-black">프로모션</th>
                    <th className={TH} title="PIP 최신 기준 입고 수량">생산(입고)</th>
                    <th className={TH} title="PIP 최신 기준 누적판매(전 채널)">누적판매</th>
                    <th className={`${TH} border-r border-slate-200`}>판매율</th>
                    <th className="px-2 py-1.5 text-left font-black">구성</th>
                    <th className={TH}>금주 수량</th>
                    <th className={TH}>금주 금액</th>
                    <th className={TH}>전체매출비중</th>
                    <th className={TH}>전주 금액</th>
                    <th className={TH}>GAP 수량</th>
                    <th className={TH}>GAP 금액</th>
                    <th className={TH}>신장률</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => (
                    <tr key={s.group} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 font-black">{s.group}</td>
                      <td className={TD}>{num(s.life.inQty)}</td>
                      <td className={TD}>{num(s.life.sold)}</td>
                      <td className={`${TD} border-r border-slate-100 font-black`}>{pct1(sellThru(s.life))}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">{s.mix}</td>
                      <td className={TD}>{num(s.cur.qty)}</td>
                      <td className={`${TD} font-black`}>{won(s.cur.amount)}</td>
                      <td className={TD}>{pct1(share(s.cur.amount, total.cur.amount))}</td>
                      <td className={`${TD} text-slate-500`}>{won(s.prev.amount)}</td>
                      <td className={`${TD} ${gColor(s.cur.qty - s.prev.qty)}`}>{signed(s.cur.qty - s.prev.qty)}</td>
                      <td className={`${TD} ${gColor(s.cur.amount - s.prev.amount)}`}>{signed(s.cur.amount - s.prev.amount)}</td>
                      <td className={`${TD} font-black ${gColor(s.gr.v)}`}>{s.gr.label}</td>
                    </tr>
                  ))}
                  {summary.length > 1 && (
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-black">
                      <td className="px-2 py-1.5">합계</td>
                      <td className={TD}>{num(sumAll.life.inQty)}</td>
                      <td className={TD}>{num(sumAll.life.sold)}</td>
                      <td className={`${TD} border-r border-slate-100`}>{pct1(sellThru(sumAll.life))}</td>
                      <td className="px-2 py-1.5 text-slate-500">{sumAll.mix}</td>
                      <td className={TD}>{num(sumAll.cur.qty)}</td>
                      <td className={TD}>{won(sumAll.cur.amount)}</td>
                      <td className={TD}>{pct1(share(sumAll.cur.amount, total.cur.amount))}</td>
                      <td className={`${TD} text-slate-500`}>{won(sumAll.prev.amount)}</td>
                      <td className={`${TD} ${gColor(sumAll.cur.qty - sumAll.prev.qty)}`}>{signed(sumAll.cur.qty - sumAll.prev.qty)}</td>
                      <td className={`${TD} ${gColor(sumAll.cur.amount - sumAll.prev.amount)}`}>{signed(sumAll.cur.amount - sumAll.prev.amount)}</td>
                      <td className={`${TD} ${gColor(sumAll.gr.v)}`}>{sumAll.gr.label}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {groups.map((g) => {
            const gr = growthOf(g.cur, g.prev);
            const opened = isOpen(g.group);
            return (
              <div key={g.group} className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [g.group]: !opened }))}
                  className="flex w-full flex-wrap items-start justify-between gap-2 px-4 py-3 text-left"
                >
                  <div>
                    <div className="text-base font-black">
                      <span className="mr-1 text-slate-400">{opened ? "−" : "+"}</span>
                      {g.title}
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 align-middle text-[11px] font-bold text-slate-600">{mixOf(g)}</span>
                    </div>
                    {g.note && <div className="mt-0.5 whitespace-pre-line text-xs text-slate-500">{g.note}</div>}
                  </div>
                  <div className="text-xs font-bold text-slate-600">
                    전주대비 판매수량 <span className={gColor(g.cur.qty - g.prev.qty)}>{signed(g.cur.qty - g.prev.qty)}</span>, 판매금액{" "}
                    <span className={gColor(g.cur.amount - g.prev.amount)}>{signed(g.cur.amount - g.prev.amount)}</span>, 신장률{" "}
                    <span className={`font-black ${gColor(gr.v)}`}>{gr.label}</span>
                  </div>
                </button>
                {opened && (
                  <div className="overflow-x-auto border-t border-slate-100">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-2 py-1.5 text-center font-black" rowSpan={2}>
                            출고
                          </th>
                          <th className="px-2 py-1.5 text-left font-black" rowSpan={2}>
                            품번 / 품명
                          </th>
                          <th className="border-l border-slate-200 px-2 py-1 text-center font-black" colSpan={4} title="PIP 최신 기준(사이즈·컬러 합, 'BE만'처럼 한 컬러 출고면 그 컬러만)">
                            생산·판매 (현재)
                          </th>
                          <th className={TH} rowSpan={2}>
                            소비자가
                          </th>
                          <th className={TH} rowSpan={2} title="그 주 판매 줄에서 가장 많이 팔린 개당 판매가(ERP 현판가 추정)">
                            현판가*
                          </th>
                          <th className={TH} rowSpan={2}>
                            할인율
                          </th>
                          <th className="border-l border-slate-200 px-2 py-1 text-center font-black" colSpan={showShare ? 4 : 2}>
                            금주 ({md(data.weekStart)}~{md(data.weekEnd)})
                          </th>
                          <th className="border-l border-slate-200 px-2 py-1 text-center font-black" colSpan={showShare ? 4 : 2}>
                            전주 ({md(data.prevStart)}~{md(data.prevEnd)})
                          </th>
                          <th className="border-l border-slate-200 px-2 py-1 text-center font-black" colSpan={2}>
                            GAP
                          </th>
                          <th className={`${TH} border-l border-slate-200`} rowSpan={2}>
                            신장률
                          </th>
                          {g.prevYear && (
                            <th className="border-l border-slate-200 px-2 py-1 text-center font-black" colSpan={4}>
                              전년 ({md(data.lyStart)}~{md(data.lyEnd)}) · 러닝합산−전년
                            </th>
                          )}
                        </tr>
                        <tr>
                          <th className={`${TH} border-l border-slate-200`}>입고</th>
                          <th className={TH}>누적판매</th>
                          <th className={TH}>판매율</th>
                          <th className={TH}>재고</th>
                          {[0, 1].map((k) => (
                            <Fragment key={k}>
                              <th className={`${TH} border-l border-slate-200`}>수량</th>
                              <th className={TH}>금액</th>
                              {showShare && (
                                <>
                                  <th className={TH}>{g.group}비중</th>
                                  <th className={TH}>전체비중</th>
                                </>
                              )}
                            </Fragment>
                          ))}
                          <th className={`${TH} border-l border-slate-200`}>수량</th>
                          <th className={TH}>금액</th>
                          {g.prevYear && (
                            <>
                              <th className={`${TH} border-l border-slate-200`}>수량</th>
                              <th className={TH}>금액</th>
                              <th className={TH}>GAP 수량</th>
                              <th className={TH}>GAP 금액</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r: any) => {
                          const rg = growthOf(r.cur, r.prev);
                          return (
                            <tr key={r.style} className="border-t border-slate-100 hover:bg-slate-50">
                              <td className="px-2 py-1.5 text-center font-bold">{r.shipped}</td>
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-2">
                                  <ProductThumb styleCode={r.style} size={32} />
                                  <div>
                                    <div className="font-black">{r.style}</div>
                                    <div className="max-w-[220px] truncate text-slate-500" title={r.name}>
                                      {r.name}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className={`${TD} border-l border-slate-100`}>{num(r.inQty || 0)}</td>
                              <td className={TD}>{num(r.sold || 0)}</td>
                              <td className={`${TD} font-black`}>{pct1(sellThru(r))}</td>
                              <td className={`${TD} text-slate-500 border-r border-slate-100`}>{num(r.stock || 0)}</td>
                              <td className={TD}>{r.consumerPrice ? won(r.consumerPrice) : "-"}</td>
                              <td className={TD}>{r.currentPrice ? won(r.currentPrice) : "-"}</td>
                              <td className={TD}>{r.consumerPrice && r.currentPrice ? pct1(1 - r.currentPrice / r.consumerPrice) : "-"}</td>
                              <td className={`${TD} border-l border-slate-100`}>{num(r.cur.qty)}</td>
                              <td className={`${TD} font-black`}>{won(r.cur.amount)}</td>
                              {showShare && (
                                <>
                                  <td className={TD}>{pct1(share(r.cur.amount, g.cur.amount))}</td>
                                  <td className={TD}>{pct1(share(r.cur.amount, total.cur.amount))}</td>
                                </>
                              )}
                              <td className={`${TD} border-l border-slate-100 text-slate-500`}>{num(r.prev.qty)}</td>
                              <td className={`${TD} text-slate-500`}>{won(r.prev.amount)}</td>
                              {showShare && (
                                <>
                                  <td className={`${TD} text-slate-500`}>{pct1(share(r.prev.amount, g.prev.amount))}</td>
                                  <td className={`${TD} text-slate-500`}>{pct1(share(r.prev.amount, total.prev.amount))}</td>
                                </>
                              )}
                              <td className={`${TD} border-l border-slate-100 ${gColor(r.cur.qty - r.prev.qty)}`}>{signed(r.cur.qty - r.prev.qty)}</td>
                              <td className={`${TD} ${gColor(r.cur.amount - r.prev.amount)}`}>{signed(r.cur.amount - r.prev.amount)}</td>
                              <td className={`${TD} border-l border-slate-100 font-black ${gColor(rg.v)}`}>{rg.label}</td>
                              {g.prevYear && (
                                <>
                                  <td className={`${TD} border-l border-slate-100`}>{r.prevYear ? num(r.prevYear.qty) : "-"}</td>
                                  <td className={TD}>{r.prevYear ? won(r.prevYear.amount) : "-"}</td>
                                  <td className={`${TD} ${gColor(r.runningGap?.qty ?? null)}`}>{r.runningGap ? signed(r.runningGap.qty) : ""}</td>
                                  <td className={`${TD} ${gColor(r.runningGap?.amount ?? null)}`}>{r.runningGap ? signed(r.runningGap.amount) : ""}</td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                        <tr className="border-t-2 border-slate-200 bg-slate-50 font-black">
                          <td className="px-2 py-1.5" colSpan={2}>
                            합계 ({g.rows.length}종)
                          </td>
                          {(() => { const gl = lifeOf(g.rows); return (<>
                            <td className={`${TD} border-l border-slate-100`}>{num(gl.inQty)}</td>
                            <td className={TD}>{num(gl.sold)}</td>
                            <td className={TD}>{pct1(sellThru(gl))}</td>
                            <td className={`${TD} border-r border-slate-100`}>{num(gl.stock)}</td>
                          </>); })()}
                          <td className={TD} colSpan={3}></td>
                          <td className={`${TD} border-l border-slate-100`}>{num(g.cur.qty)}</td>
                          <td className={TD}>{won(g.cur.amount)}</td>
                          {showShare && (
                            <>
                              <td className={TD}></td>
                              <td className={TD}>{pct1(share(g.cur.amount, total.cur.amount))}</td>
                            </>
                          )}
                          <td className={`${TD} border-l border-slate-100`}>{num(g.prev.qty)}</td>
                          <td className={TD}>{won(g.prev.amount)}</td>
                          {showShare && (
                            <>
                              <td className={TD}></td>
                              <td className={TD}>{pct1(share(g.prev.amount, total.prev.amount))}</td>
                            </>
                          )}
                          <td className={`${TD} border-l border-slate-100 ${gColor(g.cur.qty - g.prev.qty)}`}>{signed(g.cur.qty - g.prev.qty)}</td>
                          <td className={`${TD} ${gColor(g.cur.amount - g.prev.amount)}`}>{signed(g.cur.amount - g.prev.amount)}</td>
                          <td className={`${TD} border-l border-slate-100 ${gColor(gr.v)}`}>{gr.label}</td>
                          {g.prevYear && (
                            <>
                              <td className={`${TD} border-l border-slate-100`}>{g.prevYearTotal ? num(g.prevYearTotal.qty) : "-"}</td>
                              <td className={TD}>{g.prevYearTotal ? won(g.prevYearTotal.amount) : "-"}</td>
                              <td className={TD} colSpan={2}></td>
                            </>
                          )}
                        </tr>
                      </tbody>
                    </table>
                    {g.prevYear && !(data.dataDates?.ly || []).length && (
                      <div className="px-4 py-2 text-xs font-bold text-amber-700">
                        ⚠ 대시보드 판매이력에 {md(data.lyStart)}~{md(data.lyEnd)}(작년) 데이터가 없어 전년 칸이 비어 있어요.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[11px] text-slate-400">
            * 현판가는 ERP 현판가 메뉴 값이 아니라, 그 주 실제 판매 줄에서 가장 많이 팔린 개당 판매가예요(쿠폰·1+1 등 행사가가 섞이면 다를 수 있음). 소비자가는 PIP 판매가. 생산(입고)·누적판매·재고는 PIP 최신(어제 기준, 전 채널) 값이라 위 주간 기간과 상관없이 지금 상태예요. 판매율 = 누적판매 ÷ 입고.
          </p>
        </>
      )}
    </div>
  );
}
