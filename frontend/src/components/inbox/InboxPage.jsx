/**
 * InboxPage — Asana 風格收件匣（完整重寫版 v2）
 *
 * 功能：
 *   - 固定 Tab（活動/書籤/封存/@提及）+ 自訂 Tab（localStorage 儲存）
 *   - 雙擊 Tab inline 編輯名稱；hover 顯示 × 刪除（僅自訂 Tab）
 *   - [+] 按鈕開啟 popup 表單（名稱 + 篩選條件）
 *   - 管理通知面板（從右滑入，toggle 設定，localStorage 儲存）
 *   - AI 摘要卡片（可關閉，localStorage 記住）
 *   - 通知列表（依時間分組）、hover 操作按鈕
 *   - 品牌色 accent #C41230，背景 #F4F0F0
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';

// ── Design Tokens ─────────────────────────────────────────────
const T = {
  accent:    'var(--xc-brand)',
  pageBg:    'var(--xc-bg)',
  white:     'var(--xc-surface-strong)',
  cardBg:    'var(--xc-surface-soft)',
  border:    'var(--xc-border)',
  t1:        'var(--xc-text)',
  t2:        'var(--xc-text-soft)',
  t3:        'var(--xc-text-muted)',
  unreadDot: 'var(--xc-info)',
  taskCircle:'var(--xc-text-muted)',
  hoverBg:   'var(--xc-surface-muted)',
  mention:   'var(--xc-info)',
  assign:    'var(--xc-success)',
  comment:   'var(--xc-warning)',
  done:      'var(--xc-text-muted)',
  due:       'var(--xc-danger)',
  welcome:   '#8B5CF6',
  toggleOn:  'var(--xc-success)',
  toggleOff: 'var(--xc-border-strong)',
};

// ── 固定 Tab 定義 ──────────────────────────────────────────────
const FIXED_TABS = [
  { id: 'activity',   label: '活動' },
  { id: 'bookmarked', label: '書籤' },
  { id: 'archived',   label: '封存' },
  { id: 'mentions',   label: '@提及' },
];

// ── 篩選條件選項 ────────────────────────────────────────────────
const FILTER_OPTIONS = [
  { value: 'all',     label: '全部通知' },
  { value: 'mention', label: '@提及' },
  { value: 'assign',  label: '任務指派' },
  { value: 'comment', label: '留言/評論' },
  { value: 'done',    label: '任務完成' },
  { value: 'due',     label: '任務到期' },
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

// ── 預設通知設定 ────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  type_assign:   true,
  type_mention:  true,
  type_comment:  true,
  type_done:     true,
  type_due:      true,
  email_daily:   true,
  email_instant: false,
  app_desktop:   true,
  app_sound:     false,
};

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

function loadJSON(key, def) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : def;
  } catch { return def; }
}

function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
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
    case 'mention':       return { symbol: '@', color: T.mention };
    case 'task_assigned': return { symbol: '⊙', color: T.assign };
    case 'comment':       return { symbol: '💬', color: T.comment };
    case 'done':          return { symbol: '✓', color: T.done };
    case 'task_due':      return { symbol: '⏰', color: T.due };
    case 'team_welcome':  return { symbol: '✦', color: T.welcome };
    default:              return { symbol: '⊙', color: T.taskCircle };
  }
}

// 依自訂 tab 的 filter 篩選通知
function filterByCustomTab(notifications, filter, archiveIds) {
  return notifications.filter(n => {
    if (archiveIds.has(n.id)) return false;
    if (filter === 'all')     return true;
    if (filter === 'mention') return n.type === 'mention';
    if (filter === 'assign')  return n.type === 'task_assigned';
    if (filter === 'comment') return n.type === 'comment';
    if (filter === 'done')    return n.type === 'done';
    if (filter === 'due')     return n.type === 'task_due';
    return true;
  });
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

function IconBell({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
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

// ── Toggle 開關 ────────────────────────────────────────────────
function Toggle({ on, onChange }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: on ? T.toggleOn : T.toggleOff,
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 3, left: on ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'left 0.2s',
      }} />
    </div>
  );
}

// ── AI 摘要卡片 ────────────────────────────────────────────────
function AISummaryCard({ onClose, notifications }) {
  const [range, setRange] = useState('過去 1 週');
  const [showSummary, setShowSummary] = useState(false);

  const ranges = ['過去 1 天', '過去 1 週', '過去 1 個月'];

  // 動態 AI 摘要文字（依 range + 實際通知資料生成）
  const summaryText = useMemo(() => {
    const now = Date.now();
    const rangeMs = {
      '過去 1 天': 86400000,
      '過去 1 週': 604800000,
      '過去 1 個月': 2592000000,
    }[range] || 604800000;

    const inRange = notifications.filter(n => (now - new Date(n.time).getTime()) < rangeMs);
    const unread   = inRange.filter(n => !n.read);
    const mentions = inRange.filter(n => n.type === 'mention');
    const assigned = inRange.filter(n => n.type === 'task_assigned');
    const dues     = inRange.filter(n => n.type === 'task_due');
    const comments = inRange.filter(n => n.type === 'comment');
    const dones    = inRange.filter(n => n.type === 'done');

    let text = `根據您${range}的通知紀錄，共有 ${inRange.length} 則通知，其中 ${unread.length} 則未讀。\n\n`;

    const bullets = [];
    if (mentions.length > 0)
      bullets.push(`有 ${mentions.length} 則 @提及，建議確認相關討論內容`);
    if (assigned.length > 0)
      bullets.push(`共 ${assigned.length} 個新任務指派給您，請確認截止日期與優先級`);
    if (dues.length > 0)
      bullets.push(`有 ${dues.length} 個任務即將到期，請優先處理`);
    if (comments.length > 0)
      bullets.push(`有 ${comments.length} 則新留言，可能需要您回覆`);
    if (dones.length > 0)
      bullets.push(`${dones.length} 個任務已完成，可以進行確認與結案`);
    if (bullets.length === 0)
      bullets.push('目前無特別需要處理的事項，收件匣一切順暢');

    text += bullets.map(b => `• ${b}`).join('\n');
    if (unread.length > 0) {
      text += '\n\n建議您優先處理 @提及 和即將到期的任務。';
    }
    return text;
  }, [notifications, range]);

  return (
    <div style={{
      background: T.white,
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      padding: '14px 18px',
      marginBottom: 2,
      position: 'relative',
    }}>
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

      {!showSummary && (
        <p style={{ fontSize: 13, color: T.t2, margin: '0 0 12px 0', lineHeight: 1.5 }}>
          使用 AI 總結對您最重要且可採行動的通知。
        </p>
      )}

      {showSummary && (
        <div style={{
          background: '#F5F0FF', borderRadius: 8, padding: '10px 14px',
          marginBottom: 12, fontSize: 13, color: T.t1, lineHeight: 1.7,
          whiteSpace: 'pre-line',
        }}>
          {summaryText}
        </div>
      )}

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

// ── 更多選單（通知項目的 … 按鈕）──────────────────────────────
function MoreMenu({ notifId, isRead, onRead, onBookmark, onArchive, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function h(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const items = [
    {
      label: isRead ? '標記為未讀' : '標記為已讀',
      action: () => { onRead(notifId); onClose(); },
    },
    {
      label: '加入書籤',
      action: () => { onBookmark(notifId); onClose(); },
    },
    {
      label: '封存通知',
      action: () => { onArchive(notifId); onClose(); },
    },
    {
      label: '複製連結',
      action: () => {
        try { navigator.clipboard?.writeText(window.location.href); } catch {}
        onClose();
      },
    },
  ];

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', right: 0, top: 'calc(100% + 4px)',
        background: T.white,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        zIndex: 200, minWidth: 150, padding: 4,
      }}
    >
      {items.map(item => (
        <div
          key={item.label}
          onClick={item.action}
          style={{
            padding: '8px 14px', fontSize: 13, cursor: 'pointer',
            borderRadius: 5, color: T.t1,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = T.hoverBg; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          {item.label}
        </div>
      ))}
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

// ── 通知項目 ───────────────────────────────────────────────────
function NotificationItem({ notif, isRead, isBookmarked, onRead, onBookmark, onArchive, onOpen, isSelected }) {
  const [hovered, setHovered] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const icon = typeIcon(notif.type);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => { if (!isRead) onRead(notif.id); onOpen(notif); }}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 16px',
        background: isSelected ? '#FFF0F2' : hovered ? T.hoverBg : T.white,
        borderLeft: isSelected ? `3px solid ${T.accent}` : '3px solid transparent',
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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <span style={{
            fontWeight: isRead ? 500 : 700,
            fontSize: 14, color: isRead ? T.t2 : T.t1,
            lineHeight: 1.4, flex: 1,
          }}>
            {notif.title}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
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
                <div style={{ position: 'relative' }}>
                  <ActionBtn title="更多" onClick={() => setMoreOpen(o => !o)}>
                    <IconDots size={13} color={moreOpen ? T.accent : T.t3} />
                  </ActionBtn>
                  {moreOpen && (
                    <MoreMenu
                      notifId={notif.id}
                      isRead={isRead}
                      onRead={onRead}
                      onBookmark={onBookmark}
                      onArchive={onArchive}
                      onClose={() => setMoreOpen(false)}
                    />
                  )}
                </div>
              </div>
            )}
            {!isRead && (
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: T.unreadDot, flexShrink: 0,
              }} />
            )}
          </div>
        </div>

        <div style={{ fontSize: 12, color: T.t3, marginTop: 2, marginBottom: 4 }}>
          {notif.sender?.name} · {relativeTime(notif.time)}
        </div>

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
  const info = msgs[tab] || {
    icon: <IconEmpty size={56} />,
    title: '沒有通知',
    desc: '此分類目前沒有符合條件的通知。',
  };
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '80px 40px', gap: 16,
    }}>
      <div style={{ opacity: 0.7 }}>{info.icon}</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.t2, marginBottom: 6 }}>{info.title}</div>
        <div style={{ fontSize: 13, color: T.t3, maxWidth: 280 }}>{info.desc}</div>
      </div>
    </div>
  );
}

// ── 新增 Tab Popup ─────────────────────────────────────────────
function AddTabPopup({ anchor, onAdd, onClose, customTabCount }) {
  const [label, setLabel] = useState(`New tab ${customTabCount + 1}`);
  const [filter, setFilter] = useState('all');
  const popupRef = useRef(null);

  // click outside 關閉
  useEffect(() => {
    function handler(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleAdd = () => {
    if (label.trim()) {
      onAdd({ label: label.trim(), filter });
      onClose();
    }
  };

  return (
    <div
      ref={popupRef}
      style={{
        position: 'absolute',
        top: anchor ? anchor.bottom + 4 : 50,
        left: anchor ? anchor.left : 200,
        background: T.white,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
        zIndex: 300,
        padding: '16px 18px',
        width: 270,
      }}
    >
      {/* 標題 */}
      <div style={{ fontSize: 14, fontWeight: 700, color: T.t1, marginBottom: 14 }}>
        新增 Tab
      </div>

      {/* Tab 名稱 */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: T.t2, display: 'block', marginBottom: 5 }}>
          Tab 名稱
        </label>
        <input
          autoFocus
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') onClose(); }}
          style={{
            width: '100%', boxSizing: 'border-box',
            border: `1px solid ${T.border}`, borderRadius: 6,
            padding: '6px 10px', fontSize: 13, color: T.t1,
            outline: 'none',
          }}
          onFocus={e => e.target.select()}
        />
      </div>

      {/* 篩選條件 */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: T.t2, display: 'block', marginBottom: 8 }}>
          篩選條件
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {FILTER_OPTIONS.map(opt => (
            <label
              key={opt.value}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 13, color: T.t1, cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="filter"
                value={opt.value}
                checked={filter === opt.value}
                onChange={() => setFilter(opt.value)}
                style={{ accentColor: T.accent, cursor: 'pointer' }}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* 按鈕列 */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: `1px solid ${T.border}`,
            borderRadius: 6, padding: '6px 14px',
            fontSize: 13, color: T.t2, cursor: 'pointer', fontWeight: 500,
          }}
          onMouseEnter={e => e.currentTarget.style.background = T.hoverBg}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          取消
        </button>
        <button
          onClick={handleAdd}
          style={{
            background: T.accent, color: '#fff',
            border: 'none', borderRadius: 6,
            padding: '6px 14px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', opacity: label.trim() ? 1 : 0.5,
          }}
          onMouseEnter={e => { if (label.trim()) e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = label.trim() ? '1' : '0.5'; }}
        >
          新增
        </button>
      </div>
    </div>
  );
}

