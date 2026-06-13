"use client";

import Link from "next/link";

export default function NavTabs({ active }: { active: "daily" | "weekly" | "monthly" | "inventory" | "insights" | "snapshot" | "logic" }) {
  const tabs = [
    { key: "weekly", label: "주간", href: "/weekly" },
    { key: "inventory", label: "재고CTRL", href: "/inventory" },
    { key: "insights", label: "AI 인사이트", href: "/insights" },
    { key: "snapshot", label: "📸 Snapshot", href: "/snapshot" },
    { key: "logic", label: "🧠 Logic", href: "/logic" },
    { key: "daily", label: "일간", href: "/daily" },
    { key: "monthly", label: "월간", href: "/monthly" },
  ] as const;

  function logout() {
    localStorage.removeItem("mark_auth");
    window.location.href = "/";
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${
            active === tab.key
              ? "bg-slate-900 text-white"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {tab.label}
        </Link>
      ))}
      <button
        type="button"
        onClick={logout}
        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50"
      >
        로그아웃
      </button>
    </div>
  );
}
