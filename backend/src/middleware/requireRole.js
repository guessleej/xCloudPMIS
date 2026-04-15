/**
 * requireRole — 角色授權中介層
 *
 * 使用方式：
 *   const requireRole = require('../middleware/requireRole');
 *
 *   // 單一角色
 *   router.post('/', requireRole('admin'), handler);
 *
 *   // 多角色（任一符合即通過）
 *   router.post('/', requireRole('admin', 'pm'), handler);
 *
 * 前提：必須先掛 requireAuth，確保 req.user 存在
 *
 * 角色層級（高→低）：admin > pm > member
 */

const prisma = require('../lib/prisma');

/**
 * 建立角色檢查中介函式
 * @param  {...string} allowedRoles - 允許的角色列表
 * @returns {Function} Express middleware
 */
function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    // 必須有 req.user（requireAuth 已注入）
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error:   '未授權：請先登入',
        code:    'UNAUTHORIZED',
      });
    }

    // 不信任 JWT payload，直接查 DB 確認角色（防止 token 過時）
    try {
      const dbUser = await prisma.user.findUnique({
        where:  { id: req.user.id },
        select: { role: true, isActive: true },
      });

      if (!dbUser) {
        return res.status(401).json({
          success: false,
          error:   '查無此使用者',
          code:    'USER_NOT_FOUND',
        });
      }

      if (!dbUser.isActive) {
        return res.status(403).json({
          success: false,
          error:   '帳號已停用',
          code:    'ACCOUNT_DISABLED',
        });
      }

      // 用 DB 中的角色覆蓋 JWT payload（確保最新）
      req.user.role = dbUser.role;

      if (!allowedRoles.includes(dbUser.role)) {
        const roleLabels = { admin: '管理員', pm: '專案經理', member: '一般成員' };
        const needed = allowedRoles.map(r => roleLabels[r] || r).join(' 或 ');
        return res.status(403).json({
          success: false,
          error:   `權限不足：此操作需要${needed}角色`,
          code:    'FORBIDDEN',
        });
      }

      next();
    } catch (err) {
      console.error('[requireRole] DB 查詢失敗:', err.message);
      return res.status(500).json({
        success: false,
        error:   '權限驗證失敗',
        code:    'ROLE_CHECK_ERROR',
      });
    }
  };
}

module.exports = requireRole;
