"use client";

import { useEffect, useState } from "react";
import NavTabs from "@/components/NavTabs";
import { Card, Empty, Kpi } from "@/components/Shared";

function splitSections(text: string) {
  if (!text) return [];
  const parts = text.split(/(?=^\[[^\]]+\])/gm).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [text];
}

function SectionBlock({ text }: { text: string }) {
  const titleMatch = text.match(/^\[([^\]]+)\]/);
  const title = titleMatch?.[1] || "AI 인사이트";
  const body = titleMatch ? text.replace(/^\[[^\]]+\]\s*/, "") : text;
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-sm font-black text-blue-600">{title}</p>
      <div className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{body || "내용 없음"}</div>
    </div>
  );
}

export default function InsightsDashboard() {
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<any>(null);

  async function generate() {
    setLoading(true);
    setError("");
    setSaved(null);
    try {
      const res = await fetch("/api/insights", { method: "POST", cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "AI 인사이트 생성 실패");
      setInsight(data.insight || "");
      setSaved(Boolean(data.saved));
      setSummary(data.summary || null);
    } catch (e: any) {
      setError(e?.message || "AI 인사이트 생성 실패");
    } finally {
      setLoading(false);
    }
  }

  const sections = splitSections(insight);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">AI 인사이트 Mark4.2</h1>
            <p className="mt-1 text-sm text-slate-500">Claude가 GENERAL IDEA 오프라인 영업 MD 관점으로 이번주 데이터를 분석합니다.</p>
          </div>
          <NavTabs active="insights" />
        </header>

        <section className="rounded-3xl bg-slate-900 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-300">AI Insight Center</p>
              <h2 className="mt-1 text-2xl font-black">이번주 데이터에서 기회·위험·액션을 찾아냅니다.</h2>
              <p className="mt-2 text-sm font-semibold text-slate-300">계산은 Mark가, 해석과 우선순위 판단은 Claude가 담당합니다.</p>
            </div>
            <button
              type="button"
              onClick={generate}
              disabled={loading}
              className="rounded-2xl bg-white px-6 py-4 text-sm font-black text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "AI 분석 중..." : "이번주 AI 인사이트 생성"}
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Kpi title="AI 역할" value="발견/해석" sub="숫자 계산 금지" tone="blue" />
          <Kpi title="분석 관점" value="오프라인 MD" sub="GENERAL IDEA 기준" tone="purple" />
          <Kpi title="저장 위치" value={saved === null ? "대기" : saved ? "AI인사이트" : "미저장"} sub="구글시트 저장" tone={saved ? "green" : "orange"} />
        </section>

        {error && (
          <Card title="오류" tone="yellow">
            <p className="text-sm font-bold text-red-600">{error}</p>
            <p className="mt-2 text-sm text-slate-600">ANTHROPIC_API_KEY 등록, Redeploy, 크레딧 잔액을 확인해주세요.</p>
          </Card>
        )}

        {summary && (
          <Card title="분석 데이터 요약">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">주간 매출</p>
                <p className="mt-2 font-black">{Math.round(summary.weeklySummary?.totalWeekSales || 0).toLocaleString("ko-KR")}원</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">전주비</p>
                <p className="mt-2 font-black">{Number(summary.weeklySummary?.weekChangeRate || 0).toFixed(1)}%</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">점포수</p>
                <p className="mt-2 font-black">{summary.weeklySummary?.storeCount || 0}개</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">프로모션 후보</p>
                <p className="mt-2 font-black">{summary.inventory?.promotionSuggestions?.length || 0}개</p>
              </div>
            </div>
          </Card>
        )}

        {loading && (
          <Card title="Claude 분석 중">
            <div className="rounded-3xl bg-violet-50 p-8 text-center">
              <p className="text-xl font-black text-violet-700">데이터를 읽고 인사이트를 생성하는 중입니다.</p>
              <p className="mt-2 text-sm font-semibold text-slate-500">보통 10~30초 정도 걸릴 수 있습니다.</p>
            </div>
          </Card>
        )}

        {!loading && !insight && !error && (
          <Card title="시작하기">
            <Empty />
            <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">
              버튼을 누르면 Claude가 현재 구글시트 데이터를 기반으로 핵심요약, 상품/점포/재고/프로모션 인사이트와 이번주 액션 TOP5를 생성합니다.
            </p>
          </Card>
        )}

        {insight && (
          <section className="space-y-4">
            {sections.map((section, i) => <SectionBlock key={i} text={section} />)}
          </section>
        )}
      </div>
    </main>
  );
}
