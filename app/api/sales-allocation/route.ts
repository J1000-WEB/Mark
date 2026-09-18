import { NextResponse } from "next/server";
import { buildSalesAllocationPlan } from "@/lib/dataBuilder";
import { getManySheetValues, getSpreadsheetTitles } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK 2026-09-17: "재고컨트롤 > 판매분 배분" — 기간 내 매장별 판매수량만큼(배분율 적용)
// 물류(창고)에서 매장으로 얼마를 보충할지 계산해서 보여주고, ERP 업로드용 엑셀로도 내려받습니다.
// JSON: GET /api/sales-allocation?start=2026-08-01&end=2026-08-31&ratio=100
// 엑셀: GET /api/sales-allocation?start=...&end=...&ratio=...&download=1

function text(v: any) {
  return String(v ?? "").trim();
}

function num(v: any) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/,/g, "").replace(/%/g, "").replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeStoreKey(storeName: string) {
  return String(storeName || "")
    .replace(/^오프라인[_\s-]*/i, "")
    .replace(/점$/g, "")
    .replace(/[\s_\-·.()]/g, "")
    .toLowerCase();
}

function displayStoreName(storeName: string) {
  const raw = String(storeName || "").replace(/^오프라인[_\s-]*/i, "").trim();
  const key = normalizeStoreKey(raw);
  const aliases: Record<string, string> = {
    "성수플래그십": "성수 플래그십",
    "성수flagship": "성수 플래그십",
    "신사플래그십": "신사 플래그십",
    "광주신세계": "신세계 광주점",
    "신세계광주": "신세계 광주점",
  };
  return aliases[key] || raw;
}

function normalizeSheetName(name: string) {
  return String(name || "").replace(/\s/g, "").replace(/[()]/g, "").toLowerCase();
}

function pickChannelSheet(titles: string[]) {
  const exact = titles.find((t) => t === "객_전주");
  if (exact) return exact;
  return titles.find((t) => normalizeSheetName(t).includes("객_전주")) || "객_전주";
}

// rt-result/route.ts의 channelCodeMap과 동일한 패턴(객_전주: C 채널코드, D 점포명, 이름→코드).
function channelCodeMap(rows: any[][]) {
  const map = new Map<string, string>();
  for (const row of rows.slice(1)) {
    const code = text(row[2]);
    const name = text(row[3]);
    if (code && name) {
      map.set(name, code);
      map.set(displayStoreName(name), code);
      map.set(normalizeStoreKey(name), code);
    }
  }
  return map;
}

function todayKST() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function excelEscape(value: any) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function buildExportXls(rows: any[], ratioPercent: number, startDate: string, endDate: string) {
  // ERP 업로드 양식(사용자 제공 이미지 기준): 채널코드,채널명,스타일,컬러,사이즈,기간판매,
  // 전매장누계판매,스타일,컬러,사이즈,매장재고,물류가용재고,지시수량,지시후매장재고,
  // 지시후물류유효재고,배분배수 — 스타일/컬러/사이즈 열이 두 번 반복되는 것도 ERP 원본 그대로.
  const titles = await getSpreadsheetTitles();
  const channelSheet = pickChannelSheet(titles);
  const channelValues = (await getManySheetValues([channelSheet], "A1:AZ5000").catch(() => ({})))[channelSheet] || [];
  const channels = channelCodeMap(channelValues);

  const exportHeader = [
    "채널코드", "채널명", "스타일", "컬러", "사이즈", "기간판매", "전매장누계판매",
    "스타일", "컬러", "사이즈", "매장재고", "물류가용재고", "지시수량",
    "지시후매장재고", "지시후물류유효재고", "배분배수",
  ];
  const ratioLabel = `${ratioPercent}%`;
  const exportRows = rows.map((r: any) => {
    const storeName = displayStoreName(r.storeName);
    const channelCode = channels.get(r.storeName) || channels.get(storeName) || channels.get(normalizeStoreKey(r.storeName)) || "";
    return [
      channelCode,
      storeName,
      r.styleCode,
      r.color,
      r.size,
      r.periodQty,
      r.companyPeriodQty,
      r.styleCode,
      r.color,
      r.size,
      r.storeStock,
      r.warehouseStock ?? "",
      r.orderQty,
      r.storeStockAfter,
      r.warehouseStockAfter,
      ratioLabel,
    ];
  });

  const tableRows = [exportHeader, ...exportRows]
    .map((row) => `<tr>${row.map((cell) => `<td style="mso-number-format:'\\@';">${excelEscape(cell)}</td>`).join("")}</tr>`)
    .join("\n");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
</head>
<body>
<table border="1">
${tableRows}
</table>
</body>
</html>`;

  const fileName = `판매분배분_${startDate}_${endDate}_${ratioPercent}%_${todayKST()}.xls`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const start = text(url.searchParams.get("start"));
    const end = text(url.searchParams.get("end") || url.searchParams.get("start"));
    const ratio = num(url.searchParams.get("ratio") || "100");
    const download = url.searchParams.get("download") === "1";

    if (!start || !end) {
      return NextResponse.json({ ok: false, error: "기간(start, end)을 선택해주세요." }, { status: 400 });
    }

    const plan = await buildSalesAllocationPlan(start, end, ratio);

    if (!download) {
      return NextResponse.json({ ok: true, ...plan }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    return await buildExportXls(plan.rows, plan.ratioPercent, plan.startDate, plan.endDate);
  } catch (error: any) {
    console.error("sales-allocation failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "판매분 배분 계산 실패" }, { status: 500 });
  }
}

// MARK 2026-09-17: "지시수량을 확인해서 수정할 수 있게 해달라"는 요청 — 화면에서 담당자가
// 지시수량을 직접 고치면(그리고 지시후 재고들도 화면에서 같이 재계산되면), 다운로드는 그
// 수정된 값 그대로 반영돼야 합니다. GET처럼 서버에서 다시 계산하면 수정 내용이 사라지므로,
// 화면이 가진 "현재 상태(수정 반영됨)" 그대로를 받아서 엑셀만 만들어줍니다.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rows = Array.isArray(body?.rows) ? body.rows : null;
    const ratioPercent = num(body?.ratioPercent ?? 100);
    const startDate = text(body?.startDate);
    const endDate = text(body?.endDate);
    if (!rows || !rows.length) {
      return NextResponse.json({ ok: false, error: "다운로드할 데이터가 없습니다." }, { status: 400 });
    }
    return await buildExportXls(rows, ratioPercent, startDate, endDate);
  } catch (error: any) {
    console.error("sales-allocation export failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "엑셀 생성 실패" }, { status: 500 });
  }
}
