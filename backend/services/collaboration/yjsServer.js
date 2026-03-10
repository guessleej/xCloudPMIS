#!/usr/bin/env node
/**
 * services/collaboration/yjsServer.js
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS — Yjs 即時協作 WebSocket 伺服器
 *
 * 技術選型說明：
 *   Hocuspocus（@hocuspocus/server）= 建立在 Yjs 之上的 WebSocket 伺服器
 *   - 實作 y-websocket 協定，前端用標準 y-websocket provider 連接
 *   - 內建 Auth Hook、Load/Save Hook、Awareness
 *   - 比自己實作 ws + Yjs 協定省 80% 的程式碼
 *
 * 狀態持久化策略（個人開發者最佳化）：
 *   Layer 1 - Redis：Yjs 二進位狀態（快速重連，TTL 7 天）
 *   Layer 2 - PostgreSQL：純文字描述（API 讀取，永久儲存）
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  Client A                   Client B                   │
 *   │    │                            │                      │
 *   │    └──── WebSocket ────────────┘                       │
 *   │                    │                                   │
 *   │          Hocuspocus Server (port 1234)                 │
 *   │         ┌──────────────────────┐                       │
 *   │         │  onAuthenticate      │  ← 驗證 JWT           │
 *   │         │  onLoadDocument      │  ← 從 Redis 載入       │
 *   │         │  onChange (debounce) │  ← 儲存到 Redis + PG  │
 *   │         │  AI suggestion hook  │  ← 每 5 秒分析一次     │
 *   │         └──────────────────────┘                       │
 *   └──────────────────────────────────────────────────────────┘
 *
 * 啟動方式：
 *   node services/collaboration/yjsServer.js    （直接執行）
 *   docker-compose up collaboration             （Docker）
 *
 * 環境變數（繼承自 .env）：
 *   COLLAB_PORT      — WebSocket 監聽埠（預設 1234）
 *   DATABASE_URL     — PostgreSQL 連線字串
 *   REDIS_HOST/PORT/PASSWORD — Redis 連線設定
 *   JWT_SECRET       — JWT 驗證金鑰
 *   OPENAI_API_KEY   — AI 建議功能（可選，未設定則跳過 AI）
 */

'use strict';

const path = require('path');
// 環境變數載入（支援多種執行路徑）
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { Hocuspocus } = require('@hocuspocus/server');
const { PrismaClient }        = require('@prisma/client');
const { createClient }        = require('redis');
const jwt                     = require('jsonwebtoken');
const Y                       = require('yjs');

// ── 資料庫初始化 ────────────────────────────────────────────
const prisma = new PrismaClient({ log: ['error'] });

// ── Redis 客戶端（用於 Yjs 狀態快取）──────────────────────
const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT)  || 6379,
  },
  password: process.env.REDIS_PASSWORD || undefined,
});

redisClient.on('error', err => process.stderr.write(`[Collab] Redis 錯誤: ${err.message}\n`));

// ── AI 衝突解析器（延遲載入，只有設定了 OPENAI_API_KEY 才啟用）──
let _conflictResolver = null;
function getConflictResolver() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!_conflictResolver) {
    try {
      _conflictResolver = require('./conflictResolver');
    } catch {
      // AI 功能可選，載入失敗不影響協作
    }
  }
  return _conflictResolver;
}

// ════════════════════════════════════════════════════════════
// 工具函式
// ════════════════════════════════════════════════════════════

/** 依 userId 確定性生成用戶顏色（同一用戶每次顏色相同）*/
function getUserColor(userId) {
  const palette = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F0A500', '#2ECC71', '#E74C3C', '#9B59B6', '#3498DB',
  ];
  return palette[((userId || 1) - 1) % palette.length];
}

/**
 * 從 Yjs XmlFragment 提取純文字（用於儲存到 PostgreSQL）
 * Tiptap 的文件結構：XmlFragment > XmlElement (paragraph) > XmlText
 */
