/**
 * ProjectDetail.jsx
 * 專案詳情頁 — 任務看板 / 任務列表 / 里程碑 / 統計
 *
 * Props:
 *   projectId   {number}   專案 ID
 *   projectName {string}   專案名稱（立即顯示，載入中用）
 *   onBack      {function} 返回上一頁
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { TaskSidePanel } from '../tasks/TaskKanbanPage';
import { useIsMobile } from '../../hooks/useResponsive';

const API = '/api/projects';

// ── Design tokens（與 ProjectsPage 一致）──────────────────
const C = {
  brand: 'var(--xc-brand)', brandDk: 'var(--xc-brand-dark)',
  ink: 'var(--xc-text)', ink2: 'var(--xc-text-soft)', ink3: 'var(--xc-text-muted)',
  line: 'var(--xc-border)', bg: 'var(--xc-bg)',
  surface: 'var(--xc-surface)', surfaceSoft: 'var(--xc-surface-soft)',
  surfaceMuted: 'var(--xc-surface-muted)', white: 'var(--xc-surface-strong)',
  success: 'var(--xc-success)', successSoft: 'var(--xc-success-soft)',
  warning: 'var(--xc-warning)', warningSoft: 'var(--xc-warning-soft)',
  dangerSoft: 'var(--xc-danger-soft)',
  shadow: 'var(--xc-shadow)', shadowStrong: 'var(--xc-shadow-strong)',
};

// 任務狀態定義（使用 color-mix 自動適應深淺色主題）
const TASK_STATUS = {
  todo:        { label: '待辦',   bg: 'color-mix(in srgb,#6B6461 14%,var(--xc-surface))', color: 'var(--xc-text-soft)', next: 'in_progress', nextLabel: '開始' },
  in_progress: { label: '進行中', bg: 'color-mix(in srgb,#C70018 14%,var(--xc-surface))', color: 'var(--xc-brand)',    next: 'review',      nextLabel: '送審' },
  review:      { label: '審核中', bg: 'color-mix(in srgb,#D97706 14%,var(--xc-surface))', color: '#D97706',            next: 'done',        nextLabel: '完成' },
  done:        { label: '已完成', bg: 'color-mix(in srgb,#16A34A 14%,var(--xc-surface))', color: '#16A34A',            next: 'todo',        nextLabel: '重開' },
  completed:   { label: '已完成', bg: 'color-mix(in srgb,#16A34A 14%,var(--xc-surface))', color: '#16A34A',            next: 'todo',        nextLabel: '重開' },
};

// 任務優先度
const PRIORITY = {
  urgent: { label: '緊急', color: '#C70018', bg: 'color-mix(in srgb,#C70018 12%,var(--xc-surface-strong))' },
  high:   { label: '高',   color: '#B35810', bg: 'color-mix(in srgb,#D16D18 14%,var(--xc-surface-strong))' },
  medium: { label: '中',   color: 'var(--xc-text-soft)', bg: 'var(--xc-surface-muted)' },
  low:    { label: '低',   color: 'var(--xc-text-muted)', bg: 'var(--xc-surface-soft)' },
};

// 專案狀態（使用 color-mix 自動適應深淺色主題）
const PROJ_STATUS = {
  planning:  { bg: 'color-mix(in srgb,#7C3AED 14%,var(--xc-surface))', color: '#8B5CF6', label: '規劃中' },
  active:    { bg: 'color-mix(in srgb,#16A34A 14%,var(--xc-surface))', color: '#16A34A', label: '進行中' },
  on_hold:   { bg: 'color-mix(in srgb,#D97706 14%,var(--xc-surface))', color: '#D97706', label: '暫停中' },
  completed: { bg: 'var(--xc-surface-muted)', color: 'var(--xc-text-muted)', label: '已完成' },
  cancelled: { bg: 'color-mix(in srgb,#DC2626 14%,var(--xc-surface))', color: '#EF4444', label: '已取消' },
};

// 共用工具
const fmtDate   = iso => iso ? new Date(iso).toLocaleDateString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const daysLeft  = iso => iso ? Math.ceil((new Date(iso) - Date.now()) / 864e5) : null;
const initials  = (n = '') => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

// 共用樣式
const inputSt = {
  width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`,
  borderRadius: 8, padding: '8px 12px', fontSize: 15, color: C.ink,
  outline: 'none', background: C.white, fontFamily: 'inherit',
};
const btnP = { background: 'color-mix(in srgb, var(--xc-brand) 82%, #000000 18%)', color: '#ffffff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer' };
const btnO = { background: C.white, color: C.ink2, border: `1px solid ${C.line}`, borderRadius: 8, padding: '9px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer' };

// ─────────────────────────────────────────────────────────
// 小元件
// ─────────────────────────────────────────────────────────

function Avatar({ name, size = 28, url }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <div title={name || '未指派'} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: name ? `linear-gradient(135deg, ${C.brand}, ${C.brandDk})` : C.surfaceMuted,
      color: name ? 'white' : C.ink3, fontSize: size < 28 ? 10 : 12, fontWeight: 700,
    }}>{name ? initials(name) : '?'}</div>
  );
}

function StatCard({ label, value, sub, color, bg }) {
  return (
    <div style={{
      flex: '1 1 140px', minWidth: 120,
      background: bg || C.white, border: `1px solid ${C.line}`,
      borderRadius: 16, padding: '16px 20px',
      boxShadow: C.shadow,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: color || C.ink, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: C.ink3, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ProgressBar({ pct, color }) {
  return (
    <div style={{ height: 8, borderRadius: 999, background: C.surfaceMuted, overflow: 'hidden', flex: 1 }}>
      <div style={{
        width: `${Math.min(pct, 100)}%`, height: '100%',
        background: `linear-gradient(90deg, ${color || C.brandDk}, ${color || C.brand})`,
        transition: 'width .3s ease', borderRadius: 999,
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Modal：新增任務
// ─────────────────────────────────────────────────────────
function AddTaskModal({ projectId, users, defaultStatus = 'todo', onSaved, onClose, authFetch }) {
  const isMobile = useIsMobile();
  const [form, setForm] = useState({ title: '', status: defaultStatus, priority: 'medium', assigneeId: '', dueDate: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    if (!form.title.trim()) { setError('請輸入任務名稱'); return; }
    setSaving(true); setError('');
    try {
      const res  = await authFetch(`${API}/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title:       form.title.trim(),
          status:      form.status,
          priority:    form.priority,
          assigneeId:  form.assigneeId ? parseInt(form.assigneeId) : undefined,
          dueDate:     form.dueDate || undefined,
          description: form.description || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onSaved(data.data);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.48)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit} style={{ background: C.white, borderRadius: 18, width: 520, maxWidth: '96vw', padding: isMobile ? '14px 16px' : '28px 32px', boxShadow: '0 24px 64px rgba(0,0,0,.22)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.ink }}>新增任務</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.ink3 }}>✕</button>
        </div>

        {error && <div style={{ background: C.dangerSoft, color: '#B91C1C', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 15 }}>{error}</div>}

        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={{ fontSize: 14, fontWeight: 700, color: C.ink3, display: 'block', marginBottom: 6 }}>任務名稱 *</label>
            <input style={inputSt} placeholder="輸入任務名稱…" value={form.title} onChange={set('title')} autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 14, fontWeight: 700, color: C.ink3, display: 'block', marginBottom: 6 }}>狀態</label>
              <select style={inputSt} value={form.status} onChange={set('status')}>
                {Object.entries(TASK_STATUS).filter(([k]) => k !== 'completed').map(([k, v]) =>
                  <option key={k} value={k}>{v.label}</option>
                )}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 14, fontWeight: 700, color: C.ink3, display: 'block', marginBottom: 6 }}>優先度</label>
              <select style={inputSt} value={form.priority} onChange={set('priority')}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 14, fontWeight: 700, color: C.ink3, display: 'block', marginBottom: 6 }}>負責人</label>
              <select style={inputSt} value={form.assigneeId} onChange={set('assigneeId')}>
                <option value="">未指派</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 14, fontWeight: 700, color: C.ink3, display: 'block', marginBottom: 6 }}>截止日期</label>
              <input type="date" style={inputSt} value={form.dueDate} onChange={set('dueDate')} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 14, fontWeight: 700, color: C.ink3, display: 'block', marginBottom: 6 }}>描述（選填）</label>
            <textarea style={{ ...inputSt, resize: 'vertical', minHeight: 80, lineHeight: 1.6 }} placeholder="任務說明…" value={form.description} onChange={set('description')} rows={3} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button type="button" style={btnO} onClick={onClose}>取消</button>
          <button type="submit" style={btnP} disabled={saving}>{saving ? '新增中…' : '新增任務'}</button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Modal：編輯專案
// ─────────────────────────────────────────────────────────
function EditProjectModal({ project, onSaved, onClose, authFetch }) {
  const isMobile = useIsMobile();
  const [form, setForm] = useState({
    name:        project.name        || '',
    description: project.description || '',
    status:      project.status      || 'active',
    startDate:   project.startDate   ? project.startDate.slice(0, 10) : '',
    endDate:     project.endDate     ? project.endDate.slice(0, 10)   : '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    if (!form.name.trim()) { setError('請輸入專案名稱'); return; }
    setSaving(true); setError('');
    try {
      const res  = await authFetch(`${API}/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name:        form.name.trim(),
          description: form.description,
          status:      form.status,
          startDate:   form.startDate || null,
          endDate:     form.endDate   || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onSaved(data.data);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.48)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit} style={{ background: C.white, borderRadius: 18, width: 480, maxWidth: '96vw', padding: isMobile ? '14px 16px' : '28px 32px', boxShadow: '0 24px 64px rgba(0,0,0,.22)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.ink }}>編輯專案</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.ink3 }}>✕</button>
        </div>

        {error && <div style={{ background: C.dangerSoft, color: '#B91C1C', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 15 }}>{error}</div>}

        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={{ fontSize: 14, fontWeight: 700, color: C.ink3, display: 'block', marginBottom: 6 }}>專案名稱 *</label>
            <input style={inputSt} value={form.name} onChange={set('name')} autoFocus />
          </div>
          <div>
            <label style={{ fontSize: 14, fontWeight: 700, color: C.ink3, display: 'block', marginBottom: 6 }}>描述</label>
            <textarea style={{ ...inputSt, resize: 'vertical', minHeight: 80, lineHeight: 1.6 }} value={form.description} onChange={set('description')} rows={3} />
          </div>
          <div>
            <label style={{ fontSize: 14, fontWeight: 700, color: C.ink3, display: 'block', marginBottom: 6 }}>狀態</label>
            <select style={inputSt} value={form.status} onChange={set('status')}>
              {Object.entries(PROJ_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 14, fontWeight: 700, color: C.ink3, display: 'block', marginBottom: 6 }}>開始日期</label>
              <input type="date" style={inputSt} value={form.startDate} onChange={set('startDate')} />
            </div>
            <div>
              <label style={{ fontSize: 14, fontWeight: 700, color: C.ink3, display: 'block', marginBottom: 6 }}>截止日期</label>
              <input type="date" style={inputSt} value={form.endDate} onChange={set('endDate')} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button type="button" style={btnO} onClick={onClose}>取消</button>
          <button type="submit" style={btnP} disabled={saving}>{saving ? '儲存中…' : '儲存變更'}</button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Modal：新增 / 編輯里程碑
// ─────────────────────────────────────────────────────────
function MilestoneModal({ projectId, milestone, onSaved, onClose, authFetch }) {
  const isMobile = useIsMobile();
  const isEdit = Boolean(milestone);
  const [form, setForm] = useState({
    name:        milestone?.name        || '',
    dueDate:     milestone?.dueDate     ? new Date(milestone.dueDate).toISOString().slice(0, 10) : '',
    description: milestone?.description || '',
    color:       milestone?.color       || 'green',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    if (!form.name.trim()) { setError('請輸入里程碑名稱'); return; }
    setSaving(true); setError('');
    try {
      const url    = isEdit ? `/api/projects/milestones/${milestone.id}` : `/api/projects/${projectId}/milestones`;
      const method = isEdit ? 'PATCH' : 'POST';
      const res    = await authFetch(url, { method, body: JSON.stringify({
        name:        form.name.trim(),
        dueDate:     form.dueDate || null,
        description: form.description,
        color:       form.color,
      })});
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onSaved(data.data);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const COLOR_OPTS = [
    { value: 'green',  label: '🟢 正常' },
    { value: 'yellow', label: '🟡 注意' },
    { value: 'red',    label: '🔴 延誤風險' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,.48)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit} style={{ background: C.white, borderRadius: 18, width: 460, maxWidth: '96vw', padding: isMobile ? '14px 16px' : '28px 32px', boxShadow: '0 24px 64px rgba(0,0,0,.22)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.ink }}>{isEdit ? '編輯里程碑' : '新增里程碑'}</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.ink3 }}>✕</button>
        </div>
        {error && <div style={{ background: C.dangerSoft, color: '#B91C1C', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 15 }}>{error}</div>}
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={{ fontSize: 14, fontWeight: 700, color: C.ink3, display: 'block', marginBottom: 6 }}>里程碑名稱 *</label>
            <input style={inputSt} placeholder="例如：MVP 上線、Beta 測試完成…" value={form.name} onChange={set('name')} autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 14, fontWeight: 700, color: C.ink3, display: 'block', marginBottom: 6 }}>目標日期</label>
              <input type="date" style={inputSt} value={form.dueDate} onChange={set('dueDate')} />
            </div>
            <div>
              <label style={{ fontSize: 14, fontWeight: 700, color: C.ink3, display: 'block', marginBottom: 6 }}>狀態顏色</label>
              <select style={inputSt} value={form.color} onChange={set('color')}>
                {COLOR_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 14, fontWeight: 700, color: C.ink3, display: 'block', marginBottom: 6 }}>說明（選填）</label>
            <textarea style={{ ...inputSt, resize: 'vertical', minHeight: 70, lineHeight: 1.6 }} placeholder="里程碑說明…" value={form.description} onChange={set('description')} rows={3} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button type="button" style={btnO} onClick={onClose}>取消</button>
          <button type="submit" style={btnP} disabled={saving}>{saving ? '儲存中…' : isEdit ? '儲存變更' : '新增里程碑'}</button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 里程碑時間軸（含 CRUD 操作）
// ─────────────────────────────────────────────────────────
function MilestoneTimeline({ milestones, onEdit, onDelete, onToggleAchieve, onAdd }) {
  const isEmpty = !milestones?.length;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>
          里程碑 {milestones?.length ? `(${milestones.length})` : ''}
        </span>
        <button onClick={onAdd} style={{ ...btnP, padding: '7px 16px', fontSize: 14 }}>+ 新增里程碑</button>
      </div>

      {isEmpty ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.ink3, fontSize: 15,
          border: `2px dashed ${C.line}`, borderRadius: 14 }}>
          尚未設定里程碑，點擊右上角按鈕新增
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {milestones.map((m, i) => {
            const days = daysLeft(m.dueDate);
            const isOverdue = !m.isAchieved && days !== null && days < 0;
            const accentColor = m.isAchieved ? '#16A34A' : isOverdue ? '#DC2626' : C.brand;
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                {/* 時間軸節點 */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <button
                    onClick={() => onToggleAchieve(m)}
                    title={m.isAchieved ? '取消達成' : '標記為達成'}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', border: `2.5px solid ${accentColor}`,
                      background: m.isAchieved ? '#16A34A' : C.white, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: m.isAchieved ? 'white' : accentColor, fontSize: 15, fontWeight: 800,
                      transition: 'all .15s',
                    }}>
                    {m.isAchieved ? '✓' : i + 1}
                  </button>
                  {i < milestones.length - 1 && (
                    <div style={{ width: 2, flex: 1, minHeight: 18, background: C.line, marginTop: 3 }} />
                  )}
                </div>

                <div style={{
                  flex: 1, background: m.isAchieved ? C.successSoft : isOverdue ? C.dangerSoft : C.white,
                  border: `1px solid ${m.isAchieved ? '#BBF7D0' : isOverdue ? '#FECACA' : C.line}`,
                  borderRadius: 12, padding: '10px 14px', marginBottom: i < milestones.length - 1 ? 6 : 0,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: m.isAchieved ? '#15803D' : isOverdue ? '#B91C1C' : C.ink }}>
                        {m.name}
                      </span>
                      {m.description && (
                        <div style={{ fontSize: 14, color: C.ink3, marginTop: 4, lineHeight: 1.5 }}>{m.description}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: m.isAchieved ? '#15803D' : isOverdue ? '#B91C1C' : C.ink3 }}>
                        {m.dueDate ? fmtDate(m.dueDate) : '無截止日'}
                        {m.dueDate && !m.isAchieved && days !== null && (
                          <span style={{ marginLeft: 6 }}>
                            {isOverdue ? `（逾期 ${Math.abs(days)} 天）` : `（剩 ${days} 天）`}
                          </span>
                        )}
                        {m.isAchieved && ' ✓ 達成'}
                      </span>
                      <button onClick={() => onEdit(m)} title="編輯"
                        style={{ fontSize: 14, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.line}`,
                          background: C.white, color: C.ink2, cursor: 'pointer', fontWeight: 600 }}>✏️</button>
                      <button onClick={() => onDelete(m)} title="刪除"
                        style={{ fontSize: 14, padding: '3px 6px', borderRadius: 6, border: 'none',
                          background: 'transparent', color: C.ink3, cursor: 'pointer' }}>✕</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 任務卡片（看板用）
// ─────────────────────────────────────────────────────────
function TaskCard({ task, onMoveNext, onDelete, onTaskClick }) {
  const st   = TASK_STATUS[task.status] || TASK_STATUS.todo;
  const pri  = PRIORITY[task.priority]  || PRIORITY.medium;
  const days = daysLeft(task.dueDate);
  const isOverdue = days !== null && days < 0 && task.status !== 'done' && task.status !== 'completed';

  return (
    <div
      onClick={() => onTaskClick && onTaskClick(task)}
      style={{
        background: C.white, borderRadius: 14, border: `1px solid ${C.line}`,
        padding: '12px 14px', boxShadow: C.shadow,
        transition: 'box-shadow .15s, transform .15s',
        cursor: onTaskClick ? 'pointer' : 'default',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = C.shadowStrong; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = C.shadow; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* 優先度線 */}
      <div style={{ height: 3, borderRadius: 999, background: pri.color, marginBottom: 10, opacity: .7 }} />

      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.45, marginBottom: 8,
        textDecoration: (task.status === 'done' || task.status === 'completed') ? 'line-through' : 'none',
        opacity: (task.status === 'done' || task.status === 'completed') ? .58 : 1,
      }}>
        {task.title}
      </div>

      {task.description && (
        <div style={{ fontSize: 14, color: C.ink2, lineHeight: 1.5, marginBottom: 8,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {task.description}
        </div>
      )}

      {/* 標籤 */}
      {task.tags?.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
          {task.tags.map(tag => (
            <span key={tag.id} style={{ fontSize: 12, padding: '2px 7px', borderRadius: 999,
              background: tag.color || C.surfaceMuted, color: C.ink2, fontWeight: 600 }}>
              #{tag.name}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* 優先度 */}
          <span style={{ fontSize: 12, padding: '3px 7px', borderRadius: 999, background: pri.bg, color: pri.color, fontWeight: 700 }}>
            {pri.label}
          </span>
          {/* 截止日 */}
          {task.dueDate && (
            <span style={{ fontSize: 12, fontWeight: 700, color: isOverdue ? '#DC2626' : C.ink3 }}>
              {isOverdue ? `逾期 ${Math.abs(days)} 天` : days === 0 ? '今天' : `${fmtDate(task.dueDate)}`}
            </span>
          )}
          {/* 子任務 */}
          {task.numSubtasks > 0 && (
            <span style={{ fontSize: 12, color: C.ink3 }}>◫ {task.numSubtasks}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* 指派人 */}
          {task.assignee && <Avatar name={task.assignee.name} size={22} url={task.assignee.avatarUrl} />}
          {/* 推進按鈕 */}
          <button
            onClick={e => { e.stopPropagation(); onMoveNext(task); }}
            title={st.nextLabel}
            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 999, border: `1px solid ${C.brand}`,
              background: (task.status === 'done' || task.status === 'completed') ? C.white : 'color-mix(in srgb, var(--xc-brand) 82%, #000000 18%)',
              color: (task.status === 'done' || task.status === 'completed') ? C.ink2 : '#ffffff',
              cursor: 'pointer', fontWeight: 700, transition: 'all .14s' }}
          >{st.nextLabel}</button>
          {/* 詳情 */}
          <button onClick={e => { e.stopPropagation(); onTaskClick && onTaskClick(task); }} title="開啟詳情"
            style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.line}`,
              background: C.white, color: C.ink3, cursor: 'pointer' }}>⋯</button>
          {/* 刪除 */}
          <button onClick={e => { e.stopPropagation(); onDelete(task); }} title="刪除"
            style={{ fontSize: 14, padding: '4px 6px', borderRadius: 6, border: 'none',
              background: 'transparent', color: C.ink3, cursor: 'pointer' }}>✕</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 任務列表視圖
