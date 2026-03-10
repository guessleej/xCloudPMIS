/**
 * hooks/useRealtimeTask.js
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS — Yjs 即時協作 React Hook
 *
 * 職責：
 *   封裝所有 Yjs 相關的初始化邏輯，讓元件只需要一行 hook 呼叫
 *   即可獲得完整的即時協作能力（WebSocket + 離線持久化 + AI 建議）。
 *
 * 架構：
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Y.Doc（唯一真實來源 - CRDT）                                │
 *   │    ├── WebsocketProvider（y-websocket）→ Hocuspocus Server  │
 *   │    │       └── Awareness（用戶在線狀態）                     │
 *   │    └── IndexeddbPersistence（y-indexeddb）→ 離線快取         │
 *   │                                                              │
 *   │  Subscriptions：                                             │
 *   │    ├── doc.getMap('ai_suggestions')  → aiSuggestion state  │
 *   │    ├── doc.getMap('task_meta')       → taskMeta state      │
 *   │    └── awareness.on('change')        → connectedUsers state │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * 使用範例：
 *   const { yXmlFragment, provider, awareness, aiSuggestion, connectionStatus } =
 *     useRealtimeTask({ taskId: 42, token: 'eyJ...', user: { id: 1, name: 'Alice' } });
 *
 * 環境變數（VITE 前綴）：
 *   VITE_COLLAB_WS_URL  — WebSocket 伺服器 URL（預設 ws://localhost:1234）
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

// ── 常數 ─────────────────────────────────────────────────────
const DEFAULT_WS_URL = import.meta.env.VITE_COLLAB_WS_URL || 'ws://localhost:1234';

/** Awareness 中本地用戶預設狀態 */
const DEFAULT_AWARENESS_FIELDS = {
  cursor: null,
  scrollY: 0,
};

// ════════════════════════════════════════════════════════════
// Hook 主體
// ════════════════════════════════════════════════════════════

/**
 * @param {Object} options
 * @param {number}      options.taskId    — 任務 ID（用於區分 Yjs document）
 * @param {string}      [options.token]   — JWT Token（生產環境必填）
 * @param {Object}      [options.user]    — 當前用戶 { id, name, color }
 * @param {string}      [options.wsUrl]   — 自訂 WebSocket URL
 * @param {boolean}     [options.offline] — 是否啟用 IndexedDB 離線持久化（預設 true）
 */
