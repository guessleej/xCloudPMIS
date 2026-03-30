/**
 * WorkloadPage — 指派對象 × 任務狀態 資源分配核心場景 (#17)
 *
 * 核心視圖：成員 × 狀態 熱力矩陣
 *   ┌───────────┬──────┬────────┬──────┬──────┬──────┬──────┐
 *   │  成員      │ 待辦 │ 進行中 │ 審核 │ 完成 │ 逾期 │ 容量 │
 *   ├───────────┼──────┼────────┼──────┼──────┼──────┼──────┤
 *   │ 👤 張三   │  5  │   8   │  2  │  15  │  1  │ 🔥🔥🔥 │
 *   │ 👤 李四   │  2  │   3   │  0  │  8   │  0  │ 🔥🔥  │
 *   ├───────────┼──────┼────────┼──────┼──────┼──────┼──────┤
 *   │ 合計       │ 15  │  12   │  3  │  26  │  4  │     │
 *   └───────────┴──────┴────────┴──────┴──────┴──────┴──────┘
 *
 * 點擊任一欄位 → 右側抽屜展開顯示任務明細
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';

const API_BASE = '';

// ── 常數 ─────────────────────────────────────────────────────
const STATUSES = [
  { key: 'todo',        label: '待辦',   color: '#64748b', light: 'rgba(100,116,139,.12)', deep: 'rgba(100,116,139,.90)' },
  { key: 'in_progress', label: '進行中', color: '#3b82f6', light: 'rgba(59,130,246,.12)',  deep: 'rgba(59,130,246,.90)'  },
  { key: 'review',      label: '審核中', color: '#8b5cf6', light: 'rgba(139,92,246,.12)',  deep: 'rgba(139,92,246,.90)'  },
  { key: 'done',        label: '已完成', color: '#22c55e', light: 'rgba(34,197,94,.12)',   deep: 'rgba(34,197,94,.90)'   },
  { key: 'overdue',     label: '逾期',   color: '#ef4444', light: 'rgba(239,68,68,.12)',   deep: 'rgba(239,68,68,.90)'   },
];

const PRIORITY_CFG = {
  urgent: { label: '緊急', color: '#ef4444', bg: 'rgba(239,68,68,.12)' },
  high:   { label: '高',   color: '#f97316', bg: 'rgba(249,115,22,.12)' },
  medium: { label: '中',   color: '#eab308', bg: 'rgba(234,179,8,.12)'  },
  low:    { label: '低',   color: '#94a3b8', bg: 'rgba(148,163,184,.12)' },
};

const CAPACITY_CFG = {
  overloaded: { label: '過載',  bars: 5, color: '#ef4444' },
  heavy:      { label: '偏重',  bars: 4, color: '#f97316' },
  moderate:   { label: '適中',  bars: 3, color: '#eab308' },
  light:      { label: '輕鬆',  bars: 2, color: '#22c55e' },
  free:       { label: '空閒',  bars: 1, color: '#94a3b8' },
};

// ── 小工具 ────────────────────────────────────────────────────
function Avatar({ name, url, size = 28 }) {
  const initial = (name || '?').trim().slice(0, 1).toUpperCase();
  const colors  = ['#3b82f6','#8b5cf6','#ec4899','#f97316','#22c55e','#14b8a6'];
  const bg      = colors[(name?.charCodeAt(0) || 0) % colors.length];
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.44, fontWeight: 700, flexShrink: 0, userSelect: 'none',
    }}>
      {initial}
    </span>
  );
}

function CapacityBars({ capacity }) {
  const cfg = CAPACITY_CFG[capacity] || CAPACITY_CFG.free;
  return (
    <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end' }} title={cfg.label}>
      {[1,2,3,4,5].map(i => (
        <div key={i} style={{
          width: 4, height: 4 + i * 3,
          borderRadius: '1px',
          background: i <= cfg.bars ? cfg.color : 'var(--xc-surface-strong)',
        }} />
      ))}
    </div>
  );
}

function HeatCell({ count, max, statusKey, onClick }) {
  const cfg   = STATUSES.find(s => s.key === statusKey) || STATUSES[0];
  const ratio = max > 0 ? count / max : 0;
  const bg    = count === 0
    ? 'transparent'
    : count >= max && max > 0
      ? cfg.deep
      : `rgba(${hexToRgb(cfg.color)}, ${0.10 + ratio * 0.65})`;
  const textColor = ratio > 0.65 ? '#fff' : count > 0 ? cfg.color : 'var(--xc-text-muted)';

  return (
    <td
      onClick={count > 0 ? onClick : undefined}
      style={{
        width: '80px', textAlign: 'center', padding: '0 6px',
        cursor: count > 0 ? 'pointer' : 'default',
      }}
    >
      <div style={{
        display:       'inline-flex', alignItems: 'center', justifyContent: 'center',
        width:         '44px', height: '32px',
        borderRadius:  '8px',
        background:    bg,
        color:         textColor,
        fontSize:      count > 0 ? '14px' : '12px',
        fontWeight:    count > 0 ? 700 : 400,
        transition:    'all 0.15s ease',
        border:        count > 0 ? `1px solid ${cfg.light}` : 'none',
      }}
        onMouseEnter={e => { if (count > 0) e.currentTarget.style.transform = 'scale(1.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {count > 0 ? count : '—'}
      </div>
    </td>
  );
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `${r},${g},${b}`;
}

// ── 任務明細抽屜 ─────────────────────────────────────────────
function TaskDrawer({ open, title, tasks, onClose }) {
  const formatDate = (d) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
  };

  if (!open) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,.3)', backdropFilter: 'blur(2px)' }}
      />
      {/* 抽屜本體 */}
      <div style={{
        position:     'fixed', top: 0, right: 0, bottom: 0,
        width:        '400px', zIndex: 401,
        background:   'var(--xc-surface)',
        borderLeft:   '1px solid var(--xc-border)',
        display:      'flex', flexDirection: 'column',
        boxShadow:    '-8px 0 32px rgba(0,0,0,.15)',
      }}>
        {/* 抽屜標頭 */}
        <div style={{
          padding:      '18px 20px',
          borderBottom: '1px solid var(--xc-border)',
          display:      'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--xc-text)' }}>{title}</div>
            <div style={{ fontSize: '12px', color: 'var(--xc-text-muted)', marginTop: '2px' }}>
              共 {tasks.length} 個任務
            </div>
          </div>
          <button onClick={onClose} style={{
            width: '28px', height: '28px', borderRadius: '6px',
            border: 'none', background: 'var(--xc-surface-strong)',
            cursor: 'pointer', fontSize: '14px', color: 'var(--xc-text-soft)',
          }}>✕</button>
        </div>

        {/* 任務列表 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {tasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--xc-text-muted)', fontSize: '13px' }}>
              此分類無任務
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {tasks.map(t => {
                const pcfg = PRIORITY_CFG[t.priority] || PRIORITY_CFG.medium;
                return (
                  <div key={t.id} style={{
                    padding:      '10px 12px',
                    borderRadius: '8px',
                    background:   'var(--xc-surface-soft)',
                    border:       `1px solid ${t.isOverdue ? 'rgba(239,68,68,.25)' : 'var(--xc-border)'}`,
                  }}>
                    {/* 任務標題 + 優先度 */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '5px' }}>
                      <span style={{
                        fontSize: '10px', padding: '2px 5px', borderRadius: '4px', flexShrink: 0,
                        background: pcfg.bg, color: pcfg.color, fontWeight: 700, marginTop: '1px',
                      }}>
                        {pcfg.label}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--xc-text)', lineHeight: 1.4 }}>
                        {t.title}
                      </span>
                    </div>
                    {/* 元資訊列 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', color: 'var(--xc-text-muted)' }}>
                        📁 {t.projectName}
                      </span>
                      {t.dueDate && (
                        <span style={{
                          fontSize: '11px', fontWeight: 600,
                          color: t.isOverdue ? '#ef4444' : 'var(--xc-text-soft)',
                        }}>
                          {t.isOverdue ? `⏰ 逾期 ${t.daysOverdue} 天` : `📅 ${formatDate(t.dueDate)}`}
                        </span>
                      )}
                      {t.progressPercent > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--xc-text-muted)' }}>
                          {t.progressPercent}%
                        </span>
                      )}
                    </div>
                    {/* 進度條 */}
                    {t.progressPercent > 0 && (
                      <div style={{ height: '2px', background: 'var(--xc-border)', borderRadius: '1px', marginTop: '6px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${t.progressPercent}%`, background: 'var(--xc-brand)', borderRadius: '1px' }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── 篩選列 ───────────────────────────────────────────────────
function FilterBar({ projects, filters, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
      {/* 專案篩選 */}
      <select
        value={filters.projectId || ''}
        onChange={e => onChange({ ...filters, projectId: e.target.value || undefined })}
        style={{
          padding: '6px 12px', borderRadius: '8px',
          border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
          color: 'var(--xc-text)', fontSize: '13px', cursor: 'pointer',
        }}
      >
        <option value="">所有專案</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      {/* 優先度篩選 */}
      <select
        value={filters.priority || ''}
        onChange={e => onChange({ ...filters, priority: e.target.value || undefined })}
        style={{
          padding: '6px 12px', borderRadius: '8px',
          border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
          color: 'var(--xc-text)', fontSize: '13px', cursor: 'pointer',
        }}
      >
        <option value="">所有優先度</option>
        <option value="urgent">緊急</option>
        <option value="high">高</option>
        <option value="medium">中</option>
        <option value="low">低</option>
      </select>

      {/* 截止範圍篩選 */}
      <select
        value={filters.dueDays ?? ''}
        onChange={e => onChange({ ...filters, dueDays: e.target.value !== '' ? Number(e.target.value) : undefined })}
        style={{
          padding: '6px 12px', borderRadius: '8px',
          border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
          color: 'var(--xc-text)', fontSize: '13px', cursor: 'pointer',
        }}
      >
        <option value="">所有截止時間</option>
        <option value="0">今天截止</option>
        <option value="7">7 天內</option>
        <option value="14">14 天內</option>
        <option value="30">30 天內</option>
      </select>

      {/* 重置 */}
      {(filters.projectId || filters.priority || filters.dueDays != null) && (
        <button
          onClick={() => onChange({})}
          style={{
            padding: '6px 12px', borderRadius: '8px',
            border: '1px dashed var(--xc-border)', background: 'transparent',
            color: 'var(--xc-text-muted)', fontSize: '12px', cursor: 'pointer',
          }}
        >
          ✕ 清除篩選
        </button>
      )}
    </div>
  );
}

// ── 主元件 ────────────────────────────────────────────────────
export default function WorkloadPage({ onNavigate }) {
  const { user, authFetch } = useAuth();
  const companyId = user?.companyId;

  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [filters,  setFilters]  = useState({});
  const [drawer,   setDrawer]   = useState(null); // { title, tasks }
  const [viewMode, setViewMode] = useState('matrix'); // 'matrix' | 'cards'

  // ── 資料載入 ────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ companyId });
      if (filters.projectId) params.set('projectId', filters.projectId);
      if (filters.priority)  params.set('priority',  filters.priority);
      if (filters.dueDays != null) params.set('dueDays', filters.dueDays);

      const res  = await authFetch(`${API_BASE}/api/workload/matrix?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.data || json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId, authFetch, filters]);

  useEffect(() => { load(); }, [load]);

  // ── 點格子：開啟抽屜 ────────────────────────────────────────
  const openDrawer = useCallback((memberName, statusKey, tasks) => {
    const statusLabel = STATUSES.find(s => s.key === statusKey)?.label || statusKey;
    const filtered = statusKey === 'overdue'
      ? tasks.filter(t => t.isOverdue)
      : tasks.filter(t => t.status === statusKey);
    setDrawer({ title: `${memberName} · ${statusLabel}`, tasks: filtered });
  }, []);

  // ── 統計摘要 KPI ─────────────────────────────────────────────
  const summaryKpis = useMemo(() => {
    if (!data) return [];
    const t = data.totals || {};
    return [
      { label: '活躍任務', value: (t.todo||0) + (t.in_progress||0) + (t.review||0), color: '#3b82f6', icon: '⚡' },
      { label: '進行中',   value: t.in_progress || 0,   color: '#3b82f6', icon: '🔄' },
      { label: '逾期',     value: t.overdue || 0,        color: '#ef4444', icon: '⏰' },
      { label: '已完成',   value: t.done || 0,           color: '#22c55e', icon: '✅' },
      { label: '未指派',   value: data.unassigned?.count || 0, color: '#f97316', icon: '❓' },
    ];
  }, [data]);

  // ── 渲染 ─────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--xc-danger)' }}>
        <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚠️</div>
        <div style={{ fontSize: '14px' }}>資料載入失敗：{error}</div>
        <button onClick={load} style={{ marginTop: '16px', padding: '8px 20px', borderRadius: '8px',
          border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', cursor: 'pointer', color: 'var(--xc-text)' }}>
          重試
        </button>
      </div>
    );
  }

  const members  = data?.members  || [];
  const totals   = data?.totals   || {};
  const maxPS    = data?.maxPerStatus || {};
  const projects = data?.projects || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--xc-bg)' }}>

      {/* ── 頁頭 ── */}
      <div style={{
        padding:      '20px 28px 16px',
        borderBottom: '1px solid var(--xc-border)',
        background:   'var(--xc-surface)',
        flexShrink:   0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--xc-text)', margin: 0 }}>
              資源分配
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--xc-text-muted)', margin: '3px 0 0' }}>
              指派對象 × 任務狀態 · 即時工作負載總覽
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* 視圖切換 */}
            {['matrix','cards'].map(m => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                style={{
                  padding: '5px 14px', borderRadius: '6px', border: '1px solid var(--xc-border)',
                  background: viewMode === m ? 'var(--xc-brand)' : 'var(--xc-surface)',
                  color: viewMode === m ? '#fff' : 'var(--xc-text-soft)',
                  fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                {m === 'matrix' ? '⊞ 矩陣' : '☰ 卡片'}
              </button>
            ))}
            <button
              onClick={load}
              disabled={loading}
              style={{
                padding: '5px 12px', borderRadius: '6px',
                border: '1px solid var(--xc-border)',
                background: 'var(--xc-surface)',
                color: 'var(--xc-text-muted)', fontSize: '12px', cursor: 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? '載入中…' : '⟳ 重新整理'}
            </button>
          </div>
        </div>

        {/* 篩選列 */}
        <FilterBar projects={projects} filters={filters} onChange={setFilters} />
      </div>

      {/* ── KPI 摘要列 ── */}
      <div style={{
        display: 'flex', gap: '1px',
        background: 'var(--xc-border)',
        borderBottom: '1px solid var(--xc-border)',
        flexShrink: 0,
      }}>
        {summaryKpis.map((k) => (
          <div key={k.label} style={{
            flex: 1, padding: '12px 20px',
            background: 'var(--xc-surface)',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{ fontSize: '18px' }}>{k.icon}</span>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: k.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {loading ? '—' : k.value}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--xc-text-muted)', marginTop: '1px' }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 主體區域 ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ height: '56px', borderRadius: '10px',
                background: 'var(--xc-surface)', border: '1px solid var(--xc-border)',
                animation: 'pulse 1.5s ease infinite' }} />
            ))}
          </div>
        ) : viewMode === 'matrix' ? (
          <MatrixView
            members={members}
            totals={totals}
            maxPS={maxPS}
            unassigned={data?.unassigned}
            onCellClick={openDrawer}
          />
        ) : (
          <CardsView
            members={members}
            onCellClick={openDrawer}
          />
        )}
      </div>

      {/* ── 任務抽屜 ── */}
      <TaskDrawer
        open={!!drawer}
        title={drawer?.title}
        tasks={drawer?.tasks || []}
        onClose={() => setDrawer(null)}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 矩陣視圖
// ════════════════════════════════════════════════════════════
function MatrixView({ members, totals, maxPS, unassigned, onCellClick }) {
  const theadStyle = {
    position: 'sticky', top: 0, zIndex: 2,
    background: 'var(--xc-surface)',
  };

  return (
    <div style={{
      background:   'var(--xc-surface)',
      border:       '1px solid var(--xc-border)',
      borderRadius: '12px',
      overflow:     'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
          <thead style={theadStyle}>
            <tr style={{ borderBottom: '2px solid var(--xc-border)' }}>
              {/* 成員欄位標頭 */}
              <th style={{
                padding:   '12px 20px',
                textAlign: 'left', fontSize: '12px', fontWeight: 700,
                color:     'var(--xc-text-muted)', letterSpacing: '0.04em',
                minWidth:  '200px',
              }}>
                成員 · 負載
              </th>
              {STATUSES.map(s => (
                <th key={s.key} style={{
                  width: '80px', textAlign: 'center', padding: '12px 6px',
                  fontSize: '12px', fontWeight: 700, color: s.color, letterSpacing: '0.02em',
                }}>
                  <div>{s.label}</div>
                </th>
              ))}
              <th style={{
                width: '70px', textAlign: 'center', padding: '12px 6px',
                fontSize: '12px', fontWeight: 700, color: 'var(--xc-text-muted)',
              }}>
                合計
              </th>
            </tr>
          </thead>

          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: 'var(--xc-text-muted)', fontSize: '13px' }}>
                  目前無任務資料
                </td>
              </tr>
            ) : (
              members.map((m, idx) => (
                <tr key={m.userId} style={{
                  borderBottom: '1px solid var(--xc-border)',
                  background: idx % 2 === 0 ? 'transparent' : 'var(--xc-surface-soft)',
                }}>
                  {/* 成員欄 */}
                  <td style={{ padding: '10px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar name={m.name} url={m.avatarUrl} size={32} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--xc-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {m.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          {m.department && (
                            <span style={{ fontSize: '11px', color: 'var(--xc-text-muted)' }}>
                              {m.department}
                            </span>
                          )}
                          <CapacityBars capacity={m.capacity} />
                          <span style={{
                            fontSize: '10px', color: CAPACITY_CFG[m.capacity]?.color || '#94a3b8',
                            fontWeight: 600,
                          }}>
                            {CAPACITY_CFG[m.capacity]?.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* 狀態格子 */}
                  {STATUSES.map(s => (
                    <HeatCell
                      key={s.key}
                      count={m.counts[s.key] || 0}
                      max={maxPS[s.key] || 1}
                      statusKey={s.key}
                      onClick={() => onCellClick(m.name, s.key, m.tasks)}
                    />
                  ))}

                  {/* 合計 */}
                  <td style={{ textAlign: 'center', padding: '0 6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--xc-text)' }}>
                      {m.counts.total}
                    </span>
                  </td>
                </tr>
              ))
            )}

            {/* 未指派行 */}
            {unassigned?.count > 0 && (
              <tr style={{ borderBottom: '1px solid var(--xc-border)', background: 'rgba(249,115,22,.04)' }}>
                <td style={{ padding: '10px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'rgba(249,115,22,.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '16px', flexShrink: 0,
                    }}>❓</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#f97316' }}>未指派</div>
                      <div style={{ fontSize: '11px', color: 'var(--xc-text-muted)' }}>需要指派負責人</div>
                    </div>
                  </div>
                </td>
                {STATUSES.map(s => (
                  <HeatCell
                    key={s.key}
                    count={unassigned.counts[s.key] || 0}
                    max={maxPS[s.key] || 1}
                    statusKey={s.key}
                    onClick={() => onCellClick('未指派', s.key, unassigned.tasks)}
                  />
                ))}
                <td style={{ textAlign: 'center', padding: '0 6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#f97316' }}>
                    {unassigned.count}
                  </span>
                </td>
              </tr>
            )}

            {/* 合計列 */}
            <tr style={{
              borderTop: '2px solid var(--xc-border)',
              background: 'var(--xc-surface-soft)',
              fontWeight: 700,
            }}>
              <td style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--xc-text-muted)', fontWeight: 700 }}>
                合計
              </td>
              {STATUSES.map(s => (
                <td key={s.key} style={{ textAlign: 'center', padding: '0 6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: STATUSES.find(st => st.key === s.key)?.color }}>
                    {totals[s.key] || 0}
                  </span>
                </td>
              ))}
              <td style={{ textAlign: 'center', padding: '0 6px' }}>
                <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--xc-text)' }}>
                  {totals.total || 0}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 圖例 */}
      <div style={{
        padding: '10px 20px', borderTop: '1px solid var(--xc-border)',
        display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
        background: 'var(--xc-surface-soft)',
      }}>
        <span style={{ fontSize: '11px', color: 'var(--xc-text-muted)' }}>色深 = 任務量越多</span>
        {STATUSES.map(s => (
          <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--xc-text-muted)' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: s.color, display: 'inline-block' }} />
            {s.label}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--xc-text-muted)' }}>
          點擊格子查看任務明細
        </span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 卡片視圖
// ════════════════════════════════════════════════════════════
function CardsView({ members, onCellClick }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
      {members.map(m => {
        const active  = (m.counts.in_progress || 0) + (m.counts.review || 0);
        const total   = m.counts.total || 0;
        const doneRate = total > 0 ? Math.round(((m.counts.done || 0) / total) * 100) : 0;

        return (
          <div key={m.userId} style={{
            background:   'var(--xc-surface)',
            border:       '1px solid var(--xc-border)',
            borderRadius: '12px',
            padding:      '16px',
            display:      'flex', flexDirection: 'column', gap: '12px',
          }}>
            {/* 成員頭部 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Avatar name={m.name} url={m.avatarUrl} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--xc-text)' }}>{m.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--xc-text-muted)' }}>
                  {m.department || m.jobTitle || '成員'}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                <CapacityBars capacity={m.capacity} />
                <span style={{ fontSize: '10px', color: CAPACITY_CFG[m.capacity]?.color, fontWeight: 600 }}>
                  {CAPACITY_CFG[m.capacity]?.label}
                </span>
              </div>
            </div>

            {/* 狀態分佈橫條 */}
            {total > 0 && (
              <div style={{ height: '6px', borderRadius: '3px', overflow: 'hidden', display: 'flex', gap: '1px', background: 'var(--xc-surface-strong)' }}>
                {STATUSES.filter(s => s.key !== 'overdue').map(s => {
                  const pct = ((m.counts[s.key] || 0) / total) * 100;
                  return pct > 0 ? (
                    <div key={s.key} style={{ width: `${pct}%`, background: s.color, transition: 'width .4s' }} />
                  ) : null;
                })}
              </div>
            )}

            {/* 狀態格子 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
              {STATUSES.map(s => {
                const cnt = m.counts[s.key] || 0;
                return (
                  <button
                    key={s.key}
                    onClick={() => cnt > 0 && onCellClick(m.name, s.key, m.tasks)}
                    disabled={cnt === 0}
                    style={{
                      padding: '6px 4px', borderRadius: '8px', border: 'none',
                      background: cnt > 0 ? `${s.light}` : 'var(--xc-surface-soft)',
                      cursor: cnt > 0 ? 'pointer' : 'default',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                    }}
                  >
                    <span style={{ fontSize: '15px', fontWeight: 800, color: cnt > 0 ? s.color : 'var(--xc-text-muted)' }}>
                      {cnt}
                    </span>
                    <span style={{ fontSize: '9px', color: 'var(--xc-text-muted)', whiteSpace: 'nowrap' }}>
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 完成率列 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--xc-text-muted)' }}>
              <span>合計 {total} 項任務</span>
              <span style={{ fontWeight: 600, color: 'var(--xc-success)' }}>完成 {doneRate}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
