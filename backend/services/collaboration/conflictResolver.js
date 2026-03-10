'use strict';

/**
 * services/collaboration/conflictResolver.js
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS — AI 語義衝突偵測器（即時協作 AI 助理）
 *
 * 功能說明：
 *   在 Yjs 即時協作中，當多人同時編輯任務描述時，
 *   偵測文字內容與任務元資料（截止日期、優先級）之間的語義矛盾，
 *   並提供具體的改善建議。
 *
 * 設計原則：
 *   - 使用 gpt-4o-mini（成本最佳化，適合高頻即時呼叫）
 *   - JSON mode 確保輸出結構化（不需要 regex 解析）
 *   - 輸入長度截斷（最多 800 字），控制 token 用量
 *   - 回傳 null 表示「無需建議」，避免打擾正在輸入的用戶
 *
 * 被 yjsServer.js 以延遲載入（lazy require）方式引入：
 *   const resolver = require('./conflictResolver');
 *   await resolver.analyzeContent({ taskTitle, taskDueDate, projectName, currentText });
 *
 * 回傳格式：
 *   成功 → { text: string, type: 'schedule'|'resource'|'quality'|'general', severity: 'info'|'warning'|'error' }
 *   無建議 → null
 *
 * 環境變數：
 *   OPENAI_API_KEY  — 必填（在 yjsServer.js 中已確認存在才載入本模組）
 *   OPENAI_ORG_ID   — 選填
 */

const OpenAI = require('openai');

// ── OpenAI 客戶端初始化 ──────────────────────────────────────
const openai = new OpenAI({
  apiKey:       process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID || undefined,
});

// ── 常數設定 ─────────────────────────────────────────────────
const MODEL               = 'gpt-4o-mini';      // 成本最佳化（即時場景）
const MAX_CONTENT_CHARS   = 800;                 // 截斷過長文字，控制 token
const REQUEST_TIMEOUT_MS  = 8_000;              // 8 秒逾時（協作場景不能久等）

// ── System Prompt ─────────────────────────────────────────────
const SYSTEM_PROMPT = `你是一位資深的台灣 IT 專案管理顧問，擅長偵測任務描述中的潛在問題。

你的職責：分析任務描述文字，找出以下類型的問題：

【類型說明】
1. schedule（時程衝突）：描述提到的日期/時間與任務截止日矛盾，或時程明顯不合理
2. resource（資源衝突）：需要的人力、設備、外部服務存在明顯限制或未定義
3. quality（品質問題）：描述過於模糊、缺少驗收標準、沒有具體可交付成果
4. general（一般建議）：其他可改善的地方（過長、格式混亂、缺少關鍵資訊）

【輸出規則】
- 若發現問題，輸出 JSON：{"hasSuggestion": true, "text": "建議文字", "type": "...", "severity": "info|warning|error"}
- 若無明顯問題，輸出 JSON：{"hasSuggestion": false}
- 建議文字需具體、可執行，用繁體中文，50 字以內
- 嚴重性：error（會影響交付）、warning（建議修正）、info（優化建議）
- 只在有把握時才給建議，不確定請輸出 {"hasSuggestion": false}`;

// ════════════════════════════════════════════════════════════
// 主要匯出函式
// ════════════════════════════════════════════════════════════

/**
 * 分析任務描述文字，偵測語義衝突或品質問題
 *
 * @param {Object} params
 * @param {string}      params.taskTitle    任務標題
 * @param {Date|null}   params.taskDueDate  任務截止日期
 * @param {string|null} params.projectName  所屬專案名稱
 * @param {string}      params.currentText  當前編輯中的文字
 *
 * @returns {Promise<{text:string, type:string, severity:string}|null>}
 */
