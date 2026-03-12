'use strict';
/**
 * examples/crm-bridge.js
 * ─────────────────────────────────────────────────────────────
 * CRM ↔ PMIS 雙向同步橋接器
 *
 * 功能：
 *   CRM → PMIS：
 *     - 新客戶簽約   → 自動建立 PMIS 專案
 *     - CRM 需求單   → 轉為 PMIS 任務
 *     - 客戶需求更新 → 同步更新 PMIS 任務
 *
 *   PMIS → CRM：
 *     - 專案里程碑完成 → 更新 CRM 客戶狀態
 *     - 任務完成     → 發送 CRM 通知
 *
 * 使用方式：
 *   CRM_WEBHOOK_SECRET=xxx CRM_BASE_URL=https://your-crm.com \
 *   CRM_API_KEY=xxx PMIS_API_KEY=pmis_xxx node crm-bridge.js
 *
 * 依賴：
 *   npm install express axios
 */

const express    = require('express');
const crypto     = require('crypto');
const axios      = require('axios');
const MCPClient  = require('../sdk/mcp-client');

// ── 環境變數 ─────────────────────────────────────────────────
const CRM_WEBHOOK_SECRET = process.env.CRM_WEBHOOK_SECRET;
const CRM_BASE_URL       = process.env.CRM_BASE_URL;
const CRM_API_KEY        = process.env.CRM_API_KEY;
const PMIS_MCP_URL       = process.env.PMIS_MCP_URL || 'http://localhost:3100';
const PMIS_API_KEY       = process.env.PMIS_API_KEY;
const DEFAULT_PROJECT_ID = parseInt(process.env.DEFAULT_PMIS_PROJECT_ID || '0');
const PORT               = parseInt(process.env.PORT || '3202');

// ── 初始化 ──────────────────────────────────────────────────
const pmis = new MCPClient({ serverUrl: PMIS_MCP_URL, apiKey: PMIS_API_KEY });

const crmApi = axios.create({
  baseURL: CRM_BASE_URL,
  headers: { 'Authorization': `Bearer ${CRM_API_KEY}`, 'Content-Type': 'application/json' },
  timeout: 10_000,
});

// ════════════════════════════════════════════════════════════
// CRM → PMIS（Webhook 接收）
// ════════════════════════════════════════════════════════════

const app = express();
app.use(express.json());

/**
 * 驗證 CRM Webhook 簽名（HMAC-SHA256）
 */
