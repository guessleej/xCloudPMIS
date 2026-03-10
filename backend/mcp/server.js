#!/usr/bin/env node
/**
 * mcp/server.js
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS — MCP Server（Model Context Protocol）
 *
 * 提供以下工具讓 Claude AI 可以直接操作 xCloudPMIS 系統：
 *
 *   📊 get_project_status   — 查詢專案狀態與健康指標
 *   🚨 get_overdue_tasks    — 查詢逾期任務清單
 *   📧 send_reminder_email  — 發送任務提醒郵件
 *   👤 get_user_workload    — 查詢用戶工作量與即將到期任務
 *   ➕ create_task          — 建立新任務
 *
 * 執行方式：
 *   node mcp/server.js            （直接執行，stdin/stdout 通訊）
 *   npm run mcp                   （npm 腳本）
 *
 * 與 Claude Desktop 整合：
 *   參見 claude_desktop_config.json 與 docs/MCP_USAGE.md
 *
 * 所需環境變數（.env）：
 *   DATABASE_URL          — PostgreSQL 連線字串
 *   O365_CLIENT_ID        — Azure AD 應用程式 ID（郵件功能用）
 *   O365_CLIENT_SECRET    — Azure AD 用戶端密碼（郵件功能用）
 *   O365_TENANT_ID        — Azure AD 租用戶 ID（郵件功能用）
 *   O365_SENDER_EMAIL     — 發件人信箱（郵件功能用）
 */

'use strict';

// ── 環境變數載入（支援多種執行路徑）──────────────────────────
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') }); // worktree 根目錄
require('dotenv').config({ path: path.join(__dirname, '../.env') });    // backend 目錄

// ── MCP SDK ───────────────────────────────────────────────────
const { Server }              = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} = require('@modelcontextprotocol/sdk/types.js');

// ── 資料庫（Prisma）───────────────────────────────────────────
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  log: ['error'],  // 只記錄錯誤，減少 stdio 雜訊
});

// ── 郵件服務（延遲載入，只有在需要時才初始化 MSAL）───────────
let _emailService = null;
function getEmailService() {
  if (!_emailService) _emailService = require('../src/services/emailService');
  return _emailService;
}

// ── AI Agent 服務（延遲載入，只有在需要時才初始化 OpenAI 客戶端）
let _aiAgent = null;
function getAiAgent() {
  if (!_aiAgent) _aiAgent = require('../src/services/aiAgent');
  return _aiAgent;
}

// ── 自主代理工具（Phase 1：AI 虛擬專案經理）─────────────────
const { AUTONOMOUS_TOOLS, handleAutonomousTool } = require('./autonomousTools');

// ════════════════════════════════════════════════════════════
// 工具定義（Tool Definitions）
// ════════════════════════════════════════════════════════════

