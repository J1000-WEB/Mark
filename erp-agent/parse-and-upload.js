// MARK ERP Agent — 긁어온 JSON을 MARK가 읽는 형태로 바꿔서 업로드
//
// 하는 일:
//   1) erp-agent/scraped-YYYY-MM-DD.json 을 읽어서
//   2) "채널 요약행"(14칸) + "상세행"(7칸: 순번/품번/상품명/컬러/사이즈/수량/금액) 패턴을
//      구분해서, 상세행마다 어느 채널(매장) 소속인지 이어붙입니다
//   3) MARK의 /api/erp-daily-sales-import 로 전송해서 Daily_Sales_History에 반영합니다
//
// 실행 방법:
//   node erp-agent/parse-and-upload.js [scraped-2026-08-03.json] [2026-08-03]
//   (파일명/날짜를 안 주면, 오늘 날짜의 scraped-*.json을 자동으로 찾습니다)

const fs = require("fs");
const path = require("path");

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile();

const MARK_BASE_URL = process.env.MARK_BASE_URL || "http://localhost:3000";

function log(...args) {
  console.log(`[${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}]`, ...args);
}

function parseAmount(v) {
  return Number(String(v || "0").replace(/,/g, "")) || 0;
}

// 채널 요약행: 길이 14, [2]=채널코드(숫자), [3]=채널명
function isChannelRow(row) {
  return row.length === 14 && row[2] && /^\d+$/.test(String(row[2]).trim());
}

// 상세행: 길이 7, [1]=품번(문자로 시작), [5]=수량, [6]=금액
function isDetailRow(row) {
  return row.length === 7 && row[1] && /^[A-Za-z]/.test(String(row[1]).trim());
}

function parseScrapedRows(rawRows) {
  const records = [];
  let currentChannel = "";

  for (const row of rawRows) {
    if (isChannelRow(row)) {
      currentChannel = String(row[3] || "").trim();
      continue;
    }
    if (isDetailRow(row) && currentChannel) {
      records.push({
        storeName: currentChannel,
        styleCode: String(row[1]).trim(),
        productName: String(row[2] || "").trim(),
        colorCode: String(row[3] || "").trim(),
        colorName: String(row[3] || "").trim(),
        size: String(row[4] || "").trim(),
        qty: parseAmount(row[5]),
        amount: parseAmount(row[6]),
        stock: 0, // 이 화면(채널별 매출현황)은 판매만 알려줘요. 재고는 별도 화면 필요.
      });
    }
    // 그 외(빈 행, "Loading..." 찌꺼기 행 등)는 건너뜁니다.
  }

  return records;
}

function findLatestScrapedFile() {
  const files = fs.readdirSync(__dirname).filter((f) => /^scraped-\d{4}-\d{2}-\d{2}\.json$/.test(f));
  if (!files.length) return null;
  files.sort();
  return files[files.length - 1];
}

async function main() {
  const fileArg = process.argv[2];
  const dateArg = process.argv[3];

  const fileName = fileArg || findLatestScrapedFile();
  if (!fileName) {
    console.error("scraped-*.json 파일을 찾지 못했습니다. 먼저 scrape.js를 실행해주세요.");
    process.exit(1);
  }
  const filePath = path.isAbsolute(fileName) ? fileName : path.join(__dirname, fileName);
  if (!fs.existsSync(filePath)) {
    console.error(`파일을 찾을 수 없습니다: ${filePath}`);
    process.exit(1);
  }

  // 날짜: 인자로 안 주면 파일명(scraped-YYYY-MM-DD.json)에서 추출
  const date = dateArg || (fileName.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || new Date().toISOString().slice(0, 10);

  log(`파일 읽는 중: ${filePath} (기준일자: ${date})`);
  const rawRows = JSON.parse(fs.readFileSync(filePath, "utf8"));
  log(`원본 행 ${rawRows.length}개`);

  const records = parseScrapedRows(rawRows);
  log(`변환된 상세 레코드 ${records.length}개 (채널 ${new Set(records.map((r) => r.storeName)).size}개)`);

  if (!records.length) {
    console.error("변환된 레코드가 없습니다. scraped json 구조가 바뀌었을 수 있어요 — Claude에게 문의해주세요.");
    process.exit(1);
  }

  log("MARK로 전송 중...");
  const res = await fetch(`${MARK_BASE_URL}/api/erp-daily-sales-import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, rows: records }),
  });
  const data = await res.json();

  if (!data.ok) {
    console.error("업로드 실패:", data.error);
    process.exit(1);
  }

  log(`✅ 완료! ${date} — 신규 ${data.newRows}건 반영 (교체 ${data.replacedRows}건)`);
}

main().catch((err) => {
  console.error("⚠ 실패:", err.message || err);
  process.exit(1);
});
