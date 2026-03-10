'use strict';
/**
 * mcp/autonomousTools.js
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS — MCP 自主代理工具集（Autonomous Agent Tools）
 *
 * 本模組提供讓 Claude AI 直接操作 xCloudPMIS 自主代理系統的 MCP 工具：
 *
 *   🔥 auto_firefight          — 觸發自動救火模式（關鍵路徑任務延誤時）
 *   📅 reschedule_project      — 重排程整個專案（安全邊界 L2）
 *   👤 reassign_task           — 重新指派任務負責人（安全邊界 L2）
 *   📊 get_critical_path       — 取得專案關鍵路徑任務清單
 *   🎯 predict_completion_date — Monte Carlo 預測完成日期（P50/P85）
 *   📋 get_ai_decisions        — 查詢 AI 決策記錄（含推理鏈）
 *   ✅ approve_ai_decision     — 批准 Staging 中的 AI 決策（1-click 審批）
 *   ❌ reject_ai_decision      — 拒絕 Staging 中的 AI 決策
 *   ↩️  rollback_ai_decision    — 一鍵還原 AI 已執行的決策
 *   📊 get_risk_report         — 取得全公司或單一專案風險報告
 *   🔄 run_agent_loop_now      — 立即觸發 Agent Loop（不等排程）
 *
 * 使用方式（在 mcp/server.js 中引入）：
 *   const { AUTONOMOUS_TOOLS, handleAutonomousTool } = require('./autonomousTools');
 *   // 加到 TOOLS 陣列和 callTool handler 中
 *
 * 環境需求：
 *   DATABASE_URL、OPENAI_API_KEY（run_agent_loop_now 用）
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['error'] });

// 延遲載入（避免循環依賴，且有些工具不一定會被呼叫）
let _schedulerAgent = null;
let _riskAgent      = null;
let _safetyGuard    = null;

function getSchedulerAgent() {
  if (!_schedulerAgent) _schedulerAgent = require('../services/autonomous-agent/agents/schedulerAgent');
  return _schedulerAgent;
}
function getRiskAgent() {
  if (!_riskAgent) _riskAgent = require('../services/autonomous-agent/agents/riskAgent');
  return _riskAgent;
}
function getSafetyGuard() {
  if (!_safetyGuard) _safetyGuard = require('../services/autonomous-agent/decisionEngine/safetyGuard');
  return _safetyGuard;
}

// ════════════════════════════════════════════════════════════
// MCP 工具定義（Tool Definitions）
// ════════════════════════════════════════════════════════════

const AUTONOMOUS_TOOLS = [

  // ─────────────────────────────────────────────────────────
  // 工具 1：自動救火模式
  // ─────────────────────────────────────────────────────────
  {
    name: 'auto_firefight',
    description:
      '🔥 觸發 AI 自動救火模式。當關鍵路徑任務逾期超過 1 天時，' +
      'AI 會自動：計算影響範圍、尋找可調配資源、提交重排程計劃（需 PM 審批）、' +
      '發送通知給相關成員、建立風險管理任務。' +
      '適用情境：PM 發現任務嚴重逾期時，快速評估影響範圍並啟動救火流程。',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type:        'integer',
          description: '逾期的任務 ID（必填）',
        },
        decision_context: {
          type:        'string',
          description: '可選：提供給 AI 的額外上下文說明（例如：延誤原因、特殊情況）',
        },
      },
      required: ['task_id'],
    },
  },

  // ─────────────────────────────────────────────────────────
  // 工具 2：重排程整個專案
  // ─────────────────────────────────────────────────────────
  {
    name: 'reschedule_project',
    description:
      '📅 AI 重排程整個專案。依照新的截止日，按比例調整所有未完成任務的截止日。' +
      '此操作為 L2 風險（中風險），會進入 Staging 狀態等待 PM 的 1-click 審批。' +
      '執行前會自動擷取快照，審批後可一鍵還原。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type:        'integer',
          description: '要重排程的專案 ID',
        },
        new_end_date: {
          type:        'string',
          description: '新的專案截止日（格式：YYYY-MM-DD）',
        },
        reason: {
          type:        'string',
          description: '重排程原因（將記錄到 ActivityLog）',
        },
        decision_id: {
          type:        'integer',
          description: '可選：關聯的 AiDecision ID（用於追蹤決策鏈）',
        },
      },
      required: ['project_id', 'new_end_date'],
    },
  },

  // ─────────────────────────────────────────────────────────
  // 工具 3：重新指派任務
  // ─────────────────────────────────────────────────────────
  {
    name: 'reassign_task',
    description:
      '👤 AI 重新指派任務負責人。' +
      '此操作為 L2 風險，會進入 Staging 等待審批，並自動通知新舊負責人。' +
      '適用情境：原負責人超載或離職時，AI 自動建議最適合的接手人員。',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type:        'integer',
          description: '要重新指派的任務 ID',
        },
        new_assignee_id: {
          type:        'integer',
          description: '新負責人的用戶 ID',
        },
        reason: {
          type:        'string',
          description: '重新指派原因',
        },
        decision_id: {
          type:        'integer',
          description: '可選：關聯的 AiDecision ID',
        },
      },
      required: ['task_id', 'new_assignee_id'],
    },
  },

  // ─────────────────────────────────────────────────────────
  // 工具 4：取得關鍵路徑
  // ─────────────────────────────────────────────────────────
  {
    name: 'get_critical_path',
    description:
      '📊 計算並返回專案的關鍵路徑任務清單（CPM 關鍵路徑法）。' +
      '關鍵路徑上的任務延誤會直接影響整個專案的完成日期（浮動時間 = 0）。' +
      '適用情境：識別哪些任務需要優先保護，避免整個專案 delay。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type:        'integer',
          description: '要分析的專案 ID',
        },
      },
      required: ['project_id'],
    },
  },

  // ─────────────────────────────────────────────────────────
  // 工具 5：Monte Carlo 完成日期預測
  // ─────────────────────────────────────────────────────────
  {
    name: 'predict_completion_date',
    description:
      '🎯 使用 Monte Carlo 模擬（1000 次迭代）預測專案完成日期。' +
      '返回 P50（中位數）和 P85（悲觀估計）完成日期，' +
      '並與計劃截止日比較計算 delay 風險。' +
      '信心度取決於歷史任務資料量（≥5筆 = 高，≥2筆 = 中，<2筆 = 低）。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type:        'integer',
          description: '要預測的專案 ID',
        },
        iterations: {
          type:        'integer',
          description: 'Monte Carlo 模擬次數（預設 1000，最大 5000）',
          default:     1000,
        },
      },
      required: ['project_id'],
    },
  },

  // ─────────────────────────────────────────────────────────
  // 工具 6：查詢 AI 決策記錄
  // ─────────────────────────────────────────────────────────
  {
    name: 'get_ai_decisions',
    description:
      '📋 查詢 AI 決策記錄（含完整推理鏈 Chain of Thought）。' +
      '可篩選 staging（等待審批）、completed（已完成）、rolled_back（已還原）等狀態。' +
      '適用情境：PM 查看 AI 最近做了哪些決策、原因是什麼。',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type:        'string',
          description: '篩選狀態：staging | approved | executing | completed | rejected | rolled_back | failed',
          enum:        ['staging', 'approved', 'executing', 'completed', 'rejected', 'rolled_back', 'failed'],
        },
        company_id: {
          type:        'integer',
          description: '可選：篩選特定公司（若不提供則返回所有公司）',
        },
        limit: {
          type:        'integer',
          description: '返回筆數（預設 10，最大 50）',
          default:     10,
        },
      },
      required: [],
    },
  },

  // ─────────────────────────────────────────────────────────
  // 工具 7：批准 AI 決策（1-click 審批）
  // ─────────────────────────────────────────────────────────
  {
    name: 'approve_ai_decision',
    description:
      '✅ 批准 Staging 中的 AI 決策（1-click 審批）。' +
      '批准後，AI 的重排程/重指派計劃會正式寫入資料庫並生效。' +
      '注意：此操作不可逆（但可用 rollback_ai_decision 還原）。',
    inputSchema: {
      type: 'object',
      properties: {
        decision_id: {
          type:        'integer',
          description: 'AI 決策 ID（從 get_ai_decisions 取得）',
        },
        approved_by_user_id: {
          type:        'integer',
          description: '批准者的用戶 ID（用於稽核記錄）',
        },
      },
      required: ['decision_id', 'approved_by_user_id'],
    },
  },

  // ─────────────────────────────────────────────────────────
  // 工具 8：拒絕 AI 決策
  // ─────────────────────────────────────────────────────────
  {
    name: 'reject_ai_decision',
    description:
      '❌ 拒絕 Staging 中的 AI 決策。' +
      '決策將被標記為 rejected 並記錄拒絕原因。' +
      '可搭配 note 說明拒絕理由（有助於 AI 學習改善）。',
    inputSchema: {
      type: 'object',
      properties: {
        decision_id: {
          type:        'integer',
          description: 'AI 決策 ID',
        },
        rejected_by_user_id: {
          type:        'integer',
          description: '拒絕者的用戶 ID',
        },
        note: {
          type:        'string',
          description: '拒絕原因說明（有助於改善 AI 決策品質）',
        },
      },
      required: ['decision_id', 'rejected_by_user_id'],
    },
  },

  // ─────────────────────────────────────────────────────────
  // 工具 9：一鍵還原 AI 決策
  // ─────────────────────────────────────────────────────────
  {
    name: 'rollback_ai_decision',
    description:
      '↩️ 一鍵還原 AI 已執行的決策。' +
      '從決策的快照資料（snapshotData）恢復所有被修改的任務和專案到原始狀態。' +
      '注意：只有已執行（completed/approved）且有快照資料的決策才可還原。',
    inputSchema: {
      type: 'object',
      properties: {
        decision_id: {
          type:        'integer',
          description: 'AI 決策 ID',
        },
        rolled_back_by_user_id: {
          type:        'integer',
          description: '執行還原的用戶 ID（用於稽核記錄）',
        },
      },
      required: ['decision_id', 'rolled_back_by_user_id'],
    },
  },

  // ─────────────────────────────────────────────────────────
  // 工具 10：風險報告
  // ─────────────────────────────────────────────────────────
  {
    name: 'get_risk_report',
    description:
      '📊 取得風險分析報告。' +
      '若提供 project_id 則返回單一專案詳細風險分析；' +
      '若提供 company_id 則返回全公司所有進行中專案的風險排名。' +
      '包含：風險分數（0-100）、各項指標、Monte Carlo 預測、具體改善建議。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type:        'integer',
          description: '分析單一專案（與 company_id 二選一）',
        },
        company_id: {
          type:        'integer',
          description: '分析全公司（與 project_id 二選一）',
        },
      },
      required: [],
    },
  },

  // ─────────────────────────────────────────────────────────
  // 工具 11：立即觸發 Agent Loop
  // ─────────────────────────────────────────────────────────
  {
    name: 'run_agent_loop_now',
    description:
      '🔄 立即觸發一次 AI Agent Loop（不等待排程）。' +
      '適用情境：緊急情況需要 AI 立即掃描全公司狀況、' +
      '或在 dev 環境測試 Agent Loop 功能。' +
      '支援 dry_run 模式（只分析不執行）。',
    inputSchema: {
      type: 'object',
      properties: {
        company_id: {
          type:        'integer',
          description: '可選：只處理此公司（不填則掃描所有公司）',
        },
        dry_run: {
          type:        'boolean',
          description: '乾跑模式：true = 只分析不執行（安全測試用），預設 false',
          default:     false,
        },
      },
      required: [],
    },
  },
];

// ════════════════════════════════════════════════════════════
// MCP 工具處理器（Tool Handlers）
// ════════════════════════════════════════════════════════════

/**
 * 處理自主代理 MCP 工具呼叫
 * 在 mcp/server.js 的 callTool handler 中調用此函式
 *
 * @param {string} toolName   - 工具名稱
 * @param {Object} toolArgs   - 工具參數
 * @returns {Promise<Array>}  - MCP content 陣列
 */
