"use client";

import { useEffect, useMemo, useState } from "react";
import NavTabs from "@/components/NavTabs";
import RoundingInventoryPanel from "@/components/RoundingInventoryPanel";
import {
  ROUNDING_CHECKLIST,
  ROUNDING_CATEGORIES,
  ROUNDING_CATEGORY_MAX,
  computeRoundingScore,
  type RoundingCategory,
  type RoundingChecklistState,
} from "@/lib/roundingChecklist";

function won(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

function pct(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(0)}%`;
}

function growthPct(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  const v = (n * 100).toFixed(1);
  return `${n >= 0 ? "+" : ""}${v}%`;
}

function growthColor(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "text-slate-400";
  return n >= 0 ? "text-blue-600" : "text-rose-600";
}

function todayDateKey() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function gradeColor(grade: string) {
  if (grade === "A" || grade === "B") return "bg-emerald-100 text-emerald-700";
  if (grade === "C" || grade === "D") return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

// MARK 2026-10-12: 사진을 원본 그대로 올리면 Vercel 요청 본문 한도(~4.5MB)에 걸릴 수 있어서,
// 올리기 전에 브라우저 Canvas로 먼저 리사이즈(최대 1600px)/압축(JPEG 78%)합니다.
function resizeImageFile(file: File, maxDim = 1600, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          } else {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("이 브라우저에서는 사진 압축을 지원하지 않아요."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("사진을 읽지 못했어요."));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("사진을 읽지 못했어요."));
    reader.readAsDataURL(file);
  });
}

interface StoreListItem {
  storeName: string;
  region: string;
  lastVisitDate: string;
  lastGrade: string;
  lastTotalScore: number | null;
}

interface AutoFill {
  storeName: string;
  region: string;
  weekStart: string;
  weekEnd: string;
  periodTarget: number;
  periodActual: number;
  achievementRate: number | null;
  prevWeekAmount: number;
  prevPrevWeekAmount: number;
  wowGrowthRate: number | null;
  receiptCount: number;
  avgReceiptAmount: number | null;
  totalStockQty: number;
  totalStockAmount: number;
  monthlyAchievementRate: number | null;
}

interface VisitRecord {
  visitId: string;
  visitDate: string;
  storeName: string;
  totalScore: number;
  grade: string;
  scoreByCategory: Record<RoundingCategory, number>;
  achievementRate: number | null;
  createdAt: string;
}

interface IssueRecord {
  issueId: string;
  issueDate: string;
  storeName: string;
  area: string;
  item: string;
  content: string;
  action: string;
  status: "미해결" | "해결";
  repeatCount?: number;
  isRepeat?: boolean;
}

interface PhotoDraft {
  fileId: string;
  previewUrl: string;
  uploading: boolean;
}

const COMMENT_PLACEHOLDER: Record<RoundingCategory, string> = {
  인사관리: "예) 스케줄 공유 지연, CS 응대 태도 등",
  매장관리: "예) 청소/진열/VMD 상태 등",
  매출관리: "예) 판매 분석·계획, 레이아웃 등",
  재고관리: "예) 창고 정리, B품/RT 처리 등",
};

export default function RoundingDashboard() {
  const [stores, setStores] = useState<StoreListItem[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [selectedStore, setSelectedStore] = useState("");
  const [visitDate, setVisitDate] = useState(todayDateKey());
  const [visitedBy, setVisitedBy] = useState("소천");

  const [autoFill, setAutoFill] = useState<AutoFill | null>(null);
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const [history, setHistory] = useState<VisitRecord[]>([]);
  const [openIssues, setOpenIssues] = useState<IssueRecord[]>([]);

  const [checklist, setChecklist] = useState<RoundingChecklistState>({});
  const [comments, setComments] = useState<Record<RoundingCategory, string>>({
    인사관리: "",
    매장관리: "",
    매출관리: "",
    재고관리: "",
  });
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const [newIssue, setNewIssue] = useState({ area: "인사관리" as RoundingCategory, item: "", content: "", action: "" });
  const [issueSaving, setIssueSaving] = useState(false);
  const [issueError, setIssueError] = useState("");

  useEffect(() => {
    loadStores();
  }, []);

  async function loadStores() {
    setStoresLoading(true);
    try {
      const res = await fetch("/api/rounding/stores", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setStores(json.stores || []);
    } catch {
      // 조용히 무시 — 아직 매출탭 데이터가 없는 초기 상태일 수 있음
    } finally {
      setStoresLoading(false);
    }
  }

  async function selectStore(storeName: string) {
    setSelectedStore(storeName);
    setChecklist({});
    setComments({ 인사관리: "", 매장관리: "", 매출관리: "", 재고관리: "" });
    setPhotos([]);
    setSaveMessage("");
    setSaveError("");
    if (!storeName) {
      setAutoFill(null);
      setHistory([]);
      setOpenIssues([]);
      return;
    }
    setAutoFillLoading(true);
    try {
      const [autoRes, historyRes, issuesRes] = await Promise.all([
        fetch(`/api/rounding/stores?store=${encodeURIComponent(storeName)}`, { cache: "no-store" }),
        fetch(`/api/rounding/visits?store=${encodeURIComponent(storeName)}`, { cache: "no-store" }),
        fetch(`/api/rounding/issues?store=${encodeURIComponent(storeName)}&status=미해결`, { cache: "no-store" }),
      ]);
      const autoJson = await autoRes.json();
      const historyJson = await historyRes.json();
      const issuesJson = await issuesRes.json();
      setAutoFill(autoJson.ok ? autoJson.autoFill : null);
      setHistory(historyJson.ok ? historyJson.visits || [] : []);
      setOpenIssues(issuesJson.ok ? issuesJson.issues || [] : []);
    } catch {
      setAutoFill(null);
    } finally {
      setAutoFillLoading(false);
    }
  }

  async function reloadOpenIssues() {
    if (!selectedStore) return;
    try {
      const res = await fetch(`/api/rounding/issues?store=${encodeURIComponent(selectedStore)}&status=미해결`, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setOpenIssues(json.issues || []);
    } catch {
      // 무시
    }
  }

  function setCheck(key: string, value: "O" | "X" | "") {
    setChecklist((prev) => ({ ...prev, [key]: prev[key] === value ? "" : value }));
  }

  const liveScore = useMemo(() => computeRoundingScore(checklist), [checklist]);
  const lastVisit = history[0];

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length || !selectedStore) return;

    for (const file of files) {
      const draftIndex = photos.length;
      setPhotos((prev) => [...prev, { fileId: "", previewUrl: "", uploading: true }]);
      try {
        const dataUrl = await resizeImageFile(file);
        const res = await fetch("/api/rounding/photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataBase64: dataUrl, mimeType: "image/jpeg", storeName: selectedStore }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "업로드 실패");
        setPhotos((prev) => prev.map((p, i) => (i === draftIndex ? { fileId: json.fileId, previewUrl: dataUrl, uploading: false } : p)));
      } catch (err: any) {
        setPhotos((prev) => prev.filter((_, i) => i !== draftIndex));
        setSaveError(err?.message || "사진 업로드 실패");
      }
    }
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveVisit() {
    if (!selectedStore || !autoFill) return;
    setSaving(true);
    setSaveMessage("");
    setSaveError("");
    try {
      const res = await fetch("/api/rounding/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName: selectedStore,
          visitDate,
          visitedBy,
          autoFill: {
            region: autoFill.region,
            periodTarget: autoFill.periodTarget,
            periodActual: autoFill.periodActual,
            achievementRate: autoFill.achievementRate,
            prevWeekAmount: autoFill.prevWeekAmount,
            prevPrevWeekAmount: autoFill.prevPrevWeekAmount,
            wowGrowthRate: autoFill.wowGrowthRate,
            receiptCount: autoFill.receiptCount,
            avgReceiptAmount: autoFill.avgReceiptAmount,
            totalStockQty: autoFill.totalStockQty,
            totalStockAmount: autoFill.totalStockAmount,
          },
          checklist,
          comments,
          photos: photos.filter((p) => p.fileId).map((p) => p.fileId),
          author: visitedBy,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "저장 실패");
      setSaveMessage(`저장했어요! 총점 ${json.visit.totalScore}점 (${json.visit.grade}등급)`);
      setChecklist({});
      setComments({ 인사관리: "", 매장관리: "", 매출관리: "", 재고관리: "" });
      setPhotos([]);
      await selectStore(selectedStore);
      await loadStores();
    } catch (err: any) {
      setSaveError(err?.message || "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function addIssue() {
    if (!selectedStore || !newIssue.item.trim() || !newIssue.content.trim()) {
      setIssueError("항목과 지적내용은 꼭 입력해주세요.");
      return;
    }
    setIssueSaving(true);
    setIssueError("");
    try {
      const res = await fetch("/api/rounding/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeName: selectedStore, ...newIssue }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "저장 실패");
      setNewIssue({ area: "인사관리", item: "", content: "", action: "" });
      await selectStore(selectedStore);
    } catch (err: any) {
      setIssueError(err?.message || "저장 실패");
    } finally {
      setIssueSaving(false);
    }
  }

  async function resolveIssue(issueId: string) {
    try {
      await fetch("/api/rounding/issues", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId, status: "해결" }),
      });
      setOpenIssues((prev) => prev.filter((i) => i.issueId !== issueId));
    } catch {
      // 조용히 무시 — 목록이 다음 새로고침에 맞게 반영됨
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <div className="mx-auto max-w-[1200px] px-4 pt-6">
        <NavTabs active="rounding" />

        <div className="mt-6">
          <p className="text-xs font-black text-slate-400">STORE ROUNDING</p>
          <h1 className="mt-1 text-xl font-black text-slate-900">라운딩 (매장 방문)</h1>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            매출·목표·재고는 자동으로 불러와요 — 체크리스트(O/X)와 코멘트·사진만 입력하면 됩니다.
          </p>
        </div>

        {/* 매장 선택 */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500">매장</label>
              <select
                className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                value={selectedStore}
                onChange={(e) => selectStore(e.target.value)}
              >
                <option value="">매장을 선택하세요</option>
                {stores.map((s) => (
                  <option key={s.storeName} value={s.storeName}>
                    {s.storeName} {s.lastVisitDate ? `· 최근방문 ${s.lastVisitDate}` : "· 방문기록 없음"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500">방문일</label>
              <input
                type="date"
                className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500">담당 SV</label>
              <input
                type="text"
                className="mt-1 w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                value={visitedBy}
                onChange={(e) => setVisitedBy(e.target.value)}
              />
            </div>
            {storesLoading && <p className="text-xs font-semibold text-slate-400">매장 목록 불러오는 중...</p>}
          </div>
        </div>

        {!selectedStore && (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-semibold text-slate-400">
            매장을 선택하면 매출·목표·재고 숫자가 자동으로 채워져요.
          </div>
        )}

        {selectedStore && autoFillLoading && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-400">
            불러오는 중...
          </div>
        )}

        {selectedStore && !autoFillLoading && autoFill && (
          <>
            {/* 자동입력 숫자 */}
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black text-slate-400">자동입력 · {autoFill.region || "지역 미확인"}</p>
                {/* MARK 2026-10-28: 매장별 라운딩 보고서 엑셀(최근 방문 기준, 방문기록 없으면 오늘 숫자로) */}
                <a
                  href={`/api/rounding/report?store=${encodeURIComponent(selectedStore)}`}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-black text-white"
                >
                  📄 라운딩 보고서 엑셀{lastVisit ? ` (${lastVisit.visitDate})` : ""}
                </a>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="금주 목표" value={won(autoFill.periodTarget)} />
                <Stat label="금주 실적" value={won(autoFill.periodActual)} />
                <Stat label="금주 달성율" value={pct(autoFill.achievementRate)} />
                <Stat label="이번달 달성율(참고)" value={pct(autoFill.monthlyAchievementRate)} />
                <Stat label="전주 매출" value={won(autoFill.prevWeekAmount)} />
                <Stat label="전전주 매출" value={won(autoFill.prevPrevWeekAmount)} />
                <Stat
                  label="전주比 신장률"
                  value={growthPct(autoFill.wowGrowthRate)}
                  valueClassName={growthColor(autoFill.wowGrowthRate)}
                />
                <Stat label="금주 객수 · 객단가" value={`${autoFill.receiptCount.toLocaleString("ko-KR")}건 · ${won(autoFill.avgReceiptAmount)}`} />
                <Stat label="총 재고수량" value={`${autoFill.totalStockQty.toLocaleString("ko-KR")}개`} />
                <Stat label="총 재고금액" value={won(autoFill.totalStockAmount)} />
              </div>
              {lastVisit && (
                <p className="mt-3 text-[11px] font-bold text-slate-400">
                  직전 방문: {lastVisit.visitDate} · 총점 {lastVisit.totalScore}점({lastVisit.grade}등급)
                  {" · "}
                  이번 체크 대비{" "}
                  <span className={liveScore.totalScore - lastVisit.totalScore >= 0 ? "text-blue-600" : "text-rose-600"}>
                    {liveScore.totalScore - lastVisit.totalScore >= 0 ? "+" : ""}
                    {liveScore.totalScore - lastVisit.totalScore}점
                  </span>
                </p>
              )}
            </div>

            {/* MARK 2026-10-28: 재고 점검(전사 비교 + 조치 남기기) */}
            <RoundingInventoryPanel storeName={selectedStore} onIssuesChanged={reloadOpenIssues} />

            {/* 체크리스트 */}
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-slate-400">체크리스트 (O/X 24개)</p>
                <div className={`rounded-xl px-3 py-1.5 text-sm font-black ${gradeColor(liveScore.grade)}`}>
                  {liveScore.totalScore}점 · {liveScore.grade}등급
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {ROUNDING_CATEGORIES.map((cat) => (
                  <div key={cat} className="rounded-xl border border-slate-100 p-3">
                    <p className="text-xs font-black text-slate-600">
                      {cat} <span className="text-slate-400">({liveScore.byCategory[cat]}/{ROUNDING_CATEGORY_MAX[cat]}점)</span>
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {ROUNDING_CHECKLIST.filter((item) => item.category === cat).map((item) => (
                        <div key={item.key} className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-600">
                            {item.label} <span className="text-slate-400">({item.weight}점)</span>
                          </span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => setCheck(item.key, "O")}
                              className={`h-7 w-7 rounded-lg text-xs font-black ${
                                checklist[item.key] === "O" ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-400"
                              }`}
                            >
                              O
                            </button>
                            <button
                              type="button"
                              onClick={() => setCheck(item.key, "X")}
                              className={`h-7 w-7 rounded-lg text-xs font-black ${
                                checklist[item.key] === "X" ? "bg-rose-600 text-white" : "border border-slate-200 text-slate-400"
                              }`}
                            >
                              X
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <textarea
                      className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      rows={2}
                      placeholder={COMMENT_PLACEHOLDER[cat]}
                      value={comments[cat]}
                      onChange={(e) => setComments((prev) => ({ ...prev, [cat]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 사진 */}
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-black text-slate-400">사진</p>
              <input type="file" accept="image/*" multiple capture="environment" onChange={handlePhotoChange} className="mt-2 text-xs" />
              {photos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {photos.map((p, idx) => (
                    <div key={idx} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200">
                      {p.uploading ? (
                        <div className="flex h-full items-center justify-center text-[10px] font-bold text-slate-400">업로드중...</div>
                      ) : (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removePhoto(idx)}
                            className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] font-black text-white"
                          >
                            ×
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 저장 */}
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={saveVisit}
                disabled={saving}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50"
              >
                {saving ? "저장 중..." : "방문기록 저장"}
              </button>
              {saveMessage && <p className="text-sm font-bold text-emerald-600">{saveMessage}</p>}
              {saveError && <p className="text-sm font-bold text-rose-600">{saveError}</p>}
            </div>

            {/* 지적사항 */}
            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-black text-slate-400">지적사항</p>

              {openIssues.length > 0 && (
                <div className="mt-3 space-y-2">
                  {openIssues.map((issue) => (
                    <div key={issue.issueId} className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <div>
                        <p className="text-xs font-black text-amber-800">
                          {issue.area} · {issue.item}
                          {issue.isRepeat && <span className="ml-2 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] text-white">반복 {issue.repeatCount}회</span>}
                        </p>
                        <p className="mt-1 text-xs text-amber-900">{issue.content}</p>
                        {issue.action && <p className="mt-1 text-[11px] text-amber-700">조치: {issue.action}</p>}
                        <p className="mt-1 text-[10px] text-amber-500">{issue.issueDate}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => resolveIssue(issue.issueId)}
                        className="whitespace-nowrap rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-700"
                      >
                        해결 완료
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <select
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                  value={newIssue.area}
                  onChange={(e) => setNewIssue((prev) => ({ ...prev, area: e.target.value as RoundingCategory }))}
                >
                  {ROUNDING_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="항목 (예: 청소, VMD, CS 등)"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={newIssue.item}
                  onChange={(e) => setNewIssue((prev) => ({ ...prev, item: e.target.value }))}
                />
                <textarea
                  placeholder="지적 내용"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:col-span-2"
                  rows={2}
                  value={newIssue.content}
                  onChange={(e) => setNewIssue((prev) => ({ ...prev, content: e.target.value }))}
                />
                <input
                  type="text"
                  placeholder="조치/피드백 (선택)"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:col-span-2"
                  value={newIssue.action}
                  onChange={(e) => setNewIssue((prev) => ({ ...prev, action: e.target.value }))}
                />
              </div>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={addIssue}
                  disabled={issueSaving}
                  className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
                >
                  {issueSaving ? "저장 중..." : "지적사항 추가"}
                </button>
                {issueError && <p className="text-xs font-bold text-rose-600">{issueError}</p>}
              </div>
            </div>

            {/* 방문 이력 */}
            {history.length > 0 && (
              <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-black text-slate-400">방문 이력</p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="px-2 py-1 text-left">방문일</th>
                        <th className="px-2 py-1 text-right">총점</th>
                        <th className="px-2 py-1 text-right">등급</th>
                        <th className="px-2 py-1 text-right">인사</th>
                        <th className="px-2 py-1 text-right">매장</th>
                        <th className="px-2 py-1 text-right">매출</th>
                        <th className="px-2 py-1 text-right">재고</th>
                        <th className="px-2 py-1 text-right">목표달성율</th>
                        <th className="px-2 py-1 text-right">보고서</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((v) => (
                        <tr key={v.visitId} className="border-t border-slate-100">
                          <td className="px-2 py-1.5 font-semibold">{v.visitDate}</td>
                          <td className="px-2 py-1.5 text-right font-bold">{v.totalScore}</td>
                          <td className="px-2 py-1.5 text-right">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${gradeColor(v.grade)}`}>{v.grade}</span>
                          </td>
                          <td className="px-2 py-1.5 text-right">{v.scoreByCategory?.인사관리 ?? "-"}</td>
                          <td className="px-2 py-1.5 text-right">{v.scoreByCategory?.매장관리 ?? "-"}</td>
                          <td className="px-2 py-1.5 text-right">{v.scoreByCategory?.매출관리 ?? "-"}</td>
                          <td className="px-2 py-1.5 text-right">{v.scoreByCategory?.재고관리 ?? "-"}</td>
                          <td className="px-2 py-1.5 text-right">{pct(v.achievementRate)}</td>
                          <td className="px-2 py-1.5 text-right">
                            <a href={`/api/rounding/report?store=${encodeURIComponent(selectedStore)}&visitId=${encodeURIComponent(v.visitId)}`} className="font-bold text-emerald-700 underline">
                              엑셀
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-bold text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-black text-slate-800 ${valueClassName || ""}`}>{value}</p>
    </div>
  );
}
