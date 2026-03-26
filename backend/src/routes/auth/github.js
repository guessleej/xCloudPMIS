/**
 * GitHub OAuth 2.0 登入路由
 * GET /api/auth/github          → 啟動 GitHub 授權流程
 * GET /api/auth/github/callback → 處理 GitHub 回呼，發出 JWT
 *
 * 環境變數：
 *   GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET
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

const CLIENT_ID     = () => process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = () => process.env.GITHUB_CLIENT_SECRET;
const REDIRECT_URI  = () => `${getCallbackBase()}/api/auth/github/callback`;
const isConfigured  = () => !!(CLIENT_ID() && CLIENT_SECRET());

// ── GET /api/auth/github → 啟動授權 ────────────────────────
router.get('/', (req, res) => {
  if (!isConfigured()) {
    return redirectError(res, 'GitHub OAuth 尚未設定，請聯絡系統管理員');
  }

  const params = new URLSearchParams({
    client_id:    CLIENT_ID(),
    redirect_uri: REDIRECT_URI(),
    scope:        'user:email read:user',
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// ── GET /api/auth/github/callback → 處理 GitHub 回呼 ───────
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return redirectError(res, error || 'GitHub OAuth 授權被拒絕');
  }

  try {
    // 1. 用 authorization code 換取 access token
    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id:     CLIENT_ID(),
        client_secret: CLIENT_SECRET(),
        code,
        redirect_uri:  REDIRECT_URI(),
      },
      { headers: { Accept: 'application/json' } },
    );

    const access_token = tokenRes.data.access_token;
    if (!access_token) {
      throw new Error('GitHub 未回傳 access_token：' + JSON.stringify(tokenRes.data));
    }

    // 2. 同時取得個人資料和 email 列表
    const authHeader = { Authorization: `token ${access_token}`, 'User-Agent': 'xCloudPMIS' };

    const [profileRes, emailsRes] = await Promise.all([
      axios.get('https://api.github.com/user', { headers: authHeader }),
      axios.get('https://api.github.com/user/emails', { headers: authHeader }),
    ]);

    const profile = profileRes.data;
    const emails  = Array.isArray(emailsRes.data) ? emailsRes.data : [];

    // 優先取「已驗證的主 Email」
    const primaryEmail =
      emails.find(e => e.primary && e.verified)?.email ||
      emails.find(e => e.verified)?.email ||
      profile.email;

    if (!primaryEmail) {
      return redirectError(
        res,
        '無法從 GitHub 帳號取得 Email。請至 GitHub 設定公開 Email 後再試。',
      );
    }

    // 3. 找到或建立使用者
    const user = await findOrCreateOAuthUser({
      email:     primaryEmail,
      name:      profile.name || profile.login,
      avatarUrl: profile.avatar_url || null,
      provider:  'github',
    });

    // 4. 發出 JWT，重定向回前端
    const token = issueJWT(user);
    redirectSuccess(res, token);

  } catch (err) {
    console.error('[auth/github] OAuth 失敗：', err.response?.data || err.message);
    redirectError(res, 'GitHub 登入失敗，請稍後再試');
  }
});

module.exports = router;
