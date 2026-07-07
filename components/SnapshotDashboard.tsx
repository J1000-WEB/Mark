"use client";

import { useEffect, useMemo, useState } from "react";
import NavTabs from "@/components/NavTabs";
import { Card, Empty, Kpi } from "@/components/Shared";
import { fmtNum, pct, won } from "@/lib/mark";

function text(v: any) {
  return String(v ?? "").trim();
}

function topStores(rows: any[], count = 10) {
  return [...(rows || [])]
    .filter((r) => r?.storeName && r.storeName !== "합계")
    .sort((a, b) => Number(b.weekSales || 0) - Number(a.weekSales || 0))
    .slice(0, count);
}

function badStores(rows: any[], count = 5) {
  return [...(rows || [])]
    .filter((r) => r?.storeName && r.storeName !== "합계")
    .sort((a, b) => Number(a.weekChangeRate || 0) - Number(b.weekChangeRate || 0))
    .slice(0, count);
}

function goodStores(rows: any[], count = 5) {
  return [...(rows || [])]
    .filter((r) => r?.storeName && r.storeName !== "합계")
    .sort((a, b) => Number(b.weekChangeRate || 0) - Number(a.weekChangeRate || 0))
    .slice(0, count);
}

function totalSales(rows: any[]) {
  return (rows || []).reduce((sum, row) => sum + Number(row.weekSales || 0), 0);
}

function SnapshotCard({ title, schedule }: { title: string; schedule: string }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <p className="text-sm font-black text-slate-900">{title}</p>
      <p className="mt-2 text-sm font-semibold text-slate-500">{schedule}</p>
    </div>
  );
}

