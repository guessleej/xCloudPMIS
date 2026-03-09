/**
 * 報表匯出路由
 *
 * 端點列表：
 *   GET /api/reports/projects    → 專案進度報表
 *   GET /api/reports/tasks       → 任務統計報表
 *   GET /api/reports/timelog     → 工時統計報表
 *   GET /api/reports/milestones  → 里程碑報表
 *
 * 所有端點支援 ?format=csv 參數，直接回傳 CSV 下載
 * 預設回傳 JSON（含 columns、rows、summary）
 */

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma  = new PrismaClient();

// ════════════════════════════════════════════════════════════
// 工具函式
// ════════════════════════════════════════════════════════════

/**
 * 將二維陣列（含標頭列）轉換為 RFC 4180 合規的 CSV 字串
 * 處理含逗號、換行符、雙引號的欄位
 */
function toCSV(headers, rows) {
  const escape = (val) => {
    const str = (val === null || val === undefined) ? '' : String(val);
    // 含特殊字元需加引號
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(',')),
  ];
  // 加 UTF-8 BOM，讓 Excel 正確識別中文
  return '\uFEFF' + lines.join('\r\n');
}

/**
 * 送出 CSV 回應（瀏覽器會觸發下載）
 */
function sendCSV(res, filename, headers, rows) {
  const csv = toCSV(headers, rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}.csv"`);
  res.send(csv);
}

/**
 * 將 Date 物件格式化為 YYYY-MM-DD
 */
