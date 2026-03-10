'use strict';
/**
 * services/autonomous-agent/core/agentLoop.js
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS — AI 自主代理核心引擎（ReAct 模式）
 *
 * 架構：ReAct (Reasoning + Acting) Pattern
 * ┌─────────────────────────────────────────────────────────────┐
 * │  每 15 分鐘觸發一次 AgentLoop                               │
 * │                                                             │
 * │  1. OBSERVE  → 讀取全公司專案狀態、任務、工時、依賴關係     │
 * │  2. REASON   → GPT-4 分析現況，識別需要行動的點             │
 * │               （完整 Chain of Thought 記錄到 DB）           │
 * │  3. PLAN     → 制定行動計劃（動作列表 + 優先順序）         │
 * │  4. ACT      → 透過 SafetyGuard 執行計劃（安全邊界內）     │
 * │               低風險 → 自動執行                             │
 * │               高風險 → 寫入 Staging，等待人類批准          │
 * │  5. REFLECT  → 記錄結果，更新 AI 學習回饋               │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 自動救火模式（Auto-Firefighting）：
 *   當 agentLoop 在 OBSERVE 階段偵測到關鍵路徑任務 delay > 1 天，
 *   觸發 SchedulerAgent.autoFirefight()，完整處理流程：
 *     1. 計算影響範圍（後續依賴任務）
 *     2. 尋找可調配資源
 *     3. 重新排程（CPM 計算）
 *     4. 通知 PM + 受影響成員
 *     5. 建立風險管理任務
 *     6. 記錄完整決策鏈
 *
 * 啟動方式：
 *   node services/autonomous-agent/core/agentLoop.js
 *   node services/autonomous-agent/core/agentLoop.js --run-now
 *
 * 環境變數：
 *   AGENT_LOOP_CRON      排程（預設 每15分鐘: "star/15 * * * *"）
 *   AGENT_COMPANY_ID     只處理此公司（dev 用）
 *   AGENT_DRY_RUN        true → 只分析不執行（安全測試）
 *   OPENAI_API_KEY       必填
 */

const path   = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../../../.env') });

const cron         = require('node-cron');
const { v4: uuid } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const OpenAI           = require('openai');

const SafetyGuard     = require('../decisionEngine/safetyGuard');
const SchedulerAgent  = require('../agents/schedulerAgent');
const RiskAgent       = require('../agents/riskAgent');

// ── 初始化 ───────────────────────────────────────────────────
const prisma = new PrismaClient({ log: ['error'] });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CRON_SCHEDULE = process.env.AGENT_LOOP_CRON || '*/15 * * * *';
const DRY_RUN       = process.env.AGENT_DRY_RUN === 'true';
const SINGLE_CO     = process.env.AGENT_COMPANY_ID ? parseInt(process.env.AGENT_COMPANY_ID) : null;

// ── 系統提示詞（Taiwan PM 專家角色）─────────────────────────
const SYSTEM_PROMPT = `你是 xCloudPMIS 的 AI 虛擬專案經理，擁有 20 年台灣 IT 專案管理經驗（PMP、PMI-RMP 雙認證）。

你的職責是：
1. 分析專案現況，識別潛在風險與需要立即行動的問題
2. 制定具體、可執行的行動計劃
3. 優先考慮人類的最終決定權（Human-in-the-Loop）

決策原則：
- 安全第一：不確定時，選擇保守方案並請求人類確認
- 解釋優先：每個決策都要說明「為什麼」（中文）
- 最小影響：盡量減少對現有工作的干擾
- 可回滾：所有自動執行的動作必須可以一鍵撤銷

輸出格式：嚴格使用 JSON，不要有多餘文字。`;

// ════════════════════════════════════════════════════════════
// Phase 1: OBSERVE — 收集全公司現況
// ════════════════════════════════════════════════════════════

/**
 * 收集指定公司的所有相關資料
 * @param {number} companyId
 * @returns {Promise<Object>} observations
 */
