/**
 * GanttPage — 甘特圖頁面
 *
 * 功能：
 *   - 以時間軸顯示所有專案、任務與里程碑
 *   - 左側欄位凍結（position: sticky），可水平捲動查看整段時間
 *   - 支援縮放（1個月 / 3個月 / 6個月 / 全部）
 *   - 點擊專案可展開 / 收合任務清單
 *   - 紅色今日標記線、里程碑菱形（◆）標示
 *   - 滑鼠懸停列時顯示編輯 / 刪除按鈕
 *
 * 版面架構：
 *   ┌──────────────────────────────────────────────────────┐
 *   │ 控制列：標題、展開/收合、縮放選擇、重新整理          │
 *   ├──────────┬───────────────────────────────────────────┤
 *   │ 專案/任務 │  Jan 2025      Feb 2025    Mar 2025      │ ← 月份標頭（sticky top）
 *   ├──────────┼───────────────────────────────────────────┤
 *   │ ▶ 專案A  │  ━━━━━━━━━━━━━━━━  ◆                    │
 *   │   任務1  │       ████████                            │
 *   │   任務2  │             ████████████                  │
 *   ├──────────┼───────────────────────────────────────────┤
 *   │ ▶ 專案B  │  ━━━━━━━━━━━━━━━━                        │
 *   └──────────┴───────────────────────────────────────────┘
 *   │ 圖例列                                               │
 *   └──────────────────────────────────────────────────────┘
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';

// ── 常數設定 ────────────────────────────────────────────────
const API_BASE   = '/api';
const LEFT_COL   = 240;  // 左側凍結欄寬度（px）
const ROW_H      = 44;   // 每列高度（px）
const HEADER_H   = 48;   // 月份標頭高度（px）
const BAR_H      = 22;   // 甘特條高度（px）
const BAR_TOP    = (ROW_H - BAR_H) / 2;  // 甘特條垂直置中偏移

// ── 縮放選項（每日寬度 px） ─────────────────────────────────
const ZOOM_OPTS = [
  { id: '1m',  label: '1 個月', dayW: 28   },
  { id: '3m',  label: '3 個月', dayW: 10   },
  { id: '6m',  label: '6 個月', dayW: 5.5  },
  { id: 'all', label: '全部',   dayW: null }, // 自動計算
];

// ── 顏色對應表 ──────────────────────────────────────────────
const PROJECT_STATUS_COLOR = {
  planning:  '#8b5cf6',
  active:    '#3b82f6',
  on_hold:   '#f59e0b',
  completed: '#10b981',
  cancelled: '#ef4444',
};

const TASK_STATUS_COLOR = {
  todo:        '#9ca3af',
  in_progress: '#3b82f6',
  review:      '#f59e0b',
  done:        '#10b981',
};

const TASK_STATUS_LABEL = {
  todo:        '待辦',
  in_progress: '進行中',
  review:      '審核中',
  done:        '已完成',
};

const PRIORITY_COLOR = {
  urgent: '#ef4444',
  high:   '#f97316',
  medium: '#3b82f6',
  low:    '#22c55e',
};

const PRIORITY_LABEL = {
  urgent: '🔴 緊急',
  high:   '🟠 高',
  medium: '🔵 中',
  low:    '🟢 低',
};

const MILESTONE_COLOR_MAP = {
  red:    '#ef4444',
  yellow: '#f59e0b',
  green:  '#10b981',
};

const PROJECT_STATUS_LABEL = {
  planning:  '規劃中',
  active:    '進行中',
  on_hold:   '暫停',
  completed: '已完成',
  cancelled: '已取消',
};

// ── 工具函式 ────────────────────────────────────────────────

/**
 * 將 YYYY-MM-DD 字串轉為 Date 物件（本地時區零時，避免時區偏移）
 */
const toDateObj = (str) => str ? new Date(str + 'T00:00:00') : null;

/**
 * 計算兩個 Date 物件相差的整天數（b - a）
 */
const daysBetween = (a, b) => Math.floor((b.getTime() - a.getTime()) / 86400000);

/**
 * 計算甘特條的 left / width（px）
 * 若 endStr 為 null，視為單日條（1 天寬）
 */
function calcBar(startStr, endStr, rangeStartStr, dayW) {
  if (!startStr) return null;
  const rangeS = toDateObj(rangeStartStr);
  const s = toDateObj(startStr);
  const e = endStr ? toDateObj(endStr) : s;
  const offsetDays = daysBetween(rangeS, s);
  const durationDays = Math.max(1, daysBetween(s, e) + 1);
  return {
    left:  Math.max(0, offsetDays) * dayW,
    width: Math.max(dayW, durationDays * dayW),
  };
}

/**
 * 依日期陣列產生月份分組，每個分組記錄：月份標籤、起始索引、天數
 */
function buildMonths(days) {
  const months = [];
  for (let i = 0; i < days.length; i++) {
    const label = days[i].toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });
    if (!months.length || months[months.length - 1].label !== label) {
      months.push({ label, startIdx: i, count: 1 });
    } else {
      months[months.length - 1].count++;
    }
  }
  return months;
}

