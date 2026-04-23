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
import { useIsMobile } from '../../hooks/useResponsive';

const T = {
  pageBg: 'var(--xc-bg)',
  surface: 'var(--xc-surface)',
  surfaceSoft: 'var(--xc-surface-soft)',
  surfaceMuted: 'var(--xc-surface-muted)',
  surfaceStrong: 'var(--xc-surface-strong)',
  border: 'var(--xc-border)',
  borderStrong: 'var(--xc-border-strong)',
  text: 'var(--xc-text)',
  textSoft: 'var(--xc-text-soft)',
  textMuted: 'var(--xc-text-muted)',
  shadow: 'var(--xc-shadow)',
  shadowStrong: 'var(--xc-shadow-strong)',
};

// ── 常數設定 ────────────────────────────────────────────────
const API_BASE   = '/api';
const LEFT_COL   = 240;  // 左側凍結欄寬度（px）
const ROW_H      = 44;   // 每列高度（px）
const HEADER_H   = 48;   // 月份標頭高度（保留供舊程式碼相容，實際由 headerH 動態決定）
const BAR_H      = 22;   // 甘特條高度（px）
const BAR_TOP    = (ROW_H - BAR_H) / 2;  // 甘特條垂直置中偏移

// ── 縮放選項（每日寬度 px） ─────────────────────────────────
const ZOOM_OPTS = [
  { id: '1m',  label: '1 個月', dayW: 36   },
  { id: '3m',  label: '3 個月', dayW: 24   },
  { id: '6m',  label: '6 個月', dayW: 14   },
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
      months.push({ label, startIdx: i, count: 1, date: days[i] });
    } else {
      months[months.length - 1].count++;
    }
  }
  return months;
}

/**
 * 依日期陣列產生週次分組（以週一為週首），每組記錄：
 *   startIdx — 在 days 陣列中的起始索引
 *   count    — 該週橫跨的天數（第一週可能 < 7 天）
 *   weekNum  — 連續週次編號（1-based）
 *   date     — 該週第一天的 Date 物件
 */
function buildWeeks(days) {
  const weeks = [];
  for (let i = 0; i < days.length; i++) {
    const d   = days[i];
    const dow = d.getDay(); // 0=日, 1=一 ... 6=六
    // 週一（dow===1）或陣列第一天 → 新的一週
    if (weeks.length === 0 || dow === 1) {
      weeks.push({ startIdx: i, count: 1, weekNum: weeks.length + 1, date: d });
    } else {
      weeks[weeks.length - 1].count++;
    }
  }
  return weeks;
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
  padding: '5px 12px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
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
  background:  T.surface,
  borderRadius: 12,
  padding:      28,
  width:        480,
  maxWidth:     '92vw',
  maxHeight:    '85vh',
  overflowY:    'auto',
  boxShadow:    T.shadowStrong,
  border:       `1px solid ${T.border}`,
};

// ── 共用表單 Input 樣式 ─────────────────────────────────────
const inputSt = {
  width:        '100%',
  padding:      '8px 10px',
  border:       `1px solid ${T.borderStrong}`,
  borderRadius: 6,
  fontSize: 15,
  outline:      'none',
  boxSizing:    'border-box',
  fontFamily:   'inherit',
  background:   T.surfaceStrong,
  color:        T.text,
};

// ── 共用欄位標籤樣式 ────────────────────────────────────────
const LabelRow = ({ label, required, children }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 14, fontWeight: 600, color: T.textSoft, marginBottom: 5 }}>
      {label}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
    </div>
    {children}
  </div>
);

