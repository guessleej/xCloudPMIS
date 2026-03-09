/**
 * ProjectsPage — 專案管理頁面
 *
 * 功能：
 *   - 專案列表（卡片式），依狀態篩選
 *   - 新增專案對話框
 *   - ✏️ 編輯專案（名稱、描述、狀態、負責人、日期、預算）
 *   - 🗑️ 刪除專案（軟刪除，需二次確認）
 *   - 點擊卡片主體進入詳情（任務看板）
 */

import { useState, useEffect, useCallback } from 'react';
import ProjectDetail from './ProjectDetail';

const API        = import.meta.env.VITE_API_URL || 'http://localhost:3010';
const COMPANY_ID = 2;

// ── 狀態樣式對照 ────────────────────────────────────────────
const STATUS_STYLE = {
  planning:  { bg: '#dbeafe', color: '#1d4ed8', label: '規劃中' },
  active:    { bg: '#dcfce7', color: '#15803d', label: '進行中' },
  on_hold:   { bg: '#fef9c3', color: '#a16207', label: '暫停' },
  completed: { bg: '#f3f4f6', color: '#4b5563', label: '已完成' },
  cancelled: { bg: '#fee2e2', color: '#b91c1c', label: '已取消' },
};

// ── 進度條元件 ───────────────────────────────────────────────
function ProgressBar({ value }) {
  return (
    <div style={{ background: '#e5e7eb', borderRadius: '99px', height: '6px', overflow: 'hidden' }}>
      <div style={{
        width:        `${Math.min(value, 100)}%`,
        height:       '100%',
        background:   value >= 100 ? '#22c55e' : value >= 60 ? '#3b82f6' : value >= 30 ? '#f59e0b' : '#ef4444',
        borderRadius: '99px',
        transition:   'width 0.4s ease',
      }} />
    </div>
  );
}

// ── 小元件 ──────────────────────────────────────────────────
const Field = ({ label, children }) => (
  <div style={{ marginBottom: '14px' }}>
    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
      {label}
    </label>
    {children}
  </div>
);

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  border: '1px solid #d1d5db', borderRadius: '8px',
  padding: '8px 12px', fontSize: '14px', color: '#111827',
  outline: 'none', background: '#fff',
};

const btnPrimary = {
  background: '#3b82f6', color: 'white',
  border: 'none', borderRadius: '8px',
  padding: '9px 20px', fontSize: '14px', fontWeight: '600',
  cursor: 'pointer',
};

const btnOutline = {
  background: 'white', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: '8px',
  padding: '9px 20px', fontSize: '14px', fontWeight: '600',
  cursor: 'pointer',
};

const btnDanger = {
  background: '#ef4444', color: 'white',
  border: 'none', borderRadius: '8px',
  padding: '9px 20px', fontSize: '14px', fontWeight: '600',
  cursor: 'pointer',
};