const TOOLS = [
  // ── Phase 1：AI 自主代理工具（11 個）─────────────────────
  ...AUTONOMOUS_TOOLS,
  // ── 原有工具（保留）──────────────────────────────────────
  // ─────────────────────────────────────────────────────────
  // 工具 1：查詢專案狀態
  // ─────────────────────────────────────────────────────────
  {
    name: 'get_project_status',
    description:
      '查詢 xCloudPMIS 的專案狀態與健康指標。' +
      '可以查詢所有專案的摘要，或指定 projectId 查詢單一專案詳細資訊。' +
      '回傳資料包含：專案進度（%）、任務數量、逾期任務、截止日期、預算使用情況。',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: {
          type:        'number',
          description: '公司 ID（預設：2）。用於過濾資料，確保只看到本公司的專案。',
          default:     2,
        },
        projectId: {
          type:        'number',
          description: '（可選）指定查詢單一專案的詳細資訊，包含任務清單。省略時查詢所有專案。',
        },
        status: {
          type:        'string',
          description: '（可選）按狀態過濾：planning（規劃中）、active（進行中）、on_hold（暫停）、completed（已完成）',
          enum:        ['planning', 'active', 'on_hold', 'completed', 'cancelled'],
        },
      },
    },
  },

  // ─────────────────────────────────────────────────────────
  // 工具 2：查詢逾期任務
  // ─────────────────────────────────────────────────────────
  {
    name: 'get_overdue_tasks',
    description:
      '查詢所有逾期任務（截止日已過且未完成的任務）。' +
      '可以按指派人、專案篩選，並控制回傳數量。' +
      '適合用來了解目前有哪些緊急需要處理的任務，以及是否需要發送提醒。',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: {
          type:        'number',
          description: '公司 ID（預設：2）',
          default:     2,
        },
        assigneeId: {
          type:        'number',
          description: '（可選）只查詢指定用戶負責的逾期任務',
        },
        projectId: {
          type:        'number',
          description: '（可選）只查詢指定專案的逾期任務',
        },
        limit: {
          type:        'number',
          description: '回傳筆數上限（預設：20，最大：100）',
          default:     20,
        },
      },
    },
  },

  // ─────────────────────────────────────────────────────────
  // 工具 3：發送提醒郵件
  // ─────────────────────────────────────────────────────────
  {
    name: 'send_reminder_email',
    description:
      '透過 Microsoft Graph API 發送任務提醒郵件。' +
      '支援兩種模式：' +
      '（1）指定 taskId — 自動從資料庫查詢任務詳情，對指派人發信；' +
      '（2）指定 userEmail + taskTitle — 手動指定收件人與任務標題，快速發送。' +
      '可選擇郵件類型：reminder（到期提醒）或 overdue（逾期警告）。',
    inputSchema: {
      type:     'object',
      required: ['emailType'],
      properties: {
        emailType: {
          type:        'string',
          description: '郵件類型：reminder（到期提醒）或 overdue（逾期警告）',
          enum:        ['reminder', 'overdue'],
        },
        taskId: {
          type:        'number',
          description: '（選項A）指定任務 ID — 自動查詢任務資訊並對指派人發信',
        },
        userEmail: {
          type:        'string',
          description: '（選項B）指定收件人信箱（taskId 未提供時必填）',
        },
        userName: {
          type:        'string',
          description: '（選項B）指定收件人姓名',
          default:     '用戶',
        },
        taskTitle: {
          type:        'string',
          description: '（選項B）任務標題（taskId 未提供時必填）',
        },
        taskDueDate: {
          type:        'string',
          description: '（選項B）任務截止日期（ISO 8601 格式，例如 2026-03-15T00:00:00Z）',
        },
        projectName: {
          type:        'string',
          description: '（選項B）所屬專案名稱',
          default:     '未指定專案',
        },
      },
    },
  },

  // ─────────────────────────────────────────────────────────
  // 工具 4：查詢用戶工作量
  // ─────────────────────────────────────────────────────────
  {
    name: 'get_user_workload',
    description:
      '查詢用戶目前的工作量與即將到期的任務。' +
      '可以查詢所有用戶的工作量分佈，或指定單一用戶的詳細任務清單。' +
      '適合主管用來了解團隊成員負載是否均衡，以及誰有任務需要關注。',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: {
          type:        'number',
          description: '公司 ID（預設：2）',
          default:     2,
        },
        userId: {
          type:        'number',
          description: '（可選）指定查詢單一用戶的詳細工作量。省略時回傳所有用戶的摘要。',
        },
        days: {
          type:        'number',
          description: '查詢未來幾天內的即將到期任務（預設：7 天）',
          default:     7,
        },
      },
    },
  },

  // ─────────────────────────────────────────────────────────
  // 工具 5：建立任務
  // ─────────────────────────────────────────────────────────
  {
    name: 'create_task',
    description:
      '在指定專案下建立新任務。' +
      '可以設定標題、描述、指派人、截止日期、優先級等。' +
      '建立完成後，若有提供指派人的 email，可選擇是否立即發送指派通知郵件。',
    inputSchema: {
      type:     'object',
      required: ['projectId', 'title'],
      properties: {
        projectId: {
          type:        'number',
          description: '所屬專案 ID（必填）',
        },
        title: {
          type:        'string',
          description: '任務標題（必填，最長 500 字元）',
        },
        description: {
          type:        'string',
          description: '任務詳細說明（可選）',
          default:     '',
        },
        assigneeId: {
          type:        'number',
          description: '指派給哪位用戶（可選，填用戶 ID）',
        },
        dueDate: {
          type:        'string',
          description: '截止日期（ISO 8601 格式，例如：2026-03-31）',
        },
        priority: {
          type:        'string',
          description: '優先級（預設：medium）',
          enum:        ['low', 'medium', 'high', 'urgent'],
          default:     'medium',
        },
        creatorId: {
          type:        'number',
          description: '建立者 ID（可選，預設使用系統 ID 1）',
          default:     1,
        },
        sendNotification: {
          type:        'boolean',
          description: '建立後是否發送指派通知郵件給指派人（預設：false）',
          default:     false,
        },
      },
    },
  },

  // ─────────────────────────────────────────────────────────
  // 工具 6：AI 專案健康度分析（analyze_project_health）
  // ─────────────────────────────────────────────────────────
  {
    name: 'analyze_project_health',
    description:
      '使用 AI 深度分析指定專案的健康度，回傳風險分數（0~100）、風險等級、問題成因分析，以及具體的建議行動清單。' +
      '比 get_project_status 更深入——不只看數字，還分析背後的原因與影響。' +
      '建議在發現專案有問題時（🔴🟡）使用此工具進行深度診斷。',
    inputSchema: {
      type:     'object',
      required: ['projectId'],
      properties: {
        projectId: {
          type:        'number',
          description: '要分析的專案 ID（必填）',
        },
        companyId: {
          type:        'number',
          description: '公司 ID（預設：2）',
          default:     2,
        },
        deepAnalysis: {
          type:        'boolean',
          description: '是否使用 GPT-4 AI 進行深度分析（true）或只用規則計算健康分數（false）。深度分析較慢（~10秒）但更有洞察力。預設：true',
          default:     true,
        },
      },
    },
  },

  // ─────────────────────────────────────────────────────────
  // 工具 7：AI 任務拆解建議（suggest_task_breakdown）
  // ─────────────────────────────────────────────────────────
  {
    name: 'suggest_task_breakdown',
    description:
      '使用 GPT-4 AI 將一個模糊的專案目標或需求描述，智慧拆解成 8~12 個具體可執行的子任務清單。' +
      '每個任務包含：標題、描述、估算工時、優先級、依賴關係、驗收標準。' +
      '適合用於：開啟新專案前的規劃、接到新需求時快速拆解、評估工作量。',
    inputSchema: {
      type:     'object',
      required: ['projectGoal'],
      properties: {
        projectGoal: {
          type:        'string',
          description: '專案目標或需求描述（中文，越具體越好）。例如：「建立公司 HR 請假系統，員工可申請年假、病假，主管可審核」',
        },
        teamSize: {
          type:        'number',
          description: '（可選）團隊人數，幫助 AI 估算合理工時',
        },
        techStack: {
          type:        'string',
          description: '（可選）技術棧，例如：「React + Node.js + PostgreSQL」',
        },
        duration: {
          type:        'string',
          description: '（可選）目標完成時間，例如：「6 週」「3 個月」',
        },
        existingContext: {
          type:        'string',
          description: '（可選）現有系統或限制說明，例如：「需整合現有 AD 帳號，不能改資料庫架構」',
        },
      },
    },
  },

  // ─────────────────────────────────────────────────────────
  // 工具 8：AI 重新排程建議（optimize_schedule）
  // ─────────────────────────────────────────────────────────
  {
    name: 'optimize_schedule',
    description:
      '使用 GPT-4 AI 分析指定專案的現況排程，找出關鍵路徑、工作量失衡、不合理截止日等問題，' +
      '並給出具體的重新排程建議（調整截止日、重新指派人員、任務拆分）。' +
      '⚠️ 此工具只提供建議，不會直接修改資料庫中的任何資料。',
    inputSchema: {
      type:     'object',
      required: ['projectId'],
      properties: {
        projectId: {
          type:        'number',
          description: '要分析的專案 ID（必填）',
        },
        companyId: {
          type:        'number',
          description: '公司 ID（預設：2）',
          default:     2,
        },
      },
    },
  },
];