// ════════════════════════════════════════════════════════════
// 子元件：EditProjectModal — 編輯專案
// ════════════════════════════════════════════════════════════
function EditProjectModal({ project, users, onClose, onSaved, authFetch }) {
  const [form, setForm]       = useState({
    name: '', description: '', status: 'active',
    budget: '', startDate: '', endDate: '', ownerId: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  // 取得完整專案資料（含 description / budget）
  useEffect(() => {
    const fetcher = authFetch || fetch;
    fetcher(`${API_BASE}/projects/${project.id}`)
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
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { setError('專案名稱不能為空'); return; }
    setSaving(true);
    setError('');
    try {
      const fetcher = authFetch || fetch;
      const res = await fetcher(`${API_BASE}/projects/${project.id}`, {
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
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.text }}>✏️ 編輯專案</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: T.textMuted }}>×</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: T.textMuted }}>載入中...</div>
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
              <div style={{ background: 'var(--xc-danger-soft)', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 15, marginBottom: 14 }}>
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={btnSt('#f3f4f6', '#374151', { padding: '8px 18px' })}>取消</button>
              <button onClick={save} disabled={saving} style={btnSt('#2563eb', 'white', { padding: '8px 18px', opacity: saving ? 0.7 : 1 })}>
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
function DeleteProjectModal({ project, onClose, onDeleted, authFetch }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const confirm = async () => {
    setLoading(true);
    setError('');
    try {
      const fetcher = authFetch || fetch;
      const res = await fetcher(`${API_BASE}/projects/${project.id}`, { method: 'DELETE' });
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
          <div style={{ fontSize: 46, marginBottom: 8 }}>🗑️</div>
          <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: T.text }}>刪除專案</h3>
          <p style={{ margin: 0, fontSize: 15, color: T.textSoft }}>確定要刪除以下專案嗎？</p>
        </div>

        {/* 專案資訊卡 */}
        <div style={{ background: T.surfaceSoft, border: `1px solid ${T.border}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: T.text, fontSize: 16, marginBottom: 4 }}>{project.name}</div>
          <div style={{ fontSize: 14, color: T.textSoft }}>
            狀態：{PROJECT_STATUS_LABEL[project.status] || project.status}
            {taskCount > 0 && <span style={{ marginLeft: 12 }}>任務：{taskCount} 個</span>}
          </div>
        </div>

        {taskCount > 0 && (
          <div style={{ background: 'var(--xc-warning-soft)', border: '1px solid #fed7aa', borderRadius: 6, padding: '8px 12px', color: '#c2410c', fontSize: 14, marginBottom: 14 }}>
            ⚠️ 此專案包含 {taskCount} 個任務，刪除後將一併隱藏。
          </div>
        )}

        <div style={{ background: 'var(--xc-success-soft)', border: '1px solid #bbf7d0', borderRadius: 6, padding: '7px 12px', color: '#166534', fontSize: 13, marginBottom: 16 }}>
          ✅ 資料採軟刪除，不會永久移除，如有需要可由系統管理員復原。
        </div>

        {error && (
          <div style={{ background: 'var(--xc-danger-soft)', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 15, marginBottom: 14 }}>
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
function EditTaskModal({ task, project, users, onClose, onSaved, authFetch }) {
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
      const fetcher = authFetch || fetch;
      const res = await fetcher(`${API_BASE}/projects/tasks/${task.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:      form.title.trim(),
          status:     form.status,
          priority:   form.priority,
          assigneeId: form.assigneeId ? parseInt(form.assigneeId) : null,
          planStart:  form.planStart || null,
          planEnd:    form.planEnd   || null,
          // 同步 dueDate，讓健康度計算與看板保持一致
          dueDate:    form.planEnd   || null,
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
            <h3 style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 700, color: T.text }}>✏️ 編輯任務</h3>
            <div style={{ fontSize: 13, color: T.textMuted }}>專案：{project.name}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: T.textMuted }}>×</button>
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
          <div style={{ background: 'var(--xc-danger-soft)', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 15, marginBottom: 14 }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSt('#f3f4f6', '#374151', { padding: '8px 18px' })}>取消</button>
          <button onClick={save} disabled={saving} style={btnSt('#2563eb', 'white', { padding: '8px 18px', opacity: saving ? 0.7 : 1 })}>
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
function DeleteTaskModal({ task, project, onClose, onDeleted, authFetch }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const confirm = async () => {
    setLoading(true);
    setError('');
    try {
      const fetcher = authFetch || fetch;
      const res = await fetcher(`${API_BASE}/projects/tasks/${task.id}`, { method: 'DELETE' });
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
          <div style={{ fontSize: 42, marginBottom: 8 }}>🗑️</div>
          <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: T.text }}>刪除任務</h3>
          <p style={{ margin: 0, fontSize: 15, color: T.textSoft }}>確定要刪除以下任務嗎？</p>
        </div>

        {/* 任務資訊卡 */}
        <div style={{ background: T.surfaceSoft, border: `1px solid ${T.border}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 4 }}>專案：{project.name}</div>
          <div style={{ fontWeight: 700, color: T.text, fontSize: 16, marginBottom: 6 }}>{task.title}</div>
          <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
            <span style={{ background: `${pc}20`, color: pc, borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>
              {PRIORITY_LABEL[task.priority] || task.priority}
            </span>
            {task.assignee && (
              <span style={{ background: T.surfaceMuted, color: T.textSoft, borderRadius: 4, padding: '2px 7px' }}>
                👤 {task.assignee.name}
              </span>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--xc-success-soft)', border: '1px solid #bbf7d0', borderRadius: 6, padding: '7px 12px', color: '#166534', fontSize: 13, marginBottom: 16 }}>
          ✅ 資料採軟刪除，不會永久移除，如有需要可由系統管理員復原。
        </div>

        {error && (
          <div style={{ background: 'var(--xc-danger-soft)', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 15, marginBottom: 14 }}>
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
  const isMobile = useIsMobile();
  const LEFT_W = isMobile ? 140 : LEFT_COL;
  const { user, authFetch } = useAuth();
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
  const [barTooltip,    setBarTooltip]    = useState(null);       // {task, project, x, y}
  const [crosshair,     setCrosshair]     = useState(null);       // {x, label} 垂直輔助線
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
      const res = await authFetch(`${API_BASE}/gantt?companyId=${companyId}`);
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
      const res = await authFetch(`${API_BASE}/projects/users?companyId=${companyId}`);
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
    const avail = (containerRef.current?.clientWidth || 1000) - LEFT_W - 4;
    return Math.max(2, avail / data.range.totalDays);
  }, [data, zoom]);

  // ── 產生日期陣列與月份 / 週次分組 ─────────────────────────
  const days   = useMemo(() => data ? buildDays(data.range.start, data.range.end) : [], [data]);
  const months = useMemo(() => buildMonths(days), [days]);
  const weeks  = useMemo(() => buildWeeks(days),  [days]);

  // ── 動態標頭高度（依縮放層級決定顯示列數） ──────────────
  //  dayW >= 20 → 4 行（周次 + 周起始日 + 日期數 + 星期名）→ 84px  ← 1個月(36) / 3個月(24)
  //  dayW >= 12 → 3 行（周次+日期 / 日數 / 星期）             → 60px  ← 6個月(14)
  //  dayW <  12 → 1 行（月份）                                → 40px  ← 全部(auto)
  const headerH = useMemo(() => {
    if (dayW >= 20) return 84;
    if (dayW >= 12) return 60;
    return 40;
  }, [dayW]);

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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 16, color: T.textMuted }}>
      <div style={{ fontSize: 42 }}>⏳</div>
      <div style={{ fontSize: 16 }}>甘特圖資料載入中...</div>
    </div>
  );

  // ── 錯誤畫面 ────────────────────────────────────────────
  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 42 }}>😢</div>
      <div style={{ fontWeight: 600, color: T.text }}>載入失敗：{error}</div>
      <button onClick={load} style={{ ...btnSt('#2563eb', 'white'), padding: '8px 20px', fontSize: 16 }}>重試</button>
    </div>
  );

  if (!data) return null;

  return (
    <div style={{
      height:        '100vh',
      display:       'flex',
      flexDirection: 'column',
      background:    T.pageBg,
      overflow:      'hidden',
    }}>

      {/* ══ 控制列 ══════════════════════════════════════════ */}
      <div style={{
        padding:       '12px 20px',
        background:    T.surfaceStrong,
        borderBottom:  `1px solid ${T.border}`,
        display:       'flex',
        alignItems:    'center',
        gap:           10,
        flexShrink:    0,
        flexWrap:      'wrap',
      }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.text }}>
          📅 甘特圖
        </h2>
        <span style={{ color: T.textMuted, fontSize: 15 }}>
          {data.projects.length} 個專案
        </span>

        <div style={{ flex: 1 }} />

        {/* 展開 / 收合全部 */}
        <button onClick={expandAll}   style={btnSt('#f3f4f6', '#374151')}>全部展開</button>
        <button onClick={collapseAll} style={btnSt('#f3f4f6', '#374151')}>全部收合</button>

        {/* 縮放選擇 */}
        <div style={{ display: 'flex', gap: 2, background: T.surfaceMuted, borderRadius: 8, padding: 3 }}>
          {ZOOM_OPTS.map(o => (
            <button
              key={o.id}
              onClick={() => setZoom(o.id)}
              style={{
                padding:    '4px 10px',
                borderRadius: 5,
                border:     'none',
                cursor:     'pointer',
                fontSize: 13,
                fontWeight: 600,
                background: zoom === o.id ? T.surfaceStrong : 'transparent',
                color:      zoom === o.id ? T.text : T.textMuted,
                boxShadow:  zoom === o.id ? T.shadow : 'none',
                transition: 'all 0.15s',
              }}
            >{o.label}</button>
          ))}
        </div>

        {/* 重新整理 */}
        <button onClick={load} style={btnSt('#2563eb', 'white')}>🔄 重新整理</button>
      </div>

      {/* ══ 甘特圖本體（可橫向 + 縱向捲動） ════════════════ */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflow: 'auto', minHeight: 0, position: 'relative' }}
        onMouseMove={e => {
          if (!containerRef.current || days.length === 0) return;
          const rect      = containerRef.current.getBoundingClientRect();
          const scrollLeft = containerRef.current.scrollLeft;
          const mouseX    = e.clientX - rect.left + scrollLeft;
          const gridX     = mouseX - LEFT_W;
          if (gridX < 0 || gridX > days.length * dayW) { setCrosshair(null); return; }
          const dayIdx    = Math.max(0, Math.min(days.length - 1, Math.floor(gridX / dayW)));
          const d         = days[dayIdx];
          const label     = d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' });
          const lineX     = LEFT_W + dayIdx * dayW + Math.floor(dayW / 2);
          setCrosshair({ x: lineX, label });
        }}
        onMouseLeave={() => setCrosshair(null)}
      >
        {/* 最小寬度 = 左欄 + 時間軸總寬 */}
        <div style={{ minWidth: LEFT_W + totalW }}>

          {/* ── 時間軸標頭（sticky top，多行詳細格式） ──── */}
          <div style={{
            display:      'flex',
            position:     'sticky',
            top:          0,
            zIndex:       20,
            height:       headerH,
            background:   T.surfaceStrong,
            borderBottom: `2px solid ${T.borderStrong}`,
          }}>
            {/* 左上角凍結格 */}
            <div style={{
              width:          LEFT_W,
              flexShrink:     0,
              position:       'sticky',
              left:           0,
              top:            0,
              zIndex:         30,
              background:     '#1e293b',
              display:        'flex',
              alignItems:     'center',
              padding:        '0 16px',
              borderRight:    '2px solid #334155',
              borderBottom:   '2px solid #334155',
              height:         headerH,
              boxSizing:      'border-box',
            }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                專案 / 任務
              </span>
            </div>

            {/* 時間軸標頭區 */}
            <div style={{ position: 'relative', flex: 1, ...weekendBg, overflow: 'hidden', height: headerH }}>

              {dayW >= 20 ? (
                /* ── 4 行詳細標頭（1個月縮放）────────────── */
                (() => {
                  const R1 = 22; // 周次
                  const R2 = 22; // 周起始日期
                  const R3 = 20; // 日期數字
                  const R4 = 20; // 星期名稱
                  const DOW_LABEL = ['日','一','二','三','四','五','六'];
                  return (
                    <>
                      {/* Row 1：周次 */}
                      {weeks.map((w, wi) => (
                        <div key={wi} style={{
                          position:   'absolute',
                          left:       w.startIdx * dayW,
                          width:      w.count * dayW,
                          top:        0,
                          height:     R1,
                          display:    'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize:   12,
                          fontWeight: 700,
                          color:      '#94a3b8',
                          borderRight: `1px solid ${T.borderStrong}`,
                          borderBottom: `1px solid ${T.border}`,
                          boxSizing:  'border-box',
                          overflow:   'hidden',
                          whiteSpace: 'nowrap',
                          background: wi % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                          letterSpacing: '0.05em',
                        }}>
                          第 {w.weekNum} 周
                        </div>
                      ))}

                      {/* Row 2：周起始日期 */}
                      {weeks.map((w, wi) => (
                        <div key={wi} style={{
                          position:   'absolute',
                          left:       w.startIdx * dayW,
                          width:      w.count * dayW,
                          top:        R1,
                          height:     R2,
                          display:    'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize:   11,
                          fontWeight: 500,
                          color:      T.textMuted,
                          borderRight: `1px solid ${T.borderStrong}`,
                          borderBottom: `1px solid ${T.border}`,
                          boxSizing:  'border-box',
                          overflow:   'hidden',
                          whiteSpace: 'nowrap',
                        }}>
                          {w.date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })}
                        </div>
                      ))}

                      {/* Row 3：日期數字 */}
                      {days.map((d, di) => {
                        const dow = d.getDay();
                        const isWeekend = dow === 0 || dow === 6;
                        return (
                          <div key={di} style={{
                            position:   'absolute',
                            left:       di * dayW,
                            width:      dayW,
                            top:        R1 + R2,
                            height:     R3,
                            display:    'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize:   11,
                            fontWeight: isWeekend ? 600 : 400,
                            color:      isWeekend ? '#f87171' : T.text,
                            borderRight: `1px solid ${T.border}`,
                            borderBottom: `1px solid ${T.border}`,
                            boxSizing:  'border-box',
                          }}>
                            {d.getDate()}
                          </div>
                        );
                      })}

                      {/* Row 4：星期名稱 */}
                      {days.map((d, di) => {
                        const dow = d.getDay();
                        const isWeekend = dow === 0 || dow === 6;
                        return (
                          <div key={di} style={{
                            position:   'absolute',
                            left:       di * dayW,
                            width:      dayW,
                            top:        R1 + R2 + R3,
                            height:     R4,
                            display:    'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize:   10,
                            fontWeight: isWeekend ? 700 : 400,
                            color:      isWeekend ? '#f87171' : T.textMuted,
                            borderRight: `1px solid ${T.border}`,
                            boxSizing:  'border-box',
                          }}>
                            {DOW_LABEL[dow]}
                          </div>
                        );
                      })}
                    </>
                  );
                })()
              ) : dayW >= 12 ? (
                /* ── 3 行標頭（3個月縮放）─────────────────── */
                (() => {
                  const R1 = 22; // 周次＋起始日
                  const R2 = 20; // 日期數字
                  const R3 = 18; // 星期名
                  const DOW_LABEL = ['日','一','二','三','四','五','六'];
                  return (
                    <>
                      {/* Row 1：周次（以週為單位） */}
                      {weeks.map((w, wi) => (
                        <div key={wi} style={{
                          position:   'absolute',
                          left:       w.startIdx * dayW,
                          width:      w.count * dayW,
                          top:        0,
                          height:     R1,
                          display:    'flex',
                          alignItems: 'center',
                          padding:    '0 4px',
                          fontSize:   11,
                          fontWeight: 600,
                          color:      T.textMuted,
                          borderRight: `1px solid ${T.borderStrong}`,
                          borderBottom: `1px solid ${T.border}`,
                          boxSizing:  'border-box',
                          overflow:   'hidden',
                          whiteSpace: 'nowrap',
                          gap:        4,
                        }}>
                          <span style={{ color: '#94a3b8', marginRight: 4 }}>W{w.weekNum}</span>
                          {w.date.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                        </div>
                      ))}
                      {/* Row 2：日期數字 */}
                      {days.map((d, di) => {
                        const dow = d.getDay();
                        const isWeekend = dow === 0 || dow === 6;
                        return (
                          <div key={di} style={{
                            position:   'absolute',
                            left:       di * dayW,
                            width:      dayW,
                            top:        R1,
                            height:     R2,
                            display:    'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize:   10,
                            fontWeight: isWeekend ? 700 : 400,
                            color:      isWeekend ? '#f87171' : T.text,
                            borderRight: `1px solid ${T.border}`,
                            borderBottom: `1px solid ${T.border}`,
                            boxSizing:  'border-box',
                          }}>
                            {d.getDate()}
                          </div>
                        );
                      })}
                      {/* Row 3：星期名稱 */}
                      {days.map((d, di) => {
                        const dow = d.getDay();
                        const isWeekend = dow === 0 || dow === 6;
                        return (
                          <div key={di} style={{
                            position:   'absolute',
                            left:       di * dayW,
                            width:      dayW,
                            top:        R1 + R2,
                            height:     R3,
                            display:    'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize:   9,
                            fontWeight: isWeekend ? 700 : 400,
                            color:      isWeekend ? '#f87171' : T.textMuted,
                            borderRight: `1px solid ${T.border}`,
                            boxSizing:  'border-box',
                          }}>
                            {DOW_LABEL[dow]}
                          </div>
                        );
                      })}
                    </>
                  );
                })()
              ) : (
                /* ── 1 行標頭（6個月 / 全部縮放）──────────── */
                months.map((m, mi) => {
                  const cellW = m.count * dayW;
                  return (
                    <div key={mi} style={{
                      position:   'absolute',
                      left:       m.startIdx * dayW,
                      width:      cellW,
                      height:     headerH,
                      display:    'flex',
                      alignItems: 'center',
                      padding:    '0 8px',
                      fontSize:   cellW < 80 ? 11 : 13,
                      fontWeight: 600,
                      color:      T.text,
                      borderRight: `1px solid ${T.borderStrong}`,
                      boxSizing:  'border-box',
                      overflow:   'hidden',
                      whiteSpace: 'nowrap',
                    }}>
                      {/* 寬度太窄時的简短標籤 */}
                      {cellW < 40 ? '' : cellW < 80
                        ? `${m.date.getMonth() + 1}月`
                        : m.label}
                    </div>
                  );
                })
              )}

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
            const rowBg       = pi % 2 === 0 ? T.surfaceSoft : T.surfaceStrong;
            const isProjHover = hoveredRow?.type === 'project' && hoveredRow?.id === project.id;

            return (
              <div key={project.id}>

                {/* ── 專案列 ─────────────────────────────── */}
                <div
                  style={{
                    display:      'flex',
                    height:       ROW_H,
                    background:   isProjHover ? T.surfaceMuted : rowBg,
                    borderBottom: `1px solid ${T.border}`,
                    transition:   'background 0.1s',
                  }}
                  onMouseEnter={() => setHoveredRow({ type: 'project', id: project.id })}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  {/* 左欄：專案名稱（水平 sticky） */}
                  <div style={{
                    width:       LEFT_W,
                    flexShrink:  0,
                    position:    'sticky',
                    left:        0,
                    zIndex:      10,
                    background:  isProjHover ? T.surfaceMuted : rowBg,
                    height:      '100%',
                    display:     'flex',
                    alignItems:  'center',
                    padding:     '0 10px 0 8px',
                    gap:         6,
                    borderRight: `2px solid ${T.borderStrong}`,
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
                        color:       hasTasks ? T.textMuted : 'transparent',
                        flexShrink:  0,
                        fontSize: 11,
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
                      fontSize: 15,
                      fontWeight: 700,
                      color:      T.text,
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
                            background:   'color-mix(in srgb,#3B82F6 14%,var(--xc-surface))',
                            color:        '#3B82F6',
                            border:       'none',
                            borderRadius: 4,
                            padding:      '2px 6px',
                            fontSize: 13,
                            cursor:       'pointer',
                            fontWeight:   600,
                          }}
                        >✏️</button>
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteProject(project); }}
                          title="刪除專案"
                          style={{
                            background:   'color-mix(in srgb,#EF4444 14%,var(--xc-surface))',
                            color:        '#EF4444',
                            border:       'none',
                            borderRadius: 4,
                            padding:      '2px 6px',
                            fontSize: 13,
                            cursor:       'pointer',
                            fontWeight:   600,
                          }}
                        >🗑️</button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: T.textMuted, flexShrink: 0 }}>
                        {project.doneCount}/{project.taskCount}
                      </span>
                    )}
                  </div>

                  {/* 右欄：甘特條區 */}
                  <div style={{ flex: 1, position: 'relative', height: '100%', ...weekendBg }}>

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
                            background:   m.isAchieved ? mc : T.surfaceStrong,
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
                  const taskBg     = isTaskHover ? T.surfaceMuted : T.surfaceSoft;

                  return (
                    <div
                      key={task.id}
                      style={{
                        display:      'flex',
                        height:       ROW_H,
                        background:   taskBg,
                        borderBottom: `1px solid ${T.border}`,
                        transition:   'background 0.1s',
                      }}
                      onMouseEnter={() => setHoveredRow({ type: 'task', id: task.id })}
                      onMouseLeave={() => setHoveredRow(null)}
                    >
                      {/* 左欄：任務名稱（水平 sticky） */}
                      <div style={{
                        width:       LEFT_W,
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
                        borderRight: `2px solid ${T.borderStrong}`,
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
                          fontSize: 14,
                          color:           isDone ? T.textMuted : T.textSoft,
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
                                background:   'color-mix(in srgb,#3B82F6 14%,var(--xc-surface))',
                                color:        '#3B82F6',
                                border:       'none',
                                borderRadius: 4,
                                padding:      '2px 6px',
                                fontSize: 13,
                                cursor:       'pointer',
                                fontWeight:   600,
                              }}
                            >✏️</button>
                            <button
                              onClick={e => { e.stopPropagation(); setDeleteTask({ task, project }); }}
                              title="刪除任務"
                              style={{
                                background:   'color-mix(in srgb,#EF4444 14%,var(--xc-surface))',
                                color:        '#EF4444',
                                border:       'none',
                                borderRadius: 4,
                                padding:      '2px 6px',
                                fontSize: 13,
                                cursor:       'pointer',
                                fontWeight:   600,
                              }}
                            >🗑️</button>
                          </div>
                        ) : (
                          task.assignee && (
                            <span style={{
                              fontSize: 12,
                              color:        T.textMuted,
                              background:   T.surfaceMuted,
                              borderRadius: 4,
                              padding:      '1px 5px',
                              flexShrink:   0,
                            }}>
                              {task.assignee.name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'}
                            </span>
                          )
                        )}
                      </div>

                      {/* 右欄：任務甘特條 */}
                      <div style={{ flex: 1, position: 'relative', height: '100%', ...weekendBg }}>

                        {/* 計劃條（主要甘特條） */}
                        {tBar && (
                          <div
                            style={{
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
                              cursor:       'pointer',
                              transition:   'filter 0.15s, box-shadow 0.15s',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.filter = 'brightness(1.25)';
                              e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
                              setBarTooltip({ task, project, x: e.clientX, y: e.clientY });
                            }}
                            onMouseMove={e => {
                              setBarTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.filter = '';
                              e.currentTarget.style.boxShadow = '';
                              setBarTooltip(null);
                            }}
                            onClick={e => {
                              e.stopPropagation();
                              setBarTooltip(null);
                              setEditTask({ task, project });
                            }}
                          >
                            {/* 進度填充條 */}
                            {task.progress > 0 && (
                              <div style={{
                                position:   'absolute',
                                left:       0, top: 0, bottom: 0,
                                width:      `${Math.min(task.progress, 100)}%`,
                                background: 'rgba(255,255,255,0.25)',
                                borderRadius: 4,
                                pointerEvents: 'none',
                              }} />
                            )}
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

          {/* ── 垂直日期輔助線 ─────────────────────────── */}
          {crosshair && (
            <div style={{
              position:      'absolute',
              left:          crosshair.x,
              top:           0,
              bottom:        0,
              width:         1,
              background:    'rgba(99,102,241,0.55)',
              borderLeft:    '1px dashed rgba(99,102,241,0.8)',
              zIndex:        15,
              pointerEvents: 'none',
            }}>
              {/* 日期標籤 — 貼在標頭底部邊界 */}
              <div style={{
                position:    'absolute',
                top:         headerH + 4,
                left:        '50%',
                transform:   'translateX(-50%)',
                background:  '#6366f1',
                color:       '#fff',
                fontSize:    11,
                fontWeight:  700,
                padding:     '2px 7px',
                borderRadius: 99,
                whiteSpace:  'nowrap',
                boxShadow:   '0 2px 8px rgba(99,102,241,.4)',
                pointerEvents: 'none',
                lineHeight:  '16px',
              }}>
                {crosshair.label}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ 圖例列（固定在底部） ═══════════════════════════ */}
      <div style={{
        padding:      '8px 20px',
        background:   T.surfaceStrong,
        borderTop:    `1px solid ${T.border}`,
        display:      'flex',
        gap:          16,
        alignItems:   'center',
        flexShrink:   0,
        fontSize: 13,
        color:        T.textMuted,
        flexWrap:     'wrap',
      }}>
        <span style={{ fontWeight: 700, color: T.text, marginRight: 4 }}>圖例：</span>

        {/* 任務狀態 */}
        {Object.entries(TASK_STATUS_COLOR).map(([s, c]) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 20, height: 10, borderRadius: 3, background: c }} />
            <span>{TASK_STATUS_LABEL[s]}</span>
          </div>
        ))}

        {/* 里程碑 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 12, height: 12, transform: 'rotate(45deg)', background: '#10b981', border: '2px solid #10b981', borderRadius: 2 }} />
          <span>里程碑（已達成）</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 12, height: 12, transform: 'rotate(45deg)', background: T.surfaceStrong, border: '2px solid #10b981', borderRadius: 2 }} />
          <span>里程碑（未達成）</span>
        </div>

        {/* 今日線 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 2, height: 14, background: '#ef4444' }} />
          <span>今日</span>
        </div>

        {/* 懸停提示 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: T.textMuted }}>
          <span>💡 滑鼠懸停列可編輯 / 刪除</span>
        </div>

        {/* 更新時間 */}
        <span style={{ marginLeft: 'auto', color: T.textMuted, fontSize: 12 }}>
          更新：{data.generatedAt
            ? new Date(data.generatedAt).toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '—'}
        </span>
      </div>

      {/* ══ 任務條浮動詳情卡 ══════════════════════════════════ */}
      {barTooltip && (() => {
        const { task: t, project: p, x, y } = barTooltip;
        const tipW = 280;
        const tipH = 210;
        const vw   = window.innerWidth;
        const vh   = window.innerHeight;
        const left = x + 16 + tipW > vw ? x - tipW - 8 : x + 16;
        const top  = y + 20 + tipH > vh ? y - tipH - 8 : y + 20;
        const assigneeName  = t.assignee?.name || t.assigneeName || '未指派';
        const statusLabel   = TASK_STATUS_LABEL[t.status]  || t.status  || '-';
        const priorityLabel = PRIORITY_LABEL[t.priority]   || t.priority || '-';
        const tc2 = TASK_STATUS_COLOR[t.status] || '#9ca3af';
        const rows = [
          ['專案',   p.name],
          ['狀態',   statusLabel],
          ['優先級', priorityLabel],
          ['負責人', assigneeName],
          ['開始',   t.planStart  || t.actualStart || '-'],
          ['截止',   t.planEnd    || '-'],
          ['進度',   t.progress != null ? `${t.progress}%` : '-'],
        ];
        return (
          <div style={{
            position: 'fixed', left, top, zIndex: 99998,
            width: tipW,
            background: '#1e293b',
            color: '#f1f5f9',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
            padding: '14px 16px',
            pointerEvents: 'none',
            fontSize: 13,
            border: `1.5px solid ${tc2}`,
          }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.title}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
              {rows.map(([label, val], i) => (
                <tr key={i}>
                  <td style={{ color: '#94a3b8', paddingRight: 10, paddingBottom: 5, whiteSpace: 'nowrap', verticalAlign: 'top', fontSize: 12 }}>{label}</td>
                  <td style={{ color: '#e2e8f0', paddingBottom: 5 }}>{val}</td>
                </tr>
              ))}
            </tbody></table>
            <div style={{ marginTop: 8, fontSize: 11, color: '#64748b', borderTop: '1px solid #334155', paddingTop: 6 }}>點擊即可編輯</div>
          </div>
        );
      })()}

      {/* ══ 模態框 ══════════════════════════════════════════ */}
      {editProject && (
        <EditProjectModal
          project={editProject}
          users={users}
          onClose={() => setEditProject(null)}
          onSaved={handleProjectSaved}
          authFetch={authFetch}
        />
      )}
      {deleteProject && (
        <DeleteProjectModal
          project={deleteProject}
          onClose={() => setDeleteProject(null)}
          onDeleted={handleProjectDeleted}
          authFetch={authFetch}
        />
      )}
      {editTask && (
        <EditTaskModal
          task={editTask.task}
          project={editTask.project}
          users={users}
          onClose={() => setEditTask(null)}
          onSaved={handleTaskSaved}
          authFetch={authFetch}
        />
      )}
      {deleteTask && (
        <DeleteTaskModal
          task={deleteTask.task}
          project={deleteTask.project}
          onClose={() => setDeleteTask(null)}
          onDeleted={handleTaskDeleted}
          authFetch={authFetch}
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
          fontSize: 15,
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