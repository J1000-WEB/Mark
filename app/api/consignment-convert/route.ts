import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { loadStoreCodeMap, loadColorCodeList, parseFactoryYongin } from "@/lib/consignmentUpload";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// MARK 2026-11-20: PC erp-agent(fetch-yongin.js)가 BizFashion에서 직접 받은 용인 판매 줄을 보내면
// 대시보드 수동 업로드와 똑같은 규칙(parseFactoryYongin — 라이브 COLORCODE 시트·바코드 목록으로 칼라명/구품번 순서 자동수정)으로
// 업로드 행으로 바꿔서 돌려줌. 시트에는 아무것도 안 씀(UPLOAD 시트 이어쓰기 없음).
// POST {channel:"factory_yongin", rows:[{판매일자, 스타일, 수량합계, 판매가, 실판매가, 실판매금액}]}
const YONGIN_HEADER = ["판매일자", "스타일", "수량합계", "판매가", "실판매가", "실판매금액"];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body?.channel !== "factory_yongin") return NextResponse.json({ ok: false, error: "channel은 factory_yongin만 지원" }, { status: 400 });
    const src: any[] = Array.isArray(body.rows) ? body.rows : [];
    const aoa = [YONGIN_HEADER, ...src.map((r) => YONGIN_HEADER.map((h) => r?.[h] ?? ""))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Sheet1");
    const [storeCodeMap, colorCodeList] = await Promise.all([loadStoreCodeMap(), loadColorCodeList()]);
    const { rows, warnings } = parseFactoryYongin(wb, storeCodeMap, colorCodeList);
    return NextResponse.json({ ok: true, rows, warnings, colorCodes: colorCodeList.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
