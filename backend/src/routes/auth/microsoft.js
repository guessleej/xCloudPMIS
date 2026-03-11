/**
 * routes/auth/microsoft.js
 * ─────────────────────────────────────────────────────────────
 * Microsoft OAuth 2.0 Authorization Code Flow（含 PKCE）
 *
 * 端點列表：
 *   GET    /auth/microsoft            — 發起 OAuth 流程（重導向至 Microsoft 登入）
 *   GET    /auth/microsoft/callback   — OAuth 回呼（交換授權碼 → 儲存 Token）
 *   GET    /auth/microsoft/status     — 查詢目前用戶 OAuth 連線狀態
 *   DELETE /auth/microsoft/revoke     — 撤銷 OAuth 授權
 *
 * PKCE（Proof Key for Code Exchange）流程：
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  1. 前端呼叫 GET /auth/microsoft（已攜帶 JWT）               │
 *   │  2. 後端：                                                   │
 *   │     a. 生成 code_verifier（96 chars URL-safe random）         │
 *   │     b. code_challenge = base64url(SHA256(code_verifier))      │
 *   │     c. state = random 24 bytes                               │
 *   │     d. Redis 儲存 {userId, codeVerifier}（TTL: 10 分鐘）     │
 *   │     e. 重導向 Microsoft 授權頁                               │
 *   │  3. Microsoft 重導向 GET /auth/microsoft/callback            │
 *   │  4. 後端從 Redis 取回並刪除 state                            │
 *   │  5. 向 Microsoft 交換 code + code_verifier → Token           │
 *   │  6. 儲存加密 Token，重導向前端成功頁                          │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * 安全措施：
 *   - PKCE：防止授權碼攔截攻擊（CSRF-like）
 *   - State：One-time Redis 鍵，防重放攻擊
 *   - Token 加密：AES-256-GCM（見 tokenManager.js）
 *   - prompt=select_account：每次都顯示帳號選擇器
 *
 * 所需環境變數：
 *   OAUTH_MICROSOFT_CLIENT_ID      — Azure AD 應用程式 (Delegated) 用戶端 ID
 *   OAUTH_MICROSOFT_CLIENT_SECRET  — 用戶端密碼（值，非識別碼）
 *   OAUTH_MICROSOFT_TENANT_ID      — 租戶 ID（或 'common' 多租戶）
 *   OAUTH_REDIRECT_URI             — 此服務的回呼 URL，需與 Azure 設定一致
 *   FRONTEND_URL                   — 前端根 URL（OAuth 完成後重導向）
 *   APP_JWT_SECRET                 — JWT 驗證密鑰（requireAuth 使用）
 */

'use strict';

const crypto  = require('crypto');
const axios   = require('axios');
const { Router } = require('express');

const { setIfNotExists, getAndDelete } = require('../../services/cache');
const { saveOAuthTokens, revokeUserTokens, getUserTokenInfo } = require('../../services/tokenManager');
const { requireAuth } = require('../../middleware/oauthAuth');

const router = Router();

// ── 環境變數讀取器（函式形式，確保每次呼叫讀到最新值）────────
// （測試環境中 process.env 可能在執行期被覆蓋）
const CLIENT_ID     = () => process.env.OAUTH_MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = () => process.env.OAUTH_MICROSOFT_CLIENT_SECRET;
const TENANT_ID     = () => process.env.OAUTH_MICROSOFT_TENANT_ID || 'common';
const REDIRECT_URI  = () => process.env.OAUTH_REDIRECT_URI;
const FRONTEND_URL  = () => process.env.FRONTEND_URL || 'http://localhost:3001';

// Delegated Permissions scopes
const OAUTH_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',                                          // Refresh Token
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'https://graph.microsoft.com/OnlineMeetings.ReadWrite',
  'https://graph.microsoft.com/Tasks.ReadWrite',
  'https://graph.microsoft.com/User.Read',
].join(' ');

