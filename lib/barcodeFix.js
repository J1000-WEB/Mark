// MARK 2026-09-28: 인샵매출(위탁샵) 바코드 자동수정/검증 로직의 단일 진실 소스(canonical source).
//
// - ERP 에이전트(erp-agent/build-inshop-upload.js, convert-maechul-to-upload.js, fix-old-barcodes.js)와
//   대시보드 앱(lib/consignmentUpload.ts)이 반드시 이 파일 하나만 require/import해서 씁니다.
//   로직을 고치거나 칼라/사이즈 코드를 추가할 땐 이 파일 한 곳만 고치면 둘 다 자동으로 같이 바뀝니다.
// - 이 파일은 순수 CommonJS(.js)라서 ERP 에이전트 쪽(plain node, TypeScript 컴파일러 없음)에서도
//   그대로 require 할 수 있습니다. 대시보드 앱(Next.js/TypeScript)에서는 옆의 barcodeFix.d.ts가
//   타입을 붙여줍니다.
//
// 배경(2026-09-28 사용자 설명):
//   신품번체계(GF1LBG501BRF처럼 G로 시작)는 바코드 뒤 접미사가 [컬러][사이즈] 순서(BR=브라운, F=프리)
//   인데, 구품번체계(WBD1L55541SBK처럼 S/W로 시작)는 접미사가 [사이즈][컬러] 순서(S=사이즈, BK=블랙)
//   입니다. 한컬렉션에서 넘어오는 원본 데이터가 이 순서를 가끔 [컬러][사이즈]로 뒤집어서 주는 경우가
//   있어서(예: WBD2L43545BKXL) 그대로 올리면 실제 존재하지 않는 바코드가 되어 업로드가 실패합니다.
//   G로 시작하는 신품번체계는 이 문제 대상이 아니므로 검증/보정 둘 다 필요 없습니다.

"use strict";

// COLORCODE 시트(칼라코드↔칼라명, 81개)를 그대로 옮겨왔습니다 — 대시보드 앱은 같은 이름의 Google
// Sheets 탭에서 실시간으로 이 목록을 불러오므로, 이 상수는 ERP 에이전트처럼 실시간 로드가 불가능한
// 쪽을 위한 기본값(폴백)입니다.
const DEFAULT_COLOR_CODES = new Set([
  "AK", "CR", "GN", "MG", "BK", "BR", "NA", "BE", "GR", "BL", "CH", "NV", "WH", "MI", "DB", "LB", "SB", "IV",
  "LK", "LG", "KH", "ER", "RE", "ME", "BT", "PI", "PC", "AP", "DN", "TP", "CA", "BC", "ID", "SI", "LE", "MO",
  "BU", "DG", "OA", "PM", "OB", "TG", "DE", "PU", "DR", "CS", "OL", "VI", "LI", "LA", "LY", "BP", "MD", "SM",
  "TO", "RO", "YE", "WI", "AV", "CC", "PP", "WL", "WR", "WT", "LD", "ST", "MU", "SD", "PE", "PL", "CK", "CO",
  "VC", "MT", "OR", "WC", "PR", "PK", "YL",
]);

// 긴 것부터 확인해야 오매칭 안 남 (예: "S"가 "SB"보다 먼저 매칭되면 안 됨)
const DEFAULT_SIZE_CODES = ["XXL", "XL", "XS", "S", "M", "L", "F"];

