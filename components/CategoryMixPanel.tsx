"use client";

// MARK 2026-11-19: 상품탭 "구성비" — 품목(KNIT·OUTER·BOTTOM…) → 복종(CARDIGAN·PANTS…) → 아이템 단위로
// 판매·재고 비중을 봄. 데이터는 주간데이터(/api/weekly-product?mode=style, 품번 단위 캐시)를 그대로 묶어서 계산.
// 2026-11-19: 성별(여성·공용·남성 — MARK_PIP_ARCHIVE 상품정보 L열, /api/style-sex) 필터·맨 앞 단계 + 점포별 100% 막대(StoreMixChart).
import { Fragment, useEffect, useMemo, useState } from "react";
import StoreMixChart from "@/components/StoreMixChart";
import { parseStyleCode } from "@/lib/productCode";

type Row = any;
type Agg = {
  key: string; label: string; level: number; n: number;
  amt0: number; amt1: number; q: number[]; stock: number; wh: number; store: number;
  inQty: number; sold: number; stockCost: number; costSum: number; priceSum: number;
  children: Map<string, Agg>;
};
const newAgg = (key: string, label: string, level: number): Agg => ({
  key, label, level, n: 0, amt0: 0, amt1: 0, q: [0, 0, 0, 0], stock: 0, wh: 0, store: 0, inQty: 0, sold: 0, stockCost: 0, costSum: 0, priceSum: 0, children: new Map(),
});
const num = (v: number) => (Number.isFinite(v) && v ? Math.round(v).toLocaleString("ko-KR") : "");
const man = (v: number) => (Number.isFinite(v) && v ? `${Math.round(v / 10000).toLocaleString("ko-KR")}만` : "");
const pct = (v: number | null, d = 1) => (v === null || !Number.isFinite(v) ? "" : `${(v * 100).toFixed(d)}%`);
const md = (s: string) => (s ? `${Number(s.slice(5, 7))}.${s.slice(8, 10)}` : "");
function addDays(ymd: string, d: number) {
  const x = new Date(`${ymd}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}
const TH = "whitespace-nowrap border-b border-slate-200 px-2 py-1.5 text-right font-black";
const TD = "whitespace-nowrap px-2 py-1.5 text-right tabular-nums";

function Bar({ v, color }: { v: number; color: string }) {
  return (
    <div className="ml-auto h-1.5 w-16 rounded-full bg-slate-100">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, v * 100))}%` }} />
    </div>
  );
}

// 보관 시트 성별 값을 여성·공용·남성으로 맞춤(코드·이름 둘 다 대응)
function sexLabel(v: string) {
  const x = String(v || "").trim();
  if (!x) return "(미분류)";
  if (/^(여|W|F|L)/i.test(x)) return "여성";
  if (/^(남|M)/i.test(x)) return "남성";
  if (/^(공|U|C|유니)/i.test(x)) return "공용";
  return x;
}

