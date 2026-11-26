"use client";

// MARK 2026-11-19: 재고CTRL "출고·RT" — 재고MD님 출고·RT 제안기(아티팩트)를 옮긴 화면. 계산은 서버(/api/ship-rt, lib/shipRtEngine.ts).
// 파일 업로드 없음: 매장 재고·누계 = PIP, 7일 판매 = Daily_Sales_History, 물류 가용(오프)·바코드 = ERP 자동 조회, 금일 지시분 = RT_지시이력.
// 설정은 MARK_DB "출고RT_설정"에 저장(재고MD님과 같이 씀). 매장요청건은 붙여넣기(엑셀에서 복사 가능).
import { useEffect, useMemo, useState } from "react";
import StorePicker from "./StorePicker";

type Cfg = any;
const fmt = (n: any) => (typeof n === "number" ? n.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : n ?? "");

const LABELS: Record<string, string> = {
  style: "스타일", color: "칼라", size: "사이즈", storeCode: "채널코드", storeName: "매장명", shortage: "부족수량", availOff: "물류가용(오프)",
  qty: "수량", barcode: "바코드", reason: "사유", grade: "등급", cum: "누계판매", target: "목표", period: "7일판매", stock: "현재고",
  issuedQty: "금일지시차감", stockWeeks: "재고주수", properStock: "적정재고", diff: "재고차이", status: "상태", shipQty: "출고", rtNeed: "RT필요",
  exportStoreCode: "보낼코드", exportStoreName: "보낼매장", exportGrade: "보낼등급", exportStock: "보낼재고", exportExcess: "과잉량", matchType: "매칭",
  importStoreCode: "받을코드", importStoreName: "받을매장", needQty: "필요", importStock: "받을재고", importWeeks: "받을재고주수", allocQty: "배정",
  splitNote: "분산", need: "요청", unmatched: "미충족", note: "비고", inbound: "받음", outbound: "보냄", statusChange: "상태변화",
  receivingStores: "보내는 곳", projStock: "예상재고", projStockWeeks: "예상주수", projStatus: "예상상태",
};

const TABS: { key: string; label: string; upload?: "ship" | "rt"; desc: string; group?: "ship" | "rt" }[] = [
  { key: "chulgoUpload", group: "ship", label: "출고업로드", upload: "ship", desc: "품절임박·보충 매장에 물류 가용(오프)에서 보내는 출고 — ERP 출고 업로드 양식" },
  { key: "rtUpload", group: "rt", label: "RT업로드", upload: "rt", desc: "창고로 못 채운 부족분을 과잉 매장에서 RT(주간판매 TOP 품번만) — ERP RT 업로드 양식" },
  { key: "bonusShipUpload", group: "ship", label: "보충 출고", upload: "ship", desc: "완전 품절(7일판매0·재고0·누계5↑) 등급별 A4/B3/C2 보충 — 출고" },
  { key: "bonusRtUpload", group: "rt", label: "보충 RT", upload: "rt", desc: "보충제안 중 창고로 못 채운 것 — RT" },
  { key: "relaunchFallbackShipUpload", group: "ship", label: "재런칭 출고", upload: "ship", desc: "신품번 부족분을 구품번 창고 재고로" },
  { key: "relaunchFallbackRtUpload", group: "rt", label: "재런칭 RT", upload: "rt", desc: "신품번 부족분을 구품번 과잉 매장에서" },
  { key: "requestShipUpload", group: "ship", label: "매장요청 출고", upload: "ship", desc: "매장요청건 — 창고에서" },
  { key: "requestRtUpload", group: "rt", label: "매장요청 RT", upload: "rt", desc: "매장요청건 — 창고로 못 채운 건 과잉 매장에서" },
  { key: "requestNoMatch", group: "ship", label: "매장요청 미충족", desc: "못 채운 매장요청(입고)과 이유" },
  { key: "requestOutRtUpload", group: "rt", label: "매장반출 RT", upload: "rt", desc: "매장요청건(반출) — 그 SKU가 모자란 매장 → 이 품번 잘 팔리는 매장 순으로 RT" },
  { key: "requestOutDetail", group: "rt", label: "매장반출 상세", desc: "반출 RT를 어디로 왜 보내는지(받는 매장 예상재고·재고주수)" },
  { key: "requestOutReturn", group: "rt", label: "매장반출 창고반품", desc: "받을 만한 매장이 없어 창고 반품을 권하는 수량" },
  { key: "requestOutNoMatch", group: "rt", label: "매장반출 확인필요", desc: "그 매장에 재고가 없거나 매장코드가 목록에 없는 반출 요청" },
  { key: "chulgoRows", group: "ship", label: "출고 상세", desc: "출고 배분 근거" },
  { key: "idongDetail", group: "rt", label: "RT 상세", desc: "RT 매칭 근거(매칭없음 포함)" },
  { key: "relaunchFallbackDetail", group: "rt", label: "재런칭 상세", desc: "재런칭 구품번 보충 근거" },
  { key: "projRows", label: "이동후 예상재고", desc: "이 제안을 다 반영했을 때 매장×SKU 재고·상태 변화(변화 있는 줄만)" },
  { key: "analysisRows", label: "재고분석", desc: "매장×SKU 중 부족·출고·RT가 걸린 줄" },
];

