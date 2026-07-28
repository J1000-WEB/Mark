import { getSheetValues, ensureSheetExists, appendValues } from "./googleSheets";

// MARK 6.47: Action_Log — 키네틱(행동) 레이어. "무슨 결정을, 무엇 때문에, 언제 내리고 실행했는지"를
// 표준 형식으로 기록합니다. trigger_ref로 Logic_Master/Research_Result와 연결되어, 나중에
// "이 로직을 승인한 이후로 실제 어떤 액션이 몇 번 실행됐고 결과가 어땠는지"를 물어볼 수 있게 합니다.

export const ACTION_LOG_SHEET = "Action_Log";
export const ACTION_LOG_HEADER = [
  "ActionId",
  "ActionType",
  "TargetStyle",
  "TargetStoreOrChannel",
  "DecidedAt",
  "ExecutedAt",
  "TriggerRef",
  "BeforeState",
  "AfterState",
  "DecidedBy",
];

export type ActionType = "RT이관" | "가격변경" | "프로모션집행" | "재고재배치" | "로직반영" | "기타";

export interface ActionLogEntry {
  actionType: ActionType;
  targetStyle?: string;
  targetStoreOrChannel?: string;
  triggerRef?: string; // Logic_Master ID 또는 Research_Result ID 등
  beforeState?: Record<string, any>;
  afterState?: Record<string, any>;
  decidedBy?: string;
  executedAt?: string; // 비워두면 "결정만 하고 아직 미실행"으로 취급
}

function makeActionId() {
  return `ACT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export async function logAction(entry: ActionLogEntry) {
  await ensureSheetExists(ACTION_LOG_SHEET, ACTION_LOG_HEADER).catch(() => {});
  const nowIso = new Date().toISOString();
  await appendValues(`'${ACTION_LOG_SHEET}'!A:J`, [[
    makeActionId(),
    entry.actionType,
    entry.targetStyle || "",
    entry.targetStoreOrChannel || "",
    nowIso,
    entry.executedAt || "",
    entry.triggerRef || "",
    entry.beforeState ? JSON.stringify(entry.beforeState) : "",
    entry.afterState ? JSON.stringify(entry.afterState) : "",
    entry.decidedBy || "소천",
  ]]);
}

export async function loadRecentActions(limit = 50) {
  const rows = await getSheetValues(ACTION_LOG_SHEET, "A:J").catch(() => []);
  return (rows || [])
    .slice(1)
    .map((row) => ({
      actionId: row[0] || "",
      actionType: row[1] || "",
      targetStyle: row[2] || "",
      targetStoreOrChannel: row[3] || "",
      decidedAt: row[4] || "",
      executedAt: row[5] || "",
      triggerRef: row[6] || "",
      beforeState: row[7] || "",
      afterState: row[8] || "",
      decidedBy: row[9] || "",
    }))
    .reverse()
    .slice(0, limit);
}
