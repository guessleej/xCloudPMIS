/**
 * /api/team — 團隊成員管理路由
 * 使用 Prisma User 模型，回傳公司成員清單＋任務統計
 */
const express = require('express');
const router  = express.Router();

const ok  = (res, data, meta = {}) => res.json({ success: true, data, meta, timestamp: new Date().toISOString() });
const err = (res, msg, s = 500)   => res.status(s).json({ success: false, error: msg });

const VALID_ROLES = ['admin', 'pm', 'member'];

function getPrisma() {
  try {
    const { PrismaClient } = require('@prisma/client');
    return new PrismaClient();
  } catch {
    return null;
  }
}

// 若公司成員不足，自動補充示範成員
async function seedDemoMembers(prisma, companyId) {
  const count = await prisma.user.count({ where: { companyId } });
  if (count >= 5) return;

  const bcrypt = (() => { try { return require('bcrypt'); } catch { return null; } })();
  const hashPw = async (pw) => bcrypt ? await bcrypt.hash(pw, 10) : '$2b$10$demohashdemohashdemohaLKvzGQq1e2RkP3g7OFdlxLyKzB3vTxq';

  const demos = [
    { name: '陳雅琪', email: 'yachi@pmis.com',   role: 'pm',     department: '產品管理部', jobTitle: '產品經理',     joinedAt: new Date('2023-03-01') },
    { name: '林志偉', email: 'zhiwei@pmis.com',  role: 'member', department: '前端開發部', jobTitle: '資深前端工程師', joinedAt: new Date('2023-05-15') },
    { name: '王淑芬', email: 'shufen@pmis.com',  role: 'member', department: '後端開發部', jobTitle: '後端工程師',    joinedAt: new Date('2023-07-20') },
    { name: '張建宏', email: 'jianhong@pmis.com',role: 'pm',     department: '專案管理部', jobTitle: '專案協理',      joinedAt: new Date('2022-11-01') },
    { name: '李美玲', email: 'meiling@pmis.com', role: 'member', department: '設計部',     jobTitle: 'UI/UX 設計師',  joinedAt: new Date('2024-01-10') },
    { name: '吳宗翰', email: 'zonghan@pmis.com', role: 'member', department: '後端開發部', jobTitle: 'DevOps 工程師', joinedAt: new Date('2024-03-05') },
  ];

  const pw = await hashPw('Demo1234!');
  for (const d of demos) {
    try {
      await prisma.user.upsert({
        where: { email: d.email },
        update: {},
        create: { ...d, companyId, passwordHash: pw, isActive: true },
      });
    } catch { /* skip on conflict */ }
  }
}

// GET /api/team?companyId=N — 列出所有成員（含任務統計）
router.get('/', async (req, res) => {
  const companyId = parseInt(req.query.companyId);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  const prisma = getPrisma();
  if (!prisma) return err(res, 'Prisma 未設定', 503);

  try {
    await seedDemoMembers(prisma, companyId);

    const users = await prisma.user.findMany({
      where: { companyId },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      select: {
        id: true, name: true, email: true, role: true,
        department: true, jobTitle: true, avatarUrl: true,
        isActive: true, lastLoginAt: true, joinedAt: true, createdAt: true,
        assignedTasks: {
          select: { id: true, status: true, priority: true },
        },
      },
    });

    const data = users.map(u => {
      const tasks = u.assignedTasks || [];
      return {
        id:          u.id,
        name:        u.name,
        email:       u.email,
        role:        u.role,
        department:  u.department  || '未分配',
        jobTitle:    u.jobTitle    || '成員',
        avatarUrl:   u.avatarUrl   || null,
        isActive:    u.isActive,
        lastLoginAt: u.lastLoginAt,
        joinedAt:    u.joinedAt    || u.createdAt,
        taskStats: {
          total:     tasks.length,
          active:    tasks.filter(t => !['done', 'cancelled'].includes(t.status)).length,
          completed: tasks.filter(t => t.status === 'done').length,
          overdue:   0, // 簡化：不計逾期
        },
      };
    });

    const meta = {
      total:    data.length,
      active:   data.filter(u => u.isActive).length,
      admins:   data.filter(u => u.role === 'admin').length,
      pms:      data.filter(u => u.role === 'pm').length,
      members:  data.filter(u => u.role === 'member').length,
    };

    return ok(res, data, meta);
  } catch (e) {
    console.error('[team GET]', e.message);
    return err(res, e.message);
  } finally {
    await prisma.$disconnect();
  }
});

// GET /api/team/:id — 取得單一成員
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return err(res, '無效的 id', 400);

  const prisma = getPrisma();
  if (!prisma) return err(res, 'Prisma 未設定', 503);

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, role: true,
        department: true, jobTitle: true, phone: true, avatarUrl: true,
        isActive: true, lastLoginAt: true, joinedAt: true, createdAt: true,
        assignedTasks: { select: { id: true, status: true, priority: true, title: true, dueDate: true } },
      },
    });
    if (!user) return err(res, '找不到成員', 404);
    return ok(res, user);
  } catch (e) {
    console.error('[team GET/:id]', e.message);
    return err(res, e.message);
  } finally {
    await prisma.$disconnect();
  }
});

// PATCH /api/team/:id — 更新成員資料（role / department / jobTitle / isActive）
router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return err(res, '無效的 id', 400);

  const { role, department, jobTitle, phone, isActive } = req.body;

  if (role !== undefined && !VALID_ROLES.includes(role)) {
    return err(res, `role 必須是: ${VALID_ROLES.join(', ')}`, 400);
  }

  const prisma = getPrisma();
  if (!prisma) return err(res, 'Prisma 未設定', 503);

  try {
    const updateData = {};
    if (role       !== undefined) updateData.role       = role;
    if (department !== undefined) updateData.department = department;
    if (jobTitle   !== undefined) updateData.jobTitle   = jobTitle;
    if (phone      !== undefined) updateData.phone      = phone;
    if (isActive   !== undefined) updateData.isActive   = isActive;

    const user = await prisma.user.update({ where: { id }, data: updateData });
    return ok(res, user);
  } catch (e) {
    console.error('[team PATCH]', e.message);
    return err(res, e.message);
  } finally {
    await prisma.$disconnect();
  }
});

module.exports = router;