// ─────────────────────────────────────────────────────────
function TaskListView({ tasks, onMoveNext, onDelete, onTaskClick }) {
  if (!tasks.length) return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: C.ink3, fontSize: 15 }}>
      目前還沒有任務
    </div>
  );

  const COLS = [
    { id: 'todo',        label: '待辦',   color: '#6B6461' },
    { id: 'in_progress', label: '進行中', color: '#8F0013' },
    { id: 'review',      label: '審核中', color: '#B35810' },
    { id: 'done',        label: '已完成', color: '#16824B' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 110px 100px 90px 80px', gap: 8,
        padding: '8px 14px', background: C.surfaceSoft, borderRadius: '10px 10px 0 0',
        borderBottom: `1px solid ${C.line}`, fontSize: 13, fontWeight: 700, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.06em' }}>
        <span>任務名稱</span><span>負責人</span><span>狀態</span><span>優先度</span><span>截止日</span><span style={{ textAlign: 'right' }}>操作</span>
      </div>
      {tasks.map((task, i) => {
        const st  = TASK_STATUS[task.status] || TASK_STATUS.todo;
        const pri = PRIORITY[task.priority]  || PRIORITY.medium;
        const days = daysLeft(task.dueDate);
        const isOverdue = days !== null && days < 0 && task.status !== 'done' && task.status !== 'completed';
        return (
          <div key={task.id}
            onClick={() => onTaskClick && onTaskClick(task)}
            style={{
              display: 'grid', gridTemplateColumns: '1fr 120px 110px 100px 90px 100px',
              gap: 8, padding: '10px 14px', alignItems: 'center',
              background: i % 2 === 0 ? C.white : C.surfaceSoft,
              borderBottom: `1px solid ${C.line}`, fontSize: 15,
              cursor: onTaskClick ? 'pointer' : 'default',
              transition: 'background .1s',
            }}
            onMouseEnter={e => { if (onTaskClick) e.currentTarget.style.background = C.surfaceSoft; }}
            onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? C.white : C.surfaceSoft; }}
          >
            <span style={{ fontWeight: 600, color: C.ink,
              textDecoration: (task.status === 'done' || task.status === 'completed') ? 'line-through' : 'none',
              opacity: (task.status === 'done' || task.status === 'completed') ? .6 : 1 }}>
              {task.title}
              {task.numSubtasks > 0 && <span style={{ marginLeft: 6, fontSize: 13, color: C.ink3 }}>+{task.numSubtasks} 子任務</span>}
            </span>
            <span>
              {task.assignee
                ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Avatar name={task.assignee.name} size={20} url={task.assignee.avatarUrl} /><span style={{ fontSize: 14, color: C.ink2 }}>{task.assignee.name}</span></div>
                : <span style={{ color: C.ink3, fontSize: 14 }}>未指派</span>}
            </span>
            <span>
              <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: st.bg, color: st.color }}>{st.label}</span>
            </span>
            <span>
              <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: pri.bg, color: pri.color }}>{pri.label}</span>
            </span>
            <span style={{ fontSize: 14, color: isOverdue ? '#DC2626' : C.ink3, fontWeight: isOverdue ? 700 : 400 }}>
              {task.dueDate ? (isOverdue ? `逾 ${Math.abs(days)}d` : fmtDate(task.dueDate)) : '—'}
            </span>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5 }}>
              <button onClick={e => { e.stopPropagation(); onTaskClick && onTaskClick(task); }} title="開啟詳情"
                style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.line}`,
                  background: C.white, color: C.ink3, cursor: 'pointer' }}>⋯</button>
              <button onClick={e => { e.stopPropagation(); onMoveNext(task); }} title={st.nextLabel}
                style={{ fontSize: 13, padding: '4px 9px', borderRadius: 6, border: `1px solid ${C.brand}`,
                  background: (task.status === 'done' || task.status === 'completed') ? C.white : 'color-mix(in srgb, var(--xc-brand) 82%, #000000 18%)',
                  color: (task.status === 'done' || task.status === 'completed') ? C.ink2 : '#ffffff',
                  cursor: 'pointer', fontWeight: 700 }}>
                {st.nextLabel}
              </button>
              <button onClick={e => { e.stopPropagation(); onDelete(task); }}
                style={{ fontSize: 14, padding: '4px 6px', borderRadius: 6, border: 'none', background: 'transparent', color: C.ink3, cursor: 'pointer' }}>
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 任務看板視圖
// ─────────────────────────────────────────────────────────
function TaskKanbanView({ kanban, onMoveNext, onDelete, onAddTask, onTaskClick }) {
  const COLS = [
    { id: 'todo',        label: '待辦',   accent: 'var(--xc-text-muted)',  accentBg: 'color-mix(in srgb, #6B6461 10%, var(--xc-surface))' },
    { id: 'in_progress', label: '進行中', accent: 'var(--xc-danger)',      accentBg: 'var(--xc-danger-soft)' },
    { id: 'review',      label: '審核中', accent: 'var(--xc-warning)',     accentBg: 'var(--xc-warning-soft)' },
    { id: 'done',        label: '已完成', accent: 'var(--xc-success)',     accentBg: 'var(--xc-success-soft)' },
  ];

  return (
    <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
      {COLS.map(col => {
        const tasks = kanban[col.id] || [];
        return (
          <div key={col.id} style={{
            flex: '1 1 260px', minWidth: 240,
            background: col.accentBg, borderRadius: 18,
            border: `1.5px solid ${C.line}`, padding: '12px 10px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', marginBottom: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: col.accent }} />
                <span style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{col.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: col.accent,
                  background: `color-mix(in srgb, ${col.accent} 14%, var(--xc-surface))`, padding: '1px 7px', borderRadius: 999 }}>
                  {tasks.length}
                </span>
              </div>
              <button onClick={() => onAddTask(col.id)}
                style={{ fontSize: 20, lineHeight: 1, padding: '0 2px', border: 'none',
                  background: 'transparent', color: col.accent, cursor: 'pointer' }}
                title={`在「${col.label}」新增任務`}>+</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80 }}>
              {tasks.map(task => (
                <TaskCard key={task.id} task={task} onMoveNext={onMoveNext} onDelete={onDelete} onTaskClick={onTaskClick} />
              ))}
              {tasks.length === 0 && (
                <div style={{ textAlign: 'center', padding: '16px 0', color: C.ink3, fontSize: 14,
                  border: `1.5px dashed ${C.line}`, borderRadius: 10 }}>
                  無任務
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 主元件：ProjectDetail
// ─────────────────────────────────────────────────────────
export default function ProjectDetail({ projectId, projectName, onBack }) {
  const { user, authFetch } = useAuth();
  const { isDark } = useTheme();

  const [project,        setProject]        = useState(null);
  const [users,          setUsers]          = useState([]);
  const [customFieldDefs,setCustomFieldDefs] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');

  const [view,           setView]           = useState('kanban'); // 'kanban' | 'list' | 'milestones'
  const [addStatus,      setAddStatus]      = useState(null);     // string | null
  const [editOpen,       setEditOpen]       = useState(false);
  const [deleteTask,     setDeleteTask]     = useState(null);     // task | null
  const [updatingId,     setUpdatingId]     = useState(null);     // eslint-disable-line
  const [toast,          setToast]          = useState('');

  // TaskSidePanel state
  const [selectedTask,   setSelectedTask]   = useState(null);

  // Milestone CRUD state
  const [milestoneModal, setMilestoneModal] = useState(null); // null | 'new' | milestone-object

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  const load = useCallback(async () => {
    if (!authFetch || !projectId) return;
    setLoading(true); setError('');
    try {
      const [projRes, usersRes, cfRes] = await Promise.all([
        authFetch(`${API}/${projectId}`),
        authFetch(`/api/users?companyId=${user?.companyId || ''}`),
        authFetch(`/api/custom-fields?companyId=${user?.companyId || ''}`),
      ]);
      const projData  = await projRes.json();
      const usersData = await usersRes.json();
      const cfData    = await cfRes.json();
      if (!projData.success) throw new Error(projData.error);
      setProject(projData.data);
      setUsers(usersData.data || []);
      setCustomFieldDefs(cfData.data || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [authFetch, projectId, user?.companyId]);

  useEffect(() => { load(); }, [load]);

  // ── 點擊任務卡片開啟 SidePanel ────────────────────────
  const handleTaskClick = useCallback(task => {
    setSelectedTask({
      ...task,
      project: { id: projectId, name: project?.name || projectName },
      extraProjects: [],
    });
  }, [projectId, project?.name, projectName]);

  // ── 里程碑 CRUD ───────────────────────────────────────
  const handleMilestoneSaved = async () => {
    setMilestoneModal(null);
    await load();
    showToast('里程碑已儲存');
  };

  const handleMilestoneDelete = async m => {
    if (!window.confirm(`確定要刪除里程碑「${m.name}」？`)) return;
    try {
      const res  = await authFetch(`${API}/milestones/${m.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await load();
      showToast('里程碑已刪除');
    } catch (e) { showToast(`刪除失敗：${e.message}`); }
  };

  const handleMilestoneToggle = async m => {
    try {
      const res  = await authFetch(`${API}/milestones/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isAchieved: !m.isAchieved }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await load();
      showToast(m.isAchieved ? '已取消達成' : '🎉 里程碑已達成！');
    } catch (e) { showToast(`更新失敗：${e.message}`); }
  };

  // ── 任務狀態更新 ──────────────────────────────────────
  const handleMoveNext = async task => {
    const next = TASK_STATUS[task.status]?.next;
    if (!next) return;
    setUpdatingId(task.id);
    try {
      const res  = await authFetch(`${API}/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next === 'done' ? 'completed' : next }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await load();
      showToast(`任務已移至「${TASK_STATUS[next]?.label || next}」`);
    } catch (e) { showToast(`更新失敗：${e.message}`); }
    finally { setUpdatingId(null); }
  };

  // ── 刪除任務 ─────────────────────────────────────────
  const handleDeleteTask = async task => {
    if (!window.confirm(`確定要刪除「${task.title}」？`)) return;
    try {
      const res  = await authFetch(`${API}/tasks/${task.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await load();
      showToast('任務已刪除');
    } catch (e) { showToast(`刪除失敗：${e.message}`); }
  };

  // ── Loading / Error ──────────────────────────────────
  if (loading && !project) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320, flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: `4px solid ${C.brand}`,
          borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ color: C.ink3, fontSize: 16 }}>載入專案資料中…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ color: '#B91C1C', fontSize: 16, marginBottom: 16 }}>載入失敗：{error}</div>
        <button style={btnO} onClick={load}>重試</button>
        <button style={{ ...btnO, marginLeft: 12 }} onClick={onBack}>返回</button>
      </div>
    );
  }

  const proj  = project;
  const stats = proj?.stats || {};
  const pst   = PROJ_STATUS[proj?.status] || PROJ_STATUS.active;
  const allTasks = [...(proj?.kanban?.todo || []), ...(proj?.kanban?.in_progress || []),
                    ...(proj?.kanban?.review || []), ...(proj?.kanban?.done || [])];
  const overdueTasks = allTasks.filter(t =>
    t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done' && t.status !== 'completed'
  ).length;

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>

      {/* ── Toast ─────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: '#111', color: 'white',
          padding: '10px 22px', borderRadius: 999, fontSize: 15, fontWeight: 600,
          boxShadow: '0 8px 28px rgba(0,0,0,.3)', pointerEvents: 'none',
        }}>{toast}</div>
      )}

      {/* ── Header ───────────────────────────────────── */}
      <div style={{
        background: isDark
          ? `linear-gradient(135deg, var(--xc-bg) 0%, color-mix(in srgb, var(--xc-brand-soft) 70%, var(--xc-surface)) 55%, var(--xc-surface-muted) 100%)`
          : `linear-gradient(135deg, #13090A 0%, #6E0615 50%, var(--xc-brand) 100%)`,
        padding: isMobile ? '14px 16px 12px' : '24px 32px 28px',
        color: isDark ? 'var(--xc-text)' : 'white',
        borderBottom: isDark ? `1px solid var(--xc-border)` : 'none',
      }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <button onClick={onBack} style={{
            background: isDark ? 'var(--xc-surface)' : 'rgba(255,255,255,.12)',
            border: isDark ? `1px solid var(--xc-border)` : '1px solid rgba(255,255,255,.2)',
            borderRadius: 8, padding: '6px 14px',
            color: isDark ? 'var(--xc-text-soft)' : 'white', fontSize: 14,
            fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>← 返回列表</button>
          <span style={{ color: isDark ? 'var(--xc-text-muted)' : 'rgba(255,255,255,.5)', fontSize: 15 }}>／</span>
          <span style={{ fontSize: 15, color: isDark ? 'var(--xc-text-soft)' : 'rgba(255,255,255,.8)', fontWeight: 600 }}>
            {projectName || proj?.name}
          </span>
        </div>

        {/* 專案標題列 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1.1 }}>
                {proj?.name || projectName}
              </h1>
              {proj?.status && (
                <span style={{ padding: '4px 12px', borderRadius: 999, background: pst.bg, color: pst.color,
                  fontSize: 13, fontWeight: 800, letterSpacing: '.06em' }}>
                  {pst.label}
                </span>
              )}
            </div>
            {proj?.description && (
              <p style={{ margin: 0, fontSize: 16, color: isDark ? 'var(--xc-text-soft)' : 'rgba(255,255,255,.75)', lineHeight: 1.6, maxWidth: 600 }}>
                {proj.description}
              </p>
            )}
            <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
              {proj?.owner && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Avatar name={proj.owner.name} size={22} url={proj.owner.avatarUrl} />
                  <span style={{ fontSize: 14, color: isDark ? 'var(--xc-text-soft)' : 'rgba(255,255,255,.8)', fontWeight: 600 }}>{proj.owner.name}</span>
                </div>
              )}
              {proj?.startDate && <span style={{ fontSize: 14, color: isDark ? 'var(--xc-text-muted)' : 'rgba(255,255,255,.65)' }}>開始 {fmtDate(proj.startDate)}</span>}
              {proj?.endDate   && <span style={{ fontSize: 14, color: isDark ? 'var(--xc-text-muted)' : 'rgba(255,255,255,.65)' }}>截止 {fmtDate(proj.endDate)}</span>}
              {proj?.budget    && <span style={{ fontSize: 14, color: isDark ? 'var(--xc-text-muted)' : 'rgba(255,255,255,.65)' }}>預算 NT${proj.budget.toLocaleString()}</span>}
            </div>
          </div>

          {/* 操作按鈕 */}
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button onClick={() => setAddStatus('todo')} style={{
              background: isDark ? 'color-mix(in srgb, var(--xc-brand) 82%, #000000 18%)' : 'rgba(255,255,255,.15)',
              border: isDark ? 'none' : '1px solid rgba(255,255,255,.28)',
              color: '#ffffff', borderRadius: 10, padding: '9px 18px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}>+ 新增任務</button>
            <button onClick={() => setEditOpen(true)} style={{
              background: isDark ? 'var(--xc-surface)' : 'rgba(255,255,255,.10)',
              border: isDark ? `1px solid var(--xc-border)` : '1px solid rgba(255,255,255,.2)',
              color: isDark ? 'var(--xc-text-soft)' : 'rgba(255,255,255,.9)',
              borderRadius: 10, padding: '9px 14px', fontSize: 15, cursor: 'pointer',
            }} title="編輯專案">編輯</button>
          </div>
        </div>
      </div>

      <div style={{ padding: isMobile ? '14px 16px' : '24px 32px', maxWidth: 1400, margin: '0 auto' }}>

        {/* ── 統計卡片 ─────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 28 }}>
          <StatCard label="完成進度" value={`${stats.completion || 0}%`}
            sub={`${stats.done || 0} / ${stats.total || 0} 任務完成`}
            color={stats.completion >= 75 ? '#16A34A' : stats.completion >= 40 ? C.brand : '#D97706'} />
          <StatCard label="待辦" value={stats.todo || 0} sub="尚未開始的任務" />
          <StatCard label="進行中" value={stats.in_progress || 0} sub="目前執行中的任務"
            color={stats.in_progress > 0 ? (isDark ? 'var(--xc-danger)' : '#8F0013') : undefined}
            bg={stats.in_progress > 0 ? 'var(--xc-danger-soft)' : undefined} />
          <StatCard label="審核中" value={stats.review || 0} sub="等待審核的任務"
            color={stats.review > 0 ? (isDark ? 'var(--xc-warning)' : '#C97415') : undefined}
            bg={stats.review > 0 ? 'var(--xc-warning-soft)' : undefined} />
          <StatCard label="逾期" value={overdueTasks} sub="超過截止日未完成"
            color={overdueTasks > 0 ? '#DC2626' : '#16A34A'} bg={overdueTasks > 0 ? C.dangerSoft : C.successSoft} />
          <div style={{ flex: '1 1 160px', minWidth: 140, background: C.white, border: `1px solid ${C.line}`,
            borderRadius: 16, padding: '16px 20px', boxShadow: C.shadow, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>完成進度</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ProgressBar pct={stats.completion || 0} />
              <span style={{ fontSize: 15, fontWeight: 700, color: C.ink, flexShrink: 0 }}>{stats.completion || 0}%</span>
            </div>
          </div>
        </div>

        {/* ── 子視圖切換標籤 ───────────────────────────── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${C.line}`, paddingBottom: 0 }}>
          {[
            { key: 'kanban',     label: '看板' },
            { key: 'list',       label: '列表' },
            { key: 'milestones', label: `里程碑 ${proj?.milestones?.length ? `(${proj.milestones.length})` : ''}` },
          ].map(tab => (
            <button key={tab.key} onClick={() => setView(tab.key)} style={{
              padding: '10px 18px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              border: 'none', background: 'none',
              color: view === tab.key ? C.brand : C.ink2,
              borderBottom: view === tab.key ? `2.5px solid ${C.brand}` : '2.5px solid transparent',
              marginBottom: -1, transition: 'all .14s',
            }}>{tab.label}</button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setAddStatus('todo')} style={{
              ...btnP, padding: '7px 16px', fontSize: 14,
            }}>+ 新增任務</button>
            <button onClick={load} style={{ ...btnO, padding: '7px 12px', fontSize: 14 }} title="重新整理">↻</button>
          </div>
        </div>

        {/* ── 主內容區 ─────────────────────────────────── */}
        {view === 'kanban' && (
          <TaskKanbanView
            kanban={proj?.kanban || {}}
            onMoveNext={handleMoveNext}
            onDelete={handleDeleteTask}
            onAddTask={status => setAddStatus(status)}
            onTaskClick={handleTaskClick}
          />
        )}

        {view === 'list' && (
          <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.line}`, overflow: 'hidden' }}>
            <TaskListView
              tasks={allTasks}
              onMoveNext={handleMoveNext}
              onDelete={handleDeleteTask}
              onTaskClick={handleTaskClick}
            />
          </div>
        )}

        {view === 'milestones' && (
          <div style={{ maxWidth: 720 }}>
            <MilestoneTimeline
              milestones={proj?.milestones || []}
              onEdit={m => setMilestoneModal(m)}
              onDelete={handleMilestoneDelete}
              onToggleAchieve={handleMilestoneToggle}
              onAdd={() => setMilestoneModal('new')}
            />
          </div>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────── */}
      {addStatus && (
        <AddTaskModal
          projectId={projectId}
          users={users}
          defaultStatus={addStatus}
          authFetch={authFetch}
          onSaved={async () => { setAddStatus(null); await load(); showToast('任務已新增'); }}
          onClose={() => setAddStatus(null)}
        />
      )}

      {editOpen && proj && (
        <EditProjectModal
          project={proj}
          authFetch={authFetch}
          onSaved={async () => {
            setEditOpen(false);
            await load();
            showToast('專案已更新');
          }}
          onClose={() => setEditOpen(false)}
        />
      )}

      {/* ── 里程碑 Modal ─────────────────────────────── */}
      {milestoneModal && (
        <MilestoneModal
          projectId={projectId}
          milestone={milestoneModal === 'new' ? null : milestoneModal}
          authFetch={authFetch}
          onSaved={handleMilestoneSaved}
          onClose={() => setMilestoneModal(null)}
        />
      )}

      {/* ── TaskSidePanel ────────────────────────────── */}
      {selectedTask && (
        <TaskSidePanel
          key={selectedTask.id}
          task={selectedTask}
          users={users}
          projects={[{ id: projectId, name: proj?.name || projectName }]}
          allTasks={allTasks}
          customFieldDefs={customFieldDefs}
          onClose={() => setSelectedTask(null)}
          onSaved={() => { setSelectedTask(null); load(); showToast('任務已更新'); }}
          onDeleteRequest={task => { setSelectedTask(null); handleDeleteTask(task); }}
          currentUser={user}
          authFetch={authFetch}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
