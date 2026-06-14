"use client";

import { useState } from "react";
import Link from "next/link";
import NavTabs from "@/components/NavTabs";

function Badge({ status }: { status: string }) {
  const s = String(status || "pending").toLowerCase();
  const cls = s === "approved" ? "bg-emerald-100 text-emerald-700" : s === "rejected" ? "bg-rose-100 text-rose-700" : s === "hold" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${cls}`}>{s}</span>;
}

export default function LogicCenter() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("Promotion");
  const [title, setTitle] = useState("");
  const [proposal, setProposal] = useState("");

  async function load(pw = password) {
    setStatus("불러오는 중...");
    const res = await fetch(`/api/logic?password=${encodeURIComponent(pw)}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setStatus(data.error || "불러오기 실패");
      setUnlocked(false);
      return;
    }
    setItems(data.items || []);
    setUnlocked(true);
    setStatus("");
  }

  async function createLogic() {
    if (!proposal.trim()) {
      setStatus("제안 내용을 입력해주세요.");
      return;
    }
    setStatus("저장 중...");
    const res = await fetch("/api/logic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, action: "create", category, title, proposal }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setStatus(data.error || "저장 실패");
      return;
    }
    setTitle("");
    setProposal("");
    setStatus("로직 제안을 등록했습니다.");
    await load();
  }

  async function updateStatus(rowNumber: number, nextStatus: string) {
    setStatus("상태 변경 중...");
    const res = await fetch("/api/logic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, action: "status", rowNumber, status: nextStatus, approvedBy: "소천" }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setStatus(data.error || "상태 변경 실패");
      return;
    }
    setStatus("상태를 변경했습니다.");
    await load();
  }

  const pending = items.filter((x) => x.status === "pending");
  const approved = items.filter((x) => x.status === "approved");
  const others = items.filter((x) => x.status !== "pending" && x.status !== "approved");

  if (!unlocked) {
    return (
      <main className="min-h-screen p-6">
        <div className="mx-auto max-w-xl space-y-6">
          <h1 className="text-3xl font-black">🧠 Logic Center</h1>
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-sm font-bold text-slate-500">비밀번호를 입력하세요.</p>
            <input
              type="password"
              className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-lg font-black outline-none focus:border-slate-900"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") load(e.currentTarget.value); }}
              placeholder="Logic Center Password"
            />
            <button onClick={() => load()} className="mt-4 w-full rounded-2xl bg-slate-900 px-5 py-3 font-black text-white">입장</button>
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
            <h1 className="text-3xl font-black">🧠 Logic Center Mark4.8.1</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">Claude Chat/Code 제안을 붙여넣고 승인·보류·거절합니다.</p>
          </div>
          <NavTabs active="weekly" />
        </header>

        {status && <section className="rounded-2xl bg-blue-50 p-4 text-sm font-black text-blue-700">{status}</section>}


        <section className="rounded-3xl border border-violet-100 bg-violet-50 p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black text-violet-500">RESEARCH AGENT</p>
              <h2 className="text-xl font-black">🔬 Claude Research Agent</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">Snapshot, Logic, AI인사이트, 시트 구조를 묶어 Claude Code/Chat 연구 프롬프트를 생성합니다.</p>
            </div>
            <Link href="/research" className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white">
              Research Agent 열기
            </Link>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">Claude 제안 등록</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <select className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option>Promotion</option>
              <option>Inventory</option>
              <option>RT</option>
              <option>Store</option>
              <option>AI Insight</option>
              <option>General</option>
            </select>
            <input className="md:col-span-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" />
          </div>
          <textarea className="mt-3 h-52 w-full rounded-2xl border border-slate-200 p-4 text-sm font-semibold leading-6 outline-none focus:border-slate-900" value={proposal} onChange={(e) => setProposal(e.target.value)} placeholder="Claude Chat/Claude Code가 제안한 로직을 여기에 붙여넣으세요." />
          <button onClick={createLogic} className="mt-3 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white">로직 등록</button>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">대기중 제안</h2>
            <div className="mt-4 max-h-[620px] space-y-3 overflow-y-auto pr-2">
              {pending.length === 0 && <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">대기중 제안이 없습니다.</p>}
              {pending.map((it) => (
                <div key={it.rowNumber} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-slate-500">{it.createdAt} · {it.category}</p>
                      <p className="mt-1 font-black">{it.title}</p>
                    </div>
                    <Badge status={it.status} />
                  </div>
                  <pre className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-xs font-semibold leading-5 text-slate-700">{it.proposal}</pre>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => updateStatus(it.rowNumber, "approved")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">승인</button>
                    <button onClick={() => updateStatus(it.rowNumber, "hold")} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white">보류</button>
                    <button onClick={() => updateStatus(it.rowNumber, "rejected")} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white">거절</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">승인된 로직</h2>
            <div className="mt-4 max-h-[620px] space-y-3 overflow-y-auto pr-2">
              {approved.length === 0 && <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">승인된 로직이 없습니다.</p>}
              {approved.map((it) => (
                <div key={it.rowNumber} className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-slate-500">{it.createdAt} · {it.category}</p>
                      <p className="mt-1 font-black">{it.title}</p>
                    </div>
                    <Badge status={it.status} />
                  </div>
                  <pre className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-xs font-semibold leading-5 text-slate-700">{it.proposal}</pre>
                </div>
              ))}
            </div>
          </div>
        </section>

        {others.length > 0 && (
          <section className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">보류/거절 이력</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {others.map((it) => (
                <div key={it.rowNumber} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-black">{it.title}</p>
                    <Badge status={it.status} />
                  </div>
                  <p className="mt-1 text-xs font-bold text-slate-500">{it.category} · {it.approvedBy}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
