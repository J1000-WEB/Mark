import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import {
  listRoundingVisits,
  listRoundingIssues,
  annotateIssueRepeats,
  getRoundingAutoFill,
  ROUNDING_CHECKLIST,
  ROUNDING_CATEGORIES,
  ROUNDING_CATEGORY_MAX,
  type RoundingVisitRecord,
} from "@/lib/roundingVisit";
import { getRoundingInventory } from "@/lib/roundingInventory";
import { RT_SKU_STORES, normalizeStoreKey } from "@/lib/rtSkuEngine";
import { downloadDriveFileWritable } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

// MARK 2026-10-28: 매장별 라운딩 보고서(엑셀) — 소천님 예전 "매장방문기록_모듈.xlsx"의 "입점이력_보고서" 양식을 그대로
// 따르고(매출·재고 현황 / 점수 요약·직전 대비 / 총평 / 영역별 체크 / 미해결 지적사항 / 사진), 라운딩 탭에서 새로 생긴
// 재고 점검 요약과 재고 조치(남길 때 재고·판매 → 지금)를 덧붙입니다.
//   GET /api/rounding/report?store=매장명[&visitId=V-...]  (visitId 없으면 그 매장 최근 방문)

const t = (v: any) => String(v ?? "").trim();
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pct = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "-" : `${(v * 100).toFixed(1)}%`);
const wk = (v: number) => (v >= 99 ? "판매없음" : `${v}주`);
const GRADE_BANDS: [string, string][] = [["100~91", "A"], ["90~81", "B"], ["80~71", "C"], ["70~61", "D"], ["60~51", "E"], ["50 이하", "F"]];

const FILL = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
const BORDER = { top: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, left: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, bottom: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, right: { style: "thin" as const, color: { argb: "FFD1D5DB" } } };

function currentOf(skuMap: Record<string, [number, number, number]> | undefined, target: string) {
  if (!skuMap || !target) return null;
  if (target.split("|").length === 3) {
    const v = skuMap[target];
    return { stock: v?.[0] || 0, w1: v?.[1] || 0, w2: v?.[2] || 0 };
  }
  let stock = 0, w1 = 0, w2 = 0;
  for (const [k, v] of Object.entries(skuMap)) {
    if (!k.startsWith(`${target}|`)) continue;
    stock += v[0];
    w1 += v[1];
    w2 += v[2];
  }
  return { stock, w1, w2 };
}

