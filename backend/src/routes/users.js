/**
 * /api/users — 使用者列表路由
 * GET  /api/users?companyId=N   取得公司成員清單（含 role）
 * GET  /api/users/:id           取得單一使用者
 * PATCH /api/users/:id          更新使用者基本資訊（placeholder，由 settings 頁面負責實際更新）
 * DELETE /api/users/:id         停用使用者（placeholder）
 */
const express = require('express');
const router  = express.Router();
const prisma = require('../lib/prisma');

const ok  = (res, data, meta = {}) => res.json({ success: true, data, meta, timestamp: new Date().toISOString() });
const err = (res, msg, s = 500)   => res.status(s).json({ success: false, error: msg });

// GET /api/users?companyId=N
router.get('/', async (req, res) => {
  const companyId = req.user?.companyId || parseInt(req.query.companyId);
  if (!companyId || isNaN(companyId)) return err(res, 'companyId 為必填', 400);

  try {
    const users = await prisma.user.findMany({
      where:   { companyId, isActive: true },
      select:  { id: true, name: true, email: true, role: true, isActive: true },
      orderBy: { name: 'asc' },
    });
    ok(res, users, { total: users.length });
  } catch (e) {
    console.error('[users] GET /', e.message);
    err(res, e.message);
  }
});

// POST /api/users  （預留給管理員新增使用者，目前由 auth 路由處理）
router.post('/', (req, res) => res.json({ success: true, data: null, message: '請透過 /api/auth/register 建立使用者' }));

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return err(res, '無效的使用者 ID', 400);

  try {
    const user = await prisma.user.findUnique({
      where:  { id },
      select: { id: true, name: true, email: true, role: true, isActive: true, companyId: true },
    });
    if (!user) return err(res, `找不到使用者 #${id}`, 404);
    ok(res, user);
  } catch (e) {
    console.error('[users] GET /:id', e.message);
    err(res, e.message);
  }
});

// PATCH /api/users/:id  （輕量更新，完整個人資料由 /api/settings 處理）
router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return err(res, '無效的使用者 ID', 400);

  const { name, role } = req.body;
  const data = {};
  if (name      !== undefined) data.name      = name.trim();
  if (role      !== undefined) data.role      = role;

  try {
    const user = await prisma.user.update({ where: { id }, data,
      select: { id: true, name: true, email: true, role: true },
    });
    ok(res, user);
  } catch (e) {
    console.error('[users] PATCH /:id', e.message);
    err(res, e.message);
  }
});

// DELETE /api/users/:id  （軟停用）
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return err(res, '無效的使用者 ID', 400);

  try {
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    res.json({ success: true, message: `使用者 #${id} 已停用` });
  } catch (e) {
    console.error('[users] DELETE /:id', e.message);
    err(res, e.message);
  }
});

module.exports = router;
