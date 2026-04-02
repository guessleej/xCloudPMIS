'use strict';
/**
 * mcp-external-server/handlers/tools.js
 * ─────────────────────────────────────────────────────────────
 * 對外 MCP 工具實作（14 個核心工具 + OpenClaw RPA 工具）
 *
 * 所有工具共同規則：
 *   1. 資料嚴格依 apiKeyInfo.companyId 隔離
 *   2. Scope 檢查（無權限回傳 403 格式錯誤）
 *   3. 輸入驗證（缺少必填欄位回傳清楚錯誤）
 *   4. 輸出統一為 MCP TextContent JSON 格式
 *   5. 敏感操作（建立/修改）記錄到 ActivityLog
 *
 * 工具清單：
 *   專案管理：list_projects, get_project_details, create_project
 *   任務管理：list_tasks, get_task_details, create_task, update_task_status, add_task_comment
 *   資源管理：get_team_workload, find_available_member, assign_task
 *   報告類：  get_project_report, export_tasks
 *   整合類：  notify_user
 *   RPA 類：  rpa_execute_flow, rpa_get_flow_status
 *   Prompt：  create_task_description（模板生成）
 */

const axios = require('axios');
const { hasScope } = require('../auth/apiKeyManager');

// ── Prisma 共用 ──────────────────────────────────────────────
let _prisma = null;
function db() {
  if (!_prisma) {
    const { PrismaClient } = require('@prisma/client');
    _prisma = new PrismaClient({ log: ['error'] });
  }
  return _prisma;
}

// ── RPA 設定 ─────────────────────────────────────────────────
const RPA_BASE_URL     = process.env.OPENCLAW_BASE_URL || process.env.RPA_BASE_URL || 'http://localhost:8080';
const RPA_API_KEY      = process.env.OPENCLAW_API_KEY  || process.env.RPA_API_KEY  || '';
const RPA_WEBHOOK_URL  = process.env.MCP_WEBHOOK_URL   || '';

// ════════════════════════════════════════════════════════════
// 工具定義（TOOL_DEFINITIONS）
// 這是暴露給外部系統的「API 文件」
// ════════════════════════════════════════════════════════════

