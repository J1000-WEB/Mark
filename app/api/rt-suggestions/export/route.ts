import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getManySheetValues, getSpreadsheetTitles } from "@/lib/googleSheets";
import { readStoreStockSnapshot } from "@/lib/dataBuilder";
import { loadSavedRtSuggestions } from "@/lib/rtSuggestionStore";
import { readRtWeeklySales } from "@/lib/rtWeeklySalesStore";
import { allocateByStock } from "@/lib/rtAllocate";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

// MARK 2026-10-20: "RT 제안을 하나씩 승인하는 대신, 전체를 엑셀로 받아서 재고MD가 검토" 요청.
// 저장된 RT 제안(그날 계산분) 전체를 칼라/사이즈 단위 지시서로 펼쳐서 .xlsx로 내려줍니다.
//  - A~G: 기존 RT 지시서와 같은 형식(보낼채널코드/받을채널코드/스타일/칼라/사이즈/지시수량/제안날짜)
//  - H~ : 판단 근거(보내는/받는 매장의 재고·판매·재고주수, 이동 후 주수, 점수, 창고재고, 근거 문장 등)
//  - 시트2 품번요약, 시트3 물류출고대체(창고 재고로 채우는 부족분), 시트4 계산기준(규칙·데이터 기준일)
// 다운로드만 하고 RT_Result(승인 기록)에는 쓰지 않습니다.

const t = (v: any) => String(v ?? "").trim();
const n = (v: any) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const weeks = (v: any) => (n(v) >= 999 ? "판매없음" : Math.round(n(v) * 10) / 10);
// 예전에 저장된 제안(판매수량 필드가 없던 버전)은 재고÷재고주수로 주간판매를 되살립니다.
const netOf = (it: any, side: "from" | "to") => {
  const direct = it[`${side}WeekNet`];
  if (direct !== undefined && direct !== null) return n(direct);
  const w = n(it[`${side}StockWeeks`]);
  return w > 0 && w < 999 ? Math.round((n(it[`${side}Stock`]) / w) * 10) / 10 : 0;
};

function normalizeStoreKey(storeName: string) {
  return String(storeName || "")
    .replace(/^오프라인[_\s-]*/i, "")
    .replace(/점$/g, "")
    .replace(/[\s_\-·.()]/g, "")
    .toLowerCase();
}

async function loadChannelCodes() {
  const map = new Map<string, string>();
  // 1) 객_전주 시트(RT 승인과 같은 소스): C 채널코드, D 점포명
  try {
    const titles = await getSpreadsheetTitles();
    const sheet = titles.find((x) => x === "객_전주") || titles.find((x) => x.replace(/\s/g, "").includes("객_전주"));
    if (sheet) {
      const values = await getManySheetValues([sheet], "A1:AZ5000");
      for (const row of (values[sheet] || []).slice(1)) {
        const code = t(row[2]);
        const name = t(row[3]);
        if (code && name && /^\d+$/.test(code)) map.set(normalizeStoreKey(name), code);
      }
    }
  } catch {}
  // 2) 보완: RT 참고자료 ① 업로드 파일의 채널코드/채널명
  try {
    const weekly = await readRtWeeklySales();
    for (const r of weekly.rows) {
      const key = normalizeStoreKey(r.storeName);
      if (r.channelCode && /^\d+$/.test(r.channelCode) && !map.has(key)) map.set(key, r.channelCode);
    }
  } catch {}
  return map;
}

