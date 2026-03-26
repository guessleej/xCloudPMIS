/**
 * ReportsPage — 報表匯出頁面
 *
 * 版面配置：
 *   ┌───────────────────────────────────────────────────────┐
 *   │ 頁面標題列                                              │
 *   ├──────────────────────┬────────────────────────────────┤
 *   │ 左側：報表類型選單     │ 右側主內容區                    │
 *   │  ○ 專案進度報表       │  ┌─ 篩選列 ─────────────────┐  │
 *   │  ○ 任務統計報表       │  │  下拉 / 日期 / 群組選項   │  │
 *   │  ○ 工時統計報表       │  └───────────────────────────┘  │
 *   │  ○ 里程碑報表         │  ┌─ 摘要卡片 ────────────────┐  │
 *   │                      │  └───────────────────────────┘  │
 *   │                      │  ┌─ 資料表格 ────────────────┐  │
 *   │                      │  │  含行內編輯/刪除操作        │  │
 *   │                      │  └───────────────────────────┘  │
 *   └──────────────────────┴────────────────────────────────┘
 *
 * 行內操作支援：
 *   - 專案進度報表：編輯專案、刪除專案
 *   - 任務統計報表：編輯任務、刪除任務
 *   - 工時統計報表：彙總資料，無行級操作
 *   - 里程碑報表：編輯里程碑、刪除里程碑
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, AreaChart, Area, Legend,
} from 'recharts';

// ── 常數 ─────────────────────────────────────────────────────
const API_BASE   = '';
const PAGE_SIZE  = 15; // 每頁顯示筆數

// ── 報表類型定義 ──────────────────────────────────────────────
const REPORT_TYPES = [
  {
    id:          'projects',
    icon:        '🏗️',
    label:       '專案進度報表',
    description: '各專案的任務完成率、工時、里程碑達成狀況',
    color:       '#3b82f6',
  },
  {
    id:          'tasks',
    icon:        '✅',
    label:       '任務統計報表',
    description: '依狀態、優先度分析所有任務',
    color:       '#8b5cf6',
  },
  {
    id:          'timelog',
    icon:        '⏱️',
    label:       '工時統計報表',
    description: '工時記錄依專案、成員或任務彙總統計',
    color:       '#10b981',
  },
  {
    id:          'milestones',
    icon:        '🎯',
    label:       '里程碑報表',
    description: '各專案里程碑達成情況與延誤風險',
    color:       '#f59e0b',
  },
  {
    id:          'executive',
    icon:        '👔',
    label:       '高層 Review 摘要',
    description: '一頁式 Executive Summary，提供管理層快速決策依據',
    color:       '#c41230',
  },
];

const THEME = {
  accent: 'var(--xc-brand)',
  accentDeep: 'var(--xc-brand-dark)',
  pageBg: 'linear-gradient(180deg, color-mix(in srgb, var(--xc-brand) 10%, var(--xc-bg) 90%) 0%, var(--xc-bg) 20%, var(--xc-bg-soft) 100%)',
  surface: 'var(--xc-surface)',
  surfaceStrong: 'var(--xc-surface-strong)',
  surfaceSoft: 'var(--xc-surface-soft)',
  surfaceMuted: 'var(--xc-surface-muted)',
  border: 'var(--xc-border)',
  borderStrong: 'var(--xc-border-strong)',
  text: 'var(--xc-text)',
  textSoft: 'var(--xc-text-soft)',
  textMuted: 'var(--xc-text-muted)',
  success: 'var(--xc-success)',
  successSoft: 'var(--xc-success-soft)',
  danger: 'var(--xc-danger)',
  dangerSoft: 'var(--xc-danger-soft)',
  warningSoft: 'var(--xc-warning-soft)',
  infoSoft: 'var(--xc-info-soft)',
  shadow: 'var(--xc-shadow)',
  shadowStrong: 'var(--xc-shadow-strong)',
  accentSoft: 'var(--xc-brand-soft)',
  panel: 'color-mix(in srgb, var(--xc-surface) 94%, transparent)',
  panelStrong: 'color-mix(in srgb, var(--xc-surface-strong) 84%, var(--xc-surface) 16%)',
  rowHover: 'color-mix(in srgb, var(--xc-brand) 8%, var(--xc-surface-strong))',
  rowAlt: 'color-mix(in srgb, var(--xc-surface-soft) 78%, var(--xc-surface-strong) 22%)',
};

// ── 工具函式 ─────────────────────────────────────────────────
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const daysAgoStr = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── 狀態/優先度徽章顏色 ──────────────────────────────────────
const STATUS_BADGE = {
  '待處理': { bg: '#f3f4f6', text: '#6b7280' },
  '進行中': { bg: '#dbeafe', text: '#1d4ed8' },
  '審查中': { bg: '#fef3c7', text: '#d97706' },
  '已完成': { bg: '#d1fae5', text: '#065f46' },
  '規劃中': { bg: '#ede9fe', text: '#7c3aed' },
  '暫停':   { bg: '#fee2e2', text: '#dc2626' },
  '已取消': { bg: '#f3f4f6', text: '#9ca3af' },
};
const PRIORITY_BADGE = {
  '緊急': { bg: '#fee2e2', text: '#dc2626' },
  '高':   { bg: '#ffedd5', text: '#c2410c' },
  '中':   { bg: '#fef9c3', text: '#a16207' },
  '低':   { bg: '#f3f4f6', text: '#6b7280' },
};
const MILESTONE_BADGE = {
  '已達成':   { bg: '#d1fae5', text: '#065f46' },
  '已延誤':   { bg: '#fee2e2', text: '#dc2626' },
  '即將到期': { bg: '#fef3c7', text: '#d97706' },
  '進行中':   { bg: '#dbeafe', text: '#1d4ed8' },
};

// ════════════════════════════════════════════════════════════
// 彈跳視窗共用樣式
// ════════════════════════════════════════════════════════════
const modalOverlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: '20px',
};
const modalBox = {
  background: THEME.surfaceStrong, borderRadius: '12px',
  border: `1px solid ${THEME.border}`,
  boxShadow: THEME.shadowStrong,
  width: '100%', maxWidth: '520px',
  maxHeight: '85vh', overflow: 'auto',
};
const inputSt = {
  width: '100%', padding: '8px 10px',
  border: `1px solid ${THEME.borderStrong}`, borderRadius: '7px',
  fontSize: '13px', color: THEME.text,
  boxSizing: 'border-box', background: THEME.panelStrong,
};
const labelSt = {
  display: 'block', fontSize: '12px', fontWeight: '600',
  color: THEME.textSoft, marginBottom: '5px',
};

// ── 彈跳視窗共用子元件 ──────────────────────────────────────
function ModalHeader({ title, onClose }) {
  return (
    <div style={{
      padding: '18px 20px 16px', borderBottom: `1px solid ${THEME.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: THEME.text }}>
        {title}
      </h3>
      <button onClick={onClose} style={{
        background: 'none', border: 'none', fontSize: '20px',
        cursor: 'pointer', color: THEME.textMuted, lineHeight: 1,
      }}>✕</button>
    </div>
  );
}

function ModalFooter({ onClose, onConfirm, confirmLabel, confirmColor = '#3b82f6', saving }) {
  return (
    <div style={{
      padding: '14px 20px', borderTop: `1px solid ${THEME.border}`,
      display: 'flex', justifyContent: 'flex-end', gap: '8px',
    }}>
      <button onClick={onClose} disabled={saving} style={{
        padding: '8px 18px', border: `1px solid ${THEME.borderStrong}`, borderRadius: '8px',
        background: THEME.panelStrong, color: THEME.textSoft, fontSize: '13px', cursor: 'pointer',
      }}>
        取消
      </button>
      <button onClick={onConfirm} disabled={saving} style={{
        padding: '8px 18px', border: 'none', borderRadius: '8px',
        background: saving ? THEME.textMuted : confirmColor, color: 'white',
        fontSize: '13px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer',
      }}>
        {saving ? '處理中...' : confirmLabel}
      </button>
    </div>
  );
}

function ErrBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      background: THEME.dangerSoft, border: `1px solid color-mix(in srgb, ${THEME.danger} 24%, ${THEME.border})`, borderRadius: '7px',
      padding: '10px 14px', color: THEME.danger, fontSize: '13px',
    }}>{msg}</div>
  );
}

// ════════════════════════════════════════════════════════════
// EditProjectModal — 編輯專案
// 需先拉 /api/projects/:id 取得 ownerId 與 description
// ════════════════════════════════════════════════════════════
function EditProjectModal({ row, users, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '', status: 'active', ownerId: '',
    startDate: '', endDate: '', budget: '', description: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/api/projects/${row.id}`)
      .then(r => r.json())
      .then(d => {
        const p = d.data || d;
        setForm({
          name:        p.name        || '',
          status:      p.status      || 'active',
          ownerId:     p.ownerId     ? String(p.ownerId) : '',
          startDate:   p.startDate   ? String(p.startDate).slice(0, 10) : '',
          endDate:     p.endDate     ? String(p.endDate).slice(0, 10)   : '',
          budget:      p.budget !== null && p.budget !== undefined ? String(p.budget) : '',
          description: p.description || '',
        });
      })
      .catch(() => setError('無法載入專案資料'))
      .finally(() => setLoading(false));
  }, [row.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('請輸入專案名稱'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/api/projects/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        form.name.trim(),
          status:      form.status,
          ownerId:     form.ownerId ? parseInt(form.ownerId) : null,
          startDate:   form.startDate || null,
          endDate:     form.endDate   || null,
          budget:      form.budget !== '' ? parseFloat(form.budget) : null,
          description: form.description,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '儲存失敗');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalBox}>
        <ModalHeader title="✏️ 編輯專案" onClose={onClose} />
        <div style={{ padding: '16px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '24px', color: THEME.textMuted }}>載入中...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <ErrBox msg={error} />
              <div>
                <label style={labelSt}>專案名稱 *</label>
                <input style={inputSt} value={form.name}
                  onChange={e => set('name', e.target.value)} placeholder="輸入專案名稱" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelSt}>狀態</label>
                  <select style={inputSt} value={form.status} onChange={e => set('status', e.target.value)}>
                    <option value="planning">規劃中</option>
                    <option value="active">進行中</option>
                    <option value="on_hold">暫停</option>
                    <option value="completed">已完成</option>
                    <option value="cancelled">已取消</option>
                  </select>
                </div>
                <div>
                  <label style={labelSt}>負責人</label>
                  <select style={inputSt} value={form.ownerId} onChange={e => set('ownerId', e.target.value)}>
                    <option value="">未指定</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelSt}>開始日期</label>
                  <input type="date" style={inputSt} value={form.startDate}
                    onChange={e => set('startDate', e.target.value)} />
                </div>
                <div>
                  <label style={labelSt}>結束日期</label>
                  <input type="date" style={inputSt} value={form.endDate}
                    onChange={e => set('endDate', e.target.value)} />
                </div>
              </div>
              <div>
                <label style={labelSt}>預算（NT$）</label>
                <input type="number" style={inputSt} value={form.budget}
                  onChange={e => set('budget', e.target.value)} placeholder="輸入預算金額" />
              </div>
              <div>
                <label style={labelSt}>說明</label>
                <textarea
                  style={{ ...inputSt, minHeight: '72px', resize: 'vertical' }}
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  placeholder="輸入專案說明（選填）"
                />
              </div>
            </div>
          )}
        </div>
        {!loading && (
          <ModalFooter onClose={onClose} onConfirm={handleSave} confirmLabel="儲存" saving={saving} />
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// DeleteProjectModal — 刪除專案
// ════════════════════════════════════════════════════════════
function DeleteProjectModal({ row, onClose, onDeleted }) {
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handleDelete = async () => {
    setSaving(true); setError('');
    try {
      const res  = await fetch(`${API_BASE}/api/projects/${row.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '刪除失敗');
      onDeleted();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...modalBox, maxWidth: '420px' }}>
        <ModalHeader title="🗑️ 刪除專案" onClose={onClose} />
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <ErrBox msg={error} />
          <p style={{ margin: 0, fontSize: '14px', color: THEME.textSoft }}>
            確定要刪除此專案嗎？此操作無法復原。
          </p>
          <div style={{
            background: THEME.surfaceSoft, border: `1px solid ${THEME.border}`,
            borderRadius: '8px', padding: '12px 14px',
          }}>
            <div style={{ fontWeight: '700', fontSize: '14px', color: THEME.text, marginBottom: '6px' }}>
              {row.name}
            </div>
            <div style={{ fontSize: '12px', color: THEME.textMuted }}>
              狀態：{row.status}　任務數：{row.total} 個　完成率：{row.doneRate}%
            </div>
          </div>
          {row.total > 0 && (
            <div style={{
              background: THEME.warningSoft, border: `1px solid color-mix(in srgb, ${THEME.warningSoft} 26%, ${THEME.border})`,
              borderRadius: '7px', padding: '10px 14px', fontSize: '12px', color: '#c2410c',
            }}>
              ⚠️ 此專案含有 {row.total} 個任務，刪除後將一併移除。
            </div>
          )}
        </div>
        <ModalFooter
          onClose={onClose} onConfirm={handleDelete}
          confirmLabel="確認刪除" confirmColor="#dc2626" saving={saving}
        />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// EditTaskModal — 編輯任務
// ════════════════════════════════════════════════════════════
function EditTaskModal({ row, users, onClose, onSaved }) {
  const [form, setForm] = useState({
    title:      row.title       || '',
    status:     row.statusRaw   || 'todo',
    priority:   row.priorityRaw || 'medium',
    assigneeId: row.assigneeId  ? String(row.assigneeId) : '',
    dueDate:    row.dueDate     || '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.title.trim()) { setError('請輸入任務名稱'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/api/projects/tasks/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:      form.title.trim(),
          status:     form.status,
          priority:   form.priority,
          assigneeId: form.assigneeId ? parseInt(form.assigneeId) : null,
          dueDate:    form.dueDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '儲存失敗');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalBox}>
        <ModalHeader title="✏️ 編輯任務" onClose={onClose} />
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', color: THEME.textMuted, marginBottom: '14px' }}>
            所屬專案：{row.projectName}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <ErrBox msg={error} />
            <div>
              <label style={labelSt}>任務名稱 *</label>
              <input style={inputSt} value={form.title}
                onChange={e => set('title', e.target.value)} placeholder="輸入任務名稱" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelSt}>狀態</label>
                <select style={inputSt} value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="todo">待處理</option>
                  <option value="in_progress">進行中</option>
                  <option value="review">審查中</option>
                  <option value="done">已完成</option>
                </select>
              </div>
              <div>
                <label style={labelSt}>優先度</label>
                <select style={inputSt} value={form.priority} onChange={e => set('priority', e.target.value)}>
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                  <option value="urgent">緊急</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelSt}>負責人</label>
                <select style={inputSt} value={form.assigneeId} onChange={e => set('assigneeId', e.target.value)}>
                  <option value="">未指定</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>到期日</label>
                <input type="date" style={inputSt} value={form.dueDate}
                  onChange={e => set('dueDate', e.target.value)} />
              </div>
            </div>
          </div>
        </div>
        <ModalFooter onClose={onClose} onConfirm={handleSave} confirmLabel="儲存" saving={saving} />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// DeleteTaskModal — 刪除任務
// ════════════════════════════════════════════════════════════
function DeleteTaskModal({ row, onClose, onDeleted }) {
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handleDelete = async () => {
    setSaving(true); setError('');
    try {
      const res  = await fetch(`${API_BASE}/api/projects/tasks/${row.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '刪除失敗');
      onDeleted();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...modalBox, maxWidth: '420px' }}>
        <ModalHeader title="🗑️ 刪除任務" onClose={onClose} />
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <ErrBox msg={error} />
          <p style={{ margin: 0, fontSize: '14px', color: THEME.textSoft }}>
            確定要刪除此任務嗎？此操作無法復原。
          </p>
          <div style={{
            background: THEME.surfaceSoft, border: `1px solid ${THEME.border}`,
            borderRadius: '8px', padding: '12px 14px',
          }}>
            <div style={{ fontWeight: '700', fontSize: '14px', color: THEME.text, marginBottom: '6px' }}>
              {row.title}
            </div>
            <div style={{ fontSize: '12px', color: THEME.textMuted }}>
              專案：{row.projectName}　狀態：{row.status}　優先度：{row.priority}
            </div>
            {row.assignee && row.assignee !== '未指定' && (
              <div style={{ fontSize: '12px', color: THEME.textMuted, marginTop: '4px' }}>
                負責人：{row.assignee}
              </div>
            )}
          </div>
        </div>
        <ModalFooter
          onClose={onClose} onConfirm={handleDelete}
          confirmLabel="確認刪除" confirmColor="#dc2626" saving={saving}
        />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// EditMilestoneModal — 編輯里程碑
// ════════════════════════════════════════════════════════════
function EditMilestoneModal({ row, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:        row.name        || '',
    dueDate:     row.dueDate     || '',
    color:       row.colorRaw    || 'green',
    isAchieved:  Boolean(row.isAchieved),
    description: row.description || '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('請輸入里程碑名稱'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/api/projects/milestones/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        form.name.trim(),
          dueDate:     form.dueDate || null,
          color:       form.color,
          isAchieved:  form.isAchieved,
          description: form.description,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '儲存失敗');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalBox}>
        <ModalHeader title="✏️ 編輯里程碑" onClose={onClose} />
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', color: THEME.textMuted, marginBottom: '14px' }}>
            所屬專案：{row.projectName}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <ErrBox msg={error} />
            <div>
              <label style={labelSt}>里程碑名稱 *</label>
              <input style={inputSt} value={form.name}
                onChange={e => set('name', e.target.value)} placeholder="輸入里程碑名稱" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelSt}>預計達成日期</label>
                <input type="date" style={inputSt} value={form.dueDate}
                  onChange={e => set('dueDate', e.target.value)} />
              </div>
              <div>
                <label style={labelSt}>風險等級</label>
                <select style={inputSt} value={form.color} onChange={e => set('color', e.target.value)}>
                  <option value="green">綠（正常）</option>
                  <option value="yellow">黃（需注意）</option>
                  <option value="red">紅（高風險）</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{
                ...labelSt, display: 'flex', alignItems: 'center',
                gap: '8px', cursor: 'pointer', fontWeight: '400',
              }}>
                <input
                  type="checkbox"
                  checked={form.isAchieved}
                  onChange={e => set('isAchieved', e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ fontWeight: '600', color: THEME.textSoft }}>標記為已達成</span>
              </label>
            </div>
            <div>
              <label style={labelSt}>說明</label>
              <textarea
                style={{ ...inputSt, minHeight: '72px', resize: 'vertical' }}
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="輸入里程碑說明（選填）"
              />
            </div>
          </div>
        </div>
        <ModalFooter onClose={onClose} onConfirm={handleSave} confirmLabel="儲存" saving={saving} />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// DeleteMilestoneModal — 刪除里程碑（硬刪除）
// ════════════════════════════════════════════════════════════
function DeleteMilestoneModal({ row, onClose, onDeleted }) {
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handleDelete = async () => {
    setSaving(true); setError('');
    try {
      const res  = await fetch(`${API_BASE}/api/projects/milestones/${row.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '刪除失敗');
      onDeleted();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...modalBox, maxWidth: '420px' }}>
        <ModalHeader title="🗑️ 刪除里程碑" onClose={onClose} />
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <ErrBox msg={error} />
          <p style={{ margin: 0, fontSize: '14px', color: THEME.textSoft }}>
            確定要刪除此里程碑嗎？此操作無法復原。
          </p>
          <div style={{
            background: THEME.surfaceSoft, border: `1px solid ${THEME.border}`,
            borderRadius: '8px', padding: '12px 14px',
          }}>
            <div style={{ fontWeight: '700', fontSize: '14px', color: THEME.text, marginBottom: '6px' }}>
              {row.name}
            </div>
            <div style={{ fontSize: '12px', color: THEME.textMuted }}>
              專案：{row.projectName}　狀態：{row.statusLabel}
              {row.dueDate ? `　預計日期：${row.dueDate}` : ''}
            </div>
          </div>
        </div>
        <ModalFooter
          onClose={onClose} onConfirm={handleDelete}
          confirmLabel="確認刪除" confirmColor="#dc2626" saving={saving}
        />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 摘要卡片列
// ════════════════════════════════════════════════════════════
function SummaryCards({ type, summary }) {
  if (!summary) return null;

  let cards = [];

  if (type === 'projects') {
    cards = [
      { icon: '📁', label: '專案總數',   value: summary.totalProjects },
      { icon: '🟢', label: '進行中專案', value: summary.activeProjects },
      { icon: '📋', label: '任務總數',   value: summary.totalTasks },
      { icon: '✅', label: '已完成任務', value: summary.doneTasks },
      { icon: '📊', label: '整體完成率', value: `${summary.overallRate}%` },
    ];
  } else if (type === 'tasks') {
    cards = [
      { icon: '📋', label: '任務總數', value: summary.total },
      { icon: '⬜', label: '待處理', value: summary.byStatus.todo },
      { icon: '🔵', label: '進行中', value: summary.byStatus.in_progress },
      { icon: '🟡', label: '審查中', value: summary.byStatus.review },
      { icon: '🟢', label: '已完成', value: summary.byStatus.done },
      { icon: '🔴', label: '緊急任務', value: summary.byPriority.urgent },
    ];
  } else if (type === 'timelog') {
    cards = [
      { icon: '📝', label: '記錄筆數', value: summary.totalEntries },
      { icon: '⏱️', label: '總工時',   value: summary.totalDisplay },
      { icon: '📅', label: '統計區間', value: `${summary.rangeStart} ~ ${summary.rangeEnd}` },
    ];
  } else if (type === 'milestones') {
    cards = [
      { icon: '🎯', label: '里程碑總數', value: summary.total },
      { icon: '✅', label: '已達成',     value: summary.achieved },
      { icon: '🔴', label: '已延誤',     value: summary.late },
      { icon: '⏳', label: '即將到期（30天內）', value: summary.upcoming },
    ];
  }

  return (
    <div style={{
      display:       'flex',
      gap:           '10px',
      flexWrap:      'wrap',
      marginBottom:  '16px',
    }}>
      {cards.map((c, i) => (
        <div key={i} style={{
          background:   THEME.panelStrong,
          border:       `1px solid ${THEME.border}`,
          borderRadius: '10px',
          padding:      '14px 18px',
          minWidth:     '110px',
          flex:         1,
          boxShadow:    THEME.shadow,
        }}>
          <div style={{ fontSize: '11px', color: THEME.textMuted, marginBottom: '4px' }}>
            {c.icon} {c.label}
          </div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: THEME.text }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 資料表格（支援 onEditRow / onDeleteRow 操作欄）
// ════════════════════════════════════════════════════════════
function DataTable({ columns, rows, currentPage, onPageChange, onEditRow, onDeleteRow }) {
  const [hoveredRow, setHoveredRow] = useState(null);

  const totalPages  = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows    = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const hasActions  = Boolean(onEditRow || onDeleteRow);

  const renderCell = (col, row) => {
    const val = row[col.key];

    if (col.type === 'percent') {
      const pct = Number(val) || 0;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            flex: 1, height: '6px', background: THEME.surfaceMuted, borderRadius: '3px',
            minWidth: '60px',
          }}>
            <div style={{
              width: `${pct}%`, height: '100%',
              background: pct >= 80 ? '#10b981' : pct >= 50 ? '#3b82f6' : '#f59e0b',
              borderRadius: '3px', transition: 'width 0.3s',
            }} />
          </div>
          <span style={{ fontSize: '12px', color: THEME.textSoft, minWidth: '32px' }}>{pct}%</span>
        </div>
      );
    }

    if (col.type === 'status') {
      const badge = STATUS_BADGE[val] || { bg: '#f3f4f6', text: '#6b7280' };
      return (
        <span style={{
          background: badge.bg, color: badge.text,
          padding: '2px 8px', borderRadius: '12px',
          fontSize: '12px', fontWeight: '500',
        }}>{val}</span>
      );
    }

    if (col.type === 'priority') {
      const badge = PRIORITY_BADGE[val] || { bg: '#f3f4f6', text: '#6b7280' };
      return (
        <span style={{
          background: badge.bg, color: badge.text,
          padding: '2px 8px', borderRadius: '12px',
          fontSize: '12px', fontWeight: '600',
        }}>{val}</span>
      );
    }

    if (col.type === 'milestone-status') {
      const badge = MILESTONE_BADGE[val] || { bg: '#f3f4f6', text: '#6b7280' };
      return (
        <span style={{
          background: badge.bg, color: badge.text,
          padding: '2px 8px', borderRadius: '12px',
          fontSize: '12px', fontWeight: '500',
        }}>{val}</span>
      );
    }

    if (col.type === 'milestone-color') {
      const colorMap = { '紅（高風險）': '#dc2626', '黃（需注意）': '#d97706', '綠（正常）': '#16a34a' };
      const color = colorMap[val] || '#6b7280';
      return (
        <span style={{ color, fontWeight: '500', fontSize: '13px' }}>● {val}</span>
      );
    }

    if (col.type === 'number') {
      return (
        <span style={{ fontFamily: 'tabular-nums', color: THEME.textSoft }}>{val ?? '—'}</span>
      );
    }

    return (
      <span style={{
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        display: 'block', maxWidth: '280px', color: THEME.textSoft,
      }}>
        {val || '—'}
      </span>
    );
  };

  return (
    <div>
      {/* 表格 */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: THEME.surfaceSoft, borderBottom: `2px solid ${THEME.border}` }}>
              {columns.map(col => (
                <th key={col.key} style={{
                  padding:    '10px 14px',
                  textAlign:  col.type === 'number' || col.type === 'percent' ? 'center' : 'left',
                  fontWeight: '600',
                  color:      THEME.textMuted,
                  fontSize:   '12px',
                  whiteSpace: 'nowrap',
                }}>
                  {col.label}
                </th>
              ))}
              {hasActions && (
                <th style={{
                  padding: '10px 14px', textAlign: 'center',
                  fontWeight: '600', color: THEME.textMuted, fontSize: '12px',
                  whiteSpace: 'nowrap', width: '80px',
                }}>
                  操作
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (hasActions ? 1 : 0)}
                  style={{ padding: '40px', textAlign: 'center', color: THEME.textMuted }}
                >
                  無資料
                </td>
              </tr>
            ) : pageRows.map((row, i) => (
              <tr
                key={row.id ?? i}
                style={{
                  borderBottom: `1px solid ${THEME.border}`,
                  background:   hoveredRow === i ? THEME.rowHover : i % 2 === 0 ? THEME.surfaceStrong : THEME.rowAlt,
                  transition:   'background 0.1s',
                  cursor:       onEditRow && row.id ? 'pointer' : 'default',
                }}
                onMouseEnter={() => setHoveredRow(i)}
                onMouseLeave={() => setHoveredRow(null)}
                onClick={() => onEditRow && row.id && onEditRow(row)}
              >
                {columns.map(col => (
                  <td key={col.key} style={{
                    padding:   '10px 14px',
                    textAlign: col.type === 'number' || col.type === 'percent' ? 'center' : 'left',
                  }}>
                    {renderCell(col, row)}
                  </td>
                ))}
                {hasActions && (
                  <td style={{ padding: '8px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {row.id && (
                      <div style={{
                        display: 'flex', justifyContent: 'center', gap: '4px',
                        opacity:    hoveredRow === i ? 1 : 0,
                        transition: 'opacity 0.15s',
                      }}>
                        {onEditRow && (
                          <button
                            onClick={e => { e.stopPropagation(); onEditRow(row); }}
                            title="編輯"
                            style={{
                              background: 'none', border: `1px solid color-mix(in srgb, ${THEME.accent} 24%, ${THEME.border})`,
                              borderRadius: '5px', padding: '3px 8px',
                              cursor: 'pointer', fontSize: '13px', color: THEME.accent,
                            }}
                            onMouseOver={e => e.currentTarget.style.background = THEME.accentSoft}
                            onMouseOut={e => e.currentTarget.style.background = 'none'}
                          >
                            ✏️
                          </button>
                        )}
                        {onDeleteRow && (
                          <button
                            onClick={e => { e.stopPropagation(); onDeleteRow(row); }}
                            title="刪除"
                            style={{
                              background: 'none', border: `1px solid color-mix(in srgb, ${THEME.danger} 24%, ${THEME.border})`,
                              borderRadius: '5px', padding: '3px 8px',
                              cursor: 'pointer', fontSize: '13px', color: THEME.danger,
                            }}
                            onMouseOver={e => e.currentTarget.style.background = THEME.dangerSoft}
                            onMouseOut={e => e.currentTarget.style.background = 'none'}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分頁 */}
      {totalPages > 1 && (
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '12px 14px',
          borderTop:      `1px solid ${THEME.border}`,
          background:     THEME.surfaceSoft,
        }}>
          <span style={{ fontSize: '12px', color: THEME.textMuted }}>
            共 {rows.length} 筆，第 {currentPage}/{totalPages} 頁
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <PaginBtn label="«" disabled={currentPage === 1} onClick={() => onPageChange(1)} />
            <PaginBtn label="‹" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} />
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let page;
              if (totalPages <= 5) page = i + 1;
              else if (currentPage <= 3) page = i + 1;
              else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
              else page = currentPage - 2 + i;
              return (
                <PaginBtn key={page} label={String(page)}
                  active={page === currentPage} onClick={() => onPageChange(page)} />
              );
            })}
            <PaginBtn label="›" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)} />
            <PaginBtn label="»" disabled={currentPage === totalPages} onClick={() => onPageChange(totalPages)} />
          </div>
        </div>
      )}
    </div>
  );
}

