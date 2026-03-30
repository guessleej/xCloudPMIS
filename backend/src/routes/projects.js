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
const { taskController } = require('../controllers/task.controller');
const { taskRuleEngine } = require('../services/taskRuleEngine');
const {
  createTaskAssignmentNotifications,
  createTaskCommentNotifications,
} = require('../services/notificationCenter');
const prisma = new PrismaClient();

// ── 小工具 ──────────────────────────────────────────────────
const ok  = (res, data, meta = {}) =>
  res.json({ success: true, data, meta, timestamp: new Date().toISOString() });

// ── 健康度計算 ────────────────────────────────────────────────
// manualOverride: 有值 = 手動覆寫；null/undefined = 自動計算
function calcHealth(dueDate, status, manualOverride) {
  if (status === 'done' || status === 'cancelled') return null;
  if (manualOverride) return manualOverride;          // 手動覆寫優先
  if (!dueDate) return 'on_track';
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(dueDate); due.setHours(0,0,0,0);
  const diff  = Math.round((due - today) / 86400000);
  if (diff < 0)  return 'off_track';
  if (diff <= 3) return 'at_risk';
  return 'on_track';
}

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

const TASK_STATUSES = new Set(['todo', 'in_progress', 'review', 'done', 'completed']);
const normalizeTaskStatus = (status, fallback = 'todo') => {
  if (!status) return fallback;
  if (!TASK_STATUSES.has(status)) return fallback;
  return status === 'completed' ? 'done' : status;
};

