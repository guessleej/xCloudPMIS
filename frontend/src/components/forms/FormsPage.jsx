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

const btnPrimary = { padding:'7px 16px', borderRadius:7, border:'none', background:BRAND.crimson, color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' };
const btnGhost   = { padding:'7px 16px', borderRadius:7, border:`1px solid ${BRAND.silver}`, background:'transparent', color:BRAND.carbon, fontSize:13, cursor:'pointer' };

const TH_STYLE = { fontSize:11, fontWeight:600, color:BRAND.muted, textTransform:'uppercase', letterSpacing:'0.05em' };

export default function FormsPage() {
  const { user, authFetch } = useAuth();

  const [forms,      setForms]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [expanded,   setExpanded]   = useState(null);
  const [showModal,  setShowModal]  = useState(false);
  const [form,       setForm]       = useState({ name:'', desc:'' });

  const load = useCallback(async () => {
    if (!user?.companyId) return;
    try {
      const res  = await authFetch(`/api/forms?companyId=${user.companyId}`);
      const json = await res.json();
      if (json.success) {
        setForms(json.data || []);
      }
    } catch (e) {
      console.error('[FormsPage load]', e);
    } finally {
      setLoading(false);
    }
  }, [user, authFetch]);

  useEffect(() => { load(); }, [load]);

  const total   = forms.length;
  const active  = forms.filter(f => f.status === 'active').length;
  const monthly = forms.filter(f => f.status === 'active').reduce((s, f) => s + (f.submissions || 0), 0);

  const kpis = [
    { label:'表單總數',   value: total },
    { label:'本月提交',   value: monthly },
    { label:'啟用中',     value: active },
  ];

  function toggleExpand(id) {
    setExpanded(prev => prev === id ? null : id);
  }

  async function toggleStatus(f) {
    const newStatus = f.status === 'active' ? 'inactive' : 'active';
    try {
      await authFetch(`/api/forms/${f.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus, companyId: user.companyId }),
      });
      await load();
    } catch (e) {
      console.error('[FormsPage toggleStatus]', e);
    }
  }

  async function deleteForm(id) {
    try {
      await authFetch(`/api/forms/${id}?companyId=${user.companyId}`, { method: 'DELETE' });
      if (expanded === id) setExpanded(null);
      await load();
    } catch (e) {
      console.error('[FormsPage deleteForm]', e);
    }
  }

  function copyLink(name) {
    const url = `${window.location.origin}/forms/${encodeURIComponent(name)}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    alert(`已複製連結：${url}`);
  }

  async function handleSubmit() {
    if (!form.name.trim()) return;
    try {
      await authFetch('/api/forms', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ companyId: user.companyId, name: form.name, description: form.desc }),
      });
      setShowModal(false);
      setForm({ name:'', desc:'' });
      await load();
    } catch (e) {
      console.error('[FormsPage handleSubmit]', e);
    }
  }

  function formatDate(val) {
    if (!val) return '—';
    try { return new Date(val).toLocaleString('zh-TW', { timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }); }
    catch { return val; }
  }

  return (
    <div style={{ minHeight:'100vh', background:BRAND.paper, fontFamily:'inherit' }}>
      {/* Hero */}
      <div style={{ background:BRAND.heroBg, padding:'28px 32px 24px', color:'#fff' }}>
        <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.1em', opacity:0.6, textTransform:'uppercase', marginBottom:8 }}>
          forms
        </div>
        <h1 style={{ fontSize:26, fontWeight:800, margin:'0 0 4px', letterSpacing:'-0.02em' }}>表單管理</h1>
        <p style={{ fontSize:13, opacity:0.7, margin:0 }}>建立資料蒐集表單，將外部需求直接轉換為任務或記錄</p>
        <div style={{ display:'flex', gap:32, marginTop:20 }}>
          {kpis.map(k => (
            <div key={k.label}>
              <div style={{ fontSize:24, fontWeight:800, lineHeight:1 }}>{k.value}</div>
              <div style={{ fontSize:11, opacity:0.6, marginTop:3 }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding:'24px 32px' }}>
        {/* Action bar */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div style={{ fontSize:14, fontWeight:600, color:BRAND.ink }}>表單列表</div>
          <button style={btnPrimary} onClick={() => { setForm({ name:'', desc:'' }); setShowModal(true); }}>+ 建立表單</button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ padding:'40px 16px', textAlign:'center', color:BRAND.muted, fontSize:13 }}>載入中…</div>
        )}

        {/* Table */}
        {!loading && (
          <div style={{ background:BRAND.white, borderRadius:10, border:`1px solid ${BRAND.mist}`, overflow:'hidden' }}>
            <div style={{
              display:'grid', gridTemplateColumns:'1fr 90px 80px 150px 110px 200px',
              padding:'10px 16px', borderBottom:`1px solid ${BRAND.mist}`,
              background:BRAND.surfaceSoft, gap:8, alignItems:'center',
            }}>
              {['表單名稱','狀態','提交次數','最近提交','建立日期','操作'].map(h => (
                <span key={h} style={TH_STYLE}>{h}</span>
              ))}
            </div>

            {forms.length === 0 && (
              <div style={{ padding:'40px 16px', textAlign:'center', color:BRAND.muted, fontSize:13 }}>尚無表單</div>
            )}

            {forms.map((f, idx) => (
              <div key={f.id}>
                <div
                  onClick={() => toggleExpand(f.id)}
                  style={{
                    display:'grid', gridTemplateColumns:'1fr 90px 80px 150px 110px 200px',
                    padding:'13px 16px',
                    borderBottom: expanded === f.id || idx < forms.length - 1 ? `1px solid ${BRAND.mist}` : 'none',
                    gap:8, alignItems:'center', cursor:'pointer',
                    background: expanded === f.id ? BRAND.surfaceSoft : 'transparent',
                    transition:'background 0.12s',
                  }}
                  onMouseEnter={e => { if (expanded !== f.id) e.currentTarget.style.background = BRAND.surfaceSoft; }}
                  onMouseLeave={e => { if (expanded !== f.id) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize:13, color:BRAND.ink, fontWeight:500 }}>{f.name}</span>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background: f.status === 'active' ? '#16824B' : BRAND.silver, display:'inline-block', flexShrink:0 }} />
                    <span style={{ fontSize:12, color: f.status === 'active' ? '#16824B' : BRAND.muted }}>
                      {f.status === 'active' ? '啟用' : '停用'}
                    </span>
                  </span>
                  <span style={{ fontSize:13, color:BRAND.ink, textAlign:'right' }}>{f.submissions || 0}</span>
                  <span style={{ fontSize:12, color:BRAND.muted }}>{formatDate(f.lastSubmit)}</span>
                  <span style={{ fontSize:12, color:BRAND.muted }}>
                    {f.createdAt ? new Date(f.createdAt).toLocaleDateString('zh-TW') : '—'}
                  </span>
                  <span onClick={e => e.stopPropagation()} style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                    <button onClick={() => copyLink(f.name)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:BRAND.info || '#3B82F6', padding:0 }}>複製連結</button>
                    <button onClick={() => toggleStatus(f)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:BRAND.carbon, padding:0 }}>
                      {f.status === 'active' ? '停用' : '啟用'}
                    </button>
                    <button onClick={() => deleteForm(f.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:BRAND.muted, padding:0 }}>刪除</button>
                  </span>
                </div>

                {/* Expanded */}
                {expanded === f.id && (
                  <div style={{ padding:'14px 20px 18px', background:BRAND.surfaceMuted, borderBottom:`1px solid ${BRAND.mist}`, borderLeft:`3px solid ${BRAND.silver}` }}>
                    <div style={{ fontSize:12, color:BRAND.carbon, marginBottom:10 }}>{f.description || '（無說明）'}</div>
                    <div style={{ fontSize:11, fontWeight:600, color:BRAND.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>最近提交</div>
                    <div style={{ fontSize:12, color:BRAND.muted }}>
                      {f.lastSubmit ? `最近一次：${formatDate(f.lastSubmit)}` : '尚無提交紀錄'}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:BRAND.white, borderRadius:12, padding:'28px 32px', width:480, maxWidth:'90vw' }}>
            <h2 style={{ fontSize:18, fontWeight:700, margin:'0 0 20px', color:BRAND.ink }}>建立表單</h2>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <label style={{ fontSize:12, fontWeight:600, color:BRAND.carbon }}>
                表單名稱
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder='輸入表單名稱'
                  style={{ display:'block', marginTop:5, width:'100%', boxSizing:'border-box', padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize:13, background:BRAND.surface, color:BRAND.ink }}
                />
              </label>
              <label style={{ fontSize:12, fontWeight:600, color:BRAND.carbon }}>
                說明
                <textarea
                  value={form.desc}
                  onChange={e => setForm(f => ({ ...f, desc: e.target.value }))}
                  placeholder='表單用途說明（選填）'
                  rows={3}
                  style={{ display:'block', marginTop:5, width:'100%', boxSizing:'border-box', padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize:13, background:BRAND.surface, color:BRAND.ink, resize:'vertical' }}
                />
              </label>
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:24 }}>
              <button style={btnGhost} onClick={() => setShowModal(false)}>取消</button>
              <button style={btnPrimary} onClick={handleSubmit}>建立表單</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