// 한컬렉션 원본에 칼라명이 코드 대신 풀네임으로 잘못 들어간 경우가 있어요
// (예: GF1UJK009BLACKL — "BLACK"이 코드 "BK" 대신 그대로 들어감). COLORCODE 시트(81개, 코드+이름)
// 그대로 옮겨와서, 풀네임을 찾아 코드로 바꿔줍니다. 긴 이름부터 확인해야 "WHITE"가
// "WHITE TOMATO" 안에서 먼저 오매칭되는 걸 피할 수 있어요.
const DEFAULT_COLOR_NAME_TO_CODE_RAW = [
  ["ASH KHAKI", "AK"], ["CREAM", "CR"], ["GREEN", "GN"], ["MELANGE GRAY", "MG"], ["BLACK", "BK"],
  ["BROWN", "BR"], ["NAVY", "NA"], ["BEIGE", "BE"], ["GREY", "GR"], ["BLUE", "BL"], ["CHARCOAL", "CH"],
  ["WHITE", "WH"], ["MINT", "MI"], ["DEEP BLUE", "DB"], ["LIGHT BLUE", "LB"], ["SKY BLUE", "SB"],
  ["IVORY", "IV"], ["LIGHT KHAKI", "LK"], ["LIGHT GREY", "LG"], ["KHAKI", "KH"], ["ECRU", "ER"],
  ["RED", "RE"], ["MELON", "ME"], ["BUTTER", "BT"], ["PINK", "PI"], ["PISTACHIO", "PC"],
  ["ASH PINK", "AP"], ["DARK NAVY", "DN"], ["TAUPE", "TP"], ["CAMEL", "CA"], ["BRICK", "BC"],
  ["INDIGO", "ID"], ["SILVER", "SI"], ["LEMON", "LE"], ["MOCHA", "MO"], ["BURGUNDY", "BU"],
  ["DEEP GREEN", "DG"], ["OATMEAL", "OA"], ["PUMPKIN", "PM"], ["OCEAN BLUE", "OB"], ["TEAL GREEN", "TG"],
  ["DARK BEIGE", "DE"], ["PURPLE", "PU"], ["DARK BROWN", "DR"], ["CHARCOAL STRIPE", "CS"], ["OLIVE", "OL"],
  ["VIOLET", "VI"], ["LIME", "LI"], ["LAVENDER", "LA"], ["LIGHT YELLOW", "LY"], ["BLOSSOM PINK", "BP"],
  ["MUD", "MD"], ["SAGE MINT", "SM"], ["TOMATO", "TO"], ["ROSE", "RO"], ["YELLOW", "YE"], ["WINE", "WI"],
  ["AVOCADO", "AV"], ["COCOA", "CC"], ["PITCH PINK", "PP"], ["WHITE LEMON", "WL"], ["WHITE CHERRY", "WR"],
  ["WHITE TOMATO", "WT"], ["LEOPARD", "LD"], ["STRIPE", "ST"], ["MUSTARD", "MU"], ["SAND", "SD"],
  ["PEACH", "PE"], ["PLUM", "PL"], ["CHECK", "CK"], ["COMBI", "CO"], ["VINTAGE CHARCOAL", "VC"],
  ["MULTI", "MT"], ["ORANGE", "OR"], ["WHITE COMBI", "WC"], ["PINK CHERRY", "PR"], ["LIGHT GREEN", "LG"],
];

// 매장/거래처마다 같은 칼라를 다르게 표기하는 경우가 있어서(예: 한컬렉션은 "MELANGE GRAY", 팩토리
// 아울렛 정산서는 "MELANGEGREY") 철자가 다른 것만 여기 별칭으로 추가합니다. 코드가 같으면 매칭됩니다.
const EXTRA_COLOR_NAME_ALIASES = [["MELANGE GREY", "MG"]];

function normalizeColorNameList(list) {
  const merged = [...list, ...EXTRA_COLOR_NAME_ALIASES.map(([name, code]) => ({ name, code }))];
  // 바코드 문자열 자체엔 공백이 없어서, 칼라명에 공백이 있으면(예: "LIGHT GREY") 원래 있는 그대로는
  // 절대 못 찾습니다. 비교할 때만 공백을 지운 문자열(cmp)로 찾고, 실제 치환 길이도 이 cmp 길이를
  // 씁니다. 긴 이름부터 봐야 "WHITE"가 "WHITE TOMATO" 안에서 먼저 오매칭되는 걸 피할 수 있어요.
  return merged
    .map(({ name, code }) => ({ name, code, cmp: String(name).toUpperCase().replace(/\s+/g, "") }))
    .sort((a, b) => b.cmp.length - a.cmp.length);
}

const DEFAULT_COLOR_NAME_TO_CODE = normalizeColorNameList(DEFAULT_COLOR_NAME_TO_CODE_RAW.map(([name, code]) => ({ name, code })));

// 바코드에 풀네임 칼라명이 들어간 경우, 매칭되는 칼라코드로 치환을 시도합니다.
// nameToCodeList를 안 넘기면 위 DEFAULT_COLOR_NAME_TO_CODE(고정 81개)를 씁니다. 대시보드 앱은
// Google Sheets COLORCODE 탭에서 실시간으로 불러온 목록(예전 tryAutoFixBarcode와 동일한 모양:
// { code, name } 배열)을 넘겨서 항상 최신 칼라 목록으로 검사합니다.
function fixFullColorNameToCode(barcode, nameToCodeList) {
  const list = normalizeColorNameList(nameToCodeList && nameToCodeList.length ? nameToCodeList : DEFAULT_COLOR_NAME_TO_CODE);
  const raw = String(barcode || "");
  const upper = raw.toUpperCase();
  for (const { name, code, cmp } of list) {
    if (!cmp) continue;
    const idx = upper.indexOf(cmp);
    if (idx >= 0) {
      const fixed = raw.slice(0, idx) + code + raw.slice(idx + cmp.length);
      return { fixed, changed: true, matchedName: name };
    }
  }
  return { fixed: raw, changed: false };
}

