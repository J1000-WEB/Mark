import { NextResponse } from "next/server";
import { getDbSheetId, getSheetId, getSheetValuesById, getSpreadsheetTitlesById } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function text(v: any) {
  return String(v ?? "").trim();
}

function parseSalesSheetTitle(title: string) {
  const m = text(title).match(/^(.+?)\((품번|컬러)\)$/);
  if (!m) return null;
  const week = m[1].trim();
  const type = m[2] === "컬러" ? "color" : "style";
  return { week, type, title };
}

function weekSortKey(week: string) {
  const m = text(week).match(/(\d{1,2})\s*[.]\s*(\d{1,2})/);
  if (!m) return 0;
  return Number(m[1]) * 100 + Number(m[2]);
}

function trimMatrix(rows: any[][]) {
  const cleaned = (rows || []).map((row) => (row || []).map((cell) => text(cell)));
  let maxCol = 0;
  let maxRow = cleaned.length - 1;

  for (let r = 0; r < cleaned.length; r++) {
    for (let c = 0; c < cleaned[r].length; c++) {
      if (cleaned[r][c]) {
        maxCol = Math.max(maxCol, c + 1);
        maxRow = Math.max(maxRow, r);
      }
    }
  }

  return cleaned.slice(0, maxRow + 1).map((row) => row.slice(0, maxCol));
}

async function findSalesSheets() {
  const ids = [getDbSheetId(), getSheetId()].filter(Boolean);
  for (const spreadsheetId of ids) {
    const titles = await getSpreadsheetTitlesById(spreadsheetId).catch(() => []);
    const parsed = titles.map(parseSalesSheetTitle).filter(Boolean) as any[];
    if (parsed.length) return { spreadsheetId, parsed };
  }
  return { spreadsheetId: ids[0], parsed: [] as any[] };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const requestedWeek = text(url.searchParams.get("week"));
    const type = url.searchParams.get("type") === "color" ? "color" : "style";

    const { spreadsheetId, parsed } = await findSalesSheets();
    const weeks = [...new Set(parsed.map((x) => x.week))]
      .sort((a, b) => weekSortKey(b) - weekSortKey(a))
      .map((week) => ({
        week,
        styleTitle: parsed.find((x) => x.week === week && x.type === "style")?.title || "",
        colorTitle: parsed.find((x) => x.week === week && x.type === "color")?.title || "",
      }));

    const selectedWeek = requestedWeek || weeks[0]?.week || "";
    const selectedTitle = parsed.find((x) => x.week === selectedWeek && x.type === type)?.title || "";
    const rows = selectedTitle ? trimMatrix(await getSheetValuesById(spreadsheetId, selectedTitle, "A:FB").catch(() => [])) : [];

    return NextResponse.json({
      ok: true,
      spreadsheetId,
      weeks,
      selectedWeek,
      type,
      sheetName: selectedTitle,
      rows,
      rowCount: rows.length,
      colCount: rows[0]?.length || 0,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("sales-data load failed", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "판매데이터를 불러오지 못했습니다.",
      weeks: [],
      rows: [],
    }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
