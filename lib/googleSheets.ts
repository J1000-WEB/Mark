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
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  await auth.authorize();
  return google.sheets({ version: "v4", auth });
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
