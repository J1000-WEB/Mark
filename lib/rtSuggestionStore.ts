// MARK 2026-10-19: RT 이동 제안 "일별 저장".
// RT 제안은 무거운 계산이라(판매이력 + PIP 재고 스냅샷 + RT 엔진), 탭을 열 때마다 계산하지 않고
// 사용자가 버튼을 눌렀을 때만 계산해서 그날 결과를 구글시트(MARK_DB)에 저장해 둡니다.
// 탭을 열면 저장된 결과만 읽어옵니다(계산 없음).
//
// 저장 방식: 날짜별 시트 탭 "RT제안_YYYY-MM-DD_HHMMSS" 하나에 한 번의 계산 결과를 담습니다.
//  - 1행: ["meta", 메타 JSON]
//  - 2행~: [순번, 제안 1건 JSON]  ← 셀 5만자 제한 때문에 배열 통째가 아니라 항목 단위로 나눠 저장
//  - 같은 날 다시 계산하면 새 탭을 먼저 만든 뒤(쓰기 성공 후) 그날 예전 탭을 지웁니다 → 중간에
//    실패해도 기존 결과가 사라지지 않습니다.
//  - 최근 RT_KEEP_DAYS일치만 남기고 더 오래된 탭은 지웁니다(워크북 셀 한도 보호).

import { getDbSheetId, getSheetsClient, getSheetValuesById, createSheetWithValuesById } from "./googleSheets";

// MARK 2026-10-20: "style"=기존 방식(품번 단위), "sku"=SKU 방식(재고MD 로직) — 같은 저장 방식을 접두어만 달리해서 씁니다.
export type RtKind = "style" | "sku";
const PREFIX_OF: Record<RtKind, string> = { style: "RT제안_", sku: "RTSKU_" };
const RT_KEEP_DAYS = 7;
const titleRe = (kind: RtKind) => new RegExp(`^${PREFIX_OF[kind]}(\\d{4}-\\d{2}-\\d{2})_(\\d{6})$`);

function kstNow() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    hms: `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`,
    label: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
  };
}

async function listRtTabs(kind: RtKind = "style") {
  const TITLE_RE = titleRe(kind);
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: getDbSheetId(), fields: "sheets.properties(title,sheetId)" });
  return (meta.data.sheets || [])
    .map((s) => ({ title: s.properties?.title || "", sheetId: s.properties?.sheetId }))
    .map((s) => {
      const m = s.title.match(TITLE_RE);
      return m ? { ...s, date: m[1], hms: m[2] } : null;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => (b.date + b.hms).localeCompare(a.date + a.hms)) as { title: string; sheetId: number; date: string; hms: string }[];
}

/** 날짜별 최신 탭만 (최신 날짜 먼저) */
function latestPerDate(tabs: { title: string; sheetId: number; date: string; hms: string }[]) {
  const seen = new Set<string>();
  return tabs.filter((t) => (seen.has(t.date) ? false : (seen.add(t.date), true)));
}

export async function saveRtSuggestions(result: any, kind: RtKind = "style") {
  const now = kstNow();
  const title = `${PREFIX_OF[kind]}${now.date}_${now.hms}`;
  const items: any[] = result?.rtSuggestions || [];
  const meta = {
    savedDate: now.date,
    savedAt: now.label,
    count: items.length,
    rtSuggestionProductCount: result?.rtSuggestionProductCount || 0,
    rtEligibleProductRank: result?.rtEligibleProductRank,
    rtStockSource: result?.rtStockSource,
    rtPipUpdatedAt: result?.rtPipUpdatedAt || null,
    computeMs: result?.computeMs || 0,
    diagnostics: result?.diagnostics || null,
    warehouseCovered: result?.warehouseCovered || [],
    ...(result?.extraMeta || {}),
  };
  const values = [["meta", JSON.stringify(meta)], ...items.map((item, i) => [i + 1, JSON.stringify(item)])];
  await createSheetWithValuesById(getDbSheetId(), title, values, { rowCount: values.length + 1, columnCount: 2 });

  // 쓰기에 성공한 뒤에만 정리: 같은 날짜의 예전 탭 + 보관기간 지난 날짜 탭
  try {
    const tabs = await listRtTabs(kind);
    const keepDates = new Set(latestPerDate(tabs).slice(0, RT_KEEP_DAYS).map((t) => t.date));
    const toDelete = tabs.filter((t) => t.title !== title && (t.date === now.date || !keepDates.has(t.date)));
    if (toDelete.length) {
      const sheets = await getSheetsClient();
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: getDbSheetId(),
        requestBody: { requests: toDelete.map((t) => ({ deleteSheet: { sheetId: t.sheetId } })) },
      });
    }
  } catch (e) {
    console.error("[rt-store] 예전 RT 제안 탭 정리 실패(무시):", e);
  }
  return { ...meta, title };
}

/** date 없으면 가장 최근 저장분. 저장분이 하나도 없으면 null */
export async function loadSavedRtSuggestions(date?: string, kind: RtKind = "style") {
  const tabs = latestPerDate(await listRtTabs(kind));
  const savedDates = tabs.map((t) => t.date);
  const target = date ? tabs.find((t) => t.date === date) : tabs[0];
  if (!target) return { saved: null, savedDates };

  const rows = await getSheetValuesById(getDbSheetId(), target.title, "A:B");
  let meta: any = {};
  const items: any[] = [];
  for (const row of rows || []) {
    if (!row?.[1]) continue;
    try {
      if (row[0] === "meta") meta = JSON.parse(row[1]);
      else items.push(JSON.parse(row[1]));
    } catch {
      // 깨진 행은 건너뜀
    }
  }
  return {
    saved: {
      ...meta,
      rtSuggestions: items,
      isToday: meta.savedDate === kstNow().date,
    },
    savedDates,
  };
}
