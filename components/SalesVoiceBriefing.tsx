"use client";

// MARK 2026-10-15: 일간/주간 탭 "음성 매출 브리핑".
// - 대본은 lib/salesBriefingScript.ts에서 화면 숫자로만 생성(지어내는 값 없음).
// - 브라우저 내장 Web Speech API(SpeechSynthesis)로 재생 — 추가 비용/서버 없음.
// - 크롬은 긴 문장을 한 번에 읽히면 15초쯤에서 끊기는 버그가 있어서, 문장 단위로 큐를 돌립니다.
//   그 덕분에 지금 읽는 문장 강조, 챕터 건너뛰기, 이어듣기가 가능합니다.
// - speechSynthesis.pause()는 크롬에서 불안정해서, "일시정지"는 취소 후 현재 문장부터 다시 읽는 방식.

import { useEffect, useMemo, useRef, useState } from "react";
import { type BriefingChapter, toSpeech } from "@/lib/salesBriefingScript";

type Item = { chapter: number; line: number; text: string };
type Mode = "summary" | "full";

const RATES = [0.9, 1, 1.15, 1.3, 1.5];

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** 자연스러운 한국어 음성 우선: Edge "Online (Natural)" > Google > 그 외 ko */
function rankVoice(v: SpeechSynthesisVoice) {
  const name = v.name.toLowerCase();
  if (name.includes("natural")) return 0;
  if (name.includes("google")) return 1;
  if (name.includes("yuna") || name.includes("유나")) return 2;
  return 3;
}