function PaginBtn({ label, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background:   active ? THEME.accent : disabled ? THEME.surfaceSoft : THEME.panelStrong,
        color:        active ? 'white'   : disabled ? THEME.textMuted : THEME.textSoft,
        border:       `1px solid ${THEME.border}`,
        borderRadius: '6px',
        padding:      '4px 10px',
        fontSize:     '12px',
        cursor:       disabled ? 'not-allowed' : 'pointer',
        fontWeight:   active ? '600' : '400',
      }}
    >
      {label}
    </button>
  );
}

// ════════════════════════════════════════════════════════════
// 篩選列
// ════════════════════════════════════════════════════════════
function FilterBar({ type, filters, projects, onChange, onGenerate, loading }) {
  const today = todayStr();
  const ago30 = daysAgoStr(29);

  return (
    <div style={{
      display:      'flex',
      flexWrap:     'wrap',
      gap:          '10px',
      alignItems:   'flex-end',
      padding:      '14px 16px',
      background:   THEME.surfaceSoft,
      borderBottom: `1px solid ${THEME.border}`,
    }}>
      {/* 任務報表：專案篩選 + 狀態篩選 */}
      {type === 'tasks' && (
        <>
          <FilterItem label="所屬專案">
            <select
              value={filters.projectId || ''}
              onChange={e => onChange('projectId', e.target.value || null)}
              style={filterSelectStyle}
            >
              <option value="">全部專案</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </FilterItem>
          <FilterItem label="任務狀態">
            <select
              value={filters.status || ''}
              onChange={e => onChange('status', e.target.value || null)}
              style={filterSelectStyle}
            >
              <option value="">全部狀態</option>
              <option value="todo">待處理</option>
              <option value="in_progress">進行中</option>
              <option value="review">審查中</option>
              <option value="done">已完成</option>
            </select>
          </FilterItem>
        </>
      )}

      {/* 工時報表：日期範圍 + 群組方式 */}
      {type === 'timelog' && (
        <>
          <FilterItem label="開始日期">
            <input
              type="date"
              value={filters.startDate || ago30}
              onChange={e => onChange('startDate', e.target.value)}
              style={filterInputStyle}
            />
          </FilterItem>
          <FilterItem label="結束日期">
            <input
              type="date"
              value={filters.endDate || today}
              max={today}
              onChange={e => onChange('endDate', e.target.value)}
              style={filterInputStyle}
            />
          </FilterItem>
          <FilterItem label="群組方式">
            <select
              value={filters.groupBy || 'project'}
              onChange={e => onChange('groupBy', e.target.value)}
              style={filterSelectStyle}
            >
              <option value="project">依專案</option>
              <option value="user">依成員</option>
              <option value="task">依任務</option>
            </select>
          </FilterItem>
        </>
      )}

      {/* 生成按鈕 */}
      <button
        onClick={onGenerate}
        disabled={loading}
        style={{
          background:   loading ? THEME.textMuted : THEME.accent,
          color:        'white',
          border:       'none',
          borderRadius: '8px',
          padding:      '8px 18px',
          fontSize:     '13px',
          fontWeight:   '600',
          cursor:       loading ? 'not-allowed' : 'pointer',
          display:      'flex',
          alignItems:   'center',
          gap:          '6px',
        }}
      >
        {loading ? '⏳ 載入中...' : '🔍 產生報表'}
      </button>
    </div>
  );
}

