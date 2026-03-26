/**
 * GoalsPage — P2#30 OKR 目標與關鍵結果追蹤
 *
 * 功能：
 *   - 季度/年度切換
 *   - Objective 卡片（含進度圓環）
 *   - Key Results 列表（可拖動更新進度）
 *   - 新增/編輯/刪除 Objective & KR
 *   - 狀態統計 header
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

// ── 常數 ─────────────────────────────────────────────────────
const STATUS_CFG = {
  active:    { label: '進行中', color: '#3b82f6', bg: 'rgba(59,130,246,.1)' },
  completed: { label: '已完成', color: '#10b981', bg: 'rgba(16,185,129,.1)' },
  cancelled: { label: '已取消', color: '#6b7280', bg: 'rgba(107,114,128,.1)' },
  on_hold:   { label: '暫停中', color: '#f59e0b', bg: 'rgba(245,158,11,.1)' },
};

const KR_STATUS_CFG = {
  in_progress: { label: '進行中', color: '#3b82f6' },
  done:        { label: '已完成', color: '#10b981' },
  at_risk:     { label: '有風險', color: '#ef4444' },
  not_started: { label: '未開始', color: '#6b7280' },
};

const QUARTERS = ['Q1','Q2','Q3','Q4'];

function getQuarterYear() {
  const now = new Date();
  return {
    quarter: `Q${Math.ceil((now.getMonth() + 1) / 3)}`,
    year:    now.getFullYear(),
  };
}

// ── Progress Ring ─────────────────────────────────────────────
function ProgressRing({ pct, size = 60, stroke = 5, color = 'var(--xc-brand)' }) {
  const r   = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke="var(--xc-border)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray .5s ease' }}
      />
      <text
        x={size/2} y={size/2 + 1}
        textAnchor="middle" dominantBaseline="middle"
        fill={color}
        style={{ transform: 'rotate(90deg)', transformOrigin: `${size/2}px ${size/2}px` }}
        fontSize={size < 50 ? 9 : 12}
        fontWeight={700}
      >
        {pct}%
      </text>
    </svg>
  );
}

// ── KR Progress Slider ────────────────────────────────────────
function KRProgressBar({ kr, onUpdate }) {
  const pct = kr.targetValue > 0 ? Math.min(100, Math.round((kr.currentValue / kr.targetValue) * 100)) : 0;
  const krStatusCfg = KR_STATUS_CFG[kr.status] || KR_STATUS_CFG.in_progress;
  const pctColor = pct >= 80 ? 'var(--xc-success)' : pct >= 50 ? '#f59e0b' : 'var(--xc-brand)';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 14px',
      borderRadius: '8px',
      background: 'var(--xc-surface-soft)',
      border: '1px solid var(--xc-border)',
    }}>
      {/* KR 狀態點 */}
      <span style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: krStatusCfg.color, flexShrink: 0,
      }} />

      {/* 標題 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--xc-text)', marginBottom: '5px' }}>
          {kr.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1, height: '6px', borderRadius: '999px', background: 'var(--xc-border)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pctColor, borderRadius: '999px', transition: 'width .4s ease' }} />
          </div>
          <span style={{ fontSize: '11px', color: 'var(--xc-text-muted)', whiteSpace: 'nowrap' }}>
            {kr.currentValue} / {kr.targetValue} {kr.unit}
          </span>
          <span style={{ fontSize: '11px', fontWeight: 700, color: pctColor }}>
            {pct}%
          </span>
        </div>
      </div>

      {/* 快速更新進度 */}
      {onUpdate && (
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button
            onClick={() => onUpdate(kr, Math.max(0, kr.currentValue - 1))}
            style={{ width: '22px', height: '22px', borderRadius: '4px', border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', cursor: 'pointer', fontSize: '12px', color: 'var(--xc-text-soft)' }}
          >-</button>
          <button
            onClick={() => onUpdate(kr, Math.min(kr.targetValue, kr.currentValue + 1))}
            style={{ width: '22px', height: '22px', borderRadius: '4px', border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', cursor: 'pointer', fontSize: '12px', color: 'var(--xc-text-soft)' }}
          >+</button>
        </div>
      )}
    </div>
  );
}

// ── OKR 卡片 ─────────────────────────────────────────────────
function OkrCard({ goal, onEdit, onDelete, onAddKR, onUpdateKR, onDeleteKR, onStatusChange }) {
  const [expanded, setExpanded]   = useState(true);
  const [addKROpen, setAddKROpen] = useState(false);
  const [newKR, setNewKR]         = useState({ title: '', targetValue: 100, unit: '%' });

  const statusCfg = STATUS_CFG[goal.status] || STATUS_CFG.active;
  const pctColor  = goal.progress >= 80 ? 'var(--xc-success)' : goal.progress >= 50 ? '#f59e0b' : 'var(--xc-brand)';

  return (
    <div style={{
      background:   'var(--xc-surface)',
      border:       '1px solid var(--xc-border)',
      borderRadius: '14px',
      overflow:     'hidden',
    }}>
      {/* 卡頭 */}
      <div style={{
        padding: '18px 20px',
        display: 'flex', alignItems: 'flex-start', gap: '16px',
        cursor:  'pointer',
      }} onClick={() => setExpanded(v => !v)}>
        {/* 進度環 */}
        <ProgressRing pct={goal.progress} size={56} color={pctColor} />

        {/* 標題區 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--xc-text)' }}>
              {goal.title}
            </span>
            <span style={{
              fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
              background: statusCfg.bg, color: statusCfg.color, fontWeight: 600,
            }}>
              {statusCfg.label}
            </span>
          </div>
          {goal.description && (
            <div style={{ fontSize: '12px', color: 'var(--xc-text-muted)', marginTop: '4px' }}>
              {goal.description}
            </div>
          )}
          <div style={{ fontSize: '11px', color: 'var(--xc-text-muted)', marginTop: '6px' }}>
            {goal.quarter} {goal.year} · {goal.keyResults?.length || 0} 個 KR
            {goal.owner && ` · 負責人：${goal.owner}`}
          </div>
        </div>

        {/* 操作按鈕 */}
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => setAddKROpen(v => !v)} style={{
            padding: '5px 10px', borderRadius: '6px', fontSize: '11px',
            border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
            cursor: 'pointer', color: 'var(--xc-text-soft)',
          }}>+ KR</button>
          <button onClick={() => onEdit(goal)} style={{
            padding: '5px 10px', borderRadius: '6px', fontSize: '11px',
            border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
            cursor: 'pointer', color: 'var(--xc-text-soft)',
          }}>編輯</button>
          <button onClick={() => onDelete(goal)} style={{
            padding: '5px 10px', borderRadius: '6px', fontSize: '11px',
            border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
            cursor: 'pointer', color: 'var(--xc-danger)',
          }}>刪除</button>
          <span style={{ fontSize: '13px', padding: '5px', color: 'var(--xc-text-muted)' }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* KR 列表 */}
      {expanded && (
        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* 添加 KR 表單 */}
          {addKROpen && (
            <div style={{
              padding: '12px 14px', borderRadius: '10px',
              background: 'color-mix(in srgb, var(--xc-brand) 5%, var(--xc-surface))',
              border: '1px dashed var(--xc-brand)',
              display: 'flex', flexDirection: 'column', gap: '8px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--xc-brand)', marginBottom: '4px' }}>
                新增 Key Result
              </div>
              <input
                value={newKR.title}
                onChange={e => setNewKR(p => ({ ...p, title: e.target.value }))}
                placeholder="Key Result 描述…"
                style={{
                  padding: '7px 10px', borderRadius: '6px',
                  border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
                  fontSize: '12px', color: 'var(--xc-text)', width: '100%', boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  value={newKR.targetValue}
                  onChange={e => setNewKR(p => ({ ...p, targetValue: parseFloat(e.target.value) || 0 }))}
                  placeholder="目標值"
                  style={{
                    flex: 1, padding: '7px 10px', borderRadius: '6px',
                    border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
                    fontSize: '12px', color: 'var(--xc-text)',
                  }}
                />
                <input
                  value={newKR.unit}
                  onChange={e => setNewKR(p => ({ ...p, unit: e.target.value }))}
                  placeholder="單位（%、項、分…）"
                  style={{
                    flex: 1, padding: '7px 10px', borderRadius: '6px',
                    border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
                    fontSize: '12px', color: 'var(--xc-text)',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setAddKROpen(false)} style={{
                  padding: '6px 12px', borderRadius: '6px', fontSize: '12px',
                  border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
                  cursor: 'pointer', color: 'var(--xc-text-soft)',
                }}>取消</button>
                <button
                  onClick={() => {
                    if (!newKR.title.trim()) return;
                    onAddKR(goal, newKR);
                    setNewKR({ title: '', targetValue: 100, unit: '%' });
                    setAddKROpen(false);
                  }}
                  style={{
                    padding: '6px 14px', borderRadius: '6px', fontSize: '12px',
                    border: 'none', background: 'var(--xc-brand)',
                    cursor: 'pointer', color: '#fff', fontWeight: 700,
                  }}
                >確認新增</button>
              </div>
            </div>
          )}

          {goal.keyResults?.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--xc-text-muted)', textAlign: 'center', padding: '12px' }}>
              尚未新增 Key Result
            </div>
          ) : (
            goal.keyResults.map(kr => (
              <div key={kr.id} style={{ position: 'relative' }}>
                <KRProgressBar kr={kr} onUpdate={(kr, newVal) => onUpdateKR(goal, kr, newVal)} />
                <button
                  onClick={() => onDeleteKR(goal, kr)}
                  style={{
                    position: 'absolute', top: '50%', right: '8px',
                    transform: 'translateY(-50%)',
                    width: '18px', height: '18px', borderRadius: '50%',
                    border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
                    cursor: 'pointer', fontSize: '10px', color: 'var(--xc-text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >×</button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── 新增/編輯對話框 ──────────────────────────────────────────
function GoalModal({ goal, onClose, onSave, currentQuarter, currentYear }) {
  const [form, setForm] = useState(goal ? {
    title:       goal.title,
    description: goal.description || '',
    quarter:     goal.quarter,
    year:        goal.year,
    status:      goal.status,
    owner:       goal.owner || '',
  } : {
    title:       '',
    description: '',
    quarter:     currentQuarter,
    year:        currentYear,
    status:      'active',
    owner:       '',
  });

  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: '480px', maxWidth: '95vw',
        background: 'var(--xc-surface)',
        borderRadius: '16px', padding: '28px',
        boxShadow: '0 24px 48px rgba(0,0,0,.2)',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, color: 'var(--xc-text)' }}>
          {goal ? '編輯目標' : '新增 Objective'}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--xc-text-soft)', display: 'block', marginBottom: '5px' }}>目標標題 *</label>
            <input
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="輸入目標標題…"
              autoFocus
              style={{
                width: '100%', padding: '9px 12px', borderRadius: '8px',
                border: '1px solid var(--xc-border)', background: 'var(--xc-surface-soft)',
                fontSize: '13px', color: 'var(--xc-text)', boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--xc-text-soft)', display: 'block', marginBottom: '5px' }}>描述</label>
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="目標說明、背景或衡量方式…"
              rows={3}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: '8px',
                border: '1px solid var(--xc-border)', background: 'var(--xc-surface-soft)',
                fontSize: '13px', color: 'var(--xc-text)', boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--xc-text-soft)', display: 'block', marginBottom: '5px' }}>季度</label>
              <select value={form.quarter} onChange={e => setForm(p => ({ ...p, quarter: e.target.value }))} style={{
                width: '100%', padding: '9px 12px', borderRadius: '8px',
                border: '1px solid var(--xc-border)', background: 'var(--xc-surface-soft)',
                fontSize: '13px', color: 'var(--xc-text)',
              }}>
                {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--xc-text-soft)', display: 'block', marginBottom: '5px' }}>年份</label>
              <select value={form.year} onChange={e => setForm(p => ({ ...p, year: parseInt(e.target.value, 10) }))} style={{
                width: '100%', padding: '9px 12px', borderRadius: '8px',
                border: '1px solid var(--xc-border)', background: 'var(--xc-surface-soft)',
                fontSize: '13px', color: 'var(--xc-text)',
              }}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--xc-text-soft)', display: 'block', marginBottom: '5px' }}>狀態</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={{
                width: '100%', padding: '9px 12px', borderRadius: '8px',
                border: '1px solid var(--xc-border)', background: 'var(--xc-surface-soft)',
                fontSize: '13px', color: 'var(--xc-text)',
              }}>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--xc-text-soft)', display: 'block', marginBottom: '5px' }}>負責人</label>
              <input
                value={form.owner}
                onChange={e => setForm(p => ({ ...p, owner: e.target.value }))}
                placeholder="負責人姓名"
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: '8px',
                  border: '1px solid var(--xc-border)', background: 'var(--xc-surface-soft)',
                  fontSize: '13px', color: 'var(--xc-text)', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
          <button onClick={onClose} style={{
            padding: '9px 18px', borderRadius: '8px', fontSize: '13px',
            border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
            cursor: 'pointer', color: 'var(--xc-text-soft)',
          }}>取消</button>
          <button
            onClick={() => {
              if (!form.title.trim()) return;
              onSave(form);
            }}
            style={{
              padding: '9px 22px', borderRadius: '8px', fontSize: '13px',
              border: 'none', background: 'var(--xc-brand)',
              cursor: 'pointer', color: '#fff', fontWeight: 700,
            }}
          >{goal ? '儲存' : '新增'}</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 主頁面
// ════════════════════════════════════════════════════════════
export default function GoalsPage() {
  const { user, authFetch } = useAuth();
  const companyId = user?.companyId;

  const { quarter: initQ, year: initY } = getQuarterYear();
  const [quarter,   setQuarter]   = useState(initQ);
  const [year,      setYear]      = useState(initY);
  const [goals,     setGoals]     = useState([]);
  const [meta,      setMeta]      = useState({});
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [modal,     setModal]     = useState(null); // null | { mode:'add'|'edit', goal? }
  const [filterStatus, setFilterStatus] = useState('');

  const load = useCallback(async () => {
    if (!companyId || !authFetch) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ companyId, quarter, year: String(year) });
      if (filterStatus) qs.set('status', filterStatus);
      const res  = await authFetch(`/api/goals?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const d    = json.data || json;
      setGoals(d.goals || []);
      setMeta(d.meta || {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId, authFetch, quarter, year, filterStatus]);

  useEffect(() => { load(); }, [load]);

  // ── CRUD ──────────────────────────────────────────────────
  const handleSaveGoal = async (form) => {
    try {
      const isEdit = modal?.mode === 'edit';
      const url    = isEdit ? `/api/goals/${modal.goal.id}` : '/api/goals';
      const method = isEdit ? 'PATCH' : 'POST';
      await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, companyId }),
      });
      setModal(null);
      load();
    } catch (e) { alert(e.message); }
  };

  const handleDelete = async (goal) => {
    if (!confirm(`確定刪除「${goal.title}」？`)) return;
    await authFetch(`/api/goals/${goal.id}?companyId=${companyId}`, { method: 'DELETE' });
    load();
  };

  const handleAddKR = async (goal, kr) => {
    await authFetch(`/api/goals/${goal.id}/key-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...kr, companyId }),
    });
    load();
  };

  const handleUpdateKR = async (goal, kr, newVal) => {
    await authFetch(`/api/goals/${goal.id}/key-results/${kr.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentValue: newVal, companyId }),
    });
    load();
  };

  const handleDeleteKR = async (goal, kr) => {
    await authFetch(`/api/goals/${goal.id}/key-results/${kr.id}?companyId=${companyId}`, { method: 'DELETE' });
    load();
  };

  // ── 統計卡片 ─────────────────────────────────────────────
  const statCards = [
    { label: '目標總數',  value: meta.total     ?? 0, color: 'var(--xc-brand)',   icon: '🎯' },
    { label: '進行中',    value: meta.active     ?? 0, color: '#3b82f6',           icon: '🔄' },
    { label: '已完成',    value: meta.completed  ?? 0, color: 'var(--xc-success)', icon: '✅' },
    { label: '平均進度',  value: `${meta.avgProgress ?? 0}%`, color: '#f59e0b',   icon: '📊' },
  ];

  const years = [year - 1, year, year + 1];

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* ── 頁頭 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--xc-text)', margin: 0 }}>目標 (OKR)</h1>
          <p style={{ fontSize: '13px', color: 'var(--xc-text-muted)', margin: '4px 0 0' }}>
            Objectives & Key Results · 追蹤目標達成進度
          </p>
        </div>
        <button
          onClick={() => setModal({ mode: 'add' })}
          style={{
            padding: '10px 20px', borderRadius: '10px', fontSize: '13px',
            border: 'none', background: 'var(--xc-brand)',
            cursor: 'pointer', color: '#fff', fontWeight: 700,
            boxShadow: '0 4px 12px rgba(196,18,48,.25)',
          }}
        >
          + 新增目標
        </button>
      </div>

      {/* ── 統計卡片列 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {statCards.map(c => (
          <div key={c.label} style={{
            background: 'var(--xc-surface)', border: '1px solid var(--xc-border)',
            borderRadius: '12px', padding: '16px 18px',
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <span style={{ fontSize: '22px' }}>{c.icon}</span>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: c.color }}>
                {loading ? '—' : c.value}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--xc-text-muted)' }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 篩選列 */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* 季度按鈕 */}
        <div style={{ display: 'flex', border: '1px solid var(--xc-border)', borderRadius: '8px', overflow: 'hidden' }}>
          {QUARTERS.map(q => (
            <button key={q} onClick={() => setQuarter(q)} style={{
              padding: '6px 14px', fontSize: '12px',
              border: 'none', borderRight: '1px solid var(--xc-border)',
              background: quarter === q ? 'var(--xc-brand)' : 'var(--xc-surface)',
              color: quarter === q ? '#fff' : 'var(--xc-text-soft)',
              cursor: 'pointer', fontWeight: quarter === q ? 700 : 400,
            }}>{q}</button>
          ))}
        </div>

        {/* 年份 */}
        <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))} style={{
          padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
          border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
          color: 'var(--xc-text)',
        }}>
          {years.map(y => <option key={y} value={y}>{y} 年</option>)}
        </select>

        {/* 狀態篩選 */}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{
          padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
          border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
          color: 'var(--xc-text)',
        }}>
          <option value="">所有狀態</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>

        <button onClick={load} style={{
          padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
          border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
          cursor: 'pointer', color: 'var(--xc-text-soft)',
        }}>⟳ 重新整理</button>
      </div>

      {/* ── 錯誤 */}
      {error && (
        <div style={{
          padding: '16px', borderRadius: '10px', marginBottom: '16px',
          background: 'color-mix(in srgb, var(--xc-danger) 8%, var(--xc-surface))',
          border: '1px solid var(--xc-danger)', color: 'var(--xc-danger)', fontSize: '13px',
        }}>⚠️ {error}</div>
      )}

      {/* ── OKR 列表 */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--xc-text-muted)', fontSize: '14px' }}>
          載入中…
        </div>
      ) : goals.length === 0 ? (
        <div style={{
          padding: '60px 40px', textAlign: 'center',
          background: 'var(--xc-surface)', border: '2px dashed var(--xc-border)',
          borderRadius: '16px',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎯</div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--xc-text)', marginBottom: '6px' }}>
            {quarter} {year} 尚無目標
          </div>
          <div style={{ fontSize: '13px', color: 'var(--xc-text-muted)', marginBottom: '18px' }}>
            設定第一個 OKR，開始追蹤目標進度
          </div>
          <button
            onClick={() => setModal({ mode: 'add' })}
            style={{
              padding: '10px 20px', borderRadius: '10px', fontSize: '13px',
              border: 'none', background: 'var(--xc-brand)',
              cursor: 'pointer', color: '#fff', fontWeight: 700,
            }}
          >+ 新增第一個目標</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {goals.map(goal => (
            <OkrCard
              key={goal.id}
              goal={goal}
              onEdit={g => setModal({ mode: 'edit', goal: g })}
              onDelete={handleDelete}
              onAddKR={handleAddKR}
              onUpdateKR={handleUpdateKR}
              onDeleteKR={handleDeleteKR}
            />
          ))}
        </div>
      )}

      {/* ── Modal */}
      {modal && (
        <GoalModal
          goal={modal.mode === 'edit' ? modal.goal : null}
          onClose={() => setModal(null)}
          onSave={handleSaveGoal}
          currentQuarter={quarter}
          currentYear={year}
        />
      )}
    </div>
  );
}
