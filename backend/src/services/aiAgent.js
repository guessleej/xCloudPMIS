/**
 * services/aiAgent.js
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS — AI Agent 服務（OpenAI GPT-4 整合）
 *
 * 提供三大 AI 能力：
 *   1. 任務拆解（Task Breakdown）
 *      → 輸入「目標/需求描述」→ 輸出「含工時估算的子任務清單」
 *
 *   2. 風險分析（Risk Analysis）
 *      → 輸入「專案現況資料」→ 輸出「風險等級、成因、建議行動」
 *
 *   3. 週報生成（Weekly Report Generation）
 *      → 輸入「時間範圍 + 任務資料」→ 輸出「自然語言週報」
 *
 * Prompt 設計原則：
 *   ① System prompt 建立 PM 專家角色與台灣企業文化脈絡
 *   ② Few-shot 範例提升任務拆解的輸出品質與格式穩定性
 *   ③ JSON 模式輸出（response_format: json_object）確保可解析性
 *   ④ 溫度設定：分析任務 0.2（精確）、生成任務 0.5（自然）
 *   ⑤ 動態 context injection 將即時資料植入 prompt
 *
 * 成本控制：
 *   - 任務拆解 → gpt-4o            （需要最高推理能力）
 *   - 風險分析 → gpt-4o            （需要深度推理）
 *   - 週報生成 → gpt-4o-mini       （文字生成，精簡成本）
 *   - 每次呼叫記錄 token 用量到 stderr 方便監控
 *
 * 環境變數：
 *   OPENAI_API_KEY     — OpenAI API 金鑰（必填）
 *   OPENAI_ORG_ID      — OpenAI 組織 ID（可選）
 *   AI_LANGUAGE        — 回應語言（預設：zh-TW 繁體中文）
 *   AI_COMPANY_NAME    — 公司名稱（植入 system prompt）
 *   AI_MAX_TOKENS      — 單次最大 token（預設：2000）
 */

'use strict';

const OpenAI = require('openai');
const { PrismaClient } = require('@prisma/client');

// ════════════════════════════════════════════════════════════
// 設定
// ════════════════════════════════════════════════════════════

const LANGUAGE     = process.env.AI_LANGUAGE     || 'zh-TW（繁體中文）';
const COMPANY_NAME = process.env.AI_COMPANY_NAME || '公司';

// ── 動態模型設定（DB 優先，ENV 回退）──────────────────────────
// 設定快取：30 秒 TTL，避免每次 AI 呼叫都查 DB
const CONFIG_CACHE_TTL_MS = 30_000;
let _configCache     = null;  // { baseUrl, apiKey, modelHeavy, modelLight, maxTokens }
let _configExpiry    = 0;

// 客戶端快取：只有設定改變時才重建
let _client          = null;
let _clientConfigKey = '';    // 用來偵測設定是否變更

const _prisma = new PrismaClient();

/**
 * 取得目前有效的模型設定（DB 優先，ENV 回退）
 * @param {number} companyId  公司 ID（必填）
 * @returns {Promise<{baseUrl:string|null, apiKey:string, modelHeavy:string, modelLight:string, maxTokens:number}>}
 */
async function getActiveConfig(companyId) {
  if (!companyId) throw new Error('getActiveConfig: companyId 為必填');
  const now = Date.now();
  if (_configCache && now < _configExpiry) return _configCache;

  try {
    const record = await _prisma.aiModelConfig.findFirst({
      where:   { companyId, isActive: true },
      orderBy: { updatedAt: 'desc' },
      select:  {
        baseUrl:    true,
        apiKey:     true,
        modelHeavy: true,
        modelLight: true,
        maxTokens:  true,
      },
    });

    _configCache = record
      ? {
          baseUrl:    record.baseUrl    || null,
          apiKey:     record.apiKey     || process.env.OPENAI_API_KEY || '',
          modelHeavy: record.modelHeavy || 'gpt-4o',
          modelLight: record.modelLight || 'gpt-4o-mini',
          maxTokens:  record.maxTokens  || 2000,
        }
      : _envFallbackConfig();

  } catch (err) {
    // DB 查詢失敗時靜默降級（不阻斷 AI 功能）
    console.warn('[AI] 讀取模型設定失敗，使用環境變數預設值:', err.message);
    _configCache = _envFallbackConfig();
  }

  _configExpiry = now + CONFIG_CACHE_TTL_MS;
  return _configCache;
}

/** 從環境變數建構預設設定 */
function _envFallbackConfig() {
  return {
    baseUrl:    null,    // null = 使用 OpenAI 預設 URL
    apiKey:     process.env.OPENAI_API_KEY || '',
    modelHeavy: 'gpt-4o',
    modelLight: 'gpt-4o-mini',
    maxTokens:  parseInt(process.env.AI_MAX_TOKENS) || 2000,
  };
}

/**
 * 清除模型設定快取（設定更新後由 settings 路由呼叫）
 * 同時清除 OpenAI 客戶端快取，強制下次建立新連線
 */
