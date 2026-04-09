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

async function seedIfEmpty(companyId) {
  const count = await prisma.workflow.count({ where: { companyId } });
  if (count > 0) return;

  await prisma.workflow.createMany({
    data: [
      {
        companyId,
        name:  '預設任務流程',
        nodes: [
          { id: 'todo',        label: '待辦',   color: '#6B7280', count: 12, desc: '尚未開始的任務' },
          { id: 'in_progress', label: '進行中', color: '#C70018', count: 8,  desc: '正在推進的工作' },
          { id: 'review',      label: '審核中', color: '#C97415', count: 3,  desc: '等待驗收或審閱' },
          { id: 'done',        label: '已完成', color: '#16824B', count: 21, desc: '交付完成的任務' },
        ],
        rules: [
          { trigger: '任務截止日提前 2 天', action: '自動通知負責人',     enabled: true  },
          { trigger: '任務移入「審核中」',   action: '通知 PM 進行審閱',   enabled: true  },
          { trigger: '任務移入「已完成」',   action: '更新專案進度百分比', enabled: true  },
          { trigger: '任務超過截止日',       action: '標記逾期並發送警示', enabled: false },
        ],
      },
      {
        companyId,
        name:  '專案審批流程',
        nodes: [
          { id: 'draft',    label: '草稿',     color: '#6B7280', count: 2, desc: '尚未提交的草稿' },
          { id: 'submit',   label: '已提交',   color: '#3B82F6', count: 3, desc: '等待初審' },
          { id: 'review',   label: '主管審閱', color: '#C97415', count: 1, desc: '主管確認中' },
          { id: 'approved', label: '已核准',   color: '#16824B', count: 5, desc: '審批通過' },
          { id: 'rejected', label: '退回修改', color: '#C70018', count: 1, desc: '需要補充資料' },
        ],
        rules: [
          { trigger: '草稿提交',          action: '通知審批人員',         enabled: true },
          { trigger: '主管審閱超過 3 天', action: '發送催辦通知',         enabled: true },
          { trigger: '申請被退回',         action: '通知申請人並說明原因', enabled: true },
        ],
      },
      {
        companyId,
        name:  'Bug 追蹤流程',
        nodes: [
          { id: 'new',       label: '新回報', color: '#C70018', count: 5,  desc: '剛建立的 Bug' },
          { id: 'confirmed', label: '已確認', color: '#C97415', count: 3,  desc: '已重現並確認' },
          { id: 'fixing',    label: '修復中', color: '#3B82F6', count: 4,  desc: '正在修復' },
          { id: 'testing',   label: '測試中', color: '#8B5CF6', count: 2,  desc: '驗證修復成效' },
          { id: 'closed',    label: '已關閉', color: '#16824B', count: 18, desc: '確認修復完成' },
        ],
        rules: [
          { trigger: '新 Bug 建立',           action: '自動指派給 QA Lead', enabled: true  },
          { trigger: 'Bug 確認後 24h 未指派', action: '發送警示給工程主管', enabled: true  },
          { trigger: 'Bug 移入「測試中」',    action: '通知 QA 進行驗證',   enabled: true  },
          { trigger: '同一 Bug 重新開啟',     action: '通知原修復工程師',   enabled: false },
        ],
      },
    ],
  });
}

// GET /api/workflow?companyId=N
router.get('/', async (req, res) => {
  const companyId = parseInt(req.query.companyId);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  try {
    await seedIfEmpty(companyId);
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
