import { getSheetValues, ensureSheetExists, appendValues } from "./googleSheets";

// MARK 6.47: Channel_Master — "이 채널 이름이 온라인인지 오프라인인지"를 하드코딩된 키워드
// 목록이 아니라, 명시적으로 저장된 관계(시맨틱 레이어)로 관리합니다.
// 새 채널이 생겨도 여기 한 줄만 추가하면 되고, isOnlineChannel() 같은 키워드 추측 로직에
// 의존하지 않아도 됩니다.

export const CHANNEL_MASTER_SHEET = "Channel_Master";
export const CHANNEL_MASTER_HEADER = ["ChannelName", "ChannelType", "Active", "UpdatedAt"];

// 채널타입 값: 오프라인매장 | 자사몰 | 온라인마켓 | 위탁 | 면세 | 기타
export type ChannelType = "오프라인매장" | "자사몰" | "온라인마켓" | "위탁" | "면세" | "기타";

let cache: { map: Map<string, ChannelType>; loadedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 1분 — 요청마다 매번 시트를 다시 읽지 않도록

export async function loadChannelMaster(): Promise<Map<string, ChannelType>> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.map;

  await ensureSheetExists(CHANNEL_MASTER_SHEET, CHANNEL_MASTER_HEADER).catch(() => {});
  const rows = await getSheetValues(CHANNEL_MASTER_SHEET, "A:D").catch(() => []);
  const map = new Map<string, ChannelType>();
  for (const row of (rows || []).slice(1)) {
    const name = String(row[0] || "").trim();
    const type = String(row[1] || "").trim() as ChannelType;
    const active = String(row[2] || "true").toLowerCase() !== "false";
    if (name && type && active) map.set(name, type);
  }
  cache = { map, loadedAt: Date.now() };
  return map;
}

export function isOnlineType(type: ChannelType | undefined) {
  return type === "자사몰" || type === "온라인마켓";
}

export function isOfflineType(type: ChannelType | undefined) {
  return type === "오프라인매장";
}

// Channel_Master에 없는 채널명을 자동으로 채워 넣을 때 쓰는 시드 함수.
// (기존 키워드 휴리스틱으로 1차 분류해서 넣어두고, 사람이 나중에 틀린 것만 고치면 됨)
export async function seedUnknownChannels(discoveredNames: string[], classify: (name: string) => ChannelType) {
  const existing = await loadChannelMaster();
  const toAdd = Array.from(new Set(discoveredNames))
    .map((n) => n.trim())
    .filter((n) => n && !existing.has(n));

  if (!toAdd.length) return 0;

  const nowIso = new Date().toISOString();
  await appendValues(
    `'${CHANNEL_MASTER_SHEET}'!A:D`,
    toAdd.map((name) => [name, classify(name), "true", nowIso])
  );
  cache = null; // 다음 조회 때 새로 읽도록 캐시 무효화
  return toAdd.length;
}
