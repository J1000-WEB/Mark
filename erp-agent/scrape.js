// MARK ERP Agent — 채널별 매출현황(컬러/사이즈별) 스크래퍼 (v0.1, 실험 단계)
//
// 하는 일:
//   1) https://gim.sgerp.com/indexGI.jsp 에 아이디/비번으로 로그인
//   2) "채널별 매출현황" 화면으로 이동해서, 기준일자 지정 후 조회
//   3) 화면에 표로 나오는 스타일/컬러/사이즈/수량/판매금액을 긁어서 JSON으로 저장
//
// 주의: 이 사이트의 실제 HTML 구조를 본 적이 없어서, 아래 선택자(SELECTOR)들은 최선의
// 추측입니다. 처음 실행했을 때 안 되면, DEBUG=1로 다시 실행해서 나오는 스크린샷들을
// (/erp-agent/debug 폴더) 확인하고 Claude에게 보내주세요 — 그거 보고 선택자를 고칩니다.
//
// 사전 준비:
//   npm install playwright
//   npx playwright install chromium
//
// 실행 방법:
//   1) .env 파일을 이 폴더에 만들고 아래처럼 채우기 (절대 채팅에 붙여넣지 마세요):
//        ERP_USER=본인아이디
//        ERP_PASS=본인비밀번호
//        MARK_BASE_URL=https://mark-khaki.vercel.app
//   2) node erp-agent/scrape.js          (평소 실행)
//      DEBUG=1 node erp-agent/scrape.js  (안 될 때 디버그용 스크린샷 남기기)

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

const ERP_USER = process.env.ERP_USER;
const ERP_PASS = process.env.ERP_PASS;
const ERP_BASE_URL = process.env.ERP_BASE_URL || "https://gim.sgerp.com/indexGI.jsp";
const MARK_BASE_URL = process.env.MARK_BASE_URL || "http://localhost:3000";
const DEBUG = process.env.DEBUG === "1";
const DEBUG_DIR = path.join(__dirname, "debug");

function log(...args) {
  console.log(`[${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}]`, ...args);
}

