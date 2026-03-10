'use strict';
/**
 * services/autonomous-agent/agents/schedulerAgent.js
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS — AI 排程代理（CPM + 自動救火模式）
 *
 * 職責：
 *   1. 建立任務依賴有向無環圖（DAG）
 *   2. CPM（關鍵路徑法）計算，識別關鍵路徑任務
 *   3. 自動救火模式（Auto-Firefighting）
 *      - 關鍵路徑任務 delay > 1 天自動觸發
 *      - 計算後續依賴影響範圍（BFS 廣度優先搜尋）
 *      - 尋找可調配資源（工作量最輕、且不過載的成員）
 *      - 透過 SafetyGuard L2（需人類審批）重排程
 *      - 通知 PM + 受影響成員
 *      - 建立「風險管理任務」追蹤處理進度
 *      - 記錄完整決策鏈到 ai_agent_logs
 *   4. 專案快照（供 SafetyGuard 一鍵還原）
 *   5. 整個專案比例縮放重排程
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../../../.env') });

const { PrismaClient } = require('@prisma/client');
const prisma      = new PrismaClient({ log: ['error'] });
const SafetyGuard = require('../decisionEngine/safetyGuard');

// ════════════════════════════════════════════════════════════
// 自動救火模式（Auto-Firefighting）
// ════════════════════════════════════════════════════════════

/**
 * 自動救火：當一個關鍵路徑任務 delay 超過 1 天時觸發
 *
 * 完整流程（6 步驟）：
 *   1. 載入逾期任務 + 所有後續依賴任務
 *   2. 建立 DAG，計算 CPM，確認關鍵路徑
 *   3. 計算影響範圍（哪些任務會 delay 以及 delay 幾天）
 *   4. 尋找可調配資源（工作量最輕的成員）
 *   5. 透過 SafetyGuard 提交重排程計劃（L2，等待人類審批）
 *   6. 建立通知 + 風險管理任務
 *
 * @param {number} delayedTaskId  - 逾期的任務 ID
 * @param {number} decisionId     - 對應的 AiDecision ID（記錄鏈）
 * @param {Object} observations   - agentLoop 的觀測資料（含 workload）
 */
async function autoFirefight(delayedTaskId, decisionId, observations) {
  log('info', `🚒 自動救火啟動 → 任務 #${delayedTaskId}`);

  // ── 步驟 1：載入逾期任務詳情 ─────────────────────────────
  const delayedTask = await prisma.task.findUnique({
    where:   { id: delayedTaskId },
    include: {
      project:  {
        include: { owner: { select: { id: true, name: true, email: true } } },
      },
      assignee: { select: { id: true, name: true, email: true } },
    },
  });

  if (!delayedTask) {
    log('warn', `任務 #${delayedTaskId} 不存在，跳過救火`);
    return;
  }

  const daysOverdue = delayedTask.dueDate
    ? Math.ceil((new Date() - new Date(delayedTask.dueDate)) / 86400_000)
    : 1;

  log('info', `   任務: "${delayedTask.title}" (逾期 ${daysOverdue} 天)`);
  log('info', `   所屬專案: "${delayedTask.project.name}" (#${delayedTask.projectId})`);

  // ── 步驟 2：建立依賴圖 + 計算 CPM ─────────────────────────
  const { graph, tasks: allTasks } = await buildDependencyGraph(delayedTask.projectId);
  const criticalPath               = findCriticalPath(allTasks, graph);
  const isOnCriticalPath           = criticalPath.some(t => t.id === delayedTaskId);

  log('info', `   關鍵路徑: ${isOnCriticalPath ? '✅ 是（高優先）' : '否（非關鍵，風險較低）'}`);
  log('info', `   關鍵路徑長度: ${criticalPath.length} 個任務`);

  // ── 步驟 3：計算影響範圍（BFS）───────────────────────────
  const impactedTasks = findDependentTasks(delayedTaskId, graph, allTasks, daysOverdue);
  log('info', `   影響範圍: ${impactedTasks.length} 個後續任務需調整日期`);

  // ── 步驟 4：尋找可調配資源 ───────────────────────────────
  const availableResources = findAvailableResources(
    observations.workload || [],
    delayedTask.assigneeId
  );
  log('info', `   可調配資源: ${availableResources.length} 人`);

  // ── 步驟 5：快照 + 透過 SafetyGuard 提交重排程（L2）──────
  const rescheduleChanges = buildRescheduleChanges(impactedTasks, daysOverdue);

  await SafetyGuard.executeAction({
    decisionId,
    toolName:  'cascade_reschedule',
    riskLevel: 2, // L2：需要人類 1-click 審批
    params: {
      delayedTaskId,
      daysOverdue,
      isOnCriticalPath,
      impactedTaskIds: impactedTasks.map(t => t.id),
      changes:         rescheduleChanges,
    },
    snapshot: async () => snapshotProject(delayedTask.projectId),
    execute:  async () => applyCascadeReschedule(rescheduleChanges, decisionId),
  });

  // ── 步驟 6：通知 + 風險任務 ──────────────────────────────
  await sendFirefightNotifications(delayedTask, impactedTasks, daysOverdue, decisionId);
  await createRiskManagementTask(
    delayedTask, impactedTasks, daysOverdue, availableResources, decisionId
  );

  log('success',
    `🚒 自動救火完成 → 任務 #${delayedTaskId}` +
    `（${impactedTasks.length} 個任務已排入審批佇列，決策 #${decisionId}）`
  );
}

