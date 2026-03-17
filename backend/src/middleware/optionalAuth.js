/**
 * Optional JWT 身分驗證中介層
 *
 * 與 requireAuth 的差異：
 *   - Token 不存在或無效 → 繼續執行（不返回 401）
 *   - Token 有效 → 注入 req.user（同 requireAuth）
 *
 * 使用場景：
 *   - API 路由需要在「已登入時」使用 req.user.companyId
 *   - 路由對外也支援 query param 作為備援（向後相容）
 */

const jwt = require('jsonwebtoken');

module.exports = function optionalAuth(req, res, next) {
  const authHeader  = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;
  const token = bearerToken || req.query.token || null;

  if (!token) return next();   // 沒有 Token → 跳過，繼續執行

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
  } catch (_) {
    // Token 無效或過期 → 忽略，不設定 req.user
  }

  next();
};
