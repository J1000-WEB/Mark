import { NextResponse } from "next/server";
import { appendValues, ensureSheetExists, getManySheetValues, getSheetValues, getSpreadsheetTitles, updateValues } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RESULT_SHEET = "RT_Result";
const RESULT_HEADER = ["보낼채널코드", "받을채널코드", "스타일", "칼라", "사이즈", "수량", "제안날짜", "다운로드날짜"];

function text(v: any) {
  return String(v ?? "").trim();
}

function num(v: any) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/,/g, "").replace(/%/g, "").replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}


function normalizeStoreKey(storeName: string) {
  return String(storeName || "")
    .replace(/^오프라인[_\s-]*/i, "")
    .replace(/점$/g, "")
    .replace(/[\s_\-·.()]/g, "")
    .toLowerCase();
}

function displayStoreName(storeName: string) {
  const raw = String(storeName || "").replace(/^오프라인[_\s-]*/i, "").trim();
  const key = normalizeStoreKey(raw);
  const aliases: Record<string, string> = {
    "성수플래그십": "성수 플래그십",
    "성수flagship": "성수 플래그십",
    "신사플래그십": "신사 플래그십",
    "광주신세계": "신세계 광주점",
    "신세계광주": "신세계 광주점",
  };
  return aliases[key] || raw;
}

function todayKST() {
  const d = new Date();
  const kst = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`;
}

function normalizeSheetName(name: string) {
  return String(name || "").replace(/\s/g, "").replace(/[()]/g, "").toLowerCase();
}

function pickProductSheet(titles: string[]) {
  const exact = titles.find((t) => t === "금주/전주");
  if (exact) return exact;
  return titles.find((t) => {
    const n = normalizeSheetName(t);
    return n.includes("금주") && n.includes("전주");
  }) || "금주/전주";
}

function pickChannelSheet(titles: string[]) {
  const exact = titles.find((t) => t === "객_전주");
  if (exact) return exact;
  return titles.find((t) => normalizeSheetName(t).includes("객_전주")) || "객_전주";
}

function findHeaderRow(rows: any[][], labels: string[]) {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const joined = (rows[r] || []).map(text).join("|");
    if (labels.every((label) => joined.includes(label))) return r;
  }
  return -1;
}

function findCol(row: any[], labels: string[], fallback = -1) {
  const normalized = (row || []).map((v) => text(v).replace(/\s/g, ""));
  for (const label of labels) {
    const target = label.replace(/\s/g, "");
    const idx = normalized.findIndex((v) => v === target || v.includes(target));
    if (idx >= 0) return idx;
  }
  return fallback;
}

function channelCodeMap(rows: any[][]) {
  const map = new Map<string, string>();
  // 객_전주: C 채널코드, D 점포명
  for (const row of rows.slice(1)) {
    const code = text(row[2]);
    const name = text(row[3]);
    if (code && name) {
      map.set(name, code);
      map.set(displayStoreName(name), code);
      map.set(normalizeStoreKey(name), code);
    }
  }
  return map;
}

function skuRowsForTransfer(productRows: any[][], fromStore: string, styleCode: string) {
  const headerRow = findHeaderRow(productRows, ["채널명", "스타일"]);
  const header = headerRow >= 0 ? productRows[headerRow] || [] : [];

  const storeCol = findCol(header, ["채널명"], 1);
  const styleCol = findCol(header, ["스타일"], 2);
  const colorCol = findCol(header, ["칼라"], 4);
  const sizeCol = findCol(header, ["사이즈"], 6);
  const stockCol = 8; // I열 재고 고정
  const startRow = headerRow >= 0 ? headerRow + 2 : 3;

  return productRows.slice(startRow)
    .map((row) => ({
      storeName: displayStoreName(text(row[storeCol])),
      storeKey: normalizeStoreKey(text(row[storeCol])),
      styleCode: text(row[styleCol]),
      color: text(row[colorCol]),
      size: text(row[sizeCol]),
      stock: num(row[stockCol]),
    }))
    .filter((r) => normalizeStoreKey(r.storeName) === normalizeStoreKey(fromStore) && r.styleCode === styleCode && r.stock > 0 && r.color && r.size);
}

function allocateByStock(rows: { color: string; size: string; stock: number }[], qty: number) {
  const totalStock = rows.reduce((s, r) => s + Math.max(0, Number(r.stock || 0)), 0);
  const target = Math.min(Math.max(0, Math.round(Number(qty || 0))), totalStock);
  if (!target || !totalStock) return [];

  const seeded = rows.map((r) => {
    const exact = (r.stock / totalStock) * target;
    const base = Math.min(r.stock, Math.floor(exact));
    return { ...r, qty: base, remain: exact - base };
  });

  let allocated = seeded.reduce((s, r) => s + r.qty, 0);
  const order = [...seeded].sort((a, b) => b.remain - a.remain || b.stock - a.stock);

  for (const r of order) {
    if (allocated >= target) break;
    const add = Math.min(r.stock - r.qty, target - allocated);
    if (add > 0) {
      r.qty += add;
      allocated += add;
    }
  }

  return seeded.filter((r) => r.qty > 0).map((r) => ({
    color: r.color,
    size: r.size,
    qty: r.qty,
  }));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const item = body?.item || {};

    const fromStore = text(item.fromStore);
    const toStore = text(item.toStore);
    const styleCode = text(item.styleCode);
    const suggestQty = num(item.suggestQty);

    if (!fromStore || !toStore || !styleCode || !suggestQty) {
      return NextResponse.json({ ok: false, error: "RT 저장에 필요한 fromStore/toStore/styleCode/suggestQty가 없습니다." }, { status: 400 });
    }

    await ensureSheetExists(RESULT_SHEET, RESULT_HEADER);

    const titles = await getSpreadsheetTitles();
    const productSheet = pickProductSheet(titles);
    const channelSheet = pickChannelSheet(titles);
    const values = await getManySheetValues([productSheet, channelSheet], "A:AZ");

    const productRows = values[productSheet] || [];
    const channels = channelCodeMap(values[channelSheet] || []);
    const fromCode = channels.get(fromStore) || channels.get(normalizeStoreKey(fromStore)) || fromStore;
    const toCode = channels.get(toStore) || channels.get(normalizeStoreKey(toStore)) || toStore;

    const skus = skuRowsForTransfer(productRows, fromStore, styleCode);
    const allocated = allocateByStock(skus, suggestQty);

    if (!allocated.length) {
      return NextResponse.json({ ok: false, error: "출고점의 칼라/사이즈별 실제 재고를 찾지 못했습니다." }, { status: 400 });
    }

    const proposedAt = todayKST();
    const rows = allocated.map((r) => [
      fromCode,
      toCode,
      styleCode,
      r.color,
      r.size,
      r.qty,
      proposedAt,
      "",
    ]);

    await appendValues(`'${RESULT_SHEET}'!A:H`, rows);

    return NextResponse.json({ ok: true, savedRows: rows.length, proposedAt });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "RT_Result 저장 실패" }, { status: 500 });
  }
}