// Redis 鍵前綴與 TTL
const STATE_REDIS_PREFIX = 'oauth:pkce:state:';
const STATE_TTL_SECONDS  = 10 * 60;   // 10 分鐘完成授權

// ════════════════════════════════════════════════════════════
// PKCE Helper 函式
// ════════════════════════════════════════════════════════════

/**
 * 生成 PKCE code_verifier（RFC 7636 規格：43-128 URL-safe 字元）
 * 使用 96 字元，安全性充足且不超過 Azure 最大長度
 */
function generateCodeVerifier() {
  return crypto.randomBytes(72).toString('base64url').slice(0, 96);
}

/**
 * 從 code_verifier 生成 code_challenge（S256 方法）
 * code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))
 */
function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/**
 * 生成 OAuth state（用於 CSRF 防護，一次性 Redis 鍵）
 */
function generateState() {
  return crypto.randomBytes(24).toString('base64url');
}

// ════════════════════════════════════════════════════════════
// GET /auth/microsoft
// 發起 OAuth 授權流程
// ════════════════════════════════════════════════════════════

/**
 * 需要：Authorization: Bearer <app-jwt>（用戶必須先登入 PMIS）
 *
 * 回應行為：
 *   - 若 Accept: application/json → 回傳 { authorizationUrl, state }
 *   - 否則 → 302 重導向至 Microsoft 授權頁
 */
