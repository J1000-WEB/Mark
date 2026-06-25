import {
  appendValuesById,
  ensureSheetExistsById,
  getSheetId,
  getSheetValuesById,
  updateValuesById,
  getSheetsClient,
} from "@/lib/googleSheets";

export const WEATHER_SHEET_NAME = "Weather_History";

export const WEATHER_HEADER = [
  "날짜",
  "구분",
  "지역",
  "최고기온",
  "최저기온",
  "날씨",
  "강수확률",
  "강수량",
  "습도",
  "풍속",
  "저장시간",
  "source",
];

const SEOUL = { city: "Seoul,KR", lat: 37.5665, lon: 126.9780, label: "서울" };

type WeatherRecord = {
  date: string;
  type: "actual" | "forecast";
  region: string;
  maxTemp: number | string;
  minTemp: number | string;
  weather: string;
  rainChance: number | string;
  rainAmount: number | string;
  humidity: number | string;
  wind: number | string;
  savedAt: string;
  source: string;
};

function text(v: any) {
  return String(v ?? "").trim();
}

function num(v: any) {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function round(value: number, digit = 0) {
  const p = Math.pow(10, digit);
  return Math.round(value * p) / p;
}

function kstDate(offsetDays = 0) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() + offsetDays);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function nowKST() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function getWeatherSheetId() {
  return process.env.GOOGLE_SHEET_ID_WEATHER || process.env.GOOGLE_WEATHER_SHEET_ID || getSheetId();
}

function rowToRecord(row: any[]): WeatherRecord {
  return {
    date: text(row[0]),
    type: text(row[1]) === "actual" ? "actual" : "forecast",
    region: text(row[2]) || SEOUL.label,
    maxTemp: row[3] ?? "",
    minTemp: row[4] ?? "",
    weather: text(row[5]),
    rainChance: row[6] ?? "",
    rainAmount: row[7] ?? "",
    humidity: row[8] ?? "",
    wind: row[9] ?? "",
    savedAt: text(row[10]),
    source: text(row[11]),
  };
}

function recordToRow(r: WeatherRecord) {
  return [r.date, r.type, r.region, r.maxTemp, r.minTemp, r.weather, r.rainChance, r.rainAmount, r.humidity, r.wind, r.savedAt, r.source];
}

function weatherPriority(description: string) {
  const s = text(description);
  if (/비|rain|소나기|폭우/i.test(s)) return 10;
  if (/눈|snow/i.test(s)) return 9;
  if (/천둥|thunder/i.test(s)) return 8;
  if (/흐림|cloud/i.test(s)) return 5;
  if (/맑|clear/i.test(s)) return 2;
  return 1;
}

function pickDailyWeather(items: any[]) {
  const sorted = [...items].sort((a, b) => weatherPriority(b?.weather?.[0]?.description) - weatherPriority(a?.weather?.[0]?.description));
  return text(sorted[0]?.weather?.[0]?.description || sorted[0]?.weather?.[0]?.main || "");
}

function summarizeForecastList(list: any[], savedAt: string): WeatherRecord[] {
  const grouped = new Map<string, any[]>();
  for (const item of list || []) {
    const date = text(item?.dt_txt).slice(0, 10);
    if (!date) continue;
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(item);
  }

  return [...grouped.entries()].map(([date, items]) => {
    const temps = items.flatMap((x) => [num(x?.main?.temp_min || x?.main?.temp), num(x?.main?.temp_max || x?.main?.temp)]);
    const humidities = items.map((x) => num(x?.main?.humidity)).filter((x) => Number.isFinite(x));
    const winds = items.map((x) => num(x?.wind?.speed)).filter((x) => Number.isFinite(x));
    const pop = Math.max(...items.map((x) => num(x?.pop))) * 100;
    const rain = items.reduce((sum, x) => sum + num(x?.rain?.["3h"] || 0) + num(x?.snow?.["3h"] || 0), 0);

    return {
      date,
      type: "forecast",
      region: SEOUL.label,
      maxTemp: round(Math.max(...temps), 0),
      minTemp: round(Math.min(...temps), 0),
      weather: pickDailyWeather(items),
      rainChance: round(pop, 0),
      rainAmount: round(rain, 1),
      humidity: humidities.length ? round(humidities.reduce((a, b) => a + b, 0) / humidities.length, 0) : "",
      wind: winds.length ? round(winds.reduce((a, b) => a + b, 0) / winds.length, 1) : "",
      savedAt,
      source: "openweather_forecast_5day_3h",
    };
  });
}

