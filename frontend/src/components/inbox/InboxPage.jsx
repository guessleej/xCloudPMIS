/**
 * InboxPage — Asana 風格收件匣
 *
 * 集中顯示所有通知與訊息，包含：
 *   - 左側分類面板（200px）
 *   - 右側通知列表（含已讀/未讀、類型、搜尋、篩選）
 *   - 頂部操作列與統計列
 *   - 資料來源：localStorage xcloud-comments-* / xcloud-deps-*
 *   - 已讀狀態：localStorage xcloud-inbox-read
 *
 * 品牌色：accent #C41230, pageBg #F7F2F2
 */

import { useState, useEffect, useCallback } from 'react';

// ── Design Tokens ────────────────────────────────────────────
const T = {
  accent:    '#C41230',
  pageBg:    '#F7F2F2',
  white:     '#FFFFFF',
  panelBg:   '#F0EAEA',
  border:    '#E0D8D8',
  t1:        '#1A1010',
  t2:        '#6B5555',
  t3:        '#9E8E8E',
  unreadBar: '#3B82F6',   // 未讀左側藍線
  mention:   '#3B82F6',   // @提及 藍
  assign:    '#10B981',   // 指派 綠
  update:    '#F59E0B',   // 更新 橙
  done:      '#9CA3AF',   // 完成 灰
  hoverBg:   '#EDE6E6',
};

// ── 分類定義 ──────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'all',      label: '全部通知',    icon: BellIcon },
  { id: 'mention',  label: '@提及我',     icon: MentionIcon },
  { id: 'assign',   label: '任務指派給我', icon: AssignIcon },
  { id: 'update',   label: '任務更新',    icon: UpdateIcon },
  { id: 'done',     label: '已完成任務',  icon: DoneIcon },
  { id: 'archive',  label: '封存',        icon: ArchiveIcon },
];

// ── 靜態示範通知 ──────────────────────────────────────────────
const DEMO_NOTIFICATIONS = [
  {
    id: 'demo-1',
    type: 'mention',
    title: '陳雅琪 在「Q2 規劃」中提及了你',
    body: '@你 請確認這個 milestone 的完成日期是否正確？',
    project: 'Q2 產品規劃',
    sender: '陳雅琪',
    time: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    archived: false,
  },
  {
    id: 'demo-2',
    type: 'assign',
    title: '林志明 將「設計評審」指派給你',
    body: '任務：設計評審 - 請於週五前完成初稿審核。',
    project: '品牌重塑專案',
    sender: '林志明',
    time: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    archived: false,
  },
  {
    id: 'demo-3',
    type: 'update',
    title: '「API 串接」任務狀態更新',
    body: '任務已從「進行中」變更為「待審核」。',
    project: '後端整合',
    sender: '黃建國',
    time: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    archived: false,
  },
  {
    id: 'demo-4',
    type: 'done',
    title: '「使用者測試報告」已完成',
    body: '任務已由 王美玲 標記為完成。',
    project: 'UX 研究',
    sender: '王美玲',
    time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    archived: false,
  },
  {
    id: 'demo-5',
    type: 'mention',
    title: '張偉傑 在「Sprint Review」中提及了你',
    body: '@你 這個 bug 需要你確認是否已修復，謝謝。',
    project: 'Sprint 23',
    sender: '張偉傑',
    time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    archived: false,
  },
  {
    id: 'demo-6',
    type: 'assign',
    title: '吳淑芬 將「需求文件整理」指派給你',
    body: '請整理本季需求文件並上傳至 Confluence。',
    project: '文件管理',
    sender: '吳淑芬',
    time: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    archived: false,
  },
  {
    id: 'demo-7',
    type: 'update',
    title: '「前端重構」里程碑更新',
    body: '截止日期已延後至下週五，請調整排程。',
    project: '前端重構',
    sender: '李承翰',
    time: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    archived: false,
  },
  {
    id: 'demo-8',
    type: 'done',
    title: '「資料庫遷移」已完成',
    body: '任務已由 鄭明宏 標記為完成，請確認線上環境正常。',
    project: '基礎設施',
    sender: '鄭明宏',
    time: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString(),
    archived: false,
  },
  {
    id: 'demo-9',
    type: 'mention',
    title: '劉曉燕 在「月報」中提及了你',
    body: '@你 可以提供上個月的開發進度數據嗎？',
    project: '月度報告',
    sender: '劉曉燕',
    time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    archived: true,
  },
  {
    id: 'demo-10',
    type: 'assign',
    title: '蔡宗翰 將「安全性稽核」指派給你',
    body: '請於本月底前完成系統安全性稽核報告。',
    project: '資安合規',
    sender: '蔡宗翰',
    time: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    archived: true,
  },
];