// ════════════════════════════════════════════════════════════
// CPM（關鍵路徑法）
// ════════════════════════════════════════════════════════════

/**
 * 建立專案任務的有向無環圖（DAG）
 * graph[A] = [B, C] 表示 A 完成後，B 和 C 才能開始
 *
 * @param {number} projectId
 * @returns {Promise<{graph: Map, tasks: Array}>}
 */
async function buildDependencyGraph(projectId) {
  const [tasks, dependencies] = await Promise.all([
    prisma.task.findMany({
      where:  { projectId, deletedAt: null },
      select: {
        id: true, title: true, status: true, priority: true,
        dueDate: true, estimatedHours: true, assigneeId: true,
      },
    }),
    prisma.taskDependency.findMany({
      where:  { task: { projectId } },
      select: { taskId: true, dependsOnTaskId: true, dependencyType: true },
    }),
  ]);

  // 前向圖（predecessor → successors）
  const graph = new Map();
  for (const task of tasks) graph.set(task.id, []);

  for (const dep of dependencies) {
    if (!graph.has(dep.dependsOnTaskId)) graph.set(dep.dependsOnTaskId, []);
    graph.get(dep.dependsOnTaskId).push(dep.taskId);
  }

  return { graph, tasks };
}

/**
 * 拓撲排序 + CPM 計算關鍵路徑（浮動時間 = 0 的任務）
 *
 * @param {Array} tasks
 * @param {Map}   graph - 前向鄰接表（predecessor → successors）
 * @returns {Array} 關鍵路徑任務（含 ef/lf/float/duration）
 */
function findCriticalPath(tasks, graph) {
  if (!tasks || tasks.length === 0) return [];

  // 計算每個任務的工期（天數，預設 1 天）
  const duration = {};
  for (const task of tasks) {
    const hours = parseFloat(task.estimatedHours || 8);
    duration[task.id] = Math.max(1, Math.ceil(hours / 8)); // 8 小時/天
  }

  // 計算入度（in-degree）
  const inDegree = {};
  for (const task of tasks) inDegree[task.id] = 0;
  for (const [, successors] of graph) {
    for (const succ of successors) inDegree[succ] = (inDegree[succ] || 0) + 1;
  }

  // Kahn's Algorithm 拓撲排序
  const queue     = tasks.filter(t => (inDegree[t.id] || 0) === 0).map(t => t.id);
  const topoOrder = [];

  while (queue.length > 0) {
    const taskId = queue.shift();
    topoOrder.push(taskId);
    for (const succ of (graph.get(taskId) || [])) {
      inDegree[succ]--;
      if (inDegree[succ] === 0) queue.push(succ);
    }
  }

  // Forward Pass：計算最早完成時間（EF）
  const ef = {};
  for (const id of topoOrder) {
    let maxPredEF = 0;
    for (const [pred, succs] of graph) {
      if (succs.includes(id)) maxPredEF = Math.max(maxPredEF, ef[pred] || 0);
    }
    ef[id] = maxPredEF + (duration[id] || 1);
  }

  // Backward Pass：計算最晚完成時間（LF）
  const projectDuration = Math.max(...Object.values(ef), 0);
  const lf = {};
  for (const id of [...topoOrder].reverse()) {
    const successors = graph.get(id) || [];
    if (successors.length === 0) {
      lf[id] = projectDuration;
    } else {
      lf[id] = Math.min(...successors.map(s => (lf[s] || projectDuration) - (duration[s] || 1)));
    }
  }

  // Float = LF - EF（float=0 的任務在關鍵路徑上）
  const criticalTasks = tasks.filter(t => Math.round(lf[t.id] - ef[t.id]) === 0);

  return criticalTasks.map(t => ({
    ...t,
    ef:       ef[t.id],
    lf:       lf[t.id],
    float:    0,
    duration: duration[t.id],
  }));
}