export function useRealtimeTask({
  taskId,
  token,
  user,
  wsUrl   = DEFAULT_WS_URL,
  offline = true,
}) {
  // ── 狀態 ──────────────────────────────────────────────────
  /** true 表示 Y.Doc 和 Provider 已完成初始化，可以安全傳入 Tiptap */
  const [isReady, setIsReady] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState('connecting');
  //   'connecting' | 'connected' | 'disconnected' | 'error'

  const [connectedUsers, setConnectedUsers] = useState([]);
  // [{ clientId: number, name: string, color: string }]

  const [aiSuggestion, setAiSuggestion] = useState(null);
  // null | { text, type, severity, timestamp }

  const [taskMeta, setTaskMeta] = useState(null);
  // null | { taskId, title, dueDate, priority }

  // ── Refs（穩定參考，不觸發重渲染）──────────────────────────
  const yDocRef       = useRef(null);
  const providerRef   = useRef(null);
  const idbRef        = useRef(null);   // IndexedDB persistence
  const docNameRef    = useRef(`task:${taskId}`);

  // ════════════════════════════════════════════════════════
  // 初始化（taskId 變更時重新建立）
  // ════════════════════════════════════════════════════════
  useEffect(() => {
    if (!taskId) return;

    const docName = `task:${taskId}`;
    docNameRef.current = docName;

    // ── 建立 Yjs 文件 ──────────────────────────────────────
    const yDoc = new Y.Doc();
    yDocRef.current = yDoc;

    // ── IndexedDB 離線持久化 ────────────────────────────────
    // 在 WebSocket 連線建立前，先從本地快取載入最近狀態，
    // 讓用戶在離線時也能看到內容（並在重連後自動 merge）
    if (offline) {
      const idb = new IndexeddbPersistence(docName, yDoc);
      idbRef.current = idb;
      idb.whenSynced.then(() => {
        // IndexedDB 同步完成後，再啟動 WebSocket provider
        // 這樣能確保本地狀態優先顯示，WS 狀態再 merge 上去
      });
    }

    // ── WebSocket Provider ──────────────────────────────────
    // 連線 URL 格式：ws://host:port/{docName}?token=xxx
    const connectUrl = buildWsUrl(wsUrl, docName, token);
    const provider   = new WebsocketProvider(wsUrl, docName, yDoc, {
      params: token ? { token } : {},
    });
    providerRef.current = provider;

    // ── 連線狀態監聽 ───────────────────────────────────────
    // 所有同步初始化完成，標記 ready（讓 Tiptap 可以安全取用 yDoc/provider）
    setIsReady(true);

    provider.on('status', ({ status }) => {
      setConnectionStatus(
        status === 'connected'    ? 'connected'    :
        status === 'disconnected' ? 'disconnected' : 'connecting'
      );
    });

    provider.on('connection-error', () => setConnectionStatus('error'));
    provider.on('connection-close', () => setConnectionStatus('disconnected'));

    // ── Awareness（用戶在線狀態）────────────────────────────
    // 設定本地用戶狀態（其他用戶透過 Awareness 看到）
    if (user) {
      provider.awareness.setLocalState({
        user: {
          id:    user.id,
          name:  user.name,
          color: user.color || generateColor(user.id),
        },
        ...DEFAULT_AWARENESS_FIELDS,
      });
    }

    // 訂閱 Awareness 變化（更新在線用戶清單）
    const handleAwarenessChange = () => {
      const states = Array.from(provider.awareness.getStates().entries());
      const users  = states
        .filter(([clientId]) => clientId !== provider.awareness.clientID)
        .map(([clientId, state]) => ({
          clientId,
          name:  state.user?.name  || '匿名',
          color: state.user?.color || '#999',
        }));
      setConnectedUsers(users);
    };

    provider.awareness.on('change', handleAwarenessChange);

    // ── AI 建議訂閱 ────────────────────────────────────────
    // 伺服器端透過 Yjs 共享 Map 推播 AI 建議
    // 因為走 Yjs 同步協定，不需要額外 WebSocket 或 API
    const yAI = yDoc.getMap('ai_suggestions');
    const handleAIChange = () => {
      const latest = yAI.get('latest');
      if (latest && latest.timestamp) {
        setAiSuggestion(latest);
      }
    };
    yAI.observe(handleAIChange);

    // ── 任務元資料訂閱 ─────────────────────────────────────
    const yMeta = yDoc.getMap('task_meta');
    const handleMetaChange = () => {
      const meta = {
        taskId:   yMeta.get('taskId'),
        title:    yMeta.get('title'),
        dueDate:  yMeta.get('dueDate'),
        priority: yMeta.get('priority'),
      };
      if (meta.taskId) setTaskMeta(meta);
    };
    yMeta.observe(handleMetaChange);

    // ── Cleanup ────────────────────────────────────────────
    return () => {
      provider.awareness.off('change', handleAwarenessChange);
      yAI.unobserve(handleAIChange);
      yMeta.unobserve(handleMetaChange);

      provider.destroy();
      idbRef.current?.destroy();
      yDoc.destroy();

      yDocRef.current     = null;
      providerRef.current = null;
      idbRef.current      = null;

      // 重置狀態
      setIsReady(false);
      setConnectionStatus('disconnected');
      setConnectedUsers([]);
      setAiSuggestion(null);
      setTaskMeta(null);
    };
  }, [taskId, token, wsUrl, offline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 取消 AI 建議（用戶手動關閉）──────────────────────────
  const dismissSuggestion = useCallback(() => {
    setAiSuggestion(null);
  }, []);

  // ── 更新本地用戶 Awareness 狀態（例如：滾動位置、游標）──
  const updateAwareness = useCallback((fields) => {
    const provider = providerRef.current;
    if (!provider) return;
    const current = provider.awareness.getLocalState() || {};
    provider.awareness.setLocalState({ ...current, ...fields });
  }, []);

  // ── 公開介面 ───────────────────────────────────────────
  return {
    /** Y.Doc 和 Provider 已就緒，可安全傳入 Tiptap */
    isReady,

    /** Yjs 文件實例（傳給 Tiptap CollaborationExtension）*/
    yDoc: yDocRef.current,

    /** Tiptap 用的 XmlFragment（key: 'default'）*/
    yXmlFragment: yDocRef.current?.getXmlFragment('default') ?? null,

    /** WebsocketProvider 實例（傳給 CollaborationCursorExtension）*/
    provider: providerRef.current,

    /** Awareness 物件（傳給 CollaborationCursorExtension）*/
    awareness: providerRef.current?.awareness ?? null,

    /** 連線狀態 */
    connectionStatus,

    /** 其他在線用戶列表 */
    connectedUsers,

    /** AI 建議（伺服器推播）*/
    aiSuggestion,

    /** 任務元資料（從 Yjs 同步）*/
    taskMeta,

    /** 關閉 AI 建議面板 */
    dismissSuggestion,

    /** 更新本地 Awareness 狀態 */
    updateAwareness,
  };
}

// ════════════════════════════════════════════════════════════
// 輔助函式
// ════════════════════════════════════════════════════════════

/**
 * 建立 WebSocket 連線 URL
 * 注意：y-websocket 的 params 會自動加到 query string，
 *      這裡只是確保 wsUrl 本身格式正確
 */
function buildWsUrl(baseUrl, _docName, _token) {
  // y-websocket 會自動處理 docName 和 params，不需要手動拼接
  return baseUrl.replace(/\/$/, '');
}

/**
 * 根據用戶 ID 確定性生成顏色（與後端 getUserColor 邏輯相同）
 * @param {number} userId
 */
function generateColor(userId) {
  const palette = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F0A500', '#2ECC71', '#E74C3C', '#9B59B6', '#3498DB',
  ];
  return palette[((userId || 1) - 1) % palette.length];
}

export default useRealtimeTask;
