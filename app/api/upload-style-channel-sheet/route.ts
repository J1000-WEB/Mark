import { NextResponse } from "next/server";
import {
  getDailySourceSheetId,
  createSheetWithValuesById,
  appendValuesById,
  deleteSheetByTitleIfExistsById,
  getSheetValuesById,
  getSpreadsheetTitlesById,
} from "@/lib/googleSheets";
import { sendEmailAlert } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LIVE_SHEET_DEFAULT = "스타일별 채널별 입고/판매/재고현황(금액)";

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
      return NextResponse.json({ ok: true, written: (rows || []).length, liveSheetName });
    }

    if (mode === "chunk") {
      if (!rows || !rows.length) return NextResponse.json({ ok: true, written: 0 });
      const liveSheetName = body.liveSheetName || LIVE_SHEET_DEFAULT;
      try {
        await appendValuesById(spreadsheetId, `'${liveSheetName}'!A:ZZ`, rows);
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
