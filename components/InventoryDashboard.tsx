"use client";

import { useEffect, useState } from "react";
import NavTabs from "@/components/NavTabs";
import { Card, Empty, Kpi } from "@/components/Shared";
import { fmtNum, markData, won } from "@/lib/mark";


function todayKSTInputValue() {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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

function MoveTypeBadge({ value }: { value?: string }) {
  if (!value) return null;
  const isUnderperform = value === "부진";
  const color = isUnderperform ? "bg-slate-500" : "bg-indigo-600";
  const label = isUnderperform ? "부진 · 재고회전" : "호조 · 결품방지";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black text-white ${color}`}>{label}</span>;
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

function rtItemKey(it: any, index: number) {
  return `${it.fromStore || ""}__${it.toStore || ""}__${it.styleCode || ""}__${it.suggestQty || ""}__${index}`;
}

function statusLabel(status?: string) {
  if (status === "approved") return "승인";
  if (status === "hold") return "보류";
  if (status === "rejected") return "거절";
  return "제안";
}

function statusBadge(status?: string) {
  if (status === "approved") return "bg-emerald-600 text-white";
  if (status === "hold") return "bg-amber-500 text-white";
  if (status === "rejected") return "bg-rose-600 text-white";
  return "bg-slate-100 text-slate-700";
}

function ActionButton({ children, onClick, tone = "slate", disabled = false }: { children: React.ReactNode; onClick: () => void; tone?: "green" | "amber" | "rose" | "slate"; disabled?: boolean }) {
  const tones = {
    green: "bg-emerald-600 text-white hover:bg-emerald-700",
    amber: "bg-amber-500 text-white hover:bg-amber-600",
    rose: "bg-rose-600 text-white hover:bg-rose-700",
    slate: "bg-slate-900 text-white hover:bg-slate-800",
  } as const;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-10 w-full rounded-xl px-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function RTCard({
  it,
  index,
  status = "suggested",
  saving = false,
  onStatus,
}: {
  it: any;
  index: number;
  status?: string;
  saving?: boolean;
  onStatus?: (status: "approved" | "hold" | "rejected") => void;
}) {
  const stockoutLabel = Number(it.stockoutDays || 0) >= 999 ? "판매없음" : `${Number(it.stockoutDays || 0).toFixed(0)}일 내`;
  const reason = String(it.reason || "");
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[1fr_180px] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold text-slate-500">#{index + 1} · {it.styleCode}</p>
            <span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusBadge(status)}`}>{statusLabel(status)}</span>
            <MoveTypeBadge value={it.moveType} />
            <PriorityBadge value={it.priority || "C"} />
          </div>
          <p className="mt-1 truncate text-lg font-black">{it.productName}</p>
          <p className="mt-1 text-xs font-bold text-blue-600">
            {it.moveType === "부진"
              ? `과잉재고 회전 이동 · 전사순위 ${it.companyRank || "-"} · 제안 ${fmtNum(it.suggestQty)}장`
              : `RT Score ${Number(it.rtScore || 0).toFixed(1)} · 전사순위 ${it.companyRank || "-"} · 제안 ${fmtNum(it.suggestQty)}장`}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <ActionButton tone="green" disabled={saving} onClick={() => onStatus?.("approved")}>{saving ? "저장중" : "승인"}</ActionButton>
          <ActionButton tone="amber" disabled={saving} onClick={() => onStatus?.("hold")}>보류</ActionButton>
          <ActionButton tone="rose" disabled={saving} onClick={() => onStatus?.("rejected")}>거절</ActionButton>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_auto_1fr] xl:items-stretch">
        <div className="rounded-2xl bg-blue-50 p-3">
          <p className="text-xs font-bold text-blue-600">보내는 점포</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
            <p className="text-base font-black">{it.fromStore}</p>
            <p className="text-sm font-black text-slate-700">재고 {fmtNum(it.fromStock)}개 · {stockWeekText(it.fromStockWeeks)}</p>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-600">RT 후 {stockWeekText(it.fromAfterWeeks)} · 금주매출 {won(it.weekAmount)}</p>
        </div>

        <div className="flex items-center justify-center">
          <div className="rounded-full bg-slate-900 px-3 py-1 text-sm font-black text-white">→</div>
        </div>

        <div className="rounded-2xl bg-emerald-50 p-3">
          <p className="text-xs font-bold text-emerald-600">받는 점포</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
            <p className="text-base font-black">{it.toStore}</p>
            <p className={`text-sm font-black ${stockWeekClass(it.toStockWeeks)}`}>재고 {fmtNum(it.toStock)}개 · {stockWeekText(it.toStockWeeks)}</p>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-600">RT 후 {stockWeekText(it.toAfterWeeks)} · 예상품절 {stockoutLabel}</p>
        </div>
      </div>

      <details className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
        <summary className="cursor-pointer text-xs font-black text-slate-700">추천 사유 보기</summary>
        <div className="mt-3 max-h-72 overflow-y-auto rounded-2xl bg-white p-4 text-sm font-semibold leading-7 text-slate-700">
          <pre className="whitespace-pre-wrap break-words font-sans">{reason}</pre>
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-500">승인 시 RT_Result에 자동 저장됩니다. RT 판단은 스타일 단위, 출고는 칼라/사이즈 실재고 기준입니다.</p>
      </details>
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
          <p className="text-xs text-slate-300">온라인 이관 제안</p>
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
        <p className="mt-1">온라인 재고를 오프라인 판매 가능 채널로 이관 검토합니다.</p>
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

