/**
 * Google OAuth 2.0 登入路由
 * GET /api/auth/google          → 啟動 Google 授權流程
 * GET /api/auth/google/callback → 處理 Google 回呼，發出 JWT
 *
 * 環境變數：
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   OAUTH_CALLBACK_BASE  前端根 URL，預設 "http://localhost:3838"
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

const CLIENT_ID     = () => process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = () => process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI  = () => `${getCallbackBase()}/api/auth/google/callback`;
const isConfigured  = () => !!(CLIENT_ID() && CLIENT_SECRET());

// ── GET /api/auth/google → 啟動授權 ────────────────────────
router.get('/', (req, res) => {
  if (!isConfigured()) {
    return redirectError(res, 'Google OAuth 尚未設定，請聯絡系統管理員');
  }

  const params = new URLSearchParams({
    client_id:     CLIENT_ID(),
    redirect_uri:  REDIRECT_URI(),
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'online',
    prompt:        'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// ── GET /api/auth/google/callback → 處理 Google 回呼 ───────
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return redirectError(res, error || 'Google OAuth 授權被拒絕');
  }

  try {
    // 1. 用 authorization code 換取 access token
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      client_id:     CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      code,
      redirect_uri:  REDIRECT_URI(),
      grant_type:    'authorization_code',
    });

    const { access_token } = tokenRes.data;

    // 2. 用 access token 取得 Google 使用者資訊
    const profileRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const profile = profileRes.data;

    if (!profile.email) {
      return redirectError(res, '無法從 Google 帳號取得 Email');
    }

    // 3. 找到或建立使用者
    const user = await findOrCreateOAuthUser({
      email:     profile.email,
      name:      profile.name,
      avatarUrl: profile.picture || null,
      provider:  'google',
    });

    // 4. 發出 JWT，重定向回前端
    const token = issueJWT(user);
    redirectSuccess(res, token);

  } catch (err) {
    console.error('[auth/google] OAuth 失敗：', err.response?.data || err.message);
    redirectError(res, 'Google 登入失敗，請稍後再試');
  }
});

module.exports = router;
