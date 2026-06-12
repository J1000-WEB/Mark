"use client";

import { useEffect, useState } from "react";
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
  return "text-emerald-600";
}

function Stat({ label, value, colorClass = "" }: { label: string; value: string; colorClass?: string }) {
  return (
    <div className="rounded-2xl bg-white/75 p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-2 font-black ${colorClass}`}>{value}</p>
    </div>
  );
}

function ReasonBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl border border-slate-100 bg-white/75 p-4">
      <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
      <div className="text-sm font-semibold leading-6 text-slate-700">{children}</div>
    </div>
  );
}

function PriorityBadge({ value }: { value: string }) {
  const color = value === "A" ? "bg-red-600" : value === "B" ? "bg-orange-500" : "bg-blue-600";
  return <span className={`rounded-full px-3 py-1 text-xs font-black text-white ${color}`}>우선순위 {value}</span>;
}

function Briefing({ lines }: { lines: string[] }) {
  return (
    <Card title="💡 재고CTRL 브리핑" tone="purple">
      <ul className="space-y-2 text-sm font-semibold leading-6 text-slate-700">
        {(lines || []).map((line, i) => <li key={i}>• {line}</li>)}
      </ul>
    </Card>
  );
}

function RTCard({ it, index }: { it: any; index: number }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">#{index + 1} · {it.styleCode}</p>
          <p className="mt-1 text-lg font-black">{it.productName}</p>
          <div className="mt-2"><PriorityBadge value={it.priority || "C"} /></div>
        </div>
        <div className="rounded-2xl bg-slate-900 px-4 py-3 text-right text-white">
          <p className="text-xs text-slate-300">이동 제안</p>
          <p className="text-xl font-black">{fmtNum(it.suggestQty)}장</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
        <div className="rounded-3xl bg-blue-50 p-4">
          <p className="text-xs font-bold text-blue-600">보내는 점포</p>
          <p className="mt-1 text-lg font-black">{it.fromStore}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="현재 재고" value={`${fmtNum(it.fromStock)}개`} />
            <Stat label="현재 재고주수" value={stockWeekText(it.fromStockWeeks)} colorClass={stockWeekClass(it.fromStockWeeks)} />
            <Stat label="RT 후 재고주수" value={stockWeekText(it.fromAfterWeeks)} colorClass={stockWeekClass(it.fromAfterWeeks)} />
            <Stat label="금주매출" value={won(it.weekAmount)} />
          </div>
        </div>

        <div className="flex items-center justify-center">
          <div className="rounded-full bg-slate-900 px-4 py-2 text-sm font-black text-white">→</div>
        </div>

        <div className="rounded-3xl bg-emerald-50 p-4">
          <p className="text-xs font-bold text-emerald-600">받는 점포</p>
          <p className="mt-1 text-lg font-black">{it.toStore}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="현재 재고" value={`${fmtNum(it.toStock)}개`} />
            <Stat label="현재 재고주수" value={stockWeekText(it.toStockWeeks)} colorClass={stockWeekClass(it.toStockWeeks)} />
            <Stat label="RT 후 재고주수" value={stockWeekText(it.toAfterWeeks)} colorClass={stockWeekClass(it.toAfterWeeks)} />
            <Stat label="예상 품절" value={Number(it.stockoutDays || 0) >= 999 ? "판매없음" : `${Number(it.stockoutDays || 0).toFixed(0)}일 내`} colorClass={Number(it.stockoutDays || 0) <= 7 ? "text-red-600" : "text-slate-900"} />
          </div>
        </div>
      </div>

      <ReasonBox title="추천 사유">
        <p>{it.reason}</p>
        <p className="mt-1">목표 재고주수 4주 기준으로 이동수량을 재계산했습니다.</p>
      </ReasonBox>
    </div>
  );
}

