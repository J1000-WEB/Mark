// MARK ERP Agent — 일일 재고 스냅샷 + 전일 매출 확정 스크립트
//
// 하는 일 (04시 실행을 목표로 설계, 지금은 수동 테스트용):
//   1) Product360(gi-board)에서 "재고 > 0"인 전체 품번의 스타일+컬러 조합을 뽑음 (3안)
//   2) ERP에 로그인 (브라우저 없이 순수 HTTP — Playwright 불필요, 훨씬 빠름)
//   3) 오프라인 매장 목록을 ERP에서 가져와서 (SHOP_GB 2/3/4/5 = 로드샵/백화점/아울렛/쇼핑몰)
//   4) 스타일+컬러 조합 x 채널(로드샵/백화점/아울렛/쇼핑몰) 4번씩 재고 조회 (SL4010)
//      → 매장별 현재고(TOT_QTY) 수집
//   5) 어제 날짜로 오프라인 매장별 매출을 다시 조회 (SL1010, 확정치 — 이미 하루가 다 지났으므로
//      이 시점에 조회하면 그날 최종 매출 그대로임, 별도 델타 계산 필요 없음)
//   6) 결과를 JSON 파일 2개(재고 스냅샷 / 전일 확정매출)로 저장 + 실행 로그 출력
//
// 실행 방법:
//   node erp-agent/daily-snapshot.js
//   (erp-agent/.env 에 ERP_USER, ERP_PASS, PRODUCT360_TOKEN_OBT 가 있어야 함)
//
// 주의: 이 스크립트는 ERP에 수천 번의 요청을 보냅니다. 동시성(CONCURRENCY)과
// 간격(REQUEST_DELAY_MS)을 너무 낮추지 마세요 — ERP 서버에 부담을 줄 수 있어요.

const fs = require("fs");
const path = require("path");
const https = require("https");
const querystring = require("querystring");

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
const ERP_HOST = "gim.sgerp.com";
const COMP_CD = process.env.ERP_COMP_CD || "GI001";
const PRODUCT360_TOKEN = process.env.PRODUCT360_TOKEN_OBT;

// 오프라인으로 취급할 채널 그룹 (common/getGiCfCode.do, GBN_CD=SL008 기준)
// 2=로드샵, 3=백화점, 4=아울렛, 5=쇼핑몰
const OFFLINE_SHOP_GB = ["2", "3", "4", "5"];

const CONCURRENCY = Number(process.env.ERP_CONCURRENCY || 6); // 동시에 몇 개씩 호출할지
const REQUEST_DELAY_MS = Number(process.env.ERP_DELAY_MS || 50); // 각 배치 사이 살짝 쉬는 시간

function log(...args) {
  console.log(`[${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}]`, ...args);
}

function todayKST(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  // en-CA 로케일은 YYYY-MM-DD 형식으로 나옴
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d).replace(/-/g, "");
}

