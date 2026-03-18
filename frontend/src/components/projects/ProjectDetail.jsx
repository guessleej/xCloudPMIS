/**
 * ProjectDetail — 專案詳情頁（任務看板）
 *
 * 功能：
 *   - 看板式任務管理（待辦 / 進行中 / 審核 / 完成）
 *   - 新增任務對話框
 *   - 任務狀態一鍵更新
 *   - 顯示里程碑、進度統計
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

// API 使用相對路徑，由 Vite proxy 轉發到後端（見 vite.config.js）
const API = '';

// ── 看板欄位定義 ────────────────────────────────────────────
const COLUMNS = [
  { key: 'todo',        label: '📋 待辦',   color: '#6b7280', bg: '#f9fafb' },
  { key: 'in_progress', label: '🔄 進行中', color: '#2563eb', bg: '#eff6ff' },
  { key: 'review',      label: '🔍 審核中', color: '#d97706', bg: '#fffbeb' },
  { key: 'done',        label: '✅ 已完成', color: '#16a34a', bg: '#f0fdf4' },
];

const PRIORITY_STYLE = {
  urgent: { label: '緊急', color: '#b91c1c', bg: '#fee2e2' },
  high:   { label: '高',   color: '#c2410c', bg: '#ffedd5' },
  medium: { label: '中',   color: '#a16207', bg: '#fef9c3' },
  low:    { label: '低',   color: '#4b5563', bg: '#f3f4f6' },
};

// ── 任務卡片 ────────────────────────────────────────────────
function TaskCard({ task, onStatusChange }) {
  const pStyle = PRIORITY_STYLE[task.priority] || PRIORITY_STYLE.medium;
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done';

  return (
    <div style={{
      background:   'white',
      border:       '1px solid #e5e7eb',
      borderRadius: '10px',
      padding:      '14px',
      marginBottom: '8px',
      boxShadow:    '0 1px 2px rgba(0,0,0,0.04)',
    }}>
      {/* 優先度 badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{
          background:   pStyle.bg,
          color:        pStyle.color,
          borderRadius: '4px',
          padding:      '1px 7px',
          fontSize:     '11px',
          fontWeight:   '700',
        }}>
          {pStyle.label}
        </span>
        {task.tags?.length > 0 && (
          <div style={{ display: 'flex', gap: '4px' }}>
            {task.tags.slice(0, 2).map(tag => (
              <span key={tag.id} style={{
                background:   tag.color + '22',
                color:        tag.color,
                borderRadius: '4px',
                padding:      '1px 6px',
                fontSize:     '11px',
                fontWeight:   '600',
              }}>
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 任務標題 */}
      <p style={{
        margin:       '0 0 10px',
        fontSize:     '14px',
        fontWeight:   '600',
        color:        task.status === 'done' ? '#9ca3af' : '#111827',
        lineHeight:   '1.4',
        textDecoration: task.status === 'done' ? 'line-through' : 'none',
      }}>
        {task.title}
      </p>

      {/* 底部：日期 + 指派人 + 快速切換狀態 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {task.dueDate && (
            <span style={{ color: isOverdue ? '#ef4444' : '#9ca3af', fontWeight: isOverdue ? '600' : '400' }}>
              📅 {new Date(task.dueDate).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {task.assignee && (
            <span style={{ color: '#9ca3af' }}>👤 {task.assignee.name}</span>
          )}
        </div>

        {/* 快速移到下一個狀態 */}
        {task.status !== 'done' && (
          <button
            onClick={() => {
              const next = { todo: 'in_progress', in_progress: 'review', review: 'done' };
              onStatusChange(task.id, next[task.status]);
            }}
            style={{
              background:   'none',
              border:       '1px solid #d1d5db',
              borderRadius: '6px',
              padding:      '3px 8px',
              fontSize:     '11px',
              color:        '#6b7280',
              cursor:       'pointer',
            }}
          >
            → {COLUMNS.find(c => c.key === { todo: 'in_progress', in_progress: 'review', review: 'done' }[task.status])?.label}
          </button>
        )}
      </div>
    </div>
  );
}

