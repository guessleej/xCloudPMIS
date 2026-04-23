/**
 * 專案管理 API 路由
 *
 * GET    /api/projects              取得專案列表（含任務統計）
 *        ?includeDeleted=true       包含已封存（軟刪除）的專案
 *        ?onlyDeleted=true          僅回傳已封存的專案
 * POST   /api/projects              建立新專案
 * GET    /api/projects/:id          取得單一專案詳情（含任務列表）
 * PATCH  /api/projects/:id          更新專案資訊
 * PATCH  /api/projects/:id/restore  復原已封存的專案（清除 deletedAt）
 * DELETE /api/projects/:id/permanent 永久刪除專案（不可復原）
 * GET    /api/projects/:id/tasks    取得專案任務列表
 * POST   /api/projects/:id/tasks    在專案下建立任務
 * PATCH  /api/tasks/:taskId         更新任務（狀態、指派人等）
 *
 * GET    /api/tasks?companyId=      跨專案全部任務（任務看板用）
 * GET    /api/users?companyId=      公司成員列表（指派人選單用）
 */

const express = require('express');
const router  = express.Router();
const prisma = require('../lib/prisma');
const requireRole = require('../middleware/requireRole');
const { taskController } = require('../controllers/task.controller');
const { taskRuleEngine } = require('../services/taskRuleEngine');
const {
  createProjectAssignmentNotifications,
  createTaskAssignmentNotifications,
  createTaskCompletedNotifications,
  createProjectStatusChangeNotifications,
  createTaskCommentNotifications,
  createMentionNotifications,
} = require('../services/notificationCenter');
const { createCalendarEvent } = require('../services/userOutlookService');

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

// ── 自訂欄位值寫入 helper ──────────────────────────────────
// customFieldValues = { definitionId: value, ... }
async function saveProjectCustomFieldValues(projectId, customFieldValues) {
  if (!customFieldValues || typeof customFieldValues !== 'object') return;

  for (const [defIdStr, val] of Object.entries(customFieldValues)) {
    const definitionId = parseInt(defIdStr);
    if (isNaN(definitionId)) continue;

    // 取得欄位定義
    const def = await prisma.customFieldDefinition.findUnique({
      where: { id: definitionId },
      include: { options: true },
    });
    if (!def) continue;

    // 根據 fieldType 建構 data
    const data = { definitionId, projectId };
    switch (def.fieldType) {
      case 'text':
        data.textValue = val ? String(val) : null;
        break;
      case 'number': case 'currency': case 'percent':
        data.numberValue = val !== '' && val != null ? parseFloat(val) : null;
        break;
      case 'checkbox':
        data.booleanValue = !!val;
        break;
      case 'date':
        data.dateValue = val ? new Date(val) : null;
        break;
      case 'datetime':
        data.dateTimeValue = val ? new Date(val) : null;
        break;
      case 'people':
        data.userValueId = val ? parseInt(val) : null;
        break;
      case 'single_select': {
        const opt = def.options.find(o => o.name === val);
        data.optionValueId = opt ? opt.id : null;
        break;
      }
      case 'multi_select':
        // multi_select 透過 join table 處理，先建 value row
        break;
      default:
        data.textValue = val ? String(val) : null;
    }

    // upsert value row
    const existing = await prisma.customFieldValue.findUnique({
      where: { definitionId_projectId: { definitionId, projectId } },
    });

    let cfValueId;
    if (existing) {
      const updated = await prisma.customFieldValue.update({
        where: { id: existing.id },
        data,
      });
      cfValueId = updated.id;
    } else {
      const created = await prisma.customFieldValue.create({ data });
      cfValueId = created.id;
    }

    // multi_select: 同步 join table
    if (def.fieldType === 'multi_select') {
      // 先清除舊的
      await prisma.customFieldValueOption.deleteMany({ where: { valueId: cfValueId } });
      const selectedNames = Array.isArray(val) ? val : [];
      for (const name of selectedNames) {
        const opt = def.options.find(o => o.name === name);
        if (opt) {
          await prisma.customFieldValueOption.create({
            data: { valueId: cfValueId, optionId: opt.id },
          });
        }
      }
    }
  }
}

