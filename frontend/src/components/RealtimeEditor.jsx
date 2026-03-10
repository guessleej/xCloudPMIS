/**
 * components/RealtimeEditor.jsx
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS — 即時協作任務描述編輯器
 *
 * 功能：
 *   - Tiptap 富文字編輯（透過 Yjs 實現多人同步）
 *   - 即時用戶游標顯示（不同顏色代表不同用戶）
 *   - 連線狀態指示器（綠/黃/紅）
 *   - AI 建議面板（伺服器推播，Yjs 同步）
 *   - 離線支援（IndexedDB 持久化）
 *
 * 使用方式：
 *   <RealtimeEditor
 *     taskId={42}
 *     token={authToken}
 *     user={{ id: 1, name: 'Alice' }}
 *     readOnly={false}
 *     onSave={(plainText) => {}}
 *   />
 *
 * 樣式：使用 inline style（與專案其他元件風格一致，不依賴 Tailwind）
 */

import { useEffect, useCallback, Component } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';

import { useRealtimeTask } from '../hooks/useRealtimeTask';

// ════════════════════════════════════════════════════════════
// Error Boundary — 防止協作編輯器崩潰影響整個頁面
// ════════════════════════════════════════════════════════════

/**
 * RealtimeEditorErrorBoundary
 *
 * 捕捉 RealtimeEditor 內部的 React 渲染錯誤（如 Tiptap extension 初始化失敗、
 * Yjs 套件未載入等），顯示友善的降級 UI，防止整個 Kanban 頁面白屏。
 *
 * 使用情境：
 *   - 容器重啟後 node_modules 不完整 → @tiptap/react import 失敗
 *   - Yjs WebSocket 連線異常導致的 Provider 錯誤
 *   - CollaborationCursor extension 初始化失敗
 */
class RealtimeEditorErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // 記錄到 console（生產環境可接 Sentry 等監控服務）
    console.error('[RealtimeEditor] 渲染錯誤（Error Boundary 已捕捉）:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isImportError = this.state.error?.message?.includes('Failed to resolve import') ||
                          this.state.error?.message?.includes('Cannot find module');

    return (
      <div style={errorBoundaryStyles.wrapper}>
        <div style={errorBoundaryStyles.icon}>⚠️</div>
        <div style={errorBoundaryStyles.title}>即時編輯器載入失敗</div>
        <div style={errorBoundaryStyles.message}>
          {isImportError
            ? '協作編輯套件未正確載入（可能是 node_modules 不完整）。\n請重新整理頁面或聯繫管理員重建前端容器。'
            : '即時協作編輯器發生錯誤，已切換到文字輸入模式。'}
        </div>

        {/* 降級方案：純文字 textarea */}
        <textarea
          defaultValue={this.props.fallbackValue || ''}
          onChange={(e) => this.props.onSave?.(e.target.value)}
          placeholder="輸入任務描述⋯"
          style={errorBoundaryStyles.fallbackTextarea}
        />

        <div style={errorBoundaryStyles.actions}>
          <button onClick={this.handleRetry} style={errorBoundaryStyles.retryBtn}>
            🔄 重試載入編輯器
          </button>
          {process.env.NODE_ENV === 'development' && (
            <details style={errorBoundaryStyles.errorDetails}>
              <summary style={{ cursor: 'pointer', fontSize: 11, color: '#9ca3af' }}>
                錯誤詳情（開發模式）
              </summary>
              <pre style={errorBoundaryStyles.errorPre}>
                {this.state.error?.toString()}
                {'\n'}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}

const errorBoundaryStyles = {
  wrapper: {
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    gap:           12,
    padding:       '24px 16px',
    border:        '1px solid #fecaca',
    borderRadius:  8,
    background:    '#fef2f2',
    minHeight:     200,
  },
  icon:    { fontSize: 32 },
  title:   { fontSize: 15, fontWeight: 700, color: '#991b1b' },
  message: {
    fontSize:   13,
    color:      '#b91c1c',
    textAlign:  'center',
    lineHeight: 1.6,
    whiteSpace: 'pre-line',
  },
  fallbackTextarea: {
    width:        '100%',
    minHeight:    120,
    padding:      '10px 12px',
    border:       '1px solid #fca5a5',
    borderRadius: 6,
    fontSize:     14,
    fontFamily:   '-apple-system, BlinkMacSystemFont, sans-serif',
    resize:       'vertical',
    outline:      'none',
    boxSizing:    'border-box',
  },
  actions:      { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' },
  retryBtn: {
    padding:      '8px 20px',
    background:   '#ef4444',
    color:        '#fff',
    border:       'none',
    borderRadius: 6,
    cursor:       'pointer',
    fontSize:     13,
    fontWeight:   600,
  },
  errorDetails: { width: '100%', marginTop: 4 },
  errorPre: {
    fontSize:    10,
    color:       '#6b7280',
    background:  '#f3f4f6',
    padding:     8,
    borderRadius: 4,
    overflow:    'auto',
    maxHeight:   150,
    whiteSpace:  'pre-wrap',
  },
};

// ════════════════════════════════════════════════════════════
// 主元件
// ════════════════════════════════════════════════════════════

/**
 * @param {Object} props
 * @param {number}   props.taskId    — 任務 ID（必填）
 * @param {string}   [props.token]   — JWT Token（生產環境必填）
 * @param {Object}   [props.user]    — 當前用戶 { id, name, color }
 * @param {boolean}  [props.readOnly]— 只讀模式
 * @param {Function} [props.onSave]  — 純文字內容變更回調（可選）
 * @param {string}   [props.placeholder] — 空白提示文字
 */
function RealtimeEditorInner({
  taskId,
  token,
  user,
  readOnly       = false,
  onSave,
  placeholder    = '輸入任務描述⋯ （支援 Markdown 語法）',
}) {
  // ── 即時協作 Hook ─────────────────────────────────────────
  const {
    isReady,
    yDoc,
    provider,
    connectionStatus,
    connectedUsers,
    aiSuggestion,
    dismissSuggestion,
  } = useRealtimeTask({ taskId, token, user });

  // ── Tiptap 編輯器初始化 ────────────────────────────────────
  // 注意：isReady 改變時，useEditor 會銷毀並重建 editor
  //       （Collaboration 需要 yDoc，所以必須等 isReady）
  const editor = useEditor(
    {
      extensions: [
        // StarterKit 關閉內建 history（改由 Yjs 管理 undo/redo）
        StarterKit.configure({ history: false }),

        // Yjs 協作同步（document 對應 useRealtimeTask 建立的 Y.Doc）
        ...(isReady && yDoc
          ? [Collaboration.configure({ document: yDoc, field: 'default' })]
          : []
        ),

        // 其他用戶游標顯示（需要 provider.awareness）
        ...(isReady && provider
          ? [CollaborationCursor.configure({
              provider,
              user: {
                name:  user?.name  || '訪客',
                color: user?.color || generateColor(user?.id),
              },
            })]
          : []
        ),
      ],

      editable:    !readOnly,
      autofocus:   !readOnly,

      // 編輯器 PlaceHolder（CSS 偽元素實現，不需要額外 extension）
      editorProps: {
        attributes: {
          class:        'pmis-editor-content',
          'data-placeholder': !isReady ? '正在載入協作內容⋯' : placeholder,
        },
      },

      // 內容變更時回調（純文字 + onSave prop）
      onUpdate: ({ editor: ed }) => {
        if (onSave) {
          onSave(ed.getText());
        }
      },
    },
    // deps：isReady 變化時重建 editor（加入/移除協作 extensions）
    [isReady]
  );

  // 清理 editor
  useEffect(() => () => { editor?.destroy(); }, [editor]);

  // ── 渲染 ──────────────────────────────────────────────────
  return (
    <div style={styles.wrapper}>
      {/* ── 頂部工具列 ──────────────────────────────── */}
      <div style={styles.toolbar}>
        {/* 連線狀態 */}
        <ConnectionBadge status={connectionStatus} />

        {/* 在線用戶頭像 */}
        <div style={styles.avatarGroup}>
          {connectedUsers.slice(0, 5).map((u) => (
            <UserAvatar key={u.clientId} user={u} />
          ))}
          {connectedUsers.length > 5 && (
            <span style={styles.moreUsers}>+{connectedUsers.length - 5}</span>
          )}
        </div>

        {/* 同步狀態文字 */}
        <span style={styles.syncLabel}>
          {!isReady
            ? '⏳ 載入中⋯'
            : connectionStatus === 'connected'
            ? `🟢 已連線${connectedUsers.length > 0 ? `（${connectedUsers.length + 1} 人協作中）` : ''}`
            : connectionStatus === 'disconnected'
            ? '⚫ 離線（本地編輯）'
            : '🔄 重連中⋯'}
        </span>
      </div>

      {/* ── 編輯區 ───────────────────────────────────── */}
      <div style={styles.editorContainer}>
        {editor ? (
          <EditorContent editor={editor} style={styles.editorRoot} />
        ) : (
          <div style={styles.loadingPlaceholder}>
            <span>⏳ 正在連線到協作伺服器⋯</span>
          </div>
        )}
      </div>

      {/* ── AI 建議面板 ─────────────────────────────── */}
      {aiSuggestion && (
        <AISuggestionPanel
          suggestion={aiSuggestion}
          onDismiss={dismissSuggestion}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 子元件
// ════════════════════════════════════════════════════════════

/** 連線狀態指示器 */
function ConnectionBadge({ status }) {
  const config = {
    connecting:   { color: '#f59e0b', label: '連線中', dot: '#fcd34d' },
    connected:    { color: '#10b981', label: '已連線', dot: '#34d399' },
    disconnected: { color: '#6b7280', label: '離線',   dot: '#9ca3af' },
    error:        { color: '#ef4444', label: '連線失敗', dot: '#fca5a5' },
  }[status] || { color: '#6b7280', label: '未知', dot: '#9ca3af' };

  return (
    <div style={{ ...styles.badge, borderColor: config.color }}>
      <span style={{ ...styles.dot, background: config.dot }} />
      <span style={{ color: config.color, fontSize: 11, fontWeight: 600 }}>
        {config.label}
      </span>
    </div>
  );
}

/** 用戶頭像（顯示在工具列，展示在線協作者）*/
function UserAvatar({ user }) {
  const initials = (user.name || '?').slice(0, 2).toUpperCase();
  return (
    <div
      style={{ ...styles.avatar, background: user.color, borderColor: user.color }}
      title={user.name}
    >
      {initials}
    </div>
  );
}

/** AI 建議面板（浮動顯示，可手動關閉）*/
function AISuggestionPanel({ suggestion, onDismiss }) {
  const config = {
    schedule: { emoji: '📅', label: '時程建議',   bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8' },
    resource: { emoji: '👥', label: '資源建議',   bg: '#f0fdf4', border: '#22c55e', text: '#15803d' },
    quality:  { emoji: '✏️', label: '品質建議',   bg: '#fffbeb', border: '#f59e0b', text: '#b45309' },
    general:  { emoji: '💡', label: '改善建議',   bg: '#faf5ff', border: '#a855f7', text: '#7e22ce' },
  }[suggestion.type] || { emoji: '💡', label: '建議', bg: '#f9fafb', border: '#6b7280', text: '#374151' };

  const severityIcon = { info: 'ℹ️', warning: '⚠️', error: '🔴' }[suggestion.severity] || 'ℹ️';

  return (
    <div style={{ ...styles.suggestionPanel, background: config.bg, borderColor: config.border }}>
      <div style={styles.suggestionHeader}>
        <span style={{ fontSize: 13, fontWeight: 700, color: config.text }}>
          {config.emoji} AI {config.label} {severityIcon}
        </span>
        <button onClick={onDismiss} style={styles.dismissBtn} title="關閉建議">
          ✕
        </button>
      </div>
      <p style={{ ...styles.suggestionText, color: config.text }}>
        {suggestion.text}
      </p>
      <span style={styles.suggestionTime}>
        {new Date(suggestion.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 工具函式
// ════════════════════════════════════════════════════════════

function generateColor(userId) {
  const palette = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F0A500', '#2ECC71', '#E74C3C', '#9B59B6', '#3498DB',
  ];
  return palette[((userId || 1) - 1) % palette.length];
}

// ════════════════════════════════════════════════════════════
// 樣式（inline，與專案其他元件一致）
// ════════════════════════════════════════════════════════════

const styles = {
  wrapper: {
    display:       'flex',
    flexDirection: 'column',
    border:        '1px solid #e5e7eb',
    borderRadius:  8,
    overflow:      'hidden',
    background:    '#fff',
    fontFamily:    '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  toolbar: {
    display:        'flex',
    alignItems:     'center',
    gap:            8,
    padding:        '8px 12px',
    background:     '#f9fafb',
    borderBottom:   '1px solid #e5e7eb',
    minHeight:      38,
  },

  badge: {
    display:      'flex',
    alignItems:   'center',
    gap:          5,
    padding:      '3px 8px',
    border:       '1px solid',
    borderRadius: 12,
    background:   '#fff',
  },

  dot: {
    width:        7,
    height:       7,
    borderRadius: '50%',
    display:      'inline-block',
    animation:    'pulse 2s infinite',
  },

  avatarGroup: {
    display:    'flex',
    alignItems: 'center',
    gap:        -4,
    marginLeft: 4,
  },

  avatar: {
    width:        26,
    height:       26,
    borderRadius: '50%',
    border:       '2px solid',
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'center',
    fontSize:     10,
    fontWeight:   700,
    color:        '#fff',
    marginLeft:   -4,
    cursor:       'default',
    userSelect:   'none',
  },

  moreUsers: {
    fontSize:   11,
    color:      '#6b7280',
    marginLeft: 6,
  },

  syncLabel: {
    fontSize:   11,
    color:      '#6b7280',
    marginLeft: 'auto',
    whiteSpace: 'nowrap',
  },

  editorContainer: {
    flex:       1,
    minHeight:  200,
    position:   'relative',
  },

  editorRoot: {
    height:  '100%',
    padding: '12px 16px',
  },

  loadingPlaceholder: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    minHeight:      200,
    color:          '#9ca3af',
    fontSize:       14,
  },

  suggestionPanel: {
    margin:       '0 12px 12px',
    padding:      '10px 12px',
    borderRadius: 8,
    border:       '1px solid',
    position:     'relative',
  },

  suggestionHeader: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   6,
  },

  dismissBtn: {
    background:  'none',
    border:      'none',
    cursor:      'pointer',
    fontSize:    13,
    color:       '#9ca3af',
    padding:     '0 2px',
    lineHeight:  1,
  },

  suggestionText: {
    margin:     0,
    fontSize:   13,
    lineHeight: 1.5,
  },

  suggestionTime: {
    fontSize:   10,
    color:      '#9ca3af',
    marginTop:  4,
    display:    'block',
  },
};

// ════════════════════════════════════════════════════════════
// 公開 export — 以 Error Boundary 包裹主元件
// ════════════════════════════════════════════════════════════

/**
 * RealtimeEditor（含 Error Boundary 包裹）
 *
 * 對外唯一的 export。若 RealtimeEditorInner 發生渲染錯誤，
 * Error Boundary 會捕捉後顯示降級 UI（純文字 textarea + 重試按鈕），
 * 避免整個 Kanban 頁面因協作編輯器崩潰而白屏。
 */
export default function RealtimeEditor(props) {
  return (
    <RealtimeEditorErrorBoundary
      onSave={props.onSave}
      fallbackValue=""
    >
      <RealtimeEditorInner {...props} />
    </RealtimeEditorErrorBoundary>
  );
}

// ── 協作游標 CSS（必須注入到頁面，Tiptap CollaborationCursor 需要）────
// 動態插入一次即可（不依賴全域 CSS 檔案）
if (typeof document !== 'undefined') {
  const styleId = 'pmis-collab-cursor-styles';
  if (!document.getElementById(styleId)) {
    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = `
      /* Tiptap ProseMirror 基本樣式 */
      .pmis-editor-content.ProseMirror {
        outline: none;
        min-height: 180px;
        line-height: 1.6;
        font-size: 14px;
        color: #1f2937;
      }
      .pmis-editor-content.ProseMirror p { margin: 0 0 8px; }
      .pmis-editor-content.ProseMirror h1, h2, h3 { margin: 12px 0 8px; font-weight: 700; }
      .pmis-editor-content.ProseMirror ul, ol { padding-left: 20px; margin: 0 0 8px; }
      .pmis-editor-content.ProseMirror code {
        background: #f3f4f6; padding: 2px 5px; border-radius: 3px;
        font-size: 12px; font-family: 'Fira Code', monospace;
      }
      .pmis-editor-content.ProseMirror pre {
        background: #1f2937; color: #f9fafb; padding: 12px;
        border-radius: 6px; font-family: monospace; font-size: 12px;
        overflow-x: auto; margin: 0 0 8px;
      }
      .pmis-editor-content.ProseMirror blockquote {
        border-left: 3px solid #d1d5db; padding-left: 12px;
        color: #6b7280; margin: 0 0 8px;
      }

      /* 空編輯器 Placeholder */
      .pmis-editor-content.ProseMirror:empty::before,
      .pmis-editor-content.ProseMirror p:first-child:empty::before {
        content: attr(data-placeholder);
        color: #9ca3af;
        pointer-events: none;
        float: left;
        height: 0;
      }

      /* 協作游標（CollaborationCursor 動態注入 --user-color CSS 變數）*/
      .collaboration-cursor__caret {
        border-left:  1px solid;
        border-right: 1px solid;
        margin-left:  -1px;
        margin-right: -1px;
        pointer-events: none;
        position:     relative;
        word-break:   normal;
        border-color: var(--user-color, #3b82f6);
      }
      .collaboration-cursor__label {
        position:     absolute;
        top:          -1.4em;
        left:         -1px;
        font-size:    11px;
        font-weight:  600;
        line-height:  normal;
        user-select:  none;
        color:        #fff;
        background:   var(--user-color, #3b82f6);
        padding:      1px 5px;
        border-radius: 3px 3px 3px 0;
        white-space:  nowrap;
        pointer-events: none;
      }
    `;
    document.head.appendChild(styleEl);
  }
}