// ── 工具函式 ──────────────────────────────────────────────────
function relativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '剛剛';
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Date(isoString).toLocaleDateString('zh-TW');
}

function senderInitial(name) {
  if (!name) return '?';
  return name.charAt(0);
}

function senderColor(name) {
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
  ];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xFFFFFF;
  }
  return colors[Math.abs(hash) % colors.length];
}

function typeColor(type) {
  return { mention: T.mention, assign: T.assign, update: T.update, done: T.done }[type] || T.t3;
}

function typeLabel(type) {
  return { mention: '@提及', assign: '指派', update: '更新', done: '完成' }[type] || type;
}

// ── localStorage helpers ──────────────────────────────────────
function loadReadSet() {
  try {
    const raw = localStorage.getItem('xcloud-inbox-read');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveReadSet(set) {
  try {
    localStorage.setItem('xcloud-inbox-read', JSON.stringify([...set]));
  } catch {}
}

function loadLocalStorageNotifications() {
  const results = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // @mention 留言
      if (key && key.startsWith('xcloud-comments-')) {
        const data = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(data)) {
          data.forEach((c, idx) => {
            if (c && (c.content || c.text || c.body || '').includes('@')) {
              results.push({
                id: `ls-comment-${key}-${idx}`,
                type: 'mention',
                title: `${c.author || '某人'} 在留言中提及了你`,
                body: c.content || c.text || c.body || '',
                project: c.project || key.replace('xcloud-comments-', ''),
                sender: c.author || '未知用戶',
                time: c.createdAt || c.timestamp || new Date().toISOString(),
                archived: false,
              });
            }
          });
        }
      }
      // 依賴關係通知
      if (key && key.startsWith('xcloud-deps-')) {
        const data = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(data)) {
          data.forEach((d, idx) => {
            results.push({
              id: `ls-dep-${key}-${idx}`,
              type: 'update',
              title: `任務依賴關係更新`,
              body: `任務 "${d.taskName || d.id || '未知'}" 的依賴關係已變更。`,
              project: d.project || key.replace('xcloud-deps-', ''),
              sender: d.updatedBy || '系統',
              time: d.updatedAt || new Date().toISOString(),
              archived: false,
            });
          });
        }
      }
    }
  } catch {}
  return results;
}

// ── SVG 圖示元件 ──────────────────────────────────────────────
function BellIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  );
}

function MentionIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-3.92 7.94"/>
    </svg>
  );
}

function AssignIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function UpdateIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
    </svg>
  );
}

function DoneIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function ArchiveIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="21 8 21 21 3 21 3 8"/>
      <rect x="1" y="3" width="22" height="5"/>
      <line x1="10" y1="12" x2="14" y2="12"/>
    </svg>
  );
}

function SearchIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function EmptyIcon({ size = 48, color = '#C8B8B8' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 01-3.46 0"/>
      <line x1="12" y1="2" x2="12" y2="4"/>
    </svg>
  );
}

// ── 頭像元件 ──────────────────────────────────────────────────
function Avatar({ name, size = 36 }) {
  const bg = senderColor(name);
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontWeight: 700,
      fontSize: size * 0.4,
      flexShrink: 0,
      userSelect: 'none',
    }}>
      {senderInitial(name)}
    </div>
  );
}

// ── 類型標籤 ──────────────────────────────────────────────────
function TypeBadge({ type }) {
  const color = typeColor(type);
  const label = typeLabel(type);
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      padding: '2px 7px',
      borderRadius: 10,
      background: color + '18',
      color,
      fontSize: 11,
      fontWeight: 600,
    }}>
      {label}
    </span>
  );
}