// ── 新增任務對話框 ──────────────────────────────────────────
function AddTaskModal({ projectId, users, onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', priority: 'medium', dueDate: '', assigneeId: '', estimatedHours: '' });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('任務標題為必填'); return; }

    setSaving(true);
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/tasks`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onCreated(json.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    border: '1px solid #d1d5db', borderRadius: '8px',
    padding: '8px 12px', fontSize: '14px',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '460px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700' }}>➕ 新增任務</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>任務標題 *</label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="例如：設計登入頁面 UI"
              style={inputStyle}
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>優先度</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} style={inputStyle}>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
                <option value="urgent">緊急</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>指派給</label>
              <select value={form.assigneeId} onChange={e => set('assigneeId', e.target.value)} style={inputStyle}>
                <option value="">— 未指派 —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>截止日期</label>
              <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>預估工時（小時）</label>
              <input type="number" value={form.estimatedHours} onChange={e => set('estimatedHours', e.target.value)} placeholder="例如：8" style={inputStyle} />
            </div>
          </div>

          {error && (
            <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', padding: '10px', fontSize: '13px', marginTop: '12px' }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button type="button" onClick={onClose} style={{ background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px 20px', fontSize: '14px', cursor: 'pointer' }}>取消</button>
            <button type="submit" disabled={saving} style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? '新增中...' : '✅ 新增任務'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 主元件：ProjectDetail
// ════════════════════════════════════════════════════════════
export default function ProjectDetail({ projectId, projectName, onBack }) {
  const { user, authFetch } = useAuth();
  const companyId = user?.companyId;

  const [project,   setProject]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [showAdd,   setShowAdd]   = useState(false);
  const [users,     setUsers]     = useState([]);

  const loadProject = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/projects/${projectId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setProject(json.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // 載入可指派成員列表
  useEffect(() => {
    if (!companyId) return;
    fetch(`${API}/api/users?companyId=${companyId}`)
      .then(r => r.json())
      .then(d => setUsers(Array.isArray(d.data) ? d.data : []))
      .catch(() => {});
  }, [companyId]);

  useEffect(() => { loadProject(); }, [loadProject]);

  // 更新任務狀態
  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await fetch(`${API}/api/projects/tasks/${taskId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      });
      // 樂觀更新 UI
      setProject(prev => ({
        ...prev,
        kanban: Object.fromEntries(
          Object.entries(prev.kanban).map(([col, tasks]) => [
            col,
            col === newStatus
              ? [...tasks, prev.kanban[prev.kanban ? Object.keys(prev.kanban).find(c => prev.kanban[c].some(t => t.id === taskId)) : ''].find(t => t.id === taskId) || tasks[0]]
              : tasks.filter(t => t.id !== taskId),
          ])
        ),
      }));
      loadProject(); // 重新載入確保資料一致
    } catch (e) {
      alert('更新失敗：' + e.message);
    }
  };

  const handleTaskCreated = () => {
    setShowAdd(false);
    loadProject();
  };

  if (loading) return (
    <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>
      <div style={{ fontSize: '36px', marginBottom: '12px' }}>⏳</div>載入中...
    </div>
  );

  if (error) return (
    <div style={{ padding: '60px', textAlign: 'center', color: '#ef4444' }}>
      <div style={{ fontSize: '36px', marginBottom: '12px' }}>😢</div>
      {error}
      <br />
      <button onClick={onBack} style={{ marginTop: '16px', padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer' }}>
        返回列表
      </button>
    </div>
  );

  const { kanban, stats, milestones } = project;
  const STATUS_STYLE_MAP = {
    planning: { bg: '#dbeafe', color: '#1d4ed8' },
    active:   { bg: '#dcfce7', color: '#15803d' },
    on_hold:  { bg: '#fef9c3', color: '#a16207' },
    completed:{ bg: '#f3f4f6', color: '#4b5563' },
    cancelled:{ bg: '#fee2e2', color: '#b91c1c' },
  };
  const sstyle = STATUS_STYLE_MAP[project.status] || STATUS_STYLE_MAP.active;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* 頁面 Header */}
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '14px', padding: '0', marginBottom: '8px' }}
        >
          ← 返回專案列表
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
              <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: '#111827' }}>
                {project.name}
              </h1>
              <span style={{ ...sstyle, borderRadius: '99px', padding: '3px 12px', fontSize: '12px', fontWeight: '600' }}>
                {project.statusLabel}
              </span>
            </div>
            {project.description && (
              <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>{project.description}</p>
            )}
          </div>
          <button
            onClick={() => setShowAdd(true)}
            style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
          >
            ＋ 新增任務
          </button>
        </div>
      </div>

      {/* 統計卡片列 */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { label: '總任務', value: stats.total, color: '#3b82f6' },
          { label: '進行中', value: stats.in_progress, color: '#f59e0b' },
          { label: '審核中', value: stats.review, color: '#8b5cf6' },
          { label: '已完成', value: stats.done, color: '#22c55e' },
          { label: '完成率', value: stats.completion + '%', color: stats.completion >= 80 ? '#22c55e' : stats.completion >= 50 ? '#3b82f6' : '#f59e0b' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px',
            padding: '12px 20px', flex: '1', minWidth: '100px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '22px', fontWeight: '800', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}

        {/* 里程碑 */}
        {milestones?.length > 0 && (
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 16px', flex: '2', minWidth: '200px' }}>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>🏁 里程碑</div>
            {milestones.slice(0, 2).map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <span>{m.isAchieved ? '✅' : '⏳'}</span>
                <span style={{ color: m.isAchieved ? '#9ca3af' : '#374151', textDecoration: m.isAchieved ? 'line-through' : 'none' }}>
                  {m.name}
                </span>
                <span style={{ color: '#9ca3af', fontSize: '11px' }}>
                  {new Date(m.dueDate).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 看板 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', alignItems: 'start' }}>
        {COLUMNS.map(col => {
          const columnTasks = kanban?.[col.key] || [];
          return (
            <div
              key={col.key}
              style={{
                background:   col.bg,
                borderRadius: '12px',
                padding:      '14px',
                border:       `1px solid ${col.color}22`,
                minHeight:    '200px',
              }}
            >
              {/* 欄標題 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: col.color }}>{col.label}</span>
                <span style={{
                  background:   col.color + '22',
                  color:        col.color,
                  borderRadius: '99px',
                  padding:      '1px 8px',
                  fontSize:     '12px',
                  fontWeight:   '700',
                }}>
                  {columnTasks.length}
                </span>
              </div>

              {/* 任務卡片 */}
              {columnTasks.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#d1d5db', fontSize: '13px', padding: '24px 0' }}>
                  無任務
                </div>
              ) : (
                columnTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={handleStatusChange}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>

      {/* 新增任務 Modal */}
      {showAdd && (
        <AddTaskModal
          projectId={projectId}
          users={users}
          onClose={() => setShowAdd(false)}
          onCreated={handleTaskCreated}
        />
      )}
    </div>
  );
}
