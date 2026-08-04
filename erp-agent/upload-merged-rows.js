// MARK ERP Agent — merged-daily-rows-*.json을 MARK로 업로드
//
// daily-snapshot.js(ERP Agent 채팅에서 만든 스크립트)가 만들어둔
// merged-daily-rows-YYYYMMDD.json 파일을 읽어서 /api/erp-daily-sales-import로 전송합니다.
//
// 실행: node erp-agent/upload-merged-rows.js [파일명]
// (파일명 생략하면 폴더에서 가장 최근 merged-daily-rows-*.json을 자동으로 찾습니다)

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

function findLatestMergedFile() {
  const files = fs.readdirSync(__dirname).filter((f) => /^merged-daily-rows-\d{8}\.json$/.test(f));
  if (!files.length) return null;
  files.sort();
  return files[files.length - 1];
}

async function main() {
  const fileArg = process.argv[2];
  const fileName = fileArg || findLatestMergedFile();
  if (!fileName) {
    console.error("merged-daily-rows-*.json 파일을 찾지 못했습니다. 먼저 daily-snapshot.js를 실행해주세요.");
    process.exit(1);
  }
  const filePath = path.isAbsolute(fileName) ? fileName : path.join(__dirname, fileName);
  if (!fs.existsSync(filePath)) {
    console.error(`파일을 찾을 수 없습니다: ${filePath}`);
    process.exit(1);
  }

  log(`파일 읽는 중: ${filePath}`);
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));

  // daily-snapshot.js가 {date, rows}로 저장했든, rows 배열만 저장했든 둘 다 대응
  const date = payload.date || (fileName.match(/(\d{8})/) || [])[1]?.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
  const rows = payload.rows || payload;

  if (!date) {
    console.error("date를 찾지 못했습니다. 파일 안에 date 필드가 있는지, 파일명에 YYYYMMDD가 있는지 확인해주세요.");
    process.exit(1);
  }
  if (!Array.isArray(rows) || !rows.length) {
    console.error("rows가 비어있습니다.");
    process.exit(1);
  }

  log(`${date} — ${rows.length}건 업로드 중...`);
  const res = await fetch(`${MARK_BASE_URL}/api/erp-daily-sales-import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, rows }),
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