async function analyzeContent({ taskTitle, taskDueDate, projectName, currentText }) {
  // ── 基本驗證 ─────────────────────────────────────────────
  if (!currentText || currentText.trim().length < 30) return null;

  // ── 準備上下文資訊 ────────────────────────────────────────
  const truncated  = currentText.slice(0, MAX_CONTENT_CHARS);
  const dueDateStr = taskDueDate
    ? formatDate(taskDueDate)
    : '未設定';
  const today = formatDate(new Date());

  const userPrompt = buildUserPrompt({
    taskTitle:   taskTitle   || '（未命名任務）',
    projectName: projectName || '（未知專案）',
    dueDateStr,
    today,
    content:     truncated,
    truncated:   currentText.length > MAX_CONTENT_CHARS,
  });

  // ── 呼叫 OpenAI（帶逾時）────────────────────────────────
  let raw;
  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await openai.chat.completions.create({
      model:           MODEL,
      temperature:     0.1,    // 低溫：分析類任務需要穩定輸出
      max_tokens:      150,    // 簡短建議即可
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt    },
      ],
    }, { signal: controller.signal });

    clearTimeout(timeoutId);
    raw = response.choices[0]?.message?.content;

    // 記錄 token 用量（監控成本）
    const usage = response.usage;
    if (usage) {
      process.stderr.write(
        `[ConflictResolver] token 用量: ${usage.prompt_tokens}+${usage.completion_tokens}=${usage.total_tokens}\n`
      );
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      process.stderr.write('[ConflictResolver] ⏱️ AI 分析逾時（8 秒），跳過本次建議\n');
    } else {
      process.stderr.write(`[ConflictResolver] ❌ OpenAI 呼叫失敗: ${err.message}\n`);
    }
    return null;
  }

  // ── 解析 JSON 回應 ────────────────────────────────────────
  return parseResponse(raw);
}

// ════════════════════════════════════════════════════════════
// 輔助函式（內部使用）
// ════════════════════════════════════════════════════════════

/**
 * 組合給 AI 的用戶提示（結構化上下文）
 */
function buildUserPrompt({ taskTitle, projectName, dueDateStr, today, content, truncated }) {
  return [
    `【任務資訊】`,
    `標題：${taskTitle}`,
    `專案：${projectName}`,
    `截止日：${dueDateStr}`,
    `今日：${today}`,
    ``,
    `【任務描述（當前版本${truncated ? '，已截斷顯示前 800 字' : ''}）】`,
    content,
    ``,
    `請分析此任務描述，若有問題請給出建議。`,
  ].join('\n');
}

/**
 * 解析 OpenAI JSON 回應
 * @param {string|undefined} raw
 * @returns {{ text:string, type:string, severity:string }|null}
 */
function parseResponse(raw) {
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    process.stderr.write(`[ConflictResolver] ⚠️ 無法解析 AI 回應（非 JSON）: ${raw.slice(0, 100)}\n`);
    return null;
  }

  // 無建議
  if (!parsed.hasSuggestion) return null;

  // 驗證欄位
  const { text, type, severity } = parsed;

  if (!text || typeof text !== 'string' || text.trim().length === 0) return null;

  const validTypes     = ['schedule', 'resource', 'quality', 'general'];
  const validSeverities = ['info', 'warning', 'error'];

  return {
    text:     text.trim().slice(0, 200),   // 限制建議文字長度
    type:     validTypes.includes(type)      ? type     : 'general',
    severity: validSeverities.includes(severity) ? severity : 'info',
  };
}

/**
 * 格式化日期為 YYYY-MM-DD（台灣慣用格式）
 * @param {Date} date
 */
function formatDate(date) {
  try {
    return new Date(date).toLocaleDateString('zh-TW', {
      year:  'numeric',
      month: '2-digit',
      day:   '2-digit',
      timeZone: 'Asia/Taipei',
    }).replace(/\//g, '-');
  } catch {
    return String(date);
  }
}

// ════════════════════════════════════════════════════════════
// 模組匯出
// ════════════════════════════════════════════════════════════

module.exports = {
  analyzeContent,

  // 方便測試用（可單獨測試 parseResponse）
  _parseResponse: parseResponse,
};
