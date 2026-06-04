import { fmtNum, pct, won } from "@/lib/mark";

export function Kpi({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-3 text-2xl font-black">{value}</p>
      {sub && <p className="mt-1 text-sm font-bold text-slate-500">{sub}</p>}
    </div>
  );
}

export function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
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

export function Info({ label, value, color }: { label: string; value: string; color?: "red" | "blue" }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 font-bold ${color === "red" ? "text-red-600" : color === "blue" ? "text-blue-600" : ""}`}>{value}</p>
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
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <h3 className="mb-3 font-black">{title}</h3>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.storeName} className="flex items-center justify-between rounded-xl bg-white p-3">
            <div>
              <p className="text-xs text-slate-500">#{i + 1}</p>
              <p className="font-bold">{r.storeName}</p>
            </div>
            <div className="text-right">
              <p className={`font-black ${mode === "good" ? "text-blue-600" : "text-red-600"}`}>
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