export default function SalesVoiceBriefing({
  title,
  subtitle,
  chapters,
  prefKey = "mark_voice",
}: {
  title: string;
  subtitle?: string;
  chapters: BriefingChapter[];
  prefKey?: string;
}) {
  const [supported, setSupported] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState<Mode>("full");
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0); // 큐 안에서 현재(또는 다음에 읽을) 문장 위치
  const token = useRef(0); // 취소된 재생의 onend가 다음 문장을 이어 읽지 않도록

  const visibleChapters = useMemo(
    () => chapters.map((c, i) => ({ c, i })).filter(({ c }) => mode === "full" || c.summary),
    [chapters, mode]
  );

  const queue: Item[] = useMemo(() => {
    const out: Item[] = [];
    visibleChapters.forEach(({ c, i }) => {
      c.lines.forEach((line, li) => out.push({ chapter: i, line: li, text: line }));
    });
    return out;
  }, [visibleChapters]);

  const totalChars = useMemo(() => queue.reduce((s, q) => s + q.text.length, 0), [queue]);
  // 한국어 TTS 기준 대략 초당 7~8자
  const estSeconds = Math.round(totalChars / (7.5 * speed));

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    setSpeed(readPref(`${prefKey}_rate`, 1));
    setMode(readPref<Mode>(`${prefKey}_mode`, "full"));
    const savedVoice = readPref(`${prefKey}_voice`, "");
    const load = () => {
      const ko = window.speechSynthesis
        .getVoices()
        .filter((v) => v.lang?.toLowerCase().startsWith("ko"))
        .sort((a, b) => rankVoice(a) - rankVoice(b));
      setVoices(ko);
      setVoiceName((cur) => cur || (ko.find((v) => v.name === savedVoice)?.name ?? ko[0]?.name ?? ""));
    };
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", load);
      token.current++;
      window.speechSynthesis.cancel();
    };
  }, [prefKey]);

  // 데이터(주차 변경/새로고침)나 모드가 바뀌면 처음부터
  useEffect(() => {
    stop();
    setCursor(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  function speakFrom(index: number, rateOverride?: number) {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const my = ++token.current;
    synth.cancel();
    if (index >= queue.length) {
      setPlaying(false);
      setCursor(0);
      return;
    }
    const voice = voices.find((v) => v.name === voiceName);
    const step = (i: number) => {
      if (my !== token.current) return;
      if (i >= queue.length) {
        setPlaying(false);
        setCursor(0);
        return;
      }
      setCursor(i);
      const u = new SpeechSynthesisUtterance(toSpeech(queue[i].text));
      u.lang = "ko-KR";
      u.rate = rateOverride ?? speed;
      if (voice) u.voice = voice;
      u.onend = () => {
        if (my !== token.current) return;
        // 챕터가 바뀌는 곳에서는 살짝 쉬어 줍니다
        const nextChapter = queue[i + 1] && queue[i + 1].chapter !== queue[i].chapter;
        setTimeout(() => step(i + 1), nextChapter ? 450 : 120);
      };
      u.onerror = (e: any) => {
        if (my !== token.current) return;
        if (e?.error === "interrupted" || e?.error === "canceled") return;
        step(i + 1);
      };
      synth.speak(u);
    };
    setPlaying(true);
    step(index);
  }

  function stop() {
    token.current++;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setPlaying(false);
  }

  function togglePlay() {
    if (playing) stop();
    else speakFrom(cursor);
  }

  function jumpChapter(dir: 1 | -1) {
    const cur = queue[cursor]?.chapter;
    const chapterIdx = visibleChapters.findIndex(({ i }) => i === cur);
    const target = visibleChapters[Math.max(0, Math.min(visibleChapters.length - 1, chapterIdx + dir))];
    if (!target) return;
    const idx = queue.findIndex((q) => q.chapter === target.i);
    if (idx < 0) return;
    if (playing) speakFrom(idx);
    else setCursor(idx);
  }

  function playChapter(chapterIndex: number, line = 0) {
    const idx = queue.findIndex((q) => q.chapter === chapterIndex && q.line === line);
    if (idx >= 0) speakFrom(idx);
  }

  function changeSpeed(r: number) {
    setSpeed(r);
    writePref(`${prefKey}_rate`, r);
    if (playing) speakFrom(cursor, r);
  }

  function changeMode(m: Mode) {
    setMode(m);
    writePref(`${prefKey}_mode`, m);
  }

  const current = queue[cursor];
  const progress = queue.length ? ((playing || cursor > 0 ? cursor + (playing ? 0.5 : 0) : 0) / queue.length) * 100 : 0;

  if (!chapters.length) return null;

  return (
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white shadow-sm">
      {/* 플레이어 */}
      <div className="p-5 md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={togglePlay}
              disabled={!supported || !queue.length}
              aria-label={playing ? "일시정지" : "재생"}
              className={`relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl font-black transition disabled:opacity-40 ${
                playing ? "bg-white text-slate-900" : "bg-indigo-500 text-white hover:bg-indigo-400"
              }`}
            >
              {playing && <span className="absolute inset-0 animate-ping rounded-full bg-white/30" />}
              <span className="relative">{playing ? "❚❚" : "▶"}</span>
            </button>
            <div className="min-w-0">
              <p className="text-xs font-black tracking-wider text-indigo-300">🎧 VOICE BRIEFING</p>
              <h2 className="mt-1 text-2xl font-black">{title}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-300">
                {subtitle ? `${subtitle} · ` : ""}약 {estSeconds >= 60 ? `${Math.floor(estSeconds / 60)}분 ${estSeconds % 60}초` : `${estSeconds}초`}
                {playing && current ? ` · 지금: ${chapters[current.chapter]?.title}` : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 md:items-end">
            <div className="flex rounded-2xl bg-white/10 p-1 text-xs font-black">
              {(["summary", "full"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => changeMode(m)}
                  className={`rounded-xl px-3 py-2 ${mode === m ? "bg-white text-slate-900" : "text-slate-300 hover:text-white"}`}
                >
                  {m === "summary" ? "⚡ 핵심만" : "📋 전체 브리핑"}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <button type="button" onClick={() => jumpChapter(-1)} className="rounded-xl bg-white/10 px-3 py-2 hover:bg-white/20" aria-label="이전 챕터">⏮</button>
              <button type="button" onClick={() => jumpChapter(1)} className="rounded-xl bg-white/10 px-3 py-2 hover:bg-white/20" aria-label="다음 챕터">⏭</button>
              <button type="button" onClick={() => { stop(); setCursor(0); }} className="rounded-xl bg-white/10 px-3 py-2 hover:bg-white/20">처음부터</button>
              <select
                value={speed}
                onChange={(e) => changeSpeed(Number(e.target.value))}
                className="rounded-xl bg-white/10 px-2 py-2 text-white outline-none"
                aria-label="재생 속도"
              >
                {RATES.map((r) => <option key={r} value={r} className="text-slate-900">{r}x</option>)}
              </select>
              {voices.length > 1 && (
                <select
                  value={voiceName}
                  onChange={(e) => { setVoiceName(e.target.value); writePref(`${prefKey}_voice`, e.target.value); }}
                  className="max-w-[160px] rounded-xl bg-white/10 px-2 py-2 text-white outline-none"
                  aria-label="목소리"
                >
                  {voices.map((v) => <option key={v.name} value={v.name} className="text-slate-900">{v.name.replace(/^Microsoft\s+/, "").replace(/\s+-\s+Korean.*$/, "")}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-indigo-400 transition-all duration-500" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>

        {!supported && (
          <p className="mt-3 text-xs font-bold text-amber-300">이 브라우저는 음성 재생을 지원하지 않아요. 크롬·엣지·사파리에서 열어주세요.</p>
        )}
        {supported && voices.length === 0 && (
          <p className="mt-3 text-xs font-bold text-amber-300">한국어 음성을 찾는 중이에요. 소리가 안 나면 크롬이나 엣지에서 열어주세요(엣지의 Natural 음성이 가장 자연스러워요).</p>
        )}
      </div>

      {/* 대본 */}
      <div className="grid gap-3 border-t border-white/10 bg-black/20 p-5 md:grid-cols-2 md:p-6">
        {visibleChapters.map(({ c, i }) => {
          const activeChapter = playing && current?.chapter === i;
          return (
            <div
              key={c.key}
              className={`rounded-2xl p-4 transition ${activeChapter ? "bg-white/15 ring-1 ring-indigo-300/60" : "bg-white/5"} ${c.key === "headline" ? "md:col-span-2" : ""}`}
            >
              <button type="button" onClick={() => playChapter(i)} className="group flex w-full items-center justify-between gap-2 text-left">
                <span className="text-sm font-black text-white">{c.icon} {c.title}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-black text-slate-300 group-hover:bg-indigo-500 group-hover:text-white">
                  {activeChapter ? "재생 중" : "▶ 여기부터"}
                </span>
              </button>
              <div className="mt-2 space-y-1.5">
                {c.lines.map((line, li) => {
                  const on = playing && current?.chapter === i && current?.line === li;
                  return (
                    <p
                      key={li}
                      onClick={() => playChapter(i, li)}
                      className={`cursor-pointer rounded-lg px-2 py-1 leading-6 transition ${
                        c.key === "headline" ? "text-base font-bold" : "text-sm font-semibold"
                      } ${on ? "bg-indigo-500/40 text-white" : "text-slate-300 hover:bg-white/5"}`}
                    >
                      {line}
                    </p>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
