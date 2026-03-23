#!/usr/bin/env node
/**
 * mcp/server.js  —  xCloudPMIS MCP Server（完整版 v3.0）
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 與 Claude Desktop 整合，提供 20 個工具直接操作 xCloudPMIS 系統
 *
 * ── 系統工具 ────────────────────────────────────────────────────────────
 *   get_system_status       — 後端 / PostgreSQL / Redis 健康狀態
 *   get_dashboard_summary   — 首頁摘要（統計卡、專案健康、洞察）
 *
 * ── 專案管理 ────────────────────────────────────────────────────────────
 *   list_projects           — 專案列表（含進度 / 健康狀態）
 *   get_project_details     — 單一專案詳情（任務、成員、里程碑）
 *   create_project          — 建立新專案
 *   update_project          — 更新專案資訊 / 狀態
 *
 * ── 任務管理 ────────────────────────────────────────────────────────────
 *   list_tasks              — 任務列表（多條件篩選）
 *   get_task_details        — 任務完整資訊（評論、工時、附件）
 *   create_task             — 建立任務
 *   update_task             — 更新任務（標題、狀態、指派人、截止日等）
 *   complete_task           — 標記任務完成
 *   add_task_comment        — 新增任務評論
 *   get_overdue_tasks       — 逾期任務清單
 *
 * ── 團隊 / 資源 ──────────────────────────────────────────────────────────
 *   list_team_members       — 團隊成員列表
 *   get_user_workload       — 成員工作量（任務數 / 工時 / 逾期）
 *   assign_task             — 指派任務給成員
 *
 * ── 時間 / 報告 ──────────────────────────────────────────────────────────
 *   log_time                — 記錄工時
 *   get_project_report      — 專案進度報告
 *
 * ── 通知 / 郵件 ──────────────────────────────────────────────────────────
 *   send_notification       — 建立系統通知
 *   send_reminder_email     — 傳送任務提醒郵件（Microsoft Graph）
 *
 * ── AI 分析 ─────────────────────────────────────────────────────────────
 *   analyze_project_health  — AI 深度專案健康度分析
 *
 * 執行方式：
 *   node mcp/server.js          直接執行（stdin/stdout MCP 協定）
 *   npm run mcp                 npm 腳本
 *
 * 環境變數（.env）：
 *   DATABASE_URL              PostgreSQL 連線字串（必填）
 *   DEFAULT_COMPANY_ID        預設公司 ID（選填，預設 1）
 *   O365_CLIENT_ID/SECRET/TENANT_ID  郵件功能（選填）
 *   O365_SENDER_EMAIL         寄件信箱（選填）
 */

'use strict';

// ── 環境變數 ───────────────────────────────────────────────────────────
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ── MCP SDK ───────────────────────────────────────────────────────────
const { Server }               = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} = require('@modelcontextprotocol/sdk/types.js');

// ── Prisma ────────────────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['error'] });

// ── 預設值 ────────────────────────────────────────────────────────────
const DEFAULT_COMPANY = parseInt(process.env.DEFAULT_COMPANY_ID || '1');

// ── 郵件服務（延遲載入）──────────────────────────────────────────────
let _email = null;
function getEmail() {
  if (!_email) _email = require('../src/services/emailService');
  return _email;
}

// ══════════════════════════════════════════════════════════════════════
// 輔助函式
// ══════════════════════════════════════════════════════════════════════

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(msg) {
  return { content: [{ type: 'text', text: JSON.stringify({ error: msg }) }], isError: true };
}

/** 計算任務健康色（由完成率 + 逾期數推算） */
function taskHealthColor(total, done, overdue) {
  if (total === 0) return 'gray';
  const pct = (done / total) * 100;
  if (overdue > 0 && pct < 50) return 'red';
  if (overdue > 0 || pct < 60) return 'yellow';
  return 'green';
}

// ══════════════════════════════════════════════════════════════════════
// Tool 定義
// ══════════════════════════════════════════════════════════════════════

