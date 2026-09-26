"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import NavTabs from "@/components/NavTabs";

// MARK 2026-09-24: "글씨가 너무많아서 한판에 안보여서" 요청 — 표 안 금액이 다 9자리라
// 한 화면에 다 안 들어와서, 원 단위 대신 천원 단위로 줄여서 표시합니다(234,555,000원 →
// 234,555). 정확한 원 단위가 필요하면 나중에 다시 켤 수 있게 여기 한 군데만 고치면 됩니다.
function won(n: number) {
  return `${Math.round((n || 0) / 1000).toLocaleString("ko-KR")}`;
}

function wonOrDash(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return won(n);
}

function pct(n: number | null) {
  if (n === null || !Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(0)}%`;
}

function growthPct(n: number | null) {
  if (n === null || !Number.isFinite(n)) return "신규";
  const v = (n * 100).toFixed(1);
  return `${n >= 0 ? "+" : ""}${v}%`;
}

function growthColor(n: number | null) {
  if (n === null || !Number.isFinite(n)) return "text-slate-400";
  return n >= 0 ? "text-blue-600" : "text-rose-600";
}

// MARK 2026-09-25: 실적 금액을 같은 열(일간/주간/이번달) 안에서 상대적으로 비교해
// 빨강(낮음)~초록(높음) 그라데이션 배경을 입히는 헬퍼. min===max(매장이 1개뿐이거나 전부
// 같은 값)면 색을 안 입혀서 의미 없는 붉은색/초록색이 나오지 않게 합니다.
function heatBg(value: number, range: { min: number; max: number }): CSSProperties | undefined {
  if (!Number.isFinite(value) || range.max <= range.min) return undefined;
  const t = Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
  const hue = t * 120; // 0=빨강 ... 120=초록
  return { backgroundColor: `hsl(${hue.toFixed(0)}, 72%, 90%)` };
}

// MARK 2026-09-25: 표 전체에서 반복되는 셀 클래스 — 줄바꿈으로 행 높이가 들쭉날쭉해지는 걸
// 막기 위해 항상 whitespace-nowrap을 쓰고, 숫자는 tabular-nums로 자릿수 폭을 고정합니다
// ("열간격/행간격이 깨지지 않고 일정하게" 요청).
const TD_NUM = "whitespace-nowrap px-2 py-2 text-right tabular-nums";
const TH_NUM = "whitespace-nowrap px-2 py-1 text-right font-bold tabular-nums";

// MARK 2026-09-24: "이름을 짧게 줄여서 보여줄래?" 요청 — 모바일 표 폭을 줄이기 위해 매장명을
// 지정해주신 짧은 이름으로 바꿔서 보여줍니다. lib/dataBuilder.ts의 normalizeStoreKey()와
// 같은 규칙으로 정규화한 뒤 매칭해서, 업로드 원본 표기가 "오프라인_" 접두어나 공백/점 유무로
// 조금 달라도 잘 잡히게 했습니다. 목록에 없는 매장은 원래 이름을 그대로 보여줘요(화이트리스트에
// 새 매장이 추가되면 여기도 같이 추가해주면 됩니다).
function normalizeStoreKeyFE(storeName: string) {
  const raw = String(storeName || "").trim();
  return raw
    .replace(/^오프라인[_\s-]*/i, "")
    .replace(/점$/g, "")
    .replace(/[\s_\-·.()]/g, "")
    .toLowerCase();
}

const STORE_SHORT_NAMES: Record<string, string> = {
  "성수플래그십": "성수",
  "신사플래그십": "신사",
  "한남플래그십": "한남",
  "서울숲플래그십": "서울숲",
  "포시즌아울렛신사": "포시즌",
  "신세계센텀시티": "센텀",
  "신세계광주": "광주",
  "롯데백화점평촌": "평촌",
  "롯데백화점광복": "광복",
  "신세계의정부": "의정부",
  "신세계대전": "대전",
  "현대백화점신촌": "신촌",
  "lf스퀘어광양": "광양",
  "아이파크몰용산": "용산",
  "스타필드고양": "고양",
  "현대커넥트청주": "청주",
  "스타필드빌리지운정": "운정",
  "타임스퀘어영등포": "영등포",
  "롯데아울렛서울역": "서울역",
  "현대아울렛송도": "송도",
  "롯데아울렛김해": "김해",
  "롯데아울렛동부산": "동부산",
  "현대아울렛남양주": "남양주",
  "팩토리아울렛용인": "용인",
  "롯데면세": "롯데 면세",
  "무신사강남": "무신사(강남)",
  "무신사대구": "무신사(대구)",
  "무신사백&캡클럽서울숲": "무신사(서울숲)",
  "무신사성수": "무신사(성수)",
  "무신사수원": "무신사(수원)",
  "무신사은평": "무신사(은평)",
  "무신사홍대": "무신사(홍대)",
  "무신사송도": "무신사(송도)",
  "한컬렉션": "한컬렉션",
};

function shortStoreName(storeName: string): string {
  const key = normalizeStoreKeyFE(storeName);
  return STORE_SHORT_NAMES[key] || storeName;
}

// MARK 2026-09-25: 기간마다 목표/실적 필드 이름이 다릅니다(일간/주간/전월/기간비교는
// target·actual, 이번달은 periodTarget·actual, 연간은 ytdTarget·ytdActual) — 백엔드
// (lib/dataBuilder.ts StoreSalesSummaryRow)와 정확히 같은 이름을 씁니다. 공통 필드만
// PeriodCommon으로 묶고, target/actual류는 각 기간 타입에서 실제 이름 그대로 선언합니다.
type PeriodCommon = {
  achievementRate: number | null;
  avgReceiptAmount: number | null;
  receiptCount: number;
  prevYearAmount: number;
  prevYearReceiptCount: number;
  prevYearAvgReceiptAmount: number | null;
  yoyGrowthRate: number | null;
};

type StoreSalesSummaryRow = {
  storeName: string;
  channelGroup: string;
  channelCode: string;
  daily: PeriodCommon & { date: string; target: number; actual: number; qty: number };
  weekly: PeriodCommon & { start: string; end: string; target: number; actual: number; prevWeekAmount: number; wowGrowthRate: number | null };
  monthly: PeriodCommon & { month: string; periodTarget: number; actual: number; progressRate: number; fullMonthTarget: number };
  prevMonth: PeriodCommon & { month: string; target: number; actual: number };
  annual: PeriodCommon & { year: number; ytdTarget: number; ytdActual: number; progressRate: number };
  customPeriod?: PeriodCommon & { start: string; end: string; target: number; actual: number; qty: number; prevYearStart: string; prevYearEnd: string };
};

// MARK 2026-09-25: "맨 상단에 매출 총합" 요청 — 지금 화면에 보이는(필터 적용된) 매장들을
// 합산한 가상의 "합계" 줄을 만듭니다. 객단가는 매장별 객단가를 단순평균하면 안 되고(매장마다
// 거래 규모가 다름) 반드시 "합계 매출금액 / 합계 영수건수"로 다시 계산해야 정확하므로, 매장별
// receiptCount를 그대로 합산해서 씁니다(전년 객단가도 같은 이유로 전년 영수건수를 합산해서
// 다시 계산). 달성률/전년比/전주比도 같은 이유로 비율의 평균이 아니라 합계끼리 다시 나눠서
// 계산합니다.
type PeriodAgg = {
  target: number;
  actual: number;
  achievementRate: number | null;
  avgReceiptAmount: number | null;
  receiptCount: number;
  prevYearAmount: number;
  prevYearReceiptCount: number;
  prevYearAvgReceiptAmount: number | null;
  yoyGrowthRate: number | null;
  prevWeekAmount: number;
  wowGrowthRate: number | null;
  qty: number;
};

type AggregatableRow = PeriodCommon & { target: number; actual: number; prevWeekAmount?: number; qty?: number };

function aggregatePeriod(rows: AggregatableRow[]): PeriodAgg {
  let target = 0;
  let actual = 0;
  let receiptCount = 0;
  let prevYearAmount = 0;
  let prevYearReceiptCount = 0;
  let prevWeekAmount = 0;
  let qty = 0;
  for (const r of rows) {
    target += r.target || 0;
    actual += r.actual || 0;
    receiptCount += r.receiptCount || 0;
    prevYearAmount += r.prevYearAmount || 0;
    prevYearReceiptCount += r.prevYearReceiptCount || 0;
    prevWeekAmount += r.prevWeekAmount || 0;
    qty += r.qty || 0;
  }
  const achievementRate = target ? actual / target : null;
  const avgReceiptAmount = receiptCount > 0 ? actual / receiptCount : null;
  const prevYearAvgReceiptAmount = prevYearReceiptCount > 0 ? prevYearAmount / prevYearReceiptCount : null;
  const yoyGrowthRate = prevYearAmount ? (actual - prevYearAmount) / prevYearAmount : actual > 0 ? null : 0;
  const wowGrowthRate = prevWeekAmount ? (actual - prevWeekAmount) / prevWeekAmount : actual > 0 ? null : 0;
  return {
    target,
    actual,
    achievementRate,
    avgReceiptAmount,
    receiptCount,
    prevYearAmount,
    prevYearReceiptCount,
    prevYearAvgReceiptAmount,
    yoyGrowthRate,
    prevWeekAmount,
    wowGrowthRate,
    qty,
  };
}

function buildTotalRow(rows: StoreSalesSummaryRow[], label: string): StoreSalesSummaryRow | null {
  if (!rows.length) return null;
  const daily = aggregatePeriod(rows.map((s) => s.daily));
  const weekly = aggregatePeriod(rows.map((s) => s.weekly));
  const monthly = aggregatePeriod(rows.map((s) => ({ ...s.monthly, target: s.monthly.periodTarget })));
  const prevMonth = aggregatePeriod(rows.map((s) => s.prevMonth));
  const annual = aggregatePeriod(rows.map((s) => ({ ...s.annual, target: s.annual.ytdTarget, actual: s.annual.ytdActual })));
  const customSource = rows.map((s) => s.customPeriod).filter((c): c is NonNullable<typeof c> => !!c);
  const customPeriod = customSource.length ? aggregatePeriod(customSource) : null;

  return {
    storeName: label,
    channelGroup: "",
    channelCode: "",
    daily: {
      date: rows[0].daily.date,
      target: daily.target,
      actual: daily.actual,
      achievementRate: daily.achievementRate,
      qty: daily.qty,
      avgReceiptAmount: daily.avgReceiptAmount,
      receiptCount: daily.receiptCount,
      prevYearAmount: daily.prevYearAmount,
      prevYearReceiptCount: daily.prevYearReceiptCount,
      prevYearAvgReceiptAmount: daily.prevYearAvgReceiptAmount,
      yoyGrowthRate: daily.yoyGrowthRate,
    },
    weekly: {
      start: rows[0].weekly.start,
      end: rows[0].weekly.end,
      target: weekly.target,
      actual: weekly.actual,
      achievementRate: weekly.achievementRate,
      avgReceiptAmount: weekly.avgReceiptAmount,
      receiptCount: weekly.receiptCount,
      prevWeekAmount: weekly.prevWeekAmount,
      wowGrowthRate: weekly.wowGrowthRate,
      prevYearAmount: weekly.prevYearAmount,
      prevYearReceiptCount: weekly.prevYearReceiptCount,
      prevYearAvgReceiptAmount: weekly.prevYearAvgReceiptAmount,
      yoyGrowthRate: weekly.yoyGrowthRate,
    },
    monthly: {
      month: rows[0].monthly.month,
      periodTarget: monthly.target,
      actual: monthly.actual,
      achievementRate: monthly.achievementRate,
      avgReceiptAmount: monthly.avgReceiptAmount,
      receiptCount: monthly.receiptCount,
      progressRate: rows[0].monthly.progressRate,
      prevYearAmount: monthly.prevYearAmount,
      prevYearReceiptCount: monthly.prevYearReceiptCount,
      prevYearAvgReceiptAmount: monthly.prevYearAvgReceiptAmount,
      yoyGrowthRate: monthly.yoyGrowthRate,
      fullMonthTarget: rows.reduce((sum, r) => sum + (r.monthly.fullMonthTarget || 0), 0),
    },
    prevMonth: {
      month: rows[0].prevMonth.month,
      target: prevMonth.target,
      actual: prevMonth.actual,
      achievementRate: prevMonth.achievementRate,
      avgReceiptAmount: prevMonth.avgReceiptAmount,
      receiptCount: prevMonth.receiptCount,
      prevYearAmount: prevMonth.prevYearAmount,
      prevYearReceiptCount: prevMonth.prevYearReceiptCount,
      prevYearAvgReceiptAmount: prevMonth.prevYearAvgReceiptAmount,
      yoyGrowthRate: prevMonth.yoyGrowthRate,
    },
    annual: {
      year: rows[0].annual.year,
      ytdTarget: annual.target,
      ytdActual: annual.actual,
      achievementRate: annual.achievementRate,
      avgReceiptAmount: annual.avgReceiptAmount,
      receiptCount: annual.receiptCount,
      progressRate: rows[0].annual.progressRate,
      prevYearAmount: annual.prevYearAmount,
      prevYearReceiptCount: annual.prevYearReceiptCount,
      prevYearAvgReceiptAmount: annual.prevYearAvgReceiptAmount,
      yoyGrowthRate: annual.yoyGrowthRate,
    },
    ...(customPeriod && rows[0].customPeriod
      ? {
          customPeriod: {
            start: rows[0].customPeriod.start,
            end: rows[0].customPeriod.end,
            target: customPeriod.target,
            actual: customPeriod.actual,
            achievementRate: customPeriod.achievementRate,
            qty: customPeriod.qty,
            avgReceiptAmount: customPeriod.avgReceiptAmount,
            receiptCount: customPeriod.receiptCount,
            prevYearStart: rows[0].customPeriod.prevYearStart,
            prevYearEnd: rows[0].customPeriod.prevYearEnd,
            prevYearAmount: customPeriod.prevYearAmount,
            prevYearReceiptCount: customPeriod.prevYearReceiptCount,
            prevYearAvgReceiptAmount: customPeriod.prevYearAvgReceiptAmount,
            yoyGrowthRate: customPeriod.yoyGrowthRate,
          },
        }
      : {}),
  };
}

type CustomPeriodInfo = { start: string; end: string; prevYearStart: string; prevYearEnd: string } | null;

// MARK 2026-09-25: "점포별로 실적순으로 나열" 요청 — 기본(채널구분→점포코드) 외에
// 일간/주간/이번달 실적 기준 내림차순 정렬을 고를 수 있게 합니다.
type SortMode = "default" | "daily" | "weekly" | "monthly";
const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "default", label: "기본순서" },
  { key: "daily", label: "일간실적순" },
  { key: "weekly", label: "주간실적순" },
  { key: "monthly", label: "이번달실적순" },
];

export default function StoreSalesSummaryDashboard() {
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState("");
  const [stores, setStores] = useState<StoreSalesSummaryRow[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [groupFilter, setGroupFilter] = useState("전체");
  const [sortMode, setSortMode] = useState<SortMode>("default");

  // MARK 2026-09-22: "일간" 블록 날짜선택 + 커스텀 기간비교 조회.
  const [dailyDate, setDailyDate] = useState(""); // 빈 값 = 최신 날짜(기본값)
  const [rangeStartInput, setRangeStartInput] = useState("");
  const [rangeEndInput, setRangeEndInput] = useState("");
  const [customPeriod, setCustomPeriod] = useState<CustomPeriodInfo>(null);
  const [rangeError, setRangeError] = useState("");

  // MARK 2026-09-23: 객단가(매출금액/영수건수) — 기본은 접어두고 토글로 펼쳐볼 수 있게.
  // MARK 2026-09-25: "전년 객단가도 비교(이것도 접히게)" — 같은 토글에 묶어서 같이 접고 폅니다.
  const [showAvgReceipt, setShowAvgReceipt] = useState(false);

  // MARK 2026-09-23: 구글드라이브에 올려둔 "전체매출" 파일을 수동으로 지금 바로 가져오기
  // (자동으로는 매일 새벽 cron이 같은 걸 호출함 — app/api/sales-summary-drive-import).
  const [driveImporting, setDriveImporting] = useState(false);
  const [driveMessage, setDriveMessage] = useState("");
  const [driveError, setDriveError] = useState("");

  // MARK 2026-09-24: "기간을 따로 안 고르면 기본으로 이번주 월요일~어제가 보이면 좋겠다"
  // 요청 — 서버가 이제 rangeStart/rangeEnd를 아예 안 보내면 기본으로 이번주 기간비교를
  // 계산해서 내려줍니다. noRange 옵션은 서버에도 남겨뒀지만(나중에 "완전히 끄기"가 필요할
  // 수도 있어서) 지금 프론트에서는 안 씁니다 — "이번주(기본)로" 버튼은 직접 고른 값만
  // 지우고 다시 기본값이 보이게 하는 용도라 그냥 params 없이 다시 불러오면 됩니다.

  useEffect(() => {
    load();
  }, []);

  async function load(params?: { date?: string; rangeStart?: string; rangeEnd?: string; noRange?: boolean }) {
    setLoading(true);
    setRangeError("");
    try {
      const qs = new URLSearchParams();
      if (params?.date) qs.set("date", params.date);
      if (params?.rangeStart && params?.rangeEnd) {
        qs.set("rangeStart", params.rangeStart);
        qs.set("rangeEnd", params.rangeEnd);
      } else if (params?.noRange) {
        qs.set("noRange", "1");
      }
      const url = qs.toString() ? `/api/sales-summary?${qs}` : "/api/sales-summary";
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setAsOfDate(json.asOfDate || "");
        setDailyDate(json.dailyDate || "");
        setStores(json.stores || []);
        setMeta(json.meta || null);
        setCustomPeriod(json.customPeriod || null);
        // 서버가 내려준 기간(직접 고른 값이든 기본값이든)을 항상 입력칸에 반영해서
        // 지금 어떤 기간이 보이는지 표시해줍니다.
        if (json.customPeriod) {
          setRangeStartInput(json.customPeriod.start || "");
          setRangeEndInput(json.customPeriod.end || "");
        }
        if (params?.rangeStart && params?.rangeEnd && !json.customPeriod) {
          setRangeError("기간 형식을 확인해주세요(시작일이 종료일보다 늦을 수 없어요).");
        }
      }
    } catch {
      // 처음 쓰는 경우 데이터가 없을 수 있음 — 조용히 무시
    } finally {
      setLoading(false);
    }
  }

  function runRangeQuery() {
    if (!rangeStartInput || !rangeEndInput) {
      setRangeError("시작일과 종료일을 모두 골라주세요.");
      return;
    }
    load({ date: dailyDate, rangeStart: rangeStartInput, rangeEnd: rangeEndInput });
  }

  function clearRangeQuery() {
    setRangeError("");
    // rangeStart/rangeEnd를 아예 안 보내면 서버가 기본(이번주 월~어제)을 다시 계산해서
    // 내려주고, load()가 그 값을 입력칸에도 다시 채워줍니다.
    load({ date: dailyDate });
  }

  function onDailyDateChange(next: string) {
    setDailyDate(next);
    load({ date: next, rangeStart: rangeStartInput && rangeEndInput ? rangeStartInput : undefined, rangeEnd: rangeStartInput && rangeEndInput ? rangeEndInput : undefined });
  }

  async function runDriveImport() {
    setDriveImporting(true);
    setDriveError("");
    setDriveMessage("드라이브에서 가져오는 중...");
    try {
      const res = await fetch("/api/sales-summary-drive-import", { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "가져오기 실패");
      setDriveMessage(
        `완료! "${data.driveFile?.name || ""}" 기준 이번 반영 ${data.newRowCount.toLocaleString("ko-KR")}행(${data.newStartDate}~${data.newEndDate}) · ` +
        `누적 ${data.storeCount}개 매장 ${data.rowCount.toLocaleString("ko-KR")}행(${data.startDate}~${data.endDate})`
      );
      await load({
        date: dailyDate || undefined,
        rangeStart: rangeStartInput && rangeEndInput ? rangeStartInput : undefined,
        rangeEnd: rangeStartInput && rangeEndInput ? rangeEndInput : undefined,
      });
    } catch (e: any) {
      setDriveMessage("");
      setDriveError(e?.message || "가져오기 실패");
    } finally {
      setDriveImporting(false);
    }
  }

  const groups = useMemo(() => {
    const set = new Set(stores.map((s) => s.channelGroup).filter(Boolean));
    return ["전체", ...Array.from(set)];
  }, [stores]);

  const filteredStores = groupFilter === "전체" ? stores : stores.filter((s) => s.channelGroup === groupFilter);

  // MARK 2026-09-25: "점포별 실적순 정렬" — 기본은 백엔드가 내려준 순서(채널구분→점포코드)
  // 그대로, 실적순을 고르면 해당 기간 실적(매출금액) 내림차순으로 다시 정렬합니다.
  const sortedStores = useMemo(() => {
    if (sortMode === "default") return filteredStores;
    const list = [...filteredStores];
    list.sort((a, b) => {
      const av = sortMode === "daily" ? a.daily.actual : sortMode === "weekly" ? a.weekly.actual : a.monthly.actual;
      const bv = sortMode === "daily" ? b.daily.actual : sortMode === "weekly" ? b.weekly.actual : b.monthly.actual;
      return bv - av;
    });
    return list;
  }, [filteredStores, sortMode]);

  // MARK 2026-09-24: "소계 라벨이 너무 길다(로드샵 소계 (5개) 같은 거)" 피드백으로 라벨을
  // 그냥 구분명만(또는 전체일 땐 "합계") 나오게 짧게 바꿨습니다 — 모바일에서 안 밀려나게.
  const totalRow = useMemo(
    () => buildTotalRow(filteredStores, groupFilter === "전체" ? "합계" : groupFilter),
    [filteredStores, groupFilter]
  );

  // MARK 2026-09-25: 구분별(로드샵/백화점 등) 소계를 만들 때 쓸 그룹 순서 — 백엔드가 이미
  // 채널구분 우선순위로 정렬해서 내려주므로, 원본 stores에서 처음 등장하는 순서를 그대로 쓰면
  // 됩니다(정렬모드로 화면 순서가 바뀌어도 소계 그룹 순서는 항상 이 기준을 씁니다).
  const groupOrder = useMemo(() => {
    const seen: string[] = [];
    for (const s of stores) {
      if (s.channelGroup && !seen.includes(s.channelGroup)) seen.push(s.channelGroup);
    }
    return seen;
  }, [stores]);

  // MARK 2026-09-24: "전체합계 밑에 구분별 매출 합계" — "전체"를 보고 있을 때만 의미가 있어서
  // (이미 특정 구분으로 필터링했으면 총합=그 구분 합계라 중복), groupFilter==="전체"일 때만
  // 구분별 소계 줄을 만듭니다. 라벨은 구분명 그대로만(예: "로드샵") 씁니다.
  const subtotalRows = useMemo(() => {
    if (groupFilter !== "전체") return [] as { group: string; row: StoreSalesSummaryRow }[];
    const out: { group: string; row: StoreSalesSummaryRow }[] = [];
    for (const group of groupOrder) {
      const rows = filteredStores.filter((s) => s.channelGroup === group);
      const row = buildTotalRow(rows, group);
      if (row) out.push({ group, row });
    }
    return out;
  }, [filteredStores, groupOrder, groupFilter]);

  // MARK 2026-09-25: "이대로가면 이번달 착지금액" — 지금까지의 하루 평균 페이스가 월말까지
  // 그대로 이어진다고 가정한 추정치입니다(누적실적 ÷ 이번달 경과율). 이번달 전체 목표가
  // 이미 입력돼 있으면(월말치까지) 착지 기준 달성률도 같이 보여줍니다.
  const landingEstimate = useMemo(() => {
    if (!totalRow || !totalRow.monthly.progressRate) return null;
    const landingAmount = totalRow.monthly.actual / totalRow.monthly.progressRate;
    const fullMonthTarget = totalRow.monthly.fullMonthTarget;
    const landingAchievementRate = fullMonthTarget ? landingAmount / fullMonthTarget : null;
    return { landingAmount, fullMonthTarget, landingAchievementRate, month: totalRow.monthly.month };
  }, [totalRow]);

  // MARK 2026-09-25: "금액 높낮이에 따라 빨강~초록" 요청 — 일간/주간/이번달 실적을 지금
  // 화면에 보이는 매장들 사이에서 상대적으로 비교해 색을 입힙니다(가장 낮은 매장이 빨강,
  // 가장 높은 매장이 초록, 그 사이는 그라데이션). 합계/소계 줄은 스케일을 왜곡하니 제외합니다.
  const heatRanges = useMemo(() => {
    const range = (vals: number[]) => (vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min: 0, max: 0 });
    return {
      daily: range(filteredStores.map((s) => s.daily.actual)),
      weekly: range(filteredStores.map((s) => s.weekly.actual)),
      monthly: range(filteredStores.map((s) => s.monthly.actual)),
    };
  }, [filteredStores]);

  const colSpanPerBlock = showAvgReceipt ? 6 : 4;
  const blockCount = customPeriod ? 6 : 5;
  // MARK 2026-09-24: 구분 열(64px) 삭제 + 매장명 열(150px→64px, 이름을 짧게 줄여서 그만큼
  // 안 필요해짐)만큼 최소폭도 줄였습니다.
  const tableMinWidth = showAvgReceipt ? (customPeriod ? 3250 : 2750) : customPeriod ? 2150 : 1750;

  function PeriodHeaderGroup({ title, bg = "" }: { title: string; bg?: string }) {
    return (
      <th colSpan={colSpanPerBlock} className={`border-l border-slate-700 px-2 py-1 text-center font-black whitespace-nowrap ${bg}`}>
        {title}
      </th>
    );
  }

  function PeriodSubHeaders({ bg = "" }: { bg?: string }) {
    return (
      <>
        <th className={`border-l border-slate-700 ${TH_NUM} ${bg}`}>목표</th>
        <th className={`${TH_NUM} ${bg}`}>실적</th>
        {showAvgReceipt && (
          <>
            <th className={`${TH_NUM} text-indigo-200 ${bg}`}>객단가</th>
            <th className={`${TH_NUM} text-purple-200 ${bg}`}>전년객단가</th>
          </>
        )}
        <th className={`${TH_NUM} ${bg}`}>달성률</th>
        <th className={`${TH_NUM} ${bg}`}>전년比</th>
      </>
    );
  }

  // MARK 2026-09-25: 기간마다 목표/실적 필드 이름이 달라서(이번달=periodTarget, 연간=ytdTarget/
  // ytdActual 등), 호출하는 쪽에서 항상 target/actual로 정규화해서 넘깁니다 — 이 컴포넌트는
  // target/actual만 그대로 씁니다(합계/소계 줄 전용 — 매장별 실적 줄은 히트맵 때문에 직접 작성).
  function PeriodCells({
    p,
    bg = "",
  }: {
    p: PeriodCommon & { target: number; actual: number };
    bg?: string;
  }) {
    return (
      <>
        <td className={`border-t border-l border-slate-100 ${TD_NUM} ${bg}`}>{won(p.target)}</td>
        <td className={`border-t border-slate-100 ${TD_NUM} font-bold ${bg}`}>{won(p.actual)}</td>
        {showAvgReceipt && (
          <>
            <td className={`border-t border-slate-100 ${TD_NUM} text-indigo-600 ${bg}`}>{wonOrDash(p.avgReceiptAmount)}</td>
            <td className={`border-t border-slate-100 ${TD_NUM} text-purple-600 ${bg}`}>{wonOrDash(p.prevYearAvgReceiptAmount)}</td>
          </>
        )}
        <td className={`border-t border-slate-100 ${TD_NUM} ${bg}`}>{pct(p.achievementRate)}</td>
        <td className={`border-t border-slate-100 ${TD_NUM} font-bold ${growthColor(p.yoyGrowthRate)} ${bg}`}>{growthPct(p.yoyGrowthRate)}</td>
      </>
    );
  }

  function AggRowCells({ row, bg }: { row: StoreSalesSummaryRow; bg: string }) {
    return (
      <>
        <PeriodCells p={row.daily} bg={bg} />
        <PeriodCells p={row.weekly} bg={bg} />
        {customPeriod && row.customPeriod && <PeriodCells p={row.customPeriod} bg={bg} />}
        <PeriodCells p={{ ...row.monthly, target: row.monthly.periodTarget }} bg={bg} />
        <PeriodCells p={row.prevMonth} bg={bg} />
        <PeriodCells p={{ ...row.annual, target: row.annual.ytdTarget, actual: row.annual.ytdActual }} bg={bg} />
      </>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <div className="mx-auto max-w-[1600px] px-4 pt-6">
        <NavTabs active="store-sales" />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-slate-400">STORE SALES SUMMARY</p>
            <h1 className="mt-1 text-xl font-black text-slate-900">
              매출 (점포별) <span className="text-xs font-bold text-slate-400">· 금액 단위: 천원</span>
            </h1>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {meta
                ? `마지막 업로드: ${meta.uploadedAt}(${meta.newStartDate || meta.startDate}~${meta.newEndDate || meta.endDate}, ${(meta.newRowCount || 0).toLocaleString("ko-KR")}행) · 누적 ${meta.storeCount}개 매장 · ${meta.startDate}~${meta.endDate}(${meta.rowCount.toLocaleString("ko-KR")}행)`
                : "아직 업로드된 데이터가 없어요"}
            </p>
          </div>

          <div className="flex flex-wrap items-start gap-3">
            {/* MARK 2026-09-25: "오른쪽상단에 이대로가면 월간 착지금액" 요청 — 지금 보이는
                (필터 적용된) 매장 기준, 지금까지의 하루 평균 페이스가 이어진다고 가정한 이번달
                착지 예상 금액. 이번달 전체 목표가 입력돼 있으면 착지 기준 달성률도 같이 표시. */}
            {landingEstimate && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-right">
                <p className="text-[11px] font-black text-emerald-700">이대로가면 {landingEstimate.month.slice(5)}월 착지</p>
                <p className="mt-0.5 text-lg font-black text-emerald-900">{won(landingEstimate.landingAmount)}천원</p>
                {landingEstimate.landingAchievementRate !== null && (
                  <p className="mt-0.5 text-[11px] font-bold text-emerald-600">월목표대비 {pct(landingEstimate.landingAchievementRate)}</p>
                )}
              </div>
            )}

            {/* MARK 2026-09-24: "드라이브에서 가져오기는 버튼만 있으면 되니까 크게 차지할
                필요 없다" 요청 — 카드 통째로 있던 걸 착지금액 카드 옆의 작은 버튼 하나로
                줄였습니다. 결과 메시지는 버튼 밑에 작게 표시합니다. */}
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                disabled={driveImporting}
                onClick={runDriveImport}
                className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40"
              >
                {driveImporting ? "가져오는 중..." : "🔄 드라이브 가져오기"}
              </button>
              {driveMessage && <span className="max-w-[220px] text-right text-[10px] font-bold text-slate-500">{driveMessage}</span>}
              {driveError && <span className="max-w-[220px] text-right text-[10px] font-black text-red-600">⚠ {driveError}</span>}
            </div>

            {/* MARK 2026-09-25: 탭 정리 요청 — 판매전체상/일간/월간을 독립 탭에서 빼서 매출 탭
                안으로 옮기고, 여기서 클릭하면 들어갈 수 있게 바로가기로 둡니다. */}
            <div className="flex flex-wrap gap-2">
              <Link
                href="/schedule"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
              >
                📋 판매전체상 열기
              </Link>
              <Link
                href="/daily"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
              >
                📅 일간 열기
              </Link>
              <Link
                href="/monthly"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
              >
                📆 월간 열기
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-6 rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <p className="text-xs font-black text-slate-700">일간 조회 날짜</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">비워두면 가장 최근 날짜(보통 어제)를 보여줘요.</p>
            <input
              type="date"
              value={dailyDate}
              min={meta?.startDate || undefined}
              max={asOfDate || undefined}
              onChange={(e) => onDailyDateChange(e.target.value)}
              className="mt-2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-700"
            />
          </div>

          <div className="h-10 w-px bg-slate-200" />

          <div>
            <p className="text-xs font-black text-slate-700">기간 비교 조회</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
              기본은 이번주 월요일~어제예요. 다른 기간을 보고 싶으면 시작~끝 날짜를 골라서 조회하면 그 기간 목표달성률과 전년동기 신장률을 같이 볼 수 있어요.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={rangeStartInput}
                min={meta?.startDate || undefined}
                max={asOfDate || undefined}
                onChange={(e) => setRangeStartInput(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-700"
              />
              <span className="text-xs font-bold text-slate-400">~</span>
              <input
                type="date"
                value={rangeEndInput}
                min={meta?.startDate || undefined}
                max={asOfDate || undefined}
                onChange={(e) => setRangeEndInput(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-700"
              />
              <button
                type="button"
                onClick={runRangeQuery}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-black text-white"
              >
                조회
              </button>
              {customPeriod && (
                <button
                  type="button"
                  onClick={clearRangeQuery}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-500"
                >
                  이번주(기본)로
                </button>
              )}
            </div>
            {rangeError && <p className="mt-1 text-[11px] font-bold text-red-600">⚠ {rangeError}</p>}
            {customPeriod && (
              <p className="mt-1 text-[11px] font-bold text-slate-400">
                조회 기간: {customPeriod.start}~{customPeriod.end} · 전년동기: {customPeriod.prevYearStart}~{customPeriod.prevYearEnd}
              </p>
            )}
          </div>
        </div>

        {loading && <p className="mt-6 text-sm font-bold text-slate-400">불러오는 중...</p>}

        {!loading && !stores.length && (
          <p className="mt-6 text-sm font-bold text-slate-400">아직 데이터가 없어요. 위에서 전체매출 파일을 업로드해주세요.</p>
        )}

        {!loading && stores.length > 0 && (
          <>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGroupFilter(g)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-black ${
                      groupFilter === g ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowAvgReceipt((v) => !v)}
                className={`rounded-xl px-3 py-1.5 text-xs font-black ${
                  showAvgReceipt ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-600"
                }`}
              >
                객단가/전년객단가 {showAvgReceipt ? "숨기기 ▲" : "보기 ▼"}
              </button>
            </div>

            {/* MARK 2026-09-25: "점포별로 실적순으로 나열" 요청 — 정렬 기준을 고르면 왼쪽
                순위(행번호) 열도 그 기준으로 다시 매겨집니다. */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-black text-slate-500">정렬:</span>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSortMode(opt.key)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black ${
                    sortMode === opt.key ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <p className="mt-3 text-xs font-bold text-slate-400">
              기준일: {asOfDate}{dailyDate && dailyDate !== asOfDate ? ` · 일간 조회일: ${dailyDate}` : ""} · 금액은 전부 천원 단위예요(원 단위 생략, 예: 234,555 = 234,555,000원). · 신장률이 "신규"인 경우는 비교 기간에 그 매장이 아직 없었다는 뜻이에요. · 일간/주간/이번달 실적 색상은 지금 보이는 매장들 사이의 상대 비교예요(낮음 🔴 ~ 높음 🟢).
            </p>

            <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full border-collapse text-xs" style={{ minWidth: tableMinWidth }}>
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th rowSpan={2} className="sticky left-0 z-10 w-9 min-w-[36px] whitespace-nowrap bg-slate-900 px-2 py-2 text-center font-black">
                      #
                    </th>
                    {/* MARK 2026-09-24: "구분 열은 지워달라(어차피 정렬순서로 알 수 있으니까)"
                        요청으로 구분(로드샵/백화점 등) 열을 없앴습니다 — 소계 줄 라벨에 구분명을
                        같이 넣어서 정보는 유지합니다. */}
                    <th rowSpan={2} className="sticky left-[36px] z-10 min-w-[64px] whitespace-nowrap bg-slate-900 px-3 py-2 text-left font-black">
                      매장명
                    </th>
                    <PeriodHeaderGroup title="일간" />
                    <PeriodHeaderGroup title="주간" />
                    {customPeriod && <PeriodHeaderGroup title={`기간비교 (${customPeriod.start}~${customPeriod.end})`} bg="bg-blue-900" />}
                    <PeriodHeaderGroup title="이번달(기간)" />
                    <PeriodHeaderGroup title="전월" />
                    <PeriodHeaderGroup title="연간(누계)" />
                  </tr>
                  <tr className="bg-slate-800 text-white">
                    <PeriodSubHeaders />
                    <PeriodSubHeaders />
                    {customPeriod && <PeriodSubHeaders bg="bg-blue-950" />}
                    <PeriodSubHeaders />
                    <PeriodSubHeaders />
                    <PeriodSubHeaders />
                  </tr>
                </thead>
                <tbody>
                  {totalRow && (
                    <tr className="bg-amber-50/80 ring-1 ring-inset ring-amber-200">
                      <td className="sticky left-0 z-10 w-9 min-w-[36px] whitespace-nowrap border-t border-slate-200 bg-amber-50 px-2 py-2 text-center font-black text-slate-400">
                        -
                      </td>
                      <td className="sticky left-[36px] z-10 min-w-[64px] whitespace-nowrap border-t border-slate-200 bg-amber-50 px-3 py-2 font-black text-slate-900">
                        {totalRow.storeName}
                      </td>
                      <AggRowCells row={totalRow} bg="bg-amber-50/60" />
                    </tr>
                  )}

                  {subtotalRows.map(({ group, row }) => (
                    <tr key={`subtotal-${group}`} className="bg-sky-50/70 ring-1 ring-inset ring-sky-100">
                      <td className="sticky left-0 z-10 w-9 min-w-[36px] whitespace-nowrap border-t border-slate-200 bg-sky-50 px-2 py-2 text-center font-black text-slate-400">
                        -
                      </td>
                      <td className="sticky left-[36px] z-10 min-w-[64px] whitespace-nowrap border-t border-slate-200 bg-sky-50 px-3 py-2 font-black text-slate-900">
                        {row.storeName}
                      </td>
                      <AggRowCells row={row} bg="bg-sky-50/50" />
                    </tr>
                  ))}

                  {sortedStores.map((s, i) => (
                    <tr key={s.storeName} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                      <td className="sticky left-0 z-10 w-9 min-w-[36px] whitespace-nowrap border-t border-slate-100 bg-inherit px-2 py-2 text-center font-bold text-slate-400">
                        {i + 1}
                      </td>
                      <td className="sticky left-[36px] z-10 min-w-[64px] whitespace-nowrap border-t border-slate-100 bg-inherit px-3 py-2 font-black text-slate-900">
                        {shortStoreName(s.storeName)}
                      </td>

                      <td className="border-t border-l border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums">{won(s.daily.target)}</td>
                      <td
                        className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums"
                        style={heatBg(s.daily.actual, heatRanges.daily)}
                      >
                        {won(s.daily.actual)}
                      </td>
                      {showAvgReceipt && (
                        <>
                          <td className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums text-indigo-600">{wonOrDash(s.daily.avgReceiptAmount)}</td>
                          <td className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums text-purple-600">{wonOrDash(s.daily.prevYearAvgReceiptAmount)}</td>
                        </>
                      )}
                      <td className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums">{pct(s.daily.achievementRate)}</td>
                      <td className={`border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums ${growthColor(s.daily.yoyGrowthRate)}`}>
                        {growthPct(s.daily.yoyGrowthRate)}
                      </td>

                      <td className="border-t border-l border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums">{won(s.weekly.target)}</td>
                      <td
                        className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums"
                        style={heatBg(s.weekly.actual, heatRanges.weekly)}
                      >
                        {won(s.weekly.actual)}
                      </td>
                      {showAvgReceipt && (
                        <>
                          <td className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums text-indigo-600">{wonOrDash(s.weekly.avgReceiptAmount)}</td>
                          <td className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums text-purple-600">{wonOrDash(s.weekly.prevYearAvgReceiptAmount)}</td>
                        </>
                      )}
                      <td className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums">{pct(s.weekly.achievementRate)}</td>
                      <td className={`border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums ${growthColor(s.weekly.yoyGrowthRate)}`}>
                        {growthPct(s.weekly.yoyGrowthRate)}
                      </td>

                      {customPeriod && (
                        <>
                          <td className="border-t border-l border-blue-100 bg-blue-50/40 whitespace-nowrap px-2 py-2 text-right tabular-nums">{won(s.customPeriod?.target || 0)}</td>
                          <td className="border-t border-blue-100 bg-blue-50/40 whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums">{won(s.customPeriod?.actual || 0)}</td>
                          {showAvgReceipt && (
                            <>
                              <td className="border-t border-blue-100 bg-blue-50/40 whitespace-nowrap px-2 py-2 text-right tabular-nums text-indigo-600">
                                {wonOrDash(s.customPeriod?.avgReceiptAmount ?? null)}
                              </td>
                              <td className="border-t border-blue-100 bg-blue-50/40 whitespace-nowrap px-2 py-2 text-right tabular-nums text-purple-600">
                                {wonOrDash(s.customPeriod?.prevYearAvgReceiptAmount ?? null)}
                              </td>
                            </>
                          )}
                          <td className="border-t border-blue-100 bg-blue-50/40 whitespace-nowrap px-2 py-2 text-right tabular-nums">{pct(s.customPeriod?.achievementRate ?? null)}</td>
                          <td
                            className={`border-t border-blue-100 bg-blue-50/40 whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums ${growthColor(s.customPeriod?.yoyGrowthRate ?? null)}`}
                          >
                            {growthPct(s.customPeriod?.yoyGrowthRate ?? null)}
                          </td>
                        </>
                      )}

                      <td className="border-t border-l border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums">{won(s.monthly.periodTarget)}</td>
                      <td
                        className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums"
                        style={heatBg(s.monthly.actual, heatRanges.monthly)}
                      >
                        {won(s.monthly.actual)}
                      </td>
                      {showAvgReceipt && (
                        <>
                          <td className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums text-indigo-600">{wonOrDash(s.monthly.avgReceiptAmount)}</td>
                          <td className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums text-purple-600">{wonOrDash(s.monthly.prevYearAvgReceiptAmount)}</td>
                        </>
                      )}
                      <td className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums">{pct(s.monthly.achievementRate)}</td>
                      <td className={`border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums ${growthColor(s.monthly.yoyGrowthRate)}`}>
                        {growthPct(s.monthly.yoyGrowthRate)}
                      </td>

                      <td className="border-t border-l border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums">{won(s.prevMonth.target)}</td>
                      <td className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums">{won(s.prevMonth.actual)}</td>
                      {showAvgReceipt && (
                        <>
                          <td className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums text-indigo-600">{wonOrDash(s.prevMonth.avgReceiptAmount)}</td>
                          <td className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums text-purple-600">{wonOrDash(s.prevMonth.prevYearAvgReceiptAmount)}</td>
                        </>
                      )}
                      <td className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums">{pct(s.prevMonth.achievementRate)}</td>
                      <td className={`border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums ${growthColor(s.prevMonth.yoyGrowthRate)}`}>
                        {growthPct(s.prevMonth.yoyGrowthRate)}
                      </td>

                      <td className="border-t border-l border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums">{won(s.annual.ytdTarget)}</td>
                      <td className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums">{won(s.annual.ytdActual)}</td>
                      {showAvgReceipt && (
                        <>
                          <td className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums text-indigo-600">{wonOrDash(s.annual.avgReceiptAmount)}</td>
                          <td className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums text-purple-600">{wonOrDash(s.annual.prevYearAvgReceiptAmount)}</td>
                        </>
                      )}
                      <td className="border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right tabular-nums">{pct(s.annual.achievementRate)}</td>
                      <td className={`border-t border-slate-100 whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums ${growthColor(s.annual.yoyGrowthRate)}`}>
                        {growthPct(s.annual.yoyGrowthRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
