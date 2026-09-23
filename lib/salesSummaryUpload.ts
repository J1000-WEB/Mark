// "전체매출" 원본 다운로드 파일(매장×날짜별 일간 실적+목표가 담긴 엑셀, 월별로 시트가
// 나뉘어 있음 — 예: "26년9월", "25년7-9월")을 읽어서, 매장별 매출탭(일간/주간/월간/전월/연간)을
// 계산하는 데 필요한 형태로 압축합니다. 브라우저(클라이언트)에서 파일을 읽자마자 바로
// 계산하기 때문에 googleapis 등 서버 전용 라이브러리는 쓰지 않습니다(서버 저장은
// app/api/sales-summary-upload가 담당).
//
// MARK 2026-09-22: 실측 확인한 컬럼 위치(2행이 헤더, 3행부터 데이터) —
// 0=NO, 1=채널구분(로드샵/백화점/쇼핑몰/아울렛/위탁(오프) 등 — 소천님 확인: "구분은
// 시트에 있는 걸로", 그대로 통과시킵니다), 2=채널(코드), 3=채널명(매장명),
// 4=판매일자, 5=수량, 6=금액, 7=영수건수, 8=객수량, 9=객단가, 10=목표(그 날짜의 일일 목표),
// 11=달성율, ... (12번 이후는 파일마다 있을 때도/없을 때도 있어서 안 씀 — 목표/달성율은
// 4,6,10 컬럼만으로 직접 다시 계산 가능해서 그쪽이 더 안전함)
//
// "차주"(다음주) 목표는 이 파일에 없음(아직 안 지난 날짜는 행 자체가 없음) — 소천님
// 확인 후 일단 제외하고 만들기로 함.

const COL = {
  CHANNEL_GROUP: 1, // 채널구분 (구분)
  CHANNEL_CODE: 2,
  STORE_NAME: 3,
  DATE: 4,
  QTY: 5,
  AMOUNT: 6,
  RECEIPT_COUNT: 7,
  TARGET: 10,
} as const;

export interface SalesSummaryDailyRow {
  date: string; // YYYY-MM-DD
  channelGroup: string; // 구분 (로드샵/백화점/쇼핑몰/아울렛/위탁(오프) 등 — 원본 그대로)
  channelCode: string;
  storeName: string;
  qty: number;
  amount: number;
  receiptCount: number;
  target: number;
}

function text(v: any) {
  return String(v ?? "").trim();
}

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// 엑셀 날짜 셀은 (a) XLSX.read를 cellDates:true로 읽으면 JS Date 객체로, (b) 그렇지
// 않으면 1900 기준 일련번호(숫자)로 옵니다. 둘 다 안전하게 처리합니다.
function excelDateToKey(v: any): string {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    // MARK: cellDates:true로 읽은 날짜는 SheetJS가 UTC 자정 기준으로 만들어주므로
    // getUTC* 로 읽어야 하루 밀리는 걸 피할 수 있습니다.
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    // 엑셀 일련번호(1899-12-30 기준, 1900 윤년 버그 포함 — 실무에서 흔히 쓰는 보정)
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + Math.round(v) * 86400000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
  // 이미 "YYYY-MM-DD" 형태의 문자열로 온 경우(raw:false로 읽었을 때 등)
  const s = text(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "";
}

// wb.SheetNames 전체를 훑어서(월별로 시트가 나뉜 원본 그대로) 하나의 평평한 배열로 합칩니다.
// 시트 이름 형식을 가정하지 않고(예: "26년9월", "25년7-9월" 등 제각각), 각 시트의
// 실제 데이터 행에서 날짜를 직접 읽어 기간을 판단하므로 시트가 늘거나 이름이 바뀌어도
// 안전합니다.
export function extractSalesSummaryRows(sheets: { name: string; rows: any[][] }[]): SalesSummaryDailyRow[] {
  const result: SalesSummaryDailyRow[] = [];
  const seen = new Set<string>(); // "date__channelCode__storeName" 중복 방지(같은 기간이 여러 시트에 겹쳐 있을 수 있음)

  for (const { rows } of sheets) {
    for (let r = 2; r < rows.length; r++) {
      const row = rows[r] || [];
      const storeName = text(row[COL.STORE_NAME]);
      if (!storeName) continue;
      const dateKey = excelDateToKey(row[COL.DATE]);
      if (!dateKey) continue;
      const channelCode = text(row[COL.CHANNEL_CODE]);
      const dedupeKey = `${dateKey}__${channelCode || storeName}__${storeName}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      result.push({
        date: dateKey,
        channelGroup: text(row[COL.CHANNEL_GROUP]),
        channelCode,
        storeName,
        qty: num(row[COL.QTY]),
        amount: num(row[COL.AMOUNT]),
        receiptCount: num(row[COL.RECEIPT_COUNT]),
        target: num(row[COL.TARGET]),
      });
    }
  }

  return result;
}