function FilterItem({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: THEME.textMuted, marginBottom: '4px', fontWeight: '500' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const filterSelectStyle = {
  padding: '7px 10px', border: `1px solid ${THEME.borderStrong}`,
  borderRadius: '7px', fontSize: '13px',
  background: THEME.panelStrong, color: THEME.textSoft, cursor: 'pointer',
  minWidth: '130px',
};
const filterInputStyle = {
  ...filterSelectStyle,
  cursor: 'text',
};

// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// P1#34-36 高層 Executive Report 元件
// ════════════════════════════════════════════════════════════
function ExecutiveReport({ companyId, authFetch }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    if (!companyId || !authFetch) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      // 同時拉 summary + portfolio
      const [sumRes, portRes] = await Promise.all([
        authFetch(`/api/dashboard/summary?companyId=${companyId}`),
        authFetch(`/api/portfolios?companyId=${companyId}`),
      ]);
      const sumJson  = await sumRes.json();
      const portJson = await portRes.json();
      const sum  = sumJson.data  || sumJson;
      const port = portJson.data || portJson;
      setData({ sum, port });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId, authFetch]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ padding: '60px', textAlign: 'center', color: THEME.textMuted, fontSize: '14px' }}>
      正在生成 Executive Summary…
    </div>
  );
  if (error) return (
    <div style={{ padding: '40px', textAlign: 'center', color: THEME.danger }}>⚠️ {error}</div>
  );
  if (!data) return null;

  const { sum, port } = data;
  const summary  = sum.summary  || {};
  const projects = sum.projects || [];
  const trend    = sum.monthlyTrend || [];
  const insights = sum.insights || [];
  const portProjects = port.projects || [];
  const portSummary  = port.summary  || {};

  // 健康分布資料
  const healthData = [
    { name: '健康',   value: projects.filter(p => p.health === 'healthy').length,   color: '#10b981' },
    { name: '落後',   value: projects.filter(p => p.health === 'off_track').length,  color: '#f59e0b' },
    { name: '有風險', value: projects.filter(p => p.health === 'at_risk').length,    color: '#ef4444' },
  ].filter(d => d.value > 0);

  // 前 5 個逾期最多的專案
  const top5Risk = [...portProjects].sort((a, b) => b.overdue - a.overdue).slice(0, 5);

  // 月趨勢最後 6 月
  const trendLast6 = trend.slice(-6);

  const printDate = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div style={{ padding: '8px 20px', fontFamily: 'inherit' }}>
      {/* 封面區 */}
      <div style={{
        background:   'linear-gradient(135deg, #c41230 0%, #8b0c22 100%)',
        borderRadius: '16px',
        padding:      '28px 32px',
        color:        '#fff',
        marginBottom: '24px',
        display:      'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      }}>
        <div>
          <div style={{ fontSize: '11px', opacity: 0.7, marginBottom: '4px', letterSpacing: '0.1em' }}>EXECUTIVE SUMMARY</div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800 }}>專案組合管理報告</h2>
          <div style={{ marginTop: '6px', fontSize: '12px', opacity: 0.8 }}>報告日期：{printDate}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '36px', fontWeight: 900 }}>{summary.completionRate ?? 0}%</div>
          <div style={{ fontSize: '11px', opacity: 0.7 }}>整體完成率</div>
        </div>
      </div>

      {/* KPI 總覽 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: '活躍專案', value: summary.activeProjects  ?? 0, icon: '📁', color: '#3b82f6' },
          { label: '完成率',   value: `${summary.completionRate ?? 0}%`, icon: '✅', color: '#10b981' },
          { label: '逾期任務', value: summary.overdueTasks    ?? 0, icon: '⏰', color: '#ef4444' },
          { label: '協作成員', value: summary.totalMembers    ?? 0, icon: '👥', color: '#8b5cf6' },
          { label: '平均進度', value: `${portSummary.avgProgress ?? 0}%`, icon: '📈', color: '#f59e0b' },
        ].map(k => (
          <div key={k.label} style={{
            background: THEME.surface, border: `1px solid ${THEME.border}`,
            borderRadius: '12px', padding: '14px 16px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '20px', marginBottom: '4px' }}>{k.icon}</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: '11px', color: THEME.textMuted }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* 圖表雙欄 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '16px', marginBottom: '24px' }}>
        {/* 健康分布 */}
        <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '16px 20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: THEME.text, marginBottom: '12px' }}>🟢 專案健康分布</div>
          {healthData.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie data={healthData} cx={45} cy={45} innerRadius={28} outerRadius={45} dataKey="value" strokeWidth={0}>
                    {healthData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {healthData.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: d.color, flexShrink: 0 }} />
                    <span style={{ color: THEME.textSoft }}>{d.name}</span>
                    <span style={{ fontWeight: 700, color: d.color, marginLeft: 'auto' }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ color: THEME.textMuted, fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>尚無資料</div>
          )}
        </div>

        {/* 月度趨勢 */}
        <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '16px 20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: THEME.text, marginBottom: '12px' }}>📈 近 6 月完成趨勢</div>
          {trendLast6.length > 0 ? (
            <ResponsiveContainer width="100%" height={130}>
              <AreaChart data={trendLast6} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="execGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#c41230" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#c41230" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={THEME.border} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: THEME.textMuted }} axisLine={false} tickLine={false}
                  tickFormatter={m => { const [,mo] = (m||'').split('-'); return `${parseInt(mo,10)}月`; }} />
                <YAxis tick={{ fontSize: 10, fill: THEME.textMuted }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  formatter={(v, n) => [v, n === 'completed' ? '已完成' : '新建立']}
                  contentStyle={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: '8px', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="completed" stroke="#c41230" strokeWidth={2.5} fill="url(#execGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: THEME.textMuted, fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>尚無趨勢資料</div>
          )}
        </div>
      </div>

      {/* 風險專案 Top 5 */}
      {top5Risk.length > 0 && (
        <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '16px 20px', marginBottom: '24px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: THEME.text, marginBottom: '12px' }}>⚠️ 高風險專案（逾期任務最多）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {top5Risk.map((p, i) => {
              const pctColor = p.progress >= 80 ? '#10b981' : p.progress >= 50 ? '#f59e0b' : '#ef4444';
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 14px', borderRadius: '8px',
                  background: p.overdue > 0 ? 'rgba(239,68,68,.04)' : THEME.surfaceSoft,
                  border: p.overdue > 0 ? '1px solid rgba(239,68,68,.2)' : `1px solid ${THEME.border}`,
                }}>
                  <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: THEME.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0, color: THEME.textMuted }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: '10px', color: THEME.textMuted, marginTop: '2px' }}>
                      {p.done}/{p.total} 完成 · {p.memberCount} 人
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: pctColor }}>{p.progress}%</div>
                      <div style={{ fontSize: '9px', color: THEME.textMuted }}>進度</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: p.overdue > 0 ? '#ef4444' : THEME.textMuted }}>{p.overdue}</div>
                      <div style={{ fontSize: '9px', color: THEME.textMuted }}>逾期</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI 洞察 */}
      {insights.length > 0 && (
        <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '16px 20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: THEME.text, marginBottom: '12px' }}>💡 系統洞察與建議</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {insights.slice(0, 4).map((ins, i) => {
              const colors = { danger: '#ef4444', warning: '#f59e0b', success: '#10b981', info: '#3b82f6' };
              const icons  = { danger: '🚨', warning: '⚠️', success: '✅', info: 'ℹ️' };
              const c = colors[ins.type] || '#6b7280';
              return (
                <div key={i} style={{
                  padding: '10px 14px', borderRadius: '8px',
                  background: `${c}08`, border: `1px solid ${c}30`,
                  fontSize: '12px',
                }}>
                  <span style={{ fontWeight: 700, color: c }}>{icons[ins.type]} {ins.title}</span>
                  <span style={{ color: THEME.textSoft, marginLeft: '8px' }}>{ins.body}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', fontSize: '11px', color: THEME.textMuted, paddingTop: '8px' }}>
        由 xCloudPMIS 自動生成 · {printDate}
      </div>
    </div>
  );
}

// 主元件：ReportsPage
// ════════════════════════════════════════════════════════════
export default function ReportsPage() {
  const { user, authFetch } = useAuth();
  const COMPANY_ID = user?.companyId;

  const [activeType,  setActiveType]  = useState('projects');
  const [reportData,  setReportData]  = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [page,        setPage]        = useState(1);
  const [projects,    setProjects]    = useState([]);
  const [users,       setUsers]       = useState([]);
  const [filters,     setFilters]     = useState({
    projectId: null,
    status:    null,
    startDate: daysAgoStr(29),
    endDate:   todayStr(),
    groupBy:   'project',
  });
  const [exporting,   setExporting]   = useState(false);
  const [editItem,    setEditItem]    = useState(null);   // 正在編輯的列資料
  const [deleteItem,  setDeleteItem]  = useState(null);  // 正在刪除的列資料
  const [toast,       setToast]       = useState(null);  // { msg, type }

  // 載入篩選選項（專案清單 + 成員清單）
  useEffect(() => {
    fetch(`${API_BASE}/api/reports/filter-options?companyId=${COMPANY_ID}`)
      .then(r => r.json())
      .then(d => {
        setProjects(d.projects || []);
        setUsers(d.users || []);
      })
      .catch(() => {});
  }, []);

  // 切換報表類型時自動產生報表
  useEffect(() => {
    generateReport(activeType);
    setPage(1);
  }, [activeType]);

  // 更新篩選條件
  const updateFilter = (key, val) => {
    setFilters(prev => ({ ...prev, [key]: val }));
  };

  // 產生報表
  const generateReport = useCallback(async (type = activeType) => {
    setLoading(true);
    setError(null);
    setPage(1);
    try {
      let url = `${API_BASE}/api/reports/${type}?companyId=${COMPANY_ID}`;
      if (type === 'tasks') {
        if (filters.projectId) url += `&projectId=${filters.projectId}`;
        if (filters.status)    url += `&status=${filters.status}`;
      }
      if (type === 'timelog') {
        url += `&startDate=${filters.startDate}&endDate=${filters.endDate}&groupBy=${filters.groupBy}`;
      }

      const res  = await fetch(url);
      if (!res.ok) throw new Error('報表產生失敗');
      const data = await res.json();
      setReportData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeType, filters]);

  // 顯示 Toast 提示
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 儲存後回呼：關閉彈窗、重新載入報表、顯示提示
  const handleSaved = () => {
    setEditItem(null);
    generateReport(activeType);
    showToast('已成功儲存');
  };

  // 刪除後回呼：關閉彈窗、重新載入報表、顯示提示
  const handleDeleted = () => {
    setDeleteItem(null);
    generateReport(activeType);
    showToast('已成功刪除');
  };

  // 匯出 CSV
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      let url = `${API_BASE}/api/reports/${activeType}?companyId=${COMPANY_ID}&format=csv`;
      if (activeType === 'tasks') {
        if (filters.projectId) url += `&projectId=${filters.projectId}`;
        if (filters.status)    url += `&status=${filters.status}`;
      }
      if (activeType === 'timelog') {
        url += `&startDate=${filters.startDate}&endDate=${filters.endDate}&groupBy=${filters.groupBy}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error('匯出失敗');

      const blob     = await res.blob();
      const fileName = decodeURIComponent(
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'report.csv'
      );
      const blobUrl  = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href         = blobUrl;
      a.download     = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert('匯出失敗：' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const activeReportType = REPORT_TYPES.find(r => r.id === activeType);
  const showFilters      = activeType === 'tasks' || activeType === 'timelog';

  // 工時報表為彙總資料，不提供行級操作
  const canEditRow   = reportData && reportData.type !== 'timelog';
  const handleEditRow   = canEditRow ? (row) => setEditItem(row)   : undefined;
  const handleDeleteRow = canEditRow ? (row) => setDeleteItem(row) : undefined;

  // ════════════════════════════════════════════════════════
  // 渲染
  // ════════════════════════════════════════════════════════
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: THEME.pageBg }}>

      {/* ── 頁面標題列 ─────────────────────────────────── */}
      <div style={{
        background:     THEME.panelStrong,
        borderBottom:   `1px solid ${THEME.border}`,
        padding:        '14px 24px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        flexShrink:     0,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: THEME.text }}>
            📄 報表匯出
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: THEME.textMuted }}>
            產生各類分析報表，支援 CSV 格式下載；專案、任務、里程碑支援行內編輯與刪除
          </p>
        </div>
        {/* 匯出按鈕 */}
        {reportData && (
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            style={{
              background:   exporting ? THEME.successSoft : THEME.success,
              color:        'white',
              border:       'none',
              borderRadius: '8px',
              padding:      '8px 18px',
              fontSize:     '13px',
              fontWeight:   '600',
              cursor:       exporting ? 'not-allowed' : 'pointer',
              display:      'flex',
              alignItems:   'center',
              gap:          '6px',
              boxShadow:    '0 8px 20px rgba(22,163,74,0.24)',
            }}
          >
            {exporting ? '⏳ 匯出中...' : '⬇ 匯出 CSV'}
          </button>
        )}
      </div>

      {/* ── 主要區塊 ───────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* 左側：報表類型選單 */}
        <div style={{
          width:       '220px',
          flexShrink:  0,
          background:  THEME.panel,
          borderRight: `1px solid ${THEME.border}`,
          padding:     '16px 12px',
          overflowY:   'auto',
        }}>
          <div style={{
            fontSize:      '11px',
            fontWeight:    '700',
            color:         THEME.textMuted,
            letterSpacing: '0.08em',
            marginBottom:  '8px',
            paddingLeft:   '8px',
          }}>
            報表類型
          </div>
          {REPORT_TYPES.map(rt => (
            <button
              key={rt.id}
              onClick={() => setActiveType(rt.id)}
              style={{
                width:        '100%',
                textAlign:    'left',
                border:       'none',
                background:   activeType === rt.id ? `color-mix(in srgb, ${rt.color} 16%, ${THEME.surfaceStrong})` : 'transparent',
                borderRadius: '8px',
                padding:      '10px 10px',
                marginBottom: '4px',
                cursor:       'pointer',
                borderLeft:   activeType === rt.id ? `3px solid ${rt.color}` : '3px solid transparent',
                transition:   'all 0.15s',
              }}
            >
              <div style={{
                display:    'flex',
                alignItems: 'center',
                gap:        '8px',
                fontSize:   '14px',
                fontWeight: activeType === rt.id ? '600' : '400',
                color:      activeType === rt.id ? rt.color : THEME.textSoft,
              }}>
                <span style={{ fontSize: '16px' }}>{rt.icon}</span>
                <span style={{ lineHeight: 1.3 }}>{rt.label}</span>
              </div>
              {activeType === rt.id && (
                <div style={{
                  fontSize:    '11px',
                  color:       THEME.textMuted,
                  marginTop:   '4px',
                  paddingLeft: '24px',
                  lineHeight:  1.4,
                }}>
                  {rt.description}
                </div>
              )}
            </button>
          ))}

          {/* 格式說明 */}
          <div style={{
            marginTop:    '24px',
            padding:      '12px',
            background:   THEME.successSoft,
            borderRadius: '8px',
            fontSize:     '11px',
            color:        THEME.success,
            lineHeight:   1.6,
          }}>
            <div style={{ fontWeight: '700', marginBottom: '4px' }}>📥 匯出格式</div>
            <div>• CSV（Excel 可直接開啟）</div>
            <div>• UTF-8 + BOM 編碼</div>
            <div>• 支援中文欄位名稱</div>
          </div>
        </div>

        {/* 右側：報表內容 */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* P1#34-36: Executive Report 特殊渲染 */}
          {activeType === 'executive' && (
            <div style={{ flex: 1, padding: '16px 20px', overflow: 'auto' }}>
              <ExecutiveReport companyId={COMPANY_ID} authFetch={authFetch} />
            </div>
          )}

          {/* 篩選列 */}
          {activeType !== 'executive' && showFilters && (
            <FilterBar
              type={activeType}
              filters={filters}
              projects={projects}
              onChange={updateFilter}
              onGenerate={() => generateReport(activeType)}
              loading={loading}
            />
          )}

          {/* 報表內容區（非 executive 模式才顯示） */}
          {activeType !== 'executive' && <div style={{ flex: 1, padding: '16px 20px', overflow: 'auto' }}>

            {/* 載入中 */}
            {loading && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '300px', flexDirection: 'column', gap: '16px',
              }}>
                <div style={{ fontSize: '40px' }}>⏳</div>
                <div style={{ color: THEME.textMuted, fontSize: '15px' }}>報表產生中...</div>
              </div>
            )}

            {/* 錯誤 */}
            {!loading && error && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '300px', flexDirection: 'column', gap: '12px',
              }}>
                <div style={{ fontSize: '40px' }}>😢</div>
                <div style={{ color: THEME.danger }}>{error}</div>
                <button
                  onClick={() => generateReport(activeType)}
                  style={{
                    background: THEME.accent, color: 'white', border: 'none',
                    borderRadius: '8px', padding: '8px 18px', cursor: 'pointer', fontWeight: '600',
                  }}
                >
                  重試
                </button>
              </div>
            )}

            {/* 報表資料 */}
            {!loading && !error && reportData && (
              <>
                {/* 報表標題 + 資訊列 */}
                <div style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'space-between',
                  marginBottom:   '14px',
                }}>
                  <div>
                    <h2 style={{
                      margin: 0, fontSize: '16px', fontWeight: '700', color: THEME.text,
                      display: 'flex', alignItems: 'center', gap: '8px',
                    }}>
                      <span>{activeReportType?.icon}</span>
                      {reportData.title}
                    </h2>
                    <div style={{ fontSize: '12px', color: THEME.textMuted, marginTop: '2px' }}>
                      產生時間：{new Date(reportData.generatedAt).toLocaleString('zh-TW')}
                      　共 {reportData.rows.length} 筆資料
                    </div>
                  </div>
                </div>

                {/* 摘要卡片 */}
                <SummaryCards type={reportData.type} summary={reportData.summary} />

                {/* 工時報表的群組說明 */}
                {reportData.type === 'timelog' && (
                  <div style={{
                    display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap',
                  }}>
                    {['依專案', '依成員', '依任務'].map((label, i) => {
                      const val = ['project', 'user', 'task'][i];
                      return (
                        <button
                          key={val}
                          onClick={() => {
                            updateFilter('groupBy', val);
                            setTimeout(() => generateReport(activeType), 50);
                          }}
                          style={{
                            background:   filters.groupBy === val ? THEME.accent : THEME.panelStrong,
                            color:        filters.groupBy === val ? 'white'   : THEME.textMuted,
                            border:       `1px solid ${THEME.border}`,
                            borderRadius: '6px',
                            padding:      '5px 14px',
                            fontSize:     '12px',
                            cursor:       'pointer',
                            fontWeight:   filters.groupBy === val ? '600' : '400',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 資料表格 */}
                <div style={{
                  background:   THEME.panelStrong,
                  border:       `1px solid ${THEME.border}`,
                  borderRadius: '10px',
                  overflow:     'hidden',
                  boxShadow:    THEME.shadow,
                }}>
                  <DataTable
                    columns={reportData.columns}
                    rows={reportData.rows}
                    currentPage={page}
                    onPageChange={setPage}
                    onEditRow={handleEditRow}
                    onDeleteRow={handleDeleteRow}
                  />
                </div>
              </>
            )}

            {/* 初始未選擇時 */}
            {!loading && !error && !reportData && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '300px', flexDirection: 'column', gap: '12px',
              }}>
                <div style={{ fontSize: '40px' }}>📊</div>
                <div style={{ color: THEME.textMuted }}>選擇左側報表類型開始分析</div>
              </div>
            )}
          </div>}
        </div>
      </div>

      {/* ── Toast 通知 ───────────────────────────────────── */}
      {toast && (
        <div style={{
          position:     'fixed',
          bottom:       '24px',
          right:        '24px',
          background:   toast.type === 'error' ? THEME.danger : THEME.success,
          color:        'white',
          padding:      '12px 20px',
          borderRadius: '10px',
          fontSize:     '14px',
          fontWeight:   '600',
          boxShadow:    '0 4px 16px rgba(0,0,0,0.2)',
          zIndex:       2000,
          animation:    'fadeIn 0.2s ease',
        }}>
          {toast.type === 'error' ? '❌ ' : '✅ '}{toast.msg}
        </div>
      )}

      {/* ── 編輯/刪除彈跳視窗 ────────────────────────────── */}

      {/* 專案 */}
      {editItem && reportData?.type === 'projects' && (
        <EditProjectModal
          row={editItem} users={users}
          onClose={() => setEditItem(null)}
          onSaved={handleSaved}
        />
      )}
      {deleteItem && reportData?.type === 'projects' && (
        <DeleteProjectModal
          row={deleteItem}
          onClose={() => setDeleteItem(null)}
          onDeleted={handleDeleted}
        />
      )}

      {/* 任務 */}
      {editItem && reportData?.type === 'tasks' && (
        <EditTaskModal
          row={editItem} users={users}
          onClose={() => setEditItem(null)}
          onSaved={handleSaved}
        />
      )}
      {deleteItem && reportData?.type === 'tasks' && (
        <DeleteTaskModal
          row={deleteItem}
          onClose={() => setDeleteItem(null)}
          onDeleted={handleDeleted}
        />
      )}

      {/* 里程碑 */}
      {editItem && reportData?.type === 'milestones' && (
        <EditMilestoneModal
          row={editItem}
          onClose={() => setEditItem(null)}
          onSaved={handleSaved}
        />
      )}
      {deleteItem && reportData?.type === 'milestones' && (
        <DeleteMilestoneModal
          row={deleteItem}
          onClose={() => setDeleteItem(null)}
          onDeleted={handleDeleted}
        />
      )}

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
