"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
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

// MARK 2026-09-25: 실적 금액을 같은 열(일간/주간/이번달) 안에서 상대적으로 비교해
// 빨강(낮음)~초록(높음) 그라데이션 배경을 입히는 헬퍼. min===max(매장이 1개뿐이거나 전부
// 같은 값)면 색을 안 입혀서 의미 없는 붉은색/초록색이 나오지 않게 합니다.
function heatBg(value: number, range: { min: number; max: number }): CSSProperties | undefined {
  if (!Number.isFinite(value) || range.max <= range.min) return undefined;
  const t = Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
  const hue = t * 120; // 0=빨강 ... 120=초록
  return { backgroundColor: `hsl(${hue.toFixed(0)}, 72%, 90%)` };
}

type StoreSalesSummaryRow = {
  storeName: string;
  channelGroup: string;
  channelCode: string;
  daily: { date: string; target: number; actual: number; achievementRate: number | null; qty: number; avgReceiptAmount: number | null; receiptCount: number; prevYearAmount: number; yoyGrowthRate: number | null };
  weekly: { start: string; end: string; target: number; actual: number; achievementRate: number | null; avgReceiptAmount: number | null; receiptCount: number; prevWeekAmount: number; wowGrowthRate: number | null; prevYearAmount: number; yoyGrowthRate: number | null };
  monthly: { month: string; periodTarget: number; actual: number; achievementRate: number | null; avgReceiptAmount: number | null; receiptCount: number; progressRate: number; prevYearAmount: number; yoyGrowthRate: number | null; fullMonthTarget: number };
  prevMonth: { month: string; target: number; actual: number; achievementRate: number | null; avgReceiptAmount: number | null; receiptCount: number; prevYearAmount: number; yoyGrowthRate: number | null };
  annual: { year: number; ytdTarget: number; ytdActual: number; achievementRate: number | null; avgReceiptAmount: number | null; receiptCount: number; progressRate: number; prevYearAmount: number; yoyGrowthRate: number | null };
  customPeriod?: { start: string; end: string; target: number; actual: number; achievementRate: number | null; qty: number; avgReceiptAmount: number | null; receiptCount: number; prevYearStart: string; prevYearEnd: string; prevYearAmount: number; yoyGrowthRate: number | null };
};

// MARK 2026-09-25: "맨 상단에 매출 총합" 요청 — 지금 화면에 보이는(필터 적용된) 매장들을
// 합산한 가상의 "합계" 줄을 만듭니다. 객단가는 매장별 객단가를 단순평균하면 안 되고(매장마다
// 거래 규모가 다름) 반드시 "합계 매출금액 / 합계 영수건수"로 다시 계산해야 정확하므로, 매장별
// receiptCount를 그대로 합산해서 씁니다. 달성률/전년比/전주比도 같은 이유로 비율의 평균이 아니라
// 합계끼리 다시 나눠서 계산합니다.
type PeriodAgg = {
  target: number;
  actual: number;
  achievementRate: number | null;
  avgReceiptAmount: number | null;
  receiptCount: number;
  prevYearAmount: number;
  yoyGrowthRate: number | null;
  prevWeekAmount: number;
  wowGrowthRate: number | null;
  qty: number;
};

function aggregatePeriod(
  rows: { target: number; actual: number; receiptCount: number; prevYearAmount: number; prevWeekAmount?: number; qty?: number }[]
): PeriodAgg {
  let target = 0;
  let actual = 0;
  let receiptCount = 0;
  let prevYearAmount = 0;
  let prevWeekAmount = 0;
  let qty = 0;
  for (const r of rows) {
    target += r.target || 0;
    actual += r.actual || 0;
    receiptCount += r.receiptCount || 0;
    prevYearAmount += r.prevYearAmount || 0;
    prevWeekAmount += r.prevWeekAmount || 0;
    qty += r.qty || 0;
  }
  const achievementRate = target ? actual / target : null;
  const avgReceiptAmount = receiptCount > 0 ? actual / receiptCount : null;
  const yoyGrowthRate = prevYearAmount ? (actual - prevYearAmount) / prevYearAmount : actual > 0 ? null : 0;
  const wowGrowthRate = prevWeekAmount ? (actual - prevWeekAmount) / prevWeekAmount : actual > 0 ? null : 0;
  return { target, actual, achievementRate, avgReceiptAmount, receiptCount, prevYearAmount, yoyGrowthRate, prevWeekAmount, wowGrowthRate, qty };
}