// ── 通知列表項目 ──────────────────────────────────────────────
function NotificationItem({ notif, isRead, onRead }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => onRead(notif.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 20px 14px 0',
        borderBottom: `1px solid ${T.border}`,
        background: hovered ? T.hoverBg : T.white,
        cursor: 'pointer',
        transition: 'background 0.12s',
        position: 'relative',
        paddingLeft: 16,
      }}
    >
      {/* 未讀左側藍色細線 */}
      {!isRead && (
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          borderRadius: '0 2px 2px 0',
          background: T.unreadBar,
        }} />
      )}

      {/* 頭像 */}
      <Avatar name={notif.sender} size={36} />

      {/* 主體 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 標題列 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 3,
        }}>
          <span style={{
            fontWeight: isRead ? 500 : 700,
            fontSize: 14,
            color: isRead ? T.t2 : T.t1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
          }}>
            {notif.title}
          </span>
          <span style={{ fontSize: 12, color: T.t3, flexShrink: 0 }}>
            {relativeTime(notif.time)}
          </span>
        </div>

        {/* 內容摘要 */}
        {notif.body && (
          <div style={{
            fontSize: 13,
            color: T.t2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: 6,
          }}>
            {notif.body}
          </div>
        )}

        {/* 標籤列 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <TypeBadge type={notif.type} />
          {notif.project && (
            <span style={{
              fontSize: 12,
              color: T.t3,
              background: T.panelBg,
              padding: '2px 8px',
              borderRadius: 10,
              border: `1px solid ${T.border}`,
            }}>
              {notif.project}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 空狀態 ────────────────────────────────────────────────────
function EmptyState({ category }) {
  const messages = {
    all:     { title: '收件匣是空的', desc: '目前沒有任何通知，繼續保持！' },
    mention: { title: '沒有 @提及', desc: '當有人在留言中提及你時，會在這裡顯示。' },
    assign:  { title: '沒有指派給你的任務', desc: '當任務被指派給你時，會在這裡顯示。' },
    update:  { title: '沒有任務更新', desc: '當你關注的任務有更新時，會在這裡顯示。' },
    done:    { title: '沒有完成的任務', desc: '當任務完成時，會在這裡顯示通知。' },
    archive: { title: '封存是空的', desc: '你封存的通知會在這裡顯示。' },
  };
  const { title, desc } = messages[category] || messages.all;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 40px',
      gap: 16,
    }}>
      <EmptyIcon size={56} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: T.t2, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 14, color: T.t3 }}>{desc}</div>
      </div>
    </div>
  );
}

// ── 主元件 ────────────────────────────────────────────────────
export default function InboxPage() {
  const [allNotifications, setAllNotifications] = useState([]);
  const [readSet, setReadSet] = useState(new Set());
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'unread'
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredCat, setHoveredCat] = useState(null);

  // 載入通知
  useEffect(() => {
    const lsNotifs = loadLocalStorageNotifications();
    const merged = [...DEMO_NOTIFICATIONS, ...lsNotifs];
    // 依時間排序（最新優先）
    merged.sort((a, b) => new Date(b.time) - new Date(a.time));
    setAllNotifications(merged);
    setReadSet(loadReadSet());
  }, []);

  // 標記單一已讀
  const markRead = useCallback((id) => {
    setReadSet(prev => {
      const next = new Set(prev);
      next.add(id);
      saveReadSet(next);
      return next;
    });
  }, []);

  // 全部標記已讀
  const markAllRead = useCallback(() => {
    setReadSet(prev => {
      const next = new Set(prev);
      allNotifications.forEach(n => next.add(n.id));
      saveReadSet(next);
      return next;
    });
  }, [allNotifications]);

  // 篩選通知
  const filteredNotifications = allNotifications.filter(n => {
    // 分類篩選
    if (selectedCategory === 'archive') {
      if (!n.archived) return false;
    } else {
      if (n.archived) return false;
      if (selectedCategory !== 'all' && n.type !== selectedCategory) return false;
    }

    // 已讀/未讀篩選
    if (filterMode === 'unread' && readSet.has(n.id)) return false;

    // 搜尋篩選
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (
        !n.title.toLowerCase().includes(q) &&
        !(n.body || '').toLowerCase().includes(q) &&
        !(n.project || '').toLowerCase().includes(q) &&
        !(n.sender || '').toLowerCase().includes(q)
      ) return false;
    }

    return true;
  });

  // 未讀數量（非封存）
  const unreadCount = allNotifications.filter(
    n => !n.archived && !readSet.has(n.id)
  ).length;

  // 分類未讀數
  function catUnread(catId) {
    if (catId === 'archive') return 0;
    return allNotifications.filter(n => {
      if (n.archived) return false;
      if (catId !== 'all' && n.type !== catId) return false;
      return !readSet.has(n.id);
    }).length;
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: T.pageBg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    }}>
      {/* ── 頂部統計列 ───────────────────────────────────────── */}
      <div style={{
        padding: '16px 24px 0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <BellIcon size={20} color={T.accent} />
        <span style={{ fontSize: 20, fontWeight: 700, color: T.t1 }}>收件匣</span>
        {unreadCount > 0 && (
          <span style={{
            background: T.accent,
            color: '#fff',
            borderRadius: 12,
            padding: '2px 10px',
            fontSize: 13,
            fontWeight: 700,
            marginLeft: 4,
          }}>
            {unreadCount} 則未讀
          </span>
        )}
      </div>

      {/* ── 主體：左側面板 + 右側列表 ───────────────────────── */}
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        padding: '16px 24px 24px 24px',
        gap: 16,
      }}>
        {/* ── 左側分類面板 ─────────────────────────────────── */}
        <div style={{
          width: 200,
          flexShrink: 0,
          background: T.white,
          borderRadius: 12,
          border: `1px solid ${T.border}`,
          padding: '12px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          alignSelf: 'flex-start',
        }}>
          {CATEGORIES.map(cat => {
            const isActive = selectedCategory === cat.id;
            const unread = catUnread(cat.id);
            const IconComp = cat.icon;
            return (
              <div
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                onMouseEnter={() => setHoveredCat(cat.id)}
                onMouseLeave={() => setHoveredCat(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: isActive
                    ? T.accent + '15'
                    : hoveredCat === cat.id
                    ? T.hoverBg
                    : 'transparent',
                  color: isActive ? T.accent : T.t2,
                  fontWeight: isActive ? 600 : 400,
                  fontSize: 14,
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                  userSelect: 'none',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconComp size={15} color={isActive ? T.accent : T.t3} />
                  {cat.label}
                </span>
                {unread > 0 && (
                  <span style={{
                    background: T.accent,
                    color: '#fff',
                    borderRadius: 10,
                    padding: '1px 7px',
                    fontSize: 11,
                    fontWeight: 700,
                    minWidth: 18,
                    textAlign: 'center',
                  }}>
                    {unread}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* ── 右側通知區域 ─────────────────────────────────── */}
        <div style={{
          flex: 1,
          background: T.white,
          borderRadius: 12,
          border: `1px solid ${T.border}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* 操作列 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 20px',
            borderBottom: `1px solid ${T.border}`,
            flexWrap: 'wrap',
          }}>
            {/* 全部標記已讀 */}
            <button
              onClick={markAllRead}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 14px',
                borderRadius: 6,
                border: `1px solid ${T.border}`,
                background: T.white,
                color: T.t2,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.1s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = T.hoverBg;
                e.currentTarget.style.color = T.t1;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = T.white;
                e.currentTarget.style.color = T.t2;
              }}
            >
              <DoneIcon size={13} />
              全部標記已讀
            </button>

            {/* 篩選按鈕 */}
            <div style={{ display: 'flex', gap: 4 }}>
              {[{ id: 'all', label: '全部' }, { id: 'unread', label: '未讀' }].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterMode(f.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: `1px solid ${filterMode === f.id ? T.accent : T.border}`,
                    background: filterMode === f.id ? T.accent + '12' : T.white,
                    color: filterMode === f.id ? T.accent : T.t2,
                    fontSize: 13,
                    fontWeight: filterMode === f.id ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* 搜尋框 */}
            <div style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: T.panelBg,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              padding: '6px 12px',
              minWidth: 220,
            }}>
              <SearchIcon size={14} color={T.t3} />
              <input
                type="text"
                placeholder="搜尋通知..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  fontSize: 13,
                  color: T.t1,
                  width: '100%',
                }}
              />
            </div>
          </div>

          {/* 通知列表 */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredNotifications.length === 0 ? (
              <EmptyState category={selectedCategory} />
            ) : (
              filteredNotifications.map(notif => (
                <NotificationItem
                  key={notif.id}
                  notif={notif}
                  isRead={readSet.has(notif.id)}
                  onRead={markRead}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
