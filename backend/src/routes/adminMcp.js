'use strict';
/**
 * backend/src/routes/adminMcp.js
 * ─────────────────────────────────────────────────────────────
 * MCP 統一控制台 — 後端 Admin API
 *
 * 端點：
 *   GET  /api/admin/mcp/status        全服務健康度 + 統計
 *   GET  /api/admin/mcp/sessions      活躍 SSE Session 清單
 *   GET  /api/admin/mcp/tools         工具開關 + 今日呼叫統計
 *   GET  /api/admin/mcp/logs          分頁工具呼叫日誌
 *   GET  /api/admin/mcp/api-keys      API Key 列表
 *   POST /api/admin/mcp/api-keys      建立 API Key
 *   DELETE /api/admin/mcp/api-keys/:id 撤銷 API Key
 *   GET  /api/admin/mcp/chart/hourly  過去 24 小時呼叫趨勢
 */

const express = require('express');
const https   = require('https');
const http    = require('http');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient({ log: [] });

// MCP External Server URL（Docker 內部用 host.docker.internal，host 直跑用 localhost）
const MCP_EXTERNAL_URL = process.env.MCP_EXTERNAL_URL || 'http://localhost:3100';
const MCP_ADMIN_KEY    = process.env.MCP_ADMIN_KEY    || 'dev-admin-secret';

// ════════════════════════════════════════════════════════════
// 工具函數
// ════════════════════════════════════════════════════════════

/** HTTP GET，回傳 JSON（帶 timeout） */
function fetchJson(url, headers = {}, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ ok: false, status: res.statusCode, data: null }); }
      });
    });
    req.on('error', err => reject(err));
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/** 解析 Microsoft Graph Scopes → 服務清單 */
function parseMicrosoftScopes(scopeStr = '') {
  const scopes = scopeStr.toLowerCase();
  return {
    outlook:    scopes.includes('mail.') || scopes.includes('calendars.'),
    teams:      scopes.includes('chat.') || scopes.includes('channelmessage') || scopes.includes('team'),
    sharepoint: scopes.includes('sites.') || scopes.includes('sharepoint'),
    onedrive:   scopes.includes('files.') || scopes.includes('drive'),
    loop:       scopes.includes('loop.') || scopes.includes('notes.'),
  };
}

/** 檢查通知服務是否設定 + 驗證 Token 有效性 */
async function checkNotifyServices() {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const lineToken     = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  // Telegram: 呼叫 getMe 驗證 bot token
  let telegramStatus = 'disconnected';
  let telegramBotName = null;
  if (telegramToken) {
    try {
      const r = await fetchJson(
        `https://api.telegram.org/bot${telegramToken}/getMe`,
        {}, 5000
      );
      if (r.ok && r.data?.ok) {
        telegramStatus  = 'online';
        telegramBotName = r.data.result?.username;
      } else {
        telegramStatus = 'warning'; // Token 設定了但無效
      }
    } catch {
      telegramStatus = 'warning';
    }
  }

  // LINE: 呼叫 bot/info 驗證 channel access token
  let lineStatus   = 'disconnected';
  let lineBotName  = null;
  if (lineToken) {
    try {
      const r = await fetchJson(
        'https://api.line.biz/v2/bot/info',
        { 'Authorization': `Bearer ${lineToken}` },
        5000
      );
      if (r.ok && r.data?.userId) {
        lineStatus  = 'online';
        lineBotName = r.data.displayName;
      } else {
        lineStatus = 'warning';
      }
    } catch {
      lineStatus = 'warning';
    }
  }

  return {
    telegram: {
      configured: !!telegramToken,
      status:     telegramStatus,
      botName:    telegramBotName,
      masked:     telegramToken ? `${telegramToken.slice(0, 8)}...${telegramToken.slice(-4)}` : null,
    },
    line: {
      configured: !!lineToken,
      status:     lineStatus,
      botName:    lineBotName,
      masked:     lineToken ? `${lineToken.slice(0, 8)}...${lineToken.slice(-4)}` : null,
    },
  };
}