function invalidateConfigCache() {
  _configCache     = null;
  _configExpiry    = 0;
  _client          = null;
  _clientConfigKey = '';
  console.log('🔄 [AI] 模型設定快取已清除，下次呼叫將重新載入設定');
}

/**
 * 根據設定取得或建立 OpenAI 客戶端
 * @param {{ baseUrl, apiKey, modelHeavy, modelLight, maxTokens }} config
 */
/** 判斷是否為本地端 URL（Ollama / LM Studio 等，不需要真實 API Key） */
function _isLocalUrl(url) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal/i.test(url || '');
}

function _getClientForConfig(config) {
  // 本地端（Ollama / LM Studio）允許空 API Key，自動補佔位符
  let apiKey = config.apiKey;
  if (!apiKey) {
    if (_isLocalUrl(config.baseUrl)) {
      apiKey = 'ollama';  // Ollama / LM Studio 接受任意非空字串作為 API Key
    } else {
      throw new Error(
        '❌ AI 模型金鑰未設定\n' +
        '   請至「AI 決策中心 → 模型設定」輸入 API 金鑰，\n' +
        '   或設定環境變數 OPENAI_API_KEY。'
      );
    }
  }

  // 以 baseUrl + apiKey 前 8 碼 作為快取 key，識別設定是否變更
  const key = `${config.baseUrl || ''}|${apiKey.slice(0, 8)}`;
  if (_client && _clientConfigKey === key) return _client;

  const opts = {
    apiKey,
    timeout:    60_000,
    maxRetries: 2,
  };
  // baseUrl 為 null 時使用 OpenAI 預設（https://api.openai.com/v1）
  if (config.baseUrl) opts.baseURL = config.baseUrl;

  _client = new OpenAI(opts);
  _clientConfigKey = key;

  const displayUrl = config.baseUrl || 'https://api.openai.com/v1（預設）';
  console.log(`✅ [AI] 客戶端初始化：${displayUrl}`);
  return _client;
}

// ════════════════════════════════════════════════════════════
// Prompt 工程核心：System Prompt
// ════════════════════════════════════════════════════════════

/**
 * 建立核心 System Prompt
 *
 * 設計原則：
 * 1. 角色設定（Role）：資深台灣 PM 顧問，15 年以上經驗
 * 2. 脈絡（Context）：台灣 IT 企業環境、常見工作習慣
 * 3. 輸出規則（Rules）：嚴格的語言與格式要求
 * 4. 限制（Constraints）：拒絕超出 PM 範疇的問題
 */
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
- 優先級：urgent（緊急）、high（高）、medium（中）、low（低）
`.trim();

  const roleSpecific = {
    breakdown: `
【本次任務：任務拆解】
你的目標是將一個模糊的目標或需求，拆解成具體可執行的子任務清單。
要考慮：
- 技術複雜度（後端 API、前端 UI、資料庫、測試、部署）
- 台灣 IT 團隊常見技術棧（React / Vue、Node.js / PHP、PostgreSQL / MySQL）
- 合理的任務顆粒度（每個任務 4 ~ 40 人時，超過 40 則繼續拆解）
- 任務之間的依賴關係（哪些要先做）
- 驗收標準（每個任務都要能明確判斷是否完成）
`.trim(),

    risk: `
【本次任務：風險分析】
你的目標是根據專案現況數據，識別潛在風險並提供具體建議。
評估維度：
- 進度風險（schedule risk）：逾期任務、里程碑達成率
- 資源風險（resource risk）：人員負載、技能缺口
- 技術風險（technical risk）：技術複雜度、未知問題
- 溝通風險（communication risk）：跨部門協作、需求不明確
- 品質風險（quality risk）：測試覆蓋率、技術債

風險評分規則（0 ~ 100，越高越危險）：
- 0 ~ 30：低風險（green），正常推進
- 31 ~ 60：中風險（yellow），需要關注
- 61 ~ 80：高風險（red），需要介入
- 81 ~ 100：極高風險（critical），立即行動
`.trim(),

    report: `
