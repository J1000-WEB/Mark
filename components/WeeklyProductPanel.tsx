"use client";

// MARK 2026-11-18: 상품탭 "주간데이터" — 팀 "주간판매데이터" 엑셀의 품번구분/컬러구분 자동판. 계산 기준은 lib/weeklyProductReport.ts 맨 위 주석.
import { Fragment, useEffect, useMemo, useState } from "react";

type Row = any;
const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "" : Math.round(v).toLocaleString("ko-KR"));
const pct = (v: number | null | undefined, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? "" : `${(v * 100).toFixed(d)}%`);
const wk = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : "");
function addDays(ymd: string, d: number) {
  const x = new Date(`${ymd}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}
const md = (s: string) => (s ? `${Number(s.slice(5, 7))}.${s.slice(8, 10)}` : "");
const SECTIONS = ["카테고리", "가격", "라이프사이클", "랭킹", "금액판매", "수량판매", "재고"] as const;
const GRADES = ["S", "A", "B", "C"] as const;
const TH = "whitespace-nowrap border-b border-slate-200 px-1.5 py-1 text-right font-black";
const TD = "whitespace-nowrap px-1.5 py-1 text-right tabular-nums";
const PAGE = 200;

export default function WeeklyProductPanel() {
  const [week, setWeek] = useState("");
  const [mode, setMode] = useState<"style" | "color">("style");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const [refresh, setRefresh] = useState(false);
  const [show, setShow] = useState<Record<string, boolean>>({ 카테고리: true, 가격: false, 라이프사이클: true, 랭킹: true, 금액판매: true, 수량판매: true, 재고: true });
  const [grades, setGrades] = useState<Record<string, boolean>>({ S: true, A: true, B: false, C: false });
  const [f, setF] = useState({ year: "", season: "", cat: "", item: "", q: "", relaunch: false, lineup: "", salesOnly: false });
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const qs = new URLSearchParams({ mode });
    if (week) qs.set("week", week);
    if (refresh) qs.set("refresh", "1");
    fetch(`/api/weekly-product?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.ok) setData(j);
        else setError(j.error || "불러오지 못했어요.");
      })
      .catch(() => alive && setError("불러오지 못했어요."))
      .finally(() => {
        if (alive) {
          setLoading(false);
          setRefresh(false);
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, mode, nonce]);

  // MARK 2026-11-19: 러닝 합산 — 러닝 재런칭 품번(예: 에센셜 크루넥 가디건 WBD3L04501 → GF7LKC501)을 한 줄로 합쳐 판매·재고를 합산.
  // 연결은 MARK_DB 상품_기준표 "재런칭"(새 품번 → 통합 품번, ERP main_sty_cd와 같음). 합친 뒤 전사·매장 순위는 다시 계산.
  const [merge, setMerge] = useState(true);
  const [mainMap, setMainMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    try {
      const v = localStorage.getItem("weeklyMergeRunning");
      if (v === "0") setMerge(false);
    } catch {}
    fetch("/api/product-refs")
      .then((r) => r.json())
      .then((j) => j.ok && setMainMap(new Map(j.items.filter((x: any) => x.kind === "재런칭" && x.value).map((x: any) => [x.style, String(x.value).toUpperCase()]))))
      .catch(() => {});
  }, []);
  const rawRows: Row[] = data?.rows || [];
  const stores: any[] = data?.stores || [];
  const rows: Row[] = useMemo(() => {
    if (!merge || !mainMap.size) return rawRows.filter((r) => !r.extra);
    const groups = new Map<string, Row[]>();
    for (const r of rawRows) {
      const main = mainMap.get(r.style) || r.style;
      const g = `${main}|${mode === "color" ? r.color : ""}`;
      (groups.get(g) || groups.set(g, []).get(g)!).push(r);
    }
    const out: Row[] = [];
    for (const list of groups.values()) {
      if (list.length === 1) {
        if (!list[0].extra) out.push(list[0]);
        continue;
      }
      if (list.every((r) => r.extra)) continue;
      // 표시 기준 = 새 품번(재런칭 쪽) 줄, 없으면 이번 주 판매 많은 줄
      const base = list.find((r) => mainMap.has(r.style)) || [...list].sort((a, b) => b.amt[0] - a.amt[0])[0];
      const others = list.filter((r) => r !== base).map((r) => r.style);
      const sum = (fn: (r: Row) => number) => list.reduce((a, r) => a + (fn(r) || 0), 0);
      out.push({
        ...base,
        k: `M:${base.k}`,
        merged: [...new Set(others)],
        relaunch: true,
        plan: sum((r) => r.plan),
        inQty: sum((r) => r.inQty),
        sold: sum((r) => r.sold),
        stock: sum((r) => r.stock),
        amt: [sum((r) => r.amt[0]), sum((r) => r.amt[1])],
        share: sum((r) => r.share),
        qty: [0, 1, 2, 3].map((i) => sum((r) => r.qty[i])),
        totalStock: sum((r) => r.totalStock),
        wh: sum((r) => r.wh),
        storeStockSum: sum((r) => r.storeStockSum),
        stores: base.stores.map((_: any, i: number) => [0, sum((r) => r.stores[i][1]), sum((r) => r.stores[i][2])]),
        _needRank: true,
      });
    }
    // 순위 다시 계산(전사=금액, 매장=수량, 같은 값은 같은 순위)
    const rankBy = (val: (r: Row) => number) => {
      const arr = out.map((r) => val(r)).filter((v) => v > 0).sort((a, b) => b - a);
      const first = new Map<number, number>();
      arr.forEach((v, i) => !first.has(v) && first.set(v, i + 1));
      const last = arr.length + 1;
      return (r: Row) => (val(r) > 0 ? first.get(val(r))! : last);
    };
    const r0 = rankBy((r) => r.amt[0]);
    const r1 = rankBy((r) => r.amt[1]);
    const sr = stores.map((_, i) => rankBy((r) => r.stores[i][1]));
    return out.map((r) => ({
      ...r,
      rank: r0(r),
      prevRank: r1(r),
      stores: r.stores.map((x: number[], i: number) => [x[1] > 0 ? sr[i](r) : 0, x[1], x[2]]),
    }));
  }, [rawRows, merge, mainMap, mode, stores]);
  const opts = useMemo(() => {
    const u = (k: string) => [...new Set(rows.map((r) => r[k]).filter(Boolean))].sort();
    return { year: u("year"), season: u("season"), cat: u("cat"), item: u("item"), lineup: u("lineup") };
  }, [rows]);
  const filtered = useMemo(() => {
    const q = f.q.trim().toUpperCase();
    return rows.filter(
      (r) =>
        (!f.year || r.year === f.year) &&
        (!f.season || r.season === f.season) &&
        (!f.cat || r.cat === f.cat) &&
        (!f.item || r.item === f.item) &&
        (!f.relaunch || r.relaunch) &&
        (!f.lineup || r.lineup === f.lineup) &&
        (!f.salesOnly || r.qty?.[0] > 0) &&
        (!q || r.style.includes(q) || (r.merged || []).some((x: string) => x.includes(q)) || String(r.name).toUpperCase().includes(q) || `${r.style}${r.color}`.includes(q))
    ).sort((a, b) => (b.amt?.[0] || 0) - (a.amt?.[0] || 0) || (b.qty?.[0] || 0) - (a.qty?.[0] || 0) || (b.totalStock || 0) - (a.totalStock || 0));
    // MARK 2026-11-19: 기본 정렬 = 주간 판매금액 높은 순(같으면 수량, 재고 순)
  }, [rows, f]);
  useEffect(() => setLimit(PAGE), [f, mode, week]);

  const totals = useMemo(() => {
    const s = (fn: (r: Row) => number) => filtered.reduce((a, r) => a + (fn(r) || 0), 0);
    return {
      plan: s((r) => r.plan),
      inQty: s((r) => r.inQty),
      sold: s((r) => r.sold),
      stock: s((r) => r.stock),
      amt0: s((r) => r.amt[0]),
      amt1: s((r) => r.amt[1]),
      qty: [0, 1, 2, 3].map((i) => s((r) => r.qty[i])),
      totalStock: s((r) => r.totalStock),
      wh: s((r) => r.wh),
      store: s((r) => r.storeStockSum),
      stores: stores.map((_, i) => [s((r) => r.stores[i][1]), s((r) => r.stores[i][2])]),
    };
  }, [filtered, stores]);

  const shownStores = stores.map((s, i) => ({ ...s, i })).filter((s) => grades[s.grade]);
  const weekStart = data?.weekStart || "";
  const sel = "rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold";

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-400">WEEKLY SALES DATA</p>
          <h2 className="text-2xl font-black tracking-tight">
            주간판매데이터 {data ? `(${md(data.weekStart)}~${md(data.weekEnd)})` : ""}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            오프라인 실판매(매장주문/반품·온라인 제외) · 랭킹=전사 주간 판매금액, 매장 RANK=매장 주간 판매수량 · 상품/가격/재고=PIP
            {data?.stockDate ? `(재고 기준일 ${data.stockDate})` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5">
            {(["style", "color"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-lg px-3 py-1.5 text-sm font-black ${mode === m ? "bg-slate-900 text-white" : "text-slate-500"}`}>
                {m === "style" ? "품번구분" : "컬러구분(올해 상품)"}
              </button>
            ))}
          </div>
          <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black" onClick={() => weekStart && setWeek(addDays(weekStart, -7))}>
            ◀ 전주
          </button>
          <input type="date" value={week || weekStart} onChange={(e) => e.target.value && setWeek(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold" />
          <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black" onClick={() => weekStart && setWeek(addDays(weekStart, 7))}>
            다음주 ▶
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              if (!window.confirm("다시 계산하면 저장된 결과(월요일 아침 재고 기준)가 지금 재고 기준으로 바뀌어요. 계속할까요?")) return;
              setRefresh(true);
              setNonce((x) => x + 1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-500 disabled:opacity-50"
            title="저장된 결과 대신 지금 데이터로 다시 계산(1분 정도) — 재고가 지금 기준으로 바뀜"
          >
            다시 계산
          </button>
        </div>
      </div>

      {/* 필터·보기 */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2">
        <select className={sel} value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })}>
          <option value="">년도 전체</option>
          {opts.year.map((v) => <option key={v}>{v}</option>)}
        </select>
        <select className={sel} value={f.season} onChange={(e) => setF({ ...f, season: e.target.value })}>
          <option value="">시즌 전체</option>
          {opts.season.map((v) => <option key={v}>{v}</option>)}
        </select>
        <select className={sel} value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>
          <option value="">품목 전체</option>
          {opts.cat.map((v) => <option key={v}>{v}</option>)}
        </select>
        <select className={sel} value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })}>
          <option value="">아이템 전체</option>
          {opts.item.map((v) => <option key={v}>{v}</option>)}
        </select>
        <select className={sel} value={f.lineup} onChange={(e) => setF({ ...f, lineup: e.target.value })}>
          <option value="">라인업 전체</option>
          {opts.lineup.map((v) => <option key={v}>{v}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs font-bold">
          <input type="checkbox" checked={f.relaunch} onChange={(e) => setF({ ...f, relaunch: e.target.checked })} /> 재런칭만
        </label>
        <label className="flex items-center gap-1 rounded-lg bg-violet-50 px-1.5 py-0.5 text-xs font-black text-violet-700" title="러닝 재런칭 품번(예전 품번 + 새 품번)을 한 줄로 합쳐서 판매·재고를 합산">
          <input
            type="checkbox"
            checked={merge}
            onChange={(e) => {
              setMerge(e.target.checked);
              try {
                localStorage.setItem("weeklyMergeRunning", e.target.checked ? "1" : "0");
              } catch {}
            }}
          />{" "}
          러닝 합산
        </label>
        <label className="flex items-center gap-1 text-xs font-bold">
          <input type="checkbox" checked={f.salesOnly} onChange={(e) => setF({ ...f, salesOnly: e.target.checked })} /> 이번 주 판매 있는 것만
        </label>
        <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="품번·품명 검색" className="w-36 rounded-lg border border-slate-200 px-2 py-1 text-xs" />
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <span className="text-[11px] font-black text-slate-400">보기</span>
        {SECTIONS.map((s) => (
          <label key={s} className={`flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-bold ${show[s] ? "bg-slate-100" : "text-slate-400"}`}>
            <input type="checkbox" className="h-3 w-3" checked={!!show[s]} onChange={() => setShow({ ...show, [s]: !show[s] })} />
            {s}
          </label>
        ))}
        <span className="text-[11px] font-black text-slate-400">매장</span>
        {GRADES.map((g) => (
          <label key={g} className={`flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-bold ${grades[g] ? "bg-slate-100" : "text-slate-400"}`}>
            <input type="checkbox" className="h-3 w-3" checked={!!grades[g]} onChange={() => setGrades({ ...grades, [g]: !grades[g] })} />
            {g}등급
          </label>
        ))}
      </div>

      {loading && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">불러오는 중… (처음 계산하는 주는 1분 정도 걸려요)</div>}
      {error && <div className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>}

      {!loading && data && (
        <div className="max-h-[78vh] overflow-auto rounded-2xl border border-slate-200 bg-white">
          <table className="text-[11px]">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
              <tr className="text-[10px]">
                <th className="sticky left-0 z-20 bg-slate-50 px-2 py-1 text-left font-black" colSpan={mode === "color" ? 3 : 2}>
                  상품
                </th>
                {show.카테고리 && <th colSpan={7} className="border-l border-slate-200 px-1 font-black">카테고리</th>}
                {show.가격 && <th colSpan={6} className="border-l border-slate-200 px-1 font-black">상품가격</th>}
                {show.라이프사이클 && <th colSpan={6} className="border-l border-slate-200 px-1 font-black">제품라이프사이클</th>}
                {show.랭킹 && <th colSpan={3} className="border-l border-slate-200 px-1 font-black">랭킹</th>}
                {show.금액판매 && <th colSpan={3} className="border-l border-slate-200 px-1 font-black">금액판매</th>}
                {show.수량판매 && <th colSpan={4} className="border-l border-slate-200 px-1 font-black">수량판매</th>}
                {show.재고 && <th colSpan={4} className="border-l border-slate-200 px-1 font-black">재고</th>}
                {shownStores.map((s) => (
                  <th key={s.code} colSpan={5} className={`border-l border-slate-200 px-1 font-black ${s.grade === "S" ? "text-violet-600" : s.grade === "A" ? "text-blue-600" : s.grade === "B" ? "text-emerald-600" : "text-slate-500"}`}>
                    {s.grade}·{s.short}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="sticky left-0 z-20 bg-slate-50 px-2 py-1 text-left font-black">품번</th>
                {mode === "color" && <th className="bg-slate-50 px-1 text-left font-black">컬러</th>}
                <th className="bg-slate-50 px-1 text-left font-black">품명</th>
                {show.카테고리 && ["년도", "시즌", "품목", "복종", "아이템", "재런칭", "라인업"].map((h, i) => <th key={h} className={`${TH} text-left ${i === 0 ? "border-l" : ""}`}>{h}</th>)}
                {show.가격 && ["원가", "TAG가", "판매가", "OFF가", "프로모션가", "할인율"].map((h, i) => <th key={h} className={`${TH} ${i === 0 ? "border-l" : ""}`}>{h}</th>)}
                {show.라이프사이클 && ["기획", "입고%", "입고", "판매", "재고", "판매%"].map((h, i) => <th key={h} className={`${TH} ${i === 0 ? "border-l" : ""}`}>{h}</th>)}
                {show.랭킹 && ["주간", "2주전", "등락"].map((h, i) => <th key={h} className={`${TH} ${i === 0 ? "border-l" : ""}`}>{h}</th>)}
                {show.금액판매 && ["주간", "2주전", "비중"].map((h, i) => <th key={h} className={`${TH} ${i === 0 ? "border-l" : ""}`}>{h}</th>)}
                {show.수량판매 && ["주간", "2주전", "3주전", "4주전"].map((h, i) => <th key={h} className={`${TH} ${i === 0 ? "border-l" : ""}`}>{h}</th>)}
                {show.재고 && ["총재고", "물류", "점포", "주수"].map((h, i) => <th key={h} className={`${TH} ${i === 0 ? "border-l" : ""}`} title={h === "주수" ? "물류재고 ÷ 주간 판매수량" : ""}>{h}</th>)}
                {shownStores.map((s) => (
                  <Fragment key={s.code}>
                    <th className={`${TH} border-l`}>RANK</th>
                    <th className={TH} title="전사 랭킹 − 매장 랭킹">전사비</th>
                    <th className={TH}>판매</th>
                    <th className={TH}>재고</th>
                    <th className={TH}>주수</th>
                  </Fragment>
                ))}
              </tr>
              {/* 합계 줄 */}
              <tr className="bg-amber-50 text-slate-800">
                <td className="sticky left-0 z-20 bg-amber-50 px-2 py-1 font-black" colSpan={mode === "color" ? 3 : 2}>
                  합계 ({filtered.length.toLocaleString()}개)
                </td>
                {show.카테고리 && <td colSpan={7} className="border-l border-slate-200" />}
                {show.가격 && <td colSpan={6} className="border-l border-slate-200" />}
                {show.라이프사이클 && (
                  <>
                    <td className={`${TD} border-l border-slate-200 font-black`}>{num(totals.plan)}</td>
                    <td className={TD}>{pct(totals.plan ? totals.inQty / totals.plan : null)}</td>
                    <td className={`${TD} font-black`}>{num(totals.inQty)}</td>
                    <td className={`${TD} font-black`}>{num(totals.sold)}</td>
                    <td className={`${TD} font-black`}>{num(totals.stock)}</td>
                    <td className={TD}>{pct(totals.inQty ? totals.sold / totals.inQty : null)}</td>
                  </>
                )}
                {show.랭킹 && <td colSpan={3} className="border-l border-slate-200" />}
                {show.금액판매 && (
                  <>
                    <td className={`${TD} border-l border-slate-200 font-black`}>{num(totals.amt0)}</td>
                    <td className={`${TD} font-black`}>{num(totals.amt1)}</td>
                    <td className={TD}>{pct(data.total?.amt?.[0] ? totals.amt0 / data.total.amt[0] : null, 1)}</td>
                  </>
                )}
                {show.수량판매 && totals.qty.map((q, i) => <td key={i} className={`${TD} font-black ${i === 0 ? "border-l border-slate-200" : ""}`}>{num(q)}</td>)}
                {show.재고 && (
                  <>
                    <td className={`${TD} border-l border-slate-200 font-black`}>{num(totals.totalStock)}</td>
                    <td className={`${TD} font-black`}>{num(totals.wh)}</td>
                    <td className={`${TD} font-black`}>{num(totals.store)}</td>
                    <td className={TD}>{totals.qty[0] > 0 ? wk(totals.wh / totals.qty[0]) : ""}</td>
                  </>
                )}
                {shownStores.map((s) => (
                  <Fragment key={s.code}>
                    <td className="border-l border-slate-200" colSpan={2} />
                    <td className={`${TD} font-black`}>{num(totals.stores[s.i][0])}</td>
                    <td className={`${TD} font-black`}>{num(totals.stores[s.i][1])}</td>
                    <td className={TD}>{totals.stores[s.i][0] > 0 ? wk(totals.stores[s.i][1] / totals.stores[s.i][0]) : ""}</td>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((r) => {
                const rankUp = r.prevRank - r.rank;
                return (
                  <tr key={r.k} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="sticky left-0 bg-white px-2 py-1 font-black">
                      {r.style}
                      {r.merged?.length ? <span className="ml-1 text-[10px] font-bold text-violet-500" title="러닝 합산된 예전 품번">+{r.merged.join(",")}</span> : null}
                    </td>
                    {mode === "color" && (
                      <td className="whitespace-nowrap px-1 py-1 font-bold">
                        {r.color} <span className="font-normal text-slate-400">{r.colorName}</span>
                      </td>
                    )}
                    <td className="max-w-[180px] truncate px-1 py-1 text-slate-600" title={r.name}>
                      {r.name}
                    </td>
                    {show.카테고리 && (
                      <>
                        <td className="whitespace-nowrap border-l border-slate-100 px-1.5">{r.year}</td>
                        <td className="whitespace-nowrap px-1.5">{r.season}</td>
                        <td className="whitespace-nowrap px-1.5">{r.cat}</td>
                        <td className="whitespace-nowrap px-1.5">{r.bok}</td>
                        <td className="whitespace-nowrap px-1.5">{r.item}</td>
                        <td className="whitespace-nowrap px-1.5 font-bold text-violet-600">{r.relaunch ? "재런칭" : ""}</td>
                        <td className="whitespace-nowrap px-1.5 font-bold text-blue-600">{r.lineup}</td>
                      </>
                    )}
                    {show.가격 && (
                      <>
                        <td className={`${TD} border-l border-slate-100`}>{num(r.cost)}</td>
                        <td className={TD}>{num(r.tag)}</td>
                        <td className={TD}>{num(r.price)}</td>
                        <td className={TD}>{num(r.price * 0.9)}</td>
                        <td className={TD}>{num(r.price * 0.8)}</td>
                        <td className={TD}>20%</td>
                      </>
                    )}
                    {show.라이프사이클 && (
                      <>
                        <td className={`${TD} border-l border-slate-100`}>{num(r.plan)}</td>
                        <td className={TD}>{pct(r.plan ? r.inQty / r.plan : null)}</td>
                        <td className={TD}>{num(r.inQty)}</td>
                        <td className={TD}>{num(r.sold)}</td>
                        <td className={TD}>{num(r.stock)}</td>
                        <td className={TD}>{pct(r.inQty ? r.sold / r.inQty : null)}</td>
                      </>
                    )}
                    {show.랭킹 && (
                      <>
                        <td className={`${TD} border-l border-slate-100 font-black`}>{r.qty[0] || r.amt[0] ? r.rank : ""}</td>
                        <td className={TD}>{r.amt[1] ? r.prevRank : ""}</td>
                        <td className={`${TD} ${rankUp > 0 ? "text-blue-600" : rankUp < 0 ? "text-rose-600" : "text-slate-400"}`}>{r.amt[0] && r.amt[1] ? (rankUp > 0 ? `▲${rankUp}` : rankUp < 0 ? `▼${-rankUp}` : "-") : ""}</td>
                      </>
                    )}
                    {show.금액판매 && (
                      <>
                        <td className={`${TD} border-l border-slate-100 font-black`}>{num(r.amt[0])}</td>
                        <td className={TD}>{num(r.amt[1])}</td>
                        <td className={TD}>{r.share ? pct(r.share, 1) : ""}</td>
                      </>
                    )}
                    {show.수량판매 && r.qty.map((q: number, i: number) => <td key={i} className={`${TD} ${i === 0 ? "border-l border-slate-100 font-black" : ""}`}>{q ? num(q) : ""}</td>)}
                    {show.재고 && (
                      <>
                        <td className={`${TD} border-l border-slate-100`}>{num(r.totalStock)}</td>
                        <td className={TD}>{num(r.wh)}</td>
                        <td className={TD}>{num(r.storeStockSum)}</td>
                        <td className={TD}>{r.qty[0] > 0 ? wk(r.wh / r.qty[0]) : ""}</td>
                      </>
                    )}
                    {shownStores.map((s) => {
                      const [rk, q, st] = r.stores[s.i];
                      const diff = rk ? r.rank - rk : null;
                      return (
                        <Fragment key={s.code}>
                          <td className={`${TD} border-l border-slate-100`}>{rk || ""}</td>
                          <td className={`${TD} ${diff && diff > 0 ? "text-blue-600" : diff && diff < 0 ? "text-rose-600" : "text-slate-400"}`}>{diff === null ? "" : diff}</td>
                          <td className={TD}>{q ? num(q) : ""}</td>
                          <td className={`${TD} ${st < 0 ? "text-rose-600" : ""}`}>{st ? num(st) : ""}</td>
                          <td className={TD}>{q > 0 ? wk(st / q) : ""}</td>
                        </Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > limit && (
            <div className="p-3 text-center">
              <button type="button" onClick={() => setLimit((x) => x + PAGE)} className="rounded-xl border border-slate-200 px-4 py-1.5 text-xs font-black">
                {limit.toLocaleString()} / {filtered.length.toLocaleString()} — 더 보기
              </button>
            </div>
          )}
        </div>
      )}
      {data && (
        <p className="text-[11px] text-slate-400">
          저장 {data.generatedAt}(재고 {data.stockDate}) · 주간 {md(data.weeks?.[0]?.start)}~{md(data.weeks?.[0]?.end)}, 2주전 {md(data.weeks?.[1]?.start)}~ · 3주전 {md(data.weeks?.[2]?.start)}~ · 4주전 {md(data.weeks?.[3]?.start)}~ ·
          OFF가=판매가×0.9, 프로모션가=판매가×0.8 · 금액 누계는 작년 PIP를 다 쌓은 뒤 붙일 예정
        </p>
      )}
    </div>
  );
}
