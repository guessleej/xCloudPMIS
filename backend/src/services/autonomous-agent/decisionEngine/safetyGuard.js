'use strict';
/**
 * services/autonomous-agent/decisionEngine/safetyGuard.js
 * ─────────────────────────────────────────────────────────────
 * Human-in-the-Loop 執行守衛
 *
 * 功能：
 *   - approveAction(id, userId)        — 批准 Staging 決策並觸發執行
 *   - rejectAction(id, userId, note)   — 拒絕決策並記錄原因
 *   - rollback(id, userId)             — 回滾已完成決策至快照狀態
 *   - executeDecision(id)              — 直接執行（L1 自動觸發 / 批准後呼叫）
 *
 * 決策狀態流程：
 *   pending → staging → approved → executing → completed
 *                   ↘ rejected
 *   completed → rolled_back
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['error'] });

// ════════════════════════════════════════════════════════════
// 公開 API
// ════════════════════════════════════════════════════════════

/**
 * 批准 Staging 決策，觸發非同步執行
 * @param {number} decisionId
 * @param {number} userId
 */
async function approveAction(decisionId, userId) {
  await prisma.aiDecision.update({
    where: { id: decisionId },
    data: {
      status:       'approved',
      approvedById: userId,
      approvedAt:   new Date(),
    },
  });

  // 非同步執行，不阻塞 HTTP 回應
  setImmediate(() =>
    executeDecision(decisionId).catch(err =>
      console.error(`[SafetyGuard] 執行決策 #${decisionId} 失敗:`, err.message)
    )
  );

  return { status: 'approved', executing: true };
}

/**
 * 拒絕決策
 * @param {number} decisionId
 * @param {number} userId
 * @param {string} note
 */
async function rejectAction(decisionId, userId, note) {
  await prisma.aiDecision.update({
    where: { id: decisionId },
    data: {
      status:        'rejected',
      rejectedAt:    new Date(),
      rejectionNote: note,
    },
  });

  await _logAction(decisionId, 'reject', { userId, note }, { rejected: true }, true, 0);
}

/**
 * 回滾已完成決策（從 snapshotData 恢復狀態）
 * @param {number} decisionId
 * @param {number} userId
 */
async function rollback(decisionId, userId) {
  const decision = await prisma.aiDecision.findUnique({
    where:  { id: decisionId },
    select: { snapshotData: true },
  });

  if (!decision?.snapshotData) {
    throw new Error('此決策無快照資料，無法回滾');
  }

  const t0 = Date.now();
  try {
    await _restoreSnapshot(decision.snapshotData);

    await prisma.aiDecision.update({
      where: { id: decisionId },
      data: {
        status:       'rolled_back',
        rolledBackAt: new Date(),
        rolledBackBy: userId,
        reflection:   `已由使用者 #${userId} 手動回滾，執行前狀態已還原。`,
      },
    });

    await _logAction(
      decisionId, 'rollback',
      { userId },
      { restored: true, tasks: (decision.snapshotData.tasks || []).length },
      true, Date.now() - t0
    );

  } catch (err) {
    await _logAction(decisionId, 'rollback', { userId }, null, false, Date.now() - t0, err.message);
    throw err;
  }
}

/**
 * 執行決策（可由 approveAction 呼叫，或 Agent Loop 直接呼叫）
 * @param {number} decisionId
 */
async function executeDecision(decisionId) {
  const decision = await prisma.aiDecision.findUnique({
    where: { id: decisionId },
    include: {
      project: { select: { id: true, name: true } },
      task:    { select: { id: true, title: true } },
    },
  });

  if (!decision) {
    throw new Error(`找不到決策 #${decisionId}`);
  }
  if (!['approved', 'pending'].includes(decision.status)) {
    console.warn(`[SafetyGuard] 決策 #${decisionId} 狀態為 ${decision.status}，跳過執行`);
    return;
  }

  // 更新狀態為「執行中」
  await prisma.aiDecision.update({
    where: { id: decisionId },
    data:  { status: 'executing' },
  });

  const plan    = (decision.plan && typeof decision.plan === 'object') ? decision.plan : {};
  const actions = Array.isArray(plan.actions) ? plan.actions : [];
  const results = [];
  let   allSucceeded = true;

  for (const action of actions) {
    const t0  = Date.now();
    let result = null;
    let actionOk = true;
    let errMsg   = null;

    try {
      result = await _executeAction(action, decision);
    } catch (e) {
      actionOk     = false;
      errMsg       = e.message;
      allSucceeded = false;
      console.error(`[SafetyGuard] Action 失敗 [${action.type}]:`, e.message);
    }

    results.push({ ...action, success: actionOk, result });
    await _logAction(decisionId, action.type || 'unknown', action, result, actionOk, Date.now() - t0, errMsg);
  }

  const finalStatus = allSucceeded ? 'completed' : 'failed';
  const reflection  = allSucceeded
    ? `執行完成。共 ${actions.length} 個動作，全部成功。`
    : `部分執行失敗（${results.filter(r => !r.success).length}/${actions.length} 個動作失敗）。`;

  await prisma.aiDecision.update({
    where: { id: decisionId },
    data: {
      status:       finalStatus,
      actions:      results,
      reflection,
      humanAdopted: true,
    },
  });

  console.log(`[SafetyGuard] 決策 #${decisionId} ${finalStatus}：${reflection}`);
}

