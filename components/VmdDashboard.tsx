"use client";

import { useEffect, useMemo, useState } from "react";
import NavTabs from "@/components/NavTabs";
import { Card, Empty, Kpi } from "@/components/Shared";
import ProductThumb from "@/components/ProductThumb";

function drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function loadImgEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function OutfitPreviewSection() {
  const [topCode, setTopCode] = useState("");
  const [bottomCode, setBottomCode] = useState("");
  const [topImg, setTopImg] = useState<string | null>(null);
  const [bottomImg, setBottomImg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchCut(code: string): Promise<string | null> {
    if (!code.trim()) return null;
    const res = await fetch(`/api/product-images?code=${encodeURIComponent(code.trim())}`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!json?.ok || !json?.product) return null;
    return json.product.productCuts?.[0] || json.product.hero || null;
  }

  async function runPreview() {
    setLoading(true);
    setError("");
    setTopImg(null);
    setBottomImg(null);
    try {
      const [t, b] = await Promise.all([fetchCut(topCode), fetchCut(bottomCode)]);
      if (!t && !b) throw new Error("두 품번 모두 이미지를 찾지 못했어요. 품번을 다시 확인해주세요.");
      setTopImg(t);
      setBottomImg(b);
    } catch (e: any) {
      setError(e?.message || "미리보기 생성 실패");
    } finally {
      setLoading(false);
    }
  }

  async function downloadCombined() {
    if (!topImg && !bottomImg) return;
    setError("");
    try {
      const W = 600;
      const H = 800;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);

      if (topImg) drawContain(ctx, await loadImgEl(topImg), 0, 0, W, H / 2);
      if (bottomImg) drawContain(ctx, await loadImgEl(bottomImg), 0, H / 2, W, H / 2);

      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `코디_${topCode || "상의"}_${bottomCode || "하의"}.png`;
      a.click();
    } catch {
      setError("이미지를 합쳐서 다운로드하는 데 실패했어요(이미지 서버 CORS 제한일 수 있어요). 화면 캡처로 대신 저장해보세요.");
    }
  }

  return (
    <Card title="👕👖 코디 미리보기 (가안)">
      <p className="mb-4 text-xs font-semibold text-slate-500">품번 두 개(상의/하의)를 넣으면 제품컷을 위/아래로 배치해서 보여줘요. 아직 실험적인 기능이에요.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
          상의 품번
          <input
            value={topCode}
            onChange={(e) => setTopCode(e.target.value)}
            placeholder="예: GF2LSH521"
            className="w-40 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
          하의 품번
          <input
            value={bottomCode}
            onChange={(e) => setBottomCode(e.target.value)}
            placeholder="예: WBE1L12504"
            className="w-40 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          />
        </label>
        <button
          type="button"
          onClick={runPreview}
          disabled={loading || (!topCode.trim() && !bottomCode.trim())}
          className="h-10 rounded-full bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "불러오는 중..." : "미리보기"}
        </button>
        {(topImg || bottomImg) && (
          <button
            type="button"
            onClick={downloadCombined}
            className="h-10 rounded-full border border-slate-900 px-5 text-sm font-black text-slate-900 transition hover:bg-slate-50"
          >
            📥 다운로드
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-xs font-black text-red-600">⚠ {error}</p>}

      {(topImg || bottomImg) && (
        <div className="mt-4 flex justify-center">
          <div className="flex w-64 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <div className="flex h-64 items-center justify-center bg-white">
              {topImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={topImg} alt="상의" className="max-h-full max-w-full object-contain" />
              ) : (
                <p className="text-xs font-bold text-slate-300">상의 없음</p>
              )}
            </div>
            <div className="flex h-64 items-center justify-center border-t border-slate-100 bg-white">
              {bottomImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bottomImg} alt="하의" className="max-h-full max-w-full object-contain" />
              ) : (
                <p className="text-xs font-bold text-slate-300">하의 없음</p>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

type VmdEvent = {
  date: string;
  month: string;
  dayLabel: string;
  who: string;
  content: string;
};

type VmdPayload = {
  ok: boolean;
  error?: string;
  events: VmdEvent[];
  stores: string[];
  unvisited: string[];
  longNoVisit: string[];
  upcoming: VmdEvent[];
  insights: { tone: string; title: string; body: string }[];
  source?: { scheduleSheet?: string; storeSource?: string };
};

const dow = ["일", "월", "화", "수", "목", "금", "토"];

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function md(dateKey: string) {
  const parts = dateKey.split("-").map(Number);
  if (parts.length < 3) return dateKey;
  return `${parts[1]}/${parts[2]}`;
}

function monthTitle(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${y}년 ${m}월`;
}

function normalizeKey(v: any) {
  return String(v ?? "")
    .trim()
    .replace(/^오프라인[_\s-]*/i, "")
    .replace(/점$/g, "")
    .replace(/[\s_\-·.()]/g, "")
    .toLowerCase();
}

function isStoreEvent(event: VmdEvent, stores: string[]) {
  const set = new Set(stores.map(normalizeKey));
  return set.has(normalizeKey(event.content));
}

function eventColor(who: string) {
  const key = String(who || "");
  if (key === "전체") return "bg-emerald-500";
  if (key === "기타") return "bg-slate-400";
  if (key.includes("민지")) return "bg-violet-500";
  if (key.includes("다은")) return "bg-pink-500";
  return "bg-blue-500";
}

function toneClass(tone: string) {
  if (tone === "green") return "border-emerald-100 bg-emerald-50 text-emerald-900";
  if (tone === "amber") return "border-amber-100 bg-amber-50 text-amber-900";
  if (tone === "rose") return "border-rose-100 bg-rose-50 text-rose-900";
  return "border-violet-100 bg-violet-50 text-violet-900";
}

function Calendar({ month, events, stores }: { month: string; events: VmdEvent[]; stores: string[] }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const today = ymd(new Date());
  const byDate = new Map<string, VmdEvent[]>();
  for (const ev of events) {
    if (!byDate.has(ev.date)) byDate.set(ev.date, []);
    byDate.get(ev.date)!.push(ev);
  }
  const cells = [] as (number | null)[];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400">
        {dow.map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} className="min-h-[92px] rounded-2xl bg-slate-50/50" />;
          const dateKey = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const rows = byDate.get(dateKey) || [];
          return (
            <div key={dateKey} className={`min-h-[92px] rounded-2xl border p-2 ${dateKey === today ? "border-slate-900 bg-slate-50" : "border-slate-100 bg-white"}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-700">{day}</span>
                {rows.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{rows.length}</span>}
              </div>
              <div className="mt-2 space-y-1">
                {rows.slice(0, 3).map((ev, i) => (
                  <div key={`${ev.date}-${ev.who}-${ev.content}-${i}`} title={`${ev.who} · ${ev.content}`} className="flex items-center gap-1 truncate text-[11px] font-semibold text-slate-600">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${eventColor(ev.who)}`} />
                    <span className="truncate">{isStoreEvent(ev, stores) ? ev.content : `[${ev.who}] ${ev.content}`}</span>
                  </div>
                ))}
                {rows.length > 3 && <div className="text-[10px] font-bold text-slate-400">+{rows.length - 3}건</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DirectiveBadge({ type }: { type: string }) {
  const cls =
    type === "주력상품-공급형"
      ? "bg-emerald-100 text-emerald-700"
      : type === "소진필요"
      ? "bg-rose-100 text-rose-700"
      : type === "주력상품-회전형"
      ? "bg-sky-100 text-sky-700"
      : "bg-slate-200 text-slate-600";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${cls}`}>{type}</span>;
}

function StyleDirectivesSection() {
  const [directives, setDirectives] = useState<any[]>([]);
  const [status, setStatus] = useState("불러오는 중...");
  const [filterType, setFilterType] = useState("전체");

  useEffect(() => {
    fetch("/api/style-directives", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) {
          setStatus(d.error || "불러오기 실패");
          return;
        }
        setDirectives(d.directives || []);
        setStatus("");
      })
      .catch((e) => setStatus(e?.message || "불러오기 실패"));
  }, []);

  const filtered = filterType === "전체" ? directives : directives.filter((d) => d.directiveType === filterType);
  const types = ["전체", "주력상품-공급형", "소진필요", "주력상품-회전형", "관찰"];

  return (
    <Card title="🎯 이번주 전사지시 (Layer 0)">
      <p className="mb-3 text-xs font-semibold text-slate-500">
        오프라인 매장 12곳 이상이 재고 10장 이상 보유한 스타일만 후보로 삼고, 창고재고(500장 기준)와
        2주 판매추이로 분류했어요. 재고 10장 미만인 매장은 "투입필요"로 따로 표시돼요.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {types.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilterType(t)}
            className={`rounded-full px-4 py-2 text-xs font-black ${filterType === t ? "bg-slate-900 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
          >
            {t} {t !== "전체" ? `(${directives.filter((d) => d.directiveType === t).length})` : `(${directives.length})`}
          </button>
        ))}
      </div>

      {status && <p className="text-xs font-bold text-blue-600">{status}</p>}

      <div className="max-h-[600px] space-y-2 overflow-y-auto pr-2">
        {filtered.slice(0, 50).map((d, i) => (
          <div key={`${d.styleCode}-${i}`} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <ProductThumb styleCode={d.styleCode} size={48} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{d.styleCode} · {d.productName}</p>
                  <p className="text-xs font-semibold text-slate-500">{d.reason}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <DirectiveBadge type={d.directiveType} />
                <span className="text-xs font-bold text-slate-400">우선순위 {d.priority}</span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-slate-400">
              <span>확산매장 {d.qualifyingStoreCount}곳</span>
              <span>창고재고 {Math.round(d.warehouseStock || 0)}장</span>
              <span>2주 판매 {Math.round(d.weekNet || 0)}개 (전 2주 {Math.round(d.prevNet || 0)}개)</span>
            </div>
            {d.gapStoreCount > 0 && (
              <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs font-bold text-amber-700">
                ⚠ 투입필요 매장 {d.gapStoreCount}곳: {(d.gapStores || []).join(", ")}
                {d.gapStoreCount > (d.gapStores || []).length ? " 외" : ""}
              </p>
            )}
          </div>
        ))}
        {!status && filtered.length === 0 && <Empty />}
      </div>
    </Card>
  );
}

function CandidateBadge({ kind }: { kind: string }) {
  const label = kind === "lookbook" ? "룩북" : kind === "copurchase" ? "함께담김" : "매장회전";
  const cls =
    kind === "lookbook" ? "bg-violet-100 text-violet-700" : kind === "copurchase" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${cls}`}>{label}</span>;
}

function GiBoardVmdSection() {
  const [stores, setStores] = useState<any[]>([]);
  const [storeName, setStoreName] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [crossCheck, setCrossCheck] = useState<any>(null);
  const [status, setStatus] = useState("매장 목록 불러오는 중...");
  const [onlyStalled, setOnlyStalled] = useState(false);
  const [onlyDiscrepant, setOnlyDiscrepant] = useState(false);

  useEffect(() => {
    fetch("/api/vmd-directives", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) {
          setStatus(d.error || "불러오기 실패");
          return;
        }
        setStores(d.stores || d.storeList || []);
        setStatus("");
      })
      .catch((e) => setStatus(e?.message || "불러오기 실패"));
  }, []);

  async function loadStore(name: string) {
    setStoreName(name);
    setItems([]);
    setCrossCheck(null);
    if (!name) return;
    setStatus("매장 데이터 불러오는 중... (용량이 커서 시간이 좀 걸릴 수 있어요)");
    try {
      const params = new URLSearchParams({ store: name });
      if (onlyStalled) params.set("stalled", "1");
      const res = await fetch(`/api/vmd-directives?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "불러오기 실패");
      setItems(data.items || []);
      setCrossCheck(data.crossCheck || null);
      setStatus("");
    } catch (e: any) {
      setStatus(e?.message || "불러오기 실패");
    }
  }

  const filteredItems = onlyDiscrepant ? items.filter((it) => it.stockDiscrepant) : items;

  return (
    <Card title="👗 gi-board 진열 코디 제안 (매장별)">
      <p className="mb-3 text-xs font-semibold text-slate-500">
        룩북/함께담김/매장회전 근거로 gi-board가 만든 진열 제안이에요. 재고는 MARK 자체 데이터와 교차검증해서, 어긋나는 항목은 표시돼요.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select
          value={storeName}
          onChange={(e) => loadStore(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
        >
          <option value="">매장 선택</option>
          {stores.map((s: any) => {
            const name = s.store || s.storeName || s.name || String(s);
            const count = s.pairCount ?? s.count ?? s.combos ?? s.total ?? s.skuWithPair ?? "-";
            return (
              <option key={name} value={name}>
                {name} ({count})
              </option>
            );
          })}
        </select>
        <label className="flex items-center gap-1 text-xs font-bold text-slate-600">
          <input type="checkbox" checked={onlyStalled} onChange={(e) => { setOnlyStalled(e.target.checked); if (storeName) loadStore(storeName); }} />
          안 도는 것만
        </label>
        <label className="flex items-center gap-1 text-xs font-bold text-slate-600">
          <input type="checkbox" checked={onlyDiscrepant} onChange={(e) => setOnlyDiscrepant(e.target.checked)} />
          재고 불일치만
        </label>
      </div>

      {status && <p className="text-xs font-bold text-blue-600">{status}</p>}

      {crossCheck && (
        <p className="mb-3 text-xs font-bold text-slate-500">
          교차검증: 전체 {crossCheck.itemCount}건 중 <span className={crossCheck.discrepancyCount > 0 ? "text-rose-600" : "text-emerald-600"}>불일치 {crossCheck.discrepancyCount}건</span>
        </p>
      )}

      <div className="max-h-[600px] space-y-2 overflow-y-auto pr-2">
        {filteredItems.slice(0, 60).map((it: any, i: number) => (
          <div key={`${it.sku}-${i}`} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ProductThumb styleCode={String(it.sku || "").split("::")[0]} size={56} />
                <p className="text-sm font-black">
                  {it.sku} · {it.name} <span className="text-xs font-semibold text-slate-400">({it.slot})</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">gi재고 {it.stock}</span>
                {it.markStock !== null && (
                  <span className={`text-xs font-black ${it.stockDiscrepant ? "text-rose-600" : "text-slate-400"}`}>
                    MARK재고 {it.markStock}{it.stockDiscrepant ? " ⚠" : ""}
                  </span>
                )}
              </div>
            </div>
            {(it.candidates || []).length > 0 && (
              <div className="mt-2 space-y-1">
                {it.candidates.map((c: any, ci: number) => (
                  <div key={ci} className="flex items-center gap-2 text-xs">
                    <ProductThumb styleCode={c.style} size={36} />
                    <CandidateBadge kind={c.kind} />
                    <span className="font-bold">{c.style} · {c.name}</span>
                    <span className="text-slate-400">{c.relation} · {c.colorName} · 재고{c.stock}</span>
                  </div>
                ))}
              </div>
            )}
            {(!it.candidates || !it.candidates.length) && (
              <p className="mt-1 text-xs font-semibold text-slate-400">실근거로 준비된 짝이 아직 없어요 (매장 회전 제안만 가능)</p>
            )}
          </div>
        ))}
        {!status && storeName && filteredItems.length === 0 && <Empty />}
      </div>
    </Card>
  );
}

export default function VmdDashboard() {
  const [payload, setPayload] = useState<VmdPayload | null>(null);
  const [month, setMonth] = useState(ymd(new Date()).slice(0, 7));
  const [whoFilter, setWhoFilter] = useState("전체");

  async function load() {
    const res = await fetch("/api/vmd", { cache: "no-store" });
    const json = await res.json();
    setPayload(json);
  }

  useEffect(() => {
    load().catch(() => setPayload({ ok: false, error: "VMD 데이터를 불러오지 못했습니다.", events: [], stores: [], unvisited: [], longNoVisit: [], upcoming: [], insights: [] }));
  }, []);

  const events = payload?.events || [];
  const stores = payload?.stores || [];
  const monthOptions = useMemo(() => {
    const set = new Set(events.map((e) => e.month).filter(Boolean));
    set.add(month);
    return Array.from(set).sort();
  }, [events, month]);

  const staffOptions = useMemo(() => ["전체", ...Array.from(new Set(events.map((e) => e.who).filter((x) => x && x !== "전체" && x !== "기타"))).sort(), "기타"], [events]);
  const monthEvents = useMemo(() => events.filter((e) => e.month === month && (whoFilter === "전체" || e.who === whoFilter)), [events, month, whoFilter]);
  const monthVisitEvents = useMemo(() => monthEvents.filter((e) => isStoreEvent(e, stores)), [monthEvents, stores]);
  const monthVisitedStores = useMemo(() => new Set(monthVisitEvents.map((e) => normalizeKey(e.content))), [monthVisitEvents]);
  const monthUnvisited = useMemo(() => stores.filter((s) => !monthVisitedStores.has(normalizeKey(s))), [stores, monthVisitedStores]);
  const monthEtc = monthEvents.filter((e) => !isStoreEvent(e, stores));
  const progress = stores.length ? Math.round((monthVisitedStores.size / stores.length) * 100) : 0;

  const staffRows = useMemo(() => {
    const names = staffOptions.filter((x) => x !== "전체" && x !== "기타");
    return names.map((name) => {
      const own = events.filter((e) => e.month === month && e.who === name);
      const team = events.filter((e) => e.month === month && e.who === "전체");
      return { name, own: own.length, team: team.length, total: own.length + team.length, ownEvents: own };
    });
  }, [events, month, staffOptions]);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">VMD 라운딩</h1>
            <p className="mt-1 text-sm text-slate-500">VMD_SCHEDULE 기준 라운딩 일정과 매장 커버리지를 확인합니다.</p>
          </div>
          <NavTabs active="vmd" />
        </header>

        {payload?.error && <div className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{payload.error}</div>}

        <section className="grid gap-4 md:grid-cols-4">
          <Kpi title="이달 라운딩" value={`${monthVisitedStores.size} / ${stores.length}개소`} sub={`진행률 ${progress}%`} tone="blue" />
          <Kpi title="기준 매장" value={`${stores.length}개`} sub={payload?.source?.storeSource || "일간매출(26년)"} />
          <Kpi title="이달 미방문" value={`${monthUnvisited.length}개소`} sub={monthUnvisited.length ? monthUnvisited.slice(0, 2).join(", ") : "전체 방문 일정 있음"} tone={monthUnvisited.length ? "orange" : "green"} />
          <Kpi title="기타 일정" value={`${monthEtc.length}건`} sub="휴무·교육·행사 포함" tone="purple" />
        </section>

        <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card title="라운딩 캘린더" right={
            <div className="flex flex-wrap gap-2">
              <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
                {monthOptions.map((m) => <option key={m} value={m}>{monthTitle(m)}</option>)}
              </select>
              <select value={whoFilter} onChange={(e) => setWhoFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
                {staffOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button type="button" onClick={load} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white">갱신</button>
            </div>
          }>
            <Calendar month={month} events={monthEvents} stores={stores} />
            <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold text-slate-500">
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" />전체</span>
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-violet-500" />민지</span>
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-pink-500" />다은</span>
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-slate-400" />기타</span>
            </div>
          </Card>

          <Card title="AI 인사이트" tone="purple">
            <div className="space-y-3">
              {!payload?.insights?.length && <Empty />}
              {(payload?.insights || []).map((ins, i) => (
                <div key={`${ins.title}-${i}`} className={`rounded-2xl border p-4 ${toneClass(ins.tone)}`}>
                  <p className="font-black">{ins.title}</p>
                  <p className="mt-1 text-sm font-semibold leading-6 opacity-80">{ins.body}</p>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card title="담당자 현황">
            <div className="grid gap-3 sm:grid-cols-2">
              {staffRows.length === 0 && <Empty />}
              {staffRows.map((row) => (
                <div key={row.name} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-black">{row.name}</p>
                      <p className="text-xs font-bold text-slate-500">단독 {row.own} · 전체 {row.team}</p>
                    </div>
                    <p className="text-2xl font-black text-slate-900">{row.total}</p>
                  </div>
                  <div className="mt-3 space-y-1 text-xs font-semibold text-slate-600">
                    {row.ownEvents.slice(0, 4).map((ev) => <p key={`${row.name}-${ev.date}-${ev.content}`}>{ev.dayLabel} · {ev.content}</p>)}
                    {!row.ownEvents.length && <p className="text-slate-400">단독 일정 없음</p>}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="이번 달 일정 요약">
            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-2">
              {monthEvents.length === 0 && <Empty />}
              {monthEvents.map((ev, i) => (
                <div key={`${ev.date}-${ev.who}-${ev.content}-${i}`} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm">
                  <span className="w-12 text-xs font-black text-slate-400">{ev.dayLabel}</span>
                  <span className={`h-2 w-2 rounded-full ${eventColor(ev.who)}`} />
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-500">{ev.who}</span>
                  <span className="min-w-0 flex-1 truncate font-bold text-slate-700">{ev.content}</span>
                  {isStoreEvent(ev, stores) && <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">매장</span>}
                </div>
              ))}
            </div>
          </Card>
        </section>

        <Card title="매장 커버리지">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {stores.map((store, i) => {
              const visited = monthVisitedStores.has(normalizeKey(store));
              const ev = monthVisitEvents.find((e) => normalizeKey(e.content) === normalizeKey(store));
              return (
                <div key={store} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3">
                  <span className="w-6 text-xs font-black text-slate-400">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-700">{store}</span>
                  <span className={`rounded-full px-2 py-1 text-xs font-black ${visited ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{visited ? `${ev?.dayLabel} 예정/완료` : "미방문"}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <StyleDirectivesSection />

        <GiBoardVmdSection />

        <OutfitPreviewSection />
      </div>
    </main>
  );
}
