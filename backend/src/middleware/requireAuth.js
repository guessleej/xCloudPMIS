/**
 * JWT 身分驗證中介層
 *
 * 使用方式：
 *   const requireAuth = require('../middleware/requireAuth');
 *   router.get('/protected', requireAuth, handler);
 *
 * 成功後在 req 上注入：
 *   req.user = { userId, companyId, email, role, name, sub }
 *
 * Token 來源（優先順序）：
 *   1. Authorization: Bearer <token>   ← 標準做法
 *   2. Query string:  ?token=<token>   ← 備用（WebSocket 連線用）
 */

const jwt = require('jsonwebtoken');

module.exports = function requireAuth(req, res, next) {
  // ── 取得 Token ──────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  const token = bearerToken || req.query.token || null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error:   '未授權：請先登入',
      code:    'UNAUTHORIZED',
    });
  }

  // ── 驗證 Token ─────────────────────────────────────────────
  const secret = process.env.APP_JWT_SECRET || 'xcloud-dev-secret-change-in-production';

  try {
    const decoded = jwt.verify(token, secret);
    req.user = {
      userId:    decoded.userId    || decoded.sub,
      companyId: decoded.companyId,
      email:     decoded.email,
      role:      decoded.role,
      name:      decoded.name,
      sub:       decoded.sub,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error:   'Token 已過期，請重新登入',
        code:    'TOKEN_EXPIRED',
      });
    }
    return res.status(401).json({
      success: false,
      error:   'Token 無效，請重新登入',
      code:    'TOKEN_INVALID',
    });
  }
};
