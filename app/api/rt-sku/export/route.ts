import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { loadSavedRtSuggestions } from "@/lib/rtSuggestionStore";
import { RT_SKU_SETTINGS, RT_SKU_STORES } from "@/lib/rtSkuEngine";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

// MARK 2026-10-20: SKU 방식 RT 결과 엑셀 — 재고MD 엑셀과 같은 업로드 양식 + 판단근거.
//  RT업로드(A~G 전산 양식, H~ 근거) / 출고업로드(채널·바코드·출고차수·의뢰수량·대분류·비고, G~ 근거)
//  / 미충족(창고·다른 매장 모두 없음) / 기존방식비교(보내는 매장 SKU 품절 지시) / 계산기준
const t = (v: any) => String(v ?? "").trim();
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const wk = (v: any) => (n(v) >= 99 ? "판매없음" : n(v));

function styleHeader(ws: ExcelJS.Worksheet, groups: [number, string][]) {
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 32;
  head.eachCell((cell, col) => {
    const g = groups.find(([upto]) => col <= upto);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: g ? g[1] : "FFFEF3C7" } };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: head.cellCount } };
}

export async function GET(req: Request) {
  try {
    const date = new URL(req.url).searchParams.get("date") || undefined;
    const { saved } = await loadSavedRtSuggestions(date, "sku");
    if (!saved) return NextResponse.json({ ok: false, error: "저장된 SKU 방식 RT가 없어요. 먼저 계산해주세요." }, { status: 404 });
    const lines: any[] = saved.rtSuggestions || [];
    const d = t(saved.savedDate);
    const inputs: any = saved.inputs || {};
    const p1 = t(inputs.sales?.period1), p2 = t(inputs.sales?.period2);
    const wb = new ExcelJS.Workbook();

    // 1) RT업로드
    const rt = wb.addWorksheet("RT업로드");
    rt.addRow([
      "보낼채널코드", "받을채널코드", "스타일", "칼라", "사이즈", "지시수량", "제안날짜",
      "구분", "매칭방식", "스타일명",
      "보내는매장", "등급", "순위", "재고", `전주판매(${p1})`, `전전주판매(${p2})`, "주간판매(기준)", "재고주수", "상태", "남길재고", "이동후재고", "이동후주수",
      "받는매장", "등급", "순위", "재고", "전주판매", "전전주판매", "주간판매(기준)", "재고주수", "상태", "누계판매", "필요수량", "이동후재고", "이동후주수",
      "창고가용(오프)",
    ]);
    for (const l of lines.filter((x) => x.kind === "rt")) {
      const f = l.from || {}, to = l.to || {};
      rt.addRow([
        f.storeCode, to.storeCode, l.styleCode, l.color, l.size, n(l.qty), d,
        l.type, l.tier, t(l.productName),
        f.storeName, f.grade, f.rank, n(f.stock), n(f.w1Qty), n(f.w2Qty), n(f.weekly), wk(f.weeks), f.status, n(f.keep), n(f.afterStock), wk(f.afterWeeks),
        to.storeName, to.grade, to.rank, n(to.stock), n(to.w1Qty), n(to.w2Qty), n(to.weekly), wk(to.weeks), to.status, n(to.cumQty), n(to.need), n(to.afterStock), wk(to.afterWeeks),
        n(l.warehouseAvail),
      ]);
    }
    styleHeader(rt, [[7, "FFDBEAFE"], [10, "FFE5E7EB"], [22, "FFFEE2E2"], [35, "FFDCFCE7"]]);
    [1, 2, 3, 4, 5].forEach((c) => (rt.getColumn(c).numFmt = "@"));
    [11, 11, 13, 7, 7, 8, 11, 7, 12, 26].forEach((w, i) => (rt.getColumn(i + 1).width = w));
    rt.getColumn(11).width = 18;
    rt.getColumn(23).width = 18;

    // 2) 출고업로드 (재고MD 양식: 채널/바코드/출고차수/의뢰수량/대분류/비고)
    const sh = wb.addWorksheet("출고업로드");
    sh.addRow(["채널", "바코드", "출고차수", "의뢰수량", "대분류", "비고", "스타일", "칼라", "사이즈", "스타일명", "받는매장", "등급", "순위", "재고", "전주판매", "전전주판매", "재고주수", "상태", "누계판매", "필요수량", "이동후재고", "이동후주수", "창고가용(오프)"]);
    for (const l of lines.filter((x) => x.kind === "ship")) {
      const to = l.to || {};
      sh.addRow([to.storeCode, t(l.barcode) || `${l.styleCode}${l.color}${l.size}`, "", n(l.qty), "", l.type === "보충출고" ? "보충(장기품절 인기SKU)" : "부족재고보충", l.styleCode, l.color, l.size, t(l.productName), to.storeName, to.grade, to.rank, n(to.stock), n(to.w1Qty), n(to.w2Qty), wk(to.weeks), to.status, n(to.cumQty), n(to.need), n(to.afterStock), wk(to.afterWeeks), n(l.warehouseAvail)]);
    }
    styleHeader(sh, [[6, "FFDBEAFE"], [10, "FFE5E7EB"], [23, "FFDCFCE7"]]);
    [1, 2].forEach((c) => (sh.getColumn(c).numFmt = "@"));
    sh.getColumn(2).width = 18;
    sh.getColumn(10).width = 26;
    sh.getColumn(11).width = 18;

    // 3) 미충족
    const um = wb.addWorksheet("미충족");
    um.addRow(["스타일", "칼라", "사이즈", "스타일명", "받는매장", "등급", "상태", "재고", "전주판매", "전전주판매", "누계판매", "못 채운 수량", "창고가용(오프)", "비고"]);
    for (const l of lines.filter((x) => x.kind === "unmet")) {
      const to = l.to || {};
      um.addRow([l.styleCode, l.color, l.size, t(l.productName), to.storeName, to.grade, to.status, n(to.stock), n(to.w1Qty), n(to.w2Qty), n(to.cumQty), n(l.qty), n(l.warehouseAvail), "창고·다른 매장 모두 보낼 재고 없음 (생산/리오더 검토)"]);
    }
    styleHeader(um, [[14, "FFFEF3C7"]]);
    um.getColumn(4).width = 26;
    um.getColumn(5).width = 18;

    // 4) 기존방식 비교
    const lg: any = saved.legacy;
    const cmp = wb.addWorksheet("기존방식비교");
    cmp.addRow(["기존(품번 단위) 계산분", t(lg?.savedAt)]);
    cmp.addRow(["칼라/사이즈로 펼친 지시", `${n(lg?.skuLines)}줄 / ${n(lg?.skuQty)}장`]);
    cmp.addRow(["그중 보내는 매장 SKU를 0으로 만드는데 최근 2주 그 매장에서 팔린 SKU", `${n(lg?.stockoutLines)}줄 / ${n(lg?.stockoutQty)}장`]);
    cmp.addRow(["SKU 방식에서 같은 경우", `${n(saved.summary?.senderStockoutLines)}줄 (보내는 매장은 목표재고·품절임박 기준+1장을 남김)`]);
    cmp.addRow([]);
    cmp.addRow(["스타일", "스타일명", "칼라", "사이즈", "보내는매장", "받는매장", "지시수량", "보내는매장 최근2주 판매"]);
    for (const e of lg?.examples || []) cmp.addRow([e.styleCode, e.productName, e.color, e.size, e.fromStore, e.toStore, e.qty, e.fromSold2w]);
    cmp.getColumn(1).width = 40;
    cmp.getColumn(2).width = 40;
    cmp.getRow(6).font = { bold: true };

    // 5) 계산기준
    const S = RT_SKU_SETTINGS;
    const info = wb.addWorksheet("계산기준");
    const sm: any = saved.summary || {};
    const rows: any[][] = [
      ["계산 시각", t(saved.savedAt)],
      ["판매 기준", `업로드 파일 ${t(inputs.sales?.fileName)} (${t(inputs.sales?.uploadedAt)}) — 전주 ${p1} / 전전주 ${p2}. 주간판매 = 2주 평균(전전주 판매가 없으면 전주 값)`],
      ["매장 재고 기준", inputs.pip?.used ? `PIP 매장별 재고 스냅샷 ${t(inputs.pip.uploadedAt)}` : "업로드 파일의 재고(PIP가 3일 넘게 갱신 안 됨)"],
      ["물류 가용재고", inputs.warehouse?.used ? `${t(inputs.warehouse.uploadedAt)} 업로드분` : "미반영(7일 넘음 또는 업로드 없음)"],
      ["결과", `물류출고 ${n(sm.shipCount)}줄/${n(sm.shipQty)}장 · RT ${n(sm.rtCount)}줄/${n(sm.rtQty)}장(매장쌍 ${n(sm.rtStorePairs)}개) · 미충족 ${n(sm.unmetCount)}줄/${n(sm.unmetQty)}장`],
      [],
      ["등급", "목표재고주수 / 과잉기준(≥) / 보충목표수량"],
      ...(["A", "B", "C", "D"] as const).map((g) => [g, `${S.grades[g].targetWeeks}주 / ${S.grades[g].overWeeks}주 / ${S.grades[g].boostQty}장`]),
      ["품절임박", `판매가 있고 재고주수 ≤ ${S.shortageWeeks}주 → 목표재고주수까지 보충`],
      ["보충", `재고 0 · 전주/전전주 판매 0 · 누계판매 ≥ ${S.boostMinCumQty}장 → 등급별 보충목표수량`],
      ["과잉", "재고주수 ≥ 등급별 과잉기준 (판매 없이 재고만 있으면 99주로 과잉)"],
      ["받는 대상 품번", `재런칭 목록 또는 ${S.targetPrefixes.join("·")}로 시작`],
      ["배분 순서", "같은 SKU를 여러 매장이 원하면 등급(A→D) → 판매순위 순. 창고 가용(오프)에서 먼저, 남는 부족분만 RT"],
      ["RT 1차(과잉매장)", "과잉량 큰 매장부터. 판매가 있으면 목표재고만큼 남김, 판매 없는 재고는 전량 가능"],
      ["RT 2차(하위판매매장)", "정상 매장 중 판매순위 낮은 매장부터. 목표재고와 '품절임박 기준+1장' 중 큰 값은 반드시 남김"],
      ["공통", "보내는 매장 재고를 차감해가며 배분(같은 재고를 중복 지시하지 않음). 품절임박/보충 매장은 보내지 않음"],
      [],
      ["매장코드", "매장명 / 등급 / 순위"],
      ...RT_SKU_STORES.map((s) => [s.code, `${s.name} / ${s.grade} / ${s.rank}`]),
    ];
    rows.forEach((r) => info.addRow(r));
    info.getColumn(1).width = 22;
    info.getColumn(2).width = 110;
    info.getColumn(1).font = { bold: true };

    const buf = await wb.xlsx.writeBuffer();
    const fileName = `RT_SKU방식_${d || "최근"}.xlsx`;
    return new Response(buf as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("rt-sku export failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "엑셀 다운로드 실패" }, { status: 500 });
  }
}
