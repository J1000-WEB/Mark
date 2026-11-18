"use client";

// MARK 2026-11-18: 재고CTRL 탭 "RT 기회로스 회수" — 계산 기준은 lib/rtRecovery.ts 맨 위 주석(지시 후 18일, 기준 28일).
import { useEffect, useMemo, useState } from "react";

const won = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "-" : Math.round(n).toLocaleString("ko-KR"));
const pct = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "-" : `${Math.round(n * 100)}%`);
const shortName = (s: string) => String(s || "").replace(/^오프라인_/, "");
function addDays(ymd: string, d: number) {
  const x = new Date(`${ymd}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}
const VERDICT_STYLE: Record<string, string> = {
  회수: "bg-blue-50 text-blue-700",
  부분회수: "bg-amber-50 text-amber-700",
  미회수: "bg-rose-50 text-rose-700",
  "수요없음(판단보류)": "bg-slate-100 text-slate-500",
  진행중: "bg-violet-50 text-violet-700",
};
const TH = "whitespace-nowrap px-2 py-1.5 text-right font-black";
const TD = "whitespace-nowrap px-2 py-1.5 text-right tabular-nums";

export default function RtRecoveryPanel() {
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(addDays(today, -31));
  const [to, setTo] = useState(addDays(today, -1));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>("전체");
  const [groupBy, setGroupBy] = useState<"line" | "store" | "style">("line");

  async function run() {
    setLoading(true);
    setError("");
    try {
      const j = await fetch(`/api/rt-recovery?from=${from}&to=${to}`, { cache: "no-store" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error || "계산 실패");
      setData(j);
      setOpen(true);
    } catch (e: any) {
      setError(e?.message || "계산 실패");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lines: any[] = data?.lines || [];
  const shown = filter === "전체" ? lines : lines.filter((l) => l.verdict === filter);
  const grouped = useMemo(() => {
    if (groupBy === "line") return [];
    const m = new Map<string, any>();
    for (const l of lines) {
      const k = groupBy === "store" ? l.to : l.style;
      const g = m.get(k) || { key: k, n: 0, qty: 0, lossAmt: 0, gainAmt: 0, forgoneAmt: 0, netAmt: 0, done: 0 };
      g.n++;
      g.qty += l.qty;
      if (l.done) {
        g.done++;
        g.lossAmt += l.lossAmt;
        g.gainAmt += l.gainAmt;
        g.forgoneAmt += l.forgoneAmt;
        g.netAmt += l.netAmt;
      }
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.netAmt - a.netAmt);
  }, [lines, groupBy]);
  const s = data?.summary;

  return (
    <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-400">RT OPPORTUNITY-LOSS RECOVERY</p>
          <h2 className="text-lg font-black text-slate-900">🔁 RT 기회로스 회수</h2>
          <p className="mt-1 text-xs text-slate-500">
            RT 지시일 다음날부터 <b>18일</b>(입고 약 4일 + 입고 후 2주) 동안, RT 안 했으면 놓쳤을 매출(예상 기회로스) 대비 RT로 실제 만든 매출. 수요는 지시 전 28일 판매속도로 추정.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-bold text-slate-500">지시일</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-slate-200 px-2 py-1.5 font-bold" />
          <span>~</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-slate-200 px-2 py-1.5 font-bold" />
          <button type="button" onClick={run} disabled={loading} className="rounded-xl bg-slate-900 px-4 py-2 font-black text-white disabled:opacity-50">
            {loading ? "계산 중… (최대 1~2분)" : "분석"}
          </button>
        </div>
      </div>

      {error && <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>}
      {loading && !data && <div className="mt-4 rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-400">계산 중… 판매이력을 기간만큼 읽어서 1~2분 걸려요.</div>}

      {s && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
            {[
              ["RT 건수(SKU)", `${s.lines.toLocaleString()}건 · ${s.rtQty.toLocaleString()}장`, ""],
              ["예상 기회로스", won(s.lossAmt), "text-rose-600"],
              ["RT 생성 매출", won(s.gainAmt), "text-blue-600"],
              ["보낸 매장 포기", won(s.forgoneAmt), "text-slate-500"],
              ["순 회수 매출", won(s.netAmt), "text-blue-700"],
              ["회수율", pct(s.recovery), "text-blue-700"],
            ].map(([label, v, c]) => (
              <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <div className="text-[11px] font-bold text-slate-400">{label}</div>
                <div className={`text-lg font-black ${c}`}>{v}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            금액 합계·회수율은 18일이 다 지난 {s.doneLines}건 기준(진행중 {s.lines - s.doneLines}건 제외). 판정:{" "}
            {Object.entries(s.verdicts || {})
              .map(([k, v]) => `${k} ${v}`)
              .join(" · ")}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-black">
              {open ? "− 상세 접기" : "+ 상세 보기"}
            </button>
            {open && (
              <>
                {(["line", "store", "style"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGroupBy(g)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-black ${groupBy === g ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600"}`}
                  >
                    {g === "line" ? "SKU별" : g === "store" ? "받은 매장별" : "품번별"}
                  </button>
                ))}
                {groupBy === "line" &&
                  ["전체", "회수", "부분회수", "미회수", "수요없음(판단보류)", "진행중"].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setFilter(v)}
                      className={`rounded-xl px-2.5 py-1 text-[11px] font-black ${filter === v ? "bg-slate-700 text-white" : "bg-slate-50 text-slate-500"}`}
                    >
                      {v}
                    </button>
                  ))}
              </>
            )}
          </div>

          {open && groupBy !== "line" && (
            <div className="mt-3 max-h-[520px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-black">{groupBy === "store" ? "받은 매장" : "품번"}</th>
                    <th className={TH}>건수</th>
                    <th className={TH}>RT 수량</th>
                    <th className={TH}>예상 기회로스</th>
                    <th className={TH}>RT 생성 매출</th>
                    <th className={TH}>보낸 매장 포기</th>
                    <th className={TH}>순 회수</th>
                    <th className={TH}>회수율</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((g) => (
                    <tr key={g.key} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 font-black">{groupBy === "store" ? shortName(g.key) : g.key}</td>
                      <td className={TD}>{g.n}</td>
                      <td className={TD}>{g.qty}</td>
                      <td className={`${TD} text-rose-600`}>{won(g.lossAmt)}</td>
                      <td className={`${TD} text-blue-600`}>{won(g.gainAmt)}</td>
                      <td className={`${TD} text-slate-500`}>{won(g.forgoneAmt)}</td>
                      <td className={`${TD} font-black`}>{won(g.netAmt)}</td>
                      <td className={`${TD} font-black`}>{g.lossAmt > 0 ? pct(g.gainAmt / g.lossAmt) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {open && groupBy === "line" && (
            <div className="mt-3 max-h-[620px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-black">지시일</th>
                    <th className="px-2 py-1.5 text-left font-black">보낸 → 받은 매장</th>
                    <th className="px-2 py-1.5 text-left font-black">SKU</th>
                    <th className={TH}>RT</th>
                    <th className={TH} title="지시일 받은 매장 / 보낸 매장 그 SKU 재고">재고(받/보)</th>
                    <th className={TH} title="받은 매장 일 판매속도 추정">수요/일</th>
                    <th className={TH}>18일 실판매</th>
                    <th className={TH}>예상 기회로스</th>
                    <th className={TH}>RT 생성</th>
                    <th className={TH}>보낸 포기</th>
                    <th className={TH}>회수율</th>
                    <th className={TH}>기말재고</th>
                    <th className="px-2 py-1.5 text-center font-black">판정</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((l, i) => (
                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="whitespace-nowrap px-2 py-1.5">{l.date.slice(5)}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        {shortName(l.from)} → <b>{shortName(l.to)}</b>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 font-bold">
                        {l.style} {l.color}/{l.size}
                      </td>
                      <td className={TD}>{l.qty}</td>
                      <td className={TD}>
                        {l.receiverStockAtRt}/{l.senderStockAtRt}
                      </td>
                      <td className={TD} title={l.receiverRateMethod}>
                        {l.receiverRate}
                      </td>
                      <td className={TD}>{l.actualSold}</td>
                      <td className={`${TD} text-rose-600`} title={`${l.lossQty}장`}>
                        {won(l.lossAmt)}
                      </td>
                      <td className={`${TD} text-blue-600`} title={`${l.gainQty}장`}>
                        {won(l.gainAmt)}
                      </td>
                      <td className={`${TD} text-slate-500`} title={`${l.forgoneQty}장`}>
                        {won(l.forgoneAmt)}
                      </td>
                      <td className={`${TD} font-black`}>{pct(l.recovery)}</td>
                      <td className={TD}>{l.endStock}</td>
                      <td className="px-2 py-1.5 text-center">
                        <span className={`rounded-lg px-2 py-0.5 text-[11px] font-black ${VERDICT_STYLE[l.verdict] || ""}`}>
                          {l.verdict}
                          {!l.done ? ` ${l.evalDays}/18일` : ""}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            예상 기회로스 = (수요/일 × 18일 − 지시일 받은 매장 재고), RT 수량까지. RT 생성 = 18일 실판매 − 기존 재고로 팔 수 있었던 몫, RT 수량까지. 보낸 포기 = 보낸 매장이 그 물량을 갖고 있었으면 18일
            동안 팔았을 몫. 금액은 실판매 평균가. 수요/일에 마우스를 올리면 추정 방법이 보여요.
          </p>
        </>
      )}
    </section>
  );
}