// ── 通知詳情面板 ────────────────────────────────────────────────
function NotificationDetailPanel({ notif, isRead, isBookmarked, onRead, onBookmark, onArchive, onClose }) {
  const [replyText, setReplyText] = useState('');
  const icon = typeIcon(notif.type);

  const typeLabel = {
    mention:       '@提及',
    task_assigned: '任務指派',
    comment:       '留言',
    done:          '任務完成',
    task_due:      '任務到期',
    team_welcome:  '歡迎通知',
  }[notif.type] || '通知';

  return (
    <>
      {/* 透明遮罩 */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 299, background: 'transparent' }}
      />

      {/* 面板本體 */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', right: 0, top: 0,
          width: 420, height: '100vh',
          background: T.white,
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          zIndex: 300,
          display: 'flex', flexDirection: 'column',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
          animation: 'detailSlideIn 0.18s ease',
        }}
      >
        <style>{`@keyframes detailSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

        {/* 標頭 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: `1px solid ${T.border}`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              border: `2px solid ${icon.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: icon.color, fontSize: 11, fontWeight: 700,
            }}>
              {icon.symbol.length <= 2 ? icon.symbol : ''}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.t3 }}>{typeLabel}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* 快速操作 */}
            <ActionBtn title={isRead ? '標記未讀' : '標記已讀'} onClick={() => onRead(notif.id)}>
              <IconCheck size={14} color={isRead ? T.t3 : T.assign} />
            </ActionBtn>
            <ActionBtn title={isBookmarked ? '取消書籤' : '加入書籤'} onClick={() => onBookmark(notif.id)}>
              <IconBookmark size={14} color={isBookmarked ? T.accent : T.t3} filled={isBookmarked} />
            </ActionBtn>
            <ActionBtn title="封存" onClick={() => { onArchive(notif.id); onClose(); }}>
              <IconArchive size={14} color={T.t3} />
            </ActionBtn>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', padding: 5, borderRadius: 5, color: T.t3,
                marginLeft: 4,
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.hoverBg}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <IconX size={16} />
            </button>
          </div>
        </div>

        {/* 主體內容 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0 20px' }}>

          {/* 發件人 + 時間 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Avatar name={notif.sender?.name} size={36} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.t1 }}>{notif.sender?.name}</div>
              <div style={{ fontSize: 12, color: T.t3 }}>{relativeTime(notif.time)}</div>
            </div>
            {!isRead && (
              <div style={{
                marginLeft: 'auto',
                width: 8, height: 8, borderRadius: '50%', background: T.unreadDot, flexShrink: 0,
              }} />
            )}
          </div>

          {/* 標題 */}
          <h2 style={{
            margin: '0 0 12px 0', fontSize: 16, fontWeight: 700,
            color: T.t1, lineHeight: 1.4,
          }}>
            {notif.title}
          </h2>

          {/* 分隔線 */}
          <div style={{ height: 1, background: T.border, margin: '0 0 16px 0' }} />

          {/* 完整內容 */}
          {notif.body && (
            <div style={{
              fontSize: 14, color: T.t2, lineHeight: 1.7,
              background: T.cardBg, borderRadius: 8, padding: '12px 14px',
              marginBottom: 16, whiteSpace: 'pre-wrap',
            }}>
              {notif.body}
            </div>
          )}

          {/* 類型專屬細節 */}
          {notif.type === 'task_assigned' && (
            <div style={{
              background: '#F0FDF4', border: '1px solid #BBF7D0',
              borderRadius: 8, padding: '12px 14px', marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                任務資訊
              </div>
              {notif.body?.split('·').map((part, i) => (
                <div key={i} style={{ fontSize: 13, color: '#15803D', marginTop: i > 0 ? 4 : 0 }}>
                  {part.trim()}
                </div>
              ))}
            </div>
          )}

          {notif.type === 'mention' && (
            <div style={{
              background: '#EFF6FF', border: '1px solid #BFDBFE',
              borderRadius: 8, padding: '12px 14px', marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                提及內容
              </div>
              <div style={{ fontSize: 13, color: '#1E40AF', lineHeight: 1.6 }}>
                「{notif.body}」
              </div>
            </div>
          )}

          {notif.type === 'task_due' && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 8, padding: '12px 14px', marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#991B1B', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ⏰ 截止提醒
              </div>
              <div style={{ fontSize: 13, color: '#DC2626' }}>{notif.body}</div>
            </div>
          )}

          {notif.type === 'comment' && (
            <div style={{
              background: '#FFFBEB', border: '1px solid #FDE68A',
              borderRadius: 8, padding: '12px 14px', marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                💬 留言
              </div>
              <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.6 }}>{notif.body}</div>
            </div>
          )}
        </div>

        {/* 回覆輸入框 */}
        <div style={{
          padding: '12px 20px 16px',
          borderTop: `1px solid ${T.border}`,
          flexShrink: 0,
        }}>
          <div style={{
            border: `1px solid ${replyText ? T.accent : T.border}`,
            borderRadius: 8, padding: '8px 12px',
            background: T.cardBg,
            transition: 'border-color 0.15s',
          }}>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="回覆此通知..."
              rows={2}
              style={{
                width: '100%', border: 'none', outline: 'none',
                background: 'transparent', resize: 'none',
                fontSize: 13, color: T.t1, fontFamily: 'inherit',
                lineHeight: 1.5,
              }}
            />
            {replyText.trim() && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <button
                  onClick={() => setReplyText('')}
                  style={{
                    padding: '5px 16px', background: T.accent, color: '#fff',
                    border: 'none', borderRadius: 6, cursor: 'pointer',
                    fontSize: 13, fontWeight: 600,
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  送出回覆
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── 管理通知面板 ────────────────────────────────────────────────
function ManageNotificationsPanel({ onClose, userId, authFetch }) {
  const [settings, setSettings] = useState(() =>
    loadJSON('xcloud-inbox-settings', DEFAULT_SETTINGS)
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        const response = await authFetch(`/api/settings/notifications?userId=${userId}`);
        const payload = await response.json();
        if (cancelled) return;

        const nextSettings = payload.settings || DEFAULT_SETTINGS;
        setSettings(nextSettings);
        saveJSON('xcloud-inbox-settings', nextSettings);
        setError('');
      } catch (loadError) {
        if (cancelled) return;
        setError(`通知設定載入失敗：${loadError.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, [authFetch, userId]);

  const toggle = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!userId) return;

    setSaving(true);
    setError('');
    try {
      const response = await authFetch(`/api/settings/notifications/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || payload.details || '通知設定儲存失敗');
      }

      saveJSON('xcloud-inbox-settings', payload.settings || settings);
      window.dispatchEvent(new Event('xcloud-notification-settings-updated'));

      if ((payload.settings || settings).app_desktop && 'Notification' in window && Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch {}
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (saveError) {
      setError(`通知設定儲存失敗：${saveError.message}`);
    } finally {
      setSaving(false);
    }
  };

  const SettingRow = ({ icon, label, settingKey }) => (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 16, width: 22, textAlign: 'center' }}>{icon}</span>
        <span style={{ fontSize: 14, color: T.t1 }}>{label}</span>
      </div>
      <Toggle on={settings[settingKey]} onChange={() => toggle(settingKey)} />
    </div>
  );

  const SectionTitle = ({ children }) => (
    <div style={{
      fontSize: 12, fontWeight: 700, color: T.t3,
      letterSpacing: '0.05em', textTransform: 'uppercase',
      padding: '14px 0 6px 0',
      borderTop: `1px solid ${T.border}`,
      marginTop: 4,
    }}>
      {children}
    </div>
  );

  return (
    <>
      {/* 背景遮罩 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.25)',
          zIndex: 199,
        }}
      />

      {/* 面板本體 */}
      <div style={{
        position: 'fixed', right: 0, top: 0,
        width: 360, height: '100vh',
        background: T.white,
        boxShadow: '-4px 0 20px rgba(0,0,0,0.12)',
        zIndex: 200,
        display: 'flex', flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      }}>
        {/* 面板標頭 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 20px 16px 20px',
          borderBottom: `1px solid ${T.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <IconBell size={18} color={T.t2} />
            <span style={{ fontSize: 16, fontWeight: 700, color: T.t1 }}>管理通知</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 6, borderRadius: 6, color: T.t3,
            }}
            onMouseEnter={e => e.currentTarget.style.background = T.hoverBg}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <IconX size={16} />
          </button>
        </div>

        {/* 面板內容（可捲動）*/}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px 20px' }}>
          {loading ? (
            <div style={{ padding: '20px 0', fontSize: 13, color: T.t3 }}>載入通知設定中...</div>
          ) : null}

          {error ? (
            <div
              style={{
                marginTop: 16,
                borderRadius: 10,
                background: '#FFF4F5',
                border: `1px solid ${T.border}`,
                padding: '10px 12px',
                fontSize: 12,
                lineHeight: 1.6,
                color: T.accent2,
              }}
            >
              {error}
            </div>
          ) : null}

          {/* 通知類型 */}
          <div style={{
            fontSize: 12, fontWeight: 700, color: T.t3,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            padding: '16px 0 6px 0',
          }}>
            通知類型
          </div>
          <SettingRow icon="⊙" label="任務指派"  settingKey="type_assign" />
          <SettingRow icon="@" label="@提及"      settingKey="type_mention" />
          <SettingRow icon="💬" label="留言/評論" settingKey="type_comment" />
          <SettingRow icon="✓" label="任務完成"  settingKey="type_done" />
          <SettingRow icon="⏰" label="任務到期"  settingKey="type_due" />

          {/* 電子郵件通知 */}
          <SectionTitle>電子郵件通知</SectionTitle>
          <SettingRow icon="📧" label="每日摘要"  settingKey="email_daily" />
          <SettingRow icon="⚡" label="即時通知"  settingKey="email_instant" />

          {/* App 通知 */}
          <SectionTitle>App 通知</SectionTitle>
          <SettingRow icon="🖥" label="桌面推播"  settingKey="app_desktop" />
          <SettingRow icon="🔔" label="音效提示"  settingKey="app_sound" />
        </div>

        {/* 儲存按鈕 */}
        <div style={{
          padding: '16px 20px',
          borderTop: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button
            onClick={handleSave}
            disabled={loading || saving || !userId}
            style={{
              background: saved ? T.toggleOn : T.accent,
              color: '#fff', border: 'none', borderRadius: 7,
              padding: '9px 20px', fontSize: 14, fontWeight: 600,
              cursor: loading || saving || !userId ? 'not-allowed' : 'pointer', transition: 'background 0.2s',
              opacity: loading || saving || !userId ? 0.65 : 1,
              minWidth: 100, textAlign: 'center',
            }}
            onMouseEnter={e => { if (!saved) e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          >
            {saving ? '儲存中...' : saved ? '已儲存 ✓' : '儲存設定'}
          </button>
        </div>
      </div>
    </>
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

// ── Tab 標籤（含 inline 編輯 + × 刪除）────────────────────────
function TabItem({ tab, isActive, isFixed, unread, onClick, onRename, onDelete }) {
  const [hovered, setHovered]     = useState(false);
  const [editing, setEditing]     = useState(false);
  const [editValue, setEditValue] = useState(tab.label);
  const inputRef = useRef(null);

  // 進入編輯模式時自動 focus + 選取
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== tab.label) {
      onRename(tab.id, trimmed);
    } else {
      setEditValue(tab.label); // 還原
    }
    setEditing(false);
  };

  const handleDoubleClick = () => {
    if (!isFixed) {
      setEditValue(tab.label);
      setEditing(true);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter')  { commitEdit(); }
    if (e.key === 'Escape') { setEditValue(tab.label); setEditing(false); }
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 3,
        position: 'relative',
        borderBottom: isActive ? `2px solid ${T.accent}` : '2px solid transparent',
        marginBottom: -2,
      }}
    >
      {/* Tab 主體按鈕 */}
      <button
        onClick={onClick}
        onDoubleClick={handleDoubleClick}
        style={{
          background: 'none', border: 'none',
          padding: editing ? '6px 4px' : '8px 10px',
          cursor: 'pointer',
          fontSize: 14, fontWeight: isActive ? 700 : 500,
          color: isActive ? T.accent : T.t2,
          display: 'flex', alignItems: 'center', gap: 5,
          transition: 'color 0.1s', whiteSpace: 'nowrap',
          outline: 'none',
        }}
        onMouseEnter={e => { if (!isActive && !editing) e.currentTarget.style.color = T.t1; }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = isActive ? T.accent : T.t2; }}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onClick={e => e.stopPropagation()}
            style={{
              border: `1px solid ${T.accent}`, borderRadius: 4,
              padding: '2px 6px', fontSize: 14, fontWeight: 700,
              color: T.accent, outline: 'none', background: T.white,
              width: Math.max(60, editValue.length * 9),
              minWidth: 60,
            }}
          />
        ) : (
          tab.label
        )}
        {!editing && unread > 0 && (
          <span style={{
            background: T.accent, color: '#fff',
            borderRadius: 10, padding: '1px 6px',
            fontSize: 11, fontWeight: 700, minWidth: 18, textAlign: 'center',
          }}>
            {unread}
          </span>
        )}
      </button>

      {/* × 刪除按鈕（僅自訂 Tab，hover 時顯示）*/}
      {!isFixed && !editing && hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(tab.id); }}
          title="刪除此 Tab"
          style={{
            background: 'none', border: 'none',
            padding: '2px 3px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.t3, borderRadius: 4,
            marginRight: 4,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = T.hoverBg; e.currentTarget.style.color = T.t1; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = T.t3; }}
        >
          <IconX size={11} />
        </button>
      )}
    </div>
  );
}

// ── 主元件 ────────────────────────────────────────────────────
export default function InboxPage() {
  const { user, authFetch } = useAuth();
  const companyId = user?.companyId;
  const userId = user?.id;

  // 通知資料（實際由後端提供）
  const [notifications, setNotifications] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [apiError, setApiError] = useState(null);

  // 狀態集合（from localStorage）
  const [readIds,     setReadIds]     = useState(() => loadSet('xcloud-inbox-read'));
  const [bookmarkIds, setBookmarkIds] = useState(() => loadSet('xcloud-inbox-bookmarked'));
  const [archiveIds,  setArchiveIds]  = useState(() => loadSet('xcloud-inbox-archived'));

  // ── 從 API 取得通知 ──────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    authFetch(`/api/notifications?companyId=${companyId}&limit=100`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        const serverNotifications = json.success && Array.isArray(json.data) ? json.data : [];
        setNotifications(serverNotifications);
        setReadIds(new Set(serverNotifications.filter(n => n.read).map(n => n.id)));
        setApiError(null);
      })
      .catch(e => {
        if (cancelled) return;
        console.warn('[InboxPage] API 載入失敗:', e.message);
        setNotifications([]);
        setApiError(e.message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authFetch, companyId]);

  // UI 狀態
  const [activeTab,      setActiveTab]      = useState('activity');
  const [filterType,     setFilterType]     = useState('all');
  const [showAISummary,  setShowAISummary]  = useState(() => loadBool('xcloud-inbox-ai-summary', true));
  const [customTabs,     setCustomTabs]     = useState(() =>
    loadJSON('xcloud-inbox-custom-tabs', [])
  );
  const [sortMode,       setSortMode]       = useState('最新');
  const [densityMode,    setDensityMode]    = useState('詳細');
  const [showManagePanel, setShowManagePanel] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState(null);

  // 新增 Tab popup
  const [addTabPopupAnchor, setAddTabPopupAnchor] = useState(null); // {top, left, bottom}
  const addBtnRef = useRef(null);

  // 同步 localStorage
  useEffect(() => { saveSet('xcloud-inbox-read', readIds); }, [readIds]);
  useEffect(() => { saveSet('xcloud-inbox-bookmarked', bookmarkIds); }, [bookmarkIds]);
  useEffect(() => { saveSet('xcloud-inbox-archived', archiveIds); }, [archiveIds]);
  useEffect(() => { saveBool('xcloud-inbox-ai-summary', showAISummary); }, [showAISummary]);
  useEffect(() => { saveJSON('xcloud-inbox-custom-tabs', customTabs); }, [customTabs]);

  // 操作：標記已讀（切換）— 同時同步後端（僅數字 id）
  const toggleRead = useCallback((id) => {
    setReadIds(prev => {
      const next = new Set(prev);
      const willRead = !next.has(id);
      if (willRead) next.add(id); else next.delete(id);
      setNotifications(current =>
        current.map(notif => notif.id === id ? { ...notif, read: willRead } : notif)
      );
      setSelectedNotif(current =>
        current?.id === id ? { ...current, read: willRead } : current
      );
      window.dispatchEvent(new Event('xcloud-notifications-updated'));
      // localStorage @mention 的 id 是字串 "ls-..."，不呼叫後端
      if (typeof id === 'number') {
        authFetch(`/api/notifications/${id}/read`, {
          method: 'PATCH',
          body: JSON.stringify({ isRead: willRead }),
        }).catch(() => {}); // 靜默失敗，本地狀態已更新
      }
      return next;
    });
  }, [authFetch]);

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

  // 新增自訂 Tab
  const handleAddTab = useCallback(({ label, filter }) => {
    const id = `custom-${Date.now()}`;
    const newTab = { id, label, filter: filter || 'all' };
    setCustomTabs(prev => [...prev, newTab]);
    setActiveTab(id);
  }, []);

  // 重新命名自訂 Tab
  const handleRenameTab = useCallback((id, newLabel) => {
    setCustomTabs(prev => prev.map(t => t.id === id ? { ...t, label: newLabel } : t));
  }, []);

  // 刪除自訂 Tab
  const handleDeleteTab = useCallback((id) => {
    setCustomTabs(prev => prev.filter(t => t.id !== id));
    setActiveTab(prev => prev === id ? 'activity' : prev);
  }, []);

  // 開啟 [+] popup
  const openAddTabPopup = useCallback(() => {
    if (addBtnRef.current) {
      const rect = addBtnRef.current.getBoundingClientRect();
      setAddTabPopupAnchor({ top: rect.top, left: rect.left, bottom: rect.bottom });
    } else {
      setAddTabPopupAnchor({ top: 50, left: 200, bottom: 74 });
    }
  }, []);

  // 篩選邏輯（依 activeTab）
  const getFilteredNotifications = () => {
    // 固定 tab
    if (activeTab === 'archived') {
      return notifications.filter(n => archiveIds.has(n.id));
    }
    if (activeTab === 'bookmarked') {
      return notifications.filter(n => !archiveIds.has(n.id) && bookmarkIds.has(n.id));
    }
    if (activeTab === 'mentions') {
      return notifications.filter(n => !archiveIds.has(n.id) && n.type === 'mention');
    }
    if (activeTab === 'activity') {
      let items = notifications.filter(n => !archiveIds.has(n.id));
      if (filterType !== 'all') {
        items = items.filter(n => n.type === filterType);
      }
      return items;
    }
    // 自訂 tab
    const ct = customTabs.find(t => t.id === activeTab);
    if (ct) {
      return filterByCustomTab(notifications, ct.filter, archiveIds);
    }
    return notifications.filter(n => !archiveIds.has(n.id));
  };

  const filtered = getFilteredNotifications();

  // 排序
  const sorted = [...filtered].sort((a, b) => {
    const ta = new Date(a.time).getTime();
    const tb = new Date(b.time).getTime();
    return sortMode === '最新' ? tb - ta : ta - tb;
  });

  // 分組
  const groupOrder = ['今天', '本週', '更早'];
  const grouped = {};
  sorted.forEach(n => {
    const g = getGroup(n.time);
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(n);
  });
  const groups = [];
  groupOrder.forEach(g => { if (grouped[g]) groups.push({ label: g, items: grouped[g] }); });

  // 未讀數（各 tab）
  const tabUnread = (tabId) => {
    if (tabId === 'archived') return 0;
    if (tabId === 'bookmarked') {
      return notifications.filter(n => !archiveIds.has(n.id) && bookmarkIds.has(n.id) && !readIds.has(n.id)).length;
    }
    if (tabId === 'mentions') {
      return notifications.filter(n => !archiveIds.has(n.id) && n.type === 'mention' && !readIds.has(n.id)).length;
    }
    if (tabId === 'activity') {
      return notifications.filter(n => !archiveIds.has(n.id) && !readIds.has(n.id)).length;
    }
    // 自訂 tab
    const ct = customTabs.find(t => t.id === tabId);
    if (ct) {
      return filterByCustomTab(notifications, ct.filter, archiveIds)
        .filter(n => !readIds.has(n.id)).length;
    }
    return 0;
  };

  // 所有 tab（固定 + 自訂）
  const allTabs = [...FIXED_TABS, ...customTabs];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', background: T.pageBg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <style>{`
        @keyframes shimmer {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* ── 頁首列 ──────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 24px 0 24px',
      }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.t1 }}>收件匣</h1>
        <button
          onClick={() => setShowManagePanel(true)}
          style={{
            border: `1px solid ${T.border}`, borderRadius: 7,
            padding: '6px 14px', fontSize: 13, fontWeight: 500,
            color: T.t2, background: T.white, cursor: 'pointer',
            transition: 'all 0.1s',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = T.hoverBg; }}
          onMouseLeave={e => { e.currentTarget.style.background = T.white; }}
        >
          <IconBell size={14} color={T.t3} />
          管理通知
        </button>
      </div>

      {/* ── Tab 列 ───────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'flex-end',
        padding: '0 24px', marginTop: 12,
        borderBottom: `2px solid ${T.border}`,
        gap: 0, position: 'relative',
      }}>
        {allTabs.map(tab => {
          const isFixed = FIXED_TABS.some(ft => ft.id === tab.id);
          return (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={activeTab === tab.id}
              isFixed={isFixed}
              unread={tabUnread(tab.id)}
              onClick={() => setActiveTab(tab.id)}
              onRename={handleRenameTab}
              onDelete={handleDeleteTab}
            />
          );
        })}

        {/* [+] 新增 Tab 按鈕 */}
        <button
          ref={addBtnRef}
          onClick={openAddTabPopup}
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

        {/* 新增 Tab Popup */}
        {addTabPopupAnchor && (
          <AddTabPopup
            anchor={addTabPopupAnchor}
            customTabCount={customTabs.length}
            onAdd={handleAddTab}
            onClose={() => setAddTabPopupAnchor(null)}
          />
        )}
      </div>

      {/* ── 工具列 ───────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 24px',
      }}>
        <ToolbarDropdown
          icon={<IconFilter size={13} />}
          label={`篩選：${FILTER_OPTIONS.find(o => o.value === filterType)?.label || '全部通知'}`}
          options={FILTER_OPTIONS.map(o => o.label)}
          value={FILTER_OPTIONS.find(o => o.value === filterType)?.label || '全部通知'}
          onChange={(label) => {
            const opt = FILTER_OPTIONS.find(o => o.label === label);
            if (opt) setFilterType(opt.value);
          }}
        />
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
        {!loading && apiError && (
          <div
            style={{
              marginBottom: 12,
              borderRadius: 10,
              border: `1px solid ${T.border}`,
              background: '#FFF4F5',
              padding: '12px 14px',
              fontSize: 12,
              lineHeight: 1.6,
              color: T.accent2,
            }}
          >
            通知資料暫時無法同步：{apiError}
          </div>
        )}

        {/* 載入中骨架屏 */}
        {loading && (
          <div style={{
            background: T.white, borderRadius: 10, border: `1px solid ${T.border}`,
            overflow: 'hidden', marginBottom: 12,
          }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '14px 16px',
                borderBottom: i < 4 ? `1px solid ${T.border}` : 'none',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: '#F0EAEA',
                  animation: 'shimmer 1.4s ease-in-out infinite',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    height: 14, borderRadius: 6, background: '#F0EAEA',
                    width: `${60 + i * 10}%`, marginBottom: 8,
                    animation: 'shimmer 1.4s ease-in-out infinite',
                  }} />
                  <div style={{
                    height: 12, borderRadius: 6, background: '#F5F0F0',
                    width: '45%',
                    animation: 'shimmer 1.4s ease-in-out infinite',
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* AI 摘要卡片（只在 activity tab 顯示）*/}
        {!loading && activeTab === 'activity' && showAISummary && (
          <AISummaryCard
            onClose={() => setShowAISummary(false)}
            notifications={notifications}
          />
        )}

        {/* 空狀態 */}
        {!loading && sorted.length === 0 ? (
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
                      isRead={readIds.has(notif.id) || notif.read}
                      isBookmarked={bookmarkIds.has(notif.id) || notif.bookmarked}
                      onRead={toggleRead}
                      onBookmark={toggleBookmark}
                      onArchive={toggleArchive}
                      onOpen={setSelectedNotif}
                      isSelected={selectedNotif?.id === notif.id}
                    />
                    {ni < group.items.length - 1 && (
                      <div style={{ height: 1, background: T.border, marginLeft: 60 }} />
                    )}
                  </div>
                ))}
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

      {/* ── 通知詳情面板 ──────────────────────────────────────── */}
      {selectedNotif && (
        <NotificationDetailPanel
          notif={selectedNotif}
          isRead={readIds.has(selectedNotif.id) || selectedNotif.read}
          isBookmarked={bookmarkIds.has(selectedNotif.id) || selectedNotif.bookmarked}
          onRead={toggleRead}
          onBookmark={toggleBookmark}
          onArchive={toggleArchive}
          onClose={() => setSelectedNotif(null)}
        />
      )}

      {/* ── 管理通知面板 ──────────────────────────────────────── */}
      {showManagePanel && (
        <ManageNotificationsPanel
          onClose={() => setShowManagePanel(false)}
          userId={userId}
          authFetch={authFetch}
        />
      )}
    </div>
  );
}
