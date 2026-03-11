'use strict';
/**
 * services/autonomous-agent/core/agentLoop.js
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS — AI Agent 主迴圈（ReAct 架構）
 *
 * 執行流程：
 *   1. Observe  — 掃描 DB，取得各公司/專案的任務現況
 *   2. Reason   — 呼叫 AI（Ollama/OpenAI）進行風險推理
 *   3. Plan     — 規劃具體行動（延後任務、發送通知、重新分配等）
 *   4. Act      — L1 自動執行；L2+ 進入 Staging 等待人類批准
 *   5. Reflect  — 記錄執行結果（供後續強化學習使用）
 *
 * 觸發方式：
 *   - CLI：node agentLoop.js --run-now
 *   - POST /api/ai/agent/run（由 aiDecisions.js 路由 fork 子程序）
 *
 * 環境變數：
 *   AGENT_COMPANY_ID  — 指定公司 ID（不設定則掃描全部公司）
 *   AGENT_DRY_RUN     — "true" 表示只分析不執行（寫入 staging 不自動執行）
 */

const { PrismaClient } = require('@prisma/client');
const { randomUUID }   = require('crypto');

const prisma     = new PrismaClient({ log: ['error'] });
const DRY_RUN    = process.env.AGENT_DRY_RUN === 'true';
const COMPANY_ID = process.env.AGENT_COMPANY_ID ? parseInt(process.env.AGENT_COMPANY_ID) : null;
const SESSION_ID = randomUUID();

// ════════════════════════════════════════════════════════════
// 主要進入點
// ════════════════════════════════════════════════════════════

async function run() {
  const startTime = Date.now();
  console.log(`\n[AgentLoop] ▶ 開始執行`);
  console.log(`[AgentLoop]   session   = ${SESSION_ID}`);
  console.log(`[AgentLoop]   companyId = ${COMPANY_ID ?? '全部'}`);
  console.log(`[AgentLoop]   dryRun    = ${DRY_RUN}`);

  try {
    const companies = COMPANY_ID
      ? await prisma.company.findMany({ where: { id: COMPANY_ID, isActive: true } })
      : await prisma.company.findMany({ where: { isActive: true } });

    if (companies.length === 0) {
      console.log('[AgentLoop] 找不到可用的公司記錄，結束。');
      return;
    }

    let totalDecisions = 0;

    for (const company of companies) {
      try {
        console.log(`\n[AgentLoop] 📦 處理公司：${company.name}（#${company.id}）`);
        const count = await runForCompany(company);
        totalDecisions += count;
      } catch (err) {
        console.error(`[AgentLoop] ❌ 公司 #${company.id} 處理失敗:`, err.message);
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n[AgentLoop] ✅ 完成 | 共建立 ${totalDecisions} 個決策 | 耗時 ${elapsed}s\n`);

  } finally {
    await prisma.$disconnect();
  }
}

// ════════════════════════════════════════════════════════════
// 針對單一公司執行
// ════════════════════════════════════════════════════════════

async function runForCompany(company) {
  const projects = await _getActiveProjects(company.id);
  console.log(`[AgentLoop]   找到 ${projects.length} 個活躍專案`);

  let decisionCount = 0;

  for (const project of projects) {
    try {
      // Step 1: Observe
      const projectData = await _observeProject(project, company.id);

      // Step 2 & 3: Reason + Plan
      const decisions = await _analyzeAndPlan(projectData);

      // Step 4: Act（儲存決策）
      for (const decision of decisions) {
        await _saveDecision(decision, project.id);
        decisionCount++;
      }

    } catch (err) {
      console.error(`[AgentLoop]   ❌ 專案「${project.name}」分析失敗:`, err.message);
    }
  }

  return decisionCount;
}

// ════════════════════════════════════════════════════════════
// Step 1: Observe — 取得專案現況快照
// ════════════════════════════════════════════════════════════

async function _observeProject(project, companyId) {
  const now = new Date();

  const [tasks, milestones] = await Promise.all([
    prisma.task.findMany({
      where:   { projectId: project.id, deletedAt: null },
      include: { assignee: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.milestone.findMany({
      where: { projectId: project.id },
    }),
  ]);

  // 計算各成員負載統計
  const teamMap = {};
  for (const task of tasks) {
    if (!task.assigneeId) continue;
    if (!teamMap[task.assigneeId]) {
      teamMap[task.assigneeId] = {
        userId:       task.assigneeId,
        name:         task.assignee?.name || `user#${task.assigneeId}`,
        taskCount:    0,
        overdueCount: 0,
      };
    }
    teamMap[task.assigneeId].taskCount++;
    const isOverdue = task.status !== 'done' && task.dueDate && new Date(task.dueDate) < now;
    if (isOverdue) teamMap[task.assigneeId].overdueCount++;
  }

  return {
    id:         project.id,
    name:       project.name,
    status:     project.status,
    endDate:    project.endDate,
    budget:     project.budget,
    companyId,
    tasks:      tasks.map(t => ({
      id:             t.id,
      title:          t.title,
      status:         t.status,
      priority:       t.priority,
      dueDate:        t.dueDate,
      assignee:       t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null,
      estimatedHours: t.estimatedHours,
    })),
    milestones: milestones.map(m => ({
      id:         m.id,
      name:       m.name,
      dueDate:    m.dueDate,
      isAchieved: m.isAchieved,
    })),
    team: Object.values(teamMap),
  };
}

