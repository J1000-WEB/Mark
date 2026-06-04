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
              <div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
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
            <h1 className="text-3xl font-bold tracking-tight">오프라인 매출 리뷰 대시보드(소재천) Mark2.8</h1>
            <p className="mt-1 text-sm text-slate-500">
              {active === "daily" && "일간 · 일_전일 vs 일_전주"}
              {active === "weekly" && "주간 · 상품/재고 연결"}
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
              <Kpi title="일 목표" value={won(coreTotals.dayTarget)} />
              <Kpi title="일 매출" value={won(coreTotals.daySales)} sub={`전주 동요일 대비 ${pct(coreTotals.dayChange)}`} />
              <Kpi title="일 달성률" value={pct(coreTotals.dayRate)} />
              <Kpi title="월 누적 매출" value={won(coreTotals.monthSales)} sub={pct(coreTotals.monthRate)} />
            </>
          ) : active === "weekly" ? (
            <>
              <Kpi title="주간 목표" value={won(coreTotals.weekTarget)} />
              <Kpi title="주간 매출" value={won(coreTotals.weekSales)} sub={`전주 대비 ${pct(coreTotals.weekChange)}`} />
              <Kpi title="주간 달성률" value={pct(coreTotals.weekRate)} />
              <Kpi title="월 누적 매출" value={won(coreTotals.monthSales)} sub={pct(coreTotals.monthRate)} />
            </>
          ) : (
            <>
              <Kpi title="월 목표" value={won(coreTotals.monthTarget)} />
              <Kpi title="월 누적 매출" value={won(coreTotals.monthSales)} sub={`전월 대비 ${pct(coreTotals.monthChange)}`} />
              <Kpi title="월 달성률" value={pct(coreTotals.monthRate)} />
              <Kpi title="전년동월 대비" value={pct(coreTotals.yearMonthChange)} />
            </>
          )}
        </section>

        {active === "weekly" && (
          <section className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">이번 주 한 줄 결론</h2>
            <p className="mt-3 text-slate-700">
              핵심 매장 기준 주간 매출은 전주 대비 {coreTotals.weekChange >= 0 ? "성장" : "하락"}했습니다. 호조 매장은 판매 포인트를 공유하고,
              부진 매장은 상품 구성과 재고 보강을 점검하세요.
            </p>
          </section>
        )}

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
                  {(markData.weekly?.productStoreNames || []).map((name: string) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              }
            >
              <ProductList items={storeProducts} />
            </Card>
          </section>
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
              <Card title="월간 매출 리뷰">
                <ul className="space-y-3 text-sm leading-6 text-slate-700">
                  <li>• 위탁/샵인샵 제외 핵심 매장의 월 누적 매출은 {won(coreTotals.monthSales)}이며 월 목표 대비 {pct(coreTotals.monthRate)}입니다.</li>
                  <li>• 전월 대비 {pct(coreTotals.monthChange)}, 전년동월 대비 {pct(coreTotals.yearMonthChange)} 흐름입니다.</li>
                  <li>• 호조 매장의 성장 요인은 공유하고, 부진 매장은 상품 구성·진열·재고 보강을 점검하세요.</li>
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
          <Card title="위탁 판매 현황">
            <div className="grid gap-4 md:grid-cols-2">
              <StoreMiniList title="위탁 호조 TOP3" rows={shopRows.slice(0, 3)} mode="good" />
              <StoreMiniList title="위탁 부진 TOP3" rows={[...shopRows].reverse().slice(0, 3)} mode="bad" />
            </div>
          </Card>
          <Card title="위탁채널 상품 제안">
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
