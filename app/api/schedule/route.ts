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

function parseDate(value: any) {
  if (!value) return "";
  if (typeof value === "number") {
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

function isEmptyRow(row: any[]) {
  return !row || row.every((cell) => !text(cell));
}

function findHeaderIndex(rows: any[][]) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i].map(text);
    const joined = row.join(" ");
    if (joined.includes("시작일") && joined.includes("종료일") && joined.includes("대분류")) return i;
    if (joined.includes("시작") && joined.includes("내용")) return i;
  }
  return 0;
}

function inferCategory(largeCategory: string, group: string, content: string) {
  const large = normalize(largeCategory);
  const combined = `${largeCategory} ${group} ${content}`;

  // 대분류가 명확하면 대분류를 우선합니다.
  // 휴무/연차가 "프로모션" 행으로 들어가는 문제를 방지하기 위해 스케줄을 먼저 고정합니다.
  if (large.includes("스케줄") || large.includes("근무") || large.includes("인원")) return "schedule";
  if (large.includes("프로모션")) return "promotion";
  if (large.includes("vmd")) return "vmd";
  if (large.includes("마케팅")) return "marketing";
  if (large.includes("상품") || large.includes("입고")) return "product";
  if (large.includes("실적") || large.includes("날씨")) return "performance";

  if (/휴무|근무|라운딩|스케줄|교육|미팅|출장|연차/i.test(combined)) return "schedule";
  if (/프로모션|할인|쿠폰|사은품|증정|더블쇼|세일|upto|행사|페이백|마일리지|오픈|팝업/i.test(combined)) return "promotion";
  if (/vm|vmd|진열|연출|마네킹|매장구성|윈도우|집중화/i.test(combined)) return "vmd";
  if (/마케팅|인플루언서|인스타|촬영|피드|홍보|imc|obt/i.test(combined)) return "marketing";
  if (/실적|목표|달성|신장|기온|날씨|매출/i.test(combined)) return "performance";
  if (/신상품|리오더|입고|라인업/i.test(combined)) return "product";
  return "general";
}

function categoryLabel(category: string) {
  const map: Record<string, string> = {
    promotion: "프로모션",
    vmd: "VMD",
    marketing: "마케팅",
    schedule: "스케줄",
    performance: "실적",
    product: "상품",
    general: "기타",
  };
  return map[category] || "기타";
}

function categoryOrder(category: string) {
  const order: Record<string, number> = {
    promotion: 1,
    vmd: 2,
    marketing: 3,
    product: 4,
    schedule: 5,
    performance: 6,
    general: 7,
  };
  return order[category] || 99;
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
    const keys = Object.keys(row);
    const get = (names: string[], fallbackIdx: number) => {
      const key = keys.find((k) => names.some((name) => normalize(k).includes(normalize(name))));
      return key ? text(row[key]) : text(Object.values(row)[fallbackIdx]);
    };

    const startDate = parseDate(get(["시작일", "시작"], 0));
    const endDate = parseDate(get(["종료일", "종료"], 1)) || startDate;
    const largeCategory = get(["대분류"], 2);
    const person = get(["성명", "이름", "담당자"], 3);
    const group = get(["구분"], 4);
    const content = get(["내용", "상세", "일정"], 5);
    const category = inferCategory(largeCategory, group, content);
    const title = category === "schedule"
      ? [person, group || content].filter(Boolean).join(" ")
      : (content || group || largeCategory || "일정");

    return {
      id: `SCH-${idx + 1}`,
      startDate,
      endDate,
      largeCategory,
      person,
      group,
      content,
      title,
      displayTitle: category === "schedule" ? (group || content || "스케줄") : title,
      rowKey: category === "schedule" && person ? `staff:${person}` : category,
      category,
      categoryLabel: categoryLabel(category),
      order: categoryOrder(category),
      raw: row,
    };
  }).filter((event) => event.startDate || event.endDate || event.title);

  return { headers, rows: body, events };
}

export async function GET() {
  try {
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