async function observe(companyId) {
  const now = new Date();

  // ── 並行查詢（效能最佳化）────────────────────────────────
  const [projects, overdueTasks, atRiskTasks, workloadData] = await Promise.all([

    // 進行中的專案（含里程碑）
    prisma.project.findMany({
      where: { companyId, deletedAt: null, status: { in: ['planning', 'active', 'on_hold'] } },
      include: {
        milestones: { where: { isAchieved: false } },
        tasks: {
          where: { deletedAt: null },
          include: {
            assignee:     { select: { id: true, name: true, email: true } },
            dependencies: { include: { dependsOnTask: { select: { id: true, title: true, status: true } } } },
          },
        },
        owner: { select: { id: true, name: true, email: true } },
      },
    }),

    // 已逾期任務（status != done, dueDate < now）
    prisma.task.findMany({
      where: {
        deletedAt: null,
        status:    { not: 'done' },
        dueDate:   { lt: now },
        project:   { companyId, deletedAt: null },
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        project:  { select: { id: true, name: true, endDate: true, ownerId: true } },
        dependencies: { include: { dependsOnTask: true } },
      },
      orderBy: { dueDate: 'asc' },
    }),

    // 高優先度任務（3 天內到期）
    prisma.task.findMany({
      where: {
        deletedAt: null,
        status:    { notIn: ['done', 'review'] },
        dueDate:   { gte: now, lte: new Date(now.getTime() + 3 * 86400_000) },
        priority:  { in: ['urgent', 'high'] },
        project:   { companyId, deletedAt: null },
      },
      include: {
        assignee: { select: { id: true, name: true } },
        project:  { select: { id: true, name: true } },
      },
    }),

    // 成員工作負荷（統計未完成任務數）
    prisma.user.findMany({
      where: { companyId, isActive: true },
      select: {
        id:   true,
        name: true,
        email: true,
        assignedTasks: {
          where: { deletedAt: null, status: { not: 'done' } },
          select: { id: true, priority: true, dueDate: true, estimatedHours: true },
        },
      },
    }),
  ]);

  // ── 計算摘要指標 ─────────────────────────────────────────
  const totalTasks    = projects.reduce((s, p) => s + p.tasks.length, 0);
  const completedTasks = projects.reduce(
    (s, p) => s + p.tasks.filter(t => t.status === 'done').length, 0
  );

  // 計算逾期天數
  const overdueWithDays = overdueTasks.map(t => ({
    id:          t.id,
    title:       t.title,
    projectId:   t.projectId,
    projectName: t.project.name,
    assignee:    t.assignee?.name || '未指派',
    assigneeId:  t.assigneeId,
    daysOverdue: Math.ceil((now - new Date(t.dueDate)) / 86400_000),
    priority:    t.priority,
    hasDependents: t.dependencies.length > 0,
  }));

  // 工作負荷分析
  const workloadSummary = workloadData.map(u => {
    const tasks    = u.assignedTasks;
    const urgents  = tasks.filter(t => t.priority === 'urgent' || t.priority === 'high').length;
    const dueThisWeek = tasks.filter(t =>
      t.dueDate && new Date(t.dueDate) < new Date(now.getTime() + 7 * 86400_000)
    ).length;
    const estHours = tasks.reduce((s, t) => s + parseFloat(t.estimatedHours || 0), 0);
    return {
      userId:      u.id,
      name:        u.name,
      totalTasks:  tasks.length,
      urgentTasks: urgents,
      dueThisWeek,
      estimatedHours: Math.round(estHours),
      isOverloaded:   estHours > 40 || tasks.length > 10,
    };
  });

  return {
    timestamp:    now.toISOString(),
    companyId,
    summary: {
      totalProjects: projects.length,
      totalTasks,
      completedTasks,
      overallCompletion: totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0,
      overdueTasks:   overdueTasks.length,
      atRiskTasks:    atRiskTasks.length,
      overloadedUsers: workloadSummary.filter(u => u.isOverloaded).length,
    },
    overdueTasks:  overdueWithDays,
    atRiskTasks:   atRiskTasks.map(t => ({ id: t.id, title: t.title, projectId: t.projectId, dueDate: t.dueDate })),
    workload:      workloadSummary,
    projects:      projects.map(p => ({
      id:        p.id,
      name:      p.name,
      status:    p.status,
      endDate:   p.endDate,
      taskCount: p.tasks.length,
      doneTasks: p.tasks.filter(t => t.status === 'done').length,
      upcomingMilestones: p.milestones
        .filter(m => new Date(m.dueDate) < new Date(now.getTime() + 14 * 86400_000))
        .map(m => ({ name: m.name, dueDate: m.dueDate })),
    })),
  };
}

