/**
 * oauth-utils.js — OAuth 登入共用工具
 * ─────────────────────────────────────────────────────────────
 *
 * 提供：
 *   findOrCreateOAuthUser()  — 根據 OAuth Profile 找到或建立系統使用者
 *   issueJwtForUser()        — 為使用者簽發 JWT
 *   buildOAuthRedirect()     — 生成前端 OAuth 回呼 URL（帶 token 參數）
 *   buildOAuthErrorRedirect()— 生成前端錯誤回呼 URL
 *   encodeState()            — 產生 URL-safe base64 state
 *   decodeState()            — 解碼 state
 *
 * 設計原則：
 *   - 各 Provider 路由（Google / GitHub / Microsoft）使用此檔共用邏輯
 *   - OAUTH_ALLOW_REGISTRATION=true 時，允許 OAuth 自動建立新帳號
 *   - OAUTH_ALLOW_REGISTRATION=false（預設）時，只允許已存在的 Email 連結 OAuth
 */

const crypto = require('crypto');
const jwt    = require('jsonwebtoken');
const prisma = require('../../lib/prisma');

// ── 常數 ──────────────────────────────────────────────────────
const { JWT_SECRET } = require('../../config/jwt');
const TOKEN_KEY   = 'xcloud-auth-token';
const ROLE_LABEL  = { admin: '系統管理員', pm: '專案經理', member: '一般成員' };
const FRONTEND_URL= () => process.env.FRONTEND_URL || process.env.APP_FRONTEND_URL || 'http://localhost:3838';

// ── 工具 ──────────────────────────────────────────────────────
const ok   = (res, data, s = 200) => res.status(s).json({ success: true,  ...data });
const fail = (res, msg,  s = 400) => res.status(s).json({ success: false, error: msg });

// ════════════════════════════════════════════════════════════
// findOrCreateOAuthUser
// ════════════════════════════════════════════════════════════
/**
 * 根據 OAuth Provider 回傳的資訊，在系統中找到或建立使用者
 *
 * @param {Object} profile
 *   - provider    {string}  'google' | 'github' | 'microsoft'
 *   - providerId  {string}  Provider 的唯一用戶 ID
 *   - email       {string}  用戶 Email（必填）
 *   - name        {string}  顯示名稱
 *   - avatarUrl   {string?} 大頭貼 URL
 *
 * @returns {{ user, isNew, linked }}
 *   - user   : Prisma User 物件
 *   - isNew  : 是否新建立的帳號
 *   - linked : 是否新連結的 OAuth（既有帳號新增 OAuth 連結）
 *
 * @throws {Error} 帳號不存在且 OAUTH_ALLOW_REGISTRATION !== 'true'
 */
async function findOrCreateOAuthUser({ provider, providerId, email, name, avatarUrl }) {
  // ── Step 1：查詢既有 OAuth 連結 ──────────────────────────
  const existingLink = await prisma.userOAuthAccount.findUnique({
    where: { provider_providerId: { provider, providerId } },
    include: {
      user: {
        include: { company: { select: { id: true, name: true, slug: true } } },
      },
    },
  });

  if (existingLink) {
    // 更新大頭貼（如有新版本）
    if (avatarUrl && existingLink.avatarUrl !== avatarUrl) {
      await prisma.userOAuthAccount.update({
        where: { id: existingLink.id },
        data:  { avatarUrl, displayName: name },
      });
    }
    return { user: existingLink.user, isNew: false, linked: false };
  }

  // ── Step 2：以 Email 查詢既有使用者 ─────────────────────
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await prisma.user.findUnique({
    where:   { email: normalizedEmail },
    include: { company: { select: { id: true, name: true, slug: true } } },
  });

  if (existingUser) {
    if (!existingUser.isActive) {
      throw new Error('此帳號已停用，請聯絡系統管理員');
    }

    // 連結 OAuth 帳號到現有使用者
    await prisma.userOAuthAccount.create({
      data: {
        userId:       existingUser.id,
        provider,
        providerId,
        providerEmail: normalizedEmail,
        displayName:  name,
        avatarUrl:    avatarUrl || null,
      },
    });

    // 若大頭貼原本為空，補上 OAuth 大頭貼
    if (!existingUser.avatarUrl && avatarUrl) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data:  { avatarUrl },
      });
      existingUser.avatarUrl = avatarUrl;
    }

    return { user: existingUser, isNew: false, linked: true };
  }

  // ── Step 3：允許自動建立帳號時，建立新用戶 ──────────────
  const allowReg = process.env.OAUTH_ALLOW_REGISTRATION === 'true';
  if (!allowReg) {
    throw new Error(`此 Email（${normalizedEmail}）尚未在系統中建立帳號，請聯絡管理員後再使用社群帳號登入`);
  }

  // 取得預設公司 ID（用於自動建立帳號）
  const defaultCompanyId = parseInt(process.env.DEFAULT_COMPANY_ID || '1', 10);

  const newUser = await prisma.user.create({
    data: {
      companyId:    defaultCompanyId,
      name:         name || normalizedEmail.split('@')[0],
      email:        normalizedEmail,
      passwordHash: '', // OAuth 登入者沒有密碼
      role:         'member',
      avatarUrl:    avatarUrl || null,
      oauthAccounts: {
        create: {
          provider,
          providerId,
          providerEmail: normalizedEmail,
          displayName:  name,
          avatarUrl:    avatarUrl || null,
        },
      },
    },
    include: { company: { select: { id: true, name: true, slug: true } } },
  });

  return { user: newUser, isNew: true, linked: false };
}

