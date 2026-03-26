'use strict';
/**
 * pmis-ai-service
 * ─────────────────────────────────────────────────────────────
 * 獨立 AI 決策服務 — 將所有 OpenAI API 呼叫從主後端抽離
 *
 * 職責：
 *   - 接收主後端的 HTTP 請求，執行 OpenAI 呼叫
 *   - 長達 5~30 秒的 AI 請求不再佔用主 Express event loop
 *   - 可獨立重啟/擴展，不影響主服務
 *
 * 端點：
 *   POST /breakdown     - 任務拆解
 *   POST /risk          - 風險分析
 *   POST /weekly-report - 週報生成
 *   POST /schedule      - 排程優化
 *   GET  /health-score  - 健康度評分（純計算，無 AI）
 *   GET  /health        - 服務健康檢查
 *
 * 認證：
 *   x-internal-secret 標頭（服務間共享秘鑰）
 */

require('dotenv').config();

const express  = require('express');
const OpenAI   = require('openai');
const { PrismaClient } = require('@prisma/client');

const app    = express();
const prisma = new PrismaClient({ log: ['error'] });
const PORT   = process.env.PORT || 3002;

// ── 服務間認證 ───────────────────────────────────────────────
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || 'pmis-internal-secret-dev';

app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  if (req.path === '/health') return next();  // 健康檢查不需認證
  if (req.headers['x-internal-secret'] !== INTERNAL_SECRET) {
    return res.status(401).json({ error: '未授權' });
  }
  next();
});

// ════════════════════════════════════════════════════════════
// 模型設定管理（DB → ENV 回退，30 秒快取）
// ════════════════════════════════════════════════════════════

const CONFIG_CACHE_TTL_MS = 30_000;
let _configCache  = null;
let _configExpiry = 0;
let _client       = null;
let _clientKey    = '';

const LANGUAGE     = process.env.AI_LANGUAGE     || 'zh-TW（繁體中文）';
const COMPANY_NAME = process.env.AI_COMPANY_NAME || '公司';

async function getActiveConfig(companyId = 1) {
  const now = Date.now();
  if (_configCache && now < _configExpiry) return _configCache;

  try {
    const record = await prisma.aiModelConfig.findFirst({
      where:   { companyId: parseInt(companyId), isActive: true },
      orderBy: { updatedAt: 'desc' },
      select:  { baseUrl: true, apiKey: true, modelHeavy: true, modelLight: true, maxTokens: true },
    });

    _configCache = record
      ? {
          baseUrl:    record.baseUrl    || null,
          apiKey:     record.apiKey     || process.env.OPENAI_API_KEY || '',
          modelHeavy: record.modelHeavy || 'gpt-4o',
          modelLight: record.modelLight || 'gpt-4o-mini',
          maxTokens:  record.maxTokens  || 2000,
        }
      : _envFallback();
  } catch {
    _configCache = _envFallback();
  }

  _configExpiry = now + CONFIG_CACHE_TTL_MS;
  return _configCache;
}

function _envFallback() {
  return {
    baseUrl:    null,
    apiKey:     process.env.OPENAI_API_KEY || '',
    modelHeavy: 'gpt-4o',
    modelLight: 'gpt-4o-mini',
    maxTokens:  parseInt(process.env.AI_MAX_TOKENS) || 2000,
  };
}

function _isLocalUrl(url) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal/i.test(url || '');
}

function _getClient(config) {
  let apiKey = config.apiKey;
  if (!apiKey) {
    if (_isLocalUrl(config.baseUrl)) apiKey = 'ollama';
    else throw new Error('AI 模型金鑰未設定，請至 AI 決策中心設定 API 金鑰');
  }

  const key = `${config.baseUrl || ''}|${apiKey.slice(0, 8)}`;
  if (_client && _clientKey === key) return _client;

  const opts = { apiKey, timeout: 90_000, maxRetries: 2 };
  if (config.baseUrl) opts.baseURL = config.baseUrl;

  _client    = new OpenAI(opts);
  _clientKey = key;
  return _client;
}

// ════════════════════════════════════════════════════════════
// 核心 OpenAI 呼叫
// ════════════════════════════════════════════════════════════

async function callOpenAI({ model, systemPrompt, userMessage, jsonMode = true, temperature = 0.3, config }) {
  const client = _getClient(config);

  const response = await client.chat.completions.create({
    model,
    temperature,
    max_tokens:      config.maxTokens,
    response_format: jsonMode ? { type: 'json_object' } : undefined,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage  },
    ],
  });

  return response;
}

function safeParseJSON(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(cleaned);
}

