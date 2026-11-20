"use client";

// MARK 2026-11-19: 재고CTRL — 재고MD님 아티팩트 3개(팩토리아울렛 판매분 / 재고이관 요청 리스트 / 저소진 품번 랭킹)를 MARK 데이터로.
// 계산은 /api/md-tools(lib/mdTools.ts). 파일 업로드 없음.
import { useEffect, useMemo, useState } from "react";
import StorePicker from "./StorePicker";

const fmt = (n: any) => (typeof n === "number" ? n.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : n ?? "");
const stamp = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");

async function callTool(body: any) {
  const r = await fetch("/api/md-tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "계산 실패");
  return j;
}
async function saveXlsx(sheets: { name: string; header: string[]; rows: any[][] }[], filename: string) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([s.header, ...s.rows]), s.name.slice(0, 28));
  XLSX.writeFile(wb, filename);
}

function useRunner() {
  const [running, setRunning] = useState(false);
  const [sec, setSec] = useState(0);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const id = setInterval(() => setSec(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);
  async function run<T>(fn: () => Promise<T>) {
    setRunning(true);
    setErr("");
    try {
      return await fn();
    } catch (e: any) {
      setErr(e?.message || "실패");
    } finally {
      setRunning(false);
    }
  }
  return { running, sec, err, run };
}

function Table({ cols, rows, max = 600, render }: { cols: [string, string][]; rows: any[]; max?: number; render?: (k: string, r: any, i: number) => any }) {
  if (!rows.length) return <p className="rounded-2xl bg-slate-50 p-6 text-center text-xs font-semibold text-slate-400">해당하는 건이 없어요.</p>;
  return (
    <div className="max-h-[560px] overflow-auto rounded-2xl border border-slate-200">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-100">
          <tr>{cols.map(([k, l]) => <th key={k} className="whitespace-nowrap px-2 py-2 text-left font-black text-slate-600">{l}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, max).map((r, i) => (
            <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
              {cols.map(([k]) => {
                const v = render ? render(k, r, i) : undefined;
                return <td key={k} className={`whitespace-nowrap px-2 py-1.5 ${typeof r[k] === "number" ? "text-right tabular-nums" : ""}`}>{v !== undefined ? v : fmt(r[k])}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > max && <p className="p-2 text-center text-[11px] text-slate-400">화면엔 {max}줄까지 — 전체는 엑셀로({fmt(rows.length)}줄)</p>}
    </div>
  );
}

const card = "space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm";
const runBtn = "h-9 rounded-full bg-slate-900 px-5 text-sm font-black text-white disabled:opacity-50";
const dlBtn = "h-9 rounded-full bg-emerald-600 px-4 text-xs font-black text-white";
const numIn = "mt-1 h-8 w-full rounded-lg border border-slate-300 px-2 text-sm text-slate-900";

// ─────────────────────────────────────────────────────────────────────────────
export function OutletPanel() {
  const [cfg, setCfg] = useState({ defaultWeeks: 3, defaultExcess: 4.3, soldoutTh: 2, periodDays: 7, minStock: 2, maxHold: 10, storeKeyword: "용인", shipRound: "" });
  const [res, setRes] = useState<any>(null);
  const [tab, setTab] = useState<"upload" | "detail" | "analysis">("upload");
  const R = useRunner();
  useEffect(() => {
    try {
      const s = localStorage.getItem("outletCfg");
      if (s) setCfg((c) => ({ ...c, ...JSON.parse(s) }));
    } catch {}
  }, []);
  const go = () =>
    R.run(async () => {
      try { localStorage.setItem("outletCfg", JSON.stringify(cfg)); } catch {}
      setRes(await callTool({ tool: "outlet", config: cfg }));
    });
  const set = (k: string, v: any) => setCfg((c) => ({ ...c, [k]: v }));
  return (
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">🏭 팩토리아울렛(용인) 출고 제안</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">재고주수로 품절임박·보충을 판단하고, 창고(물류 가용 오프)에서 매장당 최대 {cfg.maxHold}장까지만 채워요. RT 없음, 주 1회 출고 기준. 재고MD님 "팩토리아울렛 판매분"과 같은 계산.</p>
        </div>
        <button type="button" onClick={go} disabled={R.running} className={runBtn}>{R.running ? `계산 중... ${R.sec}초` : "▶ 분석 실행"}</button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-8">
        {[["defaultWeeks", "적정재고주수"], ["defaultExcess", "과잉판정(주≥, 참고)"], ["soldoutTh", "품절임박(주≤)"], ["periodDays", "기간판매 일수"], ["minStock", "판매0 최소잔여"], ["maxHold", "매장당 최대 보유"]].map(([k, l]) => (
          <label key={k} className="font-bold text-slate-500">{l}<input type="number" step="0.1" value={(cfg as any)[k]} onChange={(e) => set(k, Number(e.target.value))} className={numIn} /></label>
        ))}
        <label className="font-bold text-slate-500">매장 이름에 포함<input value={cfg.storeKeyword} onChange={(e) => set("storeKeyword", e.target.value)} className={numIn} /></label>
        <label className="font-bold text-slate-500">출고차수<input value={cfg.shipRound} onChange={(e) => set("shipRound", e.target.value)} className={numIn} /></label>
      </div>
      {R.err && <div className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{R.err}</div>}
      {res && (
        <>
          <p className="text-[11px] font-semibold text-slate-500">대상 매장: {res.stores.join(", ") || "없음"} · 기간판매 {res.inputs.period}({res.inputs.salesDates}) · 매장 재고 PIP {res.inputs.pip} · 물류 가용 {res.inputs.warehouse}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            {[["품절임박", res.statusCounts["품절임박"]], ["보충대상", res.statusCounts["보충"]], ["과잉", res.statusCounts["과잉"]], ["출고 건수", res.chulgoUpload.length], ["출고 합계", res.totals.shipQtySum], ["창고로도 못 채움", res.totals.unmetTotal]].map(([l, v]) => (
              <div key={String(l)} className="rounded-2xl border border-slate-200 p-3"><p className="text-[11px] font-bold text-slate-500">{l}</p><p className="mt-1 text-base font-black">{fmt(v)}</p></div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={dlBtn} onClick={() => saveXlsx([{ name: "출고업로드", header: ["채널", "바코드", "출고차수", "의뢰수량", "대분류", "비고"], rows: res.chulgoUpload.map((r: any) => [r.채널, r.바코드, r.출고차수, r.의뢰수량, r.대분류, r.비고]) }], `아울렛출고업로드_${stamp()}.xlsx`)}>⬇ 출고 업로드 엑셀</button>
            {(["upload", "detail", "analysis"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full px-3 py-1.5 text-xs font-black ${tab === k ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600"}`}>
                {k === "upload" ? `출고업로드 ${res.chulgoUpload.length}` : k === "detail" ? "출고 상세" : `재고분석 ${res.analysisRows.length}`}
              </button>
            ))}
          </div>
          {tab === "upload" && <Table cols={[["채널", "채널"], ["바코드", "바코드"], ["출고차수", "출고차수"], ["의뢰수량", "의뢰수량"], ["비고", "비고"]]} rows={res.chulgoUpload} />}
          {tab === "detail" && <Table cols={[["style", "스타일"], ["styleName", "상품명"], ["color", "칼라"], ["size", "사이즈"], ["stock", "현재고"], ["period", "기간판매"], ["status", "상태"], ["shortage", "부족"], ["availOff", "물류가용"], ["qty", "출고"], ["unmet", "미충족"]]} rows={res.chulgoRows} />}
          {tab === "analysis" && <Table cols={[["style", "스타일"], ["styleName", "상품명"], ["color", "칼라"], ["size", "사이즈"], ["cum", "누계판매"], ["period", "기간판매"], ["stock", "현재고"], ["stockWeeks", "재고주수"], ["status", "상태"], ["availOff", "물류가용"], ["shipQty", "출고"]]} rows={res.analysisRows} />}
        </>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function OnlineTransferPanel() {
  const [maxOffline, setMaxOffline] = useState(30);
  const [minOnline, setMinOnline] = useState(10);
  const [topN, setTopN] = useState(50);
  const [codes, setCodes] = useState("");
  const [res, setRes] = useState<any>(null);
  const [edit, setEdit] = useState<Record<string, { qty: string; note: string }>>({});
  const R = useRunner();
  const go = (manual: boolean) =>
    R.run(async () => {
      setEdit({});
      setRes(await callTool({ tool: "online", topN, days: 28, styles: manual ? codes.split(/[\s,;]+/).filter(Boolean) : [] }));
    });
  const rows: any[] = res?.rows || [];
  const keyOf = (r: any) => `${r.style}|${r.color}|${r.size}`;
  const short = rows.filter((r) => r.found && (r.offline || 0) < maxOffline);
  const target = short.filter((r) => (r.online || 0) >= minOnline);
  const lowOnline = short.filter((r) => (r.online || 0) < minOnline);
  const notFound = rows.filter((r) => !r.found);
  const download = () => {
    const H = ["순위", "스타일", "스타일명", "칼라", "칼라명", "사이즈", "바코드", "한달판매수량", "1주전판매", "2주전판매", "3주전판매", "오프라인재고(현재)", "온라인재고(가용)"];
    const base = (r: any) => [r.rank ?? "", r.style, r.styleName, r.color, r.colorName, r.size, r.barcode, r.monthly ?? "", r.w1 ?? "", r.w2 ?? "", r.w3 ?? "", r.offline ?? "", r.online ?? ""];
    const status = (r: any) => (!r.found ? "매칭안됨" : (r.offline || 0) < maxOffline ? ((r.online || 0) < minOnline ? "오프라인재고부족(온라인재고부족,이관보류)" : "오프라인재고부족(이관필요)") : "");
    saveXlsx(
      [
        { name: "이관요청리스트", header: [...H, "이관요청수량", "비고"], rows: target.map((r) => [...base(r), edit[keyOf(r)]?.qty || "", edit[keyOf(r)]?.note || ""]) },
        { name: res.mode === "manual" ? "품번조회_전체(참고)" : "BEST_전체(참고)", header: [...H, "상태"], rows: rows.map((r) => [...base(r), status(r)]) },
      ],
      `재고이관요청_${stamp()}.xlsx`
    );
  };
  return (
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">🔄 온라인 재고이관 요청 리스트</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">오프라인 최근 4주 판매 BEST(SKU) 중 오프라인 가용재고가 부족하고 온라인 가용이 있는 것 → 온라인팀에 보낼 이관요청 리스트. 가용(온/오프)은 ERP 자동 조회. 재고MD님 "재고이관 요청 리스트 생성기"와 같은 기준.</p>
        </div>
        <button type="button" onClick={() => go(false)} disabled={R.running} className={runBtn}>{R.running ? `계산 중... ${R.sec}초` : `▶ BEST ${topN}으로 만들기`}</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
        BEST <input type="number" value={topN} onChange={(e) => setTopN(Number(e.target.value) || 50)} className="h-8 w-16 rounded-lg border border-slate-300 px-2" /> 개 ·
        오프라인 가용 <input type="number" value={maxOffline} onChange={(e) => setMaxOffline(Number(e.target.value) || 0)} className="h-8 w-16 rounded-lg border border-slate-300 px-2" /> 장 미만 &
        온라인 가용 <input type="number" value={minOnline} onChange={(e) => setMinOnline(Number(e.target.value) || 0)} className="h-8 w-16 rounded-lg border border-slate-300 px-2" /> 장 이상만
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={codes} onChange={(e) => setCodes(e.target.value)} placeholder="품번 직접 입력(BEST 없이): GF7LKC501, GF7LKC524" className="h-9 min-w-[260px] flex-1 rounded-xl border border-slate-300 px-3 text-xs" />
        <button type="button" onClick={() => go(true)} disabled={R.running || !codes.trim()} className="h-9 rounded-full border border-slate-300 px-4 text-xs font-black text-slate-700 disabled:opacity-50">품번으로 조회</button>
      </div>
      {R.err && <div className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{R.err}</div>}
      {res && (
        <>
          <p className="text-[11px] font-semibold text-slate-500">{res.mode === "best" ? `판매 기간 ${res.period} (오프라인, 매장주문 제외)` : "품번 직접 조회"} · 가용재고 {res.stockAt}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[[res.mode === "manual" ? "조회된 SKU" : "BEST SKU", rows.length], ["이관요청 대상", target.length], [`온라인 ${minOnline}장 미만(제외)`, lowOnline.length], ["재고 매칭 안됨", notFound.length]].map(([l, v]) => (
              <div key={String(l)} className="rounded-2xl border border-slate-200 p-3"><p className="text-[11px] font-bold text-slate-500">{l}</p><p className="mt-1 text-base font-black">{fmt(v)}</p></div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={dlBtn} onClick={download} disabled={!target.length}>⬇ 이관요청 엑셀(요청수량·비고 포함)</button>
            {lowOnline.length > 0 && <span className="text-[11px] font-semibold text-rose-600">온라인 부족으로 제외: {lowOnline.slice(0, 5).map((r) => `${r.style}/${r.color}/${r.size}(${r.online}장)`).join(", ")}{lowOnline.length > 5 ? " 등" : ""}</span>}
          </div>
          <Table
            cols={[["rank", "순위"], ["style", "스타일"], ["styleName", "스타일명"], ["color", "칼라"], ["colorName", "칼라명"], ["size", "사이즈"], ["barcode", "바코드"], ["monthly", "한달판매"], ["w1", "1주전"], ["w2", "2주전"], ["w3", "3주전"], ["offline", "오프라인재고"], ["online", "온라인재고"], ["qty", "이관요청수량"], ["note", "비고"]]}
            rows={target}
            render={(k, r) => {
              const key = keyOf(r);
              if (k === "qty") return <input type="number" value={edit[key]?.qty || ""} onChange={(e) => setEdit({ ...edit, [key]: { qty: e.target.value, note: edit[key]?.note || "" } })} className="h-7 w-16 rounded border border-slate-300 bg-yellow-50 px-1 text-right" />;
              if (k === "note") return <input value={edit[key]?.note || ""} onChange={(e) => setEdit({ ...edit, [key]: { qty: edit[key]?.qty || "", note: e.target.value } })} className="h-7 w-28 rounded border border-slate-300 px-1" />;
              return undefined;
            }}
          />
        </>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function SlowMoverPanel() {
  const [days, setDays] = useState(28);
  const [topN, setTopN] = useState(100);
  const [excludeNoStock, setExcludeNoStock] = useState(true);
  const [off, setOff] = useState<Record<string, Record<string, boolean>>>({ category: { ACC: true, 기타: true }, year: {}, season: {} });
  const [res, setRes] = useState<any>(null);
  const [pick, setPick] = useState<string[]>([]); // 비면 전체 매장(소천님 요청: 기본 전체)
  const R = useRunner();
  useEffect(() => {
    try {
      const s = localStorage.getItem("slowMoverOff");
      if (s) setOff(JSON.parse(s));
    } catch {}
  }, []);
  const toggle = (f: string, v: string) => {
    const next = { ...off, [f]: { ...off[f], [v]: !off[f]?.[v] } };
    setOff(next);
    try { localStorage.setItem("slowMoverOff", JSON.stringify(next)); } catch {}
  };
  const go = () => R.run(async () => setRes(await callTool({ tool: "slow", days })));
  const all: any[] = res?.rows || [];
  const vals = (k: string) => [...new Set(all.map((r) => r[k]).filter(Boolean))].sort();
  const result = useMemo(() => {
    // 매장을 고르면: 그 매장들 판매 ÷ (판매 + 그 매장들 재고) — 물류는 매장별이 아니라 소진율에서 빼고 참고로만 보여줌
    const sel = pick.length ? pick : null;
    const base = !sel
      ? all
      : all.map((r) => {
          let st = 0, pe = 0;
          for (const c of sel) { const v = r.by?.[c]; if (v) { st += v[0]; pe += v[1]; } }
          const period = Math.max(0, pe);
          const d = period + st;
          return { ...r, storeStock: st, period, totalStock: st, rate: d > 0 ? period / d : null };
        }).filter((r) => r.rate !== null);
    const rows = base
      .filter((r) => !(r.category && off.category?.[r.category]) && !(r.year && off.year?.[r.year]) && !(r.season && off.season?.[r.season]))
      .filter((r) => !excludeNoStock || r.totalStock > 0)
      .sort((a, b) => (b.storeStock > 0 ? 1 : 0) - (a.storeStock > 0 ? 1 : 0) || a.rate - b.rate || b.totalStock - a.totalStock);
    const top = rows.slice(0, topN).map((r, i) => ({ rank: i + 1, ...r, ratePct: Math.round(r.rate * 1000) / 10 }));
    return { total: rows.length, top, avg: top.length ? top.reduce((a, r) => a + r.rate, 0) / top.length : 0, stock: top.reduce((a, r) => a + r.totalStock, 0) };
  }, [all, off, excludeNoStock, topN, pick]);
  const chips = (f: string, label: string) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-10 text-[11px] font-black text-slate-500">{label}</span>
      {vals(f).map((v) => (
        <button key={v} type="button" onClick={() => toggle(f, v)} className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${off[f]?.[v] ? "border-slate-200 text-slate-300 line-through" : "border-slate-300 bg-white text-slate-700"}`}>{v}</button>
      ))}
    </div>
  );
  return (
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">🐢 저소진 품번 랭킹</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">스타일 단위 소진율 = 기간판매 ÷ (기간판매 + 매장재고 + 물류 가용(오프)). 낮을수록 팔리는 속도에 비해 재고가 쌓인 품번 — 매장 재고가 있는 품번을 먼저 보여줘요. 매장은 출고·RT 설정의 22개 매장. 재고MD님 "저소진 품번 랭킹"과 같은 기준.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-xl border border-slate-300 px-2 text-xs font-bold">
            {[7, 14, 28, 56].map((d) => <option key={d} value={d}>최근 {d}일 판매</option>)}
          </select>
          <button type="button" onClick={go} disabled={R.running} className={runBtn}>{R.running ? `계산 중... ${R.sec}초` : "▶ 분석 실행"}</button>
        </div>
      </div>
      {R.err && <div className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{R.err}</div>}
      {res && (
        <>
          <div className="space-y-1.5 rounded-2xl bg-slate-50 p-3">
            {chips("category", "품목")}
            {chips("year", "년도")}
            {chips("season", "시즌")}
            {res.storeList && <StorePicker stores={res.storeList} value={pick} onChange={setPick} />}
            {pick.length > 0 && <p className="text-[11px] font-semibold text-amber-600">선택 매장 기준: 소진율 = 그 매장들 판매 ÷ (판매 + 그 매장들 재고). 물류 재고는 소진율에 안 넣고 참고로만 보여줘요.</p>}
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs font-bold text-slate-600">
              <label className="flex items-center gap-1"><input type="checkbox" checked={excludeNoStock} onChange={(e) => setExcludeNoStock(e.target.checked)} /> 재고 0인 품번 제외(이미 완판)</label>
              <label className="flex items-center gap-1">상위 <input type="number" value={topN} onChange={(e) => setTopN(Number(e.target.value) || 100)} className="h-7 w-16 rounded border border-slate-300 px-1" /> 위까지</label>
              <span className="text-[11px] font-semibold text-slate-400">판매 {res.period} · 매장 재고 PIP {res.inputs.pip} · 물류 가용 {res.inputs.warehouse}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["분석대상 품번", result.total], ["선택된 순위", result.top.length], ["평균 소진율(선택분)", `${(result.avg * 100).toFixed(1)}%`], ["선택분 재고합계", result.stock]].map(([l, v]) => (
              <div key={String(l)} className="rounded-2xl border border-slate-200 p-3"><p className="text-[11px] font-bold text-slate-500">{l}</p><p className="mt-1 text-base font-black">{fmt(v)}</p></div>
            ))}
          </div>
          <button type="button" className={dlBtn} onClick={() => saveXlsx([{ name: "저소진 랭킹", header: ["순위", "스타일", "스타일명", "품목", "년도", "시즌", "매장재고합계", "물류재고합계", "재고합계", "기간판매합계", "소진율(%)"], rows: result.top.map((r) => [r.rank, r.style, r.styleName, r.category, r.year, r.season, r.storeStock, r.whStock, r.totalStock, r.period, r.ratePct]) }], `저소진_품번_랭킹_${stamp()}.xlsx`)}>⬇ 엑셀</button>
          <Table
            cols={[["rank", "순위"], ["style", "스타일"], ["styleName", "스타일명"], ["category", "품목"], ["year", "년도"], ["season", "시즌"], ["storeStock", "매장재고"], ["whStock", "물류재고"], ["totalStock", "재고합계"], ["period", "기간판매"], ["ratePct", "소진율"]]}
            rows={result.top}
            render={(k, r) =>
              k === "ratePct" ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-16 rounded-full bg-slate-100"><span className="block h-1.5 rounded-full bg-rose-500" style={{ width: `${Math.min(100, r.ratePct)}%` }} /></span>
                  <span className="tabular-nums">{r.ratePct}%</span>
                </span>
              ) : undefined
            }
          />
        </>
      )}
    </section>
  );
}