/**
 * BFS 找出所有依賴指定任務的後續任務（影響範圍）
 *
 * @param {number} taskId     - 逾期任務 ID
 * @param {Map}    graph      - 前向鄰接表
 * @param {Array}  allTasks   - 所有任務資料
 * @param {number} delayDays  - 逾期天數（用於計算新截止日）
 * @returns {Array} 受影響任務列表（含 originalDueDate、newDueDate）
 */
function findDependentTasks(taskId, graph, allTasks, delayDays) {
  const visited = new Set([taskId]);
  const queue   = [taskId];
  const affected = [];
  const taskMap  = Object.fromEntries(allTasks.map(t => [t.id, t]));

  while (queue.length > 0) {
    const current    = queue.shift();
    const successors = graph.get(current) || [];

    for (const succ of successors) {
      if (visited.has(succ)) continue;
      visited.add(succ);
      queue.push(succ);

      const task = taskMap[succ];
      if (task) {
        const originalDue = task.dueDate ? new Date(task.dueDate) : new Date();
        const newDueDate  = new Date(originalDue.getTime() + delayDays * 86400_000);
        affected.push({
          ...task,
          originalDueDate:  task.dueDate,
          newDueDate,
          cascadeDelayDays: delayDays,
        });
      }
    }
  }

  return affected;
}

/**
 * 從觀測資料中尋找可調配的資源
 * 條件：非過載、緊急任務少、工作量最輕
 *
 * @param {Array}  workload   - observations.workload
 * @param {number} excludeId  - 排除原本的負責人
 * @returns {Array} 建議可調配人員（最多 3 人）
 */
function findAvailableResources(workload, excludeId) {
  return workload
    .filter(u => u.userId !== excludeId && !u.isOverloaded && u.urgentTasks < 3)
    .sort((a, b) => a.totalTasks - b.totalTasks) // 工作最少的排前面
    .slice(0, 3);
}

/**
 * 建立重排程變更清單
 */
function buildRescheduleChanges(impactedTasks, delayDays) {
  return impactedTasks.map(task => ({
    taskId:          task.id,
    taskTitle:       task.title,
    originalDueDate: task.originalDueDate,
    newDueDate:      task.newDueDate,
    delayDays:       task.cascadeDelayDays || delayDays,
    reason:          `關聯前置任務逾期 ${delayDays} 天，AI 自動串聯調整`,
  }));
}

/**
 * 執行串聯重排程（在 SafetyGuard 審批後呼叫）
 * 更新所有受影響任務的截止日，並記錄 ActivityLog
 *
 * @param {Array}  changes
 * @param {number} decisionId
 */
async function applyCascadeReschedule(changes, decisionId) {
  const results = [];

  for (const change of changes) {
    await prisma.task.update({
      where: { id: change.taskId },
      data:  { dueDate: new Date(change.newDueDate) },
    });

    // 注意：ActivityLog 需要 userId（人類用戶），AI 操作不寫入
    // 決策鏈已透過 AiDecision + AiAgentLog 完整記錄

    results.push({ taskId: change.taskId, updated: true });
  }

  log('success', `串聯重排程完成：${results.length} 個任務日期已調整`);
  return results;
}

// ════════════════════════════════════════════════════════════
// 通知 + 風險管理任務
// ════════════════════════════════════════════════════════════

/**
 * 發送救火通知（PM + 受影響成員）
 */
