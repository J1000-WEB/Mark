import NavTabs from "@/components/NavTabs";
import {
  attentionStores,
  formatWon,
  markData,
  mergeRows,
  monthlyReview,
  pct,
  salesRank,
  shopSummary,
  splitStores,
  totals,
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xl font-black">{title}</h2>
      {children}
    </section>
  );
}

function Empty() {
  return <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">표시할 데이터가 없습니다.</div>;
}

function MiniBar({ label, value, max, sub }: { label: string; value: number; max: number; sub?: string }) {
  const width = max ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">{label}</span>
        <span>{formatWon(value)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-900" style={{ width: `${width}%` }} />
      </div>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function MarkDashboard({ active }: { active: "daily" | "weekly" | "monthly" }) {
  const pageData = markData[active];
  const merged =
    active === "monthly"
      ? mergeRows(pageData.current.rows, pageData.prevMonth.rows, pageData.prevYear.rows)
      : mergeRows(pageData.current.rows, pageData.compare.rows);

  const { core, shopInShop } = splitStores(merged);
  const coreTotals = totals(core);
  const allTotals = totals(merged);
  const shopRows = shopSummary(shopInShop);
  const attention = attentionStores(core);
  const rankField = active === "daily" ? "daySales" : active === "monthly" ? "monthSales" : "weekSales";
  const ranking = salesRank(core, rankField);
  const maxSales = Math.max(1, ...ranking.map((r) => Number(r[rankField] || 0)));
  const review = monthlyReview(core, shopInShop);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">오프라인 매출 리뷰 대시보드(소재천) Mark2.3</h1>
            <p className="mt-1 text-sm text-slate-500">
              {active === "daily" && "일간 · 일_전일 vs 일_전주"}
              {active === "weekly" && "주간 · 차주(531) vs 일_전주"}
              {active === "monthly" && "월간 · 위탁 제외 핵심매장 중심"}
            </p>
          </div>
          <NavTabs active={active} />
        </header>

        <section className="rounded-3xl bg-white p-4 text-sm text-slate-600 shadow-sm">
          <b className="text-slate-900">현재 데이터:</b> 📊 매출 통합 대시보드 2026 (NEW).xlsx · 내장 데이터
          <div className="mt-1 text-xs text-slate-500">위탁/샵인샵은 상단 KPI·관리매장·매장순위에서 제외하고 하단 별도 영역에서 관리합니다.</div>
        </section>

        <section className="rounded-3xl bg-slate-900 p-4 text-sm font-bold text-white shadow-sm">
          {pageData.periodLabel}
        </section>

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
              <Kpi title="주간 매출" value={formatWon(coreTotals.weekSales)} sub={`비교기간 대비 ${pct(coreTotals.weekChange)}`} />
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
              <div className="space-y-4">
                {attention.length === 0 && <Empty />}
                {attention.map((r, i) => (
                  <div key={r.storeName} className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500">#{i + 1}</p>
                        <p className="text-lg font-black">{r.storeName}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-black ${(active === "daily" ? r.dayChangeRate : r.weekChangeRate) < 0 ? "text-red-600" : "text-blue-600"}`}>
                          {(active === "daily" ? r.dayChangeRate : r.weekChangeRate) >= 0 ? "+" : ""}{pct(active === "daily" ? r.dayChangeRate : r.weekChangeRate)}
                        </p>
                        <p className="text-xs text-slate-500">비교기간 대비</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded-xl bg-white p-3">
                        <p className="text-xs text-slate-500">{active === "daily" ? "비교 일매출" : "비교 주매출"}</p>
                        <p className="mt-1 font-bold">{formatWon(active === "daily" ? r.compareDaySales : r.compareWeekSales)}</p>
                      </div>
                      <div className="rounded-xl bg-white p-3">
                        <p className="text-xs text-slate-500">{active === "daily" ? "현재 일매출" : "현재 주매출"}</p>
                        <p className="mt-1 font-black">{formatWon(active === "daily" ? r.daySales : r.weekSales)}</p>
                      </div>
                      <div className="rounded-xl bg-white p-3">
                        <p className="text-xs text-slate-500">달성률</p>
                        <p className="mt-1 font-bold">{pct(active === "daily" ? r.dayRate : r.weekRate)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title={active === "daily" ? "매장별 일매출 순위" : "매장별 주간 매출 순위"}>
              <div className="space-y-4">
                {ranking.length === 0 && <Empty />}
                {ranking.map((r) => {
                  const change = active === "daily" ? r.dayChangeRate : r.weekChangeRate;
                  const current = Number(r[rankField] || 0);
                  const prev = active === "daily" ? r.compareDaySales : r.compareWeekSales;
                  return (
                    <MiniBar
                      key={r.storeName}
                      label={r.storeName}
                      value={current}
                      max={maxSales}
                      sub={`비교 ${formatWon(prev)} · 전주비 ${change >= 0 ? "+" : ""}${pct(change)}`}
                    />
                  );
                })}
              </div>
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
          <Card title="위탁/샵인샵 채널 현황">
            <div className="space-y-3">
              {shopRows.length === 0 && <Empty />}
              {shopRows.map((r) => (
                <div key={r.storeName} className="rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="font-black">{r.storeName}</p>
                      <p className="mt-1 text-sm text-slate-500">{r.inventoryNote}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black">{formatWon(active === "daily" ? r.daySales : active === "monthly" ? r.monthSales : r.weekSales)}</p>
                      <p className="text-xs text-slate-500">{active === "daily" ? "일매출" : active === "monthly" ? "월매출" : "주간 매출"}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="위탁채널 재고/상품 운영 제안">
            <div className="space-y-3 text-sm leading-6 text-slate-700">
              <p>• 위탁채널은 매출 규모보다 재고 회전과 상품 투입 필요 여부 중심으로 판단합니다.</p>
              <p>• 달성률이 높은 위탁채널은 재고 소진 속도가 빠를 가능성이 있어 추가 투입 후보로 관리합니다.</p>
              <p>• 달성률이 낮은 위탁채널은 전사 베스트 상품 중심으로 상품 교체 또는 재고 순환을 검토합니다.</p>
              <p>• 다음 단계에서 상품별 판매/재고 시트를 연결하면 채널별 추천 상품을 자동 산출할 수 있습니다.</p>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
