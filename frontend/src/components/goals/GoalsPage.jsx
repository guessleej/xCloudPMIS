/**
 * GoalsPage — OKR 目標追蹤 + ② 策略地圖
 *
 * 功能：
 *   - 列表視圖：季度 OKR 卡片（原有功能）
 *   - 策略地圖：目標階層樹狀可視化（Bezier SVG 連線）
 *   - 父子目標關聯（parentId 欄位）
 *   - BRAND 企業風格頁首
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useResponsive';

// ── 常數 ─────────────────────────────────────────────────────
const BRAND = '#C70018';

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

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

function getQuarterYear() {
  const now = new Date();
  return { quarter: `Q${Math.ceil((now.getMonth() + 1) / 3)}`, year: now.getFullYear() };
}

/** 前端本地計算 OKR 進度（地圖視圖用）*/
function localCalcProgress(keyResults) {
  if (!keyResults || keyResults.length === 0) return 0;
  const sum = keyResults.reduce((s, kr) => {
    return s + (kr.targetValue > 0 ? Math.min(100, Math.round((kr.currentValue / kr.targetValue) * 100)) : 0);
  }, 0);
  return Math.round(sum / keyResults.length);
}

// ── Progress Ring ─────────────────────────────────────────────
function ProgressRing({ pct, size = 60, stroke = 5, color = BRAND }) {
  const r    = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="var(--xc-border)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray .5s ease' }}
      />
      <text
        x={size / 2} y={size / 2 + 1}
        textAnchor="middle" dominantBaseline="middle"
        fill={color}
        style={{ transform: 'rotate(90deg)', transformOrigin: `${size / 2}px ${size / 2}px` }}
        fontSize={size < 50 ? 9 : 12}
        fontWeight={700}
      >
        {pct}%
      </text>
    </svg>
  );
}

