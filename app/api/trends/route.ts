import { NextResponse } from "next/server";
import { getDbSheetId, getManySheetValuesById, getSpreadsheetTitlesById } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function normalize(v: any) {
  return text(v).replace(/\s/g, "").toLowerCase();
}

function includesAny(value: any, words: string[]) {
  const n = normalize(value);
  return words.some((w) => n.includes(normalize(w)));
}

function channelTypeFromSheetName(sheetName: string) {
  const s = text(sheetName);
  if (s.includes("백화점")) return "백화점";
  if (s.includes("로드샵")) return "로드샵";
  if (s.includes("아울렛") || s.includes("몰")) return "아울렛몰";
  return "기타";
}

function weekFromSheetName(sheetName: string) {
  const m = text(sheetName).match(/(\d+)월\s*(\d+)주차/);
  if (!m) return text(sheetName).split("(")[0] || "";
  return `${m[1]}월 ${m[2]}주차`;
}

function findHeaderIndex(rows: any[][]) {
  return rows.findIndex((row) => row.some((cell) => includesAny(cell, ["상품명"])));
}

function findCol(header: any[], candidates: string[], fallback: number) {
  const idx = header.findIndex((cell) => candidates.some((c) => includesAny(cell, [c])));
  return idx >= 0 ? idx : fallback;
}

function extractStores(rows: any[][], sheetName: string) {
  const titleRow = rows.find((row) => row.some((cell) => text(cell).includes("상품 레포트")));
  const joined = titleRow ? titleRow.map(text).join(" ") : sheetName;
  const m = joined.match(/[(:：]\s*([^)]*)\)/);
  if (!m) return "";
  return m[1].replace(/^.*?:/, "").trim();
}

function parseReportSheet(sheetName: string, rows: any[][]) {
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) return [];

  const header = rows[headerIndex];
  const productCol = findCol(header, ["상품명", "상품명(품번)"], 1);
  const qtyCol = findCol(header, ["주간판매(수량)", "주간판매수량"], 2);
  const amountCol = findCol(header, ["주간판매(금액)", "주간판매금액"], 3);
  const salesReactionCol = findCol(header, ["금주판매반응", "판매반응", "특징"], 4);
  const targetReactionCol = findCol(header, ["타겟", "연령층"], 5);
  const actionCol = findCol(header, ["향후전망", "조치사항"], 6);

  const channelType = channelTypeFromSheetName(sheetName);
  const week = weekFromSheetName(sheetName);
  const storeScope = extractStores(rows, sheetName);

  return rows.slice(headerIndex + 1)
    .map((row, idx) => {
      const productName = text(row[productCol]);
      if (!productName || productName.includes("상품명")) return null;
      const salesReaction = text(row[salesReactionCol]);
      const targetReaction = text(row[targetReactionCol]);
      const actionPlan = text(row[actionCol]);
      if (!salesReaction && !targetReaction && !actionPlan) return null;

      return {
        id: `${sheetName}-${idx}-${productName}`,
        sheetName,
        week,
        channelType,
        storeScope,
        productName,
        weeklyQty: text(row[qtyCol]),
        weeklyAmount: text(row[amountCol]),
        salesReaction,
        targetReaction,
        actionPlan,
      };
    })
    .filter(Boolean);
}

function compactText(value: string, max = 220) {
  const s = text(value).replace(/\n{3,}/g, "\n\n");
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function buildProductSummary(items: any[]) {
  const map = new Map<string, any>();
  for (const item of items) {
    const key = item.productName;
    if (!map.has(key)) {
      map.set(key, {
        productName: item.productName,
        mentionCount: 0,
        channelTypes: new Set<string>(),
        weeks: new Set<string>(),
        comments: [],
      });
    }
    const bucket = map.get(key);
    bucket.mentionCount += 1;
    bucket.channelTypes.add(item.channelType);
    bucket.weeks.add(item.week);
    bucket.comments.push({
      channelType: item.channelType,
      week: item.week,
      storeScope: item.storeScope,
      salesReaction: compactText(item.salesReaction),
      targetReaction: compactText(item.targetReaction),
      actionPlan: compactText(item.actionPlan),
    });
  }

  return Array.from(map.values())
    .map((x) => ({
      ...x,
      channelTypes: Array.from(x.channelTypes),
      weeks: Array.from(x.weeks),
      comments: x.comments.slice(0, 6),
    }))
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, 50);
}

export async function GET() {
  try {
    const spreadsheetId = getDbSheetId();
    const titles = await getSpreadsheetTitlesById(spreadsheetId);

    const reportSheets = titles.filter((title) => {
      const t = text(title);
      return t.includes("상품레포트") || t.includes("상품 레포트");
    });

    const values = await getManySheetValuesById(spreadsheetId, reportSheets, "A:Z");
    const items = reportSheets.flatMap((sheetName) => parseReportSheet(sheetName, values[sheetName] || []));

    const channelTypes = Array.from(new Set(items.map((item: any) => item.channelType))).filter(Boolean);
    const weeks = Array.from(new Set(items.map((item: any) => item.week))).filter(Boolean);

    return NextResponse.json({
      source: "MARK_DB",
      reportSheets,
      channelTypes,
      weeks,
      items,
      productSummary: buildProductSummary(items),
      generatedAt: new Date().toISOString(),
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: any) {
    console.error("Trends load failed:", error);
    return NextResponse.json({
      source: "error",
      error: error?.message || "상품동향 데이터를 불러오지 못했습니다.",
      reportSheets: [],
      channelTypes: [],
      weeks: [],
      items: [],
      productSummary: [],
    }, {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
}