const fmtDate = (d) => {
  if (!d) return '';
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/**
 * 分鐘數 → 「H 小時 M 分鐘」字串
 */
const fmtMinutes = (mins) => {
  if (!mins || mins <= 0) return '0 分鐘';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} 分鐘`;
  if (m === 0) return `${h} 小時`;
  return `${h} 小時 ${m} 分鐘`;
};

/** 狀態中文對照 */
const PROJECT_STATUS = {
  planning:  '規劃中',
  active:    '進行中',
  on_hold:   '暫停',
  completed: '已完成',
  cancelled: '已取消',
};
const TASK_STATUS = {
  todo:        '待處理',
  in_progress: '進行中',
  review:      '審查中',
  done:        '已完成',
};
const PRIORITY = {
  low:    '低',
  medium: '中',
  high:   '高',
  urgent: '緊急',
};
const MILESTONE_COLOR = {
  red:    '紅（高風險）',
  yellow: '黃（需注意）',
  green:  '綠（正常）',
};

// ════════════════════════════════════════════════════════════
// 專案進度報表
// GET /api/reports/projects?companyId=2&format=csv
// ════════════════════════════════════════════════════════════
router.get('/projects', async (req, res) => {
  try {
    const companyId = parseInt(req.query.companyId) || 2;
    const format    = req.query.format || 'json'; // json | csv

    const projects = await prisma.project.findMany({
      where: { companyId, deletedAt: null },
      include: {
        owner: { select: { name: true } },
        tasks: {
          where: { deletedAt: null },
          select: {
            status:         true,
            estimatedHours: true,
            actualHours:    true,
          },
        },
        milestones: {
          select: { isAchieved: true },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    // 計算每個專案的統計
    const rows = projects.map(p => {
      const tasks = p.tasks;
      const total     = tasks.length;
      const done      = tasks.filter(t => t.status === 'done').length;
      const inProg    = tasks.filter(t => t.status === 'in_progress').length;
      const review    = tasks.filter(t => t.status === 'review').length;
      const todo      = tasks.filter(t => t.status === 'todo').length;
      const doneRate  = total > 0 ? Math.round(done / total * 100) : 0;

      const totalEstHours = tasks.reduce((s, t) =>
        s + (t.estimatedHours ? parseFloat(t.estimatedHours) : 0), 0);
      const totalActHours = tasks.reduce((s, t) =>
        s + (t.actualHours ? parseFloat(t.actualHours) : 0), 0);

      const milestones  = p.milestones.length;
      const achieved    = p.milestones.filter(m => m.isAchieved).length;

      return {
        id:              p.id,
        name:            p.name,
        status:          PROJECT_STATUS[p.status] || p.status,
        statusRaw:       p.status,
        owner:           p.owner?.name || '未指定',
        startDate:       fmtDate(p.startDate),
        endDate:         fmtDate(p.endDate),
        budget:          p.budget ? Number(p.budget) : null,
        total,
        done,
        inProg,
        review,
        todo,
        doneRate,
        totalEstHours:   Math.round(totalEstHours * 10) / 10,
        totalActHours:   Math.round(totalActHours * 10) / 10,
        milestones,
        achieved,
      };
    });

    if (format === 'csv') {
      const headers = [
        '專案名稱', '狀態', '負責人', '開始日期', '結束日期',
        '預算（元）', '任務總數', '已完成', '進行中', '審查中', '待處理',
        '完成率（%）', '預估工時（小時）', '實際工時（小時）',
        '里程碑總數', '已達成里程碑',
      ];
      const csvRows = rows.map(r => [
        r.name, r.status, r.owner, r.startDate, r.endDate,
        r.budget ?? '', r.total, r.done, r.inProg, r.review, r.todo,
        r.doneRate, r.totalEstHours, r.totalActHours,
        r.milestones, r.achieved,
      ]);
      return sendCSV(res, `專案進度報表_${fmtDate(new Date())}`, headers, csvRows);
    }

    // JSON 回應
    const columns = [
      { key: 'name',          label: '專案名稱' },
      { key: 'status',        label: '狀態' },
      { key: 'owner',         label: '負責人' },
      { key: 'startDate',     label: '開始日期' },
      { key: 'endDate',       label: '結束日期' },
      { key: 'total',         label: '任務總數',      type: 'number' },
      { key: 'done',          label: '已完成',         type: 'number' },
      { key: 'inProg',        label: '進行中',         type: 'number' },
      { key: 'review',        label: '審查中',         type: 'number' },
      { key: 'todo',          label: '待處理',         type: 'number' },
      { key: 'doneRate',      label: '完成率（%）',   type: 'percent' },
      { key: 'totalEstHours', label: '預估工時（小時）', type: 'number' },
      { key: 'totalActHours', label: '實際工時（小時）', type: 'number' },
      { key: 'milestones',    label: '里程碑',         type: 'number' },
      { key: 'achieved',      label: '已達成',         type: 'number' },
    ];

    res.json({
      type:      'projects',
      title:     '專案進度報表',
      columns,
      rows,
      summary: {
        totalProjects:  rows.length,
        activeProjects: rows.filter(r => r.statusRaw === 'active').length,
        totalTasks:     rows.reduce((s, r) => s + r.total, 0),
        doneTasks:      rows.reduce((s, r) => s + r.done, 0),
        overallRate:    rows.reduce((s, r) => s + r.total, 0) > 0
          ? Math.round(rows.reduce((s, r) => s + r.done, 0) / rows.reduce((s, r) => s + r.total, 0) * 100)
          : 0,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('❌ 專案進度報表錯誤:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// 任務統計報表
// GET /api/reports/tasks?companyId=2&projectId=&status=&format=csv
// ════════════════════════════════════════════════════════════
router.get('/tasks', async (req, res) => {
  try {
    const companyId = parseInt(req.query.companyId) || 2;
    const projectId = req.query.projectId ? parseInt(req.query.projectId) : null;
    const status    = req.query.status || null;
    const format    = req.query.format || 'json';

    const tasks = await prisma.task.findMany({
      where: {
        deletedAt: null,
        project: { companyId, deletedAt: null },
        ...(projectId && { projectId }),
        ...(status    && { status }),
      },
      include: {
        project:  { select: { id: true, name: true } },
        assignee: { select: { name: true } },
      },
      orderBy: [
        { project: { name: 'asc' } },
        { priority: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    const rows = tasks.map(t => ({
      id:             t.id,
      title:          t.title,
      projectName:    t.project.name,
      projectId:      t.project.id,
      assignee:       t.assignee?.name || '未指定',
      status:         TASK_STATUS[t.status] || t.status,
      statusRaw:      t.status,
      priority:       PRIORITY[t.priority] || t.priority,
      priorityRaw:    t.priority,
      estimatedHours: t.estimatedHours ? Number(t.estimatedHours) : null,
      actualHours:    t.actualHours    ? Number(t.actualHours)    : null,
      dueDate:        fmtDate(t.dueDate),
      startedAt:      fmtDate(t.startedAt),
      completedAt:    fmtDate(t.completedAt),
      createdAt:      fmtDate(t.createdAt),
    }));

    if (format === 'csv') {
      const headers = [
        '任務名稱', '所屬專案', '負責人', '狀態', '優先度',
        '預估工時（小時）', '實際工時（小時）', '到期日', '開始日期', '完成日期', '建立日期',
      ];
      const csvRows = rows.map(r => [
        r.title, r.projectName, r.assignee, r.status, r.priority,
        r.estimatedHours ?? '', r.actualHours ?? '',
        r.dueDate, r.startedAt, r.completedAt, r.createdAt,
      ]);
      return sendCSV(res, `任務統計報表_${fmtDate(new Date())}`, headers, csvRows);
    }

    // 統計摘要
    const statusCount = {};
    const priorityCount = {};
    for (const r of rows) {
      statusCount[r.statusRaw]    = (statusCount[r.statusRaw]    || 0) + 1;
      priorityCount[r.priorityRaw] = (priorityCount[r.priorityRaw] || 0) + 1;
    }

    const columns = [
      { key: 'title',          label: '任務名稱' },
      { key: 'projectName',    label: '所屬專案' },
      { key: 'assignee',       label: '負責人' },
      { key: 'status',         label: '狀態',           type: 'status' },
      { key: 'priority',       label: '優先度',         type: 'priority' },
      { key: 'estimatedHours', label: '預估工時（小時）', type: 'number' },
      { key: 'actualHours',    label: '實際工時（小時）', type: 'number' },
      { key: 'dueDate',        label: '到期日' },
    ];

    res.json({
      type:    'tasks',
      title:   '任務統計報表',
      columns,
      rows,
      summary: {
        total:    rows.length,
        byStatus: {
          todo:        statusCount.todo        || 0,
          in_progress: statusCount.in_progress || 0,
          review:      statusCount.review      || 0,
          done:        statusCount.done        || 0,
        },
        byPriority: {
          urgent: priorityCount.urgent || 0,
          high:   priorityCount.high   || 0,
          medium: priorityCount.medium || 0,
          low:    priorityCount.low    || 0,
        },
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('❌ 任務統計報表錯誤:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// 工時統計報表
// GET /api/reports/timelog?companyId=2&startDate=&endDate=&groupBy=project|user&format=csv
// ════════════════════════════════════════════════════════════
router.get('/timelog', async (req, res) => {
  try {
    const companyId = parseInt(req.query.companyId) || 2;
    const groupBy   = req.query.groupBy || 'project'; // project | user | task
    const format    = req.query.format || 'json';

    // 日期範圍（預設近 30 天）
    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setDate(defaultStart.getDate() - 29);
    defaultStart.setHours(0, 0, 0, 0);

    const rangeStart = req.query.startDate
      ? new Date(req.query.startDate + 'T00:00:00')
      : defaultStart;
    const rangeEnd   = req.query.endDate
      ? new Date(req.query.endDate + 'T23:59:59.999')
      : new Date(now.setHours(23, 59, 59, 999));

    // 取得已完成的工時記錄（進行中的不計入）
    const entries = await prisma.timeEntry.findMany({
      where: {
        endedAt: { not: null },
        date: { gte: rangeStart, lte: rangeEnd },
        task: {
          project: { companyId, deletedAt: null },
        },
      },
      include: {
        task: {
          select: {
            id:    true,
            title: true,
            project: { select: { id: true, name: true } },
          },
        },
        user: { select: { id: true, name: true } },
      },
      orderBy: { date: 'asc' },
    });

    // ── 依 groupBy 聚合 ───────────────────────────────────────
    let rows = [];

    if (groupBy === 'project') {
      const map = new Map(); // projectId → { name, minutes, count, users: Set }
      for (const e of entries) {
        const key = e.task.project.id;
        if (!map.has(key)) {
          map.set(key, {
            id:      key,
            name:    e.task.project.name,
            minutes: 0,
            count:   0,
            users:   new Set(),
          });
        }
        const g = map.get(key);
        g.minutes += e.durationMinutes || 0;
        g.count   += 1;
        g.users.add(e.user.name);
      }
      rows = Array.from(map.values())
        .sort((a, b) => b.minutes - a.minutes)
        .map(g => ({
          name:        g.name,
          minutes:     g.minutes,
          display:     fmtMinutes(g.minutes),
          count:       g.count,
          userCount:   g.users.size,
          users:       Array.from(g.users).join('、'),
        }));

    } else if (groupBy === 'user') {
      const map = new Map(); // userId → { name, minutes, count, projects: Set }
      for (const e of entries) {
        const key = e.user.id;
        if (!map.has(key)) {
          map.set(key, {
            id:       key,
            name:     e.user.name,
            minutes:  0,
            count:    0,
            projects: new Set(),
          });
        }
        const g = map.get(key);
        g.minutes  += e.durationMinutes || 0;
        g.count    += 1;
        g.projects.add(e.task.project.name);
      }
      rows = Array.from(map.values())
        .sort((a, b) => b.minutes - a.minutes)
        .map(g => ({
          name:         g.name,
          minutes:      g.minutes,
          display:      fmtMinutes(g.minutes),
          count:        g.count,
          projectCount: g.projects.size,
          projects:     Array.from(g.projects).join('、'),
        }));

    } else if (groupBy === 'task') {
      // 依任務分組（明細）
      const map = new Map();
      for (const e of entries) {
        const key = e.task.id;
        if (!map.has(key)) {
          map.set(key, {
            taskTitle:   e.task.title,
            projectName: e.task.project.name,
            minutes:     0,
            count:       0,
            users:       new Set(),
          });
        }
        const g = map.get(key);
        g.minutes += e.durationMinutes || 0;
        g.count   += 1;
        g.users.add(e.user.name);
      }
      rows = Array.from(map.values())
        .sort((a, b) => b.minutes - a.minutes)
        .map(g => ({
          name:        g.taskTitle,
          subName:     g.projectName,
          minutes:     g.minutes,
          display:     fmtMinutes(g.minutes),
          count:       g.count,
          users:       Array.from(g.users).join('、'),
        }));
    }

    const totalMinutes = rows.reduce((s, r) => s + r.minutes, 0);

    if (format === 'csv') {
      let headers, csvRows;
      if (groupBy === 'project') {
        headers  = ['專案名稱', '記錄筆數', '參與人數', '參與成員', '總工時（分鐘）', '總工時（顯示）'];
        csvRows  = rows.map(r => [r.name, r.count, r.userCount, r.users, r.minutes, r.display]);
      } else if (groupBy === 'user') {
        headers  = ['成員名稱', '記錄筆數', '參與專案數', '參與專案', '總工時（分鐘）', '總工時（顯示）'];
        csvRows  = rows.map(r => [r.name, r.count, r.projectCount, r.projects, r.minutes, r.display]);
      } else {
        headers  = ['任務名稱', '所屬專案', '記錄筆數', '參與成員', '總工時（分鐘）', '總工時（顯示）'];
        csvRows  = rows.map(r => [r.name, r.subName, r.count, r.users, r.minutes, r.display]);
      }
      const label = { project: '依專案', user: '依成員', task: '依任務' }[groupBy];
      return sendCSV(res, `工時統計報表（${label}）_${fmtDate(new Date())}`, headers, csvRows);
    }

    // JSON 欄位定義（依 groupBy 不同）
    let columns;
    if (groupBy === 'project') {
      columns = [
        { key: 'name',      label: '專案名稱' },
        { key: 'count',     label: '記錄筆數',   type: 'number' },
        { key: 'userCount', label: '參與人數',   type: 'number' },
        { key: 'users',     label: '參與成員' },
        { key: 'display',   label: '總工時' },
      ];
    } else if (groupBy === 'user') {
      columns = [
        { key: 'name',         label: '成員名稱' },
        { key: 'count',        label: '記錄筆數',   type: 'number' },
        { key: 'projectCount', label: '參與專案數', type: 'number' },
        { key: 'projects',     label: '參與專案' },
        { key: 'display',      label: '總工時' },
      ];
    } else {
      columns = [
        { key: 'name',    label: '任務名稱' },
        { key: 'subName', label: '所屬專案' },
        { key: 'count',   label: '記錄筆數', type: 'number' },
        { key: 'users',   label: '參與成員' },
        { key: 'display', label: '總工時' },
      ];
    }

    res.json({
      type:    'timelog',
      title:   '工時統計報表',
      groupBy,
      columns,
      rows,
      summary: {
        totalEntries: entries.length,
        totalMinutes,
        totalDisplay: fmtMinutes(totalMinutes),
        rangeStart:   fmtDate(rangeStart),
        rangeEnd:     fmtDate(rangeEnd),
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('❌ 工時統計報表錯誤:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// 里程碑報表
// GET /api/reports/milestones?companyId=2&format=csv
// ════════════════════════════════════════════════════════════
router.get('/milestones', async (req, res) => {
  try {
    const companyId = parseInt(req.query.companyId) || 2;
    const format    = req.query.format || 'json';

    const milestones = await prisma.milestone.findMany({
      where: {
        project: { companyId, deletedAt: null },
      },
      include: {
        project: { select: { id: true, name: true, status: true } },
      },
      orderBy: [
        { dueDate: 'asc' },
      ],
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rows = milestones.map(m => {
      const due     = new Date(m.dueDate);
      const isLate  = !m.isAchieved && due < today;
      const daysLeft = Math.ceil((due.getTime() - today.getTime()) / 86400000);

      return {
        id:          m.id,
        name:        m.name,
        projectName: m.project.name,
        projectStatus: PROJECT_STATUS[m.project.status] || m.project.status,
        dueDate:     fmtDate(m.dueDate),
        isAchieved:  m.isAchieved,
        achievedAt:  fmtDate(m.achievedAt),
        color:       MILESTONE_COLOR[m.color] || m.color,
        colorRaw:    m.color,
        description: m.description,
        isLate,
        daysLeft,
        statusLabel: m.isAchieved ? '已達成'
          : isLate              ? '已延誤'
          : daysLeft <= 7       ? '即將到期'
          : '進行中',
      };
    });

    if (format === 'csv') {
      const headers = [
        '里程碑名稱', '所屬專案', '預計達成日期', '狀態', '是否達成',
        '實際達成日期', '風險等級', '說明',
      ];
      const csvRows = rows.map(r => [
        r.name, r.projectName, r.dueDate, r.statusLabel,
        r.isAchieved ? '是' : '否',
        r.achievedAt, r.color, r.description,
      ]);
      return sendCSV(res, `里程碑報表_${fmtDate(new Date())}`, headers, csvRows);
    }

    const columns = [
      { key: 'name',          label: '里程碑名稱' },
      { key: 'projectName',   label: '所屬專案' },
      { key: 'dueDate',       label: '預計達成日期' },
      { key: 'statusLabel',   label: '狀態',       type: 'milestone-status' },
      { key: 'achievedAt',    label: '實際達成日期' },
      { key: 'color',         label: '風險等級',   type: 'milestone-color' },
    ];

    res.json({
      type:    'milestones',
      title:   '里程碑報表',
      columns,
      rows,
      summary: {
        total:      rows.length,
        achieved:   rows.filter(r => r.isAchieved).length,
        late:       rows.filter(r => r.isLate).length,
        upcoming:   rows.filter(r => !r.isAchieved && !r.isLate && r.daysLeft <= 30).length,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('❌ 里程碑報表錯誤:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// 取得所有可用專案（供報表篩選下拉使用）
// GET /api/reports/filter-options?companyId=2
// ════════════════════════════════════════════════════════════
router.get('/filter-options', async (req, res) => {
  try {
    const companyId = parseInt(req.query.companyId) || 2;

    const [projects, users] = await Promise.all([
      prisma.project.findMany({
        where: { companyId, deletedAt: null },
        select: { id: true, name: true, status: true },
        orderBy: { name: 'asc' },
      }),
      prisma.user.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    res.json({ projects, users });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

module.exports = router;
