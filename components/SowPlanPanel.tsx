"use client";

// MARK 2026-11-24: 재고CTRL "SOW 계획" — 스페셜오퍼위크 재고 투입 추천(소천님 기준).
// 매출 예측 = 그 점포 행사 전 8주 같은 요일 평균 × 과거 SOW 증가율(같은 점포 행사가 있으면 그 점포 쪽으로 가중) → 투입 목표 = 예측(또는 목표) × 2배.
// 매대 1대 20 바코드 · 행거 1대 8 바코드(아우터는 행거, 나머지 매대), 바코드당 5장(창고 가용(오프)이 적으면 있는 만큼), 계절 맞는 이월만.
// 순위 = 최근 120일 SOW 행사 기간 판매(전 점포) → 최근 28일 오프라인 판매 → 창고 가용. 결과는 출고업로드 엑셀로.
import { useEffect, useMemo, useState } from "react";
import ProductThumb from "@/components/ProductThumb";

const won = (v: number) => (v ? Math.round(v).toLocaleString("ko-KR") : "-");
const man = (v: number) => (v ? `${Math.round(v / 10000).toLocaleString("ko-KR")}만` : "-");
const md = (s: string) => (s ? `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}` : "");
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export default function SowPlanPanel() {
  const [events, setEvents] = useState<any[]>([]);
  const [id, setId] = useState("");
  const [opt, setOpt] = useState({ basis: "forecast", ratio: 2, perSku: 5, deskSku: 20, hangerSku: 8, desks: "", hangers: "" });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showLift, setShowLift] = useState(false);

  useEffect(() => {
    fetch("/api/sow?list=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return setError(j.error || "행사 목록을 못 불러왔어요.");
        const today = kstToday();
        const evs = j.events as any[];
        setEvents(evs);
        const next = evs.filter((e) => e.end >= today).sort((a, b) => (a.start < b.start ? -1 : 1))[0];
        if (next) setId(next.id);
      })
      .catch(() => setError("행사 목록을 못 불러왔어요."));
  }, []);

  const run = () => {
    if (!id) return;
    setLoading(true);
    setError("");
    const qs = new URLSearchParams({ plan: id, basis: opt.basis, ratio: String(opt.ratio), perSku: String(opt.perSku), deskSku: String(opt.deskSku), hangerSku: String(opt.hangerSku) });
    if (opt.desks !== "") qs.set("desks", opt.desks);
    if (opt.hangers !== "") qs.set("hangers", opt.hangers);
    fetch(`/api/sow?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.ok ? setData(j) : setError(j.error || "계산하지 못했어요.")))
      .catch(() => setError("계산하지 못했어요."))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (id) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const today = kstToday();
  const upcoming = events.filter((e) => e.end >= today).sort((a, b) => (a.start < b.start ? -1 : 1));
  const pastEv = events.filter((e) => e.end < today).slice(0, 20);
  const ev = data?.event;
  const bySlot = useMemo(() => {
    const p: any[] = data?.picked || [];
    return { hanger: p.filter((x) => x.slot === "hanger"), desk: p.filter((x) => x.slot === "desk") };
  }, [data]);

  const download = async () => {
    if (!data) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const up = [["채널", "바코드", "출고차수", "의뢰수량", "대분류", "비고"], ...data.upload.map((r: any) => [r.채널, r.바코드, r.출고차수, r.의뢰수량, r.대분류, r.비고])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(up), "출고업로드");
    const det = [["구분", "품번", "품명", "칼라", "칼라명", "품목", "복종", "시즌", "사이즈", "바코드", "투입수량", "창고가용(오프)", "매장재고", "판매가", "투입금액", "과거SOW판매(품번칼라)", "최근28일판매(품번칼라)"]];
    for (const p of data.picked) for (const k of p.skus) det.push([p.slot === "hanger" ? "행거" : "매대", p.style, p.name, p.color, p.colorName, p.cat, p.bok, p.season, k.size, k.barcode, k.qty, k.avail, k.storeStock, k.price, k.qty * k.price, p.sowQty, p.recentQty]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(det), "투입상세");
    const fc = [["날짜", "요일", "기준선(8주 같은요일 평균)", "예측"], ...data.forecast.days.map((d: any) => [d.date, DOW[d.dow], Math.round(d.base), Math.round(d.forecast)])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fc), "매출예측");
    XLSX.writeFile(wb, `SOW계획_${ev.store}_${ev.start}.xlsx`);
  };

  const inp = "w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold";
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500">스페셜오퍼위크 행사</p>
            <select className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black" value={id} onChange={(e) => setId(e.target.value)}>
              <optgroup label="진행 예정·진행중">
                {upcoming.map((e) => <option key={e.id} value={e.id}>{e.store} {md(e.start)}~{md(e.end)} {e.status && `(${e.status})`}</option>)}
              </optgroup>
              <optgroup label="지난 행사(시험용)">
                {pastEv.map((e) => <option key={e.id} value={e.id}>{e.store} {md(e.start)}~{md(e.end)}</option>)}
              </optgroup>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="text-slate-400">투입 기준</span>
            {(["forecast", "target"] as const).map((b) => (
              <button key={b} type="button" onClick={() => setOpt({ ...opt, basis: b })} className={`rounded-lg border px-2 py-1 ${opt.basis === b ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>
                {b === "forecast" ? "매출 예측" : "매출 목표"}
              </button>
            ))}
            × <input className={inp} type="number" step="0.1" value={opt.ratio} onChange={(e) => setOpt({ ...opt, ratio: Number(e.target.value) })} />배
            <span className="ml-2 text-slate-400">매대</span>
            <input className={inp} placeholder={ev ? String(ev.desks) : ""} value={opt.desks} onChange={(e) => setOpt({ ...opt, desks: e.target.value })} />대 ×
            <input className={inp} type="number" value={opt.deskSku} onChange={(e) => setOpt({ ...opt, deskSku: Number(e.target.value) })} />
            <span className="text-slate-400">행거</span>
            <input className={inp} placeholder={ev ? String(ev.hangers) : ""} value={opt.hangers} onChange={(e) => setOpt({ ...opt, hangers: e.target.value })} />대 ×
            <input className={inp} type="number" value={opt.hangerSku} onChange={(e) => setOpt({ ...opt, hangerSku: Number(e.target.value) })} />바코드
            <span className="text-slate-400">바코드당</span>
            <input className={inp} type="number" value={opt.perSku} onChange={(e) => setOpt({ ...opt, perSku: Number(e.target.value) })} />장
          </div>
          <button type="button" onClick={run} disabled={loading || !id} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white disabled:opacity-40">
            {loading ? "계산 중…" : "계획 계산"}
          </button>
          {data && (
            <button type="button" onClick={download} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black">⬇ 출고업로드 엑셀</button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          매대 1대 = {opt.deskSku} 바코드, 행거 1대 = {opt.hangerSku} 바코드(아우터는 행거, 나머지는 매대), 바코드당 {opt.perSku}장(창고 가용이 적으면 있는 만큼) · 계절 맞는 이월만(ACC·기타·SHOES·SWIM 제외) ·
          순위 = 최근 120일 SOW 행사 판매 → 최근 28일 오프라인 판매 → 창고 가용
        </p>
      </div>

      {error && <div className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>}
      {loading && !data && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">계산 중… (과거 행사 판매를 모아서 30초쯤 걸려요)</div>}

      {data && ev && (
        <>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xl font-black">{ev.store}</p>
              <p className="text-xs text-slate-500">
                {ev.location && `위치 ${ev.location} · `}기간 {md(ev.start)}({DOW[new Date(ev.start).getDay()]}) ~ {md(ev.end)}({DOW[new Date(ev.end).getDay()]}) {ev.days}일 · 규모 매대 {data.capacity.desks} · 행거 {data.capacity.hangers}
                {!data.store && <b className="ml-1 text-rose-600">매출탭 점포를 못 찾았어요(채널코드 없음)</b>}
              </p>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-5">
              <Box label="매출 예측" value={`${won(data.forecast.amount)}원`} sub={`평상시 ${man(data.forecast.baseSum)} × 증가율 ${data.forecast.lift.toFixed(2)}배`} tone="text-slate-900" />
              <Box label="매출 목표" value={ev.target ? `${won(ev.target)}원` : "-"} sub={ev.target && data.forecast.amount ? `예측 ÷ 목표 ${Math.round((data.forecast.amount / ev.target) * 100)}%` : ""} tone="text-slate-900" />
              <Box label={`투입 목표 (${data.basis === "target" ? "목표" : "예측"} × ${data.ratio}배)`} value={`${won(data.goalAmt)}원`} sub="판매가 기준" tone="text-orange-600" />
              <Box label="계획 투입" value={`${won(data.plan.amt)}원`} sub={`${data.plan.qty.toLocaleString("ko-KR")}장 · ${data.plan.styles}품번칼라 · 예측 대비 ${Math.round(data.plan.ratioToForecast * 100)}%${ev.target ? ` · 목표 대비 ${Math.round(data.plan.ratioToTarget * 100)}%` : ""}`} tone="text-blue-600" />
              <Box label="진열 사용" value={`매대 ${data.capacity.usedDesk}/${data.capacity.desk} · 행거 ${data.capacity.usedHanger}/${data.capacity.hanger}`} sub="바코드 수(사용/칸)" tone="text-slate-900" />
            </div>
            {data.plan.amt < data.goalAmt * 0.95 && (
              <p className="mt-2 text-xs font-bold text-rose-600">
                ⚠ 진열 칸(또는 계절 맞는 이월 창고 재고)이 모자라 투입 목표의 {Math.round((data.plan.amt / Math.max(1, data.goalAmt)) * 100)}%까지만 채웠어요 — 매대·행거를 늘리거나 배수를 조정해 보세요.
              </p>
            )}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="px-2 py-1 text-left">매출 예측</th>
                    {data.forecast.days.map((d: any) => <th key={d.date} className={`px-2 py-1 text-right ${d.dow === 0 || d.dow === 6 ? "text-rose-500" : ""}`}>{md(d.date)}({DOW[d.dow]})</th>)}
                    <th className="px-2 py-1 text-right">합계</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100 text-slate-500">
                    <td className="px-2 py-1">평상시(8주 같은 요일 평균)</td>
                    {data.forecast.days.map((d: any) => <td key={d.date} className="px-2 py-1 text-right tabular-nums">{man(d.base)}</td>)}
                    <td className="px-2 py-1 text-right tabular-nums">{man(data.forecast.baseSum)}</td>
                  </tr>
                  <tr className="border-t border-slate-100 font-black">
                    <td className="px-2 py-1">예측(× {data.forecast.lift.toFixed(2)})</td>
                    {data.forecast.days.map((d: any) => <td key={d.date} className="px-2 py-1 text-right tabular-nums">{man(d.forecast)}</td>)}
                    <td className="px-2 py-1 text-right tabular-nums">{man(data.forecast.amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button type="button" onClick={() => setShowLift(!showLift)} className="mt-2 text-xs font-black text-slate-500 underline">
              {showLift ? "▲ 증가율 근거 접기" : `▼ 증가율 근거 보기 (과거 행사 ${data.forecast.lifts.length}개 · 전체 중앙값 ${data.forecast.liftAll.toFixed(2)}배${data.forecast.sameStoreLifts.length ? ` · 같은 점포 ${data.forecast.sameStoreLifts.length}개` : ""})`}
            </button>
            {showLift && (
              <table className="mt-2 w-full text-[11px]">
                <thead className="text-slate-500">
                  <tr><th className="px-2 text-left">행사</th><th className="px-2 text-right">실적</th><th className="px-2 text-right">평상시</th><th className="px-2 text-right">증가율</th></tr>
                </thead>
                <tbody>
                  {data.forecast.lifts.map((l: any) => (
                    <tr key={l.id} className={`border-t border-slate-100 ${l.same ? "bg-amber-50 font-bold" : ""}`}>
                      <td className="px-2">{l.store} {md(l.start)}~{md(l.end)}</td>
                      <td className="px-2 text-right tabular-nums">{man(l.actual)}</td>
                      <td className="px-2 text-right tabular-nums">{man(l.base)}</td>
                      <td className="px-2 text-right tabular-nums">{l.lift.toFixed(2)}배</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {(["hanger", "desk"] as const).map((slot) => (
            <div key={slot} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-2 text-sm font-black">
                {slot === "hanger" ? "🧥 행거" : "🧶 매대"} — {bySlot[slot].length}품번칼라 · 바코드 {slot === "hanger" ? data.capacity.usedHanger : data.capacity.usedDesk}/{slot === "hanger" ? data.capacity.hanger : data.capacity.desk} ·{" "}
                {bySlot[slot].reduce((a: number, p: any) => a + p.qty, 0).toLocaleString("ko-KR")}장 · {won(bySlot[slot].reduce((a: number, p: any) => a + p.amt, 0))}원
              </p>
              {bySlot[slot].length === 0 ? (
                <p className="text-xs text-slate-400">{(slot === "hanger" ? data.capacity.hanger : data.capacity.desk) ? "넣을 수 있는 계절 맞는 이월 재고가 없어요." : "이 행사엔 칸이 없어요."}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="px-1 text-left">#</th>
                        <th className="px-1 text-left">상품</th>
                        <th className="px-1 text-left">칼라</th>
                        <th className="px-1 text-left">시즌·복종</th>
                        <th className="px-1 text-left">사이즈별 투입(창고 가용)</th>
                        <th className="px-1 text-right">투입</th>
                        <th className="px-1 text-right">금액</th>
                        <th className="px-1 text-right" title="최근 120일 SOW 행사 기간 판매(전 점포)">SOW판매</th>
                        <th className="px-1 text-right" title="최근 28일 오프라인 판매">28일판매</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bySlot[slot].map((p: any, i: number) => (
                        <tr key={`${p.style}|${p.color}`} className="border-t border-slate-100">
                          <td className="px-1 text-slate-400">{i + 1}</td>
                          <td className="px-1">
                            <div className="flex items-center gap-1.5">
                              <ProductThumb styleCode={p.style} size={28} />
                              <div className="min-w-0">
                                <div className="max-w-[180px] truncate font-bold" title={p.name}>{p.name || p.style}</div>
                                <div className="text-[10px] text-slate-400">{p.style}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-1">{p.color}{p.colorName ? ` ${p.colorName}` : ""}</td>
                          <td className="px-1">{p.season} · {p.bok || p.cat}</td>
                          <td className="px-1">
                            <div className="flex flex-wrap gap-1">
                              {p.skus.map((k: any) => (
                                <span key={k.size} className={`rounded border px-1 ${k.qty < data.capacity.perSku ? "border-amber-300 bg-amber-50" : "border-slate-200"}`} title={`바코드 ${k.barcode} · 매장재고 ${k.storeStock}`}>
                                  {k.size} <b>{k.qty}</b><span className="text-slate-400">({k.avail})</span>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-1 text-right font-black tabular-nums">{p.qty}</td>
                          <td className="px-1 text-right tabular-nums">{man(p.amt)}</td>
                          <td className="px-1 text-right tabular-nums">{p.sowQty || "-"}</td>
                          <td className="px-1 text-right tabular-nums">{p.recentQty || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          <p className="text-[11px] text-slate-400">
            창고 가용 {data.inputs.warehouse} · 매장 재고 {data.inputs.storeStock} · 계절 맞는 이월 후보 {data.candidates}품번칼라 · 최근 120일 SOW {data.inputs.sowHistoryEvents}건 참고 · 계산 {Math.round(data.ms / 1000)}초
          </p>
        </>
      )}
    </div>
  );
}

function Box({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className={`text-lg font-black ${tone}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}
