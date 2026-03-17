/**
 * 使用者登入 API
 *
 * POST /api/auth/login
 *   Body   : { email, password }
 *   成功回應: { success, token, user, expiresIn }
 *   失敗回應: { success: false, error }
 *
 * GET /api/auth/me
 *   Header : Authorization: Bearer <token>
 *   成功回應: { success, user }
 *   → 前端啟動時驗證 token 是否仍有效
 *
 * POST /api/auth/logout
 *   (JWT 為 stateless，後端只回傳 200；前端自行清除 localStorage)
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const router   = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma   = new PrismaClient();

// ── 工具函式 ─────────────────────────────────────────────────
const ok  = (res, data, status = 200) =>
  res.status(status).json({ success: true, ...data });

const fail = (res, message, status = 400) =>
  res.status(status).json({ success: false, error: message });

// 角色中文對照
const ROLE_LABEL = {
  admin:  '系統管理員',
  pm:     '專案經理',
  member: '一般成員',
};

// 從 User 物件建構「安全的使用者資訊」（不含密碼雜湊）
function buildUserPayload(user) {
  return {
    id:         user.id,
    companyId:  user.companyId,
    name:       user.name,
    email:      user.email,
    role:       user.role,
    roleLabel:  ROLE_LABEL[user.role] || user.role,
    avatarUrl:  user.avatarUrl   || null,
    department: user.department  || null,
    phone:      user.phone       || null,
    jobTitle:   user.jobTitle    || null,
    joinedAt:   user.joinedAt    ? user.joinedAt.toISOString().split('T')[0] : null,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    company: {
      id:   user.company?.id   || user.companyId,
      name: user.company?.name || '',
      slug: user.company?.slug || '',
    },
  };
}

// ════════════════════════════════════════════════════════════
// POST /api/auth/login
// ════════════════════════════════════════════════════════════
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // ── 基本驗證 ────────────────────────────────────────────
    if (!email || !password) {
      return fail(res, 'Email 與密碼為必填欄位', 400);
    }

    // ── 查詢使用者 ──────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: {
        company: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!user) {
      return fail(res, 'Email 或密碼不正確', 401);
    }

    if (!user.isActive) {
      return fail(res, '此帳號已停用，請聯絡系統管理員', 403);
    }

    // ── 密碼驗證 ────────────────────────────────────────────
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return fail(res, 'Email 或密碼不正確', 401);
    }

    // ── 產生 JWT ────────────────────────────────────────────
    const secret = process.env.APP_JWT_SECRET || 'xcloud-dev-secret-change-in-production';
    const payload = {
      sub:       String(user.id),
      userId:    user.id,
      companyId: user.companyId,
      email:     user.email,
      role:      user.role,
      name:      user.name,
    };

    const token = jwt.sign(payload, secret, { expiresIn: '7d' });

    // ── 更新最後登入時間 ─────────────────────────────────────
    await prisma.user.update({
      where: { id: user.id },
      data:  { lastLoginAt: new Date() },
    });

    const userInfo = buildUserPayload(user);

    console.log(`✅ [login] ${user.email} 登入成功（${ROLE_LABEL[user.role]}）`);

    return ok(res, {
      token,
      expiresIn: '7d',
      user: userInfo,
    });

  } catch (e) {
    console.error('[login] 錯誤：', e.message);
    return fail(res, '伺服器錯誤，請稍後再試', 500);
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/auth/me
// 前端重新整理時驗證 token 是否有效，並取得最新使用者資料
// ════════════════════════════════════════════════════════════
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return fail(res, '請先登入', 401);
    }

    const secret = process.env.APP_JWT_SECRET || 'xcloud-dev-secret-change-in-production';
    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch {
      return fail(res, 'Token 已失效，請重新登入', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        company: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!user || !user.isActive) {
      return fail(res, '帳號不存在或已停用', 401);
    }

    return ok(res, { user: buildUserPayload(user) });

  } catch (e) {
    console.error('[me] 錯誤：', e.message);
    return fail(res, '伺服器錯誤', 500);
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/auth/logout
// JWT 為 stateless，後端只記錄 log，前端自行清除 localStorage
// ════════════════════════════════════════════════════════════
router.post('/logout', (req, res) => {
  // 可在此處將 token 加入黑名單（Redis）以實現真正的登出
  // 目前僅回傳成功，前端負責清除 localStorage
  return ok(res, { message: '已登出' });
});

module.exports = router;
