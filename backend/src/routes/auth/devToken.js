/**
 * 開發用 JWT Token 產生器
 *
 * ⚠️  僅供開發環境使用！
 *    此端點不需任何認證即可取得有效 JWT。
 *    正式環境請確保此路由被完全停用或移除。
 *
 * GET /api/auth/dev-token
 *   → 回傳一個以 APP_JWT_SECRET 簽署、代表模擬登入使用者（userId=4）的 JWT
 *   → 前端用此 token 呼叫需要 requireAuth 的 API（如 /auth/microsoft）
 */

const express = require('express');
const jwt     = require('jsonwebtoken');
const router  = express.Router();

// 僅限開發環境（NODE_ENV 不是 production 才掛載）
if (process.env.NODE_ENV === 'production') {
  router.all('*', (req, res) => {
    res.status(403).json({ error: '此端點在正式環境已停用' });
  });
} else {
  /**
   * GET /api/auth/dev-token
   * 回傳模擬使用者的 JWT（userId=4，陳志明 admin）
   */
  router.get('/', (req, res) => {
    const { JWT_SECRET: secret } = require('../../config/jwt');

    const payload = {
      userId: 4,
      sub:    '4',
      email:  'chenchiming@xcmb.com.tw',
      role:   'admin',
      name:   '陳志明',
    };

    const token = jwt.sign(payload, secret, { expiresIn: '24h' });

    return res.json({
      token,
      expiresIn: '24h',
      user: payload,
      warning: '⚠️ 此為開發用 token，請勿在正式環境使用',
    });
  });
}

module.exports = router;
