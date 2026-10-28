"use client";

// MARK 2026-10-28: 라운딩 탭 "재고 점검" — 매장 방문 때 그 매장 재고를 전사와 비교해서 보고 조치를 남깁니다.
// 계산: lib/roundingInventory.ts (/api/rounding/inventory). 조치는 기존 라운딩_지적사항에 "재고관리" 영역으로 저장되고,
// 대상(품번/SKU)과 당시 재고·판매를 같이 남겨서 다음 방문 때 "그 뒤로 어떻게 됐는지"를 보여줍니다.

import { useEffect, useMemo, useState } from "react";
import ProductThumb from "@/components/ProductThumb";

type Sku = { color: string; colorName: string; size: string; type: "품절" | "품절임박" | "사이즈깨짐"; stock: number; weekly: number; weeks: number; companyQty2w: number; warehouse: number };
type InvStore = {
  storeName: string;
  storeCode: string;
  grade: string;
  salesRank: number | null;
  summary: {
    stock: number; w1Qty: number; w2Qty: number; weekly: number; weeks: number; stockRank: number; weeksRank: number; storeCount: number;
    prevStock: number | null; prevStockDate: string | null; stockDelta: number | null;
    company: { avgStock: number; avgWeekly: number; weeks: number; totalStock: number; avgPrevStock: number | null };
  };
  topIssues: { companyRank: number; styleCode: string; productName: string; companyQty2w: number; companyAvgWeekly: number; storeQty2w: number; storeStock: number; notCarried: boolean; warehouseStyle: number; skus: Sku[] }[];
  boost: { styleCode: string; productName: string; color: string; colorName: string; size: string; cumQty: number; companyQty2w: number; warehouse: number }[];
  newProducts: { styleCode: string; productName: string; firstSeen: string; storeStock: number; storeSold: number; storeSellThrough: number; companySellThrough: number; companyAvgSold: number; carryingStores: number; storeSTRank: number; low: boolean; warehouse: number }[];
  skuMap: Record<string, [number, number, number]>;
};
type InvMeta = { computedAt: string; anchorDate: string; week1: string; week2: string; pipUploadedAt: string | null; warehouseUploadedAt: string | null; warehouseUsed: boolean; computeMs: number };
type Issue = { issueId: string; issueDate: string; area: string; item: string; content: string; action: string; status: "미해결" | "해결"; resolvedAt?: string; target?: string; actionType?: string; dueDate?: string; snapshot?: any; repeatCount?: number; isRepeat?: boolean };

const ACTION_TYPES = ["진열 변경", "RT 요청", "물류 출고 요청", "판매 독려·교육", "반품·회수", "프로모션 제안", "기타"];
const fmt = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "-" : Math.round(v).toLocaleString("ko-KR"));
const wk = (v: number) => (v >= 99 ? "판매없음" : `${v}주`);
const sizeLabel = (s: string) => s.replace(/^0+(?=[A-Z0-9])/, "");

function todayKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 대상(STYLE|COLOR|SIZE 또는 STYLE)의 현재 재고·주별 판매 */
function currentOf(skuMap: InvStore["skuMap"] | undefined, target: string) {
  if (!skuMap || !target) return null;
  if (target.split("|").length === 3) {
    const v = skuMap[target];
    return { stock: v?.[0] || 0, w1: v?.[1] || 0, w2: v?.[2] || 0 };
  }
  let stock = 0, w1 = 0, w2 = 0, found = false;
  for (const [k, v] of Object.entries(skuMap)) {
    if (!k.startsWith(`${target}|`)) continue;
    found = true;
    stock += v[0];
    w1 += v[1];
    w2 += v[2];
  }
  return found ? { stock, w1, w2 } : { stock: 0, w1: 0, w2: 0 };
}

type Draft = { block: string; target: string; label: string; content: string };