// ════════════════════════════════════════════════════════════
// 工具處理函式（Tool Handlers）
// ════════════════════════════════════════════════════════════

// ── 輔助工具 ────────────────────────────────────────────────
const STATUS_LABEL = {
  planning:  '規劃中',
  active:    '進行中',
  on_hold:   '暫停',
  completed: '已完成',
  cancelled: '已取消',
};

const PRIORITY_LABEL = {
  low:    '低',
  medium: '中',
  high:   '高',
  urgent: '緊急',
};

/** 計算健康燈號 */
function getHealthSignal(overdueCount, completionPct) {
  if (overdueCount >= 3 || completionPct < 30) return '🔴 紅燈（需要立即關注）';
  if (overdueCount >= 1 || completionPct < 70) return '🟡 黃燈（需要注意）';
  return '🟢 綠燈（進度正常）';
}

/** 格式化日期為台灣格式 */
function formatDate(date) {
  if (!date) return '未設定';
  const d = new Date(date);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

/** 計算逾期天數 */
function daysOverdue(dueDate) {
  const now  = new Date();
  const due  = new Date(dueDate);
  const diff = Math.floor((now - due) / (1000 * 60 * 60 * 24));
  return diff;
}

/** 計算距截止天數 */
function daysUntilDue(dueDate) {
  const now  = new Date();
  const due  = new Date(dueDate);
  const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  return diff;
}

// ─────────────────────────────────────────────────────────
// 處理器 1：get_project_status
// ─────────────────────────────────────────────────────────
async function handleGetProjectStatus(args) {
  const companyId = args.companyId ?? 2;
  const projectId = args.projectId;
  const status    = args.status;

  // ── 查詢單一專案 ─────────────────────────────────────
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, companyId, deletedAt: null },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        tasks: {
          where: { deletedAt: null },
          select: {
            id: true, title: true, status: true, priority: true,
            dueDate: true, assignee: { select: { id: true, name: true, email: true } },
          },
          orderBy: { dueDate: 'asc' },
        },
        milestones: {
          select: { id: true, name: true, dueDate: true, isAchieved: true },
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    if (!project) {
      throw new McpError(ErrorCode.InvalidParams, `找不到專案 #${projectId}（companyId: ${companyId}）`);
    }

    const now      = new Date();
    const total    = project.tasks.length;
    const done     = project.tasks.filter(t => t.status === 'done').length;
    const overdue  = project.tasks.filter(t =>
      t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now
    );
    const pending  = project.tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
    const completionPct = total > 0 ? Math.round((done / total) * 100) : 0;

    const lines = [
      `# 📋 專案詳情：${project.name}`,
      '',
      `**狀態**：${STATUS_LABEL[project.status] || project.status}`,
      `**負責人**：${project.owner?.name || '未指定'}`,
      `**健康燈號**：${getHealthSignal(overdue.length, completionPct)}`,
      `**進度**：${completionPct}%（已完成 ${done} / 共 ${total} 個任務）`,
      `**逾期任務**：${overdue.length} 個`,
      `**開始日期**：${formatDate(project.startDate)}`,
      `**截止日期**：${formatDate(project.endDate)}`,
      `**預算**：${project.budget ? `NT$${Number(project.budget).toLocaleString()}` : '未設定'}`,
      '',
    ];

    if (overdue.length > 0) {
      lines.push('## 🚨 逾期任務');
      overdue.forEach(t => {
        lines.push(
          `- **${t.title}**（#${t.id}）` +
          ` — 負責：${t.assignee?.name || '未指派'}` +
          ` — 逾期 ${daysOverdue(t.dueDate)} 天` +
          ` — 優先級：${PRIORITY_LABEL[t.priority] || t.priority}`
        );
      });
      lines.push('');
    }

    if (pending.length > 0) {
      lines.push('## 📌 進行中任務（依截止日排序）');
      pending.slice(0, 10).forEach(t => {
        const dueTxt = t.dueDate
          ? (new Date(t.dueDate) < now ? `⚠️ 已逾期 ${daysOverdue(t.dueDate)} 天` : `截止：${formatDate(t.dueDate)}`)
          : '無截止日';
        lines.push(
          `- **${t.title}**（#${t.id}）` +
          ` — ${t.assignee?.name || '未指派'}` +
          ` — ${dueTxt}`
        );
      });
      if (pending.length > 10) lines.push(`  _（另有 ${pending.length - 10} 個任務，已省略）_`);
      lines.push('');
    }

    if (project.milestones.length > 0) {
      lines.push('## 🏁 里程碑');
      project.milestones.forEach(m => {
        const status = m.isAchieved ? '✅ 已達成' : (m.dueDate && new Date(m.dueDate) < now ? '⚠️ 逾期' : '⏳ 待達成');
        lines.push(`- ${status} **${m.name}**（${formatDate(m.dueDate)}）`);
      });
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  // ── 查詢所有專案列表 ───────────────────────────────────
  const where = { companyId, deletedAt: null };
  if (status) where.status = status;

  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      owner: { select: { name: true } },
      tasks: {
        where:  { deletedAt: null },
        select: { status: true, dueDate: true },
      },
    },
  });

  if (projects.length === 0) {
    return {
      content: [{
        type: 'text',
        text: `目前沒有${status ? `「${STATUS_LABEL[status]}」狀態的` : ''}專案。`,
      }],
    };
  }

  const now = new Date();
  const lines = [
    `# 📊 專案狀態總覽（共 ${projects.length} 個專案）`,
    '',
    '| 專案 | 狀態 | 進度 | 逾期 | 截止日 | 負責人 | 健康 |',
    '|------|------|------|------|--------|--------|------|',
  ];

  let totalOverdue = 0;

  projects.forEach(p => {
    const total         = p.tasks.length;
    const done          = p.tasks.filter(t => t.status === 'done').length;
    const overdueCount  = p.tasks.filter(t =>
      t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now
    ).length;
    const completionPct = total > 0 ? Math.round((done / total) * 100) : 0;

    totalOverdue += overdueCount;

    const health = overdueCount >= 3 || completionPct < 30 ? '🔴'
                 : overdueCount >= 1 || completionPct < 70 ? '🟡' : '🟢';

    lines.push(
      `| ${p.name} | ${STATUS_LABEL[p.status] || p.status} |` +
      ` ${completionPct}% (${done}/${total}) |` +
      ` ${overdueCount > 0 ? `⚠️ ${overdueCount}` : '0'} |` +
      ` ${formatDate(p.endDate)} |` +
      ` ${p.owner?.name || '未指定'} |` +
      ` ${health} |`
    );
  });

  lines.push('');
  lines.push(`**全公司逾期任務總計**：${totalOverdue} 個`);
  lines.push(`_（使用 get_project_status 搭配 projectId 查看單一專案詳情）_`);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ─────────────────────────────────────────────────────────
