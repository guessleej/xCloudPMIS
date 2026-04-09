/**
 * Prisma 全域單例 (Singleton)
 *
 * 整個後端共用同一個 PrismaClient 實例，
 * 避免每個路由 / 服務各自 new PrismaClient() 導致連線池爆滿。
 *
 * Azure PostgreSQL Basic Tier 最多允許 ~50 條連線，
 * 若每個模組各建一個 PrismaClient（預設 5 條），30 個模組就 150 條 → 直接爆掉。
 *
 * 使用方式：
 *   const prisma = require('../lib/prisma');   // 路由層
 *   const prisma = require('../../lib/prisma'); // services 層
 */

const { PrismaClient } = require('@prisma/client');

/** @type {PrismaClient} */
let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['error'],
    // 連線池大小由 DATABASE_URL 的 connection_limit 控制，或使用 Prisma 預設值
  });
} else {
  // 開發環境：把實例掛在 globalThis 避免 nodemon 重載時重複建立
  if (!globalThis.__prisma) {
    globalThis.__prisma = new PrismaClient({
      log: ['warn', 'error'],
    });
  }
  prisma = globalThis.__prisma;
}

module.exports = prisma;