// ════════════════════════════════════════════════════════════
// Phase 2: REASON — GPT-4 分析（Chain of Thought）
// ════════════════════════════════════════════════════════════

/**
 * 呼叫 GPT-4 分析現況，生成推理鏈與行動計劃
 * @param {Object} observations
 * @returns {Promise<{reasoning: string, plan: Array}>}
 */
async function reason(observations) {
  const prompt = `
以下是目前的專案現況資料（JSON 格式）：

${JSON.stringify(observations, null, 2)}

請按照以下步驟進行分析（Chain of Thought）：

步驟 1：列出所有觀察到的問題（按嚴重度排序）
步驟 2：分析每個問題的根本原因
步驟 3：評估每個問題的影響範圍（哪些任務/人員/專案會受影響）
步驟 4：制定優先順序（P0=立即行動, P1=今天, P2=本週）

然後根據分析，輸出 JSON：
{
  "reasoning": "詳細的中文推理過程（500字以上，包含步驟1-4的完整分析）",
  "urgentIssues": [
    {
      "type": "task_overdue | resource_overload | milestone_at_risk | critical_path_blocked",
      "severity": "critical | high | medium",
      "description": "問題描述（中文）",
      "affectedEntities": { "projectId": null, "taskId": null, "userId": null },
      "recommendedAction": "建議行動類型",
      "actionParams": {}
    }
  ],
  "plan": [
    {
      "priority": "P0 | P1 | P2",
      "actionType": "auto_firefight | notify_pm | reschedule_tasks | reassign_task | create_risk_task",
      "description": "行動描述（中文）",
      "params": {},
      "riskLevel": 1,
      "estimatedImpact": "預期效果"
    }
  ],
  "noActionNeeded": false
}
`;

  const response = await openai.chat.completions.create({
    model:       'gpt-4o',
    temperature: 0.2,
    max_tokens:  2500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
  });

  const usage = response.usage;
  log('info', `REASON token 用量: ${usage?.total_tokens || 0}`);

  return JSON.parse(response.choices[0].message.content);
}

// ════════════════════════════════════════════════════════════
// Phase 4: ACT — 透過 SafetyGuard 執行計劃
// ════════════════════════════════════════════════════════════

/**
 * 執行一個行動（透過 SafetyGuard 安全邊界）
 * @param {Object} action   - plan 中的一個行動
 * @param {Object} decision - AiDecision 記錄
 * @param {Object} context  - 包含 observations 等上下文
 */
async function act(action, decision, context) {
  const { observations } = context;

  switch (action.actionType) {
    case 'auto_firefight': {
      // 自動救火：針對每個逾期超過 1 天的關鍵任務
      const targetTaskId = action.params?.taskId;
      if (!targetTaskId) {
        // 批量處理所有嚴重逾期任務
        const criticalDelayed = observations.overdueTasks
          .filter(t => t.daysOverdue >= 1 && (t.priority === 'urgent' || t.priority === 'high'));
        for (const task of criticalDelayed.slice(0, 3)) { // 每次最多處理 3 個
          await SchedulerAgent.autoFirefight(task.id, decision.id, observations);
        }
      } else {
        await SchedulerAgent.autoFirefight(targetTaskId, decision.id, observations);
      }
      break;
    }

    case 'reschedule_tasks': {
      const { projectId, newEndDate, reason } = action.params || {};
      if (projectId) {
        await SafetyGuard.executeAction({
          decisionId: decision.id,
          toolName:   'reschedule_project',
          riskLevel:  action.riskLevel,
          params:     { projectId, newEndDate, reason },
          snapshot:   async () => SchedulerAgent.snapshotProject(projectId),
          execute:    async () => SchedulerAgent.rescheduleProject(projectId, newEndDate, reason),
        });
      }
      break;
    }

    case 'create_risk_task': {
      const { projectId, title, description, assigneeId } = action.params || {};
      await SafetyGuard.executeAction({
        decisionId: decision.id,
        toolName:   'create_risk_task',
        riskLevel:  1, // 建立任務是低風險操作
        params:     action.params,
        snapshot:   async () => ({}),
        execute:    async () => prisma.task.create({
          data: {
            title:      title || '🤖 AI 風險管理任務',
            description: description || '',
            status:     'todo',
            priority:   'high',
            projectId:  parseInt(projectId),
            assigneeId: assigneeId ? parseInt(assigneeId) : undefined,
            dueDate:    new Date(Date.now() + 3 * 86400_000),
          },
        }),
      });
      break;
    }

    case 'notify_pm': {
      // 通知 PM（在資料庫建立通知記錄）
      const { userId, message, resourceType, resourceId } = action.params || {};
      if (userId) {
        await prisma.notification.create({
          data: {
            recipientId:  parseInt(userId),
            type:         'task_assigned',
            title:        '🤖 AI 專案管理員通知',
            message:      message || action.description,
            resourceType: resourceType || 'project',
            resourceId:   resourceId ? parseInt(resourceId) : undefined,
          },
        });
      }
      break;
    }

    default:
      log('warn', `未知行動類型: ${action.actionType}`);
  }
}

