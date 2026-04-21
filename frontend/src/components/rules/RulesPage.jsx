import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useResponsive';
import { usePermissions } from '../../hooks/usePermissions';

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

const btnPrimary = { padding:'7px 16px', borderRadius:7, border:'none', background:BRAND.crimson, color:'#fff', fontSize: 15, fontWeight:600, cursor:'pointer' };
const btnGhost   = { padding:'7px 16px', borderRadius:7, border:`1px solid ${BRAND.silver}`, background:'transparent', color:BRAND.carbon, fontSize: 15, cursor:'pointer' };

const CATEGORIES = ['全部','通知','標籤','指派','警示'];

const TH_STYLE = { fontSize: 13, fontWeight:600, color:BRAND.muted, textTransform:'uppercase', letterSpacing:'0.05em' };

function Toggle({ enabled, onChange }) {
  return (
    <button
      onClick={onChange}
      style={{
        width:36, height:20, borderRadius:10, border:'none', cursor:'pointer', padding:0,
        background: enabled ? BRAND.crimson : BRAND.silver,
        position:'relative', transition:'background 0.2s', flexShrink:0,
      }}
      aria-checked={enabled}
      role='switch'
    >
      <span style={{
        position:'absolute', top:3, left: enabled ? 19 : 3,
        width:14, height:14, borderRadius:'50%', background:'#fff',
        transition:'left 0.2s', display:'block',
      }} />
    </button>
  );
}

function CategoryBadge({ cat }) {
  return (
    <span style={{
      display:'inline-block', padding:'2px 8px', borderRadius:4,
      border:`1px solid ${BRAND.silver}`, fontSize: 13, color:BRAND.carbon,
      fontWeight:500, background:'transparent',
    }}>{cat || '—'}</span>
  );
}

// 從規則資料推導顯示用的類別（API 欄位為 triggerType，前端顯示 category）
function deriveCategory(rule) {
  if (rule.category) return rule.category;
  const t = rule.triggerType || '';
  if (t.includes('notification') || t.includes('due_date')) return '通知';
  if (t.includes('assign'))  return '指派';
  if (t.includes('status') || t.includes('field')) return '標籤';
  return '通知';
}

const TRIGGER_LABELS = {
  task_created:         '當新任務建立時',
  task_completed:       '當任務標記為完成',
  due_date_approaching: '截止日期前 N 天',
  status_changed:       '當任務狀態變更',
  assignee_changed:     '當任務負責人變更',
  field_changed:        '當欄位值變更',
};

const ACTION_LABELS = {
  send_notification: '發送通知',
  set_status:        '變更任務狀態',
  set_priority:      '變更任務優先度',
  set_assignee:      '指派負責人',
};

function deriveTrigger(rule) {
  if (rule.triggerType === 'due_date_approaching') {
    const cond = Array.isArray(rule.conditions) && rule.conditions.find(c => c.field === '_days_before');
    const days = cond?.value || rule.triggerConfig?.daysBeforeDue || 2;
    return `截止日前 ${days} 天自動觸發`;
  }
  if (rule.description && !TRIGGER_LABELS[rule.description]) return rule.description;
  return TRIGGER_LABELS[rule.triggerType] || rule.triggerType || '—';
}

function deriveAction(rule) {
  if (Array.isArray(rule.actions) && rule.actions.length > 0) {
    const a = rule.actions[0];
    const label = ACTION_LABELS[a.type] || a.type;
    return a.value ? `${label}：${a.value}` : label;
  }
  if (rule.actions?.description) return rule.actions.description;
  if (rule.actions?.type) {
    const label = ACTION_LABELS[rule.actions.type] || rule.actions.type;
    return rule.actions.value ? `${label}：${rule.actions.value}` : label;
  }
  return '—';
}

