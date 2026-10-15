// MARK 2026-10-15: 일간/주간 탭 "음성 매출 브리핑" 대본 생성기.
// 화면에 이미 있는 숫자(KPI·매장 순위·상품 TOP·결품위험)만 재료로 써서, 귀로 들어도
// 상황이 파악되도록 "한줄요약 → 숫자 → 매장 → 상품 → 오늘 할 일" 순서의 대본을 만듭니다.
// 새 데이터를 지어내지 않습니다 — 값이 없으면 그 문장/챕터는 그냥 빠집니다.
// 판매금액은 화면과 같은 실제 판매금액 필드(daySales/weekSales/dailyAmount/weekAmount)만 씁니다.

import { rate } from "@/lib/mark";

export type BriefingChapter = {
  key: string;
  title: string;
  icon: string;
  lines: string[];
  /** 30초 요약 모드에서도 읽을지 */
  summary?: boolean;
};

const n = (v: any) => {
  const x = Number(v || 0);
  return Number.isFinite(x) ? x : 0;
};

/** 받침에 따라 조사 선택: josa("성수", "은", "는") */
function josa(word: string, withBatchim: string, without: string) {
  const w = String(word || "").replace(/[\s)\]]+$/, "");
  const last = w.charCodeAt(w.length - 1);
  if (last >= 0xac00 && last <= 0xd7a3) {
    const jong = (last - 0xac00) % 28;
    if (withBatchim === "으로") return jong === 0 || jong === 8 ? without : withBatchim; // ㄹ받침은 "로"
    return jong ? withBatchim : without;
  }
  // 영문/숫자로 끝나면 대략 받침 없는 쪽으로
  return /[013678lmn]$/i.test(w) ? withBatchim : without;
}
const eun = (w: string) => `${w}${josa(w, "은", "는")}`;
const iga = (w: string) => `${w}${josa(w, "이", "가")}`;
const euro = (w: string) => `${w}${josa(w, "으로", "로")}`;

/** 귀로 듣기 좋은 금액: 1억 이상은 백만 단위, 그 아래는 만 단위로 반올림 */
export function sayWon(value: number) {
  const v = Math.round(n(value));
  const sign = v < 0 ? "마이너스 " : "";
  const a = Math.abs(v);
  if (a >= 1e8) {
    const eok = Math.floor(a / 1e8);
    const man = Math.round((a % 1e8) / 1e6) * 100; // 백만 단위
    if (man >= 10000) return `${sign}${eok + 1}억원`;
    return `${sign}${eok}억${man ? ` ${man.toLocaleString("ko-KR")}만` : ""}원`;
  }
  if (a >= 1e4) return `${sign}${Math.round(a / 1e4).toLocaleString("ko-KR")}만원`;
  return `${sign}${a.toLocaleString("ko-KR")}원`;
}

function sayPct(value: number, digits = 1) {
  const v = n(value);
  return `${Math.abs(v).toFixed(digits).replace(/\.0$/, "")}%`;
}

/** "전주 대비 12% 늘었습니다" 형태 */
function changePhrase(value: number, up = "늘었", down = "줄었") {
  const v = n(value);
  if (Math.abs(v) < 0.5) return "거의 같은 수준입니다";
  return `${sayPct(v)} ${v > 0 ? up : down}습니다`;
}

function joinKo(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")}, 그리고 ${items[items.length - 1]}`;
}

/** 화면 표시 문장 → TTS용 문장 (기호를 읽기 좋게) */
export function toSpeech(line: string) {
  return line
    .replace(/오프라인_/g, "")
    .replace(/(\d{1,2})\/(\d{1,2})/g, "$1월 $2일")
    .replace(/%/g, "퍼센트")
    .replace(/TOP\s?(\d+)/gi, "탑 $1")
    .replace(/\bTOP\b/gi, "탑")
    .replace(/\bRT\b/g, "알티")
    .replace(/~/g, "부터 ")
    .replace(/[·•]/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function kstToday() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() };
}

