"use client";

import { useState } from "react";
import NavTabs from "@/components/NavTabs";

function Badge({ status }: { status: string }) {
  const s = String(status || "pending").toLowerCase();
  const cls =
    s === "active" || s === "approved" || s === "promoted" || s === "completed"
      ? "bg-emerald-100 text-emerald-700"
      : s === "rejected" || s === "failed"
        ? "bg-rose-100 text-rose-700"
        : s === "hold" || s === "processing"
          ? "bg-amber-100 text-amber-700"
          : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${cls}`}>{s || "pending"}</span>;
}

function Priority({ value }: { value: string }) {
  const v = String(value || "Medium");
  const cls =
    v.toLowerCase() === "high"
      ? "bg-rose-100 text-rose-700"
      : v.toLowerCase() === "low"
        ? "bg-slate-100 text-slate-600"
        : "bg-blue-100 text-blue-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${cls}`}>{v}</span>;
}

export default function LogicCenter() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [proposals, setProposals] = useState<any[]>([]);
  const [masters, setMasters] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [status, setStatus] = useState("");

  const [category, setCategory] = useState("RT");
  const [priority, setPriority] = useState("Medium");
  const [title, setTitle] = useState("");
  const [proposal, setProposal] = useState("");
  const [requestText, setRequestText] = useState("");

  async function load(pw = password) {
    setStatus("불러오는 중...");
    const res = await fetch(`/api/logic?password=${encodeURIComponent(pw)}`, { cache: "no-store" });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      setStatus(data.error || "불러오기 실패");
      setUnlocked(false);
      return;
    }

    setProposals(data.proposals || []);
    setMasters(data.masters || []);
    setRequests(data.requests || []);
    setResults(data.results || []);
    setUnlocked(true);
    setStatus("");
  }

  async function createLogic() {
    if (!proposal.trim()) {
      setStatus("제안 내용을 입력해주세요.");
      return;
    }

    setStatus("제안 저장 중...");
    const res = await fetch("/api/logic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, action: "create", category, title, proposal, priority }),
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      setStatus(data.error || "저장 실패");
      return;
    }

    setTitle("");
    setProposal("");
    setStatus("Logic_Proposal에 pending으로 등록했습니다.");
    await load();
  }

  async function createResearchRequest() {
    if (!requestText.trim()) {
      setStatus("리서치 요청 내용을 입력해주세요.");
      return;
    }

    setStatus("Research_Request 생성 중...");
    const res = await fetch("/api/logic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, action: "request", type: category, request: requestText }),
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      setStatus(data.error || "요청 생성 실패");
      return;
    }

    setRequestText("");
    setStatus("Research_Request를 생성했습니다. Agent가 실행 중이면 자동 처리됩니다.");
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

    setStatus(nextStatus === "approved" ? "승인했습니다. Agent가 다음 실행 때 Logic_Master로 승격합니다." : "상태를 변경했습니다.");
    await load();
  }

  const pending = proposals.filter((x) => x.status === "pending");
  const approvedWaiting = proposals.filter((x) => x.status === "approved");
  const promoted = proposals.filter((x) => x.status === "promoted");
  const archived = proposals.filter((x) => ["hold", "rejected"].includes(x.status));
  const activeMasters = masters.filter((x) => x.status === "active");

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
              onKeyDown={(e) => {
                if (e.key === "Enter") load(e.currentTarget.value);
              }}
              placeholder="Logic Center Password"
            />
            <button onClick={() => load()} className="mt-4 w-full rounded-2xl bg-slate-900 px-5 py-3 font-black text-white">
              입장
            </button>
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
            <h1 className="text-3xl font-black">🧠 Logic Center Mark5</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Research Agent 제안 → 승인 → Logic_Master 자산화 흐름을 관리합니다.
            </p>
          </div>
          <NavTabs active="weekly" />
        </header>

        {status && <section className="rounded-2xl bg-blue-50 p-4 text-sm font-black text-blue-700">{status}</section>}

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs font-black text-slate-400">PENDING</p>
            <p className="mt-2 text-3xl font-black">{pending.length}</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs font-black text-slate-400">APPROVED WAIT</p>
            <p className="mt-2 text-3xl font-black">{approvedWaiting.length}</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs font-black text-slate-400">ACTIVE MASTER</p>
            <p className="mt-2 text-3xl font-black">{activeMasters.length}</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs font-black text-slate-400">RECENT REQUEST</p>
            <p className="mt-2 text-3xl font-black">{requests.length}</p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">Research_Request 수동 생성</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">Trigger가 아닌 직접 연구 요청을 만들 때 사용합니다.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <select className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option>Validation</option>
                <option>RT</option>
                <option>Inventory</option>
                <option>Sales</option>
                <option>Promotion</option>
                <option>General</option>
              </select>
              <button onClick={createResearchRequest} className="md:col-span-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white">
                Research_Request 생성
              </button>
            </div>
            <textarea
              className="mt-3 h-32 w-full rounded-2xl border border-slate-200 p-4 text-sm font-semibold leading-6 outline-none focus:border-slate-900"
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              placeholder="예: RT Smart Transfer Engine V1의 수치 검증 포인트와 개선안을 제안해줘."
            />
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">Logic_Proposal 수동 등록</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">Claude 결과를 직접 붙여넣어 pending 제안으로 저장합니다.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <select className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option>RT</option>
                <option>Inventory</option>
                <option>Sales</option>
                <option>Promotion</option>
                <option>Store</option>
                <option>Validation</option>
                <option>General</option>
              </select>
              <select className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
              <input className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" />
            </div>
            <textarea
              className="mt-3 h-32 w-full rounded-2xl border border-slate-200 p-4 text-sm font-semibold leading-6 outline-none focus:border-slate-900"
              value={proposal}
              onChange={(e) => setProposal(e.target.value)}
              placeholder="로직 제안 내용을 붙여넣으세요."
            />
            <button onClick={createLogic} className="mt-3 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white">
              Logic_Proposal 등록
            </button>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">대기중 Logic_Proposal</h2>
            <div className="mt-4 max-h-[680px] space-y-3 overflow-y-auto pr-2">
              {pending.length === 0 && <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">대기중 제안이 없습니다.</p>}
              {pending.map((it) => (
                <div key={it.rowNumber} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-slate-500">{it.createdAt} · {it.category} · {it.sourceRequestId}</p>
                      <p className="mt-1 font-black">{it.title}</p>
                    </div>
                    <div className="flex gap-2">
                      <Priority value={it.priority} />
                      <Badge status={it.status} />
                    </div>
                  </div>
                  <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-xs font-semibold leading-5 text-slate-700">{it.proposal}</pre>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => updateStatus(it.rowNumber, "approved")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
                      승인
                    </button>
                    <button onClick={() => updateStatus(it.rowNumber, "hold")} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white">
                      보류
                    </button>
                    <button onClick={() => updateStatus(it.rowNumber, "rejected")} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white">
                      거절
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">Logic_Master active</h2>
            <div className="mt-4 max-h-[680px] space-y-3 overflow-y-auto pr-2">
              {activeMasters.length === 0 && <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">active 로직이 없습니다.</p>}
              {activeMasters.map((it) => (
                <div key={it.rowNumber} className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-slate-500">{it.createdAt} · {it.category} · {it.version}</p>
                      <p className="mt-1 font-black">{it.title}</p>
                    </div>
                    <Badge status={it.status} />
                  </div>
                  <pre className="mt-3 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-xs font-semibold leading-5 text-slate-700">{it.proposal}</pre>
                  <p className="mt-2 text-xs font-bold text-slate-500">Approved: {it.approvedBy || "-"} · {it.approvedAt || "-"}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">최근 Research_Request</h2>
            <div className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-2">
              {requests.map((it) => (
                <div key={it.rowNumber} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black">{it.id}</p>
                    <Badge status={it.status} />
                  </div>
                  <p className="mt-1 text-xs font-bold text-slate-500">{it.createdAt} · {it.type} · {it.processedAt}</p>
                  <p className="mt-2 line-clamp-3 text-xs font-semibold leading-5 text-slate-600">{it.request}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">최근 Research_Result</h2>
            <div className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-2">
              {results.map((it) => (
                <div key={it.rowNumber} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black">{it.requestId || it.id}</p>
                    <Badge status={it.status} />
                  </div>
                  <p className="mt-1 text-xs font-bold text-slate-500">{it.createdAt}</p>
                  <pre className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap text-xs font-semibold leading-5 text-slate-600">{it.result}</pre>
                </div>
              ))}
            </div>
          </div>
        </section>

        {(approvedWaiting.length > 0 || promoted.length > 0 || archived.length > 0) && (
          <section className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">Proposal 이력</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[...approvedWaiting, ...promoted, ...archived].map((it) => (
                <div key={it.rowNumber} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black">{it.title}</p>
                    <Badge status={it.status} />
                  </div>
                  <p className="mt-1 text-xs font-bold text-slate-500">{it.category} · {it.priority} · {it.approvedBy || "-"}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
