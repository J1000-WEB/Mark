// MARK 2026-11-17: 주간 IMC 프로모션 리포트용 "품번리스트" — 팀이 매주 월요일 만들던 "26년 N월 N주차 판매실적" 파일의
// 품번리스트(구분·품번·품명) + 프로모션총요약의 그룹 제목(①…)·설명(기간·적용매장)·출고여부를 MARK_DB "프로모션_품번" 시트에 보관.
// 한 줄 = 품번 하나: [구분, 순서, 품번, 품명, 출고여부, 그룹제목, 그룹설명, 전년비교(Y/N), 수정시각]
import { getDbSheetId, getSheetValuesById, ensureSheetExistsById, safeReplaceSheetValuesById } from "@/lib/googleSheets";

export const PROMO_SHEET = "프로모션_품번";
const HEADER = ["구분", "순서", "품번", "품명", "출고여부", "그룹제목", "그룹설명", "전년비교", "수정시각"];

export type PromoItem = { group: string; order: number; style: string; name: string; shipped: string; title: string; note: string; prevYear: boolean };

const t = (v: any) => String(v ?? "").trim();

export async function readPromoItems(): Promise<PromoItem[]> {
  const id = getDbSheetId();
  await ensureSheetExistsById(id, PROMO_SHEET, HEADER);
  const raw = await getSheetValuesById(id, PROMO_SHEET, "A:I").catch(() => [] as any[]);
  return raw
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
    }));
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
    ...clean.map((x) => [x.group, x.order || "", x.style, x.name, x.shipped, x.title, x.note, x.prevYear ? "Y" : "N", stamp]),
  ]);
  return { ok: true, saved: clean.length, groups: [...new Set(clean.map((x) => x.group))] };
}
