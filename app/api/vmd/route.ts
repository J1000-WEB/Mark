import { NextResponse } from "next/server";
import { getDbSheetId, getSheetValues, getSheetValuesById, getSpreadsheetTitlesById } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function text(v: any) {
  return String(v ?? "").trim();
}

function normalizeKey(v: any) {
  return text(v)
    .replace(/^오프라인[_\s-]*/i, "")
    .replace(/점$/g, "")
    .replace(/[\s_\-·.()]/g, "")
    .toLowerCase();
}

function displayStoreName(v: any) {
  const raw = text(v).replace(/^오프라인[_\s-]*/i, "").trim();
  const key = normalizeKey(raw);
  const aliases: Record<string, string> = {
    "성수플래그십스토어": "성수 플래그십 스토어",
    "성수플래그십": "성수 플래그십 스토어",
    "성수flagship": "성수 플래그십 스토어",
    "한남": "한남점",
    "한남플래그십": "한남점",
    "신사플래그십": "신사점",
    "아이파크몰용산": "아이파크몰 용산점",
    "용산아이파크몰": "아이파크몰 용산점",
    "타임스퀘어영등포": "타임스퀘어 영등포점",
    "광주신세계": "신세계 광주점",
    "신세계광주": "신세계 광주점",
  };
  return aliases[key] || raw;
}

function isExcludedStoreName(v: any) {
  const raw = text(v);
  const key = normalizeKey(raw);
  return (
    !raw ||
    raw === "합계" ||
    raw === "채널명" ||
    key.includes("온라인") ||
    key.includes("글로벌") ||
    key === "기타" ||
    key.startsWith("기타") ||
    key.includes("직원구매") ||
    key.includes("물류") ||
    key.includes("위탁") ||
    key.includes("면세")
  );
}

function isOfflineTeamValue(v: any) {
  return normalizeKey(v).includes("오프라인팀");
}

function parseDateKey(v: any) {
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return toYmd(d);
  }
  const s = text(v);
  const m = s.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return toYmd(d);
  return "";
}

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

function monthKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

function formatMd(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return `${m}/${d}`;
}

function pickTitle(titles: string[], candidates: string[], fallback: string) {
  const normMap = new Map(titles.map((t) => [normalizeKey(t), t]));
  for (const c of candidates) {
    const found = normMap.get(normalizeKey(c));
    if (found) return found;
  }
  return titles.includes(fallback) ? fallback : "";
}

function parseVmdSchedule(rows: any[][]) {
  return rows.slice(1)
    .map((row) => {
      const date = parseDateKey(row[0]);
      return {
        date,
        month: date ? monthKey(date) : "",
        dayLabel: date ? formatMd(date) : "",
        who: text(row[1]) || "기타",
        content: text(row[2]),
      };
    })
    .filter((r) => r.date && r.content);
}

async function loadStoreListFromDailySales() {
  const dbId = getDbSheetId();
  const titles = await getSpreadsheetTitlesById(dbId).catch(() => []);
  const sheetName = pickTitle(titles, ["일간매출(26년)", "일간매출26년", "일간매출", "Daily_Store_Sales"], "일간매출(26년)");
  if (!sheetName) return { sheetName: "", stores: [] as string[] };
  const rows = await getSheetValuesById(dbId, sheetName, "A:ZZ").catch(() => []);
  const metaLimit = Math.min(rows.length, 20);
  let teamRow = -1;
  for (let r = 0; r < metaLimit; r++) {
    const count = (rows[r] || []).filter((cell) => isOfflineTeamValue(cell)).length;
    if (count >= 1) {
      teamRow = r;
      break;
    }
  }
  if (teamRow < 0) return { sheetName, stores: [] as string[] };

  const channelNameRow = Math.max(0, teamRow - 1);
  const channelCodeRow = Math.max(0, teamRow - 2);
  const team = rows[teamRow] || [];
  const channelNames = rows[channelNameRow] || [];
  const channelCodes = rows[channelCodeRow] || [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (let c = 7; c < Math.max(team.length, channelNames.length, channelCodes.length); c++) {
    const teamName = text(team[c]);
    if (!isOfflineTeamValue(teamName)) continue;
    const rawName = text(channelNames[c]) || text(channelCodes[c]);
    if (isExcludedStoreName(rawName) || normalizeKey(teamName).includes("온라인") || normalizeKey(teamName).includes("글로벌") || normalizeKey(teamName).includes("기타")) continue;
    const storeName = displayStoreName(rawName);
    const key = normalizeKey(storeName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(storeName);
  }
  return { sheetName, stores: out.sort((a, b) => a.localeCompare(b, "ko")) };
}

function buildInsights(events: any[], stores: string[]) {
  const today = toYmd(new Date());
  const storeKeys = new Map(stores.map((s) => [normalizeKey(s), s]));
  const visitEvents = events.filter((e) => storeKeys.has(normalizeKey(e.content)));
  const visitedKeys = new Set(visitEvents.map((e) => normalizeKey(e.content)));
  const unvisited = stores.filter((s) => !visitedKeys.has(normalizeKey(s)));
  const upcoming = visitEvents.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const oldCutoff = addDays(today, -30);
  const recentlyVisited = new Set(visitEvents.filter((e) => e.date >= oldCutoff && e.date <= today).map((e) => normalizeKey(e.content)));
  const longNoVisit = stores.filter((s) => !recentlyVisited.has(normalizeKey(s)));

  const insights = [] as any[];
  if (unvisited.length) {
    insights.push({ tone: "amber", title: `미방문 매장 ${unvisited.length}개`, body: `${unvisited.slice(0, 8).join(", ")}${unvisited.length > 8 ? " 외" : ""} 일정이 등록되지 않았습니다.` });
  } else {
    insights.push({ tone: "green", title: "전체 커버리지 등록", body: "기준 매장 전체에 VMD 라운딩 일정이 등록되어 있습니다." });
  }
  if (longNoVisit.length) {
    insights.push({ tone: "rose", title: `30일 이상 미방문 ${longNoVisit.length}개`, body: `${longNoVisit.slice(0, 8).join(", ")}${longNoVisit.length > 8 ? " 외" : ""} 우선 방문을 검토하세요.` });
  }
  if (upcoming[0]) {
    insights.push({ tone: "purple", title: "다음 라운딩", body: `${upcoming[0].dayLabel} · ${upcoming[0].content} (${upcoming[0].who}) 일정이 예정되어 있습니다.` });
  }
  return { visitEvents, unvisited, longNoVisit, upcoming, insights };
}

export async function GET() {
  try {
    const [scheduleRows, storePayload] = await Promise.all([
      getSheetValues("VMD_SCHEDULE", "A:C").catch(() => []),
      loadStoreListFromDailySales(),
    ]);
    const events = parseVmdSchedule(scheduleRows || []);
    const stores = storePayload.stores;
    const computed = buildInsights(events, stores);
    return NextResponse.json({
      ok: true,
      source: {
        scheduleSheet: "VMD_SCHEDULE",
        storeSource: storePayload.sheetName || "일간매출(26년)",
      },
      events,
      stores,
      ...computed,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("VMD dashboard load failed", error);
    return NextResponse.json({ ok: false, error: error?.message || "VMD 데이터를 불러오지 못했습니다.", events: [], stores: [] }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
