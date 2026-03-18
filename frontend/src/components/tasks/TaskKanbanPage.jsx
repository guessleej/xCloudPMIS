/**
 * TaskKanbanPage.jsx
 * 跨專案任務看板 — Asana 風格側邊面板 + 6大協作功能
 *
 * API：
 *   GET    /api/projects/tasks          取得所有任務（含看板分組）
 *   POST   /api/projects/:id/tasks      新增任務
 *   PATCH  /api/projects/tasks/:taskId  更新任務
 *   DELETE /api/projects/tasks/:taskId  軟刪除任務
 *   GET    /api/team?companyId=2        取得團隊成員
 *
 * Side Panel 功能：
 *   - 基本欄位（指派人、截止日、優先度、狀態）
 *   - Multi-homing（多專案）
 *   - Custom Fields（自訂欄位）
 *   - Dependencies（任務依賴）
 *   - RealtimeEditor（協作說明）
 *   - @mention 留言系統
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import RealtimeEditor from '../RealtimeEditor';
import { useAuth } from '../../context/AuthContext';

// ── 常數 ─────────────────────────────────────────────────────
const API      = '/api/projects';
// TEAM_API & CURRENT_USER 改由 useAuth() 動態提供，不再硬編碼

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

// Avatar colour palette (deterministic from name)
const AVATAR_COLORS = ['#818cf8','#f472b6','#34d399','#fb923c','#60a5fa','#a78bfa','#4ade80','#f87171'];
function avatarColor(name) {
  if (!name) return '#818cf8';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ── 共用樣式 ─────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '7px 10px',
  border: '1px solid #d1d5db', borderRadius: 6,
  fontSize: '13px', boxSizing: 'border-box',
  outline: 'none', background: '#fff',
};
const labelStyle = {
  fontSize: '12px', fontWeight: 600,
  color: '#374151', marginBottom: 4, display: 'block',
};
const sectionHeaderStyle = {
  fontSize: '10px', fontWeight: 700,
  color: '#94a3b8', letterSpacing: '0.08em',
  textTransform: 'uppercase', margin: '0 0 10px',
};
const dividerStyle = { borderTop: '1px solid #F1F5F9', margin: '18px 0' };

// ── 工具函式 ─────────────────────────────────────────────────
function daysLeft(dueDate) {
  if (!dueDate) return null;
  return Math.ceil((new Date(dueDate) - new Date()) / 86400000);
}
function avatarChar(name) { return name ? name.charAt(0).toUpperCase() : '?'; }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// LocalStorage helpers
function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ════════════════════════════════════════════════════════════
// Avatar 圓圈
// ════════════════════════════════════════════════════════════
function Avatar({ name, size = 22 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: avatarColor(name), color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.5, fontWeight: 700, flexShrink: 0,
    }}>
      {avatarChar(name)}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 任務卡片元件（含指標徽章）
// ════════════════════════════════════════════════════════════
function TaskCard({ task, allTasks, onMoveNext, onOpenPanel }) {
  const pri      = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;
  const days     = daysLeft(task.dueDate);
  const isOverdue = days !== null && days < 0 && task.status !== 'done';

  // Read local indicators
  const deps     = lsGet(`xcloud-deps-${task.id}`, { blocking: [], waitingOn: [] });
  const comments = lsGet(`xcloud-comments-${task.id}`, []);
  const depCount = (deps.blocking?.length || 0) + (deps.waitingOn?.length || 0);
  const mentionCount = comments.reduce((s, c) => s + (c.mentions?.length || 0), 0);

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
        cursor:       'pointer',
      }}
      onClick={() => onOpenPanel(task)}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.15)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.08)'}
    >
      <div style={{ padding: '12px 14px' }}>
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
                ? `⚠️ 逾期 ${Math.abs(days)} 天`
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
                fontSize: '10px', padding: '1px 5px', borderRadius: 3,
                background: tag.color || '#e5e7eb', color: '#374151', fontWeight: 500,
              }}>
                #{tag.name}
              </span>
            ))}
          </div>
        )}

        {/* 底部列：指派人 + 指標 + 移動按鈕 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {task.assignee ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Avatar name={task.assignee.name} size={20} />
                <span style={{ fontSize: '11px', color: '#6b7280' }}>{task.assignee.name}</span>
              </div>
            ) : (
              <span style={{ fontSize: '11px', color: '#9ca3af' }}>未指派</span>
            )}

            {/* 指標徽章 */}
            {depCount > 0 && (
              <span style={{
                fontSize: '10px', padding: '1px 5px', borderRadius: 4,
                background: '#FEF2F2', color: '#EF4444', fontWeight: 600,
              }} title="依賴關係">
                ⛓ {depCount}
              </span>
            )}
            {mentionCount > 0 && (
              <span style={{
                fontSize: '10px', padding: '1px 5px', borderRadius: 4,
                background: '#EFF6FF', color: '#2563EB', fontWeight: 600,
              }} title="提及">
                @ {mentionCount}
              </span>
            )}
          </div>

          <button
            onClick={e => { e.stopPropagation(); onMoveNext(task); }}
            style={{
              fontSize: '11px', padding: '3px 8px',
              borderRadius: 5, border: '1px solid #d1d5db',
              background: '#f9fafb', color: '#374151',
              cursor: 'pointer', fontWeight: 600,
              transition: 'all .15s', flexShrink: 0,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background  = '#4f46e5';
              e.currentTarget.style.color       = '#fff';
              e.currentTarget.style.borderColor = '#4f46e5';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background  = '#f9fafb';
              e.currentTarget.style.color       = '#374151';
              e.currentTarget.style.borderColor = '#d1d5db';
            }}
          >
            {STATUS_NEXT_LABEL[task.status]}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 看板欄位
