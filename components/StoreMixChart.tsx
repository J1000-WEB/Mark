"use client";

// MARK 2026-11-19: 구성비 — 점포별 100% 막대(소천님 요청: 점포 하나씩 고르는 대신 23개 점포를 한 화면에서 비교).
// 데이터 = 주간데이터 품번 캐시 rows[].stores[i] = [그 매장 순위, 주간수량, 매장재고, 주간금액].
// 맨 위 "23개 점포 합"과 각 점포를 같은 색으로 나란히 → 어느 점포가 어떤 품목·성별 비중이 높은지 한눈에.
import { useMemo, useState } from "react";

const PALETTE = ["#2563eb", "#f97316", "#10b981", "#a855f7", "#ef4444", "#0ea5e9", "#eab308", "#ec4899", "#14b8a6", "#64748b", "#84cc16"];
type Metric = "amt" | "qty" | "stock";
const fmtVal = (m: Metric, v: number) => (m === "amt" ? `${Math.round(v / 10000).toLocaleString("ko-KR")}만` : `${Math.round(v).toLocaleString("ko-KR")}장`);

export default function StoreMixChart({ rows, stores, groupOf, dims }: {
  rows: any[];
  stores: { code: string; name: string; grade?: string; short?: string }[];
  groupOf: Record<string, (r: any) => string>;
  dims: [string, string][];
}) {
  const hasAmt = rows.some((r) => Array.isArray(r.stores) && r.stores.some((s: any) => s && s.length > 3));
  const [metric, setMetric] = useState<Metric>(hasAmt ? "amt" : "qty");
  const [dim, setDim] = useState(dims[0][0]);
  const [sortBy, setSortBy] = useState<string>("");
  const m: Metric = metric === "amt" && !hasAmt ? "qty" : metric;
  const idx = m === "amt" ? 3 : m === "qty" ? 1 : 2;

  const { cats, total, perStore } = useMemo(() => {
    const g = groupOf[dim];
    const per = stores.map(() => new Map<string, number>());
    const tot = new Map<string, number>();
    for (const r of rows) {
      const k = g(r) || "(미분류)";
      (r.stores || []).forEach((s: any, si: number) => {
        const v = Math.max(0, Number(s?.[idx] || 0));
        if (!v || !per[si]) return;
        per[si].set(k, (per[si].get(k) || 0) + v);
        tot.set(k, (tot.get(k) || 0) + v);
      });
    }
    // 색은 합계 큰 순 10개, 나머지는 기타
    const ordered = [...tot.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const main = ordered.slice(0, 10);
    const fold = (mp: Map<string, number>) => {
      const out = new Map<string, number>();
      for (const [k, v] of mp) {
        const kk = main.includes(k) ? k : "기타";
        out.set(kk, (out.get(kk) || 0) + v);
      }
      return out;
    };
    const cats = ordered.length > 10 ? [...main, "기타"] : main;
    return { cats, total: fold(tot), perStore: per.map(fold) };
  }, [rows, stores, dim, idx, groupOf]);

  const sumOf = (mp: Map<string, number>) => [...mp.values()].reduce((a, b) => a + b, 0);
  const color = (k: string) => (k === "기타" ? "#cbd5e1" : PALETTE[cats.indexOf(k) % PALETTE.length]);
  const share = (mp: Map<string, number>, k: string) => {
    const s = sumOf(mp);
    return s ? (mp.get(k) || 0) / s : 0;
  };
  const order = stores
    .map((s, i) => i)
    .filter((i) => sumOf(perStore[i]) > 0)
    .sort((a, b) => (sortBy ? share(perStore[b], sortBy) - share(perStore[a], sortBy) : 0));

  const btn = (on: boolean) => `rounded-full px-3 py-1 text-xs font-black ${on ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`;

  const Bar = ({ mp, label, sub, strong }: { mp: Map<string, number>; label: string; sub?: string; strong?: boolean }) => {
    const s = sumOf(mp);
    return (
      <div className="flex items-center gap-2">
        <div className={`w-28 shrink-0 truncate text-right text-xs ${strong ? "font-black text-slate-900" : "font-bold text-slate-600"}`} title={label}>
          {label}
          {sub && <span className="ml-1 text-[10px] font-semibold text-slate-400">{sub}</span>}
        </div>
        <div className="flex h-6 min-w-0 flex-1 overflow-hidden rounded-md bg-slate-100">
          {cats.map((k) => {
            const v = mp.get(k) || 0;
            const p = s ? v / s : 0;
            if (p <= 0) return null;
            return (
              <div
                key={k}
                title={`${label} · ${k} ${(p * 100).toFixed(1)}% (${fmtVal(m, v)})`}
                className={`flex items-center justify-center overflow-hidden text-[10px] font-black text-white ${sortBy && sortBy !== k ? "opacity-40" : ""}`}
                style={{ width: `${p * 100}%`, background: color(k) }}
              >
                {p >= 0.07 ? `${Math.round(p * 100)}%` : ""}
              </div>
            );
          })}
        </div>
        <div className="w-16 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-500">{fmtVal(m, s)}</div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-black text-slate-900">점포별 구성비</h3>
          <p className="text-[11px] font-semibold text-slate-500">같은 주·같은 필터 기준. 범례를 누르면 그 항목 비중이 높은 점포 순으로 정렬돼요(다시 누르면 원래 순서).</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {dims.map(([k, l]) => (
            <button key={k} type="button" className={btn(dim === k)} onClick={() => { setDim(k); setSortBy(""); }}>{l}</button>
          ))}
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <button type="button" className={btn(m === "amt")} disabled={!hasAmt} title={hasAmt ? "" : "이 주는 점포별 금액이 저장되기 전 계산분이라 수량·재고만 돼요"} onClick={() => setMetric("amt")}>판매금액</button>
          <button type="button" className={btn(m === "qty")} onClick={() => setMetric("qty")}>판매수량</button>
          <button type="button" className={btn(m === "stock")} onClick={() => setMetric("stock")}>매장재고</button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {cats.map((k) => (
          <button key={k} type="button" onClick={() => setSortBy(sortBy === k ? "" : k)} className={`flex items-center gap-1 text-[11px] font-bold ${sortBy === k ? "text-slate-900 underline" : "text-slate-600"}`}>
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color(k) }} />
            {k} <span className="font-semibold text-slate-400">{(share(total, k) * 100).toFixed(0)}%</span>
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        <Bar mp={total} label="23개 점포 합" strong />
        <div className="my-1 border-t border-dashed border-slate-200" />
        {order.map((i) => (
          <Bar key={stores[i].code} mp={perStore[i]} label={stores[i].name || stores[i].short || stores[i].code} sub={stores[i].grade} />
        ))}
      </div>
      {!hasAmt && <p className="mt-2 text-[11px] font-semibold text-amber-600">이 주는 점포별 판매금액 저장 전 계산분이라 금액 기준은 다음 계산(월요일 아침 자동)부터 볼 수 있어요.</p>}
    </div>
  );
}
