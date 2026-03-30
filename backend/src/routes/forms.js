/**
 * /api/forms — 表單管理路由
 * 使用 Prisma + PostgreSQL 持久化儲存
 */
const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ok  = (res, data, meta = {}) => res.json({ success: true, data, meta, timestamp: new Date().toISOString() });
const err = (res, msg, s = 500)   => res.status(s).json({ success: false, error: msg });

function formatForm(f) {
  return {
    id:          f.id,
    companyId:   f.companyId,
    name:        f.name,
    description: f.description,
    status:      f.status,
    submissions: f.submissions,
    createdAt:   f.createdAt instanceof Date ? f.createdAt.toISOString() : f.createdAt,
    lastSubmit:  f.lastSubmit ? (f.lastSubmit instanceof Date ? f.lastSubmit.toISOString() : f.lastSubmit) : null,
  };
}

async function seedIfEmpty(companyId) {
  const count = await prisma.form.count({ where: { companyId } });
  if (count > 0) return;

  await prisma.form.createMany({
    data: [
      {
        companyId,
        name:        '新任務申請表',
        description: '用於跨部門新任務需求提交',
        status:      'active',
        submissions: 24,
        createdAt:   new Date('2026-01-10T00:00:00.000Z'),
        lastSubmit:  new Date('2026-03-26T14:30:00.000Z'),
      },
      {
        companyId,
        name:        'Bug 回報表單',
        description: '產品缺陷快速回報入口',
        status:      'active',
        submissions: 51,
        createdAt:   new Date('2026-01-20T00:00:00.000Z'),
        lastSubmit:  new Date('2026-03-27T09:15:00.000Z'),
      },
      {
        companyId,
        name:        '使用者回饋調查',
        description: '蒐集系統使用者意見',
        status:      'active',
        submissions: 13,
        createdAt:   new Date('2026-02-05T00:00:00.000Z'),
        lastSubmit:  new Date('2026-03-22T11:00:00.000Z'),
      },
      {
        companyId,
        name:        '出差申請表',
        description: '員工出差費用申請',
        status:      'inactive',
        submissions: 8,
        createdAt:   new Date('2026-02-14T00:00:00.000Z'),
        lastSubmit:  new Date('2026-03-15T09:00:00.000Z'),
      },
    ],
  });
}

// GET /api/forms?companyId=N
router.get('/', async (req, res) => {
  const companyId = parseInt(req.query.companyId);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  try {
    await seedIfEmpty(companyId);
    const forms = await prisma.form.findMany({
      where:   { companyId },
      orderBy: { createdAt: 'asc' },
    });

    const formatted = forms.map(formatForm);
    const total   = formatted.length;
    const active  = formatted.filter(f => f.status === 'active').length;
    const monthly = formatted
      .filter(f => f.status === 'active')
      .reduce((s, f) => s + (f.submissions || 0), 0);

    return ok(res, formatted, { total, active, monthly });
  } catch (e) {
    console.error('[forms GET]', e);
    return err(res, '伺服器錯誤');
  }
});

// POST /api/forms
router.post('/', async (req, res) => {
  const { companyId, name, description } = req.body;
  if (!companyId || !name) return err(res, 'companyId, name 為必填', 400);

  try {
    const form = await prisma.form.create({
      data: {
        companyId:   parseInt(companyId),
        name,
        description: description || '',
        status:      'active',
        submissions: 0,
      },
    });
    return ok(res, formatForm(form));
  } catch (e) {
    console.error('[forms POST]', e);
    return err(res, '伺服器錯誤');
  }
});

// PATCH /api/forms/:id — 更新（含 status toggle）
router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return err(res, '無效的 ID', 400);

  try {
    const data = {};
    if (req.body.name        !== undefined) data.name        = req.body.name;
    if (req.body.description !== undefined) data.description = req.body.description;
    if (req.body.status      !== undefined) data.status      = req.body.status;

    const form = await prisma.form.update({ where: { id }, data });
    return ok(res, formatForm(form));
  } catch (e) {
    if (e.code === 'P2025') return err(res, '找不到此表單', 404);
    console.error('[forms PATCH]', e);
    return err(res, '伺服器錯誤');
  }
});

// DELETE /api/forms/:id
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return err(res, '無效的 ID', 400);

  try {
    await prisma.form.delete({ where: { id } });
    return ok(res, { id });
  } catch (e) {
    if (e.code === 'P2025') return err(res, '找不到此表單', 404);
    console.error('[forms DELETE]', e);
    return err(res, '伺服器錯誤');
  }
});

module.exports = router;
