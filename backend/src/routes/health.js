/**
 * routes/health.js
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS — 系統健康檢查路由
 *
 * 端點：
 *   GET /api/health/email
 *     ├── 檢查 Microsoft Graph API 設定是否完整
 *     ├── 回報 Token 快取狀態與剩餘秒數
 *     ├── 回報最後一次成功發信時間
 *     └── 可選：?ping=true 立即測試 Graph API 連線
 *
 * HTTP 狀態碼語意：
 *   200 OK           — 設定完整且有有效 Token 快取
 *   207 Multi-Status — 設定完整但尚無 Token 快取（服務可用，但首次呼叫需取 Token）
 *   503 Unavailable  — 缺少必要環境變數（服務無法發信）
 */

'use strict';

const express = require('express');
const router  = express.Router();

const { getTokenStatus, getAccessToken } = require('../services/graphAuth');

// ════════════════════════════════════════════════════════════════
// 內部狀態追蹤（記憶體）
// 跨重啟需改用 Redis；目前用記憶體方便 Docker 環境快速部署
// ════════════════════════════════════════════════════════════════

/** @type {{ at: string, to: string }|null} */
let _lastSuccessfulSend = null;

/** @type {{ at: string, code: string, message: string }|null} */
let _lastFailure = null;

/** 供 emailService.js 在成功發送後呼叫，更新最後成功紀錄 */
function recordSuccessfulSend(recipientEmail) {
  _lastSuccessfulSend = {
    at: new Date().toISOString(),
    to: recipientEmail
      ? recipientEmail.replace(/^(.{2}).*@/, '$1***@')  // 遮蔽收件人隱私
      : 'unknown',
  };
}

/** 供 emailService.js 在發送失敗後呼叫，更新最後失敗紀錄 */
function recordFailedSend(error) {
  _lastFailure = {
    at:      new Date().toISOString(),
    code:    error?.code    || 'UNKNOWN',
    message: error?.message ? error.message.split('\n')[0] : '未知錯誤',
  };
}

// ════════════════════════════════════════════════════════════════
// GET /api/health/email
// ════════════════════════════════════════════════════════════════

/**
 * @api {get}  /api/health/email  郵件服務健康檢查
 *
 * @apiQuery {boolean} [ping=false]  true = 即時測試 Graph API Token 取得
 *
 * @apiSuccess {string}  status          healthy | degraded | unavailable
 * @apiSuccess {boolean} success
 * @apiSuccess {string}  timestamp       ISO 8601 查詢時間
 * @apiSuccess {Object}  graph           Graph API 設定狀態
 * @apiSuccess {Object}  sender          寄件者設定狀態
 * @apiSuccess {Object}  stats           發送統計
 * @apiSuccess {Object}  [connectivity]  即時 ping 結果（?ping=true 才有）
 */
router.get('/email', async (req, res) => {
  const runPing = req.query.ping === 'true';

  // ── 1. 必要環境變數完整性檢查 ──────────────────────────────
  const REQUIRED_VARS = [
    'O365_CLIENT_ID',
    'O365_CLIENT_SECRET',
    'O365_TENANT_ID',
    'O365_SENDER_EMAIL',
  ];
  const missingVars = REQUIRED_VARS.filter(k => !process.env[k]);
  const isConfigured = missingVars.length === 0;

  // ── 2. Token 快取狀態（不觸發 HTTP，純記憶體讀取）─────────
  const tokenStatus = getTokenStatus();

  // ── 3. 寄件者顯示（部分遮蔽保護隱私）────────────────────
  const rawSender    = process.env.O365_SENDER_EMAIL || '';
  const maskedSender = rawSender
    ? rawSender.replace(/^(.{3})(.*)(@.+)$/, (_, prefix, mid, domain) =>
        `${prefix}${'*'.repeat(Math.min(mid.length, 5))}${domain}`
      )
    : '未設定';

  // ── 4. 即時 Ping（?ping=true，可選）─────────────────────
  let connectivity = undefined;
  if (runPing) {
    if (!isConfigured) {
      connectivity = {
        status:  'skipped',
        message: '缺少環境變數，無法測試',
      };
    } else {
      const pingStart = Date.now();
      try {
        await getAccessToken();
        connectivity = {
          status:    'ok',
          latencyMs: Date.now() - pingStart,
          message:   '成功連線至 Microsoft Graph API',
        };
      } catch (err) {
        connectivity = {
          status:    'error',
          latencyMs: Date.now() - pingStart,
          message:   err.message.split('\n')[0],
          code:      err.code || 'GRAPH_AUTH_FAILED',
        };
      }
    }
  }

  // ── 5. 組合回應 ───────────────────────────────────────────
  const payload = {
    graph: {
      configured:    isConfigured,
      tokenCached:   tokenStatus.cached,
      expiresIn:     tokenStatus.expiresIn,   // 剩餘秒數（null = 無快取）
      expiresInMin:  tokenStatus.expiresIn != null
        ? Math.floor(tokenStatus.expiresIn / 60)
        : null,
      tenantId:      tokenStatus.tenantId,    // 已安全遮蔽
      clientId:      tokenStatus.clientId,    // 已安全遮蔽
      ...(missingVars.length > 0 && { missingVars }),
    },
    sender: {
      configured: !!rawSender,
      email:      maskedSender,
    },
    stats: {
      lastSendAt:    _lastSuccessfulSend?.at     || null,
      lastSendTo:    _lastSuccessfulSend?.to     || null,
      lastFailureAt: _lastFailure?.at            || null,
      lastFailureCode: _lastFailure?.code        || null,
    },
    ...(connectivity && { connectivity }),
  };

  // ── 6. HTTP 狀態碼決策 ────────────────────────────────────
  // 503: 未設定（系統無法發信）
  // 207: 設定完整但無 Token 快取（第一次呼叫需取 Token）
  // 200: 設定完整且有有效快取
  let httpStatus = 200;
  let statusLabel = 'healthy';

  if (!isConfigured) {
    httpStatus  = 503;
    statusLabel = 'unavailable';
  } else if (!tokenStatus.cached) {
    httpStatus  = 207;
    statusLabel = 'degraded';
  } else if (connectivity?.status === 'error') {
    httpStatus  = 503;
    statusLabel = 'unavailable';
  }

  res.status(httpStatus).json({
    success:   httpStatus < 500,
    status:    statusLabel,
    service:   'microsoft-graph-email',
    timestamp: new Date().toISOString(),
    ...payload,
  });
});

// ════════════════════════════════════════════════════════════════
// 模組匯出
// ════════════════════════════════════════════════════════════════

module.exports = router;

// 供 emailService.js 呼叫，更新發送統計（已遮蔽隱私）
module.exports.recordSuccessfulSend = recordSuccessfulSend;
module.exports.recordFailedSend     = recordFailedSend;