export default function CategoryMixPanel() {
  const [week, setWeek] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({ year: "", season: "", sex: "", activeOnly: true, bySex: false });
  const [sexMap, setSexMap] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/style-sex").then((r) => r.json()).then((j) => j.ok && setSexMap(j.map || {})).catch(() => {});
  }, []);
  // 보관 시트 L열 → 없으면 품번 체계(신 4번째·구 5번째 글자 L/U/M)로
  const sexOf = (r: Row) =>
    sexLabel(sexMap[String(r.style || "").toUpperCase()] || sexMap[String(r.main || "").toUpperCase()] || parseStyleCode(r.style)?.gender || "");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const qs = new URLSearchParams({ mode: "style" });
    if (week) qs.set("week", week);
    fetch(`/api/weekly-product?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => alive && (j.ok ? setData(j) : setError(j.error || "불러오지 못했어요.")))
      .catch(() => alive && setError("불러오지 못했어요."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [week]);

  const rows: Row[] = data?.rows || [];
  const opts = useMemo(() => {
    const u = (k: string) => [...new Set(rows.map((r) => r[k]).filter(Boolean))].sort();
    return { year: u("year"), season: u("season"), sex: [...new Set(rows.map((r) => sexOf(r)))].sort() };
  }, [rows, sexMap]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!f.year || r.year === f.year) &&
          (!f.season || r.season === f.season) &&
          (!f.sex || sexOf(r) === f.sex) &&
          (!f.activeOnly || r.qty?.some((x: number) => x > 0) || r.totalStock > 0)
      ),
    [rows, f, sexMap]
  );
  const depth = f.bySex ? 4 : 3;
  const tree = useMemo(() => {
    const root = newAgg("", "합계", 0);
    for (const r of filtered) {
      const path = [...(f.bySex ? [sexOf(r)] : []), r.cat || "(미분류)", r.bok || "(미분류)", r.item || "(미분류)"];
      const nodes = [root];
      let cur = root;
      path.forEach((p, i) => {
        const k = path.slice(0, i + 1).join(">");
        let c = cur.children.get(k);
        if (!c) cur.children.set(k, (c = newAgg(k, p, i + 1)));
        nodes.push(c);
        cur = c;
      });
      for (const a of nodes) {
        a.n++;
        a.amt0 += r.amt?.[0] || 0;
        a.amt1 += r.amt?.[1] || 0;
        (r.qty || []).forEach((x: number, i: number) => (a.q[i] += x || 0));
        a.stock += r.totalStock || 0;
        a.wh += r.wh || 0;
        a.store += r.storeStockSum || 0;
        a.inQty += r.inQty || 0;
        a.sold += r.sold || 0;
        a.stockCost += (r.cost || 0) * Math.max(0, r.totalStock || 0);
        if (r.cost > 0 && r.price > 0) {
          a.costSum += r.cost;
          a.priceSum += r.price;
        }
      }
    }
    return root;
  }, [filtered, f.bySex, sexMap]);

  const flat: Agg[] = [];
  const walk = (a: Agg) => {
    const kids = [...a.children.values()].sort((x, y) => y.amt0 - x.amt0 || y.stock - x.stock);
    for (const c of kids) {
      flat.push(c);
      if (open[c.key]) walk(c);
    }
  };
  walk(tree);
  const T = tree;
  const q4 = (a: Agg) => a.q.reduce((s, x) => s + x, 0);
  const sel = "rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold";
  const weekStart = data?.weekStart || "";
  const allOpen = flat.length > 0 && [...T.children.values()].every((c) => open[c.key]);

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-400">CATEGORY MIX</p>
          <h2 className="text-2xl font-black tracking-tight">복종·아이템 구성비 {data ? `(${md(data.weekStart)}~${md(data.weekEnd)})` : ""}</h2>
          <p className="mt-1 text-xs text-slate-500">
            품목 → 복종 → 아이템 · 판매=오프라인 실판매(매장주문·온라인 제외) · 재고·입고·누적판매·원가=PIP{data?.stockDate ? `(재고 기준일 ${data.stockDate})` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={sel} value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })}>
            <option value="">년도 전체</option>
            {opts.year.map((v) => <option key={v}>{v}</option>)}
          </select>
          <select className={sel} value={f.season} onChange={(e) => setF({ ...f, season: e.target.value })}>
            <option value="">시즌 전체</option>
            {opts.season.map((v) => <option key={v}>{v}</option>)}
          </select>
          <select className={sel} value={f.sex} onChange={(e) => setF({ ...f, sex: e.target.value })}>
            <option value="">성별 전체</option>
            {opts.sex.map((v) => <option key={v}>{v}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs font-bold">
            <input type="checkbox" checked={f.bySex} onChange={(e) => { setF({ ...f, bySex: e.target.checked }); setOpen({}); }} /> 성별부터 나누기
          </label>
          <label className="flex items-center gap-1 text-xs font-bold">
            <input type="checkbox" checked={f.activeOnly} onChange={(e) => setF({ ...f, activeOnly: e.target.checked })} /> 판매·재고 있는 품번만
          </label>
          <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black" onClick={() => weekStart && setWeek(addDays(weekStart, -7))}>
            ◀ 전주
          </button>
          <input type="date" value={week || weekStart} onChange={(e) => e.target.value && setWeek(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold" />
          <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black" onClick={() => weekStart && setWeek(addDays(weekStart, 7))}>
            다음주 ▶
          </button>
        </div>
      </div>

      {loading && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">불러오는 중… (처음 계산하는 주는 1분 정도 걸려요)</div>}
      {error && <div className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>}

      {!loading && data && (
        <div className="max-h-[78vh] overflow-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
              <tr className="text-[10px]">
                <th className="px-2 py-1 text-left font-black" colSpan={2}>
                  <button
                    type="button"
                    className="rounded border border-slate-200 bg-white px-1.5 font-black"
                    onClick={() => {
                      const next: Record<string, boolean> = {};
                      if (!allOpen) for (const c of T.children.values()) next[c.key] = true;
                      setOpen(next);
                    }}
                  >
                    {allOpen ? "− 접기" : f.bySex ? "+ 성별 펼치기" : "+ 품목 펼치기"}
                  </button>
                </th>
                <th colSpan={5} className="border-l border-slate-200 px-1 font-black">판매금액</th>
                <th colSpan={3} className="border-l border-slate-200 px-1 font-black">판매수량</th>
                <th colSpan={6} className="border-l border-slate-200 px-1 font-black">재고</th>
                <th colSpan={3} className="border-l border-slate-200 px-1 font-black">라이프사이클·원가</th>
              </tr>
              <tr>
                <th className="px-2 py-1.5 text-left font-black">구분</th>
                <th className={TH}>품번</th>
                <th className={`${TH} border-l`}>주간</th>
                <th className={TH}>비중</th>
                <th className={TH} />
                <th className={TH}>2주전</th>
                <th className={TH}>증감</th>
                <th className={`${TH} border-l`}>주간</th>
                <th className={TH}>비중</th>
                <th className={TH} title="주간~4주전 합">4주합</th>
                <th className={`${TH} border-l`}>총재고</th>
                <th className={TH}>비중</th>
                <th className={TH} />
                <th className={TH}>물류</th>
                <th className={TH}>점포</th>
                <th className={TH} title="총재고 ÷ 최근 4주 평균 주간수량">재고주수</th>
                <th className={`${TH} border-l`} title="PIP 누적판매 ÷ 입고">판매율</th>
                <th className={TH} title="원가 × 총재고">재고원가</th>
                <th className={TH} title="원가 ÷ 판매가(품번 평균)">원가율</th>
              </tr>
              <tr className="bg-amber-50 text-slate-800">
                <td className="px-2 py-1.5 font-black">합계</td>
                <td className={TD}>{num(T.n)}</td>
                <td className={`${TD} border-l border-slate-200 font-black`}>{man(T.amt0)}</td>
                <td className={TD}>100%</td>
                <td />
                <td className={TD}>{man(T.amt1)}</td>
                <td className={TD}>{T.amt1 ? pct(T.amt0 / T.amt1 - 1) : ""}</td>
                <td className={`${TD} border-l border-slate-200 font-black`}>{num(T.q[0])}</td>
                <td className={TD}>100%</td>
                <td className={TD}>{num(q4(T))}</td>
                <td className={`${TD} border-l border-slate-200 font-black`}>{num(T.stock)}</td>
                <td className={TD}>100%</td>
                <td />
                <td className={TD}>{num(T.wh)}</td>
                <td className={TD}>{num(T.store)}</td>
                <td className={TD}>{q4(T) ? (T.stock / (q4(T) / 4)).toFixed(1) : ""}</td>
                <td className={`${TD} border-l border-slate-200`}>{T.inQty ? pct(T.sold / T.inQty, 0) : ""}</td>
                <td className={TD}>{man(T.stockCost)}</td>
                <td className={TD}>{T.priceSum ? pct(T.costSum / T.priceSum, 0) : ""}</td>
              </tr>
            </thead>
            <tbody>
              {flat.map((a) => {
                const has = a.children.size > 0 && a.level < depth;
                const diff = a.amt1 ? a.amt0 / a.amt1 - 1 : null;
                const sAmt = T.amt0 ? a.amt0 / T.amt0 : 0;
                const sStock = T.stock ? a.stock / T.stock : 0;
                const w4 = q4(a) / 4;
                return (
                  <tr key={a.key} className={`border-t border-slate-100 hover:bg-slate-50 ${a.level === 1 ? "bg-slate-50/60 font-black" : a.level === 2 ? "font-bold" : "text-slate-600"}`}>
                    <td className="whitespace-nowrap px-2 py-1.5" style={{ paddingLeft: 8 + (a.level - 1) * 18 }}>
                      {has ? (
                        <button type="button" className="mr-1 w-4 text-slate-400" onClick={() => setOpen({ ...open, [a.key]: !open[a.key] })}>
                          {open[a.key] ? "−" : "+"}
                        </button>
                      ) : (
                        <span className="mr-1 inline-block w-4" />
                      )}
                      {a.label}
                    </td>
                    <td className={TD}>{num(a.n)}</td>
                    <td className={`${TD} border-l border-slate-100`}>{man(a.amt0)}</td>
                    <td className={TD}>{pct(sAmt)}</td>
                    <td className="px-1"><Bar v={sAmt} color="bg-blue-500" /></td>
                    <td className={TD}>{man(a.amt1)}</td>
                    <td className={`${TD} ${diff === null ? "" : diff >= 0 ? "text-blue-600" : "text-rose-600"}`}>{diff === null ? "" : `${diff >= 0 ? "+" : ""}${pct(diff, 0)}`}</td>
                    <td className={`${TD} border-l border-slate-100`}>{num(a.q[0])}</td>
                    <td className={TD}>{T.q[0] ? pct(a.q[0] / T.q[0]) : ""}</td>
                    <td className={TD}>{num(q4(a))}</td>
                    <td className={`${TD} border-l border-slate-100`}>{num(a.stock)}</td>
                    <td className={TD}>{pct(sStock)}</td>
                    <td className="px-1"><Bar v={sStock} color={sStock > sAmt * 1.5 && sStock > 0.02 ? "bg-rose-400" : "bg-emerald-500"} /></td>
                    <td className={TD}>{num(a.wh)}</td>
                    <td className={TD}>{num(a.store)}</td>
                    <td className={TD}>{w4 > 0 ? (a.stock / w4).toFixed(1) : a.stock > 0 ? "판매없음" : ""}</td>
                    <td className={`${TD} border-l border-slate-100`}>{a.inQty ? pct(a.sold / a.inQty, 0) : ""}</td>
                    <td className={TD}>{man(a.stockCost)}</td>
                    <td className={TD}>{a.priceSum ? pct(a.costSum / a.priceSum, 0) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!loading && data && (
        <StoreMixChart
          rows={filtered}
          stores={data.stores || []}
          groupOf={{ cat: (r: Row) => r.cat || "(미분류)", sex: sexOf, bok: (r: Row) => r.bok || "(미분류)" }}
          dims={[["cat", "품목"], ["sex", "성별"], ["bok", "복종"]]}
        />
      )}
      {data && (
        <p className="text-[11px] text-slate-400">
          재고 비중 막대가 빨간색이면 판매 비중보다 재고 비중이 1.5배 넘게 큰 그룹(재고 과다 후보) · 재고원가는 원가 없는 품번(사은품 등) 제외 · 저장 {data.generatedAt}
        </p>
      )}
    </div>
  );
}
