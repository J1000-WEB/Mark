import { getDbSheetId, getSheetValuesById, ensureSheetExistsById, appendValuesById } from "@/lib/googleSheets";

// MARK 6.17.3: 스냅샷 저장/조회 로직을 lib/salesDataUpload.ts에서 분리했습니다.
// (salesDataUpload.ts는 브라우저에서도 그대로 import해서 파일 파싱을 클라이언트에서
// 할 수 있어야 하는데, 이 파일은 googleapis(Node 전용)를 쓰는 구글시트 접근이 있어서
// 서버에서만 동작합니다 — 분리 안 하면 클라이언트 번들에 섞여 들어가 에러가 납니다.)

const SNAPSHOT_SHEET = "SalesData_Upload_Snapshot";
const SNAPSHOT_HEADER = ["주차", "구분", "파트", "갱신일시", "행수", "상세JSON"];
const MAX_CELL_CHARS = 40000;

function text(v: any) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function num(v: any) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function nowKST() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function currentWeekMonday(): string {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const day = kst.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(kst);
  monday.setDate(kst.getDate() + diffToMonday);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
}

function chunkRowsBySize(rows: any[][], maxChars = MAX_CELL_CHARS): any[][][] {
  const chunks: any[][][] = [];
  let current: any[][] = [];
  let currentLen = 2;
  for (const row of rows) {
    const len = JSON.stringify(row).length + 1;
    if (current.length && currentLen + len > maxChars) {
      chunks.push(current);
      current = [];
      currentLen = 2;
    }
    current.push(row);
    currentLen += len;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export async function saveReportSnapshot(kind: "style" | "color", report: { rows: any[][]; rowCount: number; colCount: number }) {
  const dbId = getDbSheetId();
  const weekKey = currentWeekMonday();
  await ensureSheetExistsById(dbId, SNAPSHOT_SHEET, SNAPSHOT_HEADER);

  const chunks = chunkRowsBySize(report.rows);
  const savedAt = nowKST();
  const newRows = chunks.map((chunk, i) => [weekKey, kind, i + 1, savedAt, report.rowCount, JSON.stringify(chunk)]);
  await appendValuesById(dbId, `'${SNAPSHOT_SHEET}'!A:F`, newRows);

  return { weekKey, partCount: chunks.length, rowCount: report.rowCount };
}

export async function loadLatestReportSnapshot(kind: "style" | "color"): Promise<{ rows: any[][]; weekKey: string } | null> {
  const dbId = getDbSheetId();
  const rows = await getSheetValuesById(dbId, SNAPSHOT_SHEET, "A:F").catch(() => []);
  if (!rows.length) return null;

  const body = rows.slice(1).filter((r) => text(r[1]) === kind);
  if (!body.length) return null;

  const weeks = Array.from(new Set(body.map((r) => text(r[0])))).sort();
  const latestWeek = weeks[weeks.length - 1];
  const partsForWeek = body
    .filter((r) => text(r[0]) === latestWeek)
    .sort((a, b) => num(a[2]) - num(b[2]));

  let combined: any[][] = [];
  for (const r of partsForWeek) {
    try {
      const chunk = JSON.parse(text(r[5]) || "[]");
      combined = combined.concat(chunk);
    } catch {
      // 파싱 실패한 파트는 건너뜁니다.
    }
  }
  return { rows: combined, weekKey: latestWeek };
}
