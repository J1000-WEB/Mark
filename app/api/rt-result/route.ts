import { NextResponse } from "next/server";
import { appendValues, ensureSheetExists, getSheetValues } from "@/lib/googleSheets";

const RT_RESULT_SHEET = "RT_Result";
const STORE_SHEET = "객_전주";
const LAUNCH_SHEET = "기준_런칭";

const HEADER = ["보낼채널코드", "받을채널코드", "스타일", "칼라", "사이즈", "수량"];

function text(v: any) {
  return String(v ?? "").trim();
}

function num(v: any) {
  const n = Number(String(v ?? "").replace(/,/g, "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function distribute(totalQty: number, variants: Array<{ color: string; size: string }>) {
  const qty = Math.max(1, Math.round(totalQty || 0));
  const list = variants.length ? variants : [{ color: "", size: "" }];
  const base = Math.floor(qty / list.length);
  const rest = qty % list.length;

  return list
    .map((v, i) => ({ ...v, qty: base + (i < rest ? 1 : 0) }))
    .filter((v) => v.qty > 0);
}

function buildStoreCodeMap(rows: any[][]) {
  const map = new Map<string, string>();

  for (const row of rows.slice(1)) {
    const code = text(row[2]); // C열 채널코드
    const name = text(row[3]); // D열 점포명
    if (!code || !name) continue;
    map.set(name, code);
    map.set(name.replace(/\s/g, ""), code);
  }

  return map;
}

function findStoreCode(map: Map<string, string>, storeName: string) {
  const name = text(storeName);
  return map.get(name) || map.get(name.replace(/\s/g, "")) || "";
}

function findVariants(rows: any[][], styleCode: string) {
  const style = text(styleCode);
  const seen = new Set<string>();
  const variants: Array<{ color: string; size: string }> = [];

  for (const row of rows.slice(1)) {
    const hasStyle = row.some((cell) => text(cell) === style);
    if (!hasStyle) continue;

    const color = text(row[5]); // F열 칼라
    const size = text(row[6]);  // G열 사이즈
    const key = `${color}__${size}`;

    if (!seen.has(key)) {
      seen.add(key);
      variants.push({ color, size });
    }
  }

  return variants;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const item = body.item || {};

    const styleCode = text(item.styleCode);
    const fromStore = text(item.fromStore);
    const toStore = text(item.toStore);
    const suggestQty = num(item.suggestQty);

    if (!styleCode || !fromStore || !toStore || !suggestQty) {
      return NextResponse.json({ ok: false, error: "RT 저장에 필요한 값이 부족합니다." }, { status: 400 });
    }

    await ensureSheetExists(RT_RESULT_SHEET, HEADER);

    const [storeRows, launchRows] = await Promise.all([
      getSheetValues(STORE_SHEET, "A:Z").catch(() => []),
      getSheetValues(LAUNCH_SHEET, "A:Z").catch(() => []),
    ]);

    const storeMap = buildStoreCodeMap(storeRows);
    const fromCode = findStoreCode(storeMap, fromStore);
    const toCode = findStoreCode(storeMap, toStore);

    if (!fromCode || !toCode) {
      return NextResponse.json({
        ok: false,
        error: `채널코드 매칭 실패: ${!fromCode ? fromStore : ""} ${!toCode ? toStore : ""}`.trim(),
      }, { status: 400 });
    }

    const variants = findVariants(launchRows, styleCode);
    const distributed = distribute(suggestQty, variants);

    const rows = distributed.map((v) => [
      fromCode,
      toCode,
      styleCode,
      v.color,
      v.size,
      v.qty,
    ]);

    await appendValues(`'${RT_RESULT_SHEET}'!A:F`, rows);

    return NextResponse.json({
      ok: true,
      rows: rows.length,
      quantity: rows.reduce((s, r) => s + Number(r[5] || 0), 0),
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "RT_Result 저장 실패" }, { status: 500 });
  }
}