// ════════════════════════════════════════════════════════════
// GET /api/projects?companyId=2
// 取得所有專案，含任務統計數字
// ════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  const companyId = req.user?.companyId || parseInt(req.query.companyId);

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
        access:       p.access,              // ← 隱私設定
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
  const companyId = req.user?.companyId || parseInt(req.body.companyId);
  const {
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
  const companyId  = req.user?.companyId || parseInt(req.query.companyId);
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
        projectId:    { in: projectIds },
        deletedAt:    null,
        parentTaskId: null,          // 排除子任務，只取頂層任務
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
        assignee:     { select: { id: true, name: true } },
        project:      { select: { id: true, name: true } },
        taskTags:     { include: { tag: { select: { id: true, name: true, color: true } } } },
        taskProjects: { include: { project: { select: { id: true, name: true } } } },
        _count:       { select: { subtasks: true, comments: true, dependencies: true } },
      },
    });

    const formatted = tasks.map(t => ({
      id:             t.id,
      title:          t.title,
      description:    t.description,
      status:         t.status,
      priority:       t.priority,
      healthStatus:   calcHealth(t.dueDate, t.status, t.healthStatus),
      estimatedHours: t.estimatedHours ? parseFloat(t.estimatedHours.toString()) : null,
      actualHours:    t.actualHours    ? parseFloat(t.actualHours.toString())    : null,
      dueDate:        t.dueDate,
      startedAt:      t.startedAt,
      completedAt:    t.completedAt,
      parentTaskId:   t.parentTaskId,
      progressPercent: t.progressPercent || 0,
      numSubtasks:    t._count?.subtasks || 0,
      commentCount:   t._count?.comments || 0,
      depCount:       t._count?.dependencies || 0,
      assignee:       t.assignee,
      project:        t.project,
      tags:           t.taskTags.map(tt => tt.tag),
      extraProjects:  t.taskProjects.map(tp => ({
        id: tp.project.id,
        name: tp.project.name,
        color: 'var(--xc-surface-muted)',
      })),
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
  const companyId = req.user?.companyId || parseInt(req.query.companyId);
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
            _count:   { select: { subtasks: true } },
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
      parentTaskId:   t.parentTaskId,
      progressPercent: t.progressPercent || 0,
      numSubtasks:    t._count?.subtasks || 0,
      assignee:       t.assignee,
      tags:           t.taskTags.map(tt => tt.tag),
      createdAt:      t.createdAt,
    }));

    // 依狀態分組（看板視圖用）— 只取頂層任務，子任務不顯示為獨立卡片
    const topLevelTasks = tasks.filter(t => !t.parentTaskId);
    const kanban = {
      todo:        topLevelTasks.filter(t => t.status === 'todo'),
      in_progress: topLevelTasks.filter(t => t.status === 'in_progress'),
      review:      topLevelTasks.filter(t => t.status === 'review'),
      done:        topLevelTasks.filter(t => t.status === 'done'),
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

  const { name, description, status, access, budget, startDate, endDate, ownerId } = req.body;

  try {
    const data = {};
    if (name        !== undefined) data.name        = name.trim();
    if (description !== undefined) data.description = description;
    if (status      !== undefined) data.status      = status;
    if (access      !== undefined) data.access      = access;   // ← 隱私設定
    if (budget      !== undefined) data.budget      = budget ? parseFloat(budget) : null;
    if (startDate   !== undefined) data.startDate   = startDate ? new Date(startDate) : null;
    if (endDate     !== undefined) data.endDate     = endDate   ? new Date(endDate)   : null;
    if (ownerId     !== undefined) data.ownerId     = ownerId   ? parseInt(ownerId)   : null;

    if (Object.keys(data).length === 0) return err(res, '沒有要更新的欄位', 400);

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
// DELETE /api/projects/:id
// 軟刪除專案（設定 deletedAt，不實際移除資料）
// ════════════════════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return err(res, '無效的專案 ID', 400);

  try {
    // 確認專案存在且尚未刪除
    const existing = await prisma.project.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return err(res, `找不到專案 #${id}`, 404);

    await prisma.project.update({
      where: { id },
      data:  { deletedAt: new Date() },
    });

    res.json({ success: true, message: `專案「${existing.name}」已刪除` });
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
      where: { projectId, deletedAt: null },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        _count:   { select: { subtasks: true, comments: true } },
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
      planStart:      t.planStart,
      planEnd:        t.planEnd,
      startedAt:      t.startedAt,
      completedAt:    t.completedAt,
      parentTaskId:   t.parentTaskId,
      progressPercent: t.progressPercent || 0,
      numSubtasks:    t._count?.subtasks || 0,
      commentCount:   t._count?.comments || 0,
      assignee:       t.assignee,
      tags:           t.taskTags.map(tt => tt.tag),
    }));

    ok(res, formatted, { total: formatted.length, projectId });
  } catch (e) {
    console.error('[GET /:id/tasks]', e);
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
    estimatedHours, dueDate, assigneeId, parentTaskId,
  } = req.body;

  if (!title?.trim()) return err(res, '任務標題為必填', 400);
  if (parentTaskId !== undefined && parentTaskId !== null && Number.isNaN(parseInt(parentTaskId))) {
    return err(res, '無效的父任務 ID', 400);
  }

  try {
    const normalizedStatus = normalizeTaskStatus(req.body.status, 'todo');
    const normalizedAssigneeId = assigneeId ? parseInt(assigneeId) : null;
    const normalizedParentTaskId = parentTaskId ? parseInt(parentTaskId) : null;
    const actorId = req.user?.id ? parseInt(req.user.id, 10) : (req.user?.userId ? parseInt(req.user.userId, 10) : null);

    // 取得同狀態最大 position，新任務排在最後
    const maxPos = await prisma.task.aggregate({
      where:   { projectId, status: normalizedStatus },
      _max:    { position: true },
    });

    const nextPosition = (maxPos._max.position || 0) + 1;
    const task = await prisma.$transaction(async (tx) => {
      const createdTask = await tx.task.create({
        data: {
          projectId,
          createdById: actorId,
          title:          title.trim(),
          description,
          priority,
          status:         normalizedStatus,
          estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
          dueDate:        dueDate ? new Date(dueDate) : null,
          assigneeId:     normalizedAssigneeId,
          parentTaskId:   normalizedParentTaskId,
          position:       nextPosition,
          startedAt:      normalizedStatus === 'in_progress' ? new Date() : null,
          completedAt:    normalizedStatus === 'done' ? new Date() : null,
          progressPercent: normalizedStatus === 'done' ? 100 : 0,
        },
      });

      await tx.taskProject.upsert({
        where: {
          taskId_projectId: {
            taskId: createdTask.id,
            projectId,
          },
        },
        update: {
          position: nextPosition,
          isPrimary: true,
          ...(actorId ? { addedById: actorId } : {}),
        },
        create: {
          taskId: createdTask.id,
          projectId,
          position: nextPosition,
          isPrimary: true,
          ...(actorId ? { addedById: actorId } : {}),
        },
      });

      if (normalizedAssigneeId) {
        await tx.taskAssigneeLink.upsert({
          where: {
            taskId_userId: {
              taskId: createdTask.id,
              userId: normalizedAssigneeId,
            },
          },
          update: {
            isPrimary: true,
            ...(actorId ? { assignedById: actorId } : {}),
          },
          create: {
            taskId: createdTask.id,
            userId: normalizedAssigneeId,
            isPrimary: true,
            ...(actorId ? { assignedById: actorId } : {}),
          },
        });

        await tx.projectMember.upsert({
          where: {
            projectId_userId: {
              projectId,
              userId: normalizedAssigneeId,
            },
          },
          update: {},
          create: {
            projectId,
            userId: normalizedAssigneeId,
            role: 'editor',
          },
        });
      }

      return tx.task.findUnique({
        where: { id: createdTask.id },
        include: {
          assignee: { select: { id: true, name: true } },
          _count:   { select: { subtasks: true } },
        },
      });
    });

    ok(res, {
      ...task,
      estimatedHours: task.estimatedHours ? parseFloat(task.estimatedHours.toString()) : null,
      progressPercent: task.progressPercent || 0,
      numSubtasks: task._count?.subtasks || 0,
    });

    if (normalizedAssigneeId) {
      createTaskAssignmentNotifications(prisma, {
        taskId: task.id,
        projectId,
        recipientId: normalizedAssigneeId,
        actorId,
      }).catch((error) => {
        console.warn(`[projects] 建立任務指派通知失敗 task=${task.id}: ${error.message}`);
      });
    }
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

  const { title, status, priority, assigneeId, dueDate, description, planStart, planEnd,
          customFieldValues, projectIds } = req.body;

  try {
    const existingTask = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        parentTaskId: true,
        projectId: true,
        assigneeId: true,
      },
    });

    if (!existingTask) return err(res, `找不到任務 #${taskId}`, 404);

    const actorId = req.user?.id ? parseInt(req.user.id, 10) : (req.user?.userId ? parseInt(req.user.userId, 10) : null);
    const normalizedAssigneeId = assigneeId !== undefined
      ? (assigneeId ? parseInt(assigneeId) : null)
      : undefined;
    const data = {};
    if (title       !== undefined) data.title       = title.trim();
    if (description !== undefined) data.description = description;
    if (status      !== undefined) {
      const normalizedStatus = normalizeTaskStatus(status, existingTask.status);
      data.status = normalizedStatus;
      if (normalizedStatus === 'in_progress' && !data.startedAt) data.startedAt = new Date();
      if (normalizedStatus === 'done') {
        data.completedAt = new Date();
        data.progressPercent = 100;
      }
      if (existingTask.status === 'done' && normalizedStatus !== 'done') {
        data.completedAt = null;
        data.progressPercent = 0;
      }
    }
    if (priority    !== undefined) data.priority    = priority;
    if (assigneeId  !== undefined) data.assigneeId  = normalizedAssigneeId;
    if (dueDate     !== undefined) data.dueDate     = dueDate ? new Date(dueDate) : null;
    if (planStart   !== undefined) data.planStart   = planStart ? new Date(planStart) : null;
    if (planEnd     !== undefined) data.planEnd     = planEnd   ? new Date(planEnd)   : null;

    const task = await prisma.$transaction(async (tx) => {
      const updatedTask = await tx.task.update({
        where:   { id: taskId },
        data,
        include: {
          assignee: { select: { id: true, name: true } },
          _count:   { select: { subtasks: true } },
        },
      });

      if (assigneeId !== undefined) {
        await tx.taskAssigneeLink.updateMany({
          where: {
            taskId,
            isPrimary: true,
          },
          data: { isPrimary: false },
        });

        if (normalizedAssigneeId) {
          await tx.taskAssigneeLink.upsert({
            where: {
              taskId_userId: {
                taskId,
                userId: normalizedAssigneeId,
              },
            },
            update: {
              isPrimary: true,
              ...(actorId ? { assignedById: actorId } : {}),
            },
            create: {
              taskId,
              userId: normalizedAssigneeId,
              isPrimary: true,
              ...(actorId ? { assignedById: actorId } : {}),
            },
          });

          if (updatedTask.projectId) {
            await tx.projectMember.upsert({
              where: {
                projectId_userId: {
                  projectId: updatedTask.projectId,
                  userId: normalizedAssigneeId,
                },
              },
              update: {},
              create: {
                projectId: updatedTask.projectId,
                userId: normalizedAssigneeId,
                role: 'editor',
              },
            });
          }
        }
      }

      // ── 自訂欄位值 upsert ───────────────────────────────
      if (customFieldValues && typeof customFieldValues === 'object' && !Array.isArray(customFieldValues)) {
        for (const [defId, value] of Object.entries(customFieldValues)) {
          const definitionId = parseInt(defId);
          if (isNaN(definitionId)) continue;
          const serialized = (value === null || value === undefined)
            ? null
            : JSON.stringify(value);
          await tx.customFieldValue.upsert({
            where: { definitionId_taskId: { definitionId, taskId } },
            update: { textValue: serialized },
            create: { definitionId, taskId, textValue: serialized },
          });
        }
      }

      // ── 多專案歸屬 sync ─────────────────────────────────
      if (Array.isArray(projectIds)) {
        const primaryProjectId = updatedTask.projectId;
        const extraIds = projectIds
          .map(pid => parseInt(pid))
          .filter(pid => !isNaN(pid) && pid !== primaryProjectId);

        // 清除現有的多專案連結，再重建
        await tx.taskProject.deleteMany({ where: { taskId } });
        if (extraIds.length > 0) {
          await tx.taskProject.createMany({
            data: extraIds.map(projectId => ({ taskId, projectId })),
            skipDuplicates: true,
          });
        }
      }

      return updatedTask;
    });

    const automation = await taskRuleEngine.handleTaskUpdated({
      beforeTask: existingTask,
      afterTask: {
        id: task.id,
        title: task.title,
        status: task.status,
        parentTaskId: task.parentTaskId,
        projectId: task.projectId,
        assigneeId: task.assigneeId,
      },
      actorId,
    });

    ok(res, {
      ...task,
      estimatedHours: task.estimatedHours ? parseFloat(task.estimatedHours.toString()) : null,
      progressPercent: task.progressPercent || 0,
      numSubtasks: task._count?.subtasks || 0,
      automation,
    });

    if (normalizedAssigneeId && normalizedAssigneeId !== existingTask.assigneeId) {
      createTaskAssignmentNotifications(prisma, {
        taskId: task.id,
        projectId: task.projectId,
        recipientId: normalizedAssigneeId,
        actorId,
      }).catch((error) => {
        console.warn(`[projects] 更新任務指派通知失敗 task=${task.id}: ${error.message}`);
      });
    }
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// DELETE /api/projects/tasks/:taskId
// 軟刪除任務（設定 deletedAt，不實際移除資料）
// ════════════════════════════════════════════════════════════
router.delete('/tasks/:taskId', async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  if (isNaN(taskId)) return err(res, '無效的任務 ID', 400);

  try {
    const existing = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!existing) return err(res, `找不到任務 #${taskId}`, 404);

    await prisma.task.update({
      where: { id: taskId },
      data:  { deletedAt: new Date() },
    });

    res.json({ success: true, message: `任務「${existing.title}」已刪除` });
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/projects/tasks/:taskId/comments
// 取得任務評論清單
// ════════════════════════════════════════════════════════════
router.get('/tasks/:taskId/comments', async (req, res) => {
  const taskId = parseInt(req.params.taskId, 10);
  if (isNaN(taskId)) return err(res, '無效的任務 ID', 400);

  try {
    const comments = await prisma.comment.findMany({
      where: {
        taskId,
        deletedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mentionIds = [...new Set(
      comments.flatMap((comment) => Array.isArray(comment.mentions) ? comment.mentions : [])
        .map((id) => parseInt(id, 10))
        .filter(Boolean)
    )];
    const mentionedUsers = mentionIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: mentionIds } },
          select: { id: true, name: true },
        })
      : [];
    const mentionMap = new Map(mentionedUsers.map((user) => [user.id, user]));

    ok(res, comments.map((comment) => ({
      id: comment.id,
      text: comment.content,
      author: comment.user?.name || '未知成員',
      authorId: comment.userId,
      ts: comment.createdAt.toISOString(),
      parentId: comment.parentId,
      mentions: (Array.isArray(comment.mentions) ? comment.mentions : [])
        .map((id) => mentionMap.get(parseInt(id, 10)))
        .filter(Boolean),
    })));
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/projects/tasks/:taskId/comments
// 新增任務評論，並建立留言 / @提及 通知
// ════════════════════════════════════════════════════════════
router.post('/tasks/:taskId/comments', async (req, res) => {
  const taskId = parseInt(req.params.taskId, 10);
  const parentId = req.body.parentId ? parseInt(req.body.parentId, 10) : null;
  const content = String(req.body.content || '').trim();
  const authorId = req.user?.id ? parseInt(req.user.id, 10) : (req.user?.userId ? parseInt(req.user.userId, 10) : parseInt(req.body.userId || '0', 10));

  if (isNaN(taskId)) return err(res, '無效的任務 ID', 400);
  if (!content) return err(res, '留言內容為必填', 400);
  if (!authorId) return err(res, '需要登入後才能留言', 401);

  try {
    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      include: {
        project: {
          select: { id: true, companyId: true },
        },
      },
    });
    if (!task) return err(res, `找不到任務 #${taskId}`, 404);

    const companyUsers = await prisma.user.findMany({
      where: {
        companyId: task.project.companyId,
        isActive: true,
      },
      select: { id: true, name: true },
    });
    const mentionIds = companyUsers
      .filter((user) => content.includes(`@${user.name}`))
      .map((user) => user.id);

    const comment = await prisma.comment.create({
      data: {
        taskId,
        userId: authorId,
        parentId,
        content,
        mentions: mentionIds,
      },
      include: {
        user: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    createTaskCommentNotifications(prisma, {
      taskId,
      authorId,
      content,
      commentId: comment.id,
      parentId,
    }).catch((error) => {
      console.warn(`[projects] 建立評論通知失敗 comment=${comment.id}: ${error.message}`);
    });

    ok(res, {
      id: comment.id,
      text: comment.content,
      author: comment.user?.name || '未知成員',
      authorId: comment.userId,
      ts: comment.createdAt.toISOString(),
      parentId: comment.parentId,
      mentions: companyUsers.filter((user) => mentionIds.includes(user.id)),
    });
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/projects/tasks/:taskId/custom-field-values
// 取得任務的自訂欄位值（回傳 { [definitionId]: value } 物件）
// ════════════════════════════════════════════════════════════
router.get('/tasks/:taskId/custom-field-values', async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  if (isNaN(taskId)) return err(res, '無效的任務 ID', 400);

  try {
    const values = await prisma.customFieldValue.findMany({
      where: { taskId },
    });
    const map = {};
    for (const v of values) {
      try {
        map[v.definitionId] = v.textValue !== null && v.textValue !== undefined
          ? JSON.parse(v.textValue)
          : null;
      } catch {
        map[v.definitionId] = v.textValue;
      }
    }
    ok(res, map);
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/projects/tasks/:taskId/checklist
// 取得任務的待辦清單項目
// ════════════════════════════════════════════════════════════
router.get('/tasks/:taskId/checklist', async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  if (isNaN(taskId)) return err(res, '無效的任務 ID', 400);

  try {
    const items = await prisma.checklistItem.findMany({
      where:   { taskId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    ok(res, items, { total: items.length });
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/projects/tasks/:taskId/checklist
// 新增待辦清單項目
// ════════════════════════════════════════════════════════════
router.post('/tasks/:taskId/checklist', async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  if (isNaN(taskId)) return err(res, '無效的任務 ID', 400);

  const { title } = req.body;
  if (!title?.trim()) return err(res, '項目標題為必填', 400);

  try {
    // 計算下一個 position
    const maxPos = await prisma.checklistItem.aggregate({
      where: { taskId },
      _max:  { position: true },
    });

    const item = await prisma.checklistItem.create({
      data: {
        taskId,
        title:    title.trim(),
        isDone:   false,
        position: (maxPos._max.position || 0) + 1,
      },
    });
    ok(res, item);
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// PATCH /api/projects/tasks/:taskId/checklist/:itemId
// 更新待辦清單項目（勾選完成 / 修改標題）
// ════════════════════════════════════════════════════════════
router.patch('/tasks/:taskId/checklist/:itemId', async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  const itemId = parseInt(req.params.itemId);
  if (isNaN(taskId) || isNaN(itemId)) return err(res, '無效的 ID', 400);

  const { title, isDone } = req.body;

  try {
    const existing = await prisma.checklistItem.findFirst({
      where: { id: itemId, taskId },
    });
    if (!existing) return err(res, '找不到此項目', 404);

    const data = {};
    if (title  !== undefined) data.title  = title.trim();
    if (isDone !== undefined) data.isDone = Boolean(isDone);

    const updated = await prisma.checklistItem.update({
      where: { id: itemId },
      data,
    });
    ok(res, updated);
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// DELETE /api/projects/tasks/:taskId/checklist/:itemId
// 刪除待辦清單項目
// ════════════════════════════════════════════════════════════
router.delete('/tasks/:taskId/checklist/:itemId', async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  const itemId = parseInt(req.params.itemId);
  if (isNaN(taskId) || isNaN(itemId)) return err(res, '無效的 ID', 400);

  try {
    const existing = await prisma.checklistItem.findFirst({
      where: { id: itemId, taskId },
    });
    if (!existing) return err(res, '找不到此項目', 404);

    await prisma.checklistItem.delete({ where: { id: itemId } });
    res.json({ success: true, message: '項目已刪除' });
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/projects/:projectId/milestones
// 取得專案里程碑列表
// ════════════════════════════════════════════════════════════
router.get('/:projectId/milestones', async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) return err(res, '無效的專案 ID', 400);

  try {
    const milestones = await prisma.milestone.findMany({
      where: { projectId },
      orderBy: { dueDate: 'asc' },
    });
    return ok(res, milestones);
  } catch (e) {
    console.error('[milestones GET]', e);
    return err(res, '伺服器錯誤');
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/projects/:projectId/milestones
// 新增里程碑
// ════════════════════════════════════════════════════════════
router.post('/:projectId/milestones', async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) return err(res, '無效的專案 ID', 400);

  const { name, dueDate, description, color } = req.body;
  if (!name?.trim()) return err(res, '里程碑名稱為必填', 400);

  const VALID_COLORS = ['green', 'yellow', 'red'];

  try {
    const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!project) return err(res, '找不到此專案', 404);

    const milestone = await prisma.milestone.create({
      data: {
        projectId,
        name:        name.trim(),
        dueDate:     dueDate     ? new Date(dueDate) : null,
        description: description || '',
        color:       VALID_COLORS.includes(color) ? color : 'green',
        isAchieved:  false,
      },
    });
    ok(res, milestone);
  } catch (e) {
    console.error('[milestones POST]', e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// PATCH /api/projects/milestones/:milestoneId
// 更新里程碑（名稱、到期日、顏色、說明、是否達成）
// ════════════════════════════════════════════════════════════
router.patch('/milestones/:milestoneId', async (req, res) => {
  const milestoneId = parseInt(req.params.milestoneId);
  if (isNaN(milestoneId)) return err(res, '無效的里程碑 ID', 400);

  const { name, dueDate, color, description, isAchieved } = req.body;

  try {
    const existing = await prisma.milestone.findUnique({ where: { id: milestoneId } });
    if (!existing) return err(res, `找不到里程碑 #${milestoneId}`, 404);

    const data = {};
    if (name        !== undefined) data.name        = name.trim();
    if (dueDate     !== undefined) data.dueDate     = dueDate ? new Date(dueDate) : null;
    if (color       !== undefined) data.color       = color;
    if (description !== undefined) data.description = description;
    if (isAchieved  !== undefined) {
      data.isAchieved = Boolean(isAchieved);
      // 標為達成且原本未記錄達成時間 → 自動補上時間戳
      if (Boolean(isAchieved) && !existing.achievedAt) data.achievedAt = new Date();
      // 取消達成 → 清除達成時間
      if (!Boolean(isAchieved)) data.achievedAt = null;
    }

    const updated = await prisma.milestone.update({ where: { id: milestoneId }, data });
    ok(res, updated);
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// DELETE /api/projects/milestones/:milestoneId
// 刪除里程碑（里程碑無 deletedAt，直接硬刪除）
// ════════════════════════════════════════════════════════════
router.delete('/milestones/:milestoneId', async (req, res) => {
  const milestoneId = parseInt(req.params.milestoneId);
  if (isNaN(milestoneId)) return err(res, '無效的里程碑 ID', 400);

  try {
    const existing = await prisma.milestone.findUnique({
      where:  { id: milestoneId },
      select: { id: true, name: true },
    });
    if (!existing) return err(res, `找不到里程碑 #${milestoneId}`, 404);

    await prisma.milestone.delete({ where: { id: milestoneId } });
    res.json({ success: true, message: `里程碑「${existing.name}」已刪除` });
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

module.exports = router;
