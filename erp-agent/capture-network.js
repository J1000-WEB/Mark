// MARK ERP Agent — 네트워크 요청 자동 캡처 도구
//
// 목적:
//   Network 탭을 사람이 눈으로 보면서 하나하나 스크린샷 찍는 대신,
//   이 스크립트를 켜놓고 ERP 사이트 안에서 메뉴들을 클릭하고 다니면
//   지나가는 모든 API 요청(.do)과 응답을 자동으로 기록해서 파일 하나로 저장합니다.
//   특히 "재고" 관련 화면들을 찾을 때 유용해요 — 화면 몇 개 열어보고 나면
//   그 캡처 파일 하나만 Claude에게 보내면 어떤 API가 재고 데이터를 주는지 분석해드릴 수 있어요.
//
// 실행 방법 (반드시 DEBUG=1로 실행 — 브라우저 창이 보여야 직접 클릭하며 돌아다닐 수 있어요):
//   set DEBUG=1
//   node erp-agent/capture-network.js
//
// 사용 순서:
//   1) 실행하면 자동으로 로그인하고 브라우저 창이 뜬 채로 대기합니다.
//   2) 그 창 안에서 직접 메뉴를 눌러 돌아다니세요.
//      - 재고 관련 화면들을 전부 한 번씩 열어보고, 조회 버튼도 눌러보세요.
//      - 특정 상품/매장을 선택해서 상세를 펼쳐보는 것도 좋아요 (getMainDetailList.do처럼
//        상세 API가 따로 있는 경우가 많아서, 클릭해서 펼쳐봐야 해당 요청이 잡힙니다).
//   3) 충분히 둘러봤으면, 이 스크립트를 실행한 터미널 창으로 돌아와서 Enter 키를 누르세요.
//      → 캡처를 종료하고 erp-agent/network-capture-YYYY-MM-DDTHH-mm-ss.json 파일로 저장합니다.
//   4) 그 파일을 통째로 Claude에게 업로드해주세요. 어떤 화면이 어떤 API를 쓰는지,
//      재고 데이터가 어디서 나오는지 분석해드릴게요.
//
// 안전장치:
//   - 쿠키/인증 헤더는 애초에 캡처하지 않습니다 (요청 URL·폼데이터·응답 본문만 기록).
//   - 폼데이터/응답 안에 PASSWORD, TOKEN, SESSION 같은 이름의 필드가 있으면 자동으로
//     [REDACTED]로 가려서 저장합니다.
//   - 그래도 파일을 보내기 전에 한 번 훑어봐 주시면 더 안심이 됩니다.

const fs = require("fs");
const path = require("path");
const readline = require("readline");

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

const ERP_USER = process.env.ERP_USER;
const ERP_PASS = process.env.ERP_PASS;
const ERP_BASE_URL = process.env.ERP_BASE_URL || "https://gim.sgerp.com/indexGI.jsp";

function log(...args) {
  console.log(`[${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}]`, ...args);
}

const SENSITIVE_KEY_RE = /pass|pwd|token|secret|session|auth/i;

function redactParams(paramsObj) {
  const out = {};
  for (const [k, v] of Object.entries(paramsObj)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? "[REDACTED]" : v;
  }
  return out;
}

function parsePostData(postData) {
  if (!postData) return null;
  try {
    // form-urlencoded 형식 시도
    const params = new URLSearchParams(postData);
    const obj = {};
    for (const [k, v] of params.entries()) obj[k] = v;
    if (Object.keys(obj).length) return redactParams(obj);
  } catch {}
  try {
    const json = JSON.parse(postData);
    return redactParams(json);
  } catch {}
  return "[unparsed: " + postData.slice(0, 200) + "]";
}

