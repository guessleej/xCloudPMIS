/**
 * Portfolios API — 專案組合 CRUD + 組合內專案健康監控
 *
 * GET    /api/portfolios?companyId=N          所有組合（含內部專案統計）
 * POST   /api/portfolios                      建立組合
 * PATCH  /api/portfolios/:id                  更新組合（名稱/說明/顏色）
 * DELETE /api/portfolios/:id                  刪除組合
 * POST   /api/portfolios/:id/projects         新增專案到組合
 * DELETE /api/portfolios/:id/projects/:pid    從組合移除專案
 * PATCH  /api/portfolios/:id/projects/:pid    更新組合內專案備註
 */

const express = require('express');
const router  = express.Router();
const prisma  = require('../lib/prisma');
const requireRole = require('../middleware/requireRole');

const ok  = (res, data)         => res.json({ success: true, data, timestamp: new Date().toISOString() });
const err = (res, msg, s = 500) => res.status(s).json({ success: false, error: msg });

// ── 工具：計算專案健康狀態 ───────────────────────────────
function calcHealth(tasks, projectStatus) {
  const total   = tasks.length;
  const now     = new Date();
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const overdue = tasks.filter(t =>
    t.status !== 'done' && t.dueDate && new Date(t.dueDate) < nowDate
  ).length;

  if (projectStatus === 'on_hold') return 'on_hold';
  if (total === 0) return 'on_track';
  if (overdue / total > 0.3)  return 'at_risk';
  if (overdue / total > 0.1)  return 'off_track';
  return 'on_track';
}

// ── 工具：格式化專案資料 ────────────────────────────────
function formatProject(p, linkNotes, healthOverride) {
  const tasks      = p.tasks || [];
  const total      = tasks.length;
  const done       = tasks.filter(t => t.status === 'done').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const now        = new Date();
  const nowDate    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const overdue    = tasks.filter(t =>
    t.status !== 'done' && t.dueDate && new Date(t.dueDate) < nowDate
  ).length;
  const progress   = total > 0 ? Math.round((done / total) * 100) : 0;
  const totalHours = tasks.reduce((s, t) => s + (parseFloat(t.estimatedHours) || 0), 0);
  const memberCount = (p.members || []).length;
  // 優先使用手動覆寫的健康度，否則自動計算
  const health     = healthOverride || calcHealth(tasks, p.status);

  return {
    id:          p.id,
    name:        p.name,
    status:      p.status,
    access:      p.access,
    health,
    progress,
    total,
    done,
    inProgress,
    overdue,
    totalHours:  Math.round(totalHours * 10) / 10,
    memberCount,
    startDate:   p.startDate,
    endDate:     p.endDate,
    notes:       linkNotes ?? '',
  };
}

