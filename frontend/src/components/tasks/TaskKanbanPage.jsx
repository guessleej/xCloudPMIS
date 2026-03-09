/**
 * TaskKanbanPage.jsx
 * 跨專案任務看板 — 四欄式看板（待辦 / 進行中 / 審核中 / 已完成）
 *
 * API：
 *   GET    /api/projects/tasks          取得所有任務（含看板分組）
 *   POST   /api/projects/:id/tasks      新增任務
 *   PATCH  /api/projects/tasks/:taskId  更新任務
 *   DELETE /api/projects/tasks/:taskId  軟刪除任務
 */

import { useState, useEffect, useCallback } from 'react';

// ── 常數 ─────────────────────────────────────────────────────
const API = 'http://localhost:3010/api/projects';

const COLUMNS = [
  { id: 'todo',        label: '待辦',   emoji: '📋', color: '#6b7280' },
  { id: 'in_progress', label: '進行中', emoji: '⚡', color: '#3b82f6' },
  { id: 'review',      label: '審核中', emoji: '🔍', color: '#f59e0b' },
  { id: 'done',        label: '已完成', emoji: '✅', color: '#10b981' },
];

const PRIORITY_MAP = {
  urgent: { label: '🔴 緊急', bg: '#fee2e2', color: '#dc2626' },
  high:   { label: '🟠 高',   bg: '#ffedd5', color: '#ea580c' },
  medium: { label: '🟡 中',   bg: '#fef9c3', color: '#ca8a04' },
  low:    { label: '⚪ 低',   bg: '#f3f4f6', color: '#6b7280' },
};

const STATUS_NEXT = {
  todo:        'in_progress',
  in_progress: 'review',
  review:      'done',
  done:        'todo',
};
const STATUS_NEXT_LABEL = {
  todo:        '▶ 開始',
  in_progress: '🔍 送審',
  review:      '✅ 完成',
  done:        '↩ 重開',
};

// ── 共用樣式 ─────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '8px 10px',
  border: '1px solid #d1d5db', borderRadius: 6,
  fontSize: '13px', boxSizing: 'border-box',
  outline: 'none', background: '#fff',
};
const labelStyle = {
  fontSize: '12px', fontWeight: 600,
  color: '#374151', marginBottom: 4, display: 'block',
};

// ── 工具函式 ─────────────────────────────────────────────────
function daysLeft(dueDate) {
  if (!dueDate) return null;
  return Math.ceil((new Date(dueDate) - new Date()) / 86400000);
}

function avatarChar(name) {
  return name ? name.charAt(0).toUpperCase() : '?';
}

