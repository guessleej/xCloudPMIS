/**
 * services/tokenManager.js
 * ─────────────────────────────────────────────────────────────
 * Microsoft OAuth 2.0 Token 管理服務
 *
 * 核心職責：
 *   1. 加密儲存 Refresh Token（AES-256-GCM）到資料庫
 *   2. 自動偵測 Access Token 過期並用 Refresh Token 更新
 *   3. Token 撤銷（用戶主動斷開連結）
 *   4. Token 狀態查詢（給健康端點和前端使用）
 *
 * 加密設計（AES-256-GCM）：
 *   ┌───────────────────────────────────────────────────────┐
 *   │  明文 Token  →  [IV(16B)] + AES-256-GCM  →  密文     │
 *   │  儲存格式：base64(iv) : base64(ciphertext) : authTag  │
 *   │  Auth Tag 確保密文未被篡改（Authenticated Encryption） │
 *   └───────────────────────────────────────────────────────┘
 *
 * 環境變數：
 *   OAUTH_TOKEN_ENCRYPTION_KEY  64 個十六進位字元（= 32 bytes）
 *                               生成：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   OAUTH_MICROSOFT_CLIENT_ID
 *   OAUTH_MICROSOFT_CLIENT_SECRET
 *   OAUTH_MICROSOFT_TENANT_ID   (或 'common' 支援多租戶)
 *
 * 安全注意事項：
 *   - OAUTH_TOKEN_ENCRYPTION_KEY 必須存在 .env 或機密管理服務中，絕不能進 git
 *   - Refresh Token 是長期憑證（最長 90 天），洩露影響嚴重，務必加密
 *   - 記憶體中的解密 Token 不快取超過一次請求（防記憶體掃描攻擊）
 */

'use strict';

const crypto = require('crypto');
const axios  = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ════════════════════════════════════════════════════════════
// AES-256-GCM 加密 / 解密
// ════════════════════════════════════════════════════════════

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_BYTE_LENGTH       = 32;    // 256 bits
const IV_BYTE_LENGTH        = 16;    // 128 bits（GCM 建議值）
const AUTH_TAG_BYTE_LENGTH  = 16;    // 128 bits（GCM 預設）

/**
 * 從環境變數讀取加密 Key
 * @returns {Buffer} 32-byte 加密金鑰
 * @throws {Error} 未設定或長度不對時
 */
