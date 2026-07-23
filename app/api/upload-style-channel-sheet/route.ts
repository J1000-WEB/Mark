import { NextResponse } from "next/server";
import {
  getDailySourceSheetId,
  createSheetWithValuesById,
  appendValuesById,
  deleteSheetByTitleIfExistsById,
  renameSheetById,
  getSheetValuesById,
  getSpreadsheetTitlesById,
} from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STAGING_SHEET = "스타일별채널별입고판매재고현황_staging";
const BACKUP_SHEET = "스타일별채널별입고판매재고현황_backup";

// MARK 6.30: 스타일별 채널별 입고/판매/재고현황(온라인 포함 31만 셀 등)을 브라우저에서 한 번에
// 붙여넣으면 오류가 나서, 대신 이 라우트로 잘게 쪼개서(청크) 안전하게 업로드합니다.
// [1] start: 스테이징 시트를 새로 만들고 첫 청크를 씀
// [2] chunk: 스테이징 시트에 이어서 씀 (여러 번 반복)
// [3] finish: 스테이징 행 수를 검증한 뒤, 기존 시트는 백업으로 이름을 바꾸고 스테이징을 실제 이름으로 승격
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mode, rows, expectedTotalRows } = body || {};
    const spreadsheetId = getDailySourceSheetId();

    if (mode === "start") {
      // MARK 6.37: 백업 삭제를 finish 시점이 아니라 여기(start)에서 먼저 합니다.
      // 그래야 업로드 도중에 [기존백업]+[기존라이브]+[새 스테이징] 3벌이 동시에 존재하는 걸 피하고,
      // [기존라이브]+[새 스테이징] 2벌만 유지해서 스프레드시트 전체 셀 한도(1000만)에 덜 걸립니다.
      await deleteSheetByTitleIfExistsById(spreadsheetId, BACKUP_SHEET).catch(() => {});
      await deleteSheetByTitleIfExistsById(spreadsheetId, STAGING_SHEET).catch(() => {});
      await createSheetWithValuesById(spreadsheetId, STAGING_SHEET, rows || []);
      return NextResponse.json({ ok: true, written: (rows || []).length });
    }

    if (mode === "chunk") {
      if (!rows || !rows.length) return NextResponse.json({ ok: true, written: 0 });
      await appendValuesById(spreadsheetId, `'${STAGING_SHEET}'!A:ZZ`, rows);
      return NextResponse.json({ ok: true, written: rows.length });
    }

    if (mode === "finish") {
      const stagingRows = await getSheetValuesById(spreadsheetId, STAGING_SHEET, "A:B").catch(() => []);
      const actualRows = stagingRows.length;
      if (expectedTotalRows && Math.abs(actualRows - expectedTotalRows) > 5) {
        return NextResponse.json(
          { ok: false, error: `업로드된 행수(${actualRows})가 예상(${expectedTotalRows})과 많이 달라요. 다시 시도해주세요.` },
          { status: 400 }
        );
      }

      const titles = await getSpreadsheetTitlesById(spreadsheetId);
      // 업로드 대상은 항상 "(금액)" 시트로 고정합니다 — 기존 "스타일별 채널별 입고/판매/재고현황"(금액 없는 구버전)은
      // 건드리지 않고 그대로 둡니다.
      const liveSheetName = "스타일별 채널별 입고/판매/재고현황(금액)";

      if (titles.includes(BACKUP_SHEET)) {
        await deleteSheetByTitleIfExistsById(spreadsheetId, BACKUP_SHEET);
      }
      if (titles.includes(liveSheetName)) {
        await renameSheetById(spreadsheetId, liveSheetName, BACKUP_SHEET);
      }
      await renameSheetById(spreadsheetId, STAGING_SHEET, liveSheetName);

      return NextResponse.json({ ok: true, totalRows: actualRows, liveSheetName });
    }

    return NextResponse.json({ ok: false, error: "mode가 올바르지 않습니다(start/chunk/finish 중 하나여야 함)." }, { status: 400 });
  } catch (error: any) {
    console.error("upload-style-channel-sheet failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "업로드 실패" }, { status: 500 });
  }
}
