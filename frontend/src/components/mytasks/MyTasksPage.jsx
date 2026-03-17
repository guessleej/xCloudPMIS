/**
 * MyTasksPage.jsx
 * 我的任務 — Asana 精確對齊版本
 * API: http://localhost:3010
 */
import { useState, useEffect, useRef, useCallback } from 'react';

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
function SidePanel({ task, onClose, onUpdate }) {
  const [tab, setTab] = useState('detail');
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description || '');
  const [done, setDone] = useState(task.done || false);
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
    onUpdate({ ...task, title, description: desc, done });
  }, [task, title, desc, done, onUpdate]);

  useEffect(() => {
    setTitle(task.title);
    setDesc(task.description || '');
    setDone(task.done || false);
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
              {[
                /* Bug #T-02/T-03 修復：assignee/project 可能是物件或字串 */
                { label: '負責人', value: typeof task.assignee === 'object' ? (task.assignee?.name || '—') : (task.assignee || '—') },
                { label: '截止日期', value: task.dueDate ? formatDate(task.dueDate) : '—' },
                { label: '專案', value: typeof task.project === 'object' ? (task.project?.name || '—') : (task.project || '—'), color: task.projectColor },
                { label: '優先度', value: task.priority === 'urgent' ? '緊急' : task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : task.priority === 'low' ? '低' : (task.priority || '—') },
              ].map(f => (
                <div key={f.label} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.gray100}` }}>
                  <div style={{ width: 120, fontSize: 13, color: C.gray500, flexShrink: 0 }}>{f.label}</div>
                  <div style={{ flex: 1, fontSize: 14, color: C.gray700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {f.color && <div style={{ width: 8, height: 8, borderRadius: '50%', background: f.color }} />}
                    {f.value}
                  </div>
                </div>
              ))}

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
function TaskRow({ task, done, onToggle, onOpen }) {
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
      <div style={{ width: 120, flexShrink: 0, fontSize: 13, color: overdue ? C.accent : C.gray500, padding: '0 8px' }}>
        {dateLabel}
      </div>

      {/* Collaborators */}
      <div style={{ width: 100, flexShrink: 0, padding: '0 8px', display: 'flex', alignItems: 'center' }}>
        {task.assignee ? (
          /* Bug #T-02 修復：assignee 可能是字串（demo）或物件 {id,name}（API） */
          <Avatar name={typeof task.assignee === 'object' ? (task.assignee?.name || '??') : task.assignee} size={22} />
        ) : (
          <span style={{ fontSize: 12, color: C.gray300 }}>+</span>
        )}
      </div>

      {/* Project */}
      <div style={{ width: 140, flexShrink: 0, padding: '0 8px' }}>
        {/* Bug #T-03 修復：project 可能是字串（demo）或物件 {id,name}（API） */}
        <ProjectBadge
          name={typeof task.project === 'object' ? (task.project?.name || null) : task.project}
          color={task.projectColor}
        />
      </div>

      {/* Visibility */}
      <div style={{ width: 130, flexShrink: 0, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.gray400 }}>
        🔒 <span>我的工作空間</span>
      </div>
    </div>
  );
}

// ── Section ──────────────────────────────────────────────────
function Section({ title, tasks, doneSet, onToggle, onOpen, onAdd }) {
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
function TableHeader() {
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
      <div style={thStyle(120)}>截止日期</div>
      <div style={thStyle(100)}>協作者</div>
      <div style={thStyle(140)}>專案</div>
      <div style={thStyle(130)}>任務可見度</div>
      <div style={{ width: 30, flexShrink: 0, cursor: 'pointer', textAlign: 'center', fontSize: 16, color: C.gray400, padding: '8px 4px' }}>+</div>
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

  const sections = classifyTasks(tasks);
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
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gray400, fontSize: 14, padding: '0 2px' }}>▾</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...toolbarBtnStyle, borderColor: C.gray200 }}>分享</button>
            <button style={{ ...toolbarBtnStyle, borderColor: C.gray200 }}>自訂</button>
          </div>
        </div>

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

          {/* Toolbar buttons */}
          {[
            { icon: '≡', label: '篩選' },
            { icon: '↑↓', label: '排序' },
            { icon: '⊞', label: '群組' },
            { icon: '⚙', label: '選項' },
          ].map(btn => (
            <button key={btn.label} style={toolbarBtnStyle}
              onMouseEnter={e => { e.currentTarget.style.background = C.gray50; e.currentTarget.style.borderColor = C.gray300; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = C.gray200; }}
            >
              <span>{btn.icon}</span>
              <span>{btn.label}</span>
            </button>
          ))}

          {/* Search icon */}
          <button style={{ padding: '5px 10px', background: 'none', border: `1px solid ${C.gray200}`, borderRadius: 6, cursor: 'pointer', color: C.gray500, fontSize: 16 }}>
            🔍
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', background: C.white }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: C.gray400, fontSize: 14 }}>
            載入中...
          </div>
        ) : activeTab === 'list' ? (
          <>
            <TableHeader />
            {SECTION_DEFS.map(sec => (
              <Section
                key={sec.key}
                title={sec.label}
                tasks={sections[sec.key] || []}
                doneSet={doneSet}
                onToggle={toggleDone}
                onOpen={setSelectedTask}
                onAdd={(title, type) => addTask(sec.key, title)}
              />
            ))}
          </>
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
        />
      )}
    </div>
  );
}
