// MARK 2026-11-18: 상품 기준표 — 주간데이터(품번구분/컬러구분)에 붙는 표시용 목록. MARK_DB "상품_기준표" 탭.
// 한 줄 = [구분, 품번, 칼라, 값, 수정시각]
//   구분 "재런칭": 품번=새 코드, 값=예전 코드(둘 다 재런칭 표시). 칼라 비움.
//   구분 "라인업": 품번(+칼라, 비면 품번 전체) → 값=라인업 이름(온도컷·월레스·아르노 등).
// 처음 값은 팀 엑셀 "주간판매데이터_261116월"의 `재런칭`·`라인업` 시트에서 옮김.
import { getDbSheetId, getSheetValuesById, ensureSheetExistsById, safeReplaceSheetValuesById } from "@/lib/googleSheets";

export const PRODUCT_REF_SHEET = "상품_기준표";
const HEADER = ["구분", "품번", "칼라", "값", "수정시각"];
export type ProductRef = { kind: string; style: string; color: string; value: string };
const t = (v: any) => String(v ?? "").trim();

export async function readProductRefs(): Promise<ProductRef[]> {
  const id = getDbSheetId();
  await ensureSheetExistsById(id, PRODUCT_REF_SHEET, HEADER);
  const raw = await getSheetValuesById(id, PRODUCT_REF_SHEET, "A:D").catch(() => [] as any[]);
  return raw
    .slice(1)
    .filter((r: any[]) => t(r?.[0]) && t(r?.[1]))
    .map((r: any[]) => ({ kind: t(r[0]), style: t(r[1]).toUpperCase(), color: t(r[2]).toUpperCase(), value: t(r[3]) }));
}

export async function saveProductRefs(items: ProductRef[]) {
  const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
  const clean = items.map((x) => ({ kind: t(x.kind), style: t(x.style).toUpperCase(), color: t(x.color).toUpperCase(), value: t(x.value) })).filter((x) => x.kind && x.style);
  const id = getDbSheetId();
  await ensureSheetExistsById(id, PRODUCT_REF_SHEET, HEADER);
  await safeReplaceSheetValuesById(id, PRODUCT_REF_SHEET, [HEADER, ...clean.map((x) => [x.kind, x.style, x.color, x.value, stamp])]);
  return { ok: true, saved: clean.length };
}

/** 재런칭 품번 집합(새 코드·예전 코드 둘 다), 라인업: "품번|칼라" 또는 "품번|" → 이름 */
export function buildRefMaps(refs: ProductRef[]) {
  const relaunch = new Set<string>();
  const main = new Map<string, string>(); // 새 품번 → 통합(메인) 품번
  const lineup = new Map<string, string>();
  for (const r of refs) {
    if (r.kind === "재런칭") {
      relaunch.add(r.style);
      if (r.value) { relaunch.add(r.value.toUpperCase()); main.set(r.style, r.value.toUpperCase()); }
    } else if (r.kind === "라인업") {
      lineup.set(`${r.style}|${r.color}`, r.value);
    }
  }
  const lineupOf = (style: string, color = "") => lineup.get(`${style}|${color}`) || lineup.get(`${style}|`) || (color ? "" : [...lineup.entries()].find(([k]) => k.startsWith(`${style}|`))?.[1] || "");
  const mainOf = (style: string) => main.get(style) || style;
  return { relaunch, lineupOf, mainOf };
}