export default function RoundingInventoryPanel({ storeName, onIssuesChanged }: { storeName: string; onIssuesChanged?: () => void }) {
  const [inv, setInv] = useState<InvStore | null>(null);
  const [meta, setMeta] = useState<InvMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [form, setForm] = useState({ actionType: ACTION_TYPES[0], memo: "", dueDate: "" });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    if (!storeName) return;
    setInv(null);
    setDraft(null);
    load(false);
    loadIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeName]);

  async function load(force: boolean) {
    setLoading(true);
    setError("");
    try {
      const res = force
        ? await fetch("/api/rounding/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ store: storeName }) })
        : await fetch(`/api/rounding/inventory?store=${encodeURIComponent(storeName)}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "불러오기 실패");
      setMeta(json.meta);
      setInv(json.store);
      if (!json.store) setError("이 매장의 재고 데이터를 찾지 못했어요(PIP 매장 이름과 다를 수 있어요).");
    } catch (e: any) {
      setError(e?.message || "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }

  async function loadIssues() {
    try {
      const res = await fetch(`/api/rounding/issues?store=${encodeURIComponent(storeName)}`, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setIssues((json.issues || []).filter((i: Issue) => i.area === "재고관리" && i.target));
    } catch {
      // 무시
    }
  }

  function openDraft(d: Draft) {
    setDraft(d);
    setForm({ actionType: d.block === "보충 대상" ? "물류 출고 요청" : d.block === "신상품 반응" ? "판매 독려·교육" : ACTION_TYPES[0], memo: "", dueDate: "" });
    setSaveMsg("");
  }

  async function saveAction() {
    if (!draft || !inv) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const cur = currentOf(inv.skuMap, draft.target);
      const res = await fetch("/api/rounding/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName,
          area: "재고관리",
          item: draft.block,
          content: draft.content,
          action: form.memo,
          target: draft.target,
          actionType: form.actionType,
          dueDate: form.dueDate,
          snapshot: { date: meta?.anchorDate || todayKST(), label: draft.label, ...(cur || {}) },
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "저장 실패");
      setDraft(null);
      setSaveMsg("조치를 남겼어요.");
      await loadIssues();
      onIssuesChanged?.();
    } catch (e: any) {
      setSaveMsg(e?.message || "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function resolve(issueId: string) {
    await fetch("/api/rounding/issues", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ issueId, status: "해결" }) }).catch(() => {});
    await loadIssues();
    onIssuesChanged?.();
  }

  const openActions = useMemo(() => issues.filter((i) => i.status === "미해결"), [issues]);
  const resolvedActions = useMemo(() => issues.filter((i) => i.status === "해결").slice(0, 10), [issues]);
  const actedTargets = useMemo(() => new Set(openActions.map((i) => i.target)), [openActions]);

  const s = inv?.summary;
  const whOld = !!meta?.warehouseUploadedAt && (Date.now() + 9 * 3600 * 1000 - Date.parse(`${meta.warehouseUploadedAt.slice(0, 10)}T00:00:00Z`)) / 86400000 > 7;

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-black text-slate-400">재고 점검</p>
          {meta && (
            <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
              판매 전주 {meta.week1} · 전전주 {meta.week2} · 재고 PIP {meta.pipUploadedAt || "-"} · 창고 {meta.warehouseUploadedAt || "업로드 없음"}{whOld ? " ⚠️ 오래됨 — 재고CTRL에서 다시 올려주세요" : ""} · 계산 {meta.computedAt}
            </p>
          )}
        </div>
        <button type="button" onClick={() => load(true)} disabled={loading} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 disabled:opacity-50">
          {loading ? "계산 중..." : "🔄 다시 계산"}
        </button>
      </div>

      {loading && !inv && <p className="mt-4 text-center text-xs font-semibold text-slate-400">재고 점검 불러오는 중... (오늘 첫 조회면 전 매장 계산이라 20~40초 걸려요)</p>}
      {error && <p className="mt-3 text-xs font-bold text-rose-600">{error}</p>}

      {inv && s && (
        <>
          {/* ① 요약 */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Cmp label="총 재고" mine={`${fmt(s.stock)}장`} co={`매장 평균 ${fmt(s.company.avgStock)}장`} />
            <Cmp label="주간 판매(2주 평균)" mine={`${fmt(s.weekly)}장`} co={`매장 평균 ${fmt(s.company.avgWeekly)}장`} />
            <Cmp label="재고주수" mine={wk(s.weeks)} co={`전사 ${wk(s.company.weeks)}`} warn={s.weeks < 99 && s.company.weeks < 99 && s.weeks > s.company.weeks * 1.3} />
            <Cmp
              label="지난주 대비 재고"
              mine={s.stockDelta === null ? "기록 쌓는 중" : `${s.stockDelta >= 0 ? "+" : ""}${fmt(s.stockDelta)}장`}
              co={s.prevStockDate ? `${s.prevStockDate} ${fmt(s.prevStock)}장` : "다음주부터 비교돼요"}
            />
          </div>
          <p className="mt-2 text-[11px] font-bold text-slate-500">
            {s.storeCount}개 매장 중 재고 많은 순 <b className="text-slate-800">{s.stockRank}위</b> · 재고주수 긴 순 <b className="text-slate-800">{s.weeksRank}위</b>
            {inv.grade !== "-" && <> · 매장등급 {inv.grade}{inv.salesRank ? ` (판매순위 ${inv.salesRank}위)` : ""}</>}
          </p>

          {/* 지난 조치 추적 */}
          {openActions.length > 0 && (
            <Section title={`진행 중인 재고 조치 (${openActions.length})`} hint="남길 때 재고·판매 → 지금 (매일 갱신)">
              <div className="space-y-1.5">
                {openActions.map((i) => {
                  const cur = currentOf(inv.skuMap, i.target || "");
                  const snap = i.snapshot || {};
                  const overdue = i.dueDate && i.dueDate < todayKST();
                  return (
                    <div key={i.issueId} className="flex items-start justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 p-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-indigo-900">
                          {i.actionType || "조치"} · {snap.label || i.target}
                          {i.isRepeat && <span className="ml-1.5 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] text-white">반복 {i.repeatCount}회</span>}
                        </p>
                        <p className="mt-0.5 text-[11px] text-indigo-800">{i.content}</p>
                        {i.action && <p className="mt-0.5 text-[11px] text-indigo-700">메모: {i.action}</p>}
                        <p className="mt-1 text-[11px] font-bold text-slate-600">
                          {i.issueDate}: 재고 {fmt(snap.stock)} · 주판매 {fmt(snap.w1)} → 지금: 재고 <b>{fmt(cur?.stock)}</b> · 최근1주 판매 <b>{fmt(cur?.w1)}</b>
                          {cur && Number.isFinite(snap.stock) && <ChangeTag before={snap} now={cur} />}
                        </p>
                        {i.dueDate && <p className={`mt-0.5 text-[10px] font-bold ${overdue ? "text-rose-600" : "text-slate-400"}`}>기한 {i.dueDate}{overdue ? " (지남)" : ""}</p>}
                      </div>
                      <button type="button" onClick={() => resolve(i.issueId)} className="whitespace-nowrap rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[11px] font-bold text-indigo-700">
                        완료
                      </button>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* ②③ TOP20 품절/품절임박/사이즈깨짐 */}
          <Section title="전사 TOP20 품번 — 품절·품절임박·사이즈깨짐" hint={`최근 2주 전사 판매 TOP20 중 이 매장에 문제가 있는 품번 ${inv.topIssues.length}개 (전사 순위 순)`}>
            {inv.topIssues.length === 0 ? (
              <Empty>TOP20 품번 모두 사이즈가 잘 갖춰져 있어요.</Empty>
            ) : (
              <div className="space-y-2">
                {inv.topIssues.map((it) => {
                  const label = `${it.styleCode} ${it.productName}`;
                  const content = it.notCarried
                    ? `전사 ${it.companyRank}위 품번인데 매장에 재고·판매 없음 (전사 2주 ${it.companyQty2w}장, 창고 ${it.warehouseStyle}장)`
                    : `전사 ${it.companyRank}위 · ${it.skus.map((x) => `${x.colorName || x.color} ${sizeLabel(x.size)} ${x.type}(재고${x.stock}${x.warehouse ? `·창고${x.warehouse}` : ""})`).join(", ")}`;
                  return (
                    <div key={it.styleCode} className="rounded-xl border border-slate-100 p-2.5">
                      <div className="flex items-start gap-2.5">
                        <ProductThumb styleCode={it.styleCode} size={44} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black text-slate-800">
                            <span className="mr-1 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white">전사 {it.companyRank}위</span>
                            {it.styleCode} <span className="font-semibold text-slate-500">{it.productName}</span>
                          </p>
                          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                            2주 판매: 매장 <b className="text-slate-700">{it.storeQty2w}</b> / 전사 매장평균 {fmt(it.companyAvgWeekly * 2)} · 매장재고 {it.storeStock} · 창고 {it.warehouseStyle}
                          </p>
                          {it.notCarried ? (
                            <p className="mt-1 inline-block rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-bold text-rose-700">매장에 없음 (재고·판매 0)</p>
                          ) : (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {it.skus.map((x) => (
                                <span key={`${x.color}${x.size}`} className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${x.type === "품절" ? "bg-rose-100 text-rose-700" : x.type === "품절임박" ? "bg-amber-100 text-amber-800" : "bg-violet-100 text-violet-700"}`}>
                                  {x.colorName || x.color} {sizeLabel(x.size)} {x.type} · 재고{x.stock}
                                  {x.weekly > 0 ? `·주${x.weekly}` : ""} · 창고{x.warehouse > 0 ? x.warehouse : "없음"}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <ActBtn done={actedTargets.has(it.styleCode)} onClick={() => openDraft({ block: "TOP20 품절·사이즈깨짐", target: it.styleCode, label, content })} />
                      </div>
                      {draft?.target === it.styleCode && draft.block === "TOP20 품절·사이즈깨짐" && <DraftForm form={form} setForm={setForm} onSave={saveAction} onCancel={() => setDraft(null)} saving={saving} content={draft.content} />}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* ④ 보충 */}
          <Section title="보충 대상 — 오래 품절된 인기 SKU" hint="재고 0 · 최근 2주 판매 0 · 누적판매 5장↑ (창고에 있거나 전사에서 아직 팔리는 것만)">
            {inv.boost.length === 0 ? (
              <Empty>보충 대상이 없어요{meta && !meta.pipUploadedAt ? "" : " (누적판매는 새벽 PIP 업로드부터 쌓여요)"}.</Empty>
            ) : (
              <div className="divide-y divide-slate-100">
                {inv.boost.map((b) => {
                  const target = `${b.styleCode}|${b.color}|${b.size}`;
                  const label = `${b.styleCode} ${b.colorName || b.color} ${sizeLabel(b.size)}`;
                  const content = `누적 ${b.cumQty}장 팔린 SKU가 품절 (전사 2주 ${b.companyQty2w}장, 창고 ${b.warehouse}장)`;
                  return (
                    <div key={target} className="py-1.5">
                      <div className="flex items-center gap-2">
                        <ProductThumb styleCode={b.styleCode} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-800">
                            {label} <span className="font-semibold text-slate-400">{b.productName}</span>
                          </p>
                          <p className="text-[11px] font-semibold text-slate-500">
                            누적판매 {b.cumQty} · 전사 2주 {b.companyQty2w} · 창고 <b className={b.warehouse > 0 ? "text-emerald-700" : "text-slate-400"}>{b.warehouse > 0 ? b.warehouse : "없음"}</b>
                          </p>
                        </div>
                        <ActBtn done={actedTargets.has(target)} onClick={() => openDraft({ block: "보충 대상", target, label, content })} />
                      </div>
                      {draft?.target === target && <DraftForm form={form} setForm={setForm} onSave={saveAction} onCancel={() => setDraft(null)} saving={saving} content={draft.content} />}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* ⑥ 신상품 반응 */}
          <Section title="신상품 반응 — 최근 3주" hint="최근 3주에 판매 시작한 품번(전사 누적판매의 85%↑가 최근 3주). 판매율 = 3주 판매 ÷ (판매+재고), 전사의 60% 미만·재고 3장↑이면 '저조'">
            {inv.newProducts.length === 0 ? (
              <Empty>최근 3주 신상품이 이 매장에 없어요.</Empty>
            ) : (
              <div className="divide-y divide-slate-100">
                {inv.newProducts.map((p) => {
                  const label = `${p.styleCode} ${p.productName}`;
                  const content = `신상품 판매율 ${p.storeSellThrough}% (전사 ${p.companySellThrough}%, ${p.carryingStores}개 매장 중 ${p.storeSTRank}위) · 판매 ${p.storeSold} / 재고 ${p.storeStock}`;
                  return (
                    <div key={p.styleCode} className="py-1.5">
                      <div className="flex items-center gap-2">
                        <ProductThumb styleCode={p.styleCode} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-800">
                            {p.low && <span className="mr-1 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] text-white">저조</span>}
                            {p.styleCode} <span className="font-semibold text-slate-400">{p.productName}</span>
                          </p>
                          <p className="text-[11px] font-semibold text-slate-500">
                            {p.firstSeen ? `입고 ${p.firstSeen}` : "3주 내 판매 시작"} · 판매 {p.storeSold} / 재고 {p.storeStock} · 판매율 <b className={p.low ? "text-rose-600" : "text-slate-700"}>{p.storeSellThrough}%</b> (전사 {p.companySellThrough}%, {p.carryingStores}개 매장 중 {p.storeSTRank}위)
                          </p>
                        </div>
                        <ActBtn done={actedTargets.has(p.styleCode)} onClick={() => openDraft({ block: "신상품 반응", target: p.styleCode, label, content })} />
                      </div>
                      {draft?.target === p.styleCode && draft.block === "신상품 반응" && <DraftForm form={form} setForm={setForm} onSave={saveAction} onCancel={() => setDraft(null)} saving={saving} content={draft.content} />}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {saveMsg && <p className="mt-2 text-xs font-bold text-emerald-600">{saveMsg}</p>}

          {resolvedActions.length > 0 && (
            <div className="mt-3">
              <button type="button" onClick={() => setShowResolved((v) => !v)} className="text-[11px] font-bold text-slate-400">
                {showResolved ? "▲" : "▼"} 완료한 재고 조치 {resolvedActions.length}건
              </button>
              {showResolved && (
                <div className="mt-1 space-y-1">
                  {resolvedActions.map((i) => {
                    const cur = currentOf(inv.skuMap, i.target || "");
                    return (
                      <p key={i.issueId} className="text-[11px] text-slate-500">
                        {i.issueDate}→{i.resolvedAt || "-"} · {i.actionType} · {i.snapshot?.label || i.target} · 당시 재고 {fmt(i.snapshot?.stock)}/주판매 {fmt(i.snapshot?.w1)} → 지금 재고 {fmt(cur?.stock)}/최근1주 {fmt(cur?.w1)}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="text-xs font-black text-slate-700">{title}</p>
      {hint && <p className="mb-2 text-[10px] font-semibold text-slate-400">{hint}</p>}
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-400">{children}</p>;
}

function Cmp({ label, mine, co, warn }: { label: string; mine: string; co: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${warn ? "bg-amber-50" : "bg-slate-50"}`}>
      <p className="text-[10px] font-bold text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-black ${warn ? "text-amber-700" : "text-slate-800"}`}>{mine}</p>
      <p className="text-[10px] font-semibold text-slate-400">{co}</p>
    </div>
  );
}

function ActBtn({ onClick, done }: { onClick: () => void; done?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-bold ${done ? "border border-indigo-200 bg-indigo-50 text-indigo-600" : "bg-slate-900 text-white"}`}>
      {done ? "조치 중 +" : "조치 남기기"}
    </button>
  );
}

function ChangeTag({ before, now }: { before: any; now: { stock: number; w1: number } }) {
  const ds = now.stock - Number(before.stock || 0);
  const dw = now.w1 - Number(before.w1 || 0);
  return (
    <span className="ml-1.5 text-[10px] font-black">
      <span className={ds >= 0 ? "text-blue-600" : "text-rose-600"}>재고 {ds >= 0 ? "+" : ""}{ds}</span>
      {" · "}
      <span className={dw >= 0 ? "text-blue-600" : "text-rose-600"}>판매 {dw >= 0 ? "+" : ""}{dw}</span>
    </span>
  );
}

function DraftForm({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  content,
}: {
  form: { actionType: string; memo: string; dueDate: string };
  setForm: (f: any) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  content: string;
}) {
  return (
    <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50/50 p-2.5">
      <p className="text-[11px] font-semibold text-indigo-900">{content}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {ACTION_TYPES.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setForm((f: any) => ({ ...f, actionType: a }))}
            className={`rounded-lg px-2 py-1 text-[11px] font-bold ${form.actionType === a ? "bg-indigo-600 text-white" : "border border-indigo-200 bg-white text-indigo-700"}`}
          >
            {a}
          </button>
        ))}
      </div>
      <textarea
        className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        rows={2}
        placeholder="피드백·조치 내용 (예: 입구 테이블로 이동, 점장님께 착장 요청)"
        value={form.memo}
        onChange={(e) => setForm((f: any) => ({ ...f, memo: e.target.value }))}
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <label className="text-[11px] font-bold text-slate-500">
          기한{" "}
          <input type="date" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" value={form.dueDate} onChange={(e) => setForm((f: any) => ({ ...f, dueDate: e.target.value }))} />
        </label>
        <button type="button" onClick={onSave} disabled={saving} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-50">
          {saving ? "저장 중..." : "저장"}
        </button>
        <button type="button" onClick={onCancel} className="text-[11px] font-bold text-slate-400">
          취소
        </button>
      </div>
    </div>
  );
}
