/**
 * services/cache.js
 * ─────────────────────────────────────────────────────────────
 * Redis 單例模組 — 全域共用的 Redis 客戶端
 *
 * 設計原則：
 *   - 採用 Singleton 模式，確保整個應用程式只建立一個 Redis 連線池
 *   - 懶加載（Lazy Init）：首次呼叫 getRedis() 時才建立連線
 *   - 連線錯誤不拋出（僅 console.error），避免因 Redis 不可用導致整個服務崩潰
 *   - 支援 retry strategy（連線失敗後自動重試）
 *
 * 使用方式：
 *   const { getRedis } = require('./cache');
 *   const redis = await getRedis();
 *   await redis.set('key', 'value', { EX: 300 });
 *   const val = await redis.get('key');
 */

'use strict';

const redis = require('redis');

// ── 單例實例 ─────────────────────────────────────────────────
let _client          = null;
let _connectPromise  = null;

/**
 * 取得已連線的 Redis 客戶端（Singleton）
 * @returns {Promise<import('redis').RedisClientType>}
 */
async function getRedis() {
  // 已連線：直接回傳
  if (_client?.isReady) return _client;

  // 正在連線中：等待同一個 Promise（防止多個 caller 同時建立多個連線）
  if (_connectPromise) return _connectPromise;

  _connectPromise = (async () => {
    _client = redis.createClient({
      socket: {
        host:             process.env.REDIS_HOST || 'localhost',
        port:             parseInt(process.env.REDIS_PORT) || 6379,
        reconnectStrategy: (retries) => {
          // 最多重試 10 次，間隔 exponential backoff（最長 30 秒）
          if (retries > 10) return false;
          return Math.min(retries * 500, 30_000);
        },
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    _client.on('error',        (err) => console.error('❌ Redis 錯誤:', err.message));
    _client.on('reconnecting', ()    => console.warn('⚠️  Redis 重新連線中...'));
    _client.on('ready',        ()    => console.log('✅ Redis 連線就緒'));

    await _client.connect();
    return _client;
  })();

  _connectPromise.catch(() => {
    _connectPromise = null; // 連線失敗時清空，允許下次重試
  });

  return _connectPromise;
}

/**
 * 安全的 Redis SET（key 不存在才設定，含 TTL）
 * @param {string} key
 * @param {string} value
 * @param {number} ttlSeconds
 * @returns {Promise<boolean>}  true = 設定成功，false = key 已存在
 */
async function setIfNotExists(key, value, ttlSeconds) {
  const redis = await getRedis();
  const result = await redis.set(key, value, { NX: true, EX: ttlSeconds });
  return result === 'OK';
}

/**
 * 安全的 Redis GET + DELETE（原子操作替代方案）
 * 先取值再刪除，用於 one-time token（如 PKCE state）
 * @param {string} key
 * @returns {Promise<string|null>}
 */
async function getAndDelete(key) {
  const r = await getRedis();
  const value = await r.get(key);
  if (value !== null) await r.del(key);
  return value;
}

module.exports = {
  getRedis,
  setIfNotExists,
  getAndDelete,
};
