import { ensureSheetExistsById, getSheetValuesById, updateValuesById } from "@/lib/googleSheets";

// MARK Weather 설정
// 여기에 OpenWeather API Key만 붙여넣으면 됩니다.
// 예: const OPENWEATHER_API_KEY = "abcd1234...";
export const OPENWEATHER_API_KEY = "a78c5c40b7c18d95d057f5ad1878a741";

const WEATHER_SPREADSHEET_ID = "12pDes6F0Go356pXvXNZx2egifDB4tsY2K915JN_K0Lg";
const SHEET_NAME = "Weather_History";
const CITY_QUERY = "Seoul,KR";
const REGION_LABEL = "서울";

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
];

export type WeatherRecord = {
  date: string;
  source: "actual" | "forecast";
  region: string;
  maxTemp: number;
  minTemp: number;
  weather: string;
  rainChance: number;
  rainMm: number;
  humidity: number;
  windSpeed: number;
  savedAt: string;
};

function text(v: any) {
  return String(v ?? "").trim();
}

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}

function kstDate(offsetDays = 0) {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  kst.setDate(kst.getDate() + offsetDays);
  return kst;
}

function ymd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function nowKST() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function hasApiKey() {
  return OPENWEATHER_API_KEY && !OPENWEATHER_API_KEY.includes("여기에_");
}

function parseRows(rows: any[][]): WeatherRecord[] {
  return rows.slice(1)
    .map((row) => ({
      date: text(row[0]),
      source: text(row[1]) === "actual" ? "actual" as const : "forecast" as const,
      region: text(row[2]) || REGION_LABEL,
      maxTemp: num(row[3]),
      minTemp: num(row[4]),
      weather: text(row[5]),
      rainChance: num(row[6]),
      rainMm: num(row[7]),
      humidity: num(row[8]),
      windSpeed: num(row[9]),
      savedAt: text(row[10]),
    }))
    .filter((row) => row.date);
}

function toRow(record: WeatherRecord) {
  return [
    record.date,
    record.source,
    record.region,
    record.maxTemp,
    record.minTemp,
    record.weather,
    record.rainChance,
    record.rainMm,
    record.humidity,
    record.windSpeed,
    record.savedAt,
  ];
}

async function fetchOpenWeatherForecast(): Promise<WeatherRecord[]> {
  if (!hasApiKey()) {
    throw new Error("lib/openWeather.ts의 OPENWEATHER_API_KEY에 API Key를 넣어주세요.");
  }

  const url = new URL("https://api.openweathermap.org/data/2.5/forecast");
  url.searchParams.set("q", CITY_QUERY);
  url.searchParams.set("appid", OPENWEATHER_API_KEY);
  url.searchParams.set("units", "metric");
  url.searchParams.set("lang", "kr");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenWeather 호출 실패: ${res.status} ${body}`);
  }

  const data = await res.json();
  const grouped = new Map<string, any>();

  for (const item of data?.list || []) {
    const date = text(item?.dt_txt).slice(0, 10);
    if (!date) continue;

    if (!grouped.has(date)) {
      grouped.set(date, {
        temps: [],
        weatherTexts: [],
        rainChance: 0,
        rainMm: 0,
        humidity: [],
        wind: [],
      });
    }

    const bucket = grouped.get(date);
    bucket.temps.push(num(item?.main?.temp));
    bucket.weatherTexts.push(text(item?.weather?.[0]?.description));
    bucket.rainChance = Math.max(bucket.rainChance, num(item?.pop) * 100);
    bucket.rainMm += num(item?.rain?.["3h"]);
    bucket.humidity.push(num(item?.main?.humidity));
    bucket.wind.push(num(item?.wind?.speed));
  }

  const savedAt = nowKST();
  return Array.from(grouped.entries())
    .map(([date, bucket]) => {
      const weather = bucket.weatherTexts.find(Boolean) || "-";
      const avgHumidity = bucket.humidity.length ? bucket.humidity.reduce((a: number, b: number) => a + b, 0) / bucket.humidity.length : 0;
      const avgWind = bucket.wind.length ? bucket.wind.reduce((a: number, b: number) => a + b, 0) / bucket.wind.length : 0;

      return {
        date,
        source: "forecast" as const,
        region: REGION_LABEL,
        maxTemp: Math.round(Math.max(...bucket.temps)),
        minTemp: Math.round(Math.min(...bucket.temps)),
        weather,
        rainChance: Math.round(bucket.rainChance),
        rainMm: round1(bucket.rainMm),
        humidity: Math.round(avgHumidity),
        windSpeed: round1(avgWind),
        savedAt,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function readWeatherHistory() {
  await ensureSheetExistsById(WEATHER_SPREADSHEET_ID, SHEET_NAME, WEATHER_HEADER);
  const rows = await getSheetValuesById(WEATHER_SPREADSHEET_ID, SHEET_NAME, "A:K").catch(() => []);
  return parseRows(rows);
}

export async function saveSeoulWeatherSnapshot() {
  await ensureSheetExistsById(WEATHER_SPREADSHEET_ID, SHEET_NAME, WEATHER_HEADER);

  const existing = await readWeatherHistory();
  const yesterday = ymd(kstDate(-1));
  const actualRows = existing.filter((row) => row.source === "actual");

  // OpenWeather 무료 5일/3시간 예보 API에는 과거 실제 날씨가 없으므로,
  // 전날 저장되어 있던 forecast를 다음날 00시에 actual로 확정 저장합니다.
  const hasYesterdayActual = actualRows.some((row) => row.date === yesterday && row.region === REGION_LABEL);
  if (!hasYesterdayActual) {
    const yesterdayForecast = existing
      .filter((row) => row.source === "forecast" && row.date === yesterday && row.region === REGION_LABEL)
      .sort((a, b) => text(b.savedAt).localeCompare(text(a.savedAt)))[0];
    if (yesterdayForecast) {
      actualRows.push({ ...yesterdayForecast, source: "actual", savedAt: nowKST() });
    }
  }

  const forecasts = await fetchOpenWeatherForecast();
  const rows = [WEATHER_HEADER, ...actualRows.sort((a, b) => a.date.localeCompare(b.date)).map(toRow), ...forecasts.map(toRow)];
  const paddedRows = [...rows];
  while (paddedRows.length < 120) paddedRows.push(new Array(WEATHER_HEADER.length).fill(""));

  // 기존 예보 행이 더 많았던 경우를 대비해 A:K 일부를 빈 행으로 같이 덮어씁니다.
  await updateValuesById(WEATHER_SPREADSHEET_ID, `'${SHEET_NAME}'!A1:K${paddedRows.length}`, paddedRows);

  return {
    sheetName: SHEET_NAME,
    savedAt: nowKST(),
    actualCount: actualRows.length,
    forecastCount: forecasts.length,
    records: [...actualRows, ...forecasts],
  };
}
