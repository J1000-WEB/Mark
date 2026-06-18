import { NextResponse } from "next/server";
import { appendValues } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function text(v: any) {
  return String(v ?? "").trim();
}

function nowKST() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function compact(value: any, max = 1200) {
  const s = text(value);
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body?.items) ? body.items : [];
    const channelSummary = Array.isArray(body?.channelSummary) ? body.channelSummary : [];
    const headlineInsights = body?.headlineInsights || {};
    const note = text(body?.note);

    const topProducts = items.slice(0, 20).map((item: any, idx: number) => {
      const comments = Array.isArray(item.comments) ? item.comments.slice(0, 3) : [];
      const commentText = comments.map((c: any) => [
        `- 채널: ${text(c.channelType)}`,
        c.storeScope ? `  점포범위: ${text(c.storeScope)}` : "",
        c.salesReaction ? `  판매반응: ${compact(c.salesReaction, 450)}` : "",
        c.targetReaction ? `  타겟반응: ${compact(c.targetReaction, 300)}` : "",
        c.actionPlan ? `  조치사항: ${compact(c.actionPlan, 350)}` : "",
      ].filter(Boolean).join("\n")).join("\n");

      return [
        `${idx + 1}. ${text(item.productName)}`,
        `언급수: ${item.mentionCount || 0}`,
        `채널: ${(item.channelTypes || []).join(", ")}`,
        commentText,
      ].join("\n");
    }).join("\n\n");

    const channelText = channelSummary.map((c: any) => {
      return `- ${text(c.channelType)}: 언급 ${c.mentionCount || 0}건 / 상품 ${c.productCount || 0}개 / 이슈 ${c.issueCount || 0}건`;
    }).join("\n");

    const urgentText = (headlineInsights?.urgent || []).slice(0, 8).map((x: any, idx: number) => {
      return `${idx + 1}. [${text(x.channelType)}] ${text(x.productName)} - ${compact(x.text, 220)}`;
    }).join("\n");

    const positiveText = (headlineInsights?.positive || []).slice(0, 8).map((x: any, idx: number) => {
      return `${idx + 1}. [${text(x.channelType)}] ${text(x.productName)} - ${compact(x.text, 220)}`;
    }).join("\n");

    const request = `상품동향 주간 레포트를 분석해 주세요.

목표:
1. 채널유형별 핵심 상품 반응 요약
2. 재고 보충/리밸런싱이 필요한 상품 추출
3. RT 우선 검토 상품 제안
4. VMD/세일즈 멘트/조치사항 제안
5. 대시보드에 표시할 수 있는 간결한 요약 생성

주의:
- 없는 데이터는 추정하지 마세요.
- 숫자보다 현장 코멘트를 우선 해석하세요.
- RT 제안은 "판매 전환 가능성" 기준으로 판단하세요.
- 결과는 상품별/채널별로 구분해 주세요.

${note ? `추가 요청:\n${note}\n\n` : ""}채널 요약:
${channelText || "채널 요약 없음"}

재고/조치 필요 후보:
${urgentText || "없음"}

판매 반응 우수 후보:
${positiveText || "없음"}

상품별 코멘트:
${topProducts || "상품동향 데이터 없음"}`;

    const requestId = makeId("TREND");
    await appendValues("'Research_Request'!A:F", [[
      requestId,
      nowKST(),
      "product_trend",
      request,
      "pending",
      "",
    ]]);

    return NextResponse.json({
      ok: true,
      requestId,
      message: "상품동향 Agent 분석 요청이 Research_Request에 등록되었습니다.",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("Trend agent request failed:", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "상품동향 Agent 분석 요청 실패",
    }, { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}


function parseKoreanDateText(value: any) {
  const s = text(value);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

async function getSheetValuesLocal(sheetName: string, range = "A:AZ") {
  const { getSheetValues } = await import("@/lib/googleSheets");
  return getSheetValues(sheetName, range);
}

export async function GET() {
  try {
    const rows = await getSheetValuesLocal("Research_Result", "A:E").catch(() => []);
    const trendRows = rows.slice(1)
      .map((row: any[]) => ({
        id: text(row[0]),
        createdAt: text(row[1]),
        requestId: text(row[2]),
        result: text(row[3]),
        status: text(row[4]),
      }))
      .filter((row: any) => row.requestId.startsWith("TREND-") || row.id.startsWith("TREND-"))
      .sort((a: any, b: any) => parseKoreanDateText(b.createdAt) - parseKoreanDateText(a.createdAt));

    const latest = trendRows[0] || null;

    return NextResponse.json({
      ok: true,
      latest,
      count: trendRows.length,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("Trend agent result load failed:", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "Agent 분석 결과를 불러오지 못했습니다.",
      latest: null,
      count: 0,
    }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
