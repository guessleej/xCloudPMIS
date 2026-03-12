'use strict';
/**
 * mcp-external-server/auth/apiKeyManager.js
 * ─────────────────────────────────────────────────────────────
 * API Key 管理
 *
 * 儲存：Redis（快取）+ PostgreSQL（持久化，mcp_api_keys 表）
 *
 * Key 格式：pmis_<32位元十六進位>
 * 範例：pmis_a1b2c3d4e5f6...
 *
 * Scopes（權限範圍）：
 *   read:projects, write:projects
 *   read:tasks,    write:tasks
 *   read:team,     write:team
 *   read:reports
 *   write:notifications
 *   rpa:execute
 *   admin:*
 */

const crypto = require('crypto');
const { v4: uuid } = require('uuid');

// ── 依賴 ───────────────────────────────────────────────────
// 共用 Redis client（若有）
let _redis = null;
function getRedis() {
  if (!_redis) {
    try {
      const redis = require('redis');
      _redis = redis.createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
        password: process.env.REDIS_PASSWORD || undefined,
      });
      _redis.connect().catch(e => {
        console.warn('[ApiKey] Redis 連線失敗，改用 PostgreSQL only:', e.message);
        _redis = null;
      });
    } catch (_) {
      _redis = null;
    }
  }
  return _redis;
}

// 共用 Prisma client
let _prisma = null;
function getPrisma() {
  if (!_prisma) {
    const { PrismaClient } = require('@prisma/client');
    _prisma = new PrismaClient({ log: ['error'] });
  }
  return _prisma;
}

