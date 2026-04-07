/**
 * routes/admin/users.js — 使用者帳號管理 API（Admin 專用）
 * ─────────────────────────────────────────────────────────────
 *
 * 所有端點需要：
 *   1. JWT 驗證（Authorization: Bearer <token>）
 *   2. 角色為 admin
 *
 * 端點清單：
 *   GET    /api/admin/users              — 使用者列表（含搜尋/篩選/分頁）
 *   POST   /api/admin/users              — 建立新使用者
 *   GET    /api/admin/users/:id          — 取得使用者詳情（含 OAuth 帳號清單）
 *   PUT    /api/admin/users/:id          — 更新使用者資料
 *   PATCH  /api/admin/users/:id/toggle   — 停用 / 啟用使用者
 *   POST   /api/admin/users/:id/reset-password — 重設密碼
 *   DELETE /api/admin/users/:id/oauth/:provider — 取消連結指定 OAuth 帳號
 *   GET    /api/admin/users/stats        — 統計數字（總人數、各角色數、本月新增）
 */

const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma  = new PrismaClient();
const requireAuth = require('../../middleware/requireAuth');

// ── 工具函式 ─────────────────────────────────────────────────
const ok   = (res, data, meta = {}) =>
  res.json({ success: true, data, meta, timestamp: new Date().toISOString() });
const fail = (res, msg, status = 400) =>
  res.status(status).json({ success: false, error: msg });

const ROLE_LABEL = { admin: '系統管理員', pm: '專案經理', member: '一般成員' };
const VALID_ROLES = ['admin', 'pm', 'member'];

// ── Admin 驗證中間件（從 DB 即時確認角色）──────────────────
async function requireAdmin(req, res, next) {
  if (!req.user) return fail(res, '請先登入', 401);

  // JWT payload 可能是舊版本，不一定有 role → 直接查 DB
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: Number(req.user.id) },
      select: { role: true, isActive: true },
    });
    if (!dbUser || !dbUser.isActive) return fail(res, '帳號不存在或已停用', 403);
    if (dbUser.role !== 'admin') return fail(res, '此操作需要管理員權限', 403);

    // 同步更新 req.user.role 供後續使用
    req.user.role = dbUser.role;
    next();
  } catch (e) {
    console.error('[requireAdmin] DB 查詢失敗:', e.message);
    return fail(res, '權限驗證失敗', 500);
  }
}

// 所有路由都需要 JWT + Admin
router.use(requireAuth);
router.use(requireAdmin);

// ── 使用者安全欄位選取 ──────────────────────────────────────
const USER_SELECT = {
  id:         true,
  companyId:  true,
  name:       true,
  email:      true,
  role:       true,
  avatarUrl:  true,
  isActive:   true,
  department: true,
  phone:      true,
  jobTitle:   true,
  joinedAt:   true,
  lastLoginAt:true,
  createdAt:  true,
  updatedAt:  true,
  company:    { select: { id: true, name: true, slug: true } },
  // OAuthToken：每人最多一個（Microsoft），僅保留非敏感欄位
  oauthToken: {
    select: {
      id:             true,
      provider:       true,
      microsoftEmail: true,
      isActive:       true,
      createdAt:      true,
    },
  },
};

function formatUser(user) {
  return {
    ...user,
    roleLabel:  ROLE_LABEL[user.role] || user.role,
    joinedAt:   user.joinedAt   ? user.joinedAt.toISOString().split('T')[0] : null,
    lastLoginAt:user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt:  user.createdAt.toISOString(),
    updatedAt:  user.updatedAt.toISOString(),
    // oauthToken 是單一物件（非陣列），轉成 oauthProviders 陣列供前端使用
    oauthProviders: user.oauthToken ? [user.oauthToken.provider] : [],
  };
}

