#!/usr/bin/env node
/**
 * jobs/monitorAgent.js
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS Phase 3 — AI 背景監控代理
 *
 * 職責：
 *   自動偵測全公司的高風險任務與延遲專案，
 *   主動生成 AI 風險報告，並透過 Email 通知相關人員。
 *
 * 兩種觸發模式：
 *   ① Cron 排程（每日自動）
 *      每天凌晨 3:00 對所有公司執行 AI 風險掃描
 *      → 偵測逾期任務、資源過載、里程碑風險
 *      → 自動建立「風險管理任務」並指派給 PM
 *
 *   ② Redis Pub/Sub（事件驅動，即時）
 *      訂閱 pmis:events 頻道
 *      → 收到 task_overdue / project_at_risk 事件立即處理
 *      → 協作伺服器（yjsServer）可發布即時事件
 *
 * 架構關聯：
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  Cron (node-cron)                                       │
 *   │    └── scanAllCompanies()                               │
 *   │           └── analyzeRisk() [aiAgent.js]                │
 *   │                  └── gpt-4o → riskReport                │
 *   │                         ├── createRiskTask() [Prisma]   │
 *   │                         └── sendEmail() [emailService]  │
 *   │                                                         │
 *   │  Redis Sub (pmis:events)                                │
 *   │    └── handleEvent(event)                               │
 *   │           ├── task_overdue → notifyAssignee()           │
 *   │           └── project_at_risk → deepScan()             │
 *   └─────────────────────────────────────────────────────────┘
 *
 * 啟動方式：
 *   node jobs/monitorAgent.js               （獨立執行）
 *   docker-compose up monitor               （Docker）
 *
 * 環境變數：
 *   CRON_AI_RISK_SCAN        — 排程（預設 '0 3 * * *' 凌晨 3 點）
 *   AI_RISK_THRESHOLD        — 風險分數閾值（預設 70，範圍 0-100）
 *   AI_RISK_TASK_DEFAULT_ASSIGNEE — 風險任務指派人 ID
 *   SCHEDULER_COMPANY_ID     — 單公司模式（設定後只掃描此公司）
 *   REDIS_HOST/PORT/PASSWORD — Redis 連線（Pub/Sub 用）
 *   DATABASE_URL             — PostgreSQL 連線
 *   OPENAI_API_KEY           — OpenAI API（必填）
 */

'use strict';

const path = require('path');
// 支援多種執行路徑
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const cron       = require('node-cron');
const { createClient } = require('redis');
const { PrismaClient } = require('@prisma/client');

// ── 依賴服務（延遲載入）──────────────────────────────────────
let _aiAgent      = null;
let _emailService = null;

function getAiAgent()      { return _aiAgent      || (_aiAgent      = require('../src/services/aiAgent')); }
function getEmailService() { return _emailService  || (_emailService = require('../src/services/emailService')); }

// ── 常數 ─────────────────────────────────────────────────────
const CRON_SCHEDULE  = process.env.CRON_AI_RISK_SCAN || '0 3 * * *';
const RISK_THRESHOLD = parseInt(process.env.AI_RISK_THRESHOLD) || 70;
const DEFAULT_ASSIGNEE = parseInt(process.env.AI_RISK_TASK_DEFAULT_ASSIGNEE) || 1;
const SINGLE_COMPANY   = process.env.SCHEDULER_COMPANY_ID
  ? parseInt(process.env.SCHEDULER_COMPANY_ID) : null;

const REDIS_EVENTS_CHANNEL = 'pmis:events';

// ── 資料庫 ────────────────────────────────────────────────────
const prisma = new PrismaClient({ log: ['error'] });

// ── Redis（訂閱用，與主 Redis client 分離）────────────────────
const redisSub = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
  },
  password: process.env.REDIS_PASSWORD || undefined,
});

redisSub.on('error', err => log('error', `Redis 訂閱錯誤: ${err.message}`));

