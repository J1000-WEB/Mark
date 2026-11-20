"use client";

// MARK 2026-11-20: 회의 탭 — 주간 리더회의 한 장(지난주 / 이번주 / 이번달), 팀 PPT 양식 그대로.
// 지난주·이번주 칸은 MARK 데이터로 초안 자동 작성(/api/meeting?auto=1) → 손으로 고치고 저장(MARK_DB 회의_주간리더) → 16:9 PDF로 인쇄.
// 글 규칙: "1. 제목" = 굵은 소제목, "[1] 내용" = 파란 번호, "- 내용" = 들여쓰기, "  · 내용" = 한 칸 더, **강조** = 초록 굵게 밑줄.
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type MonthItem = { pri: string; cat: string; text: string; progress: number; done: boolean };
type Doc = {
  week: string; team: string; teamBadge: string; teamDesc: string; presenter: string;
  lastWeek: string; thisWeek: string; monthItems: MonthItem[]; coop: string; savedAt?: string;
};

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const monthOfWeek = (monday: string) => addDays(monday, 3).slice(0, 7);
const blank = (week: string): Doc => ({
  week, team: "오프라인 브랜딩팀", teamBadge: "O.B", teamDesc: "코치 · 재고컨트롤 · VMD", presenter: "",
  lastWeek: "", thisWeek: "", monthItems: [], coop: "", savedAt: "",
});

const GREEN = "#2f6b4f";

function Inline({ s }: { s: string }) {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <b key={i} style={{ color: GREEN, textDecoration: "underline", textUnderlineOffset: 2 }}>{p.slice(2, -2)}</b>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-[3px] text-[11.5px] leading-[1.5] text-slate-800">
      {text.split("\n").map((raw, i) => {
        if (!raw.trim()) return <div key={i} className="h-2" />;
        const h = raw.match(/^(\d+)\.\s+(.*)$/);
        if (h) return <div key={i} className="pt-0.5 font-black text-slate-900"><Inline s={`${h[1]}. ${h[2]}`} /></div>;
        const b = raw.match(/^\[(\d+)\]\s*(.*)$/);
        if (b)
          return (
            <div key={i} className="flex gap-1.5 pl-2">
              <span className="mt-[2px] inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[3px] bg-[#3b6fd8] text-[9px] font-black text-white">{b[1]}</span>
              <span><Inline s={b[2]} /></span>
            </div>
          );
        const deep = raw.match(/^\s{2,}(.*)$/);
        if (deep) return <div key={i} className="pl-9 text-slate-600"><Inline s={deep[1]} /></div>;
        const d = raw.match(/^-\s?(.*)$/);
        if (d) return <div key={i} className="pl-6 text-slate-700">- <Inline s={d[1]} /></div>;
        return <div key={i} className="pl-2"><Inline s={raw} /></div>;
      })}
    </div>
  );
}

function catColor(c: string) {
  if (/상품/.test(c)) return "#d1453b";
  if (/운영/.test(c)) return "#d1453b";
  if (/상권|입점/.test(c)) return "#d1453b";
  if (/VM/i.test(c)) return "#c27c0e";
  return "#475569";
}