// ════════════════════════════════════════════════════════════
// GET /api/admin/users
// 使用者列表（含搜尋/篩選/分頁）
// Query: ?search=&role=&isActive=&page=1&pageSize=20&sortBy=createdAt&sortDir=desc
// ════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const {
      search   = '',
      role,
      isActive,
      page     = '1',
      pageSize  = '20',
      sortBy   = 'createdAt',
      sortDir  = 'desc',
    } = req.query;

    const companyId = req.user.companyId;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const take = Math.min(parseInt(pageSize), 100);

    // 建立查詢條件
    const where = { companyId };

    if (search.trim()) {
      where.OR = [
        { name:      { contains: search.trim(), mode: 'insensitive' } },
        { email:     { contains: search.trim(), mode: 'insensitive' } },
        { department:{ contains: search.trim(), mode: 'insensitive' } },
        { jobTitle:  { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    if (role && VALID_ROLES.includes(role)) {
      where.role = role;
    }

    if (isActive !== undefined && isActive !== '') {
      where.isActive = isActive === 'true';
    }

    // 排序欄位白名單
    const allowedSort = ['name', 'email', 'role', 'createdAt', 'lastLoginAt'];
    const orderBy = {
      [allowedSort.includes(sortBy) ? sortBy : 'createdAt']: sortDir === 'asc' ? 'asc' : 'desc',
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, select: USER_SELECT, skip, take, orderBy }),
      prisma.user.count({ where }),
    ]);

    return ok(res, users.map(formatUser), {
      total,
      page:     parseInt(page),
      pageSize: take,
      pages:    Math.ceil(total / take),
    });

  } catch (e) {
    console.error('[admin/users] list 錯誤:', e.message);
    return fail(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/admin/users/stats
// 統計數字（在 /:id 前定義，避免 id='stats' 被解析）
// ════════════════════════════════════════════════════════════
router.get('/stats', async (req, res) => {
  try {
    const companyId = req.user.companyId;

    const [total, byRole, active, thisMonth] = await Promise.all([
      prisma.user.count({ where: { companyId } }),
      prisma.user.groupBy({
        by:    ['role'],
        where: { companyId },
        _count: { id: true },
      }),
      prisma.user.count({ where: { companyId, isActive: true } }),
      prisma.user.count({
        where: {
          companyId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    const roleStats = {};
    byRole.forEach(r => { roleStats[r.role] = r._count.id; });

    return ok(res, {
      total,
      active,
      inactive: total - active,
      thisMonth,
      byRole: {
        admin:  roleStats.admin  || 0,
        pm:     roleStats.pm     || 0,
        member: roleStats.member || 0,
      },
    });

  } catch (e) {
    console.error('[admin/users] stats 錯誤:', e.message);
    return fail(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/admin/users
// 建立新使用者
// Body: { name, email, password, role, department?, phone?, jobTitle?, joinedAt? }
// ════════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  try {
    const {
      name, email, password, role = 'member',
      department, phone, jobTitle, joinedAt,
    } = req.body;

    // ── 基本驗證 ────────────────────────────────────────────
    if (!name?.trim())   return fail(res, '姓名為必填');
    if (!email?.trim())  return fail(res, 'Email 為必填');
    if (!password)       return fail(res, '密碼為必填');
    if (password.length < 8) return fail(res, '密碼至少 8 個字元');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return fail(res, 'Email 格式不正確');
    }
    if (!VALID_ROLES.includes(role)) {
      return fail(res, `角色必須是：${VALID_ROLES.join(' / ')}`);
    }

    const companyId    = req.user.companyId;
    const normalEmail  = email.trim().toLowerCase();

    // ── 檢查 Email 是否重複 ──────────────────────────────────
    const existing = await prisma.user.findUnique({ where: { email: normalEmail } });
    if (existing) return fail(res, '此 Email 已被使用', 409);

    // ── 雜湊密碼 ────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(password, 12);

    // ── 建立使用者 ──────────────────────────────────────────
    const newUser = await prisma.user.create({
      data: {
        companyId,
        name:         name.trim(),
        email:        normalEmail,
        passwordHash,
        role,
        department:   department || null,
        phone:        phone      || null,
        jobTitle:     jobTitle   || null,
        joinedAt:     joinedAt   ? new Date(joinedAt) : null,
      },
      select: USER_SELECT,
    });

    console.log(`✅ [admin/users] 建立使用者：${normalEmail}（${role}），by ${req.user.email}`);
    return ok(res, formatUser(newUser), {});

  } catch (e) {
    console.error('[admin/users] create 錯誤:', e.message);
    if (e.code === 'P2002') return fail(res, '此 Email 已被使用', 409);
    return fail(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/admin/users/:id
// 取得使用者詳情
// ════════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  try {
    const id        = parseInt(req.params.id);
    const companyId = req.user.companyId;

    if (isNaN(id)) return fail(res, '無效的使用者 ID');

    const user = await prisma.user.findFirst({
      where:  { id, companyId },
      select: USER_SELECT,
    });

    if (!user) return fail(res, '找不到此使用者', 404);

    return ok(res, formatUser(user));

  } catch (e) {
    console.error('[admin/users] get 錯誤:', e.message);
    return fail(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════
// PUT /api/admin/users/:id
// 更新使用者資料（姓名、Email、角色、部門、電話、職稱）
// ════════════════════════════════════════════════════════════
router.put('/:id', async (req, res) => {
  try {
    const id        = parseInt(req.params.id);
    const companyId = req.user.companyId;

    if (isNaN(id)) return fail(res, '無效的使用者 ID');

    const existing = await prisma.user.findFirst({ where: { id, companyId } });
    if (!existing) return fail(res, '找不到此使用者', 404);

    // 禁止管理員停用/降級自己（透過 PUT 修改 role/isActive）
    if (id === req.user.id && req.body.role && req.body.role !== 'admin') {
      return fail(res, '不能修改自己的角色');
    }

    const {
      name, email, role,
      department, phone, jobTitle, joinedAt, avatarUrl,
    } = req.body;

    const updateData = {};
    if (name       !== undefined) updateData.name       = name.trim();
    if (role       !== undefined) {
      if (!VALID_ROLES.includes(role)) return fail(res, `角色必須是：${VALID_ROLES.join(' / ')}`);
      updateData.role = role;
    }
    if (department !== undefined) updateData.department = department || null;
    if (phone      !== undefined) updateData.phone      = phone      || null;
    if (jobTitle   !== undefined) updateData.jobTitle   = jobTitle   || null;
    if (joinedAt   !== undefined) updateData.joinedAt   = joinedAt ? new Date(joinedAt) : null;
    if (avatarUrl  !== undefined) updateData.avatarUrl  = avatarUrl  || null;

    // Email 更新需確認不重複
    if (email !== undefined) {
      const normalEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalEmail)) {
        return fail(res, 'Email 格式不正確');
      }
      const dup = await prisma.user.findFirst({
        where: { email: normalEmail, NOT: { id } },
      });
      if (dup) return fail(res, '此 Email 已被其他帳號使用', 409);
      updateData.email = normalEmail;
    }

    const updated = await prisma.user.update({
      where:  { id },
      data:   updateData,
      select: USER_SELECT,
    });

    console.log(`✅ [admin/users] 更新使用者：id=${id}，by ${req.user.email}`);
    return ok(res, formatUser(updated));

  } catch (e) {
    console.error('[admin/users] update 錯誤:', e.message);
    if (e.code === 'P2002') return fail(res, '此 Email 已被使用', 409);
    return fail(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════
// PATCH /api/admin/users/:id/toggle
// 停用 / 啟用使用者
// ════════════════════════════════════════════════════════════
router.patch('/:id/toggle', async (req, res) => {
  try {
    const id        = parseInt(req.params.id);
    const companyId = req.user.companyId;

    if (isNaN(id)) return fail(res, '無效的使用者 ID');
    if (id === req.user.id) return fail(res, '不能停用自己的帳號');

    const existing = await prisma.user.findFirst({ where: { id, companyId } });
    if (!existing) return fail(res, '找不到此使用者', 404);

    const updated = await prisma.user.update({
      where:  { id },
      data:   { isActive: !existing.isActive },
      select: USER_SELECT,
    });

    const action = updated.isActive ? '啟用' : '停用';
    console.log(`✅ [admin/users] ${action}使用者：id=${id}（${existing.email}），by ${req.user.email}`);
    return ok(res, formatUser(updated));

  } catch (e) {
    console.error('[admin/users] toggle 錯誤:', e.message);
    return fail(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/admin/users/:id/reset-password
// 重設密碼
// Body: { newPassword, confirmPassword? }
// ════════════════════════════════════════════════════════════
router.post('/:id/reset-password', async (req, res) => {
  try {
    const id        = parseInt(req.params.id);
    const companyId = req.user.companyId;

    if (isNaN(id)) return fail(res, '無效的使用者 ID');

    const { newPassword, confirmPassword } = req.body;

    if (!newPassword)            return fail(res, '新密碼為必填');
    if (newPassword.length < 8)  return fail(res, '新密碼至少 8 個字元');
    if (confirmPassword !== undefined && confirmPassword !== newPassword) {
      return fail(res, '兩次密碼不一致');
    }

    const existing = await prisma.user.findFirst({ where: { id, companyId } });
    if (!existing) return fail(res, '找不到此使用者', 404);

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id },
      data:  { passwordHash },
    });

    console.log(`✅ [admin/users] 重設密碼：id=${id}（${existing.email}），by ${req.user.email}`);
    return ok(res, { message: `已成功重設 ${existing.name} 的密碼` });

  } catch (e) {
    console.error('[admin/users] reset-password 錯誤:', e.message);
    return fail(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════
// DELETE /api/admin/users/:id/oauth/:provider
// 取消連結指定 OAuth 帳號（Google / GitHub / Microsoft）
// ════════════════════════════════════════════════════════════
router.delete('/:id/oauth/:provider', async (req, res) => {
  try {
    const id        = parseInt(req.params.id);
    const provider  = req.params.provider;
    const companyId = req.user.companyId;

    if (isNaN(id)) return fail(res, '無效的使用者 ID');

    const existing = await prisma.user.findFirst({ where: { id, companyId } });
    if (!existing) return fail(res, '找不到此使用者', 404);

    // 若使用者沒有密碼且有 OAuth Token，拒絕取消（避免帳號無法登入）
    const oauthToken = await prisma.oAuthToken.findUnique({ where: { userId: id } });
    const hasPassword = !!existing.passwordHash;

    if (!hasPassword && oauthToken) {
      return fail(res, '此使用者沒有密碼，取消 OAuth 連結將導致無法登入，請先設定密碼');
    }

    if (!oauthToken || oauthToken.provider !== provider) {
      return fail(res, `此使用者尚未連結 ${provider} 帳號`, 404);
    }

    await prisma.oAuthToken.delete({ where: { userId: id } });
    const deleted = { count: 1 };

    console.log(`✅ [admin/users] 取消 OAuth 連結：id=${id} provider=${provider}，by ${req.user.email}`);
    return ok(res, { message: `已取消 ${existing.name} 的 ${provider} 帳號連結` });

  } catch (e) {
    console.error('[admin/users] delete-oauth 錯誤:', e.message);
    return fail(res, e.message, 500);
  }
});

module.exports = router;