// ════════════════════════════════════════════════════════════
function KanbanColumn({ col, tasks, allTasks, onMoveNext, onOpenPanel, onAddTask }) {
  return (
    <div style={{
      flex: '1 1 220px', minWidth: 220,
      background: '#f8fafc', borderRadius: '12px',
      padding: '12px 10px', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
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
          }}
          title={`新增${col.label}任務`}
        >+</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 10px', color: '#9ca3af', fontSize: '12px' }}>
            <div style={{ fontSize: 28, marginBottom: 6, opacity: .5 }}>{col.emoji}</div>
            <div>目前沒有任務</div>
          </div>
        ) : (
          tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              allTasks={allTasks}
              onMoveNext={onMoveNext}
              onOpenPanel={onOpenPanel}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 新增任務對話框（保持置中 modal）
// ════════════════════════════════════════════════════════════
function AddTaskModal({ defaultStatus, projects, users, onSave, onClose }) {
  const [form, setForm] = useState({
    title: '', description: '',
    status: defaultStatus || 'todo', priority: 'medium',
    projectId: projects[0]?.id || '', assigneeId: '', dueDate: '',
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:      form.title.trim(),
          description: form.description,
          status:     form.status,
          priority:   form.priority,
          assigneeId: form.assigneeId ? parseInt(form.assigneeId) : undefined,
          dueDate:    form.dueDate || undefined,
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
      zIndex: 1200,
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
// 刪除確認 Modal
// ════════════════════════════════════════════════════════════
function DeleteConfirmModal({ task, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState('');

  const handleDelete = async () => {
    setDeleting(true); setError('');
    try {
      const res  = await fetch(`${API}/tasks/${task.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '刪除失敗');
      onDeleted(task.id);
    } catch (e) {
      setError(e.message); setDeleting(false);
    }
  };

  const pri = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1300,
      background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 32,
        width: 420, maxWidth: '92vw',
        boxShadow: '0 20px 60px rgba(0,0,0,.25)', textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: '#fee2e2', margin: '0 auto 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
        }}>🗑️</div>
        <h2 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 700, color: '#111827' }}>
          確認刪除任務？
        </h2>
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
          <span style={{
            fontSize: '11px', padding: '2px 7px', borderRadius: 4,
            background: pri.bg, color: pri.color, fontWeight: 600,
          }}>
            {pri.label}
          </span>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: '13px', color: '#9ca3af' }}>
          此操作為軟刪除，資料不會永久消失。
        </p>
        {error && (
          <div style={{
            background: '#fee2e2', color: '#b91c1c',
            borderRadius: 8, padding: '8px 12px',
            fontSize: '12px', marginBottom: 14,
          }}>❌ {error}</div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onClose} disabled={deleting} style={{
            padding: '9px 20px', borderRadius: 8,
            border: '1px solid #d1d5db', background: '#fff',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}>取消</button>
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
// 任務詳情側邊面板 (Asana 風格)
// ════════════════════════════════════════════════════════════
function TaskSidePanel({ task, users, projects, allTasks, onClose, onSaved, onDeleteRequest, companyId, currentUser }) {
  // ── 基本欄位狀態 ─────────────────────────────────────────
  const [title,      setTitle]      = useState(task.title);
  const [status,     setStatus]     = useState(task.status);
  const [priority,   setPriority]   = useState(task.priority);
  const [assigneeId, setAssigneeId] = useState(task.assignee?.id || '');
  const [dueDate,    setDueDate]    = useState(task.dueDate ? task.dueDate.slice(0, 10) : '');
  const [saving,     setSaving]     = useState(false);

  // ── Multi-homing（多專案） ─────────────────────────────
  const [extraProjects, setExtraProjects] = useState(
    lsGet(`xcloud-multihome-${task.id}`, [])
  );
  const [showAddProject, setShowAddProject] = useState(false);

  // ── Custom Fields ────────────────────────────────────────
  const customFieldDefs = lsGet('xcloud-custom-fields', []).slice(0, 4);
  const [fieldValues,  setFieldValues]  = useState(
    lsGet(`xcloud-task-fields-${task.id}`, {})
  );
  const [editingField, setEditingField] = useState(null);

  // ── Dependencies ─────────────────────────────────────────
  const [deps, setDeps] = useState(
    lsGet(`xcloud-deps-${task.id}`, { blocking: [], waitingOn: [] })
  );
  const [showAddDep,  setShowAddDep]  = useState(null); // 'blocking' | 'waitingOn' | null
  const [addDepId,    setAddDepId]    = useState('');

  // ── Team members (for @mention) ──────────────────────────
  const [teamMembers, setTeamMembers] = useState([]);

  // ── Comments & @mention ──────────────────────────────────
  const [comments,      setComments]      = useState(lsGet(`xcloud-comments-${task.id}`, []));
  const [commentText,   setCommentText]   = useState('');
  const [mentionQuery,  setMentionQuery]  = useState('');
  const [showMentionDD, setShowMentionDD] = useState(false);
  const [pendingMentions, setPendingMentions] = useState([]);
  const commentRef = useRef(null);

  // Fetch team members（使用動態 companyId，不硬編碼）
  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/projects/users?companyId=${companyId}`)
      .then(r => r.json())
      .then(d => { if (d.success || Array.isArray(d.data)) setTeamMembers(d.data || []); })
      .catch(() => {});
  }, [companyId]);

  // ── 儲存基本欄位 ─────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:      title.trim(),
          status,
          priority,
          assigneeId: assigneeId ? parseInt(assigneeId) : null,
          dueDate:    dueDate || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onSaved();
    } catch (err) {
      alert('更新失敗：' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Multi-homing helpers ──────────────────────────────────
  const addExtraProject = (pid) => {
    const proj = projects.find(p => String(p.id) === String(pid));
    if (!proj) return;
    if (extraProjects.some(p => p.id === proj.id)) return;
    const updated = [...extraProjects, { id: proj.id, name: proj.name }];
    setExtraProjects(updated);
    lsSet(`xcloud-multihome-${task.id}`, updated);
    setShowAddProject(false);
  };
  const removeExtraProject = (pid) => {
    const updated = extraProjects.filter(p => p.id !== pid);
    setExtraProjects(updated);
    lsSet(`xcloud-multihome-${task.id}`, updated);
  };

  // ── Custom field helpers ──────────────────────────────────
  const saveFieldValue = (fieldId, val) => {
    const updated = { ...fieldValues, [fieldId]: val };
    setFieldValues(updated);
    lsSet(`xcloud-task-fields-${task.id}`, updated);
    setEditingField(null);
  };

  // ── Dependency helpers ────────────────────────────────────
  const addDep = (type) => {
    const t = allTasks.find(t => String(t.id) === String(addDepId));
    if (!t) return;
    const updated = {
      ...deps,
      [type]: [...(deps[type] || []), { id: t.id, title: t.title }],
    };
    setDeps(updated);
    lsSet(`xcloud-deps-${task.id}`, updated);
    setAddDepId('');
    setShowAddDep(null);
  };
  const removeDep = (type, id) => {
    const updated = { ...deps, [type]: deps[type].filter(d => d.id !== id) };
    setDeps(updated);
    lsSet(`xcloud-deps-${task.id}`, updated);
  };

  // ── Comment helpers ──────────────────────────────────────
  const handleCommentChange = (e) => {
    const text = e.target.value;
    setCommentText(text);
    const lastAt = text.lastIndexOf('@');
    if (lastAt !== -1) {
      const query = text.slice(lastAt + 1);
      if (!query.includes(' ')) {
        setMentionQuery(query);
        setShowMentionDD(true);
        return;
      }
    }
    setShowMentionDD(false);
  };

  const insertMention = (member) => {
    const lastAt = commentText.lastIndexOf('@');
    const newText = commentText.slice(0, lastAt) + `@${member.name} `;
    setCommentText(newText);
    if (!pendingMentions.some(m => m.id === member.id)) {
      setPendingMentions(prev => [...prev, { id: member.id, name: member.name }]);
    }
    setShowMentionDD(false);
    commentRef.current?.focus();
  };

  const removePendingMention = (id) => {
    setPendingMentions(prev => prev.filter(m => m.id !== id));
  };

  const submitComment = () => {
    if (!commentText.trim()) return;
    const comment = {
      id:       genId(),
      author:   currentUser?.name || '我',
      text:     commentText.trim(),
      mentions: pendingMentions,
      ts:       new Date().toISOString(),
    };
    const updated = [...comments, comment];
    setComments(updated);
    lsSet(`xcloud-comments-${task.id}`, updated);
    setCommentText('');
    setPendingMentions([]);
    setShowMentionDD(false);
  };

  // Filter mention candidates
  const mentionCandidates = teamMembers.filter(m =>
    m.name?.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const currentProject = task.project;
  const allProjects    = [
    ...(currentProject ? [currentProject] : []),
    ...extraProjects.filter(ep => ep.id !== currentProject?.id),
  ];

  const availableTasksForDep = allTasks.filter(t => t.id !== task.id);

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,.25)',
          zIndex: 900,
        }}
        onClick={onClose}
      />

      {/* Side panel */}
      <div style={{
        position:   'fixed',
        top:        0,
        right:      0,
        bottom:     0,
        width:      520,
        background: '#fff',
        zIndex:     910,
        boxShadow:  '-4px 0 24px rgba(0,0,0,.12)',
        display:    'flex',
        flexDirection: 'column',
        animation:  'slideInRight .22s ease',
      }}>

        {/* ── 固定頭部 ───────────────────────────────────── */}
        <div style={{
          position:  'sticky', top: 0,
          background: '#fff',
          borderBottom: '1px solid #F1F5F9',
          padding:   '14px 20px',
          display:   'flex',
          alignItems: 'flex-start',
          gap:       10,
          zIndex:    1,
        }}>
          <div style={{ flex: 1 }}>
            {/* 專案 + 狀態徽章 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '11px', fontWeight: 600,
                background: '#ede9fe', color: '#7c3aed',
                padding: '2px 7px', borderRadius: 4,
              }}>
                📁 {task.project?.name || '未分類'}
              </span>
              <span style={{
                fontSize: '11px', fontWeight: 600,
                background: '#dbeafe', color: '#2563eb',
                padding: '2px 7px', borderRadius: 4,
              }}>
                {COLUMNS.find(c => c.id === status)?.emoji} {COLUMNS.find(c => c.id === status)?.label}
              </span>
            </div>

            {/* 可編輯標題 */}
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{
                width: '100%', fontSize: '17px', fontWeight: 700,
                color: '#111827', border: 'none', outline: 'none',
                background: 'transparent', padding: 0,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* 關閉按鈕 */}
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 6,
              border: '1px solid #e5e7eb', background: '#f9fafb',
              cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 16, color: '#6b7280', flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* ── 可捲動內容 ─────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>

          {/* ── DETAILS ──────────────────────────────────── */}
          <p style={sectionHeaderStyle}>DETAILS</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* 指派人 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '12px', color: '#6b7280', width: 70, flexShrink: 0 }}>指派給</span>
              <select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              >
                <option value="">未指派</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>

            {/* 截止日期 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '12px', color: '#6b7280', width: 70, flexShrink: 0 }}>截止日期</span>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>

            {/* 優先度 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '12px', color: '#6b7280', width: 70, flexShrink: 0 }}>優先度</span>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              >
                <option value="urgent">🔴 緊急</option>
                <option value="high">🟠 高</option>
                <option value="medium">🟡 中</option>
                <option value="low">⚪ 低</option>
              </select>
            </div>

            {/* 狀態 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '12px', color: '#6b7280', width: 70, flexShrink: 0 }}>狀態</span>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              >
                {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
          </div>

          {/* 儲存 + 刪除按鈕 */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 7,
                border: 'none', background: '#4f46e5', color: '#fff',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                opacity: saving ? .7 : 1,
              }}
            >
              {saving ? '儲存中...' : '💾 儲存變更'}
            </button>
            <button
              onClick={() => onDeleteRequest(task)}
              style={{
                padding: '8px 14px', borderRadius: 7,
                border: '1px solid #fca5a5', background: '#fff',
                color: '#dc2626', fontSize: '12px', fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🗑️ 刪除
            </button>
          </div>

          {/* ── MULTI-HOMING ─────────────────────────────── */}
          <div style={dividerStyle} />
          <p style={sectionHeaderStyle}>PROJECTS（多專案）</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {allProjects.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: '12px', fontWeight: 600,
                  background: '#ede9fe', color: '#7c3aed',
                  padding: '2px 8px', borderRadius: 4,
                }}>
                  📁 {p.name}
                </span>
                {p.id !== currentProject?.id && (
                  <button
                    onClick={() => removeExtraProject(p.id)}
                    style={{
                      border: 'none', background: 'none',
                      color: '#9ca3af', cursor: 'pointer', fontSize: 14,
                    }}
                  >✕</button>
                )}
              </div>
            ))}

            {showAddProject ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  style={{ ...inputStyle, flex: 1 }}
                  onChange={e => addExtraProject(e.target.value)}
                  defaultValue=""
                >
                  <option value="">選擇專案...</option>
                  {projects
                    .filter(p => !allProjects.some(ap => ap.id === p.id))
                    .map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                  }
                </select>
                <button
                  onClick={() => setShowAddProject(false)}
                  style={{
                    padding: '4px 10px', borderRadius: 6,
                    border: '1px solid #e5e7eb', background: '#fff',
                    cursor: 'pointer', fontSize: '12px',
                  }}
                >取消</button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddProject(true)}
                style={{
                  border: '1.5px dashed #d1d5db', background: 'transparent',
                  borderRadius: 6, padding: '5px 10px',
                  fontSize: '12px', color: '#6b7280',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                + 加入另一個專案
              </button>
            )}
          </div>

          {/* ── CUSTOM FIELDS ────────────────────────────── */}
          {customFieldDefs.length > 0 && (
            <>
              <div style={dividerStyle} />
              <p style={sectionHeaderStyle}>CUSTOM FIELDS</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {customFieldDefs.map(field => {
                  const val = fieldValues[field.id] ?? '';
                  const isEditing = editingField === field.id;
                  return (
                    <div
                      key={field.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '6px 8px', borderRadius: 6,
                        background: isEditing ? '#f8fafc' : 'transparent',
                        cursor: 'pointer',
                      }}
                      onClick={() => !isEditing && setEditingField(field.id)}
                    >
                      <span style={{ fontSize: '12px', color: '#6b7280', width: 90, flexShrink: 0 }}>
                        {field.name}
                      </span>
                      {isEditing ? (
                        <CustomFieldInput
                          field={field}
                          initialValue={val}
                          onSave={v => saveFieldValue(field.id, v)}
                          onCancel={() => setEditingField(null)}
                        />
                      ) : (
                        <span style={{ fontSize: '13px', color: val ? '#111827' : '#9ca3af' }}>
                          {val || '—'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── DEPENDENCIES ─────────────────────────────── */}
          <div style={dividerStyle} />
          <p style={sectionHeaderStyle}>DEPENDENCIES</p>

          {/* Blocking */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              封鎖其他任務 (Blocking)
            </div>
            {deps.blocking?.map(d => (
              <DepBadge key={d.id} label={d.title} type="blocking"
                onRemove={() => removeDep('blocking', d.id)} />
            ))}
            {showAddDep === 'blocking' ? (
              <DepAddRow
                tasks={availableTasksForDep}
                value={addDepId}
                onChange={setAddDepId}
                onAdd={() => addDep('blocking')}
                onCancel={() => setShowAddDep(null)}
              />
            ) : (
              <button onClick={() => setShowAddDep('blocking')} style={addDepBtnStyle}>
                + 新增封鎖關係
              </button>
            )}
          </div>

          {/* Waiting On */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              等待中 (Waiting on)
            </div>
            {deps.waitingOn?.map(d => (
              <DepBadge key={d.id} label={d.title} type="waitingOn"
                onRemove={() => removeDep('waitingOn', d.id)} />
            ))}
            {showAddDep === 'waitingOn' ? (
              <DepAddRow
                tasks={availableTasksForDep}
                value={addDepId}
                onChange={setAddDepId}
                onAdd={() => addDep('waitingOn')}
                onCancel={() => setShowAddDep(null)}
              />
            ) : (
              <button onClick={() => setShowAddDep('waitingOn')} style={addDepBtnStyle}>
                + 新增等待關係
              </button>
            )}
          </div>

          {/* ── DESCRIPTION / Realtime Editor ────────────── */}
          <div style={dividerStyle} />
          <p style={sectionHeaderStyle}>DESCRIPTION（協作編輯）</p>
          <div style={{ marginBottom: 4 }}>
            <span style={{
              fontSize: '10px', fontWeight: 600,
              background: '#ede9fe', color: '#7c3aed',
              padding: '2px 7px', borderRadius: 10,
            }}>
              🤝 即時協作
            </span>
            <span style={{ fontSize: '10px', color: '#9ca3af', marginLeft: 6 }}>
              支援多人同時編輯・自動儲存
            </span>
          </div>
          <RealtimeEditor
            taskId={task.id}
            user={currentUser || { id: 0, name: '我', color: '#4f46e5' }}
            placeholder="輸入任務描述⋯ 支援 Markdown，其他協作者的修改會即時顯示"
          />

          {/* ── MENTIONS & COMMENTS ───────────────────────── */}
          <div style={dividerStyle} />
          <p style={sectionHeaderStyle}>MENTIONS & COMMENTS</p>

          {/* Pending mention chips */}
          {pendingMentions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
              {pendingMentions.map(m => (
                <span
                  key={m.id}
                  style={{
                    fontSize: '12px', fontWeight: 600,
                    background: '#EFF6FF', color: '#2563EB',
                    padding: '2px 8px', borderRadius: 4,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  @{m.name}
                  <span
                    onClick={() => removePendingMention(m.id)}
                    style={{ cursor: 'pointer', opacity: .7 }}
                  >✕</span>
                </span>
              ))}
            </div>
          )}

          {/* Comment textarea with @mention */}
          <div style={{ position: 'relative' }}>
            <textarea
              ref={commentRef}
              value={commentText}
              onChange={handleCommentChange}
              placeholder="留言或 @提及團隊成員..."
              rows={3}
              style={{
                ...inputStyle,
                resize: 'vertical', minHeight: 72,
              }}
            />
            {/* Mention dropdown */}
            {showMentionDD && mentionCandidates.length > 0 && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 0,
                background: '#fff', border: '1px solid #e5e7eb',
                borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)',
                zIndex: 20, minWidth: 200, maxHeight: 180, overflowY: 'auto',
              }}>
                {mentionCandidates.map(m => (
                  <div
                    key={m.id}
                    onClick={() => insertMention(m)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', cursor: 'pointer',
                      fontSize: '13px',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Avatar name={m.name} size={22} />
                    <span>{m.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={submitComment}
            disabled={!commentText.trim()}
            style={{
              marginTop: 8, padding: '7px 16px', borderRadius: 7,
              border: 'none', background: '#4f46e5', color: '#fff',
              fontSize: '12px', fontWeight: 600,
              cursor: commentText.trim() ? 'pointer' : 'not-allowed',
              opacity: commentText.trim() ? 1 : .5,
            }}
          >
            傳送留言
          </button>

          {/* Comment list */}
          {comments.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {comments.map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                  <Avatar name={c.author} size={28} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#111827' }}>{c.author}</span>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                        {new Date(c.ts).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{
                      fontSize: '13px', color: '#374151',
                      background: '#f8fafc', borderRadius: 8,
                      padding: '8px 10px', lineHeight: 1.5,
                    }}>
                      {c.text}
                    </div>
                    {c.mentions?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {c.mentions.map((m, i) => (
                          <span key={i} style={{
                            fontSize: '11px', fontWeight: 600,
                            background: '#EFF6FF', color: '#2563EB',
                            padding: '1px 6px', borderRadius: 4,
                          }}>@{m.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 底部間距 */}
          <div style={{ height: 32 }} />
        </div>
      </div>
    </>
  );
}

// ── 相依關係 Badge ────────────────────────────────────────────
function DepBadge({ label, type, onRemove }) {
  const isBlocking = type === 'blocking';
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: isBlocking ? '#FEF2F2' : '#FFFBEB',
      border: `1px solid ${isBlocking ? '#FECACA' : '#FDE68A'}`,
      borderRadius: 5, padding: '3px 8px',
      fontSize: '12px', color: isBlocking ? '#EF4444' : '#F59E0B',
      fontWeight: 600, marginRight: 6, marginBottom: 6,
    }}>
      {isBlocking ? '⛓' : '⏳'} {label}
      <span
        onClick={onRemove}
        style={{ cursor: 'pointer', opacity: .7, marginLeft: 2, fontSize: 13 }}
      >✕</span>
    </div>
  );
}

const addDepBtnStyle = {
  border: '1.5px dashed #d1d5db', background: 'transparent',
  borderRadius: 6, padding: '4px 10px',
  fontSize: '12px', color: '#6b7280',
  cursor: 'pointer', marginBottom: 6,
};

function DepAddRow({ tasks, value, onChange, onAdd, onCancel }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
      <select
        style={{ ...inputStyle, flex: 1 }}
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">選擇任務...</option>
        {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
      </select>
      <button
        onClick={onAdd}
        disabled={!value}
        style={{
          padding: '5px 10px', borderRadius: 6,
          border: 'none', background: '#4f46e5', color: '#fff',
          fontSize: '12px', cursor: value ? 'pointer' : 'not-allowed',
          opacity: value ? 1 : .5,
        }}
      >加入</button>
      <button
        onClick={onCancel}
        style={{
          padding: '5px 10px', borderRadius: 6,
          border: '1px solid #e5e7eb', background: '#fff',
          fontSize: '12px', cursor: 'pointer',
        }}
      >取消</button>
    </div>
  );
}

// ── 自訂欄位輸入元件 ──────────────────────────────────────────
function CustomFieldInput({ field, initialValue, onSave, onCancel }) {
  const [val, setVal] = useState(initialValue);
  const type = field.type || 'text';

  if (type === 'select') {
    return (
      <div style={{ display: 'flex', gap: 5, flex: 1 }}>
        <select style={{ ...inputStyle, flex: 1 }} value={val} onChange={e => setVal(e.target.value)}>
          <option value="">— 選擇 —</option>
          {(field.options || []).map((o, i) => <option key={i} value={o}>{o}</option>)}
        </select>
        <button onClick={() => onSave(val)} style={cfSaveBtn}>✓</button>
        <button onClick={onCancel} style={cfCancelBtn}>✕</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 5, flex: 1 }}>
      <input
        autoFocus
        type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
        style={{ ...inputStyle, flex: 1 }}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(val); if (e.key === 'Escape') onCancel(); }}
      />
      <button onClick={() => onSave(val)} style={cfSaveBtn}>✓</button>
      <button onClick={onCancel} style={cfCancelBtn}>✕</button>
    </div>
  );
}

const cfSaveBtn = {
  padding: '4px 8px', borderRadius: 5, border: 'none',
  background: '#4f46e5', color: '#fff', cursor: 'pointer', fontSize: 13,
};
const cfCancelBtn = {
  padding: '4px 8px', borderRadius: 5, border: '1px solid #e5e7eb',
  background: '#fff', cursor: 'pointer', fontSize: 13,
};

// ════════════════════════════════════════════════════════════
// 任務看板主頁面
// ════════════════════════════════════════════════════════════
export default function TaskKanbanPage() {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const currentUser = user
    ? { id: user.id, name: user.name || '我', color: '#4f46e5' }
    : { id: 0, name: '我', color: '#4f46e5' };

  const [kanban,   setKanban]   = useState({ todo: [], in_progress: [], review: [], done: [] });
  const [projects, setProjects] = useState([]);
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  // 篩選器
  const [filterProject,  setFilterProject]  = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  // UI 狀態
  const [addModal,   setAddModal]   = useState(null);  // null | status string
  const [panelTask,  setPanelTask]  = useState(null);  // null | task (side panel)
  const [deleteTask, setDeleteTask] = useState(null);  // null | task

  // Toast
  const [toast, setToast] = useState('');
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // ── 資料載入 ─────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ companyId });
      if (filterProject)  params.set('projectId',  filterProject);
      if (filterAssignee) params.set('assigneeId', filterAssignee);
      if (filterPriority) params.set('priority',   filterPriority);

      const [tasksRes, usersRes] = await Promise.all([
        fetch(`${API}/tasks?${params}`),
        fetch(`${API}/users?companyId=${companyId}`),
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
  }, [companyId, filterProject, filterAssignee, filterPriority]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── 移到下一狀態 ─────────────────────────────────────────
  const handleMoveNext = async (task) => {
    const nextStatus = STATUS_NEXT[task.status];
    try {
      const res = await fetch(`${API}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      fetchData();
    } catch (e) {
      alert('狀態更新失敗：' + e.message);
    }
  };

  // ── 刪除成功 ─────────────────────────────────────────────
  const handleDeleted = (taskId) => {
    setDeleteTask(null);
    setPanelTask(null);
    setKanban(prev => {
      const next = { ...prev };
      for (const col of Object.keys(next)) {
        next[col] = next[col].filter(t => t.id !== taskId);
      }
      return next;
    });
    showToast('🗑️ 任務已刪除');
  };

  // ── 取得所有任務（扁平列表）供 dependency picker 使用 ───
  const allTasks = COLUMNS.flatMap(c => kanban[c.id] || []);

  // ── 統計 ─────────────────────────────────────────────────
  const totalTasks   = COLUMNS.reduce((s, c) => s + (kanban[c.id]?.length || 0), 0);
  const doneTasks    = kanban.done?.length || 0;
  const completion   = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
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

      {/* ── 頁面標題列 ──────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#111827' }}>
              📋 任務看板
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#6b7280' }}>
              跨專案任務總覽 — 點擊卡片開啟詳情面板
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
            { label: '總任務',  value: totalTasks,        color: '#6366f1', bg: '#eef2ff' },
            { label: '完成率',  value: `${completion}%`,  color: '#10b981', bg: '#d1fae5' },
            { label: '已完成',  value: doneTasks,          color: '#10b981', bg: '#d1fae5' },
            { label: '⚠️ 逾期', value: overdueTasks,      color: '#dc2626', bg: '#fee2e2' },
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

      {/* ── 篩選列 ──────────────────────────────────────── */}
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
                allTasks={allTasks}
                onMoveNext={handleMoveNext}
                onOpenPanel={setPanelTask}
                onAddTask={(status) => setAddModal(status)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Side Panel ────────────────────────────────── */}
      {panelTask && (
        <TaskSidePanel
          key={panelTask.id}
          task={panelTask}
          users={users}
          projects={projects}
          allTasks={allTasks}
          onClose={() => setPanelTask(null)}
          onSaved={() => { fetchData(); showToast('✅ 任務已更新'); }}
          onDeleteRequest={(task) => { setPanelTask(null); setDeleteTask(task); }}
          companyId={companyId}
          currentUser={currentUser}
        />
      )}

      {/* ── Add Task Modal ────────────────────────────── */}
      {addModal && (
        <AddTaskModal
          defaultStatus={addModal}
          projects={projects}
          users={users}
          onSave={() => { setAddModal(null); fetchData(); showToast('✅ 任務已建立'); }}
          onClose={() => setAddModal(null)}
        />
      )}

      {/* ── Delete Confirm Modal ──────────────────────── */}
      {deleteTask && (
        <DeleteConfirmModal
          task={deleteTask}
          onClose={() => setDeleteTask(null)}
          onDeleted={handleDeleted}
        />
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
