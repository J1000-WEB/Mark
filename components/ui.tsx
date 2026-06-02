import Link from "next/link";

export function Nav({ active }: { active: "daily" | "weekly" | "monthly" }) {
  const tabs = [
    { key: "daily", label: "일간", href: "/daily" },
    { key: "weekly", label: "주간", href: "/weekly" },
    { key: "monthly", label: "월간", href: "/monthly" },
  ] as const;
  return <nav className="nav">{tabs.map(t => <Link className={active === t.key ? "active" : ""} key={t.key} href={t.href}>{t.label}</Link>)}</nav>;
}

export function Header({ active, desc }: { active: "daily" | "weekly" | "monthly"; desc: string }) {
  return <header className="header">
    <div>
      <h1>Mark1 오프라인 매출 리뷰 대시보드(소재천)</h1>
      <div className="subtitle">{desc}</div>
    </div>
    <Nav active={active} />
  </header>;
}

export function Kpi({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return <section className="card"><div className="kpi-title">{title}</div><div className="kpi-value">{value}</div>{sub && <div className="kpi-sub">{sub}</div>}</section>;
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card"><h2>{title}</h2>{children}</section>;
}

export function Mini({ label, value, bold=false }: { label: string; value: string; bold?: boolean }) {
  return <div className="mini"><span>{label}</span><b className={bold ? "bold-value" : ""}>{value}</b></div>;
}

export function won(v: number) {
  if (!Number.isFinite(v)) return "0원";
  if (Math.abs(v) >= 100000000) return `${(v/100000000).toFixed(1)}억`;
  if (Math.abs(v) >= 10000) return `${Math.round(v/10000).toLocaleString("ko-KR")}만`;
  return `${Math.round(v).toLocaleString("ko-KR")}원`;
}
export function comma(v: number) { return Math.round(v || 0).toLocaleString("ko-KR"); }
export function pct(v: number) { return `${Number(v || 0).toFixed(1)}%`; }
export function signPct(v: number) { return `${v >= 0 ? "+" : ""}${pct(v)}`; }
export function tone(v: number) { return v < 0 ? "red" : "blue"; }