async function clearSheetRange(spreadsheetId: string, sheetName: string, range = "A2:L") {
  const sheets = await getSheetsClient();
  const escaped = sheetName.replace(/'/g, "''");
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${escaped}'!${range}` });
}

async function fetchOpenWeatherForecast() {
  const apiKey = process.env.OPENWEATHER_API_KEY || process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY;
  if (!apiKey) throw new Error("OPENWEATHER_API_KEY is not set");

  const url = new URL("https://api.openweathermap.org/data/2.5/forecast");
  url.searchParams.set("lat", String(SEOUL.lat));
  url.searchParams.set("lon", String(SEOUL.lon));
  url.searchParams.set("appid", apiKey);
  url.searchParams.set("units", "metric");
  url.searchParams.set("lang", "kr");

  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || `OpenWeather request failed: ${res.status}`);
  return json;
}

export async function readWeatherHistory() {
  const spreadsheetId = getWeatherSheetId();
  await ensureSheetExistsById(spreadsheetId, WEATHER_SHEET_NAME, WEATHER_HEADER);
  const rows = await getSheetValuesById(spreadsheetId, WEATHER_SHEET_NAME, "A:L").catch(() => []);
  return rows.slice(1).map(rowToRecord).filter((r) => r.date);
}

export async function saveDailySeoulWeather() {
  const spreadsheetId = getWeatherSheetId();
  await ensureSheetExistsById(spreadsheetId, WEATHER_SHEET_NAME, WEATHER_HEADER);

  const savedAt = nowKST();
  const existing = await readWeatherHistory();
  const yesterday = kstDate(-1);
  const latestYesterday = [...existing]
    .filter((r) => r.date === yesterday && r.region === SEOUL.label)
    .sort((a, b) => text(b.savedAt).localeCompare(text(a.savedAt)))[0];

  const actualYesterday: WeatherRecord | null = latestYesterday ? {
    ...latestYesterday,
    type: "actual",
    savedAt,
    source: latestYesterday.source === "openweather_history" ? "openweather_history" : "forecast_finalized_as_actual",
  } : null;

  const forecastJson = await fetchOpenWeatherForecast();
  const forecasts = summarizeForecastList(forecastJson?.list || [], savedAt);

  const merged = new Map<string, WeatherRecord>();
  for (const row of existing) {
    // 오늘 이후 예보는 새 호출값으로 교체하고, 과거 actual은 보존합니다.
    if (row.type === "forecast" && row.date >= kstDate(0)) continue;
    merged.set(`${row.date}|${row.type}|${row.region}`, row);
  }
  if (actualYesterday) merged.set(`${actualYesterday.date}|actual|${actualYesterday.region}`, actualYesterday);
  for (const row of forecasts) merged.set(`${row.date}|forecast|${row.region}`, row);

  const rows = [...merged.values()].sort((a, b) => `${a.date}-${a.type}`.localeCompare(`${b.date}-${b.type}`));
  await clearSheetRange(spreadsheetId, WEATHER_SHEET_NAME);
  if (rows.length) {
    await appendValuesById(spreadsheetId, `'${WEATHER_SHEET_NAME}'!A:L`, rows.map(recordToRow));
  }

  return {
    savedAt,
    region: SEOUL.label,
    actualSaved: Boolean(actualYesterday),
    forecastDays: forecasts.length,
    rows: rows.length,
  };
}

export function pickWeatherForDate(records: WeatherRecord[], date: string) {
  return records.find((r) => r.date === date && r.type === "actual") || records.find((r) => r.date === date && r.type === "forecast") || null;
}
