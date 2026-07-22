"use client";

import { useEffect, useState } from "react";
import { won, fmtNum } from "@/lib/mark";

function TrendChart({ data }: { data: { date: string; amount: number; companyAmount: number }[] }) {
  if (!data.length) return null;
  const w = 640;
  const h = 200;
  const padL = 8;
  const padR = 8;
  const padT = 16;
  const padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const storeMax = Math.max(...data.map((d) => d.amount), 1);
  const companyMax = Math.max(...data.map((d) => d.companyAmount), 1);
  const step = innerW / Math.max(1, data.length - 1);

  const storePoints = data.map((d, i) => {
    const x = padL + i * step;
    const y = padT + innerH - (d.amount / storeMax) * innerH;
    return { x, y, d };
  });
  const companyPoints = data.map((d, i) => {
    const x = padL + i * step;
    const y = padT + innerH - (d.companyAmount / companyMax) * innerH;
    return { x, y, d };
  });

  const storeLine = storePoints.map((p) => `${p.x},${p.y}`).join(" ");
  const companyLine = companyPoints.map((p) => `${p.x},${p.y}`).join(" ");

  const fmtMD = (dateKey: string) => {
    const [, m, d] = dateKey.split("-");
    return `${Number(m)}/${Number(d)}`;
  };
  const labelIdx = [0, Math.floor((data.length - 1) / 2), data.length - 1];

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs font-bold text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-blue-600" /> 이 매장</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-slate-300" /> 전사(추이 비교용, 각각 자체 최고치 기준 정규화)</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 220 }}>
        <polyline points={companyLine} fill="none" stroke="#cbd5e1" strokeWidth="2.5" />
        <polyline points={storeLine} fill="none" stroke="#2563eb" strokeWidth="3" />
        {storePoints.map((p, i) => (
          <g key={p.d.date}>
            <circle cx={p.x} cy={p.y} r="3.5" fill="#2563eb" />
            <title>{`${p.d.date}: ${won(p.d.amount)} (전사 ${won(p.d.companyAmount)})`}</title>
            {labelIdx.includes(i) && (
              <text x={p.x} y={h - 6} fontSize="11" fill="#64748b" textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}>
                {fmtMD(p.d.date)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between text-xs font-bold text-slate-500">
        <span>최근 매출: {won(data[data.length - 1].amount)}</span>
        <span>14일 평균: {won(data.reduce((s, d) => s + d.amount, 0) / data.length)}</span>
      </div>
    </div>
  );
}

function StoreCardsSection({ storeName, date }: { storeName: string; date: string }) {
  const [cards, setCards] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!storeName) return;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ store: storeName });
    if (date) params.set("date", date);
    fetch(`/api/store-cards?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error || "카드 생성 실패");
        setCards(json.cards);
      })
      .catch((e) => setError(e?.message || "카드 생성 실패"))
      .finally(() => setLoading(false));
  }, [storeName, date]);

  if (!storeName) return null;
  if (loading) return <p className="text-sm font-bold text-slate-400">매장 카드 불러오는 중...</p>;
  if (error) return <p className="text-sm font-black text-red-600">⚠ {error}</p>;
  if (!cards) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black text-slate-500">이번주 누계매출 ({cards.week.start}~{cards.week.end})</p>
          <p className="mt-1 text-xl font-black text-slate-900">{won(cards.week.cumulative)}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-slate-500">
            <div className="rounded-xl bg-slate-50 p-2">
              <p>예상 달성액</p>
              <p className="mt-1 text-sm font-black text-slate-900">{won(cards.week.projected)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2">
              <p>예상 달성률</p>
              <p className="mt-1 text-sm font-black text-slate-900">{cards.week.target ? `${cards.week.projectedRate.toFixed(0)}%` : "목표없음"}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black text-slate-500">이번달 누계매출 ({cards.month.start}~{cards.month.end})</p>
          <p className="mt-1 text-xl font-black text-slate-900">{won(cards.month.cumulative)}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-slate-500">
            <div className="rounded-xl bg-slate-50 p-2">
              <p>예상 달성액</p>
              <p className="mt-1 text-sm font-black text-slate-900">{won(cards.month.projected)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2">
              <p>예상 달성률(추정목표)</p>
              <p className="mt-1 text-sm font-black text-slate-900">{cards.month.targetEstimate ? `${cards.month.projectedRate.toFixed(0)}%` : "목표없음"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black text-slate-500">재고 / RT 현황</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[11px] font-bold text-slate-400">총재고</p>
              <p className="text-sm font-black text-slate-900">{fmtNum(cards.inventory.totalStock)}개</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400">최근 30일 RT 입고</p>
              <p className="text-sm font-black text-blue-600">+{fmtNum(cards.inventory.rtIn)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400">최근 30일 RT 출고</p>
              <p className="text-sm font-black text-rose-600">-{fmtNum(cards.inventory.rtOut)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-sky-50 p-4">
          <p className="text-xs font-black text-sky-700">오늘 날씨</p>
          {cards.weather ? (
            <p className="mt-1 text-sm font-black text-slate-900">
              {cards.weather.weather} · 최고 {cards.weather.maxTemp}° / 최저 {cards.weather.minTemp}° · 강수확률 {cards.weather.rainChance}%
            </p>
          ) : (
            <p className="mt-1 text-sm font-bold text-slate-400">날씨 정보 없음(지역 매핑 확인 필요)</p>
          )}
        </div>
      </div>

      {cards.activeEvents?.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-black text-amber-700">🎪 진행중인 이벤트</p>
          <ul className="mt-1 space-y-1 text-sm font-semibold text-slate-700">
            {cards.activeEvents.map((e: any, i: number) => (
              <li key={i}>• {e.content || e.title} ({e.startDate}~{e.endDate})</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-black text-slate-500">최근 14일 매출 추이</p>
        <TrendChart data={cards.trend} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-black text-slate-700">전사 TOP10 vs 이 매장 순위</p>
        <div className="mt-3 space-y-2">
          {(cards.top10Comparison || []).map((p: any) => {
            const medal = ["🥇", "🥈", "🥉"][p.companyRank - 1];
            return (
              <div key={p.styleCode} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-black text-white">
                  {medal || p.companyRank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-900">{p.styleCode}</p>
                  <p className="truncate text-xs font-semibold text-slate-500">{p.productName}</p>
                </div>
                {p.storeRank ? (
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black text-white ${p.diff && p.diff > 0 ? "bg-rose-500" : "bg-blue-600"}`}>
                    이 매장 {p.storeRank}위
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-slate-300 px-3 py-1 text-xs font-black text-slate-600">이 매장 미판매</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {cards.stockInsights?.length > 0 && (
        <div className="rounded-2xl bg-purple-50 p-4">
          <p className="text-xs font-black text-purple-700">💡 재고 확인 제안 (전사는 잘 팔리는데 이 매장은 부진)</p>
          <ul className="mt-2 space-y-2 text-sm font-semibold text-slate-700">
            {cards.stockInsights.map((s: any, i: number) => (
              <li key={i} className={`rounded-xl p-2 ${s.type === "stockout" ? "bg-red-100" : "bg-white"}`}>
                • {s.styleCode}({s.productName}): {s.suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

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

      {selectedStore && (
        <div className="mt-6 border-t border-slate-100 pt-6">
          <StoreCardsSection storeName={selectedStore} date={selectedDate || briefing?.targetDate || ""} />
        </div>
      )}
    </section>
  );
}
