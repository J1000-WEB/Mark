"use client";

// MARK 2026-10-28: 매출탭 상단 고정 배너 — 자동갱신(새벽 4:00 · 오전 9:30) 상태.
//  9:30 전: [용인, 무신사 매출 업데이트 전 · 9:20 자동업데이트예정]
//  9:30 후 어제 용인 매출 없음: 용인 업데이트 확인필요!!!
//  용인 확인됨: 배너 없음(작은 완료 표시만)

import { useEffect, useState } from "react";

type Status = {
  ok: boolean;
  now: string;
  phase: "pending" | "missing" | "ok";
  missing?: string[];
  check: { checkDate: string; yongin: number; musinsa: number; yonginOk: boolean; musinsaOk?: boolean; musinsaSkipped?: boolean; musinsaMissingDates?: string[] };
  after930: { at: string; ok: boolean } | null;
  lastOk: { at: string; slot: string } | null;
  todayRuns: { at: string; slot: string; ok: boolean; error: string }[];
};

const won = (v: number) => `${Math.round(v / 1000).toLocaleString("ko-KR")}천원`;

type VerifyItem = { at: string; date: string; channel: string; name: string; uploadAmount: any; uploadQty: any; erpAmount: any; erpQty: any; sourceAmount: any; status: string; note: string };

// MARK 2026-11-20: 인샵(신라·용인·롯데·한컬렉션) 업로드 검증 결과(PC verify-inshop-upload.js 2:45·9:40) — 가장 최근 매출일
function InshopVerifyNotice({ refreshKey }: { refreshKey?: any }) {
  const [items, setItems] = useState<VerifyItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/inshop-verify", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (alive && j.ok) setItems(j.items || []); }).catch(() => {});
    return () => { alive = false; };
  }, [refreshKey]);
  if (!items || !items.length) return null;
  const date = items[0].date;
  const day = items.filter((x) => x.date === date);
  const bad = day.filter((x) => x.status !== "일치");
  const d = `${date.slice(4, 6)}/${date.slice(6, 8)}`;
  const n = (v: any) => (v === "" || v == null ? "-" : Number(v).toLocaleString("ko-KR"));
  const at = day.map((x) => String(x.at)).sort().pop() || "";
  if (!bad.length) {
    return <p className="mt-1 text-[11px] font-bold text-emerald-600">✓ 인샵 업로드 확인 {d} {day.map((x) => x.name).join("·")} — 원본·업로드·ERP 금액 일치 ({at.slice(5, 16)} 확인)</p>;
  }
  return (
    <div className="mt-2 rounded-2xl border-2 border-rose-400 bg-rose-50 px-4 py-2.5 shadow-sm">
      <p className="text-sm font-black text-rose-700">인샵 업로드 확인필요!!! ({d} {bad.map((x) => x.name).join("·")})</p>
      {bad.map((x) => (
        <p key={x.channel} className="mt-0.5 text-[11px] font-semibold text-rose-600">
          {x.name}({x.channel}) {x.status} · 원본 {n(x.sourceAmount)} · 업로드 {n(x.uploadAmount)}원/{n(x.uploadQty)}장 · ERP {n(x.erpAmount)}원/{n(x.erpQty)}장{x.note ? ` · ${x.note}` : ""}
        </p>
      ))}
      <p className="mt-0.5 text-[10px] font-semibold text-rose-500">{at.slice(5, 16)} 확인 · ERP에 다시 올린 뒤 9:40 검증에서 다시 확인돼요</p>
    </div>
  );
}

export default function SalesRefreshBanner(props: { refreshKey?: any; onReimport?: () => void; importing?: boolean }) {
  return (
    <>
      <RefreshStatusBanner {...props} />
      <InshopVerifyNotice refreshKey={props.refreshKey} />
    </>
  );
}

function RefreshStatusBanner({ refreshKey, onReimport, importing }: { refreshKey?: any; onReimport?: () => void; importing?: boolean }) {
  const [st, setSt] = useState<Status | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/sales-summary-refresh-status", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setSt(json);
    } catch {
      // 무시 — 배너만 안 뜸
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000); // 켜두면 9:30 지나고 자동으로 바뀜
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (refreshKey) load();
  }, [refreshKey]);

  if (!st) return null;
  const lastFail = st.todayRuns.find((r) => !r.ok);
  const lastLine = st.lastOk ? `마지막 자동갱신 ${st.lastOk.at}(${st.lastOk.slot})` : "자동갱신 기록 없음";

  if (st.phase === "pending") {
    return (
      <div className="sticky top-0 z-30 mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 shadow-sm">
        <p className="text-sm font-black text-amber-800">[용인, 무신사 매출 업데이트 전 · 9:20 자동업데이트예정]</p>
        <p className="mt-0.5 text-[11px] font-semibold text-amber-700">
          {st.check.checkDate} 용인·무신사 매출은 아직 반영 전일 수 있어요 · {lastLine}
        </p>
      </div>
    );
  }

  if (st.phase === "missing") {
    const miss = st.missing?.length ? st.missing : ["용인"];
    return (
      <div className="sticky top-0 z-30 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-rose-400 bg-rose-50 px-4 py-2.5 shadow-sm">
        <div>
          <p className="text-sm font-black text-rose-700">{miss.join("·")} 업데이트 확인필요!!!</p>
          <p className="mt-0.5 text-[11px] font-semibold text-rose-600">
            {st.after930 ? `9:20 갱신(${st.after930.at.slice(11)}) 후에도` : "9:20 자동갱신 기록이 없고,"} {st.check.checkDate} {miss.join("·")} 매출이 없어요{st.check.musinsaMissingDates?.length ? ` (무신사 빈 날짜: ${st.check.musinsaMissingDates.map((d) => d.slice(5)).join(", ")})` : ""} · 용인 {won(st.check.yongin)} · 무신사 {won(st.check.musinsa)}
            {lastFail && !st.after930 ? ` · 오류: ${lastFail.error.slice(0, 80)}` : ""}
          </p>
        </div>
        {onReimport && (
          <button type="button" onClick={onReimport} disabled={importing} className="whitespace-nowrap rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
            {importing ? "가져오는 중..." : "드라이브에서 다시 가져오기"}
          </button>
        )}
      </div>
    );
  }

  return (
    <p className="mt-3 text-[11px] font-bold text-emerald-600">
      ✓ {st.check.checkDate} 용인 {won(st.check.yongin)} · 무신사 {st.check.musinsaSkipped ? "(주말·공휴일 매출은 다음 근무일 아침에 반영)" : won(st.check.musinsa)} 반영됨 · {lastLine}
    </p>
  );
}
