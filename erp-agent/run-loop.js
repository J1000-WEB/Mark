// MARK ERP Agent — 반복 실행 래퍼 (watch.js와 같은 패턴)
//
// scrape.js → parse-and-upload.js 순서로 한 사이클 실행하고, 일정 간격마다 반복합니다.
// 이 창을 계속 켜두시면 (최소화만 하고 닫지 않으면) 알아서 계속 갱신됩니다.
//
// 실행: node erp-agent/run-loop.js
// 주기 바꾸기: set ERP_POLL_INTERVAL_MS=600000 (기본 10분=600000)

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

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

const POLL_INTERVAL_MS = Number(process.env.ERP_POLL_INTERVAL_MS || 10 * 60 * 1000); // 기본 10분

function log(...args) {
  console.log(`[${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}]`, ...args);
}

// 매번 새 프로세스로 실행합니다 (브라우저를 매 사이클 완전히 새로 띄우고 완전히 종료 —
// 같은 프로세스에서 계속 재사용하면 메모리가 조금씩 새는 걸 방지).
function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [path.join(__dirname, scriptName)], {
      cwd: __dirname,
      stdio: "inherit", // 자식 프로세스의 로그가 이 창에 그대로 보이게
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} 종료 코드 ${code}`));
    });
  });
}

async function runOneCycle() {
  log("===== 사이클 시작 =====");
  try {
    await runScript("scrape.js");
    await runScript("parse-and-upload.js");
    log("===== 사이클 완료 =====");
  } catch (err) {
    log(`⚠ 사이클 실패: ${err.message || err}`);
  }
}

async function loop() {
  log(`ERP Agent 반복 실행 시작 (주기: ${POLL_INTERVAL_MS / 60000}분)`);
  while (true) {
    await runOneCycle();
    log(`다음 사이클까지 ${POLL_INTERVAL_MS / 60000}분 대기...`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

loop();
