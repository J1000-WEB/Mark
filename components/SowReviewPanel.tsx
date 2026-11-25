"use client";

// MARK 2026-11-24: 상품탭 SOW(스페셜오퍼위크) 리뷰 — 팀 "행사실적 리뷰" PPT 2~4쪽 자동판.
// 점포별 일별 매출 vs 전주 동기간, 행사기간 판매 상품 추이(TOP10 일별 수량), 이월 상세(시즌별·품번칼라별 판매·할인율·소진율), 다음 행사 프리뷰.
import { useEffect, useMemo, useState } from "react";
import ProductThumb from "@/components/ProductThumb";

const won = (v: number) => (v ? Math.round(v).toLocaleString("ko-KR") : "-");
const man = (v: number) => (v ? `${Math.round(v / 10000).toLocaleString("ko-KR")}만` : "-");
const pct = (v: number | null | undefined, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? "-" : `${(v * 100).toFixed(d)}%`);
const md = (s: string) => (s ? `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}` : "");
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const diffPct = (a: number, b: number) => (b ? a / b - 1 : null);
function Delta({ a, b }: { a: number; b: number }) {
  const d = diffPct(a, b);
  if (d === null) return <span className="text-slate-300">-</span>;
  return <span className={d >= 0 ? "text-blue-600" : "text-rose-600"}>{d >= 0 ? "+" : ""}{Math.round(d * 100)}%</span>;
}