function redactResponseBody(text) {
  try {
    const json = JSON.parse(text);
    const walk = (node) => {
      if (Array.isArray(node)) return node.map(walk);
      if (node && typeof node === "object") {
        const out = {};
        for (const [k, v] of Object.entries(node)) {
          out[k] = SENSITIVE_KEY_RE.test(k) ? "[REDACTED]" : walk(v);
        }
        return out;
      }
      return node;
    };
    return walk(json);
  } catch {
    // JSON이 아니면(HTML 등) 너무 길지 않게 잘라서 문자열로 저장
    return text.length > 3000 ? text.slice(0, 3000) + "...[truncated]" : text;
  }
}

async function login(page) {
  log("로그인 페이지 접속...");
  await page.goto(ERP_BASE_URL, { waitUntil: "networkidle" });

  const textInputs = await page.locator('input[type="text"], input:not([type])').all();
  const passInputs = await page.locator('input[type="password"]').all();
  if (!textInputs.length || !passInputs.length) {
    throw new Error("로그인 입력창을 찾지 못했습니다.");
  }
  await textInputs[0].fill(ERP_USER);
  await passInputs[0].fill(ERP_PASS);

  const loginButton = page.getByText("LOGIN", { exact: false }).first();
  await loginButton.click();
  await page.waitForLoadState("networkidle").catch(() => {});
  log("로그인 완료(추정).");
}

async function main() {
  if (!ERP_USER || !ERP_PASS) {
    console.error("ERP_USER / ERP_PASS가 .env에 설정되어 있지 않습니다.");
    process.exit(1);
  }
  if (process.env.DEBUG !== "1") {
    console.error("이 스크립트는 반드시 DEBUG=1 로 실행해야 합니다 (브라우저 창이 보여야 직접 클릭할 수 있어요).");
    console.error("예: set DEBUG=1 && node erp-agent/capture-network.js");
    process.exit(1);
  }

  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  const captured = [];
  const pendingByUrl = new Map(); // url -> request info (요청/응답 매칭용, 대략적)

  context.on("request", (request) => {
    const url = request.url();
    if (!/\.do(\?|$)/.test(url)) return; // ERP API는 .do로 끝남
    pendingByUrl.set(request, {
      method: request.method(),
      url,
      postData: parsePostData(request.postData()),
      timestamp: new Date().toISOString(),
    });
  });

  context.on("response", async (response) => {
    const request = response.request();
    if (!pendingByUrl.has(request)) return;
    const info = pendingByUrl.get(request);
    pendingByUrl.delete(request);
    try {
      const text = await response.text();
      info.status = response.status();
      info.responseBody = redactResponseBody(text);
    } catch (err) {
      info.status = response.status();
      info.responseBody = `[본문 읽기 실패: ${err.message}]`;
    }
    captured.push(info);
    log(`캡처됨: ${info.method} ${info.url.split("/").pop()} (지금까지 ${captured.length}건)`);
  });

  const page = await context.newPage();

  try {
    await login(page);
  } catch (err) {
    console.error("로그인 실패:", err.message || err);
    await browser.close();
    process.exit(1);
  }

  console.log("");
  console.log("=================================================================");
  console.log(" 브라우저 창에서 자유롭게 메뉴를 클릭하며 돌아다니세요.");
  console.log(" 특히 '재고' 관련 화면들을 전부 한 번씩 열어보고 조회해보세요.");
  console.log(" 다 둘러보셨으면, 이 창으로 돌아와서 Enter 키를 누르세요.");
  console.log("=================================================================");
  console.log("");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question("계속하려면 Enter를 누르세요...", resolve));
  rl.close();

  await browser.close();

  const outPath = path.join(
    __dirname,
    `network-capture-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(outPath, JSON.stringify(captured, null, 2));
  log(`✅ 완료! 총 ${captured.length}건의 요청을 캡처했습니다.`);
  log(`저장 위치: ${outPath}`);
  log("이 파일을 Claude에게 업로드해주세요.");
}

main().catch((err) => {
  console.error("⚠ 실패:", err.message || err);
  process.exit(1);
});
