'use strict';
/**
 * mcp-external-server/handlers/resources.js
 * ─────────────────────────────────────────────────────────────
 * MCP Resource 定義（外部系統可讀取的 URI）
 *
 * Resources 對應：
 *   project://{projectId}       - 專案資料
 *   task://{taskId}             - 任務詳情
 *   user://{userId}/workload    - 用戶工作負載
 *   report://weekly             - 每周報告
 *
 * 依 API Key companyId 隔離（Tenant Isolation）
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: [] });

// ════════════════════════════════════════════════════════════
// Resource 模板定義
// ════════════════════════════════════════════════════════════

/**
 * 取得可用 Resource 清單（依 scopes 過濾）
 * @param {string[]} scopes - API Key 的 scopes
 * @param {Object}   apiKeyInfo
 * @returns {Array} MCP Resource 定義
 */
function getAvailableResources(scopes, apiKeyInfo) {
  const canReadProjects = scopes.includes('read:projects') || scopes.includes('admin:*');
  const canReadTasks    = scopes.includes('read:tasks')    || scopes.includes('admin:*');
  const canReadTeam     = scopes.includes('read:team')     || scopes.includes('admin:*');
  const canReadReports  = scopes.includes('read:reports')  || scopes.includes('admin:*');

  const resources = [];

  if (canReadProjects) {
    resources.push({
      uri:         'project://list',
      name:        '所有專案清單',
      description: '取得公司所有進行中的專案摘要',
      mimeType:    'application/json',
    });
    resources.push({
      uriTemplate: 'project://{projectId}',
      name:        '專案詳細資料',
      description: '取得特定專案的完整資料，包含任務、里程碑、成員',
      mimeType:    'application/json',
    });
  }

  if (canReadTasks) {
    resources.push({
      uriTemplate: 'task://{taskId}',
      name:        '任務詳細資料',
      description: '取得特定任務的完整資料，包含評論、時間記錄、附件',
      mimeType:    'application/json',
    });
  }

  if (canReadTeam) {
    resources.push({
      uriTemplate: 'user://{userId}/workload',
      name:        '成員工作負載',
      description: '取得特定成員的工作負載統計（進行中任務、截止日等）',
      mimeType:    'application/json',
    });
  }

  if (canReadReports) {
    resources.push({
      uri:         'report://weekly',
      name:        '每周報告',
      description: '取得最近一周的專案進度摘要報告',
      mimeType:    'application/json',
    });
    resources.push({
      uri:         'report://overdue',
      name:        '逾期任務報告',
      description: '取得所有逾期任務的匯總報告',
      mimeType:    'application/json',
    });
  }

  return resources;
}

// ════════════════════════════════════════════════════════════
// Resource 讀取實作
// ════════════════════════════════════════════════════════════

/**
 * 讀取 Resource
 * @param {string} uri        - 請求的 URI
 * @param {Object} apiKeyInfo - { companyId, scopes, ... }
 * @returns {{ contents: Array<{ uri, mimeType, text }> }}
 */
