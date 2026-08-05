import { NextResponse } from "next/server";
import { getHistorySheetId, getSheetValuesById } from "@/lib/googleSheets";
import { expandAnyDailyHistoryRows } from "@/lib/dailySales";
import { normalizeStoreKey } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GI_BOARD_BASE = "https://gi-board.vercel.app/api/archive";

// MARK 6.67: Daily_Sales_History 안에 날짜 형식이 "2026-08-03"(하이픈)과 "2026. 7. 5"
// (점+공백, 예전 데이터) 두 가지가 섞여있어서, 그냥 문자열로 비교하면 "."이 "-"보다
// 문자코드가 커서 예전 날짜가 최신으로 잘못 판정되는 버그가 있었습니다. 비교 전에
// 항상 "YYYY-MM-DD" 형식으로 정규화해서 비교합니다.
function normalizeDateKey(d: string): string {
  const s = String(d || "").trim();
  const kr = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (kr) {
    return `${kr[1]}-${kr[2].padStart(2, "0")}-${kr[3].padStart(2, "0")}`;
  }
  return s;
}

// MARK 6.66: "사이즈"처럼 보이는 값인지 판별합니다. 2026-08-03 이전 데이터는 사이즈 컬럼이
// 없어서 판매가 숫자가 잘못 들어가 있는 경우가 있어(별도 공유된 이슈), 그런 값은
// 사이즈로 취급하지 않고 컬러 단위로만 합칩니다.
// MARK 6.70: "??"는 daily-snapshot.js가 아직 이름을 확정 못한 사이즈 슬롯(SIZE_6 이상)에
// 붙이는 표시입니다. 컬러 단위로 조용히 합쳐버리면 이런 미확인 사이즈가 있다는 걸
// 아무도 못 알아채니까, 일부러 사이즈로 인정해서 화면에 "?? N개"로 눈에 띄게 둡니다.
function looksLikeRealSize(v: string): boolean {
  const s = String(v || "").trim().toUpperCase();
  if (!s) return false;
  if (s === "??") return true;
  if (/^(XS|S|M|L|XL|XXL|XXXL|FREE|F|ONE)$/.test(s)) return true;
  if (/^\d{2,3}$/.test(s)) {
    const n = Number(s);
    return n >= 20 && n <= 300; // 의류/신발 사이즈로 보이는 범위
  }
  return false;
}

