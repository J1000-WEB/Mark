// MARK 6.14: 일간매출 스냅샷 등이 끊겼을 때 이메일로 알림을 보내는 공용 헬퍼입니다.
// Resend(https://resend.com) API를 사용합니다.
// 필요한 환경변수:
// - RESEND_API_KEY: Resend에서 발급받은 API 키
// - ALERT_EMAIL_TO: 받을 이메일 주소 (여러 명이면 콤마로 구분)
// - ALERT_EMAIL_FROM: 보내는 주소 (선택, 기본값은 Resend 샌드박스 발신자 — 도메인 인증 전에도 바로 사용 가능)

// toOverride: 이 알림만 다른 주소로 보낼 때(예: 인샵 업로드 검증 → 소천님 회사 메일)
export async function sendEmailAlert(subject: string, html: string, toOverride?: string) {
  // 2026-11-27: 같은 알림을 카카오톡 "나와의 채팅"으로도(연결돼 있을 때만, 실패해도 메일은 그대로)
  if (process.env.KAKAO_REST_KEY) {
    try {
      const { sendKakaoMemo } = await import("@/lib/kakao");
      const plain = html.replace(/<(br|\/p|\/tr)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*/g, "\n").trim();
      await sendKakaoMemo(`${subject}\n${plain}`.slice(0, 200));
    } catch {}
  }
  const apiKey = process.env.RESEND_API_KEY;
  const to = toOverride || process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM || "MARK 알림 <onboarding@resend.dev>";

  if (!apiKey) return { ok: false, error: "RESEND_API_KEY 환경변수가 설정되어 있지 않습니다." };
  if (!to) return { ok: false, error: "ALERT_EMAIL_TO 환경변수가 설정되어 있지 않습니다." };

  const recipients = to.split(",").map((s) => s.trim()).filter(Boolean);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: recipients, subject, html }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body?.message || `이메일 발송 실패 (status ${res.status})` };
    }
    return { ok: true, id: body?.id };
  } catch (error: any) {
    return { ok: false, error: error?.message || "이메일 발송 중 오류" };
  }
}
