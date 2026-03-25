/**
 * routes/auth/microsoft-login.js — Microsoft 帳號登入（Azure AD / M365）
 * ─────────────────────────────────────────────────────────────
 *
 * 端點：
 *   GET /api/auth/microsoft-login              — 發起 Microsoft OAuth 登入
 *   GET /api/auth/microsoft-login/callback     — Microsoft OAuth 回呼
 *   GET /api/auth/microsoft-login/config       — 查詢設定狀態
 *
 * 注意：與 /auth/microsoft（M365 Delegated Token）不同：
 *   - 本路由：「身分驗證」— 用 Microsoft 帳號「登入系統」
 *   - /auth/microsoft ：「資源授權」— 代表用戶存取 Outlook/Teams/SharePoint
 *   可共用相同的 Azure App Registration，或分開設定。
 *
 * 環境變數：
 *   MS_LOGIN_CLIENT_ID       — Azure App Registration 的 Application (client) ID
 *                              （可與 OAUTH_MICROSOFT_CLIENT_ID 相同）
 *   MS_LOGIN_CLIENT_SECRET   — 用戶端密碼
 *   MS_LOGIN_TENANT_ID       — 租戶 ID（單一租戶）或 'common'（多租戶/個人帳號）
 *   MS_LOGIN_CALLBACK_URL    — 回呼 URL（須在 Azure 設定授權重新導向 URI）
 *   APP_FRONTEND_URL         — 前端位址
 *
 * Azure App Registration 設定：
 *   1. 前往 Azure Portal → App registrations → 選擇或建立應用程式
 *   2. Authentication → Add a platform → Web
 *   3. Redirect URIs：加入 MS_LOGIN_CALLBACK_URL 的值
 *   4. API permissions：openid、profile、email（Microsoft Graph）
 *   5. 「Grant admin consent」
 */

const express = require('express');
const axios   = require('axios');
const crypto  = require('crypto');
const router  = express.Router();

const {
  handleOAuthCallback,
  generateState,
  buildOAuthErrorRedirect,
  ok,
} = require('./oauth-utils');

// In-memory state store（生產環境建議改用 Redis）
const stateStore  = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function cleanExpiredStates() {
  const now = Date.now();
  for (const [k, v] of stateStore) {
    if (now - v.createdAt > STATE_TTL_MS) stateStore.delete(k);
  }
}

function getConfig() {
  const tenantId = process.env.MS_LOGIN_TENANT_ID || 'common';
  return {
    clientId:     process.env.MS_LOGIN_CLIENT_ID
                  || process.env.OAUTH_MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MS_LOGIN_CLIENT_SECRET
                  || process.env.OAUTH_MICROSOFT_CLIENT_SECRET,
    tenantId,
    callbackUrl:  process.env.MS_LOGIN_CALLBACK_URL
                  || 'http://localhost:3000/api/auth/microsoft-login/callback',
    authUrl:  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
  };
}

// ════════════════════════════════════════════════════════════
// GET /api/auth/microsoft-login
// ════════════════════════════════════════════════════════════
router.get('/', (req, res) => {
  const cfg = getConfig();

  if (!cfg.clientId) {
    return res.redirect(buildOAuthErrorRedirect('Microsoft OAuth 尚未設定，請聯絡系統管理員'));
  }

  cleanExpiredStates();

  // PKCE — code_verifier + code_challenge
  const codeVerifier  = crypto.randomBytes(48).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  const state = generateState({ provider: 'microsoft' });
  stateStore.set(state, { createdAt: Date.now(), codeVerifier });

  const params = new URLSearchParams({
    client_id:             cfg.clientId,
    response_type:         'code',
    redirect_uri:          cfg.callbackUrl,
    response_mode:         'query',
    scope:                 'openid profile email User.Read',
    state,
    code_challenge:        codeChallenge,
    code_challenge_method: 'S256',
    prompt:                'select_account',
  });

  console.log(`🔐 [Microsoft OAuth Login] 發起授權流程`);
  return res.redirect(`${cfg.authUrl}?${params.toString()}`);
});

// ════════════════════════════════════════════════════════════
// GET /api/auth/microsoft-login/callback
// ════════════════════════════════════════════════════════════
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const cfg = getConfig();
  const frontendErrUrl = (msg) => res.redirect(buildOAuthErrorRedirect(msg));

  if (error) {
    console.warn(`⚠️ [Microsoft OAuth Login] 用戶取消或錯誤：${error}`);
    return frontendErrUrl(`Microsoft 登入失敗：${error_description || error}`);
  }

  const storeEntry = stateStore.get(state);
  if (!state || !storeEntry) {
    return frontendErrUrl('登入請求已過期，請重新嘗試');
  }
  stateStore.delete(state);

  if (!code) {
    return frontendErrUrl('未收到授權碼，請重新嘗試');
  }

  try {
    // ── 交換 Token（帶 PKCE code_verifier）────────────────
    const tokenRes = await axios.post(
      cfg.tokenUrl,
      new URLSearchParams({
        client_id:     cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        redirect_uri:  cfg.callbackUrl,
        grant_type:    'authorization_code',
        code_verifier: storeEntry.codeVerifier,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token } = tokenRes.data;

    // ── 取得 Microsoft Graph 用戶資訊 ─────────────────────
    const userRes = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const msUser = userRes.data;
    // msUser: { id, displayName, mail, userPrincipalName, ... }

    const email = msUser.mail || msUser.userPrincipalName;
    if (!email) {
      return frontendErrUrl('無法從 Microsoft 取得 Email，請確認帳號設定');
    }

    await handleOAuthCallback(res, {
      provider:   'microsoft',
      providerId: msUser.id,
      email:      email.toLowerCase(),
      name:       msUser.displayName || email.split('@')[0],
      avatarUrl:  null, // Graph API 的照片需要另外呼叫，此處略過
    });

  } catch (err) {
    console.error('❌ [Microsoft OAuth Login] 回呼錯誤：', err.response?.data || err.message);
    const errMsg = err.message.includes('尚未在系統')
      ? err.message
      : 'Microsoft 登入失敗，請稍後再試';
    return frontendErrUrl(errMsg);
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/auth/microsoft-login/config
// ════════════════════════════════════════════════════════════
router.get('/config', (req, res) => {
  const cfg = getConfig();
  return ok(res, {
    provider:    'microsoft',
    configured:  !!cfg.clientId,
    callbackUrl: cfg.callbackUrl,
    tenantId:    cfg.tenantId,
    scopes:      ['openid', 'profile', 'email', 'User.Read'],
  });
});

module.exports = router;
