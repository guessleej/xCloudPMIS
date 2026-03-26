/**
 * OAuth 共用工具函式
 * 供 Microsoft / Google / GitHub OAuth 路由共享
 */

const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma       = new PrismaClient();
const JWT_SECRET   = process.env.JWT_SECRET   || 'pmis-dev-secret-2024';
const JWT_EXPIRES  = process.env.JWT_EXPIRES  || '7d';
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
    // 更新最後登入時間
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }).catch(() => {});
    return user;
  }

  // 找第一個公司作為預設公司
  const defaultCompany = await prisma.company.findFirst({ orderBy: { id: 'asc' } });
  if (!defaultCompany) {
    throw new Error('系統尚未建立公司，請先完成初始設定');
  }

  // 產生隨機密碼（OAuth 使用者不用密碼登入）
  const randomPassword = Math.random().toString(36) + Date.now().toString(36);
  const passwordHash   = await bcrypt.hash(randomPassword, 10);

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

// ── OAuth 成功 → 帶 token 重定向到前端 ─────────────────────
function redirectSuccess(res, token) {
  res.redirect(`${FRONTEND_URL}/?oauthToken=${encodeURIComponent(token)}`);
}

// ── OAuth 失敗 → 帶錯誤訊息重定向到前端 ────────────────────
function redirectError(res, message) {
  console.error('[OAuth] 失敗：', message);
  res.redirect(`${FRONTEND_URL}/?oauthError=${encodeURIComponent(message)}`);
}

// ── 取得 OAuth 回呼基礎 URL ─────────────────────────────────
function getCallbackBase() {
  return process.env.OAUTH_CALLBACK_BASE || 'http://localhost:3838';
}

module.exports = {
  findOrCreateOAuthUser,
  issueJWT,
  redirectSuccess,
  redirectError,
  getCallbackBase,
  FRONTEND_URL,
};