// 處理器 2：get_overdue_tasks
// ─────────────────────────────────────────────────────────
async function handleGetOverdueTasks(args) {
  const companyId  = args.companyId ?? 2;
  const assigneeId = args.assigneeId;
  const projectId  = args.projectId;
  const limit      = Math.min(args.limit ?? 20, 100);

  const now = new Date();

  const where = {
    deletedAt: null,
    status:    { notIn: ['done', 'cancelled'] },
    dueDate:   { lt: now, not: null },
    project:   { companyId, deletedAt: null },
  };

  if (assigneeId) where.assigneeId = assigneeId;
  if (projectId)  where.projectId  = projectId;

  const tasks = await prisma.task.findMany({
    where,
    take:    limit,
    orderBy: { dueDate: 'asc' },   // 最舊的逾期排前面
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      project:  { select: { id: true, name: true } },
    },
  });

  // 查詢總數（不受 limit 限制）
  const totalCount = await prisma.task.count({ where });

  if (tasks.length === 0) {
    const targetDesc = assigneeId ? `用戶 #${assigneeId}` : '全公司';
    return {
      content: [{
        type: 'text',
        text: `✅ ${targetDesc} 目前沒有逾期任務！`,
      }],
    };
  }

  const lines = [
    `# 🚨 逾期任務清單`,
    '',
    `**共 ${totalCount} 個逾期任務**${totalCount > limit ? `（顯示前 ${limit} 筆）` : ''}`,
    '',
  ];

  // 按指派人分組
  const byAssignee = {};
  tasks.forEach(t => {
    const key   = t.assignee ? `${t.assignee.name}（${t.assignee.email}）` : '（未指派）';
    const keyId = t.assignee?.id ?? 0;
    if (!byAssignee[key]) byAssignee[key] = { tasks: [], id: keyId, email: t.assignee?.email };
    byAssignee[key].tasks.push(t);
  });

  Object.entries(byAssignee).forEach(([assigneeName, group]) => {
    lines.push(`## 👤 ${assigneeName}（${group.tasks.length} 個逾期任務）`);
    if (group.email) lines.push(`_可使用 send_reminder_email 對此用戶發送提醒_`);
    lines.push('');

    group.tasks.forEach(t => {
      const overdueDays = daysOverdue(t.dueDate);
      const urgency     = overdueDays >= 14 ? '🔴🔴 極度緊急' :
                          overdueDays >= 7  ? '🔴 非常緊急' :
                          overdueDays >= 3  ? '🟠 緊急' : '🟡 逾期';

      lines.push(
        `- ${urgency} **${t.title}**（任務 #${t.id}）\n` +
        `  📁 ${t.project.name} | ⏰ 截止：${formatDate(t.dueDate)} | 逾期 **${overdueDays} 天** | 優先級：${PRIORITY_LABEL[t.priority] || t.priority}`
      );
    });
    lines.push('');
  });

  // 統計摘要
  const criticalCount = tasks.filter(t => daysOverdue(t.dueDate) >= 7).length;
  if (criticalCount > 0) {
    lines.push(`> ⚠️ 注意：有 ${criticalCount} 個任務逾期超過 7 天，建議立即發送提醒或升級處理。`);
    lines.push(`> 💡 使用 \`send_reminder_email\` 工具（emailType: "overdue"）對相關人員發送警告郵件。`);
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ─────────────────────────────────────────────────────────
// 處理器 3：send_reminder_email
// ─────────────────────────────────────────────────────────
async function handleSendReminderEmail(args) {
  const { emailType, taskId, userEmail, userName = '用戶', taskTitle, taskDueDate, projectName = '未指定專案' } = args;

  let recipientEmail, recipientName, taskDetails;

  // ── 模式 A：從資料庫查詢 taskId ─────────────────────
  if (taskId) {
    const task = await prisma.task.findFirst({
      where:   { id: taskId, deletedAt: null },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        project:  { select: { name: true } },
      },
    });

    if (!task) {
      throw new McpError(ErrorCode.InvalidParams, `找不到任務 #${taskId}`);
    }
    if (!task.assignee?.email) {
      throw new McpError(ErrorCode.InvalidParams, `任務 #${taskId} 沒有指派人，或指派人沒有 email`);
    }

    recipientEmail = task.assignee.email;
    recipientName  = task.assignee.name;
    taskDetails    = {
      id:          task.id,
      title:       task.title,
      projectName: task.project?.name || '未指定',
      priority:    task.priority,
      status:      task.status,
      dueDate:     task.dueDate?.toISOString(),
      description: task.description || '',
    };

  // ── 模式 B：手動指定收件人 ──────────────────────────
  } else {
    if (!userEmail) {
      throw new McpError(ErrorCode.InvalidParams, '請提供 taskId 或 userEmail（至少一個）');
    }
    if (!taskTitle) {
      throw new McpError(ErrorCode.InvalidParams, '使用 userEmail 模式時，taskTitle 為必填');
    }

    recipientEmail = userEmail;
    recipientName  = userName;
    taskDetails    = {
      id:          0,
      title:       taskTitle,
      projectName: projectName,
      priority:    'high',
      status:      'in_progress',
      dueDate:     taskDueDate || new Date().toISOString(),
      description: '',
    };
  }

  // ── 發送郵件 ─────────────────────────────────────────
  const emailSvc = getEmailService();
  try {
    if (emailType === 'overdue') {
      await emailSvc.sendOverdueWarning(recipientEmail, recipientName, taskDetails);
    } else {
      await emailSvc.sendTaskReminder(recipientEmail, recipientName, taskDetails);
    }
  } catch (err) {
    throw new McpError(
      ErrorCode.InternalError,
      `郵件發送失敗：${err.message}`
    );
  }

  const typeLabel = emailType === 'overdue' ? '逾期警告' : '截止提醒';
  return {
    content: [{
      type: 'text',
      text: [
        `✅ **${typeLabel}郵件發送成功！**`,
        '',
        `📧 收件人：${recipientName}（${recipientEmail}）`,
        `📋 任務：${taskDetails.title}`,
        `📁 專案：${taskDetails.projectName}`,
        `⏰ 截止：${formatDate(taskDetails.dueDate)}`,
        '',
        '_請確認收件人已收到郵件。若未收到，請檢查垃圾郵件匣。_',
      ].join('\n'),
    }],
  };
}

