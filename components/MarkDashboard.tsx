import NavTabs from "@/components/NavTabs";
import {
  attentionStores,
  formatWon,
  markData,
  mergeCurrentCompare,
  monthlyReview,
  pct,
  salesRank,
  shopSummary,
  splitStores,
  totalsFromRows,
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

function MiniBar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span>{formatWon(value)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-900" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function MarkDashboard({ active }: { active: "daily" | "weekly" | "monthly" }) {
  const pageData = markData[active];

  let currentRows: any[] = [];
  let compareRows: any[] = [];
  let periodLabel = pageData.periodLabel;

  if (active === "weekly") {
    currentRows = pageData.current.rows;
    compareRows = pageData.compare.rows;
  } else if (active === "daily") {
    currentRows = pageData.current.rows;
    compareRows = pageData.compare.rows;
  } else {
    currentRows = pageData.current.rows;
    compareRows = pageData.prevMonth.rows;
  }

  const merged = mergeCurrentCompare(currentRows, compareRows);
  const { core, shopInShop } = splitStores(merged);
  const total = totalsFromRows(merged);
  const coreTotal = totalsFromRows(core);
  const shopRows = shopSummary(shopInShop);
  const attention = attentionStores(core);
  const rankField = active === "daily" ? "dailySales" : active === "monthly" ? "monthSales" : "weekSales";
  const ranking = salesRank(core, rankField);
  const maxSales = Math.max(1, ...ranking.map((r) => Number(r[rankField] || 0)));
  const review = monthlyReview(core, shopInShop);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">오프라인 매출 리뷰 대시보드(소재천) Mark2.2</h1>
            <p className="mt-1 text-sm text-slate-500">
              {active === "daily" && "일간 · 일_전일 vs 일_전주"}
              {active === "weekly" && "주간 · 차주(531) vs 일_전주"}
              {active === "monthly" && "월간 · 당월 vs 전월/전년동월"}
            </p>
          </div>
          <NavTabs active={active} />
        </header>

        <section className="rounded-3xl bg-white p-4 text-sm text-slate-600 shadow-sm">
          <b className="text-slate-900">현재 데이터:</b> 📊 매출 통합 대시보드 2026 (NEW).xlsx · 프로젝트 내장 데이터
          <div className="mt-1 text-xs text-slate-500">
            주간 매핑: 차주(531) → 분석값 / 일_전주 → 비교값
          </div>
        </section>

        <section className="rounded-3xl bg-slate-900 p-4 text-sm font-bold text-white shadow-sm">
          {periodLabel}
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          {active === "daily" ? (
            <>
              <Kpi title="전체 일매출" value={formatWon(total.dailySales)} sub={`전주 동요일 대비 ${pct(total.dailyChange)}`} />
              <Kpi title="전체 일목표" value={formatWon(total.dailyTarget)} />
              <Kpi title="일 목표 달성률" value={pct(total.dailyRate)} />
              <Kpi title="월 누적 매출" value={formatWon(total.monthSales)} sub={pct(total.monthRate)} />
            </>
          ) : active === "weekly" ? (
            <>
              <Kpi title="전체 주간 매출" value={formatWon(total.weekSales)} sub={`비교기간 대비 ${pct(total.weekChange)}`} />
              <Kpi title="전체 주간 목표" value={formatWon(total.weekTarget)} />
              <Kpi title="전체 달성률" value={pct(total.weekRate)} />
              <Kpi title="월 누적 매출" value={formatWon(total.monthSales)} sub={pct(total.monthRate)} />
            </>
          ) : (
            <>
              <Kpi title="월 누적 매출" value={formatWon(total.monthSales)} sub={`전월 대비 ${pct(total.monthChange)}`} />
              <Kpi title="월 목표" value={formatWon(total.monthTarget)} />
              <Kpi title="월 달성률" value={pct(total.monthRate)} />
              <Kpi title="위탁/샵인샵 주간 매출" value={formatWon(totalsFromRows(shopInShop).weekSales)} />
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
                        <p className={`text-xl font-black ${r.weekChangeRate < 0 ? "text-red-600" : "text-blue-600"}`}>
                          {r.weekChangeRate >= 0 ? "+" : ""}{pct(r.weekChangeRate)}
                        </p>
                        <p className="text-xs text-slate-500">비교기간 대비</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl bg-white p-3">
                        <p className="text-xs text-slate-500">{active === "daily" ? "일매출" : "주간 매출"}</p>
                        <p className="mt-1 font-black">{formatWon(active === "daily" ? r.dailySales : r.weekSales)}</p>
                      </div>
                      <div className="rounded-xl bg-white p-3">
                        <p className="text-xs text-slate-500">달성률</p>
                        <p className="mt-1 font-bold">{pct(active === "daily" ? r.dailyRate : r.weekRate)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title={active === "daily" ? "매장별 일매출 순위" : "매장별 주간 매출 순위"}>
              <div className="space-y-4">
                {ranking.length === 0 && <Empty />}
                {ranking.map((r) => (
                  <MiniBar key={r.storeName} label={r.storeName} value={Number(r[rankField] || 0)} max={maxSales} />
                ))}
              </div>
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
                      <p className="font-black">{formatWon(r.weekSales)}</p>
                      <p className="text-xs text-slate-500">주간 매출</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="위탁채널 상품 투입 제안">
            <div className="space-y-3 text-sm leading-6 text-slate-700">
              <p>• 달성률이 높은 위탁채널은 재고 소진 속도가 빠를 가능성이 있어 추가 투입 후보로 관리합니다.</p>
              <p>• 달성률이 낮은 위탁채널은 전사 베스트 상품 중심으로 상품 교체 또는 재고 순환을 검토합니다.</p>
              <p>• 다음 단계에서는 상품별 판매/재고 시트를 연결해 채널별 추천 상품을 자동 산출합니다.</p>
            </div>
          </Card>
        </section>

        {active === "monthly" && (
          <section className="grid gap-6 lg:grid-cols-2">
            <Card title="월간 AI 리뷰">
              <ul className="space-y-3 text-sm leading-6 text-slate-700">
                {review.map((line) => <li key={line}>• {line}</li>)}
              </ul>
            </Card>
            <Card title="월간 운영 제안">
              <ul className="space-y-3 text-sm leading-6 text-slate-700">
                <li>• 직영/백화점 채널은 목표 달성률과 전월 대비 흐름을 기준으로 관리 우선순위를 정합니다.</li>
                <li>• 위탁채널은 매출보다 재고 순환과 상품 투입 필요 여부를 우선 판단합니다.</li>
                <li>• 전년동월 데이터가 연결되면 성장/역신장 채널을 자동 분류합니다.</li>
              </ul>
            </Card>
          </section>
        )}
      </div>
    </main>
  );
}
