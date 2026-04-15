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

const btnPrimary = { padding: '7px 16px', borderRadius: 7, border: 'none', background: BRAND.crimson, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' };
const btnGhost   = { padding: '7px 16px', borderRadius: 7, border: `1px solid ${BRAND.silver}`, background: 'transparent', color: BRAND.carbon, fontSize: 15, cursor: 'pointer' };

const FILTERS = [
  { key:'all',      label:'全部' },
  { key:'pending',  label:'待審核' },
  { key:'approved', label:'已批准' },
  { key:'rejected', label:'已拒絕' },
];

function StatusDot({ status }) {
  const map = {
    pending:  { dot: '#C97415', label: '待審核' },
    approved: { dot: '#16824B', label: '已批准' },
    rejected: { dot: BRAND.silver, label: '已拒絕' },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:s.dot, display:'inline-block', flexShrink:0 }} />
      <span style={{ fontSize: 14, color: BRAND.carbon }}>{s.label}</span>
    </span>
  );
}

function ConfidenceText({ value }) {
  const color = value >= 85 ? BRAND.crimson : value >= 70 ? '#C97415' : BRAND.carbon;
  return <span style={{ fontSize: 15, fontWeight:700, color }}>{value}%</span>;
}

const TH_STYLE = { fontSize: 13, fontWeight:600, color:BRAND.muted, textTransform:'uppercase', letterSpacing:'0.05em' };