// ════════════════════════════════════════════════════════════
// Phase 5: REFLECT — 記錄反思
// ════════════════════════════════════════════════════════════

async function reflect(decision, actionsExecuted, observations) {
  // 簡化反思：記錄執行結果
  const reflection = `
執行時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
執行模式：${DRY_RUN ? 'DRY RUN（未實際執行）' : '正式執行'}
處理公司：${observations.companyId}
問題數量：${observations.overdueTasks.length} 個逾期任務
執行動作：${actionsExecuted.length} 個
結果：${actionsExecuted.every(a => a.success) ? '全部成功' : '部分失敗，詳見 ai_agent_logs'}
`.trim();

  await prisma.aiDecision.update({
    where: { id: decision.id },
    data: {
      reflection,
      status:  actionsExecuted.every(a => a.success) ? 'completed' : 'failed',
      actions: actionsExecuted,
    },
  });

  log('success', `REFLECT 完成 — 決策 #${decision.id} 已記錄`);
}

// ════════════════════════════════════════════════════════════
// 主循環
// ════════════════════════════════════════════════════════════

/**
 * 執行一次完整的 Agent Loop（一家公司）
 * @param {number} companyId
 */
async function runAgentLoop(companyId) {
  const sessionId = uuid();
  log('info', `━━━ Agent Loop 開始 ━━━ companyId=${companyId} session=${sessionId.slice(0, 8)}`);

  // ── Phase 1: OBSERVE ─────────────────────────────────────
  log('info', '1️⃣  OBSERVE: 讀取專案現況⋯');
  let observations;
  try {
    observations = await observe(companyId);
    log('info', `   → 逾期任務 ${observations.overdueTasks.length}，風險任務 ${observations.atRiskTasks.length}`);
  } catch (err) {
    log('error', `OBSERVE 失敗: ${err.message}`);
    return;
  }

  // 如果無問題，跳過後續步驟
  if (observations.overdueTasks.length === 0 && observations.atRiskTasks.length === 0) {
    log('success', '   → 一切正常，無需行動 ✓');
    return;
  }

  // ── Phase 2: REASON ──────────────────────────────────────
  log('info', '2️⃣  REASON: GPT-4 推理分析⋯');
  let reasonResult;
  try {
    reasonResult = await reason(observations);
    log('info', `   → 識別 ${reasonResult.urgentIssues?.length || 0} 個緊急問題`);
  } catch (err) {
    log('error', `REASON 失敗: ${err.message}`);
    return;
  }

  if (reasonResult.noActionNeeded) {
    log('info', '   → AI 評估無需立即行動');
    return;
  }

  // ── Phase 3: PLAN（含建立 AiDecision 記錄）──────────────
  log('info', '3️⃣  PLAN: 制定行動計劃⋯');
  const plan = (reasonResult.plan || []).filter(p => p.priority === 'P0' || p.priority === 'P1');
  log('info', `   → 選擇 ${plan.length} 個優先行動（P0/P1）`);

  // 建立 AiDecision 記錄（Chain of Thought 完整儲存）
  const decision = await prisma.aiDecision.create({
    data: {
      sessionId,
      agentType:    'orchestrator',
      decisionType: 'scheduled_loop',
      projectId:    null,
      observations: observations,
      reasoning:    reasonResult.reasoning,
      plan:         plan,
      riskLevel:    Math.max(...plan.map(p => p.riskLevel || 1), 1),
      status:       DRY_RUN ? 'staging' : 'executing',
      actions:      [],
    },
  });

  log('info', `   → 決策記錄 #${decision.id} 已建立`);

  // ── Phase 4: ACT ─────────────────────────────────────────
  log('info', `4️⃣  ACT: 執行 ${plan.length} 個行動${DRY_RUN ? '（DRY RUN，跳過）' : ''}⋯`);
  const actionsExecuted = [];

  if (!DRY_RUN) {
    for (const action of plan) {
      try {
        log('info', `   執行: [${action.priority}] ${action.actionType} — ${action.description}`);
        await act(action, decision, { observations });
        actionsExecuted.push({ actionType: action.actionType, success: true });
      } catch (err) {
        log('error', `   失敗: ${action.actionType}: ${err.message}`);
        actionsExecuted.push({ actionType: action.actionType, success: false, error: err.message });
      }
    }
  } else {
    log('info', `   DRY RUN: 計劃已記錄到 ai_decisions #${decision.id}，未實際執行`);
    actionsExecuted.push({ actionType: 'dry_run', success: true });
  }

  // ── Phase 5: REFLECT ─────────────────────────────────────
  log('info', '5️⃣  REFLECT: 記錄反思⋯');
  await reflect(decision, actionsExecuted, observations);

  const successCount = actionsExecuted.filter(a => a.success).length;
  log('success', `━━━ Loop 完成 ━━━ 成功 ${successCount}/${actionsExecuted.length} 個行動，決策 #${decision.id}`);
}

