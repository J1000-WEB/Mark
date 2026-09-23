import { google } from "googleapis";

// MARK 2026-09-23: 매출탭 "전체매출" 파일을 소천님이 구글드라이브에 올려두면(파일명 고정,
// 매번 덮어쓰기) 앱이 자동으로 찾아서 읽어오는 기능용 Drive 클라이언트입니다. 기존 Sheets
// 서비스계정(GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY)을 그대로 재사용하되, Drive 읽기 권한
// (drive.readonly)만 별도로 인증합니다 — 이 파일이 있는 드라이브 폴더(또는 파일)를 그
// 서비스계정 이메일로 "공유"해줘야 앱이 읽을 수 있습니다.

const GOOGLE_SHEETS_MIME = "application/vnd.google-apps.spreadsheet";
const XLSX_EXPORT_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function getPrivateKey() {
  const raw = process.env.GOOGLE_PRIVATE_KEY || "";
  return raw.replace(/\\n/g, "\n");
}

let cachedDriveClient: ReturnType<typeof google.drive> | null = null;
let cachedDriveClientPromise: Promise<ReturnType<typeof google.drive>> | null = null;

async function createDriveClient() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!clientEmail) throw new Error("GOOGLE_CLIENT_EMAIL is not set");
  if (!privateKey) throw new Error("GOOGLE_PRIVATE_KEY is not set");

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  await auth.authorize();
  return google.drive({ version: "v3", auth });
}

async function getDriveClient() {
  if (cachedDriveClient) return cachedDriveClient;
  if (!cachedDriveClientPromise) {
    cachedDriveClientPromise = createDriveClient()
      .then((client) => {
        cachedDriveClient = client;
        return client;
      })
      .catch((error) => {
        cachedDriveClientPromise = null;
        throw error;
      });
  }
  return cachedDriveClientPromise;
}

// 매출탭 업로드용 드라이브 파일명 — 기본값 "전체매출.xlsx". 다른 이름을 쓰고 싶으면
// Vercel 환경변수 SALES_SUMMARY_DRIVE_FILE_NAME 으로 바꿀 수 있습니다.
export function getSalesSummaryDriveFileName() {
  return process.env.SALES_SUMMARY_DRIVE_FILE_NAME || "전체매출.xlsx";
}

// MARK 2026-09-23: 파일명 검색 대신 드라이브 파일 ID를 직접 고정해서 쓰고 싶으면 이 환경변수를
// 설정합니다(예: 드라이브 URL이 https://drive.google.com/file/d/<이 부분>/view 인 그 값).
// 설정돼 있으면 이름 검색보다 우선합니다 — 이름이 같은 파일이 여러 개 생기는 것도 방지됩니다.
export function getSalesSummaryDriveFileId() {
  return process.env.SALES_SUMMARY_DRIVE_FILE_ID || "";
}

export interface DriveFileInfo {
  id: string;
  name: string;
  modifiedTime: string;
  mimeType: string;
}

const FILE_FIELDS = "id, name, modifiedTime, mimeType";

// ID를 알고 있는 파일의 메타데이터를 바로 조회합니다(이름 검색 없이 그 파일 하나만 정확히 지정).
export async function getDriveFileMeta(fileId: string): Promise<DriveFileInfo | null> {
  const drive = await getDriveClient();
  try {
    const res = await drive.files.get({ fileId, fields: FILE_FIELDS });
    const f = res.data;
    if (!f.id || !f.name) return null;
    return { id: f.id, name: f.name, modifiedTime: f.modifiedTime || "", mimeType: f.mimeType || "" };
  } catch (error: any) {
    if (error?.code === 404 || error?.response?.status === 404) return null;
    throw error;
  }
}

// 이름이 정확히 일치하는 파일(휴지통 제외)을 찾습니다. "매번 덮어쓰기" 방식이라 보통
// 하나만 있겠지만, 혹시 동일 이름이 여러 개면 가장 최근 수정본을 씁니다.
export async function findLatestDriveFileByName(fileName: string): Promise<DriveFileInfo | null> {
  const drive = await getDriveClient();
  const escaped = fileName.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name = '${escaped}' and trashed = false`,
    orderBy: "modifiedTime desc",
    fields: `files(${FILE_FIELDS})`,
    pageSize: 5,
  });
  const files = res.data.files || [];
  if (!files.length) return null;
  const f = files[0];
  if (!f.id || !f.name) return null;
  return { id: f.id, name: f.name, modifiedTime: f.modifiedTime || "", mimeType: f.mimeType || "" };
}

// 매출탭에서 쓸 드라이브 파일을 찾습니다 — SALES_SUMMARY_DRIVE_FILE_ID가 설정돼 있으면
// 그 파일 ID를 직접 조회하고(이름 검색 안 함), 아니면 SALES_SUMMARY_DRIVE_FILE_NAME(기본
// "전체매출.xlsx")으로 이름 검색합니다.
export async function findSalesSummaryDriveFile(): Promise<DriveFileInfo | null> {
  const fixedId = getSalesSummaryDriveFileId();
  if (fixedId) return getDriveFileMeta(fixedId);
  return findLatestDriveFileByName(getSalesSummaryDriveFileName());
}

// 파일 내용을 바이너리(Buffer)로 다운로드합니다. 업로드된 엑셀(xlsx/xls) 파일은 그대로
// 받아오고, 소천님이 구글 자체 스프레드시트(Google Sheets)로 올린 경우엔 자동으로 xlsx
// 형식으로 내보내기(export) 받아옵니다 — 둘 다 이후 xlsx 파싱 로직은 동일하게 씁니다.
export async function downloadDriveFile(fileId: string, mimeType?: string): Promise<Buffer> {
  const drive = await getDriveClient();
  if (mimeType === GOOGLE_SHEETS_MIME) {
    const res = await drive.files.export(
      { fileId, mimeType: XLSX_EXPORT_MIME },
      { responseType: "arraybuffer" }
    );
    return Buffer.from(res.data as ArrayBuffer);
  }
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer);
}
