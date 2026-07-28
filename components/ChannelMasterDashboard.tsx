"use client";

import { useEffect, useState } from "react";
import NavTabs from "@/components/NavTabs";
import { Card } from "@/components/Shared";

const TYPE_OPTIONS = ["오프라인매장", "자사몰", "온라인마켓", "위탁", "면세", "기타"];

export default function ChannelMasterDashboard() {
  const [channels, setChannels] = useState<any[]>([]);
  const [status, setStatus] = useState("");

  async function load() {
    const res = await fetch("/api/channel-master", { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setChannels(data.channels || []);
  }

  useEffect(() => {
    load().catch((e) => setStatus(e?.message || "불러오기 실패"));
  }, []);

  async function updateType(rowNumber: number, channelType: string) {
    setStatus("저장 중...");
    const res = await fetch("/api/channel-master", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowNumber, channelType }),
    });
    const data = await res.json();
    setStatus(data.ok ? "저장했습니다." : data.error || "저장 실패");
    await load();
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-black">🔗 Channel Master</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              채널명 → 채널타입(온라인/오프라인 등) 매핑을 관리합니다. 새로 발견된 채널은 자동으로 1차 분류되어 추가되니, 여기서 틀린 것만 고쳐주세요.
            </p>
          </div>
          <NavTabs active="weekly" />
        </header>

        {status && <p className="rounded-2xl bg-blue-50 p-4 text-sm font-black text-blue-700">{status}</p>}

        <Card title={`채널 목록 (${channels.length}개)`}>
          <div className="space-y-2">
            {channels.map((c) => (
              <div key={c.rowNumber} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                <div>
                  <p className="text-sm font-black">{c.channelName}</p>
                  <p className="text-xs font-semibold text-slate-400">업데이트: {c.updatedAt || "-"}</p>
                </div>
                <select
                  value={c.channelType}
                  onChange={(e) => updateType(c.rowNumber, e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            ))}
            {channels.length === 0 && (
              <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                아직 채널이 없습니다. 대시보드를 한 번 로드하면 자동으로 채워집니다.
              </p>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