// ════════════════════════════════════════════════════════════
// 工具函式
// ════════════════════════════════════════════════════════════

function log(level, msg) {
  const icons = { info: '📊', warn: '⚠️', error: '❌', success: '✅' };
  process.stderr.write(`[MonitorAgent] ${icons[level] || '•'} ${msg}\n`);
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: 'Asia/Taipei',
  });
}

// ════════════════════════════════════════════════════════════
// 核心功能：AI 風險掃描
// ════════════════════════════════════════════════════════════

/**
 * 對單一公司執行 AI 風險掃描
 * @param {number} companyId
 * @returns {Promise<{scanned: number, highRisk: number, tasksCreated: number}>}
 */
async function scanCompany(companyId) {
  log('info', `開始掃描公司 #${companyId}⋯`);

  // ── 查詢進行中的專案 ─────────────────────────────────────
  const projects = await prisma.project.findMany({
    where: {
      companyId,
      deletedAt: null,
      status:    { in: ['planning', 'active', 'on_hold'] },
    },
    include: {
      tasks: {
        where:   { deletedAt: null },
        include: { assignee: { select: { id: true, name: true, email: true } } },
      },
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  let highRiskCount  = 0;
  let tasksCreated   = 0;

  for (const project of projects) {
    try {
      const result = await analyzeProjectRisk(project, companyId);
      highRiskCount  += result.isHighRisk    ? 1 : 0;
      tasksCreated   += result.taskCreated   ? 1 : 0;
    } catch (err) {
      log('error', `專案 #${project.id} 分析失敗: ${err.message}`);
    }
  }

  log('success', `公司 #${companyId} 掃描完成 — 共 ${projects.length} 個專案，${highRiskCount} 個高風險`);
  return { scanned: projects.length, highRisk: highRiskCount, tasksCreated };
}

/**
 * 對單一專案執行風險分析並處理結果
 */
async function analyzeProjectRisk(project, companyId) {
  const now   = new Date();
  const tasks = project.tasks || [];

  // ── 計算客觀指標（供 AI 分析）─────────────────────────────
  const overdueTasks = tasks.filter(
    t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'done'
  );
  const completedTasks = tasks.filter(t => t.status === 'done');
  const completionRate = tasks.length > 0
    ? (completedTasks.length / tasks.length) * 100 : 0;

  // ── 呼叫 AI 風險分析 ──────────────────────────────────────
  const aiAgent = getAiAgent();
  const riskReport = await aiAgent.analyzeRisk({
    projectId:         project.id,
    projectName:       project.name,
    status:            project.status,
    startDate:         project.startDate,
    endDate:           project.endDate,
    completionRate,
    totalTasks:        tasks.length,
    overdueTasks:      overdueTasks.length,
    overdueTaskNames:  overdueTasks.slice(0, 5).map(t => t.title),
    teamSize:          project.members?.length || 0,
  });

  const riskScore = riskReport?.riskScore ?? 0;
  const isHighRisk = riskScore >= RISK_THRESHOLD;

  log(
    isHighRisk ? 'warn' : 'info',
    `專案「${project.name}」風險分數: ${riskScore} ${isHighRisk ? '⚠️ 高風險' : '✓ 正常'}`
  );

  // ── 高風險處理 ────────────────────────────────────────────
  let taskCreated = false;

  if (isHighRisk) {
    // ① 建立風險管理任務
    taskCreated = await createRiskManagementTask(project, riskReport, companyId);

    // ② 發送 Email 通知（不阻塞，允許失敗）
    notifyProjectManagers(project, riskReport).catch(err =>
      log('warn', `Email 通知失敗（不影響流程）: ${err.message}`)
    );
  }

  return { isHighRisk, taskCreated };
}

/**
 * 在 Prisma 建立「風險管理任務」
 */
async function createRiskManagementTask(project, riskReport, companyId) {
  try {
    // 避免重複建立（7 天內同專案同類型任務只建立一次）
    const existing = await prisma.task.findFirst({
      where: {
        projectId:  project.id,
        title:      { contains: '🤖 AI 風險評估' },
        createdAt:  { gte: new Date(Date.now() - 7 * 24 * 3600_000) },
        deletedAt:  null,
      },
    });

    if (existing) {
      log('info', `專案 #${project.id} 近期已有風險任務 #${existing.id}，跳過`);
      return false;
    }

    // 建立任務
    const dueDate = new Date(Date.now() + 3 * 24 * 3600_000); // 3 天後到期
    const task = await prisma.task.create({
      data: {
        title:      `🤖 AI 風險評估 — ${project.name}`,
        description: buildRiskTaskDescription(riskReport, project),
        status:     'todo',
        priority:   riskReport.riskScore >= 85 ? 'urgent' : 'high',
        dueDate,
        projectId:  project.id,
        assigneeId: DEFAULT_ASSIGNEE,
      },
    });

    log('success', `已建立風險任務 #${task.id}（專案: ${project.name}）`);
    return true;
  } catch (err) {
    log('error', `建立風險任務失敗: ${err.message}`);
    return false;
  }
}

/**
 * 發送 Email 通知給 PM（高風險警報）
 */
async function notifyProjectManagers(project, riskReport) {
  const emailSvc = getEmailService();

  // 取得 PM 信箱（專案成員中有 PM 角色的用戶）
  const pms = (project.members || [])
    .filter(m => m.role === 'pm' || m.role === 'owner')
    .map(m => m.user?.email)
    .filter(Boolean);

  if (pms.length === 0) {
    log('info', `專案 #${project.id} 無 PM 信箱，跳過 Email 通知`);
    return;
  }

  const subject = `⚠️ AI 風險警報 — ${project.name}（風險分數 ${riskReport.riskScore}）`;
  const body    = buildRiskEmailBody(riskReport, project);

  for (const email of pms) {
    await emailSvc.sendEmail({ to: email, subject, body, isHtml: true });
    log('info', `已發送風險警報 Email → ${email}`);
  }
}

// ════════════════════════════════════════════════════════════
// Cron 排程：全公司定期掃描
// ════════════════════════════════════════════════════════════

function startCronSchedule() {
  log('info', `排程設定：${CRON_SCHEDULE}（AI 風險掃描）`);

  cron.schedule(CRON_SCHEDULE, async () => {
    log('info', '🕐 排程觸發：開始執行全公司 AI 風險掃描');
    await runFullScan();
  }, { timezone: 'Asia/Taipei' });
}

async function runFullScan() {
  const startTime = Date.now();

  try {
    let companyIds = [];

    if (SINGLE_COMPANY) {
      // 單公司模式（.env 指定）
      companyIds = [SINGLE_COMPANY];
    } else {
      // 掃描所有活躍公司
      const companies = await prisma.company.findMany({
        where:  { deletedAt: null },
        select: { id: true, name: true },
      });
      companyIds = companies.map(c => c.id);
    }

    log('info', `掃描對象：${companyIds.length} 個公司（ID: ${companyIds.join(', ')}）`);

    let totalScanned = 0;
    let totalHighRisk = 0;
    let totalTasks = 0;

    for (const id of companyIds) {
      const result = await scanCompany(id);
      totalScanned  += result.scanned;
      totalHighRisk += result.highRisk;
      totalTasks    += result.tasksCreated;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log('success',
      `掃描完成 | 耗時 ${elapsed}s | 專案 ${totalScanned} | 高風險 ${totalHighRisk} | 新增任務 ${totalTasks}`
    );
  } catch (err) {
    log('error', `全公司掃描失敗: ${err.message}`);
  }
}

// ════════════════════════════════════════════════════════════
// Redis Pub/Sub：即時事件處理
// ════════════════════════════════════════════════════════════

/**
 * Redis 事件格式：
 * {
 *   type: 'task_overdue' | 'project_at_risk' | 'collab_edit_spike',
 *   payload: { taskId?, projectId?, userId? },
 *   timestamp: number
 * }
 */
async function startRedisSubscription() {
  await redisSub.connect();
  log('info', `訂閱 Redis 頻道: ${REDIS_EVENTS_CHANNEL}`);

  await redisSub.subscribe(REDIS_EVENTS_CHANNEL, async (message) => {
    let event;
    try {
      event = JSON.parse(message);
    } catch {
      log('warn', `收到非 JSON 事件，忽略: ${message.slice(0, 100)}`);
      return;
    }

    log('info', `收到事件: ${event.type} → ${JSON.stringify(event.payload)}`);

    // 事件路由
    switch (event.type) {
      case 'task_overdue':
        await handleTaskOverdueEvent(event.payload).catch(err =>
          log('error', `處理 task_overdue 失敗: ${err.message}`)
        );
        break;

      case 'project_at_risk':
        await handleProjectAtRiskEvent(event.payload).catch(err =>
          log('error', `處理 project_at_risk 失敗: ${err.message}`)
        );
        break;

      case 'collab_edit_spike':
        // 協作編輯異常（短時間大量 Yjs 操作，可能是惡意或程式錯誤）
        log('warn', `協作編輯異常: taskId=${event.payload?.taskId}`);
        break;

      default:
        log('info', `未知事件類型 '${event.type}'，跳過`);
    }
  });
}

/** 處理任務逾期事件（即時通知）*/
async function handleTaskOverdueEvent({ taskId }) {
  if (!taskId) return;

  const task = await prisma.task.findFirst({
    where:   { id: parseInt(taskId), deletedAt: null },
    include: {
      assignee: { select: { name: true, email: true } },
      project:  { select: { id: true, name: true } },
    },
  });

  if (!task || !task.assignee?.email) return;

  const emailSvc = getEmailService();
  await emailSvc.sendEmail({
    to:      task.assignee.email,
    subject: `⏰ 任務逾期提醒 — ${task.title}`,
    body:    buildOverdueEmailBody(task),
    isHtml:  true,
  });

  log('success', `已通知逾期任務 #${taskId} 指派人：${task.assignee.email}`);
}

/** 處理專案風險事件（深度 AI 分析）*/
async function handleProjectAtRiskEvent({ projectId }) {
  if (!projectId) return;

  const project = await prisma.project.findFirst({
    where: { id: parseInt(projectId), deletedAt: null },
    include: {
      tasks:   { where: { deletedAt: null },
                 include: { assignee: { select: { id: true, name: true, email: true } } } },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });

  if (!project) return;

  log('info', `對專案 #${projectId} 執行即時 AI 風險分析`);
  await analyzeProjectRisk(project, project.companyId).catch(err =>
    log('error', `即時風險分析失敗: ${err.message}`)
  );
}

// ════════════════════════════════════════════════════════════
// Email / Task 內容建構
// ════════════════════════════════════════════════════════════

function buildRiskTaskDescription(riskReport, project) {
  const lines = [
    `# 🤖 AI 風險評估報告`,
    ``,
    `**專案**：${project.name}`,
    `**評估時間**：${formatDate(new Date())}`,
    `**風險分數**：${riskReport.riskScore} / 100`,
    `**風險等級**：${riskReport.riskLevel || '高風險'}`,
    ``,
    `## 主要風險因素`,
    ...(riskReport.riskFactors || []).map(f => `- ${f}`),
    ``,
    `## AI 建議行動`,
    ...(riskReport.recommendations || []).map((r, i) => `${i + 1}. ${r}`),
    ``,
    `---`,
    `*此任務由 AI 監控代理自動建立。請確認後執行，或關閉此任務。*`,
  ];
  return lines.join('\n');
}

function buildRiskEmailBody(riskReport, project) {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #dc2626;">⚠️ AI 風險警報</h2>
      <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 12px; border-radius: 4px;">
        <strong>專案：</strong>${project.name}<br>
        <strong>風險分數：</strong>${riskReport.riskScore} / 100<br>
        <strong>評估時間：</strong>${formatDate(new Date())}
      </div>
      <h3>主要風險因素</h3>
      <ul>
        ${(riskReport.riskFactors || []).map(f => `<li>${f}</li>`).join('')}
      </ul>
      <h3>建議行動</h3>
      <ol>
        ${(riskReport.recommendations || []).map(r => `<li>${r}</li>`).join('')}
      </ol>
      <hr style="border-color: #e5e7eb;">
      <p style="color: #6b7280; font-size: 12px;">
        此 Email 由 xCloudPMIS AI 監控代理自動發送。<br>
        如需停止通知，請聯繫系統管理員。
      </p>
    </div>
  `;
}

function buildOverdueEmailBody(task) {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #f59e0b;">⏰ 任務逾期提醒</h2>
      <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; border-radius: 4px;">
        <strong>任務：</strong>${task.title}<br>
        <strong>所屬專案：</strong>${task.project?.name || '未知'}<br>
        <strong>截止日期：</strong>${task.dueDate ? formatDate(task.dueDate) : '未設定'}<br>
        <strong>逾期天數：</strong>${task.dueDate
          ? Math.ceil((Date.now() - new Date(task.dueDate)) / 86400000) : 0} 天
      </div>
      <p>請盡快更新任務狀態或與 PM 溝通調整時程。</p>
      <hr style="border-color: #e5e7eb;">
      <p style="color: #6b7280; font-size: 12px;">
        此 Email 由 xCloudPMIS AI 監控代理自動發送。
      </p>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════
// 工具：手動發布事件（供其他模組使用）
// ════════════════════════════════════════════════════════════

/**
 * 對外匯出：其他服務可用此函式發布事件到 Redis
 * 例如：yjsServer 在偵測到異常時呼叫
 *
 * @param {'task_overdue'|'project_at_risk'|'collab_edit_spike'} type
 * @param {Object} payload
 */
async function publishEvent(type, payload) {
  // 需要獨立的 publisher client（subscriber 不能同時 publish）
  const redisPub = createClient({
    socket: {
      host:     process.env.REDIS_HOST || 'localhost',
      port:     parseInt(process.env.REDIS_PORT) || 6379,
    },
    password: process.env.REDIS_PASSWORD || undefined,
  });
  await redisPub.connect();
  await redisPub.publish(REDIS_EVENTS_CHANNEL, JSON.stringify({ type, payload, timestamp: Date.now() }));
  await redisPub.quit();
}

// ════════════════════════════════════════════════════════════
// 啟動
// ════════════════════════════════════════════════════════════

async function main() {
  log('info', `xCloudPMIS AI 監控代理啟動`);
  log('info', `OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '已設定 ✓' : '⚠️ 未設定（AI 功能停用）'}`);
  log('info', `風險閾值: ${RISK_THRESHOLD}，任務指派人 ID: ${DEFAULT_ASSIGNEE}`);

  // 優雅關閉
  process.on('SIGINT',  cleanup);
  process.on('SIGTERM', cleanup);

  // 啟動 Redis 訂閱
  await startRedisSubscription();

  // 啟動 Cron 排程
  startCronSchedule();

  // 啟動時立即執行一次掃描（可透過 CLI 參數控制）
  if (process.argv.includes('--run-now')) {
    log('info', '收到 --run-now，立即執行全公司掃描');
    await runFullScan();
  }

  log('success', '監控代理就緒，等待排程觸發或即時事件⋯');
}

async function cleanup() {
  log('info', '監控代理優雅關閉中⋯');
  await redisSub.quit().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}

// ── 匯出（讓其他模組可以主動 publish 事件）─────────────────
module.exports = { publishEvent, runFullScan, scanCompany };

// ── 直接執行（不是 require 進來的）────────────────────────
if (require.main === module) {
  main().catch(err => {
    log('error', `啟動失敗: ${err.message}`);
    process.exit(1);
  });
}
