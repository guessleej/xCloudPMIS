/**
 * routes/auth/github.js — GitHub OAuth 2.0 登入
 * ─────────────────────────────────────────────────────────────
 *
 * 端點：
 *   GET /api/auth/github              — 發起 GitHub OAuth 流程
 *   GET /api/auth/github/callback     — GitHub OAuth 回呼
 *   GET /api/auth/github/config       — 查詢設定狀態（Admin 用）
 *
 * 環境變數：
 *   GITHUB_CLIENT_ID       — GitHub OAuth App 的 Client ID
 *   GITHUB_CLIENT_SECRET   — GitHub OAuth App 的 Client Secret
 *   GITHUB_CALLBACK_URL    — 授權回呼 URL（預設：http://localhost:3000/api/auth/github/callback）
 *
 * GitHub App 設定：
 *   1. 前往 https://github.com/settings/developers → OAuth Apps → New OAuth App
 *   2. Homepage URL：前端 URL
 *   3. Authorization callback URL：GITHUB_CALLBACK_URL 的值
 *
 * 注意：
 *   - GitHub 用戶的 Email 可能設為私人，需額外呼叫 /user/emails API
 *   - 若 primary verified email 不存在，登入失敗
 */

const express = require('express');
const axios   = require('axios');
const router  = express.Router();

const {
  handleOAuthCallback,
  generateState,
  buildOAuthErrorRedirect,
  ok,
} = require('./oauth-utils');

// ── GitHub OAuth 2.0 端點 ─────────────────────────────────────
const GITHUB_AUTH_URL    = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL   = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL    = 'https://api.github.com/user';
const GITHUB_EMAILS_URL  = 'https://api.github.com/user/emails';

// In-memory state store（生產環境建議改用 Redis）
const stateStore = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function cleanExpiredStates() {
  const now = Date.now();
  for (const [k, v] of stateStore) {
    if (now - v.createdAt > STATE_TTL_MS) stateStore.delete(k);
  }
}

function getConfig() {
  return {
    clientId:     process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackUrl:  process.env.GITHUB_CALLBACK_URL
                  || 'http://localhost:3000/api/auth/github/callback',
  };
}

// ════════════════════════════════════════════════════════════
// GET /api/auth/github
// ════════════════════════════════════════════════════════════
router.get('/', (req, res) => {
  const { clientId, callbackUrl } = getConfig();

  if (!clientId) {
    return res.redirect(buildOAuthErrorRedirect('GitHub OAuth 尚未設定，請聯絡系統管理員'));
  }

  cleanExpiredStates();
  const state = generateState({ provider: 'github' });
  stateStore.set(state, { createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id:    clientId,
    redirect_uri: callbackUrl,
    scope:        'read:user user:email',
    state,
  });

  console.log(`🔐 [GitHub OAuth] 發起授權流程`);
  return res.redirect(`${GITHUB_AUTH_URL}?${params.toString()}`);
});

// ════════════════════════════════════════════════════════════
// GET /api/auth/github/callback
// ════════════════════════════════════════════════════════════
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const { clientId, clientSecret, callbackUrl } = getConfig();
  const frontendErrUrl = (msg) => res.redirect(buildOAuthErrorRedirect(msg));

  if (error) {
    return frontendErrUrl('您取消了 GitHub 登入授權');
  }

  if (!state || !stateStore.has(state)) {
    return frontendErrUrl('登入請求已過期，請重新嘗試');
  }
  stateStore.delete(state);

  if (!code) {
    return frontendErrUrl('未收到授權碼，請重新嘗試');
  }

  try {
    // ── 交換 Access Token ─────────────────────────────────
    const tokenRes = await axios.post(
      GITHUB_TOKEN_URL,
      { client_id: clientId, client_secret: clientSecret, code, redirect_uri: callbackUrl },
      { headers: { Accept: 'application/json' } },
    );

    const { access_token, error: tokenError } = tokenRes.data;
    if (tokenError || !access_token) {
      throw new Error(`GitHub Token 交換失敗：${tokenError || '未知錯誤'}`);
    }

    const ghHeaders = {
      Authorization: `Bearer ${access_token}`,
      'User-Agent': 'xCloudPMIS',
      Accept: 'application/vnd.github+json',
    };

    // ── 取得用戶資料 ──────────────────────────────────────
    const [userRes, emailsRes] = await Promise.all([
      axios.get(GITHUB_USER_URL,   { headers: ghHeaders }),
      axios.get(GITHUB_EMAILS_URL, { headers: ghHeaders }),
    ]);

    const ghUser   = userRes.data;
    const ghEmails = emailsRes.data; // [{ email, primary, verified }, ...]

    // 找到主要的已驗證 Email
    const primaryEmail = ghEmails.find(e => e.primary && e.verified)?.email
                      || ghEmails.find(e => e.verified)?.email;

    if (!primaryEmail) {
      return frontendErrUrl('您的 GitHub 帳號沒有已驗證的 Email，請先在 GitHub 設定並驗證 Email');
    }

    await handleOAuthCallback(res, {
      provider:   'github',
      providerId: String(ghUser.id),
      email:      primaryEmail,
      name:       ghUser.name || ghUser.login,
      avatarUrl:  ghUser.avatar_url || null,
    });

  } catch (err) {
    console.error('❌ [GitHub OAuth] 回呼錯誤：', err.message);
    const errMsg = err.message.includes('尚未在系統')
      ? err.message
      : 'GitHub 登入失敗，請稍後再試';
    return frontendErrUrl(errMsg);
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/auth/github/config
// ════════════════════════════════════════════════════════════
router.get('/config', (req, res) => {
  const { clientId, callbackUrl } = getConfig();
  return ok(res, {
    provider:    'github',
    configured:  !!clientId,
    callbackUrl,
    scopes:      ['read:user', 'user:email'],
  });
});

module.exports = router;