function ItemList({ items, type, maxHeight }: { items: any[]; type: "alloc" | "risk" | "over" | "consign"; maxHeight?: string }) {
  if (!items?.length) return <Empty />;

  return (
    <div className={`${maxHeight || ""} space-y-2 overflow-y-auto pr-2`}>
      {items.map((it, i) => {
        if (type === "alloc") return <AllocationCard key={`${it.styleCode}-${i}`} it={it} index={i} />;
        return <SimpleCard key={`${it.styleCode}-${i}`} it={it} index={i} type={type} />;
      })}
    </div>
  );
}

function groupRtItems(withIndex: { item: any; index: number; key: string; status: string }[]) {
  const groups = new Map<string, {
    groupKey: string;
    styleCode: string;
    productName: string;
    companyRank: number;
    bestRtScore: number;
    totalQty: number;
    entries: { item: any; index: number; key: string; status: string }[];
    counts: Record<string, number>;
  }>();

  for (const entry of withIndex) {
    const styleCode = entry.item.styleCode || entry.item.productName || "미확인 품번";
    if (!groups.has(styleCode)) {
      groups.set(styleCode, {
        groupKey: styleCode,
        styleCode,
        productName: entry.item.productName || styleCode,
        companyRank: Number(entry.item.companyRank ?? 9999),
        bestRtScore: 0,
        totalQty: 0,
        entries: [],
        counts: { all: 0, suggested: 0, approved: 0, hold: 0, rejected: 0 },
      });
    }
    const group = groups.get(styleCode)!;
    group.entries.push(entry);
    group.totalQty += Number(entry.item.suggestQty || 0);
    group.bestRtScore = Math.max(group.bestRtScore, Number(entry.item.rtScore || 0));
    group.companyRank = Math.min(group.companyRank, Number(entry.item.companyRank ?? 9999));
    group.counts.all++;
    group.counts[entry.status] = (group.counts[entry.status] || 0) + 1;
  }

  return [...groups.values()].sort((a, b) => a.companyRank - b.companyRank || b.bestRtScore - a.bestRtScore);
}