async function sendFirefightNotifications(delayedTask, impactedTasks, daysOverdue, decisionId) {
  const notifications = [];
  const notifiedUsers = new Set();

  // 通知 PM（專案負責人）
  const pmId = delayedTask.project?.owner?.id;
  if (pmId) {
    notifications.push({
      recipientId:  pmId,
      type:         'task_overdue',
      title:        `🚒 AI 救火通知：任務逾期 ${daysOverdue} 天`,
      message:
        `任務「${delayedTask.title}」已逾期 ${daysOverdue} 天，` +
        `影響後續 ${impactedTasks.length} 個任務。` +
        `AI 已自動計算重排程計劃，請至「AI 決策中心」審批（決策 #${decisionId}）。`,
      resourceType: 'task',
      resourceId:   delayedTask.id,
    });
    notifiedUsers.add(pmId);
  }

  // 通知任務負責人（若不是 PM）
  const assigneeId = delayedTask.assigneeId;
  if (assigneeId && !notifiedUsers.has(assigneeId)) {
    notifications.push({
      recipientId:  assigneeId,
      type:         'task_overdue',
      title:        `⚠️ 您的任務已逾期 ${daysOverdue} 天`,
      message:
        `您負責的任務「${delayedTask.title}」已逾期 ${daysOverdue} 天，` +
        `請盡快處理或聯繫 PM 協調資源。`,
      resourceType: 'task',
      resourceId:   delayedTask.id,
    });
    notifiedUsers.add(assigneeId);
  }

  // 通知受影響任務的負責人（去重，最多 5 人）
  for (const affected of impactedTasks) {
    if (notifiedUsers.size >= 10) break;
    if (!affected.assigneeId || notifiedUsers.has(affected.assigneeId)) continue;

    notifications.push({
      recipientId:  affected.assigneeId,
      type:         'task_assigned',
      title:        `📅 您的任務截止日受 AI 自動調整影響`,
      message:
        `由於前置任務逾期 ${daysOverdue} 天，您的任務「${affected.title}」` +
        `截止日預計從 ${formatDate(affected.originalDueDate)} 調整為 ${formatDate(affected.newDueDate)}。` +
        `調整方案需 PM 審批後才會正式生效。`,
      resourceType: 'task',
      resourceId:   affected.id,
    });
    notifiedUsers.add(affected.assigneeId);
  }

  if (notifications.length > 0) {
    await prisma.notification.createMany({ data: notifications });
    log('info', `   已建立 ${notifications.length} 則通知`);
  }
}

/**
 * 建立風險管理任務（追蹤救火進度）
 */
async function createRiskManagementTask(delayedTask, impactedTasks, daysOverdue, resources, decisionId) {
  const resourceSuggestion = resources.length > 0
    ? `\n\n**建議可調配資源：**\n${resources.map(r =>
        `- ${r.name}（目前 ${r.totalTasks} 個任務，工作量最輕）`
      ).join('\n')}`
    : '\n\n**注意：** 目前找不到明顯空閒人員，請 PM 手動協調資源。';

  const impactList = impactedTasks
    .slice(0, 10)
    .map(t => `- ${t.title}：${formatDate(t.originalDueDate)} → ${formatDate(t.newDueDate)}`)
    .join('\n');

  const riskTask = await prisma.task.create({
    data: {
      projectId:   delayedTask.projectId,
      title:       `🤖 [AI 救火] ${delayedTask.title} — 逾期 ${daysOverdue} 天風險處理`,
      description:
        `## AI 自動救火報告\n\n` +
        `**觸發原因：** 任務「${delayedTask.title}」逾期 ${daysOverdue} 天\n` +
        `**影響範圍：** 後續 ${impactedTasks.length} 個任務需重排程\n` +
        `**AI 決策 ID：** #${decisionId}（可至「AI 決策中心」查看推理鏈與審批重排程）\n\n` +
        `### 受影響任務清單\n${impactList}` +
        (impactedTasks.length > 10 ? `\n...等 ${impactedTasks.length - 10} 個任務` : '') +
        `${resourceSuggestion}\n\n` +
        `### 處理 Checklist\n` +
        `- [ ] 1. 至 AI 決策中心確認並審批重排程計劃\n` +
        `- [ ] 2. 與原任務負責人確認延誤根本原因\n` +
        `- [ ] 3. 依需求調配人力資源\n` +
        `- [ ] 4. 評估是否需通知客戶或主管調整交付日期\n` +
        `- [ ] 5. 更新專案風險登記表`,
      status:      'todo',
      priority:    'urgent',
      assigneeId:  delayedTask.project?.owner?.id || null,
      dueDate:     new Date(Date.now() + 1 * 86400_000), // 明天截止
    },
  });

  log('info', `   已建立風險管理任務 #${riskTask.id}`);
  return riskTask;
}

