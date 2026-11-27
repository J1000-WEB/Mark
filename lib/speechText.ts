// 리뷰 글 → 소리내어 읽기용 문장(TTS가 "+", "백", "11/26" 등을 어색하게 읽지 않게)
const DOWN: Record<string, string> = { 일: "일요일", 월: "월요일", 화: "화요일", 수: "수요일", 목: "목요일", 금: "금요일", 토: "토요일" };

function wonWords(n: number) {
  const sign = n < 0 ? "마이너스 " : "";
  n = Math.abs(Math.round(n));
  const eok = Math.floor(n / 1e8);
  const man = Math.round((n % 1e8) / 1e4);
  const parts: string[] = [];
  if (eok) parts.push(`${eok}억`);
  if (man) parts.push(`${man.toLocaleString("ko-KR")}만`);
  return sign + (parts.join(" ") || "0") + "원";
}

export function toSpeech(text: string) {
  let s = String(text || "");
  s = s.replace(/^\[MARK\]\s*/gm, "");
  s = s.replace(/[\u{1F300}-\u{1FAFF}☀-➿️]/gu, "");
  // 11/26(목) → 11월 26일 목요일, 11/16~11/22 → 11월 16일부터 11월 22일까지
  s = s.replace(/(\d{1,2})\/(\d{1,2})\s*~\s*(\d{1,2})\/(\d{1,2})/g, "$1월 $2일부터 $3월 $4일까지");
  s = s.replace(/(\d{1,2})\/(\d{1,2})\s*\(([일월화수목금토])\)/g, (_, m, d, w) => `${m}월 ${d}일 ${DOWN[w]}`);
  s = s.replace(/(\d{1,2})\/(\d{1,2})(?!\d)/g, "$1월 $2일");
  // 금액: 121백 → 1억 2,100만원, 5.6억 → 5.6억원, 5,136만 → 5,136만원
  s = s.replace(/([+-]?)(\d[\d,]*(?:\.\d+)?)백/g, (_, sg, v) => wonWords(Number(v.replace(/,/g, "")) * 1e6) + (sg === "+" ? " 증가" : sg === "-" ? " 감소" : ""));
  s = s.replace(/(\d+\.\d+)억/g, (_, v) => wonWords(Number(v) * 1e8)); // 18.94억 → 18억 9,400만원
  s = s.replace(/(\d[\d,.]*)억(?!\s*\d|원)/g, "$1억원");
  s = s.replace(/(\d[\d,]*)만(?!원)/g, "$1만원");
  // 증감: +12.7% → 12.7% 증가, -2% → 2% 감소, +263장 → 263장 증가
  s = s.replace(/\+(\d[\d,.]*)\s*(%|장)/g, "$1$2 증가");
  s = s.replace(/(^|[\s(,])-(\d[\d,.]*)\s*(%|장)/g, "$1$2$3 감소");
  s = s.replace(/\+(\d[\d.]*)°C/g, "$1도 높음").replace(/(^|[\s(])-(\d[\d.]*)°C/g, "$1$2도 낮음");
  s = s.replace(/1\+1/g, "원 플러스 원");
  s = s.replace(/\s*\((?=[A-Z0-9]*\d)[A-Z][A-Z0-9]{6,}\)/g, ""); // 상품명(GF7LKC501) → 상품명
  s = s.replace(/TOP\s*5/gi, "탑 파이브").replace(/TOP\s*10/gi, "탑 텐");
  s = s.replace(/%/g, "퍼센트");
  s = s.replace(/°C/g, "도");
  s = s.replace(/(\d)~(\d)/g, "$1에서 $2");
  s = s.replace(/\[(\d+)\]/g, "");
  s = s.replace(/^\s*[·•]\s*/gm, "").replace(/\s*[·•]\s*/g, ", ").replace(/\s*\/\s*/g, ", ").replace(/→/g, ",").replace(/※/g, "");
  s = s.replace(/^\s*-\s*/gm, "");
  // 숫자 안 쉼표는 빼야 "5,136만"을 "오, 백삼십육만"으로 끊어 읽지 않음
  s = s.replace(/(\d),(?=\d{3}(?!\d))/g, "$1").replace(/(\d),(?=\d{3}(?!\d))/g, "$1");
  s = s.replace(/[ \t]+/g, " ");
  // 줄 끝마다 마침표(읽을 때 쉬게)
  s = s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/[.!?]$/.test(l) ? l : `${l}.`))
    .join("\n");
  return s;
}
