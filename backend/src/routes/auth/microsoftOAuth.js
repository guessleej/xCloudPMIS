/**
 * routes/auth/microsoftOAuth.js — Microsoft OAuth 雙用途路由
 * ─────────────────────────────────────────────────────────────
 *
 * 雙用途設計：
 *   1. 「身分驗證」— 未登入使用者透過 Microsoft 帳號「登入系統」
 *      → LoginPage 以 window.location.href 導向 GET /
 *      → 後端直接 redirect 到 Microsoft → callback 發出 JWT
 *
 *   2. 「資源授權」— 已登入使用者在 Settings 頁連接 Microsoft 帳號
 *      → 前端以 fetch + Bearer Token 呼叫 GET /
 *      → 後端回傳 JSON { authorizationUrl }
 *      → 前端導向 Microsoft → callback 儲存 Delegated Token
 *
 * 端點清單：
 *   GET    /               → 發起 OAuth（自動偵測 Login / Delegated 流程）
 *   GET    /callback       → Azure AD 回呼
 *   GET    /status         → 查詢 Delegated Token 連線狀態（需 Auth）
 *   DELETE /revoke         → 撤銷 Delegated Token（需 Auth）
 *   POST   /config         → 更新 Azure OAuth 設定（需 Auth + Admin）
 *   GET    /config         → 查詢 Azure OAuth 設定狀態（需 Auth）
 *
 * 環境變數（登入流程，支援多種前綴）：
 *   MICROSOFT_CLIENT_ID     / O365_CLIENT_ID
 *   MICROSOFT_CLIENT_SECRET / O365_CLIENT_SECRET
 *   MICROSOFT_TENANT_ID     / O365_TENANT_ID  （預設 'common'）
 *
 * 環境變數（Delegated Token 專用）：
 *   OAUTH_MICROSOFT_CLIENT_ID      ← 可與上方共用或獨立設定
 *   OAUTH_MICROSOFT_CLIENT_SECRET
 *   OAUTH_MICROSOFT_TENANT_ID
 *   OAUTH_TOKEN_ENCRYPTION_KEY     ← AES-256-GCM 加密金鑰（64 hex chars）
 */

'use strict';

const express = require('express');
const crypto  = require('crypto');
const axios   = require('axios');
const router  = express.Router();

const requireAuth = require('../../middleware/requireAuth');
const prisma = require('../../lib/prisma');
const {
  findOrCreateOAuthUser,
  issueJWT,
  extractFrontendOrigin,
  redirectSuccess,
  redirectError,
  getCallbackBase,
  FRONTEND_URL,
} = require('./oauthHelper');
const {
  saveOAuthTokens,
  getUserTokenInfo,
  revokeUserTokens,
} = require('../../services/tokenManager');

// ════════════════════════════════════════════════════════════
// 設定讀取（支援多種 env 前綴，優先使用 OAUTH_MICROSOFT_*）
// ════════════════════════════════════════════════════════════

const CLIENT_ID = () =>
  process.env.OAUTH_MICROSOFT_CLIENT_ID ||
  process.env.MICROSOFT_CLIENT_ID ||
  process.env.O365_CLIENT_ID;

const CLIENT_SECRET = () =>
  process.env.OAUTH_MICROSOFT_CLIENT_SECRET ||
  process.env.MICROSOFT_CLIENT_SECRET ||
  process.env.O365_CLIENT_SECRET;

const TENANT_ID = () =>
  process.env.OAUTH_MICROSOFT_TENANT_ID ||
  process.env.MICROSOFT_TENANT_ID ||
  process.env.O365_TENANT_ID ||
  'common';

const CALLBACK_BASE = () => getCallbackBase();
const REDIRECT_URI  = () => `${CALLBACK_BASE()}/api/auth/microsoft/callback`;
const FRONTEND      = () => FRONTEND_URL || process.env.FRONTEND_URL || process.env.APP_FRONTEND_URL || 'http://localhost:3838';