export default function RulesPage() {
  const isMobile = useIsMobile();
  const { user, authFetch } = useAuth();
  const { canManageRules } = usePermissions();

  const [rules,      setRules]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [catFilter,  setCatFilter]  = useState('全部');
  const [showModal,  setShowModal]  = useState(false);
  const [editRule,   setEditRule]   = useState(null);
  const [form,       setForm]       = useState({
    name: '', category: '通知',
    triggerType: 'task_created', daysBefore: 3,
    actionType: 'send_notification', actionValue: '',
  });

  const load = useCallback(async () => {
    if (!user?.companyId) return;
    try {
      const res  = await authFetch(`/api/rules?companyId=${user.companyId}`);
      const json = await res.json();
      if (json.success) {
        setRules(json.data || []);
      }
    } catch (e) {
      console.error('[RulesPage load]', e);
    } finally {
      setLoading(false);
    }
  }, [user, authFetch]);

  useEffect(() => { load(); }, [load]);

  const total   = rules.length;
  const enabled = rules.filter(r => r.isEnabled).length;
  const monthly = rules.reduce((s, r) => s + (r.runCount || r.triggerCount || 0), 0);

  const kpis = [
    { label:'規則總數',     value: total },
    { label:'啟用中',       value: enabled },
    { label:'本月觸發次數', value: monthly },
  ];

  const filtered = catFilter === '全部'
    ? rules
    : rules.filter(r => deriveCategory(r) === catFilter);

  async function toggleEnabled(rule) {
    try {
      await authFetch(`/api/rules/${rule.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ isEnabled: !rule.isEnabled }),
      });
      await load();
    } catch (e) {
      console.error('[RulesPage toggleEnabled]', e);
    }
  }

  async function deleteRule(id) {
    try {
      await authFetch(`/api/rules/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      console.error('[RulesPage deleteRule]', e);
    }
  }

  function openAdd() {
    setEditRule(null);
    setForm({ name: '', category: '通知', triggerType: 'task_created', daysBefore: 3, actionType: 'send_notification', actionValue: '' });
    setShowModal(true);
  }

  function openEdit(rule) {
    setEditRule(rule);
    const cond = Array.isArray(rule.conditions) && rule.conditions.find(c => c.field === '_days_before');
    const days = parseInt(cond?.value || rule.triggerConfig?.daysBeforeDue || 3);
    const firstAction = Array.isArray(rule.actions) ? rule.actions[0]
      : (rule.actions?.type ? rule.actions : null);
    setForm({
      name:        rule.name,
      category:    deriveCategory(rule),
      triggerType: rule.triggerType || 'task_created',
      daysBefore:  days,
      actionType:  firstAction?.type || 'send_notification',
      actionValue: firstAction?.value || '',
    });
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!form.name.trim()) return;
    const conditions = form.triggerType === 'due_date_approaching'
      ? [{ field: '_days_before', operator: 'lte', value: String(form.daysBefore) }]
      : [];
    const actions = [{ type: form.actionType, ...(form.actionValue ? { value: form.actionValue } : {}) }];
    const payload = {
      name:        form.name,
      description: '',
      triggerType: form.triggerType,
      conditions,
      actions,
    };
    try {
      if (editRule) {
        await authFetch(`/api/rules/${editRule.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await authFetch('/api/rules', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId: user.companyId, ...payload }),
        });
      }
      setShowModal(false);
      await load();
    } catch (e) {
      console.error('[RulesPage handleSubmit]', e);
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:BRAND.paper, fontFamily:'inherit' }}>
      {/* Hero */}
      <div style={{ background:BRAND.heroBg, padding: isMobile ? '14px 16px 12px' : '28px 32px 24px', color:'#fff' }}>
        <div style={{ fontSize: 13, fontWeight:600, letterSpacing:'0.1em', opacity:0.6, textTransform:'uppercase', marginBottom:8 }}>
          automation rules
        </div>
        <h1 style={{ fontSize: 28, fontWeight:800, margin:'0 0 4px', letterSpacing:'-0.02em' }}>自動化規則</h1>
        <p style={{ fontSize: 15, opacity:0.7, margin:0 }}>設定觸發條件與執行動作，讓重複性流程自動化</p>
        <div style={{ display:'flex', gap:32, marginTop:20 }}>
          {kpis.map(k => (
            <div key={k.label}>
              <div style={{ fontSize: 26, fontWeight:800, lineHeight:1 }}>{k.value}</div>
              <div style={{ fontSize: 13, opacity:0.6, marginTop:3 }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: isMobile ? '14px 16px' : '24px 32px' }}>
        {/* Top bar */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          {/* Category filter */}
          <div style={{ display:'flex', gap:4 }}>
            {CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => setCatFilter(c)}
                style={{
                  padding:'6px 14px', borderRadius:6, border:'none', cursor:'pointer', fontSize: 15,
                  background: catFilter === c ? BRAND.crimson : BRAND.surfaceSoft,
                  color:      catFilter === c ? '#fff' : BRAND.carbon,
                  fontWeight: catFilter === c ? 600 : 400,
                }}
              >
                {c}
              </button>
            ))}
          </div>
          {canManageRules && <button style={btnPrimary} onClick={openAdd}>+ 新增規則</button>}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ padding:'40px 16px', textAlign:'center', color:BRAND.muted, fontSize: 15 }}>載入中…</div>
        )}

        {/* Table */}
        {!loading && (
          <div style={{ background:BRAND.white, borderRadius:10, border:`1px solid ${BRAND.mist}`, overflowX:'auto' }}>
            <div style={{
              display:'grid', gridTemplateColumns:'1fr 72px 180px 200px 130px 70px 60px 80px',
              padding:'10px 16px', borderBottom:`1px solid ${BRAND.mist}`,
              background:BRAND.surfaceSoft, gap:8, alignItems:'center',
            }}>
              {['規則名稱','類別','觸發條件','執行動作','上次觸發','觸發次數','狀態','操作'].map(h => (
                <span key={h} style={TH_STYLE}>{h}</span>
              ))}
            </div>

            {filtered.length === 0 && (
              <div style={{ padding:'40px 16px', textAlign:'center', color:BRAND.muted, fontSize: 15 }}>沒有符合條件的規則</div>
            )}

            {filtered.map((r, idx) => {
              const triggerText = deriveTrigger(r);
              const actionText  = deriveAction(r);
              const category    = deriveCategory(r);
              const lastRun     = r.lastRun || r.lastTriggeredAt
                ? new Date(r.lastRun || r.lastTriggeredAt).toLocaleString('zh-TW', { timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
                : '—';
              const runCount    = r.runCount || r.triggerCount || 0;

              return (
                <div
                  key={r.id}
                  style={{
                    display:'grid', gridTemplateColumns:'1fr 72px 180px 200px 130px 70px 60px 80px',
                    padding:'13px 16px',
                    borderBottom: idx < filtered.length - 1 ? `1px solid ${BRAND.mist}` : 'none',
                    gap:8, alignItems:'center', transition:'background 0.12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = BRAND.surfaceSoft}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: 15, color:BRAND.ink, fontWeight:500 }}>{r.name}</span>
                  <CategoryBadge cat={category} />
                  <span style={{ fontSize: 14, color:BRAND.carbon, lineHeight:1.4 }}>{triggerText}</span>
                  <span style={{ fontSize: 14, color:BRAND.carbon, lineHeight:1.4 }}>{actionText}</span>
                  <span style={{ fontSize: 14, color:BRAND.muted }}>{lastRun}</span>
                  <span style={{ fontSize: 15, color:BRAND.ink, textAlign:'right' }}>{runCount}</span>
                  <Toggle enabled={r.isEnabled} onChange={() => toggleEnabled(r)} />
                  <span style={{ display:'flex', gap:10 }}>
                    {canManageRules && <button onClick={() => openEdit(r)} style={{ background:'none', border:'none', cursor:'pointer', fontSize: 14, color:BRAND.carbon, padding:0 }}>編輯</button>}
                    {canManageRules && <button onClick={() => deleteRule(r.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize: 14, color:BRAND.muted, padding:0 }}>刪除</button>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:BRAND.white, borderRadius:12, padding: isMobile ? '14px 16px' : '28px 32px', width:480, maxWidth:'90vw' }}>
            <h2 style={{ fontSize: 20, fontWeight:700, margin:'0 0 20px', color:BRAND.ink }}>
              {editRule ? '編輯規則' : '新增規則'}
            </h2>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {/* 規則名稱 */}
              <label style={{ fontSize: 14, fontWeight:600, color:BRAND.carbon }}>
                規則名稱
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder='輸入規則名稱'
                  style={{ display:'block', marginTop:5, width:'100%', boxSizing:'border-box', padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 15, background:BRAND.surface, color:BRAND.ink }}
                />
              </label>

              {/* 類別 */}
              <label style={{ fontSize: 14, fontWeight:600, color:BRAND.carbon }}>
                類別
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  style={{ display:'block', marginTop:5, width:'100%', padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 15, background:BRAND.surface, color:BRAND.ink }}
                >
                  {['通知','標籤','指派','警示'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>

              {/* 觸發條件 */}
              <div>
                <div style={{ fontSize: 14, fontWeight:600, color:BRAND.carbon, marginBottom:5 }}>觸發條件</div>
                <select
                  value={form.triggerType}
                  onChange={e => setForm(f => ({ ...f, triggerType: e.target.value }))}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 15, background:BRAND.surface, color:BRAND.ink }}
                >
                  {Object.entries(TRIGGER_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                {form.triggerType === 'due_date_approaching' && (
                  <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize: 14, color:BRAND.carbon }}>提前</span>
                    <input
                      type='number'
                      min={1} max={90}
                      value={form.daysBefore}
                      onChange={e => setForm(f => ({ ...f, daysBefore: Math.max(1, parseInt(e.target.value) || 1) }))}
                      style={{ width:70, padding:'6px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 15, background:BRAND.surface, color:BRAND.ink, textAlign:'center' }}
                    />
                    <span style={{ fontSize: 14, color:BRAND.carbon }}>天後自動觸發</span>
                  </div>
                )}
              </div>

              {/* 執行動作 */}
              <div>
                <div style={{ fontSize: 14, fontWeight:600, color:BRAND.carbon, marginBottom:5 }}>執行動作</div>
                <select
                  value={form.actionType}
                  onChange={e => setForm(f => ({ ...f, actionType: e.target.value, actionValue: '' }))}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 15, background:BRAND.surface, color:BRAND.ink }}
                >
                  {Object.entries(ACTION_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                {(form.actionType === 'set_status' || form.actionType === 'set_priority') && (
                  <input
                    value={form.actionValue}
                    onChange={e => setForm(f => ({ ...f, actionValue: e.target.value }))}
                    placeholder={form.actionType === 'set_status' ? '目標狀態（如：in_progress）' : '優先度（如：high）'}
                    style={{ display:'block', marginTop:8, width:'100%', boxSizing:'border-box', padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 15, background:BRAND.surface, color:BRAND.ink }}
                  />
                )}
                {form.actionType === 'set_assignee' && (
                  <input
                    value={form.actionValue}
                    onChange={e => setForm(f => ({ ...f, actionValue: e.target.value }))}
                    placeholder='指派對象 User ID'
                    style={{ display:'block', marginTop:8, width:'100%', boxSizing:'border-box', padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 15, background:BRAND.surface, color:BRAND.ink }}
                  />
                )}
              </div>
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:24 }}>
              <button style={btnGhost} onClick={() => setShowModal(false)}>取消</button>
              <button style={btnPrimary} onClick={handleSubmit}>{editRule ? '儲存變更' : '建立規則'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
