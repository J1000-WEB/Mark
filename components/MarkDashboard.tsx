"use client";

import { useMemo, useState } from "react";
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
    <div className="max-h-[520px] space-y-4 overflow-y-auto pr-2">
      {rows.map((r) => {
        const value = Number(r[field] || 0);
        const prev = field === "daySales" ? r.compareDaySales : r.compareWeekSales;
        const change = field === "daySales" ? r.dayChangeRate : r.weekChangeRate;
        return (
          <div key={r.storeName}>
            <div className="mb-1 flex justify-between gap-3 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{r.storeName}</span>
              <span>{won(value)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              전주 {won(prev)} · 전주비 {change >= 0 ? "+" : ""}{pct(change)}
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

function WeeklyInsightCards() {
  const concentration = markData.weekly?.top10Concentration || 0;
  const entrants = markData.weekly?.newTop10Entrants || [];
  const inv = markData.inventory || {};
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

export default function MarkDashboard({ active }: { active: "daily" | "weekly" | "monthly" }) {
  const [store, setStore] = useState(markData.weekly?.productStoreNames?.[0] || "");
  const pageData = markData?.[active] || { current: [], compare: [], year: [], periodLabel: "" };

  const merged =
    active === "monthly"
      ? mergeRows(pageData.current || [], pageData.compare || [], pageData.year || [])
      : mergeRows(pageData.current || [], pageData.compare || []);

  const { core, shop } = splitStores(merged);
  const coreTotals = totals(core);
  const shopRows = shopSummary(shop);

  const field = active === "daily" ? "daySales" : active === "monthly" ? "monthSales" : "weekSales";
  const ranking = salesRank(core, field);
  const storeProducts = useMemo(() => markData.weekly?.storeTopProducts?.[store] || [], [store]);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">오프라인 매출 리뷰 대시보드(소재천) Mark2.9.1</h1>
            <p className="mt-1 text-sm text-slate-500">
              {active === "daily" && "일간 · 일_전일 vs 일_전주"}
              {active === "weekly" && "주간 · AI 브리핑 + 상품/재고 인사이트"}
              {active === "monthly" && "월간 · 호조/부진 매장 + 상품영역 준비중"}
            </p>
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

        {active === "weekly" && <Briefing lines={markData.weekly?.aiBriefing || []} />}

        {active !== "monthly" && (
          <section className="grid gap-6 lg:grid-cols-2">
            <Card title="매출관리 필요매장">
              <div className="grid gap-4 md:grid-cols-2">
                <StoreMiniList title="호조 매장 TOP3" rows={goodWeekly(core)} mode="good" />
                <StoreMiniList title="부진 매장 TOP3" rows={badWeekly(core)} mode="bad" />
              </div>
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
                <ProductList items={markData.weekly?.companyTopProducts || []} />
              </Card>
              <Card
                title="점포별 TOP 상품"
                right={
                  <select
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
                    value={store}
                    onChange={(e) => setStore(e.target.value)}
                  >
                    {(markData.weekly?.productStoreNames || []).map((name: string) => <option key={name} value={name}>{name}</option>)}
                  </select>
                }
              >
                <ProductList items={storeProducts} />
              </Card>
            </section>
            <WeeklyInsightCards />
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