/** 計算 Token 距離過期的狀態 */
function tokenStatus(expiresAt) {
  if (!expiresAt) return 'unknown';
  const diffMs   = new Date(expiresAt) - Date.now();
  const diffMins = diffMs / 60000;
  if (diffMs < 0)         return 'expired';
  if (diffMins < 10)      return 'critical';  // 即將過期 < 10 分鐘
  if (diffMins < 60)      return 'warning';   // 快要過期 < 1 小時
  return 'ok';
}

// ════════════════════════════════════════════════════════════
// GET /api/admin/mcp/status
// 全服務健康度 + 統計 + 最近活動
// ════════════════════════════════════════════════════════════
router.get('/status', async (req, res) => {
  const companyId = parseInt(req.query.companyId || '1');
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

  try {
    // ── 平行查詢 ───────────────────────────────────────────
    const [
      mcpHealth,
      oauthTokens,
      aiDecisionStats,
      toolCallStats,
      recentLogs,
      pendingDecisions,
      notifyStatus,
    ] = await Promise.allSettled([

      // 1. MCP External Server 健康度
      fetchJson(`${MCP_EXTERNAL_URL}/mcp/health`, {}, 3000).catch(() => null),

      // 2. Microsoft OAuth Tokens（所有 user 的）
      prisma.oAuthToken.findMany({
        where:  { provider: 'microsoft' },
        select: { userId: true, scopes: true, expiresAt: true, updatedAt: true },
        take: 10,
      }),

      // 3. AI 決策今日統計
      prisma.aiDecision.groupBy({
        by: ['status'],
        where: { createdAt: { gte: todayStart } },
        _count: { id: true },
      }),

      // 4. 今日工具呼叫統計（AiAgentLog）
      prisma.aiAgentLog.aggregate({
        where:  { executedAt: { gte: todayStart } },
        _count: { id: true },
        _sum:   { durationMs: true },
      }),

      // 5. 最近 10 筆工具呼叫
      prisma.aiAgentLog.findMany({
        where:   { executedAt: { gte: new Date(now - 24 * 60 * 60 * 1000) } },
        orderBy: { executedAt: 'desc' },
        take:    10,
        select: {
          id: true, toolName: true, success: true,
          executedAt: true, durationMs: true, errorMessage: true,
          decision: { select: { id: true, status: true } },
        },
      }),

      // 6. 待審核決策數
      prisma.aiDecision.count({ where: { status: 'pending' } }),

      // 7. 通知服務狀態（Telegram + LINE）
      checkNotifyServices(),
    ]);

    // ── 解析 MCP External Server 狀態 ──────────────────────
    const mcpData = mcpHealth.status === 'fulfilled' && mcpHealth.value?.data;
    const mcpStatus = mcpData ? {
      status:     'online',
      sessions:   mcpData.sessions   ?? 0,
      uptime:     mcpData.uptime     ?? 0,
      version:    mcpData.version    ?? '?',
      timestamp:  mcpData.timestamp,
    } : {
      status:     'offline',
      sessions:   0,
      uptime:     0,
      version:    '?',
      timestamp:  null,
    };

    // ── 解析 Microsoft 服務狀態 ─────────────────────────────
    const tokens = oauthTokens.status === 'fulfilled' ? oauthTokens.value : [];
    const token  = tokens[0];  // 取第一個有效 token
    const microsoftOverallStatus = !token ? 'disconnected'
      : tokenStatus(token.expiresAt) === 'expired' ? 'expired'
      : tokenStatus(token.expiresAt) === 'critical' ? 'warning'
      : 'online';
    const serviceAvailability = token ? parseMicrosoftScopes(token.scopes || '') : {};

    const microsoftServices = {
      outlook:    { status: serviceAvailability.outlook    ? microsoftOverallStatus : 'no_scope', icon: '📧', name: 'Outlook Mail' },
      teams:      { status: serviceAvailability.teams      ? microsoftOverallStatus : 'no_scope', icon: '💬', name: 'Microsoft Teams' },
      sharepoint: { status: serviceAvailability.sharepoint ? microsoftOverallStatus : 'no_scope', icon: '📂', name: 'SharePoint' },
      onedrive:   { status: serviceAvailability.onedrive   ? microsoftOverallStatus : 'no_scope', icon: '☁️',  name: 'OneDrive' },
      loop:       { status: serviceAvailability.loop       ? microsoftOverallStatus : 'no_scope', icon: '🔄', name: 'Microsoft Loop' },
    };

    // ── AI Agent 統計 ────────────────────────────────────────
    const decisionGroups = aiDecisionStats.status === 'fulfilled' ? aiDecisionStats.value : [];
    const decisionMap    = Object.fromEntries(decisionGroups.map(g => [g.status, g._count.id]));
    const totalDecisions = Object.values(decisionMap).reduce((a, b) => a + b, 0);
    const completedDecs  = decisionMap['completed'] || 0;

    const toolAgg = toolCallStats.status === 'fulfilled' ? toolCallStats.value : { _count: { id: 0 }, _sum: { durationMs: 0 } };
    const totalCalls   = toolAgg._count.id || 0;
    const totalDurMs   = toolAgg._sum.durationMs || 0;
    const avgLatency   = totalCalls > 0 ? Math.round(totalDurMs / totalCalls) : null;

    // ── 最近活動 ────────────────────────────────────────────
    const recentActivity = (recentLogs.status === 'fulfilled' ? recentLogs.value : [])
      .map(log => ({
        id:         log.id,
        tool:       log.toolName,
        success:    log.success,
        latency:    log.durationMs,
        time:       log.executedAt,
        decisionId: log.decision?.id,
        error:      log.errorMessage,
      }));

    // ── 成功率計算（無呼叫記錄時回傳 null，前端顯示「—」）──
    const successCount = recentActivity.filter(a => a.success).length;
    const successRate  = recentActivity.length > 0
      ? Math.round((successCount / recentActivity.length) * 100)
      : null;

    // ── 組合回應 ─────────────────────────────────────────────
    res.json({
      timestamp:  now.toISOString(),
      services: {
        mcpExternalServer: mcpStatus,
        microsoft: {
          status:       microsoftOverallStatus,
          tokenExpiry:  token?.expiresAt,
          tokenStatus:  tokenStatus(token?.expiresAt),
          connectedUser: token?.userId,
          services:     microsoftServices,
        },
        aiAgent: {
          status:           'online',
          pendingDecisions: pendingDecisions.status === 'fulfilled' ? pendingDecisions.value : 0,
          todayDecisions:   totalDecisions,
          completedToday:   completedDecs,
          successRate:      totalDecisions > 0 ? Math.round((completedDecs / totalDecisions) * 100) : null,
        },
        notify: notifyStatus.status === 'fulfilled' ? notifyStatus.value : {
          telegram: { configured: false, status: 'disconnected', botName: null, masked: null },
          line:     { configured: false, status: 'disconnected', botName: null, masked: null },
        },
      },
      stats: {
        totalCallsToday: totalCalls,
        successRate,
        avgLatency,
        activeSessions:  mcpStatus.sessions,
      },
      recentActivity,
    });

  } catch (err) {
    console.error('[AdminMCP] status 查詢失敗:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/admin/mcp/notify/test
// 測試 Telegram / LINE 連線（驗證 Token + 可選發送測試訊息）
// ════════════════════════════════════════════════════════════
router.post('/notify/test', async (req, res) => {
  const { service, chatId, userId } = req.body;

  if (!['telegram', 'line'].includes(service)) {
    return res.status(400).json({ success: false, error: '不支援的服務：請傳入 telegram 或 line' });
  }

  try {
    if (service === 'telegram') {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        return res.json({ success: false, error: 'TELEGRAM_BOT_TOKEN 未設定' });
      }

      // 1. 驗證 bot 有效
      const meResp = await fetchJson(`https://api.telegram.org/bot${token}/getMe`, {}, 6000);
      if (!meResp.ok || !meResp.data?.ok) {
        return res.json({ success: false, error: `Bot Token 無效：${meResp.data?.description || '未知錯誤'}` });
      }

      const botInfo = meResp.data.result;

      // 2. 若提供 chatId，嘗試發送測試訊息
      if (chatId) {
        const sendResp = await fetchJson(
          `https://api.telegram.org/bot${token}/sendMessage`,
          { 'Content-Type': 'application/json' },
          8000
        );
        // fetchJson 只支援 GET；改用 http.request 發送 POST
        const https = require('https');
        const body  = JSON.stringify({
          chat_id:    chatId,
          text:       '✅ MCP 控制台測試通知 — 連線成功！',
          parse_mode: 'Markdown',
        });
        const sentOk = await new Promise(resolve => {
          const req2 = https.request({
            hostname: 'api.telegram.org',
            path:     `/bot${token}/sendMessage`,
            method:   'POST',
            headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          }, r => {
            let d = '';
            r.on('data', c => (d += c));
            r.on('end', () => {
              try { resolve(JSON.parse(d)); } catch { resolve(null); }
            });
          });
          req2.on('error', () => resolve(null));
          req2.setTimeout(8000, () => { req2.destroy(); resolve(null); });
          req2.write(body);
          req2.end();
        });

        return res.json({
          success:  sentOk?.ok === true,
          bot:      botInfo,
          message:  sentOk?.ok ? '測試訊息已發送' : `發送失敗：${sentOk?.description || '未知'}`,
          chatId,
        });
      }

      // 只驗證，不發送
      return res.json({
        success: true,
        bot:     botInfo,
        message: 'Telegram Bot Token 有效，可正常連線',
      });

    } else {
      // LINE
      const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      if (!token) {
        return res.json({ success: false, error: 'LINE_CHANNEL_ACCESS_TOKEN 未設定' });
      }

      // 1. 驗證 channel
      const infoResp = await fetchJson(
        'https://api.line.biz/v2/bot/info',
        { 'Authorization': `Bearer ${token}` },
        6000
      );
      if (!infoResp.ok || !infoResp.data?.userId) {
        return res.json({ success: false, error: `LINE Channel Access Token 無效` });
      }

      const botInfo = {
        displayName: infoResp.data.displayName,
        userId:      infoResp.data.userId,
        pictureUrl:  infoResp.data.pictureUrl,
      };

      // 2. 若提供 userId，嘗試發送測試訊息
      if (userId) {
        const https = require('https');
        const body  = JSON.stringify({
          to:       userId,
          messages: [{ type: 'text', text: '✅ MCP 控制台測試通知 — LINE 連線成功！' }],
        });
        const sentOk = await new Promise(resolve => {
          const req2 = https.request({
            hostname: 'api.line.me',
            path:     '/v2/bot/message/push',
            method:   'POST',
            headers:  {
              'Authorization':  `Bearer ${token}`,
              'Content-Type':   'application/json',
              'Content-Length': Buffer.byteLength(body),
            },
          }, r => {
            let d = '';
            r.on('data', c => (d += c));
            r.on('end', () => {
              resolve({ statusCode: r.statusCode });
            });
          });
          req2.on('error', () => resolve({ statusCode: 500 }));
          req2.setTimeout(8000, () => { req2.destroy(); resolve({ statusCode: 408 }); });
          req2.write(body);
          req2.end();
        });

        return res.json({
          success: sentOk.statusCode === 200,
          bot:     botInfo,
          message: sentOk.statusCode === 200 ? '測試訊息已發送' : `發送失敗（HTTP ${sentOk.statusCode}）`,
          userId,
        });
      }

      return res.json({
        success: true,
        bot:     botInfo,
        message: 'LINE Channel Access Token 有效，可正常連線',
      });
    }

  } catch (err) {
    console.error('[AdminMCP] notify/test 失敗:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/admin/mcp/chart/hourly
// 過去 24 小時每小時呼叫次數（AiAgentLog 資料）
// ════════════════════════════════════════════════════════════
router.get('/chart/hourly', async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const logs = await prisma.aiAgentLog.findMany({
      where:   { executedAt: { gte: since } },
      select:  { executedAt: true, success: true, durationMs: true, toolName: true },
      orderBy: { executedAt: 'asc' },
    });

    // 按小時聚合
    const hourBuckets = Array.from({ length: 24 }, (_, i) => {
      const t = new Date(since.getTime() + i * 3600 * 1000);
      return {
        hour:    t.getHours(),
        label:   `${String(t.getHours()).padStart(2, '0')}:00`,
        total:   0,
        success: 0,
        failed:  0,
        avgMs:   0,
        _durs:   [],
      };
    });

    logs.forEach(log => {
      const diffH = Math.floor((new Date(log.executedAt) - since) / 3600000);
      if (diffH >= 0 && diffH < 24) {
        hourBuckets[diffH].total++;
        if (log.success) hourBuckets[diffH].success++;
        else             hourBuckets[diffH].failed++;
        if (log.durationMs) hourBuckets[diffH]._durs.push(log.durationMs);
      }
    });

    hourBuckets.forEach(b => {
      b.avgMs = b._durs.length > 0
        ? Math.round(b._durs.reduce((a, c) => a + c, 0) / b._durs.length)
        : 0;
      delete b._durs;
    });

    // Tool 使用分佈（今日）
    const toolMap = {};
    logs.forEach(l => {
      toolMap[l.toolName] = (toolMap[l.toolName] || 0) + 1;
    });
    const toolBreakdown = Object.entries(toolMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    res.json({ hourly: hourBuckets, toolBreakdown });

  } catch (err) {
    console.error('[AdminMCP] chart/hourly 查詢失敗:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/admin/mcp/sessions
// 活躍 SSE Session 清單（從 MCP External Server 取得）
// ════════════════════════════════════════════════════════════
router.get('/sessions', async (req, res) => {
  try {
    const result = await fetchJson(
      `${MCP_EXTERNAL_URL}/mcp/admin/keys`,
      { 'x-api-key': MCP_ADMIN_KEY },
      3000
    ).catch(() => null);

    // sessions 資訊從 MCP server 的 sessionManager 取（目前只有 health 端點有 count）
    const health = await fetchJson(`${MCP_EXTERNAL_URL}/mcp/health`, {}, 2000).catch(() => null);

    res.json({
      activeSessions: health?.data?.sessions ?? 0,
      sessions: [],  // TODO: expose session list from MCP server
      keys: result?.data?.data ?? [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/admin/mcp/tools
// 工具清單 + 開關狀態 + 今日呼叫次數
// ════════════════════════════════════════════════════════════
router.get('/tools', async (req, res) => {
  try {
    const since = new Date(); since.setHours(0, 0, 0, 0);

    const [discoveryRes, toolStats] = await Promise.all([
      fetchJson(`${MCP_EXTERNAL_URL}/mcp/discovery`, {}, 3000).catch(() => null),
      prisma.aiAgentLog.groupBy({
        by:    ['toolName'],
        where: { executedAt: { gte: since } },
        _count: { id: true },
        _sum:   { durationMs: true },
        orderBy: { _count: { id: 'desc' } },
      }),
    ]);

    const toolStatsMap = Object.fromEntries(
      toolStats.map(t => [t.toolName, { calls: t._count.id, totalMs: t._sum.durationMs || 0 }])
    );

    const tools = (discoveryRes?.data?.tools ?? []).map(t => ({
      name:        t.name,
      description: t.description,
      scopes:      t.requiredScopes || [],
      enabled:     true,  // TODO: persist disabled tools in Redis
      callsToday:  toolStatsMap[t.name]?.calls   ?? 0,
      avgLatency:  toolStatsMap[t.name]?.calls > 0
        ? Math.round((toolStatsMap[t.name]?.totalMs ?? 0) / toolStatsMap[t.name].calls)
        : 0,
    }));

    res.json({ tools, serverOnline: !!discoveryRes?.ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/admin/mcp/logs
// 分頁工具呼叫日誌
// ════════════════════════════════════════════════════════════
router.get('/logs', async (req, res) => {
  const page    = parseInt(req.query.page   || '1');
  const limit   = parseInt(req.query.limit  || '20');
  const tool    = req.query.tool    || undefined;
  const success = req.query.success === 'true'  ? true
                : req.query.success === 'false' ? false
                : undefined;
  const since   = req.query.since ? new Date(req.query.since)
                : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const where = {
    executedAt: { gte: since },
    ...(tool    !== undefined && { toolName: tool }),
    ...(success !== undefined && { success }),
  };

  try {
    const [logs, total] = await Promise.all([
      prisma.aiAgentLog.findMany({
        where,
        orderBy: { executedAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
        select: {
          id: true, toolName: true, success: true, errorMessage: true,
          executedAt: true, durationMs: true,
          toolInput:  true, toolOutput: true,
          decision: { select: { id: true, status: true } },
        },
      }),
      prisma.aiAgentLog.count({ where }),
    ]);

    res.json({
      data:       logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// API Key 管理（代理到 MCP External Server）
// ════════════════════════════════════════════════════════════

/** GET /api/admin/mcp/api-keys */
router.get('/api-keys', async (req, res) => {
  try {
    const result = await fetchJson(
      `${MCP_EXTERNAL_URL}/mcp/admin/keys${req.query.companyId ? `?companyId=${req.query.companyId}` : ''}`,
      { 'x-api-key': MCP_ADMIN_KEY },
      5000
    );
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(503).json({ error: 'MCP Server 無法連線', detail: err.message });
  }
});

/** POST /api/admin/mcp/api-keys */
router.post('/api-keys', express.json(), async (req, res) => {
  try {
    const result = await new Promise((resolve, reject) => {
      const body = JSON.stringify(req.body);
      const url  = new URL(`${MCP_EXTERNAL_URL}/mcp/admin/keys`);
      const options = {
        hostname: url.hostname,
        port:     url.port || (url.protocol === 'https:' ? 443 : 80),
        path:     url.pathname,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-api-key':      MCP_ADMIN_KEY,
        },
      };
      const req2 = http.request(options, (resp) => {
        let data = '';
        resp.on('data', c => (data += c));
        resp.on('end', () => {
          try { resolve({ status: resp.statusCode, data: JSON.parse(data) }); }
          catch (_) { resolve({ status: resp.statusCode, data: null }); }
        });
      });
      req2.on('error', reject);
      req2.write(body);
      req2.end();
    });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(503).json({ error: 'MCP Server 無法連線', detail: err.message });
  }
});

/** DELETE /api/admin/mcp/api-keys/:id */
router.delete('/api-keys/:id', async (req, res) => {
  try {
    const result = await new Promise((resolve, reject) => {
      const url = new URL(`${MCP_EXTERNAL_URL}/mcp/admin/keys/${req.params.id}`);
      const options = {
        hostname: url.hostname, port: url.port || 80,
        path: url.pathname, method: 'DELETE',
        headers: { 'x-api-key': MCP_ADMIN_KEY },
      };
      const reqDel = http.request(options, (resp) => {
        let data = '';
        resp.on('data', c => (data += c));
        resp.on('end', () => {
          try { resolve({ status: resp.statusCode, data: JSON.parse(data) }); }
          catch (_) { resolve({ status: resp.statusCode, data: null }); }
        });
      });
      reqDel.on('error', reject);
      reqDel.end();
    });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(503).json({ error: 'MCP Server 無法連線', detail: err.message });
  }
});

module.exports = router;
