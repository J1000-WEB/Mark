"use client";

import { useState, useCallback } from "react";
import NavTabs from "@/components/NavTabs";
import { Card } from "@/components/Shared";

const CHANNEL_LABEL: Record<string, string> = {
  musinsa: "무신사",
  hancollection: "한컬렉션",
  duty_free: "면세",
};

function detectChannelFromFilename(filename: string): "musinsa" | "hancollection" | "duty_free" | null {
  if (filename.startsWith("pos_purchase_settlement")) return "musinsa";
  if (filename.startsWith("매출일보")) return "hancollection";
  if (filename.startsWith("매출재고조회")) return "duty_free";
  return null;
}

export default function ConsignmentUploadDashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dutyFreeDate, setDutyFreeDate] = useState("");
  const [needsDatePrompt, setNeedsDatePrompt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const detectedChannel = file ? detectChannelFromFilename(file.name) : null;

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || !files.length) return;
    setFile(files[0]);
    setResult(null);
    setError("");
    setNeedsDatePrompt(false);
  }, []);

  async function runUpload() {
    if (!file) return;
    const channel = detectChannelFromFilename(file.name);

    if (channel === "duty_free" && !dutyFreeDate) {
      setNeedsDatePrompt(true);
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (channel === "duty_free") form.append("date", dutyFreeDate);

      const res = await fetch("/api/consignment-upload", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));

      if (!res.ok || !body?.ok) {
        if (body?.needsDate) {
          setNeedsDatePrompt(true);
        } else {
          setError(body?.error || "업로드 처리에 실패했습니다.");
        }
        return;
      }
      setResult(body);
    } catch (e: any) {
      setError(e?.message || "업로드 처리에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">인샵매출업로드</h1>
            <p className="mt-1 text-sm text-slate-500">무신사 / 한컬렉션 / 면세 EDI 원본 파일을 올리면 자동으로 가공해서 UPLOAD 시트에 쌓아요.</p>
          </div>
          <NavTabs active="inventory" />
        </header>

        <Card title="① 파일 업로드" tone="white">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition ${dragOver ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-slate-50"}`}
          >
            <p className="text-sm font-bold text-slate-600">여기로 엑셀 파일을 드래그하거나</p>
            <label className="mt-3 cursor-pointer rounded-full bg-slate-900 px-5 py-2 text-sm font-black text-white hover:bg-slate-700">
              파일 선택
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>

            {file && (
              <div className="mt-5 w-full max-w-md rounded-2xl bg-white p-4 text-left shadow-sm">
                <p className="truncate text-sm font-black text-slate-800">{file.name}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  인식된 채널: {detectedChannel ? (
                    <span className="text-blue-600">{CHANNEL_LABEL[detectedChannel]}</span>
                  ) : (
                    <span className="text-red-600">알 수 없음 (파일명 확인 필요)</span>
                  )}
                </p>
              </div>
            )}
          </div>
        </Card>

        {(detectedChannel === "duty_free" || needsDatePrompt) && (
          <Card title="② 날짜 지정 (면세 전용)" tone="yellow">
            <p className="mb-3 text-xs font-semibold text-slate-600">면세 파일은 안에 날짜 정보가 없어서, 이 파일이 어느 날짜 매출인지 직접 지정해야 해요.</p>
            <input
              type="date"
              value={dutyFreeDate ? `${dutyFreeDate.slice(0, 4)}-${dutyFreeDate.slice(4, 6)}-${dutyFreeDate.slice(6, 8)}` : ""}
              onChange={(e) => { setDutyFreeDate(e.target.value.replace(/-/g, "")); setNeedsDatePrompt(false); }}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold"
            />
            {needsDatePrompt && !dutyFreeDate && (
              <p className="mt-2 text-xs font-black text-red-600">⚠ 날짜를 먼저 지정해주세요.</p>
            )}
          </Card>
        )}

        <div className="flex justify-center">
          <button
            type="button"
            onClick={runUpload}
            disabled={!file || loading}
            className="rounded-full bg-blue-600 px-8 py-3 text-base font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "처리 중..." : "업로드해서 자동화 실행"}
          </button>
        </div>

        {error && (
          <Card title="오류" tone="white">
            <p className="text-sm font-bold text-red-600">{error}</p>
          </Card>
        )}

        {result && (
          <Card title="✅ 처리 완료" tone="white">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-500">채널</p>
                <p className="mt-1 text-lg font-black">{CHANNEL_LABEL[result.channel] || result.channel}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-500">변환된 행</p>
                <p className="mt-1 text-lg font-black">{result.parsedRows}건</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-500">저장 위치</p>
                <p className="mt-1 text-lg font-black">{result.writtenRange || "-"}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="text-xs font-bold text-amber-700">확인 필요(품번 의심)</p>
                <p className="mt-1 text-lg font-black text-amber-700">{result.flaggedCount || 0}건</p>
              </div>
            </div>

            {result.flaggedCount > 0 && (
              <div className="mt-4 rounded-2xl bg-amber-50 p-4">
                <p className="text-xs font-black text-amber-800">아래 바코드는 15자 이상이라 품번코드가 잘못됐을 수 있어요 (UPLOAD 시트에도 노란색으로 표시해뒀어요):</p>
                <ul className="mt-2 space-y-1 text-xs font-semibold text-amber-700">
                  {result.flaggedItems.map((it: any, i: number) => (
                    <li key={i}>• {it.barcode} — {it.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.warnings?.length > 0 && (
              <div className="mt-4 rounded-2xl bg-rose-50 p-4">
                <p className="text-xs font-black text-rose-700">참고할 경고</p>
                <ul className="mt-2 space-y-1 text-xs font-semibold text-rose-600">
                  {result.warnings.map((w: string, i: number) => <li key={i}>• {w}</li>)}
                </ul>
              </div>
            )}
          </Card>
        )}

        <Card title="처리 규칙 요약" tone="beige">
          <ul className="space-y-2 text-xs font-semibold leading-6 text-slate-600">
            <li>• 무신사(pos_purchase_settlement_*): 매장명으로 채널코드 조회, 바코드/수량/단가는 원본 그대로</li>
            <li>• 한컬렉션(매출일보_*): 채널코드 고정, 바코드는 밑줄(_) 뒤 제거, 15자 이상이면 노란색 표시</li>
            <li>• 면세(매출재고조회_*): 날짜 직접 지정, 수량 0인 행 제외, 단가 0이면 10원 처리, 수량 1이 아니면 1개 단위로 분할</li>
          </ul>
        </Card>
      </div>
    </main>
  );
}
