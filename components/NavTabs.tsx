import Link from "next/link";

export default function NavTabs({ active }: { active: "daily" | "weekly" | "monthly" | "inventory" }) {
  const tabs = [
    { key: "daily", label: "일간", href: "/daily" },
    { key: "weekly", label: "주간", href: "/weekly" },
    { key: "monthly", label: "월간", href: "/monthly" },
    { key: "inventory", label: "재고CTRL", href: "/inventory" },
  ] as const;

  return (
    <div className="flex flex-wrap gap-2">
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
    </div>
  );
}
