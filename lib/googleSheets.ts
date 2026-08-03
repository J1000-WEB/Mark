import { google } from "googleapis";

function getPrivateKey() {
  const raw = process.env.GOOGLE_PRIVATE_KEY || "";
  return raw.replace(/\\n/g, "\n");
}

export function getSheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID is not set");
  return id;
}

export async function getSheetsClient() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!clientEmail) throw new Error("GOOGLE_CLIENT_EMAIL is not set");
  if (!privateKey) throw new Error("GOOGLE_PRIVATE_KEY is not set");

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.file"],
  });

  await auth.authorize();
  return google.sheets({ version: "v4", auth });
}


export function getDbSheetId() {
  const id = process.env.GOOGLE_SHEET_ID_DB || process.env.GOOGLE_DB_SHEET_ID || process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID_DB is not set");
  return id;
}

// MARK 6.23: "일간매출(26년)"/"스타일별 채널별 입고판매재고현황" 두 시트만 별도 스프레드시트로 옮기고
// 싶어서 추가한 전용 소스. 설정 안 하면 기존 MARK_DB(getDbSheetId)를 그대로 씁니다.
export function getDailySourceSheetId() {
  return process.env.GOOGLE_SHEET_ID_DAILY_SOURCE || getDbSheetId();
}

export function getHistorySheetId() {
  const id = process.env.GOOGLE_SHEET_ID_HISTORY || process.env.GOOGLE_HISTORY_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID_HISTORY is not set");
  return id;
}

/**
 * Weekly product/store history is intentionally isolated from the large MARK_HISTORY workbook.
 * An environment variable can override the default so production deployments can change the
 * dedicated workbook without touching source code.
 */
export function getWeeklyHistorySheetId() {
  const id =
    process.env.GOOGLE_SHEET_ID_WEEKLY_HISTORY ||
    process.env.GOOGLE_WEEKLY_HISTORY_SHEET_ID ||
    "19cSF8l67-qHl6s3MhEXwGzDaIFVQVg2WS6EWHLyB57A";
  if (!id) throw new Error("GOOGLE_SHEET_ID_WEEKLY_HISTORY is not set");
  return id;
}

export async function getSpreadsheetTitlesById(spreadsheetId: string) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return (res.data.sheets || []).map((s) => s.properties?.title || "").filter(Boolean);
}

export async function getSheetValuesById(spreadsheetId: string, sheetName: string, range = "A:AZ") {
  const sheets = await getSheetsClient();
  const escaped = sheetName.replace(/'/g, "''");
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${escaped}'!${range}`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  return (res.data.values || []) as any[][];
}

// 날짜 셀이 표시 형식상 연도를 포함 안 하는 경우(예: "4월 25일")가 있어서,
// 텍스트 대신 구글시트 내부 일련번호(SERIAL_NUMBER)로 받아옵니다 — 표시 형식과 무관하게 항상 정확합니다.
export async function getSheetValuesWithSerialDatesById(spreadsheetId: string, sheetName: string, range = "A:AZ") {
  const sheets = await getSheetsClient();
  const escaped = sheetName.replace(/'/g, "''");
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${escaped}'!${range}`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  return (res.data.values || []) as any[][];
}

// 구글시트 일련번호(1899-12-30 기준)를 "YYYY-MM-DD" 문자열로 변환합니다.
export function sheetSerialToDateKey(serial: number): string {
  if (!Number.isFinite(serial)) return "";
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + Math.floor(serial) * 86400000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function appendValuesById(spreadsheetId: string, range: string, values: any[][]) {
  const sheets = await getSheetsClient();
  return sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

export async function updateValuesById(spreadsheetId: string, range: string, values: any[][]) {
  const sheets = await getSheetsClient();
  return sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

// 여러 개의 (서로 떨어진) 셀/범위를 한 번의 API 호출로 업데이트합니다.
// 예: 세부일정 시트의 특정 행들의 R열(실적)만 골라서 갱신할 때 사용.
export async function batchUpdateValuesById(spreadsheetId: string, updates: { range: string; values: any[][] }[]) {
  if (!updates.length) return null;
  const sheets = await getSheetsClient();
  return sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: updates.map((u) => ({ range: u.range, values: u.values })),
    },
  });
}


/**
 * Replaces all values in a sheet range. Used for compacting append-only history sheets
 * after keeping only the latest row for each business key.
 */
export async function replaceSheetValuesById(spreadsheetId: string, sheetName: string, values: any[][], clearRange = "A:AZ") {
  const sheets = await getSheetsClient();
  const escaped = sheetName.replace(/'/g, "''");
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${escaped}'!${clearRange}`,
  });
  if (!values.length) return null;
  return sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${escaped}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

export async function getSheetPropsById(spreadsheetId: string) {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  return (meta.data.sheets || []).map((s) => ({ title: s.properties?.title || "", sheetId: s.properties?.sheetId }));
}

export async function renameSheetById(spreadsheetId: string, oldTitle: string, newTitle: string) {
  const sheets = await getSheetsClient();
  const props = await getSheetPropsById(spreadsheetId);
  const target = props.find((p) => p.title === oldTitle);
  if (!target) throw new Error(`시트를 찾지 못했습니다: ${oldTitle}`);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { updateSheetProperties: { properties: { sheetId: target.sheetId, title: newTitle }, fields: "title" } },
      ],
    },
  });
}

