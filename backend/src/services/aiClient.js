'use strict';
/**
 * services/aiClient.js
 * ─────────────────────────────────────────────────────────────
 * AI 服務 HTTP 客戶端
 *
 * 職責：
 *   - 封裝對 pmis-ai-service 的 HTTP 呼叫
 *   - 提供與原 aiAgent.js 相同的 API 介面，讓呼叫方零改動
 *   - 若 ai-service 不可用，優雅降級回 aiAgent.js 直接呼叫
 *
 * 環境變數：
 *   INTERNAL_AI_SERVICE_URL  - AI 服務位址（預設 http://ai-service:3002）
 *   INTERNAL_API_SECRET      - 服務間認證秘鑰
 *   AI_SERVICE_TIMEOUT_MS    - 請求逾時（預設 120000ms）
 */

const http    = require('http');
const https   = require('https');
const { URL } = require('url');

const AI_SERVICE_BASE = process.env.INTERNAL_AI_SERVICE_URL || 'http://ai-service:3002';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET     || 'pmis-internal-secret-dev';
const TIMEOUT_MS      = parseInt(process.env.AI_SERVICE_TIMEOUT_MS) || 120_000;

// 降級開關：若 ai-service 連續失敗，暫時切回直接呼叫
let _circuitOpen      = false;
let _circuitOpenUntil = 0;
const CIRCUIT_RESET_MS = 60_000; // 1 分鐘後重試

/**
 * 向 AI 服務發送 POST 請求
 * @param {string} endpoint - 路由（如 '/risk'）
 * @param {object} body     - 請求主體
 * @returns {Promise<object>}
 */
async function _post(endpoint, body) {
  // 熔斷器：短路開路時直接拋錯，呼叫方降級到 aiAgent.js
  if (_circuitOpen && Date.now() < _circuitOpenUntil) {
    throw new Error('AI service circuit open');
  }

  return new Promise((resolve, reject) => {
    const payload   = JSON.stringify(body);
    const parsedUrl = new URL(AI_SERVICE_BASE + endpoint);
    const isHttps   = parsedUrl.protocol === 'https:';
    const lib       = isHttps ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port:     parsedUrl.port || (isHttps ? 443 : 80),
      path:     parsedUrl.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':     'application/json',
        'Content-Length':   Buffer.byteLength(payload),
        'x-internal-secret': INTERNAL_SECRET,
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.error || `AI service error ${res.statusCode}`));
          } else {
            // 熔斷器復位
            _circuitOpen = false;
            resolve(parsed);
          }
        } catch {
          reject(new Error('AI service 回應解析失敗'));
        }
      });
    });

    req.on('error', (err) => {
      // 連線失敗 → 開路熔斷器
      _circuitOpen      = true;
      _circuitOpenUntil = Date.now() + CIRCUIT_RESET_MS;
      console.warn(`[aiClient] AI service 不可用，啟動熔斷器 ${CIRCUIT_RESET_MS / 1000}s: ${err.message}`);
      reject(err);
    });

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`AI service 請求逾時 (${TIMEOUT_MS}ms)`));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * 降級：若 ai-service 不可用，直接呼叫本機 aiAgent.js
 */
function _fallback(fnName, ...args) {
  console.warn(`[aiClient] 降級到本機 aiAgent.js::${fnName}`);
  const aiAgent = require('./aiAgent');
  if (typeof aiAgent[fnName] !== 'function') {
    throw new Error(`aiAgent.${fnName} 不存在`);
  }
  return aiAgent[fnName](...args);
}

// ════════════════════════════════════════════════════════════
// 公開 API（與 aiAgent.js 介面完全相同）
// ════════════════════════════════════════════════════════════

/**
 * 任務拆解
 * @param {string} projectGoal
 * @param {object} options
 */
async function breakdownTask(projectGoal, options = {}) {
  try {
    return await _post('/breakdown', { projectGoal, options });
  } catch (err) {
    if (err.message === 'AI service circuit open' || err.code === 'ECONNREFUSED') {
      return _fallback('breakdownTask', projectGoal, options);
    }
    throw err;
  }
}

/**
 * 風險分析
 * @param {object} projectData
 */
async function analyzeRisk(projectData) {
  try {
    return await _post('/risk', projectData);
  } catch (err) {
    if (err.message === 'AI service circuit open' || err.code === 'ECONNREFUSED') {
      return _fallback('analyzeRisk', projectData);
    }
    throw err;
  }
}

/**
 * 週報生成
 * @param {object} reportData
 */
async function generateWeeklyReport(reportData) {
  try {
    return await _post('/weekly-report', reportData);
  } catch (err) {
    if (err.message === 'AI service circuit open' || err.code === 'ECONNREFUSED') {
      return _fallback('generateWeeklyReport', reportData);
    }
    throw err;
  }
}

/**
 * 排程優化
 * @param {object} projectData
 */
async function optimizeSchedule(projectData) {
  try {
    return await _post('/schedule', projectData);
  } catch (err) {
    if (err.message === 'AI service circuit open' || err.code === 'ECONNREFUSED') {
      return _fallback('optimizeSchedule', projectData);
    }
    throw err;
  }
}

/**
 * 健康度評分（同步）
 * 透過 ai-service 執行，或本機計算
 * @param {object} projectData
 */
async function computeHealthScore(projectData) {
  try {
    return await _post('/health-score', projectData);
  } catch {
    // 此函式為純計算，直接降級無延遲
    const aiAgent = require('./aiAgent');
    return aiAgent.computeHealthScore(projectData);
  }
}

/**
 * 清除 AI 設定快取（更新 AI 模型設定後呼叫）
 * 同時清除 ai-service 的快取（若可用）
 */
function invalidateConfigCache() {
  // 清除本機 aiAgent 快取（降級模式用）
  try {
    const aiAgent = require('./aiAgent');
    aiAgent.invalidateConfigCache();
  } catch { /* ignore */ }
  // 重置熔斷器（讓 ai-service 重試）
  _circuitOpen = false;
}

module.exports = {
  breakdownTask,
  analyzeRisk,
  generateWeeklyReport,
  optimizeSchedule,
  computeHealthScore,
  invalidateConfigCache,
};
