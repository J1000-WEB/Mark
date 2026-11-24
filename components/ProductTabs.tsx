"use client";

// MARK 2026-11-18: 상품 탭 안 하위 탭 — IMC 현황(메인) / 주간데이터
import { useEffect, useState } from "react";
import PromoReportPanel from "@/components/PromoReportPanel";
import WeeklyProductPanel from "@/components/WeeklyProductPanel";
import CategoryMixPanel from "@/components/CategoryMixPanel";
import SowReviewPanel from "@/components/SowReviewPanel";
import SideSubTabs from "@/components/SideSubTabs";

export default function ProductTabs() {
  const [tab, setTab] = useState<"imc" | "weekly" | "mix" | "sow">("imc");
  useEffect(() => {
    try {
      const v = localStorage.getItem("productTab");
      if (v === "weekly" || v === "imc" || v === "mix" || v === "sow") setTab(v);
    } catch {}
  }, []);
  const pick = (v: "imc" | "weekly" | "mix" | "sow") => {
    setTab(v);
    try {
      localStorage.setItem("productTab", v);
    } catch {}
  };
  return (
    <>
      <SideSubTabs
        items={
          [
            ["imc", "IMC 현황"],
            ["weekly", "주간데이터"],
            ["mix", "구성비"],
            ["sow", "SOW"],
          ] as const
        }
        active={tab}
        onPick={pick}
      />
      {tab === "imc" ? <PromoReportPanel /> : tab === "weekly" ? <WeeklyProductPanel /> : tab === "sow" ? <SowReviewPanel /> : <CategoryMixPanel />}
    </>
  );
}