// ════════════════════════════════════════════════════════════
// issueJwtForUser — 為使用者簽發 JWT
// ════════════════════════════════════════════════════════════
async function issueJwtForUser(user) {
  const payload = {
    sub:       String(user.id),
    userId:    user.id,
    companyId: user.companyId,
    email:     user.email,
    role:      user.role,
    name:      user.name,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

  // 更新最後登入時間
  await prisma.user.update({
    where: { id: user.id },
    data:  { lastLoginAt: new Date() },
  });

  return token;
}

// ════════════════════════════════════════════════════════════
// buildUserPayload — 建構安全的使用者資訊物件
// ════════════════════════════════════════════════════════════
function buildUserPayload(user) {
  return {
    id:         user.id,
    companyId:  user.companyId,
    name:       user.name,
    email:      user.email,
    role:       user.role,
    roleLabel:  ROLE_LABEL[user.role] || user.role,
    avatarUrl:  user.avatarUrl  || null,
    department: user.department || null,
    phone:      user.phone      || null,
    jobTitle:   user.jobTitle   || null,
    joinedAt:   user.joinedAt ? user.joinedAt.toISOString().split('T')[0] : null,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    company: {
      id:   user.company?.id   || user.companyId,
      name: user.company?.name || '',
      slug: user.company?.slug || '',
    },
  };
}

// ════════════════════════════════════════════════════════════
// buildOAuthRedirect — 生成前端 OAuth 成功回呼 URL
// ════════════════════════════════════════════════════════════
/**
 * @param {string} token  JWT Token
 * @param {Object} user   使用者資訊
 * @returns {string}      重導向 URL（token 在 hash fragment，不會出現在伺服器日誌）
 */
function buildOAuthRedirect(token, user) {
  const base = FRONTEND_URL();
  // 使用 URL hash fragment 傳遞 token（不進入 HTTP 日誌）
  return `${base}/#/oauth/callback?token=${encodeURIComponent(token)}&provider=${user._provider || 'oauth'}`;
}

// ════════════════════════════════════════════════════════════
// buildOAuthErrorRedirect — 生成前端錯誤 URL
// ════════════════════════════════════════════════════════════
function buildOAuthErrorRedirect(errorMsg) {
  const base = FRONTEND_URL();
  return `${base}/#/oauth/callback?error=${encodeURIComponent(errorMsg)}`;
}

// ════════════════════════════════════════════════════════════
// generateState / verifyState — CSRF 防護用 state 管理
// ════════════════════════════════════════════════════════════
function generateState(payload = {}) {
  const random = crypto.randomBytes(16).toString('hex');
  const data   = JSON.stringify({ ...payload, nonce: random, ts: Date.now() });
  return Buffer.from(data).toString('base64url');
}

function parseState(stateStr) {
  try {
    return JSON.parse(Buffer.from(stateStr, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════
// handleOAuthCallback — OAuth callback 統一處理邏輯
// ════════════════════════════════════════════════════════════
/**
 * @param {Response} res       Express response
 * @param {Object}   profile   OAuth Profile { provider, providerId, email, name, avatarUrl }
 */
async function handleOAuthCallback(res, profile) {
  try {
    const { user, isNew, linked } = await findOrCreateOAuthUser(profile);

    const token = await issueJwtForUser(user);
    const userPayload = buildUserPayload(user);
    userPayload._provider = profile.provider;

    const logTag = isNew ? '新建帳號' : linked ? '新連結 OAuth' : '直接登入';
    console.log(`✅ [OAuth:${profile.provider}] ${user.email} ${logTag}`);

    return res.redirect(buildOAuthRedirect(token, userPayload));
  } catch (err) {
    console.error(`❌ [OAuth:${profile.provider}] ${err.message}`);
    return res.redirect(buildOAuthErrorRedirect(err.message));
  }
}

module.exports = {
  findOrCreateOAuthUser,
  issueJwtForUser,
  buildUserPayload,
  buildOAuthRedirect,
  buildOAuthErrorRedirect,
  generateState,
  parseState,
  handleOAuthCallback,
  ok,
  fail,
};
