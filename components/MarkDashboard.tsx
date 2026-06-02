"use client";

import { useMemo, useState } from "react";
import NavTabs from "@/components/NavTabs";
import {
  fmtNum,
  formatWon,
  markData,
  mergeRows,
  monthlyReview,
  pct,
  positiveStores,
  salesRankAll,
  shopInventoryNote,
  shopPositive,
  shopWeak,
  splitStores,
  totals,
  weakStores,
  weeklyOneLine,
} from "@/lib/mark";

function Kpi({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-3 text-2xl font-black tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-sm font-bold text-slate-500">{sub}</p>}
    </div>
  );
}

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Empty() {
  return <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">표시할 데이터가 없습니다.</div>;
}

function StoreCard({ r, mode = "week" }: { r: any; mode?: "week" | "day" }) {
  const current = mode === "day" ? r.daySales : r.weekSales;
  const prev = mode === "day" ? r.compareDaySales : r.compareWeekSales;
  const change = mode === "day" ? r.dayChangeRate : r.weekChangeRate;
  const rate = mode === "day" ? r.dayRate : r.weekRate;
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black">{r.storeName}</p>
          <p className="mt-1 text-xs text-slate-500">전주 {formatWon(prev)}</p>
        </div>
        <div className="text-right">
          <p className={`font-black ${change < 0 ? "text-red-600" : "text-blue-600"}`}>
            {change >= 0 ? "+" : ""}{pct(change)}
          </p>
          <p className="text-xs text-slate-500">전주비</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-white p-3">
          <p className="text-xs text-slate-500">{mode === "day" ? "일매출" : "주간 매출"}</p>
          <p className="mt-1 font-black">{formatWon(current)}</p>
        </div>
        <div className="rounded-xl bg-white p-3">
          <p className="text-xs text-slate-500">달성률</p>
          <p className="mt-1 font-bold">{pct(rate)}</p>
        </div>
      </div>
    </div>
  );
}