async function screenshot(page, name) {
  if (!DEBUG) return;
  if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const file = path.join(DEBUG_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  log(`디버그 스크린샷 저장: ${file}`);
}

async function login(page) {
  log("로그인 페이지 접속...");
  await page.goto(ERP_BASE_URL, { waitUntil: "networkidle" });
  await screenshot(page, "01-login-page");

  // 추측 1: input[type=text] / input[type=password] 순서로 첫 번째 두 개를 아이디/비번으로 간주
  const textInputs = await page.locator('input[type="text"], input:not([type])').all();
  const passInputs = await page.locator('input[type="password"]').all();

  if (!textInputs.length || !passInputs.length) {
    throw new Error("로그인 입력창을 찾지 못했습니다 (선택자 조정 필요 — 디버그 스크린샷 확인).");
  }

  await textInputs[0].fill(ERP_USER);
  await passInputs[0].fill(ERP_PASS);
  await screenshot(page, "02-login-filled");

  // 추측 2: "LOGIN" 텍스트가 있는 버튼을 클릭
  const loginButton = page.getByText("LOGIN", { exact: false }).first();
  await loginButton.click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await screenshot(page, "03-after-login");

  log("로그인 완료(추정). 다음 단계로 진행합니다.");
}

async function navigateToChannelSales(page) {
  // 확인됨: 메뉴 클릭 → "채널별 매출현황" 텍스트 클릭이 정상 작동함 (스크린샷으로 확인됨).
  log("채널별 매출현황 화면 찾는 중...");

  const menuIcon = page.locator("svg, .menu, [class*='menu'], [class*='hamburger']").first();
  await menuIcon.click({ timeout: 5000 }).catch(() => log("메뉴 아이콘 클릭 실패 (이미 목록 화면일 수 있음)"));
  await screenshot(page, "04-menu-open");

  const target = page.getByText("채널별 매출현황", { exact: false }).first();
  await target.click({ timeout: 5000 }).catch(() => log("'채널별 매출현황' 메뉴를 못 찾음 — 이미 그 화면일 수도 있음"));
  await page.waitForLoadState("networkidle").catch(() => {});
  await screenshot(page, "05-channel-sales-page");

  // 신규: "조회" 버튼을 눌러서 채널 목록을 실제로 불러옵니다. 메인 페이지에 없으면
  // 프레임 안에서도 찾아봅니다 (프레임 구조가 매번 조금씩 다를 수 있어서).
  log("조회 버튼 클릭...");
  const queryButton = page.getByText("조회", { exact: false }).first();
  let queryClicked = false;
  try {
    await queryButton.click({ timeout: 4000 });
    queryClicked = true;
  } catch {
    log("메인 페이지에서 '조회' 못 찾음 — 프레임 안에서 시도...");
    for (const frame of page.frames()) {
      try {
        await frame.getByText("조회", { exact: false }).first().click({ timeout: 2000 });
        queryClicked = true;
        break;
      } catch {}
    }
  }
  log(queryClicked ? "조회 클릭 성공." : "⚠ 조회 버튼을 어디서도 못 찾음 (화면에 이미 데이터가 떠있을 수도 있음).");
  await page.waitForTimeout(2500); // 데이터 로딩 대기 (넉넉하게)
  await screenshot(page, "06-after-query");
}

// MARK 6.52-erp: 텍스트로 프레임 찾기가 계속 실패해서, URL 패턴(SL = Sales 모듈로 추정)으로
// 우선 찾고, 안 되면 about:blank가 아닌 프레임 중 아무거나 골라서 통째로 HTML을 덤프합니다.
async function findDataFrame(page, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const frames = page.frames().filter((f) => {
      try {
        return f.url() && f.url() !== "about:blank";
      } catch {
        return false;
      }
    });
    log(`[시도 ${attempt}/${attempts}] 실제 URL 있는 프레임 ${frames.length}개: ${frames.map((f) => f.url()).join(", ")}`);

    const salesFrame = frames.find((f) => /\/SL\//i.test(f.url()));
    if (salesFrame) {
      log(`SL(Sales) 모듈 프레임 발견: ${salesFrame.url()}`);
      return salesFrame;
    }

    if (attempt < attempts) {
      log("SL 프레임 아직 없음 — 2초 대기 후 다시 시도...");
      await page.waitForTimeout(2000);
    }
  }

  // 끝까지 못 찾으면, 메인이 아닌 프레임 중 아무거나 반환 (그거라도 HTML을 봐야 다음 단서를 찾을 수 있음)
  const fallback = page.frames().find((f) => {
    try {
      return f.url() && f.url() !== "about:blank" && !f.url().includes("/MAIN/");
    } catch {
      return false;
    }
  });
  if (fallback) log(`⚠ SL 프레임은 못 찾았지만, 대신 이 프레임을 덤프합니다: ${fallback.url()}`);
  return fallback || null;
}

async function dumpFrameBodyHtml(frame, name) {
  if (!DEBUG || !frame) return;
  if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
  try {
    const html = await frame.evaluate(() => document.body ? document.body.innerHTML : "(no body)");
    const file = path.join(DEBUG_DIR, `${name}.html`);
    fs.writeFileSync(file, html.slice(0, 60000));
    log(`디버그 HTML(body 전체) 저장: ${file} (${html.length}자 중 앞부분만)`);
  } catch (err) {
    log(`⚠ body HTML 덤프 실패: ${err.message || err}`);
  }
}



async function expandAllChannelsAndScrape(page) {
  const frame = await findDataFrame(page);
  if (!frame) {
    log("⚠ 데이터 프레임을 못 찾아서 펼치기/긁기를 건너뜁니다.");
    return [];
  }

  await dumpFrameBodyHtml(frame, "07a-table-before-expand");

  log("'+' 펼치기 표시 찾는 중 (jqGrid 서브그리드 아이콘: .ui-icon-plus / .sgcollapsed)...");
  let clickTargets = await frame.locator(".ui-icon-plus").all();
  if (!clickTargets.length) clickTargets = await frame.locator(".sgcollapsed").all();
  log(`'+' 후보 ${clickTargets.length}개 발견. 하나씩 클릭 시도...`);

  for (let i = 0; i < clickTargets.length; i++) {
    try {
      await clickTargets[i].click({ timeout: 1500, force: true });
      await page.waitForTimeout(600); // jqGrid 서브그리드는 AJAX로 로딩되어 시간이 좀 더 필요
    } catch {
      // 무시하고 계속
    }
  }
  await page.waitForTimeout(1000); // 마지막 몇 개가 마저 로딩되도록 여유
  await screenshot(page, "07-all-expanded");
  await dumpFrameBodyHtml(frame, "07b-table-after-expand");

  return await scrapeTable(frame);
}

async function scrapeTable(frame) {
  // 화면의 표(스타일/스타일명/컬러/사이즈/수량/판매금액)를 프레임 안에서 긁습니다.
  log("데이터 표 읽는 중 (프레임 안)...");
  const rows = await frame.evaluate(() => {
    const tables = Array.from(document.querySelectorAll("table"));
    const out = [];
    for (const table of tables) {
      const trs = Array.from(table.querySelectorAll("tr"));
      for (const tr of trs) {
        const cells = Array.from(tr.querySelectorAll("td")).map((td) => td.textContent?.trim() || "");
        if (cells.length >= 6) out.push(cells);
      }
    }
    return out;
  });

  log(`${rows.length}개 행 발견.`);
  return rows;
}

async function main() {
  if (!ERP_USER || !ERP_PASS) {
    console.error("ERP_USER / ERP_PASS가 .env에 설정되어 있지 않습니다.");
    process.exit(1);
  }

  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: !DEBUG });
  const page = await browser.newPage();

  try {
    await login(page);
    await navigateToChannelSales(page);
    const rows = await expandAllChannelsAndScrape(page);

    const outPath = path.join(__dirname, `scraped-${new Date().toISOString().slice(0, 10)}.json`);
    fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
    log(`결과 저장: ${outPath}`);

    if (!rows.length) {
      log("⚠ 데이터를 못 찾았습니다. DEBUG=1로 다시 실행해서 스크린샷을 Claude에게 보내주세요.");
    }
  } catch (err) {
    log("⚠ 실패:", err.message || err);
    await screenshot(page, "99-error");
    log("erp-agent/debug 폴더의 스크린샷들을 Claude에게 보내주시면 선택자를 고칠 수 있어요.");
  } finally {
    await browser.close();
  }
}

main();
