'use strict';
/**
 * examples/github-webhook-handler.js
 * ─────────────────────────────────────────────────────────────
 * GitHub Webhook 整合範例
 *
 * 功能：
 *   - PR 建立/合併 → 自動更新對應 PMIS 任務狀態
 *   - Issue 建立  → 自動在 PMIS 建立任務
 *   - Push to main → 自動觸發 RPA 部署流程
 *   - PR review   → 通知 PMIS 負責人
 *
 * 對應規則（透過 PR/Issue 標題或 body 的 [PMIS:#ID] 標記）：
 *   PR title: "Fix login bug [PMIS:#42]" → 關聯任務 #42
 *   Issue body 含 [PMIS:projectId=5]    → 關聯專案 #5
 *
 * 使用方式：
 *   PMIS_API_KEY=pmis_xxx GITHUB_WEBHOOK_SECRET=xxx node github-webhook-handler.js
 *   GitHub Settings → Webhooks → http://your-host:3201/webhook
 *
 * 依賴：
 *   npm install express @octokit/webhooks
 */

const express  = require('express');
const { Webhooks, createNodeMiddleware } = require('@octokit/webhooks');
const MCPClient = require('../sdk/mcp-client');

// ── 環境變數 ─────────────────────────────────────────────────
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const PMIS_MCP_URL          = process.env.PMIS_MCP_URL || 'http://localhost:3100';
const PMIS_API_KEY          = process.env.PMIS_API_KEY;
const PORT                  = parseInt(process.env.PORT || '3201');

if (!GITHUB_WEBHOOK_SECRET || !PMIS_API_KEY) {
  console.error('❌ 請設定 GITHUB_WEBHOOK_SECRET 和 PMIS_API_KEY');
  process.exit(1);
}

// ── 初始化 ──────────────────────────────────────────────────
const pmis = new MCPClient({ serverUrl: PMIS_MCP_URL, apiKey: PMIS_API_KEY });

const webhooks = new Webhooks({ secret: GITHUB_WEBHOOK_SECRET });

// ════════════════════════════════════════════════════════════
// 解析 PMIS 標記
// ════════════════════════════════════════════════════════════

/**
 * 從文字中提取 PMIS 標記
 * @param {string} text - PR title 或 Issue body
 * @returns {{ taskIds: number[], projectIds: number[] }}
 */
