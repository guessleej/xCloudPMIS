'use strict';
/**
 * examples/slack-connector.js
 * ─────────────────────────────────────────────────────────────
 * Slack Bot 整合範例
 *
 * 功能：
 *   /pmis projects          - 列出所有專案
 *   /pmis task <id>         - 查詢任務詳情
 *   /pmis assign <task> <@user> - 指派任務
 *   /pmis report            - 顯示本周報告
 *   @bot 建立任務 <描述>     - 透過自然語言建立任務
 *
 * 使用方式：
 *   PMIS_API_KEY=pmis_xxx SLACK_BOT_TOKEN=xoxb-xxx node slack-connector.js
 *
 * 依賴：
 *   npm install @slack/bolt @modelcontextprotocol/sdk eventsource
 */

const { App } = require('@slack/bolt');
const MCPClient = require('../sdk/mcp-client');

// ── 環境變數 ─────────────────────────────────────────────────
const SLACK_BOT_TOKEN       = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET  = process.env.SLACK_SIGNING_SECRET;
const SLACK_APP_TOKEN       = process.env.SLACK_APP_TOKEN;  // for Socket Mode
const PMIS_MCP_URL          = process.env.PMIS_MCP_URL || 'http://localhost:3100';
const PMIS_API_KEY          = process.env.PMIS_API_KEY;

if (!SLACK_BOT_TOKEN || !PMIS_API_KEY) {
  console.error('❌ 請設定 SLACK_BOT_TOKEN 和 PMIS_API_KEY 環境變數');
  process.exit(1);
}

// ── MCP Client 初始化 ────────────────────────────────────────
const pmis = new MCPClient({
  serverUrl: PMIS_MCP_URL,
  apiKey:    PMIS_API_KEY,
});

// ── Slack App 初始化 ─────────────────────────────────────────
const app = new App({
  token:         SLACK_BOT_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
  socketMode:    !!SLACK_APP_TOKEN,
  appToken:      SLACK_APP_TOKEN,
  port:          process.env.PORT || 3200,
});

// ════════════════════════════════════════════════════════════
// Slash Commands
// ════════════════════════════════════════════════════════════

/**
 * /pmis projects
 */
