import { ensureSheetExistsById, getSheetValuesById, updateValuesById } from "@/lib/googleSheets";

// MARK Weather 설정
// 여기에 OpenWeather API Key만 붙여넣으면 됩니다.
// 예: const OPENWEATHER_API_KEY = "abcd1234...";
export const OPENWEATHER_API_KEY = "a78c5c40b7c18d95d057f5ad1878a741";

const WEATHER_SPREADSHEET_ID = "12pDes6F0Go356pXvXNZx2egifDB4tsY2K915JN_K0Lg";
const SHEET_NAME = "Weather_History";

// MARK 6.21: 매장이 여러 시/도에 흩어져 있어서, 시/도별로 대표 도시를 하나씩 잡아
// OpenWeather를 조회합니다. (점포형태 시트 K열의 "지역"과 매칭)
export const REGION_CITY_QUERY: Record<string, string> = {
  "서울": "Seoul,KR",
  "경기": "Suwon,KR",
  "인천": "Incheon,KR",
  "강원": "Chuncheon,KR",
  "충북": "Cheongju,KR",
  "충남": "Cheonan,KR",
  "대전": "Daejeon,KR",
  "전북": "Jeonju,KR",
  "전남": "Yeosu,KR",
  "광주": "Gwangju,KR",
  "경북": "Pohang,KR",
  "경남": "Changwon,KR",
  "대구": "Daegu,KR",
  "부산": "Busan,KR",
  "울산": "Ulsan,KR",
  "세종": "Sejong,KR",
  "제주": "Jeju,KR",
};

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

