/**
 * automationRuleService — 自動化規則評估與執行引擎
 *
 * 支援觸發類型：
 *   task_created         任務被建立時
 *   task_completed       任務標記為完成時
 *   status_changed       任務狀態變更時
 *   assignee_changed     任務負責人變更時
 *   due_date_approaching 任務截止日 N 天內（排程觸發）
 *   field_changed        任何欄位值變更
 *
 * conditions JSON 格式：
 *   { field, operator, value }[]
 *   field: 'status' | 'priority' | 'assigneeId' | 'projectId' | 'title'
 *   operator: 'eq' | 'neq' | 'contains' | 'in' | 'not_in'
 *
 * actions JSON 格式：
 *   { type, config }[]
 *   type: 'set_status' | 'set_priority' | 'set_assignee' | 'send_notification'
 *   config: { value, message, recipientType }
 */
const prisma = require('../lib/prisma');

const SYSTEM_RULE_KEY = '__system_task_completed__';

// ─── 條件評估 ──────────────────────────────────────────────

/**
 * 評估單一條件
 * @param {object} task        — 任務 afterTask 資料
 * @param {object} condition   — { field, operator, value }
 * @param {object} [ctx]       — 額外上下文 { beforeTask }
 */
function evaluateCondition(task, condition, ctx = {}) {
  const { field, operator, value } = condition;

  // ── 觸發專屬 meta 條件（以 _ 開頭的 field） ─────────

  if (field === '_days_before') {
    // due_date_approaching: 檢查任務截止日是否在 N 天內
    if (!task.dueDate) return false;
    const due  = new Date(task.dueDate);
    const now  = new Date();
    const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= parseInt(value);
  }

  if (field === '_from_status') {
    // status_changed: 變更前的狀態
    return ctx.beforeTask ? String(ctx.beforeTask.status) === String(value) : true;
  }

  if (field === '_to_status') {
    // status_changed: 變更後的狀態
    return String(task.status) === String(value);
  }

  if (field === '_changed_field') {
    // field_changed: 指定監聽哪個欄位
    if (!ctx.beforeTask) return false;
    return String(ctx.beforeTask[value]) !== String(task[value]);
  }

  // ── 一般任務欄位條件 ───────────────────────────────

  const actual = task[field];

  switch (operator) {
    case 'eq':       return String(actual) === String(value);
    case 'neq':      return String(actual) !== String(value);
    case 'contains': return actual && String(actual).includes(String(value));
    case 'in':       return Array.isArray(value) && value.map(String).includes(String(actual));
    case 'not_in':   return Array.isArray(value) && !value.map(String).includes(String(actual));
    default:         return false;
  }
}

function evaluateConditions(task, conditions, ctx = {}) {
  if (!Array.isArray(conditions) || conditions.length === 0) return true;
  return conditions.every(c => evaluateCondition(task, c, ctx));
}

// ─── 動作執行 ──────────────────────────────────────────────

async function executeActions(taskId, actions, actorId) {
  if (!Array.isArray(actions) || actions.length === 0) return [];
  const results = [];

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'set_status': {
          await prisma.task.update({
            where: { id: taskId },
            data:  { status: action.config.value },
          });
          results.push({ type: action.type, success: true, value: action.config.value });
          break;
        }
        case 'set_priority': {
          await prisma.task.update({
            where: { id: taskId },
            data:  { priority: action.config.value },
          });
          results.push({ type: action.type, success: true, value: action.config.value });
          break;
        }
        case 'set_assignee': {
          const userId = parseInt(action.config.value);
          if (!isNaN(userId)) {
            await prisma.task.update({
              where: { id: taskId },
              data:  { assigneeId: userId },
            });
            // 同步 assignee link
            await prisma.taskAssigneeLink.upsert({
              where:  { taskId_userId: { taskId, userId } },
              update: { isPrimary: true },
              create: { taskId, userId, isPrimary: true },
            });
          }
          results.push({ type: action.type, success: true, value: userId });
          break;
        }
        case 'send_notification': {
          // 取得收件人
          const task = await prisma.task.findUnique({
            where: { id: taskId },
            select: { assigneeId: true, createdById: true, projectId: true, title: true },
          });
          const recipients = new Set();
          const recipientType = action.config.recipientType || action.config.recipient || 'assignee';

          // 支援中文收件人類型映射
          const recipientMap = {
            'assignee': 'assignee', '負責人': 'assignee',
            'creator': 'creator', '建立者': 'creator',
            'project_owner': 'project_owner', '專案負責人': 'project_owner',
          };
          const normalizedRecipient = recipientMap[recipientType] || recipientType;

          if (normalizedRecipient === 'assignee' && task?.assigneeId) {
            recipients.add(task.assigneeId);
          } else if (normalizedRecipient === 'creator' && task?.createdById) {
            recipients.add(task.createdById);
          } else if (normalizedRecipient === 'project_owner' && task?.projectId) {
            const proj = await prisma.project.findUnique({
              where: { id: task.projectId }, select: { ownerId: true },
            });
            if (proj?.ownerId) recipients.add(proj.ownerId);
          }

          // 排除觸發者
          if (actorId) recipients.delete(actorId);

          if (recipients.size > 0) {
            const { createNotifications } = require('./notificationCenter');
            await createNotifications({
              prisma,
              recipients: [...recipients],
              type: 'automation_rule',
              title: action.config.message || `自動化規則觸發`,
              message: action.config.message || `任務「${task?.title}」觸發了自動化規則`,
              resourceType: 'task',
              resourceId: taskId,
            });
          }
          results.push({ type: action.type, success: true, recipientCount: recipients.size });
          break;
        }
        case 'add_comment': {
          // 自動在任務上新增留言
          const commentText = action.config.text || action.config.message || '自動化規則觸發';
          // 使用觸發者 → 任務建立者 → 任務負責人 作為留言者
          let commentUserId = actorId;
          if (!commentUserId) {
            const taskForComment = await prisma.task.findUnique({
              where: { id: taskId },
              select: { createdById: true, assigneeId: true },
            });
            commentUserId = taskForComment?.createdById || taskForComment?.assigneeId;
          }
          if (!commentUserId) {
            results.push({ type: action.type, success: false, error: '無法確定留言者（actorId / createdById / assigneeId 均為空）' });
            break;
          }
          await prisma.comment.create({
            data: {
              taskId,
              userId: commentUserId,
              content: `🤖 ${commentText}`,
              mentions: [],
            },
          });
          results.push({ type: action.type, success: true, text: commentText });
          break;
        }
        case 'move_to_section': {
          // 目前系統無 Section 模型，以設定狀態的方式模擬
          // 將「已完成」映射為 done，「進行中」映射為 in_progress 等
          const sectionMap = {
            '已完成': 'done', '完成': 'done', 'done': 'done', 'completed': 'done',
            '進行中': 'in_progress', 'in_progress': 'in_progress',
            '待辦': 'todo', 'todo': 'todo',
            '審核中': 'review', 'review': 'review',
          };
          const sectionName = action.config.section || action.config.value || '';
          const mappedStatus = sectionMap[sectionName];
          if (mappedStatus) {
            await prisma.task.update({
              where: { id: taskId },
              data:  { status: mappedStatus },
            });
            results.push({ type: action.type, success: true, section: sectionName, mappedStatus });
          } else {
            results.push({ type: action.type, success: false, error: `未知的分節名稱: ${sectionName}` });
          }
          break;
        }
        default:
          results.push({ type: action.type, success: false, error: 'unknown action type' });
      }
    } catch (e) {
      console.warn(`[automationRuleService] 執行動作失敗 (${action.type}):`, e.message);
      results.push({ type: action.type, success: false, error: e.message });
    }
  }
  return results;
}

