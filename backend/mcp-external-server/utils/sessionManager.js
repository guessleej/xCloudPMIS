'use strict';
/**
 * mcp-external-server/utils/sessionManager.js
 * ─────────────────────────────────────────────────────────────
 * MCP Session 管理
 *
 * 每個 SSE 連線 = 一個 Session
 * 儲存：in-process Map（若要多節點支援，改用 Redis Pub/Sub）
 *
 * Session 結構：
 *   { transport, mcpServer, apiKeyInfo, createdAt }
 */

/** @type {Map<string, {transport, mcpServer, apiKeyInfo, createdAt}>} */
const sessions = new Map();

// 閒置 Session 自動清理（30 分鐘無活動）
const SESSION_TTL_MS = 30 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, session] of sessions) {
    if (now - session.lastActivityAt > SESSION_TTL_MS) {
      sessions.delete(id);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[Session] 清理 ${cleaned} 個閒置 Session，剩餘 ${sessions.size} 個`);
  }
}, 5 * 60 * 1000);  // 每 5 分鐘掃描一次

module.exports = {
  /** 建立 Session */
  set(sessionId, data) {
    sessions.set(sessionId, { ...data, createdAt: Date.now(), lastActivityAt: Date.now() });
  },

  /** 取得 Session */
  get(sessionId) {
    const session = sessions.get(sessionId);
    if (session) session.lastActivityAt = Date.now();  // 更新活動時間
    return session || null;
  },

  /** 刪除 Session */
  delete(sessionId) {
    sessions.delete(sessionId);
  },

  /** 目前活躍 Session 數量 */
  count() {
    return sessions.size;
  },

  /** 關閉所有 Session（Graceful Shutdown 用） */
  closeAll() {
    console.log(`[Session] 關閉所有 ${sessions.size} 個 Session`);
    sessions.clear();
  },

  /** 列出所有 Session（Debug 用） */
  list() {
    return [...sessions.entries()].map(([id, s]) => ({
      id,
      systemName: s.apiKeyInfo?.systemName,
      companyId:  s.apiKeyInfo?.companyId,
      createdAt:  new Date(s.createdAt).toISOString(),
      lastActivityAt: new Date(s.lastActivityAt).toISOString(),
    }));
  },
};
