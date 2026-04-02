/**
 * JWT 統一設定 — Single Source of Truth
 * ─────────────────────────────────────────────────────────────
 * 所有 JWT 簽發與驗證都必須使用此模組取得密鑰，
 * 避免各檔案各自讀取不同環境變數導致 Token 無法驗證。
 *
 * 環境變數優先順序：
 *   1. APP_JWT_SECRET   ← 正式環境推薦使用
 *   2. JWT_SECRET        ← 向下相容舊設定
 *   3. 開發預設值        ← 僅限本機開發
 *
 * 在 .env 中至少設定其中一個即可：
 *   APP_JWT_SECRET=your-production-secret
 */

'use strict';

const isProduction = process.env.NODE_ENV === 'production';

const JWT_SECRET  = process.env.APP_JWT_SECRET
                 || process.env.JWT_SECRET
                 || (isProduction ? undefined : 'xcloud-dev-secret-change-in-production');

if (!JWT_SECRET) {
  console.error('❌ [FATAL] 正式環境必須設定 APP_JWT_SECRET 或 JWT_SECRET 環境變數');
  process.exit(1);
}

const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

module.exports = { JWT_SECRET, JWT_EXPIRES };
