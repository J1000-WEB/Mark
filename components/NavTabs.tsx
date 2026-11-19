"use client";

// MARK 2026-11-19: 메뉴 레이아웃 개편(소천님 요청, production-hub 참고)
//  - PC(lg 이상): 왼쪽 고정 메뉴바(어두운 남색) — 로고 · 큰 메뉴 · 선택한 메뉴 밑에 하위 탭(SideSubTabs가 포털로 넣음) · 로그아웃
//  - 모바일: 위쪽에 로고 + 가로로 넘기는 메뉴 한 줄 + 하위 탭 한 줄(스크롤해도 위에 붙어 있음). 메뉴가 첫 화면을 다 먹지 않게.
//  - body에 has-sidenav 클래스를 붙여 PC에서 본문을 메뉴바 폭만큼 오른쪽으로 밀어냄(globals.css).
// 예전 메모: 상품동향/VMD/스냅샷 탭은 안 써서 숨김(라우트는 남아 있음). 판매전체상/일간/월간은 매출 탭 안, 판매데이터는 재고CTRL 안.
import Link from "next/link";
import { useEffect } from "react";

export type NavKey = "schedule" | "sales-data" | "daily" | "weekly" | "monthly" | "inventory" | "insights" | "snapshot" | "trends" | "logic" | "vmd" | "store" | "store-brief" | "realtime" | "store-sales" | "rounding" | "product";

// 2026-11-19 소천님 요청 순서: 매출 상품 실시간 재고CTRL 매장 라운딩 (주간은 맨 뒤로)
const tabs = [
  { key: "store-sales", label: "매출", href: "/store-sales", icon: "📊" },
  { key: "product", label: "상품", href: "/product", icon: "👕" },
  { key: "realtime", label: "실시간", href: "/realtime", icon: "⏱" },
  { key: "inventory", label: "재고CTRL", href: "/inventory", icon: "📦" },
  { key: "store", label: "매장", href: "/store", icon: "🏬" },
  { key: "rounding", label: "라운딩", href: "/rounding", icon: "🧭" },
  { key: "weekly", label: "주간", href: "/weekly", icon: "🗓" },
] as const;

export default function NavTabs({ active }: { active: NavKey }) {
  useEffect(() => {
    document.body.classList.add("has-sidenav");
    return () => document.body.classList.remove("has-sidenav");
  }, []);

  function logout() {
    localStorage.removeItem("mark_auth");
    window.location.href = "/";
  }

  return (
    <>
      {/* PC: 왼쪽 고정 메뉴바 */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col bg-[#0f172a] text-slate-200 lg:flex">
        <Link href="/store-sales" className="block border-b border-white/10 px-5 pb-4 pt-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gi-logo-white.png" alt="GENERAL IDEA" className="h-auto w-full max-w-[170px]" />
          <div className="mt-2 text-[10px] font-bold tracking-[0.2em] text-slate-400">OFFLINE DASHBOARD</div>
        </Link>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {tabs.map((tab) => {
            const on = active === tab.key;
            return (
              <div key={tab.key} className="mb-1">
                <Link
                  href={tab.href}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-black transition ${
                    on ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40" : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="w-5 text-center text-base">{tab.icon}</span>
                  {tab.label}
                </Link>
                {/* 선택한 메뉴의 하위 탭이 여기로 들어옴(SideSubTabs) */}
                {on && <div id="sidenav-sub-desktop" className="ml-7 mt-1 space-y-0.5" />}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-5 py-4">
          <button type="button" onClick={logout} className="text-xs font-bold text-slate-400 hover:text-white">
            로그아웃
          </button>
        </div>
      </aside>

      {/* 모바일: 위쪽 메뉴(한 줄 가로 스크롤) + 하위 탭 한 줄 */}
      <div className="sticky top-0 z-40 -mx-4 -mt-6 mb-2 bg-[#0f172a] text-white shadow-md lg:hidden">
        <div className="flex items-center gap-3 px-4 pb-2 pt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gi-logo-white.png" alt="GENERAL IDEA" className="h-3.5 w-auto" />
          <button type="button" onClick={logout} className="ml-auto text-[11px] font-bold text-slate-400">
            로그아웃
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-black ${active === tab.key ? "bg-blue-600 text-white" : "bg-white/10 text-slate-200"}`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <div id="sidenav-sub-mobile" className="flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] empty:hidden [&:not(:empty)]:pb-2" />
      </div>
    </>
  );
}