const isConfigured  = () => !!(CLIENT_ID() && CLIENT_SECRET());

// ── In-memory state store（CSRF 保護）────────────────────────
const stateStore   = new Map();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 分鐘

function cleanExpiredStates() {
  const now = Date.now();
  for (const [k, v] of stateStore) {
    if (now - v.createdAt > STATE_TTL_MS) stateStore.delete(k);
  }
}

function generateState(payload) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const data  = JSON.stringify({ ...payload, nonce, ts: Date.now() });
  return Buffer.from(data).toString('base64url');
}

function parseState(stateStr) {
  try {
    return JSON.parse(Buffer.from(stateStr, 'base64url').toString('utf8'));
  } catch { return null; }
}

// ── Delegated Token 所需的完整 Scopes ────────────────────────
const DELEGATED_SCOPES = [
  'openid', 'profile', 'email', 'offline_access',
  'User.Read',
  'Mail.ReadWrite', 'Mail.Send',
  'Calendars.ReadWrite',
].join(' ');

// ── Login 所需的基本 Scopes ─────────────────────────────────
const LOGIN_SCOPES = 'openid profile email User.Read';

// ── 錯誤回導至前端 Settings 頁 ──────────────────────────────
function settingsErrorRedirect(res, errorCode, message, frontendUrl) {
  const base   = frontendUrl || FRONTEND();
  const params = new URLSearchParams({
    ms_error:   errorCode,
    ms_message: message || '',
  });
  return res.redirect(`${base}/?${params}`);
}

function settingsSuccessRedirect(res, email, frontendUrl) {
  const base   = frontendUrl || FRONTEND();
  const params = new URLSearchParams({
    ms_connected: '1',
    ms_email:     email || '',
  });
  return res.redirect(`${base}/?${params}`);
}

// ════════════════════════════════════════════════════════════
// GET / → 發起 OAuth（自動偵測 Login / Delegated 流程）
// ════════════════════════════════════════════════════════════
router.get('/', (req, res) => {
  if (!isConfigured()) {
    // 判斷回應方式
    if (req.headers.authorization) {
      return res.status(503).json({
        error:  'Microsoft OAuth 尚未設定',
        detail: '請先在 .env 設定 MICROSOFT_CLIENT_ID 和 MICROSOFT_CLIENT_SECRET，或在設定頁面快速設定',
        code:   'OAUTH_NOT_CONFIGURED',
      });
    }
    return redirectError(res, 'Microsoft OAuth 尚未設定，請聯絡系統管理員');
  }

  // 判斷是「Delegated Token」流程還是「Login」流程
  const authHeader = req.headers.authorization;
  const wantsJson  = (req.headers.accept || '').includes('application/json');

  if (authHeader && wantsJson) {
    // ── Delegated Token 流程 ────────────────────────────────
    // 驗證 JWT 取得 userId
    const { JWT_SECRET } = require('../../config/jwt');
    const jwt = require('jsonwebtoken');
    const token = authHeader.replace(/^Bearer\s+/i, '');

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: '登入已過期，請重新登入', code: 'INVALID_TOKEN' });
    }

    const userId = decoded.id || decoded.userId || decoded.sub;
    if (!userId) {
      return res.status(401).json({ error: 'JWT 缺少用戶資訊', code: 'INVALID_TOKEN' });
    }

    cleanExpiredStates();

    const origin = extractFrontendOrigin(req);
    const state = generateState({ flow: 'delegated', userId: Number(userId), origin });
    stateStore.set(state, { createdAt: Date.now(), flow: 'delegated', userId: Number(userId), origin });

    const params = new URLSearchParams({
      client_id:     CLIENT_ID(),
      response_type: 'code',
      redirect_uri:  REDIRECT_URI(),
      scope:         DELEGATED_SCOPES,
      response_mode: 'query',
      state,
      prompt:        'select_account', // 已有 Admin Consent 時不重複詢問
    });

    const authorizationUrl = `https://login.microsoftonline.com/${TENANT_ID()}/oauth2/v2.0/authorize?${params}`;

    console.log(`🔐 [Microsoft OAuth] Delegated 授權流程：userId=${userId}`);
    return res.json({ authorizationUrl });
  }

  // ── Login 流程（直接重定向）──────────────────────────────
  cleanExpiredStates();

  const origin = extractFrontendOrigin(req);
  const state = generateState({ flow: 'login', origin });
  stateStore.set(state, { createdAt: Date.now(), flow: 'login', origin });

  const params = new URLSearchParams({
    client_id:     CLIENT_ID(),
    response_type: 'code',
    redirect_uri:  REDIRECT_URI(),
    scope:         LOGIN_SCOPES,
    response_mode: 'query',
    state,
    prompt:        'select_account',
  });

  const authUrl = `https://login.microsoftonline.com/${TENANT_ID()}/oauth2/v2.0/authorize?${params}`;
  console.log(`🔐 [Microsoft OAuth] Login 授權流程`);
  res.redirect(authUrl);
});