app.command('/pmis', async ({ command, ack, respond }) => {
  await ack();
  const [subCmd, ...args] = command.text.trim().split(/\s+/);

  try {
    switch (subCmd?.toLowerCase()) {

      // /pmis projects
      case 'projects': {
        const result = await pmis.callTool('list_projects', {});
        const projects = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : [];

        if (projects.length === 0) {
          return respond('目前沒有進行中的專案。');
        }

        const blocks = [
          { type: 'header', text: { type: 'plain_text', text: '📋 進行中的專案' } },
          ...projects.slice(0, 10).map(p => ({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${p.name}* (#${p.id})\n狀態: ${p.status} | 任務數: ${p.taskCount ?? '-'}`,
            },
            accessory: {
              type: 'button',
              text: { type: 'plain_text', text: '查看詳情' },
              value: `project_${p.id}`,
              action_id: 'view_project',
            },
          })),
        ];
        await respond({ blocks });
        break;
      }

      // /pmis task <id>
      case 'task': {
        const taskId = parseInt(args[0]);
        if (!taskId) return respond('用法：`/pmis task <任務ID>`');

        const result = await pmis.callTool('get_task_details', { taskId });
        const task   = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : null;
        if (!task) return respond(`找不到任務 #${taskId}`);

        await respond({
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: `📌 ${task.title}` },
            },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*狀態:* ${task.status}` },
                { type: 'mrkdwn', text: `*優先級:* ${task.priority}` },
                { type: 'mrkdwn', text: `*指派給:* ${task.assignedToName || '未指派'}` },
                { type: 'mrkdwn', text: `*截止日:* ${task.dueDate ? new Date(task.dueDate).toLocaleDateString('zh-TW') : '未設定'}` },
              ],
            },
            task.description && {
              type: 'section',
              text: { type: 'mrkdwn', text: `*描述:* ${task.description}` },
            },
          ].filter(Boolean),
        });
        break;
      }

      // /pmis assign <taskId> <@user>
      case 'assign': {
        const taskId   = parseInt(args[0]);
        const slackUid = args[1]?.replace(/[<@>]/g, '');
        if (!taskId || !slackUid) return respond('用法：`/pmis assign <任務ID> <@用戶>`');

        // 在此需要 Slack UID → PMIS userId 的對應表（實際上需要查詢或維護映射）
        const userId = await resolveSlackUser(slackUid);
        if (!userId) return respond(`找不到 <@${slackUid}> 對應的 PMIS 帳號`);

        await pmis.callTool('assign_task', {
          taskId,
          userId,
          notify: true,
          message: `由 Slack Bot 指派，來自 ${command.user_name}`,
        });
        await respond(`✅ 任務 #${taskId} 已指派給 <@${slackUid}>`);
        break;
      }

      // /pmis report
      case 'report': {
        const projectId = parseInt(args[0]);
        if (!projectId) {
          // 顯示每周報告
          const weeklyReport = await pmis.readResource('report://weekly');
          const data = weeklyReport.contents?.[0]?.text ? JSON.parse(weeklyReport.contents[0].text) : {};

          await respond({
            blocks: [
              { type: 'header', text: { type: 'plain_text', text: '📊 本周專案報告' } },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: `*進行中專案:* ${data.activeProjects}` },
                  { type: 'mrkdwn', text: `*本周完成任務:* ${data.tasksCompleted}` },
                  { type: 'mrkdwn', text: `*本周新建任務:* ${data.tasksCreated}` },
                  { type: 'mrkdwn', text: `*逾期任務:* ${data.overdueTotal}` },
                ],
              },
            ],
          });
        } else {
          // 顯示特定專案報告
          const result = await pmis.callTool('get_project_report', { projectId, format: 'json' });
          const report = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : {};
          await respond({
            blocks: [
              { type: 'header', text: { type: 'plain_text', text: `📊 ${report.name} 專案報告` } },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: `*完成率:* ${report.completionRate}%` },
                  { type: 'mrkdwn', text: `*進行中:* ${report.taskStats?.in_progress}` },
                  { type: 'mrkdwn', text: `*逾期:* ${report.overdueCount}` },
                  { type: 'mrkdwn', text: `*健康度:* ${report.healthScore}/100` },
                ],
              },
              {
                type: 'section',
                text: { type: 'mrkdwn', text: `*風險提示:*\n${report.risks?.join('\n') || '暫無風險'}` },
              },
            ],
          });
        }
        break;
      }

      // /pmis workload <@user>
      case 'workload': {
        const slackUid = args[0]?.replace(/[<@>]/g, '');
        if (!slackUid) return respond('用法：`/pmis workload <@用戶>`');

        const userId = await resolveSlackUser(slackUid);
        if (!userId) return respond(`找不到 <@${slackUid}> 對應的 PMIS 帳號`);

        const data   = await pmis.readResource(`user://${userId}/workload`);
        const report = data.contents?.[0]?.text ? JSON.parse(data.contents[0].text) : {};

        const emoji = report.loadLevel === 'light' ? '🟢' :
                      report.loadLevel === 'normal' ? '🟡' :
                      report.loadLevel === 'heavy'  ? '🟠' : '🔴';

        await respond({
          blocks: [
            { type: 'header', text: { type: 'plain_text', text: `👤 ${report.user?.name} 的工作負載` } },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*負載狀態:* ${emoji} ${report.loadLevel}` },
                { type: 'mrkdwn', text: `*負載指數:* ${report.loadScore}%` },
                { type: 'mrkdwn', text: `*進行中任務:* ${report.activeTasks}` },
                { type: 'mrkdwn', text: `*逾期任務:* ${report.overdueTasks}` },
                { type: 'mrkdwn', text: `*本周預估工時:* ${report.estimatedHoursThisWeek}h` },
                { type: 'mrkdwn', text: `*可用工時:* ${report.availableHoursPerWeek}h/week` },
              ],
            },
          ],
        });
        break;
      }

      default:
        await respond({
          text: '可用指令：\n• `/pmis projects` - 列出專案\n• `/pmis task <id>` - 查詢任務\n• `/pmis assign <taskId> <@user>` - 指派任務\n• `/pmis report [projectId]` - 查看報告\n• `/pmis workload <@user>` - 查看工作負載',
        });
    }
  } catch (err) {
    console.error('[Slack] Error:', err.message);
    await respond(`❌ 操作失敗：${err.message}`);
  }
});

// ════════════════════════════════════════════════════════════
// 自然語言任務建立（@mention）
// ════════════════════════════════════════════════════════════

app.event('app_mention', async ({ event, say }) => {
  const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) return;

  try {
    await say({ text: '⏳ 正在處理您的請求...', thread_ts: event.ts });

    // 簡單的自然語言解析（生產環境建議接 Claude API）
    if (/建立|新增|create/i.test(text)) {
      const titleMatch = text.match(/(?:任務|task)[：:\s]+(.+)/i);
      const title      = titleMatch?.[1] || text;
      const result     = await pmis.callTool('create_task', {
        title,
        description: `由 Slack 建立：${text}`,
        priority:    'medium',
      });
      const task = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : {};
      await say({
        thread_ts: event.ts,
        text:      `✅ 任務已建立！ID: #${task.id}，標題：${task.title}`,
      });
    } else {
      await say({
        thread_ts: event.ts,
        text:      '目前支援的操作：建立任務（例：@bot 建立任務：修復登入 Bug）',
      });
    }
  } catch (err) {
    await say({ thread_ts: event.ts, text: `❌ 操作失敗：${err.message}` });
  }
});

// ════════════════════════════════════════════════════════════
// Block Actions（按鈕互動）
// ════════════════════════════════════════════════════════════

app.action('view_project', async ({ body, ack, respond }) => {
  await ack();
  const projectId = parseInt(body.actions[0].value.replace('project_', ''));
  const data      = await pmis.readResource(`project://${projectId}`);
  const project   = data.contents?.[0]?.text ? JSON.parse(data.contents[0].text) : {};

  await respond({
    replace_original: false,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `📁 ${project.name}` } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `狀態：${project.status}\n任務總數：${project.tasks?.length || 0}\n里程碑：${project.milestones?.length || 0}`,
        },
      },
    ],
  });
});

// ════════════════════════════════════════════════════════════
// 輔助函數
// ════════════════════════════════════════════════════════════

// Slack UID → PMIS userId 映射（實際上應存在資料庫）
const SLACK_USER_MAP = new Map(
  (process.env.SLACK_USER_MAP || '')
    .split(',')
    .filter(Boolean)
    .map(pair => pair.split(':'))
);

async function resolveSlackUser(slackUid) {
  return SLACK_USER_MAP.get(slackUid) ? parseInt(SLACK_USER_MAP.get(slackUid)) : null;
}

// ════════════════════════════════════════════════════════════
// 啟動
// ════════════════════════════════════════════════════════════

(async () => {
  await pmis.connect();
  console.log('✅ MCP Client 已連線到 PMIS');

  await app.start();
  console.log('🚀 Slack Bot 已啟動');
})();

process.on('SIGTERM', async () => {
  await pmis.disconnect();
  process.exit(0);
});
