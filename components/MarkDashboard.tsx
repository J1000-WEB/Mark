"use client";

import { useEffect, useMemo, useState } from "react";
import NavTabs from "@/components/NavTabs";
import { Card, Empty, Kpi, ProductList, StoreMiniList } from "@/components/Shared";
import {
  badMonthly,
  badWeekly,
  goodMonthly,
  goodWeekly,
  markData,
  mergeRows,
  pct,
  salesRank,
  shopSummary,
  splitStores,
  totals,
  won,
} from "@/lib/mark";

function BarList({ rows, field }: { rows: any[]; field: string }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[field] || 0)));
  if (!rows.length) return <Empty />;

  return (
    <div className="max-h-[690px] space-y-4 overflow-y-auto pr-3">
      {rows.map((r) => {
        const value = Number(r[field] || 0);
        const prev = field === "daySales" ? r.compareDaySales : r.compareWeekSales;
        const change = field === "daySales" ? r.dayChangeRate : r.weekChangeRate;
        const changeColor = change >= 0 ? "text-blue-600" : "text-red-600";
        return (
          <div key={r.storeName}>
            <div className="mb-1 flex justify-between gap-3 text-xs text-slate-500">
              <span className="font-bold text-slate-800">{r.storeName}</span>
              <span className="font-black text-slate-900">{won(value)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              전주 {won(prev)} · <span className={`font-black ${changeColor}`}>전주비 {change >= 0 ? "+" : ""}{pct(change)}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ComingSoon({ title }: { title: string }) {
  return (
    <Card title={title}>
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <p className="text-xl font-black text-slate-700">이후 추가 예정</p>
        <p className="mt-2 text-sm text-slate-500">월간 상품 판매 데이터 연동 후 표시됩니다.</p>
      </div>
    </Card>
  );
}

function Briefing({ lines }: { lines: string[] }) {
  return (
    <Card title="💡 주간 AI 브리핑" tone="purple">
      <ul className="space-y-2 text-sm font-semibold leading-6 text-slate-700">
        {(lines || []).map((line, i) => <li key={i}>• {line}</li>)}
      </ul>
    </Card>
  );
}

function WeeklyInsightCards({ data }: { data: any }) {
  const concentration = data.weekly?.top10Concentration || 0;
  const entrants = data.weekly?.newTop10Entrants || [];
  const inv = data.inventory || {};
  const shopEff = inv.consignmentRecommendations || [];

  return (
    <section className="grid gap-6 lg:grid-cols-3">
      <Card title="상품 집중도" tone="yellow">
        <p className="text-sm text-slate-500">TOP10 상품 매출 비중</p>
        <p className="mt-3 text-4xl font-black text-orange-600">{pct(concentration)}</p>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          TOP10 비중이 높을수록 주력 상품 의존도가 높습니다. 후속 상품 육성 여부를 함께 점검하세요.
        </p>
      </Card>

      <Card title="신규 TOP10 진입 상품">
        <div className="space-y-3">
          {entrants.length === 0 && <Empty />}
          {entrants.map((p: any, i: number) => (
            <div key={`${p.styleCode}-${i}`} className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">#{p.currentRank} · {p.previousRank}</p>
              <p className="mt-1 font-black">{p.productName}</p>
              <p className="mt-1 text-sm text-blue-600">매출 신장률 {p.amountChangeRate >= 0 ? "+" : ""}{pct(p.amountChangeRate)}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="위탁 재고 효율" tone="beige">
        <div className="space-y-3">
          {shopEff.slice(0, 5).map((p: any, i: number) => (
            <div key={`${p.styleCode}-${i}`} className="rounded-2xl bg-white p-4">
              <p className="text-xs text-slate-500">추천 #{i + 1}</p>
              <p className="font-black">{p.productName}</p>
              <p className="mt-1 text-sm text-slate-600">가용재고 {Math.round(p.totalStock || 0).toLocaleString("ko-KR")}개 · 위탁 투입 후보</p>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

function ClickableStoreList({
  title,
  rows,
  mode,
  selected,
  onSelect,
}: {
  title: string;
  rows: any[];
  mode: "good" | "bad";
  selected: string;
  onSelect: (store: string) => void;
}) {
  const wrap = mode === "good" ? "bg-emerald-50 border border-emerald-100" : "bg-rose-50 border border-rose-100";
  return (
    <div className={`rounded-2xl p-4 ${wrap}`}>
      <h3 className="mb-3 font-black">{title}</h3>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <button
            type="button"
            key={r.storeName}
            onClick={() => onSelect(r.storeName)}
            className={`flex w-full items-center justify-between rounded-xl p-3 text-left transition hover:scale-[1.01] ${
              selected === r.storeName ? "bg-slate-900 text-white" : "bg-white"
            }`}
          >
            <div>
              <p className={`text-xs ${selected === r.storeName ? "text-slate-300" : "text-slate-500"}`}>#{i + 1}</p>
              <p className="font-bold">{r.storeName}</p>
            </div>
            <div className="text-right">
              <p className={`font-black ${selected === r.storeName ? "text-white" : mode === "good" ? "text-emerald-600" : "text-red-600"}`}>
                {r.weekChangeRate >= 0 ? "+" : ""}{pct(r.weekChangeRate)}
              </p>
              <p className={`text-xs ${selected === r.storeName ? "text-slate-300" : "text-slate-500"}`}>{won(r.weekSales)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StoreProductMini({ title, items, mode }: { title: string; items: any[]; mode: "good" | "bad" }) {
  return (
    <div className={`rounded-2xl p-4 ${mode === "good" ? "bg-emerald-50" : "bg-rose-50"}`}>
      <h4 className="mb-3 font-black">{title}</h4>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-slate-500">표시할 상품이 없습니다.</p>}
        {items.map((p, i) => (
          <div key={`${p.styleCode}-${i}`} className="rounded-xl bg-white p-3">
            <p className="text-xs text-slate-500">#{i + 1} · {p.styleCode}</p>
            <p className="mt-1 font-bold">{p.productName}</p>
            <p className={`mt-1 text-sm font-black ${mode === "good" ? "text-emerald-600" : "text-red-600"}`}>
              {p.amountChangeRate >= 0 ? "+" : ""}{pct(p.amountChangeRate)} · {won(p.weekAmount)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StoreDetailPanel({ storeName, storeRow, data }: { storeName: string; storeRow: any; data: any }) {
  const [memo, setMemo] = useState("");
  const [savedMemo, setSavedMemo] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [status, setStatus] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const products = data.weekly?.storeTopProducts?.[storeName] || [];
  const goodProducts = [...products].sort((a, b) => Number(b.amountChangeRate || 0) - Number(a.amountChangeRate || 0)).slice(0, 2);
  const badProducts = [...products].filter((p) => Number(p.prevAmount || 0) > 0).sort((a, b) => Number(a.amountChangeRate || 0) - Number(b.amountChangeRate || 0)).slice(0, 2);

  useEffect(() => {
    if (!storeName) return;
    setStatus("메모 불러오는 중...");
    setIsEditing(false);
    fetch(`/api/memos?store=${encodeURIComponent(storeName)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setMemo(d.memo || "");
        setSavedMemo(d.memo || "");
        setUpdatedAt(d.updatedAt || "");
        setStatus("");
      })
      .catch(() => {
        setStatus("메모를 불러오지 못했습니다.");
      });
  }, [storeName]);

  async function saveMemo() {
    setStatus("저장 중...");
    const res = await fetch("/api/memos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store: storeName, memo }),
    });
    const d = await res.json();
    if (d.ok) {
      setSavedMemo(d.memo || "");
      setMemo(d.memo || "");
      setUpdatedAt(d.updatedAt || "");
      setIsEditing(false);
      setStatus("저장되었습니다.");
    } else {
      setStatus(d.error || "저장 실패");
    }
  }

  async function deleteMemo() {
    setStatus("삭제 중...");
    const res = await fetch(`/api/memos?store=${encodeURIComponent(storeName)}`, { method: "DELETE" });
    const d = await res.json();
    if (d.ok) {
      setMemo("");
      setSavedMemo("");
      setUpdatedAt(d.updatedAt || "");
      setIsEditing(false);
      setStatus("삭제되었습니다.");
    } else {
      setStatus(d.error || "삭제 실패");
    }
  }

  function startEdit() {
    setMemo(savedMemo || "");
    setIsEditing(true);
    setStatus("");
  }

  function cancelEdit() {
    setMemo(savedMemo || "");
    setIsEditing(false);
    setStatus("");
  }

  const change = Number(storeRow?.weekChangeRate || 0);
  const aiReview = storeRow
    ? `${storeName}은 전주 대비 ${change >= 0 ? "+" : ""}${pct(change)} 흐름이며, 주간 매출 ${won(storeRow.weekSales || 0)} 기준으로 ${change >= 0 ? "호조 요인 유지와 재고 보강을 검토하면 좋습니다." : "상품 구성, 진열, 재고 부족 여부를 우선 점검하는 것이 좋습니다."}`
    : `${storeName} 점포 데이터를 확인 중입니다.`;

  return (
    <div className="mt-6 rounded-3xl border border-slate-100 bg-slate-50 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">선택 점포</p>
          <h3 className="text-2xl font-black">{storeName}</h3>
        </div>
        {updatedAt && <p className="text-xs text-slate-500">메모 수정일: {updatedAt}</p>}
      </div>

      <div className="mt-4 rounded-2xl bg-violet-50 p-4">
        <p className="text-xs font-black text-violet-600">AI 한줄 리뷰</p>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{aiReview}</p>
      </div>

      <div className="mt-4 rounded-2xl bg-sky-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-black text-slate-900">담당자 메모</p>
          {status && <p className="text-xs font-semibold text-slate-500">{status}</p>}
        </div>

        {!isEditing && savedMemo ? (
          <>
            <div className="mt-3 rounded-2xl border border-sky-100 bg-white/80 p-4">
              <p className="whitespace-pre-wrap text-sm font-black leading-7 text-slate-800">{savedMemo}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={startEdit} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">수정</button>
              <button type="button" onClick={deleteMemo} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600">지우기</button>
              <span className="self-center text-xs text-slate-500">구글시트 소장군에 저장됨</span>
            </div>
          </>
        ) : (
          <>
            <textarea
              className="mt-3 h-20 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-slate-900"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="점포별 특이사항, 액션 아이템을 두 줄 정도로 적어주세요."
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={saveMemo} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">저장</button>
              {savedMemo && <button type="button" onClick={cancelEdit} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">취소</button>}
              {savedMemo && <button type="button" onClick={deleteMemo} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600">지우기</button>}
              {!savedMemo && <span className="self-center text-xs text-slate-500">저장하면 구글시트 소장군에 기록됩니다.</span>}
            </div>
          </>
        )}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <StoreProductMini title="호조상품 TOP2" items={goodProducts} mode="good" />
        <StoreProductMini title="부진상품 TOP2" items={badProducts} mode="bad" />
      </div>
    </div>
  );
}


export default function MarkDashboard({ active }: { active: "daily" | "weekly" | "monthly" }) {
  const [dashboardData, setDashboardData] = useState<any>(markData);
  const [dataStatus, setDataStatus] = useState("내장 데이터");
  const [store, setStore] = useState(markData.weekly?.productStoreNames?.[0] || "");
  const [reviewStore, setReviewStore] = useState("");

  useEffect(() => {
    fetch("/api/data", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setDashboardData(d);
        setDataStatus(d.source === "google-sheet" ? "구글시트 실시간 데이터" : "내장 데이터");
        const first = d.weekly?.productStoreNames?.[0] || "";
        if (first && (!store || !(d.weekly?.productStoreNames || []).includes(store))) setStore(first);
      })
      .catch(() => setDataStatus("내장 데이터"));
  }, []);

  const pageData = dashboardData?.[active] || { current: [], compare: [], year: [], periodLabel: "" };

  const merged =
    active === "monthly"
      ? mergeRows(pageData.current || [], pageData.compare || [], pageData.year || [])
      : mergeRows(pageData.current || [], pageData.compare || []);

  const { core, shop } = splitStores(merged);
  const coreTotals = totals(core);
  const shopRows = shopSummary(shop);

  const field = active === "daily" ? "daySales" : active === "monthly" ? "monthSales" : "weekSales";
  const ranking = salesRank(core, field);
  const storeProducts = useMemo(() => dashboardData.weekly?.storeTopProducts?.[store] || [], [dashboardData, store]);

  const weeklyGood = goodWeekly(core);
  const weeklyBad = badWeekly(core);
  const selectedReviewStore = reviewStore || weeklyGood[0]?.storeName || weeklyBad[0]?.storeName || "";
  const selectedStoreRow = core.find((r) => r.storeName === selectedReviewStore);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">GENERAL IDEA 오프라인 대시보드 Mark4 Alpha.3</h1>
            <p className="mt-1 text-sm text-slate-500">
              {active === "daily" && "일간 · 일_전일 vs 일_전주"}
              {active === "weekly" && "주간 · 구글시트 연동 + 점포 메모"}
              {active === "monthly" && "월간 · 호조/부진 매장 + 상품영역 준비중"}
            </p>
            <p className="mt-1 text-xs font-semibold text-blue-600">{dataStatus}</p>
          </div>
          <NavTabs active={active} />
        </header>

        <section className="rounded-3xl bg-slate-900 p-4 text-sm font-bold text-white shadow-sm">
          {pageData.periodLabel}
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          {active === "daily" ? (
            <>
              <Kpi title="일 목표" value={won(coreTotals.dayTarget)} tone="blue" />
              <Kpi title="일 매출" value={won(coreTotals.daySales)} sub={`전주 동요일 대비 ${pct(coreTotals.dayChange)}`} tone="green" />
              <Kpi title="일 달성률" value={pct(coreTotals.dayRate)} tone="purple" />
              <Kpi title="월 누적 매출" value={won(coreTotals.monthSales)} sub={pct(coreTotals.monthRate)} tone="orange" />
            </>
          ) : active === "weekly" ? (
            <>
              <Kpi title="주간 목표" value={won(coreTotals.weekTarget)} tone="blue" />
              <Kpi title="주간 매출" value={won(coreTotals.weekSales)} sub={`전주 대비 ${pct(coreTotals.weekChange)}`} tone="green" />
              <Kpi title="주간 달성률" value={pct(coreTotals.weekRate)} tone="purple" />
              <Kpi title="월 누적 매출" value={won(coreTotals.monthSales)} sub={pct(coreTotals.monthRate)} tone="orange" />
            </>
          ) : (
            <>
              <Kpi title="월 목표" value={won(coreTotals.monthTarget)} tone="blue" />
              <Kpi title="월 누적 매출" value={won(coreTotals.monthSales)} sub={`전월 대비 ${pct(coreTotals.monthChange)}`} tone="green" />
              <Kpi title="월 달성률" value={pct(coreTotals.monthRate)} tone="purple" />
              <Kpi title="전년동월 대비" value={pct(coreTotals.yearMonthChange)} tone="orange" />
            </>
          )}
        </section>

        {active === "weekly" && <Briefing lines={dashboardData.weekly?.aiBriefing || []} />}

        {active !== "monthly" && (
          <section className="grid items-start gap-6 lg:grid-cols-2">
            <Card title="매출관리 필요매장">
              {active === "weekly" ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <ClickableStoreList title="호조 매장 TOP3" rows={weeklyGood} mode="good" selected={selectedReviewStore} onSelect={setReviewStore} />
                    <ClickableStoreList title="부진 매장 TOP3" rows={weeklyBad} mode="bad" selected={selectedReviewStore} onSelect={setReviewStore} />
                  </div>
                  {selectedReviewStore && <StoreDetailPanel storeName={selectedReviewStore} storeRow={selectedStoreRow} data={dashboardData} />}
                </>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <StoreMiniList title="호조 매장 TOP3" rows={weeklyGood} mode="good" />
                  <StoreMiniList title="부진 매장 TOP3" rows={weeklyBad} mode="bad" />
                </div>
              )}
            </Card>
            <Card title={active === "daily" ? "매장별 일매출 순위" : "매장별 주간 매출 순위"}>
              <BarList rows={ranking} field={field} />
            </Card>
          </section>
        )}

        {active === "weekly" && (
          <>
            <section className="grid gap-6 lg:grid-cols-2">
              <Card title="전사 TOP 상품">
                <ProductList items={dashboardData.weekly?.companyTopProducts || []} />
              </Card>
              <Card
                title="점포별 TOP 상품"
                right={
                  <select
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
                    value={store}
                    onChange={(e) => setStore(e.target.value)}
                  >
                    {(dashboardData.weekly?.productStoreNames || []).map((name: string) => <option key={name} value={name}>{name}</option>)}
                  </select>
                }
              >
                <ProductList items={storeProducts} />
              </Card>
            </section>
            <WeeklyInsightCards data={dashboardData} />
          </>
        )}

        {active === "monthly" && (
          <>
            <section className="grid gap-6 lg:grid-cols-2">
              <Card title="월간 호조/부진 매장">
                <div className="grid gap-4 md:grid-cols-2">
                  <StoreMiniList title="월간 호조 TOP3" rows={goodMonthly(core)} mode="good" />
                  <StoreMiniList title="월간 부진 TOP3" rows={badMonthly(core)} mode="bad" />
                </div>
              </Card>
              <Card title="월간 AI 리뷰" tone="purple">
                <ul className="space-y-3 text-sm leading-6 text-slate-700">
                  <li>• 위탁/샵인샵 제외 핵심 매장의 월 누적 매출은 {won(coreTotals.monthSales)}이며 월 목표 대비 {pct(coreTotals.monthRate)}입니다.</li>
                  <li>• 전월 대비 {pct(coreTotals.monthChange)}, 전년동월 대비 {pct(coreTotals.yearMonthChange)} 흐름입니다.</li>
                  <li>• 월간 상품 판매 데이터가 연결되면 상품별 성장/부진 요인을 함께 분석합니다.</li>
                </ul>
              </Card>
            </section>
            <section className="grid gap-6 lg:grid-cols-2">
              <ComingSoon title="월간 TOP 상품" />
              <ComingSoon title="점포별 월간 TOP 상품" />
            </section>
          </>
        )}

        <section className="grid gap-6 lg:grid-cols-2">
          <Card title="위탁 판매 현황" tone="beige">
            <div className="grid gap-4 md:grid-cols-2">
              <StoreMiniList title="위탁 호조 TOP3" rows={shopRows.slice(0, 3)} mode="good" />
              <StoreMiniList title="위탁 부진 TOP3" rows={[...shopRows].reverse().slice(0, 3)} mode="bad" />
            </div>
          </Card>
          <Card title="위탁채널 상품 제안" tone="yellow">
            <div className="space-y-3 text-sm leading-6 text-slate-700">
              <p>• 전사 TOP 상품과 점포별 TOP 상품을 기준으로 위탁채널 투입 후보를 검토하세요.</p>
              <p>• 재고CTRL에서 온/오프 가용재고를 반영한 물류 추가 할당 후보를 확인하세요.</p>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
