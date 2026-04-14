/**
 * /api/time-tracking — 工時記錄路由
 * 使用 PostgreSQL（Prisma WorkTimeLog 模型）
 */
const express = require('express');
const router  = express.Router();
const prisma  = require('../lib/prisma');

const ok  = (res, data, meta = {}) => res.json({ success: true, data, meta, timestamp: new Date().toISOString() });
const err = (res, msg, s = 500)   => res.status(s).json({ success: false, error: msg });

// 計算統計資料
function calcStats(entries, userId) {
  const userEntries = entries.filter(e => String(e.userId) === String(userId));
  const now   = new Date();
  const today = now.toISOString().slice(0, 10);

  // 本週一
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  // 本月 1 日
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const weekTotal  = userEntries
    .filter(e => new Date(e.date) >= monday)
    .reduce((s, e) => s + (e.hours || 0), 0);

  const monthTotal = userEntries
    .filter(e => new Date(e.date) >= monthStart)
    .reduce((s, e) => s + (e.hours || 0), 0);

  const todayTotal = userEntries
    .filter(e => e.date === today)
    .reduce((s, e) => s + (e.hours || 0), 0);

  // 過去 30 天日均
  const past30 = new Date(now);
  past30.setDate(now.getDate() - 30);
  const past30Entries = userEntries.filter(e => new Date(e.date) >= past30);
  const uniqueDays    = new Set(past30Entries.map(e => e.date)).size;
  const dailyAvg      = uniqueDays > 0
    ? Math.round((past30Entries.reduce((s, e) => s + (e.hours || 0), 0) / uniqueDays) * 10) / 10
    : 0;

  // 本週 7 天分布
  const DAY_NAMES = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dayName = DAY_NAMES[(monday.getDay() + i) % 7] || `D${i}`;
    const hours   = userEntries
      .filter(e => e.date === dateStr)
      .reduce((s, e) => s + (e.hours || 0), 0);
    weekDays.push({ day: dayName, date: `${mm}/${dd}`, hours });
  }

  return { weekTotal, monthTotal, todayTotal, dailyAvg, weekDays };
}

// GET /api/time-tracking?companyId=N&userId=N
router.get('/', async (req, res) => {
  try {
    const companyId = parseInt(req.query.companyId);
    const userId    = req.query.userId;
    if (!companyId) return err(res, 'companyId 為必填', 400);

    const where = { companyId };
    if (userId) where.userId = parseInt(userId);

    const entries = await prisma.workTimeLog.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    // calcStats 需要全公司資料（統計不限 userId）
    const allEntries = await prisma.workTimeLog.findMany({ where: { companyId } });
    const stats = calcStats(allEntries, userId || 1);

    return ok(res, { entries, stats });
  } catch (e) {
    console.error('[time-tracking GET]', e);
    return err(res, e.message);
  }
});

// POST /api/time-tracking
router.post('/', async (req, res) => {
  try {
    const { companyId, userId, date, project, task, hours, note } = req.body;
    if (!companyId || !userId || !date || !project || !task || hours === undefined) {
      return err(res, 'companyId, userId, date, project, task, hours 為必填', 400);
    }

    const newEntry = await prisma.workTimeLog.create({
      data: {
        company:  { connect: { id: parseInt(companyId) } },
        user:     { connect: { id: parseInt(userId) } },
        date,
        project,
        task,
        hours:    parseFloat(hours),
        note:     note || '',
      },
    });

    return ok(res, newEntry);
  } catch (e) {
    console.error('[time-tracking POST]', e);
    return err(res, e.message);
  }
});

// PATCH /api/time-tracking/:id
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.workTimeLog.findUnique({ where: { id } });
    if (!existing) return err(res, '找不到此記錄', 404);

    const data = {};
    if (req.body.date    !== undefined) data.date    = req.body.date;
    if (req.body.project !== undefined) data.project = req.body.project;
    if (req.body.task    !== undefined) data.task    = req.body.task;
    if (req.body.hours   !== undefined) data.hours   = parseFloat(req.body.hours);
    if (req.body.note    !== undefined) data.note    = req.body.note;

    const updated = await prisma.workTimeLog.update({ where: { id }, data });
    return ok(res, updated);
  } catch (e) {
    console.error('[time-tracking PATCH]', e);
    return err(res, e.message);
  }
});

