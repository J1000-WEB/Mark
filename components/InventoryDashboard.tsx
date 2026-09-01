"use client";

import { useEffect, useState } from "react";
import NavTabs from "@/components/NavTabs";
import { Card, Empty, Kpi } from "@/components/Shared";
import { fmtNum, markData, won } from "@/lib/mark";
import ProductThumb from "@/components/ProductThumb";
import { compactStyleChannelRows } from "@/lib/styleChannelCompact";


function todayKSTInputValue() {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// MARK: "재고가 100장 이상 입고되면 점포 투입하라고 알림" 요청 — /api/stock-inbound-alerts를
// 불러서, 2일 전 대비 재고가 100장 이상 늘어난 스타일+컬러를 보여줍니다.
function StockInboundAlertCard() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stock-inbound-alerts")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setAlerts(data.alerts || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !alerts.length) return null;

  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <p className="text-xs font-bold text-amber-700">📦 재고 대량입고 알림 (100장 이상 입고 후 아직 매장 투입 안 된 것으로 보임)</p>
      <p className="mt-1 text-[11px] font-semibold text-amber-500">한번 뜨면 실제로 재고가 줄어들 때까지(매장 투입 등) 계속 표시됩니다.</p>
      <div className="mt-3 flex flex-col gap-2">
        {alerts.slice(0, 10).map((a: any, i: number) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2">
            <ProductThumb styleCode={a.styleCode} size={40} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-slate-900">
                {a.styleCode} <span className="text-slate-400 font-semibold">{a.colorCode}</span>
              </div>
              <div className="text-xs text-slate-500">
                {a.firstAlertedDate}에 처음 감지 · 재고 {a.baselineStock}개 → {a.peakStock}개
              </div>
            </div>
            <div className="text-sm font-black text-amber-600">+{a.increase}개</div>
          </div>
        ))}
      </div>
      {alerts.length > 10 && <p className="mt-2 text-[11px] font-semibold text-amber-500">외 {alerts.length - 10}건 더 있어요.</p>}
    </div>
  );
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
  if (value === "점포요청") return <span className="rounded-full bg-purple-600 px-2.5 py-1 text-xs font-black text-white">🙋 점포요청</span>;
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
          <div className="mt-1 flex items-center gap-2">
            <ProductThumb styleCode={it.styleCode} size={36} />
            <p className="truncate text-lg font-black">{it.productName}</p>
          </div>
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