// ════════════════════════════════════════════════════════════
// GET /api/projects?companyId=2
// 取得所有專案，含任務統計數字
// ════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  const companyId = req.user?.companyId || parseInt(req.query.companyId);

  try {
    // 支援 ?onlyDeleted=true（僅封存）或 ?includeDeleted=true（全部含封存）
    const onlyDeleted    = req.query.onlyDeleted === 'true';
    const includeDeleted = req.query.includeDeleted === 'true';
    const deletedFilter  = onlyDeleted ? { not: null } : includeDeleted ? undefined : null;

    // 支援 ?mine=true → 僅回傳自己擁有或參與的專案
    const mine = req.query.mine === 'true';
    const userId = req.user?.id || req.user?.userId;
    const mineFilter = mine && userId ? {
      OR: [
        { ownerId: parseInt(userId) },
        { members: { some: { userId: parseInt(userId) } } },
      ],
    } : {};

    const projects = await prisma.project.findMany({
      where:   { companyId, ...mineFilter, ...(deletedFilter !== undefined ? { deletedAt: deletedFilter } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { id: true, name: true } },
        members: {
          include: { user: { select: { id: true, name: true } } },
        },
        tasks: {
          where:  { deletedAt: null },
          select: { id: true, status: true, dueDate: true },
        },
        taskProjects: {
          include: { task: { select: { id: true, status: true, dueDate: true, deletedAt: true } } },
        },
        milestones: {
          select: { id: true, name: true, isAchieved: true, dueDate: true },
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    const result = projects.map(p => {
      // 合併直接關聯 + taskProjects 多對多關聯（去重）
      const taskMap = new Map();
      p.tasks.forEach(t => taskMap.set(t.id, t));
      (p.taskProjects || []).forEach(tp => {
        if (!tp.task.deletedAt && !taskMap.has(tp.task.id)) taskMap.set(tp.task.id, tp.task);
      });
      const allTasks = [...taskMap.values()];
      const total    = allTasks.length;
      const done     = allTasks.filter(t => t.status === 'done').length;
      const overdue  = allTasks.filter(t =>
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
        members:      (p.members || []).map(m => ({ id: m.user.id, name: m.user.name, role: m.role })),
        taskTotal:    total,
        taskDone:     done,
        taskOverdue:  overdue,
        completion:   total > 0 ? Math.round((done / total) * 100) : 0,
        milestoneCount: p.milestones.length,
        nextMilestone:  p.milestones.find(m => !m.isAchieved) || null,
        createdAt:    p.createdAt,
        deletedAt:    p.deletedAt,
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
// 建立新專案（需要 admin 或 pm 角色）
// ════════════════════════════════════════════════════════════
router.post('/', requireRole('admin', 'pm'), async (req, res) => {
  const companyId = req.user?.companyId || parseInt(req.body.companyId);
  const {
    name, description = '',
    status = 'planning',
    budget, startDate, endDate,
    ownerId, memberIds,
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
        createdById: req.user?.id ? parseInt(req.user.id) : (req.user?.userId ? parseInt(req.user.userId) : null),
      },
      include: {
        owner: { select: { id: true, name: true } },
      },
    });

    // 建立專案成員關聯
    const mIds = Array.isArray(memberIds) ? memberIds.map(Number).filter(Boolean) : [];
    if (mIds.length > 0) {
      await prisma.projectMember.createMany({
        data: mIds.map(uid => ({ projectId: project.id, userId: uid, role: uid === parseInt(ownerId) ? 'owner' : 'editor' })),
        skipDuplicates: true,
      });
    }

    // 查詢成員資料回傳
    const members = await prisma.projectMember.findMany({
      where: { projectId: project.id },
      include: { user: { select: { id: true, name: true } } },
    });
    project.members = members.map(m => ({ id: m.user.id, name: m.user.name, role: m.role }));

    ok(res, project);

    // 儲存自訂欄位值
    if (req.body.customFieldValues) {
      saveProjectCustomFieldValues(project.id, req.body.customFieldValues)
        .catch(e => console.warn(`[projects] 自訂欄位儲存失敗: ${e.message}`));
    }

    // 專案負責人指派通知
    if (ownerId) {
      const actorId = req.user?.id || req.user?.userId;
      createProjectAssignmentNotifications(prisma, {
        projectId:   project.id,
        projectName: project.name,
        recipientId: parseInt(ownerId),
        actorId:     actorId ? parseInt(actorId) : null,
      }).catch(e => console.warn(`[projects] 專案指派通知失敗: ${e.message}`));
    }
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
        taskAssigneeLinks: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'asc' }],
        },
        _count:       { select: { subtasks: true, comments: true, dependencies: true } },
        subtasks:     { select: { id: true, status: true }, where: { deletedAt: null } },
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
      dueEndDate:     t.dueEndDate || null,
      dueTime:        t.dueTime || null,
      dueEndTime:     t.dueEndTime || null,
      startedAt:      t.startedAt,
      completedAt:    t.completedAt,
      parentTaskId:   t.parentTaskId,
      progressPercent: t.progressPercent || 0,
      numSubtasks:    t._count?.subtasks || 0,
      completedSubtasks: (t.subtasks || []).filter(s => s.status === 'done' || s.status === 'completed').length,
      commentCount:   t._count?.comments || 0,
      depCount:       t._count?.dependencies || 0,
      assignee:       t.assignee,
      assignees:      (t.taskAssigneeLinks || []).map(l => ({ id: l.user.id, name: l.user.name, isPrimary: l.isPrimary })),
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
      select:  { id: true, name: true, email: true, role: true },
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
        owner: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, name: true } } } },
        milestones: { orderBy: { dueDate: 'asc' } },
        customFieldValues: {
          include: {
            definition: { select: { id: true, name: true, fieldType: true } },
            optionValue: { select: { id: true, name: true } },
            multiSelectOptions: { include: { option: { select: { id: true, name: true } } } },
          },
        },
        tasks: {
          where:   { deletedAt: null },
          orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
          include: {
            assignee: { select: { id: true, name: true } },
            taskAssigneeLinks: { include: { user: { select: { id: true, name: true } } }, orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'asc' }] },
            _count:   { select: { subtasks: true } },
            subtasks: { select: { id: true, status: true }, where: { deletedAt: null } },
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
      dueEndDate:     t.dueEndDate || null,
      dueTime:        t.dueTime || null,
      dueEndTime:     t.dueEndTime || null,
      parentTaskId:   t.parentTaskId,
      progressPercent: t.progressPercent || 0,
      numSubtasks:    t._count?.subtasks || 0,
      completedSubtasks: (t.subtasks || []).filter(s => s.status === 'done' || s.status === 'completed').length,
      assignee:       t.assignee,
      assignees:      (t.taskAssigneeLinks || []).map(l => ({ id: l.user.id, name: l.user.name, isPrimary: l.isPrimary })),
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

    // 格式化自訂欄位值
    const customFieldValues = (project.customFieldValues || []).map(cfv => ({
      definitionId: cfv.definitionId,
      name:         cfv.definition?.name,
      fieldType:    cfv.definition?.fieldType,
      textValue:    cfv.textValue,
      numberValue:  cfv.numberValue != null ? parseFloat(cfv.numberValue.toString()) : null,
      booleanValue: cfv.booleanValue,
      dateValue:    cfv.dateValue,
      dateTimeValue: cfv.dateTimeValue,
      userValueId:  cfv.userValueId,
      optionValue:  cfv.optionValue,
      multiSelectOptions: (cfv.multiSelectOptions || []).map(ms => ms.option),
    }));

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
      members:     (project.members || []).map(m => ({ id: m.user.id, name: m.user.name, role: m.role })),
      milestones:  project.milestones,
      customFieldValues,
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

  const { name, description, status, access, budget, startDate, endDate, ownerId, memberIds } = req.body;

  try {
    const data = {};
    if (name        !== undefined) data.name        = name.trim();
    if (description !== undefined) data.description = description;
    if (status      !== undefined) data.status      = status;
    if (access      !== undefined) data.access      = access;
    if (budget      !== undefined) data.budget      = budget ? parseFloat(budget) : null;
    if (startDate   !== undefined) data.startDate   = startDate ? new Date(startDate) : null;
    if (endDate     !== undefined) data.endDate     = endDate   ? new Date(endDate)   : null;
    if (ownerId     !== undefined) data.ownerId     = ownerId   ? parseInt(ownerId)   : null;

    if (Object.keys(data).length === 0 && !req.body.customFieldValues && !memberIds) return err(res, '沒有要更新的欄位', 400);

    // 查詢舊的 ownerId 以便偵測是否變更
    const oldProject = data.ownerId !== undefined
      ? await prisma.project.findUnique({ where: { id }, select: { ownerId: true } })
      : null;

    const project = await prisma.project.update({
      where: { id },
      data:  Object.keys(data).length > 0 ? data : { updatedAt: new Date() },
      include: { owner: { select: { id: true, name: true } } },
    });

    // 同步專案成員
    if (Array.isArray(memberIds)) {
      const mIds = memberIds.map(Number).filter(Boolean);
      // 先刪除舊的再重建
      await prisma.projectMember.deleteMany({ where: { projectId: id } });
      if (mIds.length > 0) {
        await prisma.projectMember.createMany({
          data: mIds.map(uid => ({ projectId: id, userId: uid, role: uid === (data.ownerId || project.ownerId) ? 'owner' : 'editor' })),
          skipDuplicates: true,
        });
      }
    }

    // 查詢成員資料回傳
    const members = await prisma.projectMember.findMany({
      where: { projectId: id },
      include: { user: { select: { id: true, name: true } } },
    });
    project.members = members.map(m => ({ id: m.user.id, name: m.user.name, role: m.role }));

    ok(res, project);

    // 儲存自訂欄位值
    if (req.body.customFieldValues) {
      saveProjectCustomFieldValues(id, req.body.customFieldValues)
        .catch(e => console.warn(`[projects] 自訂欄位儲存失敗: ${e.message}`));
    }

    // 專案狀態變更通知（通知專案負責人 + 成員）
    if (data.status) {
      const actorId = req.user?.id || req.user?.userId;
      createProjectStatusChangeNotifications(prisma, {
        projectId:   project.id,
        projectName: project.name,
        newStatus:   data.status,
        actorId:     actorId ? parseInt(actorId) : null,
      }).catch(e => console.warn(`[projects] 專案狀態變更通知失敗: ${e.message}`));
    }

    // 專案負責人變更通知（新 owner 與舊 owner 不同時觸發）
    if (data.ownerId && data.ownerId !== oldProject?.ownerId) {
      const actorId = req.user?.id || req.user?.userId;
      createProjectAssignmentNotifications(prisma, {
        projectId:   project.id,
        projectName: project.name,
        recipientId: data.ownerId,
        actorId:     actorId ? parseInt(actorId) : null,
      }).catch(e => console.warn(`[projects] 專案指派通知失敗: ${e.message}`));
    }

    // 專案截止日變更→自動同步到專案負責人的 Outlook 行事曆
    if (data.endDate && project.ownerId) {
      const ownerId = project.ownerId;
      const endDate = new Date(project.endDate);
      const startDt = new Date(endDate); startDt.setHours(9, 0, 0, 0);
      const endDt   = new Date(endDate); endDt.setHours(18, 0, 0, 0);
      createCalendarEvent(ownerId, {
        subject:       `📁 專案截止：${project.name}`,
        startDateTime: startDt,
        endDateTime:   endDt,
        body:          `<p>專案「${project.name}」截止日已更新為 ${endDate.toLocaleDateString('zh-TW')}</p><p><a href="${process.env.FRONTEND_URL || 'http://localhost:3838'}">前往 xCloudPMIS</a></p>`,
      }).then(() => {
        console.log(`📅 專案 ${project.name} 截止日已同步到用戶 ${ownerId} 行事曆`);
      }).catch(err => {
        // OAuth 未連結或失效時靜默跳過，不影響主流程
        console.log(`📅 [calendar] 專案截止日同步跳過（用戶 ${ownerId}）: ${err.message}`);
      });
    }
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// DELETE /api/projects/:id
// 軟刪除專案（需要 admin 或 pm 角色）
// ════════════════════════════════════════════════════════════
router.delete('/:id', requireRole('admin', 'pm'), async (req, res) => {
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
// PATCH /api/projects/:id/restore
// 復原已封存的專案（清除 deletedAt）
// ════════════════════════════════════════════════════════════
router.patch('/:id/restore', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return err(res, '無效的專案 ID', 400);

  try {
    const existing = await prisma.project.findFirst({
      where: { id, deletedAt: { not: null } },
    });
    if (!existing) return err(res, `找不到已封存的專案 #${id}`, 404);

    // 復原專案
    await prisma.project.update({
      where: { id },
      data:  { deletedAt: null },
    });

    // 一併復原該專案下的任務
    await prisma.task.updateMany({
      where: { projectId: id, deletedAt: { not: null } },
      data:  { deletedAt: null },
    });

    res.json({ success: true, message: `專案「${existing.name}」已復原` });
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// DELETE /api/projects/:id/permanent
// 永久刪除專案（僅限 admin）
// ════════════════════════════════════════════════════════════
router.delete('/:id/permanent', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return err(res, '無效的專案 ID', 400);

  try {
    const existing = await prisma.project.findFirst({ where: { id } });
    if (!existing) return err(res, `找不到專案 #${id}`, 404);

    // 級聯刪除：先刪子任務相關資料，再刪任務，最後刪專案
    const taskIds = (await prisma.task.findMany({ where: { projectId: id }, select: { id: true } })).map(t => t.id);
    if (taskIds.length > 0) {
      // 先解除子任務的 parentTaskId 關聯
      await prisma.task.updateMany({ where: { parentTaskId: { in: taskIds } }, data: { parentTaskId: null } });
      await prisma.comment.deleteMany({ where: { taskId: { in: taskIds } } });
      await prisma.taskTag.deleteMany({ where: { taskId: { in: taskIds } } });
      await prisma.taskProject.deleteMany({ where: { taskId: { in: taskIds } } });
      await prisma.customFieldValue.deleteMany({ where: { taskId: { in: taskIds } } });
      await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
    }
    await prisma.milestone.deleteMany({ where: { projectId: id } });
    await prisma.project.delete({ where: { id } });

    res.json({ success: true, message: `專案「${existing.name}」已永久刪除` });
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
        assignee: { select: { id: true, name: true } },
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
      dueEndDate:     t.dueEndDate || null,
      dueTime:        t.dueTime || null,
      dueEndTime:     t.dueEndTime || null,
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
    estimatedHours, dueDate, dueEndDate, dueTime, dueEndTime,
    planStart, planEnd,
    assigneeId, assigneeIds, parentTaskId,
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
          dueEndDate:     dueEndDate ? new Date(dueEndDate) : null,
          dueTime:        dueTime || null,
          dueEndTime:     dueEndTime || null,
          planStart:      planStart ? new Date(planStart) : null,
          planEnd:        planEnd   ? new Date(planEnd)   : null,
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

      // 建立多人指派 (assigneeIds 優先，fallback 單人 assigneeId)
      const allAssigneeIds = Array.isArray(assigneeIds) && assigneeIds.length > 0
        ? assigneeIds.map(Number).filter(Boolean)
        : (normalizedAssigneeId ? [normalizedAssigneeId] : []);

      for (let i = 0; i < allAssigneeIds.length; i++) {
        const uid = allAssigneeIds[i];
        await tx.taskAssigneeLink.upsert({
          where: { taskId_userId: { taskId: createdTask.id, userId: uid } },
          update: { isPrimary: i === 0, ...(actorId ? { assignedById: actorId } : {}) },
          create: { taskId: createdTask.id, userId: uid, isPrimary: i === 0, ...(actorId ? { assignedById: actorId } : {}) },
        });
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId, userId: uid } },
          update: {},
          create: { projectId, userId: uid, role: 'editor' },
        });
      }

      return tx.task.findUnique({
        where: { id: createdTask.id },
        include: {
          assignee: { select: { id: true, name: true } },
          taskAssigneeLinks: { include: { user: { select: { id: true, name: true } } }, orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'asc' }] },
          _count:   { select: { subtasks: true } },
        },
      });
    });

    ok(res, {
      ...task,
      estimatedHours: task.estimatedHours ? parseFloat(task.estimatedHours.toString()) : null,
      progressPercent: task.progressPercent || 0,
      numSubtasks: task._count?.subtasks || 0,
      assignees: (task.taskAssigneeLinks || []).map(l => ({ id: l.user.id, name: l.user.name, isPrimary: l.isPrimary })),
    });

    // 觸發 task_created 自動化規則
    taskRuleEngine.handleTaskCreated({
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        projectId,
        assigneeId: normalizedAssigneeId,
      },
      actorId,
    }).catch(e => console.warn('[projects] task_created 規則觸發失敗:', e.message));

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

  const { title, status, priority, assigneeId, assigneeIds, dueDate, dueEndDate, dueTime, dueEndTime, description, planStart, planEnd,
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
    if (dueEndDate  !== undefined) data.dueEndDate  = dueEndDate ? new Date(dueEndDate) : null;
    if (dueTime     !== undefined) data.dueTime     = dueTime || null;
    if (dueEndTime  !== undefined) data.dueEndTime  = dueEndTime || null;
    if (planStart   !== undefined) data.planStart   = planStart ? new Date(planStart) : null;
    if (planEnd     !== undefined) data.planEnd     = planEnd   ? new Date(planEnd)   : null;

    const task = await prisma.$transaction(async (tx) => {
      const updatedTask = await tx.task.update({
        where:   { id: taskId },
        data,
        include: {
          assignee: { select: { id: true, name: true } },
          taskAssigneeLinks: { include: { user: { select: { id: true, name: true } } }, orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'asc' }] },
          _count:   { select: { subtasks: true } },
        },
      });

      // ── 多人指派同步 ────────────────────────────────────
      if (Array.isArray(assigneeIds)) {
        const mIds = assigneeIds.map(Number).filter(Boolean);
        // 刪除舊的全部 link，重建
        await tx.taskAssigneeLink.deleteMany({ where: { taskId } });
        for (let i = 0; i < mIds.length; i++) {
          const uid = mIds[i];
          await tx.taskAssigneeLink.create({
            data: { taskId, userId: uid, isPrimary: i === 0, ...(actorId ? { assignedById: actorId } : {}) },
          });
          if (updatedTask.projectId) {
            await tx.projectMember.upsert({
              where: { projectId_userId: { projectId: updatedTask.projectId, userId: uid } },
              update: {},
              create: { projectId: updatedTask.projectId, userId: uid, role: 'editor' },
            });
          }
        }
        // 同步主要 assigneeId 為第一人
        if (mIds.length > 0 && updatedTask.assigneeId !== mIds[0]) {
          await tx.task.update({ where: { id: taskId }, data: { assigneeId: mIds[0] } });
        } else if (mIds.length === 0 && updatedTask.assigneeId) {
          await tx.task.update({ where: { id: taskId }, data: { assigneeId: null } });
        }
      } else if (assigneeId !== undefined) {
        // 舊的單人相容
        await tx.taskAssigneeLink.updateMany({
          where: { taskId, isPrimary: true },
          data: { isPrimary: false },
        });
        if (normalizedAssigneeId) {
          await tx.taskAssigneeLink.upsert({
            where: { taskId_userId: { taskId, userId: normalizedAssigneeId } },
            update: { isPrimary: true, ...(actorId ? { assignedById: actorId } : {}) },
            create: { taskId, userId: normalizedAssigneeId, isPrimary: true, ...(actorId ? { assignedById: actorId } : {}) },
          });
          if (updatedTask.projectId) {
            await tx.projectMember.upsert({
              where: { projectId_userId: { projectId: updatedTask.projectId, userId: normalizedAssigneeId } },
              update: {},
              create: { projectId: updatedTask.projectId, userId: normalizedAssigneeId, role: 'editor' },
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

      // 重新查詢以取得最新的 assigneeLinks
      return tx.task.findUnique({
        where: { id: taskId },
        include: {
          assignee: { select: { id: true, name: true } },
          taskAssigneeLinks: { include: { user: { select: { id: true, name: true } } }, orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'asc' }] },
          _count: { select: { subtasks: true } },
        },
      });
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
      assignees: (task.taskAssigneeLinks || []).map(l => ({ id: l.user.id, name: l.user.name, isPrimary: l.isPrimary })),
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

    // 任務完成通知 → 通知專案負責人
    if (data.status === 'done' && existingTask.status !== 'done') {
      createTaskCompletedNotifications(prisma, {
        taskId: task.id,
        projectId: task.projectId,
        actorId,
      }).catch((error) => {
        console.warn(`[projects] 任務完成通知失敗 task=${task.id}: ${error.message}`);
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
          select: { id: true, name: true },
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

    // ── @提及通知（與留言通知分開，type = mentioned）────────
    if (mentionIds.length) {
      createMentionNotifications(prisma, {
        taskId,
        authorId,
        mentionIds,
        content,
        commentId: comment.id,
      }).catch((error) => {
        console.warn(`[projects] 建立提及通知失敗 comment=${comment.id}: ${error.message}`);
      });
    }

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
// ════════════════════════════════════════════════════════════
// GET /api/projects/tasks/:taskId/subtasks
// 取得某任務的完整子任務樹（遞迴）
// ════════════════════════════════════════════════════════════
router.get('/tasks/:taskId/subtasks', async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  if (isNaN(taskId)) return err(res, '無效的任務 ID', 400);

  // 遞迴建構子任務樹
  async function fetchSubtreeNode(parentId) {
    const children = await prisma.task.findMany({
      where: { parentTaskId: parentId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }],
      include: {
        assignee: { select: { id: true, name: true } },
        taskAssigneeLinks: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'asc' }],
        },
        _count: { select: { subtasks: true } },
      },
    });
    return Promise.all(children.map(async (c) => ({
      id:              c.id,
      title:           c.title,
      status:          c.status,
      completed:       c.status === 'done' || c.status === 'completed',
      dueDate:         c.dueDate,
      progressPercent: c.progressPercent || 0,
      assignee:        c.assignee,
      assignees:       (c.taskAssigneeLinks || []).map(l => ({ id: l.user.id, name: l.user.name })),
      parentTaskId:    c.parentTaskId,
      children:        await fetchSubtreeNode(c.id),
    })));
  }

  try {
    const subtasks = await fetchSubtreeNode(taskId);
    ok(res, subtasks, { total: subtasks.length });
  } catch (e) {
    console.error(e);
    err(res, e.message);
  }
});

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

// ════════════════════════════════════════════════════════════
// POST /api/tasks/:taskId/approval  — 審核/簽核流程
// body: { action: 'approve' | 'reject' | 'request_review', comment? }
// ════════════════════════════════════════════════════════════
router.post('/tasks/:taskId/approval', async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  if (isNaN(taskId)) return err(res, '無效的任務 ID', 400);

  const { action, comment } = req.body;
  if (!['approve', 'reject', 'request_review'].includes(action)) {
    return err(res, '無效的審核動作，必須是 approve / reject / request_review', 400);
  }

  // 需要登入才能進行審核操作
  const actorId = req.user?.id ? parseInt(req.user.id) : (req.user?.userId ? parseInt(req.user.userId) : null);
  if (!actorId) return err(res, '需要登入才能進行審核操作', 401);
  const actorName = req.user?.name || '系統';

  try {
    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      include: {
        assignee: { select: { id: true, name: true } },
        project: {
          select: {
            id: true, name: true,
            createdBy: { select: { id: true, name: true } },
            owner: { select: { id: true, name: true } },
            members: {
              where: { role: 'owner' },
              include: { user: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    if (!task) return err(res, `找不到任務 #${taskId}`, 404);

    // 收集審核人清單（專案建立者 > 專案負責人 > 管理者角色成員）
    const reviewers = [];
    if (task.project?.createdBy) reviewers.push(task.project.createdBy);
    // 如果沒有建立者，fallback 到負責人
    if (reviewers.length === 0 && task.project?.owner) reviewers.push(task.project.owner);
    for (const pm of (task.project?.members || [])) {
      if (pm.user && !reviewers.find(r => r.id === pm.user.id)) {
        reviewers.push(pm.user);
      }
    }

    let newStatus = task.status;
    let message = '';

    if (action === 'request_review') {
      newStatus = 'review';
      const reviewerNames = reviewers.length > 0
        ? reviewers.map(r => r.name).join('、')
        : '專案管理者';
      message = `${actorName} 提交了審核請求（審核人：${reviewerNames}）`;
    } else if (action === 'approve') {
      if (task.status !== 'review') return err(res, '只有「審核中」狀態的任務才能批准', 400);
      newStatus = 'done';
      message = `${actorName} 已批准此任務`;
    } else if (action === 'reject') {
      if (task.status !== 'review') return err(res, '只有「審核中」狀態的任務才能退回', 400);
      newStatus = 'in_progress';
      message = `${actorName} 退回了此任務`;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const data = { status: newStatus };
      if (newStatus === 'done') {
        data.completedAt = new Date();
        data.progressPercent = 100;
      }
      if (newStatus === 'in_progress' && task.status !== 'in_progress') {
        data.startedAt = task.startedAt || new Date();
        data.completedAt = null;
        data.progressPercent = 0;
      }

      const updatedTask = await tx.task.update({
        where: { id: taskId },
        data,
        include: {
          assignee: { select: { id: true, name: true } },
          _count: { select: { subtasks: true } },
        },
      });

      // 記錄審核評論
      const commentText = comment
        ? `[審核] ${message}\n\n${comment}`
        : `[審核] ${message}`;

      await tx.comment.create({
        data: {
          taskId,
          userId: actorId,
          content: commentText,
        },
      });

      // 記錄活動日誌
      try {
        await tx.activityLog.create({
          data: {
            taskId,
            userId: actorId,
            action: `approval_${action}`,
            details: { action, comment: comment || null, fromStatus: task.status, toStatus: newStatus },
          },
        });
      } catch { /* 活動記錄失敗不阻斷 */ }

      return updatedTask;
    });

    res.json({
      success: true,
      message,
      data: {
        id: updated.id,
        status: updated.status,
        completedAt: updated.completedAt,
        reviewers: reviewers.map(r => ({ id: r.id, name: r.name })),
      },
    });
  } catch (e) {
    console.error('Approval error:', e);
    err(res, e.message);
  }
});

module.exports = router;
