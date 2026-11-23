"use client";

// MARK 2026-11-23: 상품탭 구성비 — 52주 매출추이(소천님 요청).
// 품목·복종·아이템 중 골라 그룹별 주간 추이(최대 5개 겹쳐 보기), 고른 그룹의 TOP5(금액·수량), 주간 평균기온(서울),
// "8주 전년비" 버튼 = 최근 8주 vs 전년 같은 주(−364일). 년도(품번 년도) 필터. 데이터 = /api/weekly-trend(주마다 미리 계산·저장).
import { useEffect, useMemo, useState } from "react";
import ProductThumb from "@/components/ProductThumb";

const PALETTE = ["#2563eb", "#f97316", "#10b981", "#a855f7", "#ef4444"];
type Dim = 0 | 1 | 2; // info 인덱스: 품목, 복종, 아이템
const DIMS: [Dim, string][] = [[0, "품목"], [1, "복종"], [2, "아이템"]];
const ALL = "__ALL__";
const man = (v: number) => `${Math.round(v / 10000).toLocaleString("ko-KR")}만`;
const fmt = (metric: "amt" | "qty", v: number) => (metric === "amt" ? man(v) : `${Math.round(v).toLocaleString("ko-KR")}장`);
const md = (s: string) => (s ? `${Number(s.slice(5, 7))}.${s.slice(8, 10)}` : "");
function addDays(ymd: string, d: number) {
  const x = new Date(`${ymd}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}

export default function WeeklyTrendChart({ endWeek }: { endWeek?: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"52" | "ly">("52");
  const [metric, setMetric] = useState<"amt" | "qty">("amt");
  const [dim, setDim] = useState<Dim>(0);
  const [parent, setParent] = useState<string[]>(["", ""]); // 품목·복종 상위 필터
  const [sel, setSel] = useState<string[]>([ALL]);
  const [years, setYears] = useState<string[]>([]);
  const [pickWeek, setPickWeek] = useState(""); // TOP5 주(빈칸 = 마지막 주)
  const [topRange, setTopRange] = useState<"week" | "all">("week");
  const [hover, setHover] = useState<number | null>(null);

  // 계산 안 된 주(pending)가 있으면 이어서 다시 불러옴
  useEffect(() => {
    let alive = true;
    let tries = 0;
    const load = () => {
      setLoading(true);
      const qs = new URLSearchParams({ weeks: "52", ly: "8" });
      if (endWeek) qs.set("end", endWeek);
      fetch(`/api/weekly-trend?${qs}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          if (!j.ok) return setError(j.error || "불러오지 못했어요.");
          setError("");
          setData(j);
          if (j.pending?.length && tries++ < 15) load();
          else setLoading(false);
        })
        .catch(() => alive && (setError("불러오지 못했어요."), setLoading(false)));
    };
    load();
    return () => {
      alive = false;
    };
  }, [endWeek]);

  const info: string[][] = data?.info || [];
  const styles: string[] = data?.styles || [];
  const yearOpts = useMemo(() => [...new Set(info.map((x) => x[3]).filter(Boolean))].sort().reverse(), [info]);
  const styleOk = useMemo(() => {
    const ys = new Set(years);
    return info.map((x) => (!ys.size || ys.has(x[3])) && (!parent[0] || dim === 0 || x[0] === parent[0]) && (!parent[1] || dim < 2 || x[1] === parent[1]));
  }, [info, years, parent, dim]);
  const groupOfIdx = (i: number) => info[i]?.[dim] || "(미분류)";

  // 주 → 그룹 → [수량, 금액]
  const byWeek = useMemo(() => {
    const m = new Map<string, Map<string, [number, number]>>();
    for (const w of data?.data || []) {
      const g = new Map<string, [number, number]>();
      for (const [i, q, a] of w.rows as number[][]) {
        if (!styleOk[i]) continue;
        for (const k of [groupOfIdx(i), ALL]) {
          const v = g.get(k) || [0, 0];
          v[0] += q;
          v[1] += a;
          g.set(k, v);
        }
      }
      m.set(w.ws, g);
    }
    return m;
  }, [data, styleOk, dim]);
  const wInfo = useMemo(() => new Map<string, any>((data?.data || []).map((w: any) => [w.ws, w])), [data]);

  const weeks: string[] = mode === "52" ? data?.weeks || [] : (data?.weeks || []).slice(-8);
  const lyOf = (ws: string) => addDays(ws, -364);
  const mi = metric === "amt" ? 1 : 0;
  const val = (ws: string, g: string) => byWeek.get(ws)?.get(g)?.[mi] || 0;

  // 그룹 칩: 기간 합 큰 순
  const groups = useMemo(() => {
    const tot = new Map<string, number>();
    for (const ws of data?.weeks || []) for (const [k, v] of byWeek.get(ws) || []) if (k !== ALL) tot.set(k, (tot.get(k) || 0) + v[1]);
    return [...tot.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [byWeek, data]);
  const parentOpts = (lv: 0 | 1) =>
    [...new Set(info.filter((x) => lv === 0 || !parent[0] || x[0] === parent[0]).map((x) => x[lv]).filter(Boolean))].sort();
  const lines = sel.filter((g) => g === ALL || groups.includes(g)).slice(0, 5);
  const toggle = (g: string) =>
    setSel((cur) => {
      if (g === ALL) return [ALL];
      const base = cur.filter((x) => x !== ALL);
      const next = base.includes(g) ? base.filter((x) => x !== g) : [...base, g].slice(-5);
      return next.length ? next : [ALL];
    });
  const label = (g: string) => (g === ALL ? "전체" : g);

  // 차트 치수
  const W = 1000, H = 260, L = 56, R = 40, T = 14, B = 28;
  const series = lines.map((g) => weeks.map((ws) => val(ws, g)));
  const lySeries = mode === "ly" ? lines.map((g) => weeks.map((ws) => val(lyOf(ws), g))) : [];
  const maxV = Math.max(1, ...series.flat(), ...lySeries.flat());
  const temps = weeks.map((ws) => wInfo.get(ws)?.temp ?? null);
  const lyTemps = mode === "ly" ? weeks.map((ws) => wInfo.get(lyOf(ws))?.temp ?? null) : [];
  const tAll = [...temps, ...lyTemps].filter((x): x is number => x !== null);
  const tMin = tAll.length ? Math.floor(Math.min(...tAll) / 5) * 5 : 0, tMax = tAll.length ? Math.ceil(Math.max(...tAll) / 5) * 5 : 30;
  const x = (i: number) => L + (weeks.length <= 1 ? 0 : (i * (W - L - R)) / (weeks.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / maxV);
  const yt = (t: number) => T + (H - T - B) * (1 - (t - tMin) / Math.max(1, tMax - tMin));
  const path = (vs: (number | null)[], fy: (v: number) => number) =>
    vs.map((v, i) => (v === null ? "" : `${i && vs[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${fy(v).toFixed(1)}`)).join("");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => maxV * f);

  // TOP5
  const topWeek = pickWeek && weeks.includes(pickWeek) ? pickWeek : weeks[weeks.length - 1] || "";
  const topGroups = lines;
  const top = useMemo(() => {
    const ws = topRange === "week" ? [topWeek] : weeks;
    return topGroups.map((g) => {
      const m = new Map<number, [number, number]>();
      for (const w of ws) {
        const rows = wInfo.get(w)?.rows || [];
        for (const [i, q, a] of rows as number[][]) {
          if (!styleOk[i] || (g !== ALL && groupOfIdx(i) !== g)) continue;
          const v = m.get(i) || [0, 0];
          v[0] += q;
          v[1] += a;
          m.set(i, v);
        }
      }
      const arr = [...m.entries()];
      return {
        g,
        amt: [...arr].sort((a, b) => b[1][1] - a[1][1]).slice(0, 5),
        qty: [...arr].sort((a, b) => b[1][0] - a[1][0]).slice(0, 5),
      };
    });
  }, [topGroups.join("|"), topWeek, topRange, weeks.join("|"), styleOk, wInfo, dim]);

  const btn = (on: boolean) => `rounded-lg border px-2.5 py-1 text-xs font-black ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`;
  const pend = data?.pending?.length || 0;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-black text-slate-400">WEEKLY TREND</p>
          <h3 className="text-lg font-black">
            {mode === "52" ? "52주 매출추이" : "최근 8주 전년비"}{" "}
            {weeks.length > 0 && <span className="text-sm text-slate-500">({md(weeks[0])}~{md(addDays(weeks[weeks.length - 1], 6))})</span>}
          </h3>
          <p className="text-[11px] text-slate-500">
            오프라인 실판매(매장주문·온라인 제외, PIP 보관) · 기온 = 서울 주 평균((최고+최저)/2){mode === "ly" && " · 점선 = 전년 같은 주(−364일)"}
            {loading && ` · 불러오는 중${pend ? `(계산 남은 주 ${pend}개)` : "…"}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={btn(mode === "52")} onClick={() => setMode("52")}>52주</button>
          <button type="button" className={btn(mode === "ly")} onClick={() => setMode("ly")}>8주 · 전년비</button>
          <span className="mx-1 text-slate-300">|</span>
          <button type="button" className={btn(metric === "amt")} onClick={() => setMetric("amt")}>금액</button>
          <button type="button" className={btn(metric === "qty")} onClick={() => setMetric("qty")}>수량</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {DIMS.map(([d, n]) => (
          <button key={d} type="button" className={btn(dim === d)} onClick={() => { setDim(d); setSel([ALL]); if (d === 0) setParent(["", ""]); if (d === 1) setParent([parent[0], ""]); }}>
            {n}별
          </button>
        ))}
        {dim >= 1 && (
          <select className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-bold" value={parent[0]} onChange={(e) => { setParent([e.target.value, ""]); setSel([ALL]); }}>
            <option value="">품목 전체</option>
            {parentOpts(0).map((v) => <option key={v}>{v}</option>)}
          </select>
        )}
        {dim === 2 && (
          <select className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-bold" value={parent[1]} onChange={(e) => { setParent([parent[0], e.target.value]); setSel([ALL]); }}>
            <option value="">복종 전체</option>
            {parentOpts(1).map((v) => <option key={v}>{v}</option>)}
          </select>
        )}
        <div className="ml-2 flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 font-bold">
          <span className="text-slate-400">년도</span>
          {yearOpts.map((v) => (
            <label key={v} className="flex items-center gap-0.5">
              <input type="checkbox" checked={years.includes(v)} onChange={() => setYears(years.includes(v) ? years.filter((y) => y !== v) : [...years, v])} />
              {v}
            </label>
          ))}
          {years.length > 0 && <button type="button" className="ml-1 text-slate-400 underline" onClick={() => setYears([])}>전체</button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {[ALL, ...groups.slice(0, 24)].map((g) => {
          const i = lines.indexOf(g);
          return (
            <button
              key={g}
              type="button"
              onClick={() => toggle(g)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${i >= 0 ? "text-white" : "border-slate-200 bg-white text-slate-600"}`}
              style={i >= 0 ? { background: PALETTE[i], borderColor: PALETTE[i] } : undefined}
            >
              {label(g)}
            </button>
          );
        })}
        <span className="self-center text-[10px] text-slate-400">눌러서 최대 5개 겹쳐 보기</span>
      </div>

      {error && <div className="rounded-xl bg-rose-50 p-2 text-xs font-bold text-rose-700">{error}</div>}
      {!data && !error && <div className="p-8 text-center text-sm text-slate-400">불러오는 중… (처음엔 주마다 계산해서 저장하느라 몇 분 걸려요)</div>}

      {data && weeks.length > 0 && (
        <div className="relative w-full overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px]" onMouseLeave={() => setHover(null)}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth={1} />
                <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="#94a3b8">{metric === "amt" ? `${Math.round(v / 1e6).toLocaleString()}백` : Math.round(v).toLocaleString()}</text>
              </g>
            ))}
            {tAll.length > 0 && [tMin, (tMin + tMax) / 2, tMax].map((t) => (
              <text key={t} x={W - R + 6} y={yt(t) + 3} fontSize={10} fill="#f59e0b">{Math.round(t)}°</text>
            ))}
            {weeks.map((ws, i) =>
              mode === "ly" || i % 4 === 0 || i === weeks.length - 1 ? (
                <text key={ws} x={x(i)} y={H - 10} textAnchor="middle" fontSize={10} fill={ws === topWeek ? "#0f172a" : "#94a3b8"} fontWeight={ws === topWeek ? 900 : 400}>{md(ws)}</text>
              ) : null
            )}
            {/* 기온 */}
            <path d={path(temps, yt)} fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeOpacity={0.7} />
            {mode === "ly" && <path d={path(lyTemps, yt)} fill="none" stroke="#f59e0b" strokeWidth={1.2} strokeOpacity={0.5} strokeDasharray="4 3" />}
            {/* 전년 */}
            {lySeries.map((s, li) => <path key={`ly${li}`} d={path(s, y)} fill="none" stroke={PALETTE[li]} strokeWidth={1.8} strokeDasharray="5 4" strokeOpacity={0.6} />)}
            {series.map((s, li) => (
              <g key={li}>
                <path d={path(s, y)} fill="none" stroke={PALETTE[li]} strokeWidth={2.2} />
                {s.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={weeks[i] === topWeek ? 4 : 2.2} fill={PALETTE[li]} />)}
              </g>
            ))}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#94a3b8" strokeDasharray="3 3" />}
            {weeks.map((ws, i) => {
              const half = weeks.length > 1 ? (W - L - R) / (weeks.length - 1) / 2 : 20;
              return (
                <rect key={ws} x={x(i) - half} y={T} width={half * 2} height={H - T - B} fill="transparent" style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover(i)} onClick={() => { setPickWeek(ws); setTopRange("week"); }} />
              );
            })}
          </svg>
          {hover !== null && weeks[hover] && (
            <div className="pointer-events-none absolute top-2 rounded-lg border border-slate-200 bg-white/95 px-2 py-1 text-[11px] shadow" style={{ left: `${Math.min(80, (x(hover) / W) * 100)}%` }}>
              <div className="font-black">
                {md(weeks[hover])}~{md(addDays(weeks[hover], 6))}
                {temps[hover] !== null && <span className="ml-1 font-bold text-amber-600">{temps[hover]}°</span>}
                {mode === "ly" && lyTemps[hover] !== null && <span className="ml-1 text-amber-500">(전년 {lyTemps[hover]}°)</span>}
                {(wInfo.get(weeks[hover])?.days ?? 7) < 7 && <span className="ml-1 text-rose-500">보관 {wInfo.get(weeks[hover])?.days}/7일</span>}
              </div>
              {lines.map((g, li) => {
                const v = series[li][hover], lv = lySeries[li]?.[hover] || 0;
                return (
                  <div key={g} style={{ color: PALETTE[li] }} className="font-bold">
                    {label(g)} {fmt(metric, v)}
                    {mode === "ly" && <span className="text-slate-500"> · 전년 {fmt(metric, lv)}{lv ? ` (${v >= lv ? "+" : ""}${Math.round((v / lv - 1) * 100)}%)` : ""}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {data && mode === "ly" && weeks.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-slate-500">
              <tr>
                <th className="px-1 py-1 text-left font-black">구분</th>
                {weeks.map((ws) => <th key={ws} className="px-1 py-1 text-right font-black">{md(ws)}</th>)}
                <th className="px-1 py-1 text-right font-black">8주 합</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((g, li) => {
                const cur = series[li], lyv = lySeries[li];
                const sc = cur.reduce((a, b) => a + b, 0), sl = lyv.reduce((a, b) => a + b, 0);
                const cell = (c: number, l: number) => (l ? <span className={c >= l ? "text-blue-600" : "text-rose-600"}>{c >= l ? "+" : ""}{Math.round((c / l - 1) * 100)}%</span> : c ? "신규" : "");
                return (
                  <tr key={g} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-1 py-1 font-black" style={{ color: PALETTE[li] }}>{label(g)}</td>
                    {cur.map((c, i) => (
                      <td key={i} className="px-1 py-1 text-right tabular-nums" title={`올해 ${fmt(metric, c)} · 전년 ${fmt(metric, lyv[i])}`}>{cell(c, lyv[i])}</td>
                    ))}
                    <td className="px-1 py-1 text-right font-black tabular-nums" title={`올해 ${fmt(metric, sc)} · 전년 ${fmt(metric, sl)}`}>{cell(sc, sl)}</td>
                  </tr>
                );
              })}
              <tr className="border-t border-slate-100 text-amber-600">
                <td className="px-1 py-1 font-black">기온</td>
                {weeks.map((ws, i) => (
                  <td key={ws} className="px-1 py-1 text-right tabular-nums">
                    {temps[i] ?? "–"}°<span className="text-slate-400">/{lyTemps[i] ?? "–"}°</span>
                  </td>
                ))}
                <td className="px-1 py-1 text-right text-[10px] text-slate-400">올해/전년</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {data && weeks.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-black">TOP5</span>
            <button type="button" className={btn(topRange === "week")} onClick={() => setTopRange("week")}>
              {md(topWeek)}~{md(addDays(topWeek, 6))} 주
            </button>
            <button type="button" className={btn(topRange === "all")} onClick={() => setTopRange("all")}>{mode === "52" ? "52주" : "8주"} 전체</button>
            <span className="text-[10px] text-slate-400">그래프에서 주를 누르면 그 주 TOP5</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {top.map((t, li) => (
              <div key={t.g} className="rounded-xl border border-slate-200 p-2">
                <div className="mb-1 text-xs font-black" style={{ color: PALETTE[li] }}>{label(t.g)}</div>
                <div className="grid grid-cols-2 gap-2">
                  {(["amt", "qty"] as const).map((k) => (
                    <div key={k}>
                      <div className="mb-0.5 text-[10px] font-black text-slate-400">{k === "amt" ? "금액" : "수량"}</div>
                      {t[k].length === 0 && <div className="text-[11px] text-slate-400">판매 없음</div>}
                      {t[k].map(([i, v], n) => (
                        <div key={i} className="flex items-center gap-1.5 py-0.5 text-[11px]">
                          <span className="w-3 text-slate-400">{n + 1}</span>
                          <ProductThumb styleCode={styles[i]} size={28} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-bold" title={info[i]?.[5]}>{info[i]?.[5] || styles[i]}</div>
                            <div className="text-[10px] text-slate-400">{styles[i]}</div>
                          </div>
                          <span className="whitespace-nowrap font-black tabular-nums">{k === "amt" ? man(v[1]) : `${v[0].toLocaleString("ko-KR")}장`}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