function StoreTable({ title, rows, mode = "rank" }: { title: string; rows: any[]; mode?: "rank" | "good" | "bad" }) {
  return (
    <Card title={title}>
      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-2">
        {!rows?.length && <Empty />}
        {rows.map((row, idx) => {
          const change = Number(row.weekChangeRate || 0);
          const color = change >= 0 ? "text-blue-600" : "text-red-600";
          return (
            <div key={`${row.storeName}-${idx}`} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
              <div>
                <p className="text-xs font-bold text-slate-500">#{idx + 1}</p>
                <p className="font-black">{row.storeName}</p>
              </div>
              <div className="text-right">
                <p className="font-black">{won(row.weekSales || 0)}</p>
                <p className={`text-xs font-black ${color}`}>{change >= 0 ? "+" : ""}{pct(change)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ProductTable({ title, rows }: { title: string; rows: any[] }) {
  return (
    <Card title={title}>
      <div className="max-h-[520px] space-y-2 overflow-y-auto pr-2">
        {!rows?.length && <Empty />}
        {(rows || []).slice(0, 20).map((item, idx) => (
          <div key={`${item.styleCode}-${idx}`} className="rounded-2xl bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-500">#{idx + 1} · {item.styleCode}</p>
                <p className="mt-1 truncate font-black">{item.productName}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-black">{won(item.weekAmount || 0)}</p>
                <p className="text-xs font-bold text-slate-500">{fmtNum(item.weekNet || 0)}개</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SnapshotPreview({ payload, label }: { payload: any; label: string }) {
  const weekly = payload?.weekly || {};
  const rows = weekly.current || [];
  const total = totalSales(rows);
  const storeRanks = topStores(rows, 10);
  const good = goodStores(rows, 5);
  const bad = badStores(rows, 5);
  const products = weekly.companyTopProducts || [];
  const briefing = weekly.aiBriefing || [];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-slate-900 p-5 text-white shadow-sm">
        <p className="text-xs font-black text-slate-400">WEEKLY SNAPSHOT VIEW</p>
        <h2 className="mt-2 text-2xl font-black">{label || weekly.periodLabel || "주간 스냅샷"}</h2>
        <p className="mt-2 text-sm font-semibold text-slate-300">저장된 주간 데이터 기준으로 복원해서 보여줍니다.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Kpi title="주간 매출" value={won(total)} tone="green" />
        <Kpi title="점포 수" value={`${rows.length}개`} tone="blue" />
        <Kpi title="TOP 상품" value={`${products.length}개`} tone="orange" />
        <Kpi title="TOP10 집중도" value={pct(weekly.top10Concentration || 0)} tone="purple" />
      </section>

      {briefing.length ? (
        <Card title="저장 당시 AI 브리핑" tone="purple">
          <ul className="space-y-2 text-sm font-semibold leading-6 text-slate-700">
            {briefing.map((line: string, idx: number) => <li key={idx}>• {line}</li>)}
          </ul>
        </Card>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-3">
        <StoreTable title="매장별 주간 매출 순위 TOP10" rows={storeRanks} />
        <StoreTable title="호조 매장 TOP5" rows={good} mode="good" />
        <StoreTable title="부진 매장 TOP5" rows={bad} mode="bad" />
      </section>

      <ProductTable title="전사 TOP 상품" rows={products} />
    </div>
  );
}

export default function SnapshotDashboard() {
  const [currentData, setCurrentData] = useState<any>(null);
  const [dataStatus, setDataStatus] = useState("불러오는 중");
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedSnapshot, setSelectedSnapshot] = useState<any>(null);
  const [memo, setMemo] = useState("");
  const [dailyDate, setDailyDate] = useState("");
  const [dailyStatus, setDailyStatus] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [migrateStatus, setMigrateStatus] = useState("");
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [migrateResult, setMigrateResult] = useState<any>(null);

  async function loadCurrentData() {
    setDataStatus("구글시트 데이터 불러오는 중");
    try {
      const res = await fetch("/api/data", { cache: "no-store" });
      const json = await res.json();
      setCurrentData(json);
      setDataStatus(json.source === "google-sheet" ? "구글시트 실시간 데이터" : "내장 데이터");
    } catch {
      setDataStatus("현재 데이터를 불러오지 못했습니다.");
    }
  }

  async function loadSnapshots() {
    const res = await fetch("/api/weekly-snapshots", { cache: "no-store" });
    const json = await res.json();
    setSnapshots(json.snapshots || []);
  }

  async function loadSnapshot(id: string) {
    setSelectedId(id);
    if (!id) {
      setSelectedSnapshot(null);
      return;
    }
    setStatus("스냅샷 불러오는 중...");
    try {
      const res = await fetch(`/api/weekly-snapshots?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = await res.json();
      setSelectedSnapshot(json.snapshot || null);
      setStatus(json.snapshot ? "스냅샷을 불러왔습니다." : "스냅샷을 찾지 못했습니다.");
    } catch (error: any) {
      setStatus(error?.message || "스냅샷을 불러오지 못했습니다.");
    }
  }

  async function saveWeeklySnapshot() {
    if (!currentData?.weekly) {
      setStatus("저장할 현재 주간 데이터가 없습니다.");
      return;
    }

    setLoading(true);
    setStatus("주간 스냅샷 저장 중...");

    const payload = {
      savedAt: new Date().toISOString(),
      weekly: currentData.weekly,
      inventory: {
        rtSuggestions: currentData.inventory?.rtSuggestions || [],
        allocationSuggestions: currentData.inventory?.allocationSuggestions || [],
        stockoutRisk: currentData.inventory?.stockoutRisk || [],
        overstockRisk: currentData.inventory?.overstockRisk || [],
      },
    };

    try {
      const res = await fetch("/api/weekly-snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          periodLabel: currentData.weekly?.periodLabel || "",
          memo,
          payload,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "스냅샷 저장 실패");
      setStatus(`저장 완료: ${json.snapshotId}`);
      setMemo("");
      await loadSnapshots();
      await loadSnapshot(json.snapshotId);
    } catch (error: any) {
      setStatus(error?.message || "스냅샷 저장 실패");
    } finally {
      setLoading(false);
    }
  }


  async function saveDailySalesSnapshot() {
    if (!dailyDate) {
      setDailyStatus("저장할 일자를 선택해주세요.");
      return;
    }

    setDailyLoading(true);
    setDailyStatus(`${dailyDate} 일간 스냅샷 저장 중...`);

    try {
      const res = await fetch("/api/auto-daily-sales-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ date: dailyDate }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "일간 스냅샷 저장 실패");
      setDailyStatus(`저장 완료: ${json.snapshotDate} / 신규 ${json.savedRows}행 / 중복 ${json.skippedRows}행`);
    } catch (error: any) {
      setDailyStatus(error?.message || "일간 스냅샷 저장 실패");
    } finally {
      setDailyLoading(false);
    }
  }

  async function runDailyHistoryMigration(confirm: boolean) {
    setMigrateLoading(true);
    setMigrateStatus(confirm ? "실제 변환 저장 중..." : "미리보기 확인 중...");
    try {
      const res = await fetch(`/api/migrate-daily-history${confirm ? "?confirm=1" : ""}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "마이그레이션 실패");
      setMigrateResult(json);
      setMigrateStatus(json.message || (confirm ? "변환 완료" : "미리보기 완료"));
    } catch (error: any) {
      setMigrateStatus(error?.message || "마이그레이션 실패");
    } finally {
      setMigrateLoading(false);
    }
  }

  useEffect(() => {
    loadCurrentData();
    loadSnapshots();

    const now = new Date();
    const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const y = kst.getFullYear();
    const m = String(kst.getMonth() + 1).padStart(2, "0");
    const d = String(kst.getDate()).padStart(2, "0");
    setDailyDate(`${y}-${m}-${d}`);
  }, []);

  const previewPayload = selectedSnapshot?.payload || null;
  const previewLabel = selectedSnapshot
    ? `${selectedSnapshot.periodLabel || "주간 스냅샷"} · ${selectedSnapshot.createdAt || ""}`
    : "";

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">스냅샷 센터</h1>
            <p className="mt-1 text-sm text-slate-500">주간 대시보드를 저장하고, 다음주에도 다시 불러와 볼 수 있습니다.</p>
            <p className="mt-1 text-xs font-semibold text-blue-600">{dataStatus}</p>
          </div>
          <NavTabs active="snapshot" />
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <SnapshotCard title="일간 스냅샷" schedule="매일 12:30 자동 저장 / 수동 저장 가능" />
          <SnapshotCard title="주간 스냅샷" schedule="월요일 13:00 저장 / 수동 저장 가능" />
          <SnapshotCard title="RT 성과" schedule="Promotion_Performance와 Daily_Sales_History 기준" />
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-500">Daily Sales History</p>
              <h2 className="mt-1 text-2xl font-black">일간 스냅샷 수동 저장</h2>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                MARK_DB의 스타일별 채널별 입고/판매/재고현황을 읽어 Daily_Sales_History에 저장합니다.
                과거 데이터를 하나씩 불러온 뒤 해당 날짜로 저장할 때 사용합니다.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="date"
                value={dailyDate}
                onChange={(e) => setDailyDate(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"
              />
              <button
                type="button"
                onClick={saveDailySalesSnapshot}
                disabled={dailyLoading}
                className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {dailyLoading ? "저장 중..." : "일간 스냅샷 저장"}
              </button>
            </div>
          </div>
          {dailyStatus ? (
            <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm font-black text-blue-700">{dailyStatus}</div>
          ) : null}
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-500">Daily Sales History</p>
              <h2 className="mt-1 text-2xl font-black">압축(JSON) 저장 형식 마이그레이션</h2>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                날짜+점포마다 여러 줄로 쌓이던 것을 날짜+점포당 한 줄(JSON)로 압축합니다.
                먼저 <b>미리보기</b>로 줄어드는 규모를 확인한 뒤, <b>실제 변환</b>을 눌러주세요.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => runDailyHistoryMigration(false)}
                disabled={migrateLoading}
                className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-700 disabled:opacity-50"
              >
                {migrateLoading ? "확인 중..." : "미리보기"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!confirm("Daily_Sales_History 시트를 압축(JSON) 형식으로 실제 변환합니다. 계속할까요?")) return;
                  runDailyHistoryMigration(true);
                }}
                disabled={migrateLoading}
                className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {migrateLoading ? "변환 중..." : "실제 변환 실행"}
              </button>
            </div>
          </div>
          {migrateStatus ? (
            <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-black text-emerald-700">{migrateStatus}</div>
          ) : null}
          {migrateResult?.before ? (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi title="변환 전 줄 수" value={`${fmtNum(migrateResult.before.rows)}줄`} tone="plain" />
              <Kpi title="변환 후 줄 수" value={`${fmtNum(migrateResult.after.rows)}줄`} tone="blue" />
              <Kpi title="변환 전 셀 수(추정)" value={`${fmtNum(migrateResult.before.approxCells)}칸`} tone="plain" />
              <Kpi title="줄어든 비율" value={`${migrateResult.reductionRate}%`} tone="green" />
            </div>
          ) : null}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <section className="rounded-3xl bg-slate-900 p-5 text-white shadow-sm">
            <p className="text-sm font-bold text-slate-300">Weekly Snapshot Engine</p>
            <h2 className="mt-1 text-2xl font-black">현재 주간 대시보드 저장</h2>
            <p className="mt-2 text-sm font-semibold text-slate-300">
              현재 `/api/data`의 weekly 객체를 MARK_HISTORY의 Weekly_Snapshot 시트에 JSON으로 저장합니다.
            </p>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모 예: 6월 4주차 RT 시작 전 기준 / 주간 보고 완료본"
              className="mt-4 h-24 w-full rounded-2xl border border-white/10 bg-white/10 p-3 text-sm font-semibold text-white outline-none placeholder:text-slate-400"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveWeeklySnapshot}
                disabled={loading}
                className="rounded-2xl bg-white px-6 py-4 text-sm font-black text-slate-900 disabled:opacity-50"
              >
                {loading ? "저장 중..." : "📸 현재 주간 스냅샷 저장"}
              </button>
              <button
                type="button"
                onClick={() => { loadCurrentData(); loadSnapshots(); }}
                className="rounded-2xl border border-white/20 px-6 py-4 text-sm font-black text-white"
              >
                새로고침
              </button>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black">저장된 주간 스냅샷</h2>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{snapshots.length}건</span>
            </div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-2">
              {snapshots.length === 0 && <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">저장된 주간 스냅샷이 없습니다.</div>}
              {snapshots.map((row) => (
                <button
                  key={row.snapshotId}
                  type="button"
                  onClick={() => loadSnapshot(row.snapshotId)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedId === row.snapshotId ? "border-slate-900 bg-slate-900 text-white" : "border-slate-100 bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <p className={`text-xs font-bold ${selectedId === row.snapshotId ? "text-slate-300" : "text-slate-500"}`}>{row.createdAt}</p>
                  <p className="mt-1 font-black">{row.periodLabel || row.snapshotId}</p>
                  {row.memo ? <p className={`mt-1 text-xs font-semibold ${selectedId === row.snapshotId ? "text-slate-300" : "text-slate-500"}`}>{row.memo}</p> : null}
                </button>
              ))}
            </div>
          </section>
        </section>

        {status ? (
          <section className="rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm font-black text-blue-700">
            {status}
          </section>
        ) : null}

        {previewPayload ? (
          <SnapshotPreview payload={previewPayload} label={previewLabel} />
        ) : (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
            <p className="text-xl font-black text-slate-700">스냅샷을 선택하면 저장 당시 주간 대시보드를 복원해서 보여줍니다.</p>
            <p className="mt-2 text-sm font-semibold text-slate-500">현재 데이터는 계속 바뀌어도 저장된 스냅샷은 유지됩니다.</p>
          </section>
        )}
      </div>
    </main>
  );
}