router.get('/', requireAuth, async (req, res) => {
  // 驗證必要環境變數
  const missing = [];
  if (!CLIENT_ID())    missing.push('OAUTH_MICROSOFT_CLIENT_ID');
  if (!REDIRECT_URI()) missing.push('OAUTH_REDIRECT_URI');
  if (missing.length > 0) {
    return res.status(500).json({
      error:   'OAuth 設定不完整，請聯繫系統管理員',
      missing,
    });
  }

  try {
    // ① 生成 PKCE pair
    const codeVerifier  = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state         = generateState();

    // ② 儲存 {userId, codeVerifier} 到 Redis（10 分鐘 TTL）
    const redisKey = `${STATE_REDIS_PREFIX}${state}`;
    const stored = await setIfNotExists(
      redisKey,
      JSON.stringify({ userId: req.user.userId, codeVerifier }),
      STATE_TTL_SECONDS
    );

    if (!stored) {
      // 極低機率的碰撞，讓客戶端重試
      return res.status(500).json({
        error: '狀態碼生成衝突，請重試',
        code:  'STATE_COLLISION',
      });
    }

    // ③ 建構 Microsoft 授權 URL
    const authUrl = new URL(
      `https://login.microsoftonline.com/${TENANT_ID()}/oauth2/v2.0/authorize`
    );
    authUrl.searchParams.set('client_id',            CLIENT_ID());
    authUrl.searchParams.set('response_type',         'code');
    authUrl.searchParams.set('redirect_uri',          REDIRECT_URI());
    authUrl.searchParams.set('scope',                 OAUTH_SCOPES);
    authUrl.searchParams.set('state',                 state);
    authUrl.searchParams.set('code_challenge',        codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('response_mode',         'query');
    authUrl.searchParams.set('prompt',                'select_account');  // 強制顯示帳號選擇

    const authorizationUrl = authUrl.toString();
    console.log(`🔐 用戶 ${req.user.userId} 發起 Microsoft OAuth 授權流程`);

    // ④ API 客戶端（SPA / React）收 JSON，瀏覽器直接重導向
    const wantsJson = req.headers['accept']?.includes('application/json');
    if (wantsJson) {
      return res.json({ authorizationUrl, state });
    }
    res.redirect(authorizationUrl);

  } catch (err) {
    console.error('❌ 發起 OAuth 流程失敗:', err.message);
    res.status(500).json({ error: '發起 Microsoft OAuth 授權失敗', detail: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /auth/microsoft/callback
// OAuth 回呼端點 — 交換授權碼，儲存 Token
// ════════════════════════════════════════════════════════════

/**
 * 由 Microsoft 重導向，不需 JWT（此時用戶已完成 Microsoft 登入）
 * userId 從 Redis state 中取回
 *
 * 成功 → 重導向前端：${FRONTEND_URL}/settings/integrations?ms_connected=1
 * 失敗 → 重導向前端：${FRONTEND_URL}/settings/integrations?ms_error=...
 */
router.get('/callback', async (req, res) => {
  const {
    code,
    state,
    error:             oauthError,
    error_description: errorDescription,
  } = req.query;

  // 統一錯誤重導向
  const errorRedirect = (message, code = 'OAUTH_FAILED') => {
    const url = new URL(`${FRONTEND_URL()}/settings/integrations`);
    url.searchParams.set('ms_error',   code);
    url.searchParams.set('ms_message', message);
    console.error(`❌ OAuth 回呼錯誤 [${code}]: ${message}`);
    return res.redirect(url.toString());
  };

  // Microsoft 回傳錯誤（用戶拒絕授權、管理員未同意等）
  if (oauthError) {
    const friendlyMsg = oauthError === 'access_denied'
      ? '您已取消 Microsoft 帳號授權'
      : (errorDescription || oauthError);
    return errorRedirect(friendlyMsg, oauthError.toUpperCase().replace(/\s/g, '_'));
  }

  if (!code || !state) {
    return errorRedirect('回呼缺少必要參數（code 或 state）', 'MISSING_CALLBACK_PARAMS');
  }

  // ① 從 Redis 取回並刪除 state（防重放攻擊）
  const stateJson = await getAndDelete(`${STATE_REDIS_PREFIX}${state}`);
  if (!stateJson) {
    return errorRedirect(
      'State 無效或已過期（請在 10 分鐘內完成授權）',
      'INVALID_OR_EXPIRED_STATE'
    );
  }

  let userId, codeVerifier;
  try {
    ({ userId, codeVerifier } = JSON.parse(stateJson));
  } catch {
    return errorRedirect('State 解析失敗（格式錯誤）', 'STATE_PARSE_ERROR');
  }

  // ② 交換授權碼取得 Token
  const tokenEndpoint = `https://login.microsoftonline.com/${TENANT_ID()}/oauth2/v2.0/token`;

  let tokenData;
  try {
    const formBody = new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  REDIRECT_URI(),
      client_id:     CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      code_verifier: codeVerifier,         // PKCE 驗證
    });

    const tokenResp = await axios.post(
      tokenEndpoint,
      formBody.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15_000,
      }
    );
    tokenData = tokenResp.data;
  } catch (err) {
    const errData    = err.response?.data;
    const errCode    = errData?.error?.toUpperCase().replace(/\s/g, '_') || 'TOKEN_EXCHANGE_FAILED';
    const errMessage = errData?.error_description || err.message || '授權碼交換失敗';
    console.error(`❌ Token 交換失敗 [${errCode}]:`, errData || err.message);
    return errorRedirect(errMessage, errCode);
  }

  const {
    access_token:  accessToken,
    refresh_token: refreshToken,
    id_token:      idToken,
    expires_in:    expiresIn,
    scope,
  } = tokenData;

  if (!accessToken || !refreshToken) {
    return errorRedirect('Microsoft 回傳的 Token 不完整（缺少 access_token 或 refresh_token）', 'INCOMPLETE_TOKEN_RESPONSE');
  }

  // ③ 取得 Microsoft 用戶個人資料（oid + email）
  let msProfile = {};
  try {
    const profileResp = await axios.get(
      'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 8_000,
      }
    );
    msProfile = profileResp.data;
  } catch (err) {
    // 個人資料取得失敗不阻止 OAuth 完成（Token 已成功取得）
    console.warn(`⚠️  用戶 ${userId} 的 Microsoft 個人資料取得失敗（Token 仍會儲存）:`, err.message);
  }

  // ④ 加密儲存 Token 到資料庫
  try {
    await saveOAuthTokens(userId, {
      accessToken,
      refreshToken,
      idToken,
      expiresIn,
      scope,
      tenantId:        TENANT_ID(),
      microsoftUserId: msProfile.id            || null,
      microsoftEmail:  msProfile.mail          || msProfile.userPrincipalName || null,
    });
  } catch (err) {
    console.error(`❌ 用戶 ${userId} Token 儲存失敗:`, err.message);
    return errorRedirect('Token 儲存失敗，請重試', 'TOKEN_SAVE_FAILED');
  }

  const msEmail = msProfile.mail || msProfile.userPrincipalName || '（未知）';
  console.log(`✅ 用戶 ${userId} 成功連接 Microsoft 帳號：${msEmail}`);

  // ⑤ 重導向前端成功頁
  const successUrl = new URL(`${FRONTEND_URL()}/settings/integrations`);
  successUrl.searchParams.set('ms_connected', '1');
  successUrl.searchParams.set('ms_email',     msEmail);
  res.redirect(successUrl.toString());
});

// ════════════════════════════════════════════════════════════
// GET /auth/microsoft/status
// 查詢目前用戶的 OAuth 連線狀態
// ════════════════════════════════════════════════════════════

/**
 * 需要：Authorization: Bearer <app-jwt>
 *
 * @returns {object} OAuth 狀態資訊
 * @example
 * // 已連接
 * { connected: true, microsoftEmail: "user@company.com", scopes: [...], connectedAt, expiresAt }
 * // 未連接
 * { connected: false, message: "尚未連接 Microsoft 帳號", authUrl: "/auth/microsoft" }
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const info = await getUserTokenInfo(req.user.userId);

    if (!info || !info.connected) {
      return res.json({
        connected: false,
        message:   '尚未連接 Microsoft 帳號',
        authUrl:   '/auth/microsoft',
      });
    }

    // 計算剩餘有效時間（秒）
    const expiresInSeconds = info.expiresAt
      ? Math.max(0, Math.floor((new Date(info.expiresAt) - Date.now()) / 1000))
      : null;

    res.json({
      connected:       true,
      microsoftEmail:  info.microsoftEmail,
      scopes:          info.scopes,
      connectedAt:     info.connectedAt,
      lastRefreshedAt: info.lastRefreshedAt,
      expiresAt:       info.expiresAt,
      expiresInSeconds,
    });

  } catch (err) {
    console.error(`❌ 用戶 ${req.user.userId} OAuth 狀態查詢失敗:`, err.message);
    res.status(500).json({ error: '查詢 Microsoft 連線狀態失敗' });
  }
});

// ════════════════════════════════════════════════════════════
// DELETE /auth/microsoft/revoke
// 撤銷 OAuth 授權（用戶主動斷開連結）
// ════════════════════════════════════════════════════════════

/**
 * 需要：Authorization: Bearer <app-jwt>
 *
 * 注意：
 *   - 此操作僅在本系統資料庫中標記 Token 失效
 *   - 若需要在 Azure 端完全撤銷（使 Refresh Token 失效），
 *     用戶需至 https://myaccount.microsoft.com/permissions 手動移除
 *   - 撤銷後需要重新完成 OAuth 流程才能恢復使用
 *
 * @returns {{ success: true, message: string }}
 */
router.delete('/revoke', requireAuth, async (req, res) => {
  try {
    await revokeUserTokens(req.user.userId);
    console.log(`🔑 用戶 ${req.user.userId} (${req.user.email || 'unknown'}) 已撤銷 Microsoft OAuth 授權`);
    res.json({
      success: true,
      message: 'Microsoft 帳號連線已成功斷開。若需重新連接，請再次前往設定頁面授權。',
    });
  } catch (err) {
    console.error(`❌ 用戶 ${req.user.userId} 撤銷 OAuth Token 失敗:`, err.message);
    res.status(500).json({ error: '撤銷 Microsoft 授權時發生錯誤' });
  }
});

module.exports = router;
