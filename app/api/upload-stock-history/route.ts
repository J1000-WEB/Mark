import { NextResponse } from "next/server";
import { getDbSheetId, ensureSheetExistsById, getSheetValuesById, safeReplaceSheetValuesById } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const revalidate = 0;

// MARK: "재고가 100장 이상 입고되면 매장 투입 알림" 기능을 위해, 스타일+채널별 업로드할 때마다
// 스타일+컬러별 재고(Y열)만 가볍게 뽑아서 이력으로 쌓아둡니다. 이 회사 다른 분들도 쓰시는
// "스타일별 채널별 입고/판매/재고현황" 시트(공유 시트)는 매일 덮어써서 어제 값이 안 남기
// 때문에, 완전히 별도의 전용 탭(재고입고이력)에 따로 쌓습니다.
//
// 용량 관리: 이 이력은 "2일 전 대비 비교"에만 쓰이기 때문에, 오래된 날짜는 매번 자동으로
// 정리하고 최근 며칠치만 남깁니다(하루 14,000여 품목 x 4열이라 그대로 계속 쌓으면 금방
// 구글시트 셀 한도에 부딪힙니다).

const HISTORY_SHEET = "재고입고이력";
const RETENTION_DAYS = 10; // 2일 전 비교에 필요한 것보다 넉넉하게 보관

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { date, rows } = body || {}; // rows: [[styleCode, colorCode, stock], ...]
    if (!date || !Array.isArray(rows)) {
      return NextResponse.json({ ok: false, error: "date/rows가 필요합니다." }, { status: 400 });
    }

    const spreadsheetId = getDbSheetId();
    const header = ["date", "styleCode", "colorCode", "stock"];
    await ensureSheetExistsById(spreadsheetId, HISTORY_SHEET, header);

    const existing = await getSheetValuesById(spreadsheetId, HISTORY_SHEET, "A:D").catch(() => []);
    const dataRows = existing.slice(1); // 헤더 제외

    const cutoff = new Date(date);
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // 보관기간보다 오래된 것 정리 + 오늘자는 새로 덮어쓸 거라 기존 것 제외(중복 방지)
    const kept = dataRows.filter((r) => {
      const d = String(r?.[0] || "");
      return d && d >= cutoffStr && d !== date;
    });

    const newRows = rows.map((r: any[]) => [date, String(r[0] ?? ""), String(r[1] ?? ""), Number(r[2] ?? 0)]);
    const finalRows = [header, ...kept, ...newRows];

    await safeReplaceSheetValuesById(spreadsheetId, HISTORY_SHEET, finalRows);

    return NextResponse.json({ ok: true, written: newRows.length, totalKept: finalRows.length - 1 });
  } catch (error: any) {
    console.error("upload-stock-history failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "재고이력 업로드 실패" }, { status: 500 });
  }
}
