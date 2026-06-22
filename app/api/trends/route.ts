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

function channelTypeFromSheetName(sheetName: string, storeScope = "") {
  const s = `${text(sheetName)} ${text(storeScope)}`;
  if (s.includes("백화점")) return "백화점";
  if (s.includes("로드샵")) return "로드샵";
  if (s.includes("아울렛")) return "아울렛";
  if (s.includes("몰")) return "쇼핑몰";
  if (s.includes("통합")) return "통합";
  return "기타";
}

function weekFromSheetName(sheetName: string) {
  const m = text(sheetName).match(/(\d+)월\s*(\d+)주차/);
  if (!m) return text(sheetName).split("(")[0] || "";
  return `${m[1]}월 ${m[2]}주차`;
}

function weekKeyFromSheetName(sheetName: string) {
  const m = text(sheetName).match(/(\d+)월\s*(\d+)주차/);
  if (!m) return 0;
  return Number(m[1]) * 10 + Number(m[2]);
}

function pickLatestReportSheets(titles: string[]) {
  const reportSheets = titles.filter((title) => {
    const t = text(title);
    return t.includes("상품레포트") || t.includes("상품 레포트");
  });

  const latestKey = Math.max(0, ...reportSheets.map(weekKeyFromSheetName));
  if (!latestKey) return reportSheets;

  return reportSheets.filter((title) => weekKeyFromSheetName(title) === latestKey);
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

  const week = weekFromSheetName(sheetName);
  const storeScope = extractStores(rows, sheetName);
  const channelType = channelTypeFromSheetName(sheetName, storeScope);

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


function buildChannelSummary(items: any[]) {
  const map = new Map<string, any>();
  for (const item of items) {
    const key = item.channelType || "기타";
    if (!map.has(key)) {
      map.set(key, {
        channelType: key,
        mentionCount: 0,
        products: new Set<string>(),
        stores: new Set<string>(),
        issueCount: 0,
      });
    }
    const bucket = map.get(key);
    bucket.mentionCount += 1;
    bucket.products.add(item.productName);
    if (item.storeScope) bucket.stores.add(item.storeScope);

    const combined = `${item.salesReaction || ""} ${item.targetReaction || ""} ${item.actionPlan || ""}`;
    if (combined.includes("결품") || combined.includes("브로큰") || combined.includes("품절") || combined.includes("경고") || combined.includes("조치")) {
      bucket.issueCount += 1;
    }
  }

  return Array.from(map.values()).map((x) => ({
    channelType: x.channelType,
    mentionCount: x.mentionCount,
    productCount: x.products.size,
    storeCount: x.stores.size,
    issueCount: x.issueCount,
  })).sort((a, b) => b.mentionCount - a.mentionCount);
}

function buildHeadlineInsights(items: any[]) {
  const issueWords = ["결품", "브로큰", "품절", "경고", "리밸런싱", "재고", "보충", "소진"];
  const positiveWords = ["반응", "판매", "인기", "호응", "전환", "베스트", "상위"];
  const urgent = items
    .filter((item: any) => {
      const s = `${item.salesReaction || ""} ${item.actionPlan || ""}`;
      return issueWords.some((w) => s.includes(w));
    })
    .slice(0, 5)
    .map((item: any) => ({
      productName: item.productName,
      channelType: item.channelType,
      text: compactText(item.actionPlan || item.salesReaction, 130),
    }));

  const positive = items
    .filter((item: any) => {
      const s = `${item.salesReaction || ""} ${item.targetReaction || ""}`;
      return positiveWords.some((w) => s.includes(w));
    })
    .slice(0, 5)
    .map((item: any) => ({
      productName: item.productName,
      channelType: item.channelType,
      text: compactText(item.salesReaction || item.targetReaction, 130),
    }));

  return { urgent, positive };
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

    // 상품레포트 시트는 자동 탐색하되, 여러 주차가 같이 남아 있으면 최신 주차만 읽습니다.
    // 예: 6월2주차..., 6월3주차...가 함께 있으면 6월3주차 시트만 사용.
    const reportSheets = pickLatestReportSheets(titles);

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
      channelSummary: buildChannelSummary(items),
      headlineInsights: buildHeadlineInsights(items),
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
      channelSummary: [],
      headlineInsights: { urgent: [], positive: [] },
      productSummary: [],
    }, {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
}