// ════════════════════════════════════════════════════════════
// 快照 + 整體重排程
// ════════════════════════════════════════════════════════════

/**
 * 擷取專案快照（供 SafetyGuard 一鍵還原）
 * @param {number} projectId
 * @returns {Promise<Object>} snapshotData
 */
async function snapshotProject(projectId) {
  const [project, tasks] = await Promise.all([
    prisma.project.findUnique({
      where:  { id: projectId },
      select: { id: true, status: true, endDate: true },
    }),
    prisma.task.findMany({
      where:  { projectId, deletedAt: null },
      select: {
        id: true, title: true, status: true, dueDate: true,
        assigneeId: true, estimatedHours: true, priority: true,
      },
    }),
  ]);

  return {
    snapshotAt: new Date().toISOString(),
    projectId,
    project,
    tasks,
  };
}

/**
 * 重排程整個專案（比例縮放調整所有未完成任務的截止日）
 *
 * @param {number}       projectId
 * @param {string|Date}  newEndDate - 新的專案結束日期
 * @param {string}       reason
 * @returns {Promise<{updated: number, projectUpdated: boolean}>}
 */
async function rescheduleProject(projectId, newEndDate, reason = 'AI 自動重排程') {
  const project = await prisma.project.findUnique({
    where:   { id: projectId },
    include: {
      tasks: {
        where:   { deletedAt: null, status: { not: 'done' } },
        orderBy: { dueDate: 'asc' },
      },
    },
  });

  if (!project) throw new Error(`專案 #${projectId} 不存在`);

  const targetEnd  = new Date(newEndDate);
  const currentEnd = project.endDate ? new Date(project.endDate) : null;

  if (!currentEnd) {
    // 若無原始截止日，只更新專案截止日
    await prisma.project.update({ where: { id: projectId }, data: { endDate: targetEnd } });
    return { updated: 0, projectUpdated: true };
  }

  // 比例縮放：依照原始時程比例重新分配所有任務截止日
  const projectStart   = project.startDate ? new Date(project.startDate) : new Date();
  const originalSpan   = currentEnd - projectStart;
  const newSpan        = targetEnd  - projectStart;
  let updatedCount     = 0;

  for (const task of project.tasks) {
    if (!task.dueDate) continue;
    const taskDue    = new Date(task.dueDate);
    const progress   = originalSpan > 0 ? (taskDue - projectStart) / originalSpan : 1;
    const newTaskDue = new Date(projectStart.getTime() + progress * newSpan);

    await prisma.task.update({
      where: { id: task.id },
      data:  { dueDate: newTaskDue },
    });
    updatedCount++;
  }

  // 更新專案截止日
  await prisma.project.update({ where: { id: projectId }, data: { endDate: targetEnd } });

  log('success', `專案 #${projectId} 重排程完成：${updatedCount} 個任務日期已調整（原因：${reason}）`);
  return { updated: updatedCount, projectUpdated: true };
}

// ════════════════════════════════════════════════════════════
// 工具函式
// ════════════════════════════════════════════════════════════

function formatDate(date) {
  if (!date) return '無截止日';
  return new Date(date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
}

function log(level, msg) {
  const icons = { info: '📅', warn: '⚠️', error: '❌', success: '✅' };
  process.stderr.write(`[SchedulerAgent] ${icons[level] || '•'} ${msg}\n`);
}

// ── 對外匯出 ──────────────────────────────────────────────
module.exports = {
  autoFirefight,
  buildDependencyGraph,
  findCriticalPath,
  findDependentTasks,
  findAvailableResources,
  snapshotProject,
  rescheduleProject,
  applyCascadeReschedule,
};
