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
  const [opt, setOpt] = useState({ basis: "forecast", ratio: 1.75, perSku: 5, deskSku: 20, hangerSku: 8, desks: "", hangers: "", shipRound: "1", layout: "sku", tol: 20 });
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

  const run = (over?: Partial<typeof opt>) => {
    const o = { ...opt, ...(over || {}) };
    if (over) setOpt(o);
    if (!id) return;
    setLoading(true);
    setError("");
    const qs = new URLSearchParams({ plan: id, basis: o.basis, ratio: String(o.ratio), perSku: String(o.perSku), deskSku: String(o.deskSku), hangerSku: String(o.hangerSku), layout: o.layout, tol: String(o.tol) });
    if (o.desks !== "") qs.set("desks", o.desks);
    if (o.hangers !== "") qs.set("hangers", o.hangers);
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
    const up = [["채널", "바코드", "출고차수", "의뢰수량", "대분류", "비고"], ...data.upload.map((r: any) => [r.채널, r.바코드, opt.shipRound || r.출고차수, r.의뢰수량, r.대분류, r.비고])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(up), "출고업로드");
    const det = [["구분", "품번", "품명", "칼라", "칼라명", "품목", "복종", "시즌", "사이즈", "바코드", "투입수량", "기초", "추가", "창고가용(오프)", "매장재고", "판매가", "투입금액", "과거SOW판매(품번칼라)", "최근28일판매(품번칼라)"]];
    for (const p of data.picked) for (const k of p.skus) det.push([p.slot === "hanger" ? "행거" : "매대", p.style, p.name, p.color, p.colorName, p.cat, p.bok, p.season, k.size, k.barcode, k.qty, k.baseQty, k.qty - k.baseQty, k.avail, k.storeStock, k.price, k.qty * k.price, p.sowQty, p.recentQty]);
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
            × <input className={inp} type="number" step="0.05" value={opt.ratio} onChange={(e) => setOpt({ ...opt, ratio: Number(e.target.value) })} />배
            <span className="ml-2 text-slate-400">매대</span>
            <input className={inp} placeholder={ev ? String(ev.desks) : ""} value={opt.desks} onChange={(e) => setOpt({ ...opt, desks: e.target.value })} />대 ×
            <input className={inp} type="number" value={opt.deskSku} onChange={(e) => setOpt({ ...opt, deskSku: Number(e.target.value) })} />
            <span className="text-slate-400">행거</span>
            <input className={inp} placeholder={ev ? String(ev.hangers) : ""} value={opt.hangers} onChange={(e) => setOpt({ ...opt, hangers: e.target.value })} />대 ×
            <input className={inp} type="number" value={opt.hangerSku} onChange={(e) => setOpt({ ...opt, hangerSku: Number(e.target.value) })} />바코드
            <span className="text-slate-400">바코드당</span>
            <input className={inp} type="number" value={opt.perSku} onChange={(e) => setOpt({ ...opt, perSku: Number(e.target.value) })} />장
            <span className="ml-2 text-slate-400">배치</span>
            {([["sku", "SKU 우선"], ["price", "가격 우선"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setOpt({ ...opt, layout: k })} className={`rounded-lg px-2 py-1 font-black ${opt.layout === k ? "bg-slate-900 text-white" : "bg-white text-slate-500 border border-slate-200"}`}>
                {l}
              </button>
            ))}
            {opt.layout === "price" && (
              <>
                <span className="text-slate-400">바코드 초과 허용</span>
                <input className={inp} type="number" step="5" value={opt.tol} onChange={(e) => setOpt({ ...opt, tol: Number(e.target.value) })} />%
              </>
            )}
          </div>
          <button type="button" onClick={() => run()} disabled={loading || !id} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white disabled:opacity-40">
            {loading ? "계산 중…" : "계획 계산"}
          </button>
          {data && (
            <span className="flex items-center gap-1 text-xs font-bold">
              <span className="text-slate-400">출고차수</span>
              <input className="w-14 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-black" value={opt.shipRound} onChange={(e) => setOpt({ ...opt, shipRound: e.target.value.trim() })} />
              <button type="button" onClick={download} className="ml-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black">⬇ 출고업로드 엑셀</button>
            </span>
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          매대 1대 = {opt.deskSku} 바코드, 행거 1대 = {opt.hangerSku} 바코드(아우터는 행거, 나머지는 매대), 바코드당 {opt.perSku}장 = 기초 재고(창고 가용이 적으면 있는 만큼), 투입 목표(현재 판매가 기준)에 못 미치면 같은 바코드에 수량을 더 얹음(파란 +숫자) · 계절 맞는 이월만(러닝(신품번 5~8과 그 구품번)·ACC·기타·SHOES·SWIM 제외) ·
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
              <Box label="계획 투입" value={`${won(data.plan.amt)}원`} sub={`${data.plan.qty.toLocaleString("ko-KR")}장(기초 ${data.plan.baseQty.toLocaleString("ko-KR")} + 추가 ${data.plan.addQty.toLocaleString("ko-KR")}) · ${data.plan.styles}품번칼라 · 예측 대비 ${Math.round(data.plan.ratioToForecast * 100)}%${ev.target ? ` · 목표 대비 ${Math.round(data.plan.ratioToTarget * 100)}%` : ""}${data.sowValue ? ` · 행사가 기준 ${man(data.sowValue)}` : ""}`} tone="text-blue-600" />
              <Box label="진열 사용" value={`매대 ${data.capacity.usedDesk}/${data.capacity.desk} · 행거 ${data.capacity.usedHanger}/${data.capacity.hanger}`} sub="바코드 수(사용/칸)" tone="text-slate-900" />
            </div>
            {data.plan.amt < data.goalAmt * 0.95 && (
              <p className="mt-2 text-xs font-bold text-rose-600">
                ⚠ 기초 재고에 수량을 더 얹어도 창고 가용이 모자라 투입 목표의 {Math.round((data.plan.amt / Math.max(1, data.goalAmt)) * 100)}%까지만 채웠어요 — 매대·행거를 늘리거나 배수를 조정해 보세요.
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
                        <th className="px-1 text-right" title="현재가(PIP 판매가) → 행사가 제안(현재가 대비 할인율)">행사가 제안</th>
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
                                  {k.size} <b>{k.baseQty}</b>{k.qty > k.baseQty && <b className="text-blue-600">+{k.qty - k.baseQty}</b>}<span className="text-slate-400">({k.avail})</span>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-1 text-right font-black tabular-nums">{p.qty}</td>
                          <td className="px-1 text-right tabular-nums">{man(p.amt)}</td>
                          <td className="px-1 text-right tabular-nums" title={p.priceWhy}>
                            <span className="text-slate-400 line-through">{won(p.current || p.consumer)}</span> <b className="text-rose-600">{won(p.sowPrice)}</b>
                            {p.discount != null && <span className="text-slate-400"> ({Math.round(p.discount * 100)}%)</span>}
                          </td>
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
          <SowLayout data={data} loading={loading} onMode={(layout: string) => run({ layout })} />
          <p className="text-[11px] text-slate-400">
            창고 가용 {data.inputs.warehouse} · 매장 재고 {data.inputs.storeStock} · 계절 맞는 이월 후보 {data.candidates}품번칼라 · 최근 120일 SOW {data.inputs.sowHistoryEvents}건 참고 · 계산 {Math.round(data.ms / 1000)}초
          </p>
        </>
      )}
    </div>
  );
}

// MARK 2026-11-24 소천님: 매대·행사 상품 레이아웃(기본 접힘) + 매장 공유용 엑셀/PDF(원가 없음) + 가격조정 양식
function SowLayout({ data, loading, onMode }: { data: any; loading?: boolean; onMode?: (m: string) => void }) {
  const ev = data.event;
  const [saved, setSaved] = useState("");
  const layout: any[] = data.layout || [];
  const tiers = useMemo(() => {
    const m = new Map<number, { styles: Set<string>; qty: number }>();
    for (const f of layout) for (const it of f.items) {
      const v = m.get(it.sowPrice) || { styles: new Set<string>(), qty: 0 };
      v.styles.add(it.style);
      v.qty += it.qty;
      m.set(it.sowPrice, v);
    }
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [layout]);
  const title = `${ev.store} SOW ${md(ev.start)}~${md(ev.end)}`;
  const priceRows = (data.priceList || []).map((p: any, i: number) => [i + 1, p.style, p.name, "*", "전체", p.current || p.consumer, p.sowPrice, "할인", (p.current || p.consumer) ? Math.round((1 - p.sowPrice / (p.current || p.consumer)) * 100) : "", `${ev.store} 행사`]);
  const layoutRows = () => {
    const rows: any[][] = [];
    for (const f of layout) for (const it of f.items) for (const z of it.sizes) rows.push([f.kind, f.no, it.sowPrice, it.style, it.name, it.color, it.colorName, z.size, z.qty, it.current || it.consumer, it.sowPrice, it.discount != null ? Math.round(it.discount * 100) : ""]);
    return rows;
  };
  const excel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["구분", "번호", "매대가격", "품번", "품명", "칼라", "칼라명", "사이즈", "수량", "현재가", "행사가", "할인율(%)"], ...layoutRows()]), "매대레이아웃");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["No", "스타일", "스타일명", "칼라", "칼라명", "소비자가", "판매단가", "판매유형", "할인율", "상세비고"], ...priceRows]), "가격조정");
    XLSX.writeFile(wb, `SOW레이아웃_${ev.store}_${ev.start}.xlsx`);
  };
  const pdf = () => {
    const esc = (x: any) => String(x ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" } as any)[c]);
    const cards = layout
      .map((f) => `<div class="fx"><h3>${esc(f.label)} <small>${f.used}/${f.cap} 바코드</small></h3><table><tr><th>품번</th><th>품명</th><th>칼라</th><th>사이즈(수량)</th><th>현재가</th><th>행사가</th></tr>${f.items
        .map((it: any) => `<tr><td>${esc(it.style)}</td><td>${esc(it.name)}</td><td>${esc(it.color)} ${esc(it.colorName)}</td><td>${it.sizes.map((z: any) => `${esc(z.size)}(${z.qty})`).join(" ")}</td><td class="r s">${won(it.current || it.consumer)}</td><td class="r b">${won(it.sowPrice)}</td></tr>`)
        .join("")}</table></div>`)
      .join("");
    const tierHtml = tiers.map(([p, v]) => `<span>${won(p)}원 · ${v.styles.size}품번 · ${v.qty}장</span>`).join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} 레이아웃</title><style>
      body{font-family:'Pretendard','Malgun Gothic',sans-serif;margin:16px;color:#0f172a;font-size:11px}
      h1{font-size:18px;margin:0 0 4px} .meta{color:#64748b;margin-bottom:8px} .tiers span{display:inline-block;border:1px solid #cbd5e1;border-radius:6px;padding:2px 6px;margin:0 4px 4px 0}
      .fx{break-inside:avoid;border:1px solid #cbd5e1;border-radius:8px;padding:8px;margin:8px 0} h3{margin:0 0 6px;font-size:13px} small{color:#94a3b8;font-weight:400}
      table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #e2e8f0;padding:3px 4px;text-align:left} th{color:#64748b;font-weight:700}
      .r{text-align:right}.s{color:#94a3b8;text-decoration:line-through}.b{font-weight:800;color:#e11d48}
      @media print{body{margin:8mm}}</style></head><body>
      <h1>${esc(title)} 매대·행사 상품 레이아웃</h1>
      <div class="meta">${esc(ev.location || "")} · 매대 ${data.capacity.desks} · 행거 ${data.capacity.hangers} · 투입 ${data.plan.qty.toLocaleString("ko-KR")}장</div>
      <div class="tiers">${tierHtml}</div>${cards}<script>setTimeout(()=>window.print(),300)</script></body></html>`);
    w.document.close();
  };
  const savePrices = async () => {
    if (!confirm(`${ev.store} 행사가 ${data.priceList.length}품번을 가격조정 이력에 저장할까요? 다음 행사 제안 때 같은 품번은 이 가격을 먼저 써요.`)) return;
    const r = await fetch("/api/sow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prices: data.priceList.map((p: any) => ({ date: ev.start, store: ev.store, style: p.style, name: p.name, consumer: p.current || p.consumer, price: p.sowPrice })) }) }).then((x) => x.json()).catch(() => null);
    setSaved(r?.ok ? `저장했어요(${r.saved}품번)` : "저장 실패");
  };
  return (
    <details className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer text-sm font-black">
        🗂 매대·행사 상품 레이아웃 · 가격 제안 <span className="text-xs font-bold text-slate-400">(펼쳐 보기 · 매장 공유용 엑셀/PDF — 원가 없음)</span>
      </summary>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={excel} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black">⬇ 엑셀(레이아웃·가격조정)</button>
        <button type="button" onClick={pdf} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black">🖨 PDF(인쇄)</button>
        <button type="button" onClick={savePrices} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black">💾 행사가 이력에 저장</button>
        {saved && <span className="text-xs font-bold text-emerald-600">{saved}</span>}
        <span className="text-[11px] text-slate-400">행사가 = 지난 SOW 때 같은 품번 가격 → 없으면 현재가(PIP 판매가)×0.54를 팀 가격 단계(1.6·1.8·2·2.5·3·3.5·4·4.9·5.9·7.5·8.8·9.9만…)로 · 바코드 3개 미만 단계는 아래 단계로 합침</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {tiers.map(([p, v]) => (
          <span key={p} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-bold">
            <b className="text-rose-600">{won(p)}원</b> · {v.styles.size}품번 · {v.qty.toLocaleString("ko-KR")}장
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-bold">
        <span className="text-slate-400">배치 기준</span>
        {([["sku", "SKU 우선"], ["price", "가격 우선"]] as const).map(([k, l]) => (
          <button key={k} type="button" disabled={loading} onClick={() => data.layoutMode !== k && onMode?.(k)} className={`rounded-lg px-2.5 py-1 font-black ${data.layoutMode === k ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-500"}`}>
            {l}
          </button>
        ))}
        <span className="text-[11px] font-normal text-slate-400">
          {data.layoutMode === "price"
            ? `한 칸엔 한 가격만 — 칸당 바코드를 ${data.tol}%까지 넘길 수 있고, 그래도 칸이 모자라면 바코드 적은 가격 단계를 아래 단계로 합침`
            : "칸당 바코드 수를 지킴 — 칸이 모자라면 한 칸에 가격이 섞일 수 있음"}
        </span>
      </div>
      {(data.priceMerges || []).length > 0 && (
        <p className="mt-2 text-[11px] font-bold text-amber-600">
          가격 우선으로 맞춘 단계: {data.priceMerges.map((m: any) => `${m.kind} ${won(m.from)}→${won(m.to)}원(${m.n}바코드)`).join(" · ")}
        </p>
      )}
      {layout.some((f) => f.mixed) && <p className="mt-2 text-[11px] font-bold text-amber-600">칸이 모자라 일부 매대는 가격을 섞어 배치했어요.</p>}
      <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {layout.map((f) => (
          <div key={`${f.kind}${f.no}`} className="rounded-2xl border border-slate-200 p-3">
            <p className="mb-1 flex items-baseline justify-between text-sm font-black">
              <span>{f.kind === "행거" ? "🧥" : "🧶"} {f.label}</span>
              <span className={`text-[10px] font-bold ${f.used > f.cap ? "text-amber-600" : "text-slate-400"}`}>{f.used}/{f.cap} 바코드{f.used > f.cap ? " (초과)" : ""}</span>
            </p>
            {f.items.map((it: any) => (
              <div key={`${it.style}|${it.color}`} className="flex items-center gap-2 border-t border-slate-100 py-1 text-[11px]">
                <ProductThumb styleCode={it.style} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold" title={it.name}>{it.name || it.style}</div>
                  <div className="text-[10px] text-slate-400">{it.style} · {it.color} {it.colorName} · {it.sizes.map((z: any) => `${z.size}(${z.qty})`).join(" ")}</div>
                </div>
                <div className="whitespace-nowrap text-right">
                  <div className="text-[10px] text-slate-400 line-through">{won(it.current || it.consumer)}</div>
                  <div className="font-black text-rose-600">{won(it.sowPrice)}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </details>
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