function logUsage(fn, usage, model) {
  if (!usage) return;
  process.stderr.write(`[AI-SVC] ${fn} | model=${model} | tokens=${usage.prompt_tokens}+${usage.completion_tokens}\n`);
}

// ════════════════════════════════════════════════════════════
// System Prompt（與 aiAgent.js 保持一致）
// ════════════════════════════════════════════════════════════

function buildSystemPrompt(role = 'general') {
  const base = `
你是「xCloudPMIS 智慧 PM 助理」，一位在台灣 IT 產業有 15 年以上實戰經驗的資深專案管理顧問。

【身分背景】
- 熟悉台灣 IT 企業的工作節奏（敏捷開發、Scrum、看板方法）
- 了解台灣法規（勞基法工時）與企業文化（重視溝通、務實導向）
- 具備 PMP、PMI-ACP 認證，熟悉 PMBOK 7.0 框架
- 當前服務公司：${COMPANY_NAME}

【溝通規則】
- 永遠使用 ${LANGUAGE} 回應
- 語氣：專業但親切，像同事顧問而非冷冰冰的系統
- 數字要具體（不說「幾天」，要說「3 個工作天 = 24 人時」）
- 遇到模糊需求，要在分析中明確指出假設前提

【輸出規則】
- 所有 JSON 欄位名稱使用英文（camelCase）
- 文字內容使用繁體中文
- 時間估算單位統一為「人時（person-hours）」
- 風險等級：critical（極高）、high（高）、medium（中）、low（低）
`.trim();

  const extras = {
    breakdown: `\n\n【本次任務：任務拆解】\n你的目標是將一個模糊的目標或需求，拆解成具體可執行的子任務清單。\n考慮技術複雜度、台灣 IT 常見技術棧、合理任務顆粒度（4~40 人時）、依賴關係與驗收標準。`,
    risk:      `\n\n【本次任務：風險分析】\n根據專案現況數據識別潛在風險（進度/資源/技術/溝通/品質）並提供具體建議。\n風險評分 0~100：0~30 低，31~60 中，61~80 高，81~100 極高。`,
    report:    `\n\n【本次任務：週報生成】\n根據任務數據生成給主管或客戶的專業週報。包含整體摘要、本週成果、進行中項目、阻礙事項、下週計劃。長度約 300~500 字。`,
  };

  return base + (extras[role] || '');
}

// ════════════════════════════════════════════════════════════
// 路由：POST /breakdown（任務拆解）
// ════════════════════════════════════════════════════════════

