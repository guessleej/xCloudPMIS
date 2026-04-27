/**
 * /api/my-tasks — 個人任務 CRUD API
 *
 * GET    /api/my-tasks              → 取得我的任務列表（從 JWT 取 userId）
 * GET    /api/my-tasks/:id          → 取得單筆任務詳情（含評論、清單）
 * PATCH  /api/my-tasks/:id          → 更新任務（狀態/優先度/截止日/標題/說明）
 * DELETE /api/my-tasks/:id          → 軟刪除任務
 */

const express = require('express');
const router  = express.Router();
const prisma = require('../lib/prisma');

const ok  = (res, data, meta = {}) => res.json({ success: true, data, meta, timestamp: new Date().toISOString() });
const err = (res, msg, status = 500) => res.status(status).json({ success: false, error: msg });

const TASK_STATUS_SET = new Set(['todo', 'in_progress', 'review', 'done', 'cancelled']);

function normalizeStatus(s, fallback = 'todo') {
  if (!s) return fallback;
  if (s === 'completed') return 'done';
  return TASK_STATUS_SET.has(s) ? s : fallback;
}

function calcHealth(dueDate, status) {
  if (status === 'done' || status === 'cancelled') return null;
  if (!dueDate) return 'on_track';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(dueDate); due.setHours(0, 0, 0, 0);
  const diff  = Math.round((due - today) / 86400000);
  if (diff < 0)  return 'off_track';
  if (diff <= 3) return 'at_risk';
  return 'on_track';
}

const ACTIVITY_FIELD_LABELS = {
  title: '任務標題',
  description: '任務說明',
  status: '任務狀態',
  priority: '優先度',
  dueDate: '截止日期',
  dueEndDate: '結束日期',
  dueTime: '開始時間',
  dueEndTime: '結束時間',
};

function toActivityValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toISOString === 'function') return value.toISOString();
  if (value === undefined) return null;
  return value;
}

function normalizeActivityDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function activityValuesEqual(field, left, right) {
  if (['dueDate', 'dueEndDate'].includes(field)) {
    return normalizeActivityDate(left) === normalizeActivityDate(right);
  }
  return String(left ?? '') === String(right ?? '');
}

async function createActivityLog(tx, { taskId, userId, action, oldValue = null, newValue = null }) {
  if (!taskId || !userId) return;
  await tx.activityLog.create({ data: { taskId, userId, action, oldValue, newValue } });
}

function buildActivityLogs(before, data) {
  return Object.keys(ACTIVITY_FIELD_LABELS)
    .filter((field) => Object.prototype.hasOwnProperty.call(data, field))
    .filter((field) => !activityValuesEqual(field, before[field], data[field]))
    .map((field) => ({
      action: `${field}_changed`,
      oldValue: { field, label: ACTIVITY_FIELD_LABELS[field], value: toActivityValue(before[field]) },
      newValue: { field, label: ACTIVITY_FIELD_LABELS[field], value: toActivityValue(data[field]) },
    }));
}

function formatTask(t) {
  const dueDateStr = t.dueDate ? t.dueDate.toISOString().split('T')[0] : null;
  return {
    id:              t.id,
    title:           t.title,
    description:     t.description || '',
    status:          t.status,
    priority:        t.priority,
    healthStatus:    t.healthStatus ?? calcHealth(t.dueDate, t.status),
    dueDate:         dueDateStr,
    dueEndDate:      t.dueEndDate ? t.dueEndDate.toISOString().split('T')[0] : null,
    dueTime:         t.dueTime || null,
    dueEndTime:      t.dueEndTime || null,
    progressPercent: t.progressPercent ?? 0,
    project:         t.project  ? { id: t.project.id, name: t.project.name }   : null,
    assignee:        t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null,
    createdAt:       t.createdAt    ? t.createdAt.toISOString()    : null,
    completedAt:     t.completedAt  ? t.completedAt.toISOString()  : null,
    updatedAt:       t.updatedAt    ? t.updatedAt.toISOString()     : null,
  };
}