export async function GET(req: Request) {
  try {
    const date = new URL(req.url).searchParams.get("date") || undefined;
    const { saved } = await loadSavedRtSuggestions(date);
    if (!saved || !(saved.rtSuggestions || []).length) {
      return NextResponse.json({ ok: false, error: "저장된 RT 제안이 없어요. 먼저 RT 제안을 계산해주세요." }, { status: 404 });
    }
    const items: any[] = saved.rtSuggestions;
    const diag: any = saved.diagnostics || {};
    const salesLabel = diag.salesSource === "upload" ? "전주판매" : "최근7일판매";
    const prevLabel = diag.salesSource === "upload" ? "전전주판매" : "그전7일판매";
    const savedDate = t(saved.savedDate);

    const [codes, pip] = await Promise.all([loadChannelCodes(), readStoreStockSnapshot().catch(() => ({ rows: [] as any[], meta: null }))]);
    const codeOf = (store: string) => codes.get(normalizeStoreKey(store)) || store;

    // 출고점×품번별 칼라/사이즈 재고(PIP 매장별 재고 스냅샷). 같은 출고점·품번이 여러 제안에 나오면
    // 앞 제안이 배분한 만큼 남은 재고에서 다음 제안을 배분합니다(같은 재고를 두 번 지시하지 않도록).
    const skuStock = new Map<string, { color: string; size: string; stock: number }[]>();
    for (const r of pip.rows || []) {
      if (!(r.stock > 0) || !r.color || !r.size) continue;
      const key = `${normalizeStoreKey(r.storeName)}__${r.styleCode.toUpperCase()}`;
      if (!skuStock.has(key)) skuStock.set(key, []);
      skuStock.get(key)!.push({ color: r.color, size: r.size, stock: r.stock });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "MARK";
    const ws = wb.addWorksheet("RT지시서", { views: [{ state: "frozen", xSplit: 0, ySplit: 1 }] });
    const header = [
      "보낼채널코드", "받을채널코드", "스타일", "칼라", "사이즈", "지시수량", "제안날짜",
      "제안번호", "구분", "우선순위", "전사순위", "스타일명",
      "보내는매장", "보내는매장 재고", `보내는매장 ${salesLabel}`, `보내는매장 ${prevLabel}`, "보내는매장 재고주수", "보내는매장 남길 안전재고", "보내는매장 이동후 재고", "보내는매장 이동후 주수",
      "받는매장", "받는매장 재고", `받는매장 ${salesLabel}`, `받는매장 ${prevLabel}`, "받는매장 재고주수", "받는매장 목표재고", "받는매장 이동후 재고", "받는매장 이동후 주수",
      "품번 제안수량(합계)", "창고 가용재고(오프)", "RT점수", "신상품", "전량이동", "받는매장 부족사이즈", "판단근거",
    ];
    ws.addRow(header);

    let seq = 0;
    let unallocated = 0;
    for (const it of items) {
      seq++;
      const fromKey = `${normalizeStoreKey(it.fromStore)}__${t(it.styleCode).toUpperCase()}`;
      const pool = skuStock.get(fromKey) || [];
      const lines = allocateByStock(pool, n(it.suggestQty), Array.isArray(it.skuNeedWeights) ? it.skuNeedWeights : undefined);
      for (const l of lines) {
        const p = pool.find((x) => x.color === l.color && x.size === l.size);
        if (p) p.stock -= l.qty;
      }
      const evidence = [
        `RT-${String(seq).padStart(3, "0")}`, t(it.moveType), t(it.priority), it.companyRank && it.companyRank < 9999 ? n(it.companyRank) : "권외", t(it.productName),
        t(it.fromStore), n(it.fromStock), netOf(it, "from"), n(it.fromPrevNet), weeks(it.fromStockWeeks), n(it.fromSafeStock), Math.max(0, n(it.fromStock) - n(it.suggestQty)), weeks(it.fromAfterWeeks),
        t(it.toStore), n(it.toStock), netOf(it, "to"), n(it.toPrevNet), weeks(it.toStockWeeks), n(it.toTargetStock), n(it.toStock) + n(it.suggestQty), weeks(it.toAfterWeeks),
        n(it.suggestQty), n(it.warehouseStock), n(it.rtScore) || "", it.isNewProduct ? "Y" : "", it.fromFullClear ? "Y" : "", t(it.skuNeedSummary), t(it.reason).replace(/\n+/g, " / "),
      ];
      if (!lines.length) {
        unallocated++;
        ws.addRow([codeOf(it.fromStore), codeOf(it.toStore), t(it.styleCode), "", "", n(it.suggestQty), savedDate, ...evidence]).getCell(4).note = "출고점 칼라/사이즈 재고를 PIP 스냅샷에서 못 찾음 — 직접 확인 필요";
        continue;
      }
      for (const l of lines) {
        ws.addRow([codeOf(it.fromStore), codeOf(it.toStore), t(it.styleCode), l.color, l.size, l.qty, savedDate, ...evidence]);
      }
    }

    // 서식: 헤더 색(A~G 지시서 / H~ 근거), 폭, 필터
    const head = ws.getRow(1);
    head.font = { bold: true };
    head.alignment = { vertical: "middle", wrapText: true };
    head.height = 32;
    head.eachCell((cell, col) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col <= 7 ? "FFDBEAFE" : col <= 12 ? "FFE5E7EB" : col <= 20 ? "FFFEE2E2" : col <= 28 ? "FFDCFCE7" : "FFFEF3C7" } };
    });
    const widths = [11, 11, 13, 7, 7, 8, 11, 9, 6, 7, 7, 26, 18, 9, 10, 10, 9, 10, 10, 9, 18, 9, 10, 10, 9, 9, 10, 9, 10, 10, 7, 6, 7, 30, 80];
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };
    [1, 2, 3, 4, 5].forEach((c) => (ws.getColumn(c).numFmt = "@"));

    // 시트2: 품번요약
    const ws2 = wb.addWorksheet("품번요약", { views: [{ state: "frozen", ySplit: 1 }] });
    ws2.addRow(["스타일", "스타일명", "구분", "전사순위", "제안건수", "이동수량 합계", "보내는매장 수", "받는매장 수", "창고 가용재고(오프)"]);
    const byStyle = new Map<string, any>();
    for (const it of items) {
      const k = `${it.styleCode}__${it.moveType}`;
      if (!byStyle.has(k)) byStyle.set(k, { it, cnt: 0, qty: 0, from: new Set(), to: new Set() });
      const g = byStyle.get(k);
      g.cnt++;
      g.qty += n(it.suggestQty);
      g.from.add(it.fromStore);
      g.to.add(it.toStore);
    }
    [...byStyle.values()]
      .sort((a, b) => b.qty - a.qty)
      .forEach((g) => ws2.addRow([t(g.it.styleCode), t(g.it.productName), t(g.it.moveType), g.it.companyRank < 9999 ? n(g.it.companyRank) : "권외", g.cnt, g.qty, g.from.size, g.to.size, n(g.it.warehouseStock)]));
    ws2.getRow(1).font = { bold: true };
    [13, 28, 6, 8, 8, 12, 12, 12, 14].forEach((w, i) => (ws2.getColumn(i + 1).width = w));

    // 시트3: 물류 출고로 대체(창고 재고 있음)
    const covered: any[] = saved.warehouseCovered || [];
    const ws3 = wb.addWorksheet("물류출고대체");
    ws3.addRow(["스타일", "스타일명", "받는매장", "받는매장 채널코드", "물류에서 채울 수량", "받는매장 재고", "창고 가용재고(오프)"]);
    covered.forEach((x) => ws3.addRow([t(x.styleCode), t(x.productName), t(x.toStore), codeOf(x.toStore), n(x.qty), n(x.toStock), n(x.warehouseStock)]));
    ws3.getRow(1).font = { bold: true };
    [13, 28, 18, 12, 12, 10, 14].forEach((w, i) => (ws3.getColumn(i + 1).width = w));

    // 시트4: 계산기준
    const ws4 = wb.addWorksheet("계산기준");
    const info: [string, any][] = [
      ["계산 시각", t(saved.savedAt)],
      ["제안 건수(품번 단위)", items.length],
      ["지시서 행 수(칼라/사이즈 단위)", ws.rowCount - 1],
      ["칼라/사이즈 배분 못한 제안", unallocated ? `${unallocated}건 (칼라·사이즈 빈칸 행 — 직접 확인 필요)` : "없음"],
      ["판매 기준", diag.salesSource === "upload" ? `업로드 파일 — 전주 ${t(diag.weeklyUpload?.period1)} / 전전주 ${t(diag.weeklyUpload?.period2)} (${t(diag.weeklyUpload?.uploadedAt)} 업로드)` : `판매이력 최근 7일 + 그 전 7일 (${t(diag.historyWindow)})`],
      ["매장 재고 기준", `PIP 매장별 재고 스냅샷 ${t(diag.pipUploadedAt || saved.rtPipUpdatedAt)} 업로드분`],
      ["물류 가용재고", diag.warehouse?.used ? `${t(diag.warehouse.uploadedAt)} 업로드분 반영 — 물류 출고로 대체 ${n(diag.warehouseCoveredCount)}건/${n(diag.warehouseCoveredQty)}장` : "미반영"],
      ["", ""],
      ["[호조 RT] 대상", "전사 판매 TOP20 품번"],
      ["[호조 RT] 받는매장", "판매가 있고 재고 < 주간판매×3주 또는 재고주수 2주 이하 (점수순 품번당 최대 5곳)"],
      ["[호조 RT] 보내는매장", "안전재고 = max(3장, 목표재고, 주간판매×2주) 남기고 남는 만큼, 한 번에 가능량의 60%까지. 우수매장/플래그십은 되도록 제외"],
      ["[호조 RT] 창고 재고", "창고 가용재고(오프)가 있으면 받는매장 부족분을 물류 출고로 먼저 채우고 남는 것만 RT (시트 '물류출고대체')"],
      ["[호조 RT] 점수", "RT점수 = 상품판매력 70% + 재고부족도 20% + 점포매출력 10%"],
      ["[부진 RT] 대상", "TOP20 밖 품번"],
      ["[부진 RT] 보내는매장", "재고주수 8주 이상(최소 2장 남김)"],
      ["[부진 RT] 받는매장", "그 품번을 주 2장 이상 파는 매장 중 회전 빠른 하위 33%, 3주치까지"],
      ["[부진 RT] 제한", "이동 3장 이상만, 품번당 최대 2건"],
      ["[공통] 전량이동", "최근 2주 판매 1장 이하 + 재고 5장 이하 매장은 안전재고 없이 전량 이동 후보(우수매장 제외)"],
      ["[공통] 칼라/사이즈", "받는매장의 사이즈별 부족 비중대로 배분(없으면 보내는매장 재고 비율)"],
    ];
    info.forEach((r) => ws4.addRow(r));
    ws4.getColumn(1).width = 28;
    ws4.getColumn(2).width = 110;
    ws4.getColumn(1).font = { bold: true };

    const buf = await wb.xlsx.writeBuffer();
    const fileName = `RT_전체제안_검토용_${savedDate || "최근"}.xlsx`;
    return new Response(buf as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("rt-suggestions export failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "RT 엑셀 다운로드 실패" }, { status: 500 });
  }
}