function fmtPct1(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(0)}%` : "-";
}

function PromotionReportCard({ it, p360 }: { it: any; p360: any }) {
  const promoPrice = it.promotionPrice || it.currentPrice || it.tagPrice || 0;
  const costRatio = p360?.cost && promoPrice ? (Number(p360.cost) / promoPrice) * 100 : null;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{it.styleCode} · {it.season || "-"}</p>
      <p className="text-sm font-black">{it.productName}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="font-semibold text-slate-400">소진율</p>
          <p className="font-black">{p360 ? fmtPct1(p360.sellThroughRate) : "조회중"}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="font-semibold text-slate-400">오프가용재고</p>
          <p className="font-black">{fmtNum(it.warehouseOfflineStock)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="font-semibold text-slate-400">온라인재고</p>
          <p className="font-black">{fmtNum(it.onlineStock)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="font-semibold text-slate-400">매장총재고</p>
          <p className="font-black">{fmtNum(it.storeStock)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="font-semibold text-slate-400">제안가/할인</p>
          <p className="font-black">{promoPrice ? `${fmtNum(promoPrice)}원` : "-"} ({it.discountRate || 0}%)</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="font-semibold text-slate-400">할인후 원가율</p>
          <p className="font-black">{costRatio != null ? fmtPct1(costRatio) : "-"}</p>
        </div>
      </div>
      <p className="mt-2 text-xs font-bold text-orange-700">{it.action}</p>
    </div>
  );
}

function PromotionReportSection({ data }: { data: any }) {
  const [tab, setTab] = useState<"underperform" | "driving">("underperform");
  const [productMap, setProductMap] = useState<Record<string, any>>({});
  const [loadingProducts, setLoadingProducts] = useState(false);

  const underperformItems = (data.promotionSuggestions || []).slice(0, 30);
  const drivingItems = (data.suppressedPromotionCandidates || []).slice(0, 30);
  const activeItems = tab === "underperform" ? underperformItems : drivingItems;

  useEffect(() => {
    const allCodes = Array.from(new Set([...underperformItems, ...drivingItems].map((it: any) => it.styleCode)));
    const codes = allCodes.filter((c) => !(c in productMap));
    if (!codes.length) return;
    setLoadingProducts(true);
    Promise.all(
      codes.map(async (code) => {
        try {
          const res = await fetch(`/api/product360?code=${encodeURIComponent(code)}`, { cache: "no-store" });
          const json = await res.json();
          return [code, json.ok && json.product ? json.product : null] as const;
        } catch {
          return [code, null] as const;
        }
      })
    ).then((pairs) => {
      setProductMap((prev) => {
        const next = { ...prev };
        pairs.forEach(([code, product]) => (next[code] = product));
        return next;
      });
      setLoadingProducts(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function downloadExcel() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();

    function buildSheet(name: string, items: any[]) {
      const ws = wb.addWorksheet(name);
      ws.columns = [
        { header: "품번", key: "styleCode", width: 14 },
        { header: "상품명", key: "productName", width: 26 },
        { header: "시즌", key: "season", width: 10 },
        { header: "소진율(%)", key: "sellThroughRate", width: 12 },
        { header: "오프가용재고", key: "offlineStock", width: 12 },
        { header: "온라인재고", key: "onlineStock", width: 12 },
        { header: "매장총재고", key: "storeStock", width: 12 },
        { header: "제안가", key: "promotionPrice", width: 12 },
        { header: "할인율(%)", key: "discountRate", width: 10 },
        { header: "할인후 원가율(%)", key: "costRatio", width: 14 },
        { header: "액션", key: "action", width: 30 },
      ];
      ws.getRow(1).eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
        cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
      });
      items.forEach((it) => {
        const p360 = productMap[it.styleCode];
        const promoPrice = it.promotionPrice || it.currentPrice || it.tagPrice || 0;
        const costRatio = p360?.cost && promoPrice ? Math.round((Number(p360.cost) / promoPrice) * 100) : "-";
        ws.addRow({
          styleCode: it.styleCode,
          productName: it.productName,
          season: it.season || "-",
          sellThroughRate: p360 && typeof p360.sellThroughRate === "number" ? Math.round(p360.sellThroughRate) : "-",
          offlineStock: Math.round(it.warehouseOfflineStock || 0),
          onlineStock: Math.round(it.onlineStock || 0),
          storeStock: Math.round(it.storeStock || 0),
          promotionPrice: promoPrice,
          discountRate: it.discountRate || 0,
          costRatio,
          action: it.action,
        }).eachCell((cell) => (cell.alignment = { vertical: "top", wrapText: true }));
      });
    }

    buildSheet("부진상품 프로모션", underperformItems);
    buildSheet("호조상품 매출드라이빙", drivingItems);

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `프로모션제안_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card
      title="프로모션 제안 리포트 (부진 · 호조 구분)"
      tone="orange"
      right={
        <button
          type="button"
          onClick={downloadExcel}
          className="rounded-full bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-700"
        >
          📥 엑셀 다운로드
        </button>
      }
    >
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("underperform")}
          className={`rounded-full px-4 py-2 text-xs font-black ${tab === "underperform" ? "bg-slate-900 text-white" : "bg-white text-slate-500"}`}
        >
          부진상품 제안 ({underperformItems.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("driving")}
          className={`rounded-full px-4 py-2 text-xs font-black ${tab === "driving" ? "bg-slate-900 text-white" : "bg-white text-slate-500"}`}
        >
          호조상품 매출드라이빙 ({drivingItems.length})
        </button>
      </div>
      <p className="mb-3 text-xs font-semibold text-slate-500">
        {tab === "underperform"
          ? "소진율이 낮고 재고가 쌓인 상품 — 가격 조정을 통한 소진 목적."
          : "잘 팔리는 상품을 세트/번들로 묶어 매출을 더 끌어올리기 위한 프로모션 후보."}
        {loadingProducts && " (소진율/원가 정보 불러오는 중...)"}
      </p>
      <div className="max-h-[600px] space-y-2 overflow-y-auto pr-2">
        {activeItems.length === 0 && <Empty />}
        {activeItems.map((it: any, i: number) => (
          <PromotionReportCard key={`${it.styleCode}-${i}`} it={it} p360={productMap[it.styleCode]} />
        ))}
      </div>
    </Card>
  );
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
              RT 기본값은 실행전주 7일 ↔ 실행주 7일, 프로모션 기본값은 행사기간(시작일~종료일, 진행중이면 오늘까지) ↔ 그 직전 같은 일수입니다.
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

          {categoryFilter === "PROMOTION" && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className={`rounded-2xl p-5 text-white shadow-sm ${Number(selected.addedQty || 0) >= 0 ? "bg-blue-600" : "bg-rose-600"}`}>
                <p className="text-xs font-bold text-white/80">📈 판매수량 증감</p>
                <p className="mt-2 text-2xl font-black">{Number(selected.addedQty || 0) >= 0 ? "+" : ""}{fmtNum(selected.addedQty)}개</p>
              </div>
              <div className={`rounded-2xl p-5 text-white shadow-sm ${Number(selected.addedAmount || 0) >= 0 ? "bg-emerald-600" : "bg-rose-600"}`}>
                <p className="text-xs font-bold text-white/80">💰 매출 증감</p>
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

function StoreRequestRtSection() {
  const [styleCode, setStyleCode] = useState("");
  const [color, setColor] = useState("");
  const [toStore, setToStore] = useState("");
  const [qty, setQty] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState("");

  async function fetchSuggestion() {
    if (!styleCode.trim() || !toStore.trim()) {
      setError("품번과 요청 점포를 입력해주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    setSavedKeys({});
    try {
      const params = new URLSearchParams({ styleCode: styleCode.trim(), toStore: toStore.trim() });
      if (qty.trim()) params.set("qty", qty.trim());
      if (color.trim()) params.set("color", color.trim());
      const res = await fetch(`/api/rt-request?${params.toString()}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.error || "제안 계산에 실패했습니다.");
      setResult(body);
    } catch (e: any) {
      setError(e?.message || "제안 계산에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function approveSuggestion(item: any, key: string) {
    setSavingKey(key);
    try {
      const res = await fetch("/api/rt-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.error || "저장에 실패했습니다.");
      setSavedKeys((prev) => ({ ...prev, [key]: true }));
    } catch (e: any) {
      alert(e?.message || "저장에 실패했습니다.");
    } finally {
      setSavingKey("");
    }
  }

  return (
    <Card title="🙋 점포 요청 RT" tone="white">
      <p className="mb-4 text-xs font-semibold text-slate-500">품번과 요청 점포를 입력하면, 어느 매장에서 이동하면 좋을지 바로 제안해드려요. 칼라를 지정하면 그 칼라 기준으로만 계산해요(안 지정하면 품번 전체 기준). 수량은 비워두면 자동(목표재고 3주 기준)으로 계산해요.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
          품번
          <input
            value={styleCode}
            onChange={(e) => setStyleCode(e.target.value)}
            placeholder="예: GF2LTS523"
            className="w-40 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
          칼라(선택)
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="예: BK"
            className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
          요청 점포
          <input
            value={toStore}
            onChange={(e) => setToStore(e.target.value)}
            placeholder="예: 성수 플래그십"
            className="w-40 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
          수량(선택)
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="자동"
            className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          />
        </label>
        <button
          type="button"
          onClick={fetchSuggestion}
          disabled={loading}
          className="h-10 rounded-full bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "계산 중..." : "제안 받기"}
        </button>
      </div>

      {error && <p className="mt-3 text-xs font-black text-red-600">⚠ {error}</p>}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl bg-slate-50 p-4 text-xs font-bold text-slate-600">
            <p className="text-sm font-black text-slate-900">{result.productName} ({result.styleCode}{result.colorCode ? ` / ${result.colorCode}${result.colorName ? " " + result.colorName : ""}` : ""})</p>
            <p className="mt-1">
              {result.toStore} 현재 재고 {fmtNum(result.toStock)}개 · 재고주수 {result.toStockWeeks >= 999 ? "판매없음" : `${Number(result.toStockWeeks).toFixed(1)}주`} ·
              목표수량 {fmtNum(result.desiredQty)}개 (충족 {fmtNum(result.fulfilledQty)}개{result.shortfall ? `, 부족 ${fmtNum(result.shortfall)}개` : ""})
            </p>
          </div>

          {!result.suggestions?.length ? (
            <Empty />
          ) : (
            result.suggestions.map((item: any, i: number) => {
              const key = `${item.fromStore}__${item.toStore}__${i}`;
              const saved = savedKeys[key];
              return (
                <div key={key} className="rounded-2xl border border-slate-100 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-black text-slate-900">{item.fromStore} → {item.toStore} · {fmtNum(item.suggestQty)}개</p>
                    <button
                      type="button"
                      onClick={() => approveSuggestion(item, key)}
                      disabled={saved || savingKey === key}
                      className={`h-9 rounded-full px-4 text-xs font-black text-white transition ${saved ? "bg-emerald-500" : "bg-slate-900 hover:bg-slate-700"} disabled:opacity-60`}
                    >
                      {saved ? "✓ 승인됨" : savingKey === key ? "저장 중..." : "승인"}
                    </button>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-xs font-semibold text-slate-500">{item.reason}</p>
                </div>
              );
            })
          )}
        </div>
      )}
    </Card>
  );
}


export default function InventoryDashboard() {
  const [dashboardData, setDashboardData] = useState<any>(markData);
  const [dataStatus, setDataStatus] = useState("내장 데이터");
  const [rtFilter, setRtFilter] = useState("all");
  const [rtStatusMap, setRtStatusMap] = useState<Record<string, string>>({});
  const [rtSavingKey, setRtSavingKey] = useState("");
  const [priceMeta, setPriceMeta] = useState<any>(null);
  const [priceCapturing, setPriceCapturing] = useState(false);
  const [priceStatus, setPriceStatus] = useState("");
  const [uploadStatuses, setUploadStatuses] = useState<any>(null);
  const [styleSheetFile, setStyleSheetFile] = useState<File | null>(null);
  const [styleSheetUploading, setStyleSheetUploading] = useState(false);
  const [styleSheetProgress, setStyleSheetProgress] = useState("");
  const [styleSheetError, setStyleSheetError] = useState("");
  const [backfillFiles, setBackfillFiles] = useState<FileList | null>(null);
  const [backfillUploading, setBackfillUploading] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState("");
  const [backfillLog, setBackfillLog] = useState<string[]>([]);
  const [launchCaptureStatus, setLaunchCaptureStatus] = useState("");

  useEffect(() => {
    fetch("/api/data", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setDashboardData(d);
        setDataStatus(d.source === "google-sheet" ? "구글시트 실시간 데이터" : "내장 데이터");
      })
      .catch(() => setDataStatus("내장 데이터"));

    fetch("/api/style-price-manual-capture", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setPriceMeta(d.meta); })
      .catch(() => {});

    fetch("/api/upload-status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setUploadStatuses(d); })
      .catch(() => {});
  }, []);

  async function runCaptureLaunchDates() {
    setLaunchCaptureStatus("캡처 중...");
    try {
      const res = await fetch("/api/capture-launch-dates", { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "캡처 실패");
      setLaunchCaptureStatus(`완료: ${data.scanned}개 확인, 새로 ${data.added}개 추가됨`);
    } catch (e: any) {
      setLaunchCaptureStatus(e?.message || "캡처 실패");
    }
  }

  async function runBackfillUpload() {
    if (!backfillFiles || !backfillFiles.length) return;
    setBackfillUploading(true);
    setBackfillLog([]);
    const XLSX = await import("xlsx");

    const files = Array.from(backfillFiles);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setBackfillProgress(`처리 중... (${i + 1}/${files.length}) ${file.name}`);
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
        const sheetName = wb.SheetNames.find((n: string) => n.includes("스타일별") && n.includes("채널별")) || wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });

        // 기준일자 컬럼을 엑셀 일련번호 대신 "YYYY-MM-DD" 문자열로 변환 (판매데이터 업로드와 동일한 처리)
        let dateColIdx = -1;
        for (let r = 0; r < Math.min(rows.length, 6) && dateColIdx < 0; r++) {
          const idx = (rows[r] || []).findIndex((v: any) => String(v ?? "").trim() === "기준일자");
          if (idx >= 0) dateColIdx = idx;
        }
        if (dateColIdx >= 0) {
          for (const row of rows) {
            const v = row[dateColIdx];
            if (typeof v === "number") {
              const d = new Date(Math.round((v - 25569) * 86400 * 1000));
              if (!Number.isNaN(d.getTime())) row[dateColIdx] = d.toISOString().slice(0, 10);
            }
          }
        }

        const res = await fetch("/api/daily-sales-backfill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "백필 실패");

        setBackfillLog((prev) => [...prev, `✅ ${file.name}: ${data.sourceDate} — ${data.newRows}건 반영 (교체 ${data.replacedRows}건)`]);
      } catch (e: any) {
        setBackfillLog((prev) => [...prev, `⚠ ${file.name}: ${e?.message || "실패"}`]);
      }
    }

    setBackfillProgress("완료.");
    setBackfillUploading(false);
  }

  async function runStyleSheetUpload() {
    if (!styleSheetFile) return;
    setStyleSheetUploading(true);
    setStyleSheetError("");
    setStyleSheetProgress("파일 읽는 중...");
    try {
      const XLSX = await import("xlsx");
      const buf = await styleSheetFile.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      const sheetName = wb.SheetNames.find((n: string) => n.includes("스타일별") && n.includes("채널별")) || wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });

      // MARK 6.36.1: 날짜 컬럼("기준일자")을 엑셀 일련번호 그대로 두면, 구글시트가 "숫자"로만
      // 받아들여서 매번 표시형식을 다시 지정해줘야 합니다. 대신 여기서 바로 "YYYY-MM-DD" 문자열로
      // 바꿔서 보내면, 시트가 새로 만들어져도 항상 날짜로 정확히 보여요(별도 서식 설정 불필요).
      let dateColIdx = -1;
      for (let r = 0; r < Math.min(rows.length, 6) && dateColIdx < 0; r++) {
        const idx = (rows[r] || []).findIndex((v: any) => String(v ?? "").trim() === "기준일자");
        if (idx >= 0) dateColIdx = idx;
      }
      function excelSerialToDateStr(serial: number) {
        const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
        if (Number.isNaN(d.getTime())) return null;
        return d.toISOString().slice(0, 10);
      }
      if (dateColIdx >= 0) {
        for (const row of rows) {
          const v = row[dateColIdx];
          if (typeof v === "number") {
            const converted = excelSerialToDateStr(v);
            if (converted) row[dateColIdx] = converted;
          }
        }
      }

      // MARK 6.35: 열이 아주 많은(채널 블록이 많은) 파일은 행 수 기준 청크로도 4.5MB 제한을
      // 넘을 수 있어서, "실제 JSON 용량"을 기준으로 청크를 나눕니다.
      // MARK 6.73: 이제 청크로 나누기 전에 먼저 압축합니다 — 594열짜리 원본을 그대로 구글시트에
      // 쌓으면 곧 1,000만 셀 한도에 부딪히기 때문에(2026-08-05 기준 이미 871만 셀), "채널값이
      // 있는 것만" JSON으로 압축해서 올립니다(약 19배 절감, 데이터 손실 없음 — 검증 완료).
      const originalRows = rows;
      const rows2 = compactStyleChannelRows(originalRows);
      const TARGET_CHUNK_BYTES = 2_000_000; // 여유 있게 2MB 목표 (요청 전체 한도는 4.5MB)
      const chunks: any[][][] = [];
      let current: any[][] = [];
      let currentBytes = 2;
      for (const row of rows2) {
        const rowBytes = JSON.stringify(row).length + 1;
        if (current.length && currentBytes + rowBytes > TARGET_CHUNK_BYTES) {
          chunks.push(current);
          current = [];
          currentBytes = 2;
        }
        current.push(row);
        currentBytes += rowBytes;
      }
      if (current.length) chunks.push(current);

      if (!chunks.length) throw new Error("파일에서 데이터를 읽지 못했습니다.");

      setStyleSheetProgress(`업로드 중... (1/${chunks.length})`);
      const startRes = await fetch("/api/upload-style-channel-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "start",
          rows: chunks[0],
          totalRows: rows2.length,
          totalCols: Math.max(...rows2.map((r) => r.length)),
        }),
      });
      const startData = await startRes.json();
      if (!startData.ok) throw new Error(startData.error || "업로드 시작 실패");
      const liveSheetName = startData.liveSheetName;

      let rowOffset = chunks[0].length + 1; // 1행부터 시작, chunks[0]은 start에서 이미 씀
      for (let i = 1; i < chunks.length; i++) {
        setStyleSheetProgress(`업로드 중... (${i + 1}/${chunks.length})`);
        const res = await fetch("/api/upload-style-channel-sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "chunk", rows: chunks[i], liveSheetName, startRow: rowOffset }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || `${i + 1}번째 청크 업로드 실패`);
        rowOffset += chunks[i].length;
      }

      setStyleSheetProgress("마무리 중(검증)...");
      const finishRes = await fetch("/api/upload-style-channel-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "finish", expectedTotalRows: rows2.length, liveSheetName }),
      });
      const finishData = await finishRes.json();
      if (!finishData.ok) throw new Error(finishData.error || "마무리 실패");

      setStyleSheetProgress(`완료! 총 ${finishData.totalRows}행 반영됐어요. (${originalRows.length - 3}개 품목, 원본 ${originalRows[0]?.length || 0}열 → 압축 ${rows2[3]?.length || 0}열)`);

      // MARK: "재고 100장 이상 입고되면 매장 투입 알림" 기능을 위해, 스타일+컬러별 재고를
      // 가볍게 뽑아서 이력에 쌓습니다. 실패해도 메인 업로드 자체는 이미 끝난 뒤라 조용히 무시합니다.
      // MARK 2026-09: 파일에 "사이즈" 컬럼이 새로 생기면서(점포 늘어난 것 등으로 열 구조가
      // 바뀜) 재고 컬럼 위치가 24→25로 밀렸고, 같은 스타일+컬러도 사이즈별로 여러 줄로
      // 나뉘게 됐습니다. 컬럼 위치를 고치고, 사이즈별 재고를 스타일+컬러 단위로 합산합니다
      // (안 그러면 마지막 사이즈 값만 남고 나머지 사이즈 재고가 사라지는 버그가 있었어요).
      try {
        const STYLE_COL = 13; // "스타일" 컬럼
        const COLOR_COL = 15; // "칼라" 컬럼
        const STOCK_COL = 25; // "재고"(물류) 컬럼 — 사이즈 컬럼이 생기면서 24→25로 밀림

        const stockByStyleColor = new Map<string, number>();
        for (const r of originalRows.slice(3)) {
          const styleCode = r[STYLE_COL];
          if (!styleCode) continue;
          const colorCode = r[COLOR_COL];
          const key = `${styleCode}\u0000${colorCode}`;
          const stock = Number(r[STOCK_COL] || 0);
          stockByStyleColor.set(key, (stockByStyleColor.get(key) || 0) + stock);
        }
        const stockHistoryRows = Array.from(stockByStyleColor.entries()).map(([key, stock]) => {
          const [styleCode, colorCode] = key.split("\u0000");
          return [styleCode, colorCode, stock];
        });

        const todayStr = new Date().toISOString().slice(0, 10);
        await fetch("/api/upload-stock-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: todayStr, rows: stockHistoryRows }),
        });
      } catch {
        // 이력 저장은 부가 기능이라 실패해도 메인 업로드 결과에 영향 안 줌
      }
    } catch (e: any) {
      setStyleSheetError(e?.message || "업로드 실패");
      setStyleSheetProgress("");
    } finally {
      setStyleSheetUploading(false);
    }
  }

  async function runPriceCapture() {
    setPriceCapturing(true);
    setPriceStatus("갱신 중...");
    try {
      const res = await fetch("/api/style-price-manual-capture", { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "갱신 실패");
      setPriceMeta(data.meta);
      setPriceStatus(data.result?.skipped ? "이미 이번 주(전주 기준) 갱신되어 있어요." : "갱신 완료!");
    } catch (e: any) {
      setPriceStatus(e?.message || "갱신 실패");
    } finally {
      setPriceCapturing(false);
    }
  }

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

        <a
          href="/consignment-upload"
          className="flex items-center justify-between rounded-3xl bg-gradient-to-r from-indigo-600 to-blue-600 p-5 text-white shadow-sm transition hover:from-indigo-700 hover:to-blue-700"
        >
          <div>
            <p className="text-xs font-bold text-indigo-100">위탁샵 (면세 · 한컬렉션 · 무신사)</p>
            <p className="mt-1 text-lg font-black">📤 인샵매출업로드 — 눌러서 이동</p>
          </div>
          <span className="text-2xl">→</span>
        </a>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500">스타일별 채널별 입고/판매/재고현황 업로드</p>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            온라인 포함 대용량 파일도 안전해요 — 브라우저에서 잘게 쪼개서(청크) 순서대로 올리고, 다 올라가면 검증 후 기존 시트와 통째로 교체해요.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setStyleSheetFile(e.target.files?.[0] || null)}
              className="text-xs"
            />
            <button
              type="button"
              onClick={runStyleSheetUpload}
              disabled={styleSheetUploading || !styleSheetFile}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              {styleSheetUploading ? "업로드 중..." : "업로드"}
            </button>
          </div>
          {styleSheetProgress && <p className="mt-2 text-xs font-bold text-blue-600">{styleSheetProgress}</p>}
          {styleSheetError && <p className="mt-2 text-xs font-black text-red-600">⚠ {styleSheetError}</p>}
        </div>

        <StockInboundAlertCard />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-bold text-slate-500">품번별 실제 평균단가 (Style_Price_History)</p>
            <p className="mt-1 text-sm font-black text-slate-900">
              {priceMeta ? (() => {
                const start = new Date(`${priceMeta.weekKey}T00:00:00`);
                const end = new Date(start);
                end.setDate(start.getDate() + 6);
                const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
                return `적용 기준: ${fmt(start)}~${fmt(end)} 실적 · 갱신일시 ${priceMeta.savedAt} · 품번 ${priceMeta.styleCount}개`;
              })() : "아직 갱신된 적 없음"}
            </p>
            {priceStatus && <p className="mt-1 text-xs font-bold text-blue-600">{priceStatus}</p>}
          </div>
          <button
            type="button"
            onClick={runPriceCapture}
            disabled={priceCapturing}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-black text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {priceCapturing ? "갱신 중..." : "🔄 지금 갱신하기"}
          </button>
        </div>

        {uploadStatuses && Object.entries(uploadStatuses.statuses || {}).some(([, info]: [string, any]) => {
          const kind = Object.keys(uploadStatuses.statuses).find((k) => uploadStatuses.statuses[k] === info);
          const threshold = uploadStatuses.thresholds?.[kind as string] ?? 7;
          return info.daysSince !== null && info.daysSince >= threshold;
        }) && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-black text-red-700">⚠ 업로드 지연 알림</p>
            <div className="mt-2 space-y-1">
              {Object.entries(uploadStatuses.statuses || {}).map(([kind, info]: [string, any]) => {
                const threshold = uploadStatuses.thresholds?.[kind] ?? 7;
                const stale = info.daysSince !== null && info.daysSince >= threshold;
                if (!stale) return null;
                return (
                  <p key={kind} className="text-xs font-bold text-red-600">
                    · {kind}: 마지막 업로드로부터 {info.daysSince}일 경과 (기준 {threshold}일) — 새 파일을 올려주세요.
                  </p>
                );
              })}
            </div>
          </div>
        )}

        <StoreRequestRtSection />

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
        <PromotionReportSection data={data} />

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

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500">입고일 캡처 (1회성)</p>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            "금주/전주" 시트에서 입고일(최초출고일)을 한 번 읽어와 저장해둡니다. 이미 저장된 품번은 안 건드리고, 새 품번만 추가돼요.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={runCaptureLaunchDates}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-black text-white"
            >
              입고일 캡처 실행
            </button>
            {launchCaptureStatus && <p className="text-xs font-bold text-blue-600">{launchCaptureStatus}</p>}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500">과거 일자별 매출 백필 업로드</p>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            지난주 수요일 이전 Daily_Sales_History는 금액이 정확하지 않아요. 그날짜의 "스타일별채널별(금액)" 파일을 하나씩(또는 여러 개 한번에) 올리면, 그 날짜 데이터만 정확한 값으로 교체돼요.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".xlsx,.xls"
              multiple
              onChange={(e) => setBackfillFiles(e.target.files)}
              className="text-xs"
            />
            <button
              type="button"
              onClick={runBackfillUpload}
              disabled={backfillUploading || !backfillFiles || !backfillFiles.length}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              {backfillUploading ? "처리 중..." : "백필 업로드"}
            </button>
          </div>
          {backfillProgress && <p className="mt-2 text-xs font-bold text-blue-600">{backfillProgress}</p>}
          {backfillLog.length > 0 && (
            <div className="mt-3 max-h-52 overflow-y-auto rounded-xl bg-slate-50 p-3 text-xs font-semibold">
              {backfillLog.map((line, i) => (
                <p key={i} className={line.startsWith("⚠") ? "text-red-600" : "text-slate-600"}>{line}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