// ── 初始化：確保 mcp_api_keys 表存在 ─────────────────────────
async function ensureTable() {
  const prisma = getPrisma();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mcp_api_keys (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key_hash    VARCHAR(64) NOT NULL UNIQUE,
      key_prefix  VARCHAR(16) NOT NULL,
      system_name VARCHAR(128) NOT NULL,
      company_id  INTEGER NOT NULL,
      scopes      TEXT[] NOT NULL DEFAULT '{}',
      ip_whitelist TEXT[] DEFAULT NULL,
      rate_limit  INTEGER NOT NULL DEFAULT 100,
      is_active   BOOLEAN NOT NULL DEFAULT TRUE,
      last_used_at TIMESTAMPTZ,
      expires_at  TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_hash ON mcp_api_keys (key_hash);
    CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_company ON mcp_api_keys (company_id);
  `);
}

// 確保表格存在（應用啟動時）
ensureTable().catch(e => console.error('[ApiKey] 建表失敗:', e.message));

// ════════════════════════════════════════════════════════════
// 公開 API
// ════════════════════════════════════════════════════════════

/**
 * 建立新 API Key
 * @param {Object} opts
 * @param {string}   opts.systemName   外部系統名稱（e.g. "Slack Bot"）
 * @param {number}   opts.companyId    綁定公司 ID
 * @param {string[]} opts.scopes       權限範圍（預設 read only）
 * @param {string[]} opts.ipWhitelist  IP 白名單（可選）
 * @param {number}   opts.rateLimit    每分鐘限制（預設 100）
 * @returns {{ id, apiKey, systemName, companyId, scopes }}
 */
async function createKey({ systemName, companyId, scopes = ['read:projects', 'read:tasks'], ipWhitelist = null, rateLimit = 100 }) {
  // 生成 Key：pmis_ + 32 位元十六進位（128-bit entropy）
  const rawKey   = `pmis_${crypto.randomBytes(16).toString('hex')}`;
  const keyHash  = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 12) + '...';

  const prisma = getPrisma();
  const result = await prisma.$queryRawUnsafe(`
    INSERT INTO mcp_api_keys (key_hash, key_prefix, system_name, company_id, scopes, ip_whitelist, rate_limit)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, key_prefix, system_name, company_id, scopes, created_at
  `, keyHash, keyPrefix, systemName, companyId, scopes, ipWhitelist, rateLimit);

  const row = Array.isArray(result) ? result[0] : result;

  console.log(`[ApiKey] ✅ Created: ${systemName} (company#${companyId}) scopes=[${scopes.join(',')}]`);

  return {
    id:         row.id,
    apiKey:     rawKey,           // 只回傳一次！請妥善保存
    keyPrefix:  keyPrefix,
    systemName: row.system_name,
    companyId:  row.company_id,
    scopes:     row.scopes,
    createdAt:  row.created_at,
    warning:    'API Key 只會顯示一次，請立即儲存！',
  };
}

/**
 * 驗證 API Key（高效快取版）
 * @param {string} apiKey
 * @param {string} [clientIp]
 * @returns {Object} apiKeyInfo
 */
async function verifyKey(apiKey, clientIp) {
  if (!apiKey?.startsWith('pmis_')) {
    throw Object.assign(new Error('Invalid API Key format'), { status: 401 });
  }

  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  // 1. 嘗試 Redis 快取
  const redis = getRedis();
  if (redis?.isReady) {
    const cached = await redis.get(`mcp:key:${keyHash}`).catch(() => null);
    if (cached) {
      const info = JSON.parse(cached);
      if (!info.isActive) throw Object.assign(new Error('API Key revoked'), { status: 401 });
      return info;
    }
  }

  // 2. 查詢 PostgreSQL
  const prisma = getPrisma();
  const rows   = await prisma.$queryRawUnsafe(`
    SELECT id, system_name, company_id, scopes, ip_whitelist, rate_limit, is_active, expires_at
    FROM mcp_api_keys
    WHERE key_hash = $1
    LIMIT 1
  `, keyHash);

  const row = Array.isArray(rows) ? rows[0] : null;

  if (!row)            throw Object.assign(new Error('API Key not found'),  { status: 401 });
  if (!row.is_active)  throw Object.assign(new Error('API Key revoked'),    { status: 401 });
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    throw Object.assign(new Error('API Key expired'), { status: 401 });
  }

  // IP 白名單檢查
  if (row.ip_whitelist?.length && clientIp && !row.ip_whitelist.includes(clientIp)) {
    throw Object.assign(new Error(`IP ${clientIp} not in whitelist`), { status: 403 });
  }

  const info = {
    id:         row.id,
    systemName: row.system_name,
    companyId:  row.company_id,
    scopes:     row.scopes || [],
    rateLimit:  row.rate_limit,
    isActive:   row.is_active,
  };

  // 存入 Redis 快取（5 分鐘）
  if (redis?.isReady) {
    await redis.setEx(`mcp:key:${keyHash}`, 300, JSON.stringify(info)).catch(() => {});
  }

  // 更新 last_used_at（非同步，不阻塞）
  prisma.$executeRawUnsafe(
    `UPDATE mcp_api_keys SET last_used_at = NOW() WHERE key_hash = $1`,
    keyHash
  ).catch(() => {});

  return info;
}

/**
 * 撤銷 API Key
 */
async function revokeKey(keyId) {
  const prisma = getPrisma();
  await prisma.$executeRawUnsafe(
    `UPDATE mcp_api_keys SET is_active = FALSE WHERE id = $1`,
    keyId
  );

  // 清除 Redis 快取（無法精確清 hash，設 TTL 讓它自然過期即可）
  console.log(`[ApiKey] Revoked: ${keyId}`);
}

/**
 * 列出 API Keys
 */
async function listKeys(companyId) {
  const prisma = getPrisma();
  const where  = companyId ? `WHERE company_id = ${companyId}` : '';
  const rows   = await prisma.$queryRawUnsafe(`
    SELECT id, key_prefix, system_name, company_id, scopes, rate_limit, is_active, last_used_at, created_at
    FROM mcp_api_keys
    ${where}
    ORDER BY created_at DESC
  `);
  return Array.isArray(rows) ? rows : [];
}

/**
 * hasScope - 判斷 API Key 是否有指定的 scope
 */
function hasScope(apiKeyInfo, requiredScope) {
  const scopes = apiKeyInfo.scopes || [];
  if (scopes.includes('admin:*')) return true;
  return scopes.includes(requiredScope);
}

// ════════════════════════════════════════════════════════════
// Express Middleware
// ════════════════════════════════════════════════════════════

/**
 * middleware — 驗證 X-API-Key
 * 通過後在 req.apiKeyInfo 提供認證資訊
 */
async function middleware(req, res, next) {
  const apiKey   = req.headers['x-api-key'];
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;

  if (!apiKey) {
    return res.status(401).json({
      error:  'Missing X-API-Key header',
      detail: 'Request GET /mcp/discovery for usage instructions',
    });
  }

  try {
    req.apiKeyInfo = await verifyKey(apiKey, clientIp);
    next();
  } catch (err) {
    return res.status(err.status || 401).json({
      error:  err.message,
      code:   'AUTH_FAILED',
    });
  }
}

module.exports = { createKey, verifyKey, revokeKey, listKeys, hasScope, middleware };
