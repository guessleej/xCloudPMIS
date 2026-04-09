/**
 * Portfolios API — 多專案集合健康監控
 *
 * GET /api/portfolios?companyId=N
 *   回傳：所有非封存專案 + 統計（進度、工時、成員數、逾期數）
 *   適合 P3#38-41 高層 Portfolio 視圖
 */

const express            = require('express');
const router             = express.Router();
const prisma             = require('../lib/prisma');

const ok  = (res, data)         => res.json({ success: true, data, timestamp: new Date().toISOString() });
const err = (res, msg, s = 500) => res.status(s).json({ success: false, error: msg });

router.get('/', async (req, res) => {
  const companyId = parseInt(req.query.companyId, 10);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  try {
    const now     = new Date();
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const projects = await prisma.project.findMany({
      where:   { companyId, deletedAt: null, status: { not: 'archived' } },
      include: {
        tasks: {
          where:  { deletedAt: null },
          select: {
            id: true, status: true, dueDate: true, assigneeId: true,
            estimatedHours: true, priority: true,
          },
        },
        members: { select: { userId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = projects.map(p => {
      const tasks      = p.tasks || [];
      const total      = tasks.length;
      const done       = tasks.filter(t => t.status === 'done').length;
      const inProgress = tasks.filter(t => t.status === 'in_progress').length;
      const overdue    = tasks.filter(t =>
        t.status !== 'done' && t.dueDate && new Date(t.dueDate) < nowDate
      ).length;
      const progress   = total > 0 ? Math.round((done / total) * 100) : 0;
      const totalHours = tasks.reduce((s, t) => s + (parseFloat(t.estimatedHours) || 0), 0);
      const memberCount = (p.members || []).length;

      // 健康評分
      let health = 'healthy';
      if (overdue > 0 && overdue / total > 0.3)     health = 'at_risk';
      else if (overdue > 0 && overdue / total > 0.1) health = 'off_track';
      else if (p.status === 'on_hold')               health = 'on_hold';

      // 優先度分布
      const priorityDist = { urgent: 0, high: 0, medium: 0, low: 0 };
      tasks.forEach(t => { if (t.priority in priorityDist) priorityDist[t.priority]++; });

      return {
        id:          p.id,
        name:        p.name,
        status:      p.status,
        access:      p.access,   // ← 隱私設定
        health,
        progress,
        total,
        done,
        inProgress,
        overdue,
        totalHours:  Math.round(totalHours * 10) / 10,
        memberCount,
        priorityDist,
        startDate:   p.startDate,
        endDate:     p.endDate,
        createdAt:   p.createdAt,
      };
    });

    // 彙總統計
    const summary = {
      totalProjects:  result.length,
      healthy:        result.filter(p => p.health === 'healthy').length,
      at_risk:        result.filter(p => p.health === 'at_risk').length,
      off_track:      result.filter(p => p.health === 'off_track').length,
      on_hold:        result.filter(p => p.health === 'on_hold').length,
      avgProgress:    result.length > 0 ? Math.round(result.reduce((s, p) => s + p.progress, 0) / result.length) : 0,
      totalTasks:     result.reduce((s, p) => s + p.total, 0),
      totalOverdue:   result.reduce((s, p) => s + p.overdue, 0),
      totalHours:     Math.round(result.reduce((s, p) => s + p.totalHours, 0) * 10) / 10,
    };

    ok(res, { projects: result, summary });
  } catch (e) {
    console.error('[portfolios]', e);
    err(res, e.message);
  }
});

module.exports = router;