【本次任務：週報生成】
你的目標是根據任務數據，生成一份給主管或客戶看的專業週報。
週報風格：
- 開頭：本週整體進度摘要（1 ~ 2 句）
- 主體：已完成、進行中、待處理、阻礙事項（各 1 個段落）
- 結尾：下週計劃與需要主管協助的事項
- 語氣：客觀、正向，問題要說「正在處理」而非「有問題」
- 長度：約 300 ~ 500 字（適合主管快速閱讀）
`.trim(),
  };

  return `${base}\n\n${roleSpecific[role] || ''}`;
}

// ════════════════════════════════════════════════════════════
// 工具函式
// ════════════════════════════════════════════════════════════

/**
 * 記錄 API 用量（成本追蹤）
 */
function logUsage(functionName, usage, model) {
  if (!usage) return;
  const cost = estimateCost(model, usage.prompt_tokens, usage.completion_tokens);
  process.stderr.write(
    `[AI] ${functionName} | model=${model} | ` +
    `tokens=${usage.prompt_tokens}+${usage.completion_tokens} | ` +
    `cost≈$${cost.toFixed(5)}\n`
  );
}

/**
 * 估算 API 呼叫費用（USD，僅供參考）
 * 非 OpenAI 模型（Ollama / LM Studio 等）費用為 $0.00
 */
function estimateCost(model, promptTokens, completionTokens) {
  // 2025 年 OpenAI 定價（每 1M tokens 費用）
  const pricing = {
    'gpt-4o':             { input: 2.50,  output: 10.00 },
    'gpt-4o-mini':        { input: 0.15,  output: 0.60  },
    'gpt-4-turbo':        { input: 10.00, output: 30.00 },
    'gpt-3.5-turbo':      { input: 0.50,  output: 1.50  },
    // Groq（快速推理，超低成本）
    'llama-3.1-70b-versatile': { input: 0.059, output: 0.079 },
    'llama-3.1-8b-instant':    { input: 0.005, output: 0.008 },
    'mixtral-8x7b-32768':      { input: 0.024, output: 0.024 },
  };
  const p = pricing[model];
  if (!p) return 0; // 本地模型或未知模型 → 成本為 $0
  return (promptTokens * p.input + completionTokens * p.output) / 1_000_000;
}

/**
 * 安全解析 JSON（有些模型偶爾會在 JSON 外加 markdown code block）
 */
function safeParseJSON(text) {
  // 去除 ```json ... ``` 包裝
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(cleaned);
}

/**
 * 統一呼叫 OpenAI（相容）Chat API
 *
 * @param {object}  opts
 * @param {string}  opts.model        - 模型名稱（由呼叫方從 config 中取得）
 * @param {string}  opts.systemPrompt
 * @param {string}  opts.userMessage
 * @param {boolean} [opts.jsonMode]   - 是否要求 JSON 輸出（預設 true）
 * @param {number}  [opts.temperature]
 * @param {object}  [opts.config]     - 已取得的設定物件（避免呼叫方重複查 DB）
 */
async function callOpenAI({ model, systemPrompt, userMessage, jsonMode = true, temperature = 0.3, config = null }) {
  // config 可由呼叫方傳入（避免同一次請求重複查 DB）；若未傳入則自動取得
  const activeConfig = config ?? await getActiveConfig();
  const client       = _getClientForConfig(activeConfig);

  const response = await client.chat.completions.create({
    model,
    temperature,
    max_tokens:      activeConfig.maxTokens,
    response_format: jsonMode ? { type: 'json_object' } : undefined,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage },
    ],
  });

  return response;
}

// ════════════════════════════════════════════════════════════
// 功能一：任務拆解（Task Breakdown）
// ════════════════════════════════════════════════════════════

/**
 * Few-shot 範例：高品質任務拆解示範
 *
 * 設計說明：
 * - 提供 2 個不同領域的範例（網站 + App）
 * - 展示正確的 JSON 格式與欄位
 * - 範例工時設定在合理範圍（4 ~ 32 人時）
 * - 包含依賴關係（dependsOn）
 */
const TASK_BREAKDOWN_FEW_SHOT = `
以下是任務拆解的範例，請參考輸出格式（不要複製範例內容，要根據實際目標生成）：

---範例 1 輸入---
目標：「建立公司官網改版」
團隊：3 人（前端 2、後端 1）、時程 6 週

