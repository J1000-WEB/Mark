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

// MARK 6.56: 날씨 조건에 따른 룰 기반 행동지침. (아직 과거 날씨-매출 데이터가 충분히 안 쌓여서
// 통계적 예측이 아니라 일반적인 MD 상식 기반 팁입니다 — 데이터가 쌓이면 실측 기반으로 발전 예정)
// MARK: 멘트에 실제 최저/최고기온 숫자를 넣어서, "더운 날씨예요" 같은 막연한 말 대신
// "오늘 최고 32도로 더운 날씨예요"처럼 구체적으로 보여줍니다.
export function weatherActionTip(weather: { weather: string; maxTemp: number; minTemp: number; rainChance: number } | null) {
  if (!weather) return null;
  const cond = String(weather.weather || "");
  const isRain = weather.rainChance >= 60 || /비|rain|소나기|장마/i.test(cond);
  const isSnow = /눈|snow/i.test(cond);
  const maxT = Math.round(Number(weather.maxTemp));
  const minT = Math.round(Number(weather.minTemp));
  const tempRange = `최저 ${minT}도 · 최고 ${maxT}도`;
  const isHot = maxT >= 28;
  const isCold = maxT <= 5;

  if (isSnow) {
    return { icon: "❄️", maxTemp: maxT, minTemp: minT, text: `${tempRange}, 눈 예보가 있어요. 방문객이 줄 수 있어요 — 온라인/전화 문의 응대를 준비해두시고, 아우터·니트류를 입구 쪽에 배치해보세요.` };
  }
  if (isRain) {
    return { icon: "☔", maxTemp: maxT, minTemp: minT, text: `${tempRange}, 비 예보가 있어요. 우산 매대를 입구 앞으로, 방수 소재/아우터를 전진배치하면 좋아요. 우천 시 평소보다 방문이 줄 수 있으니 온라인 채널 프로모션도 고려해보세요.` };
  }
  if (isHot) {
    return { icon: "🌤️", maxTemp: maxT, minTemp: minT, text: `${tempRange}, 더운 날씨예요. 린넨·반팔 등 시원한 소재를 전면에, 에어컨 가까운 동선에 여름 상품을 배치해보세요.` };
  }
  if (isCold) {
    return { icon: "🧥", maxTemp: maxT, minTemp: minT, text: `${tempRange}, 쌀쌀한 날씨예요. 아우터·니트류를 입구 쪽 눈에 띄는 자리로, 매장 입구 온기에도 신경 써주세요.` };
  }
  return { icon: "🌈", maxTemp: maxT, minTemp: minT, text: `${tempRange}, 평년 수준의 날씨예요. 평소 진열을 유지하시면 될 것 같아요.` };
}
