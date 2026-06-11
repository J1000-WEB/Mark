import { NextRequest, NextResponse } from "next/server";
import { appendValues, getSheetValues, updateValues } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MEMO_SHEET = "소장군";

function nowKst() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

async function ensureMemoHeader(values: any[][]) {
  if (values.length === 0) {
    await updateValues(`'${MEMO_SHEET}'!A1:C1`, [["점포명", "메모", "수정일시"]]);
  }
}

export async function GET(req: NextRequest) {
  try {
    const store = req.nextUrl.searchParams.get("store") || "";
    if (!store) return NextResponse.json({ memo: "", updatedAt: "" });

    const values = await getSheetValues(MEMO_SHEET, "A:C");
    await ensureMemoHeader(values);

    const found = values.find((row, idx) => idx > 0 && String(row[0] || "").trim() === store);
    return NextResponse.json({
      store,
      memo: found?.[1] || "",
      updatedAt: found?.[2] || "",
    });
  } catch (error: any) {
    console.error("memo GET failed:", error);
    return NextResponse.json({ memo: "", updatedAt: "", error: error?.message || "memo GET failed" }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const store = String(body.store || "").trim();
    const memo = String(body.memo || "").trim();
    if (!store) return NextResponse.json({ ok: false, error: "store is required" }, { status: 400 });

    const values = await getSheetValues(MEMO_SHEET, "A:C");
    await ensureMemoHeader(values);

    const timestamp = nowKst();
    const rowIndex = values.findIndex((row, idx) => idx > 0 && String(row[0] || "").trim() === store);

    if (rowIndex >= 0) {
      await updateValues(`'${MEMO_SHEET}'!A${rowIndex + 1}:C${rowIndex + 1}`, [[store, memo, timestamp]]);
    } else {
      await appendValues(`'${MEMO_SHEET}'!A:C`, [[store, memo, timestamp]]);
    }

    return NextResponse.json({ ok: true, store, memo, updatedAt: timestamp });
  } catch (error: any) {
    console.error("memo POST failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "memo POST failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const store = req.nextUrl.searchParams.get("store") || "";
    if (!store) return NextResponse.json({ ok: false, error: "store is required" }, { status: 400 });

    const values = await getSheetValues(MEMO_SHEET, "A:C");
    await ensureMemoHeader(values);

    const timestamp = nowKst();
    const rowIndex = values.findIndex((row, idx) => idx > 0 && String(row[0] || "").trim() === store);

    if (rowIndex >= 0) {
      await updateValues(`'${MEMO_SHEET}'!A${rowIndex + 1}:C${rowIndex + 1}`, [[store, "", timestamp]]);
    } else {
      await appendValues(`'${MEMO_SHEET}'!A:C`, [[store, "", timestamp]]);
    }

    return NextResponse.json({ ok: true, store, memo: "", updatedAt: timestamp });
  } catch (error: any) {
    console.error("memo DELETE failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "memo DELETE failed" }, { status: 500 });
  }
}