---範例 1 輸出---
{
  "summary": "將官網改版拆解為 9 個子任務，預計總工時 216 人時，建議 6 週完成。前 2 週專注需求與設計，後 4 週進入開發。",
  "totalEstimatedHours": 216,
  "suggestedDuration": "6 週",
  "assumptions": ["設計稿由外部設計師提供，開發前 1 週交付", "不包含 SEO 優化與多語言"],
  "tasks": [
    {
      "order": 1,
      "title": "需求訪談與資訊架構規劃",
      "description": "與各部門主管訪談，確認官網目標受眾、核心訊息、功能需求。輸出：需求規格書（Word）＋ Sitemap（Miro）",
      "estimatedHours": 16,
      "priority": "high",
      "phase": "需求分析",
      "dependsOn": [],
      "acceptanceCriteria": "PM 與客戶雙方簽署需求確認書",
      "skills": ["需求訪談", "資訊架構"]
    },
    {
      "order": 2,
      "title": "UI/UX 設計稿審查與前端規格確認",
      "description": "審查外部設計師交付的 Figma 設計稿，確認 RWD 斷點、設計系統（色票、字型）、動畫規格。輸出：前端開發規格書",
      "estimatedHours": 8,
      "priority": "high",
      "phase": "設計確認",
      "dependsOn": [1],
      "acceptanceCriteria": "前端工程師確認所有元件可實作，無技術疑慮",
      "skills": ["Figma", "前端規格"]
    },
    {
      "order": 3,
      "title": "前端框架建置與 Design System 實作",
      "description": "建立 Next.js 專案、設定 TailwindCSS、實作 Button / Card / Typography 等基礎元件。輸出：Storybook 元件庫",
      "estimatedHours": 24,
      "priority": "high",
      "phase": "前端開發",
      "dependsOn": [2],
      "acceptanceCriteria": "所有基礎元件通過 Storybook 視覺測試",
      "skills": ["Next.js", "TailwindCSS", "Storybook"]
    },
    {
      "order": 4,
      "title": "首頁與產品介紹頁前端切版",
      "description": "依設計稿實作首頁（Hero、服務介紹、客戶案例、CTA）與三個產品頁面。",
      "estimatedHours": 40,
      "priority": "high",
      "phase": "前端開發",
      "dependsOn": [3],
      "acceptanceCriteria": "Pixel-perfect 通過三個主流瀏覽器（Chrome / Safari / Edge）測試",
      "skills": ["Next.js", "CSS 切版"]
    },
    {
      "order": 5,
      "title": "聯絡表單後端 API 開發",
      "description": "開發聯絡我們表單的後端 API：資料驗證、儲存到 DB、發送確認信。技術：Node.js + Express + PostgreSQL",
      "estimatedHours": 24,
      "priority": "medium",
      "phase": "後端開發",
      "dependsOn": [1],
      "acceptanceCriteria": "Postman 測試通過，OWASP 基本安全掃描無高危漏洞",
      "skills": ["Node.js", "Express", "PostgreSQL"]
    },
    {
      "order": 6,
      "title": "CMS 內容管理後台建置",
      "description": "整合 Strapi 無頭 CMS，讓行銷人員可自行更新新聞、部落格、案例內容。",
      "estimatedHours": 32,
      "priority": "medium",
      "phase": "後端開發",
      "dependsOn": [1],
      "acceptanceCriteria": "行銷人員可在 30 分鐘內，在無工程師協助的情況下發布一篇文章",
      "skills": ["Strapi", "RESTful API"]
    },
    {
      "order": 7,
      "title": "前後端整合測試",
      "description": "整合聯絡表單、CMS 動態頁面，確認資料流正確。執行 E2E 測試（Playwright）。",
      "estimatedHours": 24,
      "priority": "high",
      "phase": "測試",
      "dependsOn": [4, 5, 6],
      "acceptanceCriteria": "Playwright E2E 測試通過率 100%，無 P0 / P1 Bug",
      "skills": ["Playwright", "E2E 測試"]
    },
    {
      "order": 8,
      "title": "效能優化與 Core Web Vitals 調校",
      "description": "使用 Lighthouse 分析，優化 LCP < 2.5s、FID < 100ms、CLS < 0.1。圖片 WebP 轉換、CDN 設定。",
      "estimatedHours": 16,
      "priority": "medium",
      "phase": "優化",
      "dependsOn": [7],
      "acceptanceCriteria": "Lighthouse 分數 Performance > 90、Accessibility > 90",
      "skills": ["效能優化", "CDN", "Lighthouse"]
    },
    {
      "order": 9,
      "title": "正式環境部署與上線前檢查",
      "description": "部署到正式伺服器（AWS / GCP），設定 SSL、Nginx、CI/CD 管道。執行上線前檢查清單。",
      "estimatedHours": 16,
      "priority": "urgent",
      "phase": "部署",
      "dependsOn": [8],
      "acceptanceCriteria": "SSL A 評級、所有連結正常、Google Analytics 資料正常收集",
      "skills": ["DevOps", "CI/CD", "Nginx"]
    }
  ]
}

---範例 2 輸入---
目標：「導入企業 ERP 採購模組」
團隊：5 人（SA 1、後端 2、前端 1、測試 1）、時程 12 週

