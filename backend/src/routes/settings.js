/**
 * 系統設定路由
 *
 * 端點列表：
 *   GET    /api/settings/company           → 取得公司資訊
 *   PATCH  /api/settings/company/:id       → 更新公司名稱
 *   GET    /api/settings/profile           → 取得個人資料（?userId=）
 *   PATCH  /api/settings/profile/:id       → 更新個人資料（姓名、Email、密碼）
 *   GET    /api/settings/system            → 系統健康狀態 + 資料統計
 */

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt  = require('bcryptjs');
const prisma  = new PrismaClient();

// ════════════════════════════════════════════════════════════
// GET /api/settings/company?companyId=2
// 取得公司資訊
// ════════════════════════════════════════════════════════════
router.get('/company', async (req, res) => {
  try {
    const companyId = parseInt(req.query.companyId) || 2;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id:        true,
        name:      true,
        slug:      true,
        logoUrl:   true,
        isActive:  true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!company) {
      return res.status(404).json({ error: `找不到公司 #${companyId}` });
    }

    res.json({
      company: {
        ...company,
        createdAt: company.createdAt.toISOString(),
        updatedAt: company.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('❌ 取得公司資訊失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// PATCH /api/settings/company/:id
// 更新公司名稱
// Body: { name }
// ════════════════════════════════════════════════════════════
router.patch('/company/:id', async (req, res) => {
  try {
    const id   = parseInt(req.params.id);
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: '公司名稱不能為空' });
    }

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return res.status(404).json({ error: `找不到公司 #${id}` });
    }

    const updated = await prisma.company.update({
      where: { id },
      data:  { name: name.trim() },
      select: { id: true, name: true, slug: true, updatedAt: true },
    });

    res.json({
      company:  { ...updated, updatedAt: updated.updatedAt.toISOString() },
      message:  `公司名稱已更新為「${updated.name}」`,
    });
  } catch (err) {
    console.error('❌ 更新公司名稱失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/settings/profile?userId=4
// 取得個人資料
// ════════════════════════════════════════════════════════════
router.get('/profile', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId) || 4;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id:          true,
        name:        true,
        email:       true,
        role:        true,
        isActive:    true,
        avatarUrl:   true,
        lastLoginAt: true,
        createdAt:   true,
        updatedAt:   true,
        company: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: `找不到使用者 #${userId}` });
    }

    const ROLE_LABEL = { admin: '系統管理員', pm: '專案經理', member: '一般成員' };

    res.json({
      profile: {
        ...user,
        roleLabel:   ROLE_LABEL[user.role] || user.role,
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        createdAt:   user.createdAt.toISOString(),
        updatedAt:   user.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('❌ 取得個人資料失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// PATCH /api/settings/profile/:id
// 更新個人資料
// Body: { name?, email?, currentPassword?, newPassword? }
// ════════════════════════════════════════════════════════════
router.patch('/profile/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, email, currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: `找不到使用者 #${id}` });
    }

    const updates = {};

    // ── 更新姓名 ────────────────────────────────────────────
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: '姓名不能為空' });
      updates.name = name.trim();
    }

    // ── 更新 Email ──────────────────────────────────────────
    if (email !== undefined) {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(email)) {
        return res.status(400).json({ error: 'Email 格式不正確' });
      }
      // 檢查 email 是否被其他人使用
      const existing = await prisma.user.findFirst({
        where: { email: email.trim().toLowerCase(), NOT: { id } },
      });
      if (existing) {
        return res.status(409).json({ error: '此 Email 已被其他帳號使用' });
      }
      updates.email = email.trim().toLowerCase();
    }

    // ── 更新密碼 ────────────────────────────────────────────
    if (newPassword !== undefined) {
      if (!currentPassword) {
        return res.status(400).json({ error: '請輸入目前密碼以驗證身分' });
      }
      // 驗證目前密碼
      const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ error: '目前密碼輸入有誤' });
      }
      // 新密碼長度限制
      if (newPassword.length < 6) {
        return res.status(400).json({ error: '新密碼至少需要 6 個字元' });
      }
      updates.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: '沒有要更新的資料' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data:  updates,
      select: { id: true, name: true, email: true, role: true, updatedAt: true },
    });

    res.json({
      profile: { ...updated, updatedAt: updated.updatedAt.toISOString() },
      message: '個人資料已成功更新',
      passwordChanged: !!updates.passwordHash,
    });
  } catch (err) {
    console.error('❌ 更新個人資料失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/settings/system?companyId=2
// 系統健康狀態 + 完整資料統計
// ════════════════════════════════════════════════════════════
router.get('/system', async (req, res) => {
  try {
    const companyId = parseInt(req.query.companyId) || 2;
    const startTime = Date.now();

    // ── 資料庫健康檢查 ────────────────────────────────────
    let dbStatus = 'ok';
    let dbVersion = '';
    let dbLatencyMs = 0;
    try {
      const t0 = Date.now();
      const result = await prisma.$queryRaw`SELECT version() as ver, NOW() as now`;
      dbLatencyMs = Date.now() - t0;
      dbVersion = String(result[0].ver).split(' ').slice(0, 2).join(' ');
    } catch (e) {
      dbStatus  = 'error';
      dbVersion = e.message;
    }

    // ── 資料統計（當前公司） ───────────────────────────────
    const [
      userCount,
      activeUserCount,
      projectCount,
      taskCount,
      taskDoneCount,
      milestoneCount,
      milestoneAchievedCount,
      timeEntryCount,
      completedTimeEntryCount,
      tagCount,
      commentCount,
      activityLogCount,
    ] = await Promise.all([
      prisma.user.count({ where: { companyId } }),
      prisma.user.count({ where: { companyId, isActive: true } }),
      prisma.project.count({ where: { companyId, deletedAt: null } }),
      prisma.task.count({
        where: { deletedAt: null, project: { companyId, deletedAt: null } },
      }),
      prisma.task.count({
        where: { status: 'done', deletedAt: null, project: { companyId, deletedAt: null } },
      }),
      prisma.milestone.count({
        where: { project: { companyId, deletedAt: null } },
      }),
      prisma.milestone.count({
        where: { isAchieved: true, project: { companyId, deletedAt: null } },
      }),
      prisma.timeEntry.count({
        where: { task: { project: { companyId } } },
      }),
      prisma.timeEntry.count({
        where: { endedAt: { not: null }, task: { project: { companyId } } },
      }),
      prisma.tag.count({ where: { companyId } }),
      prisma.comment.count({
        where: { deletedAt: null, task: { project: { companyId } } },
      }),
      prisma.activityLog.count({
        where: { task: { project: { companyId } } },
      }),
    ]);

    // ── 最後操作時間 ──────────────────────────────────────
    const [lastTask, lastTimeEntry, lastProject] = await Promise.all([
      prisma.task.findFirst({
        where:   { deletedAt: null, project: { companyId } },
        orderBy: { updatedAt: 'desc' },
        select:  { updatedAt: true },
      }),
      prisma.timeEntry.findFirst({
        where:   { task: { project: { companyId } } },
        orderBy: { updatedAt: 'desc' },
        select:  { updatedAt: true },
      }),
      prisma.project.findFirst({
        where:   { companyId, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        select:  { updatedAt: true },
      }),
    ]);

    const totalApiMs = Date.now() - startTime;

    res.json({
      health: {
        backend: {
          status:    'ok',
          version:   '2.0.0',
          uptime:    `${Math.floor(process.uptime())} 秒`,
          nodeVersion: process.version,
          latencyMs: totalApiMs,
        },
        database: {
          status:    dbStatus,
          version:   dbVersion,
          latencyMs: dbLatencyMs,
        },
      },
      stats: {
        users: {
          total:  userCount,
          active: activeUserCount,
        },
        projects: {
          total: projectCount,
        },
        tasks: {
          total:    taskCount,
          done:     taskDoneCount,
          doneRate: taskCount > 0 ? Math.round(taskDoneCount / taskCount * 100) : 0,
        },
        milestones: {
          total:    milestoneCount,
          achieved: milestoneAchievedCount,
        },
        timeEntries: {
          total:     timeEntryCount,
          completed: completedTimeEntryCount,
          active:    timeEntryCount - completedTimeEntryCount,
        },
        tags:         tagCount,
        comments:     commentCount,
        activityLogs: activityLogCount,
      },
      lastActivity: {
        taskUpdatedAt:      lastTask?.updatedAt?.toISOString()      || null,
        timeEntryUpdatedAt: lastTimeEntry?.updatedAt?.toISOString() || null,
        projectUpdatedAt:   lastProject?.updatedAt?.toISOString()   || null,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('❌ 系統資訊查詢失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

module.exports = router;