function RTSuggestionSection({
  items,
  statusMap,
  savingKey,
  filter,
  onFilter,
  onStatus,
}: {
  items: any[];
  statusMap: Record<string, string>;
  savingKey: string;
  filter: string;
  onFilter: (value: string) => void;
  onStatus: (item: any, index: number, status: "approved" | "hold" | "rejected") => void;
}) {
  const [downloadDate, setDownloadDate] = useState(todayKSTInputValue());
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const withIndex = (items || []).map((item, index) => ({ item, index, key: rtItemKey(item, index), status: statusMap[rtItemKey(item, index)] || "suggested" }));
  const counts = {
    all: withIndex.length,
    suggested: withIndex.filter((x) => x.status === "suggested").length,
    approved: withIndex.filter((x) => x.status === "approved").length,
    hold: withIndex.filter((x) => x.status === "hold").length,
    rejected: withIndex.filter((x) => x.status === "rejected").length,
  };
  const filtered = filter === "all" ? withIndex : withIndex.filter((x) => x.status === filter);
  const groups = groupRtItems(filtered);
  const productCount = new Set(withIndex.map((x) => x.item.styleCode || x.item.productName)).size;
  const goodCount = withIndex.filter((x) => x.item.moveType !== "부진").length;
  const underperformCount = withIndex.filter((x) => x.item.moveType === "부진").length;

  const tabs: [string, string, number][] = [
    ["all", "전체보기", counts.all],
    ["suggested", "제안만", counts.suggested],
    ["approved", "승인", counts.approved],
    ["hold", "보류", counts.hold],
    ["rejected", "거절", counts.rejected],
  ];

  function setAllOpen(open: boolean) {
    const next: Record<string, boolean> = {};
    for (const g of groups) next[g.groupKey] = open;
    setOpenGroups(next);
  }

  return (
    <Card
      title="RT 이동 제안"
      tone="white"
      right={
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-9 items-center gap-2 rounded-full bg-slate-100 px-3 text-xs font-black text-slate-700">
            승인날짜
            <input
              type="date"
              value={downloadDate}
              onChange={(e) => setDownloadDate(e.target.value)}
              className="bg-transparent text-xs font-black text-slate-900 outline-none"
            />
          </label>
          <a
            href={`/api/rt-result?download=1&approvedDate=${encodeURIComponent(downloadDate)}`}
            className="inline-flex h-9 items-center rounded-full bg-emerald-600 px-3 text-xs font-black text-white transition hover:bg-emerald-700"
          >
            RT 지시서 다운로드
          </a>
          {tabs.map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => onFilter(key)}
              className={`h-9 rounded-full px-3 text-xs font-black transition ${filter === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {label} {count}
            </button>
          ))}
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 px-4 py-3">
        <p className="text-xs font-bold text-slate-600">
          전사 판매 TOP 20 품번 중 <span className="text-slate-900">{productCount}개 품번</span>에서 제안 발생 · 총 {counts.all}건
          <span className="ml-2 text-indigo-600">(호조 {goodCount}건</span> · <span className="text-slate-500">부진 {underperformCount}건)</span>
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setAllOpen(true)} className="h-8 rounded-full bg-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-300">전체 펼치기</button>
          <button type="button" onClick={() => setAllOpen(false)} className="h-8 rounded-full bg-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-300">전체 접기</button>
        </div>
      </div>

      {!groups.length ? (
        <Empty />
      ) : (
        <div className="max-h-[760px] space-y-3 overflow-y-auto pr-2">
          {groups.map((group) => {
            const isOpen = !!openGroups[group.groupKey];
            return (
              <div key={group.groupKey} className="rounded-2xl border border-slate-100 bg-slate-50/60">
                <button
                  type="button"
                  onClick={() => setOpenGroups((prev) => ({ ...prev, [group.groupKey]: !prev[group.groupKey] }))}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-black text-white">전사 {group.companyRank === 9999 ? "권외" : `${group.companyRank}위`}</span>
                    <p className="truncate text-sm font-black text-slate-900">{group.productName}</p>
                    <span className="text-xs font-bold text-slate-500">{group.styleCode}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-black text-slate-600">
                    <span>제안 {group.counts.all}건</span>
                    <span>총 {fmtNum(group.totalQty)}장</span>
                    {group.counts.approved > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">승인 {group.counts.approved}</span>}
                    {group.counts.hold > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">보류 {group.counts.hold}</span>}
                    {group.counts.rejected > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">거절 {group.counts.rejected}</span>}
                    <span className="text-slate-400">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="space-y-3 px-4 pb-4">
                    {group.entries.map(({ item, index, key, status }) => (
                      <RTCard
                        key={key}
                        it={item}
                        index={index}
                        status={status}
                        saving={savingKey === key}
                        onStatus={(nextStatus) => onStatus(item, index, nextStatus)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
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
        <Stat label="오프운영재고" value={`${fmtNum(it.totalStock)}개`} colorClass="text-blue-600" />
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
        시즌, 최초 출고일, 오프라인 운영재고, 오프라인 판매추이, 재고주수, 가격을 기준으로 후보를 제안합니다. TOP상품/판매상승 상품은 정가 판매 보호로 제외합니다.
      </p>
      {(data.suppressedPromotionCandidates?.length || data.rtSuppressedPromotionCandidates?.length) ? (
        <div className="mb-3 grid gap-2 md:grid-cols-2">
          <div className="rounded-2xl bg-blue-50 p-3">
            <p className="text-xs font-black text-blue-700">정가 판매 보호 제외</p>
            <p className="mt-1 text-lg font-black text-blue-900">{fmtNum(data.suppressedPromotionCandidates?.length || 0)}개</p>
            <p className="mt-1 text-xs font-semibold text-blue-700">TOP50 또는 전주비 +20% 이상 상품</p>
          </div>
          <div className="rounded-2xl bg-orange-50 p-3">
            <p className="text-xs font-black text-orange-700">RT 억제 → 프로모션 전환</p>
            <p className="mt-1 text-lg font-black text-orange-900">{fmtNum(data.rtSuppressedPromotionCandidates?.length || 0)}개</p>
            <p className="mt-1 text-xs font-semibold text-orange-700">판매 하락으로 RT보다 프로모션 검토가 필요한 상품</p>
          </div>
        </div>
      ) : null}

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



function AllocationLookupSection({ data }: { data: any }) {
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

  const onlineStock = Number(selected?.onlineStock || 0);
  const offlineStock = Number(selected?.offlineStock || 0);
  const totalStock = Number(selected?.totalStock || 0);
  const weekNet = Number(selected?.weekNet || 0);
  const offlineWeeks = weekNet > 0 ? offlineStock / weekNet : offlineStock > 0 ? 999 : 0;
  const targetStock = weekNet > 0 ? Math.ceil(weekNet * 3) : 0;
  const needQty = selected ? Math.max(0, targetStock - offlineStock) : 0;
  const suggestQty = selected ? Math.max(0, Math.min(needQty, onlineStock)) : 0;

  return (
    <Card title="온라인재고 이관 요청" tone="purple">
      <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
        <input
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-slate-900"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") search(); }}
          placeholder="품번 또는 상품명을 입력하세요. 예: GF2LKP531"
        />
        <button type="button" onClick={search} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white">
          이관 검토
        </button>
      </div>

      {!selected ? (
        <div className="mt-4 rounded-2xl bg-white/70 p-5 text-sm font-semibold leading-6 text-slate-600">
          품번을 입력하면 온오프재고현황의 스타일별 합산 재고를 기준으로 온라인 → 오프라인 이관 가능 수량을 검토합니다.
          <br />
          기준 재고: R열 가용(온) / S열 가용(오프) / T열 가용(합계)
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="rounded-3xl bg-white p-5">
            <p className="text-sm text-slate-500">{selected.season || "-"} · {selected.styleCode}</p>
            <h3 className="mt-1 text-2xl font-black">{selected.productName}</h3>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              스타일 단위 합산 기준 · 금주 판매 {fmtNum(weekNet)}개 · 금주매출 {won(selected.weekAmount)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="온라인 가용" value={`${fmtNum(onlineStock)}개`} colorClass="text-blue-600" />
            <Stat label="오프라인 가용" value={`${fmtNum(offlineStock)}개`} colorClass="text-emerald-600" />
            <Stat label="총 가용" value={`${fmtNum(totalStock)}개`} />
            <Stat label="오프라인 재고주수" value={stockWeekText(offlineWeeks)} colorClass={stockWeekClass(offlineWeeks)} />
            <Stat label="이관 제안" value={`${fmtNum(suggestQty)}개`} colorClass={suggestQty > 0 ? "text-red-600" : "text-slate-500"} />
          </div>

          <ReasonBox title="이관 판단">
            {suggestQty > 0 ? (
              <>
                <p>
                  오프라인 목표재고를 최근 주간판매의 3주분으로 보면 목표 {fmtNum(targetStock)}개,
                  현재 오프라인 가용 {fmtNum(offlineStock)}개로 부족분은 {fmtNum(needQty)}개입니다.
                </p>
                <p className="mt-1">
                  온라인 가용 {fmtNum(onlineStock)}개 중 최대 {fmtNum(suggestQty)}개를 오프라인 이관 요청 후보로 볼 수 있습니다.
                </p>
              </>
            ) : (
              <p>
                현재 기준으로는 온라인 가용 부족 또는 오프라인 재고주수 충분으로 자동 이관 제안 수량이 없습니다.
              </p>
            )}
          </ReasonBox>
        </div>
      )}
    </Card>
  );
}



function PerformanceTrackingSection({ data }: { data: any }) {
  const basePerformance = data.performance || {};
  const [performanceState, setPerformanceState] = useState<any>(basePerformance);
  const performance = performanceState || basePerformance;
  const dates = performance.dates || [];
  const [selectedDate, setSelectedDate] = useState(performance.latestDate || "");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "RT" | "PROMOTION">("ALL");
  const [manualMode, setManualMode] = useState(false);
  const [beforeStart, setBeforeStart] = useState("");
  const [beforeEnd, setBeforeEnd] = useState("");
  const [duringStart, setDuringStart] = useState("");
  const [duringEnd, setDuringEnd] = useState("");
  const [performanceLoading, setPerformanceLoading] = useState(false);

  useEffect(() => {
    setPerformanceState(basePerformance);
  }, [basePerformance]);

  useEffect(() => {
    if (!selectedDate && performance.latestDate) setSelectedDate(performance.latestDate);
  }, [performance.latestDate, selectedDate]);

  async function runPerformanceAnalysis(useManual = manualMode) {
    setPerformanceLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("category", categoryFilter);
      if (selectedDate) params.set("selectedDate", selectedDate);
      if (useManual) {
        params.set("beforeStart", beforeStart);
        params.set("beforeEnd", beforeEnd);
        params.set("duringStart", duringStart);
        params.set("duringEnd", duringEnd);
      }
      const res = await fetch(`/api/performance?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "성과 분석 실패");
      setPerformanceState(json.performance || {});
      if (json.performance?.latestDate) setSelectedDate(json.performance.latestDate);
    } catch (error: any) {
      alert(error?.message || "성과 분석 실패");
    } finally {
      setPerformanceLoading(false);
    }
  }

  function resetAutoAnalysis() {
    setManualMode(false);
    setPerformanceState(basePerformance);
  }

  const rawSelected = performance.byDate?.[selectedDate] || {
    count: 0,
    addedQty: 0,
    beforeAmount: 0,
    duringAmount: 0,
    addedAmount: 0,
    successRate: 0,
    byCategory: [],
    rows: [],
  };

  const visibleRows = categoryFilter === "ALL"
    ? (rawSelected.rows || [])
    : (rawSelected.rows || []).filter((r: any) => r.category === categoryFilter);

  const visibleBuckets = categoryFilter === "ALL"
    ? (rawSelected.byCategory || [])
    : (rawSelected.byCategory || []).filter((b: any) => b.category === categoryFilter);

  const successCount = visibleRows.filter((r: any) => Number(r.addedAmount || 0) > 0).length;
  const selected = {
    ...rawSelected,
    rows: visibleRows,
    byCategory: visibleBuckets,
    count: visibleRows.length,
    addedQty: visibleRows.reduce((s: number, r: any) => s + Number(r.addedQty || 0), 0),
    beforeAmount: visibleRows.reduce((s: number, r: any) => s + Number(r.beforeAmount || 0), 0),
    duringAmount: visibleRows.reduce((s: number, r: any) => s + Number(r.duringAmount || 0), 0),
    addedAmount: visibleRows.reduce((s: number, r: any) => s + Number(r.addedAmount || 0), 0),
    successRate: visibleRows.length ? (successCount / visibleRows.length) * 100 : 0,
    // MARK 6.7.2: RT로 실제 이동시킨 총 수량(추가판매와는 다른 지표 — "얼마나 옮겼는지").
    totalMovedQty: visibleRows.reduce((s: number, r: any) => s + Number(r.rtQty || 0), 0),
  };

  const filterTabs: ["ALL" | "RT" | "PROMOTION", string][] = [
    ["ALL", "전체"],
    ["RT", "RT"],
    ["PROMOTION", "프로모션"],
  ];

  const singleMode = categoryFilter !== "ALL";

  return (
    <Card
      title="RT / 프로모션 성과 확인"
      tone="purple"
      right={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-white p-1">
            {filterTabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategoryFilter(key)}
                className={`h-8 rounded-lg px-3 text-xs font-black transition ${categoryFilter === key ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700"
          >
            {!dates.length && <option value="">시작일 없음</option>}
            {dates.map((date: string) => <option key={date} value={date}>{date} 시작</option>)}
          </select>
        </div>
      }
    >
      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-black text-slate-800">성과 분석 기준</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              RT 기본값은 실행전주 7일 ↔ 실행주 7일, 프로모션 기본값은 시작일 기준 전주 동일요일 3일 ↔ 실행 3일입니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={resetAutoAnalysis}
              className={`rounded-xl px-4 py-2 text-xs font-black ${!manualMode ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              자동분석
            </button>
            <button
              type="button"
              onClick={() => setManualMode(true)}
              className={`rounded-xl px-4 py-2 text-xs font-black ${manualMode ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              사용자 지정
            </button>
          </div>
        </div>

        {manualMode ? (
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <label className="text-xs font-black text-slate-600">
              비교 시작
              <input type="date" value={beforeStart} onChange={(e) => setBeforeStart(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-black text-slate-600">
              비교 종료
              <input type="date" value={beforeEnd} onChange={(e) => setBeforeEnd(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-black text-slate-600">
              실행 시작
              <input type="date" value={duringStart} onChange={(e) => setDuringStart(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-black text-slate-600">
              실행 종료
              <input type="date" value={duringEnd} onChange={(e) => setDuringEnd(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <button
              type="button"
              onClick={() => runPerformanceAnalysis(true)}
              disabled={performanceLoading || !beforeStart || !beforeEnd || !duringStart || !duringEnd}
              className="rounded-xl bg-purple-700 px-4 py-2 text-sm font-black text-white disabled:opacity-40"
            >
              {performanceLoading ? "분석중..." : "성과 분석"}
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => runPerformanceAnalysis(false)}
              disabled={performanceLoading}
              className="rounded-xl bg-purple-700 px-4 py-2 text-sm font-black text-white disabled:opacity-40"
            >
              {performanceLoading ? "분석중..." : "자동 기준 재분석"}
            </button>
            <p className="text-xs font-semibold text-slate-500">선택한 시작일/유형 기준으로 최신 Daily_Sales_History를 다시 계산합니다.</p>
          </div>
        )}
      </section>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="실행건수" value={`${fmtNum(selected.count)}건`} />
        <Stat label="추가판매" value={`${fmtNum(selected.addedQty)}개`} colorClass={Number(selected.addedQty || 0) >= 0 ? "text-blue-600" : "text-red-600"} />
        <Stat label="추가매출" value={won(selected.addedAmount)} colorClass={Number(selected.addedAmount || 0) >= 0 ? "text-blue-600" : "text-red-600"} />
        <Stat label="성공률" value={`${Number(selected.successRate || 0).toFixed(1)}%`} />
      </div>

      {!singleMode ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {(selected.byCategory || []).map((bucket: any) => (
            <div key={bucket.category} className="rounded-2xl bg-white/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black">{bucket.category === "RT" ? "RT 성과" : "프로모션 성과"}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{fmtNum(bucket.count)}건 · 성공률 {Number(bucket.successRate || 0).toFixed(1)}%</p>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-black ${Number(bucket.addedAmount || 0) >= 0 ? "text-blue-600" : "text-red-600"}`}>{won(bucket.addedAmount)}</p>
                  <p className="text-xs font-semibold text-slate-500">추가매출</p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {(bucket.topItems || []).slice(0, 3).map((item: any, idx: number) => (
                  <div key={`${bucket.category}-${item.styleCode}-${idx}`} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-bold text-slate-500">#{idx + 1} · {item.styleCode} · {bucket.category === "RT" ? `${item.fromStore || "-"} → ${item.toStore || "-"}` : (item.toStore || item.channel || "-")}</p>
                    <p className="mt-1 truncate text-sm font-black">{item.productName}</p>
                    <p className={`mt-1 text-xs font-black ${Number(item.addedAmount || 0) >= 0 ? "text-blue-600" : "text-red-600"}`}>
                      추가판매 {fmtNum(item.addedQty)}개 · 추가매출 {won(item.addedAmount)}{bucket.category === "RT" && item.rtQty ? ` · 소진율 ${Number(item.depletionRate || 0).toFixed(1)}%` : ""}
                    </p>
                  </div>
                ))}
                {!bucket.topItems?.length && <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-400">표시할 성과가 없습니다.</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {categoryFilter === "RT" && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-indigo-600 p-5 text-white shadow-sm">
                <p className="text-xs font-bold text-indigo-100">📦 총 이동수량</p>
                <p className="mt-2 text-2xl font-black">{fmtNum(selected.totalMovedQty)}장</p>
              </div>
              <div className={`rounded-2xl p-5 text-white shadow-sm ${Number(selected.addedQty || 0) >= 0 ? "bg-blue-600" : "bg-rose-600"}`}>
                <p className="text-xs font-bold text-white/80">📈 판매수량 증가</p>
                <p className="mt-2 text-2xl font-black">{Number(selected.addedQty || 0) >= 0 ? "+" : ""}{fmtNum(selected.addedQty)}개</p>
              </div>
              <div className={`rounded-2xl p-5 text-white shadow-sm ${Number(selected.addedAmount || 0) >= 0 ? "bg-emerald-600" : "bg-rose-600"}`}>
                <p className="text-xs font-bold text-white/80">💰 추가 확보매출</p>
                <p className="mt-2 text-2xl font-black">{Number(selected.addedAmount || 0) >= 0 ? "+" : ""}{won(selected.addedAmount)}</p>
              </div>
              <div className="rounded-2xl bg-slate-800 p-5 text-white shadow-sm">
                <p className="text-xs font-bold text-slate-300">✅ 실행건수 · 성공률</p>
                <p className="mt-2 text-2xl font-black">{fmtNum(selected.count)}건 · {Number(selected.successRate || 0).toFixed(0)}%</p>
              </div>
            </div>
          )}

        <div className="overflow-hidden rounded-2xl bg-white">
          <div className="border-b border-slate-100 bg-slate-900 px-4 py-3 text-white">
            <p className="text-sm font-black">
              ■ 실행 성과 분석 ({selectedDate || "-"} 시작 · {categoryFilter === "RT" ? "RT" : "프로모션"})
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-300">
              실행 전 실적과 실행 후 실적을 같은 구조로 비교합니다. 수량/매출/증감 기준입니다.
            </p>
            {selected.rows?.[0]?.beforePeriodLabel || selected.rows?.[0]?.duringPeriodLabel ? (
              <p className="mt-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white">
                비교기간 · {categoryFilter === "RT" ? "RT_Result H열 지시일 기준" : "핵심 오프라인 매장 기준"} · 실행 전 {selected.rows?.[0]?.beforePeriodLabel || "-"} / 실행 후 {selected.rows?.[0]?.duringPeriodLabel || "-"}
              </p>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[880px] w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-black text-slate-600">
                  <th className="border border-slate-200 px-3 py-2 text-left">구분</th>
                  <th className="border border-slate-200 px-3 py-2 text-left">품번</th>
                  <th className="border border-slate-200 px-3 py-2 text-left">상품명</th>
                  <th className="border border-slate-200 px-3 py-2 text-right" colSpan={2}>실행전</th>
                  <th className="border border-slate-200 px-3 py-2 text-right" colSpan={2}>실행후</th>
                  <th className="border border-slate-200 px-3 py-2 text-right" colSpan={3}>증감</th>
                </tr>
                <tr className="bg-slate-50 text-xs font-black text-slate-600">
                  <th className="border border-slate-200 px-3 py-2" />
                  <th className="border border-slate-200 px-3 py-2" />
                  <th className="border border-slate-200 px-3 py-2" />
                  <th className="border border-slate-200 px-3 py-2 text-right">수량</th>
                  <th className="border border-slate-200 px-3 py-2 text-right">매출</th>
                  <th className="border border-slate-200 px-3 py-2 text-right">수량</th>
                  <th className="border border-slate-200 px-3 py-2 text-right">매출</th>
                  <th className="border border-slate-200 px-3 py-2 text-right">수량</th>
                  <th className="border border-slate-200 px-3 py-2 text-right">매출</th>
                  <th className="border border-slate-200 px-3 py-2 text-right">증감률</th>
                </tr>
              </thead>
              <tbody>
                {(selected.rows || []).map((item: any, idx: number) => {
                  const growthRate = Number(item.beforeAmount || 0)
                    ? ((Number(item.duringAmount || 0) - Number(item.beforeAmount || 0)) / Number(item.beforeAmount || 0)) * 100
                    : Number(item.duringAmount || 0) ? 100 : 0;
                  const isPositive = growthRate >= 0;
                  return (
                    <tr key={`${item.category}-${item.styleCode}-${idx}`} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-3 py-2">
                        {item.category === "RT" ? (
                          <MoveTypeBadge value={item.moveType} />
                        ) : (
                          <span className="font-black text-slate-700">{item.saleType || item.channel || item.toStore || item.fromStore || item.category || "-"}</span>
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 font-semibold text-slate-600">{item.styleCode}</td>
                      <td className="border border-slate-200 px-3 py-2 font-black">{item.productName}</td>

                      <td className="border border-slate-200 px-3 py-2 text-right">{fmtNum(item.beforeQty)}개</td>
                      <td className="border border-slate-200 px-3 py-2 text-right">{won(item.beforeAmount)}</td>

                      <td className="border border-slate-200 px-3 py-2 text-right font-black">{fmtNum(item.duringQty)}개</td>
                      <td className="border border-slate-200 px-3 py-2 text-right font-black">{won(item.duringAmount)}</td>

                      <td className={`border border-slate-200 px-3 py-2 text-right font-black ${isPositive ? "text-blue-600" : "text-red-600"}`}>{isPositive ? "+" : ""}{fmtNum(item.addedQty)}개</td>
                      <td className={`border border-slate-200 px-3 py-2 text-right font-black ${isPositive ? "text-blue-600" : "text-red-600"}`}>{isPositive ? "+" : ""}{won(item.addedAmount)}</td>
                      <td className={`border border-slate-200 px-3 py-2 text-right text-base font-black ${isPositive ? "text-blue-600" : "text-red-600"}`}>{isPositive ? "+" : ""}{growthRate.toFixed(0)}%</td>
                    </tr>
                  );
                })}

                <tr className="bg-slate-100 font-black">
                  <td className="border border-slate-200 px-3 py-2" colSpan={3}>합계</td>
                  <td className="border border-slate-200 px-3 py-2 text-right">{fmtNum(selected.rows.reduce((s: number, r: any) => s + Number(r.beforeQty || 0), 0))}개</td>
                  <td className="border border-slate-200 px-3 py-2 text-right">{won(selected.beforeAmount)}</td>
                  <td className="border border-slate-200 px-3 py-2 text-right">{fmtNum(selected.rows.reduce((s: number, r: any) => s + Number(r.duringQty || 0), 0))}개</td>
                  <td className="border border-slate-200 px-3 py-2 text-right">{won(selected.duringAmount)}</td>
                  <td className="border border-slate-200 px-3 py-2 text-right">{fmtNum(selected.addedQty)}개</td>
                  <td className={`border border-slate-200 px-3 py-2 text-right ${Number(selected.addedAmount || 0) >= 0 ? "text-blue-600" : "text-red-600"}`}>{won(selected.addedAmount)}</td>
                  <td className="border border-slate-200 px-3 py-2 text-right">{Number(selected.beforeAmount || 0) ? `${(((selected.duringAmount - selected.beforeAmount) / selected.beforeAmount) * 100).toFixed(0)}%` : "-"}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {!selected.rows?.length && <div className="p-6"><Empty /></div>}
        </div>
        </div>
      )}

      <details className="mt-4 rounded-2xl border border-slate-100 bg-white/75 p-4">
        <summary className="cursor-pointer text-sm font-black text-slate-700">시작일 {selectedDate || "-"} {categoryFilter === "ALL" ? "전체" : categoryFilter === "RT" ? "RT" : "프로모션"} 상세 보기</summary>
        <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-2">
          {(selected.rows || []).map((item: any, idx: number) => (
            <div key={`${item.category}-${item.styleCode}-${idx}`} className="rounded-xl bg-slate-50 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-500">{item.category} · {item.styleCode} · {item.fromStore || item.channel || "-"} → {item.toStore || "-"}</p>
                  <p className="mt-1 font-black">{item.productName}</p>
                  {item.compareBasis ? <p className="mt-1 text-xs font-semibold text-blue-600">{item.compareBasis}</p> : null}
                  {item.category === "RT" && item.rtQty ? <p className="mt-1 text-xs font-black text-emerald-600">출고 {item.fromStore || "-"} → 입고 {item.toStore || "-"} · RT수량 {fmtNum(item.rtQty)}개 · 소진율 {Number(item.depletionRate || 0).toFixed(1)}% · 등급 {item.rtGrade || "-"}</p> : null}
                  {item.note ? <p className="mt-1 text-xs font-semibold text-slate-500">{item.note}</p> : null}
                </div>
                <div className="text-right">
                  <p className={`font-black ${Number(item.addedAmount || 0) >= 0 ? "text-blue-600" : "text-red-600"}`}>{won(item.addedAmount)}</p>
                  <p className="text-xs font-semibold text-slate-500">{item.result}</p>
                </div>
              </div>
            </div>
          ))}
          {!selected.rows?.length && <Empty />}
        </div>
      </details>
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
  const [rtFilter, setRtFilter] = useState("all");
  const [rtStatusMap, setRtStatusMap] = useState<Record<string, string>>({});
  const [rtSavingKey, setRtSavingKey] = useState("");

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

  async function updateRtStatus(item: any, index: number, status: "approved" | "hold" | "rejected") {
    const key = rtItemKey(item, index);
    setRtStatusMap((prev) => ({ ...prev, [key]: status }));

    if (status !== "approved") return;

    setRtSavingKey(key);
    try {
      const res = await fetch("/api/rt-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || "RT_Result 저장 실패");
      }
    } catch (error: any) {
      alert(error?.message || "RT_Result 저장 실패");
      setRtStatusMap((prev) => ({ ...prev, [key]: "suggested" }));
    } finally {
      setRtSavingKey("");
    }
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">재고 컨트롤</h1>
            <p className="mt-1 text-sm text-slate-500">RT 제안, 온라인 이관 제안, 프로모션 제안</p><p className="mt-1 text-xs font-semibold text-blue-600">{dataStatus}</p>
          </div>
          <NavTabs active="inventory" />
        </header>

        <section className="rounded-3xl bg-slate-900 p-4 text-sm font-bold text-white shadow-sm">
          {data.periodLabel}
        </section>

        <RTSuggestionSection
          items={data.rtSuggestions || []}
          statusMap={rtStatusMap}
          savingKey={rtSavingKey}
          filter={rtFilter}
          onFilter={setRtFilter}
          onStatus={updateRtStatus}
        />

        <PerformanceTrackingSection data={data} />

        <section className="grid gap-4 md:grid-cols-4">
          <Kpi title="RT 제안" value={`${data.rtSuggestions?.length || 0}건`} tone="blue" />
          <Kpi title="온라인 이관 제안" value={`${data.onlineTransferSuggestions?.length || data.allocationSuggestions?.length || 0}건`} tone="green" />
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

        <section className="grid gap-6">
          <AllocationLookupSection data={data} />
          <Card title="온라인 이관 제안 TOP5">
            <ItemList items={data.onlineTransferSuggestions || data.allocationSuggestions || []} type="alloc" maxHeight="h-[520px]" />
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
              <li>• 2차: RT로 해결이 어려운 품번은 온라인 이관 제안을 요청합니다.</li>
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
