// MARK ERP Agent — 매일 새벽에 daily-snapshot.js → upload-merged-rows.js 자동 실행
//
// watch.js/run-loop.js와 같은 패턴: 이 창을 계속 켜두면(최소화만 하고 닫지 않으면)
// 매일 지정된 시각(기본 새벽 4시)에 자동으로 재고+매출 스냅샷을 만들고 MARK에 업로드합니다.
//
// 실행: node erp-agent/run-daily-schedule.js
// 시각 바꾸기: set ERP_SCHEDULE_HOUR=4  (기본 4시, 24시간제)
// 테스트로 지금 바로 한 번 돌려보고 싶으면: set ERP_RUN_NOW=1

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

const SCHEDULE_HOUR = Number(process.env.ERP_SCHEDULE_HOUR || 4); // 새벽 4시 기본
const RUN_NOW = process.env.ERP_RUN_NOW === "1";

function log(...args) {
  console.log(`[${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}]`, ...args);
}

function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [path.join(__dirname, scriptName)], {
      cwd: __dirname,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} 종료 코드 ${code}`));
    });
  });
}

async function runPipeline() {
  log("===== 일간 재고+매출 파이프라인 시작 =====");
  try {
    await runScript("daily-snapshot.js");
    await runScript("upload-merged-rows.js");
    log("===== 완료 =====");
  } catch (err) {
    log(`⚠ 파이프라인 실패: ${err.message || err}`);
  }
}

function msUntilNextRun() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(SCHEDULE_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function loop() {
  log(`ERP 일간 스케줄러 시작 (매일 ${SCHEDULE_HOUR}시 실행)`);

  if (RUN_NOW) {
    log("ERP_RUN_NOW=1 — 지금 바로 한 번 실행합니다.");
    await runPipeline();
  }

  while (true) {
    const wait = msUntilNextRun();
    log(`다음 실행까지 ${Math.round(wait / 60000)}분 대기...`);
    await new Promise((r) => setTimeout(r, wait));
    await runPipeline();
  }
}

loop();