// ════════════════════════════════════════════════════════════
// Step 2 & 3: Reason + Plan — AI 分析並產生決策清單
// ════════════════════════════════════════════════════════════

async function _analyzeAndPlan(projectData) {
  const decisions = [];
  const now       = new Date();
  const tasks     = projectData.tasks;
  const total     = tasks.length;
  const done      = tasks.filter(t => t.status === 'done').length;

  // 沒有任務或全部完成，跳過
  if (total === 0 || done === total) {
    console.log(`[AgentLoop]   ⏭  「${projectData.name}」無需分析（${done}/${total} 完成）`);
    return decisions;
  }

  // 快速計算逾期狀況
  const overdueTasks   = tasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now);
  const overdueUrgent  = overdueTasks.filter(t => t.priority === 'urgent' || t.priority === 'high');
  const nearDeadlineTasks = tasks.filter(t => {
    if (t.status === 'done' || !t.dueDate) return false;
    const daysLeft = (new Date(t.dueDate) - now) / (1000 * 60 * 60 * 24);
    return daysLeft >= 0 && daysLeft <= 3;
  });

  // 無問題，跳過 AI 呼叫（節省 token）
  if (overdueTasks.length === 0 && nearDeadlineTasks.length === 0) {
    console.log(`[AgentLoop]   ✅ 「${projectData.name}」健康，無逾期任務`);
    return decisions;
  }

  console.log(`[AgentLoop]   ⚠  「${projectData.name}」：逾期 ${overdueTasks.length} 個、3天內截止 ${nearDeadlineTasks.length} 個`);

  // ── 呼叫 AI 深度分析 ─────────────────────────────────────
  let riskReport;
  try {
    const { analyzeRisk } = require('../../aiAgent');
    riskReport = await analyzeRisk(projectData);
    console.log(`[AgentLoop]   🧠 AI 分析完成：風險分數 ${riskReport.riskScore}`);
  } catch (err) {
    // AI 呼叫失敗時，改用規則型結果（不中斷流程）
    console.warn(`[AgentLoop]   ⚠  AI 分析失敗（${err.message}），使用規則型評分`);
    riskReport = _buildRuleBasedRisk(projectData, overdueTasks, overdueUrgent);
  }

  const riskScore = riskReport.riskScore || 0;

  // 風險等級對照（L1=自動執行, L2=需批准, L3=人工審查, L4=禁止自動）
  const riskLevel = riskScore < 31 ? 1
                  : riskScore < 61 ? 2
                  : riskScore < 81 ? 3
                  : 4;

  // ── 排程代理決策（逾期任務重排）─────────────────────────
  if (overdueTasks.length > 0) {
    // 快照：記錄執行前的任務狀態（用於回滾）
    const snapshotTasks = overdueTasks.map(t => ({
      id:      t.id,
      status:  t.status,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    }));

    // 計劃：延後最多 5 個逾期任務各 7 天
    const planActions = overdueTasks.slice(0, 5).map(t => {
      const original = new Date(t.dueDate);
      const newDue   = new Date(original);
      newDue.setDate(newDue.getDate() + 7);
      return {
        type:       'update_task_due_date',
        taskId:     t.id,
        taskTitle:  t.title,
        newDueDate: newDue.toISOString(),
        reason:     `逾期 ${Math.ceil((now - original) / 86400000)} 天，自動延後 7 天`,
      };
    });

    decisions.push({
      agentType:    'scheduler',
      decisionType: overdueUrgent.length >= 3 ? 'auto_firefight' : 'reschedule_project',
      riskLevel,
      observations: {
        projectName:    projectData.name,
        totalTasks:     total,
        doneTasks:      done,
        overdueTasks:   overdueTasks.length,
        overdueUrgent:  overdueUrgent.length,
        riskScore,
        riskLevel:      riskReport.riskLevel,
        scannedAt:      new Date().toISOString(),
      },
      reasoning: riskReport.summary ||
        `掃描發現 ${overdueTasks.length} 個逾期任務（${overdueUrgent.length} 個高優先），` +
        `風險分數 ${riskScore}，建議自動延後截止日。`,
      plan: {
        summary: `重新排程 ${planActions.length} 個逾期任務（各延後 7 天）`,
        actions:  planActions,
      },
      snapshotData: { tasks: snapshotTasks },
    });
  }

  // ── 風險代理決策（高風險預警）───────────────────────────
  if (riskScore >= 61 && (riskReport.factors || []).length > 0) {
    const warnLevel = Math.min(4, riskLevel + 1);  // 預警至少比排程高一級

    const planActions = (riskReport.recommendations || []).slice(0, 3).map((r, i) => ({
      type:     'send_notification',
      priority: i + 1,
      message:  r.action,
      owner:    r.owner    || 'PM',
      timeline: r.timeline || '本週內',
    }));

    decisions.push({
      agentType:    'risk',
      decisionType: 'risk_alert',
      riskLevel:    warnLevel,
      observations: {
        riskScore,
        riskLevel:       riskReport.riskLevel,
        topFactor:       riskReport.factors?.[0]?.title   || '未知',
        topImpact:       riskReport.factors?.[0]?.impact  || '未知',
        recommendations: (riskReport.recommendations || []).length,
      },
      reasoning: riskReport.summary ||
        `專案風險分數 ${riskScore}，已進入高風險區間，需要立即介入。`,
      plan: {
        summary: `高風險預警（${riskReport.riskLevelLabel || `分數 ${riskScore}`}），需人工審查並採取行動`,
        actions: planActions,
      },
      snapshotData: null,  // 預警類決策無需快照
    });
  }

  // ── 截止日預警（3 天內）─────────────────────────────────
  if (nearDeadlineTasks.length > 0) {
    decisions.push({
      agentType:    'scheduler',
      decisionType: 'deadline_warning',
      riskLevel:    Math.max(1, riskLevel - 1),  // 預警比逾期輕一級
      observations: {
        projectName:        projectData.name,
        nearDeadlineTasks:  nearDeadlineTasks.length,
        taskTitles:         nearDeadlineTasks.map(t => t.title).slice(0, 5),
        scannedAt:          new Date().toISOString(),
      },
      reasoning: `${nearDeadlineTasks.length} 個任務將在 3 天內截止，提醒相關人員確認進度。`,
      plan: {
        summary: `截止日預警：${nearDeadlineTasks.length} 個任務即將到期`,
        actions: nearDeadlineTasks.slice(0, 5).map(t => ({
          type:    'send_notification',
          message: `⏰ 任務「${t.title}」將於 ${new Date(t.dueDate).toLocaleDateString('zh-TW')} 截止，請確認進度`,
          owner:   t.assignee?.name || 'PM',
        })),
      },
      snapshotData: null,
    });
  }

  return decisions;
}

