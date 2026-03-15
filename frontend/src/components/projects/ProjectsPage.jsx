/**
 * ProjectsPage — 專案管理（Asana 7步驟設計框架重構）
 *
 * 參考：「什麼是專案設計？附專家提示的 7 個步驟 [2025] • Asana」
 *
 * ① 定義目標   → 專案名稱、描述、目標設定
 * ② 分解工作   → 任務完成率、任務數量
 * ③ 設定里程碑 → 截止日、時程進度
 * ④ 指派負責人 → 負責人頭像、角色
 * ⑤ 建立時程   → 開始~結束日期、剩餘天數
 * ⑥ 識別風險   → 健康指標（順利/有風險/落後）
 * ⑦ 追蹤審查   → 整體統計、進度條、狀態篩選
 *
 * 視圖：列表視圖（Asana 表格式）/ 卡片視圖（Grid）
 */

import { useState, useEffect, useCallback } from 'react';
import ProjectDetail from './ProjectDetail';

const API        = import.meta.env.VITE_API_URL || 'http://localhost:3010';
const COMPANY_ID = 2;

// ── Design Tokens（對齊 xCloud 品牌）───────────────────────
const C = {
  brand:   '#C41230',
  brandDk: '#8B0020',
  ink:     '#111827',
  ink2:    '#374151',
  ink3:    '#6B7280',
  ink4:    '#9CA3AF',
  line:    '#E5E7EB',
  lineL:   '#F3F4F6',
  bg:      '#F7F2F2',
  white:   '#FFFFFF',
};

// ── 狀態設定 ─────────────────────────────────────────────
const STATUS = {
  planning:  { bg: '#EDE9FE', color: '#5B21B6', dot: '#7C3AED', label: '規劃中' },
  active:    { bg: '#DCFCE7', color: '#15803D', dot: '#16A34A', label: '進行中' },
  on_hold:   { bg: '#FEF9C3', color: '#A16207', dot: '#D97706', label: '暫停中' },
  completed: { bg: '#F1F5F9', color: '#475569', dot: '#64748B', label: '已完成' },
  cancelled: { bg: '#FEE2E2', color: '#B91C1C', dot: '#DC2626', label: '已取消' },
};

// ── 健康狀態（Asana 風格：順利/有風險/落後）─────────────
const HEALTH = {
  on_track:  { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', label: '順利',   icon: '●' },
  at_risk:   { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: '有風險', icon: '●' },
  off_track: { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: '落後',   icon: '●' },
  completed: { color: '#475569', bg: '#F1F5F9', border: '#CBD5E1', label: '完成',   icon: '✓' },
};

function getHealth(project) {
  if (project.status === 'completed') return 'completed';
  if (project.status === 'cancelled') return 'completed';
  const now = new Date();
  const end = project.endDate ? new Date(project.endDate) : null;
  const start = project.startDate ? new Date(project.startDate) : null;
  if (!end) return 'on_track';
  if (now > end && (project.completion || 0) < 100) return 'off_track';
  if (start && end) {
    const total   = (end - start) / 864e5;
    const elapsed = (now - start) / 864e5;
    const expected = Math.min(100, total > 0 ? (elapsed / total) * 100 : 0);
    if (expected - (project.completion || 0) > 25) return 'at_risk';
  }
  return 'on_track';
}

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
}

function daysLeft(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - new Date()) / 864e5);
}

// ── 共用樣式 ─────────────────────────────────────────────
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  border: `1px solid ${C.line}`, borderRadius: '8px',
  padding: '8px 12px', fontSize: '13.5px', color: C.ink,
  outline: 'none', background: C.white, fontFamily: 'inherit',
};
const btnPrimary = {
  background: C.brand, color: 'white',
  border: 'none', borderRadius: '8px',
  padding: '9px 20px', fontSize: '13.5px', fontWeight: '600',
  cursor: 'pointer', fontFamily: 'inherit',
};
const btnOutline = {
  background: C.white, color: C.ink2,
  border: `1px solid ${C.line}`, borderRadius: '8px',
  padding: '9px 20px', fontSize: '13.5px', fontWeight: '600',
  cursor: 'pointer', fontFamily: 'inherit',
};
const btnDanger = {
  background: '#DC2626', color: 'white',
  border: 'none', borderRadius: '8px',
  padding: '9px 20px', fontSize: '13.5px', fontWeight: '600',
  cursor: 'pointer', fontFamily: 'inherit',
};

