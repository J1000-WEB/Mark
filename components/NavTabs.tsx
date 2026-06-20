"use client";

import Link from "next/link";

export default function NavTabs({ active }: { active: "daily" | "weekly" | "monthly" | "inventory" | "insights" | "snapshot" | "trends" | "logic" }) {
  const tabs = [
    { key: "weekly", label: "주간", href: "/weekly" },
    { key: "inventory", label: "재고CTRL", href: "/inventory" },
    { key: "trends", label: "상품동향", href: "/trends" },
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
      <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:inline-block" />
      <Link
        href="/logic"
        className={`rounded-xl px-3 py-2 text-xs font-black ${
          active === "logic"
            ? "bg-violet-900 text-white"
            : "border border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-100"
        }`}
      >
        Logic Center
      </Link>
      <Link
        href="/snapshot"
        className={`rounded-xl px-3 py-2 text-xs font-black ${
          active === "snapshot"
            ? "bg-slate-900 text-white"
            : "border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
        }`}
      >
        Snapshot
      </Link>
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
