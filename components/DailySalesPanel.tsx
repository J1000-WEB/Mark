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

export default function DailySalesPanel() {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [live, setLive] = useState(false);

  async function load(liveOverride?: boolean) {
    setStatus("");
    const isLive = liveOverride ?? live;
    const res = await fetch(`/api/daily-sales${isLive ? "?live=1" : ""}`, { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setData(json.data);
    else setStatus(json.error || "Daily Sales 데이터를 불러오지 못했습니다.");
  }

  function toggleLive() {
    const next = !live;
    setLive(next);
    setData(null);
    load(next).catch(() => setStatus("Daily Sales 데이터를 불러오지 못했습니다."));
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
    load(false).catch(() => setStatus("Daily Sales 데이터를 불러오지 못했습니다."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <section className="rounded-3xl bg-slate-950 p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black text-slate-400">DAILY SALES SNAPSHOT</p>
            <h2 className="mt-1 text-2xl font-black">일간 판매 데이터</h2>
            <p className="mt-2 text-sm font-semibold text-slate-300">
              {data.sheetName} · 기준일자 {data.sourceDate}
              {data.isLive ? (
                <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-black text-emerald-300">실시간</span>
              ) : (
                <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs font-black text-slate-300">전일 확정치</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* MARK 6.83: 기본은 전일(확정치)로 보여주고, 이 버튼 눌러야 오늘 실시간으로 전환됩니다. */}
            <button
              type="button"
              onClick={toggleLive}
              className={`rounded-2xl px-4 py-3 text-sm font-black ${live ? "bg-emerald-500 text-white" : "bg-white/10 text-white hover:bg-white/20"}`}
            >
              {live ? "전일 확정치로 보기" : "실시간 확인"}
            </button>
            <button type="button" onClick={() => load()} className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/20">
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
