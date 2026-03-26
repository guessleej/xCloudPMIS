/**
 * Dashboard API — 儀表板資料
 *
 * GET /api/dashboard/summary?companyId=N
 *   回傳：summary KPI、projects 健康狀態、workload 工作負載、
 *         monthlyTrend 月度趨勢、insights 洞察提醒
 */

const express      = require('express');
const router       = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma       = new PrismaClient();

const ok  = (res, data) => res.json({ success: true, data, timestamp: new Date().toISOString() });
const err = (res, msg, status = 500) => res.status(status).json({ success: false, error: msg });

// ════════════════════════════════════════════════════════════
// GET /api/dashboard/summary?companyId=N
// ════════════════════════════════════════════════════════════
router.get('/summary', async (req, res) => {
  const companyId = parseInt(req.query.companyId, 10);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  try {
    const now      = new Date();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // ── 1. 總體 KPI ────────────────────────────────────────
    const [allTasks, projectList, memberCount] = await Promise.all([
      // 所有未刪除任務
      prisma.task.findMany({
        where: {
          deletedAt: null,
          project: { companyId, deletedAt: null },
        },
        select: {
          id: true,
          status: true,
          dueDate: true,
          completedAt: true,
          projectId: true,
          assigneeId: true,
          createdAt: true,
        },
      }),
      // 所有未刪除專案（含任務統計）
      prisma.project.findMany({
        where: { companyId, deletedAt: null, status: { not: 'archived' } },
        include: {
          tasks: {
            where: { deletedAt: null },
            select: { id: true, status: true, dueDate: true, completedAt: true, assigneeId: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // 公司成員數
      prisma.user.count({ where: { companyId, isActive: true } }),
    ]);

    // ── 2. 計算 summary ────────────────────────────────────
    const totalTasks     = allTasks.length;
    const doneTasks      = allTasks.filter(t => t.status === 'done').length;
    const overdueTasks   = allTasks.filter(
      t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now
    ).length;
    const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    // 本月到期（未完成）
    const dueThisMonth = allTasks.filter(
      t => t.status !== 'done' && t.dueDate
        && new Date(t.dueDate) >= now
        && new Date(t.dueDate) <= monthEnd
    ).length;

    // 活躍專案
    const activeProjects = projectList.filter(p => p.status === 'active').length;

    // ── 3. 計算每個專案的健康狀態 ─────────────────────────
    const projectsData = projectList.map(p => {
      const tasks     = p.tasks;
      const total     = tasks.length;
      const done      = tasks.filter(t => t.status === 'done').length;
      const inProg    = tasks.filter(t => t.status === 'in_progress').length;
      const todo      = tasks.filter(t => t.status === 'todo').length;
      const review    = tasks.filter(t => t.status === 'review').length;
      const overdue   = tasks.filter(
        t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now
      ).length;
      const rate      = total > 0 ? Math.round((done / total) * 100) : 0;

      // 健康狀態：green / yellow / red
      let health;
      if (overdue > 3 || (p.endDate && new Date(p.endDate) < now && p.status === 'active')) {
        health = 'red';
      } else if (overdue > 0 || rate < 20) {
        health = 'yellow';
      } else {
        health = 'green';
      }

      return {
        id:             p.id,
        name:           p.name,
        status:         p.status,
        health_status:  health,
        endDate:        p.endDate,
        taskCounts: { todo, in_progress: inProg, review, done },
        totalTasks:     total,
        completionRate: rate,
        overdue_tasks:  overdue,
      };
    });

    // 紅燈專案數
    const redProjects = projectsData.filter(p => p.health_status === 'red').length;

    // ── 4. 工作負載 workload ──────────────────────────────
    // 取所有有任務的成員
    const userMap = {};
    for (const t of allTasks) {
      if (!t.assigneeId) continue;
      if (!userMap[t.assigneeId]) {
        userMap[t.assigneeId] = { userId: t.assigneeId, todo: 0, in_progress: 0, review: 0, done: 0, overdue: 0 };
      }
      const u = userMap[t.assigneeId];
      u[t.status] = (u[t.status] || 0) + 1;
      if (t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now) u.overdue++;
    }

    // 取成員名稱
    const userIds = Object.keys(userMap).map(Number);
    let usersInfo = [];
    if (userIds.length > 0) {
      usersInfo = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, avatarUrl: true },
      });
    }
    const userInfoMap = {};
    for (const u of usersInfo) userInfoMap[u.id] = u;

    const workloadUsers = Object.values(userMap).map(u => {
      const info  = userInfoMap[u.userId] || {};
      const total = u.todo + u.in_progress + u.review + u.done;
      return {
        userId:    u.userId,
        name:      info.name || `成員 ${u.userId}`,
        avatarUrl: info.avatarUrl || null,
        totalTasks: total,
        taskCounts: { todo: u.todo, in_progress: u.in_progress, review: u.review, done: u.done },
        overdueTasks: u.overdue,
      };
    }).sort((a, b) => b.totalTasks - a.totalTasks).slice(0, 10);

    // ── 5. 月度趨勢（過去 6 個月）────────────────────────
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const completedRecent = allTasks.filter(
      t => t.completedAt && new Date(t.completedAt) >= sixMonthsAgo
    );
    const createdRecent = allTasks.filter(
      t => new Date(t.createdAt) >= sixMonthsAgo
    );

    // 按月份分組
    const monthlyMap = {};
    const addMonth = (d) => {
      const dt = new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    };
    for (const t of completedRecent) {
      const key = addMonth(t.completedAt);
      if (!monthlyMap[key]) monthlyMap[key] = { month: key, completed: 0, created: 0 };
      monthlyMap[key].completed++;
    }
    for (const t of createdRecent) {
      const key = addMonth(t.createdAt);
      if (!monthlyMap[key]) monthlyMap[key] = { month: key, completed: 0, created: 0 };
      monthlyMap[key].created++;
    }
    // 補齊最近 6 個月（即使沒資料也要顯示）
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap[key]) monthlyMap[key] = { month: key, completed: 0, created: 0 };
    }
    const monthlyTrend = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

    // ── 6. 自動洞察 insights ──────────────────────────────
    const insights = [];

    if (overdueTasks > 0) {
      insights.push({
        type:  'warning',
        title: `${overdueTasks} 個任務已逾期`,
        body:  '請優先安排逾期任務，避免影響整體進度。',
      });
    }
    if (redProjects > 0) {
      insights.push({
        type:  'danger',
        title: `${redProjects} 個專案處於高風險`,
        body:  '紅燈專案逾期任務過多或已超過截止日，建議立即跟進。',
      });
    }
    if (completionRate >= 80) {
      insights.push({
        type:  'success',
        title: `整體完成率達 ${completionRate}%`,
        body:  '團隊整體表現優異，繼續保持！',
      });
    }
    if (dueThisMonth > 0) {
      insights.push({
        type:  'info',
        title: `本月尚有 ${dueThisMonth} 個任務待完成`,
        body:  '本月截止任務需要提前安排，避免月底衝刺。',
      });
    }
    if (workloadUsers.length > 0) {
      const topUser = workloadUsers[0];
      if (topUser.totalTasks > 10) {
        insights.push({
          type:  'info',
          title: `${topUser.name} 工作負載較重（${topUser.totalTasks} 項任務）`,
          body:  '考慮重新分配部分任務，平衡團隊工作負載。',
        });
      }
    }

    // ── 7. 組合回傳 ───────────────────────────────────────
    return ok(res, {
      summary: {
        totalTasks,
        completedTasks:    doneTasks,
        overdueTasks,
        activeProjects,
        totalMembers:      memberCount,
        completionRate,
        // DarkPanel 使用的欄位（保持向下相容）
        total_overdue_tasks: overdueTasks,
        red_projects:        redProjects,
        due_this_month:      dueThisMonth,
      },
      projects:     projectsData,
      workload:     { users: workloadUsers },
      monthlyTrend,
      insights,
    });
  } catch (e) {
    console.error('[dashboard/summary]', e);
    return err(res, e.message);
  }
});

// 保留其他 stub 路由（相容既有程式碼）
router.get('/',      (req, res) => res.json({ success: true, data: [], meta: {} }));
router.post('/',     (req, res) => res.json({ success: true }));
router.get('/:id',   (req, res) => res.json({ success: true, data: null }));
router.patch('/:id', (req, res) => res.json({ success: true }));
router.delete('/:id',(req, res) => res.json({ success: true }));

module.exports = router;