function extractPmisRefs(text = '') {
  const taskIds    = [];
  const projectIds = [];

  // [PMIS:#42] 或 [pmis:#42]（任務 ID）
  for (const m of text.matchAll(/\[pmis:#(\d+)\]/gi)) {
    taskIds.push(parseInt(m[1]));
  }
  // [PMIS:projectId=5]（專案 ID）
  for (const m of text.matchAll(/\[pmis:projectId=(\d+)\]/gi)) {
    projectIds.push(parseInt(m[1]));
  }

  return { taskIds, projectIds };
}

// ════════════════════════════════════════════════════════════
// Pull Request Events
// ════════════════════════════════════════════════════════════

webhooks.on('pull_request.opened', async ({ payload }) => {
  const pr   = payload.pull_request;
  const text = `${pr.title} ${pr.body || ''}`;
  const { taskIds, projectIds } = extractPmisRefs(text);

  console.log(`[GitHub] PR #${pr.number} 已開啟：${pr.title}`);

  // 為每個關聯任務新增評論
  for (const taskId of taskIds) {
    try {
      await pmis.callTool('add_task_comment', {
        taskId,
        content: `🔗 GitHub PR #${pr.number} 已建立：[${pr.title}](${pr.html_url})\n作者：${pr.user.login}`,
      });
      console.log(`[GitHub] 已在任務 #${taskId} 新增 PR 評論`);
    } catch (err) {
      console.error(`[GitHub] 任務 #${taskId} 評論失敗：${err.message}`);
    }
  }
});

webhooks.on('pull_request.closed', async ({ payload }) => {
  const pr      = payload.pull_request;
  const merged  = pr.merged;
  const text    = `${pr.title} ${pr.body || ''}`;
  const { taskIds } = extractPmisRefs(text);

  if (!merged) return;  // 只處理 merge，不處理 close without merge

  console.log(`[GitHub] PR #${pr.number} 已合併：${pr.title}`);

  // 合併 PR → 將關聯任務標記為完成
  for (const taskId of taskIds) {
    try {
      await pmis.callTool('update_task_status', {
        taskId,
        status:  'done',
        comment: `✅ PR #${pr.number} 已合併到 ${pr.base.ref}，任務自動標記完成。\n合併人：${pr.merged_by?.login}`,
      });
      console.log(`[GitHub] 任務 #${taskId} 已標記完成`);
    } catch (err) {
      console.error(`[GitHub] 任務 #${taskId} 狀態更新失敗：${err.message}`);
    }
  }
});

webhooks.on('pull_request_review.submitted', async ({ payload }) => {
  const review = payload.review;
  const pr     = payload.pull_request;
  const text   = `${pr.title} ${pr.body || ''}`;
  const { taskIds } = extractPmisRefs(text);

  if (review.state !== 'changes_requested') return;

  for (const taskId of taskIds) {
    try {
      // 取得任務資料以找到負責人
      const result = await pmis.callTool('get_task_details', { taskId });
      const task   = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : null;
      if (!task?.assignedTo) continue;

      await pmis.callTool('notify_user', {
        userId:  task.assignedTo,
        message: `🔄 PR #${pr.number} 被要求修改（reviewer: ${review.user.login}）\nPR: ${pr.html_url}`,
        type:    'warning',
      });
    } catch (err) {
      console.error(`[GitHub] 通知失敗：${err.message}`);
    }
  }
});

// ════════════════════════════════════════════════════════════
// Issues Events
// ════════════════════════════════════════════════════════════

webhooks.on('issues.opened', async ({ payload }) => {
  const issue = payload.issue;
  const body  = issue.body || '';
  const { projectIds } = extractPmisRefs(body);

  console.log(`[GitHub] Issue #${issue.number} 已開啟：${issue.title}`);

  // 若指定了 projectId，自動在 PMIS 建立任務
  for (const projectId of projectIds) {
    try {
      const result = await pmis.callTool('create_task', {
        projectId,
        title:       `[GitHub Issue #${issue.number}] ${issue.title}`,
        description: `來源：${issue.html_url}\n\n${body}`.slice(0, 2000),
        priority:    labelToPriority(issue.labels),
      });
      const task = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : {};
      console.log(`[GitHub] 已在專案 #${projectId} 建立任務 #${task.id}`);
    } catch (err) {
      console.error(`[GitHub] 建立任務失敗：${err.message}`);
    }
  }
});

// ════════════════════════════════════════════════════════════
// Push Events（main branch → 觸發 RPA 部署）
// ════════════════════════════════════════════════════════════

webhooks.on('push', async ({ payload }) => {
  const branch = payload.ref?.replace('refs/heads/', '');
  if (branch !== 'main' && branch !== 'master') return;

  const repo    = payload.repository.full_name;
  const commits = payload.commits || [];
  console.log(`[GitHub] Push to ${branch}（${repo}）：${commits.length} commits`);

  // 取得 RPA_FLOW_ID 環境變數（部署流程 ID）
  const rpaFlowId = process.env.RPA_DEPLOY_FLOW_ID;
  if (!rpaFlowId) return;

  try {
    const result = await pmis.callTool('rpa_execute_flow', {
      flowId:  rpaFlowId,
      params: {
        repository: repo,
        branch,
        commitSha:  payload.after,
        pusher:     payload.pusher?.name,
        commitCount: commits.length,
      },
      webhookUrl: process.env.RPA_WEBHOOK_URL,
    });
    const data = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : {};
    console.log(`[GitHub] RPA 部署流程已啟動，execution_id: ${data.executionId}`);
  } catch (err) {
    console.error(`[GitHub] RPA 啟動失敗：${err.message}`);
  }
});

// ════════════════════════════════════════════════════════════
// 輔助函數
// ════════════════════════════════════════════════════════════

function labelToPriority(labels = []) {
  const names = labels.map(l => l.name.toLowerCase());
  if (names.includes('critical') || names.includes('blocker')) return 'critical';
  if (names.includes('high')     || names.includes('urgent'))  return 'high';
  if (names.includes('low'))                                    return 'low';
  return 'medium';
}

// ════════════════════════════════════════════════════════════
// Express Server
// ════════════════════════════════════════════════════════════

const app = express();

// GitHub Webhook 端點（@octokit/webhooks 自動驗證 HMAC-SHA256）
app.use(createNodeMiddleware(webhooks, { path: '/webhook' }));

// 健康檢查
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'github-webhook-handler' }));

// ════════════════════════════════════════════════════════════
// 啟動
// ════════════════════════════════════════════════════════════

(async () => {
  await pmis.connect();
  console.log('✅ MCP Client 已連線到 PMIS');

  app.listen(PORT, () => {
    console.log(`🚀 GitHub Webhook Handler 已啟動在 port ${PORT}`);
    console.log(`   Webhook URL: http://your-host:${PORT}/webhook`);
    console.log(`   在 GitHub 設定：Settings → Webhooks → Add webhook`);
  });
})();

process.on('SIGTERM', async () => {
  await pmis.disconnect();
  process.exit(0);
});