// ERP는 sale_dt 파라미터로 YYYYMMDD(하이픈 없음)를 쓰지만,
// MARK 업로드 API(/api/erp-daily-sales-import)는 YYYY-MM-DD(하이픈 있음)만 받음 — 변환 필요.
function toIsoDate(yyyymmdd) {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

// ---------- 아주 작은 쿠키 저장소 (세션 유지용) ----------
class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  update(setCookieHeaders) {
    if (!setCookieHeaders) return;
    for (const raw of setCookieHeaders) {
      const pair = raw.split(";")[0];
      const idx = pair.indexOf("=");
      if (idx === -1) continue;
      this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  header() {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

const jar = new CookieJar();

function erpRequest(pathName, formData) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify(formData);
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      "Content-Length": Buffer.byteLength(body),
      Cookie: jar.header(),
    };
    const req = https.request(
      { hostname: ERP_HOST, path: pathName, method: "POST", headers },
      (res) => {
        if (res.headers["set-cookie"]) jar.update(res.headers["set-cookie"]);
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error(`JSON 파싱 실패 (${pathName}): ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function httpsGetJson(hostname, pathName, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path: pathName, method: "GET", headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`JSON 파싱 실패 (${pathName}): ${data.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// ---------- 아주 작은 동시성 제한 실행기 ----------
async function runWithConcurrency(items, worker, concurrency) {
  const results = [];
  let idx = 0;
  async function runner() {
    while (idx < items.length) {
      const cur = idx++;
      try {
        results[cur] = await worker(items[cur], cur);
      } catch (err) {
        results[cur] = { error: err.message || String(err) };
      }
      if (REQUEST_DELAY_MS) await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
  return results;
}

// ---------- 1) ERP 로그인 ----------
async function login() {
  log("ERP 로그인 중...");
  const res = await erpRequest("/login/loginChkGI.do", {
    COMP_ID: COMP_CD,
    EMPL_ID: ERP_USER,
    PASSWORD: ERP_PASS,
  });
  if (res.RESULT_CODE !== "SUCCESS") {
    throw new Error(`로그인 실패: ${JSON.stringify(res)}`);
  }
  log("로그인 성공.");
}

// ---------- 2) Product360에서 활성 스타일+컬러 조합 뽑기 (3안: 재고>0 전체) ----------
async function getActiveCombos() {
  log("Product360에서 상품 목록 가져오는 중...");
  const data = await httpsGetJson("gi-board.vercel.app", "/api/archive/product360", {
    "x-archive-token": PRODUCT360_TOKEN,
  });
  if (!data.products) throw new Error(`Product360 응답 이상: ${JSON.stringify(data).slice(0, 300)}`);

  const combos = [];
  const colorNameMap = new Map(); // styCd__colCd -> 컬러명 (Product360 기준, ERP 매출 응답엔 컬러명이 없어서 여기서 채움)
  for (const p of data.products) {
    if (!p.stockQty || p.stockQty <= 0) continue;
    const colorStock = new Map();
    const colorNames = new Map();
    for (const c of p.colors || []) {
      colorStock.set(c.color, (colorStock.get(c.color) || 0) + (c.stock || 0));
      if (c.colorName) colorNames.set(c.color, c.colorName);
    }
    for (const [color, stock] of colorStock) {
      if (stock > 0) {
        combos.push({ styCd: p.code, colCd: color, styNm: p.name });
        colorNameMap.set(`${p.code}__${color}`, colorNames.get(color) || color);
      }
    }
  }
  log(`활성 스타일+컬러 조합 ${combos.length}개 (품번 ${data.products.length}개 중 재고>0 필터링 후)`);
  return { combos, colorNameMap };
}

// ---------- 3) 오프라인 매장 목록 ----------
async function getOfflineShops() {
  log("매장 목록 가져오는 중...");
  const res = await erpRequest("/GI/SL/SL1010/getMainShopList.do", {
    comp_cd: COMP_CD,
    sale_dt: todayKST(),
    day_div: "2",
    shop_gb: "",
    shop_tp: "",
  });
  if (res.RESULT_CODE !== "SUCCESS") throw new Error(`매장 목록 조회 실패: ${JSON.stringify(res)}`);

  const offline = res.RESULT_DATA.filter((s) => OFFLINE_SHOP_GB.includes(String(s.SHOP_GB)));
  log(`오프라인 매장 ${offline.length}개 확인됨.`);
  return offline; // { SHOP_CD, SHOP_NM, SHOP_GB, ... }
}

// ---------- 4) 재고 스냅샷 (SL4010) ----------
async function fetchStockSnapshot(combos) {
  log(`재고 조회 시작: 조합 ${combos.length}개 x 채널 ${OFFLINE_SHOP_GB.length}개 = 총 ${combos.length * OFFLINE_SHOP_GB.length}회 호출`);
  const jobs = [];
  for (const combo of combos) {
    for (const shopGb of OFFLINE_SHOP_GB) {
      jobs.push({ ...combo, shopGb });
    }
  }

  let done = 0;
  const startedAt = Date.now();
  const results = await runWithConcurrency(
    jobs,
    async (job) => {
      const res = await erpRequest("/GI/SL/SL4010/getMainList2.do", {
        comp_cd: COMP_CD,
        sty_cd: job.styCd,
        col_cd: job.colCd,
        shop_gb: job.shopGb,
      });
      done++;
      if (done % 500 === 0) log(`  ...진행 ${done}/${jobs.length}`);
      if (res.RESULT_CODE !== "SUCCESS") return [];
      return (res.RESULT_DATA || []).map((row) => ({
        styCd: job.styCd,
        styNm: job.styNm,
        colCd: job.colCd,
        shopCd: row.SHOP_CD,
        shopNm: row.SHOP_NM,
        totQty: Number(row.TOT_QTY || 0),
      }));
    },
    CONCURRENCY
  );

  const flat = results.flat().filter((r) => r && !r.error);
  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  log(`재고 조회 완료. ${flat.length}건 수집, ${durationSec}초 소요.`);
  return flat;
}

// ---------- 5) 전일 매출 확정 (SL1010) — 스타일+컬러 단위로 합산 ----------
async function fetchFinalizedSalesYesterday(offlineShops) {
  const yDate = todayKST(-1);
  log(`전일(${yDate}) 매출 확정 조회 시작: 오프라인 매장 ${offlineShops.length}개`);

  const results = await runWithConcurrency(
    offlineShops,
    async (shop) => {
      const res = await erpRequest("/GI/SL/SL1010/getMainDetailList.do", {
        comp_cd: COMP_CD,
        sale_dt: yDate,
        shop_cd: shop.SHOP_CD,
      });
      if (res.RESULT_CODE !== "SUCCESS") return [];

      // 사이즈별로 오는 매출을 스타일+컬러 단위로 합산 (재고 쪽과 granularity를 맞추기 위함)
      const agg = new Map(); // key: styCd__colCd
      for (const row of res.RESULT_DATA || []) {
        const key = `${row.STY_CD}__${row.COL_CD}`;
        if (!agg.has(key)) {
          agg.set(key, {
            shopCd: shop.SHOP_CD,
            shopNm: shop.SHOP_NM,
            styCd: row.STY_CD,
            styNm: row.STY_NM,
            colCd: row.COL_CD,
            colNm: row.COL_CD, // ERP가 컬러명을 따로 안 주면 코드로 대체 (필요시 나중에 매핑 보강)
            qty: 0,
            amount: 0,
          });
        }
        const bucket = agg.get(key);
        bucket.qty += Number(row.SALES_QTY || 0);
        bucket.amount += Number(row.SALES_TAMT || 0);
      }
      return Array.from(agg.values());
    },
    CONCURRENCY
  );

  const flat = results.flat().filter((r) => r && !r.error);
  log(`전일 매출 확정 조회 완료. ${flat.length}건 수집 (스타일+컬러 단위 합산).`);
  return { date: yDate, records: flat };
}

// ---------- 6) 재고 + 매출을 (매장, 스타일, 컬러) 키로 병합 ----------
// MARK 업로드 API(/api/erp-daily-sales-import)는 그 날짜의 기존 행을 통째로 교체하므로,
// 매출만 올리면 stock이 0으로 덮어써짐. 반드시 재고를 같이 합쳐서 완성된 행으로 만들어야 함.
function mergeStockAndSales(stockSnapshot, finalizedSales, colorNameMap) {
  const stockByKey = new Map(); // shopCd__styCd__colCd -> totQty
  for (const s of stockSnapshot) {
    const key = `${s.shopCd}__${s.styCd}__${s.colCd}`;
    stockByKey.set(key, (stockByKey.get(key) || 0) + s.totQty);
  }

  const isoDate = toIsoDate(finalizedSales.date);

  const merged = finalizedSales.records.map((r) => {
    const key = `${r.shopCd}__${r.styCd}__${r.colCd}`;
    return {
      date: isoDate, // 업로드 API는 YYYY-MM-DD 형식만 받음
      storeName: r.shopNm, // 업로드 API는 매장 "이름" 문자열을 기대함 (shop_cd 아님)
      styleCode: r.styCd,
      productName: r.styNm,
      colorCode: r.colCd,
      colorName: colorNameMap.get(`${r.styCd}__${r.colCd}`) || r.colCd, // Product360 기준 실제 컬러명
      size: "", // 사이즈는 일부러 비움 — 컬러 레벨로 통일 (위 설명 참고)
      qty: r.qty,
      amount: r.amount,
      stock: stockByKey.get(key) || 0,
    };
  });

  const missingStockCount = merged.filter((m) => m.stock === 0).length;
  if (missingStockCount > 0) {
    log(`⚠ 참고: ${missingStockCount}건은 재고 스냅샷에서 매칭되는 값을 못 찾아 stock=0으로 채워짐 (품절이거나 조합 범위 밖일 수 있음).`);
  }

  return merged;
}

async function main() {
  if (!ERP_USER || !ERP_PASS) {
    console.error("ERP_USER / ERP_PASS가 .env에 없습니다.");
    process.exit(1);
  }
  if (!PRODUCT360_TOKEN) {
    console.error("PRODUCT360_TOKEN_OBT가 .env에 없습니다.");
    process.exit(1);
  }

  const overallStart = Date.now();
  try {
    await login();
    const [{ combos, colorNameMap }, offlineShops] = await Promise.all([getActiveCombos(), getOfflineShops()]);

    const stockSnapshot = await fetchStockSnapshot(combos);
    const finalizedSales = await fetchFinalizedSalesYesterday(offlineShops);
    const mergedRows = mergeStockAndSales(stockSnapshot, finalizedSales, colorNameMap);

    const todayStr = todayKST();
    const stockPath = path.join(__dirname, `stock-snapshot-${todayStr}.json`);
    const mergedPath = path.join(__dirname, `merged-daily-rows-${finalizedSales.date}.json`);

    fs.writeFileSync(
      stockPath,
      JSON.stringify(
        { generatedAt: new Date().toISOString(), comboCount: combos.length, rowCount: stockSnapshot.length, data: stockSnapshot },
        null,
        2
      )
    );
    // 이 파일이 바로 /api/erp-daily-sales-import 로 보낼 { date, rows } 형태 (parse-and-upload.js와 동일한 계약)
    fs.writeFileSync(mergedPath, JSON.stringify({ date: mergedRows[0]?.date || toIsoDate(finalizedSales.date), rows: mergedRows }, null, 2));

    const totalSec = ((Date.now() - overallStart) / 1000).toFixed(1);
    log(`✅ 전체 완료 (${totalSec}초).`);
    log(`재고 스냅샷 저장 (참고용): ${stockPath}`);
    log(`병합된 업로드용 데이터 저장: ${mergedPath}`);
    log(`(아직 MARK로 실제 업로드는 안 함 — 파일 확인 후 다음 단계에서 업로드 로직 붙일 예정)`);
  } catch (err) {
    console.error("⚠ 실패:", err.message || err);
    process.exit(1);
  }
}

main();