// ─────────────────────────────────────────────────────────
// 處理器 4：get_user_workload
// ─────────────────────────────────────────────────────────
async function handleGetUserWorkload(args) {
  const companyId = args.companyId ?? 2;
  const userId    = args.userId;
  const days      = args.days ?? 7;
  const now       = new Date();
  const future    = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // ── 查詢單一用戶 ─────────────────────────────────────
  if (userId) {
    const user = await prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      throw new McpError(ErrorCode.InvalidParams, `找不到用戶 #${userId}（companyId: ${companyId}）`);
    }

    const tasks = await prisma.task.findMany({
      where: {
        assigneeId: userId,
        deletedAt:  null,
        status:     { notIn: ['done', 'cancelled'] },
        project:    { companyId, deletedAt: null },
      },
      orderBy: { dueDate: 'asc' },
      include: { project: { select: { name: true } } },
    });

    const overdueTasks  = tasks.filter(t => t.dueDate && new Date(t.dueDate) < now);
    const upcomingTasks = tasks.filter(t => t.dueDate && new Date(t.dueDate) >= now && new Date(t.dueDate) <= future);
    const otherTasks    = tasks.filter(t => !t.dueDate || new Date(t.dueDate) > future);

    const lines = [
      `# 👤 ${user.name} 的工作量報告`,
      '',
      `**Email**：${user.email}  |  **角色**：${user.role}`,
      `**未完成任務總計**：${tasks.length} 個（逾期 ${overdueTasks.length} 個 ＋ 未來 ${days} 天到期 ${upcomingTasks.length} 個）`,
      '',
    ];

    if (overdueTasks.length > 0) {
      lines.push(`## 🚨 逾期任務（${overdueTasks.length} 個）`);
      overdueTasks.forEach(t => {
        lines.push(`- ⚠️ **${t.title}**（#${t.id}）— ${t.project.name} — 逾期 ${daysOverdue(t.dueDate)} 天`);
      });
      lines.push('');
    }

    if (upcomingTasks.length > 0) {
      lines.push(`## ⏰ 即將到期（${days} 天內，共 ${upcomingTasks.length} 個）`);
      upcomingTasks.forEach(t => {
        lines.push(`- 📅 **${t.title}**（#${t.id}）— ${t.project.name} — 還有 ${daysUntilDue(t.dueDate)} 天（${formatDate(t.dueDate)}）`);
      });
      lines.push('');
    }

    if (otherTasks.length > 0) {
      lines.push(`## 📋 其他任務（${otherTasks.length} 個）`);
      otherTasks.slice(0, 5).forEach(t => {
        const dueTxt = t.dueDate ? formatDate(t.dueDate) : '無截止日';
        lines.push(`- **${t.title}**（#${t.id}）— ${t.project.name} — 截止：${dueTxt}`);
      });
      if (otherTasks.length > 5) lines.push(`  _（另有 ${otherTasks.length - 5} 個任務已省略）_`);
      lines.push('');
    }

    if (tasks.length === 0) {
      lines.push('✅ 目前沒有未完成的任務。');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  // ── 查詢所有用戶摘要 ─────────────────────────────────
  const users = await prisma.user.findMany({
    where:   { companyId, isActive: true },
    orderBy: { name: 'asc' },
    select:  { id: true, name: true, email: true, role: true },
  });

  if (users.length === 0) {
    return { content: [{ type: 'text', text: '目前公司沒有活躍用戶。' }] };
  }

  // 批次查詢所有用戶的任務統計
  const taskStats = await prisma.task.groupBy({
    by:   ['assigneeId'],
    where: {
      deletedAt: null,
      status:    { notIn: ['done', 'cancelled'] },
      project:   { companyId, deletedAt: null },
      assigneeId: { not: null },
    },
    _count: { id: true },
  });

  const overdueStats = await prisma.task.groupBy({
    by:   ['assigneeId'],
    where: {
      deletedAt: null,
      status:    { notIn: ['done', 'cancelled'] },
      dueDate:   { lt: now, not: null },
      project:   { companyId, deletedAt: null },
      assigneeId: { not: null },
    },
    _count: { id: true },
  });

  const taskMap   = Object.fromEntries(taskStats.map(s => [s.assigneeId, s._count.id]));
  const overdueMap = Object.fromEntries(overdueStats.map(s => [s.assigneeId, s._count.id]));

  const lines = [
    `# 👥 團隊工作量摘要（共 ${users.length} 位成員）`,
    '',
    '| 姓名 | 角色 | 未完成 | 逾期 | 狀況 |',
    '|------|------|--------|------|------|',
  ];

  users.forEach(u => {
    const total    = taskMap[u.id] ?? 0;
    const overdue  = overdueMap[u.id] ?? 0;
    const status   = overdue >= 3 ? '🔴 過載'  :
                     overdue >= 1 ? '🟡 有逾期' :
                     total  >= 10 ? '🟠 任務多' : '🟢 正常';

    const roleLabel = { admin: '管理員', pm: '專案經理', member: '成員' }[u.role] || u.role;

    lines.push(
      `| ${u.name} | ${roleLabel} | ${total} | ${overdue > 0 ? `⚠️ ${overdue}` : '0'} | ${status} |`
    );
  });

  lines.push('');
  lines.push(`_使用 \`get_user_workload\` 搭配 \`userId\` 查看個人詳細任務清單_`);
  lines.push(`_使用 \`send_reminder_email\` 對有逾期任務的用戶發送提醒_`);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ─────────────────────────────────────────────────────────
// 處理器 5：create_task
// ─────────────────────────────────────────────────────────
async function handleCreateTask(args) {
  const {
    projectId,
    title,
    description    = '',
    assigneeId,
    dueDate,
    priority       = 'medium',
    creatorId      = 1,
    sendNotification = false,
  } = args;

  // 驗證專案存在
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, name: true, companyId: true },
  });

  if (!project) {
    throw new McpError(ErrorCode.InvalidParams, `找不到專案 #${projectId}`);
  }

  // 驗證指派人（若有提供）
  let assignee = null;
  if (assigneeId) {
    assignee = await prisma.user.findFirst({
      where:  { id: assigneeId, companyId: project.companyId },
      select: { id: true, name: true, email: true },
    });
    if (!assignee) {
      throw new McpError(ErrorCode.InvalidParams, `找不到用戶 #${assigneeId}（或不屬於此公司）`);
    }
  }

  // 驗證建立者
  const creator = await prisma.user.findFirst({
    where:  { id: creatorId },
    select: { id: true, name: true },
  });
  if (!creator) {
    throw new McpError(ErrorCode.InvalidParams, `找不到建立者用戶 #${creatorId}`);
  }

  // 建立任務
  const task = await prisma.task.create({
    data: {
      projectId,
      title:       title.trim(),
      description: description.trim(),
      assigneeId:  assignee?.id ?? null,
      creatorId:   creator.id,
      priority,
      status:      'todo',
      dueDate:     dueDate ? new Date(dueDate) : null,
    },
    include: {
      project:  { select: { name: true } },
      assignee: { select: { name: true, email: true } },
    },
  });

  const lines = [
    `✅ **任務建立成功！**`,
    '',
    `**任務 ID**：#${task.id}`,
    `**標題**：${task.title}`,
    `**專案**：${task.project.name}（#${projectId}）`,
    `**指派人**：${task.assignee?.name || '（未指派）'}`,
    `**優先級**：${PRIORITY_LABEL[task.priority] || task.priority}`,
    `**截止日期**：${formatDate(task.dueDate)}`,
    `**狀態**：待處理（todo）`,
    '',
  ];

  // 發送指派通知（若有指派人且要求發送）
  if (sendNotification && assignee?.email) {
    try {
      const emailSvc = getEmailService();
      await emailSvc.sendTaskAssignmentNotification(
        assignee.email,
        assignee.name,
        {
          id:          task.id,
          title:       task.title,
          projectName: task.project.name,
          priority:    task.priority,
          status:      task.status,
          dueDate:     task.dueDate?.toISOString(),
          description: task.description || '',
          assignerName: creator.name,
        }
      );
      lines.push(`📧 **指派通知已發送**至 ${assignee.email}`);
    } catch (emailErr) {
      // 郵件失敗不影響任務建立
      lines.push(`⚠️ 任務已建立，但郵件通知發送失敗：${emailErr.message}`);
    }
  } else if (sendNotification && !assignee?.email) {
    lines.push(`ℹ️ 未發送通知：指派人沒有設定 email 地址`);
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ─────────────────────────────────────────────────────────
// 處理器 6：analyze_project_health（AI 健康度分析）
// ─────────────────────────────────────────────────────────
async function handleAnalyzeProjectHealth(args) {
  const companyId    = args.companyId ?? 2;
  const projectId    = args.projectId;
  const deepAnalysis = args.deepAnalysis !== false;  // 預設 true

  // 查詢專案完整資料（提供給 AI 分析）
  const now = new Date();
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId, deletedAt: null },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      tasks: {
        where:   { deletedAt: null },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
        },
      },
      milestones: {
        select: { id: true, name: true, dueDate: true, isAchieved: true },
      },
    },
  });

  if (!project) {
    throw new McpError(ErrorCode.InvalidParams, `找不到專案 #${projectId}（companyId: ${companyId}）`);
  }

  // 計算每個成員的任務負載
  const memberMap = {};
  project.tasks.forEach(t => {
    if (t.assignee) {
      const key = t.assignee.id;
      if (!memberMap[key]) {
        memberMap[key] = { ...t.assignee, taskCount: 0, overdueCount: 0 };
      }
      memberMap[key].taskCount++;
      if (t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now) {
        memberMap[key].overdueCount++;
      }
    }
  });

  const projectData = {
    id:         project.id,
    name:       project.name,
    status:     project.status,
    endDate:    project.endDate,
    budget:     project.budget,
    tasks:      project.tasks,
    milestones: project.milestones,
    team:       Object.values(memberMap),
  };

  const ai = getAiAgent();

  // ── 快速模式：只用公式計算 ──────────────────────────
  if (!deepAnalysis) {
    const health = ai.computeHealthScore(projectData);
    const tasks  = project.tasks;
    const total  = tasks.length;
    const done   = tasks.filter(t => t.status === 'done').length;
    const overdue = tasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now);

    return {
      content: [{
        type: 'text',
        text: [
          `# 🏥 專案健康度：${project.name}`,
          '',
          `**健康分數**：${health.score} / 100`,
          `**狀態**：${health.levelLabel}`,
          '',
          `| 指標 | 數值 |`,
          `|------|------|`,
          `| 完成率 | ${health.breakdown.completionPct}%（${done}/${total}）|`,
          `| 逾期率 | ${health.breakdown.overduePct}%（${overdue.length} 個逾期）|`,
          `| 緊急未完成 | ${health.breakdown.urgentCount} 個 |`,
          '',
          `_提示：使用 \`deepAnalysis: true\` 呼叫此工具，可獲得 AI 深度分析（含原因與建議行動）_`,
        ].join('\n'),
      }],
    };
  }

  // ── 深度模式：呼叫 GPT-4 AI 分析 ───────────────────
  let report;
  try {
    report = await ai.analyzeRisk(projectData);
  } catch (err) {
    throw new McpError(ErrorCode.InternalError, `AI 分析失敗：${err.message}`);
  }

  // 格式化輸出
  const levelEmoji = { low: '🟢', medium: '🟡', high: '🔴', critical: '🔴🔴' };
  const lines = [
    `# 🏥 AI 專案健康度分析：${project.name}`,
    '',
    `**風險分數**：${report.riskScore} / 100  ${levelEmoji[report.riskLevel] || ''} ${report.riskLevelLabel}`,
    `**摘要**：${report.summary}`,
    '',
  ];

  if (report.factors?.length > 0) {
    lines.push('## 🔍 風險因素');
    report.factors.forEach(f => {
      const sevEmoji = { critical: '🔴🔴', high: '🔴', medium: '🟡', low: '🟢' }[f.severity] || '⚪';
      lines.push(`### ${sevEmoji} ${f.title}（${f.categoryLabel}）`);
      lines.push(f.description);
      if (f.impact) lines.push(`> ⚡ 若未處理：${f.impact}`);
      lines.push('');
    });
  }

  if (report.recommendations?.length > 0) {
    lines.push('## 💡 建議行動（依優先級排序）');
    report.recommendations.forEach((r, i) => {
      lines.push(`${i + 1}. **${r.action}**`);
      lines.push(`   👤 負責人：${r.owner}  ⏰ 時限：${r.timeline}`);
      lines.push(`   ✅ 預期效果：${r.expectedOutcome}`);
      lines.push('');
    });
  }

  if (report.positives?.length > 0) {
    lines.push('## ✨ 做得好的地方');
    report.positives.forEach(p => lines.push(`- ${p}`));
    lines.push('');
  }

  lines.push(`_AI 分析使用模型：${report._meta?.model || 'gpt-4o'} | 分析時間：${new Date().toLocaleString('zh-TW')}_`);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ─────────────────────────────────────────────────────────
