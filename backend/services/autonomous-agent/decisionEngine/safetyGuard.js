'use strict';
/**
 * services/autonomous-agent/decisionEngine/safetyGuard.js
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS — AI 安全守護層（Safety Guard）
 *
 * 職責：
 *   - 所有 AI 動作在執行前必須通過此安全層
 *   - 依風險等級決定自動執行 or 進入 Staging 等待人類審批
 *   - 支援快照 + 一鍵還原機制
 *
 * 風險等級矩陣：
 *   L1 (riskLevel=1) → 自動執行（通知、建立任務、讀取資料）
 *   L2 (riskLevel=2) → 寫入 Staging，等待 1-click 人類審批
 *                      （重排程、重新指派任務）
 *   L3 (riskLevel=3) → 人類必須主動審核（刪除記錄、修改預算）
 *   L4 (riskLevel=4) → 永久禁止（刪除專案/用戶、財務操作）
 *
 * 禁止操作清單（Blacklist）：
 *   - 刪除任何業務資料（project, task, user, company）
 *   - 直接修改 budget（財務欄位）
 *   - 修改 passwordHash / role（敏感權限欄位）
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../../../.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['error'] });

// ── 動作風險等級分類表 ────────────────────────────────────────
const RISK_MATRIX = {
  // L1：低風險，自動執行
  create_notification:   1,
  create_risk_task:      1,
  read_data:             1,
  log_decision:          1,
  create_activity_log:   1,

  // L2：中風險，需要人類 1-click 審批（staging）
  reschedule_project:    2,
  reschedule_task:       2,
  reassign_task:         2,
  update_task_status:    2,
  update_task_duedate:   2,
  cascade_reschedule:    2,

  // L3：高風險，人類必須主動進入 UI 審批
  update_project_budget: 3,
  update_project_status: 3,
  bulk_reassign:         3,

  // L4：禁止，AI 永遠不能執行
  delete_project:        4,
  delete_task:           4,
  delete_user:           4,
  modify_password:       4,
  modify_role:           4,
  financial_transaction: 4,
};

// ── 禁止關鍵字（動作名稱含這些字串時，強制 L4）──────────────
const FORBIDDEN_KEYWORDS = [
  'delete', 'destroy', 'drop', 'truncate',
  'password', 'role', 'financial', 'billing',
];

// ════════════════════════════════════════════════════════════
// 核心：風險分類
// ════════════════════════════════════════════════════════════

/**
 * 分類動作的風險等級
 * @param {string} toolName
 * @param {Object} params
 * @returns {number} riskLevel 1-4
 */
function classifyRisk(toolName, params = {}) {
  const tool = toolName.toLowerCase();

  // 黑名單關鍵字檢查（強制 L4）
  if (FORBIDDEN_KEYWORDS.some(kw => tool.includes(kw))) {
    log('warn', `禁止動作（黑名單關鍵字）: ${toolName}`);
    return 4;
  }

  // 若 params 中含有 deletedAt 欄位（軟刪除），視為 L3
  if (params.data?.deletedAt !== undefined) {
    return 3;
  }

  // 若 params 含有 budget/salary/payment 相關欄位，視為 L4
  const paramsStr = JSON.stringify(params).toLowerCase();
  if (paramsStr.includes('budget') || paramsStr.includes('salary') || paramsStr.includes('payment')) {
    return 4;
  }

  return RISK_MATRIX[tool] || 2; // 未知動作預設 L2（需審批）
}

// ════════════════════════════════════════════════════════════
// 核心：執行動作（含安全邊界）
// ════════════════════════════════════════════════════════════

/**
 * 執行一個 AI 動作（通過安全守護層）
 *
 * @param {Object}   opts
 * @param {number}   opts.decisionId  - AiDecision 記錄 ID
 * @param {string}   opts.toolName    - 動作名稱（用於風險分類）
 * @param {number}   opts.riskLevel   - 呼叫方建議的風險等級（會取 max）
 * @param {Object}   opts.params      - 動作參數（記錄用）
 * @param {Function} opts.snapshot    - async () => snapshotData（回滾用）
 * @param {Function} opts.execute     - async () => 實際執行的函式
 * @returns {Promise<{executed: boolean, staging: boolean, reason: string}>}
 */