export async function GET(req: NextRequest) {
  try {
    const store = req.nextUrl.searchParams.get("store") || "";
    const visitId = req.nextUrl.searchParams.get("visitId") || "";
    if (!store) return NextResponse.json({ ok: false, error: "store가 필요해요." }, { status: 400 });

    const [visits, issuesAll, inv] = await Promise.all([
      listRoundingVisits({ storeName: store }),
      listRoundingIssues({ storeName: store }),
      getRoundingInventory(store).catch(() => null),
    ]);
    const idx = visitId ? visits.findIndex((v) => v.visitId === visitId) : 0;
    const visit: RoundingVisitRecord | null = visits[idx] || null;
    const prev: RoundingVisitRecord | null = visit ? visits[idx + 1] || null : visits[0] || null;
    // 방문기록이 아직 없으면 오늘 자동입력 숫자로 채움
    const auto = visit ? null : await getRoundingAutoFill(store).catch(() => null);
    const nums = visit || auto;
    const visitDate = visit?.visitDate || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const storeInfo = RT_SKU_STORES.find((s) => normalizeStoreKey(s.name) === normalizeStoreKey(store));
    const issues = annotateIssueRepeats(issuesAll);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("라운딩보고서", { views: [{ showGridLines: false }] });
    [16, 16, 16, 16, 16, 16, 16, 16].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    let r = 1;
    const title = (text: string) => {
      ws.mergeCells(r, 1, r, 8);
      const c = ws.getCell(r, 1);
      c.value = text;
      c.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
      c.fill = FILL("FF1E293B");
      c.alignment = { vertical: "middle" };
      ws.getRow(r).height = 22;
      r++;
    };
    const kv = (pairs: [string, any][]) => {
      pairs.forEach(([k, v], i) => {
        const kc = ws.getCell(r, i * 2 + 1);
        kc.value = k;
        kc.font = { bold: true, color: { argb: "FF475569" } };
        kc.fill = FILL("FFF1F5F9");
        kc.border = BORDER;
        const vc = ws.getCell(r, i * 2 + 2);
        vc.value = v;
        vc.border = BORDER;
        if (typeof v === "number") vc.numFmt = "#,##0";
      });
      r++;
    };
    const headRow = (cells: string[]) => {
      cells.forEach((h, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = h;
        c.font = { bold: true };
        c.fill = FILL("FFE2E8F0");
        c.border = BORDER;
        c.alignment = { wrapText: true, vertical: "middle" };
      });
      r++;
    };

    // 제목
    ws.mergeCells(r, 1, r, 8);
    ws.getCell(r, 1).value = `${store}  라운딩 보고서`;
    ws.getCell(r, 1).font = { bold: true, size: 16 };
    ws.getRow(r).height = 28;
    r += 2;
    kv([["점포명", store], ["방문일", visit ? visitDate : `${visitDate} (방문기록 저장 전)`], ["담당 SV", visit?.visitedBy || "소천"], ["점포코드 · 등급", storeInfo ? `${storeInfo.code} · ${storeInfo.grade}등급(판매 ${storeInfo.rank}위)` : "-"]]);
    kv([["지역", nums?.region || "-"], ["최근 방문", visits[0]?.visitDate || "없음"], ["방문 횟수", visits.length], ["작성", visit?.createdAt || "-"]]);
    r++;

    // 매출·재고 현황
    title("매출 · 재고 현황");
    kv([["전주 매출", n(nums?.prevWeekAmount)], ["전전주 매출", n(nums?.prevPrevWeekAmount)], ["신장률", pct(nums?.wowGrowthRate ?? null)], ["금주 목표 달성율", pct(nums?.achievementRate ?? null)]]);
    kv([["금주 목표", n(nums?.periodTarget)], ["금주 실적", n(nums?.periodActual)], ["금주 객수", n(nums?.receiptCount)], ["객단가", n(nums?.avgReceiptAmount)]]);
    kv([["총 재고수량", n(nums?.totalStockQty)], ["총 재고금액", n(nums?.totalStockAmount)], ["", ""], ["", ""]]);
    r++;

    // 점수 요약
    title("점수 요약 · 직전 방문 대비");
    headRow(["영역", "배점", "이번 방문", "직전 방문", "증감", "", "등급 기준", "등급"]);
    const scoreRows: [string, number, number | null, number | null][] = ROUNDING_CATEGORIES.map((cat) => [cat, ROUNDING_CATEGORY_MAX[cat], visit ? visit.scoreByCategory[cat] : null, prev && visit ? prev.scoreByCategory[cat] : null]);
    scoreRows.push(["총점", 100, visit ? visit.totalScore : null, prev && visit ? prev.totalScore : null]);
    scoreRows.forEach(([cat, max, cur, before], i) => {
      const vals: any[] = [cat, max, cur ?? "-", before ?? "-", cur !== null && before !== null ? cur - before : "-", "", GRADE_BANDS[i]?.[0] || "", GRADE_BANDS[i]?.[1] || ""];
      vals.forEach((v, j) => {
        const c = ws.getCell(r, j + 1);
        c.value = v;
        if (j < 5 || j > 5) c.border = BORDER;
        if (cat === "총점" && j < 5) c.font = { bold: true };
      });
      r++;
    });
    ["", "", "", "", "", "", GRADE_BANDS[5][0], GRADE_BANDS[5][1]].forEach((v, j) => {
      if (j >= 6) {
        ws.getCell(r, j + 1).value = v;
        ws.getCell(r, j + 1).border = BORDER;
      }
    });
    r++;
    ws.getCell(r, 1).value = visit ? `이번 방문 ${visit.totalScore}점 · ${visit.grade}등급${prev ? ` (직전 ${prev.visitDate} ${prev.totalScore}점)` : " · 직전 방문 기록 없음(첫 방문 기록)"}` : "※ 아직 저장된 방문기록이 없어요 — 라운딩 탭에서 방문기록을 저장하면 점수가 채워져요.";
    ws.getCell(r, 1).font = { italic: true, color: { argb: "FF64748B" } };
    r += 2;

    // 총평
    title("입점 이력 총평");
    const commentLabels: [string, string][] = [["인사관리", "01. 인사관리 · CS"], ["매장관리", "02. 매장관리 · VMD"], ["재고관리", "03. STOCK · 재고"], ["매출관리", "04. 매출 · 행사 · 기타"]];
    for (const [cat, label] of commentLabels) {
      const c1 = ws.getCell(r, 1);
      c1.value = label;
      c1.font = { bold: true };
      c1.fill = FILL("FFF1F5F9");
      c1.border = BORDER;
      c1.alignment = { vertical: "top" };
      ws.mergeCells(r, 2, r, 8);
      const c2 = ws.getCell(r, 2);
      c2.value = t((visit?.comments as any)?.[cat]) || "-";
      c2.alignment = { wrapText: true, vertical: "top" };
      c2.border = BORDER;
      const lines = Math.max(1, Math.ceil(String(c2.value).length / 70) + String(c2.value).split("\n").length - 1);
      ws.getRow(r).height = Math.min(120, 18 * lines);
      r++;
    }
    r++;

    // 영역별 체크
    title("영역별 체크 결과");
    for (const cat of ROUNDING_CATEGORIES) {
      const items = ROUNDING_CHECKLIST.filter((x) => x.category === cat);
      headRow([cat, ...items.map((x) => `${x.label} (${x.weight})`), "득점 / 배점"]);
      const vals = ["O / X", ...items.map((x) => (visit ? visit.checklist[x.key] || "-" : "-")), visit ? `${visit.scoreByCategory[cat]} / ${ROUNDING_CATEGORY_MAX[cat]}` : `- / ${ROUNDING_CATEGORY_MAX[cat]}`];
      vals.forEach((v, j) => {
        const c = ws.getCell(r, j + 1);
        c.value = v;
        c.border = BORDER;
        c.alignment = { horizontal: "center" };
        if (v === "X") c.font = { bold: true, color: { argb: "FFDC2626" } };
        if (v === "O") c.font = { bold: true, color: { argb: "FF2563EB" } };
      });
      r++;
    }
    r++;

    // 재고 점검 요약
    const s = inv?.store?.summary;
    title(`재고 점검 (${inv?.meta?.computedAt || "-"} 기준)`);
    if (s && inv?.store) {
      kv([["총 재고", `${s.stock.toLocaleString("ko-KR")}장 (매장평균 ${s.company.avgStock.toLocaleString("ko-KR")})`], ["주간 판매(2주평균)", `${s.weekly}장 (매장평균 ${s.company.avgWeekly})`], ["재고주수", `${wk(s.weeks)} (전사 ${wk(s.company.weeks)})`], ["지난주 대비", s.stockDelta === null ? "기록 쌓는 중" : `${s.stockDelta >= 0 ? "+" : ""}${s.stockDelta.toLocaleString("ko-KR")}장`]]);
      kv([["재고 많은 순", `${s.stockRank}위 / ${s.storeCount}`], ["재고주수 긴 순", `${s.weeksRank}위 / ${s.storeCount}`], ["TOP20 품절·사이즈깨짐", `${inv.store.topIssues.length}개 품번 (창고로 채울 수 있는 것 ${inv.store.topIssues.filter((it: any) => (it.notCarried ? it.warehouseStyle > 0 : it.skus.some((x: any) => x.warehouse > 0))).length}개)`], ["보충 대상 / 신상품 저조", `${inv.store.boost.length}개(창고 있음 ${inv.store.boost.filter((b: any) => b.warehouse > 0).length}) / ${inv.store.newProducts.filter((p: any) => p.low).length}개`]]);
      ws.getCell(r, 1).value = "※ 품번·SKU 상세는 '재고점검' 시트";
      ws.getCell(r, 1).font = { italic: true, color: { argb: "FF64748B" } };
      r++;
    } else {
      ws.getCell(r, 1).value = "재고 점검 데이터를 찾지 못했어요(직영 오프라인 매장만 제공).";
      r++;
    }
    r++;

    // 재고 조치
    const invActions = issues.filter((i) => i.area === "재고관리" && i.target);
    title(`재고 조치 (${invActions.length}건 · 남길 때 → 지금)`);
    headRow(["조치일", "상태", "조치유형", "대상", "남길 때 재고·주판매", "지금 재고·최근1주", "변화(재고·판매)", "메모 / 기한"]);
    for (const i of invActions) {
      const snap = i.snapshot || {};
      const cur = currentOf(inv?.store?.skuMap, i.target);
      const ds = cur ? cur.stock - n(snap.stock) : null;
      const dw = cur ? cur.w1 - n(snap.w1) : null;
      const vals = [i.issueDate, i.status === "해결" ? `해결 ${i.resolvedAt}` : "진행중", i.actionType || "-", t(snap.label) || i.target, `${n(snap.stock)} · ${n(snap.w1)}`, cur ? `${cur.stock} · ${cur.w1}` : "-", ds === null ? "-" : `${ds >= 0 ? "+" : ""}${ds} · ${dw! >= 0 ? "+" : ""}${dw}`, [i.action, i.dueDate ? `기한 ${i.dueDate}` : ""].filter(Boolean).join(" / ") || "-"];
      vals.forEach((v, j) => {
        const c = ws.getCell(r, j + 1);
        c.value = v;
        c.border = BORDER;
        c.alignment = { wrapText: true, vertical: "top" };
        if (j === 6 && dw !== null) c.font = { bold: true, color: { argb: dw > 0 ? "FF2563EB" : dw < 0 ? "FFDC2626" : "FF475569" } };
      });
      r++;
    }
    if (!invActions.length) {
      ws.getCell(r, 1).value = "남긴 재고 조치가 없어요.";
      r++;
    }
    r++;

    // 미해결 지적사항(재고 조치 제외)
    const open = issues.filter((i) => i.status === "미해결" && !(i.area === "재고관리" && i.target));
    title(`미해결 지적사항 (${open.length}건)`);
    headRow(["지적일", "구분 · 상태", "영역 / 항목", "지적 내용", "", "", "조치 / 피드백", ""]);
    for (const i of open) {
      ws.getCell(r, 1).value = i.issueDate;
      ws.getCell(r, 2).value = `${i.isRepeat ? `반복 ${i.repeatCount}회` : "신규"} · ${i.status}`;
      ws.getCell(r, 3).value = `${i.area}\n${i.item}`;
      ws.mergeCells(r, 4, r, 6);
      ws.getCell(r, 4).value = i.content;
      ws.mergeCells(r, 7, r, 8);
      ws.getCell(r, 7).value = i.action || "";
      for (let j = 1; j <= 8; j++) {
        const c = ws.getCell(r, j);
        c.border = BORDER;
        c.alignment = { wrapText: true, vertical: "top" };
      }
      if (i.isRepeat) ws.getCell(r, 2).font = { bold: true, color: { argb: "FFDC2626" } };
      ws.getRow(r).height = Math.min(90, 18 * Math.max(2, Math.ceil(i.content.length / 45)));
      r++;
    }
    if (!open.length) {
      ws.getCell(r, 1).value = "미해결 지적사항이 없어요.";
      r++;
    }
    r++;

    // 사진
    title("매장 사진");
    const photos = (visit?.photos || []).slice(0, 8);
    if (!photos.length) {
      ws.getCell(r, 1).value = "첨부된 사진이 없어요.";
      r++;
    } else {
      let col = 0;
      const startRow = r;
      for (const id of photos) {
        try {
          const { buffer, mimeType } = await downloadDriveFileWritable(id);
          const imageId = wb.addImage({ buffer: buffer as any, extension: /png/i.test(mimeType) ? "png" : "jpeg" });
          const rowOff = Math.floor(col / 4) * 12;
          ws.addImage(imageId, { tl: { col: (col % 4) * 2, row: startRow - 1 + rowOff }, ext: { width: 230, height: 230 } });
          col++;
        } catch (e) {
          console.error("[rounding-report] 사진 넣기 실패(무시):", id, e);
        }
      }
      r = startRow + Math.ceil(col / 4) * 12 + 1;
    }

    // 재고점검 상세 시트
    if (inv?.store) {
      const d = wb.addWorksheet("재고점검");
      d.addRow([`${store} 재고 점검 상세 — ${inv.meta?.computedAt || ""} 기준 (판매 전주 ${inv.meta?.week1 || ""} / 전전주 ${inv.meta?.week2 || ""}, 창고 ${inv.meta?.warehouseUploadedAt || "-"})`]).font = { bold: true };
      d.addRow([]);
      d.addRow(["[전사 TOP20 품절·품절임박·사이즈깨짐]"]).font = { bold: true };
      const h1 = d.addRow(["전사순위", "스타일", "스타일명", "칼라", "사이즈", "구분", "매장재고", "매장 주판매", "재고주수", "전사 2주판매", "창고가용(오프)"]);
      // 품번 단위 요약 줄(칼라/사이즈 비움): 매장 보유 합계·재고주수 vs 전사
      h1.font = { bold: true };
      for (const it of inv.store.topIssues) {
        d.addRow([it.companyRank, it.styleCode, it.productName, "(품번 합계)", "", it.notCarried ? "매장 미보유" : `전사 재고주수 ${it.companyWeeks !== undefined ? wk(it.companyWeeks) : "-"}`, it.storeStock, it.storeWeekly ?? "", it.storeWeeks !== undefined ? wk(it.storeWeeks) : "", it.companyQty2w, it.warehouseStyle]).font = { bold: true };
        for (const x of it.skus) d.addRow([it.companyRank, it.styleCode, it.productName, x.colorName || x.color, x.size, x.type, x.stock, x.weekly, wk(x.weeks), x.companyQty2w, x.warehouse]);
      }
      d.addRow([]);
      d.addRow(["[보충 대상 — 오래 품절된 인기 SKU]"]).font = { bold: true };
      d.addRow(["스타일", "스타일명", "칼라", "사이즈", "매장 누적판매", "전사 2주판매", "창고가용(오프)"]).font = { bold: true };
      for (const b of inv.store.boost) d.addRow([b.styleCode, b.productName, b.colorName || b.color, b.size, b.cumQty, b.companyQty2w, b.warehouse]);
      d.addRow([]);
      d.addRow(["[신상품 반응 — 최근 3주]"]).font = { bold: true };
      d.addRow(["스타일", "스타일명", "판정", "매장 판매", "매장 재고", "매장 판매율", "전사 판매율", "보유매장 중 순위", "전사 매장당 판매"]).font = { bold: true };
      for (const p of inv.store.newProducts) d.addRow([p.styleCode, p.productName, p.low ? "저조" : "", p.storeSold, p.storeStock, `${p.storeSellThrough}%`, `${p.companySellThrough}%`, `${p.storeSTRank} / ${p.carryingStores}`, p.companyAvgSold]);
      [12, 14, 28, 14, 8, 12, 10, 12, 10, 12, 14].forEach((w, i) => (d.getColumn(i + 1).width = w));
    }

    const buf = await wb.xlsx.writeBuffer();
    const fileName = `라운딩보고서_${store}_${visitDate}.xlsx`;
    return new Response(buf as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("rounding report failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "보고서 만들기 실패" }, { status: 500 });
  }
}