// ════════════════════════════════════════════════════════════
// GET /callback → Azure AD 回呼（自動判斷 Login / Delegated）
// ════════════════════════════════════════════════════════════
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  // ── 解析 state 判斷流程 ────────────────────────────────────
  const stateEntry = stateStore.get(state);
  const stateData  = parseState(state);
  const isDelegated = stateEntry?.flow === 'delegated' || stateData?.flow === 'delegated';
  const frontendOrigin = stateEntry?.origin || stateData?.origin || null;

  // 清除已使用的 state
  if (state) stateStore.delete(state);

  // ── 處理 Microsoft 回傳的錯誤 ──────────────────────────────
  if (error || !code) {
    const errMsg = error_description || error || 'Microsoft OAuth 授權被拒絕';
    const errCode = (error || 'ACCESS_DENIED').toUpperCase().replace(/-/g, '_');

    if (isDelegated) {
      return settingsErrorRedirect(res, errCode, errMsg, frontendOrigin);
    }
    return redirectError(res, errMsg, frontendOrigin);
  }

  // ── 驗證 state 有效性 ─────────────────────────────────────
  if (!stateEntry) {
    const errMsg = 'OAuth 授權已逾時或無效，請重試';
    if (isDelegated) return settingsErrorRedirect(res, 'INVALID_OR_EXPIRED_STATE', errMsg, frontendOrigin);
    return redirectError(res, errMsg, frontendOrigin);
  }

  try {
    // ── 用 authorization code 換取 tokens ─────────────────
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

    const {
      access_token,
      refresh_token,
      id_token,
      expires_in,
      scope: grantedScope,
    } = tokenRes.data;

    // ── 取得 Microsoft Graph 使用者資訊（含組織資料）────────
    const profileRes = await axios.get(
      'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName,jobTitle,department,mobilePhone,officeLocation',
      { headers: { Authorization: `Bearer ${access_token}` } },
    );

    const profile = profileRes.data;
    const email   = profile.mail || profile.userPrincipalName;

    if (!email) {
      const msg = '無法從 Microsoft 帳號取得 Email，請確認帳號設定';
      if (isDelegated) return settingsErrorRedirect(res, 'MISSING_EMAIL', msg, frontendOrigin);
      return redirectError(res, msg, frontendOrigin);
    }

    // ════════════════════════════════════════════════════════
    // Delegated Token 流程：儲存 Token 到 DB
    // ════════════════════════════════════════════════════════
    if (isDelegated) {
      const userId = stateEntry.userId || stateData?.userId;

      if (!userId) {
        return settingsErrorRedirect(res, 'STATE_PARSE_ERROR', '無法解析用戶資訊，請重試', frontendOrigin);
      }

      if (!refresh_token) {
        return settingsErrorRedirect(res, 'INCOMPLETE_TOKEN_RESPONSE',
          'Microsoft 未回傳 Refresh Token，請確認 Azure App 已啟用 offline_access 權限後重試', frontendOrigin);
      }

      try {
        await saveOAuthTokens(userId, {
          accessToken:     access_token,
          refreshToken:    refresh_token,
          idToken:         id_token || null,
          expiresIn:       expires_in || 3600,
          scope:           grantedScope || DELEGATED_SCOPES,
          tenantId:        TENANT_ID(),
          microsoftUserId: profile.id,
          microsoftEmail:  email.toLowerCase(),
        });
      } catch (saveErr) {
        console.error('[auth/microsoft] Token 儲存失敗：', saveErr.message);
        return settingsErrorRedirect(res, 'TOKEN_SAVE_FAILED', 'Token 儲存失敗，請確認資料庫連線正常後重試', frontendOrigin);
      }

      console.log(`✅ [Microsoft OAuth] Delegated Token 已儲存：userId=${userId}, email=${email}`);
      return settingsSuccessRedirect(res, email, frontendOrigin);
    }

    // ════════════════════════════════════════════════════════
    // Login 流程：找到/建立使用者 → 發出 JWT
    // ════════════════════════════════════════════════════════
    const user  = await findOrCreateOAuthUser({
      email,
      name:      profile.displayName,
      provider:  'microsoft',
    });

    // ── 自動同步 Azure AD 組織資料（職稱、部門、電話）───────
    try {
      const updates = {};
      if (profile.jobTitle   && !user.jobTitle)   updates.jobTitle   = profile.jobTitle;
      if (profile.department && !user.department) updates.department = profile.department;
      if (profile.mobilePhone && !user.phone)    updates.phone      = profile.mobilePhone;
      if (profile.displayName && user.name !== profile.displayName) {
        updates.name = profile.displayName;
      }

      if (Object.keys(updates).length > 0) {
        await prisma.user.update({ where: { id: user.id }, data: updates });
        console.log(`🔄 [Microsoft OAuth] 已同步 Azure AD 組織資料：userId=${user.id}`, Object.keys(updates));
      }
    } catch (syncErr) {
      // 同步失敗不影響登入
      console.warn('[Microsoft OAuth] Azure AD 資料同步失敗（不影響登入）：', syncErr.message);
    }

    const jwtToken = issueJWT(user);
    console.log(`✅ [Microsoft OAuth] Login 成功：${email}`);
    redirectSuccess(res, jwtToken, frontendOrigin);

  } catch (err) {
    const errMsg = err.response?.data?.error_description || err.message;
    console.error('[auth/microsoft] OAuth 回呼失敗：', err.response?.data || err.message);

    if (isDelegated) {
      return settingsErrorRedirect(res, 'CALLBACK_FAILED', errMsg, frontendOrigin);
    }
    redirectError(res, 'Microsoft 登入失敗，請稍後再試', frontendOrigin);
  }
});