// ════════════════════════════════════════════════════════════
// ① 進度環（SVG circular progress）
// ════════════════════════════════════════════════════════════
function ProgressRing({ pct, size = 44, stroke = 4, color = C.brand }) {
  const r  = (size - stroke * 2) / 2;
  const c  = 2 * Math.PI * r;
  const offset = c - (Math.min(pct, 100) / 100) * c;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.lineL} strokeWidth={stroke}/>
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={pct >= 100 ? '#16A34A' : pct >= 60 ? color : pct >= 30 ? '#D97706' : '#DC2626'}
        strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={offset}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.4s' }}
      />
      <text
        x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: `${size/2}px ${size/2}px`, fontSize: size < 36 ? '8px' : '10px', fontWeight: '700', fill: C.ink2 }}
      >
        {pct}%
      </text>
    </svg>
  );
}

// ════════════════════════════════════════════════════════════
// ② 健康指標徽章
// ════════════════════════════════════════════════════════════
function HealthBadge({ project, size = 'md' }) {
  const key = getHealth(project);
  const h   = HEALTH[key];
  const fs  = size === 'sm' ? '10px' : '11.5px';
  const pad = size === 'sm' ? '2px 7px' : '3px 9px';
  return (
    <span style={{
      fontSize: fs, fontWeight: '600',
      color: h.color, background: h.bg,
      border: `1px solid ${h.border}`,
      borderRadius: '99px', padding: pad,
      whiteSpace: 'nowrap',
    }}>
      {h.icon} {h.label}
    </span>
  );
}

