import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  detectChannelFromFilename,
  loadStoreCodeMap,
  loadColorCodeList,
  parseByChannel,
  appendUploadRows,
  highlightFlaggedRows,
} from "@/lib/consignmentUpload";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const userDate = String(form.get("date") || "").replace(/-/g, ""); // "2026-07-08" -> "20260708"

    if (!file) {
      return NextResponse.json({ ok: false, error: "파일이 없습니다." }, { status: 400 });
    }

    const channel = detectChannelFromFilename(file.name);
    if (!channel) {
      return NextResponse.json({
        ok: false,
        error: `파일명으로 어떤 위탁샵인지 확인하지 못했습니다: ${file.name} (무신사=pos_purchase_settlement로 시작, 한컬렉션=매출일보로 시작, 면세=매출재고조회로 시작)`,
      }, { status: 400 });
    }

    if (channel === "duty_free" && !userDate) {
      return NextResponse.json({ ok: false, needsDate: true, channel, error: "면세 파일은 날짜를 먼저 지정해야 합니다." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array", cellDates: true });

    const storeCodeMap = await loadStoreCodeMap();
    const colorCodeList = channel === "hancollection" ? await loadColorCodeList() : [];
    const { rows, warnings } = parseByChannel(channel, workbook, storeCodeMap, userDate, colorCodeList);

    if (!rows.length) {
      return NextResponse.json({ ok: false, channel, error: "변환된 행이 없습니다. 파일 내용을 확인해주세요.", warnings }, { status: 400 });
    }

    const written = await appendUploadRows(rows);

    const flaggedOffsets = rows
      .map((r, i) => (r.flagged ? i : -1))
      .filter((i) => i >= 0);
    const autoFixedCount = rows.filter((r) => r.autoFixed).length;

    if (written && flaggedOffsets.length) {
      await highlightFlaggedRows(written.startRow, flaggedOffsets).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      channel,
      fileName: file.name,
      parsedRows: rows.length,
      writtenRange: written ? `${written.startRow}~${written.endRow}행` : null,
      flaggedCount: flaggedOffsets.length,
      flaggedItems: rows.filter((r) => r.flagged).map((r) => ({ barcode: r.barcode, reason: r.flagReason })),
      autoFixedCount,
      warnings,
    });
  } catch (error: any) {
    console.error("consignment-upload failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "업로드 처리 실패" }, { status: 500 });
  }
}
