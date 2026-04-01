/**
 * optionalAuth — 選用 JWT 驗證中介層
 * 有 Token 時解析並注入 req.user，無 Token 時直接繼續
 */
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');

module.exports = function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
  } catch (_) {
    // token 無效或過期 → 忽略，繼續執行
  }
  next();
};
