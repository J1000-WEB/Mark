// MARK 2026-11-20: 인샵(위탁) 매출 업로드 검증 — PC erp-agent verify-inshop-upload.js가
// ① 원본 사이트 합계(신라 USD×환율, 용인 실판매금액 등) ② 우리가 만든 업로드 파일 합계 ③ ERP에 실제로 들어간 합계를
// 채널·매출일별로 비교해서 보내면 MARK_DB "인샵업로드_검증"에 남기고, 안 맞으면 메일 알림.
import { getDbSheetId, getSheetValuesById, ensureSheetExistsById, appendValuesById } from "@/lib/googleSheets";
import { sendEmailAlert } from "@/lib/alerts";

export const VERIFY_SHEET = "인샵업로드_검증";
const HEADER = ["검증시각", "매출일", "채널코드", "채널명", "원본금액", "업로드금액", "업로드수량", "ERP금액", "ERP수량", "결과", "메모"];

export type VerifyItem = {
  date: string; channel: string; name: string;
  sourceAmount?: number | null; uploadAmount: number; uploadQty: number;
  erpAmount?: number | null; erpQty?: number | null; status: string; note?: string;
};

const won = (n: any) => (n == null || n === "" ? "-" : Number(n).toLocaleString("ko-KR"));

export async function saveVerify(items: VerifyItem[], opts: { alert?: boolean } = {}) {
  const id = getDbSheetId();
  await ensureSheetExistsById(id, VERIFY_SHEET, HEADER);
  const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
  const rows = items.map((r) => [stamp, r.date, r.channel, r.name, r.sourceAmount ?? "", r.uploadAmount, r.uploadQty, r.erpAmount ?? "", r.erpQty ?? "", r.status, r.note || ""]);
  if (rows.length) await appendValuesById(id, `'${VERIFY_SHEET}'!A:K`, rows);
  const bad = items.filter((r) => r.status !== "일치");
  let mail: any = null;
  if (bad.length && opts.alert !== false) {
    const tr = items.map((r) => `<tr style="background:${r.status === "일치" ? "#fff" : "#fff1f2"}"><td>${r.date}</td><td>${r.name}(${r.channel})</td><td align=right>${won(r.sourceAmount)}</td><td align=right>${won(r.uploadAmount)} / ${r.uploadQty}장</td><td align=right>${won(r.erpAmount)} / ${r.erpQty ?? "-"}장</td><td><b>${r.status}</b> ${r.note || ""}</td></tr>`).join("");
    mail = await sendEmailAlert(
      `[MARK] 인샵 매출 업로드 확인필요 — ${bad.map((b) => b.name).join(", ")}`,
      `<p>원본 · 업로드 파일 · ERP 금액이 안 맞는 채널이 있어요.</p><table border=1 cellpadding=4 style="border-collapse:collapse;font-size:13px"><tr><th>매출일</th><th>채널</th><th>원본</th><th>업로드 파일</th><th>ERP</th><th>결과</th></tr>${tr}</table>`
    ).catch((e: any) => ({ ok: false, error: e?.message }));
  }
  return { saved: rows.length, bad: bad.length, mail };
}

// 최근 검증 결과(매출일·채널별 마지막 기록)
export async function readLatestVerify(days = 7) {
  const id = getDbSheetId();
  const raw = await getSheetValuesById(id, VERIFY_SHEET, "A:K").catch(() => [] as any[]);
  const last = new Map<string, any>();
  for (const r of (raw || []).slice(1)) {
    const key = `${r[1]}|${r[2]}`;
    last.set(key, { at: r[0], date: String(r[1]), channel: String(r[2]), name: r[3], sourceAmount: r[4], uploadAmount: r[5], uploadQty: r[6], erpAmount: r[7], erpQty: r[8], status: r[9], note: r[10] });
  }
  const list = [...last.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.channel.localeCompare(b.channel)));
  const dates = [...new Set(list.map((x) => x.date))].slice(0, days);
  return list.filter((x) => dates.includes(x.date));
}
