"use client";

import { useEffect, useState } from "react";
import { won } from "@/lib/mark";

export default function StoreDashboard() {
  const [stores, setStores] = useState<string[]>([]);
  const [selectedStore, setSelectedStore] = useState(""); // "" = 전사
  const [selectedDate, setSelectedDate] = useState(""); // "" = 기본값(어제)
  const [briefing, setBriefing] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadBriefing(store: string, date: string, withStores = false) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (store) params.set("store", store);
      if (date) params.set("date", date);
      if (withStores) params.set("stores", "1");
      const res = await fetch(`/api/daily-briefing?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "브리핑 생성 실패");
      setBriefing(json.briefing);
      if (json.stores) setStores(json.stores);
    } catch (e: any) {
      setError(e?.message || "브리핑 생성 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBriefing("", "", true);
  }, []);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-400">DAILY AI BRIEFING</p>
          <h2 className="mt-1 text-xl font-black text-slate-900">일간(매장) 브리핑</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={selectedDate || (briefing?.targetDate || "")}
            onChange={(e) => { setSelectedDate(e.target.value); loadBriefing(selectedStore, e.target.value); }}
            className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-bold"
          />
          <select
            value={selectedStore}
            onChange={(e) => { setSelectedStore(e.target.value); loadBriefing(e.target.value, selectedDate); }}
            className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-bold"
          >
            <option value="">전사 (전체 매장)</option>
            {stores.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="mt-4 text-sm font-bold text-slate-400">불러오는 중...</p>}
      {error && <p className="mt-4 text-sm font-black text-red-600">⚠ {error}</p>}

      {briefing && !loading && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold text-slate-500">{briefing.scope} {briefing.targetDate} 매출</p>
              <p className="mt-1 text-lg font-black text-slate-900">{won(briefing.targetAmount)}</p>
            </div>
            <div className={`rounded-2xl p-4 ${briefing.changeRate >= 0 ? "bg-blue-50" : "bg-rose-50"}`}>
              <p className="text-xs font-bold text-slate-500">{briefing.compareLabel}({briefing.compareDate}) 대비</p>
              <p className={`mt-1 text-lg font-black ${briefing.changeRate >= 0 ? "text-blue-600" : "text-rose-600"}`}>
                {briefing.changeRate >= 0 ? "+" : ""}{briefing.changeRate.toFixed(1)}%
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold text-slate-500">{briefing.compareLabel} 매출</p>
              <p className="mt-1 text-lg font-black text-slate-900">{won(briefing.compareAmount)}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-purple-50 p-4">
            <p className="text-xs font-black text-purple-700">💡 AI 브리핑</p>
            <ul className="mt-2 space-y-1 text-sm font-semibold leading-6 text-slate-700">
              {(briefing.briefing || []).map((line: string, i: number) => <li key={i}>• {line}</li>)}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
