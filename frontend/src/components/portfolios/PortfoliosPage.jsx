/**
 * PortfoliosPage — P3#38-41 多專案集合健康監控
 *
 * 企業 Portfolio 視圖：
 *   - 總體健康 KPI 欄
 *   - 健康狀態分布環形圖
 *   - 專案卡片牆（可切換列表/卡片）
 *   - 每張卡：進度條、逾期任務警示、成員數、工時
 *   - 篩選：健康狀態 / 狀態
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

// ── 常數 ─────────────────────────────────────────────────────
const HEALTH_CFG = {
  healthy:  { label: '健康',   color: '#10b981', icon: '🟢' },
  off_track: { label: '輕度落後', color: '#f59e0b', icon: '🟡' },
  at_risk:  { label: '有風險', color: '#ef4444', icon: '🔴' },
  on_hold:  { label: '暫停中', color: '#6b7280', icon: '⚪' },
};

const STATUS_CFG = {
  active:    { label: '進行中', color: '#3b82f6' },
  completed: { label: '已完成', color: '#10b981' },
  on_hold:   { label: '暫停中', color: '#6b7280' },
  planning:  { label: '規劃中', color: '#8b5cf6' },
};

// ── 隱私設定 ──────────────────────────────────────────────────
const ACCESS_CFG = {
  public:  { label: '公開',     icon: '🌐', color: '#10b981', bg: 'rgba(16,185,129,.1)',  desc: '工作空間所有人可見' },
  team:    { label: '僅成員',   icon: '👥', color: '#3b82f6', bg: 'rgba(59,130,246,.1)',  desc: '僅專案成員可見' },
  private: { label: '私人',     icon: '🔒', color: '#6b7280', bg: 'rgba(107,114,128,.1)', desc: '僅建立者可見' },
};
const ACCESS_ORDER = ['public', 'team', 'private'];

function AccessBadge({ access, projectId, onChanged }) {
  const [open, setOpen] = useState(false);
  const cfg = ACCESS_CFG[access] || ACCESS_CFG.team;
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        title={cfg.desc}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 8, cursor: 'pointer',
          background: cfg.bg, color: cfg.color,
          fontSize: 10, fontWeight: 700, border: 'none',
          letterSpacing: '0.02em',
        }}
      >
        {cfg.icon} {cfg.label}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '110%', left: 0, zIndex: 100,
          background: 'var(--xc-surface)', border: '1px solid var(--xc-border)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.15)',
          minWidth: 160, overflow: 'hidden',
        }}
          onMouseLeave={() => setOpen(false)}
        >
          {ACCESS_ORDER.map(k => {
            const c = ACCESS_CFG[k];
            return (
              <button key={k} onClick={e => { e.stopPropagation(); onChanged(projectId, k); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 14px', background: k === access ? c.bg : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 14 }}>{c.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: c.color }}>{c.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--xc-text-muted)' }}>{c.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 環形圖 ────────────────────────────────────────────────────
function HealthDonut({ summary }) {
  const data = [
    { name: '健康',   value: summary.healthy   || 0, color: '#10b981' },
    { name: '輕度落後', value: summary.off_track || 0, color: '#f59e0b' },
    { name: '有風險', value: summary.at_risk    || 0, color: '#ef4444' },
    { name: '暫停中', value: summary.on_hold    || 0, color: '#9ca3af' },
  ].filter(d => d.value > 0);

  if (data.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
      <ResponsiveContainer width={120} height={120}>
        <PieChart>
          <Pie data={data} cx={55} cy={55} innerRadius={35} outerRadius={55} dataKey="value" strokeWidth={0}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip
            formatter={(v, n) => [v, n]}
            contentStyle={{ background: 'var(--xc-surface)', border: '1px solid var(--xc-border)', borderRadius: '8px', fontSize: '12px' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {data.map(d => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: d.color, flexShrink: 0 }} />
            <span style={{ fontSize: '12px', color: 'var(--xc-text-soft)' }}>{d.name}</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: d.color, marginLeft: 'auto' }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 專案卡片 ─────────────────────────────────────────────────
function ProjectCard({ project, onAccessChange }) {
  const hCfg = HEALTH_CFG[project.health] || HEALTH_CFG.healthy;
  const sCfg = STATUS_CFG[project.status] || STATUS_CFG.active;
  const pctColor = project.progress >= 80 ? '#10b981' : project.progress >= 50 ? '#f59e0b' : '#3b82f6';

  return (
    <div style={{
      background:   'var(--xc-surface)',
      border:       `1px solid ${project.health === 'at_risk' ? 'rgba(239,68,68,.3)' : 'var(--xc-border)'}`,
      borderRadius: '14px',
      padding:      '18px 20px',
      display:      'flex', flexDirection: 'column', gap: '12px',
      transition:   'box-shadow .15s',
    }}>
      {/* 頭部：名稱 + 健康標籤 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--xc-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {project.name}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--xc-text-muted)', marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: sCfg.color }}>● {sCfg.label}</span>
            {project.memberCount > 0 && <span>👤 {project.memberCount} 人</span>}
            {project.totalHours > 0 && <span>⏱ {project.totalHours}h</span>}
            <AccessBadge access={project.access || 'team'} projectId={project.id} onChanged={onAccessChange} />
          </div>
        </div>
        <div style={{
          padding: '3px 8px', borderRadius: '8px',
          background: `${hCfg.color}15`, color: hCfg.color,
          fontSize: '11px', fontWeight: 700, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: '4px',
        }}>
          {hCfg.icon} {hCfg.label}
        </div>
      </div>

      {/* 進度條 */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
          <span style={{ fontSize: '11px', color: 'var(--xc-text-muted)' }}>任務完成率</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: pctColor }}>{project.progress}%</span>
        </div>
        <div style={{ height: '6px', borderRadius: '999px', background: 'var(--xc-border)', overflow: 'hidden' }}>
          <div style={{ width: `${project.progress}%`, height: '100%', background: pctColor, borderRadius: '999px', transition: 'width .5s ease' }} />
        </div>
      </div>

      {/* 任務統計 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
        {[
          { label: '總計', value: project.total, color: 'var(--xc-text-soft)' },
          { label: '完成', value: project.done, color: '#10b981' },
          { label: '進行', value: project.inProgress, color: '#3b82f6' },
          { label: '逾期', value: project.overdue, color: project.overdue > 0 ? '#ef4444' : 'var(--xc-text-muted)' },
        ].map(s => (
          <div key={s.label} style={{
            background:   'var(--xc-surface-soft)',
            borderRadius: '6px', padding: '6px 8px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--xc-text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 逾期警示 */}
      {project.overdue > 0 && (
        <div style={{
          padding: '6px 10px', borderRadius: '8px',
          background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)',
          fontSize: '11px', color: '#ef4444', fontWeight: 600,
        }}>
          ⏰ {project.overdue} 個任務逾期，需要立即關注
        </div>
      )}
    </div>
  );
}

