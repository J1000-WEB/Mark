// MARK 2026-11-27 소천님: 알림을 카카오톡 "나에게 보내기"로도(메일과 같이). 받은 메시지는 카톡에서 팀방으로 전달.
// 준비: Vercel 환경변수 KAKAO_REST_KEY(카카오 개발자 앱 REST API 키, 선택 KAKAO_CLIENT_SECRET), 카카오 로그인 Redirect URI = <사이트>/api/kakao/callback,
//       동의항목 "카카오톡 메시지 전송(talk_message)". 소천님이 /api/kakao/login 한 번 열어서 허락 → 토큰을 MARK_DB "카카오_토큰" A2에 저장.
// 토큰: access 약 6시간·refresh 약 2개월. 보낼 때마다 access가 끝났으면 refresh로 새로 받고, refresh가 1달 안 남으면 카카오가 새 refresh를 줘서 같이 저장.
import { getDbSheetId, ensureSheetExistsById, getSheetValuesById, getSheetsClient } from "@/lib/googleSheets";

const TAB = "카카오_토큰";
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || process.env.MARK_BASE_URL || "https://mark-khaki.vercel.app").replace(/\/$/, "");
export const KAKAO_REDIRECT = `${SITE}/api/kakao/callback`;

type Tok = { access: string; refresh: string; accessExp: number; refreshExp: number; savedAt?: string };

export function kakaoKey() {
  return process.env.KAKAO_REST_KEY || "";
}
export function kakaoLoginUrl() {
  const q = new URLSearchParams({ client_id: kakaoKey(), redirect_uri: KAKAO_REDIRECT, response_type: "code", scope: "talk_message" });
  return `https://kauth.kakao.com/oauth/authorize?${q}`;
}

async function readTok(): Promise<Tok | null> {
  const id = getDbSheetId();
  await ensureSheetExistsById(id, TAB, ["토큰(JSON)", "저장시각"]);
  const v = await getSheetValuesById(id, TAB, "A2:A2").catch(() => [] as any[][]);
  try {
    return JSON.parse(String(v?.[0]?.[0] || "null"));
  } catch {
    return null;
  }
}
async function writeTok(t: Tok) {
  const id = getDbSheetId();
  await ensureSheetExistsById(id, TAB, ["토큰(JSON)", "저장시각"]);
  const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({ spreadsheetId: id, range: `'${TAB}'!A2:B2`, valueInputOption: "RAW", requestBody: { values: [[JSON.stringify({ ...t, savedAt: stamp }), stamp]] } });
}

async function tokenRequest(params: Record<string, string>) {
  const body = new URLSearchParams({ client_id: kakaoKey(), ...params });
  if (process.env.KAKAO_CLIENT_SECRET) body.set("client_secret", process.env.KAKAO_CLIENT_SECRET);
  const r = await fetch("https://kauth.kakao.com/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, body });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`카카오 토큰 실패: ${j.error_description || j.error || r.status}`);
  return j;
}

/** 로그인 콜백: code → 토큰 저장 */
export async function kakaoExchangeCode(code: string) {
  const j = await tokenRequest({ grant_type: "authorization_code", redirect_uri: KAKAO_REDIRECT, code });
  const now = Date.now();
  await writeTok({ access: j.access_token, refresh: j.refresh_token, accessExp: now + (j.expires_in || 21599) * 1000, refreshExp: now + (j.refresh_token_expires_in || 5183999) * 1000 });
  return { scope: j.scope || "" };
}

/** 유효한 access 토큰(필요하면 새로 받음). force=true면 access가 남아 있어도 갱신(refresh 연장용) */
export async function kakaoAccess(force = false): Promise<string> {
  const t = await readTok();
  if (!t?.refresh) throw new Error("카카오 연결 안 됨 — /api/kakao/login 에서 한 번 로그인해 주세요.");
  const now = Date.now();
  if (!force && t.access && t.accessExp - now > 5 * 60 * 1000) return t.access;
  if (t.refreshExp && t.refreshExp < now) throw new Error("카카오 연결이 만료됐어요 — /api/kakao/login 에서 다시 로그인해 주세요.");
  const j = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh });
  const next: Tok = {
    access: j.access_token,
    accessExp: now + (j.expires_in || 21599) * 1000,
    refresh: j.refresh_token || t.refresh, // 만료 1달 안 남았을 때만 새로 줌
    refreshExp: j.refresh_token ? now + (j.refresh_token_expires_in || 5183999) * 1000 : t.refreshExp,
  };
  await writeTok(next);
  return next.access;
}

export async function kakaoStatus() {
  const t = await readTok().catch(() => null);
  return {
    hasKey: !!kakaoKey(),
    connected: !!t?.refresh,
    refreshUntil: t?.refreshExp ? new Date(t.refreshExp + 9 * 3600 * 1000).toISOString().slice(0, 10) : "",
    savedAt: t?.savedAt || "",
  };
}

/** 카톡 "나와의 채팅"으로 텍스트(200자까지) + 대시보드 버튼 */
export async function sendKakaoMemo(text: string, link = SITE) {
  if (!kakaoKey()) return { ok: false, error: "KAKAO_REST_KEY 환경변수가 없어요." };
  try {
    const access = await kakaoAccess();
    const msg = text.length > 200 ? text.slice(0, 197) + "…" : text;
    const template = { object_type: "text", text: msg, link: { web_url: link, mobile_web_url: link }, button_title: "대시보드 열기" };
    const r = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams({ template_object: JSON.stringify(template) }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j.result_code !== 0) return { ok: false, error: j.msg || `카톡 발송 실패(${r.status})` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/** 매일 크론에서 불러 refresh 토큰이 끊기지 않게(1달 안 남으면 카카오가 새로 줌) */
export async function kakaoKeepAlive() {
  const t = await readTok().catch(() => null);
  if (!t?.refresh || !kakaoKey()) return { skipped: true };
  if (t.refreshExp - Date.now() > 31 * 24 * 3600 * 1000) return { skipped: true, refreshUntil: new Date(t.refreshExp).toISOString().slice(0, 10) };
  await kakaoAccess(true);
  return { refreshed: true };
}
