// MARK 6.73: "스타일별 채널별 입고/판매/재고현황(금액)" 시트가 594열까지 커져서
// (2026-08-05 기준 14,655행 × 594열 ≈ 871만 셀), 구글시트 전체 한도(1,000만 셀)에
// 거의 다 왔습니다. 실제로 검증해보니:
//   - 열 0~28(No/기준일자/스타일정보/상품가격/재고요약)은 그대로 두고,
//   - 열 29부터 끝까지(팀합계 + 채널별 상세, 5열씩 반복되는 "채널 블록")를
//     "채널값이 있는 것만" JSON으로 압축하면(대부분 0/공백이라 희소함),
//   - 2026-08-05 실제 파일 기준 8,708,040셀 → 441,492셀 (19.7배 절감), 왕복 손실 0건.
//
// 압축 열쇠(key)는 "채널 이름"이 아니라 "채널 순서(인덱스)"를 씁니다 — 실제 파일에
// "기타", "글로벌_조조타운_샵인샵" 같은 채널명이 두 번씩 나오는 경우가 있어서,
// 이름을 키로 쓰면 데이터가 섞이는 버그가 있었습니다(직접 확인해서 고침).
//
// 사용법:
//   업로드 전(브라우저): compactStyleChannelRows(원본행들) → 압축된 행들
//   읽을 때(서버):        expandStyleChannelRows(압축된행들) → 원본과 동일한 모양의 행들
// expand()는 원본과 완전히 동일한 열 개수/위치로 복원하므로, buildProductMaster 등
// 기존에 이 시트를 읽던 코드는 전혀 손댈 필요가 없습니다.

export const STYLE_CHANNEL_MASTER_END = 29; // 0~28: No,기준일자,스타일정보(16),상품가격(3),재고(8)
export const STYLE_CHANNEL_METRICS = ["일간", "일간금액", "주간", "누적", "재고"] as const;
const METRIC_COUNT = STYLE_CHANNEL_METRICS.length; // 5
const HEADER_ROWS = 3; // 1~3행: 다단 헤더 (원본 그대로 보존)

type Row = any[];

function isEmpty(v: any): boolean {
  return v === null || v === undefined || v === "" || v === 0 || v === "0";
}

// 원본 행들(헤더 3행 + 데이터 N행, 594열)을 압축합니다.
// 헤더는 그대로 두고(채널 개수/이름을 나중에 알아내려면 필요), 데이터 행만 압축합니다.
export function compactStyleChannelRows(rows: Row[]): Row[] {
  if (!rows || rows.length <= HEADER_ROWS) return rows || [];

  const headerRows = rows.slice(0, HEADER_ROWS);
  const dataRows = rows.slice(HEADER_ROWS);

  const compactData = dataRows.map((r) => {
    const master = r.slice(0, STYLE_CHANNEL_MASTER_END);
    const totalCols = r.length;
    const nChannels = Math.floor((totalCols - STYLE_CHANNEL_MASTER_END) / METRIC_COUNT);

    const detail: [number, Record<string, any>][] = [];
    for (let ci = 0; ci < nChannels; ci++) {
      const base = STYLE_CHANNEL_MASTER_END + ci * METRIC_COUNT;
      const vals = r.slice(base, base + METRIC_COUNT);
      if (vals.every(isEmpty)) continue; // 대부분 이 경우 — 희소성 활용
      const entry: Record<string, any> = {};
      STYLE_CHANNEL_METRICS.forEach((m, mi) => {
        if (!isEmpty(vals[mi])) entry[m] = vals[mi];
      });
      if (Object.keys(entry).length) detail.push([ci, entry]);
    }

    return [...master, totalCols, JSON.stringify(detail)];
  });

  return [...headerRows, ...compactData];
}

// 압축된 행들을 원본과 동일한 열 개수/위치로 복원합니다.
export function expandStyleChannelRows(rows: Row[]): Row[] {
  if (!rows || rows.length <= HEADER_ROWS) return rows || [];

  const headerRows = rows.slice(0, HEADER_ROWS);
  const compactData = rows.slice(HEADER_ROWS);

  const expandedData = compactData.map((r) => {
    // 압축 행 구조: [master(29개), totalCols, 상세JSON]
    const master = r.slice(0, STYLE_CHANNEL_MASTER_END);
    const totalCols = Number(r[STYLE_CHANNEL_MASTER_END]) || STYLE_CHANNEL_MASTER_END;
    const detailJson = r[STYLE_CHANNEL_MASTER_END + 1];

    const tailLen = totalCols - STYLE_CHANNEL_MASTER_END;
    const tail: any[] = new Array(tailLen).fill(null);

    let detail: [number, Record<string, any>][] = [];
    try {
      detail = detailJson ? JSON.parse(detailJson) : [];
    } catch {
      detail = [];
    }
    for (const [ci, entry] of detail) {
      const base = ci * METRIC_COUNT;
      STYLE_CHANNEL_METRICS.forEach((m, mi) => {
        if (entry[m] !== undefined) tail[base + mi] = entry[m];
      });
    }

    return [...master, ...tail];
  });

  return [...headerRows, ...expandedData];
}

// 압축 전/후 셀 수를 비교해서 로그로 보여주기 위한 헬퍼 (진행 상황 표시용)
export function estimateCellCounts(originalRows: Row[], compactRows: Row[]) {
  const origCells = originalRows.reduce((sum, r) => sum + r.length, 0);
  const compactCells = compactRows.reduce((sum, r) => sum + r.length, 0);
  return { origCells, compactCells, ratio: compactCells ? origCells / compactCells : 0 };
}
