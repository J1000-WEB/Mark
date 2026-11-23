// MARK 2026-11-17: 주간 IMC 프로모션 리포트용 "품번리스트" — 팀이 매주 월요일 만들던 "26년 N월 N주차 판매실적" 파일의
// 품번리스트(구분·품번·품명) + 프로모션총요약의 그룹 제목(①…)·설명(기간·적용매장)·출고여부를 MARK_DB "프로모션_품번" 시트에 보관.
// 한 줄 = 품번 하나: [구분, 순서, 품번, 품명, 출고여부, 그룹제목, 그룹설명, 전년비교(Y/N), 수정시각, 사용]
// MARK 2026-11-23 소천님: J열 "사용"(드롭다운 사용/미사용) — 시즌 바뀌어 안 쓰는 프로모션·품번은 "미사용"으로 두면 IMC 현황·회의·주간데이터 라인업 집계에서 빠짐(빈칸 = 사용).
import { getDbSheetId, getSheetValuesById, ensureSheetExistsById, safeReplaceSheetValuesById, getSheetsClient, getSheetPropsById } from "@/lib/googleSheets";

export const PROMO_SHEET = "프로모션_품번";
const HEADER = ["구분", "순서", "품번", "품명", "출고여부", "그룹제목", "그룹설명", "전년비교", "수정시각", "사용"];

export type PromoItem = { group: string; order: number; style: string; name: string; shipped: string; title: string; note: string; prevYear: boolean; active?: boolean };

const isInactive = (v: any) => /^(미사용|사용안함|N|NO|X|FALSE|0|OFF)$/i.test(String(v ?? "").trim());

const t = (v: any) => String(v ?? "").trim();

// J열 "사용"이 없으면(예전 시트) 머리글·기존 줄 "사용" 채우고 드롭다운(사용/미사용) 걸기 — 서버 인스턴스당 한 번
let activeColumnReady = false;
async function ensureActiveColumn(id: string, rowCount: number, header: any[]) {
  if (activeColumnReady) return;
  const sheets = await getSheetsClient();
  if (String(header?.[9] ?? "").trim() !== "사용") {
    const vals = [["사용"], ...Array.from({ length: Math.max(0, rowCount - 1) }, () => ["사용"])];
    await sheets.spreadsheets.values.update({ spreadsheetId: id, range: `'${PROMO_SHEET}'!J1:J${vals.length}`, valueInputOption: "RAW", requestBody: { values: vals } });
  }
  const sheetId = (await getSheetPropsById(id)).find((x) => x.title === PROMO_SHEET)?.sheetId;
  if (sheetId != null) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: [{
          setDataValidation: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 2000, startColumnIndex: 9, endColumnIndex: 10 },
            rule: { condition: { type: "ONE_OF_LIST", values: [{ userEnteredValue: "사용" }, { userEnteredValue: "미사용" }] }, showCustomUi: true, strict: false },
          },
        }],
      },
    }).catch((e: any) => console.error("프로모션_품번 사용 드롭다운 실패", e?.message));
  }
  activeColumnReady = true;
}

/** 기본은 "사용" 줄만. { all: true }면 미사용까지(active 필드로 구분) */
export async function readPromoItems(opts: { all?: boolean } = {}): Promise<PromoItem[]> {
  const id = getDbSheetId();
  await ensureSheetExistsById(id, PROMO_SHEET, HEADER);
  const raw = await getSheetValuesById(id, PROMO_SHEET, "A:J").catch(() => [] as any[]);
  await ensureActiveColumn(id, raw.length, raw[0] || []).catch((e: any) => console.error("프로모션_품번 사용 열 준비 실패", e?.message));
  const items = raw
    .slice(1)
    .filter((r: any[]) => t(r?.[0]) && t(r?.[2]))
    .map((r: any[]) => ({
      group: t(r[0]),
      order: Number(r[1]) || 0,
      style: t(r[2]).toUpperCase(),
      name: t(r[3]),
      shipped: t(r[4]),
      title: t(r[5]),
      note: t(r[6]),
      prevYear: /^(y|yes|true|1|o)$/i.test(t(r[7])),
      active: !isInactive(r[9]),
    }));
  return opts.all ? items : items.filter((x) => x.active);
}

export async function savePromoItems(items: PromoItem[]) {
  const clean = items
    .map((x) => ({ ...x, group: t(x.group), style: t(x.style).toUpperCase(), name: t(x.name), shipped: t(x.shipped), title: t(x.title), note: t(x.note) }))
    .filter((x) => x.group && x.style);
  const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
  const id = getDbSheetId();
  await ensureSheetExistsById(id, PROMO_SHEET, HEADER);
  await safeReplaceSheetValuesById(id, PROMO_SHEET, [
    HEADER,
    ...clean.map((x) => [x.group, x.order || "", x.style, x.name, x.shipped, x.title, x.note, x.prevYear ? "Y" : "N", stamp, x.active === false ? "미사용" : "사용"]),
  ]);
  return { ok: true, saved: clean.length, groups: [...new Set(clean.map((x) => x.group))] };
}
