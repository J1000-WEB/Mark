"use client";

// MARK 2026-11-17: 매출탭 안 리포트 3종(일별 매출달성 / 연간실적 / 연간실적(점포)) — 팀 시트 "📊 매출 통합 대시보드 2026 (NEW)"의
// 같은 이름 시트를 매출탭 데이터로 자동 계산해서 보여줌. 데이터: /api/sales-reports (lib/salesReports.ts). 금액은 매출탭과 같이 천원 단위.
import { Fragment, useEffect, useMemo, useState } from "react";

export type ReportTab = "daily" | "annual" | "annualStores";

const won = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "-" : Math.round(n / 1000).toLocaleString("ko-KR"));
const pct0 = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "-" : `${(n * 100).toFixed(0)}%`);
const growth = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "-" : `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`);
const gColor = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "text-slate-400" : n >= 0 ? "text-blue-600" : "text-rose-600");
const achColor = (n: number | null | undefined) => (n === null || n === undefined ? "text-slate-400" : n >= 1 ? "text-blue-600" : n >= 0.9 ? "text-amber-600" : "text-rose-600");
const shortName = (s: string) => String(s || "").replace(/^오프라인_/, "");

const TH = "whitespace-nowrap px-2 py-2 text-right font-black";
const TD = "whitespace-nowrap px-2 py-1.5 text-right tabular-nums";

function useReport(url: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    fetch(url, { cache: "no-store" })
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
  }, [url, nonce]);
  return { data, loading, error, reload: () => setNonce((n) => n + 1) };
}

// 커서를 올리면(모바일은 탭하면) 뜨는 작은 상세 창
function HoverDetail({ label, tone, children }: { label: string; tone: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onClick={() => setOpen((v) => !v)}>
      <span className={`cursor-pointer rounded-lg px-2 py-0.5 text-[11px] font-black ${tone}`}>{label}</span>
      {open && (
        <span className="absolute right-0 top-full z-40 mt-1 block min-w-[240px] rounded-xl border border-slate-200 bg-white p-2 text-left text-[11px] font-semibold text-slate-700 shadow-xl">
          {children}
        </span>
      )}
    </span>
  );
}

// 금액차이(실적 − 비교금액), 천원 · +는 파랑, −는 빨강
function DiffCell({ a, b }: { a: number | null; b: number | null }) {
  if (a === null || a === undefined || b === null || b === undefined || !b) return <td className={`${TD} text-slate-300`}>-</td>;
  const diff = a - b;
  return <td className={`${TD} font-bold ${diff >= 0 ? "text-blue-600" : "text-rose-600"}`}>{`${diff >= 0 ? "+" : ""}${won(diff)}`}</td>;
}

function SokCell({ list, date, label }: { list: any[]; date: string; label: string }) {
  if (!list?.length) return null;
  return (
    <HoverDetail label={`${label} ${list.length}`} tone="bg-violet-100 text-violet-700">
      <span className="mb-1 block font-black text-slate-500">스페셜오퍼위크 · {date.slice(2).replace(/-/g, ".")} 실적</span>
      {list.map((o: any, i: number) => (
        <span key={i} className="flex justify-between gap-3 py-0.5">
          <span>
            {shortName(o.store)} <span className="text-slate-400">({o.period})</span>
          </span>
          <span className="font-black tabular-nums">{o.amount === null ? "-" : won(o.amount)}</span>
        </span>
      ))}
    </HoverDetail>
  );
}

function SpikeCell({ list, date, label }: { list: any[]; date: string; label: string }) {
  if (!list?.length) return null;
  return (
    <HoverDetail label={`${label} ${list.length}`} tone="bg-emerald-100 text-emerald-700">
      <span className="mb-1 block font-black text-slate-500">{date.slice(2).replace(/-/g, ".")} 평소보다 높은 점포 · 실적 / 평소(8주 같은 요일)</span>
      {list.map((x: any, i: number) => (
        <span key={i} className="flex justify-between gap-3 py-0.5">
          <span>{shortName(x.store)}</span>
          <span className="tabular-nums">
            <b>{won(x.amount)}</b> / {won(x.usual)} <span className="font-black text-emerald-600">×{x.ratio}</span>
          </span>
        </span>
      ))}
    </HoverDetail>
  );
}

