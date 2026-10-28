import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { findSalesSummaryDriveFile, downloadDriveFile } from "@/lib/googleDrive";
import { extractSalesSummaryRows, type SalesSummaryDailyRow } from "@/lib/salesSummaryUpload";
import { saveSalesSummarySnapshot } from "@/lib/dataBuilder";
import { checkLateStores, logRefreshRun, kstNowParts, slotOf } from "@/lib/salesSummaryRefreshStatus";
import { sendEmailAlert } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// MARK 2026-09-23: 소천님이 구글드라이브에 올려둔 "전체매출" 파일(파일명 고정, 매번
// 덮어쓰기)을 매일 자동으로 찾아서 읽어와 매출탭에 저장합니다. 파싱 로직은 수동 업로드
// (app/api/sales-summary-upload, 브라우저에서 XLSX.read)와 완전히 동일한 lib/salesSummaryUpload.ts
// 의 extractSalesSummaryRows()를 그대로 재사용합니다 — 결과가 달라질 일이 없습니다.
// 저장도 동일하게 saveSalesSummarySnapshot()(전체 교체가 아니라 upsert/병합)을 씁니다.
//
// 드라이브 파일을 앱이 읽으려면: (1) 소천님 구글클라우드 프로젝트에서 "Google Drive API"를
// 사용 설정하고, (2) 그 드라이브 파일(또는 폴더)을 서비스계정 이메일(GOOGLE_CLIENT_EMAIL
// 환경변수 값)로 공유해줘야 합니다.

async function runDriveImport() {
  const file = await findSalesSummaryDriveFile();
  if (!file) {
    return { ok: false as const, error: `드라이브에서 매출 파일을 찾을 수 없어요. 파일 ID/파일명 또는 공유 설정을 확인해주세요.` };
  }

  const buf = await downloadDriveFile(file.id, file.mimeType);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheets = wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "" }) as any[][],
  }));

  const rows: SalesSummaryDailyRow[] = extractSalesSummaryRows(sheets);
  if (!rows.length) {
    return { ok: false as const, error: `"${file.name}" 파일에서 매출 데이터를 하나도 못 찾았어요. 파일 형식을 확인해주세요.` };
  }

  const result = await saveSalesSummarySnapshot(rows, file.name);
  return { ok: true as const, driveFile: { name: file.name, modifiedTime: file.modifiedTime }, ...result };
}

// MARK 2026-10-28: 가져오기 + 어제 용인·무신사 매출 확인 + 로그(매출탭 상단 배너가 읽음)
async function runAndLog(slot: string) {
  let result: any;
  try {
    result = await runDriveImport();
  } catch (e: any) {
    result = { ok: false, error: e?.message || String(e) };
  }
  const check = await checkLateStores().catch(() => null);
  await logRefreshRun({ slot, ok: !!result.ok, error: result.ok ? "" : result.error, checkDate: check?.checkDate, yongin: check?.yongin, musinsa: check?.musinsa, newRowCount: result.newRowCount }).catch((e) =>
    console.error("매출탭 자동갱신 로그 실패(무시):", e)
  );
  // 9:30 자동갱신인데 용인 매출이 없으면 메일 알림(메일 설정이 없으면 조용히 넘어감)
  if (slot === "09:30" && check && !check.yonginOk) {
    await sendEmailAlert(
      `[MARK] 용인 업데이트 확인필요 (${check.checkDate})`,
      `<p>9:30 매출탭 자동갱신 후에도 <b>팩토리아울렛 용인점 ${check.checkDate} 매출</b>이 없어요.</p><p>드라이브 전체매출 파일에 용인 매출을 넣은 뒤 매출탭에서 "드라이브에서 가져오기"를 눌러주세요.</p>`
    ).catch(() => null);
  }
  return { ...result, check };
}

// GET: Vercel Cron이 매일 자동으로 호출합니다.
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization") || "";
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }
    // 새벽 4:00 / 오전 9:30(KST) 두 번 — vercel.json crons
    const q = new URL(req.url).searchParams.get("slot");
    const slot = q === "0400" ? "04:00" : q === "0930" ? "09:30" : slotOf(kstNowParts().hhmm);
    const result = await runAndLog(slot);
    return NextResponse.json(result, { status: result.ok ? 200 : 500, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("sales-summary-drive-import (cron) failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "드라이브 자동 가져오기 실패" }, { status: 500 });
  }
}

// POST: 대시보드의 "지금 가져오기" 버튼이 호출합니다(수동 트리거).
export async function POST() {
  try {
    const result = await runAndLog("수동");
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    console.error("sales-summary-drive-import (manual) failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "드라이브 가져오기 실패" }, { status: 500 });
  }
}
