/**
 * InboxPage — Asana 風格收件匣（完整重寫版）
 *
 * 精確對齊 Asana「收件匣」介面：
 *   - 頁首列：標題 + 管理通知按鈕
 *   - Tab 列：活動 / 書籤 / 封存 / @提及 / New tab（+ 新增）
 *   - 工具列：篩選 / 排序 / 密度
 *   - AI 摘要卡片（可關閉，localStorage 記住）
 *   - 通知列表（依時間分組：今天 / 本週 / 更早）
 *   - hover 顯示操作按鈕：標記已讀 / 書籤 / 封存 / ⋯
 *   - 底部封存所有按鈕
 *   - 各 Tab 對應內容與空狀態
 *
 * 品牌色：accent #C41230，背景 #F4F0F0
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ── Design Tokens ─────────────────────────────────────────────
const T = {
  accent:    '#C41230',
  pageBg:    '#F4F0F0',
  white:     '#FFFFFF',
  cardBg:    '#F9F6F6',
  border:    '#E8E0E0',
  t1:        '#1A1010',
  t2:        '#5C4545',
  t3:        '#9E8E8E',
  unreadDot: '#3B82F6',
  taskCircle:'#6B7280',
  hoverBg:   '#F0EAEA',
  mention:   '#3B82F6',
  assign:    '#10B981',
  comment:   '#F59E0B',
  done:      '#9CA3AF',
  due:       '#EF4444',
  welcome:   '#8B5CF6',
};

// ── Tab 定義 ──────────────────────────────────────────────────
const TABS = [
  { id: 'activity',   label: '活動' },
  { id: 'bookmarked', label: '書籤' },
  { id: 'archived',   label: '封存' },
  { id: 'mentions',   label: '@提及' },
];

// ── 靜態示範通知（10 則）─────────────────────────────────────
const INITIAL_NOTIFICATIONS = [
  {
    id: 1,
    type: 'team_welcome',
    title: '團隊合作讓工作能夠不斷推展！',
    sender: { name: '雪怪', avatar: null },
    time: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    body: '收件匣可供您從隊友處取得更新、通知和訊息。傳送邀請即可開始協作。',
    read: false, bookmarked: false, archived: false,
  },
  {
    id: 2,
    type: 'task_assigned',
    title: '指派了任務給您：草擬專案簡介',
    sender: { name: '陳志明' },
    time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    body: '截止日期：3月17日 · 專案：xCloudinfo',
    read: false, bookmarked: false, archived: false,
  },
  {
    id: 3,
    type: 'mention',
    title: '@提及了您在「系統架構討論」中',
    sender: { name: '林美華' },
    time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    body: '請確認這個 API 設計方案是否符合需求...',
    read: false, bookmarked: false, archived: false,
  },
  {
    id: 4,
    type: 'task_due',
    title: '任務即將到期：排定啟動會議',
    sender: { name: '系統' },
    time: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(),
    body: '截止日期：3月16日 - 18日',
    read: true, bookmarked: false, archived: false,
  },
  {
    id: 5,
    type: 'comment',
    title: '對「電商平台重構計畫」留言',
    sender: { name: '王大偉' },
    time: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
    body: 'Phase 1 進度更新：已完成 60%，預計下週完成剩餘部分。',
    read: false, bookmarked: true, archived: false,
  },
  {
    id: 6,
    type: 'task_assigned',
    title: '指派了任務給您：建立測試環境',
    sender: { name: '吳淑芬' },
    time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    body: '請於本週五前完成 staging 環境配置。',
    read: true, bookmarked: false, archived: false,
  },
  {
    id: 7,
    type: 'mention',
    title: '@提及了您在「Sprint Review 會議記錄」',
    sender: { name: '張偉傑' },
    time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000).toISOString(),
    body: '這個 bug 需要你確認是否已修復，請盡快回覆。',
    read: false, bookmarked: false, archived: false,
  },
  {
    id: 8,
    type: 'done',
    title: '任務已完成：資料庫遷移',
    sender: { name: '鄭明宏' },
    time: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    body: '任務已標記為完成，請確認線上環境正常運作。',
    read: true, bookmarked: false, archived: false,
  },
  {
    id: 9,
    type: 'comment',
    title: '對「月度報告」新增了留言',
    sender: { name: '劉曉燕' },
    time: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    body: '可以提供上個月的開發進度數據嗎？需要在月報中說明。',
    read: true, bookmarked: false, archived: true,
  },
  {
    id: 10,
    type: 'task_assigned',
    title: '指派了任務給您：安全性稽核',
    sender: { name: '蔡宗翰' },
    time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    body: '請於本月底前完成系統安全性稽核報告，並提交給資安部門。',
    read: true, bookmarked: false, archived: true,
  },
];

// ── localStorage helpers ───────────────────────────────────────
function loadSet(key) {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function saveSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch {}
}

function loadBool(key, def = true) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v === 'true';
  } catch { return def; }
}

function saveBool(key, val) {
  try { localStorage.setItem(key, String(val)); } catch {}
}

function loadLocalStorageNotifications() {
  const results = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('xcloud-comments-')) {
        const data = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(data)) {
          data.forEach((c, idx) => {
            if (c && (c.content || c.text || c.body || '').includes('@')) {
              results.push({
                id: `ls-${key}-${idx}`,
                type: 'mention',
                title: `${c.author || '某人'} 在留言中提及了您`,
                sender: { name: c.author || '未知用戶' },
                time: c.createdAt || c.timestamp || new Date().toISOString(),
                body: c.content || c.text || c.body || '',
                read: false, bookmarked: false, archived: false,
              });
            }
          });
        }
      }
    }
  } catch {}
  return results;
}

// ── 工具函式 ───────────────────────────────────────────────────
function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '剛剛';
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} 天前`;
  return new Date(iso).toLocaleDateString('zh-TW');
}

function getGroup(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = diff / 3600000;
  if (h < 24) return '今天';
  if (h < 7 * 24) return '本週';
  return '更早';
}

function senderInitial(name) {
  if (!name) return '?';
  return name.charAt(0);
}

function avatarColor(name) {
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
  ];
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) {
    h = (h * 31 + name.charCodeAt(i)) & 0xFFFFFF;
  }
  return colors[Math.abs(h) % colors.length];
}

function typeIcon(type) {
  switch (type) {
    case 'mention':      return { symbol: '@', color: T.mention };
    case 'task_assigned': return { symbol: '⊙', color: T.assign };
    case 'comment':      return { symbol: '💬', color: T.comment };
    case 'done':         return { symbol: '✓', color: T.done };
    case 'task_due':     return { symbol: '⏰', color: T.due };
    case 'team_welcome': return { symbol: '✦', color: T.welcome };
    default:             return { symbol: '⊙', color: T.taskCircle };
  }
}

// ── SVG 圖示 ──────────────────────────────────────────────────
function IconFilter({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  );
}

function IconSort({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="5 12 12 19 19 12" />
    </svg>
  );
}

function IconGrid({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function IconBookmark({ size = 14, color = 'currentColor', filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  );
}

function IconArchive({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function IconCheck({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconPlus({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconX({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconDots({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
    </svg>
  );
}

function IconStar({ size = 16, color = '#8B5CF6' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}

function IconEmpty({ size = 56, color = '#C8B8B8' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

function IconBookmarkEmpty({ size = 56, color = '#C8B8B8' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  );
}

// ── 頭像 ──────────────────────────────────────────────────────
function Avatar({ name, size = 32 }) {
  const bg = avatarColor(name || '?');
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.38,
      flexShrink: 0, userSelect: 'none', letterSpacing: 0,
    }}>
      {senderInitial(name)}
    </div>
  );
}

// ── AI 摘要卡片 ────────────────────────────────────────────────
function AISummaryCard({ onClose, notifications }) {
  const [range, setRange] = useState('過去 1 週');
  const [showSummary, setShowSummary] = useState(false);

  const ranges = ['過去 1 天', '過去 1 週', '過去 1 個月'];

  const summaryText = `根據您過去一週的通知，共有 ${notifications.filter(n => !n.read && !n.archived).length} 則未讀通知需要關注。\n\n重要事項：\n• 林美華在「系統架構討論」中提及您，請確認 API 設計方案\n• 草擬專案簡介任務由陳志明指派，截止日期 3月17日\n• 王大偉對電商平台重構計畫留言，Phase 1 已完成 60%\n\n建議您優先處理 @提及 和即將到期的任務。`;

  return (
    <div style={{
      background: T.white,
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      padding: '14px 18px',
      marginBottom: 2,
      position: 'relative',
    }}>
      {/* 標題列 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <IconStar size={16} color="#8B5CF6" />
          <span style={{ fontWeight: 700, fontSize: 14, color: T.t1 }}>收件匣摘要</span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 4, borderRadius: 4, color: T.t3,
          }}
          onMouseEnter={e => e.currentTarget.style.background = T.hoverBg}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <IconX size={14} />
        </button>
      </div>

      {/* 描述 */}
      {!showSummary && (
        <p style={{ fontSize: 13, color: T.t2, margin: '0 0 12px 0', lineHeight: 1.5 }}>
          使用 AI 總結對您最重要且可採行動的通知。
        </p>
      )}

      {/* AI 摘要內容 */}
      {showSummary && (
        <div style={{
          background: '#F5F0FF', borderRadius: 8, padding: '10px 14px',
          marginBottom: 12, fontSize: 13, color: T.t1, lineHeight: 1.7,
          whiteSpace: 'pre-line',
        }}>
          {summaryText}
        </div>
      )}

      {/* 底部操作列 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: T.t2 }}>時間範圍：</span>
          <div style={{ position: 'relative' }}>
            <select
              value={range}
              onChange={e => { setRange(e.target.value); setShowSummary(false); }}
              style={{
                border: `1px solid ${T.border}`, borderRadius: 6,
                padding: '4px 24px 4px 8px', fontSize: 13, color: T.t1,
                background: T.white, cursor: 'pointer', appearance: 'none',
                paddingRight: 24,
              }}
            >
              {ranges.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <span style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none', fontSize: 10, color: T.t3,
            }}>▾</span>
          </div>
        </div>
        <button
          onClick={() => setShowSummary(true)}
          style={{
            background: '#8B5CF6', color: '#fff',
            border: 'none', borderRadius: 6,
            padding: '6px 14px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', transition: 'opacity 0.1s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          {showSummary ? '重新摘要' : '檢視摘要'}
        </button>
      </div>
    </div>
  );
}

// ── 通知項目 ───────────────────────────────────────────────────
function NotificationItem({ notif, isRead, isBookmarked, onRead, onBookmark, onArchive }) {
  const [hovered, setHovered] = useState(false);
  const icon = typeIcon(notif.type);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => !isRead && onRead(notif.id)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 16px',
        background: hovered ? T.hoverBg : T.white,
        cursor: 'pointer', transition: 'background 0.1s',
        position: 'relative', borderRadius: 8,
      }}
    >
      {/* 任務圓圈圖示 */}
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        border: `2px solid ${icon.color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 5,
        color: icon.color, fontSize: 11, fontWeight: 700,
        background: 'transparent',
      }}>
        {icon.symbol.length <= 2 ? icon.symbol : ''}
      </div>

      {/* 頭像 */}
      <Avatar name={notif.sender?.name} size={30} />

      {/* 主體 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 標題 + 未讀點 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <span style={{
            fontWeight: isRead ? 500 : 700,
            fontSize: 14, color: isRead ? T.t2 : T.t1,
            lineHeight: 1.4, flex: 1,
          }}>
            {notif.title}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* hover 時顯示操作按鈕 */}
            {hovered && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}
                onClick={e => e.stopPropagation()}>
                <ActionBtn
                  title={isRead ? '標記未讀' : '標記已讀'}
                  onClick={() => onRead(notif.id)}
                >
                  <IconCheck size={13} color={isRead ? T.t3 : T.assign} />
                </ActionBtn>
                <ActionBtn
                  title={isBookmarked ? '取消書籤' : '加入書籤'}
                  onClick={() => onBookmark(notif.id)}
                >
                  <IconBookmark size={13} color={isBookmarked ? T.accent : T.t3} filled={isBookmarked} />
                </ActionBtn>
                <ActionBtn title="封存" onClick={() => onArchive(notif.id)}>
                  <IconArchive size={13} color={T.t3} />
                </ActionBtn>
                <ActionBtn title="更多">
                  <IconDots size={13} color={T.t3} />
                </ActionBtn>
              </div>
            )}
            {/* 未讀藍點 */}
            {!isRead && (
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: T.unreadDot, flexShrink: 0,
              }} />
            )}
          </div>
        </div>

        {/* 發送者 · 時間 */}
        <div style={{ fontSize: 12, color: T.t3, marginTop: 2, marginBottom: 4 }}>
          {notif.sender?.name} · {relativeTime(notif.time)}
        </div>

        {/* 訊息摘要 */}
        {notif.body && (
          <div style={{
            fontSize: 13, color: T.t2, lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {notif.body}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 操作按鈕（hover 時顯示）────────────────────────────────────
function ActionBtn({ children, onClick, title }) {
  const [h, setH] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: h ? T.border : 'transparent',
        border: `1px solid ${h ? T.border : 'transparent'}`,
        borderRadius: 5, padding: '3px 6px',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.1s',
      }}
    >
      {children}
    </button>
  );
}

// ── 分組標頭 ──────────────────────────────────────────────────
function GroupHeader({ label }) {
  return (
    <div style={{
      padding: '8px 16px 4px 16px',
      fontSize: 12, fontWeight: 700, color: T.t3,
      letterSpacing: '0.05em', textTransform: 'uppercase',
    }}>
      {label}
    </div>
  );
}

// ── 空狀態 ────────────────────────────────────────────────────
function EmptyState({ tab }) {
  const msgs = {
    activity:   { icon: <IconEmpty size={56} />, title: '收件匣是空的', desc: '目前沒有任何通知，一切都很好！' },
    bookmarked: { icon: <IconBookmarkEmpty size={56} />, title: '尚無書籤', desc: '點擊通知上的書籤圖示，即可在此快速找到重要通知。' },
    archived:   { icon: <IconArchive size={56} color="#C8B8B8" />, title: '封存是空的', desc: '您封存的通知會在這裡顯示。' },
    mentions:   { icon: <span style={{ fontSize: 48, color: '#C8B8B8' }}>@</span>, title: '沒有 @提及', desc: '當有人在留言中提及您時，會在這裡顯示。' },
  };
  const { icon, title, desc } = msgs[tab] || msgs.activity;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '80px 40px', gap: 16,
    }}>
      <div style={{ opacity: 0.7 }}>{icon}</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.t2, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13, color: T.t3, maxWidth: 280 }}>{desc}</div>
      </div>
    </div>
  );
}

// ── 主元件 ────────────────────────────────────────────────────
export default function InboxPage() {
  // 通知資料：合併靜態 + localStorage
  const [notifications, setNotifications] = useState(() => {
    const ls = loadLocalStorageNotifications();
    return [...INITIAL_NOTIFICATIONS, ...ls];
  });

  // 狀態集合（from localStorage）
  const [readIds,     setReadIds]     = useState(() => loadSet('xcloud-inbox-read'));
  const [bookmarkIds, setBookmarkIds] = useState(() => loadSet('xcloud-inbox-bookmarked'));
  const [archiveIds,  setArchiveIds]  = useState(() => loadSet('xcloud-inbox-archived'));

  // UI 狀態
  const [activeTab,      setActiveTab]      = useState('activity');
  const [showAISummary,  setShowAISummary]  = useState(() => loadBool('xcloud-inbox-ai-summary', true));
  const [tabs,           setTabs]           = useState(TABS);
  const [sortMode,       setSortMode]       = useState('最新');
  const [densityMode,    setDensityMode]    = useState('詳細');

  // 同步 localStorage
  useEffect(() => { saveSet('xcloud-inbox-read', readIds); }, [readIds]);
  useEffect(() => { saveSet('xcloud-inbox-bookmarked', bookmarkIds); }, [bookmarkIds]);
  useEffect(() => { saveSet('xcloud-inbox-archived', archiveIds); }, [archiveIds]);
  useEffect(() => { saveBool('xcloud-inbox-ai-summary', showAISummary); }, [showAISummary]);

  // 操作：標記已讀（切換）
  const toggleRead = useCallback((id) => {
    setReadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // 操作：書籤（切換）
  const toggleBookmark = useCallback((id) => {
    setBookmarkIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // 操作：封存（切換）
  const toggleArchive = useCallback((id) => {
    setArchiveIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // 操作：封存所有（activity tab 的可見通知）
  const archiveAll = useCallback(() => {
    const visible = notifications.filter(n => !archiveIds.has(n.id)).map(n => n.id);
    setArchiveIds(prev => {
      const next = new Set(prev);
      visible.forEach(id => next.add(id));
      return next;
    });
  }, [notifications, archiveIds]);

  // 操作：清除全部封存
  const clearArchive = useCallback(() => {
    setArchiveIds(new Set());
  }, []);

  // 新增 Tab
  const addTab = useCallback(() => {
    const label = `New tab ${tabs.filter(t => t.id.startsWith('new-')).length + 1}`;
    const id = `new-${Date.now()}`;
    setTabs(prev => [...prev, { id, label }]);
    setActiveTab(id);
  }, [tabs]);

  // 篩選邏輯
  const filtered = notifications.filter(n => {
    const isArchived = archiveIds.has(n.id);
    if (activeTab === 'archived') return isArchived;
    if (isArchived) return false;
    if (activeTab === 'bookmarked') return bookmarkIds.has(n.id);
    if (activeTab === 'mentions')   return n.type === 'mention';
    return true; // activity + new tabs
  });

  // 排序
  const sorted = [...filtered].sort((a, b) => {
    const ta = new Date(a.time).getTime();
    const tb = new Date(b.time).getTime();
    return sortMode === '最新' ? tb - ta : ta - tb;
  });

  // 分組
  const groups = [];
  const groupOrder = ['今天', '本週', '更早'];
  const grouped = {};
  sorted.forEach(n => {
    const g = getGroup(n.time);
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(n);
  });
  groupOrder.forEach(g => { if (grouped[g]) groups.push({ label: g, items: grouped[g] }); });

  // 未讀數（各 tab）
  function tabUnread(tabId) {
    if (tabId === 'archived') return 0;
    return notifications.filter(n => {
      if (archiveIds.has(n.id)) return false;
      if (tabId === 'bookmarked') return bookmarkIds.has(n.id) && !readIds.has(n.id);
      if (tabId === 'mentions')   return n.type === 'mention' && !readIds.has(n.id);
      return !readIds.has(n.id); // activity
    }).length;
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', background: T.pageBg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      overflow: 'hidden',
    }}>

      {/* ── 頁首列 ──────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 24px 0 24px',
      }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.t1 }}>收件匣</h1>
        <button style={{
          border: `1px solid ${T.border}`, borderRadius: 7,
          padding: '6px 14px', fontSize: 13, fontWeight: 500,
          color: T.t2, background: T.white, cursor: 'pointer',
          transition: 'all 0.1s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = T.hoverBg; }}
          onMouseLeave={e => { e.currentTarget.style.background = T.white; }}
        >
          管理通知
        </button>
      </div>

      {/* ── Tab 列 ───────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'flex-end',
        padding: '0 24px', marginTop: 12,
        borderBottom: `2px solid ${T.border}`,
        gap: 0,
      }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          const unread = tabUnread(tab.id);
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none', border: 'none',
                padding: '8px 14px', cursor: 'pointer',
                fontSize: 14, fontWeight: isActive ? 700 : 500,
                color: isActive ? T.accent : T.t2,
                borderBottom: isActive ? `2px solid ${T.accent}` : '2px solid transparent',
                marginBottom: -2,
                display: 'flex', alignItems: 'center', gap: 5,
                transition: 'color 0.1s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = T.t1; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = T.t2; }}
            >
              {tab.label}
              {unread > 0 && (
                <span style={{
                  background: T.accent, color: '#fff',
                  borderRadius: 10, padding: '1px 6px',
                  fontSize: 11, fontWeight: 700, minWidth: 18, textAlign: 'center',
                }}>
                  {unread}
                </span>
              )}
            </button>
          );
        })}
        {/* 新增 Tab 按鈕 */}
        <button
          onClick={addTab}
          title="新增 Tab"
          style={{
            background: 'none', border: 'none',
            padding: '8px 10px', cursor: 'pointer',
            color: T.t3, display: 'flex', alignItems: 'center',
            marginBottom: -2,
          }}
          onMouseEnter={e => e.currentTarget.style.color = T.t1}
          onMouseLeave={e => e.currentTarget.style.color = T.t3}
        >
          <IconPlus size={14} />
        </button>
      </div>

      {/* ── 工具列 ───────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 24px',
      }}>
        <ToolbarBtn icon={<IconFilter size={13} />} label="篩選" />
        <ToolbarDropdown
          icon={<IconSort size={13} />}
          label={`排序：${sortMode}`}
          options={['最新', '最舊']}
          value={sortMode}
          onChange={setSortMode}
        />
        <ToolbarDropdown
          icon={<IconGrid size={13} />}
          label={`密度：${densityMode}`}
          options={['詳細', '精簡']}
          value={densityMode}
          onChange={setDensityMode}
        />
        {/* 封存頁面的清除按鈕 */}
        {activeTab === 'archived' && sorted.length > 0 && (
          <button
            onClick={clearArchive}
            style={{
              marginLeft: 'auto', background: 'none',
              border: `1px solid ${T.border}`, borderRadius: 6,
              padding: '5px 12px', fontSize: 12, color: T.t2,
              cursor: 'pointer', fontWeight: 500,
            }}
            onMouseEnter={e => e.currentTarget.style.background = T.hoverBg}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            清除全部
          </button>
        )}
      </div>

      {/* ── 通知主體 ─────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px 24px' }}>

        {/* AI 摘要卡片（只在 activity tab 顯示）*/}
        {activeTab === 'activity' && showAISummary && (
          <AISummaryCard
            onClose={() => setShowAISummary(false)}
            notifications={notifications}
          />
        )}

        {/* 空狀態 */}
        {sorted.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          <div style={{
            background: T.white, borderRadius: 10,
            border: `1px solid ${T.border}`,
            overflow: 'hidden',
          }}>
            {groups.map((group, gi) => (
              <div key={group.label}>
                <GroupHeader label={group.label} />
                {group.items.map((notif, ni) => (
                  <div key={notif.id}>
                    <NotificationItem
                      notif={notif}
                      isRead={readIds.has(notif.id)}
                      isBookmarked={bookmarkIds.has(notif.id)}
                      onRead={toggleRead}
                      onBookmark={toggleBookmark}
                      onArchive={toggleArchive}
                    />
                    {/* 分隔線（非最後一項）*/}
                    {ni < group.items.length - 1 && (
                      <div style={{ height: 1, background: T.border, marginLeft: 60 }} />
                    )}
                  </div>
                ))}
                {/* 組間分隔 */}
                {gi < groups.length - 1 && (
                  <div style={{ height: 1, background: T.border }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* 封存所有按鈕（只在 activity tab 有通知時顯示）*/}
        {activeTab === 'activity' && sorted.length > 0 && (
          <button
            onClick={archiveAll}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 7, width: '100%', marginTop: 12,
              background: 'none', border: `1px solid ${T.border}`,
              borderRadius: 8, padding: '10px 0', fontSize: 13,
              color: T.t2, cursor: 'pointer', fontWeight: 500,
              transition: 'all 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = T.hoverBg; e.currentTarget.style.color = T.t1; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = T.t2; }}
          >
            <IconArchive size={14} color={T.t3} />
            封存所有通知
          </button>
        )}
      </div>
    </div>
  );
}

// ── 工具列按鈕 ────────────────────────────────────────────────
function ToolbarBtn({ icon, label, onClick }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: h ? T.hoverBg : T.white,
        border: `1px solid ${T.border}`, borderRadius: 7,
        padding: '5px 12px', fontSize: 13, fontWeight: 500,
        color: T.t2, cursor: 'pointer', transition: 'all 0.1s',
      }}
    >
      {icon}{label}
    </button>
  );
}

function ToolbarDropdown({ icon, label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: open ? T.hoverBg : T.white,
          border: `1px solid ${open ? T.accent : T.border}`, borderRadius: 7,
          padding: '5px 12px', fontSize: 13, fontWeight: 500,
          color: open ? T.accent : T.t2, cursor: 'pointer', transition: 'all 0.1s',
        }}
      >
        {icon}{label} <span style={{ fontSize: 10, marginLeft: 1 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          background: T.white, border: `1px solid ${T.border}`,
          borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 100, minWidth: 120, padding: 4,
        }}>
          {options.map(opt => (
            <div
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              style={{
                padding: '7px 12px', fontSize: 13, cursor: 'pointer',
                borderRadius: 5, color: value === opt ? T.accent : T.t1,
                fontWeight: value === opt ? 600 : 400,
                background: value === opt ? T.accent + '10' : 'transparent',
              }}
              onMouseEnter={e => { if (value !== opt) e.currentTarget.style.background = T.hoverBg; }}
              onMouseLeave={e => { if (value !== opt) e.currentTarget.style.background = 'transparent'; }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
