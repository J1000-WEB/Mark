import { NextResponse } from "next/server";
import { appendValues, ensureSheetExists, getSheetValues, updateValues } from "@/lib/googleSheets";
import { logAction } from "@/lib/actionLog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROPOSAL_SHEET = "Logic_Proposal";
const MASTER_SHEET = "Logic_Master";
const REQUEST_SHEET = "Research_Request";
const RESULT_SHEET = "Research_Result";

const PROPOSAL_HEADER = [
  "ID",
  "CreatedAt",
  "SourceRequestID",
  "Category",
  "Title",
  "Proposal",
  "Condition_JSON",
  "Priority",
  "Status",
  "ApprovedBy",
  "ApprovedAt",
];

const MASTER_HEADER = [
  "ID",
  "CreatedAt",
  "Category",
  "Title",
  "Proposal",
  "Condition_JSON",
  "Version",
  "Status",
  "ApprovedBy",
  "ApprovedAt",
  "Implemented",
];

const REQUEST_HEADER = ["ID", "CreatedAt", "Type", "Request", "Status", "ProcessedAt"];
const RESULT_HEADER = ["ID", "CreatedAt", "RequestID", "Result", "Status"];

function checkPassword(value: string | null) {
  const expected = process.env.LOGIC_CENTER_PASSWORD || "4885";
  return value === expected;
}

function nowKST() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function ensureLogicSheets() {
  await ensureSheetExists(PROPOSAL_SHEET, PROPOSAL_HEADER);
  await ensureSheetExists(MASTER_SHEET, MASTER_HEADER);
  await ensureSheetExists(REQUEST_SHEET, REQUEST_HEADER);
  await ensureSheetExists(RESULT_SHEET, RESULT_HEADER);
}

function proposalRow(row: any[], idx: number) {
  return {
    rowNumber: idx + 2,
    id: row[0] || "",
    createdAt: row[1] || "",
    sourceRequestId: row[2] || "",
    category: row[3] || "General",
    title: row[4] || "제목 없음",
    proposal: row[5] || "",
    conditionJson: row[6] || "",
    priority: row[7] || "Medium",
    status: String(row[8] || "pending").toLowerCase(),
    approvedBy: row[9] || "",
    approvedAt: row[10] || "",
  };
}

function masterRow(row: any[], idx: number) {
  return {
    rowNumber: idx + 2,
    id: row[0] || "",
    createdAt: row[1] || "",
    category: row[2] || "General",
    title: row[3] || "제목 없음",
    proposal: row[4] || "",
    conditionJson: row[5] || "",
    version: row[6] || "v1.0",
    status: String(row[7] || "active").toLowerCase(),
    approvedBy: row[8] || "",
    approvedAt: row[9] || "",
    implemented: row[10] || "미반영",
  };
}

function requestRow(row: any[], idx: number) {
  return {
    rowNumber: idx + 2,
    id: row[0] || "",
    createdAt: row[1] || "",
    type: row[2] || "",
    request: row[3] || "",
    status: String(row[4] || "").toLowerCase(),
    processedAt: row[5] || "",
  };
}