function parseRequests(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\t|,/).map((x) => x.trim()))
    .filter((p) => p.length >= 5 && /\d/.test(p[0]) && Number(p[4]) > 0)
    .map((p) => ({ storeCode: p[0], style: p[1], color: p[2], size: p[3], qty: Number(p[4]), note: p[5] || "" }));
}

// 2026-11-26: 매장요청건(반출) — 매장코드, 스타일, 칼라(비우면 전체), 사이즈(비우면 전체), 수량(비우면 그 재고 전부), 비고
function parseOutRequests(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\t|,/).map((x) => x.trim()))
    .filter((p) => p.length >= 2 && /\d/.test(p[0]) && p[1])
    .map((p) => ({ storeCode: p[0], style: p[1], color: p[2] || "", size: p[3] || "", qty: Number(p[4]) || 0, note: p[5] || "" }));
}

// MARK 2026-11-20: 출고 / RT 나눠 보기 + 매장 고르기(출고 기본 신사·성수, RT 기본 전체)
const SHIP_DEFAULT = ["21011", "21030"]; // 신사 플래그십, 성수 플래그십
const recvOf = (r: any) => String(r.받을채널코드 ?? r.importStoreCode ?? r.채널 ?? r.storeCode ?? "");
const sendOf = (r: any) => String(r.보낼채널코드 ?? r.exportStoreCode ?? "");

