/**
 * MyTasksPage.jsx
 * 我的任務 — Asana 精確對齊版本
 * API: http://localhost:3010
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ── Design Tokens ────────────────────────────────────────────
const C = {
  accent: '#C41230',
  accentHover: '#a30f28',
  accentLight: '#fceef0',
  pageBg: '#F7F2F2',
  white: '#ffffff',
  gray50: '#f9f9f9',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  green: '#22c55e',
  orange: '#f97316',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  teal: '#14b8a6',
};

const API = '';

// ── Date utilities ────────────────────────────────────────────
function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d < todayStart();
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d.getTime() === todayStart().getTime();
}

function isNextWeek(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const t = todayStart();
  const next7 = new Date(t);
  next7.setDate(t.getDate() + 7);
  return d > t && d <= next7;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (isToday(dateStr)) return `今天`;
  return `${m} 月 ${day} 日`;
}

// ── Demo data ────────────────────────────────────────────────
const TODAY_STR = new Date().toISOString().split('T')[0];
const TOMORROW_STR = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
})();
const NEXT5_STR = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  return d.toISOString().split('T')[0];
})();
const LATER_STR = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split('T')[0];
})();

const DEMO_TASKS = [
  { id: 'd1', title: '排定啟動會議', dueDate: TODAY_STR, project: 'xCloudinfo', projectColor: C.blue, assignee: 'JL', section: 'recent' },
  { id: 'd2', title: '草擬專案簡介', dueDate: TOMORROW_STR, project: 'xCloudinfo', projectColor: C.blue, assignee: 'JL', section: 'recent' },
  { id: 'd3', title: '確認需求規格書', dueDate: TODAY_STR, project: 'PMIS 開發', projectColor: C.purple, assignee: 'JL', section: 'today' },
  { id: 'd4', title: '更新設計稿', dueDate: TODAY_STR, project: 'UI 設計', projectColor: C.teal, assignee: 'JL', section: 'today' },
  { id: 'd5', title: '進行程式碼審查', dueDate: NEXT5_STR, project: 'PMIS 開發', projectColor: C.purple, assignee: 'JL', section: 'week' },
  { id: 'd6', title: '撰寫單元測試', dueDate: NEXT5_STR, project: 'PMIS 開發', projectColor: C.purple, assignee: 'JL', section: 'week' },
  { id: 'd7', title: '部署至測試環境', dueDate: LATER_STR, project: 'DevOps', projectColor: C.orange, assignee: 'JL', section: 'later' },
  { id: 'd8', title: '準備季度報告', dueDate: LATER_STR, project: 'xCloudinfo', projectColor: C.blue, assignee: 'JL', section: 'later' },
];

// ── File helpers ───────────────────────────────────────────────
function formatFileSize(bytes) {
  const n = Number(bytes);
  if (n === 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fileToRecord(file) {
  const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
  return {
    id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    ext,
    size: formatFileSize(file.size),
    updatedAt: '今天',
    uploader: 'JL',
    taskTitle: '',
    project: '',
    projectColor: '',
    url: URL.createObjectURL(file),
    mimeType: file.type,
    isImage,
    raw: file,
  };
}

const FILE_TYPE_META = {
  pdf:  { label: 'PDF',    color: '#DC2626', bg: '#FEF2F2' },
  docx: { label: 'Word',   color: '#2563EB', bg: '#EFF6FF' },
  xlsx: { label: 'Excel',  color: '#16A34A', bg: '#F0FDF4' },
  pptx: { label: 'PPT',    color: '#D97706', bg: '#FFFBEB' },
  png:  { label: '圖片',    color: '#7C3AED', bg: '#F5F3FF' },
  jpg:  { label: '圖片',    color: '#7C3AED', bg: '#F5F3FF' },
  fig:  { label: 'Figma',  color: '#EC4899', bg: '#FDF2F8' },
  zip:  { label: '壓縮檔',  color: '#6B7280', bg: '#F9FAFB' },
  md:   { label: 'MD',     color: '#374151', bg: '#F3F4F6' },
  html: { label: 'HTML',   color: '#0891B2', bg: '#ECFEFF' },
};

// Classify tasks into sections（已完成任務不顯示在清單中）
function classifyTasks(tasks) {
  const sections = { recent: [], today: [], week: [], later: [] };
  tasks.forEach(t => {
    // Bug #T-01 修復：過濾 done 狀態任務，我的任務頁只顯示待辦事項
    if (t.status === 'done' || t.status === 'completed') return;
    if (t.section) {
      // API 回傳的 section 欄位對映：upcoming → recent, next_week → week
      const sectionMap = { upcoming: 'recent', next_week: 'week', today: 'today', later: 'later' };
      const mapped = sectionMap[t.section] || t.section;
      // Bug 修復：只推入 sections 物件已知的 key，未知 section 一律歸入 later
      const target = sections.hasOwnProperty(mapped) ? mapped : 'later';
      sections[target].push(t);
    } else if (!t.dueDate) {
      sections.recent.push(t);
    } else if (isToday(t.dueDate)) {
      sections.today.push(t);
    } else if (isNextWeek(t.dueDate)) {
      sections.week.push(t);
    } else {
      sections.later.push(t);
    }
  });
  return sections;
}

// ── Avatar component ─────────────────────────────────────────
function Avatar({ name = 'JL', size = 28, color = C.accent }) {
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, color: C.white,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 600, flexShrink: 0,
      userSelect: 'none',
    }}>
      {initials}
    </div>
  );
}

// ── Checkbox circle ──────────────────────────────────────────
function TaskCircle({ done, onToggle }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={e => { e.stopPropagation(); onToggle(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
        border: done ? 'none' : `2px solid ${hovered ? C.green : C.gray300}`,
        background: done ? C.green : (hovered ? '#f0fdf4' : 'transparent'),
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      {(done || hovered) && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4l3 3 5-6" stroke={done ? C.white : C.green} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

// ── Project badge ────────────────────────────────────────────
function ProjectBadge({ name, color }) {
  if (!name) return <span style={{ color: C.gray300, fontSize: 13 }}>—</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color || C.gray400, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: C.gray600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{name}</span>
    </div>
  );
}

// ── Add View Popup ───────────────────────────────────────────
function AddViewPopup({ onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const popular = [
    { icon: '≡', label: '清單' },
    { icon: '⊞', label: '看板' },
    { icon: '📅', label: '行事曆' },
  ];
  const others = [
    { icon: '📊', label: '儀表板', badge: '新的' },
    { icon: '📝', label: '備註' },
  ];

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 200,
      background: C.white, border: `1px solid ${C.gray200}`,
      borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      width: 220, padding: '8px 0', marginTop: 4,
    }}>
      <div style={{ padding: '4px 12px 6px', fontSize: 11, fontWeight: 600, color: C.gray400, textTransform: 'uppercase', letterSpacing: '0.05em' }}>熱門</div>
      {popular.map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', cursor: 'pointer', fontSize: 14, color: C.gray700 }}
          onMouseEnter={e => e.currentTarget.style.background = C.gray50}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{ fontSize: 16 }}>{item.icon}</span>
          <span>{item.label}</span>
        </div>
      ))}
      <div style={{ height: 1, background: C.gray100, margin: '6px 0' }} />
      <div style={{ padding: '4px 12px 6px', fontSize: 11, fontWeight: 600, color: C.gray400, textTransform: 'uppercase', letterSpacing: '0.05em' }}>其他</div>
      {others.map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', cursor: 'pointer', fontSize: 14, color: C.gray700 }}
          onMouseEnter={e => e.currentTarget.style.background = C.gray50}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{ fontSize: 16 }}>{item.icon}</span>
          <span>{item.label}</span>
          {item.badge && <span style={{ fontSize: 10, background: C.accentLight, color: C.accent, borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>{item.badge}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Add Task Type Dropdown ───────────────────────────────────
function AddTaskDropdown({ onClose, onAdd }) {
  const ref = useRef(null);
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const types = [
    { icon: '⊙', label: '任務', sub: '', type: 'task' },
    { icon: '✓', label: '核准', sub: '', type: 'approval' },
    { icon: '◇', label: '里程碑', sub: '⇧ Tab M', type: 'milestone' },
    { icon: '≡', label: '區段', sub: 'Tab N', type: 'section' },
  ];
  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 300,
      background: C.white, border: `1px solid ${C.gray200}`,
      borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
      width: 210, padding: '4px 0', marginTop: 2,
    }}>
      {types.map(item => (
        <div key={item.type} onClick={() => { onAdd(item.type); onClose(); }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', cursor: 'pointer', fontSize: 14, color: C.gray700 }}
          onMouseEnter={e => e.currentTarget.style.background = C.gray50}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15 }}>{item.icon}</span>
            <span>{item.label}</span>
          </div>
          {item.sub && <span style={{ fontSize: 11, color: C.gray400 }}>{item.sub}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Side Panel ───────────────────────────────────────────────
function SidePanel({ task, onClose, onUpdate, onDelete }) {
  const [tab, setTab] = useState('detail');
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description || '');
  const [done, setDone] = useState(task.done || false);
  const [dueDate, setDueDate] = useState(task.dueDate || '');
  const [priority, setPriority] = useState(task.priority || '');
  const [comment, setComment] = useState('');

  const customFields = (() => {
    try {
      return JSON.parse(localStorage.getItem('xcloud-custom-fields') || '[]');
    } catch { return []; }
  })();

  const panelStyle = {
    position: 'fixed', top: 0, right: 0, bottom: 0,
    width: 500, background: C.white,
    boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
    zIndex: 500, display: 'flex', flexDirection: 'column',
    animation: 'slideIn 0.2s ease',
  };

  const handleSave = useCallback(() => {
    onUpdate({ ...task, title, description: desc, done, dueDate, priority });
  }, [task, title, desc, done, dueDate, priority, onUpdate]);

  useEffect(() => {
    setTitle(task.title);
    setDesc(task.description || '');
    setDone(task.done || false);
    setDueDate(task.dueDate || '');
    setPriority(task.priority || '');
    setTab('detail');
  }, [task.id]);

  const tabItems = ['detail', 'subtask', 'history'];
  const tabLabels = { detail: '詳情', subtask: '子任務', history: '歷史記錄' };

  return (
    <>
      <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
      {/* Overlay */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 499, background: 'transparent' }} />
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        {/* Panel Header */}
        <div style={{ padding: '14px 20px 0', borderBottom: `1px solid ${C.gray100}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
            <button onClick={() => { setDone(!done); handleSave(); }} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
              background: done ? '#f0fdf4' : C.white, color: done ? C.green : C.gray600,
              border: `1px solid ${done ? C.green : C.gray300}`, borderRadius: 6,
              cursor: 'pointer', fontSize: 13, fontWeight: 500, flexShrink: 0,
            }}>
              {done ? '✓ 已完成' : '⊙ 標記完成'}
            </button>
            <div style={{ flex: 1 }} />
            {onDelete && (
              <button onClick={() => {
                if (window.confirm('確定要刪除此任務嗎？')) {
                  onDelete(task.id);
                  onClose();
                }
              }} style={{
                background: 'none', border: '1px solid #fca5a5', cursor: 'pointer',
                color: '#ef4444', fontSize: 13, padding: '4px 10px', borderRadius: 6,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                🗑 刪除
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gray400, fontSize: 20, padding: '2px 6px', lineHeight: 1 }}>×</button>
          </div>

          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={handleSave}
            style={{
              width: '100%', border: 'none', outline: 'none', fontSize: 18,
              fontWeight: 600, color: C.gray800, padding: '0 0 12px',
              background: 'transparent', boxSizing: 'border-box',
            }}
          />

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0 }}>
            {tabItems.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '8px 16px', background: 'none', border: 'none',
                borderBottom: `2px solid ${tab === t ? C.accent : 'transparent'}`,
                color: tab === t ? C.accent : C.gray500,
                cursor: 'pointer', fontSize: 14, fontWeight: tab === t ? 600 : 400,
                marginBottom: -1,
              }}>
                {tabLabels[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Panel Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {tab === 'detail' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {/* Fields */}
              {/* 負責人（唯讀） */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.gray100}` }}>
                <div style={{ width: 120, fontSize: 13, color: C.gray500, flexShrink: 0 }}>負責人</div>
                <div style={{ flex: 1, fontSize: 14, color: C.gray700 }}>
                  {typeof task.assignee === 'object' ? (task.assignee?.name || '—') : (task.assignee || '—')}
                </div>
              </div>
              {/* 截止日期（可編輯） */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.gray100}` }}>
                <div style={{ width: 120, fontSize: 13, color: C.gray500, flexShrink: 0 }}>截止日期</div>
                <div style={{ flex: 1 }}>
                  <input
                    type="date"
                    value={dueDate ? dueDate.substring(0, 10) : ''}
                    onChange={e => setDueDate(e.target.value)}
                    onBlur={handleSave}
                    style={{
                      border: `1px solid ${C.gray200}`, borderRadius: 5, padding: '4px 8px',
                      fontSize: 13, color: C.gray700, outline: 'none', cursor: 'pointer',
                      background: 'white',
                    }}
                  />
                </div>
              </div>
              {/* 專案（唯讀） */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.gray100}` }}>
                <div style={{ width: 120, fontSize: 13, color: C.gray500, flexShrink: 0 }}>專案</div>
                <div style={{ flex: 1, fontSize: 14, color: C.gray700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {task.projectColor && <div style={{ width: 8, height: 8, borderRadius: '50%', background: task.projectColor }} />}
                  {typeof task.project === 'object' ? (task.project?.name || '—') : (task.project || '—')}
                </div>
              </div>
              {/* 優先度（可編輯） */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.gray100}` }}>
                <div style={{ width: 120, fontSize: 13, color: C.gray500, flexShrink: 0 }}>優先度</div>
                <div style={{ flex: 1 }}>
                  <select
                    value={priority}
                    onChange={e => { setPriority(e.target.value); }}
                    onBlur={handleSave}
                    style={{
                      border: `1px solid ${C.gray200}`, borderRadius: 5, padding: '4px 8px',
                      fontSize: 13, color: C.gray700, outline: 'none', cursor: 'pointer',
                      background: 'white',
                    }}
                  >
                    <option value="">—</option>
                    <option value="urgent">緊急</option>
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, color: C.gray500, marginBottom: 8 }}>說明</div>
                <textarea
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  onBlur={handleSave}
                  placeholder="新增說明..."
                  rows={4}
                  style={{
                    width: '100%', border: `1px solid ${C.gray200}`, borderRadius: 6,
                    padding: '10px 12px', fontSize: 14, color: C.gray700,
                    resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Custom fields */}
              {customFields.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, color: C.gray500, marginBottom: 8, fontWeight: 600 }}>自訂欄位</div>
                  {customFields.map((cf, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.gray100}` }}>
                      <div style={{ width: 120, fontSize: 13, color: C.gray500 }}>{cf.name || cf.label || `欄位 ${i + 1}`}</div>
                      <div style={{ flex: 1, fontSize: 14, color: C.gray400 }}>—</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'subtask' && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: C.gray400, fontSize: 14 }}>
              尚無子任務
            </div>
          )}

          {tab === 'history' && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: C.gray400, fontSize: 14 }}>
              尚無歷史記錄
            </div>
          )}
        </div>

        {/* Comment Box */}
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.gray100}`, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <Avatar name="JL" size={28} />
          <div style={{ flex: 1, border: `1px solid ${C.gray200}`, borderRadius: 8, padding: '8px 12px', background: C.gray50 }}>
            <input
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="新增留言..."
              style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: C.gray700 }}
            />
          </div>
          {comment && (
            <button onClick={() => setComment('')} style={{ padding: '6px 14px', background: C.accent, color: C.white, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              送出
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Inline Add Task Input ─────────────────────────────────────
function InlineAddTask({ onAdd, onCancel }) {
  const [val, setVal] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function submit() {
    const trimmed = val.trim();
    if (trimmed) onAdd(trimmed);
    else onCancel();
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px 6px 36px', borderBottom: `1px solid ${C.gray100}` }}>
      <TaskCircle done={false} onToggle={() => {}} />
      <input
        ref={inputRef}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="任務名稱"
        style={{
          flex: 1, border: 'none', outline: 'none', fontSize: 14,
          color: C.gray800, background: 'transparent', padding: '4px 0',
        }}
      />
      <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gray400, fontSize: 18 }}>×</button>
    </div>
  );
}

// ── Task Row ─────────────────────────────────────────────────
function TaskRow({ task, done, onToggle, onOpen, optionsConfig = {} }) {
  const { showDueDate = true, showAssignee = true, showProject = true, showVisibility = true } = optionsConfig;
  const [hovered, setHovered] = useState(false);
  const overdue = isOverdue(task.dueDate) && !done;
  const dateLabel = task.dueDate ? formatDate(task.dueDate) : '';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center',
        background: hovered ? C.gray50 : C.white,
        borderBottom: `1px solid ${C.gray100}`,
        minHeight: 40, cursor: 'pointer',
        transition: 'background 0.1s',
      }}
    >
      {/* Name column */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', minWidth: 0 }}>
        <TaskCircle done={done} onToggle={onToggle} />
        <span
          onClick={() => onOpen(task)}
          style={{
            fontSize: 14, color: done ? C.gray400 : C.gray800,
            textDecoration: done ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {task.title}
        </span>
      </div>

      {/* Due date */}
      {showDueDate && (
        <div style={{ width: 120, flexShrink: 0, fontSize: 13, color: overdue ? C.accent : C.gray500, padding: '0 8px' }}>
          {dateLabel}
        </div>
      )}

      {/* Collaborators */}
      {showAssignee && (
        <div style={{ width: 100, flexShrink: 0, padding: '0 8px', display: 'flex', alignItems: 'center' }}>
          {task.assignee ? (
            <Avatar name={typeof task.assignee === 'object' ? (task.assignee?.name || '??') : task.assignee} size={22} />
          ) : (
            <span style={{ fontSize: 12, color: C.gray300 }}>+</span>
          )}
        </div>
      )}

      {/* Project */}
      {showProject && (
        <div style={{ width: 140, flexShrink: 0, padding: '0 8px' }}>
          <ProjectBadge
            name={typeof task.project === 'object' ? (task.project?.name || null) : task.project}
            color={task.projectColor}
          />
        </div>
      )}

      {/* Visibility */}
      {showVisibility && (
        <div style={{ width: 130, flexShrink: 0, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.gray400 }}>
          🔒 <span>我的工作空間</span>
        </div>
      )}
    </div>
  );
}

// ── Section ──────────────────────────────────────────────────
function Section({ title, tasks, doneSet, onToggle, onOpen, onAdd, optionsConfig = {} }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [adding, setAdding] = useState(false);

  return (
    <div>
      {/* Section header */}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px 6px',
          borderBottom: `2px solid ${C.gray100}`,
          background: C.white,
        }}
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 12, color: C.gray500, lineHeight: 1 }}
        >
          {collapsed ? '▶' : '▼'}
        </button>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.gray700 }}>{title}</span>
        <div style={{ flex: 1 }} />
        {hovered && !collapsed && (
          <button
            onClick={() => setAdding(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: C.gray400, padding: '2px 6px' }}
          >
            + 新增任務...
          </button>
        )}
      </div>

      {/* Tasks */}
      {!collapsed && (
        <>
          {tasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              done={doneSet.has(task.id)}
              onToggle={() => onToggle(task.id)}
              onOpen={onOpen}
              optionsConfig={optionsConfig}
            />
          ))}

          {/* Inline add */}
          {adding ? (
            <InlineAddTask
              onAdd={title => { onAdd(title, 'task'); setAdding(false); }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <div
              onClick={() => setAdding(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 8px 36px', cursor: 'pointer', color: C.gray400, fontSize: 13 }}
              onMouseEnter={e => e.currentTarget.style.color = C.gray600}
              onMouseLeave={e => e.currentTarget.style.color = C.gray400}
            >
              + 新增任務...
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Table Header ─────────────────────────────────────────────
function TableHeader({ optionsConfig = {} }) {
  const { showDueDate = true, showAssignee = true, showProject = true, showVisibility = true } = optionsConfig;
  const thStyle = (w, extra = {}) => ({
    width: w, flexShrink: 0, fontSize: 12, fontWeight: 600,
    color: C.gray500, padding: '8px 8px', ...extra,
  });
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      background: C.white, borderBottom: `1px solid ${C.gray200}`,
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div style={{ ...thStyle(undefined, { flex: 1, paddingLeft: 44 }) }}>名稱</div>
      {showDueDate && <div style={thStyle(120)}>截止日期</div>}
      {showAssignee && <div style={thStyle(100)}>協作者</div>}
      {showProject && <div style={thStyle(140)}>專案</div>}
      {showVisibility && <div style={thStyle(130)}>任務可見度</div>}
      <div style={{ width: 30, flexShrink: 0, cursor: 'pointer', textAlign: 'center', fontSize: 16, color: C.gray400, padding: '8px 4px' }}>+</div>
    </div>
  );
}

// ── Kanban Card ───────────────────────────────────────────────
function KanbanCard({ task, done, onToggle, onOpen, onDragStart, onDragEnd }) {
  const [hovered, setHovered] = useState(false);
  const overdue = isOverdue(task.dueDate) && !done;
  const priorityColor = { urgent: '#DC2626', high: '#F97316', medium: '#3B82F6', low: '#22C55E' };
  const pColor = priorityColor[task.priority] || null;

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(task); }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(task)}
      style={{
        background: C.white,
        border: `1px solid ${hovered ? C.gray300 : C.gray200}`,
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'pointer',
        boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'all 0.15s',
        opacity: done ? 0.55 : 1,
        userSelect: 'none',
      }}
    >
      {/* Priority stripe */}
      {pColor && (
        <div style={{ width: 28, height: 3, borderRadius: 2, background: pColor, marginBottom: 8 }} />
      )}

      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div style={{ paddingTop: 1 }} onClick={e => { e.stopPropagation(); onToggle(); }}>
          <TaskCircle done={done} onToggle={onToggle} />
        </div>
        <span style={{
          fontSize: 13, fontWeight: 500,
          color: done ? C.gray400 : C.gray800,
          textDecoration: done ? 'line-through' : 'none',
          lineHeight: 1.4, flex: 1,
        }}>
          {task.title}
        </span>
      </div>

      {/* Project badge */}
      {(task.project) && (
        <div style={{ marginLeft: 26, marginBottom: 6 }}>
          <ProjectBadge
            name={typeof task.project === 'object' ? task.project?.name : task.project}
            color={task.projectColor}
          />
        </div>
      )}

      {/* Footer: due date + assignee */}
      {(task.dueDate || task.assignee) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginLeft: 26, marginTop: 4 }}>
          {task.dueDate ? (
            <span style={{
              fontSize: 11, color: overdue ? C.accent : C.gray500,
              fontWeight: overdue ? 600 : 400,
            }}>
              📅 {formatDate(task.dueDate)}
            </span>
          ) : <span />}
          {task.assignee && (
            <Avatar
              name={typeof task.assignee === 'object' ? (task.assignee?.name || '?') : task.assignee}
              size={18}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────────
function KanbanColumn({ sectionKey, title, tasks, doneSet, onToggle, onOpen, onAdd, onDrop }) {
  const [addingInline, setAddingInline] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragging, setDragging] = useState(null);   // shared via prop not needed — local state for visual only

  const pendingTasks = tasks.filter(t => !doneSet.has(t.id));
  const doneTasks   = tasks.filter(t => doneSet.has(t.id));

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); onDrop(sectionKey); }}
      style={{
        width: 260,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: dragOver ? '#F0F4FF' : C.gray50,
        borderRadius: 10,
        border: `1.5px solid ${dragOver ? C.blue : C.gray200}`,
        transition: 'border-color 0.15s, background 0.15s',
        maxHeight: 'calc(100vh - 200px)',
      }}
    >
      {/* Column header */}
      <div style={{
        padding: '12px 14px 10px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${C.gray200}`,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.gray700, flex: 1 }}>{title}</span>
        <span style={{
          fontSize: 11, fontWeight: 600, color: C.gray400,
          background: C.gray200, borderRadius: 10, padding: '1px 7px', minWidth: 20, textAlign: 'center',
        }}>
          {pendingTasks.length}
        </span>
        <button
          onClick={() => setAddingInline(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gray400, fontSize: 18, lineHeight: 1, padding: '0 2px' }}
          title="新增任務"
        >
          +
        </button>
      </div>

      {/* Cards scroll area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 6px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Inline add */}
        {addingInline && (
          <div style={{ background: C.white, border: `1.5px solid ${C.accent}`, borderRadius: 8, padding: '8px 10px' }}>
            <input
              autoFocus
              placeholder="任務名稱"
              onKeyDown={e => {
                if (e.key === 'Enter' && e.target.value.trim()) { onAdd(e.target.value.trim()); setAddingInline(false); }
                if (e.key === 'Escape') setAddingInline(false);
              }}
              onBlur={e => { if (!e.target.value.trim()) setAddingInline(false); }}
              style={{
                width: '100%', border: 'none', outline: 'none',
                fontSize: 13, color: C.gray800, background: 'transparent',
              }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                onMouseDown={e => {
                  e.preventDefault();
                  const input = e.currentTarget.closest('div').parentElement.querySelector('input');
                  if (input?.value.trim()) { onAdd(input.value.trim()); }
                  setAddingInline(false);
                }}
                style={{ padding: '3px 10px', background: C.accent, color: C.white, border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >確認</button>
              <button
                onMouseDown={() => setAddingInline(false)}
                style={{ padding: '3px 10px', background: 'none', color: C.gray500, border: `1px solid ${C.gray300}`, borderRadius: 5, cursor: 'pointer', fontSize: 12 }}
              >取消</button>
            </div>
          </div>
        )}

        {/* Pending cards */}
        {pendingTasks.map(task => (
          <KanbanCard
            key={task.id}
            task={task}
            done={false}
            onToggle={() => onToggle(task.id)}
            onOpen={onOpen}
            onDragStart={t => { /* pass up */ }}
            onDragEnd={() => {}}
          />
        ))}

        {/* Done cards */}
        {doneTasks.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: C.gray400, fontWeight: 600, padding: '4px 2px', letterSpacing: '0.03em' }}>
              ✓ 已完成 ({doneTasks.length})
            </div>
            {doneTasks.map(task => (
              <KanbanCard
                key={task.id}
                task={task}
                done={true}
                onToggle={() => onToggle(task.id)}
                onOpen={onOpen}
                onDragStart={t => {}}
                onDragEnd={() => {}}
              />
            ))}
          </>
        )}

        {/* Empty state */}
        {tasks.length === 0 && !addingInline && (
          <div style={{ textAlign: 'center', color: C.gray300, fontSize: 13, padding: '24px 8px' }}>
            無任務
          </div>
        )}
      </div>

      {/* Column footer add */}
      {!addingInline && (
        <div
          onClick={() => setAddingInline(true)}
          style={{
            padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: C.gray400,
            borderTop: `1px solid ${C.gray200}`, borderRadius: '0 0 10px 10px',
            display: 'flex', alignItems: 'center', gap: 6,
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = C.gray600; e.currentTarget.style.background = C.gray100; }}
          onMouseLeave={e => { e.currentTarget.style.color = C.gray400; e.currentTarget.style.background = 'transparent'; }}
        >
          + 新增任務
        </div>
      )}
    </div>
  );
}