// ════════════════════════════════════════════════════════════
// GET /status → 查詢 Delegated Token 連線狀態 + Azure AD 個人資料
// ════════════════════════════════════════════════════════════
router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const info = await getUserTokenInfo(userId);

    const base = {
      connected:  info?.connected || false,
      configured: isConfigured(),
      email:      info?.microsoftEmail || null,
      scopes:     info?.scopes || [],
      expiresAt:  info?.expiresAt || null,
      connectedAt:     info?.connectedAt || null,
      lastRefreshedAt: info?.lastRefreshedAt || null,
    };

    // 已連線時，嘗試從 Graph API 取得完整 Azure AD 個人資料
    if (info?.connected) {
      try {
        const { getMicrosoftProfile } = require('../../services/userOutlookService');
        const profile = await getMicrosoftProfile(userId);
        base.displayName       = profile.displayName       || null;
        base.jobTitle          = profile.jobTitle          || null;
        base.department        = profile.department        || null;
        base.officeLocation    = profile.officeLocation    || null;
        base.mobilePhone       = profile.mobilePhone       || null;
        base.userPrincipalName = profile.userPrincipalName || null;
      } catch (profileErr) {
        // Graph API 失敗不影響基本連線狀態回傳
        console.warn(`[auth/microsoft/status] 取得 Azure AD 個人資料失敗：${profileErr.message}`);
      }
    }

    return res.json(base);
  } catch (err) {
    console.error('[auth/microsoft/status] 查詢失敗：', err.message);
    return res.json({ connected: false, configured: isConfigured() });
  }
});

