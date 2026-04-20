import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useResponsive';

/* ── 設計 Token ─────────────────────────────────────────── */
const BRAND = {
  crimson:      '#C70018',
  crimsonDeep:  '#6E0615',
  crimsonNight: '#161112',
  ink:    'var(--xc-text)',
  carbon: 'var(--xc-text-soft)',
  muted:  'var(--xc-text-muted)',
  paper:  'var(--xc-bg)',
  mist:   'var(--xc-border)',
  silver: 'var(--xc-border-strong)',
  surface:      'var(--xc-surface)',
  surfaceSoft:  'var(--xc-surface-soft)',
  surfaceMuted: 'var(--xc-surface-muted)',
  white:  'var(--xc-surface-strong)',
  accentSoft:    'color-mix(in srgb, #C70018 12%, var(--xc-surface-soft))',
  accentSurface: 'color-mix(in srgb, #C70018  8%, var(--xc-surface))',
  accentBorder:  'color-mix(in srgb, #C70018 28%, var(--xc-border))',
  heroBg: 'linear-gradient(135deg, #161112 0%, #6E0615 44%, #C70018 100%)',
  success: 'var(--xc-success)',
  warning: 'var(--xc-warning)',
  danger:  'var(--xc-danger)',
  info:    'var(--xc-info)',
};

