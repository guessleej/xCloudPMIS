/**
 * Microsoft OAuth 2.0 登入路由
 * GET /api/auth/microsoft          → 啟動 OAuth 授權流程
 * GET /api/auth/microsoft/callback → 處理 Azure AD 回呼，發出 JWT
 *
 * 環境變數：
 *   MICROSOFT_CLIENT_ID     (或 O365_CLIENT_ID)
 *   MICROSOFT_CLIENT_SECRET (或 O365_CLIENT_SECRET)
 *   MICROSOFT_TENANT_ID     (或 O365_TENANT_ID)，預設 "common"
 *   OAUTH_CALLBACK_BASE     前端根 URL，預設 "http://localhost:3838"
 */

const express = require('express');
const axios   = require('axios');
const router  = express.Router();
const {
  findOrCreateOAuthUser,
  issueJWT,
  redirectSuccess,
  redirectError,
  getCallbackBase,
} = require('./oauthHelper');

// ── 設定讀取（支援兩種 env 前綴） ──────────────────────────
const CLIENT_ID     = () => process.env.MICROSOFT_CLIENT_ID     || process.env.O365_CLIENT_ID;
const CLIENT_SECRET = () => process.env.MICROSOFT_CLIENT_SECRET || process.env.O365_CLIENT_SECRET;
const TENANT_ID     = () => process.env.MICROSOFT_TENANT_ID     || process.env.O365_TENANT_ID || 'common';
const REDIRECT_URI  = () => `${getCallbackBase()}/api/auth/microsoft/callback`;
const isConfigured  = () => !!(CLIENT_ID() && CLIENT_SECRET());

// ── GET /api/auth/microsoft → 啟動授權 ─────────────────────
router.get('/', (req, res) => {
  if (!isConfigured()) {
    return redirectError(res, 'Microsoft OAuth 尚未設定，請聯絡系統管理員');
  }

  const params = new URLSearchParams({
    client_id:     CLIENT_ID(),
    response_type: 'code',
    redirect_uri:  REDIRECT_URI(),
    scope:         'openid profile email User.Read',
    response_mode: 'query',
    prompt:        'select_account',
  });

  const authUrl = `https://login.microsoftonline.com/${TENANT_ID()}/oauth2/v2.0/authorize?${params}`;
  res.redirect(authUrl);
});

// ── GET /api/auth/microsoft/callback → 處理 Azure AD 回呼 ─
router.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error || !code) {
    return redirectError(res, error_description || error || 'Microsoft OAuth 授權被拒絕');
  }

  try {
    // 1. 用 authorization code 換取 access token
    const tokenRes = await axios.post(
      `https://login.microsoftonline.com/${TENANT_ID()}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id:     CLIENT_ID(),
        client_secret: CLIENT_SECRET(),
        code,
        redirect_uri:  REDIRECT_URI(),
        grant_type:    'authorization_code',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token } = tokenRes.data;

    // 2. 用 access token 取得 Microsoft Graph 使用者資訊
    const profileRes = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const profile = profileRes.data;
    const email   = profile.mail || profile.userPrincipalName;

    if (!email) {
      return redirectError(res, '無法從 Microsoft 帳號取得 Email，請確認帳號設定');
    }

    // 3. 找到或建立使用者
    const user  = await findOrCreateOAuthUser({
      email,
      name:      profile.displayName,
      avatarUrl: null,
      provider:  'microsoft',
    });

    // 4. 發出 JWT，重定向回前端
    const token = issueJWT(user);
    redirectSuccess(res, token);

  } catch (err) {
    console.error('[auth/microsoft] OAuth 失敗：', err.response?.data || err.message);
    redirectError(res, 'Microsoft 登入失敗，請稍後再試');
  }
});

module.exports = router;