const TOOL_DEFINITIONS = [

  // ── 專案管理 ──────────────────────────────────────────────
  {
    name: 'list_projects',
    description: '取得專案清單（含進度摘要、里程碑、風險狀態）',
    requiredScopes: ['read:projects'],
    inputSchema: {
      type: 'object',
      properties: {
        status:  { type: 'string', enum: ['planning','active','on_hold','completed','cancelled'], description: '依狀態篩選' },
        limit:   { type: 'integer', minimum: 1, maximum: 100, description: '最多回傳筆數（預設 20）' },
        offset:  { type: 'integer', description: '分頁偏移' },
      },
    },
  },

  {
    name: 'get_project_details',
    description: '取得單一專案的詳細資訊（成員、里程碑、甘特資料）',
    requiredScopes: ['read:projects'],
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'integer', description: '專案 ID（必填）' },
      },
      required: ['projectId'],
    },
  },

  {
    name: 'create_project',
    description: '建立新專案',
    requiredScopes: ['write:projects'],
    inputSchema: {
      type: 'object',
      properties: {
        name:        { type: 'string',  description: '專案名稱（必填）' },
        description: { type: 'string',  description: '專案描述' },
        ownerId:     { type: 'integer', description: '負責人 User ID（必填）' },
        startDate:   { type: 'string',  description: '開始日期（ISO 8601，e.g. 2026-04-01）' },
        endDate:     { type: 'string',  description: '結束日期' },
        budget:      { type: 'number',  description: '預算（可選）' },
        status:      { type: 'string',  enum: ['planning','active'], description: '初始狀態（預設 planning）' },
      },
      required: ['name', 'ownerId'],
    },
  },

  // ── 任務管理 ──────────────────────────────────────────────
  {
    name: 'list_tasks',
    description: '查詢專案任務清單（可依狀態、指派人篩選）',
    requiredScopes: ['read:tasks'],
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'integer', description: '專案 ID（必填）' },
        status:    { type: 'string',  enum: ['todo','in_progress','review','done'], description: '依狀態篩選' },
        assigneeId: { type: 'integer', description: '依指派人篩選' },
        priority:  { type: 'string',  enum: ['low','medium','high','urgent'], description: '依優先級篩選' },
        overdue:   { type: 'boolean', description: 'true = 只回傳逾期任務' },
        limit:     { type: 'integer', maximum: 200, description: '最多筆數（預設 50）' },
      },
      required: ['projectId'],
    },
  },

  {
    name: 'get_task_details',
    description: '取得任務完整資料（評論、工時記錄、附件清單、活動歷史）',
    requiredScopes: ['read:tasks'],
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'integer', description: '任務 ID（必填）' },
      },
      required: ['taskId'],
    },
  },

  {
    name: 'create_task',
    description: '在指定專案中建立新任務',
    requiredScopes: ['write:tasks'],
    inputSchema: {
      type: 'object',
      properties: {
        projectId:       { type: 'integer', description: '專案 ID（必填）' },
        title:           { type: 'string',  description: '任務標題（必填）' },
        description:     { type: 'string',  description: '任務描述' },
        assigneeId:      { type: 'integer', description: '指派給的 User ID' },
        createdById:     { type: 'integer', description: '建立者 User ID（預設 1）' },
        dueDate:         { type: 'string',  description: '截止日期（ISO 8601）' },
        priority:        { type: 'string',  enum: ['low','medium','high','urgent'], description: '優先級（預設 medium）' },
        estimatedHours:  { type: 'number',  description: '預估工時（小時）' },
        dependsOnTaskIds: { type: 'array', items: { type: 'integer' }, description: '前置任務 ID 清單' },
      },
      required: ['projectId', 'title'],
    },
  },

  {
    name: 'update_task_status',
    description: '更新任務狀態（todo → in_progress → review → done）',
    requiredScopes: ['write:tasks'],
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'integer', description: '任務 ID（必填）' },
        status: { type: 'string',  enum: ['todo','in_progress','review','done'], description: '新狀態（必填）' },
        reason: { type: 'string',  description: '狀態變更原因（記錄到活動日誌）' },
      },
      required: ['taskId', 'status'],
    },
  },

  {
    name: 'add_task_comment',
    description: '在任務下新增評論（支援 @mention）',
    requiredScopes: ['write:tasks'],
    inputSchema: {
      type: 'object',
      properties: {
        taskId:   { type: 'integer', description: '任務 ID（必填）' },
        content:  { type: 'string',  description: '評論內容（必填）' },
        userId:   { type: 'integer', description: '評論者 User ID（必填）' },
        mentions: { type: 'array', items: { type: 'integer' }, description: '被 @mention 的 User ID 清單' },
        parentId: { type: 'integer', description: '回覆的評論 ID（可選，用於巢狀評論）' },
      },
      required: ['taskId', 'content', 'userId'],
    },
  },

  // ── 資源管理 ──────────────────────────────────────────────
  {
    name: 'get_team_workload',
    description: '查詢團隊成員工作負載（任務數量、工時分布、逾期狀況）',
    requiredScopes: ['read:team'],
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: '查詢起始日期（ISO 8601，預設本週）' },
        endDate:   { type: 'string', description: '查詢結束日期' },
        userId:    { type: 'integer', description: '若指定只查詢此成員' },
      },
    },
  },

  {
    name: 'find_available_member',
    description: '尋找在特定時段有空的團隊成員（依負載排序）',
    requiredScopes: ['read:team'],
    inputSchema: {
      type: 'object',
      properties: {
        startDate:   { type: 'string',  description: '需要的開始日期（必填）' },
        endDate:     { type: 'string',  description: '需要的結束日期（必填）' },
        requiredHours: { type: 'number', description: '需要的工時數（可選，用來評估能否承接）' },
        skills:      { type: 'array', items: { type: 'string' }, description: '所需技能標籤（可選）' },
        maxResults:  { type: 'integer', description: '回傳幾位成員（預設 5）' },
      },
      required: ['startDate', 'endDate'],
    },
  },

  {
    name: 'assign_task',
    description: '指派任務給指定成員（可選是否發送通知）',
    requiredScopes: ['write:team'],
    inputSchema: {
      type: 'object',
      properties: {
        taskId:  { type: 'integer', description: '任務 ID（必填）' },
        userId:  { type: 'integer', description: '被指派的 User ID（必填）' },
        notify:  { type: 'boolean', description: '是否發送通知給被指派者（預設 true）' },
        message: { type: 'string',  description: '附帶留言（會顯示在通知中）' },
      },
      required: ['taskId', 'userId'],
    },
  },

  // ── 報告類 ────────────────────────────────────────────────
  {
    name: 'get_project_report',
    description: '生成專案健康報告（進度、風險、里程碑狀態）',
    requiredScopes: ['read:reports'],
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'integer', description: '專案 ID（必填）' },
        format:    { type: 'string', enum: ['json','markdown','summary'], description: '輸出格式（預設 json）' },
      },
      required: ['projectId'],
    },
  },

  // ── 整合類 ────────────────────────────────────────────────
  {
    name: 'notify_user',
    description: '發送通知給指定用戶（系統內通知，若設定 Email 則同時發送）',
    requiredScopes: ['write:notifications'],
    inputSchema: {
      type: 'object',
      properties: {
        userId:  { type: 'integer', description: '接收者 User ID（必填）' },
        title:   { type: 'string',  description: '通知標題（必填）' },
        message: { type: 'string',  description: '通知內容（必填）' },
        type:    { type: 'string',  description: '通知類型（預設 task_assigned）' },
        resourceType: { type: 'string', description: 'task / project（可選）' },
        resourceId:   { type: 'integer', description: '對應資源 ID' },
      },
      required: ['userId', 'title', 'message'],
    },
  },

  // ── 通知整合（Telegram / LINE）───────────────────────────
  {
    name: 'notify_telegram',
    description: '透過 Telegram Bot API 發送訊息至頻道或個人（需設定 TELEGRAM_BOT_TOKEN 環境變數）',
    requiredScopes: ['write:notifications'],
    inputSchema: {
      type: 'object',
      properties: {
        chatId:    { type: 'string',  description: 'Telegram Chat ID（頻道用 @channel_name，個人用數字 ID，必填）' },
        message:   { type: 'string',  description: '訊息內容（支援 Markdown，必填）' },
        parseMode: { type: 'string',  enum: ['Markdown','HTML','MarkdownV2'], description: '訊息格式（預設 Markdown）' },
        projectId: { type: 'integer', description: '關聯專案 ID（可選，自動加入專案名稱前綴）' },
        taskId:    { type: 'integer', description: '關聯任務 ID（可選，自動附加任務標題）' },
      },
      required: ['chatId', 'message'],
    },
  },

  {
    name: 'notify_line',
    description: '透過 LINE Messaging API 推播訊息至 LINE 群組或個人（需設定 LINE_CHANNEL_ACCESS_TOKEN 環境變數）',
    requiredScopes: ['write:notifications'],
    inputSchema: {
      type: 'object',
      properties: {
        userId:   { type: 'string',  description: 'LINE User ID 或 Group ID（必填）' },
        message:  { type: 'string',  description: '訊息內容（必填）' },
        type:     { type: 'string',  enum: ['text','flex'], description: '訊息類型（預設 text；flex 需傳 flexBody）' },
        flexBody: { type: 'object',  description: 'LINE Flex Message 結構（type=flex 時必填）' },
        projectId: { type: 'integer', description: '關聯專案 ID（可選）' },
        taskId:    { type: 'integer', description: '關聯任務 ID（可選）' },
      },
      required: ['userId', 'message'],
    },
  },

  // ── OpenClaw RPA 整合 ─────────────────────────────────────
  {
    name: 'rpa_execute_flow',
    description: '透過 OpenClaw 觸發 RPA 自動化流程（非同步執行，結果透過 Webhook 回呼）',
    requiredScopes: ['rpa:execute'],
    inputSchema: {
      type: 'object',
      properties: {
        flowId:    { type: 'string', description: 'OpenClaw 流程 ID（必填）' },
        params:    { type: 'object', description: '傳入流程的參數（JSON）' },
        taskId:    { type: 'integer', description: '關聯任務 ID（可選，用於回呼後更新狀態）' },
        projectId: { type: 'integer', description: '關聯專案 ID（可選）' },
        async:     { type: 'boolean', description: 'true=非同步（預設），false=同步等待結果' },
        timeoutMs: { type: 'integer', description: '同步模式下的超時時間（ms，預設 30000）' },
      },
      required: ['flowId'],
    },
  },

  {
    name: 'rpa_get_flow_status',
    description: '查詢 OpenClaw RPA 流程執行狀態',
    requiredScopes: ['rpa:execute'],
    inputSchema: {
      type: 'object',
      properties: {
        executionId: { type: 'string', description: 'RPA 執行 ID（由 rpa_execute_flow 回傳）' },
      },
      required: ['executionId'],
    },
  },
];

