/**
 * 任務 API 路由
 *
 * GET   /api/tasks?companyId=1&assigneeId=1  取得任務列表
 * PATCH /api/tasks/:id/health                手動覆寫健康度
 *
 * healthStatus 計算規則（系統自動）：
 *   on_track  → 未逾期（剩餘 > 3 天或無截止日）
 *   at_risk   → 即將到期（剩餘 0~3 天，含今天）
 *   off_track → 已逾期（截止日 < 今天）
 *
 * 手動覆寫：PATCH /api/tasks/:id/health { healthStatus: "at_risk" | null }
 *   null = 清除覆寫，恢復自動計算
 */

const express = require('express');
const router  = express.Router();
const prisma = require('../lib/prisma');
const { resolveDueEndTime } = require('../lib/taskDeadline');

// ── 健康度自動計算 ────────────────────────────────────────────
// 僅對未完成任務計算；已完成任務固定回傳 null
function calcHealth(dueDate, status) {
  if (status === 'done' || status === 'cancelled') return null;
  if (!dueDate) return 'on_track';

  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due   = new Date(dueDate);
  const dueMidnight = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const diffDays = Math.round((dueMidnight - today) / 86400000);

  if (diffDays < 0)  return 'off_track'; // 已逾期
  if (diffDays <= 3) return 'at_risk';   // 3 天內到期
  return 'on_track';
}

// ── 時間分區 ──────────────────────────────────────────────────
function deriveSection(dueDate) {
  if (!dueDate) return 'later';
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(dueDate); due.setHours(0,0,0,0);
  const diff  = Math.round((due - today) / 86400000);
  if (diff === 0)              return 'today';
  if (diff >= 1 && diff <= 7)  return 'upcoming';
  if (diff >= 8 && diff <= 14) return 'next_week';
  return 'later';
}

// ── 格式化單筆任務 ────────────────────────────────────────────
function formatTask(t) {
  const dueDateStr  = t.dueDate  ? t.dueDate.toISOString().split('T')[0]  : null;
  const planStartStr = t.planStart ? t.planStart.toISOString().split('T')[0] : null;
  const planEndStr   = t.planEnd   ? t.planEnd.toISOString().split('T')[0]   : null;
  // 有手動覆寫用覆寫值；否則自動計算
  const health = t.healthStatus ?? calcHealth(t.dueDate, t.status);
  return {
    id:           t.id,
    title:        t.title,
    description:  t.description || '',
    status:       t.status,
    priority:     t.priority,
    healthStatus: health,
    dueDate:      dueDateStr,
    planStart:    planStartStr,
    planEnd:      planEndStr,
    dueEndTime:   resolveDueEndTime(t.dueDate, t.dueEndTime),
    createdAt:    t.createdAt ? t.createdAt.toISOString().split('T')[0] : null,
    estimatedHours: t.estimatedHours ? parseFloat(t.estimatedHours) : null,
    progressPercent: t.progressPercent ?? 0,
    project:      t.project,
    assignee:     t.assignee,
    assignees:    (t.taskAssigneeLinks || []).map(l => ({ id: l.user.id, name: l.user.name, isPrimary: l.isPrimary })),
    section:      deriveSection(t.dueDate),
  };
}

// ════════════════════════════════════════════════════════════
// GET /api/tasks?companyId=1[&assigneeId=1]
// ════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  const companyId  = parseInt(req.query.companyId);
  if (!companyId) return res.status(400).json({ success: false, error: 'companyId 為必填' });
  const assigneeId = parseInt(req.query.assigneeId) || null;

  try {
    const projects = await prisma.project.findMany({
      where:  { companyId, deletedAt: null },
      select: { id: true, name: true },
    });
    const projectIds = projects.map(p => p.id);
    if (!projectIds.length) return res.json({ success: true, data: [], meta: { total: 0 } });

    const where = { projectId: { in: projectIds }, deletedAt: null, parentTaskId: null };
    if (assigneeId) {
      where.OR = [
        { assigneeId },
        { taskAssigneeLinks: { some: { userId: assigneeId } } },
      ];
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
      include: {
        assignee: { select: { id: true, name: true } },
        project:  { select: { id: true, name: true } },
        taskAssigneeLinks: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'asc' }],
        },
      },
    });

    const data = tasks.map(formatTask);
    res.json({ success: true, data, meta: { total: data.length } });
  } catch (e) {
    console.error('[tasks GET]', e.message);
    res.json({ success: true, data: [], meta: { total: 0 } });
  }
});

// ════════════════════════════════════════════════════════════
// PATCH /api/tasks/:id/health
// 手動覆寫健康度（傳 null 可清除覆寫，回到自動計算）
// body: { healthStatus: "on_track" | "at_risk" | "off_track" | null }
// ════════════════════════════════════════════════════════════
router.patch('/:id/health', async (req, res) => {
  const id     = parseInt(req.params.id);
  const { healthStatus } = req.body;

  const VALID = ['on_track', 'at_risk', 'off_track', null];
  if (!VALID.includes(healthStatus)) {
    return res.status(400).json({ success: false, error: 'healthStatus 值無效' });
  }

  try {
    const task = await prisma.task.update({
      where: { id },
      data:  { healthStatus: healthStatus ?? null },
      include: {
        assignee: { select: { id: true, name: true } },
        project:  { select: { id: true, name: true } },
      },
    });
    res.json({ success: true, data: formatTask(task) });
  } catch (e) {
    console.error('[tasks PATCH health]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