---範例 2 輸出（精簡示意）---
{
  "summary": "採購模組拆解為 11 個任務，涵蓋需求、設計、開發、整合、上線五個階段。總工時 480 人時，12 週完成。",
  "totalEstimatedHours": 480,
  "suggestedDuration": "12 週",
  "assumptions": ["現有 ERP 提供 REST API 介面", "採購部門配合 UAT 的時間每週 4 小時"],
  "tasks": [
    {
      "order": 1,
      "title": "As-Is 採購流程訪談與 To-Be 設計",
      "description": "訪談採購部門，記錄現行流程（含例外情況），設計系統化的新流程。輸出：BPM 流程圖 + 使用者故事（User Stories）",
      "estimatedHours": 40,
      "priority": "high",
      "phase": "需求分析",
      "dependsOn": [],
      "acceptanceCriteria": "採購主管與 PM 確認流程設計無誤",
      "skills": ["需求訪談", "BPM", "User Story"]
    }
  ]
}
`;

/**
 * 任務拆解函式
 *
 * @param {string} projectGoal   - 專案目標或需求描述（中文）
 * @param {object} [options]     - 選項
 * @param {number} [options.teamSize]        - 團隊人數
 * @param {string} [options.techStack]       - 技術棧描述（e.g., "React + Node.js + PostgreSQL"）
 * @param {string} [options.duration]        - 目標時程（e.g., "8 週"）
 * @param {number} [options.taskCount]       - 期望拆解的任務數量（預設 8 ~ 12 個）
 * @param {string} [options.existingContext] - 現有系統或限制說明
 *
 * @returns {Promise<BreakdownResult>}
 * @typedef {object} BreakdownResult
 * @property {string}   summary              - 整體拆解摘要說明
 * @property {number}   totalEstimatedHours  - 總估算工時
 * @property {string}   suggestedDuration    - 建議時程
 * @property {string[]} assumptions          - 前提假設清單
 * @property {Task[]}   tasks                - 子任務清單
 * @property {object}   _meta                - API 用量記錄
 */
async function breakdownTask(projectGoal, options = {}) {
  const {
    teamSize        = null,
    techStack       = null,
    duration        = null,
    taskCount       = '8 ~ 12',
    existingContext = null,
    companyId,
  } = options;
  if (!companyId) throw new Error('breakdownTask: options.companyId 為必填');

  // 取得動態模型設定（DB → ENV 回退）
  const config = await getActiveConfig(companyId);

  // ── 動態建構 User Message ────────────────────────────────
  const contextLines = [];
  if (teamSize)        contextLines.push(`- 團隊規模：${teamSize} 人`);
  if (techStack)       contextLines.push(`- 技術棧：${techStack}`);
  if (duration)        contextLines.push(`- 目標時程：${duration}`);
  if (existingContext) contextLines.push(`- 現有系統與限制：${existingContext}`);

  const userMessage = `
${TASK_BREAKDOWN_FEW_SHOT}

---現在請根據以下目標進行拆解---
目標：「${projectGoal}」
${contextLines.length ? '\n專案背景：\n' + contextLines.join('\n') : ''}

請將上述目標拆解為 ${taskCount} 個子任務，以 JSON 格式回應，格式與範例完全一致。
確保每個任務的 estimatedHours 在 4 ~ 40 之間，超過 40 則繼續拆解成更小的任務。
特別注意台灣 IT 團隊常見的工作習慣與技術選擇。
`.trim();

  const response = await callOpenAI({
    model:        config.modelHeavy,
    config,                           // 傳入已取得的設定，避免重複查 DB
    systemPrompt: buildSystemPrompt('breakdown'),
    userMessage,
    jsonMode:     true,
    temperature:  0.4,   // 略高：任務拆解需要一些創意，但不能太發散
  });

  const raw    = response.choices[0].message.content;
  const result = safeParseJSON(raw);
  logUsage('breakdownTask', response.usage, config.modelHeavy);

  return {
    ...result,
    _meta: {
      model:            config.modelHeavy,
      promptTokens:     response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      generatedAt:      new Date().toISOString(),
    },
  };
}

// ════════════════════════════════════════════════════════════
// 功能二：風險分析（Risk Analysis）
// ════════════════════════════════════════════════════════════

/**
 * 風險分析函式
 *
 * @param {object} projectData         - 專案現況資料（來自資料庫查詢結果）
 * @param {string} projectData.name    - 專案名稱
 * @param {string} projectData.status  - 專案狀態
 * @param {Date}   projectData.endDate - 截止日期
 * @param {object} projectData.budget  - 預算資訊
 * @param {Task[]} projectData.tasks   - 任務清單（含狀態、逾期情況）
 * @param {object[]} projectData.milestones - 里程碑清單
 * @param {object[]} projectData.team  - 團隊成員工作量
 *
 * @returns {Promise<RiskReport>}
 * @typedef {object} RiskReport
 * @property {number}   riskScore       - 風險分數（0 ~ 100）
 * @property {string}   riskLevel       - 風險等級（low/medium/high/critical）
 * @property {string}   riskLevelLabel  - 中文風險等級
 * @property {string}   summary         - 整體風險摘要（1 ~ 2 句）
 * @property {object[]} factors         - 風險因素清單
 * @property {object[]} recommendations - 建議行動清單（依優先級排序）
 * @property {object}   _meta           - API 用量記錄
 */
async function analyzeRisk(projectData) {
  // 取得動態模型設定
  const config = await getActiveConfig(projectData.companyId ?? 1);

  // ── 計算客觀指標（減少 AI 幻覺，提供可信數據）───────────
  const now       = new Date();
  const tasks     = projectData.tasks || [];
  const total     = tasks.length;
  const done      = tasks.filter(t => t.status === 'done').length;
  const overdue   = tasks.filter(t =>
    t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now
  );
  const highPriorityOverdue = overdue.filter(t =>
    t.priority === 'urgent' || t.priority === 'high'
  );

  const completionPct = total > 0 ? Math.round((done / total) * 100) : 0;
  const overduePct    = total > 0 ? Math.round((overdue.length / total) * 100) : 0;

  const daysUntilEnd  = projectData.endDate
    ? Math.ceil((new Date(projectData.endDate) - now) / (1000 * 60 * 60 * 24))
    : null;

  const milestones         = projectData.milestones || [];
  const overdueMS          = milestones.filter(m => !m.isAchieved && m.dueDate && new Date(m.dueDate) < now);
  const msAchievementRate  = milestones.length
    ? Math.round((milestones.filter(m => m.isAchieved).length / milestones.length) * 100)
    : null;

  // ── 建構 User Message ────────────────────────────────────
  const userMessage = `