// ══════════════════════════════════════════════════════════════
// GET /api/my-tasks
// 取得當前登入使用者的所有任務
// ══════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  const userId    = parseInt(req.user?.id || req.user?.userId || req.query.userId || '0');
  const companyId = parseInt(req.user?.companyId || req.query.companyId || '0');
  if (!userId) return err(res, '需要登入', 401);

  try {
    // 取出所屬公司的專案 IDs
    const projectIds = companyId
      ? (await prisma.project.findMany({ where: { companyId, deletedAt: null }, select: { id: true } })).map(p => p.id)
      : undefined;

    const where = {
      deletedAt:  null,
      assigneeId: userId,
      ...(projectIds ? { projectId: { in: projectIds } } : {}),
    };

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
      include: {
        assignee: { select: { id: true, name: true } },
        project:  { select: { id: true, name: true } },
      },
    });

    return ok(res, tasks.map(formatTask), { total: tasks.length });
  } catch (e) {
    console.error('[my-tasks GET /]', e.message);
    return err(res, e.message);
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/my-tasks/:id
// 取得單筆任務詳情（含評論、清單）
// ══════════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  const id     = parseInt(req.params.id);
  const userId = parseInt(req.user?.id || req.user?.userId || '0');
  if (isNaN(id)) return err(res, '無效的任務 ID', 400);

  try {
    const task = await prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: {
        assignee:       { select: { id: true, name: true } },
        project:        { select: { id: true, name: true } },
        comments:       {
          where:   { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, name: true } } },
        },
        checklistItems: { orderBy: { position: 'asc' } },
      },
    });

    if (!task) return err(res, '找不到任務', 404);

    return ok(res, {
      ...formatTask(task),
      comments:  task.comments,
      checklist: task.checklistItems,
    });
  } catch (e) {
    console.error('[my-tasks GET /:id]', e.message);
    return err(res, e.message);
  }
});

// ══════════════════════════════════════════════════════════════
// PATCH /api/my-tasks/:id
// 更新任務欄位（狀態/優先度/截止日/標題/說明）
// ══════════════════════════════════════════════════════════════
router.patch('/:id', async (req, res) => {
  const id     = parseInt(req.params.id);
  const userId = parseInt(req.user?.id || req.user?.userId || '0');
  if (isNaN(id)) return err(res, '無效的任務 ID', 400);

  const { title, description, status, priority, dueDate, dueEndDate, dueTime, dueEndTime } = req.body;

  try {
    const existing = await prisma.task.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return err(res, '找不到任務', 404);

    const data = {};
    if (title       !== undefined) data.title       = String(title).trim();
    if (description !== undefined) data.description = description;
    if (priority    !== undefined) data.priority    = priority;
    if (dueDate     !== undefined) data.dueDate     = dueDate ? new Date(dueDate) : null;
    if (dueEndDate  !== undefined) data.dueEndDate  = dueEndDate ? new Date(dueEndDate) : null;
    if (dueTime     !== undefined) data.dueTime     = dueTime || null;
    if (dueEndTime  !== undefined) data.dueEndTime  = dueEndTime || null;
    if (status      !== undefined) {
      const s = normalizeStatus(status, existing.status);
      data.status = s;
      if (s === 'in_progress' && existing.status !== 'in_progress') data.startedAt    = new Date();
      if (s === 'done')  { data.completedAt = new Date();  data.progressPercent = 100; }
      if (existing.status === 'done' && s !== 'done') { data.completedAt = null; data.progressPercent = 0; }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const task = await tx.task.update({
        where:   { id },
        data,
        include: {
          assignee: { select: { id: true, name: true } },
          project:  { select: { id: true, name: true } },
        },
      });
      for (const log of buildActivityLogs(existing, data)) {
        await createActivityLog(tx, { taskId: id, userId, ...log });
      }
      return task;
    });

    return ok(res, formatTask(updated));
  } catch (e) {
    console.error('[my-tasks PATCH /:id]', e.message);
    return err(res, e.message);
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE /api/my-tasks/:id
// 軟刪除任務（設 deletedAt，不實際移除）
// ══════════════════════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
  const id     = parseInt(req.params.id);
  const userId = parseInt(req.user?.id || req.user?.userId || '0');
  if (isNaN(id)) return err(res, '無效的任務 ID', 400);

  try {
    const existing = await prisma.task.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return err(res, '找不到任務', 404);

    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id },
        data:  { deletedAt: new Date() },
      });
      await createActivityLog(tx, {
        taskId: id,
        userId,
        action: 'task_deleted',
        oldValue: { title: existing.title },
      });
    });

    return ok(res, { id, deleted: true });
  } catch (e) {
    console.error('[my-tasks DELETE /:id]', e.message);
    return err(res, e.message);
  }
});

module.exports = router;