export async function deleteSheetByTitleIfExistsById(spreadsheetId: string, title: string) {
  const sheets = await getSheetsClient();
  const props = await getSheetPropsById(spreadsheetId);
  const target = props.find((p) => p.title === title);
  if (!target) return false;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ deleteSheet: { sheetId: target.sheetId } }] },
  });
  return true;
}

/**
 * Creates a brand-new sheet (fails loudly if the title already exists, so callers should
 * pick a unique staging title) and writes values into it in one shot. Nothing existing is
 * ever cleared here — this only ever adds a new sheet.
 */
export async function createSheetWithValuesById(spreadsheetId: string, title: string, values: any[][], gridSize?: { rowCount: number; columnCount: number }) {
  const sheets = await getSheetsClient();
  const addResult = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });

  // MARK 6.59: 그리드 크기를 지정 안 하면 구글 기본값(1000행×26열)에서 시작해서,
  // 데이터가 그보다 훨씬 크면(특히 열이 많을 때) 자동 확장 과정에서 순간적으로
  // 필요 이상 커졌다가 스프레드시트 전체 1000만 셀 한도를 넘을 수 있습니다.
  // 최종 크기를 미리 정확히 지정해서 이 문제를 피합니다.
  if (gridSize) {
    const sheetId = addResult.data.replies?.[0]?.addSheet?.properties?.sheetId;
    if (sheetId !== undefined && sheetId !== null) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: { sheetId, gridProperties: { rowCount: gridSize.rowCount, columnCount: gridSize.columnCount } },
                fields: "gridProperties.rowCount,gridProperties.columnCount",
              },
            },
          ],
        },
      });
    }
  }

  if (!values.length) return;
  const escaped = title.replace(/'/g, "''");
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${escaped}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

export async function ensureSheetExistsById(spreadsheetId: string, title: string, header?: any[]) {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets || []).some((s) => s.properties?.title === title);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title } } }],
      },
    });
  }

  if (header?.length) {
    const escaped = title.replace(/'/g, "''");
    const values = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${escaped}'!A1:Z1`,
    }).then((res) => res.data.values || []).catch(() => []);
    if (!values?.[0]?.length) {
      const endCol = String.fromCharCode(64 + Math.min(header.length, 26));
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${escaped}'!A1:${endCol}1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [header] },
      });
    }
  }
}

export async function getManySheetValuesById(spreadsheetId: string, sheetNames: string[], range = "A:AZ") {
  const sheets = await getSheetsClient();
  const ranges = sheetNames.map((name) => `'${name.replace(/'/g, "''")}'!${range}`);
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const out: Record<string, any[][]> = {};
  (res.data.valueRanges || []).forEach((vr, idx) => {
    out[sheetNames[idx]] = (vr.values || []) as any[][];
  });
  return out;
}

export async function getSpreadsheetTitles() {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return (res.data.sheets || []).map((s) => s.properties?.title || "").filter(Boolean);
}

export async function getSheetValues(sheetName: string, range = "A:AZ") {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  const escaped = sheetName.replace(/'/g, "''");
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${escaped}'!${range}`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  return (res.data.values || []) as any[][];
}

export async function getManySheetValues(sheetNames: string[], range = "A:AZ") {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  const ranges = sheetNames.map((name) => `'${name.replace(/'/g, "''")}'!${range}`);
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const out: Record<string, any[][]> = {};
  (res.data.valueRanges || []).forEach((vr, idx) => {
    out[sheetNames[idx]] = (vr.values || []) as any[][];
  });
  return out;
}

export async function updateValues(range: string, values: any[][]) {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  return sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

export async function appendValues(range: string, values: any[][]) {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  return sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}


export async function ensureSheetExists(title: string, header?: any[]) {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets || []).some((s) => s.properties?.title === title);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title } } }],
      },
    });
  }
  if (header?.length) {
    const values = await getSheetValues(title, "A1:Z1").catch(() => []);
    if (!values?.[0]?.length) {
      await updateValues(`'${title.replace(/'/g, "''")}'!A1:${String.fromCharCode(64 + header.length)}1`, [header]);
    }
  }
}


export function getDriveFolderId() {
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!id) throw new Error("GOOGLE_DRIVE_FOLDER_ID is not set");
  return id;
}

export async function getDriveClient() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!clientEmail) throw new Error("GOOGLE_CLIENT_EMAIL is not set");
  if (!privateKey) throw new Error("GOOGLE_PRIVATE_KEY is not set");

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });

  await auth.authorize();
  return google.drive({ version: "v3", auth });
}

export async function uploadTextFileToDrive(fileName: string, content: string, mimeType = "application/json") {
  const drive = await getDriveClient();
  const folderId = getDriveFolderId();

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType,
    },
    media: {
      mimeType,
      body: content,
    },
    fields: "id,name,webViewLink,webContentLink",
  });

  const fileId = res.data.id;
return res.data;
}
