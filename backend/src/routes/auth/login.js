/**
 * 身分驗證路由
 * POST /api/auth/login              → Email/密碼登入，回傳 JWT
 * GET  /api/auth/me                 → 驗證 token 並回傳當前使用者
 * POST /api/auth/logout             → 登出（前端清除 token）
 *
 * OAuth 登入路由（子路由掛載）
 * GET  /api/auth/microsoft          → 啟動 Microsoft OAuth
 * GET  /api/auth/microsoft/callback → Microsoft OAuth 回呼
 * GET  /api/auth/google             → 啟動 Google OAuth
 * GET  /api/auth/google/callback    → Google OAuth 回呼
 * GET  /api/auth/github             → 啟動 GitHub OAuth
 * GET  /api/auth/github/callback    → GitHub OAuth 回呼
 */
const express = require('express');
const router = express.Router();

// ── OAuth 子路由 ──────────────────────────────────────────────
router.use('/microsoft', require('./microsoftOAuth'));
router.use('/google',    require('./google'));
router.use('/github',    require('./github'));
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const { JWT_SECRET, JWT_EXPIRES } = require('../../config/jwt');

// ── 登入 ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: '請輸入 Email 和密碼' });
    }

    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim() },
      include: { company: { select: { id: true, name: true, slug: true } } },
    });

    if (!user) {
      return res.status(401).json({ error: 'Email 或密碼錯誤' });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: '帳號已停用，請聯絡管理員' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Email 或密碼錯誤' });
    }

    // 更新最後登入時間
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }).catch(() => {});

    const payload = {
      id:        user.id,
      email:     user.email,
      name:      user.name,
      role:      user.role,
      companyId: user.companyId,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    res.json({
      token,
      user: {
        ...payload,
        company: user.company,
        department: user.department,
        jobTitle:   user.jobTitle,
        phone:      user.phone,
      },
    });
  } catch (err) {
    console.error('[auth/login] 登入失敗:', err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// ── 取得當前使用者 ─────────────────────────────────────────────
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供認證 Token' });
  }
  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { company: { select: { id: true, name: true, slug: true } } },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Token 無效或帳號已停用' });
    }
    res.json({
      user: {
        id:         user.id,
        email:      user.email,
        name:       user.name,
        role:       user.role,
        companyId:  user.companyId,
        company:    user.company,
        department: user.department,
        jobTitle:   user.jobTitle,
        phone:      user.phone,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (err) {
    res.status(401).json({ error: 'Token 無效或已過期' });
  }
});

// ── 登出 ──────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.json({ success: true, message: '已登出' });
});

module.exports = router;