app.post('/breakdown', async (req, res) => {
  try {
    const { projectGoal, options = {} } = req.body;
    if (!projectGoal) return res.status(400).json({ error: '缺少 projectGoal' });

    const config = await getActiveConfig(options.companyId);
    const {
      teamSize = null, techStack = null, duration = null,
      taskCount = '8 ~ 12', existingContext = null,
    } = options;

    const contextLines = [];
    if (teamSize)        contextLines.push(`- 團隊規模：${teamSize} 人`);
    if (techStack)       contextLines.push(`- 技術棧：${techStack}`);
    if (duration)        contextLines.push(`- 目標時程：${duration}`);
    if (existingContext) contextLines.push(`- 現有系統與限制：${existingContext}`);

    const userMessage = `
請將以下目標拆解為 ${taskCount} 個子任務，以 JSON 格式回應。
每個任務的 estimatedHours 在 4~40 之間，超過 40 則繼續拆解。

目標：「${projectGoal}」
${contextLines.length ? '\n專案背景：\n' + contextLines.join('\n') : ''}

JSON 格式：{ "summary": "", "totalEstimatedHours": 0, "suggestedDuration": "", "assumptions": [], "tasks": [{ "order": 1, "title": "", "description": "", "estimatedHours": 0, "priority": "", "phase": "", "dependsOn": [], "acceptanceCriteria": "", "skills": [] }] }
`.trim();

    const response = await callOpenAI({
      model: config.modelHeavy, config,
      systemPrompt: buildSystemPrompt('breakdown'),
      userMessage, jsonMode: true, temperature: 0.4,
    });

    const result = safeParseJSON(response.choices[0].message.content);
    logUsage('breakdown', response.usage, config.modelHeavy);

    res.json({
      ...result,
      _meta: { model: config.modelHeavy, generatedAt: new Date().toISOString(), promptTokens: response.usage?.prompt_tokens, completionTokens: response.usage?.completion_tokens },
    });
  } catch (err) {
    console.error('[AI-SVC] breakdown error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// 路由：POST /risk（風險分析）
// ════════════════════════════════════════════════════════════

app.post('/risk', async (req, res) => {
  try {
    const projectData = req.body;
    if (!projectData?.name) return res.status(400).json({ error: '缺少 projectData.name' });

    const config = await getActiveConfig(projectData.companyId);
    const now    = new Date();
    const tasks  = projectData.tasks || [];
    const total  = tasks.length;
    const done   = tasks.filter(t => t.status === 'done').length;
    const overdue = tasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now);
    const completionPct = total > 0 ? Math.round((done / total) * 100) : 0;
    const overduePct    = total > 0 ? Math.round((overdue.length / total) * 100) : 0;
    const daysUntilEnd  = projectData.endDate ? Math.ceil((new Date(projectData.endDate) - now) / 86400000) : null;
    const milestones    = projectData.milestones || [];
    const overdueMS     = milestones.filter(m => !m.isAchieved && m.dueDate && new Date(m.dueDate) < now);

    const userMessage = `
請分析以下專案的風險狀況，以 JSON 格式輸出詳細風險報告。

【專案基本資訊】
- 名稱：${projectData.name}
- 狀態：${projectData.status}
- 截止日期：${projectData.endDate ? new Date(projectData.endDate).toLocaleDateString('zh-TW') : '未設定'}
- 距截止日：${daysUntilEnd !== null ? `${daysUntilEnd} 天` : '未設定'}
- 預算：${projectData.budget ? `NT$ ${Number(projectData.budget).toLocaleString()}` : '未設定'}

【任務現況】
- 總任務數：${total}，完成：${done}（${completionPct}%），逾期：${overdue.length}（${overduePct}%）
- 逾期里程碑：${overdueMS.length} 個

【團隊負載】
${projectData.team ? projectData.team.map(m => `- ${m.name}：${m.taskCount || 0} 個任務，逾期 ${m.overdueCount || 0}`).join('\n') : '（未提供）'}

JSON 格式：{ "riskScore": 0, "riskLevel": "low|medium|high|critical", "riskLevelLabel": "", "summary": "", "factors": [{ "category": "", "categoryLabel": "", "severity": "", "title": "", "description": "", "impact": "" }], "recommendations": [{ "priority": 1, "action": "", "owner": "", "timeline": "", "expectedOutcome": "" }], "positives": [] }
`.trim();

    const response = await callOpenAI({
      model: config.modelHeavy, config,
      systemPrompt: buildSystemPrompt('risk'),
      userMessage, jsonMode: true, temperature: 0.2,
    });

    const result = safeParseJSON(response.choices[0].message.content);
    logUsage('risk', response.usage, config.modelHeavy);

    res.json({
      ...result,
      _meta: { model: config.modelHeavy, analyzedAt: new Date().toISOString(), projectId: projectData.id, metrics: { total, done, completionPct, overdueCount: overdue.length, overduePct, daysUntilEnd }, promptTokens: response.usage?.prompt_tokens, completionTokens: response.usage?.completion_tokens },
    });
  } catch (err) {
    console.error('[AI-SVC] risk error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// 路由：POST /weekly-report（週報生成）
// ════════════════════════════════════════════════════════════

app.post('/weekly-report', async (req, res) => {
  try {
    const {
      projectName = '未命名專案', weekRange = '本週',
      completedThisWeek = [], inProgress = [], blocked = [],
      totalHoursLogged = 0, highlights = [], nextWeekPlan = [],
      audience = '主管', style = 'formal', companyId = 1,
    } = req.body;

    const config = await getActiveConfig(companyId);

    const fmt = t => `  - ${t.title}${t.assignee ? `（${t.assignee}）` : ''}${t.dueDate ? `，截止 ${t.dueDate}` : ''}`;

    const userMessage = `
請根據以下數據生成週報，以 JSON 格式輸出。

【週報資訊】
- 專案：${projectName}，時間：${weekRange}，對象：${audience}，風格：${style === 'casual' ? '輕鬆' : '正式'}，本週工時：${totalHoursLogged} 人時

【完成（${completedThisWeek.length} 個）】
${completedThisWeek.length ? completedThisWeek.map(fmt).join('\n') : '  無'}

【進行中（${inProgress.length} 個）】
${inProgress.length ? inProgress.map(t => `  - ${t.title}（進度 ${t.progress ?? '進行中'}）`).join('\n') : '  無'}

【阻礙】
${blocked.length ? blocked.map(t => `  - ${t.title}：${t.blockReason || '待確認'}`).join('\n') : '  無'}

【亮點】${highlights.map(h => `\n  - ${h}`).join('') || ' 無'}
【下週計劃】${nextWeekPlan.map(p => `\n  - ${p}`).join('') || ' 待規劃'}

JSON 格式：{ "subjectLine": "", "reportMarkdown": "", "reportPlainText": "" }
`.trim();

    const response = await callOpenAI({
      model: config.modelLight, config,
      systemPrompt: buildSystemPrompt('report'),
      userMessage, jsonMode: true, temperature: 0.5,
    });

    const result = safeParseJSON(response.choices[0].message.content);
    logUsage('weeklyReport', response.usage, config.modelLight);

    res.json({
      ...result,
      _meta: { model: config.modelLight, generatedAt: new Date().toISOString(), promptTokens: response.usage?.prompt_tokens, completionTokens: response.usage?.completion_tokens },
    });
  } catch (err) {
    console.error('[AI-SVC] weekly-report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// 路由：POST /schedule（排程優化）
// ════════════════════════════════════════════════════════════

app.post('/schedule', async (req, res) => {
  try {
    const projectData = req.body;
    const config = await getActiveConfig(projectData.companyId);
    const now    = new Date();
    const tasks  = (projectData.tasks || []).filter(t => t.status !== 'done');

    const taskList = tasks.map(t => ({
      id: t.id, title: t.title, priority: t.priority,
      estimatedHours: t.estimatedHours || null,
      dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString('zh-TW') : '未設定',
      assignee: t.assignee?.name || '未指派',
      isOverdue: t.dueDate && new Date(t.dueDate) < now,
    }));

    const userMessage = `
請分析以下專案的任務排程，給出優化建議，以 JSON 格式輸出。

【截止日】${projectData.endDate ? new Date(projectData.endDate).toLocaleDateString('zh-TW') : '未設定'}
【未完成任務】
${JSON.stringify(taskList, null, 2)}
【團隊可用工時】
${projectData.team ? projectData.team.map(m => `- ${m.name}：每週 ${m.availableHours ?? 40} 人時`).join('\n') : '假設每人每週 40 人時'}

JSON 格式：{ "summary": "", "criticalPath": [], "suggestions": [{ "taskTitle": "", "currentDueDate": "", "suggestedDueDate": "", "reason": "", "action": "", "suggestedAssignee": "" }], "workloadRebalancing": [{ "member": "", "currentLoad": "", "suggestion": "" }], "feasibility": "" }
`.trim();

    const response = await callOpenAI({
      model: config.modelHeavy, config,
      systemPrompt: buildSystemPrompt('risk'),
      userMessage, jsonMode: true, temperature: 0.2,
    });

    const result = safeParseJSON(response.choices[0].message.content);
    logUsage('schedule', response.usage, config.modelHeavy);

    res.json({
      ...result,
      _meta: { model: config.modelHeavy, analyzedAt: new Date().toISOString(), promptTokens: response.usage?.prompt_tokens, completionTokens: response.usage?.completion_tokens },
    });
  } catch (err) {
    console.error('[AI-SVC] schedule error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// 路由：POST /health-score（健康度評分，純計算不呼叫 AI）
// ════════════════════════════════════════════════════════════

app.post('/health-score', (req, res) => {
  try {
    const projectData = req.body;
    const now   = new Date();
    const tasks = projectData.tasks || [];
    const total = tasks.length;

    if (total === 0) {
      return res.json({ score: 50, level: 'medium', levelLabel: '中風險（無任務資料）', breakdown: {} });
    }

    const done   = tasks.filter(t => t.status === 'done').length;
    const overdue = tasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now).length;
    const urgent  = tasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length;
    const completionPct = (done / total) * 100;
    const overduePct    = (overdue / total) * 100;

    let score = 100;
    score -= overduePct * 1.5;
    score -= urgent * 5;
    score += completionPct * 0.2;

    if (projectData.endDate) {
      const daysLeft = (new Date(projectData.endDate) - now) / 86400000;
      if (daysLeft < 7 && completionPct < 90)   score -= 20;
      else if (daysLeft < 14 && completionPct < 70) score -= 10;
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const level      = score >= 70 ? 'low' : score >= 40 ? 'medium' : score >= 20 ? 'high' : 'critical';
    const levelLabel = score >= 70 ? '健康（低風險）' : score >= 40 ? '需注意（中風險）' : score >= 20 ? '有問題（高風險）' : '危險（極高風險）';

    res.json({ score, level, levelLabel, breakdown: { completionPct: Math.round(completionPct), overduePct: Math.round(overduePct), overdueCount: overdue, urgentCount: urgent } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// 健康檢查
// ════════════════════════════════════════════════════════════

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'pmis-ai-service', uptime: Math.floor(process.uptime()) + ' 秒' });
});

// ════════════════════════════════════════════════════════════
// 啟動
// ════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   xCloudPMIS AI 服務已啟動            ║');
  console.log(`║   http://localhost:${PORT}                ║`);
  console.log('╚══════════════════════════════════════╝');
});
