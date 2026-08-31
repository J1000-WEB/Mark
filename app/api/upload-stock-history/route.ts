import { NextResponse } from "next/server";
import { getDbSheetId, ensureSheetExistsById, getSheetValuesById, safeReplaceSheetValuesById } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const revalidate = 0;

// MARK: "재고가 100장 이상 입고되면 매장 투입 알림" 기능을 위해, 스타일+채널별 업로드할 때마다
// 스타일+컬러별 재고(Y열)만 가볍게 뽑아서 이력으로 쌓아둡니다. 이 회사 다른 분들도 쓰시는
// "스타일별 채널별 입고/판매/재고현황" 시트(공유 시트)는 매일 덮어써서 어제 값이 안 남기
// 때문에, 완전히 별도의 전용 탭(재고입고이력)에 따로 쌓습니다.
//
// 용량 관리: 이 이력은 "2일 전 대비 비교"에만 쓰이기 때문에, 오래된 날짜는 매번 자동으로
// 정리하고 최근 며칠치만 남깁니다(하루 14,000여 품목 x 4열이라 그대로 계속 쌓으면 금방
// 구글시트 셀 한도에 부딪힙니다).
//
// MARK: "한번 뜬 알림은 확인 못 하고 지나가도 계속 남아있다가, 실제로 재고를 투입해서
// 재고가 줄어들면 자동으로 사라지게" 하기 위해, 매번 "2일전 대비" 스냅샷만 보는 게 아니라
// 별도의 "활성 알림" 목록(재고입고알림_활성)을 같이 관리합니다:
//   - 새로 100장 이상 늘어난 게 있으면 활성 목록에 추가(처음 감지된 날의 재고를 "peak"으로 기록)
//   - 이미 활성 목록에 있는데 재고가 더 늘었으면 peak을 갱신
//   - 활성 목록에 있는 것 중, 지금 재고가 peak 대비 30% 이상 줄었으면(=투입/판매로 소진된
//     것으로 판단) 목록에서 빼서 알림이 사라지게 함

const HISTORY_SHEET = "재고입고이력";
const ACTIVE_ALERTS_SHEET = "재고입고알림_활성";
const RETENTION_DAYS = 10; // 2일 전 비교에 필요한 것보다 넉넉하게 보관
const SPIKE_COMPARE_DAYS_AGO = 2;
const SPIKE_THRESHOLD = 100; // "100장 이상 입고"
const RESOLVE_DROP_RATIO = 0.3; // peak 대비 30% 이상 줄면 "투입 완료"로 보고 알림 해제

