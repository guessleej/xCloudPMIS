/**
 * middleware/oauthAuth.js
 * ─────────────────────────────────────────────────────────────
 * OAuth 2.0 Delegated 授權相關中介軟體
 *
 * 提供三個中介軟體函式：
 *
 *   requireAuth       — 驗證 JWT（設定 req.user）
 *   requireOAuth(scopes?) — 確認用戶已連接 Microsoft OAuth（選擇性驗證 scopes）
 *   optionalOAuth     — 若已連接則附加 OAuth 資訊到 req，未連接不失敗
 *
 * JWT 設計：
 *   ┌─────────────────────────────────────────────────────┐
 *   │  Header: Authorization: Bearer <jwt-token>          │
 *   │  Payload: { userId, email, role, sub, iat, exp }    │
 *   │  Secret:  APP_JWT_SECRET 環境變數（必填）             │
 *   └─────────────────────────────────────────────────────┘
 *
 * OAuth 狀態由 tokenManager.getUserTokenInfo(userId) 提供：
 *   - connected: boolean
 *   - scopes: string[]
 *   - expiresAt, connectedAt, lastRefreshedAt
 *
 * 使用範例：
 *   const { requireAuth, requireOAuth, optionalOAuth } = require('../middleware/oauthAuth');
 *
 *   // 需要登入
 *   router.get('/profile', requireAuth, handler);
 *
 *   // 需要登入 + 已連接 Microsoft
 *   router.post('/calendar', requireAuth, requireOAuth(), handler);
 *
 *   // 需要特定 scope
 *   router.post('/send-email', requireAuth, requireOAuth(['Mail.Send']), handler);
 *
 *   // 選擇性 OAuth（登入即可，未連接 MS 也沒關係）
 *   router.get('/dashboard', requireAuth, optionalOAuth, handler);
 *
 * 環境變數：
 *   APP_JWT_SECRET    — JWT 簽名密鑰（必填）
 */

'use strict';

const jwt = require('jsonwebtoken');
const { getUserTokenInfo } = require('../services/tokenManager');

// ════════════════════════════════════════════════════════════
// requireAuth — JWT 驗證
// ════════════════════════════════════════════════════════════

/**
 * 驗證 Authorization: Bearer <jwt> 標頭
 *
 * 成功時設定：
 *   req.user = { userId: number, email: string, role: string }
 *
 * 失敗時回傳：
 *   401  { error, code: 'MISSING_AUTH_TOKEN' | 'TOKEN_EXPIRED' | 'INVALID_TOKEN' }
 *   500  { error } （APP_JWT_SECRET 未設定）
 *
 * @type {import('express').RequestHandler}
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error:   '需要登入：請在 Authorization 標頭提供 Bearer Token',
      code:    'MISSING_AUTH_TOKEN',
    });
  }

  const token = authHeader.slice(7).trim();

  const { JWT_SECRET } = require('../config/jwt');
  const secret = JWT_SECRET;

  try {
    const payload = jwt.verify(token, secret);

    // 同時支援 userId（自訂欄位）與 sub（標準 JWT claim）
    const userId = payload.userId ?? payload.sub;
    if (!userId) {
      return res.status(401).json({
        error: 'JWT Payload 缺少 userId / sub 欄位',
        code:  'INVALID_TOKEN',
      });
    }

    req.user = {
      userId: Number(userId),
      email:  payload.email  || null,
      role:   payload.role   || 'member',
      // 保留完整 payload 供其他中介軟體使用
      _jwtPayload: payload,
    };

    next();

  } catch (err) {
    const isExpired = err.name === 'TokenExpiredError';
    return res.status(401).json({
      error: isExpired ? 'JWT 已過期，請重新登入' : 'JWT 驗證失敗，Token 無效',
      code:  isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
      hint:  err.message,
    });
  }
}

// ════════════════════════════════════════════════════════════
// requireOAuth — 確認 Microsoft OAuth 已連接
// ════════════════════════════════════════════════════════════

/**
 * 工廠函式：建立 scope 驗證中介軟體
 *
 * 必須在 requireAuth 之後使用（需要 req.user.userId）
 *
 * 成功時設定：
 *   req.oauthInfo = { microsoftEmail, scopes, expiresAt, connectedAt, lastRefreshedAt }
 *
 * 失敗時回傳：
 *   401  { error, code: 'OAUTH_NOT_CONNECTED' }
 *   403  { error, code: 'INSUFFICIENT_SCOPES', missing: [...] }
 *   500  { error }
 *
 * @param {string[]} [requiredScopes]  需要的 Graph API scope 片段（模糊比對）
 *                                    例如：['Mail.Send'] 會比對到 'https://graph.microsoft.com/Mail.Send'
 * @returns {import('express').RequestHandler}
 *
 * @example
 *   router.post('/send', requireAuth, requireOAuth(['Mail.Send']), handler);
 */