export default function AiDecisionCenter() {
  const isMobile = useIsMobile();
  const { user, authFetch } = useAuth();

  const [decisions, setDecisions] = useState([]);
  const [stats,     setStats]     = useState({ pending: 0, approved: 0, approvalRate: 0 });
  const [filter,    setFilter]    = useState('all');
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    if (!user?.companyId) return;
    try {
      const res  = await authFetch(`/api/ai?companyId=${user.companyId}`);
      const json = await res.json();
      if (json.success) {
        setDecisions(json.data.decisions || []);
        setStats(json.data.stats || { pending: 0, approved: 0, approvalRate: 0 });
      }
    } catch (e) {
      console.error('[AiDecisionCenter load]', e);
    } finally {
      setLoading(false);
    }
  }, [user, authFetch]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(id, status) {
    try {
      await authFetch(`/api/ai/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status, companyId: user?.companyId }),
      });
      await load();
    } catch (e) {
      console.error('[AiDecisionCenter changeStatus]', e);
    }
  }

  function toggleExpand(id) {
    setExpanded(prev => prev === id ? null : id);
  }

  const kpis = [
    { label:'待審核',   value: stats.pending },
    { label:'本月批准', value: stats.approved },
    { label:'批准率',   value: `${stats.approvalRate}%` },
  ];

  const filtered = filter === 'all' ? decisions : decisions.filter(d => d.status === filter);

  return (
    <div style={{ minHeight:'100vh', background:BRAND.paper, fontFamily:'inherit' }}>
      {/* Hero */}
      <div style={{ background:BRAND.heroBg, padding: isMobile ? '14px 16px 12px' : '28px 32px 24px', color:'#fff' }}>
        <div style={{ fontSize: 13, fontWeight:600, letterSpacing:'0.1em', opacity:0.6, textTransform:'uppercase', marginBottom:8 }}>
          ai decision review
        </div>
        <h1 style={{ fontSize: 28, fontWeight:800, margin:'0 0 4px', letterSpacing:'-0.02em' }}>決策審核</h1>
        <p style={{ fontSize: 15, opacity:0.7, margin:0 }}>審核 AI 生成的行動建議，批准後系統自動執行</p>
        <div style={{ display:'flex', gap:32, marginTop:20 }}>
          {kpis.map(k => (
            <div key={k.label}>
              <div style={{ fontSize: 26, fontWeight:800, lineHeight:1 }}>{k.value}</div>
              <div style={{ fontSize: 13, opacity:0.6, marginTop:3 }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: isMobile ? '14px 16px' : '24px 32px' }}>
        {/* Filter bar */}
        <div style={{ display:'flex', gap:4, marginBottom:20 }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding:'6px 14px', borderRadius:6, border:'none', cursor:'pointer', fontSize: 15,
                background: filter === f.key ? BRAND.crimson : BRAND.surfaceSoft,
                color:      filter === f.key ? '#fff' : BRAND.carbon,
                fontWeight: filter === f.key ? 600 : 400,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ padding:'40px 16px', textAlign:'center', color:BRAND.muted, fontSize: 15 }}>載入中…</div>
        )}

        {/* Table */}
        {!loading && (
          <div style={{ background:BRAND.white, borderRadius:10, border:`1px solid ${BRAND.mist}`, overflow:'hidden' }}>
            {/* Header */}
            <div style={{
              display:'grid', gridTemplateColumns:'100px 1fr 120px 64px 150px 90px 120px',
              padding:'10px 16px', borderBottom:`1px solid ${BRAND.mist}`,
              background:BRAND.surfaceSoft, gap:8, alignItems:'center',
            }}>
              {['類型','標題','影響範圍','信心','提出時間','狀態','操作'].map(h => (
                <span key={h} style={TH_STYLE}>{h}</span>
              ))}
            </div>

            {filtered.length === 0 && (
              <div style={{ padding:'40px 16px', textAlign:'center', color:BRAND.muted, fontSize: 15 }}>
                目前沒有符合條件的決策紀錄
              </div>
            )}

            {filtered.map((d, idx) => (
              <div key={d.id}>
                <div
                  onClick={() => toggleExpand(d.id)}
                  style={{
                    display:'grid', gridTemplateColumns:'100px 1fr 120px 64px 150px 90px 120px',
                    padding:'13px 16px',
                    borderBottom: idx < filtered.length - 1 || expanded === d.id ? `1px solid ${BRAND.mist}` : 'none',
                    gap:8, cursor:'pointer', alignItems:'center',
                    background: expanded === d.id ? BRAND.accentSurface : 'transparent',
                    transition:'background 0.15s',
                  }}
                  onMouseEnter={e => { if (expanded !== d.id) e.currentTarget.style.background = BRAND.surfaceSoft; }}
                  onMouseLeave={e => { if (expanded !== d.id) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 14, color:BRAND.carbon, fontWeight:500 }}>{d.type}</span>
                  <span style={{ fontSize: 15, color:BRAND.ink, fontWeight:500 }}>{d.title}</span>
                  <span style={{ fontSize: 14, color:BRAND.carbon }}>{d.scope}</span>
                  <ConfidenceText value={d.confidence} />
                  <span style={{ fontSize: 14, color:BRAND.muted }}>
                    {d.createdAt ? new Date(d.createdAt).toLocaleString('zh-TW', { timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'}
                  </span>
                  <StatusDot status={d.status} />
                  <span onClick={e => e.stopPropagation()}>
                    {d.status === 'pending' ? (
                      <span style={{ display:'flex', gap:10 }}>
                        <button
                          onClick={() => changeStatus(d.id, 'approved')}
                          style={{ background:'none', border:'none', cursor:'pointer', fontSize: 14, color:'#16824B', fontWeight:600, padding:0 }}
                        >批准</button>
                        <button
                          onClick={() => changeStatus(d.id, 'rejected')}
                          style={{ background:'none', border:'none', cursor:'pointer', fontSize: 14, color:BRAND.muted, fontWeight:500, padding:0 }}
                        >拒絕</button>
                      </span>
                    ) : (
                      <span style={{ color:BRAND.muted, fontSize: 15 }}>—</span>
                    )}
                  </span>
                </div>

                {/* Accordion detail */}
                {expanded === d.id && (
                  <div style={{
                    padding:'14px 20px 18px 20px',
                    background:BRAND.accentSurface,
                    borderBottom:`1px solid ${BRAND.accentBorder}`,
                    borderLeft:`3px solid ${BRAND.crimson}`,
                  }}>
                    <div style={{ fontSize: 13, fontWeight:600, color:BRAND.crimson, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>
                      AI 分析說明
                    </div>
                    <p style={{ fontSize: 15, color:BRAND.ink, lineHeight:1.75, margin:0 }}>{d.detail}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
