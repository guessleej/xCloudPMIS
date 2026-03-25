/**
 * routes/auth/google.js — Google OAuth 2.0 登入
 * ─────────────────────────────────────────────────────────────
 *
 * 端點：
 *   GET /api/auth/google              — 發起 Google OAuth 流程（重導向至 Google）
 *   GET /api/auth/google/callback     — Google OAuth 回呼（交換 code → 取得用戶資訊）
 *   GET /api/auth/google/config       — 查詢 Google OAuth 設定狀態（Admin 用）
 *
 * 環境變數：
 *   GOOGLE_CLIENT_ID       — Google Cloud Console 的 OAuth 2.0 用戶端 ID
 *   GOOGLE_CLIENT_SECRET   — Google Cloud Console 的 OAuth 2.0 用戶端密碼
 *   GOOGLE_CALLBACK_URL    — 授權回呼 URL（預設：http://localhost:3000/api/auth/google/callback）
 *   APP_FRONTEND_URL       — 前端位址（預設：http://localhost:3838）
 *   OAUTH_ALLOW_REGISTRATION — 允許 OAuth 自動建立帳號（預設：false）
 *
 * Google Cloud Console 設定：
 *   1. 前往 https://console.cloud.google.com/apis/credentials
 *   2. 建立「OAuth 2.0 用戶端 ID」（Web 應用程式）
 *   3. 已授權的重新導向 URI：加入 GOOGLE_CALLBACK_URL 的值
 *   4. 已授權的 JavaScript 來源：加入前端 URL
 *
 * 安全說明：
 *   - State：隨機 base64url，防 CSRF
 *   - 使用 axios 向 Google Token Endpoint 換取 Access Token
 *   - 使用 Google UserInfo API 取得用戶資料（無需解析 id_token）
 */

const express = require('express');
const crypto  = require('crypto');
const axios   = require('axios');
const router  = express.Router();

const {
  handleOAuthCallback,
  generateState,
  parseState,
  buildOAuthErrorRedirect,
  ok,
  fail,
} = require('./oauth-utils');

// ── Google OAuth 2.0 端點 ─────────────────────────────────────
const GOOGLE_AUTH_URL    = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL   = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL= 'https://www.googleapis.com/oauth2/v3/userinfo';

// In-memory state store（生產環境應改用 Redis）
// key: state string, value: { createdAt }（10 分鐘後過期）
const stateStore = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function cleanExpiredStates() {
  const now = Date.now();
  for (const [key, val] of stateStore) {
    if (now - val.createdAt > STATE_TTL_MS) stateStore.delete(key);
  }
}

// ── 環境變數取得 ──────────────────────────────────────────────
function getConfig() {
  return {
    clientId:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl:  process.env.GOOGLE_CALLBACK_URL
                  || 'http://localhost:3000/api/auth/google/callback',
  };
}

// ════════════════════════════════════════════════════════════
// GET /api/auth/google
// 發起 Google OAuth 流程
// ════════════════════════════════════════════════════════════
router.get('/', (req, res) => {
  const { clientId, callbackUrl } = getConfig();

  if (!clientId) {
    return res.redirect(buildOAuthErrorRedirect('Google OAuth 尚未設定，請聯絡系統管理員'));
  }

  cleanExpiredStates();
  const state = generateState({ provider: 'google' });
  stateStore.set(state, { createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  callbackUrl,
    response_type: 'code',
    scope:         'openid email profile',
    state,
    access_type:   'offline',
    prompt:        'select_account',
  });

  console.log(`🔐 [Google OAuth] 發起授權流程`);
  return res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
});

// ════════════════════════════════════════════════════════════
// GET /api/auth/google/callback
// Google OAuth 回呼
// ════════════════════════════════════════════════════════════
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const { clientId, clientSecret, callbackUrl } = getConfig();
  const frontendErrUrl = (msg) => res.redirect(buildOAuthErrorRedirect(msg));

  // ── 錯誤：用戶拒絕授權 ────────────────────────────────────
  if (error) {
    console.warn(`⚠️ [Google OAuth] 用戶取消授權：${error}`);
    return frontendErrUrl('您取消了 Google 登入授權');
  }

  // ── State 驗證（CSRF 防護）────────────────────────────────
  if (!state || !stateStore.has(state)) {
    return frontendErrUrl('登入請求已過期，請重新嘗試');
  }
  stateStore.delete(state);

  if (!code) {
    return frontendErrUrl('未收到授權碼，請重新嘗試');
  }

  try {
    // ── 向 Google 交換 Access Token ───────────────────────
    const tokenRes = await axios.post(GOOGLE_TOKEN_URL, {
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  callbackUrl,
      grant_type:    'authorization_code',
    });

    const { access_token } = tokenRes.data;

    // ── 取得用戶資訊 ───────────────────────────────────────
    const userRes = await axios.get(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const gUser = userRes.data;
    // gUser: { sub, email, name, picture, email_verified, ... }

    if (!gUser.email) {
      return frontendErrUrl('無法從 Google 取得 Email，請確認帳號設定');
    }

    if (!gUser.email_verified) {
      return frontendErrUrl('Google 帳號 Email 尚未驗證，請先驗證 Google 帳號');
    }

    // ── 處理登入（找到或建立使用者）──────────────────────
    await handleOAuthCallback(res, {
      provider:   'google',
      providerId: gUser.sub,
      email:      gUser.email,
      name:       gUser.name || gUser.email.split('@')[0],
      avatarUrl:  gUser.picture || null,
    });

  } catch (err) {
    console.error('❌ [Google OAuth] 回呼錯誤：', err.response?.data || err.message);
    const errMsg = err.message.includes('尚未在系統')
      ? err.message
      : 'Google 登入失敗，請稍後再試';
    return frontendErrUrl(errMsg);
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/auth/google/config
// 查詢 Google OAuth 設定狀態（給管理員介面顯示）
// ════════════════════════════════════════════════════════════
router.get('/config', (req, res) => {
  const { clientId, callbackUrl } = getConfig();
  return ok(res, {
    provider:    'google',
    configured:  !!clientId,
    callbackUrl: callbackUrl,
    scopes:      ['openid', 'email', 'profile'],
  });
});

module.exports = router;