function monthPaceChapter(monthSales: number, monthTarget: number, elapsedDays: number, label: string): BriefingChapter | null {
  if (monthSales <= 0) return null;
  const { y, m, d } = kstToday();
  const daysInMonth = new Date(y, m, 0).getDate();
  const lines: string[] = [];
  if (monthTarget > 0) {
    const r = (monthSales / monthTarget) * 100;
    const timeShare = (Math.max(0, elapsedDays) / daysInMonth) * 100;
    lines.push(`이번 달 누적 매출은 ${sayWon(monthSales)}으로, 월 목표 ${sayWon(monthTarget)}의 ${sayPct(r)}를 채웠습니다.`);
    if (elapsedDays > 0) {
      const gap = r - timeShare;
      lines.push(
        Math.abs(gap) < 3
          ? `한 달 중 ${sayPct(timeShare, 0)}가 지난 시점이라 목표 페이스와 거의 맞게 가고 있습니다.`
          : gap > 0
            ? `한 달 중 ${sayPct(timeShare, 0)}가 지난 시점이라, 목표 페이스보다 ${sayPct(gap, 0)}포인트 앞서 있습니다.`
            : `한 달 중 ${sayPct(timeShare, 0)}가 지난 시점이라, 목표 페이스보다 ${sayPct(gap, 0)}포인트 뒤처져 있습니다.`
      );
    }
    const remainDays = Math.max(1, daysInMonth - d + 1);
    const remain = monthTarget - monthSales;
    if (remain > 0) {
      const need = remain / remainDays;
      const avg = elapsedDays > 0 ? monthSales / elapsedDays : 0;
      lines.push(`목표까지 ${sayWon(remain)} 남았고, 남은 ${remainDays}일 동안 하루 평균 ${sayWon(need)}씩 팔아야 합니다.`);
      if (avg > 0) {
        const ratio = need / avg;
        lines.push(
          ratio <= 1
            ? `지금까지 하루 평균이 ${sayWon(avg)}이라, 이 흐름만 유지해도 달성 가능합니다.`
            : ratio >= 2
              ? `지금까지 하루 평균은 ${sayWon(avg)}이라, 남은 기간은 평소의 ${ratio.toFixed(1).replace(/\.0$/, "")}배를 팔아야 해서 쉽지 않은 상황입니다.`
              : `지금까지 하루 평균은 ${sayWon(avg)}이라, 남은 기간은 평소보다 ${sayPct((ratio - 1) * 100, 0)} 더 팔아야 합니다.`
        );
      }
    } else {
      lines.push(`이미 월 목표를 넘겼습니다. 초과분 ${sayWon(-remain)}을 더 키워보면 좋겠습니다.`);
    }
  } else {
    lines.push(`이번 달 누적 매출은 ${sayWon(monthSales)}입니다.`);
  }
  return { key: "month", title: `이번 달 진척 (${label})`, icon: "📅", lines };
}

// ───────────────────────── 일간 ─────────────────────────