// ════════════════════════════════════════════════════════════
// Prompts 定義（給 Claude 用的模板）
// ════════════════════════════════════════════════════════════

const PROMPT_DEFINITIONS = [
  {
    name: 'create_task_from_requirement',
    description: '將需求描述轉換為結構化任務（標題、描述、優先級、預估工時）',
    arguments: [
      { name: 'requirement', description: '原始需求描述', required: true },
      { name: 'projectContext', description: '專案背景資訊', required: false },
    ],
  },
  {
    name: 'summarize_project_status',
    description: '生成專案狀態摘要（適合每週 standup 使用）',
    arguments: [
      { name: 'projectId', description: '專案 ID', required: true },
    ],
  },
];

// ════════════════════════════════════════════════════════════
// 工具過濾（依 Scopes）
// ════════════════════════════════════════════════════════════

function getAvailableTools(scopes) {
  return TOOL_DEFINITIONS.filter(tool => {
    if (!tool.requiredScopes?.length) return true;
    if (scopes?.includes('admin:*')) return true;
    return tool.requiredScopes.some(s => scopes?.includes(s));
  });
}

// ════════════════════════════════════════════════════════════
// 輔助函式
// ════════════════════════════════════════════════════════════

function ok(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

function fail(message, code = 'TOOL_ERROR') {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: message, code }) }],
  };
}

function requireScope(apiKeyInfo, scope) {
  if (!hasScope(apiKeyInfo, scope)) {
    throw Object.assign(new Error(`Insufficient scope: requires ${scope}`), { code: 'FORBIDDEN' });
  }
}

function requireParams(args, fields) {
  const missing = fields.filter(f => args[f] == null || args[f] === '');
  if (missing.length) {
    throw Object.assign(new Error(`Missing required parameters: ${missing.join(', ')}`), { code: 'INVALID_PARAMS' });
  }
}

// ════════════════════════════════════════════════════════════
// Tool 實作
// ════════════════════════════════════════════════════════════