const TOOLS = [

  // ────────────────────────────────────────────────────────────────────
  // 系統工具
  // ────────────────────────────────────────────────────────────────────
  {
    name: 'get_system_status',
    description: '查詢 xCloudPMIS 各服務健康狀態（資料庫、Redis、API）及基本統計（公司數 / 使用者數 / 專案數 / 任務數）。',
    inputSchema: { type: 'object', properties: {} },
  },

  {
    name: 'get_dashboard_summary',
    description: '取得首頁儀表板摘要：統計卡片（進行中任務、逾期任務、本週完成、成員數）、專案健康分佈、可行動洞察。',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'number', description: '公司 ID（預設 DEFAULT_COMPANY_ID）' },
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // 專案管理
  // ────────────────────────────────────────────────────────────────────
  {
    name: 'list_projects',
    description: '取得公司的專案列表，含任務完成率、逾期任務數、健康燈號（green/yellow/red）。支援依狀態篩選。',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'number', description: '公司 ID（預設 DEFAULT_COMPANY_ID）' },
        status:    { type: 'string', enum: ['planning','active','on_hold','completed','cancelled'], description: '狀態篩選' },
        limit:     { type: 'number', description: '最多回傳筆數（預設 30）', default: 30 },
      },
    },
  },

  {
    name: 'get_project_details',
    description: '取得單一專案完整詳情：任務分節列表、成員、里程碑、進度統計、逾期任務列表。',
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'number', description: '專案 ID（必填）' },
      },
    },
  },

  {
    name: 'create_project',
    description: '建立新專案。',
    inputSchema: {
      type: 'object',
      required: ['name', 'companyId'],
      properties: {
        companyId:   { type: 'number', description: '所屬公司 ID（必填）' },
        name:        { type: 'string', description: '專案名稱（必填）' },
        description: { type: 'string', description: '描述' },
        ownerId:     { type: 'number', description: '負責人 User ID' },
        startDate:   { type: 'string', description: '開始日期（ISO 8601）' },
        endDate:     { type: 'string', description: '截止日期（ISO 8601）' },
        status:      { type: 'string', enum: ['planning','active'], default: 'planning', description: '初始狀態' },
        color:       { type: 'string', description: '顏色（CSS 十六進位，如 #3B82F6）' },
      },
    },
  },

  {
    name: 'update_project',
    description: '更新專案資訊或狀態（名稱、說明、截止日、狀態）。',
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId:   { type: 'number', description: '專案 ID（必填）' },
        name:        { type: 'string', description: '新名稱' },
        description: { type: 'string', description: '新描述' },
        status:      { type: 'string', enum: ['planning','active','on_hold','completed','cancelled'] },
        endDate:     { type: 'string', description: '新截止日期（ISO 8601）' },
        ownerId:     { type: 'number', description: '新負責人 User ID' },
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // 任務管理
  // ────────────────────────────────────────────────────────────────────
  {
    name: 'list_tasks',
    description: '查詢任務列表。可依專案、狀態、指派人、優先度、是否逾期等多條件篩選。',
    inputSchema: {
      type: 'object',
      properties: {
        companyId:  { type: 'number', description: '公司 ID（預設 DEFAULT_COMPANY_ID）' },
        projectId:  { type: 'number', description: '專案 ID（不填則查所有專案）' },
        status:     { type: 'string', enum: ['todo','in_progress','review','done'], description: '狀態篩選' },
        assigneeId: { type: 'number', description: '指派人 User ID' },
        priority:   { type: 'string', enum: ['low','medium','high','urgent'] },
        overdue:    { type: 'boolean', description: 'true = 只回傳逾期任務' },
        search:     { type: 'string', description: '搜尋任務標題（模糊比對）' },
        limit:      { type: 'number', description: '最多回傳筆數（預設 50，最大 200）', default: 50 },
        offset:     { type: 'number', description: '分頁偏移', default: 0 },
      },
    },
  },

  {
    name: 'get_task_details',
    description: '取得任務完整資訊：說明、指派人、截止日、評論列表、工時記錄、附件、活動歷史。',
    inputSchema: {
      type: 'object',
      required: ['taskId'],
      properties: {
        taskId: { type: 'number', description: '任務 ID（必填）' },
      },
    },
  },

  {
    name: 'create_task',
    description: '在指定專案下建立新任務，可設定標題、說明、指派人、截止日期、優先度、預估工時。',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'title'],
      properties: {
        projectId:      { type: 'number', description: '所屬專案 ID（必填）' },
        title:          { type: 'string',  description: '任務標題（必填）' },
        description:    { type: 'string',  description: '任務說明' },
        assigneeId:     { type: 'number',  description: '指派給 User ID' },
        createdById:    { type: 'number',  description: '建立者 User ID（預設 1）', default: 1 },
        dueDate:        { type: 'string',  description: '截止日期（ISO 8601）' },
        priority:       { type: 'string',  enum: ['low','medium','high','urgent'], default: 'medium' },
        estimatedHours: { type: 'number',  description: '預估工時（小時）' },
        sectionId:      { type: 'number',  description: '所屬分節 ID（可選）' },
      },
    },
  },

  {
    name: 'update_task',
    description: '更新任務的任何欄位（標題、說明、狀態、優先度、指派人、截止日、預估工時）。',
    inputSchema: {
      type: 'object',
      required: ['taskId'],
      properties: {
        taskId:         { type: 'number', description: '任務 ID（必填）' },
        title:          { type: 'string' },
        description:    { type: 'string' },
        status:         { type: 'string', enum: ['todo','in_progress','review','done'] },
        priority:       { type: 'string', enum: ['low','medium','high','urgent'] },
        assigneeId:     { type: 'number', description: '新指派人 User ID（0 = 清空）' },
        dueDate:        { type: 'string', description: '新截止日期（ISO 8601，空字串 = 清空）' },
        estimatedHours: { type: 'number' },
      },
    },
  },

  {
    name: 'complete_task',
    description: '標記任務為已完成（status → done）。若任務已完成，改為重啟（status → in_progress）。',
    inputSchema: {
      type: 'object',
      required: ['taskId'],
      properties: {
        taskId: { type: 'number', description: '任務 ID（必填）' },
        reopen: { type: 'boolean', description: 'true = 強制重啟任務', default: false },
      },
    },
  },

  {
    name: 'add_task_comment',
    description: '在任務下新增評論（支援 @mention）。',
    inputSchema: {
      type: 'object',
      required: ['taskId', 'content', 'userId'],
      properties: {
        taskId:   { type: 'number', description: '任務 ID（必填）' },
        content:  { type: 'string', description: '評論內容（必填）' },
        userId:   { type: 'number', description: '評論者 User ID（必填）' },
        mentions: { type: 'array',  items: { type: 'number' }, description: '@mention 的 User ID 清單' },
        parentId: { type: 'number', description: '回覆目標評論 ID（巢狀評論）' },
      },
    },
  },

  {
    name: 'get_overdue_tasks',
    description: '查詢所有逾期任務（截止日已過且未完成），可依公司 / 專案 / 指派人篩選。',
    inputSchema: {
      type: 'object',
      properties: {
        companyId:  { type: 'number', description: '公司 ID（預設 DEFAULT_COMPANY_ID）' },
        projectId:  { type: 'number', description: '限定特定專案' },
        assigneeId: { type: 'number', description: '限定特定成員' },
        limit:      { type: 'number', description: '最多回傳筆數（預設 20）', default: 20 },
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // 團隊 / 資源
  // ────────────────────────────────────────────────────────────────────
  {
    name: 'list_team_members',
    description: '取得公司所有成員列表（姓名、Email、角色、建立時間）。',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'number', description: '公司 ID（預設 DEFAULT_COMPANY_ID）' },
      },
    },
  },

  {
    name: 'get_user_workload',
    description: '查詢成員工作量：目前任務數、逾期任務數、即將到期任務、預估剩餘工時。可查全體成員或單一成員。',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'number', description: '公司 ID（預設 DEFAULT_COMPANY_ID）' },
        userId:    { type: 'number', description: '指定單一成員 User ID（不填 = 全體摘要）' },
        days:      { type: 'number', description: '查詢未來幾天到期的任務（預設 7）', default: 7 },
      },
    },
  },

  {
    name: 'assign_task',
    description: '將任務指派給指定成員（或清空指派人）。',
    inputSchema: {
      type: 'object',
      required: ['taskId'],
      properties: {
        taskId:     { type: 'number', description: '任務 ID（必填）' },
        assigneeId: { type: 'number', description: '指派給 User ID（0 = 清空指派人）' },
        reason:     { type: 'string', description: '指派原因（記錄到活動日誌）' },
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // 時間 / 報告
  // ────────────────────────────────────────────────────────────────────
  {
    name: 'log_time',
    description: '為指定任務記錄工時。',
    inputSchema: {
      type: 'object',
      required: ['taskId', 'userId', 'hours'],
      properties: {
        taskId:      { type: 'number', description: '任務 ID（必填）' },
        userId:      { type: 'number', description: '記錄工時的成員 User ID（必填）' },
        hours:       { type: 'number', description: '工時（小時，必填，最大 24）' },
        date:        { type: 'string', description: '工作日期（ISO 8601，預設今日）' },
        description: { type: 'string', description: '工作描述' },
        billable:    { type: 'boolean', description: '是否為計費工時（預設 true）', default: true },
      },
    },
  },

  {
    name: 'get_project_report',
    description: '產生專案進度報告：任務完成率、工時統計、逾期任務、里程碑達成、成員貢獻。',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'number', description: '公司 ID（預設 DEFAULT_COMPANY_ID）' },
        projectId: { type: 'number', description: '指定專案 ID（不填 = 全公司彙總）' },
        startDate: { type: 'string', description: '報告起始日（ISO 8601，預設 30 天前）' },
        endDate:   { type: 'string', description: '報告截止日（ISO 8601，預設今日）' },
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // 通知 / 郵件
  // ────────────────────────────────────────────────────────────────────
  {
    name: 'send_notification',
    description: '在系統內建立通知給指定使用者（在收件匣顯示）。',
    inputSchema: {
      type: 'object',
      required: ['userId', 'title', 'type'],
      properties: {
        userId:  { type: 'number', description: '接收通知的 User ID（必填）' },
        title:   { type: 'string', description: '通知標題（必填）' },
        body:    { type: 'string', description: '通知內容' },
        type:    {
          type: 'string',
          enum: ['task_assigned','deadline_approaching','mentioned','task_completed','system'],
          description: '通知類型（必填）',
        },
        taskId:    { type: 'number', description: '關聯任務 ID' },
        projectId: { type: 'number', description: '關聯專案 ID' },
      },
    },
  },

  {
    name: 'send_reminder_email',
    description: '透過 Microsoft Graph API 發送任務提醒郵件。可指定 taskId 自動查詢收件人，或手動輸入 userEmail + taskTitle。',
    inputSchema: {
      type: 'object',
      required: ['emailType'],
      properties: {
        emailType:   { type: 'string', enum: ['reminder','overdue'], description: '郵件類型（必填）' },
        taskId:      { type: 'number', description: '任務 ID（選項 A：自動查詢）' },
        userEmail:   { type: 'string', description: '收件人信箱（選項 B）' },
        userName:    { type: 'string', description: '收件人姓名（選項 B）', default: '使用者' },
        taskTitle:   { type: 'string', description: '任務標題（選項 B）' },
        taskDueDate: { type: 'string', description: '截止日期（ISO 8601）' },
        projectName: { type: 'string', description: '所屬專案名稱', default: '未指定專案' },
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // AI 分析
  // ────────────────────────────────────────────────────────────────────
  {
    name: 'analyze_project_health',
    description: '深度分析專案健康度：風險分數（0–100）、風險等級（low/medium/high/critical）、問題成因、具體建議行動。比 list_projects 更深入。',
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'number', description: '要分析的專案 ID（必填）' },
        companyId: { type: 'number', description: '公司 ID（預設 DEFAULT_COMPANY_ID）' },
      },
    },
  },
];

// ══════════════════════════════════════════════════════════════════════
// 工具實作 (handlers)
// ══════════════════════════════════════════════════════════════════════

async function handle(name, args) {
  const cid = args.companyId ?? DEFAULT_COMPANY;

  // ── get_system_status ─────────────────────────────────────────────
  if (name === 'get_system_status') {
    const [dbPing, counts] = await Promise.all([
      prisma.$queryRaw`SELECT NOW() as t, version() as v`,
      Promise.all([
        prisma.company.count(),
        prisma.user.count(),
        prisma.project.count({ where: { deletedAt: null } }),
        prisma.task.count({ where: { status: { not: 'done' } } }),
      ]),
    ]);
    return ok({
      database: { status: 'ok', time: dbPing[0].t, version: dbPing[0].v.split(' ').slice(0,2).join(' ') },
      counts:   { companies: counts[0], users: counts[1], activeProjects: counts[2], openTasks: counts[3] },
    });
  }

  // ── get_dashboard_summary ─────────────────────────────────────────
  if (name === 'get_dashboard_summary') {
    const now = new Date();
    const weekAgo = new Date(now - 7 * 86400000);
    const projects = await prisma.project.findMany({
      where: { companyId: cid, deletedAt: null, status: 'active' },
      include: {
        tasks: { where: { deletedAt: null }, select: { id: true, status: true, dueDate: true } },
      },
    });
    const allTasks = projects.flatMap(p => p.tasks);
    const openTasks    = allTasks.filter(t => t.status !== 'done');
    const overdueTasks = allTasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now);
    const doneThisWeek = allTasks.filter(t => t.status === 'done');

    const health = { green: 0, yellow: 0, red: 0 };
    projects.forEach(p => {
      const total  = p.tasks.length;
      const done   = p.tasks.filter(t => t.status === 'done').length;
      const overdue = p.tasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now).length;
      const c = taskHealthColor(total, done, overdue);
      health[c] = (health[c] || 0) + 1;
    });

    const insights = [];
    if (overdueTasks.length > 0) insights.push(`⚠️ 有 ${overdueTasks.length} 個任務逾期`);
    if (health.red > 0) insights.push(`🔴 ${health.red} 個專案健康狀態為高風險`);
    if (health.yellow > 0) insights.push(`🟡 ${health.yellow} 個專案需要關注`);

    return ok({
      stats:   { openTasks: openTasks.length, overdueTasks: overdueTasks.length, completedThisWeek: doneThisWeek.length, activeProjects: projects.length },
      projectHealth: health,
      insights,
    });
  }

  // ── list_projects ─────────────────────────────────────────────────
  if (name === 'list_projects') {
    const where = { companyId: cid, deletedAt: null };
    if (args.status) where.status = args.status;
    const projects = await prisma.project.findMany({
      where,
      take: args.limit ?? 30,
      orderBy: { updatedAt: 'desc' },
      include: {
        tasks:   { where: { deletedAt: null }, select: { id: true, status: true, dueDate: true } },
        members: { include: { user: { select: { id: true, name: true } } }, take: 5 },
      },
    });
    const now = new Date();
    return ok(projects.map(p => {
      const total   = p.tasks.length;
      const done    = p.tasks.filter(t => t.status === 'done').length;
      const overdue = p.tasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now).length;
      return {
        id: p.id, name: p.name, status: p.status, color: p.color,
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
        tasks: { total, done, overdue },
        health: taskHealthColor(total, done, overdue),
        endDate: p.endDate, description: p.description,
        members: p.members.map(m => ({ id: m.user.id, name: m.user.name, role: m.role })),
      };
    }));
  }

  // ── get_project_details ───────────────────────────────────────────
  if (name === 'get_project_details') {
    const pid = args.projectId;
    const [project, milestones, members] = await Promise.all([
      prisma.project.findUnique({
        where: { id: pid },
        include: {
          tasks: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            include: {
              taskAssigneeLinks: { include: { user: { select: { id: true, name: true } } } },
            },
          },
        },
      }),
      prisma.milestone.findMany({ where: { projectId: pid }, orderBy: { dueDate: 'asc' } }),
      prisma.projectMember.findMany({
        where: { projectId: pid },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      }),
    ]);
    if (!project) return fail(`專案 ID ${pid} 不存在`);
    const now   = new Date();
    const total = project.tasks.length;
    const done  = project.tasks.filter(t => t.status === 'done').length;
    const over  = project.tasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now).length;
    return ok({
      project: { id: project.id, name: project.name, description: project.description, status: project.status, color: project.color, startDate: project.startDate, endDate: project.endDate },
      progress: { total, done, overdue: over, pct: total > 0 ? Math.round((done/total)*100) : 0, health: taskHealthColor(total,done,over) },
      tasks: project.tasks.map(t => ({
        id: t.id, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate,
        assignees: t.taskAssigneeLinks.map(a => a.user.name),
      })),
      milestones: milestones.map(m => ({ id: m.id, name: m.name, dueDate: m.dueDate, completedAt: m.completedAt })),
      members: members.map(m => ({ id: m.user.id, name: m.user.name, email: m.user.email, role: m.role })),
    });
  }

  // ── create_project ────────────────────────────────────────────────
  if (name === 'create_project') {
    const created = await prisma.project.create({
      data: {
        companyId:   args.companyId ?? cid,
        name:        args.name,
        description: args.description ?? '',
        status:      args.status ?? 'planning',
        color:       args.color ?? '#3B82F6',
        ownerId:     args.ownerId ?? null,
        startDate:   args.startDate ? new Date(args.startDate) : null,
        endDate:     args.endDate   ? new Date(args.endDate)   : null,
      },
    });
    return ok({ created: true, project: { id: created.id, name: created.name, status: created.status } });
  }

  // ── update_project ────────────────────────────────────────────────
  if (name === 'update_project') {
    const data = {};
    if (args.name !== undefined)        data.name        = args.name;
    if (args.description !== undefined) data.description = args.description;
    if (args.status !== undefined)      data.status      = args.status;
    if (args.ownerId !== undefined)     data.ownerId     = args.ownerId;
    if (args.endDate !== undefined)     data.endDate     = args.endDate ? new Date(args.endDate) : null;
    const updated = await prisma.project.update({ where: { id: args.projectId }, data });
    return ok({ updated: true, project: { id: updated.id, name: updated.name, status: updated.status } });
  }

  // ── list_tasks ────────────────────────────────────────────────────
  if (name === 'list_tasks') {
    const now = new Date();
    const projectIds = args.projectId ? [args.projectId] : (
      await prisma.project.findMany({ where: { companyId: cid, deletedAt: null }, select: { id: true } })
    ).map(p => p.id);

    const where = {
      projectId: { in: projectIds },
      deletedAt:  null,
      ...(args.status     && { status:   args.status }),
      ...(args.priority   && { priority: args.priority }),
      ...(args.search     && { title:    { contains: args.search, mode: 'insensitive' } }),
      ...(args.overdue    && { dueDate:  { lt: now }, status: { not: 'done' } }),
      ...(args.assigneeId && {
        taskAssigneeLinks: { some: { userId: args.assigneeId } },
      }),
    };

    const tasks = await prisma.task.findMany({
      where, take: Math.min(args.limit ?? 50, 200), skip: args.offset ?? 0,
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      include: {
        project:   { select: { id: true, name: true } },
        taskAssigneeLinks: { include: { user: { select: { id: true, name: true } } }, take: 3 },
      },
    });
    return ok(tasks.map(t => ({
      id: t.id, title: t.title, status: t.status, priority: t.priority,
      dueDate: t.dueDate, isOverdue: t.dueDate && new Date(t.dueDate) < now && t.status !== 'done',
      project: t.project, assignees: t.taskAssigneeLinks.map(a => a.user.name),
    })));
  }

  // ── get_task_details ──────────────────────────────────────────────
  if (name === 'get_task_details') {
    const task = await prisma.task.findUnique({
      where: { id: args.taskId },
      include: {
        project:     { select: { id: true, name: true } },
        taskAssigneeLinks: { include: { user: { select: { id: true, name: true, email: true } } } },
        comments:    { orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, name: true } } } },
        timeEntries: { orderBy: { startedAt: 'desc' }, take: 10, include: { user: { select: { id: true, name: true } } } },
        attachments: { select: { id: true, originalName: true, fileSize: true, createdAt: true } },
      },
    });
    if (!task) return fail(`任務 ID ${args.taskId} 不存在`);
    return ok({
      id: task.id, title: task.title, description: task.description,
      status: task.status, priority: task.priority,
      dueDate: task.dueDate, estimatedHours: task.estimatedHours,
      project:    task.project,
      assignees:  task.taskAssigneeLinks.map(a => ({ id: a.user.id, name: a.user.name, email: a.user.email })),
      comments:   task.comments.map(c => ({ id: c.id, content: c.content, author: c.author.name, createdAt: c.createdAt })),
      timeEntries: task.timeEntries.map(e => ({
        id: e.id, user: e.user.name,
        hours: e.durationMinutes ? e.durationMinutes / 60 : null,
        date: e.startedAt, description: e.description,
      })),
      attachments: task.attachments,
    });
  }

  // ── create_task ───────────────────────────────────────────────────
  if (name === 'create_task') {
    const task = await prisma.task.create({
      data: {
        projectId:      args.projectId,
        title:          args.title,
        description:    args.description ?? '',
        priority:       args.priority ?? 'medium',
        status:         'todo',
        dueDate:        args.dueDate ? new Date(args.dueDate) : null,
        estimatedHours: args.estimatedHours ?? null,
        createdById:    args.createdById ?? 1,
        sectionId:      args.sectionId ?? null,
        ...(args.assigneeId && {
          taskAssigneeLinks: { create: { userId: args.assigneeId } },
        }),
      },
    });
    // 發送指派通知
    if (args.assigneeId) {
      await prisma.notification.create({
        data: {
          userId:  args.assigneeId,
          type:    'task_assigned',
          title:   `新任務指派：${task.title}`,
          body:    `您有一個新任務已指派給您`,
          taskId:  task.id,
          projectId: args.projectId,
          read:    false,
        },
      }).catch(() => {});
    }
    return ok({ created: true, task: { id: task.id, title: task.title, status: task.status, priority: task.priority } });
  }

  // ── update_task ───────────────────────────────────────────────────
  if (name === 'update_task') {
    const data = {};
    if (args.title !== undefined)          data.title          = args.title;
    if (args.description !== undefined)    data.description    = args.description;
    if (args.status !== undefined)         data.status         = args.status;
    if (args.priority !== undefined)       data.priority       = args.priority;
    if (args.estimatedHours !== undefined) data.estimatedHours = args.estimatedHours;
    if (args.dueDate !== undefined)        data.dueDate        = args.dueDate ? new Date(args.dueDate) : null;
    if (args.status === 'done')            data.completedAt    = new Date();

    const updated = await prisma.task.update({ where: { id: args.taskId }, data });

    // 處理指派人變更
    if (args.assigneeId !== undefined) {
      await prisma.taskAssigneeLink.deleteMany({ where: { taskId: args.taskId } });
      if (args.assigneeId > 0) {
        await prisma.taskAssigneeLink.create({ data: { taskId: args.taskId, userId: args.assigneeId } });
        await prisma.notification.create({ data: {
          userId: args.assigneeId, type: 'task_assigned',
          title: `任務重新指派：${updated.title}`,
          body: '有一個任務已指派給您', taskId: args.taskId, read: false,
        }}).catch(()=>{});
      }
    }
    return ok({ updated: true, task: { id: updated.id, title: updated.title, status: updated.status } });
  }

  // ── complete_task ─────────────────────────────────────────────────
  if (name === 'complete_task') {
    const task = await prisma.task.findUnique({ where: { id: args.taskId } });
    if (!task) return fail(`任務 ID ${args.taskId} 不存在`);
    const newStatus = (task.status === 'done' || args.reopen) ? 'in_progress' : 'done';
    const updated = await prisma.task.update({
      where: { id: args.taskId },
      data:  { status: newStatus, completedAt: newStatus === 'done' ? new Date() : null },
    });
    return ok({ taskId: args.taskId, oldStatus: task.status, newStatus: updated.status, message: newStatus === 'done' ? '任務已標記完成' : '任務已重啟' });
  }

  // ── add_task_comment ──────────────────────────────────────────────
  if (name === 'add_task_comment') {
    const comment = await prisma.comment.create({
      data: {
        taskId:   args.taskId,
        authorId: args.userId,
        content:  args.content,
        parentId: args.parentId ?? null,
      },
    });
    // 發送 @mention 通知
    if (args.mentions?.length) {
      await Promise.all(args.mentions.map(uid =>
        prisma.notification.create({ data: {
          userId: uid, type: 'mentioned',
          title: '您在評論中被提及', body: args.content.slice(0, 100),
          taskId: args.taskId, read: false,
        }}).catch(()=>{})
      ));
    }
    return ok({ created: true, commentId: comment.id });
  }

  // ── get_overdue_tasks ─────────────────────────────────────────────
  if (name === 'get_overdue_tasks') {
    const now = new Date();
    const projectIds = args.projectId ? [args.projectId] : (
      await prisma.project.findMany({ where: { companyId: cid, deletedAt: null }, select: { id: true } })
    ).map(p => p.id);

    const where = {
      projectId: { in: projectIds },
      deletedAt:  null,
      status:    { not: 'done' },
      dueDate:   { lt: now },
      ...(args.assigneeId && { taskAssigneeLinks: { some: { userId: args.assigneeId } } }),
    };
    const tasks = await prisma.task.findMany({
      where, take: args.limit ?? 20, orderBy: { dueDate: 'asc' },
      include: {
        project:   { select: { id: true, name: true } },
        taskAssigneeLinks: { include: { user: { select: { id: true, name: true, email: true } } }, take: 3 },
      },
    });
    return ok(tasks.map(t => ({
      id: t.id, title: t.title, status: t.status, priority: t.priority,
      dueDate: t.dueDate,
      daysOverdue: Math.floor((now - new Date(t.dueDate)) / 86400000),
      project:   t.project,
      assignees: t.taskAssigneeLinks.map(a => ({ id: a.user.id, name: a.user.name, email: a.user.email })),
    })));
  }

  // ── list_team_members ─────────────────────────────────────────────
  if (name === 'list_team_members') {
    const users = await prisma.user.findMany({
      where: { companyId: cid },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    return ok(users);
  }

  // ── get_user_workload ─────────────────────────────────────────────
  if (name === 'get_user_workload') {
    const now    = new Date();
    const future = new Date(now.getTime() + (args.days ?? 7) * 86400000);
    const projectIds = (
      await prisma.project.findMany({ where: { companyId: cid, deletedAt: null }, select: { id: true } })
    ).map(p => p.id);

    const queryUser = async (userId) => {
      const [activeTasks, overdueTasks, dueSoon, timeSum] = await Promise.all([
        prisma.task.count({ where: {
          projectId: { in: projectIds }, status: { notIn: ['done'] }, deletedAt: null,
          taskAssigneeLinks: { some: { userId } },
        }}),
        prisma.task.count({ where: {
          projectId: { in: projectIds }, status: { notIn: ['done'] }, deletedAt: null,
          dueDate: { lt: now }, taskAssigneeLinks: { some: { userId } },
        }}),
        prisma.task.findMany({ where: {
          projectId: { in: projectIds }, status: { notIn: ['done'] }, deletedAt: null,
          dueDate: { gte: now, lte: future }, taskAssigneeLinks: { some: { userId } },
        }, select: { id: true, title: true, dueDate: true, priority: true } }),
        prisma.timeEntry.aggregate({
          where: { userId, startedAt: { gte: new Date(now - 7 * 86400000) } },
          _sum: { durationMinutes: true },
        }),
      ]);
      return {
        activeTasks, overdueTasks,
        upcomingTasks: dueSoon,
        hoursThisWeek: ((timeSum._sum.durationMinutes || 0) / 60).toFixed(1),
      };
    };

    if (args.userId) {
      const user = await prisma.user.findUnique({ where: { id: args.userId }, select: { id: true, name: true, email: true, role: true } });
      if (!user) return fail(`使用者 ID ${args.userId} 不存在`);
      const load = await queryUser(args.userId);
      return ok({ ...user, workload: load });
    }

    const users = await prisma.user.findMany({ where: { companyId: cid }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } });
    const results = await Promise.all(users.map(async u => ({ ...u, ...await queryUser(u.id) })));
    return ok(results);
  }

  // ── assign_task ───────────────────────────────────────────────────
  if (name === 'assign_task') {
    const task = await prisma.task.findUnique({ where: { id: args.taskId }, select: { id: true, title: true } });
    if (!task) return fail(`任務 ID ${args.taskId} 不存在`);
    await prisma.taskAssigneeLink.deleteMany({ where: { taskId: args.taskId } });
    if (args.assigneeId > 0) {
      await prisma.taskAssigneeLink.create({ data: { taskId: args.taskId, userId: args.assigneeId } });
      await prisma.notification.create({ data: {
        userId: args.assigneeId, type: 'task_assigned',
        title: `任務指派：${task.title}`, body: args.reason ?? '有一個任務已指派給您',
        taskId: args.taskId, read: false,
      }}).catch(()=>{});
    }
    return ok({ assigned: args.assigneeId > 0, taskId: args.taskId, assigneeId: args.assigneeId });
  }

  // ── log_time ──────────────────────────────────────────────────────
  if (name === 'log_time') {
    if (args.hours <= 0 || args.hours > 24) return fail('工時必須介於 0.1 – 24 小時之間');
    const date = args.date ? new Date(args.date) : new Date();
    const entry = await prisma.timeEntry.create({
      data: {
        taskId:          args.taskId,
        userId:          args.userId,
        startedAt:       date,
        durationMinutes: Math.round(args.hours * 60),
        description:     args.description ?? null,
      },
    });
    return ok({ logged: true, entryId: entry.id, hours: args.hours, date: date.toISOString().slice(0,10) });
  }

  // ── get_project_report ────────────────────────────────────────────
  if (name === 'get_project_report') {
    const now = new Date();
    const startDate = args.startDate ? new Date(args.startDate) : new Date(now - 30 * 86400000);
    const endDate   = args.endDate   ? new Date(args.endDate)   : now;

    const projectFilter = args.projectId ? { id: args.projectId } : { companyId: cid, deletedAt: null };
    const projects = await prisma.project.findMany({
      where: projectFilter,
      include: {
        tasks: {
          where: { deletedAt: null },
          include: {
            taskAssigneeLinks: { include: { user: { select: { id: true, name: true } } } },
            timeEntries: { where: { startedAt: { gte: startDate, lte: endDate } }, select: { durationMinutes: true } },
          },
        },
        milestones: { select: { id: true, name: true, dueDate: true, completedAt: true } },
      },
    });

    return ok(projects.map(p => {
      const tasks    = p.tasks;
      const total    = tasks.length;
      const done     = tasks.filter(t => t.status === 'done').length;
      const overdue  = tasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now).length;
      const hoursSum = tasks.flatMap(t => t.timeEntries).reduce((s, e) => s + (e.durationMinutes || 0), 0);
      const milestonesDone = p.milestones.filter(m => m.completedAt).length;

      const memberHours = {};
      tasks.forEach(t => {
        const hrs = t.timeEntries.reduce((s, e) => s + (e.durationMinutes || 0), 0) / 60;
        t.taskAssigneeLinks.forEach(a => {
          memberHours[a.user.name] = (memberHours[a.user.name] || 0) + hrs;
        });
      });

      return {
        project: { id: p.id, name: p.name, status: p.status },
        progress: { total, done, overdue, pct: total > 0 ? Math.round((done/total)*100) : 0 },
        milestones: { total: p.milestones.length, done: milestonesDone },
        timeLogged: `${(hoursSum/60).toFixed(1)} hrs`,
        memberContributions: memberHours,
        health: taskHealthColor(total, done, overdue),
      };
    }));
  }

  // ── send_notification ─────────────────────────────────────────────
  if (name === 'send_notification') {
    const notif = await prisma.notification.create({
      data: {
        userId:    args.userId,
        type:      args.type,
        title:     args.title,
        body:      args.body ?? null,
        taskId:    args.taskId    ?? null,
        projectId: args.projectId ?? null,
        read:      false,
      },
    });
    return ok({ sent: true, notificationId: notif.id });
  }

  // ── send_reminder_email ───────────────────────────────────────────
  if (name === 'send_reminder_email') {
    let userEmail = args.userEmail, userName = args.userName ?? '使用者';
    let taskTitle = args.taskTitle, taskDueDate = args.taskDueDate, projectName = args.projectName ?? '未指定專案';

    if (args.taskId) {
      const task = await prisma.task.findUnique({
        where: { id: args.taskId },
        include: {
          project:   { select: { name: true } },
          taskAssigneeLinks: { include: { user: { select: { name: true, email: true } } }, take: 1 },
        },
      });
      if (!task) return fail(`任務 ID ${args.taskId} 不存在`);
      taskTitle    = task.title;
      taskDueDate  = task.dueDate?.toISOString();
      projectName  = task.project?.name ?? projectName;
      userEmail    = task.taskAssigneeLinks[0]?.user.email ?? userEmail;
      userName     = task.taskAssigneeLinks[0]?.user.name  ?? userName;
    }

    if (!userEmail) return fail('請提供 taskId 或 userEmail');

    try {
      const emailSvc = getEmail();
      if (args.emailType === 'reminder') {
        await emailSvc.sendTaskReminderEmail(userEmail, userName, taskTitle, taskDueDate, projectName);
      } else {
        await emailSvc.sendOverdueTaskEmail(userEmail, userName, taskTitle, taskDueDate, projectName);
      }
      return ok({ sent: true, to: userEmail, type: args.emailType });
    } catch (e) {
      return fail(`郵件發送失敗：${e.message}`);
    }
  }

  // ── analyze_project_health ────────────────────────────────────────
  if (name === 'analyze_project_health') {
    const pid = args.projectId;
    const project = await prisma.project.findUnique({
      where: { id: pid },
      include: {
        tasks: {
          where: { deletedAt: null },
          include: { taskAssigneeLinks: { include: { user: { select: { id: true, name: true } } } } },
        },
        milestones: true,
      },
    });
    if (!project) return fail(`專案 ID ${pid} 不存在`);

    const now     = new Date();
    const tasks   = project.tasks;
    const total   = tasks.length;
    const done    = tasks.filter(t => t.status === 'done').length;
    const overdue = tasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now);
    const noAssignee = tasks.filter(t => t.taskAssigneeLinks.length === 0 && t.status !== 'done');
    const milestonesDue = project.milestones.filter(m => !m.completedAt && m.dueDate && new Date(m.dueDate) < new Date(now.getTime() + 7 * 86400000));

    // 風險評分
    let riskScore = 0;
    const issues = [];
    const actions = [];

    if (total === 0) { riskScore += 10; issues.push('專案尚無任務'); actions.push('請建立初始任務列表'); }
    const pct = total > 0 ? (done / total) * 100 : 0;
    if (pct < 30 && project.endDate && new Date(project.endDate) < new Date(now.getTime() + 14 * 86400000)) {
      riskScore += 35; issues.push(`截止日即將到來，完成率僅 ${pct.toFixed(0)}%`);
      actions.push('立即重新評估範圍或延後截止日');
    }
    if (overdue.length > 0) {
      riskScore += Math.min(overdue.length * 8, 30);
      issues.push(`${overdue.length} 個任務逾期（最久：${Math.floor((now - new Date(overdue[0].dueDate)) / 86400000)} 天）`);
      actions.push('召開追蹤會議，解決逾期任務的阻礙');
    }
    if (noAssignee.length > 3) {
      riskScore += 15; issues.push(`${noAssignee.length} 個任務無負責人`);
      actions.push('指派負責人給所有進行中任務');
    }
    if (milestonesDue.length > 0) {
      riskScore += 20; issues.push(`${milestonesDue.length} 個里程碑 7 天內到期`);
      actions.push('確認里程碑交付物是否準備就緒');
    }
    riskScore = Math.min(riskScore, 100);
    const level = riskScore <= 20 ? 'low' : riskScore <= 50 ? 'medium' : riskScore <= 75 ? 'high' : 'critical';

    return ok({
      project: { id: project.id, name: project.name, status: project.status },
      health:  { riskScore, level, color: ['low','medium'].includes(level) ? 'green' : level === 'high' ? 'yellow' : 'red' },
      progress: { total, done, overdue: overdue.length, pct: Math.round(pct), noAssignee: noAssignee.length },
      issues, actions,
      milestones: { dueSoon: milestonesDue.map(m => m.name) },
    });
  }

  throw new McpError(ErrorCode.MethodNotFound, `未知工具：${name}`);
}

// ══════════════════════════════════════════════════════════════════════
// MCP Server 初始化
// ══════════════════════════════════════════════════════════════════════

const server = new Server(
  { name: 'xcloudpmis', version: '3.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    return await handle(name, args);
  } catch (err) {
    if (err instanceof McpError) throw err;
    return fail(`工具執行失敗：${err.message}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr 不影響 MCP 協定（stdout 專用）
  process.stderr.write('[xCloudPMIS MCP v3.0] 已啟動，等待 Claude Desktop 連線...\n');
}

main().catch(err => {
  process.stderr.write(`[MCP] 啟動失敗：${err.message}\n`);
  process.exit(1);
});
