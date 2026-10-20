// 스타일별 채널별 입고/판매/재고현황(금액) 엑셀 파일을 MARK 대시보드에 자동 업로드하는 스크립트
//
// 파워오토메이트가 다운받아둔 "PIP업데이트YYYYMMDD.xlsx"(C:\Users\User\Documents)를 읽어서,
// /api/upload-style-channel-sheet API를 start → chunk(여러 번) → finish 순서로 호출해서
// 대시보드(재고CTRL 화면)에 있는 "업로드" 버튼을 누른 것과 똑같은 결과를 만듭니다.
// 브라우저 화면 자동화가 아니라 API를 직접 호출하는 방식이라 훨씬 간단하고 빨라요.
//
// 준비물: npm install xlsx (이미 다른 스크립트에서 설치했으면 또 안 해도 됨)
//
// 실행: node upload-style-channel-sheet.js
//   (오늘 날짜 기준으로 파일명을 자동으로 찾습니다. 다른 날짜 파일을 쓰려면
//    node upload-style-channel-sheet.js 20260824 처럼 날짜를 인자로 줄 수 있어요)

const path = require("path");
const fs = require("fs");

const API_BASE = "https://mark-khaki.vercel.app";
const DOCS_DIR = "C:\\Users\\User\\Documents";
const CHUNK_SIZE = 1000; // 한 번에 보낼 행 수 — 너무 크면 요청이 실패할 수 있어서 적당히 나눔

// MARK: lib/styleChannelCompact.ts(대시보드 브라우저 업로드가 쓰는 압축 로직)를 그대로
// Node.js로 옮겼습니다. 594열짜리 원본을, 앞의 29개 "마스터" 열은 그대로 두고 그
// 뒤(채널별 5열씩 반복되는 블록)는 "값이 있는 것만" JSON 하나로 압축해서 31~32열로
// 줄입니다. 서버(expandStyleChannelRows)가 이 형태를 그대로 다시 원본 모양으로
// 복원해서 읽으므로, 이렇게 압축해서 올려야 대시보드가 예전처럼 정상적으로 읽습니다.
const STYLE_CHANNEL_MASTER_END = 29;
const STYLE_CHANNEL_METRICS = ["일간", "일간금액", "주간", "누적", "재고"];
const METRIC_COUNT = STYLE_CHANNEL_METRICS.length;
const HEADER_ROWS = 3;

function isEmptyCell(v) {
  return v === null || v === undefined || v === "" || v === 0 || v === "0";
}

function compactStyleChannelRows(rows) {
  if (!rows || rows.length <= HEADER_ROWS) return rows || [];

  const headerRows = rows.slice(0, HEADER_ROWS);
  const dataRows = rows.slice(HEADER_ROWS);

  const compactHeaders = headerRows.map((r) => {
    const master = r.slice(0, STYLE_CHANNEL_MASTER_END);
    const channelPart = r.slice(STYLE_CHANNEL_MASTER_END);
    return [...master, channelPart.length, JSON.stringify(channelPart)];
  });

  const compactData = dataRows.map((r) => {
    const master = r.slice(0, STYLE_CHANNEL_MASTER_END);
    const totalCols = r.length;
    const nChannels = Math.floor((totalCols - STYLE_CHANNEL_MASTER_END) / METRIC_COUNT);

    const detail = [];
    for (let ci = 0; ci < nChannels; ci++) {
      const base = STYLE_CHANNEL_MASTER_END + ci * METRIC_COUNT;
      const vals = r.slice(base, base + METRIC_COUNT);
      if (vals.every(isEmptyCell)) continue;
      const entry = {};
      STYLE_CHANNEL_METRICS.forEach((m, mi) => {
        if (!isEmptyCell(vals[mi])) entry[m] = vals[mi];
      });
      if (Object.keys(entry).length) detail.push([ci, entry]);
    }

    return [...master, totalCols, JSON.stringify(detail)];
  });

  return [...compactHeaders, ...compactData];
}

// MARK 2026-10-19: 새벽 자동 업로드가 "스타일별채널별 시트"만 올리고, 브라우저 업로드/판매데이터 탭
// 업로드가 같이 하던 아래 두 가지 부가 저장을 안 하고 있었습니다 → RT 제안이 계속 2026-10-06자
// 매장별 재고로 계산되고 있었음. 그래서 여기서도 똑같이 저장합니다(둘 다 실패해도 메인 업로드엔 영향 없음).
//  (1) 매장별_재고_스냅샷: /api/store-stock-upload — RT 제안·점포요청 RT의 매장 재고 소스
//      (lib/salesDataSuggestions.ts의 extractStoreStockRows를 그대로 옮김)
//  (2) 재고입고이력: /api/upload-stock-history — "재고 대량입고 알림"용 스타일+컬러별 물류재고
//      (components/InventoryDashboard.tsx 업로드 후처리와 동일)
const PIP_STORE_NAME_PATTERN =
  /(점|플래그십|아울렛|백화점|몰|현대|롯데|신세계|LF|타임스퀘어|성수|신사|한남|센텀|용산|광주|송도|김포|잠실|강남|대전|평촌|광양|운정)/i;