// ════════════════════════════════════════════════════════════
// 專案卡片
// ════════════════════════════════════════════════════════════
function ProjectCard({ project, onClick, onEdit, onDelete }) {
  const style = STATUS_STYLE[project.status] || STATUS_STYLE.active;

  const daysLeft = project.endDate
    ? Math.ceil((new Date(project.endDate) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div style={{
      background:   'white',
      border:       '1px solid #e5e7eb',
      borderRadius: '12px',
      overflow:     'hidden',
      transition:   'all 0.15s',
      boxShadow:    '0 1px 3px rgba(0,0,0,0.04)',
      display:      'flex',
      flexDirection: 'column',
    }}
    onMouseOver={e => {
      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
      e.currentTarget.style.transform = 'translateY(-2px)';
    }}
    onMouseOut={e => {
      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
      e.currentTarget.style.transform = 'translateY(0)';
    }}
    >
      {/* 可點擊的卡片主體 */}
      <div
        onClick={() => onClick(project)}
        style={{ padding: '20px', flex: 1, cursor: 'pointer' }}
      >
        {/* 頂部：狀態 badge + 天數 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{
            background:   style.bg,
            color:        style.color,
            borderRadius: '99px',
            padding:      '2px 10px',
            fontSize:     '12px',
            fontWeight:   '600',
          }}>
            {style.label}
          </span>
          {daysLeft !== null && (
            <span style={{
              fontSize: '12px',
              color:    daysLeft < 0 ? '#ef4444' : daysLeft <= 7 ? '#f59e0b' : '#9ca3af',
              fontWeight: daysLeft <= 7 ? '600' : '400',
            }}>
              {daysLeft < 0 ? `已逾期 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? '今天截止' : `剩 ${daysLeft} 天`}
            </span>
          )}
        </div>

        {/* 專案名稱 */}
        <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '700', color: '#111827', lineHeight: '1.3' }}>
          {project.name}
        </h3>

        {/* 描述 */}
        {project.description && (
          <p style={{
            margin: '0 0 14px', fontSize: '13px', color: '#6b7280', lineHeight: '1.5',
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {project.description}
          </p>
        )}

        {/* 任務進度 */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>任務完成進度</span>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#374151' }}>
              {project.taskDone}/{project.taskTotal} ({project.completion}%)
            </span>
          </div>
          <ProgressBar value={project.completion} />
        </div>

        {/* 底部資訊 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: '12px', borderTop: '1px solid #f3f4f6',
          fontSize: '12px', color: '#9ca3af',
        }}>
          <span>👤 {project.owner?.name || '未指派'}</span>
          <span>
            {project.endDate
              ? `📅 ${new Date(project.endDate).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}`
              : '未設截止日'}
          </span>
          {project.budget && (
            <span>💰 {(project.budget / 10000).toFixed(0)}萬</span>
          )}
        </div>
      </div>

      {/* 操作按鈕列 — 底部 */}
      <div style={{
        display:        'flex',
        gap:            6,
        padding:        '10px 14px',
        borderTop:      '1px solid #f3f4f6',
        background:     '#fafafa',
        justifyContent: 'flex-end',
      }}
      onClick={e => e.stopPropagation()}
      >
        <button
          onClick={e => { e.stopPropagation(); onEdit(project); }}
          title="編輯專案"
          style={{
            padding:      '5px 12px',
            background:   '#fff',
            border:       '1px solid #d1d5db',
            borderRadius: 6,
            fontSize:     12,
            fontWeight:   500,
            cursor:       'pointer',
            color:        '#374151',
            display:      'flex',
            alignItems:   'center',
            gap:          4,
          }}
        >
          ✏️ 編輯
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(project); }}
          title="刪除專案"
          style={{
            padding:      '5px 12px',
            background:   '#fff',
            border:       '1px solid #fca5a5',
            borderRadius: 6,
            fontSize:     12,
            fontWeight:   500,
            cursor:       'pointer',
            color:        '#dc2626',
            display:      'flex',
            alignItems:   'center',
            gap:          4,
          }}
        >
          🗑️ 刪除
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 新增 / 編輯 專案 Modal（共用同一組表單）
// ════════════════════════════════════════════════════════════
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

    setSaving(true);
    setError('');
    try {
      let res, json;
      if (isEdit) {
        // 編輯模式 — PATCH
        res  = await fetch(`${API}/api/projects/${project.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ ...form, companyId: COMPANY_ID }),
        });
      } else {
        // 新增模式 — POST
        res  = await fetch(`${API}/api/projects`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ ...form, companyId: COMPANY_ID }),
        });
      }
      json = await res.json();
      if (!json.success && !res.ok) throw new Error(json.error || '操作失敗');
      onSaved(json.data || json);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'white', borderRadius: '16px',
        padding: '28px', width: '520px', maxWidth: '95vw',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>
            {isEdit ? '✏️ 編輯專案' : '➕ 建立新專案'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* 專案名稱 */}
          <Field label="專案名稱 *">
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="例如：電商平台重構計畫"
              style={inputStyle}
              autoFocus
            />
          </Field>

          {/* 描述 */}
          <Field label="專案描述">
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="簡要說明此專案的目標與範圍..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>

          {/* 兩欄：狀態 + 負責人 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="狀態">
              <select value={form.status} onChange={e => set('status', e.target.value)} style={inputStyle}>
                <option value="planning">規劃中</option>
                <option value="active">進行中</option>
                <option value="on_hold">暫停</option>
                <option value="completed">已完成</option>
                <option value="cancelled">已取消</option>
              </select>
            </Field>
            <Field label="負責人">
              <select value={form.ownerId} onChange={e => set('ownerId', e.target.value)} style={inputStyle}>
                <option value="">— 未指派 —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* 兩欄：開始/結束日期 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="開始日期">
              <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="截止日期">
              <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} style={inputStyle} />
            </Field>
          </div>

          {/* 預算 */}
          <Field label="預算（元）">
            <input
              type="number"
              value={form.budget}
              onChange={e => set('budget', e.target.value)}
              placeholder="例如：1500000"
              style={inputStyle}
            />
          </Field>

          {error && (
            <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '12px' }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button type="button" onClick={onClose} style={btnOutline}>取消</button>
            <button type="submit" disabled={saving} style={saving ? { ...btnPrimary, opacity: 0.6 } : btnPrimary}>
              {saving
                ? (isEdit ? '儲存中...' : '建立中...')
                : (isEdit ? '💾 儲存變更' : '✅ 建立專案')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 刪除確認對話框
// ════════════════════════════════════════════════════════════
function DeleteConfirmModal({ project, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState('');

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'white', borderRadius: '16px',
        padding: '32px', width: '440px', maxWidth: '92vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        textAlign: 'center',
      }}>
        {/* 警示圖示 */}
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          background: '#fee2e2', margin: '0 auto 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28,
        }}>
          🗑️
        </div>

        <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '700', color: '#111827' }}>
          確認刪除專案？
        </h2>

        <p style={{ margin: '0 0 6px', fontSize: '14px', color: '#6b7280' }}>
          即將刪除以下專案：
        </p>
        <p style={{
          margin: '0 0 16px',
          fontSize: '15px', fontWeight: '700', color: '#111827',
          background: '#f3f4f6', padding: '8px 16px',
          borderRadius: 8, display: 'inline-block',
        }}>
          📁 {project.name}
        </p>

        {project.taskTotal > 0 && (
          <div style={{
            background: '#fef9c3', border: '1px solid #fde047',
            borderRadius: 8, padding: '10px 14px',
            fontSize: 13, color: '#a16207', marginBottom: 16,
            textAlign: 'left',
          }}>
            ⚠️ 此專案包含 <strong>{project.taskTotal}</strong> 個任務，刪除後所有任務資料將一併封存。
          </div>
        )}

        <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#9ca3af' }}>
          此操作為軟刪除，資料不會永久消失。
        </p>

        {error && (
          <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '14px' }}>
            ❌ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button onClick={onClose} style={btnOutline} disabled={deleting}>
            取消
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={deleting ? { ...btnDanger, opacity: 0.6 } : btnDanger}
          >
            {deleting ? '刪除中...' : '確認刪除'}
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
  const [projects,      setProjects]      = useState([]);
  const [users,         setUsers]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [showCreate,    setShowCreate]    = useState(false);
  const [editProject,   setEditProject]   = useState(null);   // 編輯中的專案
  const [deleteProject, setDeleteProject] = useState(null);   // 待刪除的專案
  const [activeProject, setActiveProject] = useState(null);   // 進入詳情頁
  const [filter,        setFilter]        = useState('all');
  const [toast,         setToast]         = useState('');     // 操作成功提示

  // 顯示短暫 toast
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, uRes] = await Promise.all([
        fetch(`${API}/api/projects?companyId=${COMPANY_ID}`),
        fetch(`${API}/api/users?companyId=${COMPANY_ID}`).catch(() => ({ json: async () => ({ data: [] }) })),
      ]);
      const pData = await pRes.json();
      setProjects(pData.data || []);

      try {
        const uData = await uRes.json();
        setUsers(uData.data || []);
      } catch { /* 略過 */ }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // 新增後回呼
  const handleCreated = () => {
    setShowCreate(false);
    loadProjects();
    showToast('✅ 專案已建立');
  };

  // 編輯後回呼
  const handleEdited = (updated) => {
    setEditProject(null);
    // 就地更新 state，不需完整重載
    setProjects(prev => prev.map(p => {
      if (p.id !== updated.id) return p;
      return {
        ...p,
        name:        updated.name,
        description: updated.description,
        status:      updated.status,
        budget:      updated.budget,
        startDate:   updated.startDate,
        endDate:     updated.endDate,
        owner:       updated.owner,
      };
    }));
    showToast('✅ 專案已更新');
  };

  // 刪除後回呼
  const handleDeleted = (projectId) => {
    setDeleteProject(null);
    setProjects(prev => prev.filter(p => p.id !== projectId));
    showToast('🗑️ 專案已刪除');
  };

  // 若進入詳情頁，顯示 ProjectDetail
  if (activeProject) {
    return (
      <ProjectDetail
        projectId={activeProject.id}
        projectName={activeProject.name}
        onBack={() => setActiveProject(null)}
      />
    );
  }

  // 篩選後的專案
  const filtered = filter === 'all'
    ? projects
    : projects.filter(p => p.status === filter);

  // 統計數字
  const stats = {
    all:       projects.length,
    active:    projects.filter(p => p.status === 'active').length,
    planning:  projects.filter(p => p.status === 'planning').length,
    completed: projects.filter(p => p.status === 'completed').length,
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>

      {/* Toast 通知 */}
      {toast && (
        <div style={{
          position:   'fixed',
          bottom:     28,
          right:      28,
          zIndex:     9999,
          background: '#1e293b',
          color:      '#fff',
          padding:    '12px 20px',
          borderRadius: 10,
          fontSize:   14,
          fontWeight: 500,
          boxShadow:  '0 4px 20px rgba(0,0,0,0.3)',
          animation:  'fadeIn 0.2s ease',
        }}>
          {toast}
        </div>
      )}

      {/* 頁面標題 + 新增按鈕 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: '#111827' }}>
            📁 專案管理
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#9ca3af' }}>
            共 {stats.all} 個專案
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} style={btnPrimary}>
          ＋ 新增專案
        </button>
      </div>

      {/* 篩選標籤 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[
          { key: 'all',       label: `全部 (${stats.all})` },
          { key: 'active',    label: `進行中 (${stats.active})` },
          { key: 'planning',  label: `規劃中 (${stats.planning})` },
          { key: 'completed', label: `已完成 (${stats.completed})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              background:   filter === tab.key ? '#1e293b' : 'white',
              color:        filter === tab.key ? 'white' : '#374151',
              border:       `1px solid ${filter === tab.key ? '#1e293b' : '#d1d5db'}`,
              borderRadius: '99px',
              padding:      '6px 16px',
              fontSize:     '13px',
              fontWeight:   '500',
              cursor:       'pointer',
              transition:   'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 內容區 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px', color: '#9ca3af' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>⏳</div>
          <div>載入專案中...</div>
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '80px', color: '#ef4444' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>😢</div>
          <div>載入失敗：{error}</div>
          <button onClick={loadProjects} style={{ ...btnPrimary, marginTop: '16px' }}>重試</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px', color: '#9ca3af' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📭</div>
          <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>沒有符合的專案</div>
          <button onClick={() => setShowCreate(true)} style={{ ...btnPrimary, marginTop: '8px' }}>
            ＋ 建立第一個專案
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '16px',
        }}>
          {filtered.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={setActiveProject}
              onEdit={setEditProject}
              onDelete={setDeleteProject}
            />
          ))}
        </div>
      )}

      {/* 新增專案 Modal */}
      {showCreate && (
        <ProjectFormModal
          users={users}
          project={null}
          onClose={() => setShowCreate(false)}
          onSaved={handleCreated}
        />
      )}

      {/* 編輯專案 Modal */}
      {editProject && (
        <ProjectFormModal
          users={users}
          project={editProject}
          onClose={() => setEditProject(null)}
          onSaved={handleEdited}
        />
      )}

      {/* 刪除確認 Modal */}
      {deleteProject && (
        <DeleteConfirmModal
          project={deleteProject}
          onClose={() => setDeleteProject(null)}
          onDeleted={handleDeleted}
        />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