// ========================= 일별 매출달성 =========================
function DailyView() {
  const thisMonth = new Date(Date.now() + 9 * 3600 * 1000 - 86400000).toISOString().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  // 전년비·전주비 옆 금액차이 — 점포별 탭처럼 버튼으로 접었다 폈다(기본 접힘)
  const [showDiff, setShowDiff] = useState(false);
  const { data, loading, error } = useReport(`/api/sales-reports?type=daily&month=${month}`);
  const days: any[] = data?.days || [];
  const last = [...days].reverse().find((d) => d.actual !== null);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-sm font-bold" />
        <button
          type="button"
          onClick={() => setShowDiff((v) => !v)}
          className={`rounded-xl px-3 py-1.5 text-xs font-black ${showDiff ? "bg-amber-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
        >
          금액차이 {showDiff ? "숨기기 ▲" : "보기 ▼"}
        </button>
        {data && (
          <p className="text-xs font-bold text-slate-500">
            월 목표 {won(data.monthTarget)} · 평일 {data.weekdays}일 / 주말·공휴일 {data.weekendOrHoliday}일
            {last && ` · ${last.date.slice(5)}까지 누적 ${won(last.cumActual)} (달성 ${pct0(last.cumAchievement)}, 전년비 ${growth(last.cumYoy)})`}
          </p>
        )}
      </div>
      <p className="text-[11px] font-semibold text-slate-400">
        금액 천원 · 전년 = 52주 전 같은 요일(전년 스오크·특이매출도 그 날짜) · 전주비 = 7일 전 대비 · <b>스오크</b>=그날 스페셜오퍼위크 진행 점포(올리면 점포별 그날 실적) ·{" "}
        <b>특이매출</b>=그 점포 최근 8주 같은 요일 평균의 {data?.spikeRule?.ratio || 1.5}배 이상 + {won(data?.spikeRule?.minDiff || 3000000)} 이상 더 나온 점포
      </p>
      {loading && <p className="text-sm font-bold text-slate-400">불러오는 중...</p>}
      {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
      {!loading && days.length > 0 && (
        <div className="max-h-[calc(100vh-200px)] overflow-auto rounded-2xl border border-slate-200 bg-white">
          <table className={`w-full border-collapse text-xs ${showDiff ? "min-w-[2000px]" : "min-w-[1750px]"}`}>
            <thead className="sticky top-0 z-20 bg-slate-900 text-white">
              <tr>
                <th className="whitespace-nowrap px-2 py-2 text-left font-black">일자</th>
                <th className={TH}>기온</th>
                <th className={TH}>전년기온</th>
                <th className={TH}>기온차</th>
                <th className={TH}>목표</th>
                <th className={TH}>실적</th>
                <th className={TH}>달성</th>
                <th className={TH}>전년</th>
                <th className={TH}>전년비</th>
                <th className={TH} title="그날·전년 같은 요일 둘 다 매출이 있는 점포끼리만">전년비(동매장)</th>
                {showDiff && <th className={`${TH} text-amber-200`}>전년차이</th>}
                <th className={TH}>전주비</th>
                {showDiff && <th className={`${TH} text-amber-200`}>전주차이</th>}
                <th className={`${TH} border-l border-slate-700`}>누적실적</th>
                <th className={TH}>누적달성</th>
                <th className={TH}>누적전년</th>
                <th className={TH}>누적전년비</th>
                <th className={TH}>누적(동매장)</th>
                {showDiff && <th className={`${TH} text-amber-200`}>누적전년차이</th>}
                <th className="whitespace-nowrap border-l border-slate-700 px-2 py-2 text-center font-black">스오크</th>
                <th className="whitespace-nowrap px-2 py-2 text-center font-black">특이매출</th>
                <th className="whitespace-nowrap border-l-2 border-slate-600 px-2 py-2 text-center font-black text-slate-300">전년 스오크</th>
                <th className="whitespace-nowrap px-2 py-2 text-center font-black text-slate-300">전년 특이매출</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const weekend = d.dow === "토" || d.dow === "일" || d.holiday;
                const future = d.actual === null;
                return (
                  <tr key={d.date} className={`border-t border-slate-100 ${weekend ? "bg-rose-50/40" : ""} ${future ? "text-slate-300" : ""}`}>
                    <td className={`whitespace-nowrap px-2 py-1.5 font-black ${d.dow === "일" || d.holiday ? "text-rose-600" : d.dow === "토" ? "text-blue-600" : "text-slate-800"}`}>
                      {Number(d.date.slice(5, 7))}/{Number(d.date.slice(8))} ({d.dow}){d.holiday ? " 휴" : ""}
                    </td>
                    <td className={`${TD} text-slate-500`}>{d.maxTemp !== null ? `${Math.round(d.maxTemp)}°/${Math.round(d.minTemp)}°` : "-"}</td>
                    <td className={`${TD} text-slate-400`}>{d.prevMaxTemp != null ? `${Math.round(d.prevMaxTemp)}°/${Math.round(d.prevMinTemp)}°` : "-"}</td>
                    <td className={`${TD} font-bold ${d.tempDiff == null ? "text-slate-300" : d.tempDiff >= 0 ? "text-rose-500" : "text-blue-500"}`}>{d.tempDiff == null ? "-" : `${d.tempDiff > 0 ? "+" : ""}${d.tempDiff.toFixed(1)}°`}</td>
                    <td className={TD}>{won(d.target)}</td>
                    <td className={`${TD} font-black`}>{won(d.actual)}</td>
                    <td className={`${TD} font-bold ${achColor(d.achievement)}`}>{pct0(d.achievement)}</td>
                    <td className={`${TD} text-slate-500`}>{won(d.prevYear)}</td>
                    <td className={`${TD} font-bold ${gColor(d.yoy)}`}>{growth(d.yoy)}</td>
                    <td className={`${TD} ${gColor(d.likeYoy)}`} title={d.likeStores ? `동매장 ${d.likeStores}곳` : ""}>{growth(d.likeYoy)}</td>
                    {showDiff && <DiffCell a={d.actual} b={d.prevYear} />}
                    <td className={`${TD} ${gColor(d.wow)}`}>{growth(d.wow)}</td>
                    {showDiff && <DiffCell a={d.actual} b={d.lastWeek} />}
                    <td className={`${TD} border-l border-slate-100 font-bold`}>{won(d.cumActual)}</td>
                    <td className={`${TD} font-bold ${achColor(d.cumAchievement)}`}>{pct0(d.cumAchievement)}</td>
                    <td className={`${TD} text-slate-500`}>{won(d.cumPrevYear)}</td>
                    <td className={`${TD} font-bold ${gColor(d.cumYoy)}`}>{growth(d.cumYoy)}</td>
                    <td className={`${TD} ${gColor(d.cumLikeYoy)}`}>{growth(d.cumLikeYoy)}</td>
                    {showDiff && <DiffCell a={d.cumActual} b={d.cumPrevYear} />}
                    <td className="whitespace-nowrap border-l border-slate-100 px-2 py-1 text-center">
                      <SokCell list={d.specialOffers} date={d.date} label="스오크" />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-center">
                      <SpikeCell list={d.spikes} date={d.date} label="특이" />
                    </td>
                    <td className="whitespace-nowrap border-l-2 border-slate-200 bg-slate-50/60 px-2 py-1 text-center">
                      <SokCell list={d.prevYearSpecialOffers} date={d.prevYearDate} label="스오크" />
                    </td>
                    <td className="whitespace-nowrap bg-slate-50/60 px-2 py-1 text-center">
                      <SpikeCell list={d.prevYearSpikes} date={d.prevYearDate} label="특이" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ========================= 연간실적 =========================
const PERIODS: { label: string; months: number[]; border?: boolean }[] = [
  ...Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1}월`, months: [i] })),
  { label: "1분기", months: [0, 1, 2], border: true },
  { label: "2분기", months: [3, 4, 5] },
  { label: "3분기", months: [6, 7, 8] },
  { label: "4분기", months: [9, 10, 11] },
  { label: "상반기", months: [0, 1, 2, 3, 4, 5], border: true },
  { label: "하반기", months: [6, 7, 8, 9, 10, 11] },
  { label: "합계", months: Array.from({ length: 12 }, (_, i) => i), border: true },
];
const sumOf = (arr: (number | null)[], months: number[]) => {
  const xs = months.map((i) => arr[i]).filter((v) => v !== null && v !== undefined) as number[];
  return xs.length ? xs.reduce((a, b) => a + b, 0) : null;
};