const PIP_COL = { STYLE: 13, PRODUCT: 14, COLOR: 15, COLOR_NAME: 16, SIZE: 17, STOCK: 25 };

function detectPipStoreStockColumns(pipRows) {
  const nameRow = pipRows[1] || [];
  const subRow = pipRows[2] || [];
  const result = [];
  for (let i = 0; i < nameRow.length; i++) {
    const name = String(nameRow[i] ?? "").trim();
    if (!name || name.includes("_")) continue;
    if (name.includes("무신사")) continue; // "신사"로 오인 방지
    if (!PIP_STORE_NAME_PATTERN.test(name)) continue;
    const subHere = String(subRow[i] ?? "").trim();
    const subStock = String(subRow[i + 4] ?? "").trim();
    if (subHere !== "일간" || subStock !== "재고") continue; // 포맷이 다르면 건너뜀
    result.push({ storeName: name, stockCol: i + 4 });
  }
  return result;
}

function extractStoreStockRows(pipRows) {
  const storeCols = detectPipStoreStockColumns(pipRows);
  const out = [];
  if (!storeCols.length) return { rows: out, storeCount: 0 };
  for (const r of pipRows.slice(HEADER_ROWS)) {
    const styleCode = String(r[PIP_COL.STYLE] ?? "").trim();
    if (!styleCode) continue;
    const productName = String(r[PIP_COL.PRODUCT] ?? "").trim();
    const color = String(r[PIP_COL.COLOR] ?? "").trim();
    const colorName = String(r[PIP_COL.COLOR_NAME] ?? "").trim();
    const size = String(r[PIP_COL.SIZE] ?? "").trim();
    for (const { storeName, stockCol } of storeCols) {
      const stock = Math.max(0, Number(r[stockCol]) || 0);
      if (!stock) continue;
      out.push([styleCode, productName, color, colorName, size, storeName, stock]);
    }
  }
  return { rows: out, storeCount: storeCols.length };
}

function kstDateString() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

async function postApi(pathname, body) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${pathname} 응답이 JSON이 아니에요 (status=${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok || json.ok === false) throw new Error(`${pathname} 실패: ${json.error || text.slice(0, 300)}`);
  return json;
}

async function saveSideSnapshots(rows, fileName) {
  // (1) 매장별 재고 스냅샷
  try {
    const { rows: stockRows, storeCount } = extractStoreStockRows(rows);
    if (!stockRows.length) {
      log("⚠ 매장별 재고: 매장 컬럼을 못 찾았어요(파일 헤더 구조가 바뀌었을 수 있음) — 건너뜀");
    } else {
      // MARK 2026-10-20: 한 번에 보내면 413(요청 크기 초과)이 나서 청크로 나눠 보냅니다.
      // 한글은 UTF-8로 3바이트라 문자 수가 아니라 실제 바이트로 계산합니다(청크당 약 1.5MB).
      const MAX_CHUNK_BYTES = 1_500_000;
      const chunks = [];
      let cur = [];
      let curBytes = 2;
      for (const r of stockRows) {
        const b = Buffer.byteLength(JSON.stringify(r), "utf8") + 1;
        if (cur.length && curBytes + b > MAX_CHUNK_BYTES) {
          chunks.push(cur);
          cur = [];
          curBytes = 2;
        }
        cur.push(r);
        curBytes += b;
      }
      if (cur.length) chunks.push(cur);
      let startRow = 2; // 1행은 헤더
      for (let i = 0; i < chunks.length; i++) {
        const c = await postApi("/api/store-stock-upload", { mode: "chunk", rows: chunks[i], startRow });
        // 서버가 필수값(스타일/칼라/사이즈/매장) 없는 행을 빼고 쓰므로, 실제로 쓴 행 수만큼만 다음 위치로 이동
        startRow += Number(c.written || 0);
        log(`매장별 재고 업로드 중... (${i + 1}/${chunks.length}, ${startRow - 2}행 저장)`);
      }
      const res = await postApi("/api/store-stock-upload", { mode: "finish", totalRows: startRow - 2, storeCount, fileName });
      log(`✅ 매장별 재고 스냅샷 저장 (${res.rowCount}행, ${res.storeCount || storeCount}개 매장)`);
    }
  } catch (e) {
    log("⚠ 매장별 재고 스냅샷 저장 실패(메인 업로드는 정상):", e.message || e);
  }

  // (2) 재고입고이력(스타일+컬러별 물류재고 합산 — 사이즈별 여러 줄을 합침)
  try {
    const byKey = new Map();
    for (const r of rows.slice(HEADER_ROWS)) {
      const styleCode = r[PIP_COL.STYLE];
      if (!styleCode) continue;
      const key = `${styleCode}\u0000${r[PIP_COL.COLOR]}`;
      byKey.set(key, (byKey.get(key) || 0) + (Number(r[PIP_COL.STOCK]) || 0));
    }
    const historyRows = [...byKey.entries()].map(([key, stock]) => {
      const [styleCode, colorCode] = key.split("\u0000");
      return [styleCode, colorCode, stock];
    });
    await postApi("/api/upload-stock-history", { date: kstDateString(), rows: historyRows });
    log(`✅ 재고입고이력 저장 (${historyRows.length}개 스타일·컬러, ${kstDateString()})`);
  } catch (e) {
    log("⚠ 재고입고이력 저장 실패(메인 업로드는 정상):", e.message || e);
  }
}

