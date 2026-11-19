import { NextResponse } from "next/server";
import { getSheetValuesById, getSheetsClient, getDailySourceSheetId, getSpreadsheetTitlesById, ensureGridColsById } from "@/lib/googleSheets";
import { pickDailySheetTitle } from "@/lib/dailySales";
import { PIP_ARCHIVE_SHEET_ID } from "@/lib/pipArchive";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// MARK 2026-11-19: MARK_PIP_ARCHIVE "상품정보" 탭에 성별·품목·복종·원가(L~O열) 채우기.
// 소스: ① 지금 PIP 시트(스타일 단위) ② POST body.map {스타일: [성별, 품목, 복종, 원가]}(소천님이 준 ERP 스타일 엑셀). ②가 우선.
// 이미 값이 있는 칸은 안 건드림. POST ?dryRun=1 이면 쓰지 않고 몇 줄 채워지는지만.
const TAB = "상품정보";
const HEADER = ["키", "스타일", "스타일명", "칼라", "칼라명", "사이즈", "년도", "시즌", "아이템", "소비자가", "판매가", "성별", "품목", "복종", "원가"];
const t = (v: any) => String(v ?? "").trim();

export async function POST(req: Request) {
  try {
    const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
    const body = await req.json().catch(() => ({}));
    const map = new Map<string, string[]>();
    // ① PIP 시트
    const pipId = getDailySourceSheetId();
    const pipTitle = pickDailySheetTitle(await getSpreadsheetTitlesById(pipId));
    const pip = await getSheetValuesById(pipId, pipTitle, "A:S");
    for (const r of pip.slice(3)) {
      const s = t(r[13]).toUpperCase();
      if (!s || map.has(s)) continue;
      map.set(s, [t(r[5]), t(r[6]), t(r[7]), t(r[18])]);
    }
    const fromPip = map.size;
    // ② 엑셀(우선)
    let fromFile = 0;
    for (const [s, v] of Object.entries(body?.map || {})) {
      const a = (v as any[]).map(t);
      const old = map.get(s.toUpperCase()) || ["", "", "", ""];
      map.set(s.toUpperCase(), a.map((x, i) => x || old[i]));
      fromFile++;
    }
    const rows = await getSheetValuesById(PIP_ARCHIVE_SHEET_ID, TAB, "A:O");
    const out: any[][] = [];
    let filled = 0, missing = 0;
    const missingStyles = new Set<string>();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const cur = [t(r[11]), t(r[12]), t(r[13]), t(r[14])];
      const m = map.get(t(r[1]).toUpperCase());
      if (!m) { if (!cur[1]) { missing++; missingStyles.add(t(r[1])); } out.push(cur); continue; }
      const next = cur.map((x, k) => x || m[k] || "");
      if (next.join("|") !== cur.join("|")) filled++;
      out.push(next.map((x, k) => (k === 3 && x !== "" && Number.isFinite(Number(x)) ? Number(x) : x)));
    }
    if (!dryRun) {
      await ensureGridColsById(PIP_ARCHIVE_SHEET_ID, TAB, HEADER.length);
      const sheets = await getSheetsClient();
      await sheets.spreadsheets.values.update({
        spreadsheetId: PIP_ARCHIVE_SHEET_ID,
        range: `'${TAB}'!A1:O1`,
        valueInputOption: "RAW",
        requestBody: { values: [HEADER] },
      });
      if (out.length) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: PIP_ARCHIVE_SHEET_ID,
          range: `'${TAB}'!L2:O${out.length + 1}`,
          valueInputOption: "RAW",
          requestBody: { values: out },
        });
      }
    }
    return NextResponse.json({ ok: true, dryRun, rows: rows.length - 1, filled, missing, missingStyles: [...missingStyles].slice(0, 50), missingStyleCount: missingStyles.size, fromPip, fromFile });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
