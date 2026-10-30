import { NextResponse } from "next/server";
import {
  getDailySourceSheetId,
  createSheetWithValuesById,
  updateValuesById,
  deleteSheetByTitleIfExistsById,
  getSheetValuesById,
  getSpreadsheetTitlesById,
  getSheetsClient,
  getDbSheetId,
  ensureSheetExistsById,
  safeReplaceSheetValuesById,
} from "@/lib/googleSheets";
import { sendEmailAlert } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const revalidate = 0;

const LIVE_SHEET_DEFAULT = "스타일별 채널별 입고/판매/재고현황(금액)";

// MARK 2026-10-30: 이 시트는 매일 새벽 "지우고 새로 만들기"라 사용자가 걸어둔 틀고정이 매번 사라졌고,
// B열(기준일자)은 엑셀 날짜 숫자(46324)로 보였음 → 지우기 전에 틀고정(행/열 수)을 읽어두고(MARK_DB에도 백업),
// 새 시트를 만든 직후 틀고정을 다시 걸고 B열을 날짜(yyyy-mm-dd) 서식으로 지정.
// (B열을 읽는 lib/dailySales.ts toDateText는 숫자/날짜문자열 둘 다 처리하므로 영향 없음)
const VIEW_SETTINGS_SHEET = "PIP시트_보기설정";

async function readFreeze(spreadsheetId: string, title: string) {
  try {
    const sheets = await getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(title,gridProperties)" });
    const g = (meta.data.sheets || []).find((x) => x.properties?.title === title)?.properties?.gridProperties;
    if (!g) return null;
    return { rows: g.frozenRowCount || 0, cols: g.frozenColumnCount || 0 };
  } catch {
    return null;
  }
}

async function loadSavedFreeze() {
  try {
    const rows = await getSheetValuesById(getDbSheetId(), VIEW_SETTINGS_SHEET, "A2:B2");
    const r = rows?.[0];
    if (!r) return null;
    return { rows: Number(r[0]) || 0, cols: Number(r[1]) || 0 };
  } catch {
    return null;
  }
}

async function saveFreeze(f: { rows: number; cols: number }) {
  try {
    const dbId = getDbSheetId();
    await ensureSheetExistsById(dbId, VIEW_SETTINGS_SHEET, ["틀고정_행", "틀고정_열"]);
    await safeReplaceSheetValuesById(dbId, VIEW_SETTINGS_SHEET, [["틀고정_행", "틀고정_열"], [f.rows, f.cols]]);
  } catch (e) {
    console.error("PIP 틀고정 설정 저장 실패(무시):", e);
  }
}

async function applyViewSettings(spreadsheetId: string, title: string, freeze: { rows: number; cols: number } | null, rowCount?: number) {
  try {
    const sheets = await getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(title,sheetId,gridProperties)" });
    const props = (meta.data.sheets || []).find((x) => x.properties?.title === title)?.properties;
    if (!props || props.sheetId === undefined || props.sheetId === null) return;
    const gridRows = rowCount || props.gridProperties?.rowCount || 1000;
    const gridCols = props.gridProperties?.columnCount || 26;
    const requests: any[] = [
      {
        repeatCell: {
          range: { sheetId: props.sheetId, startRowIndex: 0, endRowIndex: gridRows, startColumnIndex: 1, endColumnIndex: 2 },
          cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" } } },
          fields: "userEnteredFormat.numberFormat",
        },
      },
    ];
    if (freeze && (freeze.rows || freeze.cols)) {
      requests.push({
        updateSheetProperties: {
          properties: { sheetId: props.sheetId, gridProperties: { frozenRowCount: Math.min(freeze.rows, gridRows - 1), frozenColumnCount: Math.min(freeze.cols, gridCols - 1) } },
          fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
        },
      });
    }
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  } catch (e) {
    console.error("PIP 시트 틀고정/날짜서식 적용 실패(무시):", e);
  }
}