// MARK 6.65: 매장 직원이 품번(또는 바코드로 읽은 품번)을 입력하면, 그 매장의 컬러별
// 현재 재고를 바로 보여줍니다. Daily_Sales_History의 가장 최근 날짜 값을 사용합니다
// (ERP 새벽 재고 스냅샷이 매일 반영되면 그 값이 최신 기준이 됩니다).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const store = url.searchParams.get("store") || "";
    const rawStyleCode = (url.searchParams.get("styleCode") || "").trim().toUpperCase();
    const barcode = (url.searchParams.get("barcode") || "").trim().toUpperCase();

    if (!store || (!rawStyleCode && !barcode)) {
      return NextResponse.json({ ok: false, error: "매장과 품번(또는 바코드)을 입력해주세요." }, { status: 400 });
    }

    const historyId = getHistorySheetId();
    const raw = await getSheetValuesById(historyId, "Daily_Sales_History", "A:ZZ").catch(() => []);
    const flatRows = expandAnyDailyHistoryRows(raw || []);

    const storeKey = normalizeStoreKey(store);
    const storeRows = flatRows.filter((r) => normalizeStoreKey(r.storeName) === storeKey);

    let styleCode = rawStyleCode;
    let matchedColorCode = "";

    // MARK 6.65: 바코드는 "품번+컬러코드+사이즈"가 구분자 없이 붙어있어서, 이 매장에
    // 실제 존재하는 "품번+컬러코드" 조합 중 바코드가 그걸로 시작하는 걸 찾습니다
    // (가장 긴 일치를 우선 — 짧은 품번이 긴 품번의 앞부분과 우연히 겹치는 걸 방지).
    if (!styleCode && barcode) {
      const knownPrefixes = Array.from(
        new Set(storeRows.map((r) => `${r.styleCode.toUpperCase()}${r.colorCode.toUpperCase()}`))
      ).sort((a, b) => b.length - a.length);

      const matchedPrefix = knownPrefixes.find((p) => barcode.startsWith(p));
      if (!matchedPrefix) {
        return NextResponse.json({ ok: true, found: false, colors: [], error: "이 매장 재고에서 일치하는 품번+컬러를 찾지 못했어요." });
      }
      const matchedRow = storeRows.find((r) => `${r.styleCode.toUpperCase()}${r.colorCode.toUpperCase()}` === matchedPrefix);
      styleCode = matchedRow!.styleCode.toUpperCase();
      matchedColorCode = matchedRow!.colorCode.toUpperCase();
    }

    const matched = storeRows.filter((r) => r.styleCode.toUpperCase() === styleCode);

    if (!matched.length) {
      return NextResponse.json({ ok: true, found: false, colors: [] });
    }

    // MARK 6.66: 사이즈 컬럼이 진짜 사이즈처럼 보이면 컬러+사이즈 단위로, 아니면(예전 데이터
    // 등 사이즈가 없거나 이상하면) 컬러 단위로만 묶습니다. 재고는 "가장 최근 날짜" 값만 사용
    // (합산 금지 — 스냅샷 성격).
    type Bucket = { date: string; stock: number; colorName: string; size?: string; stockUpdatedAt?: string };
    const latestByKey = new Map<string, Bucket>();
    for (const r of matched) {
      const hasSize = looksLikeRealSize(r.size);
      const key = hasSize ? `${r.colorCode}__${r.size}` : r.colorCode;
      const existing = latestByKey.get(key);
      const normDate = normalizeDateKey(r.date);
      if (!existing || normDate > normalizeDateKey(existing.date)) {
        latestByKey.set(key, {
          date: normDate,
          stock: Number(r.stock || 0),
          colorName: r.colorName,
          size: hasSize ? r.size : undefined,
          stockUpdatedAt: r.stockUpdatedAt,
        });
      }
    }

    type ColorGroup = { colorCode: string; colorName: string; stock: number; asOfDate: string; scanned: boolean; sizes: { size: string; stock: number }[] };
    const byColor = new Map<string, ColorGroup>();
    for (const [key, v] of latestByKey.entries()) {
      const colorCode = key.split("__")[0];
      if (!byColor.has(colorCode)) {
        byColor.set(colorCode, { colorCode, colorName: v.colorName, stock: 0, asOfDate: v.date, scanned: colorCode.toUpperCase() === matchedColorCode, sizes: [] });
      }
      const group = byColor.get(colorCode)!;
      group.stock += v.stock;
      if (v.date > group.asOfDate) group.asOfDate = v.date; // v.date는 이미 위에서 정규화됨
      if (v.size) group.sizes.push({ size: v.size, stock: v.stock });
    }

    // MARK 6.66: 이 매장 판매이력에 없는 다른 컬러도(전사 상품360 기준) 참고용으로 같이
    // 보여줍니다 — 재고는 "이 매장 정보 없음"으로 표시(전사 재고가 아니라 이 매장 재고를
    // 보여주는 화면이라, 숫자를 지어내지 않습니다).
    const productToken = process.env.PRODUCT360_TOKEN_OBT;
    if (productToken) {
      try {
        const p360Res = await fetch(`${GI_BOARD_BASE}/product360?code=${encodeURIComponent(styleCode)}`, {
          headers: { "x-archive-token": productToken },
          cache: "no-store",
        });
        if (p360Res.ok) {
          const p360 = await p360Res.json();
          for (const c of p360?.colors || []) {
            const code = String(c.color || "").toUpperCase();
            if (!code || byColor.has(code)) continue;
            byColor.set(code, { colorCode: code, colorName: c.colorName || code, stock: -1, asOfDate: "", scanned: false, sizes: [] });
          }
        }
      } catch {
        // 상품360 조회 실패해도 이 매장 데이터는 그대로 보여줌
      }
    }

    const colors = Array.from(byColor.values()).sort((a, b) => b.stock - a.stock);

    // MARK 6.72: 화면에 "재고 마지막 갱신 시각"을 보여주기 위해, 이 조회에 걸린 항목들 중
    // 가장 최근 stockUpdatedAt을 뽑습니다 (stock-refresh.js/daily-snapshot.js가 기록해둔 값).
    let stockUpdatedAt: string | null = null;
    for (const v of latestByKey.values()) {
      if (v.stockUpdatedAt && (!stockUpdatedAt || v.stockUpdatedAt > stockUpdatedAt)) stockUpdatedAt = v.stockUpdatedAt;
    }

    return NextResponse.json({
      ok: true,
      found: true,
      styleCode,
      productName: matched[0].productName,
      storeName: matched[0].storeName,
      colors,
      stockUpdatedAt,
    });
  } catch (error: any) {
    console.error("store-stock-lookup failed:", error);
    return NextResponse.json({ ok: false, error: error?.message || "조회 실패" }, { status: 500 });
  }
}