// ════════════════════════════════════════════════════════════
// Step 4: Act — 儲存決策到 DB
// ════════════════════════════════════════════════════════════

async function _saveDecision(decision, projectId) {
  // L1 非 DryRun → 自動執行；其他 → staging 等待批准
  const status = (DRY_RUN || decision.riskLevel >= 2) ? 'staging' : 'pending';

  const record = await prisma.aiDecision.create({
    data: {
      sessionId:    SESSION_ID,
      agentType:    decision.agentType,
      decisionType: decision.decisionType,
      projectId,
      riskLevel:    decision.riskLevel,
      status,
      observations: decision.observations,
      reasoning:    decision.reasoning,
      plan:         decision.plan,
      actions:      [],
      snapshotData: decision.snapshotData,
    },
  });

  console.log(
    `[AgentLoop]   📌 決策 #${record.id}` +
    ` | ${decision.agentType}/${decision.decisionType}` +
    ` | L${decision.riskLevel}` +
    ` | → ${status}`
  );

  // L1 自動執行（非 DryRun）
  if (!DRY_RUN && decision.riskLevel <= 1) {
    const SafetyGuard = require('../decisionEngine/safetyGuard');
    // 先標記為 approved（L1 系統自動批准）
    await prisma.aiDecision.update({
      where: { id: record.id },
      data:  { status: 'approved', approvedAt: new Date() },
    });
    // 非同步執行
    setImmediate(() =>
      SafetyGuard.executeDecision(record.id).catch(err =>
        console.error(`[AgentLoop] L1 自動執行失敗 #${record.id}:`, err.message)
      )
    );
  }

  return record;
}

