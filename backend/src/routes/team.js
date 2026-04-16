/**
 * /api/team — 團隊成員管理路由
 * 使用 Prisma User 模型，回傳公司成員清單＋任務統計
 */
const express = require('express');
const router  = express.Router();
const requireRole = require('../middleware/requireRole');

const ok  = (res, data, meta = {}) => res.json({ success: true, data, meta, timestamp: new Date().toISOString() });
const err = (res, msg, s = 500)   => res.status(s).json({ success: false, error: msg });

const VALID_ROLES = ['admin', 'pm', 'member'];

const prisma = require('../lib/prisma');

// GET /api/team?companyId=N — 列出所有成員（含任務統計）
router.get('/', async (req, res) => {
  const companyId = parseInt(req.query.companyId);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  try {
    const users = await prisma.user.findMany({
      where: { companyId },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      select: {
        id: true, name: true, email: true, role: true,
        department: true, jobTitle: true,
        isActive: true, lastLoginAt: true, joinedAt: true, createdAt: true,
        // 主要指派（Task.assigneeId）
        assignedTasks: {
          where: { deletedAt: null },
          select: { id: true, status: true, priority: true, dueDate: true },
        },
        // 多人協作指派（TaskAssigneeLink）
        taskAssigneeLinks: {
          where: { task: { deletedAt: null } },
          select: {
            task: { select: { id: true, status: true, priority: true, dueDate: true } },
          },
        },
        // 擁有的專案（Project.ownerId = user.id）
        ownedProjects: {
          where: { deletedAt: null },
          select: { id: true, status: true },
        },
        // 專案成員身分（ProjectMember 表）
        projectMemberships: {
          where: { project: { deletedAt: null } },
          select: {
            project: { select: { id: true, status: true } },
          },
        },
      },
    });

    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 天內

    const data = users.map(u => {
      // 合併兩種指派來源，以 task.id 去重
      const taskMap = new Map();
      for (const t of (u.assignedTasks || [])) {
        taskMap.set(t.id, t);
      }
      for (const link of (u.taskAssigneeLinks || [])) {
        if (link.task && !taskMap.has(link.task.id)) {
          taskMap.set(link.task.id, link.task);
        }
      }
      const tasks = [...taskMap.values()];

      // 進行中專案：合併 ownedProjects + projectMemberships，以 project.id 去重
      const projectSet = new Set();
      for (const p of (u.ownedProjects || [])) {
        if (p.status === 'active') projectSet.add(p.id);
      }
      for (const pm of (u.projectMemberships || [])) {
        if (pm.project.status === 'active') projectSet.add(pm.project.id);
      }
      const activeProjects = projectSet.size;

      const activeTasks = tasks.filter(t => !['done', 'cancelled'].includes(t.status)).length;
      const deadlineReminders = tasks.filter(t => {
        if (!t.dueDate || ['done', 'cancelled'].includes(t.status)) return false;
        const due = new Date(t.dueDate);
        return due <= soon; // 已逾期或 7 天內到期
      }).length;
      return {
        id:          u.id,
        name:        u.name,
        email:       u.email,
        role:        u.role,
        department:  u.department  || '未分配',
        jobTitle:    u.jobTitle    || '成員',
        isActive:    u.isActive,
        lastLoginAt: u.lastLoginAt,
        joinedAt:    u.joinedAt    || u.createdAt,
        taskStats: {
          total:     tasks.length,
          active:    activeTasks,
          completed: tasks.filter(t => t.status === 'done').length,
          overdue:   0,
          activeProjects,
          deadlineReminders,
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

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, role: true,
        department: true, jobTitle: true, phone: true,
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

// PATCH /api/team/:id — 更新成員資料（角色限制）
// - 修改 role：僅 admin
// - 修改 department / jobTitle / phone / isActive：admin 或 pm
router.patch('/:id', requireRole('admin', 'pm'), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return err(res, '無效的 id', 400);

  const { role, department, jobTitle, phone, isActive } = req.body;
  const callerRole = req.user.role;

  // 只有 admin 才能修改角色
  if (role !== undefined && callerRole !== 'admin') {
    return err(res, '只有管理員才能修改成員角色', 403);
  }

  // 只有 admin 才能啟用/停用帳號
  if (isActive !== undefined && callerRole !== 'admin') {
    return err(res, '只有管理員才能啟用或停用帳號', 403);
  }

  if (role !== undefined && !VALID_ROLES.includes(role)) {
    return err(res, `role 必須是: ${VALID_ROLES.join(', ')}`, 400);
  }

  // 防止 admin 降級/停用自己
  if (id === req.user.id || id === req.user.userId) {
    if (role !== undefined && role !== 'admin' && callerRole === 'admin') {
      return err(res, '管理員不能降級自己', 400);
    }
    if (isActive === false) {
      return err(res, '不能停用自己的帳號', 400);
    }
  }

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
