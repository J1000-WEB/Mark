"use client";

import { useEffect, useState } from "react";
import NavTabs from "@/components/NavTabs";

function SnapshotCard({ title, schedule }: { title: string; schedule: string }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">{title}</p>
          <p className="mt-2 text-xl font-black">{schedule}</p>
        </div>
        <span className="rounded-full bg-rose-50 px-3 py-1 text-sm font-black text-rose-600">OFF</span>
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-500">엔진 구현 완료 / 자동 저장은 안정화 후 ON 예정</p>
    </div>
  );
}

export default function SnapshotDashboard() {
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadHistory() {
    const res = await fetch("/api/snapshots", { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setRows(data.rows || []);
  }

  async function saveSnapshot(type = "manual") {
    setLoading(true);
    setStatus("스냅샷 저장 중...");
    try {
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "저장 실패");
      setStatus(`저장 완료: ${data.summary}`);
      await loadHistory();
    } catch (e: any) {
      setStatus(e?.message || "저장 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory().catch(() => {});
  }, []);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-black">📸 Snapshot Center Mark4.3.3.3</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">현재 데이터 상태를 Snapshot_Master 시트에 압축 저장합니다.</p>
          </div>
          <NavTabs active="snapshot" />
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <SnapshotCard title="일간 스냅샷" schedule="매일 15:00" />
          <SnapshotCard title="주간 스냅샷" schedule="월요일 11:00" />
          <SnapshotCard title="월간 스냅샷" schedule="매월 2일 11:00" />
        </section>

        <section className="rounded-3xl bg-slate-900 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-300">Snapshot Engine</p>
              <h2 className="mt-1 text-2xl font-black">수동 스냅샷 저장</h2>
              <p className="mt-2 text-sm font-semibold text-slate-300">Drive 스크린샷 저장은 Mark4.4에서 연결 예정입니다. 현재는 JSON 데이터 저장입니다.</p>
            </div>
            <button
              type="button"
              onClick={() => saveSnapshot("manual")}
              disabled={loading}
              className="rounded-2xl bg-white px-6 py-4 text-sm font-black text-slate-900 disabled:opacity-50"
            >
              {loading ? "저장 중..." : "📸 현재 스냅샷 저장"}
            </button>
          </div>
        </section>

        {status && (
          <section className="rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm font-black text-blue-700">
            {status}
          </section>
        )}

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-black">최근 스냅샷 이력</h2>
            <button type="button" onClick={loadHistory} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">새로고침</button>
          </div>
          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-2">
            {rows.length === 0 && <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">저장된 스냅샷이 없습니다.</div>}
            {rows.map((r, i) => (
              <div key={i} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">{r[0]} · {r[1]}</p>
                    <p className="mt-1 font-black">{r[2]}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500">JSON 저장</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