// ════════════════════════════════════════════════════════════
// 工具函式
// ════════════════════════════════════════════════════════════

async function _getActiveProjects(companyId) {
  return await prisma.project.findMany({
    where: {
      companyId,
      deletedAt: null,
      status:    { in: ['active', 'on_hold'] },
    },
    select: {
      id:      true,
      name:    true,
      status:  true,
      endDate: true,
      budget:  true,
    },
  });
}

/**
 * AI 呼叫失敗時的規則型風險評估（Fallback）
 */
function _buildRuleBasedRisk(projectData, overdueTasks, overdueUrgent) {
  const score = Math.min(100, overdueTasks.length * 12 + overdueUrgent.length * 20);
  const level = score >= 81 ? 'critical' : score >= 61 ? 'high' : score >= 31 ? 'medium' : 'low';
  const label = { critical: '極高風險', high: '高風險', medium: '中風險', low: '低風險' }[level];

  return {
    riskScore:      score,
    riskLevel:      level,
    riskLevelLabel: label,
    summary:        `（規則型）發現 ${overdueTasks.length} 個逾期任務（${overdueUrgent.length} 個高優先），` +
                    `估算風險分數 ${score}（${label}）`,
    factors:        overdueTasks.length > 0 ? [{
      category:      'schedule',
      categoryLabel: '進度',
      severity:      level,
      title:         `${overdueTasks.length} 個逾期任務`,
      description:   `其中 ${overdueUrgent.length} 個高優先任務已逾期`,
      impact:        '可能導致專案整體延後',
    }] : [],
    recommendations: overdueTasks.length > 0 ? [{
      priority: 1,
      action:   '立即與任務負責人確認逾期原因並重新排程',
      owner:    'PM',
      timeline: '本週內',
      expectedOutcome: '逾期任務比例下降 50%',
    }] : [],
    positives: [`已完成 ${projectData.tasks.filter(t => t.status === 'done').length} 個任務`],
  };
}

// ════════════════════════════════════════════════════════════
// CLI 進入點（由 agentLoop.js --run-now 觸發）
// ════════════════════════════════════════════════════════════

if (require.main === module) {
  run().catch(err => {
    console.error('[AgentLoop] 致命錯誤:', err);
    process.exit(1);
  });
}

module.exports = { run };