function getEncryptionKey() {
  const hexKey = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!hexKey) {
    throw new Error(
      '❌ OAUTH_TOKEN_ENCRYPTION_KEY 未設定\n' +
      '   生成指令：node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  const keyBuf = Buffer.from(hexKey, 'hex');
  if (keyBuf.length !== KEY_BYTE_LENGTH) {
    throw new Error(
      `❌ OAUTH_TOKEN_ENCRYPTION_KEY 長度錯誤：期望 64 個十六進位字元（32 bytes），` +
      `實際收到 ${hexKey.length} 個字元`
    );
  }
  return keyBuf;
}

/**
 * 加密 Token（AES-256-GCM）
 * @param {string} plaintext  原始 Token 字串
 * @returns {string|null}     格式：`base64(iv):base64(ciphertext):base64(authTag)`
 */
function encryptToken(plaintext) {
  if (!plaintext) return null;

  const key       = getEncryptionKey();
  const iv        = crypto.randomBytes(IV_BYTE_LENGTH);
  const cipher    = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // 儲存格式：iv:ciphertext:authTag（全部 base64，冒號分隔）
  return [
    iv.toString('base64'),
    encrypted.toString('base64'),
    authTag.toString('base64'),
  ].join(':');
}

/**
 * 解密 Token（AES-256-GCM）
 * @param {string} ciphertext  格式：`base64(iv):base64(ciphertext):base64(authTag)`
 * @returns {string|null}      原始 Token，解密失敗回傳 null
 */
function decryptToken(ciphertext) {
  if (!ciphertext) return null;

  try {
    const key             = getEncryptionKey();
    const [ivB64, encB64, tagB64] = ciphertext.split(':');

    if (!ivB64 || !encB64 || !tagB64) {
      throw new Error('Token 格式無效：缺少必要欄位');
    }

    const iv        = Buffer.from(ivB64, 'base64');
    const encrypted = Buffer.from(encB64, 'base64');
    const authTag   = Buffer.from(tagB64, 'base64');

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');

  } catch (err) {
    // Auth Tag 驗證失敗（密文被篡改）或格式錯誤
    console.error('🔐 Token 解密失敗（可能是金鑰更換或資料損毀）:', err.message);
    return null;
  }
}

// ════════════════════════════════════════════════════════════
// Token 儲存 / 讀取
// ════════════════════════════════════════════════════════════

/**
 * 儲存或更新用戶的 OAuth Tokens（加密後存入資料庫）
 *
 * @param {number} userId
 * @param {object} tokenData
 * @param {string}  tokenData.accessToken
 * @param {string}  tokenData.refreshToken
 * @param {string}  [tokenData.idToken]
 * @param {number}  tokenData.expiresIn        秒數
 * @param {string}  tokenData.scope
 * @param {string}  [tokenData.tenantId]
 * @param {string}  [tokenData.microsoftUserId]
 * @param {string}  [tokenData.microsoftEmail]
 */
async function saveOAuthTokens(userId, {
  accessToken,
  refreshToken,
  idToken,
  expiresIn,
  scope,
  tenantId,
  microsoftUserId,
  microsoftEmail,
}) {
  if (!accessToken || !refreshToken) {
    throw new Error('saveOAuthTokens: accessToken 與 refreshToken 為必填');
  }

  // Access Token 到期時間（提早 60 秒，避免邊界競爭）
  const expiresAt = new Date(Date.now() + (expiresIn - 60) * 1000);

  const payload = {
    accessToken:     encryptToken(accessToken),
    refreshToken:    encryptToken(refreshToken),
    idToken:         idToken ? encryptToken(idToken) : null,
    scopes:          scope || '',
    expiresAt,
    tenantId:        tenantId || process.env.OAUTH_MICROSOFT_TENANT_ID || 'common',
    microsoftUserId: microsoftUserId || null,
    microsoftEmail:  microsoftEmail  || null,
    isActive:        true,
    revokedAt:       null,
    lastRefreshedAt: new Date(),
  };

  await prisma.oAuthToken.upsert({
    where:  { userId },
    create: { userId, provider: 'microsoft', ...payload },
    update: payload,
  });

  console.log(`🔐 用戶 ${userId} 的 OAuth Token 已加密儲存（到期：${expiresAt.toLocaleString('zh-TW')}）`);
}

/**
 * 取得用戶的有效 Access Token
 * 自動處理：快取有效 → 直接回傳；即將過期 → 用 Refresh Token 更新
 *
 * @param {number} userId
 * @returns {Promise<{accessToken: string, microsoftUserId: string, microsoftEmail: string, scopes: string, expiresAt: Date}|null>}
 *   null = 用戶未授權或已撤銷
 * @throws {Error} Refresh Token 失效（需要用戶重新授權）
 */
async function getValidToken(userId) {
  const record = await prisma.oAuthToken.findUnique({
    where: { userId },
  });

  // 未授權或已撤銷
  if (!record || !record.isActive || record.revokedAt) {
    return null;
  }

  const now          = new Date();
  const bufferMs     = 5 * 60 * 1000;  // 提早 5 分鐘更新
  const isStillValid = (record.expiresAt - now) > bufferMs;

  if (isStillValid) {
    // Access Token 仍有效，解密後回傳
    const accessToken = decryptToken(record.accessToken);
    if (!accessToken) {
      // 解密失敗（金鑰可能已輪替），標記失效
      await markTokenInvalid(userId, '加密金鑰不符，需要重新授權');
      return null;
    }
    return {
      accessToken,
      microsoftUserId: record.microsoftUserId,
      microsoftEmail:  record.microsoftEmail,
      scopes:          record.scopes,
      expiresAt:       record.expiresAt,
    };
  }

  // Access Token 即將過期 → 使用 Refresh Token 更新
  console.log(`🔄 用戶 ${userId} 的 Token 即將過期，開始自動更新...`);
  const refreshToken = decryptToken(record.refreshToken);
  if (!refreshToken) {
    await markTokenInvalid(userId, 'Refresh Token 解密失敗，需要重新授權');
    throw Object.assign(
      new Error('Token 解密失敗，請重新連接 Microsoft 帳號'),
      { code: 'TOKEN_DECRYPT_FAILED', needsReauth: true }
    );
  }

  return await _refreshAndReturn(userId, refreshToken, record);
}

/**
 * 使用 Refresh Token 向 Microsoft 取得新的 Access Token
 *
 * @param {number} userId
 * @param {string} refreshToken  解密後的 Refresh Token
 * @param {object} [existingRecord]  現有資料庫記錄（用於保留 microsoftEmail 等）
 * @returns {Promise<{accessToken, microsoftEmail, microsoftUserId, scopes, expiresAt}>}
 */
async function _refreshAndReturn(userId, refreshToken, existingRecord) {
  const tenantId     = process.env.OAUTH_MICROSOFT_TENANT_ID || 'common';
  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     process.env.OAUTH_MICROSOFT_CLIENT_ID,
    client_secret: process.env.OAUTH_MICROSOFT_CLIENT_SECRET,
    // 維持原有 scopes（Microsoft 會回傳更新後的 scope）
    scope: [
      'openid', 'profile', 'email', 'offline_access',
      'https://graph.microsoft.com/Mail.ReadWrite',
      'https://graph.microsoft.com/Mail.Send',
      'https://graph.microsoft.com/Calendars.ReadWrite',
      'https://graph.microsoft.com/OnlineMeetings.ReadWrite',
      'https://graph.microsoft.com/Tasks.ReadWrite',
      'https://graph.microsoft.com/User.Read',
    ].join(' '),
  });

  try {
    const resp = await axios.post(tokenEndpoint, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10_000,
    });

    const { access_token, refresh_token, id_token, expires_in, scope } = resp.data;

    // 有些 Token 更新回應不包含新的 Refresh Token → 沿用舊的
    const newRefreshToken = refresh_token || refreshToken;

    await saveOAuthTokens(userId, {
      accessToken:     access_token,
      refreshToken:    newRefreshToken,
      idToken:         id_token,
      expiresIn:       expires_in,
      scope,
      tenantId,
      microsoftUserId: existingRecord?.microsoftUserId,
      microsoftEmail:  existingRecord?.microsoftEmail,
    });

    console.log(`✅ 用戶 ${userId} 的 Token 更新成功（新到期：${new Date(Date.now() + expires_in * 1000).toLocaleString('zh-TW')}）`);

    return {
      accessToken:     access_token,
      microsoftUserId: existingRecord?.microsoftUserId,
      microsoftEmail:  existingRecord?.microsoftEmail,
      scopes:          scope,
      expiresAt:       new Date(Date.now() + (expires_in - 60) * 1000),
    };

  } catch (err) {
    const errData = err.response?.data;

    // invalid_grant = Refresh Token 已過期或被用戶撤銷（在 Azure 端）
    if (errData?.error === 'invalid_grant') {
      await revokeUserTokens(userId);
      throw Object.assign(
        new Error('Microsoft 授權已失效，請重新連接您的 Microsoft 帳號'),
        { code: 'OAUTH_REFRESH_FAILED', needsReauth: true }
      );
    }

    // 其他錯誤（網路問題等）→ 暫時性失敗，不撤銷 Token
    const errMsg = errData?.error_description || err.message;
    throw Object.assign(
      new Error(`Token 更新失敗：${errMsg}`),
      { code: 'TOKEN_REFRESH_ERROR' }
    );
  }
}

