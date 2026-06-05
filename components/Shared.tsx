import { fmtNum, pct, won } from "@/lib/mark";

export function Kpi({ title, value, sub, tone = "plain" }: { title: string; value: string; sub?: string; tone?: "plain" | "blue" | "green" | "purple" | "orange" }) {
  const tones = {
    plain: "bg-white",
    blue: "bg-blue-50 border border-blue-100",
    green: "bg-emerald-50 border border-emerald-100",
    purple: "bg-violet-50 border border-violet-100",
    orange: "bg-orange-50 border border-orange-100",
  } as const;
  return (
    <div className={`rounded-3xl p-5 shadow-sm ${tones[tone]}`}>
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-3 text-2xl font-black">{value}</p>
      {sub && <p className="mt-1 text-sm font-bold text-slate-500">{sub}</p>}
    </div>
  );
}

export function Card({ title, children, right, tone = "white" }: { title: string; children: React.ReactNode; right?: React.ReactNode; tone?: "white" | "purple" | "yellow" | "beige" }) {
  const tones = {
    white: "bg-white",
    purple: "bg-violet-50 border border-violet-100",
    yellow: "bg-yellow-50 border border-yellow-100",
    beige: "bg-stone-50 border border-stone-100",
  } as const;
  return (
    <section className={`rounded-3xl p-5 shadow-sm ${tones[tone]}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Empty() {
  return <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">표시할 데이터가 없습니다.</div>;
}

export function Info({ label, value, color }: { label: string; value: string; color?: "red" | "blue" | "green" | "orange" }) {
  const c = color === "red" ? "text-red-600" : color === "blue" ? "text-blue-600" : color === "green" ? "text-emerald-600" : color === "orange" ? "text-orange-500" : "";
  return (
    <div className="rounded-xl bg-white/70 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 font-bold ${c}`}>{value}</p>
    </div>
  );
}

export function ProductList({ items }: { items: any[] }) {
  if (!items?.length) return <Empty />;
  return (
    <div className="space-y-3">
      {items.map((p, i) => (
        <div key={`${p.styleCode}-${i}`} className="rounded-2xl border border-slate-100 bg-white p-4">
          <div className="flex justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">#{i + 1} · {p.styleCode}</p>
              <p className="font-black">{p.productName}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black">{won(p.weekAmount)}</p>
              <p className="text-xs text-slate-500">금주 매출</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <Info label="판매수량" value={`${fmtNum(p.weekNet)}개`} />
            <Info label="전주매출" value={won(p.prevAmount)} />
            <Info label="매출 신장률" value={`${p.amountChangeRate >= 0 ? "+" : ""}${pct(p.amountChangeRate)}`} color={p.amountChangeRate < 0 ? "red" : "blue"} />
            <Info label="기여도" value={pct(p.contributionRate)} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StoreMiniList({ title, rows, mode }: { title: string; rows: any[]; mode: "good" | "bad" }) {
  const wrap = mode === "good" ? "bg-emerald-50 border border-emerald-100" : "bg-rose-50 border border-rose-100";
  return (
    <div className={`rounded-2xl p-4 ${wrap}`}>
      <h3 className="mb-3 font-black">{title}</h3>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.storeName} className="flex items-center justify-between rounded-xl bg-white p-3">
            <div>
              <p className="text-xs text-slate-500">#{i + 1}</p>
              <p className="font-bold">{r.storeName}</p>
            </div>
            <div className="text-right">
              <p className={`font-black ${mode === "good" ? "text-emerald-600" : "text-red-600"}`}>
                {(r.weekChangeRate ?? r.monthChangeRate) >= 0 ? "+" : ""}{pct(r.weekChangeRate ?? r.monthChangeRate)}
              </p>
              <p className="text-xs text-slate-500">{won(r.weekSales || r.monthSales || 0)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