async function readResource(uri, apiKeyInfo) {
  const { companyId, scopes } = apiKeyInfo;
  const hasAdmin = scopes.includes('admin:*');

  // ── project://list ───────────────────────────────────────
  if (uri === 'project://list') {
    if (!scopes.includes('read:projects') && !hasAdmin) {
      throw Object.assign(new Error('Insufficient scope: read:projects required'), { code: -32003 });
    }
    const projects = await prisma.project.findMany({
      where: { companyId },
      select: {
        id: true, name: true, status: true, startDate: true, endDate: true,
        description: true,
        _count: { select: { tasks: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    return buildContent(uri, projects);
  }

  // ── project://{projectId} ────────────────────────────────
  const projectMatch = uri.match(/^project:\/\/(\d+)$/);
  if (projectMatch) {
    if (!scopes.includes('read:projects') && !hasAdmin) {
      throw Object.assign(new Error('Insufficient scope: read:projects required'), { code: -32003 });
    }
    const projectId = parseInt(projectMatch[1]);
    const project = await prisma.project.findFirst({
      where: { id: projectId, companyId },
      include: {
        tasks: {
          select: {
            id: true, title: true, status: true, priority: true,
            assignedTo: true, dueDate: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
        milestones: {
          select: { id: true, name: true, dueDate: true, isCompleted: true },
          orderBy: { dueDate: 'asc' },
        },
      },
    });
    if (!project) {
      throw Object.assign(new Error(`Project #${projectId} not found`), { code: -32002 });
    }
    return buildContent(uri, project);
  }

  // ── task://{taskId} ──────────────────────────────────────
  const taskMatch = uri.match(/^task:\/\/(\d+)$/);
  if (taskMatch) {
    if (!scopes.includes('read:tasks') && !hasAdmin) {
      throw Object.assign(new Error('Insufficient scope: read:tasks required'), { code: -32003 });
    }
    const taskId = parseInt(taskMatch[1]);
    const task = await prisma.task.findFirst({
      where: { id: taskId, project: { companyId } },
      include: {
        project:     { select: { id: true, name: true } },
        comments:    { orderBy: { createdAt: 'asc' }, take: 50 },
        timeEntries: { orderBy: { createdAt: 'desc' }, take: 20 },
        tags:        true,
      },
    });
    if (!task) {
      throw Object.assign(new Error(`Task #${taskId} not found`), { code: -32002 });
    }
    return buildContent(uri, task);
  }

  // ── user://{userId}/workload ─────────────────────────────
  const workloadMatch = uri.match(/^user:\/\/(\d+)\/workload$/);
  if (workloadMatch) {
    if (!scopes.includes('read:team') && !hasAdmin) {
      throw Object.assign(new Error('Insufficient scope: read:team required'), { code: -32003 });
    }
    const userId = parseInt(workloadMatch[1]);
    const now    = new Date();

    const [user, activeTasks, overdueTasks, totalEstimated] = await Promise.all([
      prisma.user.findFirst({
        where:  { id: userId, companyId },
        select: { id: true, name: true, email: true, availableHoursPerWeek: true },
      }),
      prisma.task.count({
        where: { assignedTo: userId, project: { companyId }, status: { in: ['in_progress', 'todo'] } },
      }),
      prisma.task.count({
        where: { assignedTo: userId, project: { companyId }, dueDate: { lt: now }, status: { notIn: ['done', 'cancelled'] } },
      }),
      prisma.task.aggregate({
        where:  { assignedTo: userId, project: { companyId }, status: { in: ['in_progress', 'todo'] } },
        _sum:   { estimatedHours: true },
      }),
    ]);

    if (!user) {
      throw Object.assign(new Error(`User #${userId} not found`), { code: -32002 });
    }

    const availableHours = user.availableHoursPerWeek ?? 40;
    const usedHours      = totalEstimated._sum?.estimatedHours ?? 0;
    const loadScore      = Math.round((usedHours / availableHours) * 100);

    return buildContent(uri, {
      user,
      activeTasks,
      overdueTasks,
      estimatedHoursThisWeek: usedHours,
      availableHoursPerWeek:  availableHours,
      loadScore: Math.min(loadScore, 200),   // cap at 200%
      loadLevel: loadScore < 60 ? 'light' : loadScore < 90 ? 'normal' : loadScore < 120 ? 'heavy' : 'overloaded',
    });
  }

  // ── report://weekly ──────────────────────────────────────
  if (uri === 'report://weekly') {
    if (!scopes.includes('read:reports') && !hasAdmin) {
      throw Object.assign(new Error('Insufficient scope: read:reports required'), { code: -32003 });
    }
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalProjects, completedTasks, createdTasks, overdueCount] = await Promise.all([
      prisma.project.count({ where: { companyId, status: 'active' } }),
      prisma.task.count({
        where: { project: { companyId }, status: 'done', updatedAt: { gte: oneWeekAgo } },
      }),
      prisma.task.count({
        where: { project: { companyId }, createdAt: { gte: oneWeekAgo } },
      }),
      prisma.task.count({
        where: { project: { companyId }, dueDate: { lt: new Date() }, status: { notIn: ['done', 'cancelled'] } },
      }),
    ]);

    const topProjects = await prisma.project.findMany({
      where:  { companyId, status: 'active' },
      select: {
        id: true, name: true, status: true,
        _count: { select: { tasks: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    return buildContent(uri, {
      period:        { from: oneWeekAgo.toISOString(), to: new Date().toISOString() },
      activeProjects: totalProjects,
      tasksCompleted: completedTasks,
      tasksCreated:   createdTasks,
      overdueTotal:   overdueCount,
      topProjects,
      generatedAt:    new Date().toISOString(),
    });
  }

  // ── report://overdue ─────────────────────────────────────
  if (uri === 'report://overdue') {
    if (!scopes.includes('read:reports') && !hasAdmin) {
      throw Object.assign(new Error('Insufficient scope: read:reports required'), { code: -32003 });
    }
    const overdueTasks = await prisma.task.findMany({
      where: {
        project:  { companyId },
        dueDate:  { lt: new Date() },
        status:   { notIn: ['done', 'cancelled'] },
      },
      select: {
        id: true, title: true, status: true, priority: true,
        dueDate: true, assignedTo: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 100,
    });

    return buildContent(uri, {
      total:    overdueTasks.length,
      tasks:    overdueTasks,
      generatedAt: new Date().toISOString(),
    });
  }

  // ── 未知 URI ─────────────────────────────────────────────
  throw Object.assign(new Error(`Unknown resource URI: ${uri}`), { code: -32002 });
}

// ════════════════════════════════════════════════════════════
// 輔助
// ════════════════════════════════════════════════════════════

function buildContent(uri, data) {
  return {
    contents: [{
      uri,
      mimeType: 'application/json',
      text:     JSON.stringify(data, null, 2),
    }],
  };
}

// ════════════════════════════════════════════════════════════
// Discovery 用靜態模板清單（無需認證）
// ════════════════════════════════════════════════════════════

const RESOURCE_TEMPLATES = [
  {
    uriTemplate: 'project://{projectId}',
    name:        '專案詳細資料',
    description: '取得特定專案的完整資料，包含任務、里程碑、成員',
    mimeType:    'application/json',
    requiredScopes: ['read:projects'],
  },
  {
    uri:         'project://list',
    name:        '所有專案清單',
    description: '取得公司所有進行中的專案摘要',
    mimeType:    'application/json',
    requiredScopes: ['read:projects'],
  },
  {
    uriTemplate: 'task://{taskId}',
    name:        '任務詳細資料',
    description: '取得特定任務的完整資料，包含評論、時間記錄、附件',
    mimeType:    'application/json',
    requiredScopes: ['read:tasks'],
  },
  {
    uriTemplate: 'user://{userId}/workload',
    name:        '成員工作負載',
    description: '取得特定成員的工作負載統計（進行中任務、截止日等）',
    mimeType:    'application/json',
    requiredScopes: ['read:team'],
  },
  {
    uri:         'report://weekly',
    name:        '每周報告',
    description: '取得最近一周的專案進度摘要報告',
    mimeType:    'application/json',
    requiredScopes: ['read:reports'],
  },
  {
    uri:         'report://overdue',
    name:        '逾期任務報告',
    description: '取得所有逾期任務的匯總報告',
    mimeType:    'application/json',
    requiredScopes: ['read:reports'],
  },
];

module.exports = { getAvailableResources, readResource, RESOURCE_TEMPLATES };