/**
 * 產生從 startStr 到 endStr 的每日 Date 陣列
 */
function buildDays(startStr, endStr) {
  const days = [];
  const cur  = toDateObj(startStr);
  const end  = toDateObj(endStr);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/**
 * 產生 CSS repeating-linear-gradient 以標示週末（六、日）
 * 原理：計算從 rangeStart 到第一個週六的天數作為偏移量，
 *      再以 7 天為週期重複淡色色塊
 */
function getWeekendBgStyle(rangeStartStr, dayW) {
  if (!rangeStartStr || dayW < 2) return {};
  const startDOW  = toDateObj(rangeStartStr).getDay(); // 0=日, 6=六
  const daysToSat = (6 - startDOW + 7) % 7;            // 距下一個週六的天數
  const period    = Math.round(7 * dayW);
  const satX      = Math.round(daysToSat * dayW);
  const sunW      = Math.round(2 * dayW); // 週六 + 週日共 2 天

  return {
    backgroundImage: [
      'repeating-linear-gradient(',
      '  to right,',
      '  transparent 0px,',
      `  transparent ${satX}px,`,
      `  rgba(148,163,184,0.12) ${satX}px,`,
      `  rgba(148,163,184,0.12) ${Math.min(satX + sunW, period)}px,`,
      `  transparent ${Math.min(satX + sunW, period)}px,`,
      `  transparent ${period}px`,
      ')',
    ].join(''),
  };
}

// ── 按鈕樣式輔助函式 ────────────────────────────────────────
const btnSt = (bg, fg, extra = {}) => ({
  background: bg, color: fg,
  border: 'none', borderRadius: 6,
  padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  ...extra,
});

// ── 模態框共用樣式 ──────────────────────────────────────────
const overlayStyle = {
  position:       'fixed',
  inset:          0,
  background:     'rgba(0,0,0,0.45)',
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  zIndex:         9999,
};
const modalStyle = {
  background:  'white',
  borderRadius: 12,
  padding:      28,
  width:        480,
  maxWidth:     '92vw',
  maxHeight:    '85vh',
  overflowY:    'auto',
  boxShadow:    '0 20px 60px rgba(0,0,0,0.25)',
};

// ── 共用表單 Input 樣式 ─────────────────────────────────────
const inputSt = {
  width:        '100%',
  padding:      '8px 10px',
  border:       '1px solid #d1d5db',
  borderRadius: 6,
  fontSize:     13,
  outline:      'none',
  boxSizing:    'border-box',
  fontFamily:   'inherit',
};

// ── 共用欄位標籤樣式 ────────────────────────────────────────
const LabelRow = ({ label, required, children }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
      {label}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
    </div>
    {children}
  </div>
);

// ════════════════════════════════════════════════════════════
// 子元件：EditProjectModal — 編輯專案
// ════════════════════════════════════════════════════════════
function EditProjectModal({ project, users, onClose, onSaved }) {
  const [form, setForm]       = useState({
    name: '', description: '', status: 'active',
    budget: '', startDate: '', endDate: '', ownerId: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  // 取得完整專案資料（含 description / budget）
  useEffect(() => {
    fetch(`${API_BASE}/projects/${project.id}`)
      .then(r => r.json())
      .then(resp => {
        const d = resp.data || resp;
        setForm({
          name:        d.name        || '',
          description: d.description || '',
          status:      d.status      || 'active',
          budget:      d.budget != null ? d.budget : '',
          startDate:   d.startDate   ? d.startDate.slice(0, 10) : '',
          endDate:     d.endDate     ? d.endDate.slice(0, 10)   : '',
          ownerId:     d.ownerId     || (d.owner?.id ?? ''),
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [project.id]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { setError('專案名稱不能為空'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/projects/${project.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        form.name.trim(),
          description: form.description.trim() || null,
          status:      form.status,
          budget:      form.budget !== '' ? parseFloat(form.budget) : null,
          startDate:   form.startDate || null,
          endDate:     form.endDate   || null,
          ownerId:     form.ownerId   ? parseInt(form.ownerId) : null,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || '更新失敗');
      }
      onSaved();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* 標題列 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>✏️ 編輯專案</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>×</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: '#9ca3af' }}>載入中...</div>
        ) : (
          <>
            <LabelRow label="專案名稱" required>
              <input style={inputSt} value={form.name} onChange={e => set('name', e.target.value)} placeholder="專案名稱" />
            </LabelRow>

            <LabelRow label="描述">
              <textarea
                style={{ ...inputSt, minHeight: 72, resize: 'vertical' }}
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="專案說明（選填）"
              />
            </LabelRow>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <LabelRow label="狀態">
                <select style={inputSt} value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="planning">規劃中</option>
                  <option value="active">進行中</option>
                  <option value="on_hold">暫停</option>
                  <option value="completed">已完成</option>
                  <option value="cancelled">已取消</option>
                </select>
              </LabelRow>
              <LabelRow label="預算（元）">
                <input style={inputSt} type="number" value={form.budget} onChange={e => set('budget', e.target.value)} placeholder="0" />
              </LabelRow>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <LabelRow label="開始日期">
                <input style={inputSt} type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
              </LabelRow>
              <LabelRow label="結束日期">
                <input style={inputSt} type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
              </LabelRow>
            </div>

            <LabelRow label="負責人">
              <select style={inputSt} value={form.ownerId} onChange={e => set('ownerId', e.target.value)}>
                <option value="">（未指定）</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </LabelRow>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={btnSt('#f3f4f6', '#374151', { padding: '8px 18px' })}>取消</button>
              <button onClick={save} disabled={saving} style={btnSt('#3b82f6', 'white', { padding: '8px 18px', opacity: saving ? 0.7 : 1 })}>
                {saving ? '儲存中...' : '💾 儲存'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 子元件：DeleteProjectModal — 刪除專案確認
// ════════════════════════════════════════════════════════════
function DeleteProjectModal({ project, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const confirm = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/projects/${project.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || '刪除失敗');
      }
      onDeleted();
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  const taskCount = project.taskCount || project.tasks?.length || 0;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🗑️</div>
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#111827' }}>刪除專案</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>確定要刪除以下專案嗎？</p>
        </div>

        {/* 專案資訊卡 */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#111827', fontSize: 14, marginBottom: 4 }}>{project.name}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            狀態：{PROJECT_STATUS_LABEL[project.status] || project.status}
            {taskCount > 0 && <span style={{ marginLeft: 12 }}>任務：{taskCount} 個</span>}
          </div>
        </div>

        {taskCount > 0 && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '8px 12px', color: '#c2410c', fontSize: 12, marginBottom: 14 }}>
            ⚠️ 此專案包含 {taskCount} 個任務，刪除後將一併隱藏。
          </div>
        )}

        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '7px 12px', color: '#166534', fontSize: 11, marginBottom: 16 }}>
          ✅ 資料採軟刪除，不會永久移除，如有需要可由系統管理員復原。
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSt('#f3f4f6', '#374151', { padding: '8px 18px' })}>取消</button>
          <button onClick={confirm} disabled={loading} style={btnSt('#ef4444', 'white', { padding: '8px 18px', opacity: loading ? 0.7 : 1 })}>
            {loading ? '刪除中...' : '🗑️ 確認刪除'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 子元件：EditTaskModal — 編輯任務
// ════════════════════════════════════════════════════════════
function EditTaskModal({ task, project, users, onClose, onSaved }) {
  const [form, setForm] = useState({
    title:      task.title      || '',
    status:     task.status     || 'todo',
    priority:   task.priority   || 'medium',
    assigneeId: task.assignee?.id || '',
    planStart:  task.planStart  ? task.planStart.slice(0, 10) : '',
    planEnd:    task.planEnd    ? task.planEnd.slice(0, 10)   : '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!form.title.trim()) { setError('任務標題不能為空'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/projects/tasks/${task.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:      form.title.trim(),
          status:     form.status,
          priority:   form.priority,
          assigneeId: form.assigneeId ? parseInt(form.assigneeId) : null,
          planStart:  form.planStart || null,
          planEnd:    form.planEnd   || null,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || '更新失敗');
      }
      onSaved();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* 標題列 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 700, color: '#111827' }}>✏️ 編輯任務</h3>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>專案：{project.name}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>×</button>
        </div>

        <LabelRow label="任務標題" required>
          <input style={inputSt} value={form.title} onChange={e => set('title', e.target.value)} placeholder="任務標題" />
        </LabelRow>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <LabelRow label="狀態">
            <select style={inputSt} value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="todo">待辦</option>
              <option value="in_progress">進行中</option>
              <option value="review">審核中</option>
              <option value="done">已完成</option>
            </select>
          </LabelRow>
          <LabelRow label="優先度">
            <select style={inputSt} value={form.priority} onChange={e => set('priority', e.target.value)}>
              <option value="low">🟢 低</option>
              <option value="medium">🔵 中</option>
              <option value="high">🟠 高</option>
              <option value="urgent">🔴 緊急</option>
            </select>
          </LabelRow>
        </div>

        <LabelRow label="負責人">
          <select style={inputSt} value={form.assigneeId} onChange={e => set('assigneeId', e.target.value)}>
            <option value="">（未指定）</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </LabelRow>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <LabelRow label="計劃開始">
            <input style={inputSt} type="date" value={form.planStart} onChange={e => set('planStart', e.target.value)} />
          </LabelRow>
          <LabelRow label="計劃結束">
            <input style={inputSt} type="date" value={form.planEnd} onChange={e => set('planEnd', e.target.value)} />
          </LabelRow>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSt('#f3f4f6', '#374151', { padding: '8px 18px' })}>取消</button>
          <button onClick={save} disabled={saving} style={btnSt('#3b82f6', 'white', { padding: '8px 18px', opacity: saving ? 0.7 : 1 })}>
            {saving ? '儲存中...' : '💾 儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 子元件：DeleteTaskModal — 刪除任務確認
// ════════════════════════════════════════════════════════════
function DeleteTaskModal({ task, project, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const confirm = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/projects/tasks/${task.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || '刪除失敗');
      }
      onDeleted();
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  const pc = PRIORITY_COLOR[task.priority] || '#9ca3af';

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: 400 }} onClick={e => e.stopPropagation()}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🗑️</div>
          <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#111827' }}>刪除任務</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>確定要刪除以下任務嗎？</p>
        </div>

        {/* 任務資訊卡 */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>專案：{project.name}</div>
          <div style={{ fontWeight: 700, color: '#111827', fontSize: 14, marginBottom: 6 }}>{task.title}</div>
          <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
            <span style={{ background: `${pc}20`, color: pc, borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>
              {PRIORITY_LABEL[task.priority] || task.priority}
            </span>
            {task.assignee && (
              <span style={{ background: '#e5e7eb', color: '#6b7280', borderRadius: 4, padding: '2px 7px' }}>
                👤 {task.assignee.name}
              </span>
            )}
          </div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '7px 12px', color: '#166534', fontSize: 11, marginBottom: 16 }}>
          ✅ 資料採軟刪除，不會永久移除，如有需要可由系統管理員復原。
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSt('#f3f4f6', '#374151', { padding: '8px 18px' })}>取消</button>
          <button onClick={confirm} disabled={loading} style={btnSt('#ef4444', 'white', { padding: '8px 18px', opacity: loading ? 0.7 : 1 })}>
            {loading ? '刪除中...' : '🗑️ 確認刪除'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════
// 主元件：GanttPage
// ════════════════════════════════════════════════════════════
export default function GanttPage() {
  const { user } = useAuth();
  const companyId = user?.companyId;

  const [data,          setData]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [zoom,          setZoom]          = useState('3m');
  const [expanded,      setExpanded]      = useState(new Set()); // 已展開的專案 ID
  const [users,         setUsers]         = useState([]);         // 公司成員清單
  const [hoveredRow,    setHoveredRow]    = useState(null);       // {type:'project'|'task', id}
  const [editProject,   setEditProject]   = useState(null);       // 待編輯的專案
  const [deleteProject, setDeleteProject] = useState(null);       // 待刪除的專案
  const [editTask,      setEditTask]      = useState(null);       // {task, project}
  const [deleteTask,    setDeleteTask]    = useState(null);       // {task, project}
  const [toast,         setToast]         = useState('');         // Toast 訊息
  const containerRef = useRef(null);

  // ── Toast 輔助函式 ──────────────────────────────────────
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // ── 載入甘特圖資料 ──────────────────────────────────────
  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/gantt?companyId=${companyId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      // 預設展開前 2 個專案
      setExpanded(new Set(json.projects.slice(0, 2).map(p => p.id)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── 載入成員列表 ────────────────────────────────────────
  const loadUsers = async () => {
    if (!companyId) return;
    try {
      const res = await fetch(`${API_BASE}/projects/users?companyId=${companyId}`);
      if (!res.ok) return;
      const json = await res.json();
      setUsers(Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : (json.users || [])));
    } catch {}
  };

  useEffect(() => { load(); loadUsers(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 計算每日寬度（px） ──────────────────────────────────
  const dayW = useMemo(() => {
    if (!data) return 10;
    const opt = ZOOM_OPTS.find(o => o.id === zoom);
    if (opt.dayW !== null) return opt.dayW;
    // 'all' 模式：根據容器寬度自動計算
    const avail = (containerRef.current?.clientWidth || 1000) - LEFT_COL - 4;
    return Math.max(2, avail / data.range.totalDays);
  }, [data, zoom]);

  // ── 產生日期陣列與月份分組 ──────────────────────────────
  const days   = useMemo(() => data ? buildDays(data.range.start, data.range.end) : [], [data]);
  const months = useMemo(() => buildMonths(days), [days]);

  // ── 今日在時間軸上的 X 座標 ─────────────────────────────
  const todayX = useMemo(() => {
    if (!data) return -1;
    const offset = daysBetween(toDateObj(data.range.start), new Date());
    return (offset >= 0 && offset < days.length) ? offset * dayW : -1;
  }, [data, dayW, days]);

  // ── 週末背景樣式（整個圖表共用同一個 CSS 漸層） ─────────
  const weekendBg = useMemo(() => data ? getWeekendBgStyle(data.range.start, dayW) : {}, [data, dayW]);

  // ── 總寬度 ──────────────────────────────────────────────
  const totalW = days.length * dayW;

  // ── 展開 / 收合 ─────────────────────────────────────────
  const toggleExpand = (id) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const expandAll   = () => data && setExpanded(new Set(data.projects.map(p => p.id)));
  const collapseAll = () => setExpanded(new Set());

  // ── 操作完成後的處理（重新載入資料） ───────────────────
  const handleProjectSaved = () => {
    setEditProject(null);
    load();
    showToast('✅ 專案已更新');
  };
  const handleProjectDeleted = () => {
    setDeleteProject(null);
    load();
    showToast('🗑️ 專案已刪除');
  };
  const handleTaskSaved = () => {
    setEditTask(null);
    load();
    showToast('✅ 任務已更新');
  };
  const handleTaskDeleted = () => {
    setDeleteTask(null);
    load();
    showToast('🗑️ 任務已刪除');
  };

  // ── 載入中 ──────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 16, color: '#9ca3af' }}>
      <div style={{ fontSize: 40 }}>⏳</div>
      <div style={{ fontSize: 14 }}>甘特圖資料載入中...</div>
    </div>
  );

  // ── 錯誤畫面 ────────────────────────────────────────────
  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 40 }}>😢</div>
      <div style={{ fontWeight: 600, color: '#374151' }}>載入失敗：{error}</div>
      <button onClick={load} style={{ ...btnSt('#3b82f6', 'white'), padding: '8px 20px', fontSize: 14 }}>重試</button>
    </div>
  );

  if (!data) return null;

  return (
    <div style={{
      height:        '100vh',
      display:       'flex',
      flexDirection: 'column',
      background:    '#f8fafc',
      overflow:      'hidden',
    }}>

      {/* ══ 控制列 ══════════════════════════════════════════ */}
      <div style={{
        padding:       '12px 20px',
        background:    'white',
        borderBottom:  '1px solid #e5e7eb',
        display:       'flex',
        alignItems:    'center',
        gap:           10,
        flexShrink:    0,
        flexWrap:      'wrap',
      }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
          📅 甘特圖
        </h2>
        <span style={{ color: '#9ca3af', fontSize: 13 }}>
          {data.projects.length} 個專案
        </span>

        <div style={{ flex: 1 }} />

        {/* 展開 / 收合全部 */}
        <button onClick={expandAll}   style={btnSt('#f3f4f6', '#374151')}>全部展開</button>
        <button onClick={collapseAll} style={btnSt('#f3f4f6', '#374151')}>全部收合</button>

        {/* 縮放選擇 */}
        <div style={{ display: 'flex', gap: 2, background: '#f3f4f6', borderRadius: 8, padding: 3 }}>
          {ZOOM_OPTS.map(o => (
            <button
              key={o.id}
              onClick={() => setZoom(o.id)}
              style={{
                padding:    '4px 10px',
                borderRadius: 5,
                border:     'none',
                cursor:     'pointer',
                fontSize:   11,
                fontWeight: 600,
                background: zoom === o.id ? 'white' : 'transparent',
                color:      zoom === o.id ? '#111827' : '#6b7280',
                boxShadow:  zoom === o.id ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s',
              }}
            >{o.label}</button>
          ))}
        </div>

        {/* 重新整理 */}
        <button onClick={load} style={btnSt('#3b82f6', 'white')}>🔄 重新整理</button>
      </div>

      {/* ══ 甘特圖本體（可橫向 + 縱向捲動） ════════════════ */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflow: 'auto', minHeight: 0, position: 'relative' }}
      >
        {/* 最小寬度 = 左欄 + 時間軸總寬 */}
        <div style={{ minWidth: LEFT_COL + totalW }}>

          {/* ── 月份標頭（上下 sticky） ────────────────────── */}
          <div style={{
            display:      'flex',
            position:     'sticky',
            top:          0,
            zIndex:       20,
            height:       HEADER_H,
            background:   'white',
            borderBottom: '2px solid #e2e8f0',
          }}>
            {/* 左上角凍結格 */}
            <div style={{
              width:          LEFT_COL,
              flexShrink:     0,
              position:       'sticky',
              left:           0,
              top:            0,
              zIndex:         30,   // 最高 z-index，覆蓋其他 sticky 元素
              background:     '#1e293b',
              display:        'flex',
              alignItems:     'center',
              padding:        '0 16px',
              borderRight:    '2px solid #334155',
              borderBottom:   '2px solid #334155',
            }}>
              <span style={{ fontWeight: 700, fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                專案 / 任務
              </span>
            </div>

            {/* 月份標籤區（relative 容器，月份用 absolute 定位） */}
            <div style={{ position: 'relative', flex: 1, ...weekendBg, overflow: 'hidden' }}>
              {months.map((m, mi) => (
                <div key={mi} style={{
                  position:   'absolute',
                  left:       m.startIdx * dayW,
                  width:      m.count * dayW,
                  height:     HEADER_H,
                  display:    'flex',
                  alignItems: 'center',
                  padding:    '0 8px',
                  fontSize:   12,
                  fontWeight: 600,
                  color:      '#374151',
                  borderRight: '1px solid #e2e8f0',
                  boxSizing:  'border-box',
                  overflow:   'hidden',
                  whiteSpace: 'nowrap',
                }}>
                  {m.label}
                </div>
              ))}

              {/* 今日線（標頭部分） */}
              {todayX >= 0 && (
                <div style={{
                  position:  'absolute',
                  left:      todayX,
                  top:       0,
                  bottom:    0,
                  width:     2,
                  background: '#ef4444',
                  zIndex:    5,
                }} />
              )}
            </div>
          </div>

          {/* ── 資料列 ─────────────────────────────────────── */}
          {data.projects.map((project, pi) => {
            const isExpanded  = expanded.has(project.id);
            const hasTasks    = project.tasks.length > 0;
            const pColor      = PROJECT_STATUS_COLOR[project.status] || '#6b7280';
            const pBar        = calcBar(project.startDate, project.endDate, data.range.start, dayW);
            const pct         = project.taskCount > 0
              ? Math.round(project.doneCount / project.taskCount * 100)
              : 0;
            const rowBg       = pi % 2 === 0 ? '#fafafa' : 'white';
            const isProjHover = hoveredRow?.type === 'project' && hoveredRow?.id === project.id;

            return (
              <div key={project.id}>

                {/* ── 專案列 ─────────────────────────────── */}
                <div
                  style={{
                    display:      'flex',
                    height:       ROW_H,
                    background:   isProjHover ? '#eff6ff' : rowBg,
                    borderBottom: '1px solid #e9eef5',
                    transition:   'background 0.1s',
                  }}
                  onMouseEnter={() => setHoveredRow({ type: 'project', id: project.id })}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  {/* 左欄：專案名稱（水平 sticky） */}
                  <div style={{
                    width:       LEFT_COL,
                    flexShrink:  0,
                    position:    'sticky',
                    left:        0,
                    zIndex:      10,
                    background:  isProjHover ? '#eff6ff' : rowBg,
                    height:      '100%',
                    display:     'flex',
                    alignItems:  'center',
                    padding:     '0 10px 0 8px',
                    gap:         6,
                    borderRight: '2px solid #e2e8f0',
                    boxSizing:   'border-box',
                    transition:  'background 0.1s',
                  }}>
                    {/* 展開/收合按鈕 */}
                    <button
                      onClick={() => hasTasks && toggleExpand(project.id)}
                      title={hasTasks ? (isExpanded ? '收合任務' : '展開任務') : '無任務'}
                      style={{
                        background:  'none',
                        border:      'none',
                        cursor:      hasTasks ? 'pointer' : 'default',
                        width:       18,
                        height:      18,
                        display:     'flex',
                        alignItems:  'center',
                        justifyContent: 'center',
                        color:       hasTasks ? '#6b7280' : 'transparent',
                        flexShrink:  0,
                        fontSize:    9,
                        transform:   isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition:  'transform 0.15s',
                        borderRadius: 3,
                      }}
                    >▶</button>

                    {/* 狀態色點 */}
                    <div style={{
                      width:      8,
                      height:     8,
                      borderRadius: '50%',
                      background:  pColor,
                      flexShrink:  0,
                    }} />

                    {/* 專案名稱 */}
                    <span style={{
                      fontSize:   13,
                      fontWeight: 700,
                      color:      '#111827',
                      overflow:   'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex:       1,
                    }}>
                      {project.name}
                    </span>

                    {/* 懸停時顯示操作按鈕，否則顯示任務完成數 */}
                    {isProjHover ? (
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        <button
                          onClick={e => { e.stopPropagation(); setEditProject(project); }}
                          title="編輯專案"
                          style={{
                            background:   '#e0f2fe',
                            color:        '#0369a1',
                            border:       'none',
                            borderRadius: 4,
                            padding:      '2px 6px',
                            fontSize:     11,
                            cursor:       'pointer',
                            fontWeight:   600,
                          }}
                        >✏️</button>
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteProject(project); }}
                          title="刪除專案"
                          style={{
                            background:   '#fee2e2',
                            color:        '#dc2626',
                            border:       'none',
                            borderRadius: 4,
                            padding:      '2px 6px',
                            fontSize:     11,
                            cursor:       'pointer',
                            fontWeight:   600,
                          }}
                        >🗑️</button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>
                        {project.doneCount}/{project.taskCount}
                      </span>
                    )}
                  </div>

                  {/* 右欄：甘特條區 */}
                  <div style={{ flex: 1, position: 'relative', height: '100%', ...weekendBg }}>

                    {/* 專案進度條 */}
                    {pBar && (
                      <div style={{
                        position:   'absolute',
                        left:       pBar.left,
                        width:      pBar.width,
                        top:        BAR_TOP,
                        height:     BAR_H,
                        borderRadius: 5,
                        background: `${pColor}20`,
                        border:     `2px solid ${pColor}`,
                        zIndex:     3,
                        overflow:   'hidden',
                      }}>
                        {/* 完成率填充 */}
                        <div style={{
                          position:  'absolute',
                          left:      0,
                          top:       0,
                          bottom:    0,
                          width:     `${pct}%`,
                          background: `${pColor}40`,
                          transition: 'width 0.3s',
                        }} />
                        {/* 進度文字 */}
                        <div style={{
                          position: 'absolute',
                          inset:    0,
                          display:  'flex',
                          alignItems: 'center',
                          padding:  '0 7px',
                        }}>
                          <span style={{
                            fontSize:   10,
                            fontWeight: 700,
                            color:      pColor,
                            whiteSpace: 'nowrap',
                          }}>
                            {pct}% 完成 · {PROJECT_STATUS_LABEL[project.status] || project.status}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* 里程碑菱形 */}
                    {project.milestones.map(m => {
                      const mOffset = daysBetween(toDateObj(data.range.start), toDateObj(m.dueDate));
                      if (mOffset < 0 || mOffset >= days.length) return null;
                      const mc = MILESTONE_COLOR_MAP[m.color] || '#f59e0b';
                      return (
                        <div
                          key={m.id}
                          title={`◆ ${m.name}（${m.dueDate}）${m.isAchieved ? ' — 已達成 ✅' : ''}`}
                          style={{
                            position:     'absolute',
                            left:         mOffset * dayW - 8,
                            top:          (ROW_H - 16) / 2,
                            width:        16,
                            height:       16,
                            transform:    'rotate(45deg)',
                            background:   m.isAchieved ? mc : 'white',
                            border:       `2.5px solid ${mc}`,
                            zIndex:       6,
                            cursor:       'pointer',
                            borderRadius: 2,
                          }}
                        />
                      );
                    })}

                    {/* 今日線 */}
                    {todayX >= 0 && (
                      <div style={{
                        position:   'absolute',
                        left:       todayX,
                        top:        0,
                        bottom:     0,
                        width:      2,
                        background: 'rgba(239,68,68,0.7)',
                        zIndex:     5,
                        pointerEvents: 'none',
                      }} />
                    )}
                  </div>
                </div>

                {/* ── 任務列（展開後才顯示） ───────────────── */}
                {isExpanded && project.tasks.map((task) => {
                  const tBar       = calcBar(task.planStart || task.actualStart, task.planEnd, data.range.start, dayW);
                  const tc         = TASK_STATUS_COLOR[task.status] || '#9ca3af';
                  const pc         = PRIORITY_COLOR[task.priority]  || '#9ca3af';
                  const isDone     = task.status === 'done';
                  const isTaskHover = hoveredRow?.type === 'task' && hoveredRow?.id === task.id;
                  const taskBg     = isTaskHover ? '#f0fdf4' : '#f8fafc';

                  return (
                    <div
                      key={task.id}
                      style={{
                        display:      'flex',
                        height:       ROW_H,
                        background:   taskBg,
                        borderBottom: '1px solid #f1f5f9',
                        transition:   'background 0.1s',
                      }}
                      onMouseEnter={() => setHoveredRow({ type: 'task', id: task.id })}
                      onMouseLeave={() => setHoveredRow(null)}
                    >
                      {/* 左欄：任務名稱（水平 sticky） */}
                      <div style={{
                        width:       LEFT_COL,
                        flexShrink:  0,
                        position:    'sticky',
                        left:        0,
                        zIndex:      10,
                        background:  taskBg,
                        height:      '100%',
                        display:     'flex',
                        alignItems:  'center',
                        padding:     '0 10px 0 36px', // 縮排以區分層級
                        gap:         6,
                        borderRight: '2px solid #e2e8f0',
                        boxSizing:   'border-box',
                        transition:  'background 0.1s',
                      }}>
                        {/* 優先度色點 */}
                        <div style={{
                          width:      6,
                          height:     6,
                          borderRadius: '50%',
                          background:  pc,
                          flexShrink:  0,
                        }} />

                        {/* 任務標題 */}
                        <span style={{
                          fontSize:        12,
                          color:           isDone ? '#9ca3af' : '#374151',
                          textDecoration:  isDone ? 'line-through' : 'none',
                          overflow:        'hidden',
                          textOverflow:    'ellipsis',
                          whiteSpace:      'nowrap',
                          flex:            1,
                        }}>
                          {task.title}
                        </span>

                        {/* 懸停時顯示操作按鈕，否則顯示負責人縮寫 */}
                        {isTaskHover ? (
                          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                            <button
                              onClick={e => { e.stopPropagation(); setEditTask({ task, project }); }}
                              title="編輯任務"
                              style={{
                                background:   '#e0f2fe',
                                color:        '#0369a1',
                                border:       'none',
                                borderRadius: 4,
                                padding:      '2px 6px',
                                fontSize:     11,
                                cursor:       'pointer',
                                fontWeight:   600,
                              }}
                            >✏️</button>
                            <button
                              onClick={e => { e.stopPropagation(); setDeleteTask({ task, project }); }}
                              title="刪除任務"
                              style={{
                                background:   '#fee2e2',
                                color:        '#dc2626',
                                border:       'none',
                                borderRadius: 4,
                                padding:      '2px 6px',
                                fontSize:     11,
                                cursor:       'pointer',
                                fontWeight:   600,
                              }}
                            >🗑️</button>
                          </div>
                        ) : (
                          task.assignee && (
                            <span style={{
                              fontSize:     10,
                              color:        '#6b7280',
                              background:   '#e5e7eb',
                              borderRadius: 4,
                              padding:      '1px 5px',
                              flexShrink:   0,
                            }}>
                              {task.assignee.name.slice(0, 2)}
                            </span>
                          )
                        )}
                      </div>

                      {/* 右欄：任務甘特條 */}
                      <div style={{ flex: 1, position: 'relative', height: '100%', ...weekendBg }}>

                        {/* 計劃條（主要甘特條） */}
                        {tBar && (
                          <div style={{
                            position:     'absolute',
                            left:         tBar.left,
                            width:        Math.max(dayW * 1.5, tBar.width),
                            top:          BAR_TOP,
                            height:       BAR_H,
                            borderRadius: 4,
                            background:   tc,
                            opacity:      isDone ? 0.55 : 1,
                            zIndex:       3,
                            display:      'flex',
                            alignItems:   'center',
                            padding:      '0 7px',
                            overflow:     'hidden',
                          }}>
                            <span style={{
                              fontSize:   9,
                              color:      'white',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              overflow:   'hidden',
                              textOverflow: 'ellipsis',
                            }}>
                              {isDone ? '✓ ' : ''}{task.title}
                            </span>
                          </div>
                        )}

                        {/* 今日線 */}
                        {todayX >= 0 && (
                          <div style={{
                            position:   'absolute',
                            left:       todayX,
                            top:        0,
                            bottom:     0,
                            width:      2,
                            background: 'rgba(239,68,68,0.7)',
                            zIndex:     5,
                            pointerEvents: 'none',
                          }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* 底部留白 */}
          <div style={{ height: 48 }} />
        </div>
      </div>

      {/* ══ 圖例列（固定在底部） ═══════════════════════════ */}
      <div style={{
        padding:      '8px 20px',
        background:   'white',
        borderTop:    '1px solid #e5e7eb',
        display:      'flex',
        gap:          16,
        alignItems:   'center',
        flexShrink:   0,
        fontSize:     11,
        color:        '#6b7280',
        flexWrap:     'wrap',
      }}>
        <span style={{ fontWeight: 700, color: '#374151', marginRight: 4 }}>圖例：</span>

        {/* 任務狀態 */}
        {Object.entries(TASK_STATUS_COLOR).map(([s, c]) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 20, height: 10, borderRadius: 3, background: c }} />
            <span>{TASK_STATUS_LABEL[s]}</span>
          </div>
        ))}

        {/* 里程碑 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 12, height: 12, transform: 'rotate(45deg)', background: 'white', border: '2px solid #10b981', borderRadius: 2 }} />
          <span>里程碑（已達成）</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 12, height: 12, transform: 'rotate(45deg)', background: '#10b981', border: '2px solid #10b981', borderRadius: 2 }} />
          <span>里程碑（未達成）</span>
        </div>

        {/* 今日線 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 2, height: 14, background: '#ef4444' }} />
          <span>今日</span>
        </div>

        {/* 懸停提示 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#9ca3af' }}>
          <span>💡 滑鼠懸停列可編輯 / 刪除</span>
        </div>

        {/* 更新時間 */}
        <span style={{ marginLeft: 'auto', color: '#d1d5db', fontSize: 10 }}>
          更新：{data.generatedAt
            ? new Date(data.generatedAt).toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '—'}
        </span>
      </div>

      {/* ══ 模態框 ══════════════════════════════════════════ */}
      {editProject && (
        <EditProjectModal
          project={editProject}
          users={users}
          onClose={() => setEditProject(null)}
          onSaved={handleProjectSaved}
        />
      )}
      {deleteProject && (
        <DeleteProjectModal
          project={deleteProject}
          onClose={() => setDeleteProject(null)}
          onDeleted={handleProjectDeleted}
        />
      )}
      {editTask && (
        <EditTaskModal
          task={editTask.task}
          project={editTask.project}
          users={users}
          onClose={() => setEditTask(null)}
          onSaved={handleTaskSaved}
        />
      )}
      {deleteTask && (
        <DeleteTaskModal
          task={deleteTask.task}
          project={deleteTask.project}
          onClose={() => setDeleteTask(null)}
          onDeleted={handleTaskDeleted}
        />
      )}

      {/* ══ Toast 通知 ══════════════════════════════════════ */}
      {toast && (
        <div style={{
          position:     'fixed',
          bottom:       28,
          right:        28,
          background:   '#1e293b',
          color:        'white',
          borderRadius: 8,
          padding:      '10px 18px',
          fontSize:     13,
          fontWeight:   600,
          boxShadow:    '0 4px 20px rgba(0,0,0,0.25)',
          zIndex:       99999,
          animation:    'fadeIn 0.2s ease',
        }}>
          {toast}
        </div>
      )}
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
