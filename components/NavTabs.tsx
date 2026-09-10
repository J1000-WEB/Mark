"use client";

import Link from "next/link";

export default function NavTabs({ active }: { active: "schedule" | "sales-data" | "daily" | "weekly" | "monthly" | "inventory" | "insights" | "snapshot" | "trends" | "logic" | "vmd" | "store" | "store-brief" | "realtime" }) {
  // MARK: 상품동향/VMD/스냅샷 탭은 안 쓰셔서 네비게이션에서 숨겼습니다 (라우트 자체는
  // 남아있어서 주소로 직접 들어가면 여전히 열립니다 — 나중에 다시 켜고 싶으면 이 배열에
  // 도로 추가하면 됩니다).
  const tabs = [
    { key: "schedule", label: "판매전체상", href: "/schedule" },
    { key: "weekly", label: "주간", href: "/weekly" },
    { key: "sales-data", label: "판매데이터", href: "/sales-data" },
    { key: "inventory", label: "재고CTRL", href: "/inventory" },
    { key: "realtime", label: "실시간", href: "/realtime" },
    { key: "daily", label: "일간", href: "/daily" },
    { key: "store", label: "매장", href: "/store" },
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
