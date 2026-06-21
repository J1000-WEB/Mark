import { NextResponse } from "next/server";
import { getDbSheetId, getSheetValuesById, getSpreadsheetTitlesById } from "@/lib/googleSheets";

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
    if (rowText.includes("점포") || rowText.includes("날짜") || rowText.includes("일자") || rowText.includes("구분")) return i;
  }
  return 0;
}

function parseRows(rows: any[][]) {
  if (!rows.length) return { headers: [], rows: [] };

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

  return { headers, rows: body };
}

export async function GET() {
  try {
    const spreadsheetId = getDbSheetId();
    const titles = await getSpreadsheetTitlesById(spreadsheetId);
    const sheetName = pickScheduleSheet(titles);

    if (!sheetName) {
      return NextResponse.json({
        ok: false,
        error: "MARK_DB에서 Schedule_Simple 시트를 찾지 못했습니다.",
        sheetName: "",
        headers: [],
        rows: [],
      }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    const values = await getSheetValuesById(spreadsheetId, sheetName, "A:AZ");
    const parsed = parseRows(values);

    return NextResponse.json({
      ok: true,
      sheetName,
      headers: parsed.headers,
      rows: parsed.rows,
      generatedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error?.message || "판매전체상 데이터를 불러오지 못했습니다.",
      sheetName: "",
      headers: [],
      rows: [],
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
