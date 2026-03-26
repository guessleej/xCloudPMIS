/**
 * Workload API — 資源分配矩陣
 *
 * GET /api/workload/matrix?companyId=N&projectId=&priority=&dueDays=
 *   回傳：指派對象 × 任務狀態 完整矩陣資料
 *   - members[]：每位成員的 counts（各狀態任務數）+ tasks（完整明細）
 *   - totals：各狀態合計
 *   - projects[]：可選的專案篩選清單
 *   - unassigned：未指派任務統計
 */

const express      = require('express');
const router       = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma       = new PrismaClient();

const ok  = (res, data) => res.json({ success: true, data, timestamp: new Date().toISOString() });
const err = (res, msg, status = 500) => res.status(status).json({ success: false, error: msg });

// ════════════════════════════════════════════════════════════
// GET /api/workload/matrix
// ════════════════════════════════════════════════════════════
router.get('/matrix', async (req, res) => {
  const companyId = parseInt(req.query.companyId, 10);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  const projectId = req.query.projectId ? parseInt(req.query.projectId, 10) : undefined;
  const priority  = req.query.priority  || undefined;
  const dueDays   = req.query.dueDays   ? parseInt(req.query.dueDays, 10) : undefined;

  try {
    const now     = new Date();
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // ── 篩選條件 ─────────────────────────────────────────
    const dueFilter = dueDays != null
      ? { lte: new Date(nowDate.getTime() + dueDays * 86_400_000) }
      : undefined;

    // ── 取專案列表（供前端 filter 用）────────────────────
    const projects = await prisma.project.findMany({
      where:   { companyId, deletedAt: null, status: { not: 'archived' } },
      select:  { id: true, name: true },
      orderBy: { createdAt: 'desc' },
    });
    const validProjectIds = projects.map(p => p.id);
    const scopeProjectIds = projectId
      ? (validProjectIds.includes(projectId) ? [projectId] : [])
      : validProjectIds;

    // ── 取全部未刪除任務（含指派人、專案） ───────────────
    const allTasks = await prisma.task.findMany({
      where: {
        deletedAt:  null,
        projectId:  { in: scopeProjectIds },
        ...(priority ? { priority } : {}),
        ...(dueFilter ? { dueDate: dueFilter } : {}),
      },
      select: {
        id: true, title: true, status: true, priority: true,
        dueDate: true, assigneeId: true, projectId: true,
        estimatedHours: true, progressPercent: true,
        project:  { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, avatarUrl: true, department: true } },
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    });

    // ── 取公司所有活躍成員（有任務 or 全員，看需求）──────
    const members = await prisma.user.findMany({
      where:   { companyId, isActive: true },
      select:  { id: true, name: true, avatarUrl: true, department: true, jobTitle: true },
      orderBy: { name: 'asc' },
    });

    // ── 建立成員任務對照表 ────────────────────────────────
    const STATUS_KEYS = ['todo', 'in_progress', 'review', 'done'];

    const formatTask = (t) => {
      const isOverdue = t.status !== 'done' && t.dueDate && new Date(t.dueDate) < nowDate;
      const daysOverdue = isOverdue
        ? Math.round((nowDate - new Date(t.dueDate)) / 86_400_000)
        : 0;
      return {
        id:             t.id,
        title:          t.title,
        status:         t.status,
        priority:       t.priority,
        dueDate:        t.dueDate,
        projectId:      t.project?.id,
        projectName:    t.project?.name || '未知專案',
        estimatedHours: t.estimatedHours ? parseFloat(t.estimatedHours) : null,
        progressPercent: t.progressPercent || 0,
        isOverdue,
        daysOverdue,
      };
    };

    // 初始化每位成員的統計
    const memberMap = {};
    for (const m of members) {
      memberMap[m.id] = {
        userId:    m.id,
        name:      m.name,
        avatarUrl: m.avatarUrl,
        department: m.department,
        jobTitle:  m.jobTitle,
        counts:    { todo: 0, in_progress: 0, review: 0, done: 0, overdue: 0, total: 0 },
        tasks:     [],
      };
    }

    // 分組：有指派人的任務
    const unassignedTasks = [];
    for (const t of allTasks) {
      const ft = formatTask(t);
      if (!t.assigneeId) {
        unassignedTasks.push(ft);
        continue;
      }
      // 若 assignee 不在公司成員裡（已離職等），動態建立 slot
      if (!memberMap[t.assigneeId] && t.assignee) {
        memberMap[t.assigneeId] = {
          userId:     t.assignee.id,
          name:       t.assignee.name,
          avatarUrl:  t.assignee.avatarUrl,
          department: t.assignee.department,
          jobTitle:   null,
          counts:     { todo: 0, in_progress: 0, review: 0, done: 0, overdue: 0, total: 0 },
          tasks:      [],
        };
      }
      if (!memberMap[t.assigneeId]) continue;

      const slot = memberMap[t.assigneeId];
      slot.tasks.push(ft);
      slot.counts[ft.status] = (slot.counts[ft.status] || 0) + 1;
      slot.counts.total++;
      if (ft.isOverdue) slot.counts.overdue++;
    }

    // ── 計算各欄位最大值（熱力圖配色基準） ───────────────
    const memberList = Object.values(memberMap)
      .filter(m => m.counts.total > 0 || members.find(u => u.id === m.userId))
      .sort((a, b) => b.counts.total - a.counts.total);   // 任務多的排前面

    const maxPerStatus = { todo: 1, in_progress: 1, review: 1, done: 1, overdue: 1 };
    for (const m of memberList) {
      for (const s of [...STATUS_KEYS, 'overdue']) {
        maxPerStatus[s] = Math.max(maxPerStatus[s], m.counts[s] || 0);
      }
    }

    // ── 各欄合計 ──────────────────────────────────────────
    const totals = { todo: 0, in_progress: 0, review: 0, done: 0, overdue: 0, total: 0 };
    for (const m of memberList) {
      for (const s of [...STATUS_KEYS, 'overdue']) {
        totals[s] = (totals[s] || 0) + (m.counts[s] || 0);
      }
      totals.total += m.counts.total;
    }

    // ── 計算容量指標（capacity） ──────────────────────────
    // active = todo + in_progress + review（尚未完成的活躍任務）
    const memberListWithCapacity = memberList.map(m => {
      const active   = (m.counts.todo || 0) + (m.counts.in_progress || 0) + (m.counts.review || 0);
      let capacity;
      if (active >= 10)      capacity = 'overloaded';   // 過載
      else if (active >= 6)  capacity = 'heavy';        // 偏重
      else if (active >= 3)  capacity = 'moderate';     // 適中
      else if (active >= 1)  capacity = 'light';        // 輕鬆
      else                   capacity = 'free';         // 空閒
      return { ...m, active, capacity };
    });

    return ok(res, {
      members:        memberListWithCapacity,
      totals,
      maxPerStatus,
      projects,
      unassigned:     {
        count: unassignedTasks.length,
        tasks: unassignedTasks,
        counts: {
          todo:        unassignedTasks.filter(t => t.status === 'todo').length,
          in_progress: unassignedTasks.filter(t => t.status === 'in_progress').length,
          review:      unassignedTasks.filter(t => t.status === 'review').length,
          done:        unassignedTasks.filter(t => t.status === 'done').length,
          overdue:     unassignedTasks.filter(t => t.isOverdue).length,
        },
      },
    });
  } catch (e) {
    console.error('[workload/matrix]', e);
    return err(res, e.message);
  }
});

module.exports = router;