// 處理器 7：suggest_task_breakdown（AI 任務拆解）
// ─────────────────────────────────────────────────────────
async function handleSuggestTaskBreakdown(args) {
  const {
    projectGoal,
    teamSize,
    techStack,
    duration,
    existingContext,
  } = args;

  if (!projectGoal?.trim()) {
    throw new McpError(ErrorCode.InvalidParams, 'projectGoal 不能為空');
  }

  const ai = getAiAgent();
  let result;
  try {
    result = await ai.breakdownTask(projectGoal, {
      teamSize,
      techStack,
      duration,
      existingContext,
    });
  } catch (err) {
    throw new McpError(ErrorCode.InternalError, `AI 任務拆解失敗：${err.message}`);
  }

  const PRIORITY_EMOJI = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

  const lines = [
    `# 🤖 AI 任務拆解建議`,
    '',
    `**目標**：${projectGoal}`,
    `**摘要**：${result.summary}`,
    `**預估總工時**：${result.totalEstimatedHours} 人時`,
    `**建議時程**：${result.suggestedDuration}`,
    '',
  ];

  if (result.assumptions?.length > 0) {
    lines.push('**前提假設：**');
    result.assumptions.forEach(a => lines.push(`- ⚠️ ${a}`));
    lines.push('');
  }

  lines.push(`## 📋 子任務清單（共 ${result.tasks?.length || 0} 個）`);
  lines.push('');

  const phases = {};
  (result.tasks || []).forEach(t => {
    const phase = t.phase || '其他';
    if (!phases[phase]) phases[phase] = [];
    phases[phase].push(t);
  });

  Object.entries(phases).forEach(([phase, tasks]) => {
    lines.push(`### 📂 ${phase}`);
    tasks.forEach(t => {
      const emoji   = PRIORITY_EMOJI[t.priority] || '⚪';
      const depends = t.dependsOn?.length > 0 ? `（需先完成：任務 ${t.dependsOn.join(', ')}）` : '';
      lines.push(`**${t.order}. ${emoji} ${t.title}**${depends}`);
      lines.push(`> ${t.description}`);
      lines.push(`⏱️ 估算工時：**${t.estimatedHours} 人時** | 技能：${t.skills?.join('、') || '—'}`);
      lines.push(`✅ 驗收標準：${t.acceptanceCriteria || '未定義'}`);
      lines.push('');
    });
  });

  lines.push(`---`);
  lines.push(`_💡 使用 \`create_task\` 工具可將以上任務逐一建立到 xCloudPMIS 系統_`);
  lines.push(`_AI 分析使用模型：${result._meta?.model || 'gpt-4o'}_`);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ─────────────────────────────────────────────────────────
// 處理器 8：optimize_schedule（AI 重新排程建議）
// ─────────────────────────────────────────────────────────
async function handleOptimizeSchedule(args) {
  const companyId = args.companyId ?? 2;
  const projectId = args.projectId;

  // 查詢專案資料
  const now = new Date();
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId, deletedAt: null },
    include: {
      tasks: {
        where:   { deletedAt: null, status: { notIn: ['done', 'cancelled'] } },
        include: {
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: 'asc' },
      },
    },
  });

  if (!project) {
    throw new McpError(ErrorCode.InvalidParams, `找不到專案 #${projectId}（companyId: ${companyId}）`);
  }

  if (project.tasks.length === 0) {
    return {
      content: [{
        type: 'text',
        text: `✅ 專案「${project.name}」目前沒有未完成的任務，無需重新排程。`,
      }],
    };
  }

  // 計算每個成員的可用工時（假設每週 40 小時，依目前任務量估算）
  const memberWorkload = {};
  project.tasks.forEach(t => {
    if (t.assignee) {
      const key = t.assignee.id;
      if (!memberWorkload[key]) {
        memberWorkload[key] = { ...t.assignee, taskCount: 0, availableHours: 40 };
      }
      memberWorkload[key].taskCount++;
    }
  });

  const projectData = {
    id:      project.id,
    name:    project.name,
    endDate: project.endDate,
    tasks:   project.tasks.map(t => ({
      id:             t.id,
      title:          t.title,
      priority:       t.priority,
      estimatedHours: t.estimatedHours ? Number(t.estimatedHours) : null,
      dueDate:        t.dueDate,
      status:         t.status,
      assignee:       t.assignee,
    })),
    team: Object.values(memberWorkload),
  };

  const ai = getAiAgent();
  let result;
  try {
    result = await ai.optimizeSchedule(projectData);
  } catch (err) {
    throw new McpError(ErrorCode.InternalError, `AI 排程分析失敗：${err.message}`);
  }

  const ACTION_EMOJI = {
    '延後': '⏩', '提前': '⏪', '重新指派': '🔄', '拆分': '✂️',
  };

  const lines = [
    `# 📅 AI 排程優化建議：${project.name}`,
    '',
    `**整體評估**：${result.summary}`,
    `**可行性評估**：${result.feasibility}`,
    '',
  ];

  if (result.criticalPath?.length > 0) {
    lines.push('## 🎯 關鍵路徑（Critical Path）');
    lines.push('以下任務任何一個延誤，都會導致整個專案延期：');
    result.criticalPath.forEach((t, i) => {
      lines.push(`${i + 1}. ${t}`);
    });
    lines.push('');
  }

  if (result.suggestions?.length > 0) {
    lines.push(`## 🔧 排程調整建議（${result.suggestions.length} 項）`);
    result.suggestions.forEach(s => {
      const emoji = Object.entries(ACTION_EMOJI).find(([k]) => s.action?.includes(k))?.[1] || '📌';
      lines.push(`### ${emoji} ${s.taskTitle}`);
      lines.push(`- 現在截止日：${s.currentDueDate}`);
      lines.push(`- 建議截止日：**${s.suggestedDueDate}**`);
      lines.push(`- 建議行動：**${s.action}**`);
      lines.push(`- 原因：${s.reason}`);
      if (s.suggestedAssignee) lines.push(`- 建議指派給：${s.suggestedAssignee}`);
      lines.push('');
    });
  }

  if (result.workloadRebalancing?.length > 0) {
    lines.push('## ⚖️ 工作量平衡建議');
    result.workloadRebalancing.forEach(w => {
      lines.push(`- **${w.member}**（目前 ${w.currentLoad} 個任務）：${w.suggestion}`);
    });
    lines.push('');
  }

  lines.push(`---`);
  lines.push(`⚠️ _以上為建議，不會自動修改資料。如需調整，請使用 \`create_task\` 建立任務或在 xCloudPMIS 介面手動更新。_`);
  lines.push(`_AI 分析模型：${result._meta?.model || 'gpt-4o'}_`);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ════════════════════════════════════════════════════════════