// MARK 6.58: 파일이 892만 셀까지 커져서, 예전 방식(스테이징 만들고 → 검증 → 기존 걸 백업으로
// 이름바꾸기 → 스테이징 승격)은 순간적으로 신구 데이터가 동시에 존재해서 2배 공간이 필요했고,
// 이제 구글시트 전체 한도(1000만 셀)를 넘어버립니다. 그래서 "지우고 다시 쓰기" 방식으로 전환:
// [1] start: 기존 라이브 시트를 먼저 지우고, 그 이름으로 새 시트를 만들어 첫 청크를 씀
// [2] chunk: 그 시트에 이어서 씀
// [3] finish: 행 수를 검증만 함(교체할 게 없음 — 이미 그 이름으로 쓰고 있었음)
// 위험: 업로드 도중 실패하면 잠깐 데이터가 비어있을 수 있음 — 그래서 실패 시 이메일 알림을 보냄.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mode, rows, expectedTotalRows, totalRows, totalCols } = body || {};
    const spreadsheetId = getDailySourceSheetId();

    if (mode === "start") {
      const titles = await getSpreadsheetTitlesById(spreadsheetId);
      const liveSheetName = titles.find((t) => t.includes("스타일별") && t.includes("채널별") && t.includes("금액")) || LIVE_SHEET_DEFAULT;

      // 지우기 전에 사용자가 걸어둔 틀고정 기억(없으면 예전에 저장해둔 값)
      const liveFreeze = await readFreeze(spreadsheetId, liveSheetName);
      const freeze = liveFreeze && (liveFreeze.rows || liveFreeze.cols) ? liveFreeze : await loadSavedFreeze();
      if (liveFreeze && (liveFreeze.rows || liveFreeze.cols)) await saveFreeze(liveFreeze);

      try {
        await deleteSheetByTitleIfExistsById(spreadsheetId, liveSheetName);
      } catch (delErr: any) {
        console.error("기존 시트 삭제 실패:", delErr);
        return NextResponse.json(
          { ok: false, error: `기존 시트("${liveSheetName}") 삭제에 실패했습니다: ${delErr?.message || delErr}` },
          { status: 500 }
        );
      }

      // 삭제가 진짜 반영됐는지 확인 (구글 API가 비동기로 늦게 반영하는 경우 대비)
      const titlesAfterDelete = await getSpreadsheetTitlesById(spreadsheetId);
      if (titlesAfterDelete.includes(liveSheetName)) {
        return NextResponse.json(
          { ok: false, error: `기존 시트("${liveSheetName}")가 삭제되지 않은 상태로 남아있습니다. 잠시 후 다시 시도해주세요.` },
          { status: 500 }
        );
      }

      // MARK 6.62: 시트 이름은 삭제 직후 목록에서 바로 사라져도, 그 시트가 차지하던 셀 용량은
      // 구글 내부적으로 몇 초 늦게 반영(정리)될 수 있습니다. 그 사이에 새 시트를 만들면
      // "아직 안 풀린 용량 + 새 시트"로 계산되어 1000만 한도에 걸릴 수 있어서, 잠깐 대기합니다.
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // MARK 6.63: 여유분(+5행 +2열)이 오히려 독이 될 수 있음을 확인 — 이 스프레드시트는
      // 남은 여유가 몇만 셀 단위로 빠듯해서, 조금이라도 여유를 더 두면 바로 한도에 걸립니다.
      // 그래서 이제 정확히 필요한 크기만 할당합니다(패딩 없음).
      const gridSize = totalRows && totalCols ? { rowCount: Number(totalRows), columnCount: Number(totalCols) } : undefined;
      try {
        await createSheetWithValuesById(spreadsheetId, liveSheetName, rows || [], gridSize);
      } catch (createErr: any) {
        console.error("새 시트 생성 실패:", createErr);
        return NextResponse.json(
          { ok: false, error: `새 시트 생성에 실패했습니다: ${createErr?.message || createErr}` },
          { status: 500 }
        );
      }
      await applyViewSettings(spreadsheetId, liveSheetName, freeze, gridSize?.rowCount);
      return NextResponse.json({ ok: true, written: (rows || []).length, liveSheetName, freeze });
    }

    if (mode === "chunk") {
      if (!rows || !rows.length) return NextResponse.json({ ok: true, written: 0 });
      const liveSheetName = body.liveSheetName || LIVE_SHEET_DEFAULT;
      const startRow = Number(body.startRow); // 1-indexed, 이 청크가 써야 할 시작 행
      if (!startRow) {
        return NextResponse.json({ ok: false, error: "chunk 요청에 startRow가 필요합니다." }, { status: 400 });
      }
      try {
        // MARK 6.64: appendValuesById(INSERT_ROWS)는 "새 행을 끼워넣는" 방식이라, 이미
        // 딱 맞게 만들어둔 그리드 위에 계속 행을 추가해서 그리드가 계속 커지는 버그가 있었습니다.
        // 대신 정확한 시작 행(startRow)에 값을 "덮어쓰기"(update)해서, 미리 만들어둔 그리드
        // 크기 안에서만 채워지도록 합니다(그리드 자체는 안 커짐).
        await updateValuesById(spreadsheetId, `'${liveSheetName}'!A${startRow}:ZZ`, rows);
      } catch (error: any) {
        await sendEmailAlert(
          "⚠ MARK 업로드 실패 — 스타일별채널별(금액) 청크 저장 오류",
          `<p>청크 업로드 중 오류가 발생했습니다. 현재 시트가 불완전한 상태일 수 있습니다.</p><p>오류: ${error?.message || error}</p>`
        ).catch(() => {});
        throw error;
      }
      return NextResponse.json({ ok: true, written: rows.length });
    }

    if (mode === "finish") {
      const liveSheetName = body.liveSheetName || LIVE_SHEET_DEFAULT;
      const stagingRows = await getSheetValuesById(spreadsheetId, liveSheetName, "A:B").catch(() => []);
      const actualRows = stagingRows.length;
      if (expectedTotalRows && Math.abs(actualRows - expectedTotalRows) > 5) {
        await sendEmailAlert(
          "⚠ MARK 업로드 실패 — 스타일별채널별(금액) 행 수 불일치",
          `<p>업로드된 행수(${actualRows})가 예상(${expectedTotalRows})과 많이 달라요. 시트가 불완전할 수 있으니 확인 후 다시 업로드해주세요.</p>`
        ).catch(() => {});
        return NextResponse.json(
          { ok: false, error: `업로드된 행수(${actualRows})가 예상(${expectedTotalRows})과 많이 달라요. 다시 시도해주세요.` },
          { status: 400 }
        );
      }

      return NextResponse.json({ ok: true, totalRows: actualRows, liveSheetName });
    }

    return NextResponse.json({ ok: false, error: "mode가 올바르지 않습니다(start/chunk/finish 중 하나여야 함)." }, { status: 400 });
  } catch (error: any) {
    console.error("upload-style-channel-sheet failed:", error);
    await sendEmailAlert(
      "⚠ MARK 업로드 실패 — 스타일별채널별(금액)",
      `<p>업로드 중 예상치 못한 오류가 발생했습니다.</p><p>오류: ${error?.message || error}</p>`
    ).catch(() => {});
    return NextResponse.json({ ok: false, error: error?.message || "업로드 실패" }, { status: 500 });
  }
}