export default function MeetingBoard() {
  const [week, setWeek] = useState("");
  const [label, setLabel] = useState("");
  const [doc, setDoc] = useState<Doc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [facts, setFacts] = useState<any>(null);

  async function autoFill(d: Doc, ask: boolean) {
    if (ask && (d.lastWeek.trim() || d.thisWeek.trim()) && !window.confirm("지난주·이번주 칸을 MARK 데이터 초안으로 덮어쓸까요? (손으로 고친 내용은 사라져요)")) return;
    setBusy("MARK 데이터로 초안 만드는 중… (20~40초)");
    try {
      const j = await fetch(`/api/meeting?auto=1&week=${d.week}`, { cache: "no-store" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error);
      setFacts(j.facts);
      setDoc({ ...d, lastWeek: j.lastWeek, thisWeek: j.thisWeek });
      setDirty(true);
      setMsg(`지난주(${j.reviewStart.slice(5)}~${j.reviewEnd.slice(5)}) 초안을 채웠어요. 고친 뒤 저장해 주세요.`);
    } catch (e: any) {
      setMsg(`초안 실패: ${e?.message || e}`);
    } finally {
      setBusy("");
    }
  }

  async function load(w?: string) {
    if (dirty && !window.confirm("저장 안 한 내용이 있어요. 그래도 다른 주로 갈까요?")) return;
    setBusy("불러오는 중…");
    setMsg("");
    setFacts(null);
    try {
      const j = await fetch(`/api/meeting${w ? `?week=${w}` : ""}`, { cache: "no-store" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error);
      setWeek(j.week);
      setLabel(j.label);
      setDirty(false);
      if (j.doc) {
        setDoc({ ...blank(j.week), ...j.doc });
        setBusy("");
        return;
      }
      // 새 주: 머리글·발표자·이번달 과업은 지난 회의에서 이어받음(달이 바뀌면 완료된 과업은 뺌)
      const p: Doc | null = j.prev;
      const d = blank(j.week);
      if (p) {
        Object.assign(d, { team: p.team, teamBadge: p.teamBadge, teamDesc: p.teamDesc, presenter: p.presenter, coop: p.coop || "" });
        const sameMonth = monthOfWeek(p.week) === monthOfWeek(j.week);
        d.monthItems = (p.monthItems || []).filter((m) => sameMonth || !m.done);
      }
      setDoc(d);
      setBusy("");
      await autoFill(d, false);
    } catch (e: any) {
      setMsg(`불러오기 실패: ${e?.message || e}`);
      setBusy("");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!doc) return;
    setBusy("저장 중…");
    try {
      const j = await fetch("/api/meeting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc }) }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error);
      setDoc({ ...doc, savedAt: j.savedAt });
      setDirty(false);
      setMsg(`저장했어요 (${j.savedAt})`);
    } catch (e: any) {
      setMsg(`저장 실패: ${e?.message || e}`);
    } finally {
      setBusy("");
    }
  }

  const set = (patch: Partial<Doc>) => {
    setDoc((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };
  const setItem = (i: number, patch: Partial<MonthItem>) => set({ monthItems: doc!.monthItems.map((m, k) => (k === i ? { ...m, ...patch } : m)) });

  // 화면 폭에 맞춰 1280×720 슬라이드를 줄여 보여줌
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1.25, el.clientWidth / 1280)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const items = doc?.monthItems || [];
  const doneN = items.filter((m) => m.done).length;
  const btn = "h-9 rounded-full px-4 text-xs font-black";

  return (
    <div className="space-y-3">
      <style>{`
        @media print {
          @page { size: 1280px 720px; margin: 0; }
          html, body { background: #fff !important; padding: 0 !important; margin: 0 !important; }
          body * { visibility: hidden !important; }
          #meeting-slide, #meeting-slide * { visibility: visible !important; }
          #meeting-slide { position: fixed !important; left: 0; top: 0; transform: none !important; box-shadow: none !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <button type="button" className={`${btn} border border-slate-300 bg-white`} onClick={() => load(addDays(week, -7))} disabled={!!busy}>‹ 전주</button>
        <div className="px-2 text-sm font-black text-slate-900">{label || "…"}</div>
        <button type="button" className={`${btn} border border-slate-300 bg-white`} onClick={() => load(addDays(week, 7))} disabled={!!busy}>다음주 ›</button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button type="button" className={`${btn} ${edit ? "bg-slate-900 text-white" : "border border-slate-300 bg-white"}`} onClick={() => setEdit(!edit)} disabled={!doc}>{edit ? "✓ 미리보기" : "✏️ 수정"}</button>
        <button type="button" className={`${btn} border border-slate-300 bg-white`} onClick={() => doc && autoFill(doc, true)} disabled={!doc || !!busy}>↻ MARK 데이터로 다시 채우기</button>
        <button type="button" className={`${btn} bg-emerald-600 text-white disabled:opacity-50`} onClick={save} disabled={!doc || !!busy}>저장{dirty ? " *" : ""}</button>
        <button type="button" className={`${btn} bg-slate-900 text-white`} onClick={() => { setEdit(false); setTimeout(() => window.print(), 150); }} disabled={!doc}>⬇ PDF(인쇄)</button>
        <span className="text-[11px] font-semibold text-slate-500">{busy || msg}{!busy && doc?.savedAt ? ` · 마지막 저장 ${doc.savedAt}` : ""}</span>
      </div>

      {edit && doc && (
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-xs lg:grid-cols-3">
          <div className="space-y-2 lg:col-span-3 lg:grid lg:grid-cols-5 lg:gap-2 lg:space-y-0">
            {([["teamBadge", "배지"], ["team", "팀 이름"], ["teamDesc", "팀 설명"], ["presenter", "발표자"], ["coop", "협조 요청"]] as const).map(([k, l]) => (
              <label key={k} className="block font-bold text-slate-500">{l}
                <input value={(doc as any)[k]} onChange={(e) => set({ [k]: e.target.value } as any)} className="mt-1 h-8 w-full rounded-lg border border-slate-300 px-2 text-sm text-slate-900" />
              </label>
            ))}
          </div>
          <label className="font-bold text-slate-500">지난주
            <textarea value={doc.lastWeek} onChange={(e) => set({ lastWeek: e.target.value })} rows={24} className="mt-1 w-full rounded-xl border border-slate-300 p-2 font-mono text-[12px] leading-5 text-slate-900" />
          </label>
          <label className="font-bold text-slate-500">이번주
            <textarea value={doc.thisWeek} onChange={(e) => set({ thisWeek: e.target.value })} rows={24} className="mt-1 w-full rounded-xl border border-slate-300 p-2 font-mono text-[12px] leading-5 text-slate-900" />
          </label>
          <div className="font-bold text-slate-500">
            이번달 과업
            <div className="mt-1 space-y-1.5">
              {items.map((m, i) => (
                <div key={i} className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 p-1.5">
                  <select value={m.pri} onChange={(e) => setItem(i, { pri: e.target.value })} className="h-7 rounded border border-slate-300 px-1">{["P1", "P2", "P3"].map((p) => <option key={p}>{p}</option>)}</select>
                  <input value={m.cat} onChange={(e) => setItem(i, { cat: e.target.value })} placeholder="[상품]" className="h-7 w-16 rounded border border-slate-300 px-1" />
                  <input value={m.text} onChange={(e) => setItem(i, { text: e.target.value })} className="h-7 min-w-0 flex-1 rounded border border-slate-300 px-1 text-slate-900" />
                  <input type="number" min={0} max={100} step={10} value={m.progress} onChange={(e) => setItem(i, { progress: Math.max(0, Math.min(100, Number(e.target.value))) })} className="h-7 w-14 rounded border border-slate-300 px-1" />%
                  <label className="flex items-center gap-0.5"><input type="checkbox" checked={m.done} onChange={(e) => setItem(i, { done: e.target.checked, progress: e.target.checked ? 100 : m.progress })} />완료</label>
                  <button type="button" className="px-1 text-slate-400" onClick={() => i > 0 && set({ monthItems: items.map((x, k) => (k === i - 1 ? items[i] : k === i ? items[i - 1] : x)) })}>↑</button>
                  <button type="button" className="px-1 text-rose-500" onClick={() => set({ monthItems: items.filter((_, k) => k !== i) })}>✕</button>
                </div>
              ))}
              <button type="button" className="h-8 rounded-full border border-dashed border-slate-400 px-3 text-slate-600" onClick={() => set({ monthItems: [...items, { pri: "P1", cat: "[운영]", text: "", progress: 0, done: false }] })}>+ 과업 추가</button>
            </div>
            <p className="mt-3 text-[11px] font-semibold leading-5 text-slate-400">
              글 규칙: <code>1. 제목</code> 굵게 · <code>[1] 내용</code> 파란 번호 · <code>- 내용</code> 들여쓰기 · <code>  · 내용</code>(앞 공백 2칸) 한 칸 더 · <code>**강조**</code> 초록 밑줄
            </p>
          </div>
        </div>
      )}

      <div ref={wrapRef} className="w-full overflow-hidden">
        <div style={{ height: 720 * scale }}>
          {doc && (
            <div
              id="meeting-slide"
              style={{ width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: "top left", background: "#f2f1ec", fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif" }}
              className="relative flex flex-col overflow-hidden px-12 pb-6 pt-8 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-600"><span className="h-2 w-2 rounded-full" style={{ background: GREEN }} />GENERAL IDEA · 주간 리더 회의</div>
                  <div className="mt-4 flex items-center gap-4">
                    <span className="inline-flex h-11 min-w-[80px] items-center justify-center rounded-xl px-4 text-[17px] font-black text-white" style={{ background: GREEN }}>{doc.teamBadge}</span>
                    <span className="text-[34px] font-black tracking-tight text-slate-900">{doc.team}</span>
                  </div>
                  <div className="ml-[96px] mt-1 text-[11px] font-semibold text-slate-500">{doc.teamDesc}</div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="flex items-end gap-4">
                    <span className="text-[11px] font-semibold text-slate-500">발표자 / 협조요청 태깅</span>
                    <span className="min-w-[200px] border-b-2 border-slate-400 pb-0.5 text-right text-[18px] font-black tracking-[0.2em] text-slate-900">{doc.presenter || " "}</span>
                  </div>
                  <div className="mt-14 text-[12px] font-semibold text-slate-500">{label}</div>
                </div>
              </div>

              <div className="mt-4 grid min-h-0 flex-1 grid-cols-3 gap-5">
                {[
                  ["Last Week", "지난주", <Rich key="l" text={doc.lastWeek} />],
                  ["Week", "이번주", <Rich key="t" text={doc.thisWeek} />],
                  [
                    "Month",
                    "이번달",
                    <div key="m" className="space-y-[7px]">
                      {items.map((m, i) => {
                        const filled = Math.round(m.progress / 20);
                        return (
                          <div key={i} className="flex items-center gap-1.5 text-[11.5px]">
                            <span className={`inline-flex h-[16px] items-center rounded-full px-1.5 text-[9.5px] font-black ${m.pri === "P1" ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-700"}`}>{m.pri}</span>
                            <span className={`min-w-0 flex-1 truncate ${m.done ? "text-slate-400 line-through" : "text-slate-800"}`}>
                              <span style={{ color: m.done ? undefined : catColor(m.cat) }} className="font-bold">{m.cat}</span> {m.text}
                            </span>
                            <span className="flex gap-[2px]">
                              {[0, 1, 2, 3, 4].map((k) => (
                                <span key={k} className="inline-block h-[10px] w-[10px] rounded-[2px] border" style={k < filled ? { background: m.done ? GREEN : "#d9534f", borderColor: m.done ? GREEN : "#d9534f" } : { borderColor: "#cbd5e1" }} />
                              ))}
                            </span>
                            <span className={`inline-flex h-[13px] w-[13px] items-center justify-center rounded-[3px] border text-[9px] ${m.done ? "border-transparent text-white" : "border-slate-400"}`} style={m.done ? { background: GREEN } : undefined}>{m.done ? "✓" : ""}</span>
                            <span className="w-9 text-right text-[11px] font-black" style={{ color: m.done || m.progress >= 100 ? GREEN : "#d9534f" }}>{m.progress}%</span>
                          </div>
                        );
                      })}
                    </div>,
                  ],
                ].map(([en, ko, body], ci) => (
                  <div key={ci} className="flex min-h-0 flex-col overflow-hidden rounded-[22px] bg-white px-6 pb-4 pt-5">
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-[10.5px] font-semibold text-slate-500">{en as string}</div>
                        <div className="text-[22px] font-black text-slate-900">{ko as string}</div>
                        <div className="mt-1.5 h-[3px] w-7" style={{ background: GREEN }} />
                      </div>
                      {ci === 2 && (
                        <div className="pb-2 text-[11px] font-black text-slate-800">
                          총 {items.length}건 &nbsp;완료 {doneN}건 &nbsp;<span className="text-rose-600">잔여 {items.length - doneN}건</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 min-h-0 flex-1 overflow-hidden">{body as any}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-300 pt-3 text-[11px]">
                <div className="flex items-center gap-3">
                  <span className="h-4 w-[3px]" style={{ background: GREEN }} />
                  <b className="text-slate-900">협조 요청</b>
                  <span className="text-slate-500">{doc.coop || "@타부서 : 의사결정 필요건 명시"}</span>
                </div>
                <span className="text-slate-500">{addDays(week, 3).slice(0, 4)} · 주간 리더 회의</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {facts && (
        <details className="rounded-2xl border border-slate-200 bg-white p-3 text-[11px] text-slate-500">
          <summary className="cursor-pointer font-black text-slate-600">초안에 쓴 숫자 확인</summary>
          <pre className="mt-2 whitespace-pre-wrap">{JSON.stringify(facts, null, 1)}</pre>
        </details>
      )}
    </div>
  );
}
