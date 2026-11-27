"use client";

// MARK 2026-11-27 소천님: 카톡 요약 → "자세히 보기"로 여는 리뷰 화면. 일간/주간 탭, 지난 리뷰 고르기, 소리내어 읽기(자연스러운 여성 목소리).
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Kind = "daily" | "weekly";
type Item = { kind: Kind; key: string; savedAt: string; summary: string };
type Review = Item & { text: string };

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const mondayOf = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const label = (k: Kind, key: string) => (k === "daily" ? `${md(key)}(${DOW[new Date(`${key}T00:00:00Z`).getUTCDay()]})` : `${md(key)}~${md(addDays(key, 6))}`);
const defaultKey = (k: Kind) => (k === "daily" ? addDays(kstToday(), -1) : addDays(mondayOf(kstToday()), -7));

export default function ReviewViewer() {
  const sp = useSearchParams();
  const router = useRouter();
  const kind: Kind = sp.get("kind") === "weekly" ? "weekly" : "daily";
  const key = sp.get("key") || defaultKey(kind);
  const [items, setItems] = useState<Item[]>([]);
  const [rev, setRev] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const go = (k: Kind, kk?: string) => router.replace(`/review?kind=${k}&key=${kk || defaultKey(k)}`, { scroll: false });

  useEffect(() => {
    fetch("/api/review?list=1").then((r) => r.json()).then((j) => j.ok && setItems(j.items || [])).catch(() => {});
  }, [rev?.key, rev?.savedAt]);

  const load = (rebuild = false) => {
    setLoading(true);
    setErr("");
    stopAll();
    fetch(`/api/review?kind=${kind}&key=${key}${rebuild ? "&rebuild=1" : ""}`)
      .then((r) => r.json())
      .then((j) => (j.ok ? setRev(j.review) : (setRev(null), setErr(j.error || "못 읽었어요"))))
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, key]);

  const step = kind === "daily" ? 1 : 7;
  const maxKey = defaultKey(kind);
  const mine = useMemo(() => items.filter((i) => i.kind === kind), [items, kind]);

  // ---------- 소리내어 읽기
  const [playing, setPlaying] = useState<"" | "loading" | "cloud" | "browser">("");
  const [voiceName, setVoiceName] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopRef = useRef(false);
  function stopAll() {
    stopRef.current = true;
    try { audioRef.current?.pause(); } catch {}
    try { window.speechSynthesis?.cancel(); } catch {}
    setPlaying("");
  }
  async function speak() {
    if (!rev) return;
    stopAll();
    stopRef.current = false;
    setPlaying("loading");
    try {
      const j = await fetch("/api/review/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: rev.text }) }).then((r) => r.json());
      if (j.ok && j.audio?.length) {
        setVoiceName(`Google ${String(j.voice).replace("ko-KR-", "")}`);
        setPlaying("cloud");
        for (const b64 of j.audio as string[]) {
          if (stopRef.current) break;
          await new Promise<void>((res) => {
            const a = new Audio(`data:audio/mp3;base64,${b64}`);
            audioRef.current = a;
            a.onended = () => res();
            a.onerror = () => res();
            a.play().catch(() => res());
          });
        }
        if (!stopRef.current) setPlaying("");
        return;
      }
      browserSpeak(j.speech || rev.text, j.error);
    } catch {
      browserSpeak(rev.text);
    }
  }
  function browserSpeak(text: string, why?: string) {
    const synth = window.speechSynthesis;
    if (!synth) { setPlaying(""); setErr("이 브라우저는 소리내어 읽기를 못 해요."); return; }
    const voices = synth.getVoices().filter((v) => /ko/i.test(v.lang));
    const pick = voices.find((v) => /female|여|yuna|sunhi|heami|google/i.test(v.name)) || voices[0];
    setVoiceName(`${pick ? pick.name : "기기 기본"}${why ? " (클라우드 목소리 안 됨)" : ""}`);
    setPlaying("browser");
    const lines = text.split("\n").filter(Boolean);
    lines.forEach((l, i) => {
      const u = new SpeechSynthesisUtterance(l);
      u.lang = "ko-KR";
      if (pick) u.voice = pick;
      u.rate = 1.05;
      if (i === lines.length - 1) u.onend = () => setPlaying("");
      synth.speak(u);
    });
  }
  useEffect(() => () => stopAll(), []);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["daily", "weekly"] as Kind[]).map((k) => (
          <button key={k} onClick={() => go(k)} className={`rounded-full px-4 py-1.5 text-sm font-black ${kind === k ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {k === "daily" ? "일간" : "주간"}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => go(kind, addDays(key, -step))} className="rounded-lg bg-white px-2.5 py-1.5 text-sm font-bold ring-1 ring-slate-200">◀</button>
          <input
            type="date"
            value={key}
            max={maxKey}
            onChange={(e) => e.target.value && go(kind, kind === "weekly" ? mondayOf(e.target.value) : e.target.value)}
            className="rounded-lg bg-white px-2 py-1 text-sm ring-1 ring-slate-200"
          />
          <button disabled={key >= maxKey} onClick={() => go(kind, addDays(key, step))} className="rounded-lg bg-white px-2.5 py-1.5 text-sm font-bold ring-1 ring-slate-200 disabled:opacity-30">▶</button>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black text-slate-900">{kind === "daily" ? "전일 리뷰" : "주간 리뷰"} · {label(kind, key)}</h1>
          <div className="ml-auto flex gap-1.5">
            {playing ? (
              <button onClick={stopAll} className="rounded-full bg-rose-600 px-3.5 py-1.5 text-sm font-black text-white">{playing === "loading" ? "목소리 준비 중…" : "⏹ 정지"}</button>
            ) : (
              <button disabled={!rev} onClick={speak} className="rounded-full bg-blue-600 px-3.5 py-1.5 text-sm font-black text-white disabled:opacity-40">🔊 읽어주기</button>
            )}
            <button disabled={loading} onClick={() => load(true)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200">다시 만들기</button>
          </div>
        </div>
        {voiceName && playing && <div className="mt-1 text-[11px] text-slate-400">목소리: {voiceName}</div>}
        {loading && <div className="mt-4 text-sm text-slate-400">불러오는 중… (처음 여는 날짜면 1분 정도 걸려요)</div>}
        {err && <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
        {rev && !loading && (
          <>
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[13px] font-bold leading-6 text-slate-700 whitespace-pre-wrap">{rev.summary.replace(/^\[MARK\][^\n]*\n?/, "")}</div>
            <div className="mt-4 space-y-1 text-[14px] leading-7 text-slate-800">
              {rev.text.split("\n").slice(1).map((l, i) => {
                const head = /^\[\d+\]|^\[이번주/.test(l);
                const sub = /^\s*·/.test(l);
                return (
                  <div key={i} className={head ? "pt-2 font-black text-slate-900" : sub ? "pl-4 text-[13px] text-slate-600" : ""}>
                    {l}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 text-[11px] text-slate-400">저장 {rev.savedAt}</div>
          </>
        )}
      </div>

      {mine.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-2 text-sm font-black text-slate-700">지난 {kind === "daily" ? "일간" : "주간"} 리뷰</div>
          <div className="divide-y divide-slate-100">
            {mine.slice(0, 60).map((it) => (
              <button key={it.key} onClick={() => go(kind, it.key)} className={`block w-full py-2 text-left ${it.key === key ? "text-blue-700" : "text-slate-700"}`}>
                <div className="text-[13px] font-black">{label(kind, it.key)}</div>
                <div className="truncate text-[12px] text-slate-500">{it.summary.split("\n")[1] || ""}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
