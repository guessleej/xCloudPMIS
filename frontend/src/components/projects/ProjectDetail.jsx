/**
 * ProjectDetail — 專案詳情頁（任務看板）
 *
 * 功能：
 *   - 看板式任務管理（待辦 / 進行中 / 審核 / 完成）
 *   - 任務詳情 Modal（點擊任務卡片開啟）
 *   - 任務待辦清單 CRUD（新增 / 勾選 / 編輯 / 刪除）
 *   - 任務編輯（標題 / 優先度 / 指派人 / 截止日）
 *   - 任務刪除（軟刪除）
 *   - 狀態流轉審核機制（review → done 需確認）
 *   - 新增任務對話框
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';

const API = '';

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

const STATUS_NEXT = { todo: 'in_progress', in_progress: 'review', review: 'done' };
const STATUS_NEXT_LABEL = {
  todo:        '🔄 開始進行',
  in_progress: '🔍 送審核',
  review:      '✅ 標記完成',
};

// ── 共用 Input 樣式 ─────────────────────────────────────────
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  border: '1px solid #d1d5db', borderRadius: '8px',
  padding: '8px 12px', fontSize: '14px', outline: 'none',
};

// ── 審核確認 Modal ──────────────────────────────────────────
function ReviewConfirmModal({ task, reviewerName, onConfirm, onCancel }) {
  const [note, setNote] = useState('');
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'white', borderRadius: '16px',
        padding: '28px', width: '440px', maxWidth: '95vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🔍</div>
          <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: '800', color: '#111827' }}>
            審核確認
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
            請確認此任務已達完成標準，審核通過後將無法退回。
          </p>
        </div>

        <div style={{
          background: '#f9fafb', borderRadius: '10px',
          padding: '12px 14px', marginBottom: '16px',
          border: '1px solid #e5e7eb',
        }}>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>審核任務</div>
          <div style={{ fontWeight: '700', fontSize: '14px', color: '#111827' }}>{task.title}</div>
          {task.assignee && (
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              執行人：{task.assignee.name}
            </div>
          )}
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: '#374151' }}>
            審核意見（選填）
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="請填寫審核意見或備注..."
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px',
              border: '1px solid #d1d5db', background: 'white',
              color: '#374151', fontSize: '14px', cursor: 'pointer', fontWeight: '600',
            }}
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(note)}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px',
              border: 'none', background: '#16a34a',
              color: 'white', fontSize: '14px', cursor: 'pointer', fontWeight: '700',
            }}
          >
            ✅ 確認審核通過
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 待辦清單項目列表 ─────────────────────────────────────────
function ChecklistSection({ taskId }) {
  const [items,       setItems]      = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [newText,     setNewText]    = useState('');
  const [adding,      setAdding]     = useState(false);
  const [editingId,   setEditingId]  = useState(null);
  const [editText,    setEditText]   = useState('');
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/api/projects/tasks/${taskId}/checklist`);
      const json = await res.json();
      if (json.success) setItems(json.data || []);
    } catch (e) {
      console.error('載入清單失敗', e);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newText.trim()) return;
    setAdding(true);
    try {
      const res  = await fetch(`${API}/api/projects/tasks/${taskId}/checklist`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: newText }),
      });
      const json = await res.json();
      if (json.success) {
        setItems(prev => [...prev, json.data]);
        setNewText('');
      }
    } catch (e) {
      console.error('新增失敗', e);
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (item) => {
    const updated = { ...item, isDone: !item.isDone };
    setItems(prev => prev.map(i => i.id === item.id ? updated : i));
    try {
      await fetch(`${API}/api/projects/tasks/${taskId}/checklist/${item.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ isDone: !item.isDone }),
      });
    } catch (e) {
      // 回滾
      setItems(prev => prev.map(i => i.id === item.id ? item : i));
    }
  };

  const handleEditSave = async (item) => {
    if (!editText.trim() || editText === item.title) {
      setEditingId(null);
      return;
    }
    const original = item.title;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, title: editText } : i));
    setEditingId(null);
    try {
      await fetch(`${API}/api/projects/tasks/${taskId}/checklist/${item.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: editText }),
      });
    } catch (e) {
      // 回滾
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, title: original } : i));
    }
  };

  const handleDelete = async (item) => {
    setItems(prev => prev.filter(i => i.id !== item.id));
    try {
      await fetch(`${API}/api/projects/tasks/${taskId}/checklist/${item.id}`, {
        method: 'DELETE',
      });
    } catch (e) {
      setItems(prev => [...prev, item]);
    }
  };

  const done  = items.filter(i => i.isDone).length;
  const total = items.length;

  return (
    <div>
      {/* 標題與進度 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ fontWeight: '700', fontSize: '13px', color: '#374151' }}>
          ☑️ 待辦清單
        </div>
        {total > 0 && (
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>
            {done}/{total} 完成
          </span>
        )}
      </div>

      {/* 進度條 */}
      {total > 0 && (
        <div style={{ height: '4px', background: '#e5e7eb', borderRadius: '99px', marginBottom: '10px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${Math.round((done / total) * 100)}%`,
            background: '#22c55e',
            borderRadius: '99px',
            transition: 'width 0.3s ease',
          }} />
        </div>
      )}

      {/* 清單項目 */}
      {loading ? (
        <div style={{ fontSize: '13px', color: '#9ca3af', padding: '8px 0' }}>載入中...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
          {items.map(item => (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '6px 8px', borderRadius: '6px',
                background: '#f9fafb',
                border: '1px solid #f3f4f6',
              }}
            >
              {/* 勾選框 */}
              <input
                type="checkbox"
                checked={item.isDone}
                onChange={() => handleToggle(item)}
                style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#22c55e', flexShrink: 0 }}
              />

              {/* 標題（可雙擊編輯）*/}
              {editingId === item.id ? (
                <input
                  autoFocus
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onBlur={() => handleEditSave(item)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleEditSave(item);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  style={{
                    flex: 1, border: '1px solid #3b82f6', borderRadius: '4px',
                    padding: '2px 6px', fontSize: '13px', outline: 'none',
                  }}
                />
              ) : (
                <span
                  onDoubleClick={() => { setEditingId(item.id); setEditText(item.title); }}
                  title="雙擊編輯"
                  style={{
                    flex: 1, fontSize: '13px', cursor: 'text',
                    color: item.isDone ? '#9ca3af' : '#374151',
                    textDecoration: item.isDone ? 'line-through' : 'none',
                  }}
                >
                  {item.title}
                </span>
              )}

              {/* 操作按鈕 */}
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button
                  onClick={() => { setEditingId(item.id); setEditText(item.title); }}
                  title="編輯"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#9ca3af', fontSize: '12px', padding: '2px 4px',
                    borderRadius: '4px',
                  }}
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDelete(item)}
                  title="刪除"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#9ca3af', fontSize: '12px', padding: '2px 4px',
                    borderRadius: '4px',
                  }}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增輸入列 */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          ref={inputRef}
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="新增待辦項目..."
          style={{
            flex: 1, border: '1px solid #d1d5db', borderRadius: '6px',
            padding: '6px 10px', fontSize: '13px', outline: 'none',
          }}
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newText.trim()}
          style={{
            background: newText.trim() ? '#3b82f6' : '#e5e7eb',
            color: newText.trim() ? 'white' : '#9ca3af',
            border: 'none', borderRadius: '6px',
            padding: '6px 14px', fontSize: '13px',
            cursor: newText.trim() ? 'pointer' : 'not-allowed',
            fontWeight: '600', flexShrink: 0,
          }}
        >
          {adding ? '...' : '新增'}
        </button>
      </div>
    </div>
  );
}

