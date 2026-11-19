"use client";

// MARK 2026-11-19: 메뉴 레이아웃 개편(소천님 요청, production-hub 참고)
//  - PC(lg 이상): 왼쪽 고정 메뉴바(어두운 남색) — 로고 · 큰 메뉴 · 선택한 메뉴 밑에 하위 탭(SideSubTabs가 포털로 넣음) · 로그아웃
//  - 모바일: 위쪽에 로고 + 가로로 넘기는 메뉴 한 줄 + 하위 탭 한 줄(스크롤해도 위에 붙어 있음). 메뉴가 첫 화면을 다 먹지 않게.
//  - body에 has-sidenav 클래스를 붙여 PC에서 본문을 메뉴바 폭만큼 오른쪽으로 밀어냄(globals.css).
// 예전 메모: 상품동향/VMD/스냅샷 탭은 안 써서 숨김(라우트는 남아 있음). 판매전체상/일간/월간은 매출 탭 안, 판매데이터는 재고CTRL 안.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type NavKey = "schedule" | "sales-data" | "daily" | "weekly" | "monthly" | "inventory" | "insights" | "snapshot" | "trends" | "logic" | "vmd" | "store" | "store-brief" | "realtime" | "store-sales" | "rounding" | "product";

// 2026-11-19 소천님 요청 순서: 매출 상품 실시간 재고CTRL 주간 매장 라운딩
const tabs = [
  { key: "store-sales", label: "매출", href: "/store-sales", icon: "📊" },
  { key: "product", label: "상품", href: "/product", icon: "👕" },
  { key: "realtime", label: "실시간", href: "/realtime", icon: "⏱" },
  { key: "inventory", label: "재고CTRL", href: "/inventory", icon: "📦" },
  { key: "weekly", label: "주간", href: "/weekly", icon: "🗓" },
  { key: "store", label: "매장", href: "/store", icon: "🏬" },
  { key: "rounding", label: "라운딩", href: "/rounding", icon: "🧭" },
] as const;

export default function NavTabs({ active }: { active: NavKey }) {
  // PC 메뉴바 접기(아이콘만) — 브라우저에 기억
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    document.body.classList.add("has-sidenav");
    try {
      if (localStorage.getItem("sidenavCollapsed") === "1") setCollapsed(true);
    } catch {}
    return () => document.body.classList.remove("has-sidenav", "sidenav-collapsed");
  }, []);
  useEffect(() => {
    document.body.classList.toggle("sidenav-collapsed", collapsed);
  }, [collapsed]);
  // 모바일 위쪽 메뉴는 페이지마다 NavTabs 위치·여백이 달라서(실시간 탭은 제목 옆에 있어 깨졌음) body에 포털로 붙여 화면 맨 위에 고정하고,
  // 그 높이만큼 body 위쪽 여백(--mnav-h)을 줌.
  const [mounted, setMounted] = useState(false);
  const mobileRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const el = mobileRef.current;
    if (!el) return;
    const set = () => document.body.style.setProperty("--mnav-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.body.style.removeProperty("--mnav-h");
    };
  }, [mounted]);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("sidenavCollapsed", c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  function logout() {
    localStorage.removeItem("mark_auth");
    window.location.href = "/";
  }

  return (
    <>
      {/* PC: 왼쪽 고정 메뉴바 */}
      <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col bg-[#0f172a] text-slate-200 transition-[width] duration-200 lg:flex ${collapsed ? "w-16" : "w-56"}`}>
        <div className={`relative border-b border-white/10 ${collapsed ? "px-2 pb-3 pt-5" : "px-5 pb-4 pt-6"}`}>
          {collapsed ? (
            <Link href="/store-sales" className="block text-center text-sm font-black tracking-tight text-white" title="GENERAL IDEA">
              GI
            </Link>
          ) : (
            <Link href="/store-sales" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/gi-logo-white.png" alt="GENERAL IDEA" className="h-auto w-full max-w-[170px]" />
              <div className="mt-2 text-[10px] font-bold tracking-[0.2em] text-slate-400">OFFLINE DASHBOARD</div>
            </Link>
          )}
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
            className="absolute -right-3 top-6 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-[#1e293b] text-xs font-black text-slate-200 shadow hover:bg-blue-600"
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>
        <nav className={`flex-1 overflow-y-auto py-4 ${collapsed ? "px-2" : "px-3"}`}>
          {tabs.map((tab) => {
            const on = active === tab.key;
            return (
              <div key={tab.key} className="mb-1">
                <Link
                  href={tab.href}
                  title={tab.label}
                  className={`flex items-center rounded-xl py-2.5 text-sm font-black transition ${collapsed ? "justify-center px-0" : "gap-2.5 px-3"} ${
                    on ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40" : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="w-5 text-center text-base">{tab.icon}</span>
                  {!collapsed && tab.label}
                </Link>
                {/* 선택한 메뉴의 하위 탭이 여기로 들어옴(SideSubTabs). 접힌 상태에선 숨김 */}
                {on && <div id="sidenav-sub-desktop" className={`ml-7 mt-1 space-y-0.5 ${collapsed ? "hidden" : ""}`} />}
              </div>
            );
          })}
        </nav>
        <div className={`border-t border-white/10 py-4 ${collapsed ? "px-2 text-center" : "px-5"}`}>
          <button type="button" onClick={logout} title="로그아웃" className="text-xs font-bold text-slate-400 hover:text-white">
            {collapsed ? "⎋" : "로그아웃"}
          </button>
        </div>
      </aside>

      {/* 모바일: 위쪽 메뉴(한 줄 가로 스크롤) + 하위 탭 한 줄 */}
      {mounted &&
        createPortal(
      <div ref={mobileRef} className="fixed inset-x-0 top-0 z-50 bg-[#0f172a] text-white shadow-md lg:hidden">
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
      </div>,
          document.body
        )}
    </>
  );
}
