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
// MARK 6.96: 예전엔 데이터 행만 압축하고 헤더 3행은 594열 그대로 뒀는데, 구글시트 그리드를
// 미리 만들 때 "행수×열수"로 사전할당하다 보니(createSheetWithValuesById의 gridSize),
// 데이터가 아무리 압축돼도 "이 시트의 열 개수"가 헤더 때문에 594로 잡혀서 그리드 자체가
// 여전히 (전체행수)×594칸으로 크게 잡히는 문제가 있었습니다(압축 효과가 그리드 크기에는
// 반영이 안 됨). 그래서 헤더 3행도 같은 방식(마스터는 그대로, 채널 부분은 JSON 하나로)으로
// 압축해서, 그리드 폭이 항상 31~32열 정도로 작게 유지되게 했습니다.
export function compactStyleChannelRows(rows: Row[]): Row[] {
  if (!rows || rows.length <= HEADER_ROWS) return rows || [];

  const headerRows = rows.slice(0, HEADER_ROWS);
  const dataRows = rows.slice(HEADER_ROWS);

  const compactHeaders = headerRows.map((r) => {
    const master = r.slice(0, STYLE_CHANNEL_MASTER_END);
    const channelPart = r.slice(STYLE_CHANNEL_MASTER_END);
    return [...master, channelPart.length, JSON.stringify(channelPart)];
  });

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

  return [...compactHeaders, ...compactData];
}

// 압축된 행들을 원본과 동일한 열 개수/위치로 복원합니다.
export function expandStyleChannelRows(rows: Row[]): Row[] {
  if (!rows || rows.length <= HEADER_ROWS) return rows || [];

  const compactHeaders = rows.slice(0, HEADER_ROWS);
  const compactData = rows.slice(HEADER_ROWS);

  // MARK 6.96: 헤더도 압축되므로(데이터 행과 같은 구조: [master, totalCols, JSON]) 복원합니다.
  // 예전(6.73~6.95) 압축본은 헤더가 그대로 594열이었을 수 있어서, 그 경우엔 이미 원본
  // 그대로이므로 압축 해제 없이 그대로 통과시킵니다(하위호환).
  const headerRows = compactHeaders.map((r) => {
    const looksCompact = r.length === STYLE_CHANNEL_MASTER_END + 2 && typeof r[STYLE_CHANNEL_MASTER_END + 1] === "string";
    if (!looksCompact) return r; // 이미 원본 폭(594열) — 예전 압축본과의 하위호환
    const master = r.slice(0, STYLE_CHANNEL_MASTER_END);
    let channelPart: any[] = [];
    try {
      channelPart = JSON.parse(r[STYLE_CHANNEL_MASTER_END + 1] || "[]");
    } catch {
      channelPart = [];
    }
    return [...master, ...channelPart];
  });

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