function extractPlainText(xmlFragment) {
  let text = '';
  const recurse = (node) => {
    if (node instanceof Y.XmlText) {
      text += node.toString();
    } else if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
      // 段落類元素加換行
      const isBlock = node instanceof Y.XmlElement &&
        ['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock'].includes(node.nodeName);
      node.forEach(child => recurse(child));
      if (isBlock) text += '\n';
    }
  };
  recurse(xmlFragment);
  return text.trim();
}

/** 計算兩個字串的相似度（用於判斷是否值得呼叫 AI）*/
function similarity(a, b) {
  if (!a || !b) return 0;
  const longer  = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  const editDistance = levenshtein(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshtein(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? dp[j - 1] : Math.min(dp[j - 1], prev, dp[j]) + 1;
      prev = temp;
    }
  }
  return dp[b.length];
}

// ════════════════════════════════════════════════════════════
// 防抖：儲存到 PostgreSQL
// ════════════════════════════════════════════════════════════

/** 每個 document 獨立的防抖計時器（避免高頻寫入 DB）*/
const _saveTimers = new Map();

function debouncedSaveToDb(docName, plainText, delayMs = 2000) {
  if (_saveTimers.has(docName)) clearTimeout(_saveTimers.get(docName));
  _saveTimers.set(docName, setTimeout(async () => {
    _saveTimers.delete(docName);
    const taskId = parseInt(docName.replace('task:', ''));
    if (isNaN(taskId) || plainText.length === 0) return;

    try {
      await prisma.task.update({
        where: { id: taskId },
        data:  { description: plainText, updatedAt: new Date() },
      });
      process.stderr.write(`[Collab] ✅ 已儲存任務 #${taskId} 描述（${plainText.length} 字）\n`);
    } catch (err) {
      process.stderr.write(`[Collab] ❌ 儲存任務 #${taskId} 失敗: ${err.message}\n`);
    }
  }, delayMs));
}

// ════════════════════════════════════════════════════════════
// AI 建議節流（每份文件每 10 秒最多呼叫 AI 一次）
// ════════════════════════════════════════════════════════════

const _aiThrottleMap = new Map();   // docName → lastCallTime
const _prevContentMap = new Map();  // docName → previousContent

function shouldCallAI(docName, currentContent) {
  if (!getConflictResolver()) return false;
  if (currentContent.length < 30) return false;  // 太短不分析

  const lastCall  = _aiThrottleMap.get(docName) || 0;
  const prevText  = _prevContentMap.get(docName) || '';
  const elapsed   = Date.now() - lastCall;
  const sim       = similarity(prevText, currentContent);

  // 節流：10 秒內不重複分析 + 相似度 > 90% 不重複分析（幾乎沒變化）
  return elapsed > 10_000 && sim < 0.90;
}

async function triggerAiSuggestion(document, docName, plainText) {
  const resolver = getConflictResolver();
  if (!resolver) return;

  _aiThrottleMap.set(docName, Date.now());
  _prevContentMap.set(docName, plainText);

  try {
    const taskId   = parseInt(docName.replace('task:', ''));
    const task     = await prisma.task.findFirst({
      where:   { id: taskId, deletedAt: null },
      include: { project: { select: { name: true, endDate: true } } },
      select:  { title: true, dueDate: true, priority: true, project: true, assignee: true },
    });

    const suggestion = await resolver.analyzeContent({
      taskTitle:   task?.title || '未知任務',
      taskDueDate: task?.dueDate,
      projectName: task?.project?.name,
      currentText: plainText,
    });

    if (!suggestion) return;

    // 透過 Yjs 共享 Map 推播 AI 建議（與 Yjs sync 機制整合，零額外 code）
    const yAI = document.getMap('ai_suggestions');
    yAI.set('latest', {
      text:      suggestion.text,
      type:      suggestion.type,       // 'schedule' | 'resource' | 'quality' | 'general'
      severity:  suggestion.severity,   // 'info' | 'warning' | 'error'
      timestamp: Date.now(),
    });

    process.stderr.write(`[Collab AI] 📝 對任務 #${taskId} 推播建議：${suggestion.type}\n`);
  } catch (err) {
    process.stderr.write(`[Collab AI] ⚠️ AI 建議失敗（不影響協作）: ${err.message}\n`);
  }
}

