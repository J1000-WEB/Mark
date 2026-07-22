import { getDbSheetId, getSheetValuesById } from "@/lib/googleSheets";
import { readWeatherHistory } from "@/lib/openWeather";

const STORE_FORM_SHEET = "점포형태";

function text(v: any) {
  return String(v ?? "").trim();
}

function normalizeKey(v: string) {
  return text(v).replace(/\s/g, "").toLowerCase();
}

// 점포형태 시트: C열(채널명) → K열(지역)
export async function loadStoreRegionMap(): Promise<Map<string, string>> {
  const dbId = getDbSheetId();
  const rows = await getSheetValuesById(dbId, STORE_FORM_SHEET, "A:K").catch(() => []);
  const map = new Map<string, string>();
  for (const row of rows.slice(1)) {
    const storeName = text(row?.[2]);
    const region = text(row?.[10]);
    if (storeName && region) map.set(storeName, region);
  }
  return map;
}

export async function listDistinctRegions(): Promise<string[]> {
  const map = await loadStoreRegionMap();
  return Array.from(new Set(map.values())).filter(Boolean);
}

// 매장명이 정확히 일치 안 해도(공백/대소문자 차이) 최대한 매칭합니다.
export async function getRegionForStore(storeName: string): Promise<string> {
  const map = await loadStoreRegionMap();
  if (map.has(storeName)) return map.get(storeName)!;
  const target = normalizeKey(storeName);
  for (const [name, region] of map.entries()) {
    if (normalizeKey(name) === target) return region;
  }
  return "";
}

// 특정 매장의 특정 날짜 날씨(확정 우선, 없으면 예보)를 가져옵니다. 지역 매핑이 없으면 null.
export async function getWeatherForStoreOnDate(storeName: string, dateKey: string) {
  const region = await getRegionForStore(storeName);
  if (!region) return null;

  const history = await readWeatherHistory();
  const candidates = history.filter((r) => r.region === region && r.date === dateKey);
  if (!candidates.length) return null;

  const actual = candidates.find((r) => r.source === "actual");
  return actual || candidates[0];
}