function keyOf(styleCode: string, colorCode: string) {
  return `${styleCode}_${colorCode}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { date, rows } = body || {}; // rows: [[styleCode, colorCode, stock], ...]
    if (!date || !Array.isArray(rows)) {
      return NextResponse.json({ ok: false, error: "date/rows가 필요합니다." }, { status: 400 });
    }

    const spreadsheetId = getDbSheetId();
    const header = ["date", "styleCode", "colorCode", "stock"];
    await ensureSheetExistsById(spreadsheetId, HISTORY_SHEET, header);

    const existing = await getSheetValuesById(spreadsheetId, HISTORY_SHEET, "A:D").catch(() => []);
    const dataRows = existing.slice(1); // 헤더 제외

    const cutoff = new Date(date);
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // 보관기간보다 오래된 것 정리 + 오늘자는 새로 덮어쓸 거라 기존 것 제외(중복 방지)
    const kept = dataRows.filter((r) => {
      const d = String(r?.[0] || "");
      return d && d >= cutoffStr && d !== date;
    });

    const newRows = rows.map((r: any[]) => [date, String(r[0] ?? ""), String(r[1] ?? ""), Number(r[2] ?? 0)]);
    const finalRows = [header, ...kept, ...newRows];

    await safeReplaceSheetValuesById(spreadsheetId, HISTORY_SHEET, finalRows);

    // ---- 여기부터 "활성 알림" 갱신 ----
    const todayStockMap = new Map<string, { styleCode: string; colorCode: string; stock: number }>();
    for (const r of newRows) {
      todayStockMap.set(keyOf(r[1], r[2]), { styleCode: r[1], colorCode: r[2], stock: r[3] });
    }

    // "2일 전"에 가장 가까운 실제 데이터가 있는 날짜 찾기
    const allDates = Array.from(new Set([...kept.map((r) => String(r[0])), date])).sort();
    const target = new Date(date);
    target.setDate(target.getDate() - SPIKE_COMPARE_DAYS_AGO);
    const targetStr = target.toISOString().slice(0, 10);
    const compareDate = allDates.filter((d) => d <= targetStr).pop();

    const compareStockMap = new Map<string, number>();
    if (compareDate) {
      for (const r of kept) {
        if (String(r[0]) === compareDate) compareStockMap.set(keyOf(r[1], r[2]), Number(r[3] || 0));
      }
    }

    const activeHeader = ["styleCode", "colorCode", "firstAlertedDate", "baselineStock", "peakStock"];
    await ensureSheetExistsById(spreadsheetId, ACTIVE_ALERTS_SHEET, activeHeader);
    const existingActive = await getSheetValuesById(spreadsheetId, ACTIVE_ALERTS_SHEET, "A:E").catch(() => []);
    const activeMap = new Map<string, { styleCode: string; colorCode: string; firstAlertedDate: string; baselineStock: number; peakStock: number }>();
    for (const r of existingActive.slice(1)) {
      if (!r?.[0]) continue;
      activeMap.set(keyOf(r[0], r[1]), {
        styleCode: String(r[0]),
        colorCode: String(r[1]),
        firstAlertedDate: String(r[2]),
        baselineStock: Number(r[3] || 0),
        peakStock: Number(r[4] || 0),
      });
    }

    // 1) 새로 100장 이상 늘어난 것 추가(또는 이미 있으면 peak 갱신)
    if (compareDate) {
      for (const [key, todayInfo] of todayStockMap.entries()) {
        const oldStock = compareStockMap.get(key) || 0;
        const increase = todayInfo.stock - oldStock;
        const existingAlert = activeMap.get(key);
        if (existingAlert) {
          if (todayInfo.stock > existingAlert.peakStock) existingAlert.peakStock = todayInfo.stock;
        } else if (increase >= SPIKE_THRESHOLD) {
          activeMap.set(key, {
            styleCode: todayInfo.styleCode,
            colorCode: todayInfo.colorCode,
            firstAlertedDate: date,
            baselineStock: oldStock,
            peakStock: todayInfo.stock,
          });
        }
      }
    }

    // 2) 활성 목록 중, 지금 재고가 peak 대비 많이 줄었으면(=투입/소진 판단) 목록에서 제거
    for (const [key, alert] of Array.from(activeMap.entries())) {
      const currentStock = todayStockMap.get(key)?.stock;
      if (currentStock === undefined) continue; // 오늘 데이터에 없는 스타일은 건드리지 않음(판단 보류)
      if (currentStock <= alert.peakStock * (1 - RESOLVE_DROP_RATIO)) {
        activeMap.delete(key);
      }
    }

    const activeRows = Array.from(activeMap.values()).map((a) => [a.styleCode, a.colorCode, a.firstAlertedDate, a.baselineStock, a.peakStock]);
    await safeReplaceSheetValuesById(spreadsheetId, ACTIVE_ALERTS_SHEET, [activeHeader, ...activeRows]);

    return NextResponse.json({ ok: true, written: newRows.length, totalKept: finalRows.length - 1, activeAlerts: activeRows.length });
  } catch (error: any) {
    console.error("upload-stock-history failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "재고이력 업로드 실패" }, { status: 500 });
  }
}
