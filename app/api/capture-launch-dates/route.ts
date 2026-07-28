import { NextResponse } from "next/server";
import { getSpreadsheetTitles, getManySheetValues } from "@/lib/googleSheets";
import { pickProductSheet, parseProducts } from "@/lib/dataBuilder";
import { seedLaunchDates } from "@/lib/styleLaunchMaster";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// MARK 6.49: "금주/전주" 시트에서 입고일(최초출고일)을 한 번 읽어서 Style_Launch_Master에
// 저장합니다. 기존에 이미 있는 품번은 건드리지 않고, 새로 발견된 품번만 추가합니다.
export async function POST() {
  try {
    const titles = await getSpreadsheetTitles();
    const productSheet = pickProductSheet(titles);
    if (!productSheet) {
      return NextResponse.json({ ok: false, error: "금주/전주 시트를 찾지 못했습니다." }, { status: 400 });
    }

    const values = await getManySheetValues([productSheet], "A:AZ");
    const rows = parseProducts(values[productSheet] || []);

    const entries = rows
      .filter((r: any) => r.styleCode && r.launchDate)
      .map((r: any) => ({ styleCode: r.styleCode, launchDate: r.launchDate }));

    const added = await seedLaunchDates(entries);

    return NextResponse.json({ ok: true, scanned: entries.length, added });
  } catch (error: any) {
    console.error("capture-launch-dates failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "캡처 실패" }, { status: 500 });
  }
}
