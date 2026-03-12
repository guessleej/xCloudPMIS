'use strict';
/**
 * mcp-external-server/middleware/rateLimiter.js
 * ─────────────────────────────────────────────────────────────
 * API Key 速率限制（Redis Sliding Window）
 *
 * 演算法：滑動窗口（Sliding Window）
 * 儲存：Redis ZSET（timestamp 作為 score）
 * 回退：若 Redis 不可用，改用記憶體（in-process）計數
 *
 * 限制：
 *   - 每個 API Key：預設 100 requests/minute
 *   - /mcp/messages（輕量）：500 requests/minute
 *   - 超出回傳 429 Too Many Requests
 */

// Redis client（共用，若有）
let _redis = null;
function getRedis() {
  if (!_redis) {
    try {
      const { createClient } = require('redis');
      _redis = createClient({
        socket:   { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') },
        password: process.env.REDIS_PASSWORD || undefined,
      });
      _redis.connect().catch(() => { _redis = null; });
    } catch (_) { _redis = null; }
  }
  return _redis;
}

// In-process fallback（Redis 不可用時）
const _memoryStore = new Map();   // key → { count, resetAt }

// ════════════════════════════════════════════════════════════
// 核心：滑動窗口計數
// ════════════════════════════════════════════════════════════

/**
 * 檢查並增加計數
 * @param {string} identifier  唯一識別（API Key ID）
 * @param {number} limit       每分鐘上限
 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
 */
async function checkLimit(identifier, limit = 100) {
  const windowMs  = 60_000;        // 1 minute window
  const now       = Date.now();
  const windowKey = `mcp:rl:${identifier}`;

  const redis = getRedis();

  if (redis?.isReady) {
    // Redis Sliding Window（ZSET）
    try {
      const pipeline = redis.multi();
      pipeline.zRemRangeByScore(windowKey, 0, now - windowMs);  // 清除過期
      pipeline.zAdd(windowKey, { score: now, value: `${now}-${Math.random()}` });
      pipeline.zCard(windowKey);
      pipeline.pExpire(windowKey, windowMs);
      const results = await pipeline.exec();

      const count = Number(results[2]);
      const allowed   = count <= limit;
      const remaining = Math.max(0, limit - count);
      const resetAt   = now + windowMs;

      return { allowed, remaining, resetAt, count };
    } catch (_) {
      // Redis 失敗，fallback
    }
  }

  // In-process fallback
  const entry = _memoryStore.get(identifier);
  if (!entry || now > entry.resetAt) {
    _memoryStore.set(identifier, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  entry.count++;
  const allowed   = entry.count <= limit;
  const remaining = Math.max(0, limit - entry.count);
  return { allowed, remaining, resetAt: entry.resetAt };
}

// ════════════════════════════════════════════════════════════
// Express Middleware
// ════════════════════════════════════════════════════════════

/**
 * rateLimiter.check
 * 依 API Key 的設定速率限制（req.apiKeyInfo.rateLimit）
 * 需在 apiKeyManager.middleware 之後使用
 */
async function check(req, res, next) {
  const info  = req.apiKeyInfo;
  if (!info) return next();  // 跳過（公開端點）

  const limit  = info.rateLimit || 100;
  const result = await checkLimit(info.id, limit);

  res.setHeader('X-RateLimit-Limit',     limit);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset',     Math.ceil(result.resetAt / 1000));

  if (!result.allowed) {
    return res.status(429).json({
      error:     'Rate limit exceeded',
      limit,
      remaining: 0,
      resetAt:   new Date(result.resetAt).toISOString(),
    });
  }
  next();
}

/**
 * rateLimiter.checkLight
 * /mcp/messages 用（輕量，較高限制）
 * Session 已在 /mcp/sse 認證，此處用 sessionId 計數
 */
async function checkLight(req, res, next) {
  const sessionId = req.query.sessionId || req.headers['x-session-id'] || req.ip;
  const result    = await checkLimit(`light:${sessionId}`, 500);

  if (!result.allowed) {
    return res.status(429).json({ error: 'Message rate limit exceeded', limit: 500 });
  }
  next();
}

module.exports = { check, checkLight };
