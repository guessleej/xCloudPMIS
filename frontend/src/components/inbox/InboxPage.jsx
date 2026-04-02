import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

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

const btnPrimary = { padding: '7px 16px', borderRadius: 7, border: 'none', background: BRAND.crimson, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnGhost   = { padding: '7px 16px', borderRadius: 7, border: `1px solid ${BRAND.silver}`, background: 'transparent', color: BRAND.carbon, fontSize: 13, cursor: 'pointer' };

// 類型色條對應（API type: task_assigned / mentioned / deadline_approaching / …）
const TYPE_COLOR = {
  task_assigned:        '#3B82F6',
  comment_added:        '#F59E0B',
  mentioned:            '#8B5CF6',
  deadline_approaching: '#C70018',
  milestone_achieved:   '#0EA5E9',
  system_alert:         '#6B7280',
  task_completed:       '#16824B',
  // 向下相容舊版 mock 型態
  assign:  '#3B82F6',
  mention: '#8B5CF6',
  alert:   '#C70018',
  system:  '#6B7280',
  done:    '#16824B',
};

const TYPE_LABEL = {
  task_assigned:        '任務指派',
  comment_added:        '留言通知',
  mentioned:            '@提及',
  deadline_approaching: '截止提醒',
  milestone_achieved:   '里程碑達成',
  system_alert:         '系統',
  task_completed:       '已完成',
  // 向下相容
  assign:  '任務指派',
  mention: '@提及',
  alert:   '警示',
  system:  '系統',
  done:    '已完成',
};

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

export default function InboxPage({ onNavigate }) {
  const { user, authFetch } = useAuth();

  const [items,       setItems]       = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selected,    setSelected]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [deleting,    setDeleting]    = useState(false);

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
    // 先樂觀移除 UI（立即視覺回饋），再同步後端
    setItems(prev => prev.filter(m => m.id !== id));
    if (selected?.id === id) setSelected(null);
    setDeleting(true);
    try {
      const res = await authFetch(`/api/notifications/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        // 若 API 失敗，恢復原始列表
        console.error('[InboxPage deleteMsg] API 回傳錯誤:', res.status);
        await load();
      } else {
        // 成功後更新未讀數
        await load();
      }
    } catch (e) {
      console.error('[InboxPage deleteMsg]', e);
      await load(); // 出錯時也恢復資料
    } finally {
      setDeleting(false);
    }
  }

  // 「前往任務/專案」導航
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

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMs  = items.filter(m => (m.createdAt || '').startsWith(todayStr)).length;
  const mentionMs = items.filter(m => m.type === 'mentioned' || m.type === 'mention').length;

  const kpis = [
    { label:'未讀通知',   value: unreadCount },
    { label:'今日通知',   value: todayMs },
    { label:'本週提及',   value: mentionMs },
  ];

  const selectedMsg = selected ? items.find(m => m.id === selected.id) || null : null;

  return (
    <div style={{ minHeight:'100vh', background:BRAND.paper, fontFamily:'inherit', display:'flex', flexDirection:'column' }}>
      {/* Hero */}
      <div style={{ background:BRAND.heroBg, padding:'28px 32px 24px', color:'#fff', flexShrink:0 }}>
        <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.1em', opacity:0.6, textTransform:'uppercase', marginBottom:8 }}>
          inbox
        </div>
        <h1 style={{ fontSize:26, fontWeight:800, margin:'0 0 4px', letterSpacing:'-0.02em' }}>收件匣</h1>
        <p style={{ fontSize:13, opacity:0.7, margin:0 }}>任務指派通知、@提及與系統事件的統一收件中心</p>
        <div style={{ display:'flex', gap:32, marginTop:20, alignItems:'flex-end' }}>
          {kpis.map(k => (
            <div key={k.label}>
              <div style={{ fontSize:24, fontWeight:800, lineHeight:1 }}>{k.value}</div>
              <div style={{ fontSize:11, opacity:0.6, marginTop:3 }}>{k.label}</div>
            </div>
          ))}
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              style={{ marginLeft:'auto', padding:'5px 12px', borderRadius:6, border:'1px solid rgba(255,255,255,0.4)', background:'transparent', color:'#fff', fontSize:12, cursor:'pointer' }}
            >
              全部標為已讀
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding:'40px 32px', textAlign:'center', color:BRAND.muted, fontSize:13 }}>載入中…</div>
      )}

      {/* Two-column layout */}
      {!loading && (
        <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
          {/* Left: notification list */}
          <div style={{ width:320, flexShrink:0, borderRight:`1px solid ${BRAND.mist}`, overflowY:'auto', background:BRAND.white }}>
            {items.length === 0 && (
              <div style={{ padding:'40px 20px', textAlign:'center', color:BRAND.muted, fontSize:13 }}>收件匣為空</div>
            )}
            {items.map(msg => {
              const isSelected = selectedMsg?.id === msg.id;
              const typeColor  = TYPE_COLOR[msg.type] || BRAND.silver;
              const isUnread   = !msg.isRead;
              const timeStr    = msg.createdAt
                ? new Date(msg.createdAt).toLocaleString('zh-TW', { timeZone:'Asia/Taipei', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
                : '';

              return (
                <div
                  key={msg.id}
                  onClick={() => selectMsg(msg)}
                  style={{
                    display:'flex', alignItems:'stretch', cursor:'pointer',
                    borderBottom:`1px solid ${BRAND.mist}`,
                    background: isSelected ? BRAND.accentSurface : 'transparent',
                    transition:'background 0.12s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = BRAND.surfaceSoft; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* Color bar */}
                  <div style={{ width:3, background:typeColor, flexShrink:0 }} />
                  {/* Content */}
                  <div style={{ flex:1, padding:'12px 14px', minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ fontSize:11, color:typeColor, fontWeight:600 }}>{TYPE_LABEL[msg.type] || msg.type}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:11, color:BRAND.muted, whiteSpace:'nowrap' }}>{timeStr}</span>
                        {isUnread && (
                          <span style={{ width:7, height:7, borderRadius:'50%', background:'#3B82F6', display:'inline-block', flexShrink:0 }} />
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize:13, color:BRAND.ink, fontWeight: isUnread ? 600 : 400, lineHeight:1.4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {msg.title}
                    </div>
                    <div style={{ fontSize:11, color:BRAND.muted, marginTop:3 }}>
                      {msg.resourceType ? `${msg.resourceType} #${msg.resourceId}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: detail pane */}
          <div style={{ flex:1, overflowY:'auto', padding:'28px 32px', background:BRAND.paper }}>
            {!selectedMsg ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', minHeight:300 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:14, color:BRAND.muted, marginBottom:6 }}>請從左側選取一則通知</div>
                  <div style={{ fontSize:12, color:BRAND.silver }}>共 {items.length} 則通知，{unreadCount} 則未讀</div>
                </div>
              </div>
            ) : (
              <div style={{ maxWidth:640 }}>
                {/* Type + time */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                  <span style={{
                    display:'inline-block', padding:'3px 10px', borderRadius:4,
                    border:`1px solid ${TYPE_COLOR[selectedMsg.type] || BRAND.silver}`,
                    fontSize:11, fontWeight:600, color:TYPE_COLOR[selectedMsg.type] || BRAND.silver,
                  }}>
                    {TYPE_LABEL[selectedMsg.type] || selectedMsg.type}
                  </span>
                  <span style={{ fontSize:12, color:BRAND.muted }}>
                    {selectedMsg.createdAt ? new Date(selectedMsg.createdAt).toLocaleString('zh-TW', { timeZone:'Asia/Taipei' }) : ''}
                  </span>
                </div>

                {/* Title */}
                <h2 style={{ fontSize:20, fontWeight:700, color:BRAND.ink, margin:'0 0 8px', lineHeight:1.3 }}>
                  {selectedMsg.title}
                </h2>

                {/* Resource */}
                {selectedMsg.resourceType && (
                  <div style={{ fontSize:13, color:BRAND.muted, marginBottom:20 }}>
                    關聯資源：<span style={{ color:BRAND.carbon, fontWeight:500 }}>
                      {selectedMsg.resourceType} #{selectedMsg.resourceId}
                    </span>
                  </div>
                )}

                {/* Divider */}
                <div style={{ borderTop:`1px solid ${BRAND.mist}`, marginBottom:20 }} />

                {/* Message */}
                <p style={{ fontSize:14, color:BRAND.ink, lineHeight:1.75, margin:'0 0 28px' }}>
                  {selectedMsg.message || selectedMsg.detail || '（無詳細說明）'}
                </p>

                {/* Actions */}
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  {/* 「前往任務/專案」：有 resourceType 且有 onNavigate 才顯示 */}
                  {selectedMsg.resourceType && onNavigate && (
                    <button
                      style={btnPrimary}
                      onClick={() => goToResource(selectedMsg)}
                      title={`跳轉到 ${selectedMsg.resourceType} #${selectedMsg.resourceId}`}
                    >
                      {RESOURCE_LABEL[selectedMsg.resourceType] || '前往任務'}
                    </button>
                  )}
                  {/* 無法跳轉時顯示灰色按鈕提示 */}
                  {!selectedMsg.resourceType && (
                    <button
                      style={{ ...btnPrimary, opacity:0.45, cursor:'not-allowed' }}
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
                      cursor:  deleting ? 'not-allowed' : 'pointer',
                    }}
                    onClick={() => !deleting && deleteMsg(selectedMsg.id)}
                    disabled={deleting}
                    title="刪除此通知"
                  >
                    {deleting ? '刪除中…' : '刪除通知'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
