import * as XLSX from "xlsx";
import { getSheetValuesById, appendValuesById, getSheetPropsById, getSheetsClient } from "@/lib/googleSheets";

// MARK 6.8: 위탁샵(면세/한컬렉션/무신사) 인샵매출 자동 가공
// 세 곳 다 자체 전산을 안 써서, 각자 EDI에서 받은 원본 파일을 매장이 직접 다운받아 업로드하면
// 여기서 공통 포맷(일자/POS/채널/바코드/수량/단가)으로 변환해 UPLOAD 시트에 쌓습니다.

export const UPLOAD_SPREADSHEET_ID = "1531ifBVtAkMWSl2IGLcydLfYRe2_L8V-xHLvGQXLd3M";
export const UPLOAD_SHEET_NAME = "UPLOAD";
export const STORE_CODE_SHEET_NAME = "점포코드";

export type ConsignmentChannel = "musinsa" | "hancollection" | "duty_free";

export type UploadRow = {
  date: string; // YYYYMMDD (문자열이지만 숫자로 취급)
  pos: string; // 항상 "P1"
  channel: string; // 채널번호
  barcode: string; // 바코드
  qty: number;
  price: number;
  flagged?: boolean; // 바코드 15자 이상 등 확인 필요
  flagReason?: string;
};

function text(v: any) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function num(v: any) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// 파일명으로 어떤 위탁샵인지 판별합니다.
export function detectChannelFromFilename(filename: string): ConsignmentChannel | null {
  const name = text(filename);
  if (name.startsWith("pos_purchase_settlement")) return "musinsa";
  if (name.startsWith("매출일보")) return "hancollection";
  if (name.startsWith("매출재고조회")) return "duty_free";
  return null;
}

function toDateNum(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// "2026-07-07T21:50:28" 같은 ISO 문자열 또는 Date 객체 → "20260707"
function parseDateLike(v: any): string {
  if (v instanceof Date) return toDateNum(v);
  const s = text(v);
  if (!s) return "";
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  const digitsOnly = s.replace(/\D/g, "");
  if (digitsOnly.length >= 8) return digitsOnly.slice(0, 8);
  return "";
}

// ---- 점포코드 매핑 로드 ----
export async function loadStoreCodeMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const rows = await getSheetValuesById(UPLOAD_SPREADSHEET_ID, STORE_CODE_SHEET_NAME, "A:C");
    for (const row of rows || []) {
      const name = text(row?.[1]);
      const code = text(row?.[2]);
      if (name && code && name !== "채널명") map.set(name, code);
    }
  } catch {
    // 시트가 없거나 읽기 실패 시 빈 맵 반환 (호출부에서 하드코딩 폴백 사용)
  }
  return map;
}

// 위 시트가 비어있거나 아직 없을 때를 대비한 폴백(사용자가 준 실제 값 기준)
const FALLBACK_STORE_CODES: Record<string, string> = {
  "무신사 스토어 성수": "81008",
  "무신사 스토어 강남": "81027",
  "무신사 스토어 홍대": "81009",
  "무신사 아울렛 & 유즈드 롯데몰 은평점": "81033",
  "한컬렉션": "81026",
  "롯데면세점": "81028",
  "무신사 스토어 대구": "86001",
  "무신사 스토어 AK플라자 수원점": "92001",
  "무신사 백 & 캡클럽 서울숲": "91001",
};

function resolveStoreCode(name: string, storeCodeMap: Map<string, string>): string {
  return storeCodeMap.get(name) || FALLBACK_STORE_CODES[name] || "";
}

// ================= 무신사 =================
// 원본: "POS 판매분매입 상세 내역" 시트
// A=정산일자, H=매장명, P=업체바코드, Q=판매수량, R=판매금액
export function parseMusinsa(workbook: XLSX.WorkBook, storeCodeMap: Map<string, string>): { rows: UploadRow[]; warnings: string[] } {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });

  const rows: UploadRow[] = [];
  const warnings: string[] = [];
  const unmatchedStores = new Set<string>();

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || !row.length) continue;
    const dateRaw = row[0];
    const storeName = text(row[7]); // H열
    const barcode = text(row[15]); // P열
    const qty = num(row[16]); // Q열
    const amount = num(row[17]); // R열

    if (!storeName || !barcode) continue; // 합계행 등 스킵

    const date = parseDateLike(dateRaw);
    const channel = resolveStoreCode(storeName, storeCodeMap);
    if (!channel) unmatchedStores.add(storeName);

    rows.push({ date, pos: "P1", channel, barcode, qty, price: amount });
  }

  if (unmatchedStores.size) {
    warnings.push(`점포코드를 못 찾은 매장명: ${Array.from(unmatchedStores).join(", ")}`);
  }

  return { rows, warnings };
}

