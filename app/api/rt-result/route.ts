import { NextResponse } from "next/server";
import { appendValues, ensureSheetExists, getSheetValues } from "@/lib/googleSheets";

const RESULT_SHEET = "RT_Result";
const CHANNEL_SHEET = "객_전주";
const PRODUCT_SHEET = "금주/전주";

const RESULT_HEADER = ["보낼채널코드", "받을채널코드", "스타일", "칼라", "사이즈", "수량", "승인날짜"];

function text(v: any) {
  return String(v ?? "").trim();
}

function num(v: any) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/,/g, "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function todayKST() {
  const d = new Date();
  const kst = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`;
}

function norm(v: any) {
  return text(v).replace(/\s/g, "").toLowerCase();
}

function findChannelCode(rows: any[][], storeName: string) {
  const target = norm(storeName);

  // 객_전주: C 채널코드(index 2), D 점포명(index 3)
  const found = rows.slice(1).find((row) => {
    const name = norm(row[3]);
    return name === target || name.includes(target) || target.includes(name);
  });

  return text(found?.[2] || storeName);
}

function getSkuStocks(rows: any[][], fromStore: string, styleCode: string) {
  const targetStore = norm(fromStore);
  const targetStyle = norm(styleCode);

  const candidates = rows.slice(2).map((row) => {
    // 신규 금주/전주 시트:
    // A 채널코드, B 채널명, C 스타일, D 스타일명, E 칼라, F 칼라명, G 사이즈, H 재고
    const storeName = text(row[1]);
    const style = text(row[2]);
    const color = text(row[4]);
    const colorName = text(row[5]);
    const size = text(row[6]);
    const stock = num(row[7]);

    return { storeName, style, color, colorName, size, stock };
  }).filter((r) => {
    const s = norm(r.storeName);
    const st = norm(r.style);
    return r.stock > 0 && st === targetStyle && (s === targetStore || s.includes(targetStore) || targetStore.includes(s));
  });

  return candidates;
}

function distributeQty(skus: { color: string; colorName: string; size: string; stock: number }[], requestedQty: number) {
  const qty = Math.max(0, Math.floor(num(requestedQty)));
  const totalStock = skus.reduce((s, r) => s + Math.max(0, Number(r.stock || 0)), 0);
  const target = Math.min(qty, totalStock);

  if (!skus.length || target <= 0) return [];

  const base = skus.map((sku) => {
    const exact = (sku.stock / totalStock) * target;
    const floor = Math.min(sku.stock, Math.floor(exact));
    return { ...sku, qty: floor, rest: exact - floor };
  });

  let remain = target - base.reduce((s, r) => s + r.qty, 0);
  base.sort((a, b) => b.rest - a.rest || b.stock - a.stock);

  for (const row of base) {
    if (remain <= 0) break;
    const add = Math.min(remain, row.stock - row.qty);
    row.qty += add;
    remain -= add;
  }

  return base.filter((r) => r.qty > 0);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const item = body?.item || {};

    const fromStore = text(item.fromStore);
    const toStore = text(item.toStore);
    const styleCode = text(item.styleCode);
    const suggestQty = num(item.suggestQty);
    const approvedDate = text(body.approvedDate) || todayKST();

    if (!fromStore || !toStore || !styleCode || !suggestQty) {
      return NextResponse.json({ ok: false, error: "RT 저장에 필요한 fromStore, toStore, styleCode, suggestQty가 없습니다." }, { status: 400 });
    }

    await ensureSheetExists(RESULT_SHEET, RESULT_HEADER);

    const [channelRows, productRows] = await Promise.all([
      getSheetValues(CHANNEL_SHEET, "A:Z").catch(() => []),
      getSheetValues(PRODUCT_SHEET, "A:AZ").catch(() => []),
    ]);

    const fromCode = findChannelCode(channelRows, fromStore);
    const toCode = findChannelCode(channelRows, toStore);

    const skuStocks = getSkuStocks(productRows, fromStore, styleCode);
    const allocations = distributeQty(skuStocks, suggestQty);

    const rows = allocations.length
      ? allocations.map((r) => [fromCode, toCode, styleCode, r.color || r.colorName || "", r.size || "", r.qty, approvedDate])
      : [[fromCode, toCode, styleCode, "", "", Math.floor(suggestQty), approvedDate]];

    await appendValues(`'${RESULT_SHEET}'!A:G`, rows);

    return NextResponse.json({
      ok: true,
      savedRows: rows.length,
      requestedQty: Math.floor(suggestQty),
      savedQty: rows.reduce((s, r) => s + Number(r[5] || 0), 0),
      approvedDate,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "RT_Result 저장 실패" }, { status: 500 });
  }
}