function buildTotalRow(rows: StoreSalesSummaryRow[]): StoreSalesSummaryRow | null {
  if (!rows.length) return null;
  const daily = aggregatePeriod(rows.map((s) => s.daily));
  const weekly = aggregatePeriod(rows.map((s) => s.weekly));
  const monthly = aggregatePeriod(rows.map((s) => ({ ...s.monthly, target: s.monthly.periodTarget })));
  const prevMonth = aggregatePeriod(rows.map((s) => s.prevMonth));
  const annual = aggregatePeriod(rows.map((s) => ({ ...s.annual, target: s.annual.ytdTarget, actual: s.annual.ytdActual })));
  const customSource = rows.map((s) => s.customPeriod).filter((c): c is NonNullable<typeof c> => !!c);
  const customPeriod = customSource.length ? aggregatePeriod(customSource) : null;

  return {
    storeName: "합계",
    channelGroup: "",
    channelCode: "",
    daily: {
      date: rows[0].daily.date,
      target: daily.target,
      actual: daily.actual,
      achievementRate: daily.achievementRate,
      qty: daily.qty,
      avgReceiptAmount: daily.avgReceiptAmount,
      receiptCount: daily.receiptCount,
      prevYearAmount: daily.prevYearAmount,
      yoyGrowthRate: daily.yoyGrowthRate,
    },
    weekly: {
      start: rows[0].weekly.start,
      end: rows[0].weekly.end,
      target: weekly.target,
      actual: weekly.actual,
      achievementRate: weekly.achievementRate,
      avgReceiptAmount: weekly.avgReceiptAmount,
      receiptCount: weekly.receiptCount,
      prevWeekAmount: weekly.prevWeekAmount,
      wowGrowthRate: weekly.wowGrowthRate,
      prevYearAmount: weekly.prevYearAmount,
      yoyGrowthRate: weekly.yoyGrowthRate,
    },
    monthly: {
      month: rows[0].monthly.month,
      periodTarget: monthly.target,
      actual: monthly.actual,
      achievementRate: monthly.achievementRate,
      avgReceiptAmount: monthly.avgReceiptAmount,
      receiptCount: monthly.receiptCount,
      progressRate: rows[0].monthly.progressRate,
      prevYearAmount: monthly.prevYearAmount,
      yoyGrowthRate: monthly.yoyGrowthRate,
      fullMonthTarget: rows.reduce((sum, r) => sum + (r.monthly.fullMonthTarget || 0), 0),
    },
    prevMonth: {
      month: rows[0].prevMonth.month,
      target: prevMonth.target,
      actual: prevMonth.actual,
      achievementRate: prevMonth.achievementRate,
      avgReceiptAmount: prevMonth.avgReceiptAmount,
      receiptCount: prevMonth.receiptCount,
      prevYearAmount: prevMonth.prevYearAmount,
      yoyGrowthRate: prevMonth.yoyGrowthRate,
    },
    annual: {
      year: rows[0].annual.year,
      ytdTarget: annual.target,
      ytdActual: annual.actual,
      achievementRate: annual.achievementRate,
      avgReceiptAmount: annual.avgReceiptAmount,
      receiptCount: annual.receiptCount,
      progressRate: rows[0].annual.progressRate,
      prevYearAmount: annual.prevYearAmount,
      yoyGrowthRate: annual.yoyGrowthRate,
    },
    ...(customPeriod && rows[0].customPeriod
      ? {
          customPeriod: {
            start: rows[0].customPeriod.start,
            end: rows[0].customPeriod.end,
            target: customPeriod.target,
            actual: customPeriod.actual,
            achievementRate: customPeriod.achievementRate,
            qty: customPeriod.qty,
            avgReceiptAmount: customPeriod.avgReceiptAmount,
            receiptCount: customPeriod.receiptCount,
            prevYearStart: rows[0].customPeriod.prevYearStart,
            prevYearEnd: rows[0].customPeriod.prevYearEnd,
            prevYearAmount: customPeriod.prevYearAmount,
            yoyGrowthRate: customPeriod.yoyGrowthRate,
          },
        }
      : {}),
  };
}

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

  // MARK 2026-09-25: 지금 보이는(필터 적용된) 매장 기준 합계 — 필터를 바꾸면 합계도 같이 바뀜.
  const totalRow = useMemo(() => buildTotalRow(filteredStores), [filteredStores]);

  // MARK 2026-09-25: "이대로가면 이번달 착지금액" — 지금까지의 하루 평균 페이스가 월말까지
  // 그대로 이어진다고 가정한 추정치입니다(누적실적 ÷ 이번달 경과율). 이번달 전체 목표가
  // 이미 입력돼 있으면(월말치까지) 착지 기준 달성률도 같이 보여줍니다.
  const landingEstimate = useMemo(() => {
    if (!totalRow || !totalRow.monthly.progressRate) return null;
    const landingAmount = totalRow.monthly.actual / totalRow.monthly.progressRate;
    const fullMonthTarget = totalRow.monthly.fullMonthTarget;
    const landingAchievementRate = fullMonthTarget ? landingAmount / fullMonthTarget : null;
    return { landingAmount, fullMonthTarget, landingAchievementRate, month: totalRow.monthly.month };
  }, [totalRow]);

  // MARK 2026-09-25: "금액 높낮이에 따라 빨강~초록" 요청 — 일간/주간/이번달 실적을 지금
  // 화면에 보이는 매장들 사이에서 상대적으로 비교해 색을 입힙니다(가장 낮은 매장이 빨강,
  // 가장 높은 매장이 초록, 그 사이는 그라데이션). 합계 줄은 스케일을 왜곡하니 제외합니다.
  const heatRanges = useMemo(() => {
    const range = (vals: number[]) => (vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min: 0, max: 0 });
    return {
      daily: range(filteredStores.map((s) => s.daily.actual)),
      weekly: range(filteredStores.map((s) => s.weekly.actual)),
      monthly: range(filteredStores.map((s) => s.monthly.actual)),
    };
  }, [filteredStores]);

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <div className="mx-auto max-w-[1600px] px-4 pt-6">
        <NavTabs active="store-sales" />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-slate-400">STORE SALES SUMMARY</p>
            <h1 className="mt-1 text-xl font-black text-slate-900">매출 (점포별)</h1>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {meta
                ? `마지막 업로드: ${meta.uploadedAt}(${meta.newStartDate || meta.startDate}~${meta.newEndDate || meta.endDate}, ${(meta.newRowCount || 0).toLocaleString("ko-KR")}행) · 누적 ${meta.storeCount}개 매장 · ${meta.startDate}~${meta.endDate}(${meta.rowCount.toLocaleString("ko-KR")}행)`
                : "아직 업로드된 데이터가 없어요"}
            </p>
          </div>

          <div className="flex flex-wrap items-start gap-3">
            {/* MARK 2026-09-25: "오른쪽상단에 이대로가면 월간 착지금액" 요청 — 지금 보이는
                (필터 적용된) 매장 기준, 지금까지의 하루 평균 페이스가 이어진다고 가정한 이번달
                착지 예상 금액. 이번달 전체 목표가 입력돼 있으면 착지 기준 달성률도 같이 표시. */}
            {landingEstimate && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-right">
                <p className="text-[11px] font-black text-emerald-700">이대로가면 {landingEstimate.month.slice(5)}월 착지</p>
                <p className="mt-0.5 text-lg font-black text-emerald-900">{won(landingEstimate.landingAmount)}</p>
                {landingEstimate.landingAchievementRate !== null && (
                  <p className="mt-0.5 text-[11px] font-bold text-emerald-600">월목표대비 {pct(landingEstimate.landingAchievementRate)}</p>
                )}
              </div>
            )}

            {/* MARK 2026-09-25: 탭 정리 요청 — 판매전체상/일간/월간을 독립 탭에서 빼서 매출 탭
                안으로 옮기고, 여기서 클릭하면 들어갈 수 있게 바로가기로 둡니다. */}
            <div className="flex flex-wrap gap-2">
              <Link
                href="/schedule"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
              >
                📋 판매전체상 열기
              </Link>
              <Link
                href="/daily"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
              >
                📅 일간 열기
              </Link>
              <Link
                href="/monthly"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
              >
                📆 월간 열기
              </Link>
            </div>
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
              기준일: {asOfDate}{dailyDate && dailyDate !== asOfDate ? ` · 일간 조회일: ${dailyDate}` : ""} · 신장률이 "신규"인 경우는 비교 기간에 그 매장이 아직 없었다는 뜻이에요. · 일간/주간/이번달 실적 색상은 지금 보이는 매장들 사이의 상대 비교예요(낮음 🔴 ~ 높음 🟢).
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
                  {totalRow && (
                    <tr className="bg-amber-50/80 ring-1 ring-inset ring-amber-200">
                      <td className="sticky left-0 z-10 border-t border-slate-200 bg-amber-50 px-3 py-2 font-black text-slate-500">합계</td>
                      <td className="sticky left-[56px] z-10 border-t border-slate-200 bg-amber-50 px-3 py-2 font-black text-slate-900">
                        {groupFilter === "전체" ? "전체 매장" : groupFilter} ({filteredStores.length}개)
                      </td>

                      <td className="border-t border-l border-slate-200 px-2 py-2 text-right font-bold">{won(totalRow.daily.target)}</td>
                      <td className="border-t border-slate-200 px-2 py-2 text-right font-black">{won(totalRow.daily.actual)}</td>
                      {showAvgReceipt && <td className="border-t border-slate-200 px-2 py-2 text-right font-bold text-indigo-700">{wonOrDash(totalRow.daily.avgReceiptAmount)}</td>}
                      <td className="border-t border-slate-200 px-2 py-2 text-right font-bold">{pct(totalRow.daily.achievementRate)}</td>
                      <td className={`border-t border-slate-200 px-2 py-2 text-right font-bold ${growthColor(totalRow.daily.yoyGrowthRate)}`}>{growthPct(totalRow.daily.yoyGrowthRate)}</td>

                      <td className="border-t border-l border-slate-200 px-2 py-2 text-right font-bold">{won(totalRow.weekly.target)}</td>
                      <td className="border-t border-slate-200 px-2 py-2 text-right font-black">{won(totalRow.weekly.actual)}</td>
                      {showAvgReceipt && <td className="border-t border-slate-200 px-2 py-2 text-right font-bold text-indigo-700">{wonOrDash(totalRow.weekly.avgReceiptAmount)}</td>}
                      <td className="border-t border-slate-200 px-2 py-2 text-right font-bold">{pct(totalRow.weekly.achievementRate)}</td>
                      <td className={`border-t border-slate-200 px-2 py-2 text-right font-bold ${growthColor(totalRow.weekly.yoyGrowthRate)}`}>{growthPct(totalRow.weekly.yoyGrowthRate)}</td>

                      <td className="border-t border-l border-slate-200 px-2 py-2 text-right font-bold">{won(totalRow.monthly.periodTarget)}</td>
                      <td className="border-t border-slate-200 px-2 py-2 text-right font-black">{won(totalRow.monthly.actual)}</td>
                      {showAvgReceipt && <td className="border-t border-slate-200 px-2 py-2 text-right font-bold text-indigo-700">{wonOrDash(totalRow.monthly.avgReceiptAmount)}</td>}
                      <td className="border-t border-slate-200 px-2 py-2 text-right font-bold">{pct(totalRow.monthly.achievementRate)}</td>
                      <td className={`border-t border-slate-200 px-2 py-2 text-right font-bold ${growthColor(totalRow.monthly.yoyGrowthRate)}`}>{growthPct(totalRow.monthly.yoyGrowthRate)}</td>

                      <td className="border-t border-l border-slate-200 px-2 py-2 text-right font-bold">{won(totalRow.prevMonth.target)}</td>
                      <td className="border-t border-slate-200 px-2 py-2 text-right font-black">{won(totalRow.prevMonth.actual)}</td>
                      {showAvgReceipt && <td className="border-t border-slate-200 px-2 py-2 text-right font-bold text-indigo-700">{wonOrDash(totalRow.prevMonth.avgReceiptAmount)}</td>}
                      <td className="border-t border-slate-200 px-2 py-2 text-right font-bold">{pct(totalRow.prevMonth.achievementRate)}</td>
                      <td className={`border-t border-slate-200 px-2 py-2 text-right font-bold ${growthColor(totalRow.prevMonth.yoyGrowthRate)}`}>{growthPct(totalRow.prevMonth.yoyGrowthRate)}</td>

                      <td className="border-t border-l border-slate-200 px-2 py-2 text-right font-bold">{won(totalRow.annual.ytdTarget)}</td>
                      <td className="border-t border-slate-200 px-2 py-2 text-right font-black">{won(totalRow.annual.ytdActual)}</td>
                      {showAvgReceipt && <td className="border-t border-slate-200 px-2 py-2 text-right font-bold text-indigo-700">{wonOrDash(totalRow.annual.avgReceiptAmount)}</td>}
                      <td className="border-t border-slate-200 px-2 py-2 text-right font-bold">{pct(totalRow.annual.achievementRate)}</td>
                      <td className={`border-t border-slate-200 px-2 py-2 text-right font-bold ${growthColor(totalRow.annual.yoyGrowthRate)}`}>{growthPct(totalRow.annual.yoyGrowthRate)}</td>

                      {customPeriod && (
                        <>
                          <td className="border-t border-l border-blue-200 bg-blue-100/60 px-2 py-2 text-right font-bold">{won(totalRow.customPeriod?.target || 0)}</td>
                          <td className="border-t border-blue-200 bg-blue-100/60 px-2 py-2 text-right font-black">{won(totalRow.customPeriod?.actual || 0)}</td>
                          {showAvgReceipt && <td className="border-t border-blue-200 bg-blue-100/60 px-2 py-2 text-right font-bold text-indigo-700">{wonOrDash(totalRow.customPeriod?.avgReceiptAmount ?? null)}</td>}
                          <td className="border-t border-blue-200 bg-blue-100/60 px-2 py-2 text-right font-bold">{pct(totalRow.customPeriod?.achievementRate ?? null)}</td>
                          <td className={`border-t border-blue-200 bg-blue-100/60 px-2 py-2 text-right font-bold ${growthColor(totalRow.customPeriod?.yoyGrowthRate ?? null)}`}>{growthPct(totalRow.customPeriod?.yoyGrowthRate ?? null)}</td>
                        </>
                      )}
                    </tr>
                  )}
                  {filteredStores.map((s, i) => (
                    <tr key={s.storeName} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                      <td className="sticky left-0 z-10 border-t border-slate-100 bg-inherit px-3 py-2 font-bold text-slate-500">{s.channelGroup}</td>
                      <td className="sticky left-[56px] z-10 border-t border-slate-100 bg-inherit px-3 py-2 font-black text-slate-900">{s.storeName}</td>

                      <td className="border-t border-l border-slate-100 px-2 py-2 text-right">{won(s.daily.target)}</td>
                      <td className="border-t border-slate-100 px-2 py-2 text-right font-bold" style={heatBg(s.daily.actual, heatRanges.daily)}>{won(s.daily.actual)}</td>
                      {showAvgReceipt && <td className="border-t border-slate-100 px-2 py-2 text-right text-indigo-600">{wonOrDash(s.daily.avgReceiptAmount)}</td>}
                      <td className="border-t border-slate-100 px-2 py-2 text-right">{pct(s.daily.achievementRate)}</td>
                      <td className={`border-t border-slate-100 px-2 py-2 text-right font-bold ${growthColor(s.daily.yoyGrowthRate)}`}>{growthPct(s.daily.yoyGrowthRate)}</td>

                      <td className="border-t border-l border-slate-100 px-2 py-2 text-right">{won(s.weekly.target)}</td>
                      <td className="border-t border-slate-100 px-2 py-2 text-right font-bold" style={heatBg(s.weekly.actual, heatRanges.weekly)}>{won(s.weekly.actual)}</td>
                      {showAvgReceipt && <td className="border-t border-slate-100 px-2 py-2 text-right text-indigo-600">{wonOrDash(s.weekly.avgReceiptAmount)}</td>}
                      <td className="border-t border-slate-100 px-2 py-2 text-right">{pct(s.weekly.achievementRate)}</td>
                      <td className={`border-t border-slate-100 px-2 py-2 text-right font-bold ${growthColor(s.weekly.yoyGrowthRate)}`}>{growthPct(s.weekly.yoyGrowthRate)}</td>

                      <td className="border-t border-l border-slate-100 px-2 py-2 text-right">{won(s.monthly.periodTarget)}</td>
                      <td className="border-t border-slate-100 px-2 py-2 text-right font-bold" style={heatBg(s.monthly.actual, heatRanges.monthly)}>{won(s.monthly.actual)}</td>
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
