import { NextResponse } from "next/server";
import { appendValues, ensureSheetExists, getSheetValues, getSpreadsheetTitles } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LOGIC_PASSWORD = process.env.LOGIC_CENTER_PASSWORD || "4885";

function checkPassword(value: string | null) {
  return value === LOGIC_PASSWORD;
}

function slimRows(rows: any[][], limit = 20) {
  return (rows || []).slice(0, limit).map((row) => row.map((v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return s.length > 180 ? `${s.slice(0, 180)}...` : s;
  }));
}

function findHeaderRow(rows: any[][]) {
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const score = (rows[i] || []).filter((x) => String(x || "").trim()).length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

async function safeSheet(sheetName: string, range = "A:AZ", limit = 20) {
  try {
    const rows = await getSheetValues(sheetName, range);
    return slimRows(rows, limit);
  } catch {
    return [];
  }
}

async function buildSheetStructure(titles: string[]) {
  const targetTitles = titles.filter((t) => {
    const n = t.replace(/\s/g, "");
    return (
      n.includes("금주") ||
      n.includes("차주") ||
      n.includes("전주") ||
      n.includes("온오프") ||
      n.includes("재고") ||
      n.includes("일간") ||
      n.includes("월간")
    );
  }).slice(0, 8);

  const sheets = [];
  for (const title of targetTitles) {
    const rows = await safeSheet(title, "A:AZ", 12);
    const headerIndex = findHeaderRow(rows);
    sheets.push({
      title,
      headerRowIndex: headerIndex,
      header: rows[headerIndex] || [],
      sampleRows: rows.slice(headerIndex + 1, headerIndex + 4),
    });
  }
  return sheets;
}

function buildPrompt(pack: any) {
  return `당신은 패션 브랜드 GENERAL IDEA의 오프라인 영업 MD Research Agent입니다.

목표:
- Snapshot_Master, Logic_Master, AI인사이트, 현재 구글시트 구조를 읽고
- 기존 로직과 중복되지 않는 신규 운영 로직을 제안합니다.
- 제안은 GENERAL IDEA 오프라인 매출/재고/RT/프로모션/점포 운영에 실제 적용 가능해야 합니다.
- 없는 데이터를 만들지 말고, 제공된 데이터에서 확인 가능한 근거만 사용하십시오.
- 자동 적용하지 않습니다. 소천 MD가 Logic Center에서 승인해야 합니다.

반드시 아래 형식으로 신규 로직 3~5개를 제안하세요.

[로직 제안]
Category:
Title:
Problem:
Condition_JSON:
Action:
Reason:
Expected_Effect:
Risk:
Priority: High/Medium/Low

중복 방지:
- Logic_Master에 이미 있는 approved/pending 로직과 같은 제안은 제외하십시오.
- 기존 로직을 개선하는 경우에는 "개선안"이라고 명시하십시오.

분석 데이터:
${JSON.stringify(pack, null, 2)}`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    if (!checkPassword(url.searchParams.get("password"))) {
      return NextResponse.json({ ok: false, error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const titles = await getSpreadsheetTitles();
    const snapshotRows = await safeSheet("Snapshot_Master", "A:E", 21);
    const logicRows = await safeSheet("Logic_Master", "A:F", 80);
    const insightRows = await safeSheet("AI인사이트", "A:E", 30);
    const sheetStructure = await buildSheetStructure(titles);

    const pack = {
      generatedAt: new Date().toISOString(),
      version: "Mark4.6",
      purpose: "Claude Code/Claude Chat Research Agent input pack",
      snapshotMaster: {
        header: snapshotRows[0] || [],
        recentRows: snapshotRows.slice(1).reverse().slice(0, 20),
      },
      logicMaster: {
        header: logicRows[0] || [],
        rows: logicRows.slice(1).reverse().slice(0, 60),
      },
      aiInsights: {
        header: insightRows[0] || [],
        recentRows: insightRows.slice(1).reverse().slice(0, 20),
      },
      spreadsheet: {
        titles,
        structure: sheetStructure,
      },
      instructions: {
        pasteResultTo: "Mark > Logic Center > Claude 제안 등록",
        approvalFlow: "pending -> approved/hold/rejected",
      },
    };

    const prompt = buildPrompt(pack);
    return NextResponse.json({ ok: true, pack, prompt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Research pack build failed" }, { status: 500 });
  }
}


const LOGIC_SHEET = "Logic_Master";
const LOGIC_HEADER = ["CreatedAt","Category","Title","Proposal","Status","ApprovedBy"];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const resultText = String(body.resultText || "");
    const password = String(body.password || "");
    if (password !== (process.env.LOGIC_CENTER_PASSWORD || "4885")) {
      return NextResponse.json({ ok:false, error:"비밀번호 오류" }, { status:401 });
    }

    await ensureSheetExists(LOGIC_SHEET, LOGIC_HEADER);

    const blocks = resultText.split("[로직 제안]").map(v=>v.trim()).filter(Boolean);
    const proposals = blocks.length ? blocks : [resultText];

    const now = new Date().toLocaleString("ko-KR",{timeZone:"Asia/Seoul"});
    const rows = proposals.map((p,idx)=>[
      now,
      "Research",
      `Research Proposal ${idx+1}`,
      p,
      "pending",
      ""
    ]);

    await appendValues(`'${LOGIC_SHEET}'!A:F`, rows);

    return NextResponse.json({ ok:true, count: rows.length });
  } catch(e:any) {
    return NextResponse.json({ ok:false, error:e?.message || "save failed" }, { status:500 });
  }
}