function AllocationCard({ it, index }: { it: any; index: number }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
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

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
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
    <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
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
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
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

function ItemList({ items, type, maxHeight }: { items: any[]; type: "rt" | "alloc" | "risk" | "over" | "consign"; maxHeight?: string }) {
  if (!items?.length) return <Empty />;

  return (
    <div className={`${maxHeight || ""} space-y-2 overflow-y-auto pr-2`}>
      {items.map((it, i) => {
        if (type === "rt") return <RTCard key={`${it.styleCode}-${i}`} it={it} index={i} />;
        if (type === "alloc") return <AllocationCard key={`${it.styleCode}-${i}`} it={it} index={i} />;
        return <SimpleCard key={`${it.styleCode}-${i}`} it={it} index={i} type={type} />;
      })}
    </div>
  );
}

function levelBadgeClass(color: string) {
  if (color === "red") return "bg-red-600 text-white";
  if (color === "orange") return "bg-orange-500 text-white";
  return "bg-yellow-100 text-yellow-800";
}

function priceText(value: any) {
  const n = Number(value || 0);
  return n ? `${fmtNum(n)}원` : "-";
}

function PromotionCard({ it, index }: { it: any; index: number }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">#{index + 1} · {it.styleCode} · {it.season}</p>
          <p className="mt-0.5 truncate text-base font-black">{it.productName}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">최초 출고 {it.launchDate || "-"} · 출고 후 {Number(it.weeksSinceLaunch || 0).toFixed(1)}주</p>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${levelBadgeClass(it.levelColor)}`}>{it.promotionLevel}</span>
          <p className="mt-1 text-xs font-black text-slate-700">{it.action}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="합산재고" value={`${fmtNum(it.totalStock)}개`} colorClass="text-blue-600" />
        <Stat label="재고주수" value={stockWeekText(it.stockWeeks)} colorClass={stockWeekClass(it.stockWeeks)} />
        <Stat label="전주비" value={`${Number(it.salesChangeRate || 0) >= 0 ? "+" : ""}${Number(it.salesChangeRate || 0).toFixed(1)}%`} colorClass={Number(it.salesChangeRate || 0) >= 0 ? "text-blue-600" : "text-red-600"} />
        <Stat label="할인율" value={`${Number(it.discountRate || 0)}%`} colorClass={Number(it.discountRate || 0) > 0 ? "text-red-600" : "text-slate-900"} />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="text-slate-500">TAG</p>
          <p className="font-black">{priceText(it.tagPrice)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="text-slate-500">현재</p>
          <p className="font-black">{priceText(it.currentPrice)}</p>
        </div>
        <div className="rounded-xl bg-rose-50 p-2">
          <p className="text-rose-500">추천</p>
          <p className="font-black text-rose-600">{priceText(it.promotionPrice)}</p>
        </div>
      </div>

      <div className="mt-2 rounded-xl bg-slate-50 p-2 text-xs font-semibold leading-5 text-slate-600">
        {(it.reasons || []).slice(0, 3).map((reason: string, idx: number) => <span key={idx} className="mr-3">✓ {reason}</span>)}
      </div>
    </div>
  );
}

function normalizeSeason(value: any) {
  return String(value || "").replace(/\s/g, "").trim();
}

function PromotionSection({ data }: { data: any }) {
  const rawSeasons = data.promotionSeasons || ["전체"];
  const allItems = data.promotionSuggestions || [];
  const itemSeasons = Array.from(new Set(allItems.map((it: any) => it.season).filter(Boolean))) as string[];
  const seasons = Array.from(new Set(["전체", ...rawSeasons.filter(Boolean), ...itemSeasons])) as string[];
  const [season, setSeason] = useState("전체");
  const filteredItems = season === "전체" ? allItems : allItems.filter((it: any) => normalizeSeason(it.season) === normalizeSeason(season));
  const items = [...filteredItems].sort((a: any, b: any) => Number(b.promotionScore || 0) - Number(a.promotionScore || 0)).slice(0, 10);
  const avgWeeks = items.length ? items.reduce((s: number, it: any) => s + Number(it.stockWeeks >= 999 ? 0 : it.stockWeeks || 0), 0) / items.length : 0;

  return (
    <Card
      title="프로모션 제안 TOP10"
      tone="yellow"
      right={
        <select
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
          value={season}
          onChange={(e) => setSeason(e.target.value)}
        >
          {seasons.map((s: string) => <option key={s} value={s}>{s}</option>)}
        </select>
      }
    >
      <div className="mb-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-2xl bg-white/80 p-3">
          <p className="text-xs font-semibold text-slate-500">선택 시즌</p>
          <p className="mt-1 font-black">{season}</p>
        </div>
        <div className="rounded-2xl bg-white/80 p-3">
          <p className="text-xs font-semibold text-slate-500">후보 상품</p>
          <p className="mt-1 font-black">{items.length}개</p>
        </div>
        <div className="rounded-2xl bg-white/80 p-3">
          <p className="text-xs font-semibold text-slate-500">평균 재고주수</p>
          <p className="mt-1 font-black">{avgWeeks ? `${avgWeeks.toFixed(1)}주` : "-"}</p>
        </div>
      </div>
      <p className="mb-3 text-xs font-semibold text-slate-600">
        시즌, 최초 출고일, 온/오프 합산 재고, 재고주수, 전주비, 가격을 기준으로 후보를 제안합니다.
      </p>
      <div className="max-h-[760px] space-y-2 overflow-y-auto pr-2">
        {items.length === 0 && <Empty />}
        {items.map((it: any, i: number) => <PromotionCard key={`${it.styleCode}-${i}`} it={it} index={i} />)}
      </div>
    </Card>
  );
}


function ProductAnalysisSection({ data }: { data: any }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const products = data.productAnalysisList || [];

  function search() {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const found = products.find((p: any) => String(p.styleCode || "").toLowerCase() === q)
      || products.find((p: any) => String(p.styleCode || "").toLowerCase().includes(q))
      || products.find((p: any) => String(p.productName || "").toLowerCase().includes(q));
    setSelected(found || null);
  }

  return (
    <Card title="상품 AI 분석" tone="purple">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-slate-900"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") search(); }}
          placeholder="품번을 입력하세요. 예: GF2LOP507"
        />
        <button type="button" onClick={search} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white">분석하기</button>
      </div>

      {!selected && (
        <div className="mt-4 rounded-2xl bg-white/70 p-5 text-sm font-semibold text-slate-600">
          품번을 검색하면 판매 추이, 재고주수, 온/오프 재고, 가격조정 제안, AI 리뷰를 표시합니다.
        </div>
      )}

      {selected && (
        <div className="mt-5 space-y-4">
          <div className="rounded-3xl bg-white p-5">
            <p className="text-sm text-slate-500">{selected.season} · {selected.styleCode}</p>
            <h3 className="mt-1 text-2xl font-black">{selected.productName}</h3>
            <p className="mt-2 text-sm font-semibold text-slate-600">최초 출고일 {selected.launchDate || "-"} · 출고 후 {Number(selected.weeksSinceLaunch || 0).toFixed(1)}주</p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="금주 판매수량" value={`${fmtNum(selected.weekNet)}개`} />
            <Stat label="전주 판매수량" value={`${fmtNum(selected.prevNet)}개`} />
            <Stat label="전주비" value={`${Number(selected.salesChangeRate || 0) >= 0 ? "+" : ""}${Number(selected.salesChangeRate || 0).toFixed(1)}%`} colorClass={Number(selected.salesChangeRate || 0) >= 0 ? "text-blue-600" : "text-red-600"} />
            <Stat label="재고주수" value={stockWeekText(selected.stockWeeks)} colorClass={stockWeekClass(selected.stockWeeks)} />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="온라인 재고" value={`${fmtNum(selected.onlineStock)}개`} />
            <Stat label="오프라인 재고" value={`${fmtNum(selected.offlineStock)}개`} />
            <Stat label="합산 재고" value={`${fmtNum(selected.totalStock)}개`} colorClass="text-blue-600" />
            <Stat label="금주 매출" value={won(selected.weekAmount)} />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="TAG가" value={priceText(selected.tagPrice)} />
            <Stat label="현재판매가" value={priceText(selected.currentPrice)} />
            <Stat label="추천 프로모션가" value={priceText(selected.promotionPrice)} colorClass={Number(selected.discountRate || 0) > 0 ? "text-red-600" : "text-slate-900"} />
            <Stat label="권장 할인율" value={`${Number(selected.discountRate || 0)}%`} colorClass={Number(selected.discountRate || 0) > 0 ? "text-red-600" : "text-slate-900"} />
          </div>

          <ReasonBox title="AI 분석">
            <p>{selected.aiReview}</p>
          </ReasonBox>

          <div className="grid gap-4 md:grid-cols-2">
            <ReasonBox title="판매 우수 점포">
              <ul className="space-y-1">
                {(selected.topStores || []).slice(0, 5).map((s: any, i: number) => (
                  <li key={`${s.storeName}-${i}`}>#{i + 1} {s.storeName} · {fmtNum(s.weekNet)}개 · {won(s.weekAmount)}</li>
                ))}
              </ul>
            </ReasonBox>
            <ReasonBox title="재고 점검 점포">
              <ul className="space-y-1">
                {(selected.riskyStores || []).slice(0, 5).map((s: any, i: number) => (
                  <li key={`${s.storeName}-${i}`}>#{i + 1} {s.storeName} · 재고 {fmtNum(s.storeStock)}개 · {stockWeekText(s.stockWeeks)}</li>
                ))}
              </ul>
            </ReasonBox>
          </div>
        </div>
      )}
    </Card>
  );
}