async function executeAction({ decisionId, toolName, riskLevel, params, snapshot, execute }) {
  const startTime = Date.now();

  // 風險等級取 max（呼叫方建議 vs 系統分類表）
  const computedRisk = classifyRisk(toolName, params);
  const finalRisk    = Math.max(riskLevel || 1, computedRisk);

  log('info', `執行動作: ${toolName} | 風險等級: L${finalRisk}`);

  // ── L4：永久禁止 ─────────────────────────────────────────
  if (finalRisk >= 4) {
    const reason = `[SafetyGuard] 動作 "${toolName}" 屬於禁止操作（L4），AI 永遠不能執行此類動作`;
    log('error', reason);
    await logToolCall(decisionId, toolName, params, null, false, reason, Date.now() - startTime);
    return { executed: false, staging: false, reason };
  }

  // ── L3：人類必須主動審批 ──────────────────────────────────
  if (finalRisk === 3) {
    const reason = `[SafetyGuard] 動作 "${toolName}" 風險等級 L3，需要人類主動審核後才能執行`;
    log('warn', reason);

    await prisma.aiDecision.update({
      where: { id: decisionId },
      data:  { status: 'staging', riskLevel: finalRisk },
    });

    await logToolCall(
      decisionId, toolName, params,
      { status: 'awaiting_human_review' }, true, null,
      Date.now() - startTime
    );
    return { executed: false, staging: true, reason };
  }

  // ── L2：自動進入 Staging，等待 1-click 審批 ──────────────
  if (finalRisk === 2) {
    log('info', `   → L2 動作，進入 Staging，等待人類 1-click 審批`);

    // 擷取快照（供還原用）
    let snapshotData = {};
    try {
      snapshotData = snapshot ? await snapshot() : {};
    } catch (snapErr) {
      log('warn', `   快照失敗（將繼續但無法還原）: ${snapErr.message}`);
    }

    // 更新 AiDecision 為 staging 狀態（儲存快照）
    await prisma.aiDecision.update({
      where: { id: decisionId },
      data: {
        status:       'staging',
        riskLevel:    finalRisk,
        snapshotData: snapshotData,
      },
    });

    await logToolCall(
      decisionId, toolName, params,
      { status: 'staging', snapshotTaken: Object.keys(snapshotData).length > 0 },
      true, null, Date.now() - startTime
    );

    return {
      executed: false,
      staging:  true,
      reason:   `動作已進入 Staging，等待人類審批（決策 #${decisionId}）`,
    };
  }

  // ── L1：自動執行 ─────────────────────────────────────────
  log('info', `   → L1 動作，自動執行`);

  // 執行前擷取快照（事後還原用）
  let snapshotData = {};
  try {
    snapshotData = snapshot ? await snapshot() : {};
  } catch (snapErr) {
    log('warn', `   快照失敗（將繼續但無法還原）: ${snapErr.message}`);
  }

  try {
    const result   = await execute();
    const duration = Date.now() - startTime;

    // 儲存快照到 AiDecision
    if (Object.keys(snapshotData).length > 0) {
      await prisma.aiDecision.update({
        where: { id: decisionId },
        data:  { snapshotData },
      });
    }

    await logToolCall(decisionId, toolName, params, result, true, null, duration);
    log('success', `   → 執行成功（${duration}ms）`);
    return { executed: true, staging: false, result };

  } catch (err) {
    const duration = Date.now() - startTime;
    await logToolCall(decisionId, toolName, params, null, false, err.message, duration);
    log('error', `   → 執行失敗: ${err.message}`);
    throw err;
  }
}

// ════════════════════════════════════════════════════════════
// 一鍵還原（Rollback）
// ════════════════════════════════════════════════════════════

/**
 * 一鍵還原
 * 從 AiDecision.snapshotData 恢復所有被修改的任務/專案到原始狀態
 *
 * @param {number} decisionId
 * @param {number} rolledBackBy - 執行還原的用戶 ID
 * @returns {Promise<{success: boolean, restored: number}>}
 */