function AnnualView() {
  const thisYear = Number(new Date(Date.now() + 9 * 3600 * 1000 - 86400000).toISOString().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const { data, loading, error, reload } = useReport(`/api/sales-reports?type=annual&year=${year}`);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [obOpen, setObOpen] = useState(false); // 오프라인 형태별(로드샵·백화점…) 펼치기
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const teams: any[] = data?.teams || [];
  const offlineGroups: any[] = data?.offlineGroups || [];
  const editable: Record<string, string[]> = { OB: ["target"], EGI: ["target", "actual", "prevYear"], GP: ["target", "actual", "prevYear"] };
  useEffect(() => {
    if (!teams.length) return;
    const d: Record<string, string[]> = {};
    for (const t of teams) for (const item of editable[t.key] || []) d[`${t.key}|${item}`] = (t[item] as (number | null)[]).map((v) => (v === null ? "" : String(v)));
    setDraft(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const totals = useMemo(() => {
    if (!teams.length) return null;
    const add = (item: string) => Array.from({ length: 12 }, (_, i) => {
      const xs = teams.map((t) => t[item][i]).filter((v: any) => v !== null && v !== undefined);
      return xs.length ? xs.reduce((a: number, b: number) => a + b, 0) : null;
    });
    return { key: "ALL", label: "GENERAL IDEA (합계)", target: add("target"), actual: add("actual"), prevYear: add("prevYear") };
  }, [teams]);

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const values = Object.entries(draft).map(([k, months]) => {
        const [team, item] = k.split("|");
        return { team, item, months: months.map((v) => (v.trim() === "" ? null : Number(v.replace(/,/g, "")))) };
      });
      const r = await fetch("/api/sales-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year, values }) }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error || "저장 실패");
      setMsg("저장했어요.");
      setEditing(false);
      reload();
    } catch (e: any) {
      setMsg(e?.message || "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  const block = (t: any, isTotal = false, sub = false) => {
    const rowsDef: { item: string; label: string }[] = [
      { item: "target", label: "목표" },
      { item: "actual", label: t.key === "GP" ? "실적(NMV)" : "실적" },
      { item: "ach", label: "달성" },
      { item: "prevYear", label: "전년" },
      { item: "growth", label: "신장" },
    ];
    const shown = sub && !openGroups.has(t.key) ? rowsDef.filter((r) => r.item === "actual") : rowsDef;
    return shown.map((r, ri) => (
      <tr key={`${t.key}-${r.item}`} className={`${ri === 0 ? (sub ? "border-t border-slate-200" : "border-t-2 border-slate-300") : "border-t border-slate-100"} ${isTotal ? "bg-amber-50/60" : sub ? "bg-sky-50/40" : ""}`}>
        {ri === 0 && (
          <td rowSpan={sub && !openGroups.has(t.key) ? 1 : 5} className={`sticky left-0 z-10 whitespace-nowrap border-r border-slate-200 px-3 py-1.5 font-black ${isTotal ? "bg-amber-50" : sub ? "bg-sky-50 pl-6 text-slate-700" : "bg-white"}`}>
            {t.key === "OB" && (
              <button type="button" onClick={() => setObOpen((v) => !v)} className="mr-1 h-5 w-5 rounded border border-slate-300 text-xs leading-none text-slate-600">
                {obOpen ? "−" : "+"}
              </button>
            )}
            {sub && (
              <button
                type="button"
                onClick={() => setOpenGroups((s) => { const n = new Set(s); n.has(t.key) ? n.delete(t.key) : n.add(t.key); return n; })}
                className="mr-1 h-5 w-5 rounded border border-slate-300 text-xs leading-none text-slate-500"
              >
                {openGroups.has(t.key) ? "−" : "+"}
              </button>
            )}
            {t.label}
            {t.key === "OB" && <span className="block text-[10px] font-bold text-slate-400">실적·전년 자동 · + 형태별</span>}
            {sub && <span className="block text-[10px] font-bold text-slate-400">목표=매출탭 점포 목표 합</span>}
            {(t.key === "EGI" || t.key === "GP") && <span className="block text-[10px] font-bold text-slate-400">직접 입력</span>}
          </td>
        )}
        <td className="whitespace-nowrap px-2 py-1.5 text-center font-bold text-slate-500">{r.label}</td>
        {PERIODS.map((p) => {
          const single = p.months.length === 1 ? p.months[0] : -1;
          const canEdit = editing && single >= 0 && !isTotal && (editable[t.key] || []).includes(r.item);
          if (canEdit) {
            const k = `${t.key}|${r.item}`;
            return (
              <td key={p.label} className="px-1 py-0.5">
                <input
                  value={draft[k]?.[single] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: (d[k] || Array(12).fill("")).map((v, i) => (i === single ? e.target.value : v)) }))}
                  className="w-24 rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-right text-[11px] tabular-nums"
                  placeholder="원 단위"
                />
              </td>
            );
          }
          const tgt = sumOf(t.target, p.months), act = sumOf(t.actual, p.months), prev = sumOf(t.prevYear, p.months);
          // 달성·신장은 실적이 있는 달끼리만 비교
          const actMonths = p.months.filter((i) => t.actual[i] !== null && t.actual[i] !== undefined);
          const tgtSame = sumOf(t.target, actMonths), prevSame = sumOf(t.prevYear, actMonths);
          let v: string = "-", cls = "";
          if (r.item === "target") v = won(tgt);
          else if (r.item === "actual") { v = won(act); cls = "font-black"; }
          else if (r.item === "prevYear") { v = won(prev); cls = "text-slate-500"; }
          else if (r.item === "ach") { const a = act !== null && tgtSame ? act / tgtSame : null; v = pct0(a); cls = `font-bold ${achColor(a)}`; }
          else if (r.item === "growth") { const g = act !== null && prevSame ? act / prevSame - 1 : null; v = growth(g); cls = `font-bold ${gColor(g)}`; }
          return (
            <td key={p.label} className={`${TD} ${p.border ? "border-l border-slate-200" : ""} ${cls}`}>
              {v}
            </td>
          );
        })}
      </tr>
    ));
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-slate-200 px-2 py-1 text-sm font-bold">
          {[thisYear + 1, thisYear, thisYear - 1].map((y) => (
            <option key={y} value={y}>{y}년</option>
          ))}
        </select>
        {!editing ? (
          <button type="button" onClick={() => setEditing(true)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600">
            목표·온라인·글로벌 입력하기
          </button>
        ) : (
          <>
            <button type="button" onClick={save} disabled={saving} className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
              {saving ? "저장 중..." : "저장"}
            </button>
            <button type="button" onClick={() => { setEditing(false); reload(); }} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-500">
              취소
            </button>
          </>
        )}
        {msg && <span className="text-xs font-bold text-slate-500">{msg}</span>}
      </div>
      <p className="text-[11px] font-semibold text-slate-400">
        금액 천원(입력은 원 단위) · 오프라인 실적·전년은 매출탭 데이터로 자동(어제까지) · 오프라인 목표와 온라인·글로벌은 입력값(처음엔 팀 시트 "연간실적" 숫자) · 달성·신장은 실적이 있는 달끼리 비교 · 진행 중인 달의 오프라인 전년은 작년 같은 날짜까지
      </p>
      {loading && <p className="text-sm font-bold text-slate-400">불러오는 중...</p>}
      {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
      {!loading && teams.length > 0 && (
        <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1900px] border-collapse text-xs">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-900 px-3 py-2 text-left font-black">팀</th>
                <th className="px-2 py-2 font-black">구분</th>
                {PERIODS.map((p) => (
                  <th key={p.label} className={`${TH} ${p.border ? "border-l border-slate-700" : ""}`}>{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {totals && block(totals, true)}
              {teams.map((t) => (
                <Fragment key={t.key}>
                  {block(t)}
                  {t.key === "OB" && obOpen && offlineGroups.map((g) => <Fragment key={g.key}>{block(g, false, true)}</Fragment>)}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ========================= 연간실적(점포) =========================
const GROUP_ORDER = ["로드샵", "백화점", "쇼핑몰", "아울렛", "위탁(오프)"];

function AnnualStoresView() {
  const thisYear = Number(new Date(Date.now() + 9 * 3600 * 1000 - 86400000).toISOString().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const { data, loading, error } = useReport(`/api/sales-reports?type=annualStores&year=${year}`);
  const elapsed: number = data?.monthsElapsed || 0;
  const months = Array.from({ length: Math.max(elapsed, 1) }, (_, i) => i);

  const stores: any[] = useMemo(() => {
    const list = [...(data?.stores || [])];
    const rank = (g: string) => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? 99 : i; };
    list.sort((a, b) => rank(a.channelGroup) - rank(b.channelGroup) || String(a.channelCode).localeCompare(String(b.channelCode), "ko", { numeric: true }));
    return list;
  }, [data]);

  const sum = (arr: number[], ms: number[]) => ms.reduce((t, i) => t + (arr[i] || 0), 0);
  const ytd = (s: any) => ({ act: sum(s.actual, months), prev: sum(s.prevYear, months) });
  // 동일매장: 그 달 전년 매출이 있었던 점포끼리만 합친 신장
  const sameStore = (ms: number[]) => {
    let a = 0, p = 0;
    for (const s of stores) for (const i of ms) if (s.prevYear[i] > 0 && s.actual[i] > 0) { a += s.actual[i]; p += s.prevYear[i]; }
    return p ? a / p - 1 : null;
  };
  const sumRows = (list: any[]) => ({
    actual: Array.from({ length: 12 }, (_, i) => list.reduce((t, s) => t + (s.actual[i] || 0), 0)),
    prevYear: Array.from({ length: 12 }, (_, i) => list.reduce((t, s) => t + (s.prevYear[i] || 0), 0)),
  });
  const totalRow = sumRows(stores);
  // 형태(로드샵·백화점…)별 소계 + 접기/펼치기(매출탭 점포별과 같은 방식)
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const st of stores) {
      const g = st.channelGroup || "기타";
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(st);
    }
    return [...m.entries()];
  }, [stores]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const allCollapsed = groups.length > 0 && groups.every(([g]) => collapsed.has(g));

  const cells = (s: any, bold = false) => {
    const y = ytd(s);
    const g = y.prev ? y.act / y.prev - 1 : null;
    return (
      <>
        <td className={`${TD} border-l border-slate-200 ${bold ? "font-black" : "font-bold"}`}>{won(y.act)}</td>
        <td className={`${TD} text-slate-500`}>{won(y.prev)}</td>
        <td className={`${TD} font-bold ${gColor(g)}`}>{y.prev ? growth(g) : y.act ? "신규" : "-"}</td>
        <td className={TD}>{won(elapsed ? y.act / elapsed : 0)}</td>
        {months.map((i) => {
          const gm = s.prevYear[i] ? s.actual[i] / s.prevYear[i] - 1 : null;
          return (
            <Fragment key={i}>
              <td className={`${TD} border-l border-slate-200 ${bold ? "font-black" : ""}`}>{won(s.actual[i])}</td>
              <td className={`${TD} text-slate-500`}>{won(s.prevYear[i])}</td>
              <td className={`${TD} ${gColor(gm)}`}>{s.prevYear[i] ? growth(gm) : s.actual[i] ? "신규" : "-"}</td>
            </Fragment>
          );
        })}
      </>
    );
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-slate-200 px-2 py-1 text-sm font-bold">
          {[thisYear, thisYear - 1].map((y) => (
            <option key={y} value={y}>{y}년</option>
          ))}
        </select>
        {data && (
          <p className="text-xs font-bold text-slate-500">
            년누계 1~{elapsed}월(어제 {data.asOf}까지) · 동일매장 신장(전년에도 매출 있던 점포만) <span className={gColor(sameStore(months))}>{growth(sameStore(months))}</span>
          </p>
        )}
      </div>
      <p className="text-[11px] font-semibold text-slate-400">금액 천원 · 전년 = 작년 같은 달(달력 기준, 진행 중인 달은 작년 같은 날짜까지) · 매출탭과 같은 점포 목록</p>
      {loading && <p className="text-sm font-bold text-slate-400">불러오는 중...</p>}
      {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
      {!loading && stores.length > 0 && (
        <div className="max-h-[calc(100vh-200px)] overflow-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-xs" style={{ minWidth: 620 + months.length * 260 }}>
            <thead className="sticky top-0 z-20 bg-slate-900 text-white">
              <tr>
                <th rowSpan={2} className="sticky left-0 z-30 bg-slate-900 px-2 py-2 font-black">NO</th>
                <th rowSpan={2} className="sticky left-[34px] z-30 bg-slate-900 px-2 py-2 text-left font-black">점포명</th>
                <th colSpan={4} className="border-l border-slate-700 px-2 py-1 font-black">년누계 (1~{elapsed}월)</th>
                {months.map((i) => (
                  <th key={i} colSpan={3} className="border-l border-slate-700 px-2 py-1 font-black">{i + 1}월</th>
                ))}
              </tr>
              <tr className="bg-slate-800">
                <th className={`${TH} border-l border-slate-700`}>실적</th>
                <th className={TH}>전년</th>
                <th className={TH}>신장</th>
                <th className={TH}>월평균</th>
                {months.map((i) => (
                  <Fragment key={i}>
                    <th className={`${TH} border-l border-slate-700`}>실적</th>
                    <th className={TH}>전년</th>
                    <th className={TH}>신장</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-200 bg-amber-50/80">
                <td className="sticky left-0 z-10 bg-amber-50 px-1 py-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map(([g]) => g)))}
                    className="h-5 w-5 rounded border border-amber-300 bg-white text-xs leading-none text-amber-700"
                  >
                    {allCollapsed ? "+" : "−"}
                  </button>
                </td>
                <td className="sticky left-[34px] z-10 bg-amber-50 px-2 py-1.5 font-black">합계 ({stores.filter((s) => sum(s.actual, months) > 0).length}개)</td>
                {cells(totalRow, true)}
              </tr>
              {(() => {
                let no = 0;
                return groups.map(([g, list]) => (
                  <Fragment key={g}>
                    <tr className="border-t border-slate-200 bg-sky-50/70">
                      <td className="sticky left-0 z-10 bg-sky-50 px-1 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => setCollapsed((c) => { const n = new Set(c); n.has(g) ? n.delete(g) : n.add(g); return n; })}
                          className="h-5 w-5 rounded border border-slate-300 bg-white text-xs leading-none text-slate-600"
                        >
                          {collapsed.has(g) ? "+" : "−"}
                        </button>
                      </td>
                      <td className="sticky left-[34px] z-10 whitespace-nowrap bg-sky-50 px-2 py-1.5 font-black text-sky-900">
                        {g} 소계 ({list.length}개)
                      </td>
                      {cells(sumRows(list), true)}
                    </tr>
                    {!collapsed.has(g) &&
                      list.map((s: any) => {
                        no += 1;
                        return (
                          <tr key={s.storeName} className={`border-t border-slate-100 ${no % 2 ? "bg-white" : "bg-slate-50/60"}`}>
                            <td className="sticky left-0 z-10 bg-inherit px-2 py-1.5 text-center text-slate-400">{no}</td>
                            <td className="sticky left-[34px] z-10 whitespace-nowrap bg-inherit px-2 py-1.5 font-black text-slate-900">{shortName(s.storeName)}</td>
                            {cells(s)}
                          </tr>
                        );
                      })}
                  </Fragment>
                ));
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SalesReportsPanel({ tab }: { tab: ReportTab }) {
  if (tab === "daily") return <DailyView />;
  if (tab === "annual") return <AnnualView />;
  return <AnnualStoresView />;
}