// MARK 2026-10-20: CMD 창 출력은 지나가면 확인이 어려워서, 같은 내용을 erp-agent/logs/pip-upload.log에도 남깁니다.
const LOG_FILE = path.join(__dirname, "logs", "pip-upload.log");
function log(...args) {
  const line = `[스타일채널업로드] [${new Date().toLocaleString("ko-KR")}] ${args.map((a) => (typeof a === "string" ? a : String(a))).join(" ")}`;
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
  } catch {}
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

async function postJson(mode, body) {
  const res = await fetch(`${API_BASE}/api/upload-style-channel-sheet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, ...body }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`[${mode}] 응답이 JSON이 아니에요 (status=${res.status}): ${text.slice(0, 500)}`);
  }
  if (!res.ok || json.ok === false) {
    throw new Error(`[${mode}] 실패: ${json.error || text.slice(0, 300)}`);
  }
  return json;
}

async function main() {
  // node upload-style-channel-sheet.js --side-only [YYYYMMDD]
  //   → 시트 업로드는 건너뛰고 매장별 재고 스냅샷 + 재고입고이력만 저장(이미 올라간 PIP로 재고만 갱신할 때)
  const sideOnly = process.argv.includes("--side-only");
  const dateArg = process.argv.slice(2).find((a) => /^\d{8}$/.test(a)) || todayString();
  const filePath = path.join(DOCS_DIR, `PIP업데이트${dateArg}.xlsx`);

  if (!fs.existsSync(filePath)) {
    console.error(`⚠ 파일이 없어요: ${filePath}`);
    process.exit(1);
  }
  log(`파일 읽는 중: ${filePath}`);

  const XLSX = require("xlsx");
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // header:1 → 2차원 배열(행 배열의 배열)로, 시트에 보이는 그대로 가져옵니다(첫 행도 포함).
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });

  if (sideOnly) {
    log("--side-only: 시트 업로드는 건너뛰고 매장별 재고 스냅샷 + 재고입고이력만 저장합니다.");
    await saveSideSnapshots(rows, path.basename(filePath));
    return;
  }

  const totalRows = rows.length;
  const totalCols = rows.reduce((max, r) => Math.max(max, r.length), 0);
  log(`원본 ${totalRows}행 x ${totalCols}열.`);

  const compactRows = compactStyleChannelRows(rows);
  const compactTotalCols = compactRows.reduce((max, r) => Math.max(max, r.length), 0);
  const origCells = rows.reduce((sum, r) => sum + r.length, 0);
  const compactCells = compactRows.reduce((sum, r) => sum + r.length, 0);
  log(`압축 완료: ${totalCols}열 → ${compactTotalCols}열 (셀 수 ${origCells.toLocaleString()} → ${compactCells.toLocaleString()}, ${(origCells / compactCells).toFixed(1)}배 절감)`);
  log(`${CHUNK_SIZE}행씩 나눠서 업로드합니다.`);

  // ---- start: 첫 청크 ----
  const firstChunk = compactRows.slice(0, CHUNK_SIZE);
  log(`시작(start) — 기존 시트 삭제 후 새로 만들고 첫 ${firstChunk.length}행 씀...`);
  const startRes = await postJson("start", { rows: firstChunk, totalRows: compactRows.length, totalCols: compactTotalCols });
  const liveSheetName = startRes.liveSheetName;
  log(`✅ 시작 완료 (시트명: ${liveSheetName}, ${startRes.written}행 씀)`);

  // ---- chunk: 나머지 ----
  let written = firstChunk.length;
  while (written < compactRows.length) {
    const chunk = compactRows.slice(written, written + CHUNK_SIZE);
    const startRow = written + 1; // 1-indexed
    log(`업로드 중... (${written}/${compactRows.length}행)`);
    await postJson("chunk", { rows: chunk, liveSheetName, startRow });
    written += chunk.length;
  }
  log(`✅ 전체 업로드 완료 (${written}행)`);

  // ---- finish: 검증 ----
  log("검증 중...");
  const finishRes = await postJson("finish", { liveSheetName, expectedTotalRows: compactRows.length });
  log(`✅ 완료! 최종 확인된 행수: ${finishRes.totalRows} (품목 ${finishRes.totalRows - HEADER_ROWS}개)`);

  // ---- 부가 저장(매장별 재고 스냅샷 + 재고입고이력) — 원본(압축 전) 행 기준 ----
  await saveSideSnapshots(rows, path.basename(filePath));
}

main().catch((err) => {
  log("⚠ 실패:", err.message || err);
  process.exit(1);
});
