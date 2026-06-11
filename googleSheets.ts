import { NextResponse } from "next/server";
import { appendValues } from "@/lib/googleSheets";
import { buildDashboardDataFromGoogleSheet, getFallbackData } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function n(value: any) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function money(value: any) {
  return `${Math.round(n(value)).toLocaleString("ko-KR")}원`;
}

function pct(value: any) {
  const x = n(value);
  return `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;
}

function topRows(rows: any[], count = 5) {
  return (rows || []).slice(0, count).map((r, i) => ({
    rank: i + 1,
    storeName: r.storeName,
    weekSales: r.weekSales,
    compareWeekSales: r.compareWeekSales,
    weekChangeRate: r.weekChangeRate,
  }));
}

function summarizeForAI(data: any) {
  const weeklyRows = (data.weekly?.current || []).map((r: any) => {
    const cmp = (data.weekly?.compare || []).find((x: any) => x.storeName === r.storeName) || {};
    return {
      ...r,
      compareWeekSales: n(cmp.weekSales),
      weekChangeRate: n(cmp.weekSales) ? ((n(r.weekSales) - n(cmp.weekSales)) / n(cmp.weekSales)) * 100 : n(r.weekSales) ? 100 : 0,
    };
  }).filter((r: any) => r.storeName && !String(r.storeName).startsWith("오프라인_"));

  const total = weeklyRows.reduce((s: number, r: any) => s + n(r.weekSales), 0);
  const prevTotal = weeklyRows.reduce((s: number, r: any) => s + n(r.compareWeekSales), 0);
  const growth = prevTotal ? ((total - prevTotal) / prevTotal) * 100 : 0;

  const goodStores = [...weeklyRows].filter((r) => n(r.weekSales) > 0).sort((a, b) => n(b.weekChangeRate) - n(a.weekChangeRate));
  const badStores = [...weeklyRows].filter((r) => n(r.weekSales) > 0).sort((a, b) => n(a.weekChangeRate) - n(b.weekChangeRate));
  const salesRank = [...weeklyRows].filter((r) => n(r.weekSales) > 0).sort((a, b) => n(b.weekSales) - n(a.weekSales));

  const inv = data.inventory || {};
  return {
    brand: "GENERAL IDEA",
    role: "오프라인 영업 MD",
    period: {
      weekly: data.weekly?.periodLabel || "",
      inventory: inv.periodLabel || "",
    },
    weeklySummary: {
      totalWeekSales: total,
      prevWeekSales: prevTotal,
      weekChangeRate: growth,
      storeCount: weeklyRows.length,
    },
    stores: {
      salesRankTop10: topRows(salesRank, 10),
      goodTop5: topRows(goodStores, 5),
      badTop5: topRows(badStores, 5),
    },
    products: {
      companyTopProducts: (data.weekly?.companyTopProducts || []).slice(0, 10),
      newTop10Entrants: data.weekly?.newTop10Entrants || [],
    },
    inventory: {
      rtSuggestions: inv.rtSuggestions || [],
      allocationSuggestions: inv.allocationSuggestions || [],
      stockoutRisk: (inv.stockoutRisk || []).slice(0, 10),
      overstockRisk: (inv.overstockRisk || []).slice(0, 10),
      promotionSuggestions: (inv.promotionSuggestions || []).slice(0, 20),
      productAnalysisSample: (inv.productAnalysisList || []).slice(0, 20),
    },
    memos: {
      note: "점포별 담당자 메모는 별도 소장군 시트에 저장됩니다. 이번 Alpha 인사이트는 매출/상품/재고/프로모션 계산 결과 중심입니다.",
    },
  };
}

function buildPrompt(summary: any) {
  return `당신은 패션 브랜드 'GENERAL IDEA'의 오프라인 영업 MD입니다.

역할:
- 매출, 점포, 상품, 재고, 가격 데이터를 보고 현업에서 바로 실행할 수 있는 인사이트를 제안합니다.
- 숫자 계산은 시스템이 이미 완료했습니다. 당신은 계산된 숫자를 근거로 해석과 우선순위 판단을 합니다.
- 없는 데이터를 추정하거나 만들어내지 마십시오.
- 봄상품은 무조건 할인으로 소진하기보다 다음 시즌 판매 가능성도 함께 고려하십시오.
- RT로 해결 가능한 재고 문제는 프로모션보다 RT/물류 이동을 우선 검토하십시오.
- 온라인/오프라인 재고를 함께 보고 판단하십시오.
- 답변은 한국어로, 회의자료에 바로 붙일 수 있게 간결하고 명확하게 작성하십시오.

출력 형식:
[핵심요약]
- 3줄 이내

[상품 인사이트]
- 3~5개

[점포 인사이트]
- 3~5개

[재고/RT 인사이트]
- 3~5개

[프로모션/가격 인사이트]
- 3~5개

[이번주 액션 TOP5]
1.
2.
3.
4.
5.

분석 데이터(JSON):
${JSON.stringify(summary, null, 2)}`;
}

async function callClaude(prompt: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1800,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || `Claude API error: ${res.status}`);
  }

  return (json.content || []).map((c: any) => c.text || "").join("\n").trim();
}

async function saveInsightToSheet(content: string, summary: any) {
  try {
    const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    await appendValues("'AI인사이트'!A:E", [[now, "weekly", "이번주 AI 인사이트", content, JSON.stringify(summary.weeklySummary || {})]]);
    return true;
  } catch (error) {
    console.error("AI insight save failed:", error);
    return false;
  }
}

export async function POST() {
  try {
    let data: any;
    try {
      data = await buildDashboardDataFromGoogleSheet();
    } catch (error) {
      console.error("AI insight data build failed, fallback used:", error);
      data = getFallbackData();
    }

    const summary = summarizeForAI(data);
    const prompt = buildPrompt(summary);
    const insight = await callClaude(prompt);
    const saved = await saveInsightToSheet(insight, summary);

    return NextResponse.json({ ok: true, insight, saved, summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("AI insight failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "AI insight failed" }, { status: 500 });
  }
}