// ════════════════════════════════════════════════════════════
// GET /api/portfolios?companyId=N
// ════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  const companyId = parseInt(req.query.companyId, 10);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  try {
    const portfolios = await prisma.portfolio.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
      include: {
        projects: {
          include: {
            project: {
              include: {
                tasks: {
                  where:  { deletedAt: null },
                  select: { id: true, status: true, dueDate: true, assigneeId: true, estimatedHours: true },
                },
                members: { select: { userId: true } },
              },
            },
          },
        },
      },
    });

    // 同時取得全公司專案（供前端建立組合時選擇）
    const allProjects = await prisma.project.findMany({
      where: { companyId, deletedAt: null, status: { not: 'archived' } },
      select: { id: true, name: true, status: true },
      orderBy: { name: 'asc' },
    });

    const result = portfolios.map(pf => {
      const projects = pf.projects
        .filter(link => link.project && !link.project.deletedAt)
        .map(link => formatProject(link.project, link.notes, link.healthOverride));

      const totalProjects = projects.length;
      const onTrack   = projects.filter(p => p.health === 'on_track').length;
      const offTrack  = projects.filter(p => p.health === 'off_track').length;
      const atRisk    = projects.filter(p => p.health === 'at_risk').length;

      return {
        id:          pf.id,
        name:        pf.name,
        description: pf.description,
        color:       pf.color,
        projects,
        summary: { totalProjects, onTrack, offTrack, atRisk },
      };
    });

    ok(res, { portfolios: result, allProjects });
  } catch (e) {
    console.error('[portfolios GET]', e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/portfolios  — 建立組合（需要 admin 或 pm）
// ════════════════════════════════════════════════════════════
router.post('/', requireRole('admin', 'pm'), async (req, res) => {
  const { companyId, name, description, color, projectIds } = req.body;
  if (!companyId || !name?.trim()) return err(res, 'companyId 和 name 為必填', 400);

  try {
    const portfolio = await prisma.portfolio.create({
      data: {
        companyId: parseInt(companyId, 10),
        name: name.trim(),
        description: description || '',
        color: color || '#3b82f6',
        projects: projectIds?.length ? {
          create: projectIds.map(pid => ({ projectId: parseInt(pid, 10) })),
        } : undefined,
      },
    });
    ok(res, portfolio);
  } catch (e) {
    console.error('[portfolios POST]', e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// PATCH /api/portfolios/:id  — 更新組合（需要 admin 或 pm）
// ════════════════════════════════════════════════════════════
router.patch('/:id', requireRole('admin', 'pm'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return err(res, '無效的組合 ID', 400);

  const { name, description, color } = req.body;
  const data = {};
  if (name        !== undefined) data.name        = name.trim();
  if (description !== undefined) data.description = description;
  if (color       !== undefined) data.color       = color;

  if (Object.keys(data).length === 0) return err(res, '沒有要更新的欄位', 400);

  try {
    const portfolio = await prisma.portfolio.update({ where: { id }, data });
    ok(res, portfolio);
  } catch (e) {
    console.error('[portfolios PATCH]', e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// DELETE /api/portfolios/:id  — 刪除組合（需要 admin 或 pm）
// ════════════════════════════════════════════════════════════
router.delete('/:id', requireRole('admin', 'pm'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return err(res, '無效的組合 ID', 400);

  try {
    await prisma.portfolio.delete({ where: { id } });
    ok(res, { deleted: true });
  } catch (e) {
    console.error('[portfolios DELETE]', e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/portfolios/:id/projects  — 新增專案到組合（需要 admin 或 pm）
// ════════════════════════════════════════════════════════════
router.post('/:id/projects', requireRole('admin', 'pm'), async (req, res) => {
  const portfolioId = parseInt(req.params.id, 10);
  const { projectIds } = req.body;
  if (!projectIds?.length) return err(res, 'projectIds 為必填', 400);

  try {
    const links = await prisma.$transaction(
      projectIds.map(pid =>
        prisma.portfolioProject.upsert({
          where: { portfolioId_projectId: { portfolioId, projectId: parseInt(pid, 10) } },
          update: {},
          create: { portfolioId, projectId: parseInt(pid, 10) },
        })
      )
    );
    ok(res, links);
  } catch (e) {
    console.error('[portfolios add projects]', e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// DELETE /api/portfolios/:id/projects/:pid  — 移除專案（需要 admin 或 pm）
// ════════════════════════════════════════════════════════════
router.delete('/:id/projects/:pid', requireRole('admin', 'pm'), async (req, res) => {
  const portfolioId = parseInt(req.params.id, 10);
  const projectId   = parseInt(req.params.pid, 10);

  try {
    await prisma.portfolioProject.delete({
      where: { portfolioId_projectId: { portfolioId, projectId } },
    });
    ok(res, { removed: true });
  } catch (e) {
    console.error('[portfolios remove project]', e);
    err(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// PATCH /api/portfolios/:id/projects/:pid  — 更新備註（需要 admin 或 pm）
// ════════════════════════════════════════════════════════════
router.patch('/:id/projects/:pid', requireRole('admin', 'pm'), async (req, res) => {
  const portfolioId = parseInt(req.params.id, 10);
  const projectId   = parseInt(req.params.pid, 10);
  const { notes, healthOverride } = req.body;

  try {
    const data = {};
    if (notes !== undefined)          data.notes = notes ?? '';
    if (healthOverride !== undefined) data.healthOverride = healthOverride; // null = 清除覆寫

    const link = await prisma.portfolioProject.update({
      where: { portfolioId_projectId: { portfolioId, projectId } },
      data,
    });
    ok(res, link);
  } catch (e) {
    console.error('[portfolios update notes]', e);
    err(res, e.message);
  }
});

module.exports = router;
