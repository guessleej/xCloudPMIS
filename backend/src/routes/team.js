/**
 * 團隊管理路由
 *
 * 端點列表：
 *   GET    /api/team              → 取得成員列表（含統計摘要）
 *   GET    /api/team/:id          → 取得成員詳情（任務、工時、專案參與）
 *   POST   /api/team              → 新增成員（預設密碼 Welcome@123）
 *   PATCH  /api/team/:id          → 更新成員資料（姓名、角色、啟用狀態）
 *   DELETE /api/team/:id          → 停用成員（軟停用，不刪除資料）
 */

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt  = require('bcryptjs');
const prisma  = new PrismaClient();

// ── 角色中文對照 ─────────────────────────────────────────────
const ROLE_LABEL = {
  admin:  '系統管理員',
  pm:     '專案經理',
  member: '一般成員',
};

// ── 狀態中文對照 ─────────────────────────────────────────────
const TASK_STATUS_LABEL = {
  todo:        '待處理',
  in_progress: '進行中',
  review:      '審查中',
  done:        '已完成',
};
const PRIORITY_LABEL = {
  low:    '低',
  medium: '中',
  high:   '高',
  urgent: '緊急',
};

// ── 工具：分鐘數轉顯示文字 ───────────────────────────────────
const fmtMinutes = (mins) => {
  if (!mins || mins <= 0) return '0 分鐘';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} 分鐘`;
  if (m === 0) return `${h} 小時`;
  return `${h} 小時 ${m} 分鐘`;
};

// ── 工具：Date → YYYY-MM-DD ──────────────────────────────────
const fmtDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

// ════════════════════════════════════════════════════════════
// GET /api/team?companyId=2
// 取得成員列表（含工作量統計）
// ════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const companyId = parseInt(req.query.companyId) || 2;

    const users = await prisma.user.findMany({
      where: { companyId },
      include: {
        // 指派中的任務（未刪除）
        assignedTasks: {
          where: { deletedAt: null },
          select: {
            id:      true,
            status:  true,
            project: { select: { id: true, name: true } },
          },
        },
        // 工時記錄（計算投入總時數）
        timeEntries: {
          where: { endedAt: { not: null } },
          select: { durationMinutes: true },
        },
      },
      orderBy: [
        { role: 'asc' },  // admin → pm → member
        { name: 'asc' },
      ],
    });

    const members = users.map(u => {
      const tasks = u.assignedTasks;

      // 任務統計
      const totalTasks     = tasks.length;
      const activeTasks    = tasks.filter(t => t.status !== 'done').length;
      const completedTasks = tasks.filter(t => t.status === 'done').length;

      // 工時統計（已完成記錄）
      const totalMinutes = u.timeEntries.reduce((s, e) => s + (e.durationMinutes || 0), 0);

      // 參與專案（去重）
      const projectSet = new Map();
      for (const t of tasks) {
        if (t.project && !projectSet.has(t.project.id)) {
          projectSet.set(t.project.id, t.project.name);
        }
      }
      const projects = Array.from(projectSet.entries()).map(([id, name]) => ({ id, name }));

      return {
        id:              u.id,
        name:            u.name,
        email:           u.email,
        role:            u.role,
        roleLabel:       ROLE_LABEL[u.role] || u.role,
        isActive:        u.isActive,
        lastLoginAt:     u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        avatarUrl:       u.avatarUrl,
        // 工作量指標
        totalTasks,
        activeTasks,
        completedTasks,
        totalMinutes,
        totalTimeDisplay: fmtMinutes(totalMinutes),
        projectCount:    projects.length,
        projects,
      };
    });

    // 公司整體統計
    const summary = {
      totalMembers:   members.length,
      activeMembers:  members.filter(m => m.isActive).length,
      adminCount:     members.filter(m => m.role === 'admin').length,
      pmCount:        members.filter(m => m.role === 'pm').length,
      memberCount:    members.filter(m => m.role === 'member').length,
      totalTasksAssigned: members.reduce((s, m) => s + m.totalTasks, 0),
      totalHoursLogged:   fmtMinutes(members.reduce((s, m) => s + m.totalMinutes, 0)),
    };

    res.json({ members, summary, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('❌ 取得成員列表失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/team/:id?companyId=2
// 取得成員詳細資料
// ════════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  try {
    const id        = parseInt(req.params.id);
    const companyId = parseInt(req.query.companyId) || 2;

    const user = await prisma.user.findFirst({
      where: { id, companyId },
      include: {
        // 所有指派任務（最多 30 筆，依狀態排序）
        assignedTasks: {
          where: { deletedAt: null },
          include: {
            project: { select: { id: true, name: true } },
          },
          orderBy: [
            { status: 'asc' },
            { priority: 'desc' },
            { dueDate: 'asc' },
          ],
          take: 30,
        },
        // 最近 10 筆工時記錄
        timeEntries: {
          where: { endedAt: { not: null } },
          include: {
            task: {
              select: {
                title:   true,
                project: { select: { name: true } },
              },
            },
          },
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
        // 管理的專案
        ownedProjects: {
          where: { deletedAt: null },
          select: { id: true, name: true, status: true },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: `找不到成員 #${id}` });
    }

    // 任務依狀態分組
    const tasksByStatus = {
      todo:        user.assignedTasks.filter(t => t.status === 'todo'),
      in_progress: user.assignedTasks.filter(t => t.status === 'in_progress'),
      review:      user.assignedTasks.filter(t => t.status === 'review'),
      done:        user.assignedTasks.filter(t => t.status === 'done'),
    };

    // 工時總計
    const totalMinutes = user.timeEntries.reduce((s, e) => s + (e.durationMinutes || 0), 0);

    const formattedTasks = user.assignedTasks.map(t => ({
      id:             t.id,
      title:          t.title,
      projectName:    t.project.name,
      status:         t.status,
      statusLabel:    TASK_STATUS_LABEL[t.status] || t.status,
      priority:       t.priority,
      priorityLabel:  PRIORITY_LABEL[t.priority] || t.priority,
      estimatedHours: t.estimatedHours ? Number(t.estimatedHours) : null,
      actualHours:    t.actualHours    ? Number(t.actualHours)    : null,
      dueDate:        fmtDate(t.dueDate),
    }));

    const formattedEntries = user.timeEntries.map(e => ({
      id:              e.id,
      taskTitle:       e.task.title,
      projectName:     e.task.project.name,
      startedAt:       e.startedAt.toISOString(),
      endedAt:         e.endedAt?.toISOString() || null,
      durationMinutes: e.durationMinutes,
      durationDisplay: fmtMinutes(e.durationMinutes),
      description:     e.description,
      date:            fmtDate(e.date),
    }));

    res.json({
      member: {
        id:           user.id,
        name:         user.name,
        email:        user.email,
        role:         user.role,
        roleLabel:    ROLE_LABEL[user.role] || user.role,
        isActive:     user.isActive,
        avatarUrl:    user.avatarUrl,
        lastLoginAt:  user.lastLoginAt?.toISOString() || null,
        createdAt:    user.createdAt.toISOString(),
        // 統計
        taskCounts: {
          total:       user.assignedTasks.length,
          todo:        tasksByStatus.todo.length,
          in_progress: tasksByStatus.in_progress.length,
          review:      tasksByStatus.review.length,
          done:        tasksByStatus.done.length,
        },
        totalMinutes,
        totalTimeDisplay: fmtMinutes(totalMinutes),
        projectCount: user.ownedProjects.length,
      },
      tasks:          formattedTasks,
      recentEntries:  formattedEntries,
      ownedProjects:  user.ownedProjects.map(p => ({
        id:     p.id,
        name:   p.name,
        status: p.status,
      })),
    });
  } catch (err) {
    console.error('❌ 取得成員詳情失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/team
// 新增成員
// Body: { companyId, name, email, role }
// 預設密碼：Welcome@123（首次登入請修改）
// ════════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  try {
    const { companyId = 2, name, email, role = 'member' } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: '缺少必要欄位：name、email' });
    }

    // 驗證 email 格式
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      return res.status(400).json({ error: 'email 格式不正確' });
    }

    // 驗證 role
    const validRoles = ['admin', 'pm', 'member'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `角色必須是 ${validRoles.join('、')} 之一` });
    }

    // 檢查 email 是否已存在
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: '此 Email 已被使用，請換一個' });
    }

    // 雜湊預設密碼
    const passwordHash = await bcrypt.hash('Welcome@123', 10);

    const user = await prisma.user.create({
      data: {
        companyId: parseInt(companyId),
        name:      name.trim(),
        email:     email.trim().toLowerCase(),
        passwordHash,
        role,
        isActive:  true,
      },
    });

    res.status(201).json({
      member: {
        id:        user.id,
        name:      user.name,
        email:     user.email,
        role:      user.role,
        roleLabel: ROLE_LABEL[user.role],
        isActive:  user.isActive,
        createdAt: user.createdAt.toISOString(),
      },
      message: `成員「${user.name}」已新增，預設密碼為 Welcome@123`,
    });
  } catch (err) {
    console.error('❌ 新增成員失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// PATCH /api/team/:id
// 更新成員資料（姓名、角色、啟用狀態）
// Body: { name?, role?, isActive? }
// ════════════════════════════════════════════════════════════
router.patch('/:id', async (req, res) => {
  try {
    const id  = parseInt(req.params.id);
    const { name, role, isActive } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: `找不到成員 #${id}` });
    }

    // 驗證 role
    if (role !== undefined) {
      const validRoles = ['admin', 'pm', 'member'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: `角色必須是 ${validRoles.join('、')} 之一` });
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(name     !== undefined && { name: name.trim() }),
        ...(role     !== undefined && { role }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
      select: {
        id: true, name: true, email: true, role: true, isActive: true, updatedAt: true,
      },
    });

    res.json({
      member: {
        ...updated,
        roleLabel: ROLE_LABEL[updated.role],
        updatedAt: updated.updatedAt.toISOString(),
      },
      message: `成員「${updated.name}」資料已更新`,
    });
  } catch (err) {
    console.error('❌ 更新成員失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

module.exports = router;
