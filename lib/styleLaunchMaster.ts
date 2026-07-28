import { getSheetValues, ensureSheetExists, appendValues } from "./googleSheets";

// MARK 6.49: 입고일(최초출고일)은 한번 정해지면 안 바뀌는 값이라, 매주 "금주/전주"를 다시 볼
// 필요가 없습니다. 딱 한 번 캡처해서 별도 시트에 저장해두고 계속 재사용합니다.

export const LAUNCH_MASTER_SHEET = "Style_Launch_Master";
export const LAUNCH_MASTER_HEADER = ["StyleCode", "LaunchDate", "CapturedAt"];

let cache: { map: Map<string, string>; loadedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function loadStyleLaunchMap(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.map;

  await ensureSheetExists(LAUNCH_MASTER_SHEET, LAUNCH_MASTER_HEADER).catch(() => {});
  const rows = await getSheetValues(LAUNCH_MASTER_SHEET, "A:C").catch(() => []);
  const map = new Map<string, string>();
  for (const row of (rows || []).slice(1)) {
    const styleCode = String(row[0] || "").trim();
    const launchDate = String(row[1] || "").trim();
    if (styleCode && launchDate) map.set(styleCode, launchDate);
  }
  cache = { map, loadedAt: Date.now() };
  return map;
}

// 새로 발견된 품번의 입고일만 추가합니다(기존 값은 절대 덮어쓰지 않음 — 불변 값이므로).
export async function seedLaunchDates(entries: { styleCode: string; launchDate: string }[]) {
  const existing = await loadStyleLaunchMap();
  const toAdd = entries.filter((e) => e.styleCode && e.launchDate && !existing.has(e.styleCode));
  if (!toAdd.length) return 0;

  const nowIso = new Date().toISOString();
  await appendValues(
    `'${LAUNCH_MASTER_SHEET}'!A:C`,
    toAdd.map((e) => [e.styleCode, e.launchDate, nowIso])
  );
  cache = null;
  return toAdd.length;
}
