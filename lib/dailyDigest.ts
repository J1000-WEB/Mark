// MARK 2026-11-27 소천님: 알림은 메일 대신 카카오톡으로, 그때그때가 아니라 매일 아침 9:20(매출탭 갱신 직후) 한 번에.
// - 낮·밤에 생긴 알림(sendEmailAlert)은 MARK_DB "알림_대기"에 쌓아 두기만 함
// - 9:20 크론(sales-summary-drive-import slot 0920) 끝에 sendDailyDigest(): 어제 매출 · 인샵 업로드 검증 · 용인/무신사 반영 · 쌓인 알림을
//   카톡 "나와의 채팅"으로(카톡 텍스트 한 통 200자 → 줄 단위로 나눠 여러 통). 보낸 알림은 D열에 보낸 시각 기록.
import { getDbSheetId, ensureSheetExistsById, getSheetValuesById, appendValuesById, getSheetsClient } from "@/lib/googleSheets";

const TAB = "알림_대기";
const HEADER = ["생긴시각", "제목", "내용", "보낸시각"];
const kstStamp = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
const kstDay = (offset = 0) => new Date(Date.now() + 9 * 3600 * 1000 + offset * 86400000).toISOString().slice(0, 10);
const plain = (html: string) =>
  html.replace(/<(br|\/p|\/tr|\/li)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*/g, "\n").trim();
const man = (n: number) => `${Math.round(n / 10000).toLocaleString("ko-KR")}만`;
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

export async function queueAlert(subject: string, html: string) {
  const id = getDbSheetId();
  await ensureSheetExistsById(id, TAB, HEADER);
  await appendValuesById(id, `'${TAB}'!A:D`, [[kstStamp(), subject, plain(html).slice(0, 2000), ""]]);
  return { ok: true, queued: true };
}

/** 줄들을 200자 안쪽 메시지 여러 개로 */
export function chunk(lines: string[], max = 195) {
  const out: string[] = [];
  let cur = "";
  for (const l of lines) {
    const line = l.length > max ? l.slice(0, max - 1) + "…" : l;
    if (cur && cur.length + 1 + line.length > max) {
      out.push(cur);
      cur = line;
    } else cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) out.push(cur);
  return out;
}

export async function sendDailyDigest(check?: any) {
  const { sendKakaoMemo } = await import("@/lib/kakao");
  const lines: string[] = [];
  const today = kstDay(0);
  const y = kstDay(-1);
  const dw = (d: string) => DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
  lines.push(`[MARK] ${Number(today.slice(5, 7))}/${Number(today.slice(8))}(${dw(today)}) 아침 알림`);

  // ① 어제 오프라인 매출(매출탭 화이트리스트) vs 전주 같은 요일
  try {
    const { readSalesSummaryRowsForReports } = await import("@/lib/dataBuilder");
    const rows = await readSalesSummaryRowsForReports();
    const norm = (d: string) => String(d || "").replace(/\D/g, "").slice(0, 8);
    const ys = norm(y), ps = norm(kstDay(-8));
    let a = 0, p = 0;
    for (const r of rows as any[]) {
      const d = norm(r.date);
      if (d === ys) a += Number(r.amount || 0);
      else if (d === ps) p += Number(r.amount || 0);
    }
    lines.push(`① 어제(${Number(y.slice(5, 7))}/${Number(y.slice(8))} ${dw(y)}) 매출 ${man(a)}${p ? ` · 전주 동요일 ${a >= p ? "+" : ""}${Math.round((a / p - 1) * 100)}%` : ""}`);
  } catch {
    lines.push("① 어제 매출: 못 읽음");
  }

  // ② 인샵 업로드 검증(가장 최근 매출일)
  try {
    const { readLatestVerify } = await import("@/lib/inshopVerify");
    const items = await readLatestVerify(1);
    if (!items.length) lines.push("② 인샵 업로드: 검증 기록 없음");
    else {
      const bad = items.filter((x: any) => x.status !== "일치");
      const d = String(items[0].date).replace(/\D/g, "");
      const md = `${Number(d.slice(4, 6))}/${Number(d.slice(6, 8))}`;
      if (!bad.length) lines.push(`② 인샵 업로드(${md}) ✅ ${items.length}건 모두 일치`);
      else {
        lines.push(`② 인샵 업로드(${md}) ⚠ 확인필요 ${bad.length}건`);
        for (const b of bad.slice(0, 6)) lines.push(`· ${b.name}(${b.channel}) ${b.status}`);
      }
    }
  } catch {
    lines.push("② 인샵 업로드: 못 읽음");
  }

  // ③ 용인·무신사 매출 반영(9:20 매출탭 갱신 결과)
  if (check) {
    const miss = [!check.yonginOk ? "용인" : "", !check.musinsaOk && !check.musinsaSkipped ? "무신사" : ""].filter(Boolean);
    lines.push(miss.length ? `③ 매출탭 ⚠ ${miss.join("·")} ${check.checkDate || ""} 매출 없음 — ERP 확인` : "③ 매출탭 ✅ 용인·무신사 반영됨");
  }

  // ④ 밤사이 쌓인 다른 알림
  const id = getDbSheetId();
  await ensureSheetExistsById(id, TAB, HEADER);
  const raw = await getSheetValuesById(id, TAB, "A:D").catch(() => [] as any[][]);
  const pending: { row: number; subject: string }[] = [];
  (raw || []).forEach((r, i) => {
    if (i === 0 || !r?.[1] || String(r?.[3] || "")) return;
    pending.push({ row: i + 1, subject: String(r[1]) });
  });
  // 인샵 검증·용인/무신사 알림은 ②③에 이미 들어 있으니 ④에선 뺌
  const others = [...new Set(pending.map((p) => p.subject).filter((s) => !/인샵 매출 업로드 확인필요|업데이트 확인필요/.test(s)))];
  if (others.length) {
    lines.push(`④ 그 외 알림 ${others.length}건`);
    for (const s of others.slice(0, 8)) lines.push(`· ${s.replace(/^\[MARK\]\s*/, "")}`);
  } else lines.push("④ 그 외 알림 없음");

  const msgs = chunk(lines);
  const results = [];
  for (const m of msgs) results.push(await sendKakaoMemo(m, undefined, { button: false })); // 점검은 눌러서 할 게 없어 버튼 없음
  const ok = results.every((r) => r.ok);
  if (ok && pending.length) {
    const sheets = await getSheetsClient();
    const stamp = kstStamp();
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: { valueInputOption: "RAW", data: pending.map((p) => ({ range: `'${TAB}'!D${p.row}`, values: [[stamp]] })) },
    });
  }
  return { ok, messages: msgs, results };
}
