import NavTabs from "@/components/NavTabs";
import { Card, Empty, Info, Kpi } from "@/components/Shared";
import { fmtNum, markData, won } from "@/lib/mark";

function ItemList({ items, type }: { items: any[]; type: "rt" | "alloc" | "risk" | "over" | "consign" }) {
  if (!items?.length) return <Empty />;

  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={`${it.styleCode}-${i}`} className="rounded-2xl border border-slate-100 bg-white p-4">
          <div className="flex justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">#{i + 1} · {it.styleCode}</p>
              <p className="font-black">{it.productName}</p>
            </div>
            <div className="text-right">
              {type === "rt" ? (
                <>
                  <p className="font-black">{it.fromStore} → {it.toStore}</p>
                  <p className="text-xs text-slate-500">{fmtNum(it.suggestQty)}장 이동 제안</p>
                </>
              ) : type === "alloc" ? (
                <>
                  <p className="font-black">물류 추가 할당</p>
                  <p className="text-xs text-slate-500">{fmtNum(it.suggestQty)}장 제안</p>
                </>
              ) : (
                <>
                  <p className="font-black">{fmtNum(it.weekNet)}개</p>
                  <p className="text-xs text-slate-500">금주 판매</p>
                </>
              )}
            </div>
          </div>

          {type === "rt" ? (
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <Info label="보내는 점포 재고" value={`${fmtNum(it.fromStock)}개`} />
              <Info label="보내는 점포 재고주수" value={it.fromStockWeeks >= 999 ? "판매없음" : `${it.fromStockWeeks.toFixed(1)}주`} />
              <Info label="받는 점포 재고" value={`${fmtNum(it.toStock)}개`} />
              <Info label="받는 점포 재고주수" value={it.toStockWeeks >= 999 ? "판매없음" : `${it.toStockWeeks.toFixed(1)}주`} />
              <Info label="사유" value={it.reason} />
              <Info label="금주매출" value={won(it.weekAmount)} />
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <Info label="점포 재고" value={`${fmtNum(it.storeStock)}개`} />
              <Info label="온라인 가용" value={`${fmtNum(it.onlineStock)}개`} />
              <Info label="재고주수" value={it.offlineWeeks >= 999 ? "판매없음" : `${it.offlineWeeks?.toFixed?.(1) || "0.0"}주`} />
              <Info label="금주매출" value={won(it.weekAmount)} />
              {type === "alloc" && <Info label="근거" value={it.reason} />}
            </div>
          )}
        </div>
      ))}
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

        <section className="grid gap-6 lg:grid-cols-2">
          <Card title="RT 이동 제안 TOP5">
            <ItemList items={data.rtSuggestions || []} type="rt" />
          </Card>
          <Card title="물류 추가 할당 제안 TOP5">
            <ItemList items={data.allocationSuggestions || []} type="alloc" />
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card title="품절 위험 상품 TOP10">
            <ItemList items={data.stockoutRisk || []} type="risk" />
          </Card>
          <Card title="과재고 상품 TOP10">
            <ItemList items={data.overstockRisk || []} type="over" />
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
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