請分析以下專案的風險狀況，以 JSON 格式輸出詳細的風險報告。

【專案基本資訊】
- 名稱：${projectData.name}
- 狀態：${projectData.status}
- 截止日期：${projectData.endDate ? new Date(projectData.endDate).toLocaleDateString('zh-TW') : '未設定'}
- 距截止日：${daysUntilEnd !== null ? `${daysUntilEnd} 天` : '未設定'}
- 預算：${projectData.budget ? `NT$ ${Number(projectData.budget).toLocaleString()}` : '未設定'}

【任務現況（客觀數據）】
- 總任務數：${total} 個
- 完成任務：${done} 個（完成率 ${completionPct}%）
- 逾期任務：${overdue.length} 個（逾期率 ${overduePct}%）
- 高優先級逾期任務：${highPriorityOverdue.length} 個
- 最嚴重逾期任務：${overdue.slice(0, 3).map(t =>
    `「${t.title}」逾期 ${Math.floor((now - new Date(t.dueDate)) / 86400000)} 天`
  ).join('、') || '無'}

【里程碑狀況】
- 里程碑總數：${milestones.length} 個
- 逾期里程碑：${overdueMS.length} 個
- 里程碑達成率：${msAchievementRate !== null ? `${msAchievementRate}%` : '無里程碑'}

【團隊負載】
${projectData.team ? projectData.team.map(m =>
    `- ${m.name}：負責 ${m.taskCount || 0} 個任務，逾期 ${m.overdueCount || 0} 個`
  ).join('\n') : '（未提供）'}

---
請以下列 JSON 格式輸出風險報告（必須嚴格遵守，不要改變欄位名稱）：
{
  "riskScore": <0-100 的整數>,
  "riskLevel": "<low|medium|high|critical>",
  "riskLevelLabel": "<低風險|中風險|高風險|極高風險>",
  "summary": "<1~2 句的整體風險摘要>",
  "factors": [
    {
      "category": "<schedule|resource|quality|communication|technical>",
      "categoryLabel": "<進度|資源|品質|溝通|技術>",
      "severity": "<low|medium|high|critical>",
      "title": "<風險因素標題>",
      "description": "<具體說明，引用數據>",
      "impact": "<如果不處理，可能造成的後果>"
    }
  ],
  "recommendations": [
    {
      "priority": <1 為最優先>,
      "action": "<具體行動（動詞開頭）>",
      "owner": "<建議由誰負責：PM/工程師/主管>",
      "timeline": "<建議何時完成：例「本週五前」>",
      "expectedOutcome": "<預期效果>"
    }
  ],
  "positives": ["<目前做得好的地方，至少 1 點>"]
}
`.trim();

  const response = await callOpenAI({
    model:        config.modelHeavy,
    config,
    systemPrompt: buildSystemPrompt('risk'),
    userMessage,
    jsonMode:     true,
    temperature:  0.2,   // 低溫：風險分析要精確，不能太發散
  });

  const raw    = response.choices[0].message.content;
  const result = safeParseJSON(raw);
  logUsage('analyzeRisk', response.usage, config.modelHeavy);

  return {
    ...result,
    _meta: {
      model:            config.modelHeavy,
      analyzedAt:       new Date().toISOString(),
      projectId:        projectData.id,
      promptTokens:     response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      // 附上計算好的客觀指標（前端可直接使用，不需重算）
      metrics: { total, done, completionPct, overdueCount: overdue.length, overduePct, daysUntilEnd },
    },
  };
}

// ════════════════════════════════════════════════════════════
// 功能三：週報生成（Weekly Report Generation）
// ════════════════════════════════════════════════════════════

/**
 * 週報生成函式
 *
 * @param {object}   reportData
 * @param {string}   reportData.projectName       - 專案名稱
 * @param {string}   reportData.weekRange          - 週報時間範圍（e.g., "2026/03/04 ~ 2026/03/10"）
 * @param {Task[]}   reportData.completedThisWeek  - 本週完成的任務
 * @param {Task[]}   reportData.inProgress         - 進行中的任務
 * @param {Task[]}   reportData.blocked            - 被阻擋的任務（及阻擋原因）
 * @param {number}   reportData.totalHoursLogged   - 本週記錄工時
 * @param {string[]} [reportData.highlights]       - 本週亮點（由 PM 補充）
 * @param {string[]} [reportData.nextWeekPlan]      - 下週計劃（由 PM 補充）
 * @param {string}   [reportData.audience]         - 閱讀對象（default: "主管"）
 * @param {string}   [reportData.style]            - 語氣風格（formal|casual，default: "formal"）
 *
 * @returns {Promise<WeeklyReportResult>}
 * @typedef {object} WeeklyReportResult
 * @property {string} reportMarkdown  - Markdown 格式的週報全文
 * @property {string} reportPlainText - 純文字版本（適合貼到 email）
 * @property {string} subjectLine     - 建議的 Email 主旨
 * @property {object} _meta           - API 用量記錄
 */
async function generateWeeklyReport(reportData) {
  const {
    projectName       = '未命名專案',
    weekRange         = '本週',
    completedThisWeek = [],
    inProgress        = [],
    blocked           = [],
    totalHoursLogged  = 0,
    highlights        = [],
    nextWeekPlan      = [],
    audience          = '主管',
    style             = 'formal',
    companyId,
  } = reportData;
  if (!companyId) throw new Error('generateWeeklyReport: companyId 為必填');

  // 取得動態模型設定
  const config = await getActiveConfig(companyId);

  // ── 整理任務資料為可讀格式 ───────────────────────────────
  const formatTask = t =>
    `  - ${t.title}${t.assignee ? `（負責：${t.assignee}）` : ''}${t.dueDate ? `，截止 ${t.dueDate}` : ''}`;

  const completedStr = completedThisWeek.length
    ? completedThisWeek.map(formatTask).join('\n')
    : '  （本週無任務完成）';

  const inProgressStr = inProgress.length
    ? inProgress.map(t =>
        `  - ${t.title}（進度 ${t.progress ?? '進行中'}${t.assignee ? `，負責：${t.assignee}` : ''}）`
      ).join('\n')
    : '  （無）';

  const blockedStr = blocked.length
    ? blocked.map(t =>
        `  - ${t.title}：阻礙原因 ── ${t.blockReason || '待確認'}`
      ).join('\n')
    : '  （本週無阻礙事項）';

  const userMessage = `