// ─── 公開 API ──────────────────────────────────────────────

/**
 * 取得指定公司 + 觸發類型的啟用中規則
 */
async function getActiveRules(companyId, triggerType) {
  if (!companyId) return [];
  const where = {
    companyId,
    isEnabled:  true,
    deletedAt:  null,
    isSystem:   false,
  };
  if (triggerType) {
    where.triggerType = triggerType;
  }
  return prisma.automationRule.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * 針對一個事件，評估所有符合的規則並執行動作
 * @param {object} opts
 * @param {number} opts.companyId
 * @param {string} opts.triggerType — Prisma enum 值
 * @param {object} opts.task — 任務的 afterTask 資料
 * @param {object} [opts.beforeTask] — 變更前的資料（用於 status_changed 等）
 * @param {number} [opts.actorId]
 * @returns {{ triggered: number, results: object[] }}
 */
async function evaluateAndExecute({ companyId, triggerType, task, beforeTask, actorId }) {
  const rules = await getActiveRules(companyId, triggerType);
  if (rules.length === 0) return { triggered: 0, results: [] };

  const results = [];

  for (const rule of rules) {
    const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];

    // 評估條件（帶上下文：beforeTask 供 _from_status / _changed_field 等使用）
    if (!evaluateConditions(task, conditions, { beforeTask })) {
      results.push({ ruleId: rule.id, ruleName: rule.name, matched: false });
      continue;
    }

    // 條件通過 → 執行動作
    const actions = Array.isArray(rule.actions) ? rule.actions : [];
    const actionResults = await executeActions(task.id, actions, actorId);

    // 更新觸發計數
    await prisma.automationRule.update({
      where: { id: rule.id },
      data: {
        triggerCount:    { increment: 1 },
        lastTriggeredAt: new Date(),
      },
    });

    // 記錄執行紀錄
    await recordRuleExecution({
      ruleId:    rule.id,
      companyId,
      taskId:    task.id,
      projectId: task.projectId || null,
      triggeredById: actorId || null,
      status:    'success',
      context:   { triggerType, beforeTask, afterTask: task },
      result:    { actions: actionResults },
    });

    results.push({ ruleId: rule.id, ruleName: rule.name, matched: true, actions: actionResults });
    console.log(`⚡ [automationRule] 規則「${rule.name}」(#${rule.id}) 已觸發，任務 #${task.id}`);
  }

  return {
    triggered: results.filter(r => r.matched).length,
    results,
  };
}

/**
 * 記錄規則執行紀錄
 */
async function recordRuleExecution({ ruleId, companyId, taskId, projectId, triggeredById, status, context, result }) {
  try {
    await prisma.automationRuleRun.create({
      data: {
        ruleId,
        companyId,
        taskId:        taskId || null,
        projectId:     projectId || null,
        triggeredById: triggeredById || null,
        status:        status || 'success',
        context:       context || {},
        result:        result  || {},
      },
    });
  } catch (e) {
    console.warn('[automationRuleService] 記錄執行紀錄失敗:', e.message);
  }
}

module.exports = {
  SYSTEM_RULE_KEY,
  evaluateConditions,
  executeActions,
  getActiveRules,
  evaluateAndExecute,
  recordRuleExecution,
  automationRuleService: {
    getActiveRules,
    evaluateAndExecute,
    recordRuleExecution,
  },
};