async function rollback(decisionId, rolledBackBy) {
  const decision = await prisma.aiDecision.findUnique({ where: { id: decisionId } });
  if (!decision)          throw new Error(`AiDecision #${decisionId} 不存在`);
  if (!decision.snapshotData || Object.keys(decision.snapshotData).length === 0) {
    throw new Error(`AiDecision #${decisionId} 沒有快照資料，無法還原`);
  }

  log('info', `開始還原 AiDecision #${decisionId}...`);

  const snapshot = decision.snapshotData;
  let restoredCount = 0;

  // ── 還原任務日期/狀態/負責人 ─────────────────────────────
  if (snapshot.tasks && Array.isArray(snapshot.tasks)) {
    for (const task of snapshot.tasks) {
      await prisma.task.update({
        where: { id: task.id },
        data: {
          dueDate:        task.dueDate       ? new Date(task.dueDate) : null,
          status:         task.status,
          assigneeId:     task.assigneeId,
          estimatedHours: task.estimatedHours,
          priority:       task.priority,
        },
      });
      restoredCount++;
    }
    log('info', `   還原了 ${snapshot.tasks.length} 個任務`);
  }

  // ── 還原專案（endDate、status）───────────────────────────
  if (snapshot.project) {
    await prisma.project.update({
      where: { id: snapshot.project.id },
      data: {
        endDate: snapshot.project.endDate ? new Date(snapshot.project.endDate) : null,
        status:  snapshot.project.status,
      },
    });
    restoredCount++;
    log('info', `   還原了專案 #${snapshot.project.id}`);
  }

  // ── 更新 AiDecision 狀態 ─────────────────────────────────
  await prisma.aiDecision.update({
    where: { id: decisionId },
    data: {
      status:       'rolled_back',
      rolledBackAt: new Date(),
      rolledBackBy: rolledBackBy || null,
    },
  });

  log('success', `還原完成：AiDecision #${decisionId}，共還原 ${restoredCount} 筆資料`);
  return { success: true, restored: restoredCount };
}

// ════════════════════════════════════════════════════════════
// 審批流程
// ════════════════════════════════════════════════════════════

/**
 * 批准 Staging 中的決策（人類 1-click 審批）
 * @param {number} decisionId
 * @param {number} approvedById
 */
async function approveAction(decisionId, approvedById) {
  const decision = await prisma.aiDecision.findUnique({ where: { id: decisionId } });
  if (!decision) throw new Error(`AiDecision #${decisionId} 不存在`);
  if (decision.status !== 'staging') {
    throw new Error(`決策 #${decisionId} 狀態為 "${decision.status}"，非 staging，無法審批`);
  }

  await prisma.aiDecision.update({
    where: { id: decisionId },
    data: {
      status:      'approved',
      approvedById: approvedById,
      approvedAt:  new Date(),
    },
  });

  log('success', `決策 #${decisionId} 已由用戶 #${approvedById} 批准`);
  return { approved: true };
}

/**
 * 拒絕 Staging 中的決策
 * @param {number} decisionId
 * @param {number} userId
 * @param {string} note
 */
async function rejectAction(decisionId, userId, note = '') {
  await prisma.aiDecision.update({
    where: { id: decisionId },
    data: {
      status:        'rejected',
      rejectedAt:    new Date(),
      rejectionNote: note,
    },
  });

  log('info', `決策 #${decisionId} 已由用戶 #${userId} 拒絕：${note}`);
  return { rejected: true };
}

/**
 * 取得所有 Staging 中（等待審批）的決策清單
 * @param {number} [companyId]
 */
async function getStagingActions(companyId) {
  // Prisma 不支援直接過濾 JSON 欄位的 companyId，改用 application-level filter
  const decisions = await prisma.aiDecision.findMany({
    where:   { status: 'staging' },
    orderBy: { createdAt: 'desc' },
    take:    50,
  });

  if (!companyId) return decisions;

  return decisions.filter(d => {
    const obs = d.observations;
    return obs && obs.companyId === companyId;
  });
}

// ════════════════════════════════════════════════════════════
// 工具函式
// ════════════════════════════════════════════════════════════

async function logToolCall(decisionId, toolName, toolInput, toolOutput, success, errorMessage, durationMs) {
  try {
    await prisma.aiAgentLog.create({
      data: {
        decisionId,
        toolName,
        toolInput:    toolInput   || {},
        toolOutput:   toolOutput  || null,
        success,
        errorMessage: errorMessage || null,
        durationMs:   durationMs   || 0,
      },
    });
  } catch (logErr) {
    // 記錄失敗不影響主流程
    log('warn', `AiAgentLog 記錄失敗: ${logErr.message}`);
  }
}

function log(level, msg) {
  const icons = { info: '🛡️', warn: '⚠️', error: '❌', success: '✅' };
  process.stderr.write(`[SafetyGuard] ${icons[level] || '•'} ${msg}\n`);
}

// ── 對外匯出 ──────────────────────────────────────────────
module.exports = {
  executeAction,
  rollback,
  approveAction,
  rejectAction,
  getStagingActions,
  classifyRisk,
  RISK_MATRIX,
};
