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
            <h1 className="text-3xl font-black">🔬 Claude Research Agent Mark4.6</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">Snapshot, Logic, AI인사이트, 시트 구조를 묶어 Claude Code/Chat 연구용 프롬프트를 만듭니다.</p>
          </div>
          <NavTabs active="research" />
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
              <p className="mt-2 text-sm font-semibold text-slate-300">결과는 Logic Center에 붙여넣고 승인/보류/거절하면 됩니다.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={copyPrompt} className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-900">프롬프트 복사</button>
              <Link href="/logic" className="rounded-2xl border border-white/30 px-5 py-3 text-sm font-black text-white">Logic Center 열기</Link>
            </div>
          </div>
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
