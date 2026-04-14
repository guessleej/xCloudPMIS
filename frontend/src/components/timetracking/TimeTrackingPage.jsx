import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useResponsive';

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

// 專案清單由 API 動態載入（see loadProjects）

const TH_STYLE = { fontSize: 13, fontWeight:600, color:BRAND.muted, textTransform:'uppercase', letterSpacing:'0.05em' };

const EMPTY_STATS = {
  weekTotal: 0, monthTotal: 0, todayTotal: 0, dailyAvg: 0,
  weekDays: [
    { day:'週一', date:'--/--', hours:0 },
    { day:'週二', date:'--/--', hours:0 },
    { day:'週三', date:'--/--', hours:0 },
    { day:'週四', date:'--/--', hours:0 },
    { day:'週五', date:'--/--', hours:0 },
    { day:'週六', date:'--/--', hours:0 },
    { day:'週日', date:'--/--', hours:0 },
  ],
};

export default function TimeTrackingPage() {
  const isMobile = useIsMobile();
  const { user, authFetch } = useAuth();

  const [entries,    setEntries]    = useState([]);
  const [stats,      setStats]      = useState(EMPTY_STATS);
  const [weekDays,   setWeekDays]   = useState(EMPTY_STATS.weekDays);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [editEntry,  setEditEntry]  = useState(null);
  const [form,       setForm]       = useState({ project:'', task:'', hours:'', note:'' });
  const [projects,   setProjects]   = useState([]);

  // 載入專案清單（供新增/編輯 modal 的下拉選單使用）
  useEffect(() => {
    if (!user?.companyId) return;
    authFetch(`/api/projects?companyId=${user.companyId}`)
      .then(r => r.json())
      .then(j => {
        const list = j.data || j;
        if (Array.isArray(list)) setProjects(list.map(p => ({ id: p.id, name: p.name })));
      })
      .catch(() => {});
  }, [user?.companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!user?.companyId) return;
    try {
      const res  = await authFetch(`/api/time-tracking?companyId=${user.companyId}&userId=${user.id}`);
      const json = await res.json();
      if (json.success) {
        setEntries(json.data.entries || []);
        const s = json.data.stats || EMPTY_STATS;
        setStats(s);
        setWeekDays(s.weekDays || EMPTY_STATS.weekDays);
      }
    } catch (e) {
      console.error('[TimeTrackingPage load]', e);
    } finally {
      setLoading(false);
    }
  }, [user, authFetch]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditEntry(null);
    setForm({ project:'', task:'', hours:'', note:'' });
    setShowModal(true);
  }

  function openEdit(entry) {
    setEditEntry(entry);
    setForm({ project: entry.project, task: entry.task, hours: String(entry.hours), note: entry.note });
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!form.project || !form.task || !form.hours) return;
    const hours = parseFloat(form.hours);
    if (isNaN(hours) || hours <= 0) return;

    const today = new Date().toISOString().slice(0, 10);

    try {
      if (editEntry) {
        await authFetch(`/api/time-tracking/${editEntry.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ companyId: user.companyId, ...form, hours }),
        });
      } else {
        await authFetch('/api/time-tracking', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            companyId: user.companyId,
            userId:    user.id,
            date:      today,
            project:   form.project,
            task:      form.task,
            hours,
            note:      form.note,
          }),
        });
      }
      setShowModal(false);
      await load();
    } catch (e) {
      console.error('[TimeTrackingPage handleSubmit]', e);
    }
  }

  async function deleteEntry(id) {
    try {
      await authFetch(`/api/time-tracking/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      console.error('[TimeTrackingPage deleteEntry]', e);
    }
  }

  const kpis = [
    { label:'本週工時', value:`${stats.weekTotal}h` },
    { label:'本月工時', value:`${stats.monthTotal}h` },
    { label:'今日記錄', value:`${stats.todayTotal}h` },
    { label:'月均每日', value:`${stats.dailyAvg}h` },
  ];

  return (
    <div style={{ minHeight:'100vh', background:BRAND.paper, fontFamily:'inherit' }}>
      {/* Hero */}
      <div style={{ background:BRAND.heroBg, padding: isMobile ? '14px 16px 12px' : '28px 32px 24px', color:'#fff' }}>
        <div style={{ fontSize: 13, fontWeight:600, letterSpacing:'0.1em', opacity:0.6, textTransform:'uppercase', marginBottom:8 }}>
          time tracking
        </div>
        <h1 style={{ fontSize: 28, fontWeight:800, margin:'0 0 4px', letterSpacing:'-0.02em' }}>工時記錄</h1>
        <p style={{ fontSize: 15, opacity:0.7, margin:0 }}>記錄、統計個人與團隊工時，追蹤每項任務的實際投入</p>
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
        {/* Loading */}
        {loading && (
          <div style={{ padding:'40px 16px', textAlign:'center', color:BRAND.muted, fontSize: 15 }}>載入中…</div>
        )}

        {!loading && (
          <>
            {/* 本週分布 */}
            <div style={{ background:BRAND.white, borderRadius:10, border:`1px solid ${BRAND.mist}`, padding:'16px 20px', marginBottom:20 }}>
              <div style={{ fontSize: 14, fontWeight:600, color:BRAND.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>本週工時分布</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:8 }}>
                {weekDays.map(w => (
                  <div key={w.day} style={{
                    padding:'10px 8px', borderRadius:8, textAlign:'center',
                    background: w.hours > 0 ? BRAND.accentSurface : BRAND.surfaceSoft,
                    border: `1px solid ${w.hours > 0 ? BRAND.accentBorder : BRAND.mist}`,
                  }}>
                    <div style={{ fontSize: 13, color:BRAND.muted, marginBottom:4 }}>{w.day}</div>
                    <div style={{ fontSize: 12, color:BRAND.muted, marginBottom:6 }}>{w.date}</div>
                    <div style={{
                      fontSize: 17, fontWeight:700,
                      color: w.hours > 0 ? BRAND.crimson : BRAND.silver,
                    }}>{w.hours > 0 ? `${w.hours}h` : '—'}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Table header row */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontSize: 16, fontWeight:600, color:BRAND.ink }}>工時紀錄</div>
              <button style={btnPrimary} onClick={openAdd}>+ 記錄工時</button>
            </div>

            {/* Table */}
            <div style={{ background:BRAND.white, borderRadius:10, border:`1px solid ${BRAND.mist}`, overflow:'hidden' }}>
              <div style={{
                display:'grid', gridTemplateColumns:'110px 140px 1fr 70px 1fr 100px',
                padding:'10px 16px', borderBottom:`1px solid ${BRAND.mist}`,
                background:BRAND.surfaceSoft, gap:8, alignItems:'center',
              }}>
                {['日期','專案','任務','工時 h','備注','操作'].map(h => (
                  <span key={h} style={TH_STYLE}>{h}</span>
                ))}
              </div>

              {entries.length === 0 && (
                <div style={{ padding:'40px 16px', textAlign:'center', color:BRAND.muted, fontSize: 15 }}>尚無工時記錄</div>
              )}

              {entries.map((e, idx) => (
                <div
                  key={e.id}
                  style={{
                    display:'grid', gridTemplateColumns:'110px 140px 1fr 70px 1fr 100px',
                    padding:'12px 16px',
                    borderBottom: idx < entries.length - 1 ? `1px solid ${BRAND.mist}` : 'none',
                    gap:8, alignItems:'center', transition:'background 0.12s',
                  }}
                  onMouseEnter={ev => ev.currentTarget.style.background = BRAND.surfaceSoft}
                  onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: 14, color:BRAND.muted }}>{e.date}</span>
                  <span style={{ fontSize: 15, color:BRAND.carbon }}>{e.project}</span>
                  <span style={{ fontSize: 15, color:BRAND.ink, fontWeight:500 }}>{e.task}</span>
                  <span style={{ fontSize: 15, fontWeight:700, color:BRAND.crimson }}>{e.hours}h</span>
                  <span style={{ fontSize: 14, color:BRAND.muted }}>{e.note || '—'}</span>
                  <span style={{ display:'flex', gap:10 }}>
                    <button onClick={() => openEdit(e)} style={{ background:'none', border:'none', cursor:'pointer', fontSize: 14, color:BRAND.carbon, padding:0 }}>編輯</button>
                    <button onClick={() => deleteEntry(e.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize: 14, color:BRAND.muted, padding:0 }}>刪除</button>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:BRAND.white, borderRadius:12, padding: isMobile ? '14px 16px' : '28px 32px', width:480, maxWidth:'90vw' }}>
            <h2 style={{ fontSize: 20, fontWeight:700, margin:'0 0 20px', color:BRAND.ink }}>
              {editEntry ? '編輯工時記錄' : '記錄工時'}
            </h2>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <label style={{ fontSize: 14, fontWeight:600, color:BRAND.carbon }}>
                專案
                <select
                  value={form.project}
                  onChange={e => setForm(f => ({ ...f, project: e.target.value }))}
                  style={{ display:'block', marginTop:5, width:'100%', padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 15, background:BRAND.surface, color:BRAND.ink }}
                >
                  <option value=''>— 選擇專案 —</option>
                  {projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </label>

              <label style={{ fontSize: 14, fontWeight:600, color:BRAND.carbon }}>
                任務名稱
                <input
                  value={form.task}
                  onChange={e => setForm(f => ({ ...f, task: e.target.value }))}
                  placeholder='輸入任務名稱'
                  style={{ display:'block', marginTop:5, width:'100%', boxSizing:'border-box', padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 15, background:BRAND.surface, color:BRAND.ink }}
                />
              </label>

              <label style={{ fontSize: 14, fontWeight:600, color:BRAND.carbon }}>
                工時（小時）
                <input
                  type='number' min='0.5' step='0.5'
                  value={form.hours}
                  onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
                  placeholder='例：2.5'
                  style={{ display:'block', marginTop:5, width:'100%', boxSizing:'border-box', padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 15, background:BRAND.surface, color:BRAND.ink }}
                />
              </label>

              <label style={{ fontSize: 14, fontWeight:600, color:BRAND.carbon }}>
                備注
                <input
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder='選填'
                  style={{ display:'block', marginTop:5, width:'100%', boxSizing:'border-box', padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 15, background:BRAND.surface, color:BRAND.ink }}
                />
              </label>
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:24 }}>
              <button style={btnGhost} onClick={() => setShowModal(false)}>取消</button>
              <button style={btnPrimary} onClick={handleSubmit}>確認送出</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