function normalizeWeatherText(raw: string) {
  const value = text(raw).toLowerCase();
  if (!value || value === '-') return '-';

  const rules: Array<[RegExp, string]> = [
    [/thunder|천둥|뇌우/, "⛈️ 뇌우"],
    [/snow|sleet|눈|진눈깨비/, "❄️ 눈"],
    [/shower|소나기/, "⛈ 소나기"],
    [/rain|drizzle|비|실 비|가벼운 비|약한 비/, "🌧 비"],
    [/mist|fog|haze|박무|안개|연무/, "🌫 안개"],
    [/clear|맑음/, "☀️ 맑음"],
    [/few clouds|구름조금/, "🌤 구름조금"],
    [/scattered clouds|broken clouds|튼구름|구름 많/, "⛅ 구름많음"],
    [/overcast clouds|clouds|온흐림|흐림/, "☁️ 흐림"],
  ];

  for (const [pattern, label] of rules) {
    if (pattern.test(value)) return label;
  }

  return raw;
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
      region: text(row[2]) || "서울",
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

async function fetchOpenWeatherForecast(cityQuery: string, regionLabel: string): Promise<WeatherRecord[]> {
  if (!hasApiKey()) {
    throw new Error("lib/openWeather.ts의 OPENWEATHER_API_KEY에 API Key를 넣어주세요.");
  }

  const url = new URL("https://api.openweathermap.org/data/2.5/forecast");
  url.searchParams.set("q", cityQuery);
  url.searchParams.set("appid", OPENWEATHER_API_KEY);
  url.searchParams.set("units", "metric");
  url.searchParams.set("lang", "en");

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
      const weather = normalizeWeatherText(bucket.weatherTexts.find(Boolean) || "-");
      const avgHumidity = bucket.humidity.length ? bucket.humidity.reduce((a: number, b: number) => a + b, 0) / bucket.humidity.length : 0;
      const avgWind = bucket.wind.length ? bucket.wind.reduce((a: number, b: number) => a + b, 0) / bucket.wind.length : 0;

      return {
        date,
        source: "forecast" as const,
        region: regionLabel,
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

export async function saveAllRegionsWeatherSnapshot(regions: string[]) {
  await ensureSheetExistsById(WEATHER_SPREADSHEET_ID, SHEET_NAME, WEATHER_HEADER);

  const existing = await readWeatherHistory();
  const yesterday = ymd(kstDate(-1));
  const actualRows = existing.filter((row) => row.source === "actual");
  const forecastRows = existing.filter((row) => row.source === "forecast");
  const allNewForecasts: WeatherRecord[] = [];
  const failedRegions: string[] = [];

  const uniqueRegions = Array.from(new Set(regions.length ? regions : ["서울"]));

  for (const region of uniqueRegions) {
    const cityQuery = REGION_CITY_QUERY[region];
    if (!cityQuery) {
      failedRegions.push(`${region}(매핑없음)`);
      continue;
    }

    // MARK 6.9.1 로직을 지역별로 그대로 적용: 마지막 확정일 다음날부터 어제까지 밀린 날짜를 따라잡습니다.
    const lastActualDate = actualRows
      .filter((row) => row.region === region)
      .map((row) => row.date)
      .sort()
      .pop();

    const yesterdayDate = new Date(`${yesterday}T00:00:00`);
    const cursorStart = lastActualDate ? new Date(`${lastActualDate}T00:00:00`) : new Date(yesterdayDate);
    if (lastActualDate) cursorStart.setDate(cursorStart.getDate() + 1);

    for (const cursor = cursorStart; cursor <= yesterdayDate; cursor.setDate(cursor.getDate() + 1)) {
      const dateKey = ymd(cursor);
      const alreadyActual = actualRows.some((row) => row.date === dateKey && row.region === region);
      if (alreadyActual) continue;

      const forecastForDate = forecastRows
        .filter((row) => row.date === dateKey && row.region === region)
        .sort((a, b) => text(b.savedAt).localeCompare(text(a.savedAt)))[0];
      if (forecastForDate) {
        actualRows.push({ ...forecastForDate, source: "actual", savedAt: nowKST() });
      }
    }

    try {
      const forecasts = await fetchOpenWeatherForecast(cityQuery, region);
      allNewForecasts.push(...forecasts);
    } catch (error: any) {
      console.error(`Weather fetch failed for region ${region}:`, error);
      failedRegions.push(`${region}(${error?.message || "실패"})`);
    }
  }

  const rows = [
    WEATHER_HEADER,
    ...actualRows.sort((a, b) => a.date.localeCompare(b.date) || a.region.localeCompare(b.region)).map(toRow),
    ...allNewForecasts.map(toRow),
  ];
  const paddedRows = [...rows];
  while (paddedRows.length < 120) paddedRows.push(new Array(WEATHER_HEADER.length).fill(""));

  await updateValuesById(WEATHER_SPREADSHEET_ID, `'${SHEET_NAME}'!A1:K${paddedRows.length}`, paddedRows);

  return {
    sheetName: SHEET_NAME,
    savedAt: nowKST(),
    regions: uniqueRegions,
    failedRegions,
    actualCount: actualRows.length,
    forecastCount: allNewForecasts.length,
    records: [...actualRows, ...allNewForecasts],
  };
}

// 하위호환: 기존에 "서울"만 갱신하던 호출부가 있으면 그대로 동작하도록 남겨둡니다.
export async function saveSeoulWeatherSnapshot() {
  return saveAllRegionsWeatherSnapshot(["서울"]);
}

// ---------------------------------------------------------------------------
// MARK 2026-11-20: 전년 날씨 수집(소천님 요청) — OpenWeather 무료는 과거 실측이 없어서 Open-Meteo 과거자료(archive, 키 없음)로
// 지역별 일 최고·최저·강수를 받아 Weather_History에 source "actual"로 넣음(저장시간 칸에 "open-meteo"). 이미 있는 날짜·지역은 안 건드림.
const REGION_LATLON: Record<string, [number, number]> = {
  "서울": [37.5665, 126.978], "경기": [37.2636, 127.0286], "인천": [37.4563, 126.7052], "부산": [35.1796, 129.0756],
  "대구": [35.8714, 128.6014], "대전": [36.3504, 127.3845], "광주": [35.1595, 126.8526], "울산": [35.5384, 129.3114],
  "충북": [36.6424, 127.489], "충남": [36.8151, 127.1139], "전남": [34.7604, 127.6622], "경남": [35.228, 128.6811],
  "경북": [36.019, 129.3435], "강원": [37.8813, 127.7298], "전북": [35.8242, 127.148], "세종": [36.48, 127.289], "제주": [33.4996, 126.5312],
};
function wmoText(code: number) {
  if (code >= 95) return "⛈️ 뇌우";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "❄️ 눈";
  if (code >= 80 && code <= 82) return "⛈ 소나기";
  if (code >= 51 && code <= 67) return "🌧 비";
  if (code === 45 || code === 48) return "🌫 안개";
  if (code === 0) return "☀️ 맑음";
  if (code === 1) return "🌤 구름조금";
  if (code === 2) return "⛅ 구름많음";
  return "☁️ 흐림";
}
export async function backfillWeatherArchive(opts: { from: string; to: string; regions?: string[]; dryRun?: boolean }) {
  const regions = (opts.regions && opts.regions.length ? opts.regions : ["서울"]).filter((r) => REGION_LATLON[r]);
  await ensureSheetExistsById(WEATHER_SPREADSHEET_ID, SHEET_NAME, WEATHER_HEADER);
  const existing = await readWeatherHistory();
  const actualRows = existing.filter((r) => r.source === "actual");
  const forecastRows = existing.filter((r) => r.source === "forecast");
  const have = new Set(actualRows.map((r) => `${r.date}|${r.region}`));
  const added: WeatherRecord[] = [];
  const perRegion: Record<string, number> = {};
  for (const region of regions) {
    const [lat, lon] = REGION_LATLON[region];
    const u = new URL("https://archive-api.open-meteo.com/v1/archive");
    u.searchParams.set("latitude", String(lat));
    u.searchParams.set("longitude", String(lon));
    u.searchParams.set("start_date", opts.from);
    u.searchParams.set("end_date", opts.to);
    u.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code");
    u.searchParams.set("timezone", "Asia/Seoul");
    const res = await fetch(u.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`Open-Meteo ${region} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j: any = await res.json();
    const d = j.daily || {};
    let n = 0;
    (d.time || []).forEach((date: string, i: number) => {
      const mx = d.temperature_2m_max?.[i], mn = d.temperature_2m_min?.[i];
      if (mx == null || mn == null || have.has(`${date}|${region}`)) return;
      added.push({
        date, source: "actual", region, maxTemp: round1(mx), minTemp: round1(mn), weather: wmoText(Number(d.weather_code?.[i] ?? 3)),
        rainChance: 0, rainMm: round1(Number(d.precipitation_sum?.[i] || 0)), humidity: 0, windSpeed: 0, savedAt: "open-meteo",
      });
      n++;
    });
    perRegion[region] = n;
  }
  if (!opts.dryRun && added.length) {
    const all = [...actualRows, ...added].sort((a, b) => a.date.localeCompare(b.date) || a.region.localeCompare(b.region));
    const rows = [WEATHER_HEADER, ...all.map(toRow), ...forecastRows.map(toRow)];
    await updateValuesById(WEATHER_SPREADSHEET_ID, `'${SHEET_NAME}'!A1:K${rows.length}`, rows);
  }
  return { added: added.length, perRegion, sample: added.slice(0, 3), dryRun: !!opts.dryRun };
}
