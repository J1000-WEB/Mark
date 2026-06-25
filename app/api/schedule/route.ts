import { NextResponse } from "next/server";
import { getSheetId, getSheetValuesById, getSpreadsheetTitlesById } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function text(v: any) {
  return String(v ?? "").trim();
}

function normalizeSheetName(name: string) {
  return text(name).replace(/[\\/\s_\-·.]/g, "").replace(/[()]/g, "");
}

function pickScheduleSheet(titles: string[]) {
  if (titles.includes("Schedule_Simple")) return "Schedule_Simple";
  const found = titles.find((t) => normalizeSheetName(t).includes("ScheduleSimple") || normalizeSheetName(t).includes("판매전체상"));
  return found || "Schedule_Simple";
}

function parseDate(v: any) {
  const s = text(v).replace(/[./]/g, "-").slice(0, 10);
  const parts = s.split("-").map((x) => Number(x));
  if (parts.length >= 3 && parts.every((x) => Number.isFinite(x))) {
    const y = parts[0] < 100 ? parts[0] + 2000 : parts[0];
    return `${y}-${String(parts[1]).padStart(2, "0")}-${String(parts[2]).padStart(2, "0")}`;
  }
  const d = new Date(text(v));
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TEAM_MEMBERS = ["지승현", "최다은", "손민지", "한선아", "소재천", "이용훈", "조지현"];

function categoryOf(largeCategory: string, group: string, content: string) {
  const s = `${largeCategory} ${group} ${content}`.toLowerCase();
  if (/프로모션|행사|promotion|sale/.test(s)) return "promotion";
  if (/vmd|비주얼|집기|연출/.test(s)) return "vmd";
  if (/회의|미팅|meeting/.test(s)) return "meeting";
  if (/상품|입고|출시|product/.test(s)) return "product";
  if (/실적|성과|performance/.test(s)) return "performance";
  if (/휴무|스케줄|근무|연차|반차/.test(s)) return "schedule";
  return "general";
}

export async function GET() {
  try {
    const spreadsheetId = getSheetId();
    const titles = await getSpreadsheetTitlesById(spreadsheetId);
    const sheetName = pickScheduleSheet(titles);
    const rows = await getSheetValuesById(spreadsheetId, sheetName, "A:E");

    const events = rows.slice(1).map((row, idx) => {
      const startDate = parseDate(row[0]);
      const endDate = parseDate(row[1]) || startDate;
      const largeCategory = text(row[2]);
      const group = text(row[3]);
      const content = text(row[4]);
      const category = categoryOf(largeCategory, group, content);
      const person = TEAM_MEMBERS.find((name) => `${largeCategory} ${group} ${content}`.includes(name)) || "";
      return {
        id: `schedule-${idx + 2}`,
        startDate,
        endDate,
        largeCategory,
        category,
        categoryLabel: largeCategory || category,
        person,
        rowKey: person ? `staff:${person}` : category,
        group,
        content,
        title: content || group || largeCategory || "일정",
        displayTitle: content || group || largeCategory || "일정",
        raw: { startDate: row[0], endDate: row[1], largeCategory: row[2], group: row[3], content: row[4] },
      };
    }).filter((event) => event.startDate && event.title);

    return NextResponse.json({ ok: true, sheetName, events }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Schedule_Simple을 불러오지 못했습니다.", events: [] }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