const list = (s: string) => s.split(/[\n,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);

export default function ShipRtPanel() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [showCfg, setShowCfg] = useState(false);
  const [reqText, setReqText] = useState("");
  const [outText, setOutText] = useState("");
  const [shipRound, setShipRound] = useState("");
  const [running, setRunning] = useState(false);
  const [sec, setSec] = useState(0);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<any>(null);
  const [tab, setTab] = useState("chulgoUpload");
  const [msg, setMsg] = useState("");
  const [mode, setMode] = useState<"ship" | "rt">("ship");
  const [shipPick, setShipPick] = useState<string[]>(SHIP_DEFAULT);
  const [rtPick, setRtPick] = useState<string[]>([]);
  const [rtDir, setRtDir] = useState<"both" | "in" | "out">("both");

  useEffect(() => {
    fetch("/api/ship-rt", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (j.ok) { setCfg(j.config); setSavedAt(j.savedAt); }
    }).catch(() => {});
    try {
      setShipRound(localStorage.getItem("shipRound") || "");
      const sp = localStorage.getItem("shipPick");
      if (sp) setShipPick(JSON.parse(sp));
      const rp = localStorage.getItem("rtPick");
      if (rp) setRtPick(JSON.parse(rp));
      setReqText(localStorage.getItem("shipRtRequests") || "");
      setOutText(localStorage.getItem("shipRtOutRequests") || "");
    } catch {}
  }, []);
  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const id = setInterval(() => setSec(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);

  const requests = useMemo(() => parseRequests(reqText), [reqText]);
  const outRequests = useMemo(() => parseOutRequests(outText), [outText]);

  async function run() {
    setRunning(true);
    setErr("");
    try {
      try { localStorage.setItem("shipRound", shipRound); localStorage.setItem("shipRtRequests", reqText); localStorage.setItem("shipRtOutRequests", outText); } catch {}
      const r = await fetch("/api/ship-rt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run", requests, outRequests, config: { ...(cfg || {}), shipRound } }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "계산 실패");
      setRes(j);
    } catch (e: any) {
      setErr(e?.message || "계산 실패");
    } finally {
      setRunning(false);
    }
  }

  async function saveCfg() {
    if (!cfg) return;
    if (!window.confirm("이 설정을 MARK_DB에 저장할까요? (재고MD님 화면에도 같은 값이 적용돼요)")) return;
    const r = await fetch("/api/ship-rt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "config", config: cfg }) });
    const j = await r.json();
    if (j.ok) { setSavedAt(j.savedAt); setMsg(`설정 저장 ${j.savedAt}`); } else setMsg(j.error || "저장 실패");
  }

  const pickFor = (m: "ship" | "rt") => (m === "ship" ? shipPick : rtPick);
  const savePick = (m: "ship" | "rt", v: string[]) => {
    (m === "ship" ? setShipPick : setRtPick)(v);
    try { localStorage.setItem(m === "ship" ? "shipPick" : "rtPick", JSON.stringify(v)); } catch {}
  };
  // 고른 매장 기준으로 줄 거르기 — 출고: 받는 매장 / RT: 받는 매장·보내는 매장(방향 선택)
  function filtered(key: string): any[] {
    const rows: any[] = res?.[key] || [];
    const g = TABS.find((t) => t.key === key)?.group || mode;
    const pick = pickFor(g);
    if (!pick.length) return rows;
    const set = new Set(pick);
    if (g === "ship") return rows.filter((r) => set.has(recvOf(r)));
    return rows.filter((r) => {
      const i = set.has(recvOf(r));
      const o = set.has(sendOf(r));
      return rtDir === "in" ? i : rtDir === "out" ? o : i || o;
    });
  }
  const sumQty = (rows: any[]) => rows.reduce((a, r) => a + Number(r.의뢰수량 ?? r.지시수량 ?? r.qty ?? 0), 0);

  async function download(keys: string[], filename: string) {
    if (!res) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    for (const k of keys) {
      const rows: any[] = filtered(k);
      const def = TABS.find((t) => t.key === k)!;
      const cols = rows.length ? Object.keys(rows[0]) : [];
      const header = def.upload ? cols : cols.map((c) => LABELS[c] || c);
      const aoa = [header, ...rows.map((r) => cols.map((c) => r[c] ?? ""))];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), def.label.slice(0, 28));
    }
    XLSX.writeFile(wb, filename);
  }
  const stamp = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");

  const set = (k: string, v: any) => setCfg((c: Cfg) => ({ ...c, [k]: v }));
  const cur = TABS.find((t) => t.key === tab)!;
  const switchMode = (m: "ship" | "rt") => { setMode(m); setTab(m === "ship" ? "chulgoUpload" : "rtUpload"); };
  const modeTabs = TABS.filter((t) => t.group === mode || !t.group);
  const rows: any[] = res ? filtered(tab) : [];
  const cols = rows.length ? Object.keys(rows[0]) : [];

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">📦 출고·RT 제안</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            품절임박·보충 매장 → 물류 가용(오프) 출고 → 남는 부족분은 과잉 매장 RT(여러 매장 분산, 보내는 매장 재고−2장·A등급 최대 5장) → 재런칭 구품번 보충.
            재고MD님 출고·RT 제안기와 같은 계산이고, 파일은 안 올려도 돼요.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-500">
            출고차수{" "}
            <input value={shipRound} onChange={(e) => setShipRound(e.target.value)} placeholder="예: 1" className="ml-1 h-9 w-16 rounded-lg border border-slate-300 px-2 text-sm" />
          </label>
          <button type="button" onClick={run} disabled={running || !cfg} className="h-9 rounded-full bg-slate-900 px-5 text-sm font-black text-white disabled:opacity-50">
            {running ? `계산 중... ${sec}초` : "▶ 분석 실행"}
          </button>
        </div>
      </div>

      <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-black text-slate-700">🙋 매장요청건(입고) {requests.length ? `(${requests.length}건)` : ""}</summary>
        <p className="mt-2 text-[11px] font-semibold text-slate-500">한 줄에 하나: 매장코드, 스타일, 칼라, 사이즈, 수량, 비고(선택) — 쉼표나 엑셀에서 복사한 탭 모두 돼요. 창고에서 먼저, 모자라면 과잉 매장 RT로 채워요.</p>
        <textarea value={reqText} onChange={(e) => setReqText(e.target.value)} rows={4} placeholder={"21030,GF7LKC501,BK,L,3,고객요청"} className="mt-2 w-full rounded-xl border border-slate-300 p-2 font-mono text-xs" />
      </details>

      <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-black text-slate-700">📤 매장요청건(반출) {outRequests.length ? `(${outRequests.length}건)` : ""}</summary>
        <p className="mt-2 text-[11px] font-semibold text-slate-500">
          매장이 빼고 싶은 품번 — 한 줄에 하나: 매장코드, 스타일, 칼라, 사이즈, 수량, 비고. 칼라·사이즈를 비우면 그 품번 전부, 수량을 비우면 그 재고 전부예요.
          위 출고·RT를 다 반영한 예상 재고 기준으로 ① 그 SKU가 적정재고보다 모자란 매장(많이 모자란 순) ② 이 품번이 최근 잘 팔리는데 그 사이즈가 1장 이하인 매장(2장씩) 순으로 RT를 만들고, 남으면 창고 반품을 권해요. 결과는 🔁 RT 화면에 있어요.
        </p>
        <textarea value={outText} onChange={(e) => setOutText(e.target.value)} rows={4} placeholder={"21011,GF3LKP505,,,,매장 정체\n21030,GF7LKC501,BK,XL,2"} className="mt-2 w-full rounded-xl border border-slate-300 p-2 font-mono text-xs" />
      </details>

      <details open={showCfg} onToggle={(e) => setShowCfg((e.target as HTMLDetailsElement).open)} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-black text-slate-700">⚙ 기준값·매장·예외 설정 {savedAt ? <span className="text-[11px] font-semibold text-slate-400">(저장 {savedAt})</span> : <span className="text-[11px] font-semibold text-slate-400">(기본값)</span>}</summary>
        {cfg && (
          <div className="mt-3 space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {[
                ["defaultWeeks", "기본 적정재고주수"], ["defaultExcess", "기본 과잉판정(주≥)"], ["soldoutTh", "품절임박(주≤)"], ["periodDays", "기간판매 일수"],
                ["minStock", "판매0일 때 최소잔여"], ["topN", "RT 대상 주간판매 TOP N"], ["rtMaxSuppliers", "품번당 RT 매칭 매장 수"],
                ["bigNeedThreshold", "대량 보충 기준수량"], ["bigNeedMaxSuppliers", "대량 보충 분산 매장 수"],
              ].map(([k, label]) => (
                <label key={k} className="font-bold text-slate-500">
                  {label}
                  <input type="number" step="0.1" value={cfg[k]} onChange={(e) => set(k, Number(e.target.value))} className="mt-1 h-8 w-full rounded-lg border border-slate-300 px-2 text-sm text-slate-900" />
                </label>
              ))}
            </div>
            <div>
              <p className="font-black text-slate-600">등급별 (적정재고주수 / 과잉판정 ≥)</p>
              <div className="mt-1 flex flex-wrap gap-3">
                {["A", "B", "C", "D"].map((g) => (
                  <div key={g} className="flex items-center gap-1">
                    <b className="w-4">{g}</b>
                    <input type="number" step="0.1" value={cfg.grades?.[g]?.weeks ?? ""} onChange={(e) => set("grades", { ...cfg.grades, [g]: { ...cfg.grades[g], weeks: Number(e.target.value) } })} className="h-8 w-16 rounded-lg border border-slate-300 px-2" />
                    <input type="number" step="0.1" value={cfg.grades?.[g]?.excess ?? ""} onChange={(e) => set("grades", { ...cfg.grades, [g]: { ...cfg.grades[g], excess: Number(e.target.value) } })} className="h-8 w-16 rounded-lg border border-slate-300 px-2" />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <label className="font-bold text-slate-500">
                매장 (코드,매장명,등급,순위 — 한 줄에 하나)
                <textarea
                  rows={6}
                  defaultValue={(cfg.stores || []).map((s: any) => `${s.code},${s.name},${s.grade},${s.rank}`).join("\n")}
                  onBlur={(e) => set("stores", e.target.value.split("\n").map((l) => l.split(",").map((x) => x.trim())).filter((p) => p.length >= 4 && p[0]).map((p) => ({ code: p[0], name: p[1], grade: p[2], rank: Number(p[3]) || 99 })))}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2 font-mono text-[11px] text-slate-900"
                />
              </label>
              <div className="space-y-2">
                <label className="block font-bold text-slate-500">
                  매장별 적정재고주수 예외 (코드,주수)
                  <textarea rows={2} defaultValue={Object.entries(cfg.storeWeeksOverride || {}).map(([k, v]) => `${k},${v}`).join("\n")}
                    onBlur={(e) => set("storeWeeksOverride", Object.fromEntries(e.target.value.split("\n").map((l) => l.split(",").map((x) => x.trim())).filter((p) => p[0] && !isNaN(Number(p[1]))).map((p) => [p[0], Number(p[1])])))}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2 font-mono text-[11px] text-slate-900" />
                </label>
                <label className="block font-bold text-slate-500">
                  매장별 RT 제외 품번 (코드,품번,품번,...)
                  <textarea rows={2} defaultValue={Object.entries(cfg.storeStyleExclude || {}).map(([k, v]: any) => `${k},${v.join(",")}`).join("\n")}
                    onBlur={(e) => set("storeStyleExclude", Object.fromEntries(e.target.value.split("\n").map((l) => l.split(",").map((x) => x.trim()).filter(Boolean)).filter((p) => p.length >= 2).map((p) => [p[0], p.slice(1).map((x) => x.toUpperCase())])))}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2 font-mono text-[11px] text-slate-900" />
                </label>
              </div>
              <label className="font-bold text-slate-500">
                오늘 출고·RT 받을 매장만 (매장코드, 비우면 전체 — 다른 매장도 과잉재고는 내줄 수 있음)
                <textarea rows={2} defaultValue={(cfg.shipStoreFilter || []).join("\n")} onBlur={(e) => set("shipStoreFilter", list(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-300 p-2 font-mono text-[11px] text-slate-900" />
              </label>
              <label className="font-bold text-slate-500">
                이 품번만 처리 (비우면 평소 기준: 재런칭·GF3/4/7/8 출고, 주간 TOP N RT)
                <textarea rows={2} defaultValue={(cfg.specificStyles || []).join("\n")} onBlur={(e) => set("specificStyles", list(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-300 p-2 font-mono text-[11px] text-slate-900" />
              </label>
            </div>
            <label className="flex items-center gap-2 font-bold text-slate-600">
              <input type="checkbox" checked={!!cfg.bestAuto} onChange={(e) => set("bestAuto", e.target.checked)} />
              RT 대상 주간 BEST 순위를 7일 판매 합으로 자동 계산(끄면 아래 수동 목록)
            </label>
            {!cfg.bestAuto && (
              <textarea rows={3} defaultValue={(cfg.bestList || []).join("\n")} onBlur={(e) => set("bestList", list(e.target.value))} className="w-full rounded-xl border border-slate-300 p-2 font-mono text-[11px]" />
            )}
            <p className="text-[11px] font-semibold text-slate-400">재런칭 신·구품번 짝은 상품_기준표(상품 탭과 같은 목록)를 써요.</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={saveCfg} className="h-8 rounded-full bg-slate-900 px-4 text-xs font-black text-white">설정 저장(MARK_DB)</button>
              <button type="button" onClick={() => fetch("/api/ship-rt").then((r) => r.json()).then((j) => j.ok && setCfg(j.config))} className="h-8 rounded-full border border-slate-300 bg-white px-4 text-xs font-black text-slate-600">저장된 값으로 되돌리기</button>
              {msg && <span className="text-xs font-bold text-blue-600">{msg}</span>}
            </div>
          </div>
        )}
      </details>

      {err && <div className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{err}</div>}
      {running && <div className="rounded-2xl bg-blue-50 p-3 text-xs font-bold text-blue-700">PIP 매장 재고 + 최근 7일 판매 + 물류 가용을 읽어 계산 중이에요(보통 30초~1분).</div>}

      {res && (
        <>
          <div className="rounded-2xl bg-slate-50 p-3 text-[11px] font-semibold leading-5 text-slate-500">
            기준: 7일 판매 {res.inputs.period} · 매장 재고 PIP {res.inputs.pip.uploadedAt} · 물류 가용 {res.inputs.warehouse.uploadedAt}
            {" · "}오늘 지시분 차감 {res.inputs.issuedToday.lines}줄 {fmt(res.inputs.issuedToday.qty)}장(RT_지시이력 {res.inputs.issuedToday.coverTo || "-"}까지)
            {" · "}재런칭 짝 {res.inputs.relaunchPairs}개 · 계산 {Math.round(res.computeMs / 1000)}초
            {res.inputs.unmatchedStores?.length > 0 && <span className="block text-amber-600">설정 매장 목록에 없는 매장(계산 제외): {res.inputs.unmatchedStores.slice(0, 8).join(", ")}</span>}
          </div>
          <div className="flex gap-2">
            {([["ship", "🚚 출고"], ["rt", "🔁 RT"]] as const).map(([m, l]) => (
              <button key={m} type="button" onClick={() => switchMode(m)} className={`h-10 flex-1 rounded-2xl text-sm font-black sm:flex-none sm:px-8 ${mode === m ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{l}</button>
            ))}
          </div>
          <div className="space-y-2 rounded-2xl bg-slate-50 p-3">
            <StorePicker
              label={mode === "ship" ? "받는 매장" : "매장"}
              stores={[...(cfg?.stores || [])].sort((a: any, b: any) => a.rank - b.rank).map((s: any) => ({ code: String(s.code), name: s.name, grade: s.grade }))}
              value={pickFor(mode)}
              onChange={(v) => savePick(mode, v)}
              presets={mode === "ship" ? [{ label: "신사·성수", codes: SHIP_DEFAULT }] : []}
            />
            {mode === "rt" && rtPick.length > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                고른 매장이
                {([["both", "받거나 보내는 것"], ["in", "받는 것만"], ["out", "보내는 것만"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setRtDir(k)} className={`rounded-full px-2.5 py-0.5 ${rtDir === k ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-600"}`}>{l}</button>
                ))}
              </div>
            )}
            <p className="text-[11px] font-semibold text-slate-400">계산은 전체 매장 기준으로 한 번 하고, 화면·엑셀만 고른 매장으로 걸러요. 이동후 예상재고·재고분석도 같은 매장으로 걸려요.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(mode === "ship"
              ? [
                  ["품절임박(전체 매장)", res.statusCounts["품절임박"], "text-rose-600"], ["보충(전체 매장)", res.statusCounts["보충"], "text-amber-600"],
                  ["출고", `${filtered("chulgoUpload").length}건 ${fmt(sumQty(filtered("chulgoUpload")))}장`, ""],
                  ["보충 출고", `${fmt(sumQty(filtered("bonusShipUpload")))}장`, ""],
                  ["재런칭 출고", `${fmt(sumQty(filtered("relaunchFallbackShipUpload")))}장`, ""],
                  ["매장요청 출고", `${fmt(sumQty(filtered("requestShipUpload")))}장`, ""],
                ]
              : [
                  ["과잉(전체 매장)", res.statusCounts["과잉"], "text-slate-600"],
                  ["RT", `${filtered("rtUpload").length}건 ${fmt(sumQty(filtered("rtUpload")))}장`, ""],
                  ["RT 매칭없음", filtered("idongDetail").filter((r) => r.exportStoreName === "매칭없음").length, "text-amber-600"],
                  ["보충 RT", `${fmt(sumQty(filtered("bonusRtUpload")))}장`, ""],
                  ["재런칭 RT", `${fmt(sumQty(filtered("relaunchFallbackRtUpload")))}장`, ""],
                  ["매장요청 RT", `${fmt(sumQty(filtered("requestRtUpload")))}장`, ""],
                  ["매장반출 RT", `${fmt(sumQty(filtered("requestOutRtUpload")))}장`, ""],
                  ["매장반출 창고반품", `${fmt(filtered("requestOutReturn").reduce((a: number, r: any) => a + (Number(r.qty) || 0), 0))}장`, filtered("requestOutReturn").length ? "text-amber-600" : ""],
                ]
            ).map(([l, v, c]) => (
              <div key={String(l)} className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-bold text-slate-500">{l}</p>
                <p className={`mt-1 text-base font-black ${c || "text-slate-900"}`}>{typeof v === "number" ? fmt(v) : v}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mode === "ship" ? (
              <button type="button" onClick={() => download(["chulgoUpload", "bonusShipUpload", "relaunchFallbackShipUpload", "requestShipUpload"], `출고업로드_${stamp()}.xlsx`)} className="h-9 rounded-full bg-emerald-600 px-4 text-xs font-black text-white">⬇ 출고 업로드 엑셀{shipPick.length ? `(${shipPick.length}개 매장)` : "(전체)"}</button>
            ) : (
              <button type="button" onClick={() => download(["rtUpload", "bonusRtUpload", "relaunchFallbackRtUpload", "requestRtUpload", "requestOutRtUpload"], `RT업로드_${stamp()}.xlsx`)} className="h-9 rounded-full bg-emerald-600 px-4 text-xs font-black text-white">⬇ RT 업로드 엑셀{rtPick.length ? `(${rtPick.length}개 매장)` : "(전체)"}</button>
            )}
            <span className="text-[11px] font-semibold text-slate-400">시트별로 나뉘어 있어요(자동/보충/재런칭/매장요청). 고른 매장분만 들어가요.</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {modeTabs.map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`rounded-full px-3 py-1.5 text-xs font-black ${tab === t.key ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>
                {t.label} <span className="opacity-60">{filtered(t.key).length}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-500">{cur.desc}{tab === "analysisRows" ? ` (전체 ${fmt(res.analysisTotal)}줄 중)` : ""}</p>
            {rows.length > 0 && <button type="button" onClick={() => download([tab], `${cur.label}_${stamp()}.xlsx`)} className="h-8 rounded-full border border-slate-300 bg-white px-3 text-xs font-black text-slate-700">⬇ 이 표 엑셀</button>}
          </div>
          {rows.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 p-6 text-center text-xs font-semibold text-slate-400">해당하는 건이 없어요.</p>
          ) : (
            <div className="max-h-[560px] overflow-auto rounded-2xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-100">
                  <tr>{cols.map((c) => <th key={c} className="whitespace-nowrap px-2 py-2 text-left font-black text-slate-600">{cur.upload ? c : LABELS[c] || c}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 800).map((r, i) => (
                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                      {cols.map((c) => (
                        <td key={c} className={`whitespace-nowrap px-2 py-1.5 ${typeof r[c] === "number" ? "text-right tabular-nums" : ""} ${c === "status" || c === "projStatus" ? (String(r[c]).includes("품절") ? "font-bold text-rose-600" : String(r[c]).includes("보충") ? "font-bold text-amber-600" : "") : ""}`}>
                          {fmt(r[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 800 && <p className="p-2 text-center text-[11px] text-slate-400">화면엔 800줄까지 — 전체는 엑셀로 받아주세요({fmt(rows.length)}줄).</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