// S/W로 시작하는 구품번체계는 스타일코드(10자 고정) 뒤에 사이즈/컬러가 붙는데, 실제로는 상품마다
// [사이즈][컬러]／[컬러][사이즈] 두 순서가 섞여 있습니다(예: 같은 스타일 안에서도 "DNS"=DN(컬러)+S
// 처럼 원래부터 컬러가 먼저인 것도 있고, "SBK"=S(사이즈)+BK(컬러)처럼 사이즈가 먼저인 것도 있음).
// 그래서 규칙만으로 어느 게 맞는지 100% 확신할 수 없는 경우가 있어요 — masterSet(실제 바코드
// 1만8천여 개 목록)을 넘겨주면, 원본/뒤바꾼 값 중 실제로 존재하는 쪽을 우선 채택해서 훨씬 정확하게
// 판단합니다. masterSet이 없거나 둘 다(또는 둘 다 아닌 경우) 못 찾으면, 예전 방식대로 "이미 사이즈가
// 먼저면 그대로, 컬러가 먼저인 패턴이면 사이즈-컬러로" 휴리스틱을 씁니다.
// G로 시작하는 신품번체계는 원래부터 순서가 정해져 있어 이 함수의 대상이 아닙니다.
function fixOldStyleSizeColorOrder(barcode, colorCodes, sizeCodes, masterSet) {
  const colors = colorCodes && colorCodes.size ? colorCodes : DEFAULT_COLOR_CODES;
  const sizes = sizeCodes && sizeCodes.length ? sizeCodes : DEFAULT_SIZE_CODES;
  const b = String(barcode || "");
  if (!(b.startsWith("S") || b.startsWith("W"))) return { fixed: b, changed: false };
  if (b.length < 12) return { fixed: b, changed: false };
  const style = b.slice(0, 10);
  const suffix = b.slice(10);

  // 이미 [사이즈][컬러] 순서로 봐도 말이 되는지
  let sizeFirstValid = false;
  for (const size of sizes) {
    if (suffix.startsWith(size)) {
      const remainder = suffix.slice(size.length);
      if (colors.has(remainder)) {
        sizeFirstValid = true;
        break;
      }
    }
  }
  // [컬러][사이즈]로 뒤집힌 걸로 봐도 말이 되는지 (뒤바꾸면 어떤 값이 되는지)
  let swapped = null;
  for (const size of sizes) {
    if (suffix.endsWith(size)) {
      const remainder = suffix.slice(0, suffix.length - size.length);
      if (colors.has(remainder)) {
        swapped = style + size + remainder;
        break;
      }
    }
  }

  if (masterSet && masterSet.size) {
    if (isKnownBarcode(b, masterSet)) return { fixed: b, changed: false };
    if (swapped && isKnownBarcode(swapped, masterSet)) return { fixed: swapped, changed: swapped !== b };
    // 실제 목록에 둘 다 없으면(신상품이라 아직 목록에 없을 수 있음) 아래 휴리스틱으로 폴백합니다.
  }

  if (sizeFirstValid) return { fixed: b, changed: false };
  if (swapped) return { fixed: swapped, changed: true };
  return { fixed: b, changed: false };
}

// 실제 존재하는 바코드인지 검증이 필요한 대상인지 (G로 시작하는 신품번체계는 검증 불필요, S/W로
// 시작하는 구품번체계만 검증합니다 — 2026-09-28 사용자 지침).
function needsBarcodeValidation(barcode) {
  const b = String(barcode || "").toUpperCase();
  return b.startsWith("S") || b.startsWith("W");
}

// masterSet: 실제 전체 바코드 목록(문자열 대문자)을 담은 Set. data/barcodeMaster.json을
// Set으로 만들어서 넘겨주세요. 목록이 없으면(masterSet이 비어있으면) 항상 true(검증 통과)를
// 돌려줘서, 목록을 못 불러온 상황에서 정상 바코드까지 오탐으로 막지 않게 합니다.
function isKnownBarcode(barcode, masterSet) {
  if (!masterSet || !masterSet.size) return true;
  return masterSet.has(String(barcode || "").toUpperCase());
}

module.exports = {
  DEFAULT_COLOR_CODES,
  DEFAULT_SIZE_CODES,
  DEFAULT_COLOR_NAME_TO_CODE,
  fixFullColorNameToCode,
  fixOldStyleSizeColorOrder,
  needsBarcodeValidation,
  isKnownBarcode,
};
