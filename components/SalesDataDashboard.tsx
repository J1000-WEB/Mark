"use client";

import { useEffect, useState } from "react";
import NavTabs from "@/components/NavTabs";
import ProductThumb from "@/components/ProductThumb";
import {
  findLatestWeekSheetName,
  parseWeeklyStyleRows,
  computeSizeCoverageByStyle,
  buildSuggestions,
  buildPriceSuggestions,
  type WeeklyStyleRow,
  type Suggestion,
  type PriceSuggestion,
} from "@/lib/salesDataSuggestions";

function won(n: number) {
  return `${Math.round(n || 0).toLocaleString("ko-KR")}원`;
}

const TYPE_STYLE: Record<Suggestion["type"], { label: string; bg: string; text: string; border: string }> = {
  추가이관: { label: "📈 추가 이관/생산", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  프로모션: { label: "🏷️ 프로모션 검토", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  추가투입: { label: "📦 매장 추가투입", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  단종검토: { label: "⚠️ 단종/소진 검토", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  이월소진: { label: "🗂️ 이월상품 소진", bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" },
};

const TYPE_ORDER: Suggestion["type"][] = ["추가이관", "추가투입", "프로모션", "이월소진", "단종검토"];

export default function SalesDataDashboard() {
  const [weeklyFile, setWeeklyFile] = useState<File | null>(null);
  const [pipFile, setPipFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const [weekLabel, setWeekLabel] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [styles, setStyles] = useState<WeeklyStyleRow[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [priceSuggestions, setPriceSuggestions] = useState<PriceSuggestion[]>([]);
  const [activeType, setActiveType] = useState<Suggestion["type"] | "가격제안" | "전체">("전체");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/sales-data-weekly", { cache: "no-store" });
      const data = await res.json();
      if (data.ok && data.data) {
        setWeekLabel(data.data.weekLabel);
        setSavedAt(data.data.savedAt);
        setStyles(data.data.styles || []);
        setSuggestions(data.data.suggestions || []);
        setPriceSuggestions(data.data.priceSuggestions || []);
      }
    } catch {
      // 조용히 무시 — 처음 쓰는 경우 데이터가 없을 수 있음
    } finally {
      setLoading(false);
    }
  }

  async function runUpload() {
    if (!weeklyFile) return;
    setUploading(true);
    setError("");
    try {
      const XLSX = await import("xlsx");

      setProgress("주간판매데이터 파일 읽는 중...");
      const buf = await weeklyFile.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      const sheetName = findLatestWeekSheetName(wb.SheetNames, "품번");
      if (!sheetName) throw new Error('시트 이름 중에 "MM.DD~MM.DD(품번)" 형식을 찾지 못했어요.');
      const sheet = wb.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
      const parsedStyles = parseWeeklyStyleRows(rows);
      if (!parsedStyles.length) throw new Error("품번 데이터를 하나도 못 찾았어요. 파일 형식을 확인해주세요.");

      let sizeCoverageMap = null as ReturnType<typeof computeSizeCoverageByStyle> | null;
      if (pipFile) {
        setProgress("PIP 파일에서 사이즈별 재고 읽는 중...");
        const pipBuf = await pipFile.arrayBuffer();
        const pipWb = XLSX.read(new Uint8Array(pipBuf), { type: "array" });
        const pipSheet = pipWb.Sheets[pipWb.SheetNames[0]];
        const pipRows: any[][] = XLSX.utils.sheet_to_json(pipSheet, { header: 1, raw: true, defval: "" });
        sizeCoverageMap = computeSizeCoverageByStyle(pipRows);
      }

      setProgress("제안 계산 중...");
      const newSuggestions = buildSuggestions(parsedStyles);
      const newPriceSuggestions = buildPriceSuggestions(parsedStyles, sizeCoverageMap);

      setProgress("저장 중...");
      const saveRes = await fetch("/api/sales-data-weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekLabel: sheetName, styles: parsedStyles, suggestions: newSuggestions, priceSuggestions: newPriceSuggestions }),
      });
      const saveData = await saveRes.json();
      if (!saveData.ok) throw new Error(saveData.error || "저장 실패");

      setProgress(`완료! ${sheetName} 기준, 품번 ${parsedStyles.length}개 · 제안 ${newSuggestions.length}건`);
      await load();
    } catch (e: any) {
      setError(e?.message || "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  const filteredSuggestions = activeType === "전체" || activeType === "가격제안" ? suggestions : suggestions.filter((s) => s.type === activeType);
  const countsByType = TYPE_ORDER.reduce((acc, t) => {
    acc[t] = suggestions.filter((s) => s.type === t).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <NavTabs active="sales-data" />

        <div className="mt-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">판매데이터 제안</h1>
            <p className="mt-1 text-sm text-slate-500">주간판매데이터 파일을 올리면, 재고컨트롤 제안(RT/이관/프로모션)처럼 자동으로 액션을 제안해드려요.</p>
          </div>
        </div>

        {/* 업로드 박스 */}
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500">1. 주간판매데이터 업로드 (필수) — 가장 최신 주차(품번) 시트를 자동으로 찾아서 씁니다</p>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setWeeklyFile(e.target.files?.[0] || null)}
            className="mt-2 block w-full text-sm"
          />
          <p className="mt-4 text-xs font-bold text-slate-500">2. PIP업데이트 파일 (선택) — 있으면 사이즈 완성도를 반영해서 가격제안이 더 정확해져요</p>
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setPipFile(e.target.files?.[0] || null)} className="mt-2 block w-full text-sm" />

          <button
            onClick={runUpload}
            disabled={uploading || !weeklyFile}
            className="mt-4 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-40"
          >
            {uploading ? "처리 중..." : "업로드 & 제안 생성"}
          </button>
          {progress && <p className="mt-2 text-xs font-bold text-blue-600">{progress}</p>}
          {error && <p className="mt-2 text-xs font-black text-red-600">⚠ {error}</p>}
        </div>

        {loading ? (
          <div className="mt-10 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : !styles.length ? (
          <div className="mt-10 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            아직 업로드된 데이터가 없어요. 위에서 파일을 올려주세요.
          </div>
        ) : (
          <>
            <div className="mt-6 flex items-center justify-between rounded-2xl bg-slate-800 px-5 py-3 text-white">
              <div className="text-sm font-bold">{weekLabel} 기준</div>
              <div className="text-xs text-slate-300">품번 {styles.length}개 · 마지막 갱신 {savedAt}</div>
            </div>

            {/* 유형별 탭 */}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setActiveType("전체")}
                className={`rounded-full px-4 py-2 text-xs font-bold ${activeType === "전체" ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
              >
                전체 ({suggestions.length})
              </button>
              {TYPE_ORDER.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveType(t)}
                  className={`rounded-full px-4 py-2 text-xs font-bold ${activeType === t ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
                >
                  {TYPE_STYLE[t].label} ({countsByType[t] || 0})
                </button>
              ))}
              <button
                onClick={() => setActiveType("가격제안")}
                className={`rounded-full px-4 py-2 text-xs font-bold ${activeType === "가격제안" ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
              >
                💰 가격제안 ({priceSuggestions.length})
              </button>
            </div>

            {/* 제안 카드 목록 */}
            {activeType === "가격제안" ? (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {priceSuggestions.map((p, i) => (
                  <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <ProductThumb styleCode={p.styleCode} size={48} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-slate-900">
                          {p.styleCode} <span className="font-normal text-slate-400">{p.productName}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          현재가 {won(p.currentPrice)} → 제안가 <span className="font-bold text-rose-600">{won(p.suggestedPrice)}</span> (
                          {(p.suggestedDiscountRate * 100).toFixed(0)}% 할인)
                        </div>
                        <div className="mt-1 text-xs text-slate-500">원가율 {(p.costRatio * 100).toFixed(0)}%</div>
                        <div className="mt-2 text-xs leading-relaxed text-slate-600">{p.reason}</div>
                      </div>
                    </div>
                  </div>
                ))}
                {!priceSuggestions.length && <div className="col-span-2 py-10 text-center text-sm text-slate-400">가격제안 대상이 없어요.</div>}
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {filteredSuggestions.map((s, i) => {
                  const style = TYPE_STYLE[s.type];
                  return (
                    <div key={i} className={`rounded-2xl border ${style.border} ${style.bg} p-4 shadow-sm`}>
                      <div className="flex items-start gap-3">
                        <ProductThumb styleCode={s.styleCode} size={48} />
                        <div className="min-w-0 flex-1">
                          <div className={`text-[11px] font-bold ${style.text}`}>{style.label}</div>
                          <div className="mt-0.5 text-sm font-bold text-slate-900">
                            {s.styleCode} <span className="font-normal text-slate-400">{s.productName}</span>
                          </div>
                          <div className="mt-1 text-xs leading-relaxed text-slate-600">{s.reason}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!filteredSuggestions.length && <div className="col-span-2 py-10 text-center text-sm text-slate-400">해당 유형의 제안이 없어요.</div>}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
