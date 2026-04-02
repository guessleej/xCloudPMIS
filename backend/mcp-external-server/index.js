'use strict';
/**
 * mcp-external-server/index.js
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS 對外 MCP Server（SSE 模式）
 *
 * 架構：
 *   - 傳輸層：Server-Sent Events (SSE)
 *   - 協議：Model Context Protocol (MCP) v1.0
 *   - 認證：X-API-Key header（每個外部系統一個 Key）
 *   - 隔離：API Key 綁定 Tenant（公司），資料嚴格隔離
 *
 * 端點：
 *   GET  /mcp/health          - 健康檢查（無需認證）
 *   GET  /mcp/discovery       - 探索所有可用 Tools/Resources（無需認證）
 *   GET  /mcp/sse             - SSE 長連線（建立 MCP Session）
 *   POST /mcp/messages        - 接收 Tool/Resource 呼叫
 *   POST /mcp/webhook/rpa     - 接收 OpenClaw RPA 執行結果回呼
 *   GET  /mcp/admin/keys      - 列出 API Key（需管理員 key）
 *   POST /mcp/admin/keys      - 建立 API Key（需管理員 key）
 *   DELETE /mcp/admin/keys/:id - 撤銷 API Key（需管理員 key）
 *
 * 使用方式：
 *   node mcp-external-server/index.js
 *   PORT=3100（預設）
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const express            = require('express');
const cors               = require('cors');
const crypto             = require('crypto');
const { v4: uuid }       = require('uuid');

const { Server }             = require('@modelcontextprotocol/sdk/server/index.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const ApiKeyManager    = require('./auth/apiKeyManager');
const rateLimiter      = require('./middleware/rateLimiter');
const sessionManager   = require('./utils/sessionManager');
const toolHandlers     = require('./handlers/tools');
const resourceHandlers = require('./handlers/resources');

// ════════════════════════════════════════════════════════════
// 常數
// ════════════════════════════════════════════════════════════

const PORT         = parseInt(process.env.MCP_PORT  || '3100');
const ADMIN_KEY    = process.env.MCP_ADMIN_KEY       || null;
const HEARTBEAT_MS = parseInt(process.env.MCP_HEARTBEAT_MS || '15000');
const SERVER_INFO  = { name: 'xcloudpmis', version: '1.0.0' };

// ════════════════════════════════════════════════════════════
// Express App
// ════════════════════════════════════════════════════════════

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(cors({
  origin:         process.env.MCP_CORS_ORIGIN?.split(',') || '*',
  methods:        ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key', 'X-Session-Id', 'Authorization'],
  exposedHeaders: ['X-Session-Id'],
}));

// 請求日誌（排除心跳）
app.use((req, _res, next) => {
  if (!req.path.includes('/health') && !req.path.includes('/mcp/messages')) {
    console.log(`[MCP] → ${req.method} ${req.path}`);
  }
  next();
});

// ════════════════════════════════════════════════════════════
// 公開端點（不需認證）
// ════════════════════════════════════════════════════════════

/**
 * GET /mcp/health
 * Docker healthcheck 用
 */
