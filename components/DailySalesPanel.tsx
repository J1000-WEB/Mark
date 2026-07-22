"use client";

import { useEffect, useState } from "react";
import { Card, Empty, Kpi } from "@/components/Shared";
import { fmtNum, won } from "@/lib/mark";

function RowList({ rows, mode }: { rows: any[]; mode: "product" | "channel" | "risk" }) {
  if (!rows?.length) return <Empty />;

  return (
    <div className="max-h-[440px] space-y-2 overflow-y-auto pr-2">
      {rows.slice(0, 20).map((row, idx) => (
        <div key={`${mode}-${idx}-${row.styleCode || row.channelName}`} className="rounded-2xl border border-slate-100 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">
                {mode === "channel" ? row.channelName : row.productName}
              </p>
              {mode !== "channel" && <p className="mt-1 text-xs font-bold text-slate-400">{row.styleCode}</p>}
              {mode === "channel" && <p className="mt-1 text-xs font-bold text-slate-400">판매 SKU {fmtNum(row.skuCount || 0)}개</p>}
            </div>
            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-black text-white">#{idx + 1}</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-bold text-slate-500">
            <div className="rounded-xl bg-slate-50 p-2">
              <p>일간판매</p>
              <p className="mt-1 text-sm font-black text-slate-900">{fmtNum(row.dailySales || 0)}개</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2">
              <p>금액</p>
              <p className="mt-1 text-sm font-black text-slate-900">{won(row.dailyAmount || 0)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2">
              <p>{mode === "channel" ? "SKU" : "재고"}</p>
              <p className="mt-1 text-sm font-black text-slate-900">{fmtNum(mode === "channel" ? row.skuCount || 0 : row.stock || 0)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DailyStoreBriefingSection() {
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

export default function DailySalesPanel() {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setStatus("");
    const res = await fetch("/api/daily-sales", { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setData(json.data);
    else setStatus(json.error || "Daily Sales 데이터를 불러오지 못했습니다.");
  }

  async function saveHistory() {
    setSaving(true);
    setStatus("Daily_Sales_History 저장 중...");
    try {
      const res = await fetch("/api/daily-sales", { method: "POST", cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "저장 실패");
      setData(json.data);
      setStatus(`저장 완료: ${json.saved?.saveId} / ${fmtNum(json.saved?.rows || 0)}행`);
    } catch (error: any) {
      setStatus(error?.message || "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load().catch(() => setStatus("Daily Sales 데이터를 불러오지 못했습니다."));
  }, []);

  if (!data) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-black text-slate-500">{status || "Daily Sales 불러오는 중..."}</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <DailyStoreBriefingSection />

      <section className="rounded-3xl bg-slate-950 p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black text-slate-400">DAILY SALES SNAPSHOT</p>
            <h2 className="mt-1 text-2xl font-black">일간 판매 데이터</h2>
            <p className="mt-2 text-sm font-semibold text-slate-300">
              {data.sheetName} · 기준일자 {data.sourceDate}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={load} className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/20">
              새로고침
            </button>
            <button type="button" onClick={saveHistory} disabled={saving} className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-900 disabled:opacity-50">
              {saving ? "저장 중..." : "일간 스냅샷 저장"}
            </button>
          </div>
        </div>
      </section>

      {status && <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-black text-blue-700">{status}</div>}

      <section className="grid gap-4 md:grid-cols-4">
        <Kpi title="일간 판매수량" value={`${fmtNum(data.totalDailySales || 0)}개`} tone="green" />
        <Kpi title="일간 판매금액" value={won(data.totalDailyAmount || 0)} tone="blue" />
        <Kpi title="판매 채널" value={`${fmtNum(data.activeChannels || 0)}개`} tone="purple" />
        <Kpi title="판매 상품" value={`${fmtNum(data.activeProducts || 0)}개`} tone="orange" />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card title="오늘 판매 TOP 상품">
          <RowList rows={data.topProducts || []} mode="product" />
        </Card>
        <Card title="오늘 판매 채널 TOP">
          <RowList rows={data.topChannels || []} mode="channel" />
        </Card>
        <Card title="일간 결품위험">
          <RowList rows={data.stockoutRisk || []} mode="risk" />
        </Card>
      </section>
    </section>
  );
}