// ════════════════════════════════════════════════════════════
// ③ 負責人頭像
// ════════════════════════════════════════════════════════════
function Avatar({ name, size = 28 }) {
  return (
    <div
      title={name || '未指派'}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: name
          ? `linear-gradient(135deg, ${C.brand}, ${C.brandDk})`
          : C.lineL,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: name ? 'white' : C.ink4,
        fontSize: size < 30 ? '10px' : '12px',
        fontWeight: '700',
        border: `2px solid white`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      {name ? initials(name) : '?'}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ④ 列表視圖列（Asana 表格式）
// ════════════════════════════════════════════════════════════
function ListRow({ project, onOpen, onEdit, onDelete, isLast }) {
  const st   = STATUS[project.status] || STATUS.active;
  const dl   = daysLeft(project.endDate);
  const dlColor = dl === null ? C.ink4 : dl < 0 ? '#DC2626' : dl <= 7 ? '#D97706' : C.ink3;
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr 100px 90px 80px 90px 70px 80px',
        alignItems: 'center',
        padding: '10px 16px',
        borderBottom: isLast ? 'none' : `1px solid ${C.lineL}`,
        background: hover ? '#FAFAFA' : C.white,
        cursor: 'default',
        transition: 'background 0.1s',
        gap: '8px',
      }}
    >
      {/* 健康圓點 */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {(() => { const h = HEALTH[getHealth(project)]; return (
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: h.color }} title={h.label} />
        ); })()}
      </div>

      {/* 專案名稱 */}
      <div
        onClick={() => onOpen(project)}
        style={{ cursor: 'pointer' }}
      >
        <div style={{ fontSize: '13.5px', fontWeight: '600', color: C.ink, lineHeight: '1.3' }}>
          {project.name}
        </div>
        {project.description && (
          <div style={{
            fontSize: '11.5px', color: C.ink4, marginTop: '1px',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '280px',
          }}>
            {project.description}
          </div>
        )}
      </div>

      {/* 負責人 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Avatar name={project.owner?.name} size={24} />
        <span style={{ fontSize: '12px', color: C.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60px' }}>
          {project.owner?.name || '—'}
        </span>
      </div>

      {/* 狀態 */}
      <span style={{
        fontSize: '11px', fontWeight: '600',
        color: st.color, background: st.bg,
        borderRadius: '99px', padding: '3px 9px',
        whiteSpace: 'nowrap', display: 'inline-block',
      }}>
        {st.label}
      </span>

      {/* 進度 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <ProgressRing pct={project.completion || 0} size={32} stroke={3} />
      </div>

      {/* 截止日 */}
      <div style={{ fontSize: '12px', color: dlColor, fontWeight: dl !== null && dl <= 7 ? '600' : '400' }}>
        {dl === null ? '—' : dl < 0 ? `逾期 ${Math.abs(dl)}天` : dl === 0 ? '今天截止' : fmtDate(project.endDate)}
      </div>

      {/* 任務數 */}
      <div style={{ fontSize: '12px', color: C.ink3 }}>
        {project.taskDone ?? 0}/{project.taskTotal ?? 0}
      </div>

      {/* 操作 */}
      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', opacity: hover ? 1 : 0, transition: 'opacity 0.15s' }}>
        <button
          onClick={() => onEdit(project)}
          style={{ padding: '4px 8px', background: C.white, border: `1px solid ${C.line}`, borderRadius: '6px', fontSize: '11px', cursor: 'pointer', color: C.ink2, fontFamily: 'inherit' }}
        >
          編輯
        </button>
        <button
          onClick={() => onDelete(project)}
          style={{ padding: '4px 8px', background: C.white, border: '1px solid #FECACA', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', color: '#DC2626', fontFamily: 'inherit' }}
        >
          刪除
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ⑤ 卡片視圖（Grid）— 增強版
// ════════════════════════════════════════════════════════════
function ProjectCard({ project, onOpen, onEdit, onDelete }) {
  const st  = STATUS[project.status] || STATUS.active;
  const dl  = daysLeft(project.endDate);
  const dlColor = dl === null ? C.ink4 : dl < 0 ? '#DC2626' : dl <= 7 ? '#D97706' : C.ink4;

  return (
    <div
      style={{
        background: C.white,
        border: `1px solid ${C.line}`,
        borderRadius: '14px',
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        display: 'flex', flexDirection: 'column',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'; }}
      onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; }}
    >
      {/* 頂部色帶 + 健康狀態 */}
      <div style={{
        height: '5px',
        background: st.dot,
      }} />

      {/* 卡片主體 */}
      <div
        onClick={() => onOpen(project)}
        style={{ padding: '16px 18px', flex: 1, cursor: 'pointer' }}
      >
        {/* 第 1 行：健康徽章 + 天數 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <HealthBadge project={project} size="sm" />
          {dl !== null && (
            <span style={{ fontSize: '11.5px', color: dlColor, fontWeight: dl <= 7 ? '600' : '400' }}>
              {dl < 0 ? `逾期 ${Math.abs(dl)}天` : dl === 0 ? '今天截止' : `${dl}天`}
            </span>
          )}
        </div>

        {/* 第 2 行：名稱 */}
        <h3 style={{ margin: '0 0 5px', fontSize: '15px', fontWeight: '700', color: C.ink, lineHeight: '1.3' }}>
          {project.name}
        </h3>

        {/* 第 3 行：描述 */}
        {project.description && (
          <p style={{
            margin: '0 0 14px', fontSize: '12.5px', color: C.ink3, lineHeight: '1.5',
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {project.description}
          </p>
        )}
        {!project.description && <div style={{ marginBottom: '14px' }} />}

        {/* 第 4 行：進度環 + 任務數 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <ProgressRing pct={project.completion || 0} size={44} stroke={4} />
          <div>
            <div style={{ fontSize: '11px', color: C.ink4, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '1px' }}>
              任務進度
            </div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: C.ink }}>
              {project.taskDone ?? 0}
              <span style={{ color: C.ink4, fontWeight: '400', fontSize: '12px' }}>/{project.taskTotal ?? 0} 個</span>
            </div>
          </div>
        </div>

        {/* 第 5 行：日期 + 狀態 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: '12px', borderTop: `1px solid ${C.lineL}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <Avatar name={project.owner?.name} size={24} />
            <span style={{ fontSize: '12px', color: C.ink3 }}>
              {project.owner?.name || '未指派'}
            </span>
          </div>
          <span style={{
            fontSize: '11px', fontWeight: '600',
            color: st.color, background: st.bg,
            borderRadius: '99px', padding: '3px 9px',
          }}>
            {st.label}
          </span>
        </div>
      </div>

      {/* 操作列 */}
      <div style={{
        display: 'flex', gap: '6px', padding: '9px 14px',
        borderTop: `1px solid ${C.lineL}`, background: '#FAFAFA',
        justifyContent: 'flex-end',
      }}>
        {project.budget && (
          <span style={{ fontSize: '11.5px', color: C.ink4, marginRight: 'auto', display: 'flex', alignItems: 'center' }}>
            💰 {(project.budget / 10000).toFixed(0)}萬
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onEdit(project); }}
          style={{ padding: '5px 12px', background: C.white, border: `1px solid ${C.line}`, borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: C.ink2, fontFamily: 'inherit', fontWeight: '500' }}
        >
          ✏️ 編輯
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(project); }}
          style={{ padding: '5px 12px', background: C.white, border: '1px solid #FECACA', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#DC2626', fontFamily: 'inherit', fontWeight: '500' }}
        >
          🗑️ 刪除
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ⑥ 新增/編輯 Modal（Asana 7步驟分節表單）
// ════════════════════════════════════════════════════════════
function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', color: C.ink2, marginBottom: '5px' }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ margin: '4px 0 0', fontSize: '11px', color: C.ink4 }}>{hint}</p>}
    </div>
  );
}

function SectionTitle({ step, label, desc }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px',
      marginBottom: '14px', paddingBottom: '10px',
      borderBottom: `1px solid ${C.lineL}`,
    }}>
      <div style={{
        width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
        background: C.brand, color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '11px', fontWeight: '800',
      }}>
        {step}
      </div>
      <div>
        <div style={{ fontSize: '13px', fontWeight: '700', color: C.ink }}>{label}</div>
        <div style={{ fontSize: '11.5px', color: C.ink4, marginTop: '1px' }}>{desc}</div>
      </div>
    </div>
  );
}

function ProjectFormModal({ users, project, onClose, onSaved }) {
  const isEdit = !!project;
  const [form, setForm] = useState({
    name:        project?.name        || '',
    description: project?.description || '',
    status:      project?.status      || 'planning',
    budget:      project?.budget      ? String(project.budget) : '',
    startDate:   project?.startDate   ? project.startDate.slice(0, 10) : '',
    endDate:     project?.endDate     ? project.endDate.slice(0, 10)   : '',
    ownerId:     project?.owner?.id   ? String(project.owner.id)       : '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('專案名稱為必填'); return; }
    setSaving(true); setError('');
    try {
      const url = isEdit ? `${API}/api/projects/${project.id}` : `${API}/api/projects`;
      const res  = await fetch(url, {
        method:  isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, companyId: COMPANY_ID }),
      });
      const json = await res.json();
      if (!json.success && !res.ok) throw new Error(json.error || '操作失敗');
      onSaved(json.data || json);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: C.white, borderRadius: '18px',
        width: '560px', maxWidth: '96vw',
        maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
      }}>
        {/* Modal 頭部 */}
        <div style={{
          padding: '22px 28px 0',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
            background: isEdit ? '#FFF0F2' : '#F0FDF4',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px',
          }}>
            {isEdit ? '✏️' : '🚀'}
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: C.ink }}>
              {isEdit ? '編輯專案' : '建立新專案'}
            </h2>
            <p style={{ margin: 0, fontSize: '12px', color: C.ink4 }}>
              依照 Asana 7 步驟專案設計框架
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: C.ink4 }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 28px 28px' }}>

          {/* ① 定義目標 */}
          <div style={{ marginBottom: '20px', padding: '16px', background: '#FAFAFA', borderRadius: '10px', border: `1px solid ${C.lineL}` }}>
            <SectionTitle step="1" label="定義目標" desc="清楚說明專案名稱與核心目的" />
            <Field label="專案名稱 *" hint="簡潔有力，讓所有人一眼看出專案目的">
              <input
                value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="例如：電商平台 2.0 重構計畫"
                style={inputStyle} autoFocus
              />
            </Field>
            <Field label="目標描述" hint="說明此專案解決什麼問題、交付什麼成果">
              <textarea
                value={form.description} onChange={e => set('description', e.target.value)}
                placeholder="例如：重構購物車結帳流程，目標將轉換率提升 15%..."
                rows={3} style={{ ...inputStyle, resize: 'vertical' }}
              />
            </Field>
          </div>

          {/* ② 建立時程（步驟 2+5）*/}
          <div style={{ marginBottom: '20px', padding: '16px', background: '#FAFAFA', borderRadius: '10px', border: `1px solid ${C.lineL}` }}>
            <SectionTitle step="2" label="建立時程" desc="設定開始與截止日期，確保里程碑清晰可追蹤" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="開始日期">
                <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} style={inputStyle} />
              </Field>
              <Field label="截止日期">
                <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} style={inputStyle} />
              </Field>
            </div>
          </div>

          {/* ③ 指派負責人（步驟 4）*/}
          <div style={{ marginBottom: '20px', padding: '16px', background: '#FAFAFA', borderRadius: '10px', border: `1px solid ${C.lineL}` }}>
            <SectionTitle step="3" label="指派負責人" desc="明確的所有權是專案成功的關鍵（RACI 原則）" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="專案負責人" hint="Responsible — 主要執行者">
                <select value={form.ownerId} onChange={e => set('ownerId', e.target.value)} style={inputStyle}>
                  <option value="">— 未指派 —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
              <Field label="專案狀態" hint="反映當前專案執行階段">
                <select value={form.status} onChange={e => set('status', e.target.value)} style={inputStyle}>
                  <option value="planning">🟣 規劃中</option>
                  <option value="active">🟢 進行中</option>
                  <option value="on_hold">🟡 暫停中</option>
                  <option value="completed">⚫ 已完成</option>
                  <option value="cancelled">🔴 已取消</option>
                </select>
              </Field>
            </div>
          </div>

          {/* ④ 資源規劃（步驟 6）*/}
          <div style={{ marginBottom: '20px', padding: '16px', background: '#FAFAFA', borderRadius: '10px', border: `1px solid ${C.lineL}` }}>
            <SectionTitle step="4" label="資源與預算" desc="提前識別資源風險，避免計畫外成本" />
            <Field label="專案預算（元）" hint="留空表示無預算限制">
              <input
                type="number" value={form.budget} onChange={e => set('budget', e.target.value)}
                placeholder="例如：1,500,000"
                style={inputStyle}
              />
            </Field>
          </div>

          {/* 錯誤訊息 */}
          {error && (
            <div style={{ background: '#FEE2E2', color: '#B91C1C', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '14px' }}>
              ⚠️ {error}
            </div>
          )}

          {/* 送出 */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnOutline}>取消</button>
            <button
              type="submit"
              disabled={saving}
              style={saving ? { ...btnPrimary, opacity: 0.6 } : btnPrimary}
            >
              {saving
                ? (isEdit ? '儲存中…' : '建立中…')
                : (isEdit ? '💾 儲存變更' : '🚀 建立專案')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ⑦ 刪除確認 Modal
// ════════════════════════════════════════════════════════════
function DeleteConfirmModal({ project, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState('');

  const handleDelete = async () => {
    setDeleting(true); setError('');
    try {
      const res  = await fetch(`${API}/api/projects/${project.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '刪除失敗');
      onDeleted(project.id);
    } catch (e) {
      setError(e.message);
      setDeleting(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: C.white, borderRadius: '16px', padding: '32px', width: '440px', maxWidth: '92vw', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FEE2E2', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
          🗑️
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: '700', color: C.ink }}>確認刪除專案？</h2>
        <p style={{ margin: '0 0 6px', fontSize: '13.5px', color: C.ink3 }}>即將刪除：</p>
        <p style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '700', color: C.ink, background: C.lineL, padding: '8px 16px', borderRadius: '8px', display: 'inline-block' }}>
          📁 {project.name}
        </p>
        {project.taskTotal > 0 && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#A16207', marginBottom: '14px', textAlign: 'left' }}>
            ⚠️ 此專案包含 <strong>{project.taskTotal}</strong> 個任務，刪除後資料將一併封存。
          </div>
        )}
        <p style={{ margin: '0 0 20px', fontSize: '12.5px', color: C.ink4 }}>此操作為軟刪除，資料可復原。</p>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#B91C1C', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '14px' }}>
            ❌ {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button onClick={onClose} style={btnOutline} disabled={deleting}>取消</button>
          <button onClick={handleDelete} disabled={deleting} style={deleting ? { ...btnDanger, opacity: 0.6 } : btnDanger}>
            {deleting ? '刪除中…' : '確認刪除'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 主元件：ProjectsPage
// ════════════════════════════════════════════════════════════
export default function ProjectsPage() {
  const [projects,       setProjects]       = useState([]);
  const [users,          setUsers]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [showCreate,     setShowCreate]     = useState(false);
  const [editProject,    setEditProject]    = useState(null);
  const [deleteProject,  setDeleteProject]  = useState(null);
  const [activeProject,  setActiveProject]  = useState(null);
  const [filter,         setFilter]         = useState('all');
  const [view,           setView]           = useState('list');   // 'list' | 'grid'
  const [toast,          setToast]          = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const loadProjects = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [pRes, uRes] = await Promise.all([
        fetch(`${API}/api/projects?companyId=${COMPANY_ID}`),
        fetch(`${API}/api/users?companyId=${COMPANY_ID}`).catch(() => ({ json: async () => ({ data: [] }) })),
      ]);
      const pData = await pRes.json();
      setProjects(pData.data || []);
      try { const uData = await uRes.json(); setUsers(uData.data || []); } catch { /**/ }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleCreated = ()        => { setShowCreate(false);  loadProjects(); showToast('✅ 專案已建立'); };
  const handleEdited  = (updated) => {
    setEditProject(null);
    setProjects(prev => prev.map(p => p.id !== updated.id ? p : { ...p, ...updated }));
    showToast('✅ 專案已更新');
  };
  const handleDeleted = (id)      => { setDeleteProject(null); setProjects(prev => prev.filter(p => p.id !== id)); showToast('🗑️ 專案已刪除'); };

  if (activeProject) {
    return (
      <ProjectDetail
        projectId={activeProject.id}
        projectName={activeProject.name}
        onBack={() => setActiveProject(null)}
      />
    );
  }

  // 篩選
  const filtered = filter === 'all' ? projects : projects.filter(p =>
    filter === 'at_risk' ? ['at_risk', 'off_track'].includes(getHealth(p)) : p.status === filter
  );

  // 統計（⑦ 追蹤審查）
  const stats = {
    total:     projects.length,
    active:    projects.filter(p => p.status === 'active').length,
    at_risk:   projects.filter(p => ['at_risk','off_track'].includes(getHealth(p))).length,
    completed: projects.filter(p => p.status === 'completed').length,
    planning:  projects.filter(p => p.status === 'planning').length,
    avgComp:   projects.length
      ? Math.round(projects.reduce((s, p) => s + (p.completion || 0), 0) / projects.length)
      : 0,
  };

  const FILTERS = [
    { key: 'all',       label: `全部`,     count: stats.total },
    { key: 'active',    label: `進行中`,   count: stats.active },
    { key: 'planning',  label: `規劃中`,   count: stats.planning },
    { key: 'at_risk',   label: `有風險`,   count: stats.at_risk },
    { key: 'completed', label: `已完成`,   count: stats.completed },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          background: '#1E293B', color: 'white',
          padding: '12px 20px', borderRadius: '10px',
          fontSize: '13.5px', fontWeight: '500',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          animation: 'fadeIn 0.2s ease',
        }}>
          {toast}
        </div>
      )}

      {/* ── 頁首 ── */}
      <div style={{
        padding: '20px 28px 14px',
        background: C.white,
        borderBottom: `1px solid ${C.line}`,
        flexShrink: 0,
      }}>
        {/* 標題列 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.ink }}>
              專案管理
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: C.ink4 }}>
              Asana 7步驟設計 · 共 {stats.total} 個專案 · 平均完成 {stats.avgComp}%
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={btnPrimary}
          >
            ＋ 新增專案
          </button>
        </div>

        {/* ⑦ 統計卡片列 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
          {[
            { label: '全部專案',   value: stats.total,     icon: '📁', color: C.ink2,    bg: C.lineL },
            { label: '進行中',     value: stats.active,    icon: '🟢', color: '#15803D', bg: '#F0FDF4' },
            { label: '有風險',     value: stats.at_risk,   icon: '⚠️', color: '#D97706', bg: '#FFFBEB' },
            { label: '已完成',     value: stats.completed, icon: '✓',  color: '#475569', bg: '#F8FAFC' },
          ].map(s => (
            <div key={s.label} style={{
              background: s.bg, borderRadius: '10px', padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <span style={{ fontSize: '20px' }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: s.color, lineHeight: 1 }}>
                  {s.value}
                </div>
                <div style={{ fontSize: '11px', color: C.ink4, marginTop: '2px' }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 篩選 + 視圖切換 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ display: 'flex', gap: '4px', flex: 1, flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  background:   filter === f.key ? C.ink : C.white,
                  color:        filter === f.key ? 'white' : C.ink2,
                  border:       `1px solid ${filter === f.key ? C.ink : C.line}`,
                  borderRadius: '99px', padding: '5px 14px',
                  fontSize: '12.5px', fontWeight: '500',
                  cursor: 'pointer', transition: 'all 0.15s',
                  fontFamily: 'inherit',
                }}
              >
                {f.label}
                <span style={{
                  marginLeft: '5px', fontSize: '11px',
                  background: filter === f.key ? 'rgba(255,255,255,0.25)' : C.lineL,
                  color: filter === f.key ? 'white' : C.ink4,
                  borderRadius: '99px', padding: '1px 6px',
                }}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          {/* 視圖切換 */}
          <div style={{ display: 'flex', background: C.lineL, borderRadius: '8px', padding: '3px' }}>
            {[
              { key: 'list', icon: '☰', label: '列表' },
              { key: 'grid', icon: '⊞', label: '卡片' },
            ].map(v => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                title={v.label}
                style={{
                  padding: '5px 11px',
                  borderRadius: '6px',
                  border: 'none',
                  background: view === v.key ? C.white : 'transparent',
                  color: view === v.key ? C.ink : C.ink4,
                  cursor: 'pointer',
                  fontSize: '14px',
                  boxShadow: view === v.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                  fontFamily: 'inherit',
                }}
              >
                {v.icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 內容區 ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <div style={{ display: 'inline-block', width: '36px', height: '36px', border: `3px solid ${C.brand}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ marginTop: '14px', color: C.ink4, fontSize: '13.5px' }}>載入專案中…</div>
          </div>
        ) : error ? (
          <div style={{ padding: '80px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>😢</div>
            <div style={{ color: '#DC2626', fontWeight: '700', marginBottom: '8px' }}>載入失敗</div>
            <div style={{ color: C.ink4, marginBottom: '16px', fontSize: '13px' }}>{error}</div>
            <button onClick={loadProjects} style={btnPrimary}>重試</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '80px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '14px' }}>📭</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: C.ink, marginBottom: '8px' }}>沒有符合的專案</div>
            <div style={{ fontSize: '13px', color: C.ink4, marginBottom: '18px' }}>
              {filter === 'all' ? '點擊「新增專案」開始建立第一個專案' : '切換篩選條件查看其他專案'}
            </div>
            {filter === 'all' && (
              <button onClick={() => setShowCreate(true)} style={btnPrimary}>🚀 建立第一個專案</button>
            )}
          </div>

        ) : view === 'list' ? (
          /* ── 列表視圖 ── */
          <div style={{ background: C.white }}>
            {/* 表頭 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '28px 1fr 100px 90px 80px 90px 70px 80px',
              padding: '8px 16px',
              borderBottom: `2px solid ${C.line}`,
              gap: '8px',
              position: 'sticky', top: 0, background: '#FAFAFA', zIndex: 5,
            }}>
              {['', '專案名稱', '負責人', '狀態', '進度', '截止日', '任務', '操作'].map((h, i) => (
                <div key={i} style={{ fontSize: '11px', fontWeight: '700', color: C.ink4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {h}
                </div>
              ))}
            </div>
            {filtered.map((project, i) => (
              <ListRow
                key={project.id}
                project={project}
                onOpen={setActiveProject}
                onEdit={setEditProject}
                onDelete={setDeleteProject}
                isLast={i === filtered.length - 1}
              />
            ))}
          </div>

        ) : (
          /* ── 卡片視圖 ── */
          <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {filtered.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={setActiveProject}
                onEdit={setEditProject}
                onDelete={setDeleteProject}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showCreate && (
        <ProjectFormModal users={users} project={null} onClose={() => setShowCreate(false)} onSaved={handleCreated} />
      )}
      {editProject && (
        <ProjectFormModal users={users} project={editProject} onClose={() => setEditProject(null)} onSaved={handleEdited} />
      )}
      {deleteProject && (
        <DeleteConfirmModal project={deleteProject} onClose={() => setDeleteProject(null)} onDeleted={handleDeleted} />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin   { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
