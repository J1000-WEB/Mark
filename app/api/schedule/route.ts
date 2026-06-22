import { NextResponse } from "next/server";
import { getSheetId, getSheetValuesById, getSpreadsheetTitlesById } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function text(v: any) {
  return String(v ?? "").trim();
}

function normalize(v: any) {
  return text(v).replace(/[\s_\-·./()▶️]/g, "").toLowerCase();
}

function pickScheduleSheet(titles: string[]) {
  const exact = titles.find((title) => title === "Schedule_Simple");
  if (exact) return exact;

  return titles.find((title) => {
    const n = normalize(title);
    return n.includes("schedule") && n.includes("simple");
  }) || titles.find((title) => normalize(title).includes("전체판매상")) || "";
}

function isEmptyRow(row: any[]) {
  return !row || row.every((cell) => !text(cell));
}

function findHeaderIndex(rows: any[][]) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const rowText = rows[i].map(text).join(" ");
    if (rowText.includes("점포") || rowText.includes("날짜") || rowText.includes("일자") || rowText.includes("구분") || rowText.includes("내용")) return i;
  }
  return 0;
}

function parseDate(value: any) {
  if (!value) return "";
  if (typeof value === "number") {
    // Google serial date fallback
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  const s = text(value);
  const m = s.match(/(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;

  const m2 = s.match(/(\d{1,2})[-./]\s*(\d{1,2})/);
  if (m2) {
    const year = new Date().getFullYear();
    return `${year}-${String(m2[1]).padStart(2, "0")}-${String(m2[2]).padStart(2, "0")}`;
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return "";
}

function getField(row: Record<string, string>, candidates: string[]) {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const key = keys.find((k) => normalize(k).includes(normalize(candidate)) || normalize(candidate).includes(normalize(k)));
    if (key && text(row[key])) return text(row[key]);
  }
  return "";
}

function inferCategory(row: Record<string, string>) {
  const combined = Object.values(row).map(text).join(" ");
  const s = combined.toLowerCase();

  if (/휴무|근무|라운딩|스케줄|교육|인플루언서|촬영|미팅/.test(combined)) return "schedule";
  if (/vm|vmd|진열|연출|마네킹|매장구성|윈도우/.test(combined)) return "vmd";
  if (/프로모션|할인|쿠폰|사은품|증정|더블쇼|세일|upto|행사|페이백|마일리지/.test(combined) || /sale|coupon|promo|promotion|payback/i.test(s)) return "promotion";
  if (/목표|실적|달성|신장|기온|날씨/.test(combined)) return "performance";
  return "general";
}

function categoryLabel(category: string) {
  const map: Record<string, string> = {
    promotion: "프로모션",
    vmd: "VMD",
    schedule: "스케줄",
    performance: "실적",
    general: "기타",
  };
  return map[category] || "기타";
}

function parseRows(rows: any[][]) {
  if (!rows.length) return { headers: [], rows: [], events: [] };

  const headerIndex = findHeaderIndex(rows);
  const headers = (rows[headerIndex] || []).map((cell, idx) => text(cell) || `Column${idx + 1}`);
  const body = rows.slice(headerIndex + 1)
    .filter((row) => !isEmptyRow(row))
    .map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((header, idx) => {
        obj[header] = text(row[idx]);
      });
      return obj;
    });

  const events = body.map((row, idx) => {
    const dateRaw = getField(row, ["날짜", "일자", "일", "date"]);
    const startRaw = getField(row, ["시작일", "시작", "start"]);
    const endRaw = getField(row, ["종료일", "종료", "end"]);
    const categoryRaw = getField(row, ["구분", "분류", "category"]);
    const store = getField(row, ["점포", "매장", "채널", "store"]);
    const title = getField(row, ["내용", "행사", "프로모션", "제목", "title"]) || Object.values(row).find((v) => text(v)) || "일정";
    const memo = getField(row, ["비고", "메모", "상세", "memo"]);
    const category = categoryRaw ? inferCategory({ ...row, _category: categoryRaw }) : inferCategory(row);

    return {
      id: `SCH-${idx + 1}`,
      date: parseDate(dateRaw || startRaw),
      startDate: parseDate(startRaw || dateRaw),
      endDate: parseDate(endRaw || startRaw || dateRaw),
      category,
      categoryLabel: categoryLabel(category),
      store,
      title,
      memo,
      raw: row,
    };
  }).filter((event) => event.date || event.startDate || event.endDate || event.title);

  return { headers, rows: body, events };
}

export async function GET() {
  try {
    // Schedule_Simple은 MARK_DB가 아니라 메인 스프레드시트,
    // 즉 RT_Result가 있는 GOOGLE_SHEET_ID에서 읽습니다.
    const spreadsheetId = getSheetId();
    const titles = await getSpreadsheetTitlesById(spreadsheetId);
    const sheetName = pickScheduleSheet(titles);

    if (!sheetName) {
      return NextResponse.json({
        ok: false,
        error: "메인 스프레드시트에서 Schedule_Simple 시트를 찾지 못했습니다.",
        sheetName: "",
        headers: [],
        rows: [],
        events: [],
      }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    const values = await getSheetValuesById(spreadsheetId, sheetName, "A:AZ");
    const parsed = parseRows(values);

    return NextResponse.json({
      ok: true,
      sheetName,
      headers: parsed.headers,
      rows: parsed.rows,
      events: parsed.events,
      generatedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error?.message || "판매전체상 데이터를 불러오지 못했습니다.",
      sheetName: "",
      headers: [],
      rows: [],
      events: [],
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
