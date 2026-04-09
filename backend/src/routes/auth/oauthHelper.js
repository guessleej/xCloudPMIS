/**
 * OAuth 共用工具函式
 * 供 Microsoft OAuth 路由使用
 */

const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const prisma       = require('../../lib/prisma');
const { JWT_SECRET, JWT_EXPIRES } = require('../../config/jwt');
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3838';

// ── 找到或建立 OAuth 使用者 ─────────────────────────────────
/**
 * 根據 email 找到現有使用者，或以 OAuth 資料建立新帳號
 * OAuth 帳號不使用密碼登入，故產生隨機 passwordHash
 */
async function findOrCreateOAuthUser({ email, name, avatarUrl }) {
  const normalizedEmail = email.toLowerCase().trim();

  let user = await prisma.user.findFirst({
    where: { email: normalizedEmail },
    include: { company: { select: { id: true, name: true, slug: true } } },
  });

  if (user) {
    if (!user.isActive) {
      throw new Error('此帳號已停用，請聯絡系統管理員');
    }
    // 更新最後登入時間
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }).catch(() => {});
    return user;
  }

  // ── 檢查是否允許 OAuth 自動建立帳號 ───────────────────────
  const allowReg = process.env.OAUTH_ALLOW_REGISTRATION === 'true';
  if (!allowReg) {
    throw new Error(`此 Email（${normalizedEmail}）尚未在系統中建立帳號，請聯絡管理員後再使用社群帳號登入`);
  }

  // 找第一個公司作為預設公司
  const defaultCompany = await prisma.company.findFirst({ orderBy: { id: 'asc' } });
  if (!defaultCompany) {
    throw new Error('系統尚未建立公司，請先完成初始設定');
  }

  // 產生隨機 passwordHash（OAuth 使用者不用密碼登入）
  const passwordHash = crypto.randomBytes(32).toString('hex');

  user = await prisma.user.create({
    data: {
      companyId:    defaultCompany.id,
      name:         name || normalizedEmail.split('@')[0],
      email:        normalizedEmail,
      passwordHash,
      role:         'member',
      avatarUrl:    avatarUrl || null,
      isActive:     true,
      lastLoginAt:  new Date(),
    },
    include: { company: { select: { id: true, name: true, slug: true } } },
  });

  console.log(`[OAuth] 新使用者已建立：${normalizedEmail}`);
  return user;
}

// ── 發出 JWT ────────────────────────────────────────────────
function issueJWT(user) {
  const payload = {
    id:        user.id,
    email:     user.email,
    name:      user.name,
    role:      user.role,
    companyId: user.companyId,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// ── 從 Request 提取前端來源 URL ─────────────────────────────
// 優先從 Referer header 取得來源 origin（自動區分 localhost / Azure）
function extractFrontendOrigin(req) {
  const referer = req.headers.referer || req.headers.referrer;
  if (referer) {
    try {
      const url = new URL(referer);
      return url.origin; // e.g., "http://localhost:3838" or "https://pmis-frontend.xxx.io"
    } catch {}
  }
  return FRONTEND_URL;
}

// ── OAuth 成功 → 帶 token 重定向到前端 ─────────────────────
function redirectSuccess(res, token, frontendUrl) {
  const base = frontendUrl || FRONTEND_URL;
  res.redirect(`${base}/?oauthToken=${encodeURIComponent(token)}`);
}

// ── OAuth 失敗 → 帶錯誤訊息重定向到前端 ────────────────────
function redirectError(res, message, frontendUrl) {
  const base = frontendUrl || FRONTEND_URL;
  console.error('[OAuth] 失敗：', message);
  res.redirect(`${base}/?oauthError=${encodeURIComponent(message)}`);
}

// ── 取得 OAuth 回呼基礎 URL ─────────────────────────────────
function getCallbackBase() {
  return process.env.OAUTH_CALLBACK_BASE || 'http://localhost:3838';
}

module.exports = {
  findOrCreateOAuthUser,
  issueJWT,
  extractFrontendOrigin,
  redirectSuccess,
  redirectError,
  getCallbackBase,
  FRONTEND_URL,
};