// ── Kanban View ───────────────────────────────────────────────
function KanbanView({ sections, doneSet, onToggle, onOpen, onAdd, onMoveTask }) {
  const [dragTask, setDragTask] = useState(null);

  const COLUMNS = [
    { key: 'recent', label: '近期指派' },
    { key: 'today',  label: '今天執行' },
    { key: 'week',   label: '下週執行' },
    { key: 'later',  label: '稍後執行' },
  ];

  return (
    <div style={{
      display: 'flex', gap: 14, padding: '20px 24px',
      overflowX: 'auto', alignItems: 'flex-start',
      minHeight: 'calc(100vh - 200px)',
    }}>
      {COLUMNS.map(col => (
        <KanbanColumn
          key={col.key}
          sectionKey={col.key}
          title={col.label}
          tasks={sections[col.key] || []}
          doneSet={doneSet}
          onToggle={onToggle}
          onOpen={onOpen}
          onAdd={title => onAdd(col.key, title)}
          onDrop={targetKey => {
            if (dragTask && dragTask._sectionKey !== targetKey) {
              onMoveTask(dragTask.id, targetKey);
            }
            setDragTask(null);
          }}
        />
      ))}
    </div>
  );
}

// ── Calendar helpers ─────────────────────────────────────────
function calDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function calFirstWeekday(year, month) {
  return new Date(year, month, 1).getDay(); // 0=Sun
}
function calKey(date) {
  // YYYY-MM-DD
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function taskDateKey(dateStr) {
  if (!dateStr) return null;
  // handle "2026-03-17" or ISO with time
  return dateStr.slice(0, 10);
}

const CAL_WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const CAL_MONTHS   = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

// ── Calendar Day Cell ─────────────────────────────────────────
function CalDayCell({ day, isToday, isCurrentMonth, tasks, doneSet, onToggle, onOpen, onAddDay }) {
  const [hovered, setHovered] = useState(false);
  const MAX_SHOW = 3;
  const visible  = tasks.slice(0, MAX_SHOW);
  const overflow = tasks.length - MAX_SHOW;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        minHeight: 100,
        background: isToday ? '#FFF5F7' : hovered ? C.gray50 : C.white,
        border: `1px solid ${isToday ? C.accent : C.gray200}`,
        borderRadius: 6,
        padding: '6px 6px 4px',
        display: 'flex', flexDirection: 'column', gap: 3,
        cursor: 'default',
        transition: 'background 0.1s',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Day number */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 2,
      }}>
        <span style={{
          fontSize: 12, fontWeight: isToday ? 700 : 500,
          color: isToday ? C.white : isCurrentMonth ? C.gray700 : C.gray300,
          background: isToday ? C.accent : 'transparent',
          borderRadius: '50%',
          width: 22, height: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {day}
        </span>
        {hovered && isCurrentMonth && (
          <button
            onClick={e => { e.stopPropagation(); onAddDay(); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: C.gray400, fontSize: 16, lineHeight: 1, padding: '0 2px',
            }}
            title="新增任務"
          >+</button>
        )}
      </div>

      {/* Task pills */}
      {visible.map(task => {
        const done    = doneSet.has(task.id);
        const overdue = isOverdue(task.dueDate) && !done;
        const dotColor = task.projectColor || C.gray400;
        return (
          <div
            key={task.id}
            onClick={e => { e.stopPropagation(); onOpen(task); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '2px 5px',
              borderRadius: 4,
              background: done ? C.gray100 : overdue ? '#FEF2F2' : C.accentLight,
              cursor: 'pointer',
              fontSize: 11, fontWeight: 500,
              color: done ? C.gray400 : overdue ? '#DC2626' : C.gray700,
              textDecoration: done ? 'line-through' : 'none',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
              flexShrink: 0,
              transition: 'opacity 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: done ? C.gray400 : dotColor, flexShrink: 0,
            }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
              {task.title}
            </span>
          </div>
        );
      })}

      {/* Overflow */}
      {overflow > 0 && (
        <div style={{
          fontSize: 11, color: C.gray400, fontWeight: 500,
          padding: '1px 5px',
        }}>
          +{overflow} 更多
        </div>
      )}
    </div>
  );
}

// ── Calendar View ─────────────────────────────────────────────
function CalendarView({ tasks, doneSet, onToggle, onOpen, onAdd }) {
  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // Build a map: "YYYY-MM-DD" → tasks[]
  const taskMap = {};
  tasks.forEach(t => {
    const key = taskDateKey(t.dueDate);
    if (!key) return;
    if (!taskMap[key]) taskMap[key] = [];
    taskMap[key].push(t);
  });

  const daysInMonth  = calDaysInMonth(viewYear, viewMonth);
  const firstWeekday = calFirstWeekday(viewYear, viewMonth);

  // Prev month tail
  const prevMonthDays = calDaysInMonth(viewYear, viewMonth - 1 < 0 ? 11 : viewMonth - 1);

  // Build cells: 6 rows × 7 cols = 42 cells
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const col = i % 7;
    if (i < firstWeekday) {
      // prev month
      const d   = prevMonthDays - firstWeekday + i + 1;
      const m   = viewMonth === 0 ? 11 : viewMonth - 1;
      const y   = viewMonth === 0 ? viewYear - 1 : viewYear;
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, isCurrentMonth: false, isToday: false, key });
    } else {
      const d = i - firstWeekday + 1;
      if (d <= daysInMonth) {
        const key = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const t   = new Date(viewYear, viewMonth, d);
        cells.push({ day: d, isCurrentMonth: true, isToday: calKey(t) === calKey(today), key });
      } else {
        // next month
        const nd  = d - daysInMonth;
        const nm  = viewMonth === 11 ? 0 : viewMonth + 1;
        const ny  = viewMonth === 11 ? viewYear + 1 : viewYear;
        const key = `${ny}-${String(nm + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
        cells.push({ day: nd, isCurrentMonth: false, isToday: false, key });
      }
    }
  }

  // Only render 5 rows if last row is all next-month and empty
  const rows = [];
  for (let r = 0; r < 6; r++) {
    const rowCells = cells.slice(r * 7, r * 7 + 7);
    const allNext  = rowCells.every(c => !c.isCurrentMonth && c.day <= 7);
    const hasTask  = rowCells.some(c => (taskMap[c.key] || []).length > 0);
    if (allNext && !hasTask) break;
    rows.push(rowCells);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  function goToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }

  // Tasks without dueDate — show in side list
  const noDateTasks = tasks.filter(t => !t.dueDate && !doneSet.has(t.id));

  return (
    <div style={{ padding: '16px 24px', userSelect: 'none' }}>

      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={prevMonth} style={{
          background: 'none', border: `1px solid ${C.gray200}`, borderRadius: 6,
          padding: '5px 10px', cursor: 'pointer', fontSize: 14, color: C.gray600,
        }}>‹</button>
        <button onClick={goToday} style={{
          background: 'none', border: `1px solid ${C.gray200}`, borderRadius: 6,
          padding: '5px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: C.gray600,
        }}>今天</button>
        <button onClick={nextMonth} style={{
          background: 'none', border: `1px solid ${C.gray200}`, borderRadius: 6,
          padding: '5px 10px', cursor: 'pointer', fontSize: 14, color: C.gray600,
        }}>›</button>
        <span style={{ fontSize: 17, fontWeight: 700, color: C.gray800, marginLeft: 4 }}>
          {viewYear} 年 {CAL_MONTHS[viewMonth]}
        </span>

        {/* Task count badge */}
        {(() => {
          const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
          const cnt = tasks.filter(t => t.dueDate?.startsWith(monthPrefix) && !doneSet.has(t.id)).length;
          return cnt > 0 ? (
            <span style={{
              marginLeft: 6, background: C.accentLight, color: C.accent,
              borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700,
            }}>{cnt} 個截止任務</span>
          ) : null;
        })()}
      </div>

      {/* Main grid + no-date sidebar */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* Calendar grid */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Weekday headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            {CAL_WEEKDAYS.map((wd, i) => (
              <div key={wd} style={{
                textAlign: 'center', fontSize: 12, fontWeight: 600,
                color: i === 0 ? '#EF4444' : i === 6 ? '#3B82F6' : C.gray500,
                padding: '4px 0',
              }}>
                {wd}
              </div>
            ))}
          </div>

          {/* Rows */}
          {rows.map((row, ri) => (
            <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
              {row.map((cell, ci) => (
                <CalDayCell
                  key={cell.key}
                  day={cell.day}
                  isToday={cell.isToday}
                  isCurrentMonth={cell.isCurrentMonth}
                  tasks={taskMap[cell.key] || []}
                  doneSet={doneSet}
                  onToggle={onToggle}
                  onOpen={onOpen}
                  onAddDay={() => {
                    // Add task with that date pre-filled
                    const title = `新任務`;
                    onAdd('later', title);
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* No-date sidebar */}
        {noDateTasks.length > 0 && (
          <div style={{
            width: 190, flexShrink: 0,
            background: C.gray50,
            border: `1px solid ${C.gray200}`,
            borderRadius: 8,
            padding: '10px 12px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.gray500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              未設截止日
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {noDateTasks.map(task => (
                <div
                  key={task.id}
                  onClick={() => onOpen(task)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 7px', borderRadius: 5,
                    background: C.white, cursor: 'pointer',
                    border: `1px solid ${C.gray200}`,
                    fontSize: 12, color: C.gray700,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = C.accentLight}
                  onMouseLeave={e => e.currentTarget.style.background = C.white}
                >
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: task.projectColor || C.gray300, flexShrink: 0,
                  }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {task.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Files View ────────────────────────────────────────────────
// ── TitleMenuDropdown ─────────────────────────────────────────
function TitleMenuDropdown({ onClose, onRename, onShare }) {
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const itemStyle = {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
    fontSize: 13, color: C.gray700, cursor: 'pointer', borderRadius: 6, userSelect: 'none',
  };

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      onClose();
      const toast = document.createElement('div');
      Object.assign(toast.style, { position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', background: C.gray800, color: '#fff', padding: '8px 20px', borderRadius: 8, fontSize: 13, zIndex: 9999, pointerEvents: 'none' });
      toast.textContent = '✓ 連結已複製';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    });
  }

  const items = [
    { icon: '✏️', label: '重新命名', action: () => { onRename(); onClose(); } },
    { icon: '🔗', label: '複製連結', action: copyLink },
    { icon: '📤', label: '匯出為 CSV', action: () => { onClose(); alert('示範：CSV 匯出功能連接後端後啟用'); } },
    { divider: true },
    { icon: '🗑', label: '刪除', danger: true, action: () => { if (window.confirm('確定刪除此任務視圖？')) onClose(); } },
  ];

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', left: 0, marginTop: 6, minWidth: 200,
      background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 10,
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 400, padding: '4px',
    }}>
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} style={{ height: 1, background: C.gray100, margin: '4px 0' }} />
        ) : (
          <div key={item.label}
            style={{ ...itemStyle, color: item.danger ? '#DC2626' : C.gray700 }}
            onClick={item.action}
            onMouseEnter={e => { e.currentTarget.style.background = item.danger ? '#FEF2F2' : C.gray50; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>{item.icon}</span>
            {item.label}
          </div>
        )
      )}
    </div>
  );
}

// ── ShareModal ────────────────────────────────────────────────
function ShareModal({ onClose }) {
  const [permission, setPermission] = useState('view');
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const sharedMembers = [
    { name: '系統管理員', initials: '系', color: C.accent, role: '擁有者' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div ref={ref} style={{ background: C.white, borderRadius: 14, width: 440, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${C.gray100}` }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.gray800 }}>分享「我的任務」</div>
            <div style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>邀請成員或複製連結</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.gray400, fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* Invite input */}
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.gray100}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.gray500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>邀請成員</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="輸入姓名或 Email⋯"
              style={{ flex: 1, padding: '8px 12px', border: `1.5px solid ${C.gray200}`, borderRadius: 8, fontSize: 13, outline: 'none', color: C.gray700 }}
              onFocus={e => e.target.style.borderColor = C.accent}
              onBlur={e => e.target.style.borderColor = C.gray200}
            />
            <select value={permission} onChange={e => setPermission(e.target.value)}
              style={{ padding: '8px 10px', border: `1.5px solid ${C.gray200}`, borderRadius: 8, fontSize: 13, color: C.gray700, background: C.white, cursor: 'pointer', outline: 'none' }}>
              <option value="view">可檢視</option>
              <option value="edit">可編輯</option>
              <option value="comment">可留言</option>
            </select>
            <button
              style={{ padding: '8px 16px', background: C.accent, color: C.white, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              onClick={() => alert('邀請功能連接後端後啟用')}>
              邀請
            </button>
          </div>
        </div>

        {/* Members list */}
        <div style={{ padding: '14px 22px', borderBottom: `1px solid ${C.gray100}`, maxHeight: 180, overflowY: 'auto' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.gray500, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>已共用成員</div>
          {sharedMembers.map(m => (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: m.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{m.initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.gray800 }}>{m.name}</div>
              </div>
              <span style={{ fontSize: 12, color: C.gray400, background: C.gray100, padding: '2px 8px', borderRadius: 20 }}>{m.role}</span>
            </div>
          ))}
        </div>

        {/* Copy link */}
        <div style={{ padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: C.gray50, borderRadius: 8, border: `1px solid ${C.gray200}`, overflow: 'hidden' }}>
            <span style={{ fontSize: 13, color: C.gray500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{window.location.href}</span>
          </div>
          <button onClick={copyLink}
            style={{ padding: '8px 16px', border: `1.5px solid ${copied ? '#16a34a' : C.gray200}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: copied ? '#f0fdf4' : C.white, color: copied ? '#16a34a' : C.gray700, transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
            {copied ? '✓ 已複製' : '複製連結'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CustomizeModal ────────────────────────────────────────────
function CustomizeModal({ optionsConfig, onApply, onClose }) {
  const [cfg, setCfg] = useState({ ...optionsConfig });
  const [density, setDensity] = useState('normal');
  const ref = useRef(null);

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const fields = [
    { key: 'showDueDate',    label: '截止日期',  icon: '📅' },
    { key: 'showAssignee',   label: '協作者',    icon: '👤' },
    { key: 'showProject',    label: '專案',      icon: '📁' },
    { key: 'showVisibility', label: '任務可見度', icon: '🔒' },
  ];

  const densities = [
    { key: 'compact', label: '緊密', desc: '更多任務一次顯示' },
    { key: 'normal',  label: '標準', desc: '預設顯示方式' },
    { key: 'relaxed', label: '寬鬆', desc: '增加行距易於閱讀' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div ref={ref} style={{ background: C.white, borderRadius: 14, width: 400, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${C.gray100}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.gray800 }}>自訂顯示</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.gray400, fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* Fields section */}
        <div style={{ padding: '16px 22px', borderBottom: `1px solid ${C.gray100}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.gray500, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>顯示欄位</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {fields.map(f => (
              <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', userSelect: 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = C.gray50}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <input type="checkbox" checked={!!cfg[f.key]} onChange={() => setCfg(prev => ({ ...prev, [f.key]: !prev[f.key] }))}
                  style={{ width: 16, height: 16, accentColor: C.accent, cursor: 'pointer' }} />
                <span style={{ fontSize: 16 }}>{f.icon}</span>
                <span style={{ fontSize: 13, color: C.gray700, fontWeight: 500 }}>{f.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Density section */}
        <div style={{ padding: '16px 22px', borderBottom: `1px solid ${C.gray100}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.gray500, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>列表密度</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {densities.map(d => (
              <div key={d.key} onClick={() => setDensity(d.key)}
                style={{ flex: 1, padding: '10px 8px', border: `2px solid ${density === d.key ? C.accent : C.gray200}`, borderRadius: 10, cursor: 'pointer', textAlign: 'center', background: density === d.key ? C.accentLight : C.white, transition: 'all 0.15s' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: density === d.key ? C.accent : C.gray700 }}>{d.label}</div>
                <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{d.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, padding: '14px 22px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px 0', border: `1px solid ${C.gray200}`, borderRadius: 8, fontSize: 13, fontWeight: 500, background: C.white, color: C.gray600, cursor: 'pointer' }}>取消</button>
          <button onClick={() => { onApply(cfg); onClose(); }}
            style={{ flex: 2, padding: '9px 0', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, background: C.accent, color: C.white, cursor: 'pointer' }}>
            套用
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FileTypeIcon ───────────────────────────────────────────────
function FileTypeIcon({ ext, size = 44 }) {
  const meta = FILE_TYPE_META[ext] || { label: (ext || 'FILE').toUpperCase().slice(0, 4), color: '#6B7280', bg: '#F3F4F6' };
  return (
    <div style={{
      width: size, height: size, borderRadius: 10,
      background: meta.bg, color: meta.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.26, fontWeight: 800, flexShrink: 0,
      border: `1.5px solid ${meta.color}30`, userSelect: 'none',
      letterSpacing: '-0.5px',
    }}>
      {meta.label}
    </div>
  );
}

function FileDetailPanel({ file, onClose, onDelete }) {
  const meta = FILE_TYPE_META[file.ext] || { label: (file.ext || 'FILE').toUpperCase().slice(0, 4), color: '#6B7280', bg: '#F3F4F6' };
  const panelRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  function handleDownload() {
    const a = document.createElement('a');
    a.href = file.url;
    a.download = file.name;
    a.click();
  }

  function handleOpen() {
    window.open(file.url, '_blank');
  }

  const infoRows = [
    { label: '檔案大小', value: file.size },
    { label: '檔案類型', value: file.ext ? file.ext.toUpperCase() : '—' },
    { label: '上傳日期', value: file.updatedAt },
    { label: '上傳者',   value: file.uploader },
  ];

  return (
    <div ref={panelRef} style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 320,
      background: C.white, borderLeft: `1px solid ${C.gray200}`,
      boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', zIndex: 300,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `1px solid ${C.gray200}` }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.gray700 }}>檔案詳情</span>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.gray400, fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
      </div>

      {/* Preview / Icon */}
      <div style={{ borderBottom: `1px solid ${C.gray100}`, background: C.gray50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', minHeight: 140 }}>
        {file.isImage ? (
          <img src={file.url} alt={file.name}
            style={{ maxWidth: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', cursor: 'pointer' }}
            onClick={handleOpen}
          />
        ) : (
          <div style={{ width: 72, height: 72, borderRadius: 16, background: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, border: `2px solid ${meta.color}30`, letterSpacing: '-0.5px', cursor: 'pointer' }}
            onClick={handleOpen}>
            {meta.label}
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: C.gray800, textAlign: 'center', wordBreak: 'break-all', lineHeight: 1.4, maxWidth: '100%' }}>{file.name}</div>
      </div>

      {/* Details */}
      <div style={{ padding: '8px 20px', flex: 1, overflowY: 'auto' }}>
        {infoRows.map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${C.gray100}` }}>
            <span style={{ fontSize: 12, color: C.gray400 }}>{label}</span>
            <span style={{ fontSize: 13, color: C.gray700, fontWeight: 500 }}>{value || '—'}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.gray200}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={handleDownload}
          style={{ width: '100%', padding: '9px 0', fontSize: 13, fontWeight: 600, background: C.accent, color: C.white, border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          ↓ 下載檔案
        </button>
        <button onClick={handleOpen}
          style={{ width: '100%', padding: '9px 0', fontSize: 13, fontWeight: 500, background: C.gray50, color: C.gray600, border: `1px solid ${C.gray200}`, borderRadius: 8, cursor: 'pointer' }}>
          ↗ 在新分頁開啟
        </button>
        <button onClick={() => { onDelete(file.id); onClose(); }}
          style={{ width: '100%', padding: '9px 0', fontSize: 13, fontWeight: 500, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer' }}>
          🗑 刪除
        </button>
      </div>
    </div>
  );
}

const API_BASE = 'http://localhost:3010';
const USER_ID  = 4; // 目前登入使用者 ID

// 將後端 record 轉成 UI 用格式
function toUIFile(r) {
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(r.ext || '');
  const url = `${API_BASE}/uploads/${r.stored_name}`;
  const d   = new Date(r.created_at);
  const now = new Date();
  const diffMs = now - d;
  let updatedAt = '今天';
  if (diffMs > 86400000) updatedAt = `${Math.floor(diffMs / 86400000)} 天前`;
  return {
    id: r.id,
    name: r.original_name,
    ext:  r.ext || '',
    size: formatFileSize(r.file_size_bytes),
    uploader: 'JL',
    updatedAt,
    url,
    isImage,
    storedName: r.stored_name,
  };
}

function FilesView({ tasks }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const [filterExt, setFilterExt] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  // ── 初次載入 ──────────────────────────────────────────────
  useEffect(() => { loadFiles(); }, []);

  async function loadFiles() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/my-files?userId=${USER_ID}`);
      const json = await res.json();
      if (json.success) setFiles(json.data.map(toUIFile));
    } catch (e) { console.error('loadFiles', e); }
    finally { setLoading(false); }
  }

  async function uploadFiles(rawFiles) {
    setUploading(true);
    const fd = new FormData();
    Array.from(rawFiles).forEach(f => fd.append('files', f));
    fd.append('userId', USER_ID);
    try {
      const res = await fetch(`${API_BASE}/api/my-files`, { method: 'POST', body: fd });
      const json = await res.json();
      if (json.success) setFiles(prev => [...json.data.map(toUIFile), ...prev]);
      else alert('上傳失敗：' + json.error);
    } catch (e) { alert('上傳失敗：' + e.message); }
    finally { setUploading(false); }
  }

  function handleInputChange(e) {
    if (e.target.files?.length) uploadFiles(e.target.files);
    e.target.value = '';
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  }

  async function handleDelete(id) {
    if (!window.confirm('確定刪除此檔案？此操作無法復原。')) return;
    try {
      const res = await fetch(`${API_BASE}/api/my-files/${id}?userId=${USER_ID}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setFiles(prev => prev.filter(f => f.id !== id));
        if (selectedFile?.id === id) setSelectedFile(null);
      } else alert('刪除失敗：' + json.error);
    } catch (e) { alert('刪除失敗：' + e.message); }
  }

  const allExts = useMemo(() => [...new Set(files.map(f => f.ext).filter(Boolean))], [files]);

  const filteredFiles = useMemo(() => {
    let f = files;
    if (search.trim()) {
      const q = search.toLowerCase();
      f = f.filter(x => x.name.toLowerCase().includes(q));
    }
    if (filterExt !== 'all') f = f.filter(x => x.ext === filterExt);
    return f;
  }, [files, search, filterExt]);

  const selectStyle = {
    fontSize: 13, padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.gray200}`,
    background: C.white, color: C.gray700, cursor: 'pointer', outline: 'none',
  };

  return (
    <div
      style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
      onDrop={handleDrop}
    >
      {selectedFile && (
        <FileDetailPanel
          file={selectedFile}
          onClose={() => setSelectedFile(null)}
          onDelete={handleDelete}
        />
      )}

      {/* Drag overlay */}
      {dragging && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(196,18,48,0.06)',
          border: `3px dashed ${C.accent}`, borderRadius: 16, zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>放開以上傳檔案</div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: C.gray50, border: `1.5px solid ${search ? C.accent : C.gray200}`, borderRadius: 8, flex: '1 1 200px', maxWidth: 300 }}>
          <span style={{ color: C.gray400, fontSize: 14 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋檔案名稱⋯"
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: C.gray700, width: '100%' }} />
          {search && <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.gray400, fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>}
        </div>

        {/* File type filter */}
        {allExts.length > 0 && (
          <select value={filterExt} onChange={e => setFilterExt(e.target.value)} style={selectStyle}>
            <option value="all">所有類型</option>
            {allExts.map(e => <option key={e} value={e}>{FILE_TYPE_META[e]?.label || e.toUpperCase()}</option>)}
          </select>
        )}

        <span style={{ flex: 1 }} />

        {/* View toggle */}
        <div style={{ display: 'flex', border: `1px solid ${C.gray200}`, borderRadius: 8, overflow: 'hidden' }}>
          {[['grid', '⊞ 方格'], ['list', '≡ 清單']].map(([mode, label]) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              style={{ padding: '5px 13px', fontSize: 13, border: 'none', cursor: 'pointer', fontWeight: viewMode === mode ? 600 : 400, background: viewMode === mode ? C.accent : C.white, color: viewMode === mode ? C.white : C.gray600, transition: 'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Upload button */}
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleInputChange} />
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          style={{ padding: '6px 16px', fontSize: 13, fontWeight: 600, border: `1.5px solid ${C.accent}`, borderRadius: 8, background: uploading ? C.gray100 : C.accentLight, color: uploading ? C.gray400 : C.accent, cursor: uploading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
          {uploading ? '上傳中⋯' : '＋ 上傳檔案'}
        </button>
      </div>

      {/* Uploading progress bar */}
      {uploading && (
        <div style={{ height: 3, background: C.gray100, borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '60%', background: C.accent, borderRadius: 99, animation: 'pulse 1s ease-in-out infinite' }} />
        </div>
      )}

      {/* Empty state */}
      {!loading && files.length === 0 && (
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '64px 24px', border: `2px dashed ${C.gray200}`, borderRadius: 16, cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = C.accentLight; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.gray200; e.currentTarget.style.background = 'transparent'; }}
        >
          <div style={{ fontSize: 36 }}>📁</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.gray700 }}>尚無檔案</div>
          <div style={{ fontSize: 13, color: C.gray400, textAlign: 'center' }}>點擊或拖放檔案至此處上傳<br/>支援所有檔案格式</div>
          <div style={{ padding: '8px 24px', background: C.accent, color: C.white, borderRadius: 8, fontSize: 13, fontWeight: 600, marginTop: 4 }}>選擇檔案</div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.gray400, fontSize: 14 }}>載入中⋯</div>
      )}

      {/* Count */}
      {!loading && files.length > 0 && (
        <div style={{ fontSize: 12, color: C.gray400 }}>
          {filteredFiles.length} 個檔案{filteredFiles.length < files.length ? `（共 ${files.length} 個）` : ''}
        </div>
      )}

      {/* ── Grid View ── */}
      {!loading && viewMode === 'grid' && files.length > 0 && (
        filteredFiles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: C.gray400, fontSize: 14 }}>找不到符合的檔案</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
            {filteredFiles.map(f => (
              <div key={f.id}
                onClick={() => setSelectedFile(f)}
                style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 12, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s', position: 'relative' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.09)'; e.currentTarget.style.borderColor = C.gray300; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = C.gray200; }}
              >
                {/* Thumbnail for images, icon for others */}
                {f.isImage ? (
                  <div style={{ width: '100%', height: 80, borderRadius: 8, overflow: 'hidden', background: C.gray100 }}>
                    <img src={f.url} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ) : (
                  <FileTypeIcon ext={f.ext} size={44} />
                )}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.gray800, lineHeight: 1.4, wordBreak: 'break-all', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{f.name}</div>
                  <div style={{ fontSize: 11, color: C.gray400, marginTop: 3 }}>{f.size} · {f.updatedAt}</div>
                </div>
                {/* Delete button on hover */}
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(f.id); }}
                  style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, border: 'none', borderRadius: '50%', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '0'}
                  title="刪除"
                >×</button>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── List View ── */}
      {!loading && viewMode === 'list' && files.length > 0 && (
        <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 80px 100px 36px', gap: 12, padding: '10px 16px', background: C.gray50, borderBottom: `1px solid ${C.gray200}`, fontSize: 12, color: C.gray500, fontWeight: 600 }}>
            <div></div><div>檔案名稱</div><div>大小</div><div>上傳日期</div><div></div>
          </div>
          {filteredFiles.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: C.gray400, fontSize: 14 }}>找不到符合的檔案</div>
          ) : (
            filteredFiles.map((f, i) => (
              <div key={f.id}
                onClick={() => setSelectedFile(f)}
                style={{ display: 'grid', gridTemplateColumns: '44px 1fr 80px 100px 36px', gap: 12, padding: '10px 16px', alignItems: 'center', borderBottom: i < filteredFiles.length - 1 ? `1px solid ${C.gray100}` : 'none', cursor: 'pointer', transition: 'background 0.12s' }}
                onMouseEnter={e => e.currentTarget.style.background = C.gray50}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {f.isImage
                  ? <div style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', background: C.gray100, flexShrink: 0 }}><img src={f.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
                  : <FileTypeIcon ext={f.ext} size={36} />
                }
                <div style={{ fontSize: 13, fontWeight: 500, color: C.gray800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                <div style={{ fontSize: 12, color: C.gray500 }}>{f.size}</div>
                <div style={{ fontSize: 12, color: C.gray500 }}>{f.updatedAt}</div>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(f.id); }}
                  style={{ width: 28, height: 28, border: 'none', borderRadius: 6, background: 'transparent', color: C.gray400, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.gray400; }}
                  title="刪除"
                >🗑</button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Dashboard View ────────────────────────────────────────────
function DashboardView({ tasks, doneSet, onOpen, onSwitchTab, onFilterProject }) {
  const total = tasks.length;
  const done = tasks.filter(t => doneSet.has(t.id)).length;
  const inProgress = total - done;
  const overdue = tasks.filter(t => isOverdue(t.dueDate) && !doneSet.has(t.id)).length;
  const today0 = todayStart();
  const week7 = new Date(today0); week7.setDate(today0.getDate() + 7);
  const dueThisWeek = tasks.filter(t => {
    if (!t.dueDate || doneSet.has(t.id)) return false;
    const d = new Date(t.dueDate); d.setHours(0, 0, 0, 0);
    return d >= today0 && d <= week7;
  }).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  // Priority breakdown
  const priorities = ['urgent', 'high', 'medium', 'low'];
  const prioLabels = { urgent: '緊急', high: '高', medium: '中', low: '低' };
  const prioColors = { urgent: '#DC2626', high: '#F97316', medium: '#3B82F6', low: '#22C55E' };
  const prioCount = Object.fromEntries(priorities.map(p => [p, tasks.filter(t => t.priority === p).length]));

  // Project breakdown
  const projectMap = {};
  tasks.forEach(t => {
    const proj = t.project || '未分類';
    const color = t.projectColor || C.gray400;
    if (!projectMap[proj]) projectMap[proj] = { count: 0, color };
    projectMap[proj].count++;
  });
  const projectList = Object.entries(projectMap).sort((a, b) => b[1].count - a[1].count).slice(0, 6);
  const maxProjCount = Math.max(...projectList.map(([, v]) => v.count), 1);

  // Upcoming due tasks (next 14 days, not done, sorted by date)
  const upcoming = tasks
    .filter(t => {
      if (!t.dueDate || doneSet.has(t.id)) return false;
      const d = new Date(t.dueDate); d.setHours(0, 0, 0, 0);
      const limit = new Date(today0); limit.setDate(today0.getDate() + 14);
      return d >= today0 && d <= limit;
    })
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 5);

  const cardStyle = {
    background: C.white, borderRadius: 12, padding: '20px 24px',
    border: `1px solid ${C.gray200}`, flex: 1, minWidth: 140,
  };

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100, margin: '0 auto', width: '100%' }}>

      {/* ── Stat Cards ── */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[
          { label: '全部任務', value: total, icon: '📋', color: C.gray700 },
          { label: '進行中', value: inProgress, icon: '🔄', color: C.blue },
          { label: '已逾期', value: overdue, icon: '⏰', color: '#DC2626' },
          { label: '本週截止', value: dueThisWeek, icon: '📅', color: C.orange },
        ].map(card => (
          <div key={card.label}
            onClick={() => onSwitchTab && onSwitchTab('list')}
            style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'; e.currentTarget.style.borderColor = C.gray300; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = C.gray200; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: C.gray500, fontWeight: 500 }}>{card.label}</span>
              <span style={{ fontSize: 20 }}>{card.icon}</span>
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: card.color, lineHeight: 1, textDecoration: 'none' }}>
              {card.value}
            </div>
          </div>
        ))}

        {/* Completion rate card */}
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 180 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: C.gray500, fontWeight: 500 }}>完成率</span>
            <span style={{ fontSize: 20 }}>✅</span>
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, color: C.green, lineHeight: 1 }}>{pct}%</div>
          <div style={{ height: 8, background: C.gray100, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: C.green, borderRadius: 4, transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ fontSize: 12, color: C.gray400 }}>{done} / {total} 已完成</div>
        </div>
      </div>

      {/* ── Middle Row ── */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>

        {/* Priority Distribution */}
        <div style={{ ...cardStyle, flex: '1 1 260px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.gray700, marginBottom: 16 }}>優先級分佈</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {priorities.map(p => {
              const cnt = prioCount[p];
              const barPct = total === 0 ? 0 : Math.round((cnt / total) * 100);
              return (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: prioColors[p], flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: C.gray600, width: 28 }}>{prioLabels[p]}</span>
                  <div style={{ flex: 1, height: 8, background: C.gray100, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barPct}%`, background: prioColors[p], borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 13, color: C.gray500, width: 24, textAlign: 'right' }}>{cnt}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Project Distribution */}
        <div style={{ ...cardStyle, flex: '2 1 360px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.gray700, marginBottom: 16 }}>依專案分佈</div>
          {projectList.length === 0 ? (
            <div style={{ color: C.gray400, fontSize: 13 }}>無專案資料</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {projectList.map(([name, { count, color }]) => {
                const barPct = Math.round((count / maxProjCount) * 100);
                return (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{
                        fontSize: 13, color: C.gray700, minWidth: 90, maxWidth: 140,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500,
                    }}>{name}</span>
                    <div style={{ flex: 1, height: 10, background: C.gray100, borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barPct}%`, background: color, borderRadius: 5 }} />
                    </div>
                    <span style={{ fontSize: 13, color: C.gray500, width: 24, textAlign: 'right', fontWeight: 600 }}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Upcoming Tasks ── */}
      <div style={{ ...cardStyle, flex: 'none' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.gray700, marginBottom: 16 }}>即將截止（14天內）</div>
        {upcoming.length === 0 ? (
          <div style={{ color: C.gray400, fontSize: 13, padding: '12px 0' }}>無即將截止的任務 🎉</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {upcoming.map((t, i) => {
              const dd = doneSet.has(t.id);
              const od = isOverdue(t.dueDate);
              const tod = isToday(t.dueDate);
              return (
                <div
                  key={t.id}
                  onClick={() => onOpen(t)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    borderBottom: i < upcoming.length - 1 ? `1px solid ${C.gray100}` : 'none',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = C.gray50}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Done toggle */}
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%',
                    border: `2px solid ${dd ? C.green : C.gray300}`,
                    background: dd ? C.green : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {dd && <span style={{ color: C.white, fontSize: 9, fontWeight: 700 }}>✓</span>}
                  </div>
                  {/* Title — hyperlink */}
                  <span
                    onClick={e => { e.stopPropagation(); onOpen(t); }}
                    style={{
                      flex: 1, fontSize: 14, fontWeight: 500,
                      color: C.blue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      cursor: 'pointer', textDecoration: 'underline',
                      textDecorationColor: `${C.blue}44`, textUnderlineOffset: 2,
                      transition: 'color 0.1s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = C.accent; e.currentTarget.style.textDecorationColor = C.accent; }}
                    onMouseLeave={e => { e.currentTarget.style.color = C.blue; e.currentTarget.style.textDecorationColor = `${C.blue}44`; }}
                  >{t.title}</span>
                  {/* Project badge */}
                  {t.project && (
                    <span style={{
                      fontSize: 11, padding: '2px 9px', borderRadius: 10,
                      background: t.projectColor ? `${t.projectColor}20` : C.gray100,
                      color: t.projectColor || C.gray500,
                      flexShrink: 0, fontWeight: 600,
                    }}>{typeof t.project === 'object' ? t.project?.name : t.project}</span>
                  )}
                  {/* Due date */}
                  <span style={{
                    fontSize: 12, fontWeight: 500, flexShrink: 0,
                    color: od ? '#DC2626' : tod ? C.orange : C.gray500,
                  }}>
                    {tod ? '今天' : od ? `逾期 ${formatDate(t.dueDate)}` : formatDate(t.dueDate)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Filter Popup ──────────────────────────────────────────────
function FilterPopup({ config, tasks, onApply, onClose }) {
  const ref = useRef(null);
  const [local, setLocal] = useState({ projects: [...config.projects], priorities: [...config.priorities] });

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const allProjects = [...new Set(tasks.map(t => (typeof t.project === 'object' ? t.project?.name : t.project)).filter(Boolean))];
  const PRIOS = [
    { key: 'urgent', label: '緊急', color: '#DC2626' },
    { key: 'high',   label: '高',   color: '#F97316' },
    { key: 'medium', label: '中',   color: '#3B82F6' },
    { key: 'low',    label: '低',   color: '#22C55E' },
  ];
  const toggle = (arr, val) => arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
  const activeCount = local.projects.length + local.priorities.length;

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', right: 0, zIndex: 400,
      background: C.white, border: `1px solid ${C.gray200}`,
      borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
      width: 270, padding: 16, marginTop: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.gray800 }}>篩選條件</span>
        {activeCount > 0 && (
          <button onClick={() => { const c = { projects: [], priorities: [] }; setLocal(c); onApply(c); onClose(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.accent, fontWeight: 600 }}>
            清除全部 ({activeCount})
          </button>
        )}
      </div>

      {/* Priority */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.gray400, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>優先級</div>
        {PRIOS.map(p => {
          const on = local.priorities.includes(p.key);
          return (
            <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 2, background: on ? C.accentLight : 'transparent' }}>
              <input type="checkbox" checked={on} onChange={() => setLocal(l => ({ ...l, priorities: toggle(l.priorities, p.key) }))} style={{ margin: 0, accentColor: p.color }} />
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: C.gray700 }}>{p.label}</span>
            </label>
          );
        })}
      </div>

      {/* Projects */}
      {allProjects.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.gray400, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>專案</div>
          {allProjects.map(p => {
            const on = local.projects.includes(p);
            return (
              <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 2, background: on ? C.accentLight : 'transparent' }}>
                <input type="checkbox" checked={on} onChange={() => setLocal(l => ({ ...l, projects: toggle(l.projects, p) }))} style={{ margin: 0, accentColor: C.accent }} />
                <span style={{ fontSize: 13, color: C.gray700 }}>{p}</span>
              </label>
            );
          })}
        </div>
      )}

      <button onClick={() => { onApply(local); onClose(); }}
        style={{ width: '100%', padding: '8px', background: C.accent, color: C.white, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
        套用篩選{activeCount > 0 ? ` (${activeCount})` : ''}
      </button>
    </div>
  );
}

// ── Sort Popup ────────────────────────────────────────────────
function SortPopup({ config, onApply, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const FIELDS = [
    { key: 'none',     label: '預設（不排序）' },
    { key: 'dueDate',  label: '截止日期' },
    { key: 'title',    label: '名稱 A → Z' },
    { key: 'priority', label: '優先級' },
    { key: 'project',  label: '專案' },
  ];

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', right: 0, zIndex: 400,
      background: C.white, border: `1px solid ${C.gray200}`,
      borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
      width: 210, padding: '10px 8px', marginTop: 6,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gray400, padding: '2px 8px 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>排序方式</div>
      {FIELDS.map(f => {
        const active = config.field === f.key;
        return (
          <div key={f.key}
            onClick={() => {
              const newConf = (active && f.key !== 'none')
                ? { field: f.key, dir: config.dir === 'asc' ? 'desc' : 'asc' }
                : { field: f.key, dir: 'asc' };
              onApply(newConf); onClose();
            }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 2, background: active ? C.accentLight : 'transparent', color: active ? C.accent : C.gray700, fontSize: 13, fontWeight: active ? 600 : 400 }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.gray50; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
          >
            <span>{f.label}</span>
            <span style={{ fontSize: 12 }}>{active && f.key !== 'none' ? (config.dir === 'asc' ? '↑' : '↓') : ''}{active ? ' ✓' : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Group Popup ───────────────────────────────────────────────
function GroupPopup({ groupBy, onApply, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const GROUPS = [
    { key: 'section',  label: '區段（預設）' },
    { key: 'project',  label: '專案' },
    { key: 'priority', label: '優先級' },
    { key: 'none',     label: '無分組（平鋪）' },
  ];

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', right: 0, zIndex: 400,
      background: C.white, border: `1px solid ${C.gray200}`,
      borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
      width: 200, padding: '10px 8px', marginTop: 6,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gray400, padding: '2px 8px 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>群組依據</div>
      {GROUPS.map(g => {
        const active = groupBy === g.key;
        return (
          <div key={g.key}
            onClick={() => { onApply(g.key); onClose(); }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 2, background: active ? C.accentLight : 'transparent', color: active ? C.accent : C.gray700, fontSize: 13, fontWeight: active ? 600 : 400 }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.gray50; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
          >
            <span>{g.label}</span>
            {active && <span style={{ fontSize: 11 }}>✓</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Options Popup ─────────────────────────────────────────────
function OptionsPopup({ config, onApply, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const OPTS = [
    { key: 'showDueDate',    label: '截止日期' },
    { key: 'showAssignee',   label: '協作者' },
    { key: 'showProject',    label: '專案' },
    { key: 'showVisibility', label: '任務可見度' },
  ];

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', right: 0, zIndex: 400,
      background: C.white, border: `1px solid ${C.gray200}`,
      borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
      width: 210, padding: '10px 12px', marginTop: 6,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gray400, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>顯示欄位（清單視圖）</div>
      {OPTS.map(opt => (
        <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', borderRadius: 5, cursor: 'pointer', marginBottom: 2 }}
          onMouseEnter={e => e.currentTarget.style.background = C.gray50}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <input type="checkbox" checked={!!config[opt.key]} onChange={() => onApply({ ...config, [opt.key]: !config[opt.key] })}
            style={{ margin: 0, accentColor: C.accent }} />
          <span style={{ fontSize: 13, color: C.gray700 }}>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function MyTasksPage() {
  const [activeTab, setActiveTab] = useState('list');
  const [tasks, setTasks] = useState([]);
  const [doneSet, setDoneSet] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('xcloud-task-done') || '[]')); }
    catch { return new Set(); }
  });
  const [selectedTask, setSelectedTask] = useState(null);
  const [showAddView, setShowAddView] = useState(false);
  const [showAddTypeDropdown, setShowAddTypeDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const addViewRef = useRef(null);

  // ── Toolbar state ──
  const [filterConfig,  setFilterConfig]  = useState({ projects: [], priorities: [] });
  const [sortConfig,    setSortConfig]    = useState({ field: 'none', dir: 'asc' });
  const [groupBy,       setGroupBy]       = useState('section');
  const [optionsConfig, setOptionsConfig] = useState({ showDueDate: true, showAssignee: true, showProject: true, showVisibility: true });
  const [showSearch,    setShowSearch]    = useState(false);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [showFilter,    setShowFilter]    = useState(false);
  const [showSort,      setShowSort]      = useState(false);
  const [showGroup,     setShowGroup]     = useState(false);
  const [showOptions,   setShowOptions]   = useState(false);
  const [showTitleMenu, setShowTitleMenu] = useState(false);
  const [showShare,     setShowShare]     = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const titleMenuRef = useRef(null);

  // Load tasks
  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/tasks`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) setTasks(data);
        else setTasks(DEMO_TASKS);
      })
      .catch(() => setTasks(DEMO_TASKS))
      .finally(() => setLoading(false));
  }, []);

  // Persist done state
  useEffect(() => {
    localStorage.setItem('xcloud-task-done', JSON.stringify([...doneSet]));
  }, [doneSet]);

  function toggleDone(id) {
    setDoneSet(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addTask(sectionKey, title) {
    const newTask = {
      id: `local-${Date.now()}`,
      title,
      dueDate: null,
      project: null,
      projectColor: null,
      assignee: 'JL',
      section: sectionKey,
    };
    setTasks(prev => [...prev, newTask]);
  }

  function updateTask(updated) {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    if (selectedTask?.id === updated.id) setSelectedTask(updated);
  }

  function deleteTask(id) {
    setTasks(prev => prev.filter(t => t.id !== id));
    if (selectedTask?.id === id) setSelectedTask(null);
  }

  function moveTask(taskId, newSectionKey) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, section: newSectionKey } : t));
  }

  // ── Filter → Sort → pipeline ──
  const processedTasks = useMemo(() => {
    let result = tasks;
    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => t.title.toLowerCase().includes(q));
    }
    // Filter by priority
    if (filterConfig.priorities.length > 0)
      result = result.filter(t => filterConfig.priorities.includes(t.priority));
    // Filter by project
    if (filterConfig.projects.length > 0)
      result = result.filter(t => {
        const proj = typeof t.project === 'object' ? t.project?.name : t.project;
        return filterConfig.projects.includes(proj);
      });
    // Sort
    if (sortConfig.field !== 'none') {
      result = [...result].sort((a, b) => {
        const { field, dir } = sortConfig;
        let va, vb;
        if (field === 'dueDate') {
          va = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          vb = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        } else if (field === 'title') {
          va = a.title.toLowerCase(); vb = b.title.toLowerCase();
        } else if (field === 'priority') {
          const o = { urgent: 0, high: 1, medium: 2, low: 3 };
          va = o[a.priority] ?? 4; vb = o[b.priority] ?? 4;
        } else if (field === 'project') {
          va = (typeof a.project === 'object' ? a.project?.name : a.project) || '';
          vb = (typeof b.project === 'object' ? b.project?.name : b.project) || '';
        }
        if (va < vb) return dir === 'asc' ? -1 : 1;
        if (va > vb) return dir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [tasks, searchQuery, filterConfig, sortConfig]);

  const sections = classifyTasks(processedTasks);

  // ── Dynamic list sections based on groupBy ──
  const listSections = useMemo(() => {
    if (groupBy === 'section') return null; // use SECTION_DEFS + sections
    const active = processedTasks.filter(t => t.status !== 'done' && t.status !== 'completed');
    if (groupBy === 'none') return [{ key: 'all', label: '所有任務', tasks: active }];
    if (groupBy === 'project') {
      const map = {};
      active.forEach(t => {
        const p = (typeof t.project === 'object' ? t.project?.name : t.project) || '未分類';
        if (!map[p]) map[p] = [];
        map[p].push(t);
      });
      return Object.entries(map).map(([key, ts]) => ({ key, label: key, tasks: ts }));
    }
    if (groupBy === 'priority') {
      const order = ['urgent', 'high', 'medium', 'low', ''];
      const labels = { urgent: '🔴 緊急', high: '🟠 高', medium: '🔵 中', low: '🟢 低', '': '⚪ 未設定' };
      const map = {};
      active.forEach(t => { const p = t.priority || ''; if (!map[p]) map[p] = []; map[p].push(t); });
      return order.filter(p => map[p]?.length).map(k => ({ key: k, label: labels[k], tasks: map[k] }));
    }
    return null;
  }, [processedTasks, groupBy]);

  const filterActiveCount = filterConfig.projects.length + filterConfig.priorities.length;

  // Attach _sectionKey to each task for drag-drop tracking
  const sectionsWithKey = Object.fromEntries(
    Object.entries(sections).map(([key, arr]) => [
      key,
      arr.map(t => ({ ...t, _sectionKey: key })),
    ])
  );
  const SECTION_DEFS = [
    { key: 'recent', label: '近期指派' },
    { key: 'today', label: '今天執行' },
    { key: 'week', label: '下週執行' },
    { key: 'later', label: '稍後執行' },
  ];

  const TABS = [
    { key: 'list', label: '清單' },
    { key: 'board', label: '看板' },
    { key: 'calendar', label: '行事曆' },
    { key: 'dashboard', label: '儀表板' },
    { key: 'files', label: '檔案' },
  ];

  const toolbarBtnStyle = {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', background: 'none',
    border: `1px solid ${C.gray200}`, borderRadius: 6,
    cursor: 'pointer', fontSize: 13, color: C.gray600, fontWeight: 500,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.pageBg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Sticky top area */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: C.pageBg }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 24px 12px', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <Avatar name="JL" size={32} />
            <span style={{ fontSize: 20, fontWeight: 700, color: C.gray800 }}>我的任務</span>
            <div ref={titleMenuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowTitleMenu(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: showTitleMenu ? C.accent : C.gray400, fontSize: 14, padding: '2px 4px', borderRadius: 4, transition: 'color 0.15s' }}
                title="更多選項"
              >▾</button>
              {showTitleMenu && (
                <TitleMenuDropdown
                  onClose={() => setShowTitleMenu(false)}
                  onRename={() => { const el = document.querySelector('[data-title-text]'); if (el) el.focus(); }}
                  onShare={() => setShowShare(true)}
                />
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowShare(true)}
              style={{ ...toolbarBtnStyle, borderColor: C.gray200 }}
              onMouseEnter={e => { e.currentTarget.style.background = C.gray50; e.currentTarget.style.borderColor = C.gray300; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = C.gray200; }}
            >分享</button>
            <button
              onClick={() => setShowCustomize(true)}
              style={{ ...toolbarBtnStyle, borderColor: C.gray200 }}
              onMouseEnter={e => { e.currentTarget.style.background = C.gray50; e.currentTarget.style.borderColor = C.gray300; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = C.gray200; }}
            >自訂</button>
          </div>
        </div>

        {/* Modals */}
        {showShare && <ShareModal onClose={() => setShowShare(false)} />}
        {showCustomize && (
          <CustomizeModal
            optionsConfig={optionsConfig}
            onApply={cfg => setOptionsConfig(cfg)}
            onClose={() => setShowCustomize(false)}
          />
        )}

        {/* View Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 24px', borderBottom: `1px solid ${C.gray200}`, background: C.white, gap: 0 }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 16px', background: 'none', border: 'none',
                borderBottom: `2px solid ${activeTab === tab.key ? C.accent : 'transparent'}`,
                color: activeTab === tab.key ? C.accent : C.gray500,
                cursor: 'pointer', fontSize: 14, fontWeight: activeTab === tab.key ? 600 : 400,
                marginBottom: -1, whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
          {/* Add view button */}
          <div ref={addViewRef} style={{ position: 'relative', marginLeft: 4 }}>
            <button
              onClick={() => setShowAddView(v => !v)}
              style={{ padding: '10px 10px', background: 'none', border: 'none', cursor: 'pointer', color: C.gray400, fontSize: 18, lineHeight: 1, marginBottom: -1 }}
            >
              +
            </button>
            {showAddView && <AddViewPopup onClose={() => setShowAddView(false)} />}
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 24px', background: C.white, borderBottom: `1px solid ${C.gray200}`, gap: 8 }}>
          {/* Add Task button */}
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.accent}` }}>
              <button
                onClick={() => addTask('recent', '新任務')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', background: C.accent, color: C.white,
                  border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500,
                  borderRight: `1px solid ${C.accentHover}`,
                }}
              >
                + 新增任務
              </button>
              <button
                onClick={() => setShowAddTypeDropdown(v => !v)}
                style={{ padding: '6px 10px', background: C.accent, color: C.white, border: 'none', cursor: 'pointer', fontSize: 13 }}
              >
                ▾
              </button>
            </div>
            {showAddTypeDropdown && (
              <AddTaskDropdown
                onClose={() => setShowAddTypeDropdown(false)}
                onAdd={type => addTask('recent', `新${type === 'task' ? '任務' : type === 'approval' ? '核准' : type === 'milestone' ? '里程碑' : '區段'}`)}
              />
            )}
          </div>

          <div style={{ flex: 1 }} />

          {/* ── 篩選 ── */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowFilter(v => !v); setShowSort(false); setShowGroup(false); setShowOptions(false); }}
              style={{ ...toolbarBtnStyle, background: filterActiveCount > 0 ? C.accentLight : 'none', borderColor: filterActiveCount > 0 ? C.accent : C.gray200, color: filterActiveCount > 0 ? C.accent : C.gray600 }}
              onMouseEnter={e => { e.currentTarget.style.background = filterActiveCount > 0 ? C.accentLight : C.gray50; }}
              onMouseLeave={e => { e.currentTarget.style.background = filterActiveCount > 0 ? C.accentLight : 'none'; }}
            >
              <span>≡</span>
              <span>篩選</span>
              {filterActiveCount > 0 && (
                <span style={{ background: C.accent, color: C.white, borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, marginLeft: 2 }}>
                  {filterActiveCount}
                </span>
              )}
            </button>
            {showFilter && (
              <FilterPopup config={filterConfig} tasks={tasks} onApply={c => setFilterConfig(c)} onClose={() => setShowFilter(false)} />
            )}
          </div>

          {/* ── 排序 ── */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowSort(v => !v); setShowFilter(false); setShowGroup(false); setShowOptions(false); }}
              style={{ ...toolbarBtnStyle, background: sortConfig.field !== 'none' ? C.accentLight : 'none', borderColor: sortConfig.field !== 'none' ? C.accent : C.gray200, color: sortConfig.field !== 'none' ? C.accent : C.gray600 }}
              onMouseEnter={e => { e.currentTarget.style.background = sortConfig.field !== 'none' ? C.accentLight : C.gray50; }}
              onMouseLeave={e => { e.currentTarget.style.background = sortConfig.field !== 'none' ? C.accentLight : 'none'; }}
            >
              <span>↑↓</span>
              <span>排序{sortConfig.field !== 'none' ? ` · ${{ dueDate: '日期', title: '名稱', priority: '優先級', project: '專案' }[sortConfig.field]}${sortConfig.dir === 'asc' ? ' ↑' : ' ↓'}` : ''}</span>
            </button>
            {showSort && (
              <SortPopup config={sortConfig} onApply={c => setSortConfig(c)} onClose={() => setShowSort(false)} />
            )}
          </div>

          {/* ── 群組 ── */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowGroup(v => !v); setShowFilter(false); setShowSort(false); setShowOptions(false); }}
              style={{ ...toolbarBtnStyle, background: groupBy !== 'section' ? C.accentLight : 'none', borderColor: groupBy !== 'section' ? C.accent : C.gray200, color: groupBy !== 'section' ? C.accent : C.gray600 }}
              onMouseEnter={e => { e.currentTarget.style.background = groupBy !== 'section' ? C.accentLight : C.gray50; }}
              onMouseLeave={e => { e.currentTarget.style.background = groupBy !== 'section' ? C.accentLight : 'none'; }}
            >
              <span>⊞</span>
              <span>群組{groupBy !== 'section' ? ` · ${{ project: '專案', priority: '優先級', none: '無' }[groupBy] || groupBy}` : ''}</span>
            </button>
            {showGroup && (
              <GroupPopup groupBy={groupBy} onApply={g => setGroupBy(g)} onClose={() => setShowGroup(false)} />
            )}
          </div>

          {/* ── 選項 ── */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowOptions(v => !v); setShowFilter(false); setShowSort(false); setShowGroup(false); }}
              style={{ ...toolbarBtnStyle, background: !Object.values(optionsConfig).every(Boolean) ? C.accentLight : 'none', borderColor: !Object.values(optionsConfig).every(Boolean) ? C.accent : C.gray200, color: !Object.values(optionsConfig).every(Boolean) ? C.accent : C.gray600 }}
              onMouseEnter={e => { e.currentTarget.style.background = !Object.values(optionsConfig).every(Boolean) ? C.accentLight : C.gray50; }}
              onMouseLeave={e => { e.currentTarget.style.background = !Object.values(optionsConfig).every(Boolean) ? C.accentLight : 'none'; }}
            >
              <span>⚙</span>
              <span>選項</span>
            </button>
            {showOptions && (
              <OptionsPopup config={optionsConfig} onApply={c => setOptionsConfig(c)} onClose={() => setShowOptions(false)} />
            )}
          </div>

          {/* ── 搜尋 ── */}
          <button
            onClick={() => { setShowSearch(v => !v); if (showSearch) setSearchQuery(''); setShowFilter(false); setShowSort(false); setShowGroup(false); setShowOptions(false); }}
            style={{ padding: '5px 10px', background: showSearch ? C.accentLight : 'none', border: `1px solid ${showSearch ? C.accent : C.gray200}`, borderRadius: 6, cursor: 'pointer', color: showSearch ? C.accent : C.gray500, fontSize: 16 }}
          >
            🔍
          </button>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div style={{ padding: '8px 24px 6px', background: C.white, borderBottom: `1px solid ${C.gray200}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: C.gray50, border: `1.5px solid ${C.accent}`, borderRadius: 8 }}>
              <span style={{ color: C.gray400, fontSize: 15 }}>🔍</span>
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜尋任務名稱⋯"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: C.gray800 }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gray400, fontSize: 18, lineHeight: 1, padding: '0 2px' }}>×</button>
              )}
              <span style={{ fontSize: 12, color: C.gray400 }}>
                {processedTasks.length} / {tasks.length} 筆
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', background: C.white }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: C.gray400, fontSize: 14 }}>
            載入中...
          </div>
        ) : activeTab === 'list' ? (
          <>
            <TableHeader optionsConfig={optionsConfig} />
            {listSections
              ? listSections.map(sec => (
                  <Section
                    key={sec.key}
                    title={sec.label}
                    tasks={sec.tasks}
                    doneSet={doneSet}
                    onToggle={toggleDone}
                    onOpen={setSelectedTask}
                    onAdd={title => addTask(sec.key === 'all' ? 'recent' : sec.key, title)}
                    optionsConfig={optionsConfig}
                  />
                ))
              : SECTION_DEFS.map(sec => (
                  <Section
                    key={sec.key}
                    title={sec.label}
                    tasks={sections[sec.key] || []}
                    doneSet={doneSet}
                    onToggle={toggleDone}
                    onOpen={setSelectedTask}
                    onAdd={(title, type) => addTask(sec.key, title)}
                    optionsConfig={optionsConfig}
                  />
                ))
            }
            {/* No results state */}
            {processedTasks.filter(t => t.status !== 'done' && t.status !== 'completed').length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: C.gray400 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>找不到符合的任務</div>
                <div style={{ fontSize: 13 }}>請嘗試調整篩選條件或搜尋關鍵字</div>
              </div>
            )}
          </>
        ) : activeTab === 'board' ? (
          <KanbanView
            sections={sectionsWithKey}
            doneSet={doneSet}
            onToggle={toggleDone}
            onOpen={setSelectedTask}
            onAdd={addTask}
            onMoveTask={moveTask}
          />
        ) : activeTab === 'calendar' ? (
          <CalendarView
            tasks={processedTasks}
            doneSet={doneSet}
            onToggle={toggleDone}
            onOpen={setSelectedTask}
            onAdd={addTask}
          />
        ) : activeTab === 'dashboard' ? (
          <DashboardView
            tasks={processedTasks}
            doneSet={doneSet}
            onOpen={setSelectedTask}
            onSwitchTab={tab => setActiveTab(tab)}
            onFilterProject={projName => {
              setFilterConfig(prev => ({ ...prev, projects: [projName] }));
              setGroupBy('section');
              setActiveTab('list');
            }}
          />
        ) : activeTab === 'files' ? (
          <FilesView tasks={processedTasks} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: C.gray400, fontSize: 15 }}>
            {TABS.find(t => t.key === activeTab)?.label} 視圖開發中
          </div>
        )}
      </div>

      {/* Side Panel */}
      {selectedTask && (
        <SidePanel
          task={{ ...selectedTask, done: doneSet.has(selectedTask.id) }}
          onClose={() => setSelectedTask(null)}
          onUpdate={updateTask}
          onDelete={deleteTask}
        />
      )}
    </div>
  );
}
