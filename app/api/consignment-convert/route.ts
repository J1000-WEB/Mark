import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { loadStoreCodeMap, loadColorCodeList, parseFactoryYongin, parseMusinsa } from "@/lib/consignmentUpload";

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
    // MARK 2026-11-24: PC watch-musinsa.js — 소천님이 직접 받은 무신사 정산 파일 줄을 보내면 수동 업로드와 같은 parseMusinsa(라이브 점포코드 시트)로 변환.
    // POST {channel:"musinsa", rows:[{정산일자, 매장명, 업체바코드, 판매수량, 판매금액}]} → rows(보낸 순서 그대로, 매장명·바코드 없는 줄은 미리 빼고 보낼 것)
    if (body?.channel === "musinsa") {
      const src: any[] = Array.isArray(body.rows) ? body.rows : [];
      const aoa: any[][] = [Array(18).fill("")];
      for (const r of src) {
        const line = Array(18).fill("");
        line[0] = r?.["정산일자"] ?? "";
        line[7] = r?.["매장명"] ?? "";
        line[15] = r?.["업체바코드"] ?? "";
        line[16] = r?.["판매수량"] ?? 0;
        line[17] = r?.["판매금액"] ?? 0;
        aoa.push(line);
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Sheet1");
      const { rows, warnings } = parseMusinsa(wb, await loadStoreCodeMap());
      return NextResponse.json({ ok: true, rows, warnings });
    }
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