// ── 任務詳情 Modal ───────────────────────────────────────────
function TaskDetailModal({ task, users, onClose, onUpdated, onDeleted }) {
  const { user } = useAuth();
  const [isEditing,  setIsEditing]  = useState(false);
  const [editForm,   setEditForm]   = useState({
    title:         task.title       || '',
    description:   task.description || '',
    priority:      task.priority    || 'medium',
    assigneeId:    task.assignee?.id || '',
    dueDate:       task.dueDate ? task.dueDate.split('T')[0] : '',
  });
  const [saving,     setSaving]     = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [error,      setError]      = useState('');
  const [showReview, setShowReview] = useState(false);

  const setField = (k, v) => setEditForm(f => ({ ...f, [k]: v }));

  // 更新任務基本資訊
  const handleSave = async () => {
    if (!editForm.title.trim()) { setError('任務標題為必填'); return; }
    setSaving(true);
    setError('');
    try {
      const res  = await fetch(`${API}/api/projects/tasks/${task.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:       editForm.title,
          description: editForm.description,
          priority:    editForm.priority,
          assigneeId:  editForm.assigneeId || null,
          dueDate:     editForm.dueDate || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setIsEditing(false);
      onUpdated();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // 刪除任務
  const handleDelete = async () => {
    if (!window.confirm(`確定要刪除任務「${task.title}」嗎？`)) return;
    setDeleting(true);
    try {
      const res  = await fetch(`${API}/api/projects/tasks/${task.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onDeleted();
    } catch (e) {
      setError(e.message);
      setDeleting(false);
    }
  };

  // 切換任務狀態（帶審核確認機制）
  const handleStatusChange = (newStatus) => {
    if (task.status === 'review' && newStatus === 'done') {
      setShowReview(true);
    } else {
      doStatusChange(newStatus);
    }
  };

  const doStatusChange = async (newStatus, reviewNote = '') => {
    try {
      const body = { status: newStatus };
      if (reviewNote) body.description = (task.description || '') + `\n\n[審核意見] ${reviewNote}`;
      const res  = await fetch(`${API}/api/projects/tasks/${task.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setShowReview(false);
      onUpdated();
      onClose();
    } catch (e) {
      setError(e.message);
    }
  };

  const pStyle  = PRIORITY_STYLE[task.priority] || PRIORITY_STYLE.medium;
  const nextSt  = STATUS_NEXT[task.status];
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done';

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: '40px', overflowY: 'auto',
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div style={{
          background: 'white', borderRadius: '16px',
          width: '600px', maxWidth: '95vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          marginBottom: '40px',
        }}>
          {/* Modal Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '20px 24px 16px',
            borderBottom: '1px solid #f3f4f6',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                background: pStyle.bg, color: pStyle.color,
                borderRadius: '4px', padding: '2px 8px',
                fontSize: '11px', fontWeight: '700',
              }}>
                {pStyle.label}
              </span>
              <span style={{
                fontSize: '12px', color: '#9ca3af',
                padding: '2px 8px', background: '#f3f4f6', borderRadius: '4px',
              }}>
                {COLUMNS.find(c => c.key === task.status)?.label || task.status}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  style={{
                    background: '#f3f4f6', border: 'none', borderRadius: '6px',
                    padding: '6px 12px', fontSize: '12px', cursor: 'pointer',
                    color: '#374151', fontWeight: '600',
                  }}
                >
                  ✏️ 編輯
                </button>
              )}
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  background: '#fee2e2', border: 'none', borderRadius: '6px',
                  padding: '6px 12px', fontSize: '12px', cursor: 'pointer',
                  color: '#b91c1c', fontWeight: '600', opacity: deleting ? 0.6 : 1,
                }}
              >
                🗑️ 刪除
              </button>
              <button
                onClick={onClose}
                style={{
                  background: 'none', border: 'none', fontSize: '20px',
                  cursor: 'pointer', color: '#9ca3af', lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div style={{ padding: '20px 24px' }}>
            {error && (
              <div style={{
                background: '#fee2e2', color: '#b91c1c', borderRadius: '8px',
                padding: '10px 14px', fontSize: '13px', marginBottom: '16px',
              }}>
                ⚠️ {error}
              </div>
            )}

            {/* 任務標題 */}
            {isEditing ? (
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>任務標題 *</label>
                <input
                  autoFocus
                  value={editForm.title}
                  onChange={e => setField('title', e.target.value)}
                  style={inputStyle}
                />
              </div>
            ) : (
              <h2 style={{
                margin: '0 0 16px', fontSize: '18px', fontWeight: '800',
                color: task.status === 'done' ? '#9ca3af' : '#111827',
                lineHeight: '1.3',
                textDecoration: task.status === 'done' ? 'line-through' : 'none',
              }}>
                {task.title}
              </h2>
            )}

            {/* 欄位行：優先度 + 指派人 + 截止日 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              {/* 優先度 */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>優先度</label>
                {isEditing ? (
                  <select value={editForm.priority} onChange={e => setField('priority', e.target.value)} style={{ ...inputStyle, padding: '7px 10px' }}>
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                    <option value="urgent">緊急</option>
                  </select>
                ) : (
                  <span style={{ fontSize: '13px', color: '#374151' }}>{PRIORITY_STYLE[task.priority]?.label || task.priority}</span>
                )}
              </div>

              {/* 指派人 */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>指派給</label>
                {isEditing ? (
                  <select value={editForm.assigneeId} onChange={e => setField('assigneeId', e.target.value)} style={{ ...inputStyle, padding: '7px 10px' }}>
                    <option value="">— 未指派 —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: '13px', color: '#374151' }}>
                    {task.assignee ? `👤 ${task.assignee.name}` : '—'}
                  </span>
                )}
              </div>

              {/* 截止日 */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>截止日期</label>
                {isEditing ? (
                  <input
                    type="date"
                    value={editForm.dueDate}
                    onChange={e => setField('dueDate', e.target.value)}
                    style={{ ...inputStyle, padding: '7px 10px' }}
                  />
                ) : (
                  <span style={{ fontSize: '13px', color: isOverdue ? '#ef4444' : '#374151', fontWeight: isOverdue ? '600' : '400' }}>
                    {task.dueDate
                      ? `📅 ${new Date(task.dueDate).toLocaleDateString('zh-TW')}${isOverdue ? ' ⚠️ 已逾期' : ''}`
                      : '—'}
                  </span>
                )}
              </div>
            </div>

            {/* 描述 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>任務描述</label>
              {isEditing ? (
                <textarea
                  value={editForm.description}
                  onChange={e => setField('description', e.target.value)}
                  placeholder="填寫任務詳細說明..."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              ) : (
                <div style={{
                  fontSize: '13px', color: task.description ? '#374151' : '#9ca3af',
                  background: '#f9fafb', borderRadius: '8px', padding: '10px 12px',
                  lineHeight: '1.6', minHeight: '56px',
                  whiteSpace: 'pre-wrap',
                }}>
                  {task.description || '（無描述）'}
                </div>
              )}
            </div>

            {/* 編輯時的儲存 / 取消 */}
            {isEditing && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button
                  onClick={() => { setIsEditing(false); setError(''); }}
                  style={{
                    background: 'white', border: '1px solid #d1d5db', borderRadius: '8px',
                    padding: '8px 16px', fontSize: '13px', cursor: 'pointer', color: '#374151',
                  }}
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    background: '#3b82f6', border: 'none', borderRadius: '8px',
                    padding: '8px 20px', fontSize: '13px', fontWeight: '700',
                    cursor: 'pointer', color: 'white', opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? '儲存中...' : '💾 儲存變更'}
                </button>
              </div>
            )}

            {/* 待辦清單 */}
            <div style={{
              borderTop: '1px solid #f3f4f6', paddingTop: '16px', marginBottom: '16px',
            }}>
              <ChecklistSection taskId={task.id} />
            </div>

            {/* 狀態切換 */}
            {task.status !== 'done' && (
              <div style={{
                borderTop: '1px solid #f3f4f6', paddingTop: '16px',
                display: 'flex', alignItems: 'center', gap: '10px',
              }}>
                <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '600' }}>
                  狀態流轉：
                </span>
                <button
                  onClick={() => handleStatusChange(nextSt)}
                  style={{
                    background: task.status === 'review' ? '#16a34a' : '#3b82f6',
                    color: 'white', border: 'none', borderRadius: '8px',
                    padding: '8px 18px', fontSize: '13px', fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  {STATUS_NEXT_LABEL[task.status]}
                </button>
                {task.status === 'review' && (
                  <span style={{ fontSize: '12px', color: '#d97706', background: '#fffbeb', padding: '4px 10px', borderRadius: '6px', border: '1px solid #fde68a' }}>
                    ⚠️ 需審核確認才能完成
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 審核確認 Modal */}
      {showReview && (
        <ReviewConfirmModal
          task={task}
          reviewerName={user?.name || '審核者'}
          onConfirm={(note) => doStatusChange('done', note)}
          onCancel={() => setShowReview(false)}
        />
      )}
    </>
  );
}

// ── 任務卡片 ────────────────────────────────────────────────
function TaskCard({ task, onOpenDetail }) {
  const pStyle = PRIORITY_STYLE[task.priority] || PRIORITY_STYLE.medium;
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done';

  return (
    <div
      onClick={() => onOpenDetail(task)}
      style={{
        background:   'white',
        border:       '1px solid #e5e7eb',
        borderRadius: '10px',
        padding:      '14px',
        marginBottom: '8px',
        boxShadow:    '0 1px 2px rgba(0,0,0,0.04)',
        cursor:       'pointer',
        transition:   'box-shadow 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        e.currentTarget.style.borderColor = '#93c5fd';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
        e.currentTarget.style.borderColor = '#e5e7eb';
      }}
    >
      {/* 優先度 badge + 標籤 */}
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
        margin:         '0 0 10px',
        fontSize:       '14px',
        fontWeight:     '600',
        color:          task.status === 'done' ? '#9ca3af' : '#111827',
        lineHeight:     '1.4',
        textDecoration: task.status === 'done' ? 'line-through' : 'none',
      }}>
        {task.title}
      </p>

      {/* 底部：日期 + 指派人 + 點擊提示 */}
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
        <span style={{ color: '#d1d5db', fontSize: '11px' }}>點擊查看 →</span>
      </div>
    </div>
  );
}

// ── 新增任務對話框 ──────────────────────────────────────────
function AddTaskModal({ projectId, users, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', priority: 'medium', dueDate: '', assigneeId: '', estimatedHours: '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('任務標題為必填'); return; }
    setSaving(true);
    try {
      const res  = await fetch(`${API}/api/projects/${projectId}/tasks`, {
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

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'white', borderRadius: '16px', padding: '28px',
        width: '460px', maxWidth: '95vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
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
            <button
              type="button" onClick={onClose}
              style={{ background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px 20px', fontSize: '14px', cursor: 'pointer' }}
            >
              取消
            </button>
            <button
              type="submit" disabled={saving}
              style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
            >
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
  const { user } = useAuth();
  const companyId = user?.companyId;

  const [project,      setProject]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [showAdd,      setShowAdd]      = useState(false);
  const [users,        setUsers]        = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);

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

  // 載入成員列表
  useEffect(() => {
    if (!companyId) return;
    fetch(`${API}/api/users?companyId=${companyId}`)
      .then(r => r.json())
      .then(d => setUsers(Array.isArray(d.data) ? d.data : []))
      .catch(() => {});
  }, [companyId]);

  useEffect(() => { loadProject(); }, [loadProject]);

  const handleTaskCreated = () => {
    setShowAdd(false);
    loadProject();
  };

  const handleTaskUpdated = () => {
    setSelectedTask(null);
    loadProject();
  };

  const handleTaskDeleted = () => {
    setSelectedTask(null);
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
    planning:  { bg: '#dbeafe', color: '#1d4ed8' },
    active:    { bg: '#dcfce7', color: '#15803d' },
    on_hold:   { bg: '#fef9c3', color: '#a16207' },
    completed: { bg: '#f3f4f6', color: '#4b5563' },
    cancelled: { bg: '#fee2e2', color: '#b91c1c' },
  };
  const sstyle = STATUS_STYLE_MAP[project.status] || STATUS_STYLE_MAP.active;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
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

      {/* 統計卡片 */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { label: '總任務',  value: stats.total,       color: '#3b82f6' },
          { label: '進行中',  value: stats.in_progress,  color: '#f59e0b' },
          { label: '審核中',  value: stats.review,       color: '#8b5cf6' },
          { label: '已完成',  value: stats.done,         color: '#22c55e' },
          {
            label: '完成率',
            value: stats.completion + '%',
            color: stats.completion >= 80 ? '#22c55e' : stats.completion >= 50 ? '#3b82f6' : '#f59e0b',
          },
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
                    onOpenDetail={setSelectedTask}
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

      {/* 任務詳情 Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          users={users}
          onClose={() => setSelectedTask(null)}
          onUpdated={handleTaskUpdated}
          onDeleted={handleTaskDeleted}
        />
      )}
    </div>
  );
}