// ── 列表行 ────────────────────────────────────────────────────
function ProjectRow({ project, onAccessChange }) {
  const hCfg = HEALTH_CFG[project.health] || HEALTH_CFG.healthy;
  const sCfg = STATUS_CFG[project.status] || STATUS_CFG.active;
  const pctColor = project.progress >= 80 ? '#10b981' : project.progress >= 50 ? '#f59e0b' : '#3b82f6';

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '2fr 80px 80px 120px 60px 60px 60px 60px',
      alignItems: 'center', gap: '12px',
      padding: '12px 16px',
      borderBottom: '1px solid var(--xc-border)',
    }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--xc-text)' }}>{project.name}</div>
        <div style={{ fontSize: '11px', color: sCfg.color }}>{sCfg.label}</div>
      </div>
      <div style={{
        padding: '3px 6px', borderRadius: '6px', textAlign: 'center',
        background: `${hCfg.color}15`, color: hCfg.color,
        fontSize: '11px', fontWeight: 700,
      }}>{hCfg.icon} {hCfg.label}</div>
      {/* 隱私 */}
      <div><AccessBadge access={project.access || 'team'} projectId={project.id} onChanged={onAccessChange} /></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ flex: 1, height: '6px', borderRadius: '999px', background: 'var(--xc-border)', overflow: 'hidden' }}>
          <div style={{ width: `${project.progress}%`, height: '100%', background: pctColor }} />
        </div>
        <span style={{ fontSize: '11px', fontWeight: 700, color: pctColor, flexShrink: 0 }}>{project.progress}%</span>
      </div>
      <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--xc-text-soft)' }}>{project.total}</div>
      <div style={{ textAlign: 'center', fontSize: '12px', color: '#10b981', fontWeight: 600 }}>{project.done}</div>
      <div style={{ textAlign: 'center', fontSize: '12px', color: project.overdue > 0 ? '#ef4444' : 'var(--xc-text-muted)', fontWeight: project.overdue > 0 ? 700 : 400 }}>
        {project.overdue}
      </div>
      <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--xc-text-soft)' }}>
        {project.memberCount}👤
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 主頁面
// ════════════════════════════════════════════════════════════
export default function PortfoliosPage() {
  const { user, authFetch } = useAuth();
  const companyId = user?.companyId;

  const [projects,     setProjects]     = useState([]);
  const [summary,      setSummary]      = useState({});
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [viewMode,     setViewMode]     = useState('card');  // 'card' | 'list'
  const [filterHealth, setFilterHealth] = useState('');
  const [sortBy,       setSortBy]       = useState('overdue'); // overdue | progress | name

  const load = useCallback(async () => {
    if (!companyId || !authFetch) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res  = await authFetch(`/api/portfolios?companyId=${companyId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const d    = json.data || json;
      setProjects(d.projects || []);
      setSummary(d.summary  || {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId, authFetch]);

  useEffect(() => { load(); }, [load]);

  // ── 隱私設定快速切換 ─────────────────────────────────────
  const handleAccessChange = useCallback(async (projectId, newAccess) => {
    // 樂觀更新 UI
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, access: newAccess } : p));
    try {
      await authFetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: newAccess }),
      });
    } catch (e) {
      console.error('[access patch]', e);
      load(); // 失敗則重新載入恢復原狀
    }
  }, [authFetch, load]);

  // 篩選 + 排序
  const filtered = projects
    .filter(p => !filterHealth || p.health === filterHealth)
    .sort((a, b) => {
      if (sortBy === 'overdue')   return b.overdue - a.overdue;
      if (sortBy === 'progress')  return b.progress - a.progress;
      if (sortBy === 'name')      return a.name.localeCompare(b.name);
      return 0;
    });

  const kpis = [
    { label: '專案總數', value: summary.totalProjects  ?? 0, color: 'var(--xc-brand)',   icon: '📁' },
    { label: '平均進度', value: `${summary.avgProgress ?? 0}%`, color: '#3b82f6',        icon: '📈' },
    { label: '總逾期數', value: summary.totalOverdue   ?? 0, color: '#ef4444',            icon: '⏰' },
    { label: '總工時',   value: `${summary.totalHours ?? 0}h`, color: '#10b981',         icon: '⏱️' },
  ];

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* 頁頭 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--xc-text)', margin: 0 }}>專案集 Portfolio</h1>
          <p style={{ fontSize: '13px', color: 'var(--xc-text-muted)', margin: '4px 0 0' }}>
            多專案健康監控 · 進度一覽 · 逾期預警
          </p>
        </div>
        <button onClick={load} style={{
          padding: '8px 16px', borderRadius: '8px', fontSize: '12px',
          border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
          cursor: 'pointer', color: 'var(--xc-text-soft)',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <span style={{ animation: loading ? 'spin 1s linear infinite' : 'none', display: 'inline-block' }}>⟳</span>
          重新整理
        </button>
      </div>

      {/* KPI 卡片 + 環形圖 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '14px', marginBottom: '24px', alignItems: 'stretch' }}>
        {kpis.map(k => (
          <div key={k.label} style={{
            background: 'var(--xc-surface)', border: '1px solid var(--xc-border)',
            borderRadius: '12px', padding: '16px 18px',
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <span style={{ fontSize: '22px' }}>{k.icon}</span>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: k.color }}>
                {loading ? '—' : k.value}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--xc-text-muted)' }}>{k.label}</div>
            </div>
          </div>
        ))}
        <div style={{
          background: 'var(--xc-surface)', border: '1px solid var(--xc-border)',
          borderRadius: '12px', padding: '16px 20px',
        }}>
          {loading ? (
            <div style={{ width: '160px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--xc-text-muted)', fontSize: '12px' }}>載入中…</div>
          ) : (
            <HealthDonut summary={summary} />
          )}
        </div>
      </div>

      {/* 篩選/排序/切換列 */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* 健康篩選 */}
        <select value={filterHealth} onChange={e => setFilterHealth(e.target.value)} style={{
          padding: '7px 12px', borderRadius: '8px', fontSize: '12px',
          border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
          color: 'var(--xc-text)',
        }}>
          <option value="">所有健康狀態</option>
          {Object.entries(HEALTH_CFG).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>

        {/* 排序 */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
          padding: '7px 12px', borderRadius: '8px', fontSize: '12px',
          border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
          color: 'var(--xc-text)',
        }}>
          <option value="overdue">排序：逾期多 → 少</option>
          <option value="progress">排序：進度高 → 低</option>
          <option value="name">排序：名稱</option>
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', border: '1px solid var(--xc-border)', borderRadius: '8px', overflow: 'hidden' }}>
          {[
            { k: 'card', label: '⊞ 卡片' },
            { k: 'list', label: '☰ 列表' },
          ].map(({ k, label }) => (
            <button key={k} onClick={() => setViewMode(k)} style={{
              padding: '7px 14px', fontSize: '12px', border: 'none',
              background: viewMode === k ? 'var(--xc-brand)' : 'var(--xc-surface)',
              color: viewMode === k ? '#fff' : 'var(--xc-text-soft)',
              cursor: 'pointer', fontWeight: viewMode === k ? 700 : 400,
            }}>{label}</button>
          ))}
        </div>

        <span style={{ fontSize: '12px', color: 'var(--xc-text-muted)' }}>
          顯示 {filtered.length} / {projects.length} 個專案
        </span>
      </div>

      {/* 錯誤 */}
      {error && (
        <div style={{ padding: '16px', borderRadius: '10px', marginBottom: '16px', background: 'color-mix(in srgb, var(--xc-danger) 8%, var(--xc-surface))', border: '1px solid var(--xc-danger)', color: 'var(--xc-danger)', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* 內容區 */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--xc-text-muted)', fontSize: '14px' }}>載入中…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '60px 40px', textAlign: 'center', background: 'var(--xc-surface)', border: '2px dashed var(--xc-border)', borderRadius: '16px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📁</div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--xc-text)', marginBottom: '6px' }}>尚無符合條件的專案</div>
          <div style={{ fontSize: '13px', color: 'var(--xc-text-muted)' }}>調整篩選條件或前往「專案」頁面新增</div>
        </div>
      ) : viewMode === 'card' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {filtered.map(p => <ProjectCard key={p.id} project={p} onAccessChange={handleAccessChange} />)}
        </div>
      ) : (
        <div style={{ background: 'var(--xc-surface)', border: '1px solid var(--xc-border)', borderRadius: '12px', overflow: 'hidden' }}>
          {/* 列表標題 */}
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 80px 80px 120px 60px 60px 60px 60px',
            gap: '12px', padding: '10px 16px',
            background: 'var(--xc-surface-soft)', borderBottom: '1px solid var(--xc-border)',
          }}>
            {['專案名稱', '健康', '隱私', '進度', '總計', '完成', '逾期', '成員'].map(h => (
              <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--xc-text-muted)', textAlign: h !== '專案名稱' ? 'center' : 'left' }}>{h}</div>
            ))}
          </div>
          {filtered.map(p => <ProjectRow key={p.id} project={p} onAccessChange={handleAccessChange} />)}
        </div>
      )}
    </div>
  );
}