const btnPrimary = { padding: '7px 16px', borderRadius: 7, border: 'none', background: BRAND.crimson, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', transition: 'opacity .12s' };
const btnGhost   = { padding: '7px 16px', borderRadius: 7, border: `1px solid ${BRAND.silver}`, background: 'transparent', color: BRAND.carbon, fontSize: 15, cursor: 'pointer', transition: 'all .12s' };

/* ── 通知類型 config ─────────────────────────────────────── */
const TYPE_CONFIG = {
  task_assigned:        { color: '#3B82F6', icon: '📋', label: '任務指派' },
  comment_added:        { color: '#F59E0B', icon: '💬', label: '留言通知' },
  mentioned:            { color: '#8B5CF6', icon: '📣', label: '@提及' },
  deadline_approaching: { color: '#C70018', icon: '⏰', label: '截止提醒' },
  task_overdue:         { color: '#DC2626', icon: '🚨', label: '逾期警示' },
  milestone_achieved:   { color: '#0EA5E9', icon: '🏁', label: '里程碑達成' },
  system_alert:         { color: '#6B7280', icon: '⚙️', label: '系統' },
  task_completed:       { color: '#16824B', icon: '✅', label: '已完成' },
  system_digest:        { color: '#7C3AED', icon: '📊', label: '摘要報告' },
  // 向下相容舊版 mock 型態
  assign:  { color: '#3B82F6', icon: '📋', label: '任務指派' },
  mention: { color: '#8B5CF6', icon: '📣', label: '@提及' },
  alert:   { color: '#C70018', icon: '🚨', label: '警示' },
  system:  { color: '#6B7280', icon: '⚙️', label: '系統' },
  done:    { color: '#16824B', icon: '✅', label: '已完成' },
};

const TYPE_COLOR = Object.fromEntries(Object.entries(TYPE_CONFIG).map(([k, v]) => [k, v.color]));
const TYPE_LABEL = Object.fromEntries(Object.entries(TYPE_CONFIG).map(([k, v]) => [k, v.label]));
const TYPE_ICON  = Object.fromEntries(Object.entries(TYPE_CONFIG).map(([k, v]) => [k, v.icon]));

// 篩選用 — 只顯示主要類型
const FILTER_TABS = [
  { id: 'all',                 label: '全部' },
  { id: 'task_assigned',       label: '指派', icon: '📋' },
  { id: 'mentioned',           label: '提及', icon: '📣' },
  { id: 'comment_added',       label: '留言', icon: '💬' },
  { id: 'deadline_approaching', label: '截止', icon: '⏰' },
  { id: 'task_completed',      label: '完成', icon: '✅' },
  { id: 'system_digest',       label: '摘要', icon: '📊' },
];

// resourceType → 導航目的地
const RESOURCE_NAV = {
  task:    'my-tasks',
  project: 'projects',
  comment: 'tasks',
};
// resourceType → 按鈕文字
const RESOURCE_LABEL = {
  task:    '前往任務',
  project: '前往專案',
  comment: '前往任務',
};

/* ── 相對時間 ─────────────────────────────────────────────── */
function relativeTime(dateStr) {
  if (!dateStr) return '';
  const now  = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return '剛剛';
  if (mins < 60) return `${mins} 分鐘前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} 小時前`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days} 天前`;
  return new Date(dateStr).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
}

/* ── 日期分組 ─────────────────────────────────────────────── */
function groupByDate(msgs) {
  const now       = new Date();
  const todayStr  = now.toISOString().slice(0, 10);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yestStr   = yesterday.toISOString().slice(0, 10);

  const groups = { today: [], yesterday: [], earlier: [] };
  msgs.forEach(m => {
    const d = (m.createdAt || '').slice(0, 10);
    if (d === todayStr)       groups.today.push(m);
    else if (d === yestStr)   groups.yesterday.push(m);
    else                      groups.earlier.push(m);
  });
  const result = [];
  if (groups.today.length)     result.push({ label: '今天',    items: groups.today });
  if (groups.yesterday.length) result.push({ label: '昨天',    items: groups.yesterday });
  if (groups.earlier.length)   result.push({ label: '更早之前', items: groups.earlier });
  return result;
}

/* ════════════════════════════════════════════════════════════
 *  InboxPage
 * ════════════════════════════════════════════════════════════ */
export default function InboxPage({ onNavigate }) {
  const isMobile = useIsMobile();
  const { user, authFetch } = useAuth();

  const [items,       setItems]       = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selected,    setSelected]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [deleting,    setDeleting]    = useState(false);
  const [search,      setSearch]      = useState('');
  const [typeFilter,  setTypeFilter]  = useState('all');

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res  = await authFetch(`/api/notifications?userId=${user.id}&companyId=${user.companyId}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data || []);
        setUnreadCount(json.meta?.unreadCount ?? 0);
      }
    } catch (e) {
      console.error('[InboxPage load]', e);
    } finally {
      setLoading(false);
    }
  }, [user, authFetch]);

  useEffect(() => { load(); }, [load]);

  /* ── 篩選 ───────────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = items;
    if (typeFilter !== 'all') {
      // 合併向下相容
      const aliases = { task_assigned: ['assign'], mentioned: ['mention'], system_alert: ['system', 'alert'], task_completed: ['done'] };
      const allow = new Set([typeFilter, ...(aliases[typeFilter] || [])]);
      list = list.filter(m => allow.has(m.type));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(m =>
        (m.title || '').toLowerCase().includes(q) ||
        (m.message || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, typeFilter, search]);

  const dateGroups = useMemo(() => groupByDate(filtered), [filtered]);

  /* ── 操作 ───────────────────────────────────────────── */
  async function selectMsg(msg) {
    setSelected(msg);
    if (!msg.isRead) {
      try {
        await authFetch(`/api/notifications/${msg.id}/read`, { method: 'PATCH' });
        await load();
      } catch (e) {
        console.error('[InboxPage selectMsg]', e);
      }
    }
  }

  async function deleteMsg(id) {
    if (deleting) return;
    setItems(prev => prev.filter(m => m.id !== id));
    if (selected?.id === id) setSelected(null);
    setDeleting(true);
    try {
      const res = await authFetch(`/api/notifications/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        console.error('[InboxPage deleteMsg] API 回傳錯誤:', res.status);
        await load();
      } else {
        await load();
      }
    } catch (e) {
      console.error('[InboxPage deleteMsg]', e);
      await load();
    } finally {
      setDeleting(false);
    }
  }

  function goToResource(msg) {
    if (!msg?.resourceType || !onNavigate) return;
    const target = RESOURCE_NAV[msg.resourceType];
    if (target) onNavigate(target);
  }

  async function markAllRead() {
    try {
      await authFetch('/api/notifications/mark-all-read', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId: user.id }),
      });
      await load();
    } catch (e) {
      console.error('[InboxPage markAllRead]', e);
    }
  }

  const [deletingAll, setDeletingAll] = useState(false);
  async function deleteAll() {
    if (deletingAll || items.length === 0) return;
    if (!window.confirm(`確定要刪除全部 ${items.length} 則通知嗎？此操作無法復原。`)) return;
    setDeletingAll(true);
    setItems([]);
    setSelected(null);
    try {
      const res = await authFetch('/api/notifications/delete-all', { method: 'DELETE' });
      if (!res.ok) console.error('[InboxPage deleteAll] API 回傳錯誤:', res.status);
      await load();
    } catch (e) {
      console.error('[InboxPage deleteAll]', e);
      await load();
    } finally {
      setDeletingAll(false);
    }
  }

  /* ── 統計 ───────────────────────────────────────────── */
  const todayStr  = new Date().toISOString().slice(0, 10);
  const todayMs   = items.filter(m => (m.createdAt || '').startsWith(todayStr)).length;
  const mentionMs = items.filter(m => m.type === 'mentioned' || m.type === 'mention').length;

  const kpis = [
    { label: '未讀通知', value: unreadCount, color: '#3B82F6' },
    { label: '今日通知', value: todayMs,     color: '#F59E0B' },
    { label: '本週提及', value: mentionMs,   color: '#8B5CF6' },
  ];

  const selectedMsg = selected ? items.find(m => m.id === selected.id) || null : null;

  /* ════════════════════════════════════════════════════════
   *  Render
   * ════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: BRAND.paper, fontFamily: 'inherit', display: 'flex', flexDirection: 'column' }}>

      {/* ── Hero ────────────────────────────────────────── */}
      <div style={{ background: BRAND.heroBg, padding: isMobile ? '14px 16px 12px' : '28px 32px 24px', color: '#fff', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', opacity: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
          inbox
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em' }}>收件匣</h1>
        <p style={{ fontSize: 15, opacity: 0.7, margin: 0 }}>任務指派通知、@提及與系統事件的統一收件中心</p>

        <div style={{ display: 'flex', gap: isMobile ? 16 : 32, marginTop: isMobile ? 14 : 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {kpis.map(k => (
            <div key={k.label}>
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 13, opacity: 0.6, marginTop: 3 }}>{k.label}</div>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {items.length > 0 && (
              <button
                onClick={deleteAll}
                disabled={deletingAll}
                style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 14, cursor: deletingAll ? 'not-allowed' : 'pointer', opacity: deletingAll ? 0.55 : 1, transition: 'opacity .12s' }}
              >
                {deletingAll ? '刪除中…' : '🗑 一鍵刪除全部'}
              </button>
            )}
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff', fontSize: 14, cursor: 'pointer' }}
              >
                全部標為已讀
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Toolbar: search + type filter ────────────── */}
      <div style={{
        padding: isMobile ? '10px 16px' : '12px 32px',
        borderBottom: `1px solid ${BRAND.mist}`,
        background: BRAND.surface,
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 180, maxWidth: 320 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: BRAND.muted, pointerEvents: 'none' }}>🔍</span>
          <input
            type="text"
            placeholder="搜尋通知…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '7px 12px 7px 32px', borderRadius: 7,
              border: `1px solid ${BRAND.silver}`, background: BRAND.surfaceSoft,
              color: BRAND.ink, fontSize: 14, outline: 'none',
            }}
          />
        </div>

        {/* Type filter pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTER_TABS.map(t => {
            const isActive = typeFilter === t.id;
            const cnt      = t.id === 'all' ? items.length : items.filter(m => m.type === t.id).length;
            return (
              <button
                key={t.id}
                onClick={() => setTypeFilter(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 12px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                  border: `1px solid ${isActive ? BRAND.crimson : BRAND.silver}`,
                  background: isActive ? BRAND.accentSurface : 'transparent',
                  color: isActive ? BRAND.crimson : BRAND.carbon,
                  fontWeight: isActive ? 700 : 400,
                  transition: 'all .12s',
                }}
              >
                {t.icon && <span style={{ fontSize: 13 }}>{t.icon}</span>}
                {t.label}
                {cnt > 0 && <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 2 }}>({cnt})</span>}
              </button>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', fontSize: 13, color: BRAND.muted, whiteSpace: 'nowrap' }}>
          {filtered.length} 則通知
        </div>
      </div>

      {/* ── Loading ────────────────────────────────────── */}
      {loading && (
        <div style={{ padding: '60px 32px', textAlign: 'center', color: BRAND.muted, fontSize: 15 }}>
          <div style={{ display: 'inline-block', width: 28, height: 28, border: `3px solid ${BRAND.mist}`, borderTopColor: BRAND.crimson, borderRadius: '50%', animation: 'inboxSpin .7s linear infinite' }} />
          <style>{`@keyframes inboxSpin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ marginTop: 12 }}>載入中…</div>
        </div>
      )}

      {/* ── Main two-column ────────────────────────────── */}
      {!loading && (
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', flex: 1, overflow: 'hidden' }}>

          {/* ── Left: notification list ────────────────── */}
          <div style={{
            width: isMobile ? '100%' : 380,
            flexShrink: 0,
            borderRight: isMobile ? 'none' : `1px solid ${BRAND.mist}`,
            borderBottom: isMobile ? `1px solid ${BRAND.mist}` : 'none',
            overflowY: 'auto',
            background: BRAND.white,
            maxHeight: isMobile ? '55vh' : 'none',
          }}>
            {filtered.length === 0 && (
              <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>📭</div>
                <div style={{ fontSize: 16, color: BRAND.muted, fontWeight: 600, marginBottom: 4 }}>
                  {items.length === 0 ? '收件匣為空' : '沒有符合條件的通知'}
                </div>
                <div style={{ fontSize: 14, color: BRAND.silver }}>
                  {items.length === 0 ? '當有新的任務指派或提及時，通知會出現在這裡' : '試試調整篩選條件或搜尋關鍵字'}
                </div>
              </div>
            )}
            {dateGroups.map(group => (
              <div key={group.label}>
                {/* Date group header */}
                <div style={{
                  padding: '8px 16px', fontSize: 12, fontWeight: 700, color: BRAND.muted,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  background: BRAND.surfaceSoft, borderBottom: `1px solid ${BRAND.mist}`,
                  position: 'sticky', top: 0, zIndex: 1,
                }}>
                  {group.label}
                </div>
                {group.items.map(msg => {
                  const isSelected = selectedMsg?.id === msg.id;
                  const cfg        = TYPE_CONFIG[msg.type] || { color: BRAND.silver, icon: '📌', label: msg.type };
                  const isUnread   = !msg.isRead;

                  return (
                    <div
                      key={msg.id}
                      onClick={() => selectMsg(msg)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
                        padding: '14px 16px',
                        borderBottom: `1px solid ${BRAND.mist}`,
                        background: isSelected ? BRAND.accentSurface : 'transparent',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = BRAND.surfaceSoft; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? BRAND.accentSurface : 'transparent'; }}
                    >
                      {/* Type icon badge */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${cfg.color} 20%, transparent)`,
                        fontSize: 16, lineHeight: 1,
                      }}>
                        {cfg.icon}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ fontSize: 12, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, color: BRAND.muted, whiteSpace: 'nowrap' }}>{relativeTime(msg.createdAt)}</span>
                            {isUnread && (
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3B82F6', display: 'inline-block', flexShrink: 0 }} />
                            )}
                          </div>
                        </div>
                        <div style={{
                          fontSize: 14, color: BRAND.ink,
                          fontWeight: isUnread ? 600 : 400, lineHeight: 1.45,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {msg.title}
                        </div>
                        {msg.message && (
                          <div style={{
                            fontSize: 13, color: BRAND.muted, marginTop: 2, lineHeight: 1.4,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {msg.message.slice(0, 60)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* ── Right: detail pane ─────────────────────── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 16px' : '28px 32px', background: BRAND.paper }}>
            {!selectedMsg ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 320 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>📬</div>
                  <div style={{ fontSize: 17, color: BRAND.muted, fontWeight: 600, marginBottom: 6 }}>選取一則通知查看詳情</div>
                  <div style={{ fontSize: 14, color: BRAND.silver }}>
                    共 {items.length} 則通知，{unreadCount} 則未讀
                  </div>
                </div>
              </div>
            ) : (() => {
              const cfg = TYPE_CONFIG[selectedMsg.type] || { color: BRAND.silver, icon: '📌', label: selectedMsg.type };
              return (
                <div style={{ maxWidth: 660 }}>
                  {/* Detail card */}
                  <div style={{
                    background: BRAND.surface, border: `1px solid ${BRAND.mist}`, borderRadius: 14,
                    padding: isMobile ? '18px 16px' : '24px 28px',
                    boxShadow: '0 1px 3px rgba(0,0,0,.04)',
                  }}>
                    {/* Type badge + time */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '4px 12px', borderRadius: 20,
                          background: `color-mix(in srgb, ${cfg.color} 10%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${cfg.color} 25%, transparent)`,
                          fontSize: 13, fontWeight: 600, color: cfg.color,
                        }}>
                          <span style={{ fontSize: 13 }}>{cfg.icon}</span>
                          {cfg.label}
                        </span>
                      </div>
                      <span style={{ fontSize: 13, color: BRAND.muted }}>
                        {selectedMsg.createdAt ? new Date(selectedMsg.createdAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : ''}
                      </span>
                    </div>

                    {/* Title */}
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: BRAND.ink, margin: '0 0 10px', lineHeight: 1.35 }}>
                      {selectedMsg.title}
                    </h2>

                    {/* Resource */}
                    {selectedMsg.resourceType && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', borderRadius: 6,
                        background: BRAND.surfaceSoft, border: `1px solid ${BRAND.mist}`,
                        fontSize: 13, color: BRAND.carbon, marginBottom: 16,
                      }}>
                        <span style={{ opacity: 0.7 }}>🔗</span>
                        {selectedMsg.resourceType} #{selectedMsg.resourceId}
                      </div>
                    )}

                    {/* Divider */}
                    <div style={{ borderTop: `1px solid ${BRAND.mist}`, margin: '16px 0' }} />

                    {/* Message body */}
                    <div style={{
                      fontSize: 15, color: BRAND.ink, lineHeight: 1.75,
                      whiteSpace: 'pre-wrap', marginBottom: 24,
                    }}>
                      {selectedMsg.message || selectedMsg.detail || '（無詳細說明）'}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      {selectedMsg.resourceType && onNavigate && (
                        <button
                          style={btnPrimary}
                          onClick={() => goToResource(selectedMsg)}
                          onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
                          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                          title={`跳轉到 ${selectedMsg.resourceType} #${selectedMsg.resourceId}`}
                        >
                          {RESOURCE_LABEL[selectedMsg.resourceType] || '前往任務'} →
                        </button>
                      )}
                      {!selectedMsg.resourceType && (
                        <button
                          style={{ ...btnPrimary, opacity: 0.4, cursor: 'not-allowed' }}
                          disabled
                          title="此通知沒有關聯的資源"
                        >
                          前往任務
                        </button>
                      )}
                      <button
                        style={{
                          ...btnGhost,
                          opacity: deleting ? 0.55 : 1,
                          cursor: deleting ? 'not-allowed' : 'pointer',
                        }}
                        onClick={() => !deleting && deleteMsg(selectedMsg.id)}
                        onMouseEnter={e => { if (!deleting) { e.currentTarget.style.borderColor = BRAND.crimson; e.currentTarget.style.color = BRAND.crimson; } }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = BRAND.silver; e.currentTarget.style.color = BRAND.carbon; }}
                        disabled={deleting}
                        title="刪除此通知"
                      >
                        {deleting ? '刪除中…' : '🗑 刪除通知'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