/**
 * 強制撤銷用戶的 OAuth 授權（用戶主動斷開連結 or 帳號刪除）
 * @param {number} userId
 */
async function revokeUserTokens(userId) {
  await prisma.oAuthToken.updateMany({
    where: { userId, isActive: true },
    data:  { isActive: false, revokedAt: new Date() },
  });
  console.log(`🔑 用戶 ${userId} 的 Microsoft OAuth 授權已撤銷`);
}

/**
 * 內部：標記 Token 無效（解密失敗、格式錯誤等）
 */
async function markTokenInvalid(userId, reason) {
  await prisma.oAuthToken.updateMany({
    where: { userId },
    data:  { isActive: false },
  });
  console.error(`⚠️  用戶 ${userId} 的 Token 標記為無效：${reason}`);
}

/**
 * 取得用戶 Token 的非敏感元資料（給前端和健康端點使用）
 *
 * @param {number} userId
 * @returns {Promise<{connected, microsoftEmail, scopes, expiresAt, connectedAt, lastRefreshedAt}|null>}
 */
async function getUserTokenInfo(userId) {
  const record = await prisma.oAuthToken.findUnique({
    where:  { userId },
    select: {
      isActive:        true,
      revokedAt:       true,
      microsoftEmail:  true,
      scopes:          true,
      expiresAt:       true,
      createdAt:       true,
      lastRefreshedAt: true,
    },
  });

  if (!record) return null;

  return {
    connected:       record.isActive && !record.revokedAt,
    microsoftEmail:  record.microsoftEmail,
    scopes:          record.scopes?.split(' ').filter(Boolean),
    expiresAt:       record.expiresAt,
    connectedAt:     record.createdAt,
    lastRefreshedAt: record.lastRefreshedAt,
    revokedAt:       record.revokedAt,
  };
}

/**
 * 批次更新即將過期的 Token（排程任務呼叫）
 * 找出 expiresAt < 現在 + 30 分鐘 的 Token，提前更新
 *
 * @returns {Promise<{updated: number, failed: number}>}
 */
async function batchRefreshExpiringTokens() {
  const threshold = new Date(Date.now() + 30 * 60 * 1000); // 30 分鐘內到期

  const expiringTokens = await prisma.oAuthToken.findMany({
    where: {
      isActive:  true,
      revokedAt: null,
      expiresAt: { lte: threshold },
    },
    select: { userId: true, refreshToken: true, microsoftUserId: true, microsoftEmail: true },
  });

  console.log(`🔄 [排程] 即將更新 ${expiringTokens.length} 個即將過期的 OAuth Token`);

  let updated = 0, failed = 0;

  for (const token of expiringTokens) {
    try {
      const refreshToken = decryptToken(token.refreshToken);
      if (!refreshToken) {
        await markTokenInvalid(token.userId, '批次更新時解密失敗');
        failed++;
        continue;
      }
      await _refreshAndReturn(token.userId, refreshToken, token);
      updated++;
    } catch (err) {
      console.error(`❌ 用戶 ${token.userId} Token 批次更新失敗:`, err.message);
      failed++;
    }
  }

  console.log(`✅ [排程] Token 批次更新完成：成功 ${updated}，失敗 ${failed}`);
  return { updated, failed };
}

module.exports = {
  // Token 儲存 / 取得
  saveOAuthTokens,
  getValidToken,
  revokeUserTokens,
  getUserTokenInfo,

  // 排程維護
  batchRefreshExpiringTokens,

  // 低階工具（測試用）
  encryptToken,
  decryptToken,
};
