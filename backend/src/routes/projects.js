/**
 * 專案管理 API 路由
 *
 * GET    /api/projects              取得專案列表（含任務統計）
 * POST   /api/projects              建立新專案
 * GET    /api/projects/:id          取得單一專案詳情（含任務列表）
 * PATCH  /api/projects/:id          更新專案資訊
 * GET    /api/projects/:id/tasks    取得專案任務列表
 * POST   /api/projects/:id/tasks    在專案下建立任務
 * PATCH  /api/tasks/:taskId         更新任務（狀態、指派人等）
 *
 * GET    /api/tasks?companyId=      跨專案全部任務（任務看板用）
 * GET    /api/users?companyId=      公司成員列表（指派人選單用）
 */

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── 小工具 ──────────────────────────────────────────────────
const ok  = (res, data, meta = {}) =>
  res.json({ success: true, data, meta, timestamp: new Date().toISOString() });

const err = (res, message, status = 500) =>
  res.status(status).json({ success: false, error: message });

// 狀態中文對照
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

// ════════════════════════════════════════════════════════════
// GET /api/projects?companyId=2
// 取得所有專案，含任務統計數字
// ════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  const companyId = parseInt(req.query.companyId) || 2;

  try {
    const projects = await prisma.project.findMany({
      where:   { companyId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true } },
        tasks: {
          where:  { deletedAt: null },
          select: { id: true, status: true },
        },
        milestones: {
          select: { id: true, name: true, isAchieved: true, dueDate: true },
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    const result = projects.map(p => {
      const total    = p.tasks.length;
      const done     = p.tasks.filter(t => t.status === 'done').length;
      const overdue  = p.tasks.filter(t =>
        t.status !== 'done' && t.dueDate && new Date(t.dueDate) < new Date()
      ).length;

      return {
        id:           p.id,
        name:         p.name,
        description:  p.description,
        status:       p.status,
        statusLabel:  STATUS_LABEL[p.status] || p.status,
        budget:       p.budget ? parseFloat(p.budget.toString()) : null,
        startDate:    p.startDate,
        endDate:      p.endDate,
        owner:        p.owner,
        taskTotal:    total,
        taskDone:     done,
        taskOverdue:  overdue,
        completion:   total > 0 ? Math.round((done / total) * 100) : 0,
        milestoneCount: p.milestones.length,
        nextMilestone:  p.milestones.find(m => !m.isAchieved) || null,
        createdAt:    p.createdAt,
      };
    });

    ok(res, result, { total: result.length });
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/projects
// 建立新專案
// ════════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  const {
    companyId = 2,
    name, description = '',
    status = 'planning',
    budget, startDate, endDate,
    ownerId,
  } = req.body;

  if (!name?.trim()) return err(res, '專案名稱為必填', 400);

  try {
    const project = await prisma.project.create({
      data: {
        companyId,
        name:        name.trim(),
        description,
        status,
        budget:      budget   ? parseFloat(budget)   : null,
        startDate:   startDate ? new Date(startDate) : null,
        endDate:     endDate   ? new Date(endDate)   : null,
        ownerId:     ownerId   ? parseInt(ownerId)   : null,
      },
      include: {
        owner: { select: { id: true, name: true } },
      },
    });

    ok(res, project);
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/projects/tasks?companyId=2
// 跨專案所有任務（任務看板頁面用）
// ⚠️  必須放在 /:id 之前，否則 'tasks' 會被當作專案 ID
// ════════════════════════════════════════════════════════════
router.get('/tasks', async (req, res) => {
  const companyId  = parseInt(req.query.companyId)  || 2;
  const projectId  = req.query.projectId  ? parseInt(req.query.projectId)  : undefined;
  const assigneeId = req.query.assigneeId ? parseInt(req.query.assigneeId) : undefined;
  const priority   = req.query.priority   || undefined;
  const status     = req.query.status     || undefined;

  try {
    const allProjects = await prisma.project.findMany({
      where:  { companyId, deletedAt: null },
      select: { id: true, name: true },
    });
    const projectIds = projectId
      ? [projectId]
      : allProjects.map(p => p.id);

    const tasks = await prisma.task.findMany({
      where: {
        projectId:  { in: projectIds },
        deletedAt:  null,
        ...(assigneeId ? { assigneeId } : {}),
        ...(priority   ? { priority }   : {}),
        ...(status     ? { status }     : {}),
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate:  'asc'  },
        { createdAt:'asc'  },
      ],
      include: {
        assignee: { select: { id: true, name: true } },
        project:  { select: { id: true, name: true } },
        taskTags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
    });

    const formatted = tasks.map(t => ({
      id:             t.id,
      title:          t.title,
      description:    t.description,
      status:         t.status,
      priority:       t.priority,
      estimatedHours: t.estimatedHours ? parseFloat(t.estimatedHours.toString()) : null,
      actualHours:    t.actualHours    ? parseFloat(t.actualHours.toString())    : null,
      dueDate:        t.dueDate,
      startedAt:      t.startedAt,
      completedAt:    t.completedAt,
      assignee:       t.assignee,
      project:        t.project,
      tags:           t.taskTags.map(tt => tt.tag),
    }));

    const kanban = {
      todo:        formatted.filter(t => t.status === 'todo'),
      in_progress: formatted.filter(t => t.status === 'in_progress'),
      review:      formatted.filter(t => t.status === 'review'),
      done:        formatted.filter(t => t.status === 'done'),
    };

    ok(res, { tasks: formatted, kanban, projects: allProjects }, {
      total: formatted.length,
      todo:  kanban.todo.length,
      in_progress: kanban.in_progress.length,
      review: kanban.review.length,
      done:  kanban.done.length,
    });
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/projects/users?companyId=2
// 公司成員列表（指派人選單用）
// ⚠️  同樣放在 /:id 之前
// ════════════════════════════════════════════════════════════
router.get('/users', async (req, res) => {
  const companyId = parseInt(req.query.companyId) || 2;
  try {
    const users = await prisma.user.findMany({
      where:   { companyId, isActive: true },
      select:  { id: true, name: true, email: true, role: true, avatarUrl: true },
      orderBy: { name: 'asc' },
    });
    ok(res, users, { total: users.length });
  } catch (e) {
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/projects/:id
// 取得單一專案詳情（含里程碑 + 任務列表）
// ════════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return err(res, '無效的專案 ID', 400);

  try {
    const project = await prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true } },
        milestones: { orderBy: { dueDate: 'asc' } },
        tasks: {
          where:   { deletedAt: null },
          orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
          include: {
            assignee: { select: { id: true, name: true, avatarUrl: true } },
            taskTags: {
              include: { tag: { select: { id: true, name: true, color: true } } },
            },
          },
        },
      },
    });

    if (!project) return err(res, '找不到此專案', 404);

    // 格式化任務
    const tasks = project.tasks.map(t => ({
      id:             t.id,
      title:          t.title,
      description:    t.description,
      status:         t.status,
      priority:       t.priority,
      priorityLabel:  PRIORITY_LABEL[t.priority] || t.priority,
      estimatedHours: t.estimatedHours ? parseFloat(t.estimatedHours.toString()) : null,
      actualHours:    t.actualHours    ? parseFloat(t.actualHours.toString())    : null,
      dueDate:        t.dueDate,
      assignee:       t.assignee,
      tags:           t.taskTags.map(tt => tt.tag),
      createdAt:      t.createdAt,
    }));

    // 依狀態分組（看板視圖用）
    const kanban = {
      todo:        tasks.filter(t => t.status === 'todo'),
      in_progress: tasks.filter(t => t.status === 'in_progress'),
      review:      tasks.filter(t => t.status === 'review'),
      done:        tasks.filter(t => t.status === 'done'),
    };

    ok(res, {
      id:          project.id,
      name:        project.name,
      description: project.description,
      status:      project.status,
      statusLabel: STATUS_LABEL[project.status] || project.status,
      budget:      project.budget ? parseFloat(project.budget.toString()) : null,
      startDate:   project.startDate,
      endDate:     project.endDate,
      owner:       project.owner,
      milestones:  project.milestones,
      tasks,
      kanban,
      stats: {
        total:      tasks.length,
        todo:       kanban.todo.length,
        in_progress: kanban.in_progress.length,
        review:     kanban.review.length,
        done:       kanban.done.length,
        completion: tasks.length > 0
          ? Math.round((kanban.done.length / tasks.length) * 100) : 0,
      },
    });
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// PATCH /api/projects/:id
// 更新專案資訊
// ════════════════════════════════════════════════════════════
router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return err(res, '無效的專案 ID', 400);

  const { name, description, status, budget, startDate, endDate } = req.body;

  try {
    const data = {};
    if (name        !== undefined) data.name        = name.trim();
    if (description !== undefined) data.description = description;
    if (status      !== undefined) data.status      = status;
    if (budget      !== undefined) data.budget      = budget ? parseFloat(budget) : null;
    if (startDate   !== undefined) data.startDate   = startDate ? new Date(startDate) : null;
    if (endDate     !== undefined) data.endDate     = endDate   ? new Date(endDate)   : null;

    const project = await prisma.project.update({
      where: { id },
      data,
      include: { owner: { select: { id: true, name: true } } },
    });

    ok(res, project);
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/projects/:id/tasks
// 取得專案的任務列表
// ════════════════════════════════════════════════════════════
router.get('/:id/tasks', async (req, res) => {
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return err(res, '無效的專案 ID', 400);

  try {
    const tasks = await prisma.task.findMany({
      where:   { projectId, deletedAt: null },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }],
      include: {
        assignee: { select: { id: true, name: true } },
        taskTags: { include: { tag: true } },
      },
    });

    ok(res, tasks.map(t => ({
      ...t,
      estimatedHours: t.estimatedHours ? parseFloat(t.estimatedHours.toString()) : null,
      actualHours:    t.actualHours    ? parseFloat(t.actualHours.toString())    : null,
      tags:           t.taskTags.map(tt => tt.tag),
    })));
  } catch (e) {
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/projects/:id/tasks
// 在專案下建立任務
// ════════════════════════════════════════════════════════════
router.post('/:id/tasks', async (req, res) => {
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return err(res, '無效的專案 ID', 400);

  const {
    title, description = '',
    priority = 'medium',
    estimatedHours, dueDate, assigneeId,
  } = req.body;

  if (!title?.trim()) return err(res, '任務標題為必填', 400);

  try {
    // 取得同狀態最大 position，新任務排在最後
    const maxPos = await prisma.task.aggregate({
      where:   { projectId, status: 'todo' },
      _max:    { position: true },
    });

    const task = await prisma.task.create({
      data: {
        projectId,
        title:          title.trim(),
        description,
        priority,
        status:         'todo',
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        dueDate:        dueDate ? new Date(dueDate) : null,
        assigneeId:     assigneeId ? parseInt(assigneeId) : null,
        position:       (maxPos._max.position || 0) + 1,
      },
      include: {
        assignee: { select: { id: true, name: true } },
      },
    });

    ok(res, {
      ...task,
      estimatedHours: task.estimatedHours ? parseFloat(task.estimatedHours.toString()) : null,
    });
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// PATCH /api/tasks/:taskId
// 更新任務（狀態、優先度、指派人、截止日）
// ════════════════════════════════════════════════════════════
router.patch('/tasks/:taskId', async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  if (isNaN(taskId)) return err(res, '無效的任務 ID', 400);

  const { title, status, priority, assigneeId, dueDate, description } = req.body;

  try {
    const data = {};
    if (title       !== undefined) data.title       = title.trim();
    if (description !== undefined) data.description = description;
    if (status      !== undefined) {
      data.status = status;
      if (status === 'in_progress' && !data.startedAt) data.startedAt = new Date();
      if (status === 'done') data.completedAt = new Date();
    }
    if (priority    !== undefined) data.priority    = priority;
    if (assigneeId  !== undefined) data.assigneeId  = assigneeId ? parseInt(assigneeId) : null;
    if (dueDate     !== undefined) data.dueDate     = dueDate ? new Date(dueDate) : null;

    const task = await prisma.task.update({
      where:   { id: taskId },
      data,
      include: { assignee: { select: { id: true, name: true } } },
    });

    ok(res, {
      ...task,
      estimatedHours: task.estimatedHours ? parseFloat(task.estimatedHours.toString()) : null,
    });
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

module.exports = router;
