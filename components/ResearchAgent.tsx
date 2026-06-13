"use client";

import { useState } from "react";
import Link from "next/link";
import NavTabs from "@/components/NavTabs";

export default function ResearchAgent() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [status, setStatus] = useState("");
  const [prompt, setPrompt] = useState("");
  const [pack, setPack] = useState<any>(null);
  const [resultText, setResultText] = useState("");
  const [savedCount, setSavedCount] = useState<number | null>(null);

  async function buildPack(pw = password) {
    setStatus("Research Input Pack 생성 중...");
    const res = await fetch(`/api/research?password=${encodeURIComponent(pw)}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setStatus(data.error || "생성 실패");
      setUnlocked(false);
      return;
    }
    setPack(data.pack);
    setPrompt(data.prompt || "");
    setUnlocked(true);
    setStatus("Research Input Pack 생성 완료");
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setStatus("프롬프트를 복사했습니다. Claude Code 또는 Claude Chat에 붙여넣으세요.");
  }

  async function saveResearchResult() {
    if (!resultText.trim()) {
      setStatus("Claude 연구 결과를 붙여넣어 주세요.");
      return;
    }
    setStatus("Logic_Master에 pending 저장 중...");
    setSavedCount(null);

    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, resultText }),
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      setStatus(data.error || "저장 실패");
      return;
    }

    setSavedCount(data.count || 0);
    setResultText("");
    setStatus(`${data.count || 0}개의 로직 제안을 pending 상태로 저장했습니다.`);
  }

  if (!unlocked) {
    return (
      <main className="min-h-screen p-6">
        <div className="mx-auto max-w-xl space-y-6">
          <h1 className="text-3xl font-black">🔬 Claude Research Agent</h1>
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-sm font-bold text-slate-500">Logic Center 비밀번호를 입력하세요.</p>
            <input
              type="password"
              className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-lg font-black outline-none focus:border-slate-900"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") buildPack(e.currentTarget.value); }}
              placeholder="Research Password"
            />
            <button onClick={() => buildPack()} className="mt-4 w-full rounded-2xl bg-slate-900 px-5 py-3 font-black text-white">Research Pack 생성</button>
            {status && <p className="mt-3 text-sm font-bold text-red-600">{status}</p>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-black">🔬 Claude Research Agent Mark4.7.2</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">Snapshot, Logic, AI인사이트, 시트 구조를 묶어 Claude Code/Chat 연구용 프롬프트를 만듭니다.</p>
          </div>
          <NavTabs active="logic" />
        </header>

        {status && <section className="rounded-2xl bg-blue-50 p-4 text-sm font-black text-blue-700">{status}</section>}

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs font-bold text-slate-500">Snapshot</p>
            <p className="mt-2 text-2xl font-black">{pack?.snapshotMaster?.recentRows?.length || 0}건</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs font-bold text-slate-500">Logic</p>
            <p className="mt-2 text-2xl font-black">{pack?.logicMaster?.rows?.length || 0}건</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs font-bold text-slate-500">AI인사이트</p>
            <p className="mt-2 text-2xl font-black">{pack?.aiInsights?.recentRows?.length || 0}건</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs font-bold text-slate-500">시트 구조</p>
            <p className="mt-2 text-2xl font-black">{pack?.spreadsheet?.structure?.length || 0}개</p>
          </div>
        </section>

        <section className="rounded-3xl bg-slate-900 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-300">How to use</p>
              <h2 className="mt-1 text-2xl font-black">Claude Code/Chat에 복사해서 신규 로직을 받으세요.</h2>
              <p className="mt-2 text-sm font-semibold text-slate-300">결과를 아래에 붙여넣으면 Logic_Master에 pending 제안으로 자동 저장됩니다.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={copyPrompt} className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-900">프롬프트 복사</button>
              <Link href="/logic" className="rounded-2xl border border-white/30 px-5 py-3 text-sm font-black text-white">Logic Center 열기</Link>
            </div>
          </div>
        </section>


        <section className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-black text-emerald-600">Research Result → Logic_Master</p>
              <h2 className="mt-1 text-xl font-black">Claude 연구 결과 등록</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">Claude Code/Chat이 생성한 [로직 제안] 결과를 붙여넣으면 자동으로 분리되어 pending 상태로 저장됩니다.</p>
              {savedCount !== null && <p className="mt-2 text-sm font-black text-emerald-700">최근 저장: {savedCount}개</p>}
            </div>
            <Link href="/logic" className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white">Logic Center에서 확인</Link>
          </div>
          <textarea
            className="mt-4 h-72 w-full rounded-2xl border border-emerald-100 bg-white p-4 text-sm font-semibold leading-6 outline-none focus:border-emerald-500"
            value={resultText}
            onChange={(e) => setResultText(e.target.value)}
            placeholder="[로직 제안]\nCategory: Promotion\nTitle: ...\nProblem: ...\nCondition_JSON: ...\nAction: ...\nReason: ...\nExpected_Effect: ...\nRisk: ...\nPriority: High"
          />
          <button onClick={saveResearchResult} className="mt-3 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white">
            Logic_Master에 Pending 저장
          </button>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-black">Research Prompt</h2>
            <button onClick={() => buildPack()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">새로 생성</button>
          </div>
          <textarea
            className="h-[620px] w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-5 outline-none"
            value={prompt}
            readOnly
          />
        </section>
      </div>
    </main>
  );
}