export function buildDailyBriefing(input: {
  totals: any;
  coreRows: any[];
  shopRows: any[];
  detail?: any; // /api/daily-sales 결과 (topProducts/topChannels/stockoutRisk/sourceDate)
}): BriefingChapter[] {
  const { totals, coreRows, detail } = input;
  const chapters: BriefingChapter[] = [];
  const daySales = n(totals.daySales);
  const dayTarget = n(totals.dayTarget);
  const dayRate = n(totals.dayRate);
  const dateText = detail?.sourceDate ? `${String(detail.sourceDate).replace(/^(\d{4})-?(\d{2})-?(\d{2}).*$/, (_m, _y, mm, dd) => `${Number(mm)}월 ${Number(dd)}일`)}` : "어제";

  // 1. 한줄 요약
  const head: string[] = [];
  if (daySales > 0) {
    head.push(`${dateText} 오프라인 전체 매출은 ${sayWon(daySales)}입니다.`);
    if (dayTarget > 0) {
      head.push(
        dayRate >= 100
          ? `일 목표 ${sayWon(dayTarget)}을 넘겨 ${sayPct(dayRate)} 달성한, 좋은 하루였습니다.`
          : dayRate >= 85
            ? `일 목표 ${sayWon(dayTarget)} 대비 ${sayPct(dayRate)}로, 목표에 거의 근접했습니다.`
            : `일 목표 ${sayWon(dayTarget)} 대비 ${sayPct(dayRate)}로, 목표에는 ${sayWon(dayTarget - daySales)} 못 미쳤습니다.`
      );
    }
    head.push(`전주 같은 요일과 비교하면 ${changePhrase(n(totals.dayChange))}.`);
  } else {
    head.push("아직 집계된 일 매출이 없습니다. 데이터 새로고침 후 다시 들어주세요.");
  }
  chapters.push({ key: "headline", title: "한 줄 요약", icon: "🎯", lines: head, summary: true });

  // 2. 월 진척 (전일 기준이라 경과일 = 오늘 날짜 - 1)
  const { d } = kstToday();
  const month = monthPaceChapter(n(totals.monthSales), n(totals.monthTarget), d - 1, "전일까지");
  if (month) chapters.push({ ...month, summary: true });

  // 3. 매장
  const sold = coreRows.filter((r) => n(r.daySales) > 0);
  const storeLines: string[] = [];
  if (sold.length) {
    const top = [...sold].sort((a, b) => n(b.daySales) - n(a.daySales)).slice(0, 3);
    storeLines.push(`매출 상위 매장은 ${joinKo(top.map((r) => `${r.storeName} ${sayWon(r.daySales)}`))}입니다.`);
    const withTarget = sold.filter((r) => n(r.dayTarget) > 0);
    if (withTarget.length) {
      const hit = withTarget.filter((r) => n(r.daySales) >= n(r.dayTarget));
      storeLines.push(`일 목표를 달성한 매장은 ${withTarget.length}곳 중 ${hit.length}곳입니다.`);
      const low = [...withTarget].sort((a, b) => n(a.daySales) / n(a.dayTarget) - n(b.daySales) / n(b.dayTarget))[0];
      if (low && n(low.daySales) < n(low.dayTarget) * 0.7) {
        storeLines.push(`목표 대비 가장 아쉬운 곳은 ${euro(low.storeName)}, 달성률 ${sayPct((n(low.daySales) / n(low.dayTarget)) * 100, 0)}에 그쳤습니다.`);
      }
    }
    const comparable = sold.filter((r) => n(r.compareDaySales) > 0);
    if (comparable.length >= 2) {
      const byChange = [...comparable].sort((a, b) => n(b.dayChangeRate) - n(a.dayChangeRate));
      const best = byChange[0];
      const worst = byChange[byChange.length - 1];
      if (n(best.dayChangeRate) > 0) storeLines.push(`전주 같은 요일보다 가장 많이 오른 곳은 ${best.storeName}, ${sayPct(best.dayChangeRate, 0)} 상승입니다.`);
      if (n(worst.dayChangeRate) < 0) storeLines.push(`가장 많이 빠진 곳은 ${worst.storeName}, ${sayPct(worst.dayChangeRate, 0)} 하락입니다.`);
    }
  }
  if (storeLines.length) chapters.push({ key: "stores", title: "매장 흐름", icon: "🏬", lines: storeLines });

  // 4. 상품
  const products = (detail?.topProducts || []).filter((p: any) => n(p.dailySales) > 0);
  const productLines: string[] = [];
  if (products.length) {
    const top = products.slice(0, 3);
    productLines.push(`가장 많이 팔린 상품은 ${joinKo(top.map((p: any, i: number) => `${i + 1}위 ${p.productName} ${Math.round(n(p.dailySales))}장`))}입니다.`);
    const byAmount = [...products].sort((a: any, b: any) => n(b.dailyAmount) - n(a.dailyAmount))[0];
    if (byAmount && byAmount !== top[0]) productLines.push(`금액 기준으로는 ${iga(byAmount.productName)} ${sayWon(byAmount.dailyAmount)}으로 가장 컸습니다.`);
    if (n(detail?.activeProducts) > 0) productLines.push(`이날 판매된 품번은 모두 ${Math.round(n(detail.activeProducts))}개입니다.`);
  }
  if (productLines.length) chapters.push({ key: "products", title: "잘 팔린 상품", icon: "👕", lines: productLines });

  // 5. 결품 위험
  const risks = (detail?.stockoutRisk || []).slice(0, 3);
  if (risks.length) {
    chapters.push({
      key: "risk",
      title: "결품 위험",
      icon: "⚠️",
      lines: [
        `재고가 이틀치 판매량도 안 남은 상품이 ${(detail?.stockoutRisk || []).length}개 있습니다.`,
        `${risks.length > 1 ? "특히 " : ""}${joinKo(risks.map((p: any) => `${eun(p.productName)} 하루 ${Math.round(n(p.dailySales))}장 팔리는데 재고 ${Math.round(n(p.stock))}장`))}입니다.`,
      ],
    });
  }

  // 6. 오늘 할 일
  const actions: string[] = [];
  if (risks[0]) actions.push(`${risks[0].productName} 재고 보충이나 RT 이관을 먼저 확인해 주세요.`);
  const worstStore = coreRows.filter((r) => n(r.compareDaySales) > 0 && n(r.daySales) > 0).sort((a, b) => n(a.dayChangeRate) - n(b.dayChangeRate))[0];
  if (worstStore && n(worstStore.dayChangeRate) <= -20) actions.push(`${eun(worstStore.storeName)} 하락폭이 커서, 재고·진열·인력 상황을 매장과 통화로 점검해 보세요.`);
  if (products[0]) actions.push(`${eun(products[0].productName)} 오늘도 전면 진열을 유지하고 사이즈 재고를 확인해 주세요.`);
  if (n(totals.monthTarget) > n(totals.monthSales) && d > 1) {
    const { y, m } = kstToday();
    const remainDays = Math.max(1, new Date(y, m, 0).getDate() - d + 1);
    const need = (n(totals.monthTarget) - n(totals.monthSales)) / remainDays;
    const avg = n(totals.monthSales) / (d - 1);
    if (avg > 0 && need > avg * 1.15) actions.push(`월 목표 달성을 위해 남은 기간 하루 ${sayWon(need - avg)}씩 추가 매출이 필요합니다. 주말 판촉을 검토해 보세요.`);
  }
  if (actions.length) chapters.push({ key: "actions", title: "오늘 할 일", icon: "✅", lines: actions.slice(0, 4).map((a, i) => `${i + 1}. ${a}`), summary: true });

  return chapters;
}