// ════════════════════════════════════════════════════════════
// 工具函式
// ════════════════════════════════════════════════════════════

function log(level, msg) {
  const icons = { info: '📊', warn: '⚠️', error: '❌', success: '✅' };
  process.stderr.write(`[AgentLoop] ${icons[level] || '•'} ${msg}\n`);
}

// ════════════════════════════════════════════════════════════
// 啟動入口
// ════════════════════════════════════════════════════════════

async function main() {
  log('info', `xCloudPMIS AI 自主代理引擎啟動`);
  log('info', `排程: ${CRON_SCHEDULE} | DRY_RUN: ${DRY_RUN} | 公司: ${SINGLE_CO || '全部'}`);
  log('info', `OpenAI: ${process.env.OPENAI_API_KEY ? '已設定 ✓' : '⚠️ 未設定（AI 功能停用）'}`);

  if (!process.env.OPENAI_API_KEY) {
    log('warn', 'OPENAI_API_KEY 未設定，REASON 階段將跳過，改用規則引擎');
  }

  process.on('SIGINT',  cleanup);
  process.on('SIGTERM', cleanup);

  // ── 啟動 Cron ────────────────────────────────────────────
  cron.schedule(CRON_SCHEDULE, async () => {
    log('info', '🕐 Cron 觸發 Agent Loop');
    await runAllCompanies();
  }, { timezone: 'Asia/Taipei' });

  // ── 立即執行（--run-now 參數）────────────────────────────
  if (process.argv.includes('--run-now')) {
    log('info', '--run-now: 立即執行');
    await runAllCompanies();
  }

  log('success', `Agent Loop 就緒，等待排程觸發（${CRON_SCHEDULE}）⋯`);
}

async function runAllCompanies() {
  try {
    const companies = SINGLE_CO
      ? [{ id: SINGLE_CO }]
      : await prisma.company.findMany({ where: { deletedAt: null }, select: { id: true } });

    for (const co of companies) {
      await runAgentLoop(co.id).catch(err =>
        log('error', `公司 #${co.id} Loop 失敗: ${err.message}`)
      );
    }
  } catch (err) {
    log('error', `runAllCompanies 失敗: ${err.message}`);
  }
}

async function cleanup() {
  log('info', '優雅關閉⋯');
  await prisma.$disconnect();
  process.exit(0);
}

// ── 對外匯出（供其他模組呼叫）──────────────────────────────
module.exports = { runAgentLoop, observe, reason };

if (require.main === module) {
  main().catch(err => {
    log('error', `啟動失敗: ${err.message}\n${err.stack}`);
    process.exit(1);
  });
}