app.get('/mcp/health', (_req, res) => {
  res.json({
    status:    'ok',
    service:   'xCloudPMIS MCP External Server',
    version:   SERVER_INFO.version,
    sessions:  sessionManager.count(),
    uptime:    Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /mcp/discovery
 * 類似 OpenAPI 文件，但 MCP 格式
 * 外部開發者可以先查詢有哪些 Tools / Resources 可用
 */
app.get('/mcp/discovery', (_req, res) => {
  res.json({
    name:        'xCloudPMIS MCP Open Platform',
    version:     SERVER_INFO.version,
    description: '企業專案管理系統 MCP 開放平台 — 讓 Claude / Slack / GitHub / CRM / OpenClaw 透過 MCP 存取專案管理功能',
    transport: {
      sse: {
        connect:  `GET /mcp/sse  (Header: X-API-Key)`,
        messages: `POST /mcp/messages?sessionId={id}`,
      },
    },
    auth: {
      type:        'apiKey',
      header:      'X-API-Key',
      description: '聯繫管理員建立 API Key（POST /mcp/admin/keys）',
    },
    scopes: [
      { scope: 'read:projects',       description: '讀取專案清單與詳情' },
      { scope: 'write:projects',      description: '建立/修改專案' },
      { scope: 'read:tasks',          description: '讀取任務資料' },
      { scope: 'write:tasks',         description: '建立/修改任務、新增評論' },
      { scope: 'read:team',           description: '讀取團隊成員與負載' },
      { scope: 'write:team',          description: '指派任務給成員' },
      { scope: 'read:reports',        description: '讀取報告與分析' },
      { scope: 'write:notifications', description: '發送系統通知' },
      { scope: 'rpa:execute',         description: '觸發 OpenClaw RPA 自動化流程' },
      { scope: 'admin:*',             description: '完整管理權限（含建立 API Key）' },
    ],
    tools:     toolHandlers.TOOL_DEFINITIONS.map(t => ({
      name:           t.name,
      description:    t.description,
      requiredScopes: t.requiredScopes || [],
    })),
    resources: resourceHandlers.RESOURCE_TEMPLATES,
    rateLimit: {
      default:    '100 requests/minute per API Key',
      burst:      '20 requests/second',
    },
    rpa: {
      description: 'OpenClaw RPA 整合',
      webhook:     'POST /mcp/webhook/rpa',
      tool:        'rpa_execute_flow',
    },
  });
});

// ════════════════════════════════════════════════════════════
// 管理端點（需要 MCP_ADMIN_KEY）
// ════════════════════════════════════════════════════════════

function requireAdmin(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Admin key required' });
  }
  next();
}

/** GET  /mcp/admin/keys — 列出所有 API Key */
app.get('/mcp/admin/keys', requireAdmin, async (req, res) => {
  try {
    const keys = await ApiKeyManager.listKeys(req.query.companyId ? parseInt(req.query.companyId) : undefined);
    res.json({ success: true, data: keys });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** POST /mcp/admin/keys — 建立 API Key */
app.post('/mcp/admin/keys', requireAdmin, async (req, res) => {
  const { systemName, companyId, scopes, ipWhitelist, rateLimit } = req.body;
  if (!systemName || !companyId) {
    return res.status(400).json({ error: 'systemName 與 companyId 為必填' });
  }
  try {
    const key = await ApiKeyManager.createKey({ systemName, companyId: parseInt(companyId), scopes, ipWhitelist, rateLimit });
    res.status(201).json({ success: true, data: key });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** DELETE /mcp/admin/keys/:keyId — 撤銷 API Key */
app.delete('/mcp/admin/keys/:keyId', requireAdmin, async (req, res) => {
  try {
    await ApiKeyManager.revokeKey(req.params.keyId);
    res.json({ success: true, message: 'API Key 已撤銷' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════════════════════════
// MCP SSE 端點（核心）
// ════════════════════════════════════════════════════════════

/**
 * GET /mcp/sse
 * 建立 SSE 長連線，每個外部系統一個 Session
 *
 * 流程：
 *   1. 驗證 X-API-Key
 *   2. 建立 MCP Server 實例（綁定 companyId 隔離）
 *   3. 注冊所有 Tool / Resource / Prompt handlers
 *   4. 建立 SSEServerTransport
 *   5. 回傳 Session ID（X-Session-Id header）
 *   6. 心跳每 15s 發送 `: ping`
 */
app.get('/mcp/sse', ApiKeyManager.middleware, rateLimiter.check, async (req, res) => {
  const { apiKeyInfo } = req;
  const sessionId = uuid();

  // ── SSE Headers ────────────────────────────────────────────
  res.setHeader('Content-Type',                  'text/event-stream');
  res.setHeader('Cache-Control',                 'no-cache');
  res.setHeader('Connection',                    'keep-alive');
  res.setHeader('X-Accel-Buffering',             'no');   // 關閉 nginx 緩衝
  res.setHeader('X-Session-Id',                  sessionId);
  res.setHeader('Access-Control-Expose-Headers', 'X-Session-Id');
  res.flushHeaders();

  // ── 建立 MCP Server 實例 ────────────────────────────────────
  const mcpServer = new Server(SERVER_INFO, {
    capabilities: { tools: {}, resources: {}, prompts: {} },
  });

  // Tool handlers
  mcpServer.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: toolHandlers.getAvailableTools(apiKeyInfo.scopes),
  }));
  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return toolHandlers.callTool(name, args || {}, apiKeyInfo);
  });

  // Resource handlers
  mcpServer.setRequestHandler(ListResourcesRequestSchema, () => ({
    resources: resourceHandlers.getAvailableResources(apiKeyInfo.scopes),
  }));
  mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    return resourceHandlers.readResource(request.params.uri, apiKeyInfo);
  });

  // Prompt handlers
  mcpServer.setRequestHandler(ListPromptsRequestSchema, () => ({
    prompts: toolHandlers.PROMPT_DEFINITIONS,
  }));
  mcpServer.setRequestHandler(GetPromptRequestSchema, (request) => {
    return toolHandlers.getPrompt(request.params.name, request.params.arguments || {});
  });

  // ── SSE Transport ───────────────────────────────────────────
  const transport = new SSEServerTransport('/mcp/messages', res);

  // 儲存 Session（供 /mcp/messages 使用）
  sessionManager.set(sessionId, { transport, mcpServer, apiKeyInfo });

  // 審計日誌
  console.log(`[MCP] ✅ Session ${sessionId.slice(0,8)} | ${apiKeyInfo.systemName} → company#${apiKeyInfo.companyId}`);

  // ── 心跳機制 ───────────────────────────────────────────────
  const heartbeat = setInterval(() => {
    if (res.writableEnded) { clearInterval(heartbeat); return; }
    res.write(': ping\n\n');
  }, HEARTBEAT_MS);

  // ── 連接 ────────────────────────────────────────────────────
  try {
    await mcpServer.connect(transport);
  } catch (err) {
    console.error(`[MCP] Connect error (${sessionId.slice(0,8)}):`, err.message);
    clearInterval(heartbeat);
    sessionManager.delete(sessionId);
  }

  // ── 清理 ────────────────────────────────────────────────────
  req.on('close', () => {
    clearInterval(heartbeat);
    sessionManager.delete(sessionId);
    console.log(`[MCP] 🔌 Session ${sessionId.slice(0,8)} closed`);
  });
});

// ════════════════════════════════════════════════════════════
// MCP Messages 端點
// ════════════════════════════════════════════════════════════

/**
 * POST /mcp/messages?sessionId={sessionId}
 * 接收 Claude / 外部系統的 Tool 呼叫
 * Session 已在 /mcp/sse 建立時完成認證，此端點無需重複認證
 */
app.post('/mcp/messages', rateLimiter.checkLight, async (req, res) => {
  const sessionId = req.query.sessionId || req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  const session = sessionManager.get(sessionId);
  if (!session) {
    return res.status(404).json({
      error: 'Session not found or expired',
      hint:  'Re-connect to GET /mcp/sse to obtain a new session',
    });
  }

  try {
    await session.transport.handlePostMessage(req, res);
  } catch (err) {
    console.error(`[MCP] Message error (${sessionId.slice(0,8)}):`, err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// ════════════════════════════════════════════════════════════
// OpenClaw RPA Webhook 接收
// ════════════════════════════════════════════════════════════

/**
 * POST /mcp/webhook/rpa
 * 接收 OpenClaw / 任何 RPA 平台的執行結果回呼
 *
 * Body:
 *   flowId       - RPA 流程 ID
 *   status       - completed | failed | running
 *   result       - 執行結果（JSON）
 *   error        - 錯誤訊息（status=failed 時）
 *   taskId       - 對應的任務 ID（可選）
 *   decisionId   - 對應的 AI 決策 ID（可選）
 *   metadata     - 其他元資料
 */
app.post('/mcp/webhook/rpa', async (req, res) => {
  // HMAC-SHA256 簽章驗證（OpenClaw 標準）
  const signature = req.headers['x-openclaw-signature'] || req.headers['x-rpa-signature'];
  const secret    = process.env.RPA_WEBHOOK_SECRET;

  if (secret && signature) {
    const expected = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (signature !== expected) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  }

  const { flowId, status, result, error: rpaError, taskId, decisionId, metadata } = req.body;

  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({ log: [] });

    // 記錄到 ActivityLog（若有對應任務）
    if (taskId) {
      await prisma.activityLog.create({
        data: {
          taskId:   parseInt(taskId),
          userId:   req.apiKeyInfo?.userId || 1,  // MCP system user
          action:   `rpa_${status}`,
          oldValue: null,
          newValue: JSON.stringify({ flowId, result: result || rpaError, metadata }),
        },
      });
    }

    // 若 RPA 完成且指定了 decisionId，自動完成決策
    if (decisionId && status === 'completed') {
      await prisma.aiDecision.update({
        where: { id: parseInt(decisionId) },
        data:  {
          status:     'completed',
          reflection: `RPA flow ${flowId} 執行完成：${JSON.stringify(result)}`,
        },
      });
    }

    await prisma.$disconnect();
    console.log(`[RPA] ✅ Webhook | flow=${flowId} status=${status}`);
    res.json({ ok: true, received: new Date().toISOString() });
  } catch (err) {
    console.error('[RPA] Webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// Graceful Shutdown
// ════════════════════════════════════════════════════════════

async function gracefulShutdown(signal) {
  console.log(`\n[MCP] ${signal} received — graceful shutdown...`);
  sessionManager.closeAll();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// ════════════════════════════════════════════════════════════
// 啟動
// ════════════════════════════════════════════════════════════

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   xCloudPMIS MCP External Server  v1.0.0        ║');
  console.log(`║   http://localhost:${PORT}/mcp/discovery            ║`);
  console.log(`║   SSE:  GET  http://localhost:${PORT}/mcp/sse       ║`);
  console.log(`║   Msg:  POST http://localhost:${PORT}/mcp/messages  ║`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Tools:     ${toolHandlers.TOOL_DEFINITIONS.length} 個`);
  console.log(`  Resources: ${resourceHandlers.RESOURCE_TEMPLATES.length} 個`);
  console.log(`  Admin Key: ${ADMIN_KEY ? '已設定' : '⚠️  未設定（MCP_ADMIN_KEY）'}`);
  console.log('');
});

module.exports = app;
