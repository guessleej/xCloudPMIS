/**
 * 身分驗證路由
 * GET  /api/auth/me                 → 驗證 token 並回傳當前使用者
 * POST /api/auth/logout             → 登出（前端清除 token）
 *
 * OAuth 登入路由（子路由掛載）
 * GET  /api/auth/microsoft          → 啟動 Microsoft OAuth
 * GET  /api/auth/microsoft/callback → Microsoft OAuth 回呼
 *
 * 本系統僅支援 Microsoft OAuth 登入，不提供帳號密碼登入。
 */
const express = require('express');
const router = express.Router();

// ── OAuth 子路由（僅 Microsoft）───────────────────────────────
router.use('/microsoft', require('./microsoftOAuth'));

const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
const { JWT_SECRET, JWT_EXPIRES } = require('../../config/jwt');

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