function verifyCrmSignature(req) {
  if (!CRM_WEBHOOK_SECRET) return true;  // 若未設定，跳過驗證
  const sig      = req.headers['x-crm-signature'] || '';
  const payload  = JSON.stringify(req.body);
  const expected = 'sha256=' + crypto.createHmac('sha256', CRM_WEBHOOK_SECRET).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/**
 * POST /crm/webhook
 * 接收 CRM 推播事件
 */
app.post('/crm/webhook', async (req, res) => {
  if (!verifyCrmSignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { event, data } = req.body;
  res.json({ received: true });  // 立即回應，非同步處理

  setImmediate(() => handleCrmEvent(event, data).catch(
    err => console.error(`[CRM→PMIS] Event ${event} 處理失敗：`, err.message)
  ));
});

/**
 * 處理 CRM 事件
 */
async function handleCrmEvent(event, data) {
  console.log(`[CRM→PMIS] 收到事件：${event}`);

  switch (event) {

    // 新客戶簽約 → 建立 PMIS 專案
    case 'contract.signed': {
      const { contractId, clientName, value, requirements = [] } = data;

      const result = await pmis.callTool('create_task', {
        title:       `[合約 ${contractId}] ${clientName} 專案啟動`,
        description: `客戶：${clientName}\n合約金額：${value}\n合約ID：${contractId}\n\n需求摘要：\n${requirements.join('\n')}`,
        priority:    'high',
      });
      const task = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : {};
      console.log(`[CRM→PMIS] 合約 ${contractId} → 已建立任務 #${task.id}`);

      // 存映射關係（實際上應存 DB）
      CRM_PMIS_MAP.set(`contract:${contractId}`, task.id);

      // 通知 PM
      if (process.env.PM_USER_ID) {
        await pmis.callTool('notify_user', {
          userId:  parseInt(process.env.PM_USER_ID),
          message: `📋 新合約簽署：${clientName}（${contractId}）\n任務已建立 #${task.id}`,
          type:    'info',
        });
      }
      break;
    }

    // 需求單建立 → 建立 PMIS 任務
    case 'requirement.created': {
      const { reqId, title, description, priority, clientId } = data;
      const projectId = DEFAULT_PROJECT_ID || undefined;

      const result = await pmis.callTool('create_task', {
        ...(projectId && { projectId }),
        title:       `[CRM需求 ${reqId}] ${title}`,
        description: `${description}\n\n客戶ID：${clientId}\n需求ID：${reqId}`,
        priority:    priority || 'medium',
      });
      const task = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : {};
      console.log(`[CRM→PMIS] 需求 ${reqId} → 已建立任務 #${task.id}`);
      CRM_PMIS_MAP.set(`req:${reqId}`, task.id);
      break;
    }

    // 需求單更新 → 更新 PMIS 任務狀態
    case 'requirement.updated': {
      const { reqId, status } = data;
      const taskId = CRM_PMIS_MAP.get(`req:${reqId}`);
      if (!taskId) {
        console.warn(`[CRM→PMIS] 找不到需求 ${reqId} 對應的任務`);
        break;
      }
      const pmisStatus = crmStatusTopmis(status);
      await pmis.callTool('update_task_status', {
        taskId,
        status:  pmisStatus,
        comment: `CRM 需求狀態已更新為：${status}`,
      });
      console.log(`[CRM→PMIS] 需求 ${reqId} → 任務 #${taskId} 狀態更新為 ${pmisStatus}`);
      break;
    }

    default:
      console.log(`[CRM→PMIS] 未知事件：${event}，已忽略`);
  }
}

// ════════════════════════════════════════════════════════════
// PMIS → CRM（定期輪詢 + 主動推送）
// ════════════════════════════════════════════════════════════

/**
 * 定期同步 PMIS 已完成任務到 CRM（每 5 分鐘）
 */
async function syncCompletedTasks() {
  try {
    const result = await pmis.callTool('list_tasks', {
      status:  'done',
      limit:   50,
    });
    const tasks = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : [];
    const now   = Date.now();

    for (const task of tasks) {
      // 只處理 5 分鐘內完成的任務（避免重複同步）
      const completedAt = new Date(task.updatedAt).getTime();
      if (now - completedAt > 5 * 60 * 1000) continue;

      // 找 CRM 對應的 reqId
      for (const [key, pmisId] of CRM_PMIS_MAP) {
        if (pmisId === task.id && key.startsWith('req:')) {
          const reqId = key.replace('req:', '');
          await updateCrmRequirement(reqId, 'completed', task);
          console.log(`[PMIS→CRM] 任務 #${task.id} 完成 → 已更新 CRM 需求 ${reqId}`);
        }
      }
    }
  } catch (err) {
    console.error('[PMIS→CRM] 同步失敗：', err.message);
  }
}

/**
 * 更新 CRM 需求狀態
 */
async function updateCrmRequirement(reqId, status, taskData) {
  try {
    await crmApi.patch(`/api/requirements/${reqId}`, {
      status,
      completedAt: new Date().toISOString(),
      notes:       `PMIS 任務 #${taskData.id} 已完成`,
    });
  } catch (err) {
    console.error(`[PMIS→CRM] CRM 更新失敗（req: ${reqId}）：`, err.message);
  }
}

// 啟動輪詢
setInterval(syncCompletedTasks, 5 * 60 * 1000);

// ════════════════════════════════════════════════════════════
// 映射表（In-process，生產環境應改用 Redis / DB）
// ════════════════════════════════════════════════════════════

/** CRM ID → PMIS Task ID 映射  key: "contract:xxx" | "req:xxx" */
const CRM_PMIS_MAP = new Map();

// ════════════════════════════════════════════════════════════
// 輔助函數
// ════════════════════════════════════════════════════════════

function crmStatusTopmis(crmStatus) {
  const map = {
    'new':         'todo',
    'in_review':   'in_progress',
    'approved':    'in_progress',
    'in_progress': 'in_progress',
    'testing':     'in_review',
    'completed':   'done',
    'cancelled':   'cancelled',
  };
  return map[crmStatus] || 'todo';
}

// ════════════════════════════════════════════════════════════
// Admin API（手動觸發同步）
// ════════════════════════════════════════════════════════════

app.post('/admin/sync', async (req, res) => {
  try {
    await syncCompletedTasks();
    res.json({ success: true, message: '同步完成' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/mappings', (_req, res) => {
  const mappings = [...CRM_PMIS_MAP.entries()].map(([crmKey, pmisId]) => ({ crmKey, pmisId }));
  res.json({ count: mappings.length, mappings });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'crm-bridge', mappings: CRM_PMIS_MAP.size });
});

// ════════════════════════════════════════════════════════════
// 啟動
// ════════════════════════════════════════════════════════════

(async () => {
  await pmis.connect();
  console.log('✅ MCP Client 已連線到 PMIS');

  app.listen(PORT, () => {
    console.log(`🚀 CRM Bridge 已啟動在 port ${PORT}`);
    console.log(`   CRM Webhook: http://your-host:${PORT}/crm/webhook`);
    console.log(`   Admin API:   http://your-host:${PORT}/admin/sync`);
  });

  // 啟動後立即執行一次同步
  await syncCompletedTasks();
})();

process.on('SIGTERM', async () => {
  await pmis.disconnect();
  process.exit(0);
});
