import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getPrivateKey } from "@/lib/googleSheets";
import { toSpeech } from "@/lib/speechText";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 리뷰 소리내어 읽기 — Google Cloud Text-to-Speech(서비스 계정, 프로젝트에서 "Cloud Text-to-Speech API" 사용 설정 필요)
// 목소리: 자연스러운 여성(Chirp3 HD) → 안 되면 Neural2-A. 응답 = mp3 base64 조각들(한 번에 5000바이트 제한이라 줄 단위로 나눔).
const VOICES = [process.env.TTS_VOICE || "ko-KR-Chirp3-HD-Aoede", "ko-KR-Neural2-A"];
let tokenCache: { at: number; token: string } | null = null;

async function token() {
  if (tokenCache && Date.now() - tokenCache.at < 30 * 60 * 1000) return tokenCache.token;
  const auth = new google.auth.JWT({ email: process.env.GOOGLE_CLIENT_EMAIL, key: getPrivateKey(), scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const t = await auth.authorize();
  tokenCache = { at: Date.now(), token: String(t.access_token) };
  return tokenCache.token;
}

function pieces(text: string, maxBytes = 3000) {
  const out: string[] = [];
  let cur = "";
  for (const l of text.split("\n")) {
    if (cur && Buffer.byteLength(cur + "\n" + l) > maxBytes) { out.push(cur); cur = l; }
    else cur = cur ? `${cur}\n${l}` : l;
  }
  if (cur) out.push(cur);
  return out;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const speech = toSpeech(String(body?.text || ""));
  if (!speech) return NextResponse.json({ ok: false, error: "읽을 글이 없어요." }, { status: 400 });
  try {
    const tk = await token();
    let lastErr = "";
    for (const voice of VOICES) {
      const audio: string[] = [];
      let failed = false;
      for (const p of pieces(speech)) {
        const r = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
          method: "POST",
          headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
          body: JSON.stringify({ input: { text: p }, voice: { languageCode: "ko-KR", name: voice }, audioConfig: { audioEncoding: "MP3", speakingRate: Number(body?.rate) || 1.05 } }),
        });
        const j: any = await r.json().catch(() => ({}));
        if (!r.ok || !j.audioContent) { lastErr = j?.error?.message || `TTS 실패(${r.status})`; failed = true; break; }
        audio.push(j.audioContent);
      }
      if (!failed) return NextResponse.json({ ok: true, voice, audio, speech });
    }
    return NextResponse.json({ ok: false, error: lastErr, speech });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e), speech });
  }
}
