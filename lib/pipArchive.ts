// MARK 2026-11-17: PIP 과거 보관 시트(MARK_PIP_ARCHIVE, PC erp-agent/pip-archive.js가 채움) 읽기.
// 판매_일별: 하루 1줄 [날짜, 요일, 판매줄수, 오프라인수량, 오프라인금액, 전체금액, 저장시각, 조각수, 조각1..]
// 조각 = base64(gzip(JSON {v,d,sh:[[채널코드,채널명,팀명]],sk:["스타일|칼라|사이즈"],s:[[채널i,품목i,수량,금액]]}))
import { gunzipSync } from "zlib";
import { getSheetValuesById } from "@/lib/googleSheets";

export const PIP_ARCHIVE_SHEET_ID = process.env.GOOGLE_SHEET_ID_PIP_ARCHIVE || "1P3gzejuFCnGd8nXR946_ttXY9VcqropnS5wokCmWLwA";
const SALES_TAB = "판매_일별";

export type ArchivedSaleRow = {
  date: string;
  channelCode: string;
  storeName: string;
  team: string; // 오프라인팀 / 온라인팀 / 글로벌팀 등(ERP 팀명)
  styleCode: string;
  colorCode: string;
  size: string;
  qty: number;
  amount: number;
};

let dateIndexCache: { at: number; map: Map<string, number> } | null = null;

async function readDateIndex(): Promise<Map<string, number>> {
  if (dateIndexCache && Date.now() - dateIndexCache.at < 10 * 60 * 1000) return dateIndexCache.map;
  const col = await getSheetValuesById(PIP_ARCHIVE_SHEET_ID, SALES_TAB, "A:A").catch(() => [] as any[][]);
  const map = new Map<string, number>();
  col.forEach((r, i) => {
    const d = String(r?.[0] ?? "").slice(0, 10);
    if (i > 0 && /^\d{4}-\d{2}-\d{2}$/.test(d)) map.set(d, i + 1);
  });
  dateIndexCache = { at: Date.now(), map };
  return map;
}

/** 보관 시트에 있는 날짜 목록 */
export async function archivedSalesDates(): Promise<string[]> {
  return [...(await readDateIndex()).keys()].sort();
}

function decodeRow(row: any[]): ArchivedSaleRow[] {
  const n = Number(row?.[7]) || 0;
  if (!n) return [];
  const b64 = row.slice(8, 8 + n).map((c: any) => String(c ?? "")).join("");
  const rec = JSON.parse(gunzipSync(Buffer.from(b64, "base64")).toString("utf8"));
  const out: ArchivedSaleRow[] = [];
  for (const [si, ki, q, a] of rec.s as number[][]) {
    const sh = rec.sh[si] || [];
    const [style, color, size] = String(rec.sk[ki] || "").split("|");
    out.push({ date: rec.d, channelCode: String(sh[0] ?? ""), storeName: String(sh[1] ?? ""), team: String(sh[2] ?? ""), styleCode: style || "", colorCode: color || "", size: size || "", qty: Number(q) || 0, amount: Number(a) || 0 });
  }
  return out;
}

/** 지정한 날짜들의 판매 줄(채널×품목). 보관 안 된 날짜는 빠짐. */
// maxGap: 줄 번호가 이만큼 떨어져 있어도 한 번에 읽음(읽기 횟수 줄이기 — 구글 1분당 읽기 한도). 누계처럼 많이 읽을 땐 크게.
export async function readArchivedSales(dates: string[], opts: { maxGap?: number } = {}): Promise<{ rows: ArchivedSaleRow[]; foundDates: string[] }> {
  const idx = await readDateIndex();
  const rowsNo = dates.map((d) => idx.get(d)).filter((x): x is number => !!x).sort((a, b) => a - b);
  if (!rowsNo.length) return { rows: [], foundDates: [] };
  // 이어진 줄끼리 묶어서 읽음
  const groups: [number, number][] = [];
  for (const r of rowsNo) {
    const last = groups[groups.length - 1];
    if (last && r <= last[1] + (opts.maxGap ?? 3)) last[1] = r;
    else groups.push([r, r]);
  }
  const want = new Set(dates);
  const rows: ArchivedSaleRow[] = [];
  const found = new Set<string>();
  for (const [a, b] of groups) {
    let vals: any[][] = [];
    for (let attempt = 0; ; attempt++) {
      try {
        vals = await getSheetValuesById(PIP_ARCHIVE_SHEET_ID, SALES_TAB, `A${a}:BH${b}`);
        break;
      } catch (e: any) {
        // 1분당 읽기 한도(429) — 잠깐 기다렸다 다시(밤 보관 작업과 같은 계정을 써서 겹칠 수 있음)
        if (attempt >= 3 || !/quota|429|rate/i.test(String(e?.message || e))) throw e;
        await new Promise((res) => setTimeout(res, 15000 * (attempt + 1)));
      }
    }
    for (const v of vals) {
      const d = String(v?.[0] ?? "").slice(0, 10);
      if (!want.has(d)) continue;
      try {
        rows.push(...decodeRow(v));
        found.add(d);
      } catch (e) {
        console.error("pip archive decode failed", d, e);
      }
    }
  }
  return { rows, foundDates: [...found].sort() };
}
