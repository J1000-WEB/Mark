"use client";

import { useEffect, useRef, useState } from "react";
import NavTabs from "@/components/NavTabs";
import { Card, Empty, Kpi } from "@/components/Shared";
import { fmtNum, won } from "@/lib/mark";

// MARK: "재고컨트롤 실시간 재고조회랑 매출조회도 ERP에이전트에서 하고있잖아 그걸기반으로
// 실시간 탭을 하나 만들고싶거든?" 요청으로 만든 탭입니다.
// - 매출: run-loop.js(scrape.js+parse-and-upload.js)가 10분마다 Daily_Sales_History의
//   "오늘" 행을 갱신하므로, 그걸 그대로 읽어서 보여줍니다.
// - 재고: daily-snapshot.js가 새벽에 1회(보통 "어제" 날짜로) 실재고를 씁니다. 낮 동안은
//   재고 조회 자체가 갱신되지 않으므로, "새벽 재고 - 오늘 누적판매"로 추정치를 계산해서
//   보여줍니다(정확한 실시간 재고가 아니라 추정치임을 화면에 명시합니다).

const AUTO_REFRESH_MS = 3 * 60 * 1000; // 3분마다 자동 새로고침

function fmtTime(d: Date | null) {
  if (!d) return "";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function ChannelRankList({ rows }: { rows: any[] }) {
  if (!rows?.length) return <Empty />;
  return (
    <div className="max-h-[440px] space-y-2 overflow-y-auto pr-2">
      {rows.slice(0, 20).map((row, idx) => (
        <div key={`${row.channelName}-${idx}`} className="rounded-2xl border border-slate-100 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="truncate text-sm font-black text-slate-900">{row.channelName}</p>
            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-black text-white">#{idx + 1}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-slate-500">
            <div className="rounded-xl bg-slate-50 p-2">
              <p>판매수량</p>
              <p className="mt-1 text-sm font-black text-slate-900">{fmtNum(row.dailySales || 0)}개</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2">
              <p>매출금액</p>
              <p className="mt-1 text-sm font-black text-slate-900">{won(row.dailyAmount || 0)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StockIssueList({ rows }: { rows: any[] }) {
  if (!rows?.length) return <Empty />;
  return (
    <div className="max-h-[440px] space-y-2 overflow-y-auto pr-2">
      {rows.map((row, idx) => (
        <div key={`${row.storeName}-${row.styleCode}-${row.colorCode}-${idx}`} className="rounded-2xl border border-slate-100 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">
                {row.styleCode} <span className="text-slate-400 font-semibold">{row.colorName || row.colorCode}</span>
              </p>
              <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{row.productName}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">{row.storeName}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${
                row.estimatedStock <= 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              추정 {fmtNum(row.estimatedStock)}개
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-slate-500">
            <div className="rounded-xl bg-slate-50 p-2">
              <p>오늘 판매</p>
              <p className="mt-1 text-sm font-black text-slate-900">{fmtNum(row.todaySold)}개</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2">
              <p>새벽 재고</p>
              <p className="mt-1 text-sm font-black text-slate-900">{fmtNum(row.baselineStock)}개</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RealtimeDashboard() {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/realtime", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setData(json.data);
        setStatus("");
        setLastFetchedAt(new Date());
      } else {
        setStatus(json.error || "실시간 데이터를 불러오지 못했습니다.");
      }
    } catch {
      setStatus("실시간 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, AUTO_REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">실시간</h1>
            <p className="mt-1 text-sm text-slate-500">ERP 에이전트가 올리는 오늘 매출 + 추정 재고를 보여줍니다</p>
          </div>
          <NavTabs active="realtime" />
        </header>

        <section className="flex flex-col gap-3 rounded-3xl bg-slate-950 p-5 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black text-slate-400">REALTIME</p>
            <p className="mt-1 text-sm font-semibold text-slate-300">
              {lastFetchedAt ? `마지막 갱신 ${fmtTime(lastFetchedAt)}` : "불러오는 중..."} · 3분마다 자동 갱신
            </p>
            {status && <p className="mt-1 text-sm font-bold text-amber-300">{status}</p>}
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/20 disabled:opacity-50"
          >
            {loading ? "갱신 중..." : "지금 새로고침"}
          </button>
        </section>

        {!data ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-black text-slate-500">{status || "불러오는 중..."}</p>
          </section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-4">
              <Kpi title="오늘 진행중 매출" value={won(data.totalDailyAmount || 0)} tone="blue" />
              <Kpi title="오늘 판매수량" value={`${fmtNum(data.totalDailySales || 0)}개`} tone="green" />
              <Kpi title="매출 발생 매장" value={`${fmtNum(data.activeChannels || 0)}개`} tone="purple" />
              <Kpi title="판매 상품" value={`${fmtNum(data.activeProducts || 0)}개`} tone="orange" />
            </section>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-bold text-blue-700">
              {data.stockBaselineDate
                ? `재고는 ${data.stockBaselineDate} 새벽 스냅샷을 기준으로, 오늘 누적판매를 뺀 추정치입니다. 실제와 다를 수 있어요.`
                : "최근 7일 안에서 재고 스냅샷을 찾지 못했습니다 — ERP 에이전트(daily-snapshot.js)가 정상 실행됐는지 확인해주세요."}
            </div>

            <section className="grid gap-6 lg:grid-cols-2">
              <Card title="매장별 오늘 매출 순위">
                <ChannelRankList rows={data.topChannels || []} />
              </Card>
              <Card title="재고 이슈 (추정 재고 적은 순)">
                <StockIssueList rows={data.stockIssues || []} />
              </Card>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