// MCP Server 初始化
// ════════════════════════════════════════════════════════════

const server = new Server(
  {
    name:    'xcloudpmis',
    version: '1.0.0',
  },
  {
    capabilities: { tools: {} },
  }
);

// ── 列出工具 ────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// ── 執行工具 ────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case 'get_project_status':      return await handleGetProjectStatus(args);
      case 'get_overdue_tasks':       return await handleGetOverdueTasks(args);
      case 'send_reminder_email':     return await handleSendReminderEmail(args);
      case 'get_user_workload':       return await handleGetUserWorkload(args);
      case 'create_task':             return await handleCreateTask(args);
      // ── AI 工具（需要 OPENAI_API_KEY）───────────────────
      case 'analyze_project_health':  return await handleAnalyzeProjectHealth(args);
      case 'suggest_task_breakdown':  return await handleSuggestTaskBreakdown(args);
      case 'optimize_schedule':       return await handleOptimizeSchedule(args);
      // ── Phase 1 自主代理工具（delegated to autonomousTools）
      default: {
        const autonomousResult = await handleAutonomousTool(name, args);
        if (autonomousResult !== null) {
          return { content: autonomousResult };
        }
        throw new McpError(ErrorCode.MethodNotFound, `未知工具：${name}`);
      }
    }
  } catch (err) {
    // McpError 直接往上拋，其他錯誤包裝成 McpError
    if (err instanceof McpError) throw err;

    console.error(`[MCP] 工具 ${name} 執行失敗:`, err.message);
    throw new McpError(
      ErrorCode.InternalError,
      `工具執行失敗：${err.message}`
    );
  }
});

// ── 啟動伺服器 ──────────────────────────────────────────────
async function main() {
  // 優雅關閉：清理 Prisma 連線
  process.on('SIGINT',  async () => { await prisma.$disconnect(); process.exit(0); });
  process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // MCP Server 透過 stdio 通訊，不能有額外的 console.log 污染輸出
  // 改用 stderr 記錄啟動訊息
  process.stderr.write('[xCloudPMIS MCP] Server 啟動成功，等待 Claude 連線...\n');
}

main().catch(err => {
  process.stderr.write(`[xCloudPMIS MCP] 啟動失敗: ${err.message}\n`);
  process.exit(1);
});
