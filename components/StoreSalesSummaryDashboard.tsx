"use client";

import { useEffect, useMemo, useState } from "react";
import NavTabs from "@/components/NavTabs";

function won(n: number) {
  return `${Math.round(n || 0).toLocaleString("ko-KR")}원`;
}

function wonOrDash(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return won(n);
}

function pct(n: number | null) {
  if (n === null || !Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(0)}%`;
}

function growthPct(n: number | null) {
  if (n === null || !Number.isFinite(n)) return "신규";
  const v = (n * 100).toFixed(1);
  return `${n >= 0 ? "+" : ""}${v}%`;
}

function growthColor(n: number | null) {
  if (n === null || !Number.isFinite(n)) return "text-slate-400";
  return n >= 0 ? "text-blue-600" : "text-rose-600";
}

type StoreSalesSummaryRow = {
  storeName: string;
  channelGroup: string;
  channelCode: string;
  daily: { date: string; target: number; actual: number; achievementRate: number | null; qty: number; avgReceiptAmount: number | null; prevYearAmount: number; yoyGrowthRate: number | null };
  weekly: { start: string; end: string; target: number; actual: number; achievementRate: number | null; avgReceiptAmount: number | null; prevWeekAmount: number; wowGrowthRate: number | null; prevYearAmount: number; yoyGrowthRate: number | null };
  monthly: { month: string; periodTarget: number; actual: number; achievementRate: number | null; avgReceiptAmount: number | null; progressRate: number; prevYearAmount: number; yoyGrowthRate: number | null };
  prevMonth: { month: string; target: number; actual: number; achievementRate: number | null; avgReceiptAmount: number | null; prevYearAmount: number; yoyGrowthRate: number | null };
  annual: { year: number; ytdTarget: number; ytdActual: number; achievementRate: number | null; avgReceiptAmount: number | null; progressRate: number; prevYearAmount: number; yoyGrowthRate: number | null };
  customPeriod?: { start: string; end: string; target: number; actual: number; achievementRate: number | null; qty: number; avgReceiptAmount: number | null; prevYearStart: string; prevYearEnd: string; prevYearAmount: number; yoyGrowthRate: number | null };
};

type CustomPeriodInfo = { start: string; end: string; prevYearStart: string; prevYearEnd: string } | null;

export default function StoreSalesSummaryDashboard() {
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState("");
  const [stores, setStores] = useState<StoreSalesSummaryRow[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [groupFilter, setGroupFilter] = useState("전체");

  // MARK 2026-09-22: "일간" 블록 날짜선택 + 커스텀 기간비교 조회.
  const [dailyDate, setDailyDate] = useState(""); // 빈 값 = 최신 날짜(기본값)
  const [rangeStartInput, setRangeStartInput] = useState("");
  const [rangeEndInput, setRangeEndInput] = useState("");
  const [customPeriod, setCustomPeriod] = useState<CustomPeriodInfo>(null);
  const [rangeError, setRangeError] = useState("");

  // MARK 2026-09-23: 객단가(매출금액/영수건수) — 기본은 접어두고 토글로 펼쳐볼 수 있게.
  const [showAvgReceipt, setShowAvgReceipt] = useState(false);

  // MARK 2026-09-23: 구글드라이브에 올려둔 "전체매출" 파일을 수동으로 지금 바로 가져오기
  // (자동으로는 매일 새벽 cron이 같은 걸 호출함 — app/api/sales-summary-drive-import).
  const [driveImporting, setDriveImporting] = useState(false);
  const [driveMessage, setDriveMessage] = useState("");
  const [driveError, setDriveError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load(params?: { date?: string; rangeStart?: string; rangeEnd?: string }) {
    setLoading(true);
    setRangeError("");
    try {
      const qs = new URLSearchParams();
      if (params?.date) qs.set("date", params.date);
      if (params?.rangeStart && params?.rangeEnd) {
        qs.set("rangeStart", params.rangeStart);
        qs.set("rangeEnd", params.rangeEnd);
      }
      const url = qs.toString() ? `/api/sales-summary?${qs}` : "/api/sales-summary";
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setAsOfDate(json.asOfDate || "");
        setDailyDate(json.dailyDate || "");
        setStores(json.stores || []);
        setMeta(json.meta || null);
        setCustomPeriod(json.customPeriod || null);
        if (params?.rangeStart && params?.rangeEnd && !json.customPeriod) {
          setRangeError("기간 형식을 확인해주세요(시작일이 종료일보다 늦을 수 없어요).");
        }
      }
    } catch {
      // 처음 쓰는 경우 데이터가 없을 수 있음 — 조용히 무시
    } finally {
      setLoading(false);
    }
  }

  function runRangeQuery() {
    if (!rangeStartInput || !rangeEndInput) {
      setRangeError("시작일과 종료일을 모두 골라주세요.");
      return;
    }
    load({ date: dailyDate, rangeStart: rangeStartInput, rangeEnd: rangeEndInput });
  }

  function clearRangeQuery() {
    setRangeStartInput("");
    setRangeEndInput("");
    setRangeError("");
    load({ date: dailyDate });
  }

  function onDailyDateChange(next: string) {
    setDailyDate(next);
    load({ date: next, rangeStart: rangeStartInput && rangeEndInput ? rangeStartInput : undefined, rangeEnd: rangeStartInput && rangeEndInput ? rangeEndInput : undefined });
  }

  async function runDriveImport() {
    setDriveImporting(true);
    setDriveError("");
    setDriveMessage("드라이브에서 가져오는 중...");
    try {
      const res = await fetch("/api/sales-summary-drive-import", { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "가져오기 실패");
      setDriveMessage(
        `완료! "${data.driveFile?.name || ""}" 기준 이번 반영 ${data.newRowCount.toLocaleString("ko-KR")}행(${data.newStartDate}~${data.newEndDate}) · ` +
        `누적 ${data.storeCount}개 매장 ${data.rowCount.toLocaleString("ko-KR")}행(${data.startDate}~${data.endDate})`
      );
      await load({
        date: dailyDate || undefined,
        rangeStart: rangeStartInput && rangeEndInput ? rangeStartInput : undefined,
        rangeEnd: rangeStartInput && rangeEndInput ? rangeEndInput : undefined,
      });
    } catch (e: any) {
      setDriveMessage("");
      setDriveError(e?.message || "가져오기 실패");
    } finally {
      setDriveImporting(false);
    }
  }

  const groups = useMemo(() => {
    const set = new Set(stores.map((s) => s.channelGroup).filter(Boolean));
    return ["전체", ...Array.from(set)];
  }, [stores]);

  const filteredStores = groupFilter === "전체" ? stores : stores.filter((s) => s.channelGroup === groupFilter);

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <div className="mx-auto max-w-[1600px] px-4 pt-6">
        <NavTabs active="store-sales" />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-slate-400">STORE SALES SUMMARY</p>
            <h1 className="mt-1 text-xl font-black text-slate-900">매출탭 (점포별)</h1>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {meta
                ? `마지막 업로드: ${meta.uploadedAt}(${meta.newStartDate || meta.startDate}~${meta.newEndDate || meta.endDate}, ${(meta.newRowCount || 0).toLocaleString("ko-KR")}행) · 누적 ${meta.storeCount}개 매장 · ${meta.startDate}~${meta.endDate}(${meta.rowCount.toLocaleString("ko-KR")}행)`
                : "아직 업로드된 데이터가 없어요"}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-black text-slate-700">구글드라이브에서 가져오기</p>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            드라이브에 올려둔 전체매출 파일을 매일 새벽에 자동으로 가져와요. 방금 올렸다면 기다리지 않고 지금 바로 가져올 수 있어요.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={driveImporting}
              onClick={runDriveImport}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40"
            >
              {driveImporting ? "가져오는 중..." : "지금 가져오기"}
            </button>
            {driveMessage && <span className="text-xs font-bold text-slate-500">{driveMessage}</span>}
          </div>
          {driveError && <p className="mt-2 text-sm font-black text-red-600">⚠ {driveError}</p>}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-6 rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <p className="text-xs font-black text-slate-700">일간 조회 날짜</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">비워두면 가장 최근 날짜(보통 어제)를 보여줘요.</p>
            <input
              type="date"
              value={dailyDate}
              min={meta?.startDate || undefined}
              max={asOfDate || undefined}
              onChange={(e) => onDailyDateChange(e.target.value)}
              className="mt-2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-700"
            />
          </div>

          <div className="h-10 w-px bg-slate-200" />

          <div>
            <p className="text-xs font-black text-slate-700">기간 비교 조회</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">시작~끝 날짜를 고르면 그 기간 목표달성률과 전년동기 신장률을 같이 볼 수 있어요.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={rangeStartInput}
                min={meta?.startDate || undefined}
                max={asOfDate || undefined}
                onChange={(e) => setRangeStartInput(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-700"
              />
              <span className="text-xs font-bold text-slate-400">~</span>
              <input
                type="date"
                value={rangeEndInput}
                min={meta?.startDate || undefined}
                max={asOfDate || undefined}
                onChange={(e) => setRangeEndInput(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-700"
              />
              <button
                type="button"
                onClick={runRangeQuery}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-black text-white"
              >
                조회
              </button>
              {customPeriod && (
                <button
                  type="button"
                  onClick={clearRangeQuery}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-500"
                >
                  기간비교 지우기
                </button>
              )}
            </div>
            {rangeError && <p className="mt-1 text-[11px] font-bold text-red-600">⚠ {rangeError}</p>}
            {customPeriod && (
              <p className="mt-1 text-[11px] font-bold text-slate-400">
                조회 기간: {customPeriod.start}~{customPeriod.end} · 전년동기: {customPeriod.prevYearStart}~{customPeriod.prevYearEnd}
              </p>
            )}
          </div>
        </div>

        {loading && <p className="mt-6 text-sm font-bold text-slate-400">불러오는 중...</p>}

        {!loading && !stores.length && (
          <p className="mt-6 text-sm font-bold text-slate-400">아직 데이터가 없어요. 위에서 전체매출 파일을 업로드해주세요.</p>
        )}

        {!loading && stores.length > 0 && (
          <>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGroupFilter(g)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-black ${
                      groupFilter === g ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowAvgReceipt((v) => !v)}
                className={`rounded-xl px-3 py-1.5 text-xs font-black ${
                  showAvgReceipt ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-600"
                }`}
              >
                객단가 {showAvgReceipt ? "숨기기 ▲" : "보기 ▼"}
              </button>
            </div>

            <p className="mt-3 text-xs font-bold text-slate-400">
              기준일: {asOfDate}{dailyDate && dailyDate !== asOfDate ? ` · 일간 조회일: ${dailyDate}` : ""} · 신장률이 "신규"인 경우는 비교 기간에 그 매장이 아직 없었다는 뜻이에요.
            </p>

            <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className={`${customPeriod ? (showAvgReceipt ? "min-w-[2600px]" : "min-w-[2200px]") : showAvgReceipt ? "min-w-[2200px]" : "min-w-[1800px]"} w-full border-collapse text-xs`}>
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th rowSpan={2} className="sticky left-0 z-10 bg-slate-900 px-3 py-2 text-left font-black">구분</th>
                    <th rowSpan={2} className="sticky left-[56px] z-10 bg-slate-900 px-3 py-2 text-left font-black">매장명</th>
                    <th colSpan={showAvgReceipt ? 5 : 4} className="border-l border-slate-700 px-2 py-1 text-center font-black">일간</th>
                    <th colSpan={showAvgReceipt ? 5 : 4} className="border-l border-slate-700 px-2 py-1 text-center font-black">주간</th>
                    <th colSpan={showAvgReceipt ? 5 : 4} className="border-l border-slate-700 px-2 py-1 text-center font-black">이번달(기간)</th>
                    <th colSpan={showAvgReceipt ? 5 : 4} className="border-l border-slate-700 px-2 py-1 text-center font-black">전월</th>
                    <th colSpan={showAvgReceipt ? 5 : 4} className="border-l border-slate-700 px-2 py-1 text-center font-black">연간(누계)</th>
                    {customPeriod && (
                      <th colSpan={showAvgReceipt ? 5 : 4} className="border-l border-slate-700 bg-blue-900 px-2 py-1 text-center font-black">
                        기간비교 ({customPeriod.start}~{customPeriod.end})
                      </th>
                    )}
                  </tr>
                  <tr className="bg-slate-800 text-white">
                    <th className="border-l border-slate-700 px-2 py-1 text-right font-bold">목표</th>
                    <th className="px-2 py-1 text-right font-bold">실적</th>
                    {showAvgReceipt && <th className="px-2 py-1 text-right font-bold text-indigo-200">객단가</th>}
                    <th className="px-2 py-1 text-right font-bold">달성률</th>
                    <th className="px-2 py-1 text-right font-bold">전년比</th>
                    <th className="border-l border-slate-700 px-2 py-1 text-right font-bold">목표</th>
                    <th className="px-2 py-1 text-right font-bold">실적</th>
                    {showAvgReceipt && <th className="px-2 py-1 text-right font-bold text-indigo-200">객단가</th>}
                    <th className="px-2 py-1 text-right font-bold">달성률</th>
                    <th className="px-2 py-1 text-right font-bold">전년比</th>
                    <th className="border-l border-slate-700 px-2 py-1 text-right font-bold">기간목표</th>
                    <th className="px-2 py-1 text-right font-bold">실적</th>
                    {showAvgReceipt && <th className="px-2 py-1 text-right font-bold text-indigo-200">객단가</th>}
                    <th className="px-2 py-1 text-right font-bold">달성률</th>
                    <th className="px-2 py-1 text-right font-bold">전년比</th>
                    <th className="border-l border-slate-700 px-2 py-1 text-right font-bold">목표</th>
                    <th className="px-2 py-1 text-right font-bold">실적</th>
                    {showAvgReceipt && <th className="px-2 py-1 text-right font-bold text-indigo-200">객단가</th>}
                    <th className="px-2 py-1 text-right font-bold">달성률</th>
                    <th className="px-2 py-1 text-right font-bold">전년比</th>
                    <th className="border-l border-slate-700 px-2 py-1 text-right font-bold">기간목표</th>
                    <th className="px-2 py-1 text-right font-bold">실적</th>
                    {showAvgReceipt && <th className="px-2 py-1 text-right font-bold text-indigo-200">객단가</th>}
                    <th className="px-2 py-1 text-right font-bold">달성률</th>
                    <th className="px-2 py-1 text-right font-bold">전년比</th>
                    {customPeriod && (
                      <>
                        <th className="border-l border-slate-700 bg-blue-950 px-2 py-1 text-right font-bold">목표</th>
                        <th className="bg-blue-950 px-2 py-1 text-right font-bold">실적</th>
                        {showAvgReceipt && <th className="bg-blue-950 px-2 py-1 text-right font-bold text-indigo-200">객단가</th>}
                        <th className="bg-blue-950 px-2 py-1 text-right font-bold">달성률</th>
                        <th className="bg-blue-950 px-2 py-1 text-right font-bold">전년동기比</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredStores.map((s, i) => (
                    <tr key={s.storeName} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                      <td className="sticky left-0 z-10 border-t border-slate-100 bg-inherit px-3 py-2 font-bold text-slate-500">{s.channelGroup}</td>
                      <td className="sticky left-[56px] z-10 border-t border-slate-100 bg-inherit px-3 py-2 font-black text-slate-900">{s.storeName}</td>

                      <td className="border-t border-l border-slate-100 px-2 py-2 text-right">{won(s.daily.target)}</td>
                      <td className="border-t border-slate-100 px-2 py-2 text-right font-bold">{won(s.daily.actual)}</td>
                      {showAvgReceipt && <td className="border-t border-slate-100 px-2 py-2 text-right text-indigo-600">{wonOrDash(s.daily.avgReceiptAmount)}</td>}
                      <td className="border-t border-slate-100 px-2 py-2 text-right">{pct(s.daily.achievementRate)}</td>
                      <td className={`border-t border-slate-100 px-2 py-2 text-right font-bold ${growthColor(s.daily.yoyGrowthRate)}`}>{growthPct(s.daily.yoyGrowthRate)}</td>

                      <td className="border-t border-l border-slate-100 px-2 py-2 text-right">{won(s.weekly.target)}</td>
                      <td className="border-t border-slate-100 px-2 py-2 text-right font-bold">{won(s.weekly.actual)}</td>
                      {showAvgReceipt && <td className="border-t border-slate-100 px-2 py-2 text-right text-indigo-600">{wonOrDash(s.weekly.avgReceiptAmount)}</td>}
                      <td className="border-t border-slate-100 px-2 py-2 text-right">{pct(s.weekly.achievementRate)}</td>
                      <td className={`border-t border-slate-100 px-2 py-2 text-right font-bold ${growthColor(s.weekly.yoyGrowthRate)}`}>{growthPct(s.weekly.yoyGrowthRate)}</td>

                      <td className="border-t border-l border-slate-100 px-2 py-2 text-right">{won(s.monthly.periodTarget)}</td>
                      <td className="border-t border-slate-100 px-2 py-2 text-right font-bold">{won(s.monthly.actual)}</td>
                      {showAvgReceipt && <td className="border-t border-slate-100 px-2 py-2 text-right text-indigo-600">{wonOrDash(s.monthly.avgReceiptAmount)}</td>}
                      <td className="border-t border-slate-100 px-2 py-2 text-right">{pct(s.monthly.achievementRate)}</td>
                      <td className={`border-t border-slate-100 px-2 py-2 text-right font-bold ${growthColor(s.monthly.yoyGrowthRate)}`}>{growthPct(s.monthly.yoyGrowthRate)}</td>

                      <td className="border-t border-l border-slate-100 px-2 py-2 text-right">{won(s.prevMonth.target)}</td>
                      <td className="border-t border-slate-100 px-2 py-2 text-right font-bold">{won(s.prevMonth.actual)}</td>
                      {showAvgReceipt && <td className="border-t border-slate-100 px-2 py-2 text-right text-indigo-600">{wonOrDash(s.prevMonth.avgReceiptAmount)}</td>}
                      <td className="border-t border-slate-100 px-2 py-2 text-right">{pct(s.prevMonth.achievementRate)}</td>
                      <td className={`border-t border-slate-100 px-2 py-2 text-right font-bold ${growthColor(s.prevMonth.yoyGrowthRate)}`}>{growthPct(s.prevMonth.yoyGrowthRate)}</td>

                      <td className="border-t border-l border-slate-100 px-2 py-2 text-right">{won(s.annual.ytdTarget)}</td>
                      <td className="border-t border-slate-100 px-2 py-2 text-right font-bold">{won(s.annual.ytdActual)}</td>
                      {showAvgReceipt && <td className="border-t border-slate-100 px-2 py-2 text-right text-indigo-600">{wonOrDash(s.annual.avgReceiptAmount)}</td>}
                      <td className="border-t border-slate-100 px-2 py-2 text-right">{pct(s.annual.achievementRate)}</td>
                      <td className={`border-t border-slate-100 px-2 py-2 text-right font-bold ${growthColor(s.annual.yoyGrowthRate)}`}>{growthPct(s.annual.yoyGrowthRate)}</td>

                      {customPeriod && (
                        <>
                          <td className="border-t border-l border-blue-100 bg-blue-50/40 px-2 py-2 text-right">{won(s.customPeriod?.target || 0)}</td>
                          <td className="border-t border-blue-100 bg-blue-50/40 px-2 py-2 text-right font-bold">{won(s.customPeriod?.actual || 0)}</td>
                          {showAvgReceipt && <td className="border-t border-blue-100 bg-blue-50/40 px-2 py-2 text-right text-indigo-600">{wonOrDash(s.customPeriod?.avgReceiptAmount ?? null)}</td>}
                          <td className="border-t border-blue-100 bg-blue-50/40 px-2 py-2 text-right">{pct(s.customPeriod?.achievementRate ?? null)}</td>
                          <td className={`border-t border-blue-100 bg-blue-50/40 px-2 py-2 text-right font-bold ${growthColor(s.customPeriod?.yoyGrowthRate ?? null)}`}>{growthPct(s.customPeriod?.yoyGrowthRate ?? null)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
