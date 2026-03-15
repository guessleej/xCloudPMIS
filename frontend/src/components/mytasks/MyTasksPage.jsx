/**
 * MyTasksPage.jsx
 * 我的任務 — 個人任務檢視（類 Asana My Tasks）
 *
 * 顯示所有指派給當前使用者的跨專案任務
 * API：GET  /api/projects/tasks?companyId=2
 *      PATCH /api/projects/tasks/:id
 *      POST  /api/projects/:projectId/tasks
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ── Design Tokens ────────────────────────────────────────────
const T = {
  accent:  '#C41230',
  accentL: '#f8d7db',
  pageBg:  '#F7F2F2',
};

const API = 'http://localhost:3010/api/projects';

// ── 工具函式 ─────────────────────────────────────────────────
function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek() {
  const d = today();
  d.setDate(d.getDate() - d.getDay() + 1); // Monday
  return d;
}

function endOfWeek() {
  const d = startOfWeek();
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function endOfNextTwoWeeks() {
  const d = today();
  d.setDate(d.getDate() + 14);
  d.setHours(23, 59, 59, 999);
  return d;
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d.getTime() === today().getTime();
}

function isThisWeek(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= startOfWeek() && d <= endOfWeek();
}

function isOverdue(dateStr, status) {
  if (!dateStr || status === 'done') return false;
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d < today();
}

function isDoneThisWeek(task) {
  if (task.status !== 'done' || !task.updatedAt) return false;
  const d = new Date(task.updatedAt);
  return d >= startOfWeek() && d <= endOfWeek();
}

function dueDateLabel(dateStr, status) {
  if (!dateStr) return null;
  if (isOverdue(dateStr, status)) {
    const days = Math.ceil((today() - new Date(dateStr)) / 86400000);
    return { text: `逾期 ${days} 天`, color: '#dc2626' };
  }
  if (isToday(dateStr)) return { text: '今天到期', color: '#ea580c' };
  const diff = Math.ceil((new Date(dateStr) - today()) / 86400000);
  if (diff <= 3) return { text: `剩 ${diff} 天`, color: '#f59e0b' };
  return {
    text: new Date(dateStr).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }),
    color: '#9ca3af',
  };
}

function avatarChar(name) {
  return name ? name.charAt(0).toUpperCase() : '?';
}

function avatarColor(name) {
  const colors = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444'];
  if (!name) return colors[0];
  return colors[name.charCodeAt(0) % colors.length];
}

function projectBadgeColor(projectName) {
  const pairs = [
    { bg: '#ede9fe', color: '#7c3aed' },
    { bg: '#dbeafe', color: '#1d4ed8' },
    { bg: '#dcfce7', color: '#15803d' },
    { bg: '#fef3c7', color: '#92400e' },
    { bg: '#fce7f3', color: '#9d174d' },
    { bg: '#e0f2fe', color: '#0369a1' },
  ];
  if (!projectName) return pairs[0];
  return pairs[projectName.charCodeAt(0) % pairs.length];
}

const PRIORITY_MAP = {
  urgent: { label: '緊急', bg: '#fee2e2', color: '#dc2626', dot: '#dc2626' },
  high:   { label: '高',   bg: '#ffedd5', color: '#ea580c', dot: '#ea580c' },
  medium: { label: '中',   bg: '#fef9c3', color: '#ca8a04', dot: '#ca8a04' },
  low:    { label: '低',   bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af' },
};

const STATUS_MAP = {
  todo:        { label: '待辦',   color: '#6b7280' },
  in_progress: { label: '進行中', color: '#3b82f6' },
  review:      { label: '審核中', color: '#f59e0b' },
  done:        { label: '已完成', color: '#10b981' },
};

const SECTIONS = [
  { id: 'all',      label: '全部',    icon: '◎' },
  { id: 'today',    label: '今天到期', icon: '☀' },
  { id: 'week',     label: '本週到期', icon: '📅' },
  { id: 'overdue',  label: '已逾期',  icon: '⚠' },
  { id: 'done',     label: '已完成',  icon: '✓' },
];

const SORT_OPTIONS = [
  { id: 'dueDate',  label: '截止日期' },
  { id: 'priority', label: '優先度' },
  { id: 'project',  label: '專案' },
];

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

// ── Mock 資料（API 不可用時使用） ────────────────────────────
const TODAY_STR = new Date().toISOString().slice(0, 10);
function daysFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const MOCK_TASKS = [
  {
    id: 101, title: '完成 Q1 財務報告初稿', status: 'in_progress', priority: 'urgent',
    dueDate: TODAY_STR,
    project: { id: 1, name: '財務系統升級' },
    assignee: { id: 1, name: '王大明' },
    description: '包含損益表、資產負債表與現金流量表',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 102, title: '審核新版 UI 設計稿', status: 'todo', priority: 'high',
    dueDate: TODAY_STR,
    project: { id: 2, name: 'xCloud PMIS 開發' },
    assignee: { id: 1, name: '王大明' },
    description: '重點確認 Dashboard 的色彩系統與字型規格',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 103, title: '更新客戶資料庫欄位結構', status: 'todo', priority: 'medium',
    dueDate: daysFromToday(2),
    project: { id: 3, name: 'CRM 系統整合' },
    assignee: { id: 1, name: '王大明' },
    description: '新增電話、地址、統編欄位，並遷移舊資料',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 104, title: '撰寫 API 文件（v2.0）', status: 'in_progress', priority: 'medium',
    dueDate: daysFromToday(4),
    project: { id: 2, name: 'xCloud PMIS 開發' },
    assignee: { id: 1, name: '王大明' },
    description: '涵蓋所有 REST endpoints、請求/回應格式與範例',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 105, title: '辦理年度軟體授權續約', status: 'todo', priority: 'high',
    dueDate: daysFromToday(5),
    project: { id: 4, name: 'IT 採購管理' },
    assignee: { id: 1, name: '王大明' },
    description: 'Microsoft 365、Adobe CC、Figma Pro',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 106, title: '安排員工教育訓練', status: 'todo', priority: 'low',
    dueDate: daysFromToday(8),
    project: { id: 5, name: 'HR 人資管理' },
    assignee: { id: 1, name: '王大明' },
    description: '資安意識培訓 & 新版系統操作說明',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 107, title: '修復登入頁跑版 Bug', status: 'todo', priority: 'urgent',
    dueDate: daysFromToday(-1),
    project: { id: 2, name: 'xCloud PMIS 開發' },
    assignee: { id: 1, name: '王大明' },
    description: 'Safari 15 與 Firefox 118 有跑版問題',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 108, title: '確認伺服器備份設定', status: 'todo', priority: 'high',
    dueDate: daysFromToday(-3),
    project: { id: 4, name: 'IT 採購管理' },
    assignee: { id: 1, name: '王大明' },
    description: '確認異地備份是否正常啟用',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 109, title: '完成用戶訪談整理', status: 'done', priority: 'medium',
    dueDate: daysFromToday(-5),
    project: { id: 2, name: 'xCloud PMIS 開發' },
    assignee: { id: 1, name: '王大明' },
    description: '10 位受訪者的逐字稿與重點摘要',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 110, title: '提交年度預算申請', status: 'done', priority: 'urgent',
    dueDate: daysFromToday(-7),
    project: { id: 4, name: 'IT 採購管理' },
    assignee: { id: 1, name: '王大明' },
    description: '含人力成本、軟硬體、差旅費',
    updatedAt: new Date().toISOString(),
  },
];

const MOCK_PROJECTS = [
  { id: 1, name: '財務系統升級' },
  { id: 2, name: 'xCloud PMIS 開發' },
  { id: 3, name: 'CRM 系統整合' },
  { id: 4, name: 'IT 採購管理' },
  { id: 5, name: 'HR 人資管理' },
];

// ── 共用樣式 ─────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '7px 10px',
  border: '1px solid #d1d5db', borderRadius: 6,
  fontSize: '13px', boxSizing: 'border-box',
  outline: 'none', background: '#fff',
};

// ════════════════════════════════════════════════════════════
// 空狀態 SVG 插圖
// ════════════════════════════════════════════════════════════
function EmptyIllustration() {
  return (
    <svg width="160" height="140" viewBox="0 0 160 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="80" cy="125" rx="52" ry="8" fill="#E8DEDF" opacity="0.6"/>
      <rect x="30" y="28" width="100" height="82" rx="10" fill="#fff" stroke="#E5D8DA" strokeWidth="1.5"/>
      <rect x="30" y="28" width="100" height="22" rx="10" fill="#F3EDED"/>
      <rect x="30" y="40" width="100" height="10" fill="#F3EDED"/>
      <circle cx="48" cy="39" r="5" fill={T.accent} opacity="0.15"/>
      <circle cx="48" cy="39" r="2.5" fill={T.accent} opacity="0.6"/>
      <rect x="58" y="36" width="50" height="5" rx="2.5" fill="#D1C4C6"/>
      <rect x="42" y="62" width="8" height="8" rx="2" stroke="#D1C4C6" strokeWidth="1.5" fill="none"/>
      <rect x="56" y="63" width="48" height="5" rx="2.5" fill="#E5D8DA"/>
      <rect x="42" y="78" width="8" height="8" rx="2" stroke="#D1C4C6" strokeWidth="1.5" fill="none"/>
      <rect x="56" y="79" width="36" height="5" rx="2.5" fill="#E5D8DA"/>
      <rect x="42" y="94" width="8" height="8" rx="2" stroke="#D1C4C6" strokeWidth="1.5" fill="none"/>
      <rect x="56" y="95" width="42" height="5" rx="2.5" fill="#E5D8DA"/>
      <circle cx="113" cy="42" r="18" fill={T.accent} opacity="0.08"/>
      <path d="M107 42 L112 47 L119 37" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ════════════════════════════════════════════════════════════
// 任務列（單筆任務列表項目）
// ════════════════════════════════════════════════════════════
function TaskRow({ task, onToggleDone, onOpenDetail }) {
  const [hovered, setHovered] = useState(false);
  const isDone = task.status === 'done';
  const pri = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;
  const dueInfo = dueDateLabel(task.dueDate, task.status);
  const projBadge = projectBadgeColor(task.project?.name);

  // 從 localStorage 讀取 @mentions 與 deps
  const mentionCount = (() => {
    try {
      const comments = JSON.parse(localStorage.getItem(`xcloud-comments-${task.id}`) || '[]');
      return comments.filter(c => c.content && c.content.includes('@')).length;
    } catch { return 0; }
  })();

  const hasDeps = (() => {
    try {
      const deps = JSON.parse(localStorage.getItem(`xcloud-deps-${task.id}`) || '[]');
      return deps.length > 0;
    } catch { return false; }
  })();

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:       'flex',
        alignItems:    'center',
        gap:           10,
        padding:       '10px 16px',
        background:    hovered ? '#fdf6f7' : '#fff',
        borderBottom:  '1px solid #f3eded',
        transition:    'background .12s',
        cursor:        'default',
      }}
    >
      {/* 核取方塊 */}
      <div
        onClick={() => onToggleDone(task)}
        title={isDone ? '標記為未完成' : '標記為完成'}
        style={{
          width:        18, height: 18,
          borderRadius: '50%',
          border:       `2px solid ${isDone ? '#10b981' : '#d1d5db'}`,
          background:   isDone ? '#10b981' : 'transparent',
          cursor:       'pointer',
          flexShrink:   0,
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          transition:   'all .15s',
        }}
      >
        {isDone && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>

      {/* 任務名稱 */}
      <div
        onClick={() => onOpenDetail(task)}
        style={{
          flex:           1,
          fontSize:       '13px',
          fontWeight:     isDone ? 400 : 500,
          color:          isDone ? '#9ca3af' : '#111827',
          textDecoration: isDone ? 'line-through' : 'none',
          cursor:         'pointer',
          lineHeight:     1.4,
          minWidth:       0,
          overflow:       'hidden',
          textOverflow:   'ellipsis',
          whiteSpace:     'nowrap',
        }}
      >
        {task.title}
      </div>

      {/* 依賴標示 */}
      {hasDeps && (
        <span title="有相依任務" style={{ fontSize: '13px', opacity: .6 }}>⛓</span>
      )}

      {/* @Mention 徽章 */}
      {mentionCount > 0 && (
        <span style={{
          fontSize:     '10px', fontWeight: 700,
          background:   '#dbeafe', color: '#1d4ed8',
          padding:      '1px 6px', borderRadius: 10,
          whiteSpace:   'nowrap',
        }}>
          @{mentionCount}
        </span>
      )}

      {/* 專案徽章 */}
      {task.project && (
        <span style={{
          fontSize:    '11px', fontWeight: 600,
          background:  projBadge.bg, color: projBadge.color,
          padding:     '2px 8px', borderRadius: 4,
          whiteSpace:  'nowrap', flexShrink: 0,
        }}>
          {task.project.name}
        </span>
      )}

      {/* 優先度 */}
      <span style={{
        fontSize:   '11px', fontWeight: 600,
        background: pri.bg, color: pri.color,
        padding:    '2px 7px', borderRadius: 4,
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        {pri.label}
      </span>

      {/* 截止日期 */}
      {dueInfo && (
        <span style={{
          fontSize:   '11px', fontWeight: 600,
          color:      dueInfo.color,
          whiteSpace: 'nowrap', flexShrink: 0,
          minWidth:   62, textAlign: 'right',
        }}>
          {dueInfo.text}
        </span>
      )}

      {/* 指派人 Avatar */}
      {task.assignee && (
        <div
          title={task.assignee.name}
          style={{
            width:          26, height: 26,
            borderRadius:   '50%',
            background:     avatarColor(task.assignee.name),
            color:          '#fff',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            fontSize:       '11px', fontWeight: 700,
            flexShrink:     0,
          }}
        >
          {avatarChar(task.assignee.name)}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 新增任務行內列（Inline add row）
// ════════════════════════════════════════════════════════════
function InlineAddRow({ projects, onSave, onCancel }) {
  const [title, setTitle]       = useState('');
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [dueDate, setDueDate]   = useState('');
  const [priority, setPriority] = useState('medium');
  const [saving, setSaving]     = useState(false);
  const titleRef = useRef(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter' && title.trim()) handleSubmit();
  };

  const handleSubmit = async () => {
    if (!title.trim() || !projectId) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/${projectId}/tasks`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:    title.trim(),
          status:   'todo',
          priority,
          dueDate:  dueDate || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onSave(data.data);
    } catch (err) {
      // Fallback: treat as saved with mock id
      onSave({
        id: Date.now(), title: title.trim(),
        status: 'todo', priority,
        dueDate: dueDate || null,
        project: projects.find(p => String(p.id) === String(projectId)),
        assignee: { id: 1, name: '王大明' },
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      gap:            8,
      padding:        '8px 16px',
      background:     '#fff9f9',
      borderBottom:   `2px solid ${T.accent}`,
      flexWrap:       'wrap',
    }}>
      {/* 圓圈佔位 */}
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        border: `2px dashed ${T.accent}`, flexShrink: 0,
      }} />

      {/* 任務名稱輸入 */}
      <input
        ref={titleRef}
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="輸入任務名稱..."
        style={{
          flex: 1, minWidth: 160,
          border: 'none', outline: 'none',
          fontSize: '13px', fontWeight: 500,
          color: '#111827', background: 'transparent',
        }}
      />

      {/* 所屬專案 */}
      <select
        value={projectId}
        onChange={e => setProjectId(e.target.value)}
        style={{ fontSize: '12px', padding: '4px 6px', borderRadius: 5, border: '1px solid #e5e7eb' }}
      >
        <option value="">選擇專案</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      {/* 截止日期 */}
      <input
        type="date"
        value={dueDate}
        onChange={e => setDueDate(e.target.value)}
        style={{ fontSize: '12px', padding: '4px 6px', borderRadius: 5, border: '1px solid #e5e7eb' }}
      />

      {/* 優先度 */}
      <select
        value={priority}
        onChange={e => setPriority(e.target.value)}
        style={{ fontSize: '12px', padding: '4px 6px', borderRadius: 5, border: '1px solid #e5e7eb' }}
      >
        <option value="urgent">🔴 緊急</option>
        <option value="high">🟠 高</option>
        <option value="medium">🟡 中</option>
        <option value="low">⚪ 低</option>
      </select>

      {/* 確認 / 取消 */}
      <button
        onClick={handleSubmit}
        disabled={saving || !title.trim()}
        style={{
          padding: '4px 14px', borderRadius: 6,
          border: 'none', background: T.accent, color: '#fff',
          fontSize: '12px', fontWeight: 600, cursor: 'pointer',
          opacity: (!title.trim() || saving) ? .5 : 1,
        }}
      >
        {saving ? '...' : '新增'}
      </button>
      <button
        onClick={onCancel}
        style={{
          padding: '4px 10px', borderRadius: 6,
          border: '1px solid #d1d5db', background: '#fff',
          fontSize: '12px', cursor: 'pointer', color: '#6b7280',
        }}
      >
        取消
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 任務詳情側邊面板
// ════════════════════════════════════════════════════════════
function TaskDetailPanel({ task, projects, users, onClose, onSaved }) {
  const [form, setForm] = useState({
    title:       task.title,
    description: task.description || '',
    status:      task.status,
    priority:    task.priority,
    assigneeId:  task.assignee?.id || '',
    dueDate:     task.dueDate ? task.dueDate.slice(0, 10) : '',
    projectId:   task.project?.id || '',
  });
  const [saving, setSaving]     = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // 從 localStorage 讀取 mentions、deps、自訂欄位
  const comments = (() => {
    try { return JSON.parse(localStorage.getItem(`xcloud-comments-${task.id}`) || '[]'); }
    catch { return []; }
  })();
  const deps = (() => {
    try { return JSON.parse(localStorage.getItem(`xcloud-deps-${task.id}`) || '[]'); }
    catch { return []; }
  })();
  const customFields = (() => {
    try { return JSON.parse(localStorage.getItem('xcloud-custom-fields') || '[]'); }
    catch { return []; }
  })();

  const mentions = comments.filter(c => c.content && c.content.includes('@'));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/tasks/${task.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:      form.title.trim(),
          description: form.description,
          status:     form.status,
          priority:   form.priority,
          assigneeId: form.assigneeId ? parseInt(form.assigneeId) : null,
          dueDate:    form.dueDate || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '更新失敗');
      setSavedMsg('已儲存');
      setTimeout(() => setSavedMsg(''), 2000);
      onSaved({ ...task, ...form });
    } catch {
      // Optimistic update even if API fails
      setSavedMsg('已儲存（本機）');
      setTimeout(() => setSavedMsg(''), 2000);
      onSaved({ ...task, ...form });
    } finally {
      setSaving(false);
    }
  };

  const handleBlur = () => { handleSave(); };

  const pri = PRIORITY_MAP[form.priority] || PRIORITY_MAP.medium;

  return (
    <>
      {/* 遮罩 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,.25)',
        }}
      />

      {/* 面板本體 */}
      <div style={{
        position:  'fixed', top: 0, right: 0, bottom: 0,
        width:     480, zIndex: 1001,
        background: '#fff',
        boxShadow: '-4px 0 32px rgba(0,0,0,.12)',
        display:   'flex', flexDirection: 'column',
        animation: 'slideInRight .2s ease',
      }}>
        {/* 面板標題列 */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '16px 20px',
          borderBottom:   '1px solid #f3eded',
          background:     '#fdf8f8',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {task.project && (
              <span style={{
                fontSize: '11px', fontWeight: 600,
                background: projectBadgeColor(task.project.name).bg,
                color:      projectBadgeColor(task.project.name).color,
                padding:    '2px 8px', borderRadius: 4,
              }}>
                {task.project.name}
              </span>
            )}
            <span style={{ fontSize: '11px', color: '#9ca3af' }}>
              {STATUS_MAP[form.status]?.label || form.status}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {savedMsg && (
              <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>
                ✓ {savedMsg}
              </span>
            )}
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: 6,
                border: '1px solid #e5e7eb', background: '#fff',
                cursor: 'pointer', fontSize: '14px', color: '#6b7280',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* 面板內容（可捲動） */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* 任務標題 */}
          <textarea
            value={form.title}
            onChange={e => set('title', e.target.value)}
            onBlur={handleBlur}
            rows={2}
            style={{
              width:        '100%',
              border:       'none',
              outline:      'none',
              fontSize:     '18px',
              fontWeight:   700,
              color:        '#111827',
              resize:       'none',
              lineHeight:   1.4,
              boxSizing:    'border-box',
              background:   'transparent',
              marginBottom: 16,
              padding:      0,
              textDecoration: form.status === 'done' ? 'line-through' : 'none',
            }}
          />

          {/* 欄位格狀佈局 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>

            {/* 狀態 */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>狀態</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                onBlur={handleBlur}
                style={{ ...inputStyle, fontSize: '12px' }}
              >
                <option value="todo">📋 待辦</option>
                <option value="in_progress">⚡ 進行中</option>
                <option value="review">🔍 審核中</option>
                <option value="done">✅ 已完成</option>
              </select>
            </div>

            {/* 優先度 */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>優先度</label>
              <select
                value={form.priority}
                onChange={e => set('priority', e.target.value)}
                onBlur={handleBlur}
                style={{ ...inputStyle, fontSize: '12px' }}
              >
                <option value="urgent">🔴 緊急</option>
                <option value="high">🟠 高</option>
                <option value="medium">🟡 中</option>
                <option value="low">⚪ 低</option>
              </select>
            </div>

            {/* 截止日期 */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>截止日期</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={e => set('dueDate', e.target.value)}
                onBlur={handleBlur}
                style={{ ...inputStyle, fontSize: '12px' }}
              />
            </div>

            {/* 指派給 */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>指派給</label>
              <select
                value={form.assigneeId}
                onChange={e => set('assigneeId', e.target.value)}
                onBlur={handleBlur}
                style={{ ...inputStyle, fontSize: '12px' }}
              >
                <option value="">未指派</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>

          </div>

          {/* 描述 */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6 }}>說明</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              onBlur={handleBlur}
              rows={5}
              placeholder="輸入任務說明..."
              style={{
                ...inputStyle,
                resize:     'vertical',
                lineHeight: 1.6,
                fontSize:   '13px',
                color:      '#374151',
              }}
            />
          </div>

          {/* 自訂欄位 */}
          {customFields.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>自訂欄位</div>
              {customFields.map((cf, i) => (
                <div key={i} style={{
                  display:       'flex',
                  alignItems:    'center',
                  justifyContent: 'space-between',
                  padding:       '6px 10px',
                  background:    '#faf9f9',
                  borderRadius:  6,
                  marginBottom:  4,
                  fontSize:      '12px',
                }}>
                  <span style={{ color: '#6b7280', fontWeight: 500 }}>{cf.name || cf.label || cf.key}</span>
                  <span style={{ color: '#374151' }}>{cf.value || '—'}</span>
                </div>
              ))}
            </div>
          )}

          {/* @Mentions */}
          {mentions.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>
                @提及 ({mentions.length})
              </div>
              {mentions.map((m, i) => (
                <div key={i} style={{
                  padding:     '8px 12px',
                  background:  '#eff6ff',
                  borderRadius: 8,
                  marginBottom: 6,
                  fontSize:    '12px',
                  color:       '#1e40af',
                  borderLeft:  '3px solid #3b82f6',
                }}>
                  {m.content}
                </div>
              ))}
            </div>
          )}

          {/* 相依任務 */}
          {deps.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>
                ⛓ 相依任務 ({deps.length})
              </div>
              {deps.map((dep, i) => (
                <div key={i} style={{
                  padding:      '8px 12px',
                  background:   '#f9fafb',
                  borderRadius: 8,
                  marginBottom: 6,
                  fontSize:     '12px',
                  color:        '#374151',
                  border:       '1px solid #e5e7eb',
                }}>
                  {dep.title || dep.name || `任務 #${dep.id || dep}`}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 面板底部按鈕列 */}
        <div style={{
          padding:     '14px 20px',
          borderTop:   '1px solid #f3eded',
          display:     'flex',
          gap:         10,
          justifyContent: 'flex-end',
          background:  '#fdf8f8',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 7,
              border: '1px solid #d1d5db', background: '#fff',
              fontSize: '13px', cursor: 'pointer', color: '#374151',
            }}
          >
            關閉
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 20px', borderRadius: 7,
              border: 'none', background: T.accent, color: '#fff',
              fontSize: '13px', fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? .7 : 1,
            }}
          >
            {saving ? '儲存中...' : '儲存'}
          </button>
        </div>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════
// 統計卡片
// ════════════════════════════════════════════════════════════
function StatCard({ label, value, bg, color }) {
  return (
    <div style={{
      background:    bg,
      borderRadius:  10,
      padding:       '12px 18px',
      minWidth:      90,
      textAlign:     'center',
      flex:          '1 1 90px',
    }}>
      <div style={{ fontSize: '22px', fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: 3, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 我的任務主頁面
// ════════════════════════════════════════════════════════════
export default function MyTasksPage() {
  const [tasks,       setTasks]       = useState([]);
  const [projects,    setProjects]    = useState([]);
  const [users,       setUsers]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [usingMock,   setUsingMock]   = useState(false);

  const [activeSection, setActiveSection] = useState('all');
  const [sortBy,        setSortBy]        = useState('dueDate');
  const [showAddRow,    setShowAddRow]    = useState(false);
  const [detailTask,    setDetailTask]    = useState(null);

  // Toast
  const [toast, setToast] = useState('');
  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  // ── 資料載入 ───────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, usersRes] = await Promise.all([
        fetch(`${API}/tasks?companyId=2`),
        fetch(`${API}/users?companyId=2`),
      ]);
      const tasksData = await tasksRes.json();
      const usersData = await usersRes.json();

      if (!tasksData.success) throw new Error(tasksData.error || 'API error');

      const allTasks = [
        ...(tasksData.data?.kanban?.todo        || []),
        ...(tasksData.data?.kanban?.in_progress || []),
        ...(tasksData.data?.kanban?.review      || []),
        ...(tasksData.data?.kanban?.done        || []),
      ];

      setTasks(allTasks);
      setProjects(tasksData.data?.projects || []);
      setUsers(usersData.data || []);
      setUsingMock(false);
    } catch {
      // Fallback to mock data
      setTasks(MOCK_TASKS);
      setProjects(MOCK_PROJECTS);
      setUsers([{ id: 1, name: '王大明' }, { id: 2, name: '李小華' }]);
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── 篩選 & 排序 ────────────────────────────────────────────
  const filteredTasks = (() => {
    let list = [...tasks];

    switch (activeSection) {
      case 'today':
        list = list.filter(t => isToday(t.dueDate) && t.status !== 'done');
        break;
      case 'week':
        list = list.filter(t => isThisWeek(t.dueDate) && t.status !== 'done');
        break;
      case 'overdue':
        list = list.filter(t => isOverdue(t.dueDate, t.status));
        break;
      case 'done':
        list = list.filter(t => t.status === 'done');
        break;
      default:
        break; // all
    }

    list.sort((a, b) => {
      if (sortBy === 'dueDate') {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      }
      if (sortBy === 'priority') {
        return (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
      }
      if (sortBy === 'project') {
        return (a.project?.name || '').localeCompare(b.project?.name || '', 'zh-TW');
      }
      return 0;
    });

    return list;
  })();

  // ── 統計 ────────────────────────────────────────────────────
  const totalCount    = tasks.length;
  const todayCount    = tasks.filter(t => isToday(t.dueDate) && t.status !== 'done').length;
  const overdueCount  = tasks.filter(t => isOverdue(t.dueDate, t.status)).length;
  const doneWeekCount = tasks.filter(t => isDoneThisWeek(t)).length;

  // ── 切換完成狀態 ─────────────────────────────────────────────
  const handleToggleDone = async (task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus, updatedAt: new Date().toISOString() } : t));
    if (detailTask?.id === task.id) setDetailTask(d => ({ ...d, status: newStatus }));

    try {
      await fetch(`${API}/tasks/${task.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      });
    } catch { /* keep optimistic */ }

    showToast(newStatus === 'done' ? '✓ 任務已完成' : '↩ 任務已重新開啟');
  };

  // ── 新增任務成功回呼 ─────────────────────────────────────────
  const handleTaskAdded = (newTask) => {
    setTasks(prev => [newTask, ...prev]);
    setShowAddRow(false);
    showToast('✓ 任務已新增');
  };

  // ── 任務詳情儲存回呼 ─────────────────────────────────────────
  const handleDetailSaved = (updatedTask) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? { ...t, ...updatedTask } : t));
  };

  // ── 渲染 ─────────────────────────────────────────────────────
  return (
    <div style={{
      height:         '100%',
      display:        'flex',
      flexDirection:  'column',
      background:     T.pageBg,
      fontFamily:     '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position:  'fixed', bottom: 28, right: 28, zIndex: 9999,
          background: '#1e293b', color: '#fff',
          padding:   '11px 20px', borderRadius: 10,
          fontSize:  '13px', fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,.25)',
          animation: 'fadeIn .2s ease',
        }}>
          {toast}
        </div>
      )}

      {/* ── 頁面標題列 ─────────────────────────────────────── */}
      <div style={{
        background:   '#fff',
        borderBottom: '1px solid #e8e0e1',
        padding:      '18px 28px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#111827', letterSpacing: '-.3px' }}>
              我的任務
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#9ca3af' }}>
              跨所有專案的個人任務總覽
              {usingMock && (
                <span style={{
                  marginLeft: 8, fontSize: '10px',
                  background: '#fef3c7', color: '#92400e',
                  padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                }}>
                  示範資料
                </span>
              )}
            </p>
          </div>

          {/* 操作列 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* 排序 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>排序：</span>
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setSortBy(opt.id)}
                  style={{
                    padding:      '5px 10px',
                    borderRadius: 6,
                    border:       `1px solid ${sortBy === opt.id ? T.accent : '#e5e7eb'}`,
                    background:   sortBy === opt.id ? T.accentL : '#fff',
                    color:        sortBy === opt.id ? T.accent : '#374151',
                    fontSize:     '12px',
                    fontWeight:   sortBy === opt.id ? 700 : 400,
                    cursor:       'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* 新增任務 */}
            <button
              onClick={() => setShowAddRow(true)}
              style={{
                padding:      '8px 16px',
                borderRadius: 8,
                border:       'none',
                background:   T.accent,
                color:        '#fff',
                fontSize:     '13px',
                fontWeight:   700,
                cursor:       'pointer',
                display:      'flex',
                alignItems:   'center',
                gap:          5,
              }}
            >
              <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span> 新增任務
            </button>
          </div>
        </div>

        {/* 統計卡片 */}
        <div style={{ display: 'flex', gap: 10 }}>
          <StatCard label="總任務"   value={totalCount}    bg="#f3f4f6"         color="#374151" />
          <StatCard label="今日到期" value={todayCount}    bg="#fff7ed"         color="#ea580c" />
          <StatCard label="已逾期"   value={overdueCount}  bg="#fef2f2"         color={T.accent} />
          <StatCard label="本週完成" value={doneWeekCount} bg="#f0fdf4"         color="#15803d" />
        </div>
      </div>

      {/* ── 分類標籤列 ─────────────────────────────────────── */}
      <div style={{
        background:   '#fff',
        borderBottom: '1px solid #e8e0e1',
        padding:      '0 28px',
        display:      'flex',
        gap:          2,
      }}>
        {SECTIONS.map(s => {
          const isActive = activeSection === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                padding:      '10px 14px',
                border:       'none',
                borderBottom: `2px solid ${isActive ? T.accent : 'transparent'}`,
                background:   'transparent',
                color:        isActive ? T.accent : '#6b7280',
                fontSize:     '13px',
                fontWeight:   isActive ? 700 : 400,
                cursor:       'pointer',
                transition:   'all .12s',
                display:      'flex',
                alignItems:   'center',
                gap:          5,
              }}
            >
              <span style={{ fontSize: '12px' }}>{s.icon}</span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* ── 任務列表主體 ────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px' }}>
        <div style={{
          background:   '#fff',
          borderRadius: 12,
          border:       '1px solid #e8e0e1',
          overflow:     'hidden',
        }}>
          {/* 列表標頭 */}
          <div style={{
            display:       'flex',
            alignItems:    'center',
            padding:       '8px 16px',
            background:    '#faf8f8',
            borderBottom:  '1px solid #f3eded',
            gap:           10,
          }}>
            <div style={{ width: 18, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: '11px', fontWeight: 700, color: '#9ca3af', letterSpacing: '.5px' }}>任務名稱</div>
            <div style={{ width: 110, fontSize: '11px', fontWeight: 700, color: '#9ca3af', textAlign: 'right' }}>專案</div>
            <div style={{ width: 46, fontSize: '11px', fontWeight: 700, color: '#9ca3af', textAlign: 'right' }}>優先度</div>
            <div style={{ width: 72, fontSize: '11px', fontWeight: 700, color: '#9ca3af', textAlign: 'right' }}>截止日期</div>
            <div style={{ width: 26, flexShrink: 0 }} />
          </div>

          {/* 新增任務行內列 */}
          {showAddRow && (
            <InlineAddRow
              projects={projects.length ? projects : MOCK_PROJECTS}
              onSave={handleTaskAdded}
              onCancel={() => setShowAddRow(false)}
            />
          )}

          {/* 任務列表 */}
          {loading ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: '28px', marginBottom: 10, opacity: .4 }}>⏳</div>
              <div style={{ fontSize: '13px' }}>載入中...</div>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div style={{ padding: '64px 20px', textAlign: 'center' }}>
              <EmptyIllustration />
              <div style={{ marginTop: 16, fontSize: '15px', fontWeight: 600, color: '#374151' }}>
                {activeSection === 'done'
                  ? '本週尚未完成任何任務'
                  : activeSection === 'overdue'
                  ? '太棒了！沒有逾期的任務'
                  : '目前沒有指派給您的任務'}
              </div>
              <div style={{ marginTop: 6, fontSize: '13px', color: '#9ca3af' }}>
                {activeSection === 'all' ? '點擊「+ 新增任務」開始建立您的第一個任務' : '切換到「全部」查看所有任務'}
              </div>
              {activeSection === 'all' && (
                <button
                  onClick={() => setShowAddRow(true)}
                  style={{
                    marginTop:    16,
                    padding:      '9px 22px',
                    borderRadius: 8,
                    border:       `1px solid ${T.accent}`,
                    background:   '#fff',
                    color:        T.accent,
                    fontSize:     '13px',
                    fontWeight:   600,
                    cursor:       'pointer',
                  }}
                >
                  瀏覽專案
                </button>
              )}
            </div>
          ) : (
            filteredTasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                onToggleDone={handleToggleDone}
                onOpenDetail={setDetailTask}
              />
            ))
          )}
        </div>

        {/* 任務數量提示 */}
        {!loading && filteredTasks.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 14, fontSize: '12px', color: '#9ca3af' }}>
            共 {filteredTasks.length} 筆任務
          </div>
        )}
      </div>

      {/* ── 任務詳情面板 ────────────────────────────────────── */}
      {detailTask && (
        <TaskDetailPanel
          task={detailTask}
          projects={projects.length ? projects : MOCK_PROJECTS}
          users={users}
          onClose={() => setDetailTask(null)}
          onSaved={(updated) => {
            handleDetailSaved(updated);
          }}
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