// ════════════════════════════════════════════════════════════
// Hocuspocus 伺服器設定
// ════════════════════════════════════════════════════════════

const server = new Hocuspocus({
  port: parseInt(process.env.COLLAB_PORT) || 1234,

  // ── 心跳機制（偵測斷線用戶）────────────────────────────
  timeout: 30_000,   // 30 秒無心跳則斷線

  // ─────────────────────────────────────────────────────────
  // Hook 1：JWT 身份驗證
  //
  // 前端連線時須在 URL query 帶 token：
  //   ws://localhost:1234/task-42?token=eyJhbGci...
  //
  // 驗證成功後，回傳 user 物件，可在後續 hooks 透過 data.context 存取
  // ─────────────────────────────────────────────────────────
  async onAuthenticate(data) {
    // Hocuspocus 從 URL query 取得 token（或從 header）
    const token = data.token || new URL(`ws://localhost${data.requestHeaders?.path || ''}`).searchParams.get('token');

    if (!token) {
      // 開發模式：允許匿名連線（production 應拋出錯誤）
      if (process.env.NODE_ENV === 'production') {
        throw new Error('401: 需要提供 JWT Token');
      }
      // 開發模式返回測試用戶
      return { user: { id: 1, name: '測試用戶', color: getUserColor(1) } };
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key');
      return {
        user: {
          id:    payload.userId || payload.id || 1,
          name:  payload.name   || payload.username || '用戶',
          color: getUserColor(payload.userId || payload.id || 1),
        },
      };
    } catch {
      throw new Error('401: Token 無效或已過期');
    }
  },

  // ─────────────────────────────────────────────────────────
  // Hook 2：載入文件
  //
  // 第一個用戶連入某 document 時觸發。
  // 載入順序：
  //   ① 嘗試從 Redis 載入 Yjs 二進位狀態（快速）
  //   ② Redis 沒有 → 從 PostgreSQL 載入 Task.description
  //      並建立初始 Yjs 狀態
  // ─────────────────────────────────────────────────────────
  async onLoadDocument(data) {
    const { documentName, document } = data;
    const taskId = parseInt(documentName.replace('task:', ''));
    if (isNaN(taskId)) return;

    // ── 嘗試從 Redis 載入 Yjs 二進位狀態 ─────────────────
    const redisKey = `yjs:${documentName}`;
    try {
      const cached = await redisClient.get(redisKey);
      if (cached) {
        const state = Buffer.from(cached, 'base64');
        Y.applyUpdate(document, state);
        process.stderr.write(`[Collab] 📦 從 Redis 載入文件 ${documentName}（${state.length} bytes）\n`);
        return;  // 快取命中，不需要查 DB
      }
    } catch (err) {
      process.stderr.write(`[Collab] ⚠️ Redis 讀取失敗（降級到 DB）: ${err.message}\n`);
    }

    // ── 從 PostgreSQL 載入 Task 資料 ──────────────────────
    try {
      const task = await prisma.task.findFirst({
        where:   { id: taskId, deletedAt: null },
        select:  { title: true, description: true, dueDate: true, priority: true },
      });

      if (!task) {
        process.stderr.write(`[Collab] ⚠️ 找不到任務 #${taskId}\n`);
        return;
      }

      // 初始化 Yjs 文件（Tiptap 使用 XmlFragment 'default'）
      // 注意：只有 document 是空的時候才初始化，避免覆蓋協作中的內容
      const yText = document.getXmlFragment('default');
      if (yText.length === 0 && task.description) {
        // 將現有描述轉為 Tiptap 格式（段落包裝）
        const paragraph = new Y.XmlElement('paragraph');
        const text      = new Y.XmlText(task.description);
        paragraph.insert(0, [text]);
        yText.insert(0, [paragraph]);
      }

      // 在 Yjs 共享 Map 存放任務元資料（前端可讀取）
      const yMeta = document.getMap('task_meta');
      yMeta.set('taskId', taskId);
      yMeta.set('title',  task.title);
      yMeta.set('dueDate', task.dueDate?.toISOString() || null);
      yMeta.set('priority', task.priority);

      process.stderr.write(`[Collab] 📋 從資料庫載入任務 #${taskId}：${task.title}\n`);
    } catch (err) {
      process.stderr.write(`[Collab] ❌ 載入任務 #${taskId} 失敗: ${err.message}\n`);
    }
  },

  // ─────────────────────────────────────────────────────────
  // Hook 3：文件變更（任何客戶端的 Yjs 操作都會觸發）
  //
  // 兩件事：
  //   ① 儲存 Yjs 二進位狀態到 Redis（即時，用於快速重連）
  //   ② Debounced 儲存純文字到 PostgreSQL（2 秒後）
  //   ③ 節流呼叫 AI 分析（10 秒冷卻）
  // ─────────────────────────────────────────────────────────
  async onChange(data) {
    const { documentName, document } = data;

    // ── 儲存 Yjs 狀態到 Redis ──────────────────────────────
    try {
      const state  = Y.encodeStateAsUpdate(document);
      const b64    = Buffer.from(state).toString('base64');
      await redisClient.set(`yjs:${documentName}`, b64, { EX: 7 * 24 * 3600 }); // TTL 7 天
    } catch (err) {
      process.stderr.write(`[Collab] ⚠️ Redis 寫入失敗: ${err.message}\n`);
    }

    // ── 提取純文字並 Debounced 儲存到 PostgreSQL ───────────
    const yFragment = document.getXmlFragment('default');
    const plainText = extractPlainText(yFragment);

    if (plainText.length > 0) {
      debouncedSaveToDb(documentName, plainText, 2000);

      // ── AI 建議（節流觸發）────────────────────────────────
      if (shouldCallAI(documentName, plainText)) {
        // 非同步呼叫，不阻塞 onChange
        triggerAiSuggestion(document, documentName, plainText).catch(() => {});
      }
    }
  },

  // ─────────────────────────────────────────────────────────
  // Hook 4：用戶連線
  // ─────────────────────────────────────────────────────────
  async onConnect(data) {
    const user = data.context?.user;
    process.stderr.write(
      `[Collab] 🟢 ${user?.name || '匿名用戶'} 連入 ${data.documentName}（共享 doc）\n`
    );
  },

  // ─────────────────────────────────────────────────────────
  // Hook 5：用戶斷線
  // ─────────────────────────────────────────────────────────
  async onDisconnect(data) {
    const user = data.context?.user;
    process.stderr.write(
      `[Collab] 🔴 ${user?.name || '匿名用戶'} 離開 ${data.documentName}\n`
    );
  },
});