export default function SowReviewPanel() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ids, setIds] = useState<string[] | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [carryOpen, setCarryOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const qs = ids && ids.length ? `?ids=${ids.join(",")}` : "";
    fetch(`/api/sow${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => alive && (j.ok ? setData(j) : setError(/quota|429|rate/i.test(String(j.error || "")) ? "구글 시트 읽기 한도(1분당)에 잠깐 걸렸어요 — 1분쯤 뒤에 다시 눌러주세요." : j.error || "불러오지 못했어요.")))
      .catch(() => alive && setError("불러오지 못했어요."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [ids?.join(",")]);

  const evs: any[] = data?.events || [];
  const total = evs.reduce((a, e) => a + e.sum, 0);
  const prevTotal = evs.reduce((a, e) => a + e.prevSum, 0);
  const best = [...evs].sort((a, b) => b.sum - a.sum)[0];
  const carryAmt = evs.reduce((a, e) => a + e.carry.amt, 0);
  const prodAmt = evs.reduce((a, e) => a + e.products.totAmt, 0);
  const from = evs.map((e) => e.period.from).sort()[0] || "";
  const to = evs.map((e) => e.period.to).sort().pop() || "";
  const list: any[] = data?.list || [];
  const shown = new Set(evs.map((e) => e.event.id));
  // 2026-11-25: 고를 때마다 바로 불러오면 구글 시트 1분당 읽기 한도에 걸림 → 고른 뒤 "이대로 보기"로 한 번만
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const selected = draft || shown;
  const listByMonth = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const e of list) (m.get(e.start.slice(0, 7)) || m.set(e.start.slice(0, 7), []).get(e.start.slice(0, 7))!).push(e);
    return [...m.entries()].slice(0, 6);
  }, [list]);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-400">SPECIAL OFFER WEEK</p>
          <h2 className="text-2xl font-black tracking-tight">스페셜오퍼위크 행사 리뷰</h2>
          <p className="mt-1 text-xs text-slate-500">
            {from && `진행기간 ${md(from)} ~ ${md(to)} · 진행 점포 ${evs.length}개점 (${evs.filter((e) => e.period.done).length}개 종료)`} · 매출 = 매출탭(ERP 실제 금액) · 상품·이월 = PIP 보관(점포 채널) · 기준일 {data?.asOf}
          </p>
        </div>
        <button type="button" onClick={() => { setDraft(pickOpen ? null : new Set(shown)); setPickOpen(!pickOpen); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black">
          행사 고르기 {pickOpen ? "▲" : "▼"}
        </button>
      </div>

      {pickOpen && (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 text-xs">
          {listByMonth.map(([mon, xs]) => (
            <div key={mon} className="flex flex-wrap items-center gap-1.5">
              <span className="w-14 font-black text-slate-400">{mon.replace("-", ".")}</span>
              {xs.map((e) => (
                <label key={e.id} className={`flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 font-bold ${selected.has(e.id) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"}`}>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={selected.has(e.id)}
                    onChange={() => {
                      const cur = new Set(selected);
                      cur.has(e.id) ? cur.delete(e.id) : cur.add(e.id);
                      setDraft(cur);
                    }}
                  />
                  {e.store} {md(e.start)}~{md(e.end)}
                </label>
              ))}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              disabled={loading || !selected.size}
              className="rounded-xl bg-slate-900 px-3 py-1.5 font-black text-white disabled:opacity-40"
              onClick={() => { setIds([...selected]); setDraft(null); setPickOpen(false); }}
            >
              이대로 보기 ({selected.size}개)
            </button>
            <button type="button" className="text-slate-400 underline" onClick={() => { setIds(null); setDraft(null); setPickOpen(false); }}>최근 행사로</button>
          </div>
        </div>
      )}

      {loading && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">불러오는 중… (행사 기간 판매·재고를 모아서 30초쯤 걸려요)</div>}
      {error && <div className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>}

      {!loading && data && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Kpi label="총 판매금액(누적)" value={`${won(total)}원`} sub={<>전주 동기간 {man(prevTotal)} · <Delta a={total} b={prevTotal} /></>} color="border-orange-400" />
            <Kpi label="진행 점포 수" value={`${evs.length}개점`} sub={`종료 ${evs.filter((e) => e.period.done).length}개점`} color="border-blue-500" />
            <Kpi label="최고 매출 점포" value={best?.event.store || "-"} sub={best ? `${won(best.sum)}원 (누적)` : ""} color="border-emerald-500" />
            <Kpi label="이월 판매 비중" value={pct(prodAmt ? carryAmt / prodAmt : null)} sub={`이월 ${man(carryAmt)} / 행사점 판매 ${man(prodAmt)}`} color="border-violet-500" />
          </div>

          {/* 점포별 일별 매출 */}
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {evs.map((e) => (
              <div key={e.event.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between bg-slate-900 px-3 py-2 text-white">
                  <span className="font-black">{e.event.store}</span>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-black ${e.period.done ? "bg-emerald-600" : "bg-amber-500"}`}>{e.period.done ? "종료" : "진행중"}</span>
                </div>
                <p className="px-3 py-1.5 text-[11px] text-slate-500">
                  매대 {e.event.desks || "-"} · 행거 {e.event.hangers || "-"} | {md(e.event.start)}({DOW[new Date(e.event.start).getDay()]}) ~ {md(e.event.end)}({DOW[new Date(e.event.end).getDay()]})
                  {e.event.location && ` · ${e.event.location}`}
                  {!e.matched && <b className="ml-1 text-rose-600">매출탭 점포를 못 찾았어요</b>}
                </p>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-2 py-1 text-left">날짜</th>
                      <th className="px-1 py-1">요일</th>
                      <th className="px-2 py-1 text-right">판매금액</th>
                      <th className="px-2 py-1 text-right">전주 동요일</th>
                      <th className="px-2 py-1 text-right">증감</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.daily.map((d: any) => (
                      <tr key={d.date} className="border-t border-slate-100">
                        <td className={`px-2 py-1 ${d.dow === 0 || d.dow === 6 || d.holiday ? "text-rose-600" : ""}`}>{md(d.date)}</td>
                        <td className={`px-1 py-1 text-center ${d.dow === 0 || d.dow === 6 || d.holiday ? "text-rose-600" : ""}`}>{DOW[d.dow]}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{won(d.amt)}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-400">{won(d.prev)}</td>
                        <td className="px-2 py-1 text-right tabular-nums"><Delta a={d.amt} b={d.prev} /></td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-orange-200 bg-orange-50 font-black">
                      <td className="px-2 py-1 text-orange-700" colSpan={2}>합 계</td>
                      <td className="px-2 py-1 text-right tabular-nums text-orange-700">{won(e.sum)}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-slate-500">{won(e.prevSum)}</td>
                      <td className="px-2 py-1 text-right tabular-nums"><Delta a={e.sum} b={e.prevSum} /></td>
                    </tr>
                  </tbody>
                </table>
                {e.event.target > 0 && (
                  <p className="px-3 py-1.5 text-[11px] font-bold text-slate-600">
                    목표 {man(e.event.target)} · 달성 <b className={e.sum >= e.event.target ? "text-blue-600" : "text-rose-600"}>{pct(e.sum / e.event.target)}</b>
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* 판매 상품 추이 */}
          <h3 className="pt-2 text-lg font-black">행사기간 판매 상품 추이 <span className="text-xs font-bold text-slate-400">판매금액순 TOP10 · 재런칭 구+신 합산 · 칸 = 일별 판매수량</span></h3>
          <div className="grid gap-3 xl:grid-cols-2">
            {evs.map((e) => (
              <div key={e.event.id} className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3">
                <p className="mb-1 text-sm font-black">
                  {e.event.store} <span className="text-xs font-bold text-slate-500">행사기간 {won(e.products.totAmt)}원 · {e.products.totQty.toLocaleString("ko-KR")}장 · {e.products.styleCount}품번</span>
                </p>
                <table className="w-full text-[11px]">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="px-1 text-left">#</th>
                      <th className="px-1 text-left">상품</th>
                      {e.daily.map((d: any) => <th key={d.date} className={`px-1 text-right ${d.dow === 0 || d.dow === 6 ? "text-rose-500" : ""}`}>{md(d.date)}</th>)}
                      <th className="px-1 text-right">수량</th>
                      <th className="px-1 text-right">금액</th>
                      <th className="px-1 text-right">비중</th>
                      <th className="px-1 text-right" title="전주 같은 기간 수량">전주</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.products.top.map((p: any, i: number) => (
                      <tr key={p.style} className="border-t border-slate-100">
                        <td className="px-1 text-slate-400">{i + 1}</td>
                        <td className="px-1">
                          <div className="flex items-center gap-1.5">
                            <ProductThumb styleCode={p.style} size={26} />
                            <div className="min-w-0">
                              <div className="max-w-[160px] truncate font-bold" title={p.name}>{p.name || p.style}</div>
                              <div className="text-[10px] text-slate-400">{p.style}{p.carry && <b className="ml-1 rounded bg-violet-100 px-1 text-violet-700">이월</b>}</div>
                            </div>
                          </div>
                        </td>
                        {p.byDay.map((q: number, j: number) => {
                          const mx = Math.max(...p.byDay, 1);
                          return <td key={j} className="px-1 text-right tabular-nums" style={{ background: q ? `rgba(249,115,22,${0.08 + (0.45 * q) / mx})` : undefined }}>{q || ""}</td>;
                        })}
                        <td className="px-1 text-right font-black tabular-nums">{p.qty}</td>
                        <td className="px-1 text-right tabular-nums">{man(p.amt)}</td>
                        <td className="px-1 text-right tabular-nums">{pct(p.share, 1)}</td>
                        <td className="px-1 text-right tabular-nums text-slate-400">{p.pq || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* 이월 상세 */}
          <h3 className="pt-2 text-lg font-black">이월상품 리뷰 <span className="text-xs font-bold text-slate-400">이월 = 행사 시작일 기준 시즌이 지난 상품(품번체계) · 할인율 = 실판매가 ÷ 최초 소비자가 · 소진율 = 판매 ÷ (판매 + 행사 끝 재고)</span></h3>
          <div className="space-y-3">
            {evs.map((e) => (
              <div key={e.event.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-sm font-black">
                  {e.event.store}{" "}
                  <span className="text-xs font-bold text-slate-500">
                    이월 판매 {won(e.carry.amt)}원 · {e.carry.qty.toLocaleString("ko-KR")}장 · 비중 {pct(e.carry.share)} · 전주 동기간 {man(e.carry.prevAmt)} (<Delta a={e.carry.amt} b={e.carry.prevAmt} />)
                    {e.carry.stockDates?.start && ` · 재고 ${md(e.carry.stockDates.start)}→${md(e.carry.stockDates.end)}`}
                  </span>
                </p>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-2 py-1 text-left">시즌</th>
                      <th className="px-2 py-1 text-right">판매수량</th>
                      <th className="px-2 py-1 text-right">판매금액</th>
                      <th className="px-2 py-1 text-right">비중</th>
                      <th className="px-2 py-1 text-right">전주 금액</th>
                      <th className="px-2 py-1 text-right">할인율</th>
                      <th className="px-2 py-1 text-right">행사 전 재고</th>
                      <th className="px-2 py-1 text-right">행사 끝 재고</th>
                      <th className="px-2 py-1 text-right">소진율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.carry.groups.map((g: any) => (
                      <tr key={g.label} className={`border-t border-slate-100 ${g.label.startsWith("신상") ? "text-slate-400" : ""}`}>
                        <td className="px-2 py-1 font-bold">{g.label}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{g.qty.toLocaleString("ko-KR")}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{won(g.amt)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{pct(e.products.totAmt ? g.amt / e.products.totAmt : null, 1)}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-400">{won(g.pa)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{pct(g.discount)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{g.startStock.toLocaleString("ko-KR")}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{g.endStock.toLocaleString("ko-KR")}</td>
                        <td className="px-2 py-1 text-right font-black tabular-nums">{pct(g.sellThru)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button type="button" className="mt-2 text-xs font-black text-slate-500 underline" onClick={() => setCarryOpen({ ...carryOpen, [e.event.id]: !carryOpen[e.event.id] })}>
                  {carryOpen[e.event.id] ? "▲ 이월 품번·칼라 접기" : `▼ 이월 품번·칼라 ${e.carry.rows.length}개 보기`}
                </button>
                {carryOpen[e.event.id] && (
                  <div className="mt-2 max-h-[60vh] overflow-auto">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-white text-slate-500">
                        <tr>
                          <th className="px-1 text-left">상품</th>
                          <th className="px-1 text-left">칼라</th>
                          <th className="px-1 text-left">시즌</th>
                          <th className="px-1 text-right">판매</th>
                          <th className="px-1 text-right">금액</th>
                          <th className="px-1 text-right">평균 판매가</th>
                          <th className="px-1 text-right">할인율</th>
                          <th className="px-1 text-right">전주</th>
                          <th className="px-1 text-right">전 재고</th>
                          <th className="px-1 text-right">끝 재고</th>
                          <th className="px-1 text-right">소진율</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.carry.rows.map((r: any) => (
                          <tr key={`${r.style}|${r.color}`} className={`border-t border-slate-100 ${!r.qty ? "text-slate-400" : ""}`}>
                            <td className="px-1">
                              <div className="flex items-center gap-1.5">
                                <ProductThumb styleCode={r.style} size={24} />
                                <div className="min-w-0">
                                  <div className="max-w-[180px] truncate font-bold" title={r.name}>{r.name || r.style}</div>
                                  <div className="text-[10px] text-slate-400">{r.style}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-1">{r.color}{r.colorName ? ` ${r.colorName}` : ""}</td>
                            <td className="px-1">{r.season}</td>
                            <td className="px-1 text-right font-black tabular-nums">{r.qty || "-"}</td>
                            <td className="px-1 text-right tabular-nums">{man(r.amt)}</td>
                            <td className="px-1 text-right tabular-nums">{r.avgPrice ? won(r.avgPrice) : "-"}</td>
                            <td className="px-1 text-right tabular-nums">{pct(r.discount)}</td>
                            <td className="px-1 text-right tabular-nums text-slate-400">{r.pq || "-"}</td>
                            <td className="px-1 text-right tabular-nums">{r.startStock ?? "-"}</td>
                            <td className="px-1 text-right tabular-nums">{r.endStock ?? "-"}</td>
                            <td className="px-1 text-right tabular-nums">{pct(r.sellThru)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 다음 행사 프리뷰 */}
          {data.upcoming?.length > 0 && (
            <>
              <h3 className="pt-2 text-lg font-black">진행 예정 행사 <span className="text-xs font-bold text-slate-400">재고 투입 계획은 재고CTRL → SOW 계획</span></h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {data.upcoming.map((u: any, i: number) => (
                  <div key={u.id} className={`rounded-2xl border-t-4 bg-white p-3 shadow-sm ${i % 2 ? "border-blue-500" : "border-orange-400"}`}>
                    <p className="font-black">{u.store}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {u.location && `위치 ${u.location} · `}기간 {md(u.start)}({DOW[new Date(u.start).getDay()]}) ~ {md(u.end)}({DOW[new Date(u.end).getDay()]})
                      <br />규모 매대 {u.desks || "-"} · 행거 {u.hangers || "-"}{u.status && ` · ${u.status}`}
                    </p>
                    <p className="mt-2 text-[11px] text-slate-400">매출 목표</p>
                    <p className="text-lg font-black">{u.target ? `${won(u.target)}원` : "-"}</p>
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="text-[11px] text-slate-400">
            ※ 일별 매출은 매출탭(매출_일별_스냅샷) 점포 금액이라 세부일정 R열 실적과 같은 기준이에요. 상품·이월은 PIP 보관(판매_일별) 그 점포 채널 기준이라 합계가 조금 다를 수 있어요.
            {evs.some((e) => e.period.missingDates.length) && ` 보관에 없는 날짜: ${[...new Set(evs.flatMap((e) => e.period.missingDates))].join(", ")}`} · 계산 {Math.round((data.ms || 0) / 1000)}초
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: any; sub?: any; color: string }) {
  return (
    <div className={`rounded-2xl border border-l-4 border-slate-200 bg-white px-4 py-3 ${color}`}>
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-black">{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}