// ================= 한컬렉션 =================
// 원본: 매출일보_YYYYMMDD_HHMMSS.xls, 메타 정보 몇 줄 + 헤더 + 합계 1줄 + 데이터
// D=판매일자, K=매입거래처상품코드(바코드, _뒤 제거), Q=실판매가(단가), R=판매수량
export function parseHancollection(workbook: XLSX.WorkBook, storeCodeMap: Map<string, string>): { rows: UploadRow[]; warnings: string[] } {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });

  // 헤더 행 찾기: "판매일자"와 "매입거래처" 텍스트가 같이 있는 행
  let headerRow = -1;
  for (let i = 0; i < Math.min(raw.length, 30); i++) {
    const joined = (raw[i] || []).map((v) => text(v)).join("|");
    if (joined.includes("판매일자") && joined.includes("매입거래처")) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) return { rows: [], warnings: ["헤더 행을 찾지 못했습니다 (판매일자/매입거래처 컬럼 확인 필요)"] };

  const channel = resolveStoreCode("한컬렉션", storeCodeMap);
  const rows: UploadRow[] = [];
  const warnings: string[] = [];
  if (!channel) warnings.push("한컬렉션 채널코드를 점포코드 시트에서 찾지 못했습니다.");

  for (let i = headerRow + 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || !row.length) continue;
    const seq = text(row[0]); // 순번 - 합계행/빈행 스킵용
    if (!seq || seq === "합계") continue;

    const dateRaw = row[3]; // D열
    let barcode = text(row[10]); // K열
    const price = num(row[16]); // Q열
    const qty = num(row[17]); // R열
    if (!barcode) continue;

    // 밑줄(_) 뒤 부가정보 제거
    if (barcode.includes("_")) barcode = barcode.split("_")[0];

    const flagged = barcode.length >= 15;
    rows.push({
      date: parseDateLike(dateRaw),
      pos: "P1",
      channel,
      barcode,
      qty,
      price,
      flagged,
      flagReason: flagged ? `바코드 ${barcode.length}자 - 품번코드 확인 필요` : undefined,
    });
  }

  return { rows, warnings };
}

// ================= 면세 =================
// 원본: 매출재고조회_YYYYMMDDHHMMSS.xlsx, 날짜 컬럼 없음(사용자 지정 필요)
// H=Ref No.(바코드), Z=판매수량(0 제외), AF=총매출액(수량으로 나눠 개당 단가)
export function parseDutyFree(
  workbook: XLSX.WorkBook,
  storeCodeMap: Map<string, string>,
  userDate: string
): { rows: UploadRow[]; warnings: string[] } {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });

  const channel = resolveStoreCode("롯데면세점", storeCodeMap);
  const rows: UploadRow[] = [];
  const warnings: string[] = [];
  if (!channel) warnings.push("면세(롯데면세점) 채널코드를 점포코드 시트에서 찾지 못했습니다.");
  if (!userDate) warnings.push("면세 파일은 날짜를 직접 지정해야 합니다.");

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || !row.length) continue;
    const barcode = text(row[7]); // H열
    const qty = num(row[25]); // Z열
    const amount = num(row[31]); // AF열
    if (!barcode || !qty) continue; // 0(또는 빈값)인 건 제외

    const unitCount = Math.abs(qty);
    const sign = qty < 0 ? -1 : 1;
    let unitPrice = unitCount ? amount / unitCount : 0;
    if (!unitPrice) unitPrice = 10 * sign; // 수량은 있는데 단가가 0이면 10원으로 임의 설정

    // 수량이 ±1이 아니면 1개(부호 유지) 단위로 분할
    for (let u = 0; u < unitCount; u++) {
      rows.push({
        date: userDate,
        pos: "P1",
        channel,
        barcode,
        qty: sign,
        price: Math.round(unitPrice),
      });
    }
  }

  return { rows, warnings };
}

export function parseByChannel(
  channel: ConsignmentChannel,
  workbook: XLSX.WorkBook,
  storeCodeMap: Map<string, string>,
  userDate: string
) {
  if (channel === "musinsa") return parseMusinsa(workbook, storeCodeMap);
  if (channel === "hancollection") return parseHancollection(workbook, storeCodeMap);
  return parseDutyFree(workbook, storeCodeMap, userDate);
}

// UPLOAD 시트에 이어쓰고, 쓰여진 실제 행 범위를 반환합니다 (노란색 표시용).
export async function appendUploadRows(rows: UploadRow[]): Promise<{ startRow: number; endRow: number } | null> {
  if (!rows.length) return null;
  const values = rows.map((r) => [r.date, r.pos, r.channel, r.barcode, r.qty, r.price]);
  const res: any = await appendValuesById(UPLOAD_SPREADSHEET_ID, `'${UPLOAD_SHEET_NAME}'!A:F`, values);
  const updatedRange: string = res?.data?.updates?.updatedRange || "";
  const m = updatedRange.match(/![A-Z]+(\d+):[A-Z]+(\d+)/);
  if (!m) return null;
  return { startRow: Number(m[1]), endRow: Number(m[2]) };
}

// 바코드가 의심스러운(15자 이상) 행들의 D열 배경을 노란색으로 칠합니다.
export async function highlightFlaggedRows(startRow: number, flaggedOffsets: number[]) {
  if (!flaggedOffsets.length) return;
  const props = await getSheetPropsById(UPLOAD_SPREADSHEET_ID);
  const sheetProps = props.find((p) => p.title === UPLOAD_SHEET_NAME);
  if (!sheetProps) return;

  const sheets = await getSheetsClient();
  const requests = flaggedOffsets.map((offset) => {
    const rowIndex0 = startRow - 1 + offset; // 0-based
    return {
      repeatCell: {
        range: {
          sheetId: sheetProps.sheetId,
          startRowIndex: rowIndex0,
          endRowIndex: rowIndex0 + 1,
          startColumnIndex: 3, // D열(바코드)
          endColumnIndex: 4,
        },
        cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.95, blue: 0.4 } } },
        fields: "userEnteredFormat.backgroundColor",
      },
    };
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: UPLOAD_SPREADSHEET_ID,
    requestBody: { requests },
  });
}
