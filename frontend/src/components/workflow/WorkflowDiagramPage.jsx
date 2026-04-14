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

const TH_STYLE = { fontSize: 13, fontWeight:600, color:BRAND.muted, textTransform:'uppercase', letterSpacing:'0.05em' };

export default function WorkflowDiagramPage() {
  const isMobile = useIsMobile();
  const { user, authFetch } = useAuth();

  const [workflows,     setWorkflows]     = useState([]);
  const [activeWorkflow, setActiveWorkflow] = useState(null);
  const [selectedNode,  setSelectedNode]  = useState(null);
  const [hoveredNode,   setHoveredNode]   = useState(null);
  const [loading,       setLoading]       = useState(true);

  const load = useCallback(async () => {
    if (!user?.companyId) return;
    try {
      const res  = await authFetch(`/api/workflow?companyId=${user.companyId}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        setWorkflows(json.data);
        setActiveWorkflow(json.data[0]);
      }
    } catch (e) {
      console.error('[WorkflowDiagramPage load]', e);
    } finally {
      setLoading(false);
    }
  }, [user, authFetch]);

  useEffect(() => { load(); }, [load]);

  const totalNodes = workflows.reduce((s, w) => s + (w.nodes?.length || 0), 0);
  const totalRules = workflows.reduce((s, w) => s + (w.rules?.length || 0), 0);

  const kpis = [
    { label:'流程數',       value: workflows.length },
    { label:'狀態節點數',   value: totalNodes },
    { label:'自動觸發規則', value: totalRules },
  ];

  function selectFlow(id) {
    const found = workflows.find(w => w.id === id);
    if (found) {
      setActiveWorkflow(found);
      setSelectedNode(null);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight:'100vh', background:BRAND.paper, fontFamily:'inherit' }}>
        <div style={{ background:BRAND.heroBg, padding: isMobile ? '14px 16px 12px' : '28px 32px 24px', color:'#fff' }}>
          <h1 style={{ fontSize: 28, fontWeight:800, margin:0 }}>工作流程</h1>
        </div>
        <div style={{ padding:'40px 32px', textAlign:'center', color:BRAND.muted, fontSize: 15 }}>載入中…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', background:BRAND.paper, fontFamily:'inherit' }}>
      {/* Hero */}
      <div style={{ background:BRAND.heroBg, padding: isMobile ? '14px 16px 12px' : '28px 32px 24px', color:'#fff' }}>
        <div style={{ fontSize: 13, fontWeight:600, letterSpacing:'0.1em', opacity:0.6, textTransform:'uppercase', marginBottom:8 }}>
          workflow
        </div>
        <h1 style={{ fontSize: 28, fontWeight:800, margin:'0 0 4px', letterSpacing:'-0.02em' }}>工作流程</h1>
        <p style={{ fontSize: 15, opacity:0.7, margin:0 }}>定義任務狀態流轉規則，確保流程標準化與可追蹤</p>
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
        {/* Flow selector */}
        {workflows.length > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
            <span style={{ fontSize: 15, color:BRAND.carbon, fontWeight:500 }}>選擇流程：</span>
            <select
              value={activeWorkflow?.id || ''}
              onChange={e => selectFlow(e.target.value)}
              style={{ padding:'8px 12px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 15, background:BRAND.white, color:BRAND.ink, cursor:'pointer' }}
            >
              {workflows.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        )}

        {!activeWorkflow && (
          <div style={{ padding:'40px 16px', textAlign:'center', color:BRAND.muted, fontSize: 15 }}>尚無工作流程資料</div>
        )}

        {activeWorkflow && (
          <>
            {/* Flow diagram */}
            <div style={{ background:BRAND.white, borderRadius:10, border:`1px solid ${BRAND.mist}`, padding:'24px 20px', marginBottom:20 }}>
              <div style={{ fontSize: 14, fontWeight:600, color:BRAND.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:20 }}>
                {activeWorkflow.name} — 狀態節點
              </div>
              <div style={{ display:'flex', alignItems:'stretch', gap:0, overflowX:'auto' }}>
                {(activeWorkflow.nodes || []).map((node, idx) => (
                  <div key={node.id} style={{ display:'flex', alignItems:'center', flexShrink:0 }}>
                    {/* Node card */}
                    <div
                      onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                      onMouseEnter={() => setHoveredNode(node.id)}
                      onMouseLeave={() => setHoveredNode(null)}
                      style={{
                        width:160, padding:'16px 14px', borderRadius:8, cursor:'pointer',
                        border:`1px solid ${selectedNode === node.id ? node.color : BRAND.mist}`,
                        background: selectedNode === node.id
                          ? `color-mix(in srgb, ${node.color} 8%, var(--xc-surface))`
                          : hoveredNode === node.id ? BRAND.surfaceSoft : BRAND.surface,
                        borderLeft:`3px solid ${node.color}`,
                        transition:'all 0.15s',
                        boxShadow: selectedNode === node.id ? `0 2px 8px color-mix(in srgb, ${node.color} 20%, transparent)` : 'none',
                      }}
                    >
                      <div style={{ fontSize: 15, fontWeight:700, color:BRAND.ink, marginBottom:4 }}>{node.label}</div>
                      <div style={{ fontSize: 13, color:BRAND.muted, marginBottom:10, lineHeight:1.4 }}>{node.desc}</div>
                      <div style={{
                        display:'inline-block', padding:'2px 8px', borderRadius:4,
                        background:`color-mix(in srgb, ${node.color} 12%, var(--xc-surface-soft))`,
                        fontSize: 13, fontWeight:600, color:node.color,
                      }}>
                        {node.count} 項
                      </div>
                    </div>

                    {/* Arrow between nodes */}
                    {idx < (activeWorkflow.nodes || []).length - 1 && (
                      <div style={{ display:'flex', alignItems:'center', padding:'0 6px', color:BRAND.silver, fontSize: 17, flexShrink:0 }}>
                        →
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Selected node detail */}
            {selectedNode && (() => {
              const node = (activeWorkflow.nodes || []).find(n => n.id === selectedNode);
              return node ? (
                <div style={{ background:BRAND.white, borderRadius:10, border:`1px solid ${BRAND.accentBorder}`, padding:'16px 20px', marginBottom:20, borderLeft:`3px solid ${node.color}` }}>
                  <div style={{ fontSize: 14, fontWeight:600, color:BRAND.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>
                    {node.label} — 節點資訊
                  </div>
                  <div style={{ fontSize: 15, color:BRAND.ink }}>{node.desc}</div>
                  <div style={{ marginTop:8, fontSize: 15, color:BRAND.carbon }}>
                    目前項目數：<span style={{ fontWeight:700, color:node.color }}>{node.count}</span>
                  </div>
                </div>
              ) : null;
            })()}

            {/* Rules table */}
            <div style={{ background:BRAND.white, borderRadius:10, border:`1px solid ${BRAND.mist}`, overflow:'hidden' }}>
              <div style={{ padding:'14px 20px', borderBottom:`1px solid ${BRAND.mist}`, background:BRAND.surfaceSoft }}>
                <div style={{ fontSize: 15, fontWeight:600, color:BRAND.ink }}>流程規則</div>
              </div>
              <div style={{
                display:'grid', gridTemplateColumns:'1fr 1fr 80px',
                padding:'10px 16px', borderBottom:`1px solid ${BRAND.mist}`,
                background:BRAND.surfaceMuted, gap:8,
              }}>
                {['觸發條件','執行動作','狀態'].map(h => (
                  <span key={h} style={TH_STYLE}>{h}</span>
                ))}
              </div>
              {(activeWorkflow.rules || []).map((r, idx) => (
                <div
                  key={r.id}
                  style={{
                    display:'grid', gridTemplateColumns:'1fr 1fr 80px',
                    padding:'12px 16px',
                    borderBottom: idx < (activeWorkflow.rules || []).length - 1 ? `1px solid ${BRAND.mist}` : 'none',
                    gap:8, alignItems:'center', transition:'background 0.12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = BRAND.surfaceSoft}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: 15, color:BRAND.ink }}>{r.trigger}</span>
                  <span style={{ fontSize: 15, color:BRAND.carbon }}>{r.action}</span>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background: r.enabled ? '#16824B' : BRAND.silver, display:'inline-block' }} />
                    <span style={{ fontSize: 14, color: r.enabled ? '#16824B' : BRAND.muted }}>
                      {r.enabled ? '啟用' : '停用'}
                    </span>
                  </span>
                </div>
              ))}
              {(activeWorkflow.rules || []).length === 0 && (
                <div style={{ padding:'20px 16px', textAlign:'center', color:BRAND.muted, fontSize: 15 }}>尚無流程規則</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