async function handleAutonomousTool(toolName, toolArgs) {
  switch (toolName) {

    // ──────────────────────────────────────────────────────
    case 'auto_firefight': {
      const { task_id, decision_context } = toolArgs;

      // 建立一個臨時 AiDecision 記錄（供 SafetyGuard 記錄決策鏈）
      const decision = await prisma.aiDecision.create({
        data: {
          sessionId:    `mcp-${Date.now()}`,
          agentType:    'mcp_manual',
          decisionType: 'auto_firefight',
          taskId:       task_id,
          observations: { source: 'mcp_tool', context: decision_context || '', triggeredAt: new Date().toISOString() },
          reasoning:    decision_context || '由 MCP 工具手動觸發的自動救火模式',
          plan:         [{ actionType: 'auto_firefight', taskId: task_id, riskLevel: 2 }],
          riskLevel:    2,
          status:       'executing',
          actions:      [],
        },
      });

      // 取得工作負荷資料（供 schedulerAgent 尋找可調配資源）
      const task = await prisma.task.findUnique({
        where:   { id: task_id },
        include: { project: { select: { companyId: true } } },
      });

      let workload = [];
      if (task?.project?.companyId) {
        const users = await prisma.user.findMany({
          where: { companyId: task.project.companyId, isActive: true },
          select: {
            id: true, name: true,
            assignedTasks: {
              where:  { deletedAt: null, status: { not: 'done' } },
              select: { id: true, priority: true, dueDate: true, estimatedHours: true },
            },
          },
        });
        workload = users.map(u => ({
          userId:      u.id,
          name:        u.name,
          totalTasks:  u.assignedTasks.length,
          urgentTasks: u.assignedTasks.filter(t => t.priority === 'urgent' || t.priority === 'high').length,
          isOverloaded: u.assignedTasks.length > 10,
        }));
      }

      await getSchedulerAgent().autoFirefight(task_id, decision.id, { workload });

      // 更新決策狀態
      await prisma.aiDecision.update({
        where: { id: decision.id },
        data:  { status: 'staging' }, // 重排程計劃已進入 staging 等待審批
      });

      return [{ type: 'text', text: JSON.stringify({
        success:    true,
        decisionId: decision.id,
        message:    `✅ 自動救火已啟動（任務 #${task_id}）\n重排程計劃已提交至 Staging，等待 PM 審批（決策 ID: ${decision.id}）。\n請使用 approve_ai_decision 工具審批，或至「AI 決策中心」查看詳細推理鏈。`,
      }, null, 2) }];
    }

    // ──────────────────────────────────────────────────────
    case 'reschedule_project': {
      const { project_id, new_end_date, reason = 'MCP 工具觸發重排程', decision_id } = toolArgs;

      // 若無 decision_id，建立新的 AiDecision
      let decId = decision_id;
      if (!decId) {
        const dec = await prisma.aiDecision.create({
          data: {
            sessionId:    `mcp-${Date.now()}`,
            agentType:    'mcp_manual',
            decisionType: 'reschedule_project',
            projectId:    project_id,
            observations: { source: 'mcp_tool', triggeredAt: new Date().toISOString() },
            reasoning:    reason,
            plan:         [{ actionType: 'reschedule_project', projectId: project_id, newEndDate: new_end_date }],
            riskLevel:    2,
            status:       'executing',
            actions:      [],
          },
        });
        decId = dec.id;
      }

      const result = await getSafetyGuard().executeAction({
        decisionId: decId,
        toolName:   'reschedule_project',
        riskLevel:  2,
        params:     { project_id, new_end_date, reason },
        snapshot:   async () => getSchedulerAgent().snapshotProject(project_id),
        execute:    async () => getSchedulerAgent().rescheduleProject(project_id, new_end_date, reason),
      });

      return [{ type: 'text', text: JSON.stringify({
        success:    true,
        decisionId: decId,
        staging:    result.staging,
        message:    result.staging
          ? `📋 重排程計劃已進入 Staging（決策 #${decId}），等待 PM 審批。`
          : `✅ 重排程已執行（決策 #${decId}）。`,
        result,
      }, null, 2) }];
    }

    // ──────────────────────────────────────────────────────
    case 'reassign_task': {
      const { task_id, new_assignee_id, reason = 'MCP 工具觸發重新指派', decision_id } = toolArgs;

      let decId = decision_id;
      if (!decId) {
        const dec = await prisma.aiDecision.create({
          data: {
            sessionId:    `mcp-${Date.now()}`,
            agentType:    'mcp_manual',
            decisionType: 'reassign_task',
            taskId:       task_id,
            observations: { source: 'mcp_tool', triggeredAt: new Date().toISOString() },
            reasoning:    reason,
            plan:         [{ actionType: 'reassign_task', taskId: task_id, newAssigneeId: new_assignee_id }],
            riskLevel:    2,
            status:       'executing',
            actions:      [],
          },
        });
        decId = dec.id;
      }

      // 取得原任務資料（供快照 + 通知用）
      const task = await prisma.task.findUnique({
        where:   { id: task_id },
        include: { assignee: { select: { id: true, name: true } } },
      });

      const result = await getSafetyGuard().executeAction({
        decisionId: decId,
        toolName:   'reassign_task',
        riskLevel:  2,
        params:     { task_id, new_assignee_id, reason },
        snapshot:   async () => ({ tasks: [task] }),
        execute:    async () => {
          const updated = await prisma.task.update({
            where: { id: task_id },
            data:  { assigneeId: new_assignee_id },
          });

          // 通知新負責人
          await prisma.notification.create({
            data: {
              recipientId:  new_assignee_id,
              type:         'task_assigned',
              title:        '🤖 AI 指派任務給您',
              message:      `AI 已將任務「${task?.title || `#${task_id}`}」重新指派給您。原因：${reason}`,
              resourceType: 'task',
              resourceId:   task_id,
            },
          });

          // 通知原負責人（若有）
          if (task?.assigneeId && task.assigneeId !== new_assignee_id) {
            await prisma.notification.create({
              data: {
                recipientId:  task.assigneeId,
                type:         'task_assigned',
                title:        '📋 您的任務已被重新指派',
                message:      `任務「${task.title}」已由 AI 重新指派給其他成員。原因：${reason}`,
                resourceType: 'task',
                resourceId:   task_id,
              },
            });
          }
          return updated;
        },
      });

      return [{ type: 'text', text: JSON.stringify({
        success:    true,
        decisionId: decId,
        staging:    result.staging,
        message:    result.staging
          ? `📋 重新指派計劃已進入 Staging（決策 #${decId}），等待審批。`
          : `✅ 任務 #${task_id} 已重新指派（決策 #${decId}）。`,
      }, null, 2) }];
    }

    // ──────────────────────────────────────────────────────
    case 'get_critical_path': {
      const { project_id } = toolArgs;
      const scheduler = getSchedulerAgent();

      const { graph, tasks } = await scheduler.buildDependencyGraph(project_id);
      const criticalPath     = scheduler.findCriticalPath(tasks, graph);

      const project = await prisma.project.findUnique({
        where:  { id: project_id },
        select: { name: true, endDate: true, status: true },
      });

      return [{ type: 'text', text: JSON.stringify({
        projectId:         project_id,
        projectName:       project?.name || `專案 #${project_id}`,
        projectEndDate:    project?.endDate,
        totalTasks:        tasks.length,
        criticalPathLength: criticalPath.length,
        criticalPathTasks: criticalPath.map(t => ({
          id:          t.id,
          title:       t.title,
          status:      t.status,
          priority:    t.priority,
          dueDate:     t.dueDate,
          duration:    `${t.duration} 天`,
          ef:          t.ef,
          lf:          t.lf,
          isOverdue:   t.dueDate && new Date(t.dueDate) < new Date(),
        })),
        warning: criticalPath.some(t => t.dueDate && new Date(t.dueDate) < new Date())
          ? '⚠️ 有關鍵路徑任務已逾期！建議立即觸發 auto_firefight。'
          : '✅ 關鍵路徑任務均在計劃內。',
      }, null, 2) }];
    }

    // ──────────────────────────────────────────────────────
    case 'predict_completion_date': {
      const { project_id, iterations = 1000 } = toolArgs;
      const safeIterations = Math.min(5000, Math.max(100, iterations));

      const [tasks, project] = await Promise.all([
        prisma.task.findMany({
          where: { projectId: project_id, deletedAt: null },
        }),
        prisma.project.findUnique({
          where:  { id: project_id },
          select: { id: true, name: true, endDate: true, startDate: true, status: true },
        }),
      ]);

      if (!project) {
        return [{ type: 'text', text: `❌ 專案 #${project_id} 不存在` }];
      }

      const prediction = getRiskAgent().predictCompletionDate(tasks, project, safeIterations);

      return [{ type: 'text', text: JSON.stringify({
        projectId:   project_id,
        projectName: project.name,
        prediction,
        interpretation: [
          `📊 P50（50% 機率在此日期前完成）: ${prediction.p50Date || 'N/A'}`,
          `📊 P85（85% 機率在此日期前完成）: ${prediction.p85Date || 'N/A'}`,
          `📅 計劃截止日: ${prediction.scheduledEndDate || '未設定'}`,
          `⚠️ ${prediction.note}`,
          `🎯 預測信心度: ${prediction.confidence}（基於 ${prediction.simulationBasis?.historicalData} 筆歷史資料）`,
        ].join('\n'),
      }, null, 2) }];
    }

    // ──────────────────────────────────────────────────────
    case 'get_ai_decisions': {
      const { status, company_id, limit = 10 } = toolArgs;
      const safeLimit = Math.min(50, Math.max(1, limit));

      const where = {};
      if (status) where.status = status;

      const decisions = await prisma.aiDecision.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take:    safeLimit,
        include: {
          logs: {
            select: { toolName: true, success: true, executedAt: true, durationMs: true },
            orderBy: { executedAt: 'desc' },
            take: 5,
          },
        },
      });

      // Application-level filter for company_id
      const filtered = company_id
        ? decisions.filter(d => d.observations?.companyId === company_id)
        : decisions;

      return [{ type: 'text', text: JSON.stringify({
        total:     filtered.length,
        decisions: filtered.map(d => ({
          id:           d.id,
          sessionId:    d.sessionId,
          agentType:    d.agentType,
          decisionType: d.decisionType,
          status:       d.status,
          riskLevel:    d.riskLevel,
          projectId:    d.projectId,
          taskId:       d.taskId,
          reasoning:    d.reasoning?.substring(0, 200) + (d.reasoning?.length > 200 ? '...' : ''),
          plan:         d.plan,
          actionsCount: d.logs?.length || 0,
          hasSnapshot:  !!d.snapshotData && Object.keys(d.snapshotData).length > 0,
          createdAt:    d.createdAt,
          approvedAt:   d.approvedAt,
          rolledBackAt: d.rolledBackAt,
          recentLogs:   d.logs,
        })),
      }, null, 2) }];
    }

    // ──────────────────────────────────────────────────────
    case 'approve_ai_decision': {
      const { decision_id, approved_by_user_id } = toolArgs;
      const result = await getSafetyGuard().approveAction(decision_id, approved_by_user_id);

      return [{ type: 'text', text: JSON.stringify({
        success:    true,
        decisionId: decision_id,
        message:    `✅ 決策 #${decision_id} 已由用戶 #${approved_by_user_id} 批准。AI 計劃將正式生效。`,
        result,
      }, null, 2) }];
    }

    // ──────────────────────────────────────────────────────
    case 'reject_ai_decision': {
      const { decision_id, rejected_by_user_id, note = '' } = toolArgs;
      const result = await getSafetyGuard().rejectAction(decision_id, rejected_by_user_id, note);

      return [{ type: 'text', text: JSON.stringify({
        success:    true,
        decisionId: decision_id,
        message:    `❌ 決策 #${decision_id} 已拒絕。原因：${note || '（未填寫）'}`,
        result,
      }, null, 2) }];
    }

    // ──────────────────────────────────────────────────────
    case 'rollback_ai_decision': {
      const { decision_id, rolled_back_by_user_id } = toolArgs;
      const result = await getSafetyGuard().rollback(decision_id, rolled_back_by_user_id);

      return [{ type: 'text', text: JSON.stringify({
        success:     true,
        decisionId:  decision_id,
        restoredRows: result.restored,
        message:     `↩️ 決策 #${decision_id} 已成功還原，共恢復 ${result.restored} 筆資料到原始狀態。`,
        result,
      }, null, 2) }];
    }

    // ──────────────────────────────────────────────────────
    case 'get_risk_report': {
      const { project_id, company_id } = toolArgs;

      if (!project_id && !company_id) {
        return [{ type: 'text', text: '❌ 請提供 project_id 或 company_id（二選一）' }];
      }

      let report;
      if (project_id) {
        report = await getRiskAgent().analyzeProjectRisk(project_id);
      } else {
        report = await getRiskAgent().generateRiskReport(company_id);
      }

      return [{ type: 'text', text: JSON.stringify(report, null, 2) }];
    }

    // ──────────────────────────────────────────────────────
    case 'run_agent_loop_now': {
      const { company_id, dry_run = false } = toolArgs;

      // 動態引入 agentLoop 並執行
      const { runAgentLoop } = require('../services/autonomous-agent/core/agentLoop');

      // 臨時覆寫環境變數（只在此次呼叫生效）
      const prevDryRun  = process.env.AGENT_DRY_RUN;
      process.env.AGENT_DRY_RUN = dry_run ? 'true' : 'false';

      let result;
      try {
        if (company_id) {
          await runAgentLoop(company_id);
          result = { message: `✅ Agent Loop 已完成（公司 #${company_id}）`, dryRun: dry_run };
        } else {
          // 取得所有公司並逐一執行
          const companies = await prisma.company.findMany({
            where:  { deletedAt: null },
            select: { id: true, name: true },
          });
          const results = [];
          for (const co of companies) {
            await runAgentLoop(co.id).catch(err =>
              results.push({ companyId: co.id, error: err.message })
            );
            results.push({ companyId: co.id, name: co.name, completed: true });
          }
          result = { message: '✅ 全公司 Agent Loop 已完成', companies: results, dryRun: dry_run };
        }
      } finally {
        // 還原環境變數
        if (prevDryRun !== undefined) process.env.AGENT_DRY_RUN = prevDryRun;
        else delete process.env.AGENT_DRY_RUN;
      }

      return [{ type: 'text', text: JSON.stringify(result, null, 2) }];
    }

    // ──────────────────────────────────────────────────────
    default:
      return null; // 不認識的工具，返回 null 讓 server.js 繼續處理
  }
}

// ── 對外匯出 ──────────────────────────────────────────────
module.exports = { AUTONOMOUS_TOOLS, handleAutonomousTool };
