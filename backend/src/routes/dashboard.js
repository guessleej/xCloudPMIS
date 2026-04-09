/**
 * Dashboard API — 儀表板資料
 *
 * GET /api/dashboard/summary?companyId=N
 *   回傳：summary KPI、projects 健康狀態、workload 工作負載、
 *         monthlyTrend 月度趨勢、insights 洞察提醒
 */

const express      = require('express');
const router       = express.Router();
const prisma       = require('../lib/prisma');

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

    // ── 5. 月度趨勢（過去 12 個月）────────────────────────
    const TREND_MONTHS = 12;
    const trendStart = new Date();
    trendStart.setMonth(trendStart.getMonth() - (TREND_MONTHS - 1));
    trendStart.setDate(1);
    trendStart.setHours(0, 0, 0, 0);

    const completedRecent = allTasks.filter(
      t => t.completedAt && new Date(t.completedAt) >= trendStart
    );
    const createdRecent = allTasks.filter(
      t => new Date(t.createdAt) >= trendStart
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
    // 補齊最近 12 個月（即使沒資料也要顯示）
    for (let i = TREND_MONTHS - 1; i >= 0; i--) {
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

    // ── 6b. 里程碑風險偵測 ─────────────────────────────────
    try {
      const msWeekLater = new Date(now);
      msWeekLater.setDate(msWeekLater.getDate() + 7);

      const atRiskMilestones = await prisma.milestone.findMany({
        where: {
          isAchieved: false,
          dueDate: { lte: msWeekLater },
          project: { companyId, deletedAt: null },
        },
        select: { id: true, name: true, dueDate: true, color: true },
        orderBy: { dueDate: 'asc' },
        take: 5,
      });

      const overdueMilestones = atRiskMilestones.filter(m => new Date(m.dueDate) < now);
      const upcomingMilestones = atRiskMilestones.filter(m => new Date(m.dueDate) >= now);

      if (overdueMilestones.length > 0) {
        insights.push({
          type:  'danger',
          title: `${overdueMilestones.length} 個里程碑已逾期`,
          body:  `「${overdueMilestones[0].name}」等里程碑已過預定日期，建議立即確認進度。`,
        });
      }
      if (upcomingMilestones.length > 0) {
        insights.push({
          type:  'warning',
          title: `${upcomingMilestones.length} 個里程碑即將到期（7 天內）`,
          body:  `「${upcomingMilestones[0].name}」將於 ${new Date(upcomingMilestones[0].dueDate).toLocaleDateString('zh-TW', { month: 'long', day: 'numeric' })} 到期，請提前準備。`,
        });
      }
    } catch (msErr) {
      console.warn('[dashboard] milestone insight skipped:', msErr.message);
    }

    // ── 6c. 週完成率趨勢比較 ──────────────────────────────
    {
      const thisWeekStart = new Date(now);
      thisWeekStart.setDate(thisWeekStart.getDate() - 7);
      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);

      const thisWeekDone = allTasks.filter(
        t => t.completedAt && new Date(t.completedAt) >= thisWeekStart && new Date(t.completedAt) < now
      ).length;
      const lastWeekDone = allTasks.filter(
        t => t.completedAt && new Date(t.completedAt) >= lastWeekStart && new Date(t.completedAt) < thisWeekStart
      ).length;

      if (lastWeekDone > 0) {
        const change = Math.round(((thisWeekDone - lastWeekDone) / lastWeekDone) * 100);
        if (change >= 20) {
          insights.push({
            type:  'success',
            title: `本週完成量較上週增加 ${change}%`,
            body:  `本週完成 ${thisWeekDone} 項（上週 ${lastWeekDone} 項），團隊產出明顯提升。`,
          });
        } else if (change <= -20) {
          insights.push({
            type:  'warning',
            title: `本週完成量較上週減少 ${Math.abs(change)}%`,
            body:  `本週完成 ${thisWeekDone} 項（上週 ${lastWeekDone} 項），建議檢視是否有阻塞。`,
          });
        }
      } else if (thisWeekDone > 0) {
        insights.push({
          type:  'info',
          title: `本週已完成 ${thisWeekDone} 項任務`,
          body:  '上週無完成記錄，本週已開始推進。',
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

// ════════════════════════════════════════════════════════════
// GET /api/dashboard/my-impact?companyId=N&userId=N
// 個人貢獻統計（P2#35 My Impact）
// ════════════════════════════════════════════════════════════
router.get('/my-impact', async (req, res) => {
  const companyId = parseInt(req.query.companyId, 10);
  const userId    = parseInt(req.query.userId,    10);
  if (!companyId || !userId) return err(res, 'companyId & userId 為必填', 400);

  try {
    const now      = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const weekAgo  = new Date(now.getTime() - 7 * 86_400_000);

    const [myTasks, user] = await Promise.all([
      prisma.task.findMany({
        where: { assigneeId: userId, deletedAt: null, project: { companyId } },
        select: {
          id: true, title: true, status: true, priority: true, dueDate: true,
          completedAt: true, createdAt: true, projectId: true,
          project: { select: { id: true, name: true } },
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, avatarUrl: true, department: true, jobTitle: true, createdAt: true },
      }),
    ]);

    const completedThisMonth = myTasks.filter(t => t.completedAt && new Date(t.completedAt) >= monthStart).length;
    const completedLastMonth = myTasks.filter(t => t.completedAt && new Date(t.completedAt) >= prevMonthStart && new Date(t.completedAt) <= prevMonthEnd).length;
    const completedThisWeek  = myTasks.filter(t => t.completedAt && new Date(t.completedAt) >= weekAgo).length;
    const overdueCount       = myTasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now).length;
    const activeCount        = myTasks.filter(t => ['todo','in_progress','review'].includes(t.status)).length;

    // 參與專案數（去重）
    const projectIds = [...new Set(myTasks.map(t => t.projectId))];

    // 月度貢獻趨勢（過去 6 個月）
    const trendMap = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      trendMap[key] = { month: key, completed: 0 };
    }
    for (const t of myTasks) {
      if (!t.completedAt) continue;
      const key = `${new Date(t.completedAt).getFullYear()}-${String(new Date(t.completedAt).getMonth() + 1).padStart(2, '0')}`;
      if (trendMap[key]) trendMap[key].completed++;
    }
    const contributionTrend = Object.values(trendMap).sort((a, b) => a.month.localeCompare(b.month));

    // 月環比
    const mom = completedLastMonth > 0
      ? Math.round(((completedThisMonth - completedLastMonth) / completedLastMonth) * 100)
      : completedThisMonth > 0 ? 100 : 0;

    return ok(res, {
      user,
      stats: {
        completedThisMonth,
        completedLastMonth,
        completedThisWeek,
        overdueCount,
        activeCount,
        projectCount: projectIds.length,
        totalCompleted: myTasks.filter(t => t.status === 'done').length,
        monthOverMonth: mom,
      },
      contributionTrend,
      recentCompleted: myTasks
        .filter(t => t.completedAt && new Date(t.completedAt) >= weekAgo)
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
        .slice(0, 10)
        .map(t => ({ id: t.id, title: t.title, projectName: t.project?.name, priority: t.priority, completedAt: t.completedAt })),
    });
  } catch (e) {
    console.error('[dashboard/my-impact]', e);
    return err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/dashboard/urgency?companyId=N&days=14
// 逾期任務（#26）+ 即將截止（#27）
// ════════════════════════════════════════════════════════════
router.get('/urgency', async (req, res) => {
  const companyId = parseInt(req.query.companyId, 10);
  const days      = Math.min(parseInt(req.query.days  || '14', 10), 60);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  try {
    const now      = new Date();
    const nowDate  = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 今天 00:00
    const cutoff   = new Date(nowDate.getTime() + days * 86_400_000);            // N 天後

    // 同時撈逾期 & 即將截止的任務（含專案與指派人）
    const [overdueRaw, upcomingRaw] = await Promise.all([
      // 逾期：due_date < 今天 && status != done
      prisma.task.findMany({
        where: {
          deletedAt: null,
          status:    { notIn: ['done'] },
          dueDate:   { lt: nowDate },
          project:   { companyId, deletedAt: null },
        },
        select: {
          id: true, title: true, status: true, priority: true, dueDate: true,
          project:  { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { dueDate: 'asc' },   // 最舊的排前面
        take: 50,
      }),
      // 即將截止：today <= due_date <= cutoff && status != done
      prisma.task.findMany({
        where: {
          deletedAt: null,
          status:    { notIn: ['done'] },
          dueDate:   { gte: nowDate, lte: cutoff },
          project:   { companyId, deletedAt: null },
        },
        select: {
          id: true, title: true, status: true, priority: true, dueDate: true,
          project:  { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 50,
      }),
    ]);

    // ── 格式化：加上 daysOverdue / daysLeft ──────────────
    const dayDiff = (a, b) =>
      Math.round((new Date(b) - new Date(a)) / 86_400_000);

    const overdue = overdueRaw.map(t => ({
      id:          t.id,
      title:       t.title,
      status:      t.status,
      priority:    t.priority,
      dueDate:     t.dueDate,
      daysOverdue: dayDiff(t.dueDate, nowDate),   // 正整數
      projectId:   t.project?.id,
      projectName: t.project?.name || '未知專案',
      assignee:    t.assignee
        ? { id: t.assignee.id, name: t.assignee.name, avatarUrl: t.assignee.avatarUrl }
        : null,
    }));

    const upcoming = upcomingRaw.map(t => {
      const left = dayDiff(nowDate, t.dueDate);
      let urgencyGroup;
      if (left === 0)      urgencyGroup = 'today';
      else if (left <= 3)  urgencyGroup = 'three_days';
      else if (left <= 7)  urgencyGroup = 'this_week';
      else                 urgencyGroup = 'later';

      return {
        id:           t.id,
        title:        t.title,
        status:       t.status,
        priority:     t.priority,
        dueDate:      t.dueDate,
        daysLeft:     left,
        urgencyGroup,
        projectId:    t.project?.id,
        projectName:  t.project?.name || '未知專案',
        assignee:     t.assignee
          ? { id: t.assignee.id, name: t.assignee.name, avatarUrl: t.assignee.avatarUrl }
          : null,
      };
    });

    // ── 逾期任務依優先度分組（圖表用）────────────────────
    const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'];
    const overdueByPriority = PRIORITY_ORDER.map(p => ({
      priority: p,
      count:    overdue.filter(t => t.priority === p).length,
    }));

    // ── 逾期任務依專案分組（前 8 個）────────────────────
    const projMap = {};
    for (const t of overdue) {
      const key = t.projectId || 0;
      if (!projMap[key]) projMap[key] = { projectId: key, projectName: t.projectName, count: 0 };
      projMap[key].count++;
    }
    const overdueByProject = Object.values(projMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return ok(res, { overdue, upcoming, overdueByPriority, overdueByProject });
  } catch (e) {
    console.error('[dashboard/urgency]', e);
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