function StoreRiskList({ items, type }: { items: any[]; type: "stockout" | "over" }) {
  if (!items?.length) return <Empty />;
  return (
    <div className="max-h-[360px] space-y-2 overflow-y-auto pr-2">
      {items.map((s, i) => (
        <div key={`${s.storeName}-${i}`} className="flex items-center justify-between rounded-2xl bg-white p-3">
          <div>
            <p className="text-xs text-slate-500">#{i + 1}</p>
            <p className="font-black">{s.storeName}</p>
          </div>
          <div className="text-right">
            <p className={`font-black ${type === "stockout" ? "text-red-600" : "text-blue-600"}`}>{s.count}건</p>
            <p className="text-xs text-slate-500">평균 {stockWeekText(s.avgWeeks)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function InventoryDashboard() {
  const [dashboardData, setDashboardData] = useState<any>(markData);
  const [dataStatus, setDataStatus] = useState("내장 데이터");

  useEffect(() => {
    fetch("/api/data", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setDashboardData(d);
        setDataStatus(d.source === "google-sheet" ? "구글시트 실시간 데이터" : "내장 데이터");
      })
      .catch(() => setDataStatus("내장 데이터"));
  }, []);

  const data = dashboardData?.inventory || {};
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">재고CTRL Mark4.6.3.1</h1>
            <p className="mt-1 text-sm text-slate-500">목표 재고주수 기반 RT + 재고 위험 점포 분석</p><p className="mt-1 text-xs font-semibold text-blue-600">{dataStatus}</p>
          </div>
          <NavTabs active="inventory" />
        </header>

        <section className="rounded-3xl bg-slate-900 p-4 text-sm font-bold text-white shadow-sm">
          {data.periodLabel}
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <Kpi title="RT 제안" value={`${data.rtSuggestions?.length || 0}건`} tone="blue" />
          <Kpi title="물류 추가 할당" value={`${data.allocationSuggestions?.length || 0}건`} tone="green" />
          <Kpi title="품절 위험" value={`${data.stockoutRisk?.length || 0}품번`} tone="orange" />
          <Kpi title="과재고 위험" value={`${data.overstockRisk?.length || 0}품번`} tone="purple" />
        </section>

        <Briefing lines={data.aiBriefing || []} />

        <PromotionSection data={data} />

        <section className="grid gap-6 xl:grid-cols-2">
          <Card title="품절 위험 점포 TOP5" tone="purple">
            <StoreRiskList items={data.stockoutStoreTop5 || []} type="stockout" />
          </Card>
          <Card title="과재고 점포 TOP5" tone="yellow">
            <StoreRiskList items={data.overstockStoreTop5 || []} type="over" />
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card title="RT 이동 제안 TOP5">
            <ItemList items={data.rtSuggestions || []} type="rt" maxHeight="h-[520px]" />
          </Card>
          <Card title="물류 추가 할당 제안 TOP5">
            <ItemList items={data.allocationSuggestions || []} type="alloc" maxHeight="h-[520px]" />
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card title="품절 위험 상품 TOP10">
            <ItemList items={data.stockoutRisk || []} type="risk" maxHeight="h-[520px]" />
          </Card>
          <Card title="과재고 상품 TOP10">
            <ItemList items={data.overstockRisk || []} type="over" maxHeight="h-[520px]" />
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card title="위탁 상품 투입 추천" tone="beige">
            <ItemList items={data.consignmentRecommendations || []} type="consign" maxHeight="h-[420px]" />
          </Card>
          <Card title="운영 프로세스 제안" tone="yellow">
            <ul className="space-y-3 text-sm leading-6 text-slate-700">
              <li>• 1차: 점포간 RT로 부족 매장을 보완합니다.</li>
              <li>• 2차: RT로 해결이 어려운 품번은 물류 추가 할당을 요청합니다.</li>
              <li>• 3차: 위탁채널은 전사 TOP 상품과 가용재고를 함께 보고 투입 후보를 정합니다.</li>
              <li>• 4차: 장기 미소진 상품은 프로모션/가격조정을 검토합니다.</li>
            </ul>
          </Card>
        </section>

        <ProductAnalysisSection data={data} />
      </div>
    </main>
  );
}
