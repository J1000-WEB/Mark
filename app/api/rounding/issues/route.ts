import { NextRequest, NextResponse } from "next/server";
import {
  saveRoundingIssue,
  listRoundingIssues,
  annotateIssueRepeats,
  updateRoundingIssueStatus,
  type SaveRoundingIssueInput,
  type RoundingIssueStatus,
} from "@/lib/roundingVisit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

// GET /api/rounding/issues?store=XXX&status=미해결
export async function GET(req: NextRequest) {
  try {
    const store = req.nextUrl.searchParams.get("store") || "";
    const status = (req.nextUrl.searchParams.get("status") || "") as RoundingIssueStatus | "";
    const issues = await listRoundingIssues({
      storeName: store || undefined,
      status: status || undefined,
    });
    // 반복지적 여부는 "그 매장의 전체 이력" 기준으로 계산해야 정확하므로, store 필터와
    // 무관하게 전체 목록에서 계산한 뒤 돌려줄 목록만 다시 추려냅니다.
    const allForRepeatCalc = store ? await listRoundingIssues({ storeName: store }) : issues;
    const withRepeats = annotateIssueRepeats(allForRepeatCalc);
    const byId = new Map(withRepeats.map((i) => [i.issueId, i]));
    const result = issues.map((i) => byId.get(i.issueId) || { ...i, repeatCount: 1, isRepeat: false });
    return NextResponse.json({ ok: true, issues: result }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("rounding issues GET failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SaveRoundingIssueInput;
    if (!body?.storeName || !body?.area || !body?.item || !body?.content) {
      return NextResponse.json({ ok: false, error: "매장/영역/항목/지적내용은 필수예요." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const issue = await saveRoundingIssue(body);
    return NextResponse.json({ ok: true, issue }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("rounding issues POST failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "저장 실패" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const issueId = String(body?.issueId || "");
    const status = String(body?.status || "") as RoundingIssueStatus;
    if (!issueId || (status !== "해결" && status !== "미해결")) {
      return NextResponse.json({ ok: false, error: "issueId/status가 올바르지 않아요." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const updated = await updateRoundingIssueStatus(issueId, status);
    if (!updated) {
      return NextResponse.json({ ok: false, error: "해당 지적사항을 찾지 못했어요." }, { status: 404, headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("rounding issues PATCH failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "수정 실패" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
