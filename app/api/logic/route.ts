import { NextResponse } from "next/server";
import { appendValues, ensureSheetExists, getSheetValues, updateValues } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SHEET = "Logic_Master";
const HEADER = ["CreatedAt", "Category", "Title", "Proposal", "Status", "ApprovedBy"];

function checkPassword(value: string | null) {
  const expected = process.env.LOGIC_CENTER_PASSWORD || "4885";
  return value === expected;
}

async function ensureLogicSheet() {
  await ensureSheetExists(SHEET, HEADER);
}

function rowToLogic(row: any[], idx: number) {
  return {
    rowNumber: idx + 2,
    createdAt: row[0] || "",
    category: row[1] || "",
    title: row[2] || "",
    proposal: row[3] || "",
    status: row[4] || "pending",
    approvedBy: row[5] || "",
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    if (!checkPassword(url.searchParams.get("password"))) {
      return NextResponse.json({ ok: false, error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    await ensureLogicSheet();
    const rows = await getSheetValues(SHEET, "A:F");
    const items = (rows || []).slice(1).map(rowToLogic).reverse();
    return NextResponse.json({ ok: true, items }, { headers: { "Cache-Control": "no-store" } });
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

    await ensureLogicSheet();

    if (body.action === "create") {
      const createdAt = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      await appendValues(`'${SHEET}'!A:F`, [[
        createdAt,
        body.category || "General",
        body.title || "제목 없음",
        body.proposal || "",
        "pending",
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
      await updateValues(`'${SHEET}'!E${rowNumber}:F${rowNumber}`, [[status, body.approvedBy || "소천"]]);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "지원하지 않는 action입니다." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Logic save failed" }, { status: 500 });
  }
}