const toolImpl = {

  // ── list_projects ─────────────────────────────────────────
  async list_projects(args, apiKeyInfo) {
    requireScope(apiKeyInfo, 'read:projects');
    const { status, limit = 20, offset = 0 } = args;

    const prisma  = db();
    const where   = { companyId: apiKeyInfo.companyId };
    if (status) where.status = status;

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip:    offset,
        take:    Math.min(limit, 100),
        orderBy: { updatedAt: 'desc' },
        include: {
          owner:      { select: { id: true, name: true } },
          tasks:      { select: { id: true, status: true } },
          milestones: { select: { id: true, name: true, dueDate: true, isAchieved: true } },
        },
      }),
      prisma.project.count({ where }),
    ]);

    const data = projects.map(p => {
      const taskStats = { total: p.tasks.length };
      for (const t of p.tasks) taskStats[t.status] = (taskStats[t.status] || 0) + 1;
      const progress = p.tasks.length
        ? Math.round((taskStats.done || 0) / p.tasks.length * 100)
        : 0;
      return {
        id:         p.id,
        name:       p.name,
        status:     p.status,
        owner:      p.owner,
        progress,
        taskStats,
        startDate:  p.startDate,
        endDate:    p.endDate,
        budget:     p.budget,
        milestones: p.milestones.map(m => ({ ...m, dueDate: m.dueDate?.toISOString() })),
        createdAt:  p.createdAt,
        updatedAt:  p.updatedAt,
      };
    });

    return ok({ projects: data, total, limit, offset });
  },

  // ── get_project_details ───────────────────────────────────
  async get_project_details(args, apiKeyInfo) {
    requireScope(apiKeyInfo, 'read:projects');
    requireParams(args, ['projectId']);

    const prisma  = db();
    const project = await prisma.project.findFirst({
      where: { id: args.projectId, companyId: apiKeyInfo.companyId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        tasks: {
          include: {
            assignee: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        milestones: { orderBy: { dueDate: 'asc' } },
      },
    });

    if (!project) return fail('Project not found or access denied', 'NOT_FOUND');

    const taskStats = { total: project.tasks.length };
    for (const t of project.tasks) taskStats[t.status] = (taskStats[t.status] || 0) + 1;

    return ok({
      id:          project.id,
      name:        project.name,
      description: project.description,
      status:      project.status,
      owner:       project.owner,
      budget:      project.budget,
      startDate:   project.startDate,
      endDate:     project.endDate,
      progress:    project.tasks.length
        ? Math.round((taskStats.done || 0) / project.tasks.length * 100)
        : 0,
      taskStats,
      tasks:       project.tasks.map(t => ({
        id:         t.id,
        title:      t.title,
        status:     t.status,
        priority:   t.priority,
        assignee:   t.assignee,
        dueDate:    t.dueDate,
        estimatedHours: t.estimatedHours,
      })),
      milestones:  project.milestones,
      createdAt:   project.createdAt,
      updatedAt:   project.updatedAt,
    });
  },

  // ── create_project ────────────────────────────────────────
  async create_project(args, apiKeyInfo) {
    requireScope(apiKeyInfo, 'write:projects');
    requireParams(args, ['name', 'ownerId']);

    const prisma  = db();
    const project = await prisma.project.create({
      data: {
        companyId:   apiKeyInfo.companyId,
        ownerId:     args.ownerId,
        name:        args.name,
        description: args.description || null,
        status:      args.status || 'planning',
        budget:      args.budget || null,
        startDate:   args.startDate ? new Date(args.startDate) : null,
        endDate:     args.endDate   ? new Date(args.endDate)   : null,
      },
      include: { owner: { select: { id: true, name: true } } },
    });

    console.log(`[Tools] create_project #${project.id} by ${apiKeyInfo.systemName}`);
    return ok({ id: project.id, name: project.name, status: project.status, owner: project.owner, createdAt: project.createdAt });
  },

  // ── list_tasks ────────────────────────────────────────────
  async list_tasks(args, apiKeyInfo) {
    requireScope(apiKeyInfo, 'read:tasks');
    requireParams(args, ['projectId']);

    const prisma = db();

    // 確認專案屬於此 company
    const proj = await prisma.project.findFirst({
      where: { id: args.projectId, companyId: apiKeyInfo.companyId },
      select: { id: true },
    });
    if (!proj) return fail('Project not found or access denied', 'NOT_FOUND');

    const where = { projectId: args.projectId };
    if (args.status)     where.status     = args.status;
    if (args.assigneeId) where.assigneeId = args.assigneeId;
    if (args.priority)   where.priority   = args.priority;
    if (args.overdue)    where.dueDate    = { lt: new Date() };

    const tasks = await prisma.task.findMany({
      where,
      take: Math.min(args.limit || 50, 200),
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      include: {
        assignee:   { select: { id: true, name: true } },
        _count:     { select: { comments: true } },
      },
    });

    return ok({
      projectId: args.projectId,
      tasks: tasks.map(t => ({
        id:             t.id,
        title:          t.title,
        status:         t.status,
        priority:       t.priority,
        assignee:       t.assignee,
        dueDate:        t.dueDate,
        estimatedHours: t.estimatedHours,
        actualHours:    t.actualHours,
        commentsCount:  t._count.comments,
        isOverdue:      t.dueDate && t.dueDate < new Date() && t.status !== 'done',
        createdAt:      t.createdAt,
      })),
      total: tasks.length,
    });
  },

  // ── get_task_details ──────────────────────────────────────
  async get_task_details(args, apiKeyInfo) {
    requireScope(apiKeyInfo, 'read:tasks');
    requireParams(args, ['taskId']);

    const prisma = db();
    const task   = await prisma.task.findFirst({
      where: {
        id:      args.taskId,
        project: { companyId: apiKeyInfo.companyId },
      },
      include: {
        project:   { select: { id: true, name: true } },
        assignee:  { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
        comments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, name: true } } },
        },
        timeEntries: {
          orderBy: { startedAt: 'desc' },
          take: 10,
          include: { user: { select: { id: true, name: true } } },
        },
        tags: { include: { tag: true } },
      },
    });

    if (!task) return fail('Task not found or access denied', 'NOT_FOUND');

    return ok({
      id:          task.id,
      title:       task.title,
      description: task.description,
      status:      task.status,
      priority:    task.priority,
      project:     task.project,
      assignee:    task.assignee,
      createdBy:   task.createdBy,
      dueDate:     task.dueDate,
      startedAt:   task.startedAt,
      completedAt: task.completedAt,
      estimatedHours: task.estimatedHours,
      actualHours:    task.actualHours,
      isOverdue:   task.dueDate && task.dueDate < new Date() && task.status !== 'done',
      tags:        task.tags.map(t => t.tag),
      comments:    task.comments.map(c => ({
        id:        c.id,
        content:   c.content,
        user:      c.user,
        mentions:  c.mentions,
        createdAt: c.createdAt,
      })),
      recentTimeEntries: task.timeEntries,
      createdAt:   task.createdAt,
      updatedAt:   task.updatedAt,
    });
  },

  // ── create_task ───────────────────────────────────────────
  async create_task(args, apiKeyInfo) {
    requireScope(apiKeyInfo, 'write:tasks');
    requireParams(args, ['projectId', 'title']);

    const prisma = db();

    // 確認專案屬於此 company
    const proj = await prisma.project.findFirst({
      where: { id: args.projectId, companyId: apiKeyInfo.companyId },
      select: { id: true },
    });
    if (!proj) return fail('Project not found or access denied', 'NOT_FOUND');

    const task = await prisma.task.create({
      data: {
        projectId:      args.projectId,
        title:          args.title,
        description:    args.description || null,
        assigneeId:     args.assigneeId  || null,
        createdById:    args.createdById || 1,
        dueDate:        args.dueDate     ? new Date(args.dueDate) : null,
        priority:       args.priority    || 'medium',
        estimatedHours: args.estimatedHours || null,
        status:         'todo',
      },
      include: {
        assignee:  { select: { id: true, name: true } },
        project:   { select: { id: true, name: true } },
      },
    });

    // 建立前置任務依賴關係
    if (args.dependsOnTaskIds?.length) {
      await prisma.taskDependency.createMany({
        data: args.dependsOnTaskIds.map(depId => ({
          taskId:          task.id,
          dependsOnTaskId: depId,
          dependencyType:  'finish_to_start',
        })),
        skipDuplicates: true,
      });
    }

    // 活動記錄
    await prisma.activityLog.create({
      data: {
        taskId:   task.id,
        userId:   args.createdById || apiKeyInfo.userId || 1,
        action:   'task_created_via_mcp',
        oldValue: null,
        newValue: JSON.stringify({ system: apiKeyInfo.systemName }),
      },
    });

    console.log(`[Tools] create_task #${task.id} "${task.title}" by ${apiKeyInfo.systemName}`);
    return ok({ id: task.id, title: task.title, status: task.status, project: task.project, assignee: task.assignee, createdAt: task.createdAt });
  },

  // ── update_task_status ────────────────────────────────────
  async update_task_status(args, apiKeyInfo) {
    requireScope(apiKeyInfo, 'write:tasks');
    requireParams(args, ['taskId', 'status']);

    const validStatus = ['todo', 'in_progress', 'review', 'done'];
    if (!validStatus.includes(args.status)) {
      return fail(`Invalid status: ${args.status}. Must be one of: ${validStatus.join(', ')}`, 'INVALID_PARAMS');
    }

    const prisma = db();
    const task   = await prisma.task.findFirst({
      where: { id: args.taskId, project: { companyId: apiKeyInfo.companyId } },
      select: { id: true, status: true, title: true },
    });
    if (!task) return fail('Task not found or access denied', 'NOT_FOUND');

    const oldStatus = task.status;
    const updated   = await prisma.task.update({
      where: { id: args.taskId },
      data: {
        status:      args.status,
        completedAt: args.status === 'done' ? new Date() : undefined,
        startedAt:   args.status === 'in_progress' && !task.startedAt ? new Date() : undefined,
      },
      include: { assignee: { select: { id: true, name: true } } },
    });

    // 活動記錄
    await prisma.activityLog.create({
      data: {
        taskId:   args.taskId,
        userId:   apiKeyInfo.userId || 1,
        action:   'status_changed_via_mcp',
        oldValue: oldStatus,
        newValue: args.status,
      },
    });

    return ok({
      id:         updated.id,
      title:      task.title,
      oldStatus,
      newStatus:  updated.status,
      assignee:   updated.assignee,
      updatedAt:  updated.updatedAt,
    });
  },

  // ── add_task_comment ──────────────────────────────────────
  async add_task_comment(args, apiKeyInfo) {
    requireScope(apiKeyInfo, 'write:tasks');
    requireParams(args, ['taskId', 'content', 'userId']);

    const prisma = db();
    const task   = await prisma.task.findFirst({
      where: { id: args.taskId, project: { companyId: apiKeyInfo.companyId } },
      select: { id: true },
    });
    if (!task) return fail('Task not found or access denied', 'NOT_FOUND');

    const comment = await prisma.comment.create({
      data: {
        taskId:   args.taskId,
        userId:   args.userId,
        content:  args.content,
        mentions: args.mentions || [],
        parentId: args.parentId || null,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    // 自動觸發 mention 通知
    if (args.mentions?.length) {
      await prisma.notification.createMany({
        data: args.mentions.map(uid => ({
          recipientId:  uid,
          type:         'mentioned',
          title:        '有人在任務評論中提到您',
          message:      args.content.slice(0, 100),
          resourceType: 'task',
          resourceId:   args.taskId,
        })),
        skipDuplicates: true,
      });
    }

    return ok({ id: comment.id, content: comment.content, user: comment.user, createdAt: comment.createdAt });
  },

  // ── get_team_workload ─────────────────────────────────────
  async get_team_workload(args, apiKeyInfo) {
    requireScope(apiKeyInfo, 'read:team');

    const prisma    = db();
    const startDate = args.startDate ? new Date(args.startDate) : new Date();
    const endDate   = args.endDate   ? new Date(args.endDate)   : new Date(Date.now() + 7 * 86400000);

    const where = { companyId: apiKeyInfo.companyId, isActive: true };
    if (args.userId) where.id = args.userId;

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, role: true,
        assignedTasks: {
          where: { status: { not: 'done' } },
          select: { id: true, status: true, priority: true, dueDate: true, estimatedHours: true },
        },
      },
    });

    const workload = users.map(u => {
      const overdue  = u.assignedTasks.filter(t => t.dueDate && t.dueDate < new Date()).length;
      const urgent   = u.assignedTasks.filter(t => t.priority === 'urgent').length;
      const totalEst = u.assignedTasks.reduce((s, t) => s + (t.estimatedHours || 0), 0);
      return {
        userId:       u.id,
        name:         u.name,
        email:        u.email,
        role:         u.role,
        activeTasks:  u.assignedTasks.length,
        overdueTasks: overdue,
        urgentTasks:  urgent,
        estimatedHoursRemaining: totalEst,
        loadScore:    Math.min(100, Math.round(u.assignedTasks.length * 10 + overdue * 20 + urgent * 15)),
      };
    });

    workload.sort((a, b) => b.loadScore - a.loadScore);
    return ok({ period: { startDate, endDate }, team: workload });
  },

  // ── find_available_member ─────────────────────────────────
  async find_available_member(args, apiKeyInfo) {
    requireScope(apiKeyInfo, 'read:team');
    requireParams(args, ['startDate', 'endDate']);

    const prisma = db();
    const users  = await prisma.user.findMany({
      where: { companyId: apiKeyInfo.companyId, isActive: true },
      select: {
        id: true, name: true, email: true,
        assignedTasks: {
          where: { status: { not: 'done' } },
          select: { estimatedHours: true, dueDate: true },
        },
      },
    });

    const candidates = users
      .map(u => {
        const totalLoad  = u.assignedTasks.reduce((s, t) => s + (t.estimatedHours || 4), 0);
        const available  = Math.max(0, 40 - totalLoad);  // 假設每週 40h 工時
        return { userId: u.id, name: u.name, email: u.email, activeTasks: u.assignedTasks.length, estimatedLoadHours: totalLoad, availableHours: available };
      })
      .filter(u => args.requiredHours ? u.availableHours >= args.requiredHours : true)
      .sort((a, b) => b.availableHours - a.availableHours)
      .slice(0, args.maxResults || 5);

    return ok({ period: { startDate: args.startDate, endDate: args.endDate }, candidates });
  },

  // ── assign_task ───────────────────────────────────────────
  async assign_task(args, apiKeyInfo) {
    requireScope(apiKeyInfo, 'write:team');
    requireParams(args, ['taskId', 'userId']);

    const prisma = db();
    const task   = await prisma.task.findFirst({
      where: { id: args.taskId, project: { companyId: apiKeyInfo.companyId } },
      select: { id: true, title: true, assigneeId: true },
    });
    if (!task) return fail('Task not found or access denied', 'NOT_FOUND');

    const user = await prisma.user.findFirst({
      where: { id: args.userId, companyId: apiKeyInfo.companyId },
      select: { id: true, name: true },
    });
    if (!user) return fail('User not found or access denied', 'NOT_FOUND');

    const updated = await prisma.task.update({
      where: { id: args.taskId },
      data:  { assigneeId: args.userId },
    });

    // 通知
    if (args.notify !== false) {
      await prisma.notification.create({
        data: {
          recipientId:  args.userId,
          type:         'task_assigned',
          title:        `新任務指派：${task.title}`,
          message:      args.message || `任務「${task.title}」已由系統指派給您`,
          resourceType: 'task',
          resourceId:   args.taskId,
        },
      });
    }

    // 活動記錄
    await prisma.activityLog.create({
      data: {
        taskId:   args.taskId,
        userId:   args.userId,
        action:   'task_assigned_via_mcp',
        oldValue: String(task.assigneeId || ''),
        newValue: String(args.userId),
      },
    });

    return ok({ taskId: args.taskId, assignedTo: user, notified: args.notify !== false });
  },

  // ── get_project_report ────────────────────────────────────
  async get_project_report(args, apiKeyInfo) {
    requireScope(apiKeyInfo, 'read:reports');
    requireParams(args, ['projectId']);

    const prisma  = db();
    const project = await prisma.project.findFirst({
      where: { id: args.projectId, companyId: apiKeyInfo.companyId },
      include: {
        owner:      { select: { id: true, name: true } },
        tasks:      { include: { assignee: { select: { id: true, name: true } } } },
        milestones: { orderBy: { dueDate: 'asc' } },
      },
    });
    if (!project) return fail('Project not found or access denied', 'NOT_FOUND');

    const now     = new Date();
    const tasks   = project.tasks;
    const stats   = {};
    for (const t of tasks) stats[t.status] = (stats[t.status] || 0) + 1;
    const progress = tasks.length ? Math.round((stats.done || 0) / tasks.length * 100) : 0;
    const overdue  = tasks.filter(t => t.dueDate && t.dueDate < now && t.status !== 'done');
    const urgent   = tasks.filter(t => t.priority === 'urgent' && t.status !== 'done');

    const report = {
      project: { id: project.id, name: project.name, status: project.status, owner: project.owner },
      summary: { progress, taskStats: stats, overdueCount: overdue.length, urgentCount: urgent.length },
      health: progress >= 80 ? 'green' : progress >= 50 ? 'yellow' : 'red',
      milestones: project.milestones.map(m => ({ ...m, isOverdue: m.dueDate < now && !m.isAchieved })),
      overdueTasks: overdue.map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate, assignee: t.assignee })),
      risks: [
        overdue.length > 0 && { type: 'overdue_tasks', severity: overdue.length > 5 ? 'high' : 'medium', count: overdue.length },
        urgent.length > 0 && { type: 'urgent_tasks', severity: 'medium', count: urgent.length },
        !project.endDate && { type: 'no_deadline', severity: 'low', message: '專案未設定結束日期' },
      ].filter(Boolean),
      generatedAt: new Date().toISOString(),
    };

    if (args.format === 'markdown') {
      const md = `# 專案報告：${project.name}\n\n` +
        `**狀態：** ${project.status} | **進度：** ${progress}% | **健康：** ${report.health}\n\n` +
        `## 任務統計\n${Object.entries(stats).map(([s, c]) => `- ${s}: ${c}`).join('\n')}\n\n` +
        `## 逾期任務 (${overdue.length})\n${overdue.map(t => `- [${t.id}] ${t.title} (${t.dueDate?.toISOString()?.slice(0,10)})`).join('\n') || '無'}\n\n` +
        `*生成時間：${report.generatedAt}*`;
      return ok({ format: 'markdown', content: md });
    }

    return ok(report);
  },

  // ── notify_user ───────────────────────────────────────────
  async notify_user(args, apiKeyInfo) {
    requireScope(apiKeyInfo, 'write:notifications');
    requireParams(args, ['userId', 'title', 'message']);

    const prisma = db();
    const user   = await prisma.user.findFirst({
      where: { id: args.userId, companyId: apiKeyInfo.companyId },
      select: { id: true, name: true },
    });
    if (!user) return fail('User not found or access denied', 'NOT_FOUND');

    const notification = await prisma.notification.create({
      data: {
        recipientId:  args.userId,
        type:         args.type || 'task_assigned',
        title:        args.title,
        message:      args.message,
        resourceType: args.resourceType || null,
        resourceId:   args.resourceId   || null,
      },
    });

    return ok({ notificationId: notification.id, recipient: user, title: args.title, createdAt: notification.createdAt });
  },

  // ── notify_telegram ───────────────────────────────────────
  async notify_telegram(args, apiKeyInfo) {
    requireScope(apiKeyInfo, 'write:notifications');
    requireParams(args, ['chatId', 'message']);

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return fail('TELEGRAM_BOT_TOKEN 未設定，請在環境變數中配置', 'CONFIG_ERROR');

    const { chatId, message, parseMode = 'Markdown', projectId, taskId } = args;
    let text = message;

    // 附加專案 / 任務上下文
    if (projectId || taskId) {
      const prisma = db();
      if (projectId) {
        const project = await prisma.project.findFirst({
          where: { id: projectId, companyId: apiKeyInfo.companyId },
          select: { name: true },
        });
        if (project) text = `*[${project.name}]* ${text}`;
      }
      if (taskId) {
        const task = await prisma.task.findFirst({
          where: { id: taskId },
          select: { title: true },
        });
        if (task) text += `\n🔗 任務：${task.title}`;
      }
    }

    try {
      const resp = await axios.post(
        `https://api.telegram.org/bot${token}/sendMessage`,
        { chat_id: chatId, text, parse_mode: parseMode },
        { timeout: 10000 }
      );
      if (!resp.data.ok) {
        return fail(`Telegram API 錯誤：${resp.data.description}`, 'TELEGRAM_ERROR');
      }
      return ok({
        success:   true,
        messageId: resp.data.result.message_id,
        chatId,
        sentAt:    new Date().toISOString(),
      });
    } catch (e) {
      const detail = e.response?.data?.description || e.message;
      return fail(`Telegram 發送失敗：${detail}`, 'TELEGRAM_ERROR');
    }
  },

  // ── notify_line ───────────────────────────────────────────
  async notify_line(args, apiKeyInfo) {
    requireScope(apiKeyInfo, 'write:notifications');
    requireParams(args, ['userId', 'message']);

    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) return fail('LINE_CHANNEL_ACCESS_TOKEN 未設定，請在環境變數中配置', 'CONFIG_ERROR');

    const { userId, message, type = 'text', flexBody, projectId, taskId } = args;
    let msgText = message;

    // 附加專案 / 任務上下文
    if (projectId || taskId) {
      const prisma = db();
      if (projectId) {
        const project = await prisma.project.findFirst({
          where: { id: projectId, companyId: apiKeyInfo.companyId },
          select: { name: true },
        });
        if (project) msgText = `[${project.name}] ${msgText}`;
      }
      if (taskId) {
        const task = await prisma.task.findFirst({
          where: { id: taskId },
          select: { title: true },
        });
        if (task) msgText += ` / 任務：${task.title}`;
      }
    }

    const messageBody = type === 'flex' && flexBody
      ? { type: 'flex', altText: msgText, contents: flexBody }
      : { type: 'text', text: msgText };

    try {
      const resp = await axios.post(
        'https://api.line.me/v2/bot/message/push',
        { to: userId, messages: [messageBody] },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type':  'application/json',
          },
          timeout: 10000,
        }
      );
      return ok({
        success:   true,
        userId,
        sentAt:    new Date().toISOString(),
        requestId: resp.headers['x-line-request-id'] || null,
      });
    } catch (e) {
      const errMsg = e.response?.data?.message || e.message;
      return fail(`LINE 發送失敗：${errMsg}`, 'LINE_ERROR');
    }
  },

  // ── rpa_execute_flow（OpenClaw RPA）───────────────────────
  async rpa_execute_flow(args, apiKeyInfo) {
    requireScope(apiKeyInfo, 'rpa:execute');
    requireParams(args, ['flowId']);

    const isAsync   = args.async !== false;
    const timeoutMs = args.timeoutMs || 30000;

    const payload = {
      flowId:   args.flowId,
      params:   args.params || {},
      metadata: {
        triggeredBy: apiKeyInfo.systemName,
        companyId:   apiKeyInfo.companyId,
        taskId:      args.taskId    || null,
        projectId:   args.projectId || null,
        timestamp:   new Date().toISOString(),
      },
      webhook: isAsync && RPA_WEBHOOK_URL
        ? `${RPA_WEBHOOK_URL}/mcp/webhook/rpa`
        : undefined,
    };

    try {
      const res = await axios.post(
        `${RPA_BASE_URL}/api/flows/${args.flowId}/execute`,
        payload,
        {
          headers: { 'X-API-Key': RPA_API_KEY, 'Content-Type': 'application/json' },
          timeout: isAsync ? 10000 : timeoutMs,
        }
      );

      const { executionId, status, result } = res.data;

      if (args.taskId && !isAsync && status === 'completed') {
        const prisma = db();
        await prisma.activityLog.create({
          data: {
            taskId:   args.taskId,
            userId:   apiKeyInfo.userId || 1,
            action:   'rpa_executed',
            oldValue: null,
            newValue: JSON.stringify({ flowId: args.flowId, executionId, result }),
          },
        });
      }

      return ok({
        executionId,
        status,
        flowId:  args.flowId,
        async:   isAsync,
        result:  isAsync ? null : result,
        message: isAsync ? '流程已觸發，結果將透過 Webhook 回呼' : '流程執行完成',
      });

    } catch (err) {
      if (err.code === 'ECONNREFUSED') {
        return fail(`OpenClaw 連線失敗（${RPA_BASE_URL}），請確認 OPENCLAW_BASE_URL 環境變數`, 'RPA_UNAVAILABLE');
      }
      return fail(`RPA 執行失敗：${err.response?.data?.message || err.message}`, 'RPA_ERROR');
    }
  },

  // ── rpa_get_flow_status ───────────────────────────────────
  async rpa_get_flow_status(args, apiKeyInfo) {
    requireScope(apiKeyInfo, 'rpa:execute');
    requireParams(args, ['executionId']);

    try {
      const res = await axios.get(
        `${RPA_BASE_URL}/api/executions/${args.executionId}`,
        {
          headers: { 'X-API-Key': RPA_API_KEY },
          timeout: 10000,
        }
      );
      return ok(res.data);
    } catch (err) {
      if (err.code === 'ECONNREFUSED') {
        return fail(`OpenClaw 連線失敗（${RPA_BASE_URL}）`, 'RPA_UNAVAILABLE');
      }
      return fail(`查詢失敗：${err.response?.data?.message || err.message}`, 'RPA_ERROR');
    }
  },
};