// ───────────────────────── 주간 ─────────────────────────

export function buildWeeklyBriefing(input: {
  totals: any;
  coreRows: any[];
  shopRows: any[];
  weekly: any;
  targetAvailable: boolean;
  periodText?: string;
}): BriefingChapter[] {
  const { totals, coreRows, shopRows, weekly, targetAvailable } = input;
  const chapters: BriefingChapter[] = [];
  const weekSales = n(totals.weekSales);

  // 1. 한줄 요약
  const head: string[] = [];
  if (weekSales > 0) {
    head.push(`${input.periodText ? `${input.periodText} ` : "지난주 "}오프라인 전체 주간 매출은 ${sayWon(weekSales)}입니다.`);
    head.push(`전주보다 ${changePhrase(n(totals.weekChange))}.`);
    if (targetAvailable && n(totals.weekTarget) > 0) {
      const r = n(totals.weekRate);
      head.push(
        r >= 100
          ? `주간 목표 ${sayWon(totals.weekTarget)}을 ${sayPct(r)} 달성해 목표를 넘겼습니다.`
          : `주간 목표 ${sayWon(totals.weekTarget)} 대비 ${sayPct(r)}로, ${sayWon(n(totals.weekTarget) - weekSales)}이 부족했습니다.`
      );
    }
  } else {
    head.push("아직 집계된 주간 매출이 없습니다. 실시간 갱신 후 다시 들어주세요.");
  }
  chapters.push({ key: "headline", title: "한 줄 요약", icon: "🎯", lines: head, summary: true });

  // 2. 월 진척 — 주간 화면은 "오늘까지"가 아니라 집계 기준이라 경과일은 오늘 날짜 - 1
  const { d } = kstToday();
  const month = monthPaceChapter(n(totals.monthSales), n(totals.monthTarget), d - 1, "누적");
  if (month) chapters.push(month);

  // 3. 매장
  const sold = coreRows.filter((r) => n(r.weekSales) > 0);
  const storeLines: string[] = [];
  if (sold.length) {
    const top = [...sold].sort((a, b) => n(b.weekSales) - n(a.weekSales));
    storeLines.push(`매출 1위는 ${top[0].storeName} ${sayWon(top[0].weekSales)}, 2위는 ${top[1] ? `${top[1].storeName} ${sayWon(top[1].weekSales)}` : "없음"}입니다.`);
    const comparable = sold.filter((r) => n(r.compareWeekSales) > 0);
    const up = comparable.filter((r) => n(r.weekSales) > n(r.compareWeekSales)).length;
    if (comparable.length) storeLines.push(`핵심 매장 ${comparable.length}곳 중 ${up}곳이 전주보다 올랐고, ${comparable.length - up}곳은 내려갔습니다.`);
    const byChange = [...comparable].sort((a, b) => n(b.weekChangeRate) - n(a.weekChangeRate));
    const good = byChange.filter((r) => n(r.weekChangeRate) > 0).slice(0, 3);
    const bad = [...byChange].reverse().filter((r) => n(r.weekChangeRate) < 0).slice(0, 3);
    if (good.length) storeLines.push(`호조 매장은 ${joinKo(good.map((r) => `${r.storeName} ${sayPct(r.weekChangeRate, 0)} 상승`))}입니다.`);
    if (bad.length) storeLines.push(`부진 매장은 ${joinKo(bad.map((r) => `${r.storeName} ${sayPct(r.weekChangeRate, 0)} 하락`))}입니다.`);
  }
  if (storeLines.length) chapters.push({ key: "stores", title: "매장 흐름", icon: "🏬", lines: storeLines, summary: true });

  // 4. 상품
  const products = (weekly?.companyTopProducts || []).filter((p: any) => n(p.weekAmount) > 0);
  const productLines: string[] = [];
  if (products.length) {
    const top = products.slice(0, 3);
    productLines.push(`전사 매출 TOP3는 ${joinKo(top.map((p: any, i: number) => `${i + 1}위 ${p.productName} ${sayWon(p.weekAmount)}`))}입니다.`);
    const t1 = top[0];
    if (n(t1.prevAmount) > 0) productLines.push(`1위 ${eun(t1.productName)} 전주보다 ${changePhrase(n(t1.amountChangeRate))}. 판매수량은 ${Math.round(n(t1.weekNet))}장입니다.`);
    const conc = n(weekly?.top10Concentration);
    if (conc > 0) {
      productLines.push(
        conc >= 35
          ? `TOP10 상품이 전체 매출의 ${sayPct(conc, 0)}를 차지해, 주력 상품 의존도가 높은 편입니다. 후속 상품 육성이 필요합니다.`
          : conc >= 20
            ? `TOP10 상품 비중은 ${sayPct(conc, 0)}로, 주력과 기타 상품이 균형 있게 팔리고 있습니다.`
            : `TOP10 상품 비중은 ${sayPct(conc, 0)}로 낮아서, 확실한 히트 상품이 아직 없는 주였습니다.`
      );
    }
    const risers = products.slice(0, 20).filter((p: any) => n(p.prevAmount) > 0 && n(p.amountChangeRate) >= 30).sort((a: any, b: any) => n(b.amountChangeRate) - n(a.amountChangeRate));
    if (risers[0] && risers[0] !== t1) productLines.push(`TOP20 중 가장 가파르게 오른 상품은 ${euro(risers[0].productName)}, 전주보다 ${sayPct(risers[0].amountChangeRate, 0)} 늘었습니다.`);
    const fallers = products.slice(0, 20).filter((p: any) => n(p.prevAmount) > 0 && n(p.amountChangeRate) <= -20).sort((a: any, b: any) => n(a.amountChangeRate) - n(b.amountChangeRate));
    if (fallers[0]) productLines.push(`반대로 ${eun(fallers[0].productName)} TOP20 안에 있지만 전주보다 ${sayPct(fallers[0].amountChangeRate, 0)} 줄었습니다.`);
    const entrants = weekly?.newTop10Entrants || [];
    if (entrants.length) productLines.push(`이번 주 TOP10에 새로 들어온 상품은 ${joinKo(entrants.slice(0, 3).map((p: any) => p.productName))}입니다.`);
  }
  if (productLines.length) chapters.push({ key: "products", title: "상품 흐름", icon: "👕", lines: productLines, summary: true });

  // 5. 위탁
  const shops = shopRows.filter((r) => n(r.weekSales) > 0);
  if (shops.length) {
    const top = shops[0];
    const shopTotal = shops.reduce((s, r) => s + n(r.weekSales), 0);
    const lines = [`위탁 채널 주간 매출은 ${sayWon(shopTotal)}이고, 그중 ${iga(top.storeName)} ${sayWon(top.weekSales)}으로 가장 컸습니다.`];
    const prevTotal = shops.reduce((s, r) => s + n(r.compareWeekSales), 0);
    if (prevTotal > 0) lines.push(`위탁 전체로는 전주보다 ${changePhrase(rate(shopTotal, prevTotal))}.`);
    chapters.push({ key: "shop", title: "위탁 채널", icon: "🛍️", lines });
  }

  // 6. 기존 AI 브리핑
  // 위 챕터에서 이미 읽은 내용(전체 증감/호조·부진 매장/전사 TOP)은 겹치지 않게 뺍니다.
  const dupPrefix = /^(핵심 매장 기준 주간 매출|호조 매장은|부진 매장은|전사 TOP 상품은)/;
  const ai = (weekly?.aiBriefing || []).filter((x: any) => String(x || "").trim() && !dupPrefix.test(String(x).trim()));
  if (ai.length) chapters.push({ key: "ai", title: "AI 추가 인사이트", icon: "💡", lines: ai.slice(0, 6) });

  // 7. 이번 주 할 일
  const actions: string[] = [];
  const comparable = coreRows.filter((r) => n(r.compareWeekSales) > 0 && n(r.weekSales) > 0);
  const worst = [...comparable].sort((a, b) => n(a.weekChangeRate) - n(b.weekChangeRate))[0];
  const best = [...comparable].sort((a, b) => n(b.weekChangeRate) - n(a.weekChangeRate))[0];
  if (worst && n(worst.weekChangeRate) < -10) actions.push(`${worst.storeName}의 하락 원인을 먼저 확인해 주세요. 매장탭에서 재고 부족과 TOP 상품 사이즈 결품부터 보시면 좋습니다.`);
  if (best && n(best.weekChangeRate) > 10) actions.push(`${best.storeName}의 호조 상품은 재고가 빠지기 전에 추가 이관을 검토해 주세요.`);
  if (products[0]) {
    const p = products[0];
    const weeks = n(p.offlineWeeks);
    actions.push(
      weeks > 0 && weeks < 3
        ? `1위 ${eun(p.productName)} 매장 재고가 약 ${weeks.toFixed(1)}주치뿐이라, 물류 추가 투입이 시급합니다.`
        : `1위 ${eun(p.productName)} 전 매장 전면 진열과 사이즈 재고를 유지해 주세요.`
    );
  }
  if (actions.length) chapters.push({ key: "actions", title: "이번 주 할 일", icon: "✅", lines: actions.map((a, i) => `${i + 1}. ${a}`), summary: true });

  return chapters;
}
