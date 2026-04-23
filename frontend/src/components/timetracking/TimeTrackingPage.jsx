import { useState, useEffect, useCallback, useMemo } from 'react';
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

  const [viewMode,   setViewMode]   = useState('personal'); // 'personal' | 'team'
  const [entries,    setEntries]    = useState([]);
  const [allEntries, setAllEntries] = useState([]); // 全團隊
  const [stats,      setStats]      = useState(EMPTY_STATS);
  const [weekDays,   setWeekDays]   = useState(EMPTY_STATS.weekDays);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [editEntry,  setEditEntry]  = useState(null);
  const [form,       setForm]       = useState({ projectId:'', project:'', task:'', hours:'', note:'' });
  const [projects,   setProjects]   = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);

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
      const [personalRes, teamRes] = await Promise.all([
        authFetch(`/api/time-tracking?companyId=${user.companyId}&userId=${user.id}`),
        authFetch(`/api/time-tracking?companyId=${user.companyId}`),
      ]);
      const [personalJson, teamJson] = await Promise.all([personalRes.json(), teamRes.json()]);
      if (personalJson.success) {
        setEntries(personalJson.data.entries || []);
        const s = personalJson.data.stats || EMPTY_STATS;
        setStats(s);
        setWeekDays(s.weekDays || EMPTY_STATS.weekDays);
      }
      if (teamJson.success) {
        setAllEntries(teamJson.data.entries || []);
      }
    } catch (e) {
      console.error('[TimeTrackingPage load]', e);
    } finally {
      setLoading(false);
    }
  }, [user, authFetch]);

  useEffect(() => { load(); }, [load]);

  // 選擇專案後動態載入該專案任務
  useEffect(() => {
    if (!form.projectId) { setProjectTasks([]); return; }
    setTasksLoading(true);
    authFetch(`/api/projects/${form.projectId}/tasks`)
      .then(r => r.json())
      .then(j => {
        const list = j.data || j;
        if (Array.isArray(list)) setProjectTasks(list.map(t => ({ id: t.id, title: t.title })));
        else setProjectTasks([]);
      })
      .catch(() => setProjectTasks([]))
      .finally(() => setTasksLoading(false));
  }, [form.projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  function openAdd() {
    setEditEntry(null);
    setProjectTasks([]);
    setForm({ projectId:'', project:'', task:'', hours:'', note:'' });
    setShowModal(true);
  }

  function openEdit(entry) {
    setEditEntry(entry);
    const matched = projects.find(p => p.name === entry.project);
    setForm({ projectId: matched?.id ? String(matched.id) : '', project: entry.project, task: entry.task, hours: String(entry.hours), note: entry.note });
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!form.projectId || !form.task || !form.hours) return;
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

  // 團隊統計：依成員分組
  const teamStats = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const map = {};
    for (const e of allEntries) {
      const uid = e.userId ?? e.user?.id;
      const uname = e.user?.name || `成員 ${uid}`;
      if (!map[uid]) map[uid] = { userId: uid, name: uname, weekTotal: 0, monthTotal: 0, todayTotal: 0, entries: [] };
      map[uid].entries.push(e);
      if (new Date(e.date) >= monday) map[uid].weekTotal += (e.hours || 0);
      if (new Date(e.date) >= monthStart) map[uid].monthTotal += (e.hours || 0);
      if (e.date === today) map[uid].todayTotal += (e.hours || 0);
    }
    return Object.values(map).sort((a, b) => b.weekTotal - a.weekTotal);
  }, [allEntries]);

  const teamWeekMax = teamStats.reduce((m, t) => Math.max(m, t.weekTotal), 0) || 1;
  const teamTotalWeek = teamStats.reduce((s, t) => s + t.weekTotal, 0);
  const teamTotalMonth = teamStats.reduce((s, t) => s + t.monthTotal, 0);

  return (
    <div style={{ minHeight:'100vh', background:BRAND.paper, fontFamily:'inherit' }}>
      {/* Hero */}
      <div style={{ background:BRAND.heroBg, padding: isMobile ? '14px 16px 12px' : '28px 32px 24px', color:'#fff' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight:600, letterSpacing:'0.1em', opacity:0.6, textTransform:'uppercase', marginBottom:8 }}>time tracking</div>
            <h1 style={{ fontSize: 28, fontWeight:800, margin:'0 0 4px', letterSpacing:'-0.02em' }}>工時記錄</h1>
            <p style={{ fontSize: 15, opacity:0.7, margin:0 }}>記錄、統計個人與團隊工時，追蹤每項任務的實際投入</p>
          </div>
          {/* 個人/團隊 切換 */}
          <div style={{ display:'flex', background:'rgba(255,255,255,0.12)', borderRadius:9, padding:3, gap:2, flexShrink:0 }}>
            {[['personal','👤 個人'],['team','👥 團隊']].map(([mode, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                padding:'6px 18px', borderRadius:7, border:'none', cursor:'pointer',
                fontSize: 14, fontWeight:600, transition:'all 0.15s',
                background: viewMode === mode ? '#fff' : 'transparent',
                color: viewMode === mode ? BRAND.crimson : 'rgba(255,255,255,0.75)',
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* 指標列 */}
        <div style={{ display:'flex', gap:32, marginTop:20, flexWrap:'wrap' }}>
          {viewMode === 'personal' ? kpis.map(k => (
            <div key={k.label}>
              <div style={{ fontSize: 26, fontWeight:800, lineHeight:1 }}>{k.value}</div>
              <div style={{ fontSize: 13, opacity:0.6, marginTop:3 }}>{k.label}</div>
            </div>
          )) : [
            { label:'本週團隊工時', value:`${Math.round(teamTotalWeek * 10)/10}h` },
            { label:'本月團隊工時', value:`${Math.round(teamTotalMonth * 10)/10}h` },
            { label:'團隊人數', value:`${teamStats.length} 人` },
            { label:'人均本週', value:`${teamStats.length ? Math.round(teamTotalWeek/teamStats.length*10)/10 : 0}h` },
          ].map(k => (
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

        {!loading && viewMode === 'personal' && (
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

        {!loading && viewMode === 'team' && (
          <>
            {/* 成員工時排行 */}
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize: 16, fontWeight:600, color:BRAND.ink, marginBottom:14 }}>成員本週工時</div>
              {teamStats.length === 0 && (
                <div style={{ padding:'32px 0', textAlign:'center', color:BRAND.muted }}>本週尚無任何工時記錄</div>
              )}
              <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px,1fr))', gap:12 }}>
                {teamStats.map((m, idx) => {
                  const pct = Math.round((m.weekTotal / teamWeekMax) * 100);
                  const isMe = String(m.userId) === String(user?.id);
                  return (
                    <div key={m.userId} style={{
                      background: BRAND.white, borderRadius:10,
                      border: `1px solid ${isMe ? BRAND.accentBorder : BRAND.mist}`,
                      padding:'16px 18px',
                    }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                        <div style={{
                          width:34, height:34, borderRadius:'50%', flexShrink:0,
                          background: `hsl(${(m.userId * 47) % 360},50%,55%)`,
                          color:'#fff', display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize: 14, fontWeight:700,
                        }}>
                          {m.name.slice(0,1)}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize: 15, fontWeight:600, color:BRAND.ink, display:'flex', alignItems:'center', gap:6 }}>
                            {m.name}
                            {isMe && <span style={{ fontSize:11, background:BRAND.accentSoft, color:BRAND.crimson, padding:'1px 6px', borderRadius:4, fontWeight:700 }}>我</span>}
                            {idx === 0 && <span style={{ fontSize:12 }}>🥇</span>}
                          </div>
                          <div style={{ fontSize: 13, color:BRAND.muted }}>本月 {Math.round(m.monthTotal * 10)/10}h</div>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <div style={{ fontSize: 20, fontWeight:800, color:BRAND.crimson }}>{Math.round(m.weekTotal * 10)/10}h</div>
                          <div style={{ fontSize: 11, color:BRAND.muted }}>本週</div>
                        </div>
                      </div>
                      {/* 進度條 */}
                      <div style={{ height:5, borderRadius:3, background:BRAND.surfaceSoft, overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:3, width:`${pct}%`, background: isMe ? BRAND.crimson : `hsl(${(m.userId * 47) % 360},50%,55%)`, transition:'width 0.4s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 全團隊工時紀錄表 */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontSize: 16, fontWeight:600, color:BRAND.ink }}>全團隊工時紀錄</div>
              <button style={btnPrimary} onClick={openAdd}>+ 記錄工時</button>
            </div>
            <div style={{ background:BRAND.white, borderRadius:10, border:`1px solid ${BRAND.mist}`, overflow:'hidden' }}>
              <div style={{
                display:'grid', gridTemplateColumns:'110px 120px 130px 1fr 70px',
                padding:'10px 16px', borderBottom:`1px solid ${BRAND.mist}`,
                background:BRAND.surfaceSoft, gap:8, alignItems:'center',
              }}>
                {['日期','成員','專案','任務','工時 h'].map(h => (
                  <span key={h} style={TH_STYLE}>{h}</span>
                ))}
              </div>
              {allEntries.length === 0 && (
                <div style={{ padding:'40px 16px', textAlign:'center', color:BRAND.muted, fontSize: 15 }}>尚無工時記錄</div>
              )}
              {allEntries.map((e, idx) => (
                <div key={e.id} style={{
                  display:'grid', gridTemplateColumns:'110px 120px 130px 1fr 70px',
                  padding:'11px 16px',
                  borderBottom: idx < allEntries.length - 1 ? `1px solid ${BRAND.mist}` : 'none',
                  gap:8, alignItems:'center', transition:'background 0.12s',
                  background: String(e.userId) === String(user?.id) ? BRAND.accentSurface : 'transparent',
                }}
                  onMouseEnter={ev => ev.currentTarget.style.background = BRAND.surfaceSoft}
                  onMouseLeave={ev => ev.currentTarget.style.background = String(e.userId) === String(user?.id) ? BRAND.accentSurface : 'transparent'}
                >
                  <span style={{ fontSize: 14, color:BRAND.muted }}>{e.date}</span>
                  <span style={{ fontSize: 14, color:BRAND.carbon, fontWeight:500 }}>{e.user?.name || `#${e.userId}`}</span>
                  <span style={{ fontSize: 14, color:BRAND.carbon }}>{e.project}</span>
                  <span style={{ fontSize: 14, color:BRAND.ink }}>{e.task}</span>
                  <span style={{ fontSize: 15, fontWeight:700, color:BRAND.crimson }}>{e.hours}h</span>
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
                  value={form.projectId}
                  onChange={e => {
                    const pid = e.target.value;
                    const pname = projects.find(p => String(p.id) === pid)?.name || '';
                    setForm(f => ({ ...f, projectId: pid, project: pname, task: '' }));
                  }}
                  style={{ display:'block', marginTop:5, width:'100%', padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 15, background:BRAND.surface, color:BRAND.ink }}
                >
                  <option value=''>— 選擇專案 —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>

              <label style={{ fontSize: 14, fontWeight:600, color:BRAND.carbon }}>
                任務
                {!form.projectId ? (
                  <div style={{ marginTop:5, padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 14, color:BRAND.muted, background:BRAND.surfaceSoft }}>請先選擇專案</div>
                ) : tasksLoading ? (
                  <div style={{ marginTop:5, padding:'8px 10px', fontSize: 14, color:BRAND.muted }}>載入任務中…</div>
                ) : (
                  <select
                    value={form.task}
                    onChange={e => setForm(f => ({ ...f, task: e.target.value }))}
                    style={{ display:'block', marginTop:5, width:'100%', padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 15, background:BRAND.surface, color:form.task ? BRAND.ink : BRAND.muted }}
                  >
                    <option value=''>— 選擇任務 —</option>
                    {projectTasks.map(t => <option key={t.id} value={t.title}>{t.title}</option>)}
                    {projectTasks.length === 0 && <option disabled>此專案尚無任務</option>}
                  </select>
                )}
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
