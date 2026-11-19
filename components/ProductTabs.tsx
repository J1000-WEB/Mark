"use client";

// MARK 2026-11-18: 상품 탭 안 하위 탭 — IMC 현황(메인) / 주간데이터
import { useEffect, useState } from "react";
import PromoReportPanel from "@/components/PromoReportPanel";
import WeeklyProductPanel from "@/components/WeeklyProductPanel";
import CategoryMixPanel from "@/components/CategoryMixPanel";

export default function ProductTabs() {
  const [tab, setTab] = useState<"imc" | "weekly" | "mix">("imc");
  useEffect(() => {
    try {
      const v = localStorage.getItem("productTab");
      if (v === "weekly" || v === "imc" || v === "mix") setTab(v);
    } catch {}
  }, []);
  const pick = (v: "imc" | "weekly" | "mix") => {
    setTab(v);
    try {
      localStorage.setItem("productTab", v);
    } catch {}
  };
  return (
    <>
      <div className="mt-4 flex gap-2">
        {(
          [
            ["imc", "IMC 현황"],
            ["weekly", "주간데이터"],
            ["mix", "구성비"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" onClick={() => pick(k)} className={`rounded-xl px-4 py-2 text-sm font-black ${tab === k ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "imc" ? <PromoReportPanel /> : tab === "weekly" ? <WeeklyProductPanel /> : <CategoryMixPanel />}
    </>
  );
}
