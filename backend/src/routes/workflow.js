/**
 * /api/workflow — 工作流程路由
 * 使用 Prisma + PostgreSQL 持久化儲存
 */
const express = require('express');
const router  = express.Router();
const prisma = require('../lib/prisma');

const ok  = (res, data, meta = {}) => res.json({ success: true, data, meta, timestamp: new Date().toISOString() });
const err = (res, msg, s = 500)   => res.status(s).json({ success: false, error: msg });

function formatWorkflow(w) {
  return {
    id:        w.id,
    companyId: w.companyId,
    name:      w.name,
    nodes:     Array.isArray(w.nodes) ? w.nodes : [],
    rules:     Array.isArray(w.rules) ? w.rules : [],
    createdAt: w.createdAt instanceof Date ? w.createdAt.toISOString() : w.createdAt,
  };
}

// GET /api/workflow?companyId=N
router.get('/', async (req, res) => {
  const companyId = parseInt(req.query.companyId);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  try {
    const workflows = await prisma.workflow.findMany({
      where:   { companyId },
      orderBy: { createdAt: 'asc' },
    });
    return ok(res, workflows.map(formatWorkflow), { total: workflows.length });
  } catch (e) {
    console.error('[workflow GET]', e);
    return err(res, '伺服器錯誤');
  }
});

// POST /api/workflow
router.post('/', async (req, res) => {
  const { companyId, name, nodes, rules } = req.body;
  if (!companyId || !name) return err(res, 'companyId, name 為必填', 400);

  try {
    const workflow = await prisma.workflow.create({
      data: {
        companyId: parseInt(companyId),
        name,
        nodes: nodes || [],
        rules: rules || [],
      },
    });
    return ok(res, formatWorkflow(workflow));
  } catch (e) {
    console.error('[workflow POST]', e);
    return err(res, '伺服器錯誤');
  }
});

// PATCH /api/workflow/:id
router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return err(res, '無效的 ID', 400);

  try {
    const data = {};
    if (req.body.name  !== undefined) data.name  = req.body.name;
    if (req.body.nodes !== undefined) data.nodes = req.body.nodes;
    if (req.body.rules !== undefined) data.rules = req.body.rules;

    const workflow = await prisma.workflow.update({ where: { id }, data });
    return ok(res, formatWorkflow(workflow));
  } catch (e) {
    if (e.code === 'P2025') return err(res, '找不到此流程', 404);
    console.error('[workflow PATCH]', e);
    return err(res, '伺服器錯誤');
  }
});

// DELETE /api/workflow/:id
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return err(res, '無效的 ID', 400);

  try {
    await prisma.workflow.delete({ where: { id } });
    return ok(res, { id });
  } catch (e) {
    if (e.code === 'P2025') return err(res, '找不到此流程', 404);
    console.error('[workflow DELETE]', e);
    return err(res, '伺服器錯誤');
  }
});

module.exports = router;