// ════════════════════════════════════════════════════════════
// 任務卡片元件
// ════════════════════════════════════════════════════════════
function TaskCard({ task, onMoveNext, onOpenEdit, onDelete }) {
  const pri   = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;
  const days  = daysLeft(task.dueDate);
  const isOverdue = days !== null && days < 0 && task.status !== 'done';

  return (
    <div
      style={{
        background:   '#ffffff',
        borderRadius: '10px',
        marginBottom: '8px',
        boxShadow:    '0 1px 3px rgba(0,0,0,.08)',
        borderLeft:   `3px solid ${pri.color}`,
        transition:   'box-shadow .15s',
        overflow:     'hidden',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.15)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.08)'}
    >
      {/* 卡片主體（可點擊開啟編輯） */}
      <div
        style={{ padding: '12px 14px', cursor: 'pointer' }}
        onClick={() => onOpenEdit(task)}
      >
        {/* 專案徽章 */}
        <div style={{ marginBottom: 6 }}>
          <span style={{
            fontSize: '11px', fontWeight: 600,
            background: '#ede9fe', color: '#7c3aed',
            padding: '2px 7px', borderRadius: 4,
          }}>
            {task.project?.name || '未分類'}
          </span>
        </div>

        {/* 標題 */}
        <div style={{
          fontSize: '13px', fontWeight: 600,
          color: '#1f2937', marginBottom: 6,
          lineHeight: 1.4,
          textDecoration: task.status === 'done' ? 'line-through' : 'none',
          opacity: task.status === 'done' ? 0.6 : 1,
        }}>
          {task.title}
        </div>

        {/* 優先度 + 截止日 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '11px', padding: '2px 6px',
            borderRadius: 4, background: pri.bg, color: pri.color,
            fontWeight: 600,
          }}>
            {pri.label}
          </span>
          {days !== null && (
            <span style={{
              fontSize: '11px', fontWeight: 600,
              color: isOverdue ? '#dc2626' : days <= 3 ? '#ea580c' : '#6b7280',
            }}>
              {isOverdue
                ? `⚠️ 已逾期 ${Math.abs(days)} 天`
                : days === 0 ? '⚡ 今天到期'
                : `📅 剩 ${days} 天`}
            </span>
          )}
        </div>

        {/* Tags */}
        {task.tags?.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {task.tags.map(tag => (
              <span key={tag.id} style={{
                fontSize: '10px', padding: '1px 5px',
                borderRadius: 3,
                background: tag.color || '#e5e7eb',
                color: '#374151', fontWeight: 500,
              }}>
                #{tag.name}
              </span>
            ))}
          </div>
        )}

        {/* 底部：指派人 + 移動按鈕 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {task.assignee ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: '#818cf8', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 700,
              }}>
                {avatarChar(task.assignee.name)}
              </div>
              <span style={{ fontSize: '11px', color: '#6b7280' }}>{task.assignee.name}</span>
            </div>
          ) : (
            <span style={{ fontSize: '11px', color: '#9ca3af' }}>未指派</span>
          )}

          <button
            onClick={e => { e.stopPropagation(); onMoveNext(task); }}
            style={{
              fontSize: '11px', padding: '3px 8px',
              borderRadius: 5, border: '1px solid #d1d5db',
              background: '#f9fafb', color: '#374151',
              cursor: 'pointer', fontWeight: 600,
              transition: 'all .15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background    = '#4f46e5';
              e.currentTarget.style.color         = '#fff';
              e.currentTarget.style.borderColor   = '#4f46e5';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background    = '#f9fafb';
              e.currentTarget.style.color         = '#374151';
              e.currentTarget.style.borderColor   = '#d1d5db';
            }}
          >
            {STATUS_NEXT_LABEL[task.status]}
          </button>
        </div>
      </div>

      {/* 卡片底部操作列 */}
      <div style={{
        display:       'flex',
        justifyContent: 'flex-end',
        gap:           6,
        padding:       '6px 10px',
        background:    '#fafafa',
        borderTop:     '1px solid #f3f4f6',
      }}>
        <button
          onClick={e => { e.stopPropagation(); onOpenEdit(task); }}
          title="編輯任務"
          style={{
            fontSize: '11px', padding: '3px 9px',
            borderRadius: 5, border: '1px solid #d1d5db',
            background: '#fff', color: '#374151',
            cursor: 'pointer', fontWeight: 500,
          }}
        >
          ✏️ 編輯
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(task); }}
          title="刪除任務"
          style={{
            fontSize: '11px', padding: '3px 9px',
            borderRadius: 5, border: '1px solid #fca5a5',
            background: '#fff', color: '#dc2626',
            cursor: 'pointer', fontWeight: 500,
          }}
        >
          🗑️ 刪除
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 看板欄位元件
// ════════════════════════════════════════════════════════════
function KanbanColumn({ col, tasks, onMoveNext, onOpenEdit, onAddTask, onDelete }) {
  return (
    <div style={{
      flex: '1 1 220px',
      minWidth: 220,
      background: '#f8fafc',
      borderRadius: '12px',
      padding: '12px 10px',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* 欄標題 */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12, padding: '0 4px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16 }}>{col.emoji}</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#374151' }}>{col.label}</span>
          <span style={{
            fontSize: '11px', fontWeight: 700,
            background: col.color, color: '#fff',
            padding: '1px 7px', borderRadius: '10px',
          }}>
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(col.id)}
          style={{
            width: 24, height: 24, borderRadius: 6,
            border: '1.5px dashed #d1d5db',
            background: 'transparent', cursor: 'pointer',
            fontSize: 16, color: '#9ca3af',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}
          title={`新增${col.label}任務`}
        >+</button>
      </div>

      {/* 任務卡片列表 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tasks.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '30px 10px',
            color: '#9ca3af', fontSize: '12px',
          }}>
            <div style={{ fontSize: 28, marginBottom: 6, opacity: .5 }}>{col.emoji}</div>
            <div>目前沒有任務</div>
          </div>
        ) : (
          tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onMoveNext={onMoveNext}
              onOpenEdit={onOpenEdit}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 新增任務對話框
// ════════════════════════════════════════════════════════════
function AddTaskModal({ defaultStatus, projects, users, onSave, onClose }) {
  const [form, setForm] = useState({
    title:       '',
    description: '',
    status:      defaultStatus || 'todo',
    priority:    'medium',
    projectId:   projects[0]?.id || '',
    assigneeId:  '',
    dueDate:     '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return alert('請輸入任務名稱');
    if (!form.projectId)    return alert('請選擇專案');
    setSaving(true);
    try {
      const res = await fetch(`${API}/${form.projectId}/tasks`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:       form.title.trim(),
          description: form.description,
          status:      form.status,
          priority:    form.priority,
          assigneeId:  form.assigneeId ? parseInt(form.assigneeId) : undefined,
          dueDate:     form.dueDate || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onSave();
    } catch (err) {
      alert('建立失敗：' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 14,
        width: 480, maxHeight: '80vh',
        overflow: 'auto', padding: 28,
        boxShadow: '0 20px 60px rgba(0,0,0,.25)',
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 20px', fontSize: '16px', color: '#111827' }}>✏️ 新增任務</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>任務名稱 *</label>
              <input style={inputStyle} placeholder="輸入任務名稱..." value={form.title}
                onChange={e => set('title', e.target.value)} autoFocus />
            </div>
            <div>
              <label style={labelStyle}>說明</label>
              <textarea style={{ ...inputStyle, height: 70, resize: 'vertical' }}
                placeholder="任務描述（選填）" value={form.description}
                onChange={e => set('description', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>所屬專案 *</label>
              <select style={inputStyle} value={form.projectId}
                onChange={e => set('projectId', e.target.value)}>
                <option value="">請選擇專案...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>初始狀態</label>
                <select style={inputStyle} value={form.status}
                  onChange={e => set('status', e.target.value)}>
                  {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>優先度</label>
                <select style={inputStyle} value={form.priority}
                  onChange={e => set('priority', e.target.value)}>
                  <option value="urgent">🔴 緊急</option>
                  <option value="high">🟠 高</option>
                  <option value="medium">🟡 中</option>
                  <option value="low">⚪ 低</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>指派給</label>
                <select style={inputStyle} value={form.assigneeId}
                  onChange={e => set('assigneeId', e.target.value)}>
                  <option value="">未指派</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>截止日期</label>
                <input type="date" style={inputStyle} value={form.dueDate}
                  onChange={e => set('dueDate', e.target.value)} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" onClick={onClose} style={{
              padding: '9px 18px', borderRadius: 8,
              border: '1px solid #d1d5db', background: '#fff',
              fontSize: '13px', cursor: 'pointer',
            }}>取消</button>
            <button type="submit" disabled={saving} style={{
              padding: '9px 18px', borderRadius: 8,
              border: 'none', background: '#4f46e5', color: '#fff',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              opacity: saving ? .7 : 1,
            }}>
              {saving ? '建立中...' : '✅ 建立任務'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 編輯任務對話框（含刪除按鈕）
// ════════════════════════════════════════════════════════════
function EditTaskModal({ task, users, onSave, onClose, onDeleteRequest }) {
  const [form, setForm] = useState({
    title:       task.title,
    description: task.description || '',
    status:      task.status,
    priority:    task.priority,
    assigneeId:  task.assignee?.id || '',
    dueDate:     task.dueDate ? task.dueDate.slice(0, 10) : '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API}/tasks/${task.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:       form.title.trim(),
          description: form.description,
          status:      form.status,
          priority:    form.priority,
          assigneeId:  form.assigneeId ? parseInt(form.assigneeId) : null,
          dueDate:     form.dueDate || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onSave();
    } catch (err) {
      alert('更新失敗：' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 14,
        width: 480, maxHeight: '85vh',
        overflow: 'auto', padding: 28,
        boxShadow: '0 20px 60px rgba(0,0,0,.25)',
      }} onClick={e => e.stopPropagation()}>

        {/* Modal 標題列：含刪除按鈕 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#7c3aed', marginBottom: 4 }}>
              📁 {task.project?.name}
            </div>
            <h2 style={{ margin: 0, fontSize: '16px', color: '#111827' }}>✏️ 編輯任務</h2>
          </div>
          <button
            type="button"
            onClick={() => { onClose(); onDeleteRequest(task); }}
            title="刪除此任務"
            style={{
              padding:      '5px 12px',
              border:       '1px solid #fca5a5',
              borderRadius: 6,
              background:   '#fff',
              color:        '#dc2626',
              fontSize:     '12px',
              fontWeight:   600,
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              gap:          4,
              flexShrink:   0,
            }}
          >
            🗑️ 刪除任務
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>任務名稱</label>
              <input style={inputStyle} value={form.title}
                onChange={e => set('title', e.target.value)} required autoFocus />
            </div>
            <div>
              <label style={labelStyle}>說明</label>
              <textarea style={{ ...inputStyle, height: 80, resize: 'vertical' }}
                value={form.description}
                onChange={e => set('description', e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>狀態</label>
                <select style={inputStyle} value={form.status}
                  onChange={e => set('status', e.target.value)}>
                  {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>優先度</label>
                <select style={inputStyle} value={form.priority}
                  onChange={e => set('priority', e.target.value)}>
                  <option value="urgent">🔴 緊急</option>
                  <option value="high">🟠 高</option>
                  <option value="medium">🟡 中</option>
                  <option value="low">⚪ 低</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>指派給</label>
                <select style={inputStyle} value={form.assigneeId}
                  onChange={e => set('assigneeId', e.target.value)}>
                  <option value="">未指派</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>截止日期</label>
                <input type="date" style={inputStyle} value={form.dueDate}
                  onChange={e => set('dueDate', e.target.value)} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" onClick={onClose} style={{
              padding: '9px 18px', borderRadius: 8,
              border: '1px solid #d1d5db', background: '#fff',
              fontSize: '13px', cursor: 'pointer',
            }}>取消</button>
            <button type="submit" disabled={saving} style={{
              padding: '9px 18px', borderRadius: 8,
              border: 'none', background: '#4f46e5', color: '#fff',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              opacity: saving ? .7 : 1,
            }}>
              {saving ? '儲存中...' : '💾 儲存變更'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 刪除任務確認對話框
// ════════════════════════════════════════════════════════════
function DeleteTaskModal({ task, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState('');

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      const res  = await fetch(`${API}/tasks/${task.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '刪除失敗');
      onDeleted(task.id);
    } catch (e) {
      setError(e.message);
      setDeleting(false);
    }
  };

  const pri = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: 16,
        padding: 32, width: 420, maxWidth: '92vw',
        boxShadow: '0 20px 60px rgba(0,0,0,.25)',
        textAlign: 'center',
      }}>
        {/* 警示圖示 */}
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: '#fee2e2', margin: '0 auto 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26,
        }}>
          🗑️
        </div>

        <h2 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: '700', color: '#111827' }}>
          確認刪除任務？
        </h2>

        {/* 任務資訊卡 */}
        <div style={{
          background: '#f9fafb', border: '1px solid #e5e7eb',
          borderRadius: 10, padding: '12px 16px',
          margin: '12px 0 16px', textAlign: 'left',
        }}>
          <div style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 600, marginBottom: 4 }}>
            📁 {task.project?.name || '未知專案'}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: 6 }}>
            {task.title}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '11px', padding: '2px 7px', borderRadius: 4,
              background: pri.bg, color: pri.color, fontWeight: 600,
            }}>
              {pri.label}
            </span>
            {task.assignee && (
              <span style={{ fontSize: '11px', color: '#6b7280' }}>
                👤 {task.assignee.name}
              </span>
            )}
          </div>
        </div>

        <p style={{ margin: '0 0 18px', fontSize: '13px', color: '#9ca3af' }}>
          此操作為軟刪除，資料不會永久消失。
        </p>

        {error && (
          <div style={{
            background: '#fee2e2', color: '#b91c1c',
            borderRadius: 8, padding: '8px 12px',
            fontSize: '12px', marginBottom: 14,
          }}>
            ❌ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onClose} disabled={deleting} style={{
            padding: '9px 20px', borderRadius: 8,
            border: '1px solid #d1d5db', background: '#fff',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}>
            取消
          </button>
          <button onClick={handleDelete} disabled={deleting} style={{
            padding: '9px 20px', borderRadius: 8,
            border: 'none', background: deleting ? '#fca5a5' : '#ef4444',
            color: '#fff', fontSize: '13px', fontWeight: 600,
            cursor: deleting ? 'not-allowed' : 'pointer',
          }}>
            {deleting ? '刪除中...' : '確認刪除'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 任務看板主頁面
// ════════════════════════════════════════════════════════════
export default function TaskKanbanPage() {
  const [kanban,     setKanban]     = useState({ todo: [], in_progress: [], review: [], done: [] });
  const [projects,   setProjects]   = useState([]);
  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  // 篩選器
  const [filterProject,  setFilterProject]  = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  // 對話框狀態
  const [addModal,    setAddModal]    = useState(null);   // null | status string
  const [editTask,    setEditTask]    = useState(null);   // null | task object
  const [deleteTask,  setDeleteTask]  = useState(null);   // null | task object（待刪除）

  // Toast 提示
  const [toast, setToast] = useState('');
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // ── 資料載入 ─────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ companyId: 2 });
      if (filterProject)  params.set('projectId',  filterProject);
      if (filterAssignee) params.set('assigneeId', filterAssignee);
      if (filterPriority) params.set('priority',   filterPriority);

      const [tasksRes, usersRes] = await Promise.all([
        fetch(`${API}/tasks?${params}`),
        fetch(`${API}/users?companyId=2`),
      ]);
      const tasksData = await tasksRes.json();
      const usersData = await usersRes.json();

      if (!tasksData.success) throw new Error(tasksData.error);
      setKanban(tasksData.data.kanban);
      setProjects(tasksData.data.projects || []);
      setUsers(usersData.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterProject, filterAssignee, filterPriority]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── 任務移到下一個狀態 ───────────────────────────────────
  const handleMoveNext = async (task) => {
    const nextStatus = STATUS_NEXT[task.status];
    try {
      const res = await fetch(`${API}/tasks/${task.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      fetchData();
    } catch (e) {
      alert('狀態更新失敗：' + e.message);
    }
  };

  // ── 刪除成功後就地移除，不需完整重載 ───────────────────
  const handleDeleted = (taskId) => {
    setDeleteTask(null);
    setKanban(prev => {
      const next = { ...prev };
      for (const col of Object.keys(next)) {
        next[col] = next[col].filter(t => t.id !== taskId);
      }
      return next;
    });
    showToast('🗑️ 任務已刪除');
  };

  // ── 統計數字 ─────────────────────────────────────────────
  const totalTasks  = COLUMNS.reduce((s, c) => s + (kanban[c.id]?.length || 0), 0);
  const doneTasks   = kanban.done?.length || 0;
  const completion  = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const overdueTasks = [...(kanban.todo || []), ...(kanban.in_progress || []), ...(kanban.review || [])]
    .filter(t => t.dueDate && new Date(t.dueDate) < new Date()).length;

  const hasFilter = filterProject || filterAssignee || filterPriority;

  // ── 渲染 ─────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f1f5f9' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          background: '#1e293b', color: '#fff',
          padding: '12px 20px', borderRadius: 10,
          fontSize: 14, fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,.3)',
          animation: 'fadeIn .2s ease',
        }}>
          {toast}
        </div>
      )}

      {/* ── 頁面標題列 ─────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#111827' }}>
              📋 任務看板
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#6b7280' }}>
              跨專案任務總覽 — 點擊按鈕切換狀態，點擊卡片編輯
            </p>
          </div>
          <button
            onClick={() => setAddModal('todo')}
            style={{
              padding: '9px 18px', borderRadius: 8,
              border: 'none', background: '#4f46e5', color: '#fff',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            + 新增任務
          </button>
        </div>

        {/* 統計卡片 */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { label: '總任務',  value: totalTasks,   color: '#6366f1', bg: '#eef2ff' },
            { label: '完成率',  value: `${completion}%`, color: '#10b981', bg: '#d1fae5' },
            { label: '已完成',  value: doneTasks,    color: '#10b981', bg: '#d1fae5' },
            { label: '⚠️ 逾期', value: overdueTasks, color: '#dc2626', bg: '#fee2e2' },
          ].map(stat => (
            <div key={stat.label} style={{
              background: stat.bg, borderRadius: 8,
              padding: '8px 14px', minWidth: 80, textAlign: 'center',
            }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: 1 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 篩選列 ────────────────────────────────────── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e5e7eb',
        padding: '10px 24px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>篩選：</span>

        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          style={{ fontSize: '12px', padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}>
          <option value="">所有專案</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
          style={{ fontSize: '12px', padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}>
          <option value="">所有成員</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>

        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          style={{ fontSize: '12px', padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}>
          <option value="">所有優先度</option>
          <option value="urgent">🔴 緊急</option>
          <option value="high">🟠 高</option>
          <option value="medium">🟡 中</option>
          <option value="low">⚪ 低</option>
        </select>

        {hasFilter && (
          <button
            onClick={() => { setFilterProject(''); setFilterAssignee(''); setFilterPriority(''); }}
            style={{
              fontSize: '12px', padding: '5px 10px', borderRadius: 6,
              border: '1px solid #f87171', background: '#fef2f2', color: '#dc2626',
              cursor: 'pointer',
            }}
          >✕ 清除篩選</button>
        )}

        <button
          onClick={fetchData}
          style={{
            fontSize: '12px', padding: '5px 10px', borderRadius: 6,
            border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151',
            cursor: 'pointer', marginLeft: 'auto',
          }}
        >
          {loading ? '載入中...' : '🔄 重新整理'}
        </button>
      </div>

      {/* ── 看板主體 ──────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {error ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#dc2626' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
            <div style={{ fontSize: '15px', marginBottom: 16 }}>{error}</div>
            <button onClick={fetchData} style={{
              padding: '9px 18px', borderRadius: 8,
              border: '1px solid #d1d5db', background: '#fff',
              cursor: 'pointer', fontSize: '13px',
            }}>重試</button>
          </div>
        ) : loading ? (
          <div style={{ display: 'flex', gap: 14, height: 300 }}>
            {COLUMNS.map(col => (
              <div key={col.id} style={{
                flex: 1, background: '#f8fafc', borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ color: '#9ca3af', fontSize: '13px' }}>載入中...</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 14, minHeight: 'calc(100vh - 280px)' }}>
            {COLUMNS.map(col => (
              <KanbanColumn
                key={col.id}
                col={col}
                tasks={kanban[col.id] || []}
                onMoveNext={handleMoveNext}
                onOpenEdit={setEditTask}
                onAddTask={(status) => setAddModal(status)}
                onDelete={setDeleteTask}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────── */}
      {addModal && (
        <AddTaskModal
          defaultStatus={addModal}
          projects={projects}
          users={users}
          onSave={() => { setAddModal(null); fetchData(); showToast('✅ 任務已建立'); }}
          onClose={() => setAddModal(null)}
        />
      )}
      {editTask && (
        <EditTaskModal
          task={editTask}
          users={users}
          onSave={() => { setEditTask(null); fetchData(); showToast('✅ 任務已更新'); }}
          onClose={() => setEditTask(null)}
          onDeleteRequest={(task) => setDeleteTask(task)}
        />
      )}
      {deleteTask && (
        <DeleteTaskModal
          task={deleteTask}
          onClose={() => setDeleteTask(null)}
          onDeleted={handleDeleted}
        />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