function RankList({ rows, field, mode }: { rows: any[]; field: string; mode: "week" | "day" | "month" }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[field] || 0)));
  return (
    <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
      {rows.map((r, i) => {
        const current = Number(r[field] || 0);
        const prev = mode === "day" ? r.compareDaySales : mode === "month" ? r.compareMonthSales : r.compareWeekSales;
        const change = mode === "day" ? r.dayChangeRate : mode === "month" ? r.monthChangeRate : r.weekChangeRate;
        const width = Math.max(4, (current / max) * 100);
        return (
          <div key={r.storeName}>
            <div className="mb-1 flex justify-between gap-3 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">#{i + 1} {r.storeName}</span>
              <span>{formatWon(current)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-slate-900" style={{ width: `${width}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              전주 {formatWon(prev)} · 전주비 <span className={change < 0 ? "text-red-600" : "text-blue-600"}>{change >= 0 ? "+" : ""}{pct(change)}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ProductList({ products, showContribution = false }: { products: any[]; showContribution?: boolean }) {
  if (!products?.length) return <Empty />;
  return (
    <div className="space-y-3">
      {products.map((p, i) => (
        <div key={`${p.styleCode}-${i}`} className="rounded-2xl border border-slate-100 bg-white p-4">
          <div className="flex justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">#{i + 1} · {p.styleCode}</p>
              <p className="font-black">{p.productName}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black">{fmtNum(p.weekNet)}개</p>
              <p className="text-xs text-slate-500">금주 합계</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <Info label="전주 합계" value={`${fmtNum(p.prevNet)}개`} />
            <Info label="수량 증감률" value={`${p.qtyChangeRate >= 0 ? "+" : ""}${pct(p.qtyChangeRate)}`} danger={p.qtyChangeRate < 0} />
            <Info label="금주 매출" value={formatWon(p.weekAmount)} />
            <Info label={showContribution ? "매출 기여도" : "매출 신장률"} value={showContribution ? pct(p.contributionRate) : `${p.amountChangeRate >= 0 ? "+" : ""}${pct(p.amountChangeRate)}`} danger={!showContribution && p.amountChangeRate < 0} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Info({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 font-bold ${danger ? "text-red-600" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}

export default function MarkDashboard({ active }: { active: "daily" | "weekly" | "monthly" }) {
  const [selectedStore, setSelectedStore] = useState(markData.weekly.productStoreNames?.[0] || "");
  const pageData = markData[active];

  const merged =
    active === "monthly"
      ? mergeRows(pageData.current.rows, pageData.prevMonth.rows, pageData.prevYear.rows)
      : mergeRows(pageData.current.rows, pageData.compare.rows);

  const { core, shopInShop } = splitStores(merged);
  const coreTotals = totals(core);
  const good = positiveStores(core, active === "daily" ? "daySales" : "weekSales");
  const bad = weakStores(core, active === "daily" ? "daySales" : "weekSales");
  const shopGood = shopPositive(shopInShop);
  const shopBad = shopWeak(shopInShop);
  const rankField = active === "daily" ? "daySales" : active === "monthly" ? "monthSales" : "weekSales";
  const ranking = salesRankAll(core, rankField);
  const review = monthlyReview(core);
  const storeProducts = useMemo(() => markData.weekly.storeTopProducts?.[selectedStore] || [], [selectedStore]);
  const oneLine = weeklyOneLine(core);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">오프라인 매출 리뷰 대시보드(소재천) Mark2.6</h1>
            <p className="mt-1 text-sm text-slate-500">
              {active === "daily" && "일간 · 일_전일 vs 일_전주"}
              {active === "weekly" && "주간 · 압축 운영판 · 상품/위탁 분석 강화"}
              {active === "monthly" && "월간 · 위탁 제외 핵심매장 중심"}
            </p>
          </div>
          <NavTabs active={active} />
        </header>

        <section className="rounded-3xl bg-white p-4 text-sm text-slate-600 shadow-sm">
          <b className="text-slate-900">현재 데이터:</b> 📊 매출 통합 대시보드 2026 (NEW).xlsx · 내장 데이터
          <div className="mt-1 text-xs text-slate-500">오프라인_으로 시작하는 위탁/특수채널은 상단 수치분석에서 제외하고 하단 별도 영역에서 관리합니다.</div>
        </section>

        <section className="rounded-3xl bg-slate-900 p-4 text-sm font-bold text-white shadow-sm">
          {pageData.periodLabel}
        </section>

        {active === "weekly" && (
          <section className="rounded-3xl bg-blue-50 p-5 shadow-sm">
            <p className="text-sm font-bold text-blue-700">이번 주 한 줄 결론</p>
            <p className="mt-2 text-xl font-black text-blue-950">{oneLine}</p>
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-4">
          {active === "daily" ? (
            <>
              <Kpi title="일 목표" value={formatWon(coreTotals.dayTarget)} />
              <Kpi title="일 매출" value={formatWon(coreTotals.daySales)} sub={`전주 동요일 대비 ${pct(coreTotals.dayChange)}`} />
              <Kpi title="일 달성률" value={pct(coreTotals.dayRate)} />
              <Kpi title="월 누적 매출" value={formatWon(coreTotals.monthSales)} sub={pct(coreTotals.monthRate)} />
            </>
          ) : active === "weekly" ? (
            <>
              <Kpi title="주간 목표" value={formatWon(coreTotals.weekTarget)} />
              <Kpi title="주간 매출" value={formatWon(coreTotals.weekSales)} sub={`전주 대비 ${pct(coreTotals.weekChange)}`} />
              <Kpi title="주간 달성률" value={pct(coreTotals.weekRate)} />
              <Kpi title="월 누적 매출" value={formatWon(coreTotals.monthSales)} sub={pct(coreTotals.monthRate)} />
            </>
          ) : (
            <>
              <Kpi title="월 목표" value={formatWon(coreTotals.monthTarget)} />
              <Kpi title="월 누적 매출" value={formatWon(coreTotals.monthSales)} sub={`전월 대비 ${pct(coreTotals.monthChange)}`} />
              <Kpi title="월 달성률" value={pct(coreTotals.monthRate)} />
              <Kpi title="전년동월 대비" value={pct(coreTotals.yearMonthChange)} />
            </>
          )}
        </section>

        {active !== "monthly" && (
          <section className="grid gap-6 lg:grid-cols-2">
            <Card title="매출관리 필요매장">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-3 font-black text-blue-700">호조 매장 TOP3</h3>
                  <div className="space-y-3">{good.map((r) => <StoreCard key={r.storeName} r={r} mode={active === "daily" ? "day" : "week"} />)}</div>
                </div>
                <div>
                  <h3 className="mb-3 font-black text-red-700">부진 매장 TOP3</h3>
                  <div className="space-y-3">{bad.map((r) => <StoreCard key={r.storeName} r={r} mode={active === "daily" ? "day" : "week"} />)}</div>
                </div>
              </div>
            </Card>

            <Card title={active === "daily" ? "매장별 일매출 순위" : "매장별 주간 매출 순위"}>
              <RankList rows={ranking} field={rankField} mode={active === "daily" ? "day" : "week"} />
            </Card>
          </section>
        )}

        {active === "weekly" && (
          <section className="grid gap-6 lg:grid-cols-2">
            <Card title="전사 TOP 상품">
              <ProductList products={markData.weekly.companyTopProducts || []} showContribution />
            </Card>
            <Card
              title="점포별 TOP 상품"
              right={
                <select
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
                  value={selectedStore}
                  onChange={(e) => setSelectedStore(e.target.value)}
                >
                  {markData.weekly.productStoreNames?.map((name: string) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              }
            >
              <ProductList products={storeProducts} />
            </Card>
          </section>
        )}

        {active === "monthly" && (
          <section className="grid gap-6 lg:grid-cols-2">
            <Card title="월간 매출 리뷰">
              <ul className="space-y-3 text-sm leading-6 text-slate-700">
                {review.map((line) => <li key={line}>• {line}</li>)}
              </ul>
            </Card>
            <Card title="월간 운영 제안">
              <ul className="space-y-3 text-sm leading-6 text-slate-700">
                <li>• 월간 리뷰는 위탁/샵인샵을 제외한 핵심 매장 기준으로 판단합니다.</li>
                <li>• 전월 대비 역신장 매장은 상품 구성, 진열, 프로모션 반응을 우선 점검하세요.</li>
                <li>• 전년동월 대비 역신장 매장은 상권 변화와 매장 운영 이슈를 함께 확인하세요.</li>
              </ul>
            </Card>
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-2">
          <Card title="위탁 판매 현황">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-3 font-black text-blue-700">위탁 호조 TOP3</h3>
                <div className="space-y-3">
                  {shopGood.map((r) => <ShopCard key={r.storeName} r={r} />)}
                </div>
              </div>
              <div>
                <h3 className="mb-3 font-black text-red-700">위탁 부진 TOP3</h3>
                <div className="space-y-3">
                  {shopBad.map((r) => <ShopCard key={r.storeName} r={r} />)}
                </div>
              </div>
            </div>
          </Card>

          <Card title="위탁 상품 투입 제안">
            <div className="space-y-3">
              {(markData.weekly.shopRecommendProducts || []).slice(0, 5).map((p: any, i: number) => (
                <div key={`${p.styleCode}-${i}`} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-500">추천 #{i + 1} · {p.styleCode}</p>
                      <p className="font-black">{p.productName}</p>
                      <p className="mt-1 text-xs text-slate-500">위탁 판매 상위 상품 · 재고 확인 후 부족 시 추가 투입 검토</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black">{fmtNum(p.weekNet)}개</p>
                      <p className="text-xs text-slate-500">위탁 금주 판매</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}

function ShopCard({ r }: { r: any }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="flex justify-between gap-4">
        <div>
          <p className="font-black">{r.storeName}</p>
          <p className="mt-1 text-xs text-slate-500">{shopInventoryNote(r)}</p>
        </div>
        <div className="text-right">
          <p className="font-black">{formatWon(r.weekSales)}</p>
          <p className={`text-xs font-bold ${r.weekChangeRate < 0 ? "text-red-600" : "text-blue-600"}`}>
            {r.weekChangeRate >= 0 ? "+" : ""}{pct(r.weekChangeRate)}
          </p>
        </div>
      </div>
    </div>
  );
}