// DELETE /api/time-tracking/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.workTimeLog.findUnique({ where: { id } });
    if (!existing) return err(res, '找不到此記錄', 404);

    await prisma.workTimeLog.delete({ where: { id } });
    return ok(res, { id });
  } catch (e) {
    console.error('[time-tracking DELETE]', e);
    return err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/time-tracking/my-tasks?companyId=N&userId=N
// 取得使用者被指派的任務，依專案分組，並附上各任務今日/本週已登錄工時
// ════════════════════════════════════════════════════════════
router.get('/my-tasks', async (req, res) => {
  try {
    const companyId = parseInt(req.query.companyId);
    const userId    = parseInt(req.query.userId);
    if (!companyId || !userId) return err(res, 'companyId 和 userId 為必填', 400);

    // 取得使用者被指派的、未完成的任務（含專案資訊）
    const tasks = await prisma.task.findMany({
      where: {
        assigneeId: userId,
        deletedAt:  null,
        status:     { not: 'done' },
        project:    { companyId, deletedAt: null },
      },
      include: {
        project: { select: { id: true, name: true, status: true } },
      },
      orderBy: [
        { project: { name: 'asc' } },
        { priority: 'desc' },
        { position: 'asc' },
      ],
    });

    // 取得該使用者最近 7 天的工時記錄
    const now   = new Date();
    const today = now.toISOString().slice(0, 10);
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    const mondayStr = monday.toISOString().slice(0, 10);

    const recentLogs = await prisma.workTimeLog.findMany({
      where: {
        companyId,
        userId,
        date: { gte: mondayStr },
      },
    });

    // 建立 task → 工時對照表（key = "projectName::taskTitle"）
    const logMap = {};
    for (const log of recentLogs) {
      const key = `${log.project}::${log.task}`;
      if (!logMap[key]) logMap[key] = { today: 0, week: 0, entries: [] };
      if (log.date === today) logMap[key].today += (log.hours || 0);
      logMap[key].week += (log.hours || 0);
      logMap[key].entries.push(log);
    }

    // 依專案分組
    const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };
    const PRIORITY_LABEL = { urgent: '緊急', high: '高', medium: '中', low: '低' };
    const STATUS_LABEL   = { todo: '待處理', in_progress: '進行中', review: '審查中', done: '已完成' };

    const projectMap = new Map();
    for (const t of tasks) {
      const pid = t.project.id;
      if (!projectMap.has(pid)) {
        projectMap.set(pid, {
          projectId:   pid,
          projectName: t.project.name,
          projectStatus: t.project.status,
          tasks: [],
        });
      }

      const logKey = `${t.project.name}::${t.title}`;
      const logged = logMap[logKey] || { today: 0, week: 0, entries: [] };

      projectMap.get(pid).tasks.push({
        id:             t.id,
        title:          t.title,
        status:         t.status,
        statusLabel:    STATUS_LABEL[t.status] || t.status,
        priority:       t.priority,
        priorityLabel:  PRIORITY_LABEL[t.priority] || t.priority,
        priorityOrder:  PRIORITY_ORDER[t.priority] ?? 9,
        estimatedHours: t.estimatedHours ? Number(t.estimatedHours) : null,
        actualHours:    t.actualHours ? Number(t.actualHours) : null,
        dueDate:        t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
        todayHours:     Math.round(logged.today * 10) / 10,
        weekHours:      Math.round(logged.week * 10) / 10,
        recentEntries:  logged.entries,
      });
    }

    const projects = Array.from(projectMap.values());
    projects.forEach(p => p.tasks.sort((a, b) => a.priorityOrder - b.priorityOrder));

    return ok(res, { projects });
  } catch (e) {
    console.error('[time-tracking my-tasks]', e);
    return err(res, e.message);
  }
});

module.exports = router;