// ════════════════════════════════════════════════════════════
// DELETE /revoke → 撤銷 Delegated Token
// ════════════════════════════════════════════════════════════
router.delete('/revoke', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    await revokeUserTokens(userId);

    console.log(`🔑 [Microsoft OAuth] userId=${userId} 已撤銷 Delegated Token`);
    return res.json({ success: true, message: '已成功解除 Microsoft 帳號授權' });
  } catch (err) {
    console.error('[auth/microsoft/revoke] 撤銷失敗：', err.message);
    return res.status(500).json({ error: '撤銷失敗，請稍後再試' });
  }
});

// ════════════════════════════════════════════════════════════
// GET /config → 查詢 Azure OAuth 設定狀態
// ════════════════════════════════════════════════════════════
router.get('/config', requireAuth, (req, res) => {
  return res.json({
    configured: isConfigured(),
    tenantId:   TENANT_ID(),
    hasEncryptionKey: !!process.env.OAUTH_TOKEN_ENCRYPTION_KEY,
    callbackUrl: REDIRECT_URI(),
    scopes: DELEGATED_SCOPES.split(' '),
  });
});

// ════════════════════════════════════════════════════════════
// POST /config → 更新 Azure OAuth 設定（僅限 Admin）
// ════════════════════════════════════════════════════════════
router.post('/config', requireAuth, async (req, res) => {
  // 簡易 admin 檢查
  try {
    const userId = req.user.id || req.user.userId;
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: { role: true },
    });

    if (user?.role !== 'admin') {
      return res.status(403).json({ error: '此操作需要管理員權限' });
    }

    const { clientId, clientSecret, tenantId } = req.body;

    if (!clientId?.trim() || !clientSecret?.trim()) {
      return res.status(400).json({ error: '請填入 Client ID 和 Client Secret' });
    }

    // 寫入 process.env（僅影響此次執行期間）
    process.env.OAUTH_MICROSOFT_CLIENT_ID     = clientId.trim();
    process.env.OAUTH_MICROSOFT_CLIENT_SECRET = clientSecret.trim();
    if (tenantId?.trim()) {
      process.env.OAUTH_MICROSOFT_TENANT_ID = tenantId.trim();
    }

    // 如果還沒有加密金鑰，自動產生一個（僅記憶體，需手動存入 .env）
    if (!process.env.OAUTH_TOKEN_ENCRYPTION_KEY) {
      const key = crypto.randomBytes(32).toString('hex');
      process.env.OAUTH_TOKEN_ENCRYPTION_KEY = key;
      console.log(`🔐 [Microsoft OAuth] 已自動產生 OAUTH_TOKEN_ENCRYPTION_KEY（請手動存入 .env）`);
      console.log(`   OAUTH_TOKEN_ENCRYPTION_KEY=${key}`);
    }

    console.log(`⚙️  [Microsoft OAuth] Admin 更新 Azure 設定成功`);
    return res.json({
      success: true,
      message: 'Azure OAuth 設定已更新（僅此次執行期間有效，請同步更新 .env 檔案）',
      configured: true,
    });
  } catch (err) {
    console.error('[auth/microsoft/config] 設定更新失敗：', err.message);
    return res.status(500).json({ error: '設定更新失敗' });
  } finally {
    await prisma.$disconnect();
  }
});

module.exports = router;