// ════════════════════════════════════════════════════════════
// 內部：執行單一 Action
// ════════════════════════════════════════════════════════════

async function _executeAction(action, decision) {
  switch (action.type) {
    case 'update_task_due_date':
      return await _updateTaskDueDate(action.taskId, action.newDueDate, action.taskTitle);

    case 'update_task_status':
      return await _updateTaskStatus(action.taskId, action.newStatus);

    case 'send_notification':
      // 目前記錄到 console，後續可接 email / LINE notify
      console.log(`[SafetyGuard] 📣 通知 [${action.owner || '未指定'}]：${action.message}`);
      return { notified: true, channel: 'console', message: action.message };

    case 'create_activity_log':
      return await _createActivityLog(action);

    default:
      console.warn(`[SafetyGuard] 未知 action 類型：${action.type}，跳過`);
      return { skipped: true, reason: `未知 action 類型：${action.type}` };
  }
}

async function _updateTaskDueDate(taskId, newDueDate, taskTitle) {
  if (!taskId) return { skipped: true, reason: 'taskId 未提供' };

  const updated = await prisma.task.update({
    where: { id: taskId },
    data:  { dueDate: new Date(newDueDate) },
    select: { id: true, title: true, dueDate: true },
  });

  console.log(`[SafetyGuard] ✅ 任務 #${taskId}「${taskTitle || updated.title}」截止日 → ${newDueDate}`);
  return { updated: true, taskId, newDueDate };
}

async function _updateTaskStatus(taskId, newStatus) {
  if (!taskId) return { skipped: true, reason: 'taskId 未提供' };

  const updated = await prisma.task.update({
    where: { id: taskId },
    data:  { status: newStatus },
    select: { id: true, title: true, status: true },
  });

  return { updated: true, taskId, newStatus };
}

async function _createActivityLog(action) {
  if (!action.taskId) return { skipped: true, reason: 'taskId 未提供' };

  const log = await prisma.activityLog.create({
    data: {
      taskId:   action.taskId,
      userId:   action.userId || 1,
      action:   action.action || 'ai_action',
      oldValue: action.oldValue ?? null,
      newValue: action.newValue ?? null,
    },
  });

  return { created: true, logId: log.id };
}

// ════════════════════════════════════════════════════════════
// 內部：快照還原
// ════════════════════════════════════════════════════════════

async function _restoreSnapshot(snapshotData) {
  const tasks = snapshotData.tasks || [];
  let restored = 0;

  for (const t of tasks) {
    try {
      await prisma.task.update({
        where: { id: t.id },
        data:  {
          status:  t.status,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
        },
      });
      restored++;
    } catch (err) {
      // 任務可能已刪除，靜默略過
      console.warn(`[SafetyGuard] 還原任務 #${t.id} 失敗:`, err.message);
    }
  }

  console.log(`[SafetyGuard] 快照還原完成，共還原 ${restored} 個任務`);
}

// ════════════════════════════════════════════════════════════
// 內部：記錄 AiAgentLog
// ════════════════════════════════════════════════════════════

async function _logAction(decisionId, toolName, toolInput, toolOutput, success, durationMs, errorMessage = null) {
  try {
    await prisma.aiAgentLog.create({
      data: {
        decisionId,
        toolName,
        toolInput:    toolInput  || {},
        toolOutput:   toolOutput || null,
        success,
        errorMessage: errorMessage || null,
        durationMs:   durationMs || 0,
      },
    });
  } catch (e) {
    console.error('[SafetyGuard] 記錄日誌失敗:', e.message);
  }
}

module.exports = { approveAction, rejectAction, rollback, executeDecision };