// ── KR Progress Bar ────────────────────────────────────────────
function KRProgressBar({ kr, onUpdate }) {
  const pct        = kr.targetValue > 0 ? Math.min(100, Math.round((kr.currentValue / kr.targetValue) * 100)) : 0;
  const krStatusCfg = KR_STATUS_CFG[kr.status] || KR_STATUS_CFG.in_progress;
  const pctColor   = pct >= 80 ? 'var(--xc-success)' : pct >= 50 ? '#f59e0b' : BRAND;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 14px', borderRadius: '8px',
      background: 'var(--xc-surface-soft)', border: '1px solid var(--xc-border)',
    }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: krStatusCfg.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--xc-text)', marginBottom: '5px' }}>{kr.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1, height: '6px', borderRadius: '999px', background: 'var(--xc-border)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pctColor, borderRadius: '999px', transition: 'width .4s ease' }} />
          </div>
          <span style={{ fontSize: '13px', color: 'var(--xc-text-muted)', whiteSpace: 'nowrap' }}>
            {kr.currentValue} / {kr.targetValue} {kr.unit}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: pctColor }}>{pct}%</span>
        </div>
      </div>
      {onUpdate && (
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button onClick={() => onUpdate(kr, Math.max(0, kr.currentValue - 1))}
            style={{ width: '22px', height: '22px', borderRadius: '4px', border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', cursor: 'pointer', fontSize: '14px', color: 'var(--xc-text-soft)' }}>-</button>
          <button onClick={() => onUpdate(kr, Math.min(kr.targetValue, kr.currentValue + 1))}
            style={{ width: '22px', height: '22px', borderRadius: '4px', border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', cursor: 'pointer', fontSize: '14px', color: 'var(--xc-text-soft)' }}>+</button>
        </div>
      )}
    </div>
  );
}

// ── OKR 卡片（列表視圖） ──────────────────────────────────────
function OkrCard({ goal, allGoals, onEdit, onDelete, onAddKR, onUpdateKR, onDeleteKR }) {
  const [expanded, setExpanded]   = useState(true);
  const [addKROpen, setAddKROpen] = useState(false);
  const [newKR, setNewKR]         = useState({ title: '', targetValue: 100, unit: '%' });

  const statusCfg = STATUS_CFG[goal.status] || STATUS_CFG.active;
  const pctColor  = goal.progress >= 80 ? 'var(--xc-success)' : goal.progress >= 50 ? '#f59e0b' : BRAND;
  const parent    = goal.parentId ? allGoals.find(g => g.id === goal.parentId) : null;
  const children  = allGoals.filter(g => g.parentId === goal.id);

  return (
    <div style={{ background: 'var(--xc-surface)', border: '1px solid var(--xc-border)', borderRadius: '14px', overflow: 'hidden' }}>
      {/* 卡頭 */}
      <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: '16px', cursor: 'pointer' }}
        onClick={() => setExpanded(v => !v)}>
        <ProgressRing pct={goal.progress} size={56} color={pctColor} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--xc-text)' }}>{goal.title}</span>
            <span style={{ fontSize: '13px', padding: '2px 8px', borderRadius: '10px', background: statusCfg.bg, color: statusCfg.color, fontWeight: 600 }}>
              {statusCfg.label}
            </span>
          </div>
          {parent && (
            <div style={{ fontSize: '13px', color: 'var(--xc-text-muted)', marginTop: '3px' }}>
              ↑ 上層目標：{parent.title}
            </div>
          )}
          {goal.description && (
            <div style={{ fontSize: '14px', color: 'var(--xc-text-muted)', marginTop: '4px' }}>{goal.description}</div>
          )}
          <div style={{ fontSize: '13px', color: 'var(--xc-text-muted)', marginTop: '6px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <span>{goal.quarter} {goal.year}</span>
            <span>{goal.keyResults?.length || 0} KR</span>
            {children.length > 0 && <span>{children.length} 個子目標</span>}
            {goal.owner && <span>負責人：{goal.owner}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => setAddKROpen(v => !v)} style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '13px', border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', cursor: 'pointer', color: 'var(--xc-text-soft)' }}>+ KR</button>
          <button onClick={() => onEdit(goal)} style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '13px', border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', cursor: 'pointer', color: 'var(--xc-text-soft)' }}>編輯</button>
          <button onClick={() => onDelete(goal)} style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '13px', border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', cursor: 'pointer', color: 'var(--xc-danger)' }}>刪除</button>
          <span style={{ fontSize: '15px', padding: '5px', color: 'var(--xc-text-muted)' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* KR 列表 */}
      {expanded && (
        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {addKROpen && (
            <div style={{ padding: '12px 14px', borderRadius: '10px', background: `color-mix(in srgb, ${BRAND} 5%, var(--xc-surface))`, border: `1px dashed ${BRAND}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: BRAND, marginBottom: '4px' }}>新增 Key Result</div>
              <input value={newKR.title} onChange={e => setNewKR(p => ({ ...p, title: e.target.value }))} placeholder="Key Result 描述…"
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', fontSize: '14px', color: 'var(--xc-text)', width: '100%', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="number" value={newKR.targetValue} onChange={e => setNewKR(p => ({ ...p, targetValue: parseFloat(e.target.value) || 0 }))} placeholder="目標值"
                  style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', fontSize: '14px', color: 'var(--xc-text)' }} />
                <input value={newKR.unit} onChange={e => setNewKR(p => ({ ...p, unit: e.target.value }))} placeholder="單位（%、項…）"
                  style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', fontSize: '14px', color: 'var(--xc-text)' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setAddKROpen(false)} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '14px', border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', cursor: 'pointer', color: 'var(--xc-text-soft)' }}>取消</button>
                <button onClick={() => { if (!newKR.title.trim()) return; onAddKR(goal, newKR); setNewKR({ title: '', targetValue: 100, unit: '%' }); setAddKROpen(false); }}
                  style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '14px', border: 'none', background: BRAND, cursor: 'pointer', color: '#fff', fontWeight: 700 }}>確認新增</button>
              </div>
            </div>
          )}
          {goal.keyResults?.length === 0 ? (
            <div style={{ fontSize: '14px', color: 'var(--xc-text-muted)', textAlign: 'center', padding: '12px' }}>尚未新增 Key Result</div>
          ) : (
            goal.keyResults.map(kr => (
              <div key={kr.id} style={{ position: 'relative' }}>
                <KRProgressBar kr={kr} onUpdate={(kr, newVal) => onUpdateKR(goal, kr, newVal)} />
                <button onClick={() => onDeleteKR(goal, kr)} style={{ position: 'absolute', top: '50%', right: '8px', transform: 'translateY(-50%)', width: '18px', height: '18px', borderRadius: '50%', border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', cursor: 'pointer', fontSize: '12px', color: 'var(--xc-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── 新增/編輯 Modal（含 parentId 設定）──────────────────────
function GoalModal({ goal, onClose, onSave, currentQuarter, currentYear, allGoals, initialParentId }) {
  const [form, setForm] = useState(goal ? {
    title:       goal.title,
    description: goal.description || '',
    quarter:     goal.quarter,
    year:        goal.year,
    status:      goal.status,
    owner:       goal.owner || '',
    parentId:    goal.parentId || '',
  } : {
    title:       '',
    description: '',
    quarter:     currentQuarter,
    year:        currentYear,
    status:      'active',
    owner:       '',
    parentId:    initialParentId || '',
  });

  const years = [currentYear - 1, currentYear, currentYear + 1];

  // 計算可用的父目標（排除自身及其後代，防止循環）
  function getDescendants(id) {
    const direct = allGoals.filter(g => g.parentId === id).map(g => g.id);
    return [id, ...direct.flatMap(cid => getDescendants(cid))];
  }
  const excludeIds = goal ? new Set(getDescendants(goal.id)) : new Set();
  const availableParents = allGoals.filter(g => !excludeIds.has(g.id));

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--xc-border)', background: 'var(--xc-surface-soft)', fontSize: '15px', color: 'var(--xc-text)', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '14px', fontWeight: 600, color: 'var(--xc-text-soft)', display: 'block', marginBottom: '5px' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ width: '500px', maxWidth: '95vw', background: 'var(--xc-surface)', borderRadius: '16px', padding: '28px', boxShadow: '0 24px 48px rgba(0,0,0,.2)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 700, color: 'var(--xc-text)' }}>
          {goal ? '編輯目標' : '新增 Objective'}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>目標標題 *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="輸入目標標題…" autoFocus style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>描述</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="目標說明、背景或衡量方式…" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          {/* 上層目標 */}
          <div>
            <label style={labelStyle}>上層目標（策略地圖階層）</label>
            <select value={form.parentId} onChange={e => setForm(p => ({ ...p, parentId: e.target.value }))} style={inputStyle}>
              <option value="">無（頂層目標）</option>
              {availableParents.map(g => (
                <option key={g.id} value={g.id}>{g.quarter} {g.year} · {g.title}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>季度</label>
              <select value={form.quarter} onChange={e => setForm(p => ({ ...p, quarter: e.target.value }))} style={inputStyle}>
                {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>年份</label>
              <select value={form.year} onChange={e => setForm(p => ({ ...p, year: parseInt(e.target.value, 10) }))} style={inputStyle}>
                {years.map(y => <option key={y} value={y}>{y} 年</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>狀態</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={inputStyle}>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>負責人</label>
              <input value={form.owner} onChange={e => setForm(p => ({ ...p, owner: e.target.value }))} placeholder="負責人姓名" style={inputStyle} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '8px', fontSize: '15px', border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', cursor: 'pointer', color: 'var(--xc-text-soft)' }}>取消</button>
          <button onClick={() => { if (!form.title.trim()) return; onSave(form); }}
            style={{ padding: '9px 22px', borderRadius: '8px', fontSize: '15px', border: 'none', background: BRAND, cursor: 'pointer', color: '#fff', fontWeight: 700 }}>
            {goal ? '儲存' : '新增'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ② 策略地圖元件
// ════════════════════════════════════════════════════════════

const MAP_NODE_W  = 220;
const MAP_NODE_H  = 108;
const MAP_H_GAP   = 36;
const MAP_V_GAP   = 80;
const MAP_PAD     = 48;

/**
 * 計算樹狀佈局：
 * - 遞迴指定每個節點的 (x, y) 坐標
 * - 葉節點均勻分布，父節點居中於子節點之上
 */
function buildLayout(allGoals) {
  const validIds  = new Set(allGoals.map(g => g.id));
  const roots     = allGoals.filter(g => !g.parentId || !validIds.has(g.parentId));
  const childrenOf = {};
  allGoals.forEach(g => {
    if (g.parentId && validIds.has(g.parentId)) {
      if (!childrenOf[g.parentId]) childrenOf[g.parentId] = [];
      childrenOf[g.parentId].push(g.id);
    }
  });

  const positions = {}; // id → { x, y, cx }

  /** 計算子樹寬度（像素） */
  function subtreeWidth(id) {
    const kids = childrenOf[id] || [];
    if (kids.length === 0) return MAP_NODE_W;
    const total = kids.reduce((s, cid) => s + subtreeWidth(cid), 0);
    return total + (kids.length - 1) * MAP_H_GAP;
  }

  /** 指定坐標，回傳右邊界 x */
  function assign(id, startX, depth) {
    const kids = childrenOf[id] || [];
    const y    = depth * (MAP_NODE_H + MAP_V_GAP);

    if (kids.length === 0) {
      const cx = startX + MAP_NODE_W / 2;
      positions[id] = { x: startX, y, cx };
      return startX + MAP_NODE_W;
    }

    let cx = startX;
    kids.forEach((kid, i) => {
      cx = assign(kid, cx, depth + 1);
      if (i < kids.length - 1) cx += MAP_H_GAP;
    });

    const parentCx = (positions[kids[0]].cx + positions[kids[kids.length - 1]].cx) / 2;
    positions[id] = { x: parentCx - MAP_NODE_W / 2, y, cx: parentCx };
    return cx;
  }

  let cursor = 0;
  roots.forEach(r => {
    const sw = subtreeWidth(r.id);
    cursor = assign(r.id, cursor, 0);
    cursor += MAP_H_GAP * 2;
  });

  // 孤立節點（parentId 存在但找不到）→ 也加入 positions
  allGoals.forEach(g => {
    if (!positions[g.id]) {
      positions[g.id] = { x: cursor, y: 0, cx: cursor + MAP_NODE_W / 2 };
      cursor += MAP_NODE_W + MAP_H_GAP;
    }
  });

  // 組建連線
  const edges = [];
  allGoals.forEach(g => {
    if (g.parentId && positions[g.parentId] && positions[g.id]) {
      edges.push({ fromId: g.parentId, toId: g.id });
    }
  });

  const allPos = Object.values(positions);
  const totalW = allPos.length ? Math.max(...allPos.map(p => p.x + MAP_NODE_W)) + MAP_PAD * 2 : 600;
  const totalH = allPos.length ? Math.max(...allPos.map(p => p.y + MAP_NODE_H)) + MAP_PAD * 2 : 400;

  return { positions, edges, totalW, totalH };
}

/** 策略地圖節點卡片 */
function MapNodeCard({ goal, onEdit, onAddChild }) {
  const [hovered, setHovered] = useState(false);
  const statusCfg = STATUS_CFG[goal.status] || STATUS_CFG.active;
  const pct       = goal.progress ?? localCalcProgress(goal.keyResults);
  const pctColor  = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : BRAND;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onEdit(goal)}
      style={{
        width: MAP_NODE_W,
        background: 'var(--xc-surface)',
        border: `2px solid ${hovered ? statusCfg.color : 'var(--xc-border)'}`,
        borderRadius: '12px',
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'border-color .2s, box-shadow .2s',
        boxShadow: hovered ? `0 8px 24px rgba(0,0,0,.12)` : '0 2px 8px rgba(0,0,0,.06)',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* 頂部色條 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', borderRadius: '12px 12px 0 0', background: statusCfg.color }} />

      {/* 標題 + 進度環 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '2px' }}>
        <ProgressRing pct={pct} size={40} stroke={4} color={pctColor} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--xc-text)', lineHeight: 1.35, marginBottom: '4px', wordBreak: 'break-all' }}>
            {goal.title}
          </div>
          <span style={{ fontSize: '12px', padding: '2px 7px', borderRadius: '8px', background: statusCfg.bg, color: statusCfg.color, fontWeight: 600 }}>
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* 底部資訊 */}
      <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--xc-text-muted)' }}>
          {goal.quarter} {goal.year} · {goal.keyResults?.length || 0} KR
        </span>
        {goal.owner && (
          <span style={{ fontSize: '12px', color: 'var(--xc-text-muted)' }}>{goal.owner}</span>
        )}
      </div>

      {/* + 添加子目標按鈕（hover 顯示） */}
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onAddChild(goal); }}
          title="新增子目標"
          style={{
            position: 'absolute', bottom: '-13px', left: '50%', transform: 'translateX(-50%)',
            width: '26px', height: '26px', borderRadius: '50%',
            background: BRAND, color: '#fff',
            border: '2px solid var(--xc-surface)',
            fontSize: '16px', lineHeight: '22px', textAlign: 'center',
            cursor: 'pointer', zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >+</button>
      )}
    </div>
  );
}

/** 策略地圖主元件 */
function StrategyMap({ allGoals, onEdit, onAddChild }) {
  if (allGoals.length === 0) {
    return (
      <div style={{ padding: '80px 40px', textAlign: 'center', color: 'var(--xc-text-muted)' }}>
        <div style={{ fontSize: '42px', marginBottom: '12px' }}>🗺️</div>
        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px', color: 'var(--xc-text)' }}>尚無目標資料</div>
        <div style={{ fontSize: '15px' }}>請先在列表視圖建立目標，即可在此看到策略地圖</div>
      </div>
    );
  }

  const { positions, edges, totalW, totalH } = buildLayout(allGoals);

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', border: '1px solid var(--xc-border)', borderRadius: '14px', background: 'var(--xc-surface-soft)', position: 'relative' }}>
      {/* 圖例 */}
      <div style={{ position: 'sticky', top: 0, left: 0, zIndex: 20, background: 'var(--xc-surface)', borderBottom: '1px solid var(--xc-border)', padding: '8px 16px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--xc-text-muted)' }}>圖例：</span>
        {Object.entries(STATUS_CFG).map(([k, v]) => (
          <span key={k} style={{ fontSize: '13px', color: v.color, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: v.color, display: 'inline-block' }} />{v.label}
          </span>
        ))}
        <span style={{ fontSize: '13px', color: 'var(--xc-text-muted)', marginLeft: 'auto' }}>
          點擊節點可編輯 · 懸停後點 <strong style={{ color: BRAND }}>+</strong> 新增子目標
        </span>
      </div>

      {/* 地圖畫布 */}
      <div style={{ position: 'relative', width: totalW, minWidth: '100%', height: totalH }}>
        {/* SVG 連線層 */}
        <svg
          style={{ position: 'absolute', top: 0, left: 0, width: totalW, height: totalH, pointerEvents: 'none' }}
          viewBox={`0 0 ${totalW} ${totalH}`}
        >
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="var(--xc-border)" />
            </marker>
          </defs>
          {edges.map((edge, i) => {
            const from = positions[edge.fromId];
            const to   = positions[edge.toId];
            if (!from || !to) return null;
            const x1   = from.cx + MAP_PAD;
            const y1   = from.y  + MAP_NODE_H + MAP_PAD;
            const x2   = to.cx   + MAP_PAD;
            const y2   = to.y    + MAP_PAD;
            const midY = (y1 + y2) / 2;
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                stroke="var(--xc-border)"
                strokeWidth="2"
                fill="none"
                strokeDasharray="none"
                markerEnd="url(#arrowhead)"
              />
            );
          })}
        </svg>

        {/* 節點層 */}
        {allGoals.map(goal => {
          const pos = positions[goal.id];
          if (!pos) return null;
          return (
            <div
              key={goal.id}
              style={{
                position: 'absolute',
                left:  pos.x  + MAP_PAD,
                top:   pos.y  + MAP_PAD,
                width: MAP_NODE_W,
              }}
            >
              <MapNodeCard
                goal={goal}
                onEdit={onEdit}
                onAddChild={onAddChild}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 主頁面
// ════════════════════════════════════════════════════════════
export default function GoalsPage() {
  const isMobile = useIsMobile();
  const { user, authFetch } = useAuth();
  const companyId = user?.companyId;

  const { quarter: initQ, year: initY } = getQuarterYear();
  const [quarter,      setQuarter]      = useState(initQ);
  const [year,         setYear]         = useState(initY);
  const [allGoals,     setAllGoals]     = useState([]); // 全部（地圖用）
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [modal,        setModal]        = useState(null); // null | { mode, goal?, parentId? }
  const [filterStatus, setFilterStatus] = useState('');
  const [view,         setView]         = useState('list'); // 'list' | 'map'

  // 取得全部目標（地圖視圖需要跨季度）
  const load = useCallback(async () => {
    if (!companyId || !authFetch) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res  = await authFetch(`/api/goals?companyId=${companyId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const d    = json.data || json;
      setAllGoals(d.goals || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId, authFetch]);

  useEffect(() => { load(); }, [load]);

  // 列表視圖：依季度/年度/狀態篩選（client-side）
  const goals = useMemo(() => {
    let list = allGoals.filter(g => g.quarter === quarter && String(g.year) === String(year));
    if (filterStatus) list = list.filter(g => g.status === filterStatus);
    return list;
  }, [allGoals, quarter, year, filterStatus]);

  // 統計（列表視圖）
  const meta = useMemo(() => {
    const total       = goals.length;
    const active      = goals.filter(g => g.status === 'active').length;
    const completed   = goals.filter(g => g.status === 'completed').length;
    const avgProgress = total > 0 ? Math.round(goals.reduce((s, g) => s + (g.progress ?? 0), 0) / total) : 0;
    return { total, active, completed, avgProgress };
  }, [goals]);

  // 全局統計（頁首用）
  const globalMeta = useMemo(() => {
    const total       = allGoals.length;
    const active      = allGoals.filter(g => g.status === 'active').length;
    const completed   = allGoals.filter(g => g.status === 'completed').length;
    const avgProgress = total > 0 ? Math.round(allGoals.reduce((s, g) => s + (g.progress ?? 0), 0) / total) : 0;
    return { total, active, completed, avgProgress };
  }, [allGoals]);

  // ── CRUD ────────────────────────────────────────────────
  const handleSaveGoal = async (form) => {
    try {
      const isEdit = modal?.mode === 'edit';
      const url    = isEdit ? `/api/goals/${modal.goal.id}` : '/api/goals';
      const method = isEdit ? 'PATCH' : 'POST';
      await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, companyId, parentId: form.parentId || null }),
      });
      setModal(null);
      load();
    } catch (e) { alert(e.message); }
  };

  const handleDelete = async (goal) => {
    if (!confirm(`確定刪除「${goal.title}」？`)) return;
    try {
      const res = await authFetch(`/api/goals/${goal.id}?companyId=${companyId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`刪除失敗 (HTTP ${res.status})`);
      load();
    } catch (e) { alert(`刪除失敗：${e.message}`); }
  };

  const handleAddKR = async (goal, kr) => {
    try {
      const res = await authFetch(`/api/goals/${goal.id}/key-results`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...kr, companyId }),
      });
      if (!res.ok) throw new Error(`新增 KR 失敗 (HTTP ${res.status})`);
      load();
    } catch (e) { alert(`新增 KR 失敗：${e.message}`); }
  };

  const handleUpdateKR = async (goal, kr, newVal) => {
    try {
      const res = await authFetch(`/api/goals/${goal.id}/key-results/${kr.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentValue: newVal, companyId }),
      });
      if (!res.ok) throw new Error(`更新 KR 失敗 (HTTP ${res.status})`);
      load();
    } catch (e) { console.error('[handleUpdateKR]', e.message); }
  };

  const handleDeleteKR = async (goal, kr) => {
    try {
      const res = await authFetch(`/api/goals/${goal.id}/key-results/${kr.id}?companyId=${companyId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`刪除 KR 失敗 (HTTP ${res.status})`);
      load();
    } catch (e) { alert(`刪除 KR 失敗：${e.message}`); }
  };

  // 從策略地圖點 + 按鈕新增子目標
  const handleAddChild = (parentGoal) => {
    setModal({ mode: 'add', parentId: parentGoal.id });
  };

  const years  = [year - 1, year, year + 1];

  // ── 頁首 KPI 卡片 ──────────────────────────────────────
  const kpiCards = [
    { label: '全部目標',  value: globalMeta.total,                     icon: '🎯', color: '#fff' },
    { label: '進行中',    value: globalMeta.active,                    icon: '🔄', color: '#93c5fd' },
    { label: '已完成',    value: globalMeta.completed,                 icon: '✅', color: '#6ee7b7' },
    { label: '整體進度',  value: `${globalMeta.avgProgress}%`,         icon: '📈', color: '#fcd34d' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--xc-bg)' }}>

      {/* ── BRAND 頁首 ─────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${BRAND} 0%, #8B0012 60%, #5C000C 100%)`,
        padding: isMobile ? '14px 16px 12px' : '32px 36px 28px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* 裝飾圓 */}
        <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(255,255,255,.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-30px', right: '120px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,.04)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* 標題列 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-.3px' }}>
                🎯 目標管理 OKR
              </h1>
              <p style={{ fontSize: '15px', color: 'rgba(255,255,255,.7)', margin: '4px 0 0' }}>
                Objectives & Key Results · 追蹤目標達成進度 + 策略地圖視覺化
              </p>
            </div>
            <button
              onClick={() => setModal({ mode: 'add' })}
              style={{
                padding: '10px 22px', borderRadius: '10px', fontSize: '15px',
                border: '2px solid rgba(255,255,255,.4)',
                background: 'rgba(255,255,255,.15)',
                cursor: 'pointer', color: '#fff', fontWeight: 700,
                backdropFilter: 'blur(8px)',
                transition: 'background .2s',
              }}
            >
              + 新增目標
            </button>
          </div>

          {/* KPI 卡片列 */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '12px' }}>
            {kpiCards.map(c => (
              <div key={c.label} style={{
                background: 'rgba(255,255,255,.12)',
                backdropFilter: 'blur(12px)',
                borderRadius: '12px',
                padding: '14px 18px',
                border: '1px solid rgba(255,255,255,.15)',
              }}>
                <div style={{ fontSize: '24px', marginBottom: '4px' }}>{c.icon}</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: c.color, lineHeight: 1 }}>
                  {loading ? '—' : c.value}
                </div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,.65)', marginTop: '3px' }}>{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 主內容區 ────────────────────────────────────── */}
      <div style={{ padding: isMobile ? '14px 16px' : '28px 36px', maxWidth: '1300px', margin: '0 auto' }}>

        {/* 視圖切換 + 篩選列 */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* 視圖切換 */}
          <div style={{ display: 'flex', border: '1px solid var(--xc-border)', borderRadius: '8px', overflow: 'hidden', marginRight: '4px' }}>
            {[['list', '☰ 列表'], ['map', '🗺️ 策略地圖']].map(([v, lbl]) => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '7px 16px', fontSize: '14px', border: 'none', borderRight: '1px solid var(--xc-border)',
                background: view === v ? BRAND : 'var(--xc-surface)',
                color: view === v ? '#fff' : 'var(--xc-text-soft)',
                cursor: 'pointer', fontWeight: view === v ? 700 : 400,
              }}>{lbl}</button>
            ))}
          </div>

          {/* 季度篩選（僅列表視圖有效） */}
          {view === 'list' && (
            <>
              <div style={{ display: 'flex', border: '1px solid var(--xc-border)', borderRadius: '8px', overflow: 'hidden' }}>
                {QUARTERS.map(q => (
                  <button key={q} onClick={() => setQuarter(q)} style={{
                    padding: '6px 14px', fontSize: '14px', border: 'none', borderRight: '1px solid var(--xc-border)',
                    background: quarter === q ? BRAND : 'var(--xc-surface)',
                    color: quarter === q ? '#fff' : 'var(--xc-text-soft)',
                    cursor: 'pointer', fontWeight: quarter === q ? 700 : 400,
                  }}>{q}</button>
                ))}
              </div>
              <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))} style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '14px', border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', color: 'var(--xc-text)' }}>
                {years.map(y => <option key={y} value={y}>{y} 年</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '14px', border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', color: 'var(--xc-text)' }}>
                <option value="">所有狀態</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              {/* 篩選後統計 */}
              <span style={{ fontSize: '14px', color: 'var(--xc-text-muted)', marginLeft: '4px' }}>
                {quarter} {year}：共 {meta.total} 個目標，進行中 {meta.active}，已完成 {meta.completed}，均進度 {meta.avgProgress}%
              </span>
            </>
          )}

          {view === 'map' && (
            <span style={{ fontSize: '14px', color: 'var(--xc-text-muted)' }}>
              顯示全部 {allGoals.length} 個目標的階層關係 · 可在編輯目標時設定「上層目標」建立策略關聯
            </span>
          )}

          <button onClick={load} style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '14px', border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', cursor: 'pointer', color: 'var(--xc-text-soft)', marginLeft: 'auto' }}>⟳ 重新整理</button>
        </div>

        {/* 錯誤提示 */}
        {error && (
          <div style={{ padding: '16px', borderRadius: '10px', marginBottom: '16px', background: 'color-mix(in srgb, var(--xc-danger) 8%, var(--xc-surface))', border: '1px solid var(--xc-danger)', color: 'var(--xc-danger)', fontSize: '15px' }}>
            ⚠️ {error}
          </div>
        )}

        {/* 載入中 */}
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--xc-text-muted)', fontSize: '16px' }}>載入中…</div>
        ) : view === 'map' ? (
          /* ── 策略地圖視圖 ── */
          <StrategyMap
            allGoals={allGoals}
            onEdit={g => setModal({ mode: 'edit', goal: g })}
            onAddChild={handleAddChild}
          />
        ) : (
          /* ── 列表視圖 ── */
          goals.length === 0 ? (
            <div style={{ padding: '60px 40px', textAlign: 'center', background: 'var(--xc-surface)', border: '2px dashed var(--xc-border)', borderRadius: '16px' }}>
              <div style={{ fontSize: '42px', marginBottom: '12px' }}>🎯</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--xc-text)', marginBottom: '6px' }}>{quarter} {year} 尚無目標</div>
              <div style={{ fontSize: '15px', color: 'var(--xc-text-muted)', marginBottom: '18px' }}>設定第一個 OKR，開始追蹤目標進度</div>
              <button onClick={() => setModal({ mode: 'add' })} style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '15px', border: 'none', background: BRAND, cursor: 'pointer', color: '#fff', fontWeight: 700 }}>+ 新增第一個目標</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {goals.map(goal => (
                <OkrCard
                  key={goal.id}
                  goal={goal}
                  allGoals={allGoals}
                  onEdit={g => setModal({ mode: 'edit', goal: g })}
                  onDelete={handleDelete}
                  onAddKR={handleAddKR}
                  onUpdateKR={handleUpdateKR}
                  onDeleteKR={handleDeleteKR}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* ── Modal ── */}
      {modal && (
        <GoalModal
          goal={modal.mode === 'edit' ? modal.goal : null}
          initialParentId={modal.parentId}
          onClose={() => setModal(null)}
          onSave={handleSaveGoal}
          currentQuarter={quarter}
          currentYear={year}
          allGoals={allGoals}
        />
      )}
    </div>
  );
}