請根據以下數據，生成一份週報。

【週報基本資訊】
- 專案名稱：${projectName}
- 時間範圍：${weekRange}
- 閱讀對象：${audience}
- 語氣風格：${style === 'casual' ? '輕鬆友善' : '正式專業'}
- 本週記錄工時：${totalHoursLogged} 人時

【本週完成的任務（${completedThisWeek.length} 個）】
${completedStr}

【進行中的任務（${inProgress.length} 個）】
${inProgressStr}

【本週阻礙事項】
${blockedStr}

【本週亮點（PM 補充）】
${highlights.length ? highlights.map(h => `  - ${h}`).join('\n') : '  （無特別亮點）'}

【下週計劃（PM 補充）】
${nextWeekPlan.length ? nextWeekPlan.map(p => `  - ${p}`).join('\n') : '  （待規劃）'}

---
請以 JSON 格式輸出，包含三個欄位：
{
  "subjectLine": "<Email 主旨，格式：「[週報] 專案名稱 YYYY/MM/DD 週」>",
  "reportMarkdown": "<Markdown 格式的完整週報>",
  "reportPlainText": "<純文字版本，適合貼到 Outlook 或 Line，不使用 Markdown 語法>"
}

週報必須包含：整體摘要、本週成果、進行中項目、阻礙事項（若無則省略）、下週計劃、需要主管協助的事項。
`.trim();

  const response = await callOpenAI({
    model:        config.modelLight,    // 週報生成用較便宜的 light 模型
    config,
    systemPrompt: buildSystemPrompt('report'),
    userMessage,
    jsonMode:     true,
    temperature:  0.5,   // 略高：週報需要自然的文字表達
  });

  const raw    = response.choices[0].message.content;
  const result = safeParseJSON(raw);
  logUsage('generateWeeklyReport', response.usage, config.modelLight);

  return {
    ...result,
    _meta: {
      model:            config.modelLight,
      generatedAt:      new Date().toISOString(),
      promptTokens:     response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
    },
  };
}

// ════════════════════════════════════════════════════════════
// 功能四（補充）：健康度評分（Health Score）
// ════════════════════════════════════════════════════════════

/**
 * 專案健康度評分（快速版，給 MCP Server 用）
 *
 * 不呼叫 AI，使用純數學公式計算，回應更快且可預測。
 * 當需要深度 AI 解讀時，使用 analyzeRisk() 取代。
 *
 * @param {object} projectData - 專案資料
 * @returns {{ score: number, level: string, levelLabel: string, breakdown: object }}
 */
function computeHealthScore(projectData) {
  const now   = new Date();
  const tasks = projectData.tasks || [];
  const total = tasks.length;

  if (total === 0) {
    return { score: 50, level: 'medium', levelLabel: '中風險（無任務資料）', breakdown: {} };
  }

  const done     = tasks.filter(t => t.status === 'done').length;
  const overdue  = tasks.filter(t =>
    t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now
  ).length;
  const urgent   = tasks.filter(t =>
    t.priority === 'urgent' && t.status !== 'done'
  ).length;

  const completionPct = (done / total) * 100;
  const overduePct    = (overdue / total) * 100;

  // 健康度評分公式（0 ~ 100，越高越健康）
  let score = 100;
  score -= overduePct * 1.5;       // 逾期率懲罰（最多 -100 × 1.5 倒置）
  score -= urgent * 5;              // 每個緊急未完成任務扣 5 分
  score += completionPct * 0.2;    // 完成率加分

  // 時程壓力
  if (projectData.endDate) {
    const daysLeft = (new Date(projectData.endDate) - now) / (1000 * 60 * 60 * 24);
    if (daysLeft < 7 && completionPct < 90)  score -= 20;
    else if (daysLeft < 14 && completionPct < 70) score -= 10;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const level      = score >= 70 ? 'low'      : score >= 40 ? 'medium'   : score >= 20 ? 'high' : 'critical';
  const levelLabel = score >= 70 ? '健康（低風險）' : score >= 40 ? '需注意（中風險）' : score >= 20 ? '有問題（高風險）' : '危險（極高風險）';

  return {
    score,
    level,
    levelLabel,
    breakdown: { completionPct: Math.round(completionPct), overduePct: Math.round(overduePct), overdueCount: overdue, urgentCount: urgent },
  };
}

// ════════════════════════════════════════════════════════════
// 功能五（補充）：重新排程建議（Schedule Optimizer）
// ════════════════════════════════════════════════════════════

/**
 * 排程優化建議
 *
 * 分析任務的截止日、優先級、負責人工作量，
 * 給出重新排程的具體建議（不會自動修改資料庫）。
 *
 * @param {object}   projectData
 * @param {Task[]}   projectData.tasks   - 任務清單（含 dueDate、priority、assignee）
 * @param {object[]} projectData.team    - 成員可用工時 { userId, name, availableHours }
 * @param {Date}     projectData.endDate - 專案截止日
 *
 * @returns {Promise<ScheduleOptimization>}
 */
async function optimizeSchedule(projectData) {
  // 取得動態模型設定
  const config = await getActiveConfig(projectData.companyId ?? 1);

  const tasks   = (projectData.tasks || []).filter(t => t.status !== 'done');
  const endDate = projectData.endDate;
  const now     = new Date();

  const taskList = tasks.map(t => ({
    id:             t.id,
    title:          t.title,
    priority:       t.priority,
    estimatedHours: t.estimatedHours || null,
    dueDate:        t.dueDate ? new Date(t.dueDate).toLocaleDateString('zh-TW') : '未設定',
    assignee:       t.assignee?.name || '未指派',
    isOverdue:      t.dueDate && new Date(t.dueDate) < now,
  }));

  const userMessage = `
