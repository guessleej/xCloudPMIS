/**
 * /api/forms — 表單管理路由（含欄位定義 + 提交紀錄）
 * 使用 Prisma + PostgreSQL 持久化儲存
 */
const express = require('express');
const router  = express.Router();
const prisma = require('../lib/prisma');

const ok  = (res, data, meta = {}) => res.json({ success: true, data, meta, timestamp: new Date().toISOString() });
const err = (res, msg, s = 500)   => res.status(s).json({ success: false, error: msg });

function formatForm(f) {
  return {
    id:          f.id,
    companyId:   f.companyId,
    name:        f.name,
    description: f.description,
    status:      f.status,
    fields:      Array.isArray(f.fields) ? f.fields : [],
    submissions: f.submissions,
    createdAt:   f.createdAt instanceof Date ? f.createdAt.toISOString() : f.createdAt,
    lastSubmit:  f.lastSubmit ? (f.lastSubmit instanceof Date ? f.lastSubmit.toISOString() : f.lastSubmit) : null,
  };
}

// ── 表單 CRUD ─────────────────────────────────

// GET /api/forms?companyId=N
router.get('/', async (req, res) => {
  const companyId = parseInt(req.query.companyId);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  try {
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
  const { companyId, name, description, fields } = req.body;
  if (!companyId || !name) return err(res, 'companyId, name 為必填', 400);

  try {
    const form = await prisma.form.create({
      data: {
        companyId:   parseInt(companyId),
        name,
        description: description || '',
        fields:      Array.isArray(fields) ? fields : [],
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

// PATCH /api/forms/:id — 更新（含 status toggle、fields 更新）
router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return err(res, '無效的 ID', 400);

  try {
    const data = {};
    if (req.body.name        !== undefined) data.name        = req.body.name;
    if (req.body.description !== undefined) data.description = req.body.description;
    if (req.body.status      !== undefined) data.status      = req.body.status;
    if (req.body.fields      !== undefined) data.fields      = Array.isArray(req.body.fields) ? req.body.fields : [];

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

// ── 表單提交 ─────────────────────────────────

// GET /api/forms/:id/submissions — 取得某表單所有提交
router.get('/:id/submissions', async (req, res) => {
  const formId = parseInt(req.params.id);
  if (!formId) return err(res, '無效的表單 ID', 400);

  try {
    const submissions = await prisma.formSubmission.findMany({
      where:   { formId },
      orderBy: { createdAt: 'desc' },
    });

    return ok(res, submissions.map(s => ({
      id:          s.id,
      formId:      s.formId,
      companyId:   s.companyId,
      data:        s.data || {},
      submittedBy: s.submittedBy || '',
      createdAt:   s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
    })), { total: submissions.length });
  } catch (e) {
    console.error('[forms submissions GET]', e);
    return err(res, '伺服器錯誤');
  }
});

// POST /api/forms/:id/submissions — 新增提交
router.post('/:id/submissions', async (req, res) => {
  const formId = parseInt(req.params.id);
  if (!formId) return err(res, '無效的表單 ID', 400);

  const { companyId, data, submittedBy } = req.body;
  if (!companyId) return err(res, 'companyId 為必填', 400);

  try {
    const form = await prisma.form.findUnique({ where: { id: formId } });
    if (!form) return err(res, '找不到此表單', 404);
    if (form.status !== 'active') return err(res, '此表單已停用', 400);

    const submission = await prisma.formSubmission.create({
      data: {
        formId,
        companyId: parseInt(companyId),
        data:      data || {},
        submittedBy: submittedBy || '',
      },
    });

    await prisma.form.update({
      where: { id: formId },
      data: {
        submissions: { increment: 1 },
        lastSubmit:  new Date(),
      },
    });

    return ok(res, {
      id:          submission.id,
      formId:      submission.formId,
      companyId:   submission.companyId,
      data:        submission.data,
      submittedBy: submission.submittedBy,
      createdAt:   submission.createdAt instanceof Date ? submission.createdAt.toISOString() : submission.createdAt,
    });
  } catch (e) {
    console.error('[forms submissions POST]', e);
    return err(res, '伺服器錯誤');
  }
});

// DELETE /api/forms/:formId/submissions/:subId — 刪除單筆提交
router.delete('/:formId/submissions/:subId', async (req, res) => {
  const formId = parseInt(req.params.formId);
  const subId  = parseInt(req.params.subId);
  if (!formId || !subId) return err(res, '無效的 ID', 400);

  try {
    await prisma.formSubmission.delete({ where: { id: subId } });
    await prisma.form.update({
      where: { id: formId },
      data:  { submissions: { decrement: 1 } },
    });
    return ok(res, { id: subId });
  } catch (e) {
    if (e.code === 'P2025') return err(res, '找不到此提交', 404);
    console.error('[forms submissions DELETE]', e);
    return err(res, '伺服器錯誤');
  }
});

module.exports = router;