// ════════════════════════════════════════════════════════════
// 啟動伺服器
// ════════════════════════════════════════════════════════════

async function main() {
  // 優雅關閉
  process.on('SIGINT',  async () => { await cleanup(); process.exit(0); });
  process.on('SIGTERM', async () => { await cleanup(); process.exit(0); });

  // 連線 Redis
  await redisClient.connect();
  process.stderr.write('[Collab] ✅ Redis 連線成功\n');

  // 啟動 Hocuspocus WebSocket 伺服器
  await server.listen();
  process.stderr.write(
    `[Collab] 🚀 Yjs WebSocket 伺服器啟動 → ws://localhost:${process.env.COLLAB_PORT || 1234}\n`
  );
  process.stderr.write(
    `[Collab] 📡 文件格式：ws://localhost:${process.env.COLLAB_PORT || 1234}/task-{taskId}\n`
  );
  process.stderr.write(
    `[Collab] 🤖 AI 建議：${process.env.OPENAI_API_KEY ? '已啟用（每 10 秒最多 1 次）' : '未啟用（未設定 OPENAI_API_KEY）'}\n`
  );
}

async function cleanup() {
  // 清除所有防抖計時器（確保最後一次修改被儲存）
  _saveTimers.forEach((timer) => clearTimeout(timer));
  await prisma.$disconnect();
  await redisClient.quit();
  process.stderr.write('[Collab] 已優雅關閉\n');
}

main().catch(err => {
  process.stderr.write(`[Collab] 啟動失敗: ${err.message}\n`);
  process.exit(1);
});