請分析以下專案的任務排程，給出優化建議。

【專案截止日】${endDate ? new Date(endDate).toLocaleDateString('zh-TW') : '未設定'}

【未完成任務清單】
${JSON.stringify(taskList, null, 2)}

【團隊可用工時（本週）】
${projectData.team
    ? projectData.team.map(m => `- ${m.name}：每週可用 ${m.availableHours ?? 40} 人時`).join('\n')
    : '（未提供，請假設每人每週 40 人時）'}

請以 JSON 格式輸出排程優化報告：
{
  "summary": "<整體排程評估，1 ~ 2 句>",
  "criticalPath": ["<關鍵路徑上的任務標題，依序列出>"],
  "suggestions": [
    {
      "taskTitle": "<任務標題>",
      "currentDueDate": "<現在截止日>",
      "suggestedDueDate": "<建議調整後截止日>",
      "reason": "<調整原因>",
      "action": "<建議行動：延後/提前/重新指派/拆分>",
      "suggestedAssignee": "<若需重新指派，建議誰接手>"
    }
  ],
  "workloadRebalancing": [
    {
      "member": "<成員名稱>",
      "currentLoad": "<目前任務數>",
      "suggestion": "<具體建議>"
    }
  ],
  "feasibility": "<在現有資源下，專案能否如期完成？brief 評估>"
}
`.trim();

  const response = await callOpenAI({
    model:        config.modelHeavy,
    config,
    systemPrompt: buildSystemPrompt('risk'),
    userMessage,
    jsonMode:     true,
    temperature:  0.2,
  });

  const raw    = response.choices[0].message.content;
  const result = safeParseJSON(raw);
  logUsage('optimizeSchedule', response.usage, config.modelHeavy);

  return {
    ...result,
    _meta: {
      model:            config.modelHeavy,
      analyzedAt:       new Date().toISOString(),
      promptTokens:     response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
    },
  };
}

// ════════════════════════════════════════════════════════════
// 匯出
// ════════════════════════════════════════════════════════════

module.exports = {
  breakdownTask,
  analyzeRisk,
  generateWeeklyReport,
  optimizeSchedule,
  computeHealthScore,         // 同步版本，不呼叫 AI

  // 設定管理
  invalidateConfigCache,      // 模型設定更新後呼叫，清除 30s 快取

  // 供測試使用
  _buildSystemPrompt: buildSystemPrompt,
  _estimateCost:      estimateCost,
};