function resultRow(row: any[], idx: number) {
  return {
    rowNumber: idx + 2,
    id: row[0] || "",
    createdAt: row[1] || "",
    requestId: row[2] || "",
    result: row[3] || "",
    status: String(row[4] || "").toLowerCase(),
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    if (!checkPassword(url.searchParams.get("password"))) {
      return NextResponse.json({ ok: false, error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    

    const [proposalRows, masterRows, requestRows, resultRows] = await Promise.all([
      getSheetValues(PROPOSAL_SHEET, "A:K").catch(() => []),
      getSheetValues(MASTER_SHEET, "A:K").catch(() => []),
      getSheetValues(REQUEST_SHEET, "A:F").catch(() => []),
      getSheetValues(RESULT_SHEET, "A:E").catch(() => []),
    ]);

    const proposals = (proposalRows || []).slice(1).map(proposalRow).reverse();
    const masters = (masterRows || []).slice(1).map(masterRow).reverse();
    const requests = (requestRows || []).slice(1).map(requestRow).reverse().slice(0, 100);
    const results = (resultRows || []).slice(1).map(resultRow).reverse().slice(0, 20);

    return NextResponse.json(
      { ok: true, proposals, masters, requests, results },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Logic load failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!checkPassword(body.password)) {
      return NextResponse.json({ ok: false, error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    await ensureLogicSheets();

    if (body.action === "create") {
      const createdAt = nowKST();
      await appendValues(`'${PROPOSAL_SHEET}'!A:K`, [[
        makeId("LP"),
        createdAt,
        body.sourceRequestId || "manual",
        body.category || "General",
        body.title || "제목 없음",
        body.proposal || "",
        body.conditionJson || "",
        body.priority || "Medium",
        "pending",
        "",
        "",
      ]]);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "status") {
      const rowNumber = Number(body.rowNumber);
      const status = String(body.status || "").toLowerCase();
      if (!rowNumber || !["approved", "hold", "rejected", "pending"].includes(status)) {
        return NextResponse.json({ ok: false, error: "잘못된 상태 변경 요청입니다." }, { status: 400 });
      }

      const approvedBy = status === "approved" ? (body.approvedBy || "소천") : "";
      const approvedAt = status === "approved" ? nowKST() : "";
      await updateValues(`'${PROPOSAL_SHEET}'!I${rowNumber}:K${rowNumber}`, [[status, approvedBy, approvedAt]]);

      return NextResponse.json({ ok: true });
    }

    // MARK 6.44: 승인된 로직이 실제로 코드에 반영됐는지 추적하는 액션.
    // Logic_Master는 승인 여부만 기록했지, "진짜 코드로 만들었는지"는 표시할 방법이 없었음.
    if (body.action === "mark-implemented") {
      const rowNumber = Number(body.rowNumber);
      const implemented = body.implemented === false ? "미반영" : "반영완료";
      if (!rowNumber) {
        return NextResponse.json({ ok: false, error: "rowNumber가 필요합니다." }, { status: 400 });
      }
      await updateValues(`'${MASTER_SHEET}'!K${rowNumber}`, [[implemented]]);

      // MARK 6.47: 키네틱 레이어 첫 연결 — "이 로직을 코드로 반영했다"는 결정을 Action_Log에 남깁니다.
      if (implemented === "반영완료") {
        const masterRows = await getSheetValues(MASTER_SHEET, "A:K").catch(() => []);
        const row = masterRows[rowNumber - 1] || [];
        await logAction({
          actionType: "로직반영",
          triggerRef: String(row[0] || `row${rowNumber}`),
          afterState: { title: row[3] || "", status: "반영완료" },
          decidedBy: "소천",
          executedAt: nowKST(),
        }).catch(() => {});
      }

      return NextResponse.json({ ok: true });
    }

    if (body.action === "request") {
      const createdAt = nowKST();
      await appendValues(`'${REQUEST_SHEET}'!A:F`, [[
        makeId("REQ"),
        createdAt,
        body.type || "logic",
        body.request || "",
        "pending",
        "",
      ]]);
      return NextResponse.json({ ok: true });
    }

    // MARK 6.43: 요청 처리를 시작할 때 "processing"으로 표시 (화면 Badge가 이 단어를 인식해서 주황색으로 보여줌).
    if (body.action === "request-start") {
      const requestId = String(body.requestId || "");
      if (!requestId) {
        return NextResponse.json({ ok: false, error: "requestId가 필요합니다." }, { status: 400 });
      }
      const requestRows = await getSheetValues(REQUEST_SHEET, "A:F").catch(() => []);
      const rowIdx = (requestRows || []).slice(1).findIndex((r) => String(r[0] || "") === requestId);
      if (rowIdx >= 0) {
        const rowNumber = rowIdx + 2;
        await updateValues(`'${REQUEST_SHEET}'!E${rowNumber}`, [["processing"]]);
      }
      return NextResponse.json({ ok: true });
    }

    // MARK 6.41: 로컬 Research Agent(watch.js)가 처리 완료 후 호출하는 액션.
    // Research_Request 상태를 completed/failed로 바꾸고, Research_Result에 원문 결과를 남깁니다.
    // (화면 Badge 컴포넌트가 "completed"/"failed"를 인식해서 색으로 구분하므로 이 단어를 그대로 씁니다.)
    if (body.action === "request-complete") {
      const requestId = String(body.requestId || "");
      if (!requestId) {
        return NextResponse.json({ ok: false, error: "requestId가 필요합니다." }, { status: 400 });
      }

      const requestRows = await getSheetValues(REQUEST_SHEET, "A:F").catch(() => []);
      const rowIdx = (requestRows || []).slice(1).findIndex((r) => String(r[0] || "") === requestId);
      const finalStatus = body.status === "error" ? "failed" : "completed";
      if (rowIdx >= 0) {
        const rowNumber = rowIdx + 2;
        await updateValues(`'${REQUEST_SHEET}'!E${rowNumber}:F${rowNumber}`, [[finalStatus, nowKST()]]);
      }

      await appendValues(`'${RESULT_SHEET}'!A:E`, [[
        makeId("RES"),
        nowKST(),
        requestId,
        body.result || "",
        finalStatus,
      ]]);

      return NextResponse.json({ ok: true });
    }

    // 대기중인 Research_Request 목록만 가볍게 조회 (로컬 watcher가 폴링할 때 사용).
    if (body.action === "pending-requests") {
      const requestRows = await getSheetValues(REQUEST_SHEET, "A:F").catch(() => []);
      const pending = (requestRows || []).slice(1).map(requestRow).filter((r) => r.status === "pending");
      return NextResponse.json({ ok: true, pending });
    }

    return NextResponse.json({ ok: false, error: "지원하지 않는 action입니다." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Logic save failed" }, { status: 500 });
  }
}