function requireOAuth(requiredScopes = []) {
  return async (req, res, next) => {
    // 防呆：應先掛 requireAuth
    if (!req.user?.userId) {
      return res.status(500).json({
        error: 'requireOAuth 必須在 requireAuth 之後使用',
        code:  'MIDDLEWARE_ORDER_ERROR',
      });
    }

    try {
      const tokenInfo = await getUserTokenInfo(req.user.userId);

      // 未連接或已撤銷
      if (!tokenInfo || !tokenInfo.connected) {
        return res.status(401).json({
          error:    '尚未連接 Microsoft 帳號',
          code:     'OAUTH_NOT_CONNECTED',
          hint:     '請前往設定 → 整合，連接您的 Microsoft / Outlook 帳號',
          authUrl:  '/auth/microsoft',   // 前端可用此 URL 啟動 OAuth 流程
        });
      }

      // 驗證 scopes（模糊比對，支援短名稱如 'Mail.Send'）
      if (requiredScopes.length > 0) {
        const userScopes = tokenInfo.scopes || [];
        const missings   = requiredScopes.filter((required) =>
          !userScopes.some((userScope) => userScope.includes(required))
        );

        if (missings.length > 0) {
          return res.status(403).json({
            error:   'Microsoft 帳號缺少必要的授權範圍',
            code:    'INSUFFICIENT_SCOPES',
            missing: missings,
            hint:    '請重新連接 Microsoft 帳號以取得必要的授權範圍',
            authUrl: '/auth/microsoft',
          });
        }
      }

      // 附加 OAuth 資訊到 req，讓後續處理器可直接使用
      req.oauthInfo = {
        microsoftEmail:  tokenInfo.microsoftEmail,
        scopes:          tokenInfo.scopes,
        expiresAt:       tokenInfo.expiresAt,
        connectedAt:     tokenInfo.connectedAt,
        lastRefreshedAt: tokenInfo.lastRefreshedAt,
      };

      next();

    } catch (err) {
      console.error('❌ [requireOAuth] 驗證 OAuth 狀態失敗:', err.message);
      res.status(500).json({
        error: '驗證 Microsoft 連線狀態時發生伺服器錯誤',
        code:  'OAUTH_CHECK_FAILED',
      });
    }
  };
}

// ════════════════════════════════════════════════════════════
// optionalOAuth — 選擇性附加 OAuth 資訊
// ════════════════════════════════════════════════════════════

/**
 * 若用戶已連接 Microsoft OAuth 則附加 oauthInfo，否則靜默跳過
 *
 * 不會因未連接 OAuth 而拒絕請求，適合「有 OAuth 功能增強，無 OAuth 也能正常運作」的端點
 *
 * 成功時（已連接）設定：
 *   req.oauthInfo = { microsoftEmail, scopes, expiresAt, connectedAt }
 *
 * 未連接時：
 *   req.oauthInfo = undefined（不設定，後續可用 if (req.oauthInfo) 判斷）
 *
 * @type {import('express').RequestHandler}
 */
async function optionalOAuth(req, res, next) {
  if (!req.user?.userId) {
    // 沒有 req.user 時靜默跳過（允許在 requireAuth 之前或不使用 requireAuth 時使用）
    return next();
  }

  try {
    const tokenInfo = await getUserTokenInfo(req.user.userId);
    if (tokenInfo?.connected) {
      req.oauthInfo = {
        microsoftEmail:  tokenInfo.microsoftEmail,
        scopes:          tokenInfo.scopes,
        expiresAt:       tokenInfo.expiresAt,
        connectedAt:     tokenInfo.connectedAt,
        lastRefreshedAt: tokenInfo.lastRefreshedAt,
      };
    }
  } catch (err) {
    // 僅記錄警告，不阻止請求繼續
    console.warn(`⚠️  [optionalOAuth] 用戶 ${req.user.userId} OAuth 狀態查詢失敗（繼續處理）:`, err.message);
  }

  next();
}

// ════════════════════════════════════════════════════════════
// Exports
// ════════════════════════════════════════════════════════════

module.exports = {
  requireAuth,
  requireOAuth,
  optionalOAuth,
};
