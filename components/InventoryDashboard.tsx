import NavTabs from "@/components/NavTabs";
import { Card, Empty, Kpi } from "@/components/Shared";
import { fmtNum, markData, won } from "@/lib/mark";

function stockWeekText(value: any) {
  const n = Number(value || 0);
  if (n >= 999) return "판매없음";
  return `${n.toFixed(1)}주`;
}

function stockWeekClass(value: any) {
  const n = Number(value || 0);
  if (n >= 999 || n >= 8) return "text-blue-600";
  if (n <= 2) return "text-red-600";
  if (n <= 4) return "text-orange-500";
  return "text-slate-900";
}

function Stat({ label, value, emphasis = false, colorClass = "" }: { label: string; value: string; emphasis?: boolean; colorClass?: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-2 ${emphasis ? "text-xl font-black" : "font-black"} ${colorClass}`}>{value}</p>
    </div>
  );
}

function ReasonBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
      <div className="text-sm font-semibold leading-6 text-slate-700">{children}</div>
    </div>
  );
}

function RTCard({ it, index }: { it: any; index: number }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">#{index + 1} · {it.styleCode}</p>
          <p className="mt-1 text-lg font-black">{it.productName}</p>
        </div>
        <div className="rounded-2xl bg-slate-900 px-4 py-3 text-right text-white">
          <p className="text-xs text-slate-300">이동 제안</p>
          <p className="text-xl font-black">{fmtNum(it.suggestQty)}장</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-bold text-slate-500">보내는 점포</p>
          <p className="mt-1 text-lg font-black">{it.fromStore}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="재고수량" value={`${fmtNum(it.fromStock)}개`} />
            <Stat label="재고주수" value={stockWeekText(it.fromStockWeeks)} colorClass={stockWeekClass(it.fromStockWeeks)} />
          </div>
        </div>

        <div className="flex items-center justify-center">
          <div className="rounded-full bg-slate-900 px-4 py-2 text-sm font-black text-white">→</div>
        </div>

        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-bold text-slate-500">받는 점포</p>
          <p className="mt-1 text-lg font-black">{it.toStore}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="재고수량" value={`${fmtNum(it.toStock)}개`} />
            <Stat label="재고주수" value={stockWeekText(it.toStockWeeks)} colorClass={stockWeekClass(it.toStockWeeks)} />
          </div>
        </div>
      </div>

      <ReasonBox title="추천 사유">
        <p>{it.reason}</p>
        <p className="mt-1">금주매출: <b>{won(it.weekAmount)}</b></p>
      </ReasonBox>
    </div>
  );
}

function AllocationCard({ it, index }: { it: any; index: number }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">#{index + 1} · {it.styleCode}</p>
          <p className="mt-1 text-lg font-black">{it.productName}</p>
        </div>
        <div className="rounded-2xl bg-slate-900 px-4 py-3 text-right text-white">
          <p className="text-xs text-slate-300">물류 추가 할당</p>
          <p className="text-xl font-black">{fmtNum(it.suggestQty)}장</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="점포 재고" value={`${fmtNum(it.storeStock)}개`} />
        <Stat label="온라인 가용" value={`${fmtNum(it.onlineStock)}개`} />
        <Stat label="재고주수" value={stockWeekText(it.offlineWeeks)} colorClass={stockWeekClass(it.offlineWeeks)} />
        <Stat label="금주매출" value={won(it.weekAmount)} />
      </div>

      <ReasonBox title="추천 근거">
        <p>{it.reason}</p>
        <p className="mt-1">판매속도 대비 점포 재고가 낮아 추가 할당 검토가 필요합니다.</p>
      </ReasonBox>
    </div>
  );
}

function SimpleCard({ it, index, type }: { it: any; index: number; type: "risk" | "over" | "consign" }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">#{index + 1} · {it.styleCode}</p>
          <p className="mt-1 font-black">{it.productName}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-black">{fmtNum(it.weekNet)}개</p>
          <p className="text-xs text-slate-500">금주 판매</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="점포 재고" value={`${fmtNum(it.storeStock ?? it.offlineStock)}개`} />
        <Stat label="온라인 가용" value={`${fmtNum(it.onlineStock)}개`} />
        <Stat label="재고주수" value={stockWeekText(it.offlineWeeks)} colorClass={stockWeekClass(it.offlineWeeks)} />
        <Stat label="금주매출" value={won(it.weekAmount)} />
      </div>
      {type === "consign" && (
        <ReasonBox title="추천 근거">
          <p>{it.reason || "전사 매출 상위 상품 기준 위탁 채널 투입 후보입니다."}</p>
        </ReasonBox>
      )}
    </div>
  );
}

function ItemList({ items, type }: { items: any[]; type: "rt" | "alloc" | "risk" | "over" | "consign" }) {
  if (!items?.length) return <Empty />;

  return (
    <div className="space-y-4">
      {items.map((it, i) => {
        if (type === "rt") return <RTCard key={`${it.styleCode}-${i}`} it={it} index={i} />;
        if (type === "alloc") return <AllocationCard key={`${it.styleCode}-${i}`} it={it} index={i} />;
        return <SimpleCard key={`${it.styleCode}-${i}`} it={it} index={i} type={type} />;
      })}
    </div>
  );
}

export default function InventoryDashboard() {
  const data = markData?.inventory || {};
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">재고CTRL</h1>
            <p className="mt-1 text-sm text-slate-500">금주전주 I열 점포재고 + 온오프재고현황 E/F/Q/R/S 기반</p>
          </div>
          <NavTabs active="inventory" />
        </header>

        <section className="rounded-3xl bg-slate-900 p-4 text-sm font-bold text-white shadow-sm">
          {data.periodLabel}
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <Kpi title="RT 제안" value={`${data.rtSuggestions?.length || 0}건`} />
          <Kpi title="물류 추가 할당" value={`${data.allocationSuggestions?.length || 0}건`} />
          <Kpi title="품절 위험" value={`${data.stockoutRisk?.length || 0}품번`} />
          <Kpi title="과재고 위험" value={`${data.overstockRisk?.length || 0}품번`} />
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">재고CTRL 주간 리뷰</h2>
          <p className="mt-3 text-slate-700">
            품절 위험 상품은 RT 또는 물류 추가 할당을 우선 검토하고, 과재고 상품은 판매 호조 매장으로 이동하거나 다음 출고 우선순위를 낮추는 것이 좋습니다.
          </p>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card title="RT 이동 제안 TOP5">
            <ItemList items={data.rtSuggestions || []} type="rt" />
          </Card>
          <Card title="물류 추가 할당 제안 TOP5">
            <ItemList items={data.allocationSuggestions || []} type="alloc" />
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card title="품절 위험 상품 TOP10">
            <ItemList items={data.stockoutRisk || []} type="risk" />
          </Card>
          <Card title="과재고 상품 TOP10">
            <ItemList items={data.overstockRisk || []} type="over" />
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card title="위탁 상품 투입 추천">
            <ItemList items={data.consignmentRecommendations || []} type="consign" />
          </Card>
          <Card title="운영 프로세스 제안">
            <ul className="space-y-3 text-sm leading-6 text-slate-700">
              <li>• 1차: 점포간 RT로 부족 매장을 보완합니다.</li>
              <li>• 2차: RT로 해결이 어려운 품번은 물류 추가 할당을 요청합니다.</li>
              <li>• 3차: 위탁채널은 전사 TOP 상품과 가용재고를 함께 보고 투입 후보를 정합니다.</li>
            </ul>
          </Card>
        </section>
      </div>
    </main>
  );
}