// ════════════════════════════════════════════════════════════
// 統一 Tool 呼叫入口
// ════════════════════════════════════════════════════════════

async function callTool(name, args, apiKeyInfo) {
  const impl = toolImpl[name];
  if (!impl) {
    return fail(`Unknown tool: ${name}`, 'TOOL_NOT_FOUND');
  }
  try {
    return await impl(args, apiKeyInfo);
  } catch (err) {
    if (err.code === 'FORBIDDEN') {
      return fail(err.message, 'FORBIDDEN');
    }
    if (err.code === 'INVALID_PARAMS') {
      return fail(err.message, 'INVALID_PARAMS');
    }
    console.error(`[Tools] Error in ${name}:`, err.message);
    return fail(err.message || 'Internal error', 'INTERNAL_ERROR');
  }
}

// ════════════════════════════════════════════════════════════
// Prompt 實作
// ════════════════════════════════════════════════════════════

function getPrompt(name, args) {
  if (name === 'create_task_from_requirement') {
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `請將以下需求轉換為結構化任務格式（JSON）：\n\n需求：${args.requirement}\n\n` +
                `${args.projectContext ? `專案背景：${args.projectContext}\n\n` : ''}` +
                `輸出格式：\n{\n  "title": "任務標題",\n  "description": "詳細描述",\n  "priority": "low|medium|high|urgent",\n  "estimatedHours": 數字,\n  "tags": ["標籤1", "標籤2"]\n}`,
        },
      }],
    };
  }
  if (name === 'summarize_project_status') {
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `請為專案 ID=${args.projectId} 生成每週進度摘要，格式要求：\n1. 本週完成的任務\n2. 進行中的任務\n3. 即將逾期的任務\n4. 需要關注的風險\n5. 下週計畫`,
        },
      }],
    };
  }
  return { messages: [] };
}

module.exports = { TOOL_DEFINITIONS, PROMPT_DEFINITIONS, getAvailableTools, callTool, getPrompt };
