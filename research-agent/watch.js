// MARK Research Agent — 로컬 감시 스크립트 (v0.2)
//
// 하는 일:
//   1) MARK 서버에 "대기중인 Research_Request"가 있는지 주기적으로 물어봄
//   2) 있으면, 일반 분석용 프롬프트(/api/research)에 그 요청 내용을 덧붙여서
//   3) 로컬에 설치된 Claude Code CLI(`claude`)를 실행해서 답변을 받고
//   4) 그 답변을 MARK 서버에 저장(로직 제안 등록 + 요청 처리완료 표시)
//
// 특징: 서버에서 Anthropic API를 호출하지 않습니다 — 전부 이 PC에서, 이미 있는
// Claude Code 구독으로 처리해서 API 토큰 과금이 없습니다. 이 PC가 켜져있고
// 이 스크립트가 실행 중일 때만 자동으로 처리됩니다.
//
// 실행 방법:
//   1) 아래 두 값(MARK_BASE_URL, LOGIC_PASSWORD)을 채우거나, 환경변수로 넘겨주세요.
//      예) set MARK_BASE_URL=https://your-domain.vercel.app
//          set LOGIC_PASSWORD=4885
//   2) node watch.js
//   3) 계속 켜두고 싶으면 (Windows) 작업 스케줄러에 "로그온 시 시작"으로 등록하거나,
//      pm2 같은 프로세스 매니저로 관리하세요.

const { spawn } = require("child_process");

const MARK_BASE_URL = process.env.MARK_BASE_URL || "http://localhost:3000";
const LOGIC_PASSWORD = process.env.LOGIC_PASSWORD || "4885";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 5 * 60 * 1000); // 기본 5분마다
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

function log(...args) {
  console.log(`[${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}]`, ...args);
}

async function fetchPendingRequests() {
  const res = await fetch(`${MARK_BASE_URL}/api/logic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: LOGIC_PASSWORD, action: "pending-requests" }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "pending-requests 조회 실패");
  return data.pending || [];
}

async function fetchResearchPack() {
  const res = await fetch(`${MARK_BASE_URL}/api/research?password=${encodeURIComponent(LOGIC_PASSWORD)}`, {
    cache: "no-store",
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "research pack 생성 실패");
  return data.prompt;
}

// Claude Code CLI를 "출력 모드"(-p)로 실행하고, stdin으로 프롬프트를 넘겨서 결과를 받습니다.
function runClaudeCode(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, ["-p"], { shell: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(stderr || `claude CLI 종료 코드 ${code}`));
        return;
      }
      resolve(stdout.trim());
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function saveResearchResult(resultText) {
  const res = await fetch(`${MARK_BASE_URL}/api/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: LOGIC_PASSWORD, resultText }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "결과 저장 실패");
  return data.count || 0;
}

async function markRequestComplete(requestId, resultText, status = "ok") {
  const res = await fetch(`${MARK_BASE_URL}/api/logic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: LOGIC_PASSWORD, action: "request-complete", requestId, result: resultText, status }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "요청 완료 처리 실패");
}

async function processOneRequest(request) {
  log(`처리 시작: ${request.id} (${request.type}) — ${String(request.request || "").slice(0, 60)}`);

  const basePrompt = await fetchResearchPack();
  const fullPrompt = `${basePrompt}\n\n---\n추가로, 다음 사용자 요청도 함께 반영해서 제안해주세요:\n${request.request}`;

  const resultText = await runClaudeCode(fullPrompt);
  const savedCount = await saveResearchResult(resultText);
  await markRequestComplete(request.id, resultText, "ok");

  log(`처리 완료: ${request.id} — 로직 제안 ${savedCount}건 저장됨`);
}

async function tick() {
  try {
    const pending = await fetchPendingRequests();
    if (!pending.length) {
      log("대기중인 요청 없음.");
      return;
    }
    log(`대기중인 요청 ${pending.length}건 발견.`);
    for (const request of pending) {
      try {
        await processOneRequest(request);
      } catch (err) {
        log(`⚠ 요청 처리 실패 (${request.id}):`, err.message || err);
        await markRequestComplete(request.id, String(err.message || err), "error").catch(() => {});
      }
    }
  } catch (err) {
    log("⚠ 폴링 실패:", err.message || err);
  }
}

log(`Research Agent watcher 시작 (MARK_BASE_URL=${MARK_BASE_URL}, 주기=${POLL_INTERVAL_MS / 1000}초)`);
tick();
setInterval(tick, POLL_INTERVAL_MS);
