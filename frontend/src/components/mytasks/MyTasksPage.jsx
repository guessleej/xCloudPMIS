/**
 * MyTasksPage — 我的任務（完整重新設計）
 * GET /api/tasks?companyId=N&assigneeId=N
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useResponsive';

// ── Design tokens ────────────────────────────────────────────
const BRAND = {
  crimson:      '#C70018',
  crimsonDeep:  '#6E0615',
  crimsonNight: '#161112',
  ink:          'var(--xc-text)',
  carbon:       'var(--xc-text-soft)',
  muted:        'var(--xc-text-muted)',
  paper:        'var(--xc-bg)',
  mist:         'var(--xc-border)',
  silver:       'var(--xc-border-strong)',
  surface:      'var(--xc-surface)',
  surfaceSoft:  'var(--xc-surface-soft)',
  white:        'var(--xc-surface-strong)',
  accentSurface:'color-mix(in srgb, #C70018  8%, var(--xc-surface))',
  accentBorder: 'color-mix(in srgb, #C70018 28%, var(--xc-border))',
  heroBg:       'linear-gradient(135deg, #161112 0%, #6E0615 44%, #C70018 100%)',
  success:      'var(--xc-success)',
  warning:      'var(--xc-warning)',
  danger:       'var(--xc-danger)',
  info:         'var(--xc-info)',
};

// ── Status / Priority ─────────────────────────────────────────
const STATUS_META = {
  todo:        { label: '待處理', color: '#6B7280', bg: 'color-mix(in srgb, #6B7280 12%, transparent)', icon: '○' },
  in_progress: { label: '進行中', color: '#3B82F6', bg: 'color-mix(in srgb, #3B82F6 12%, transparent)', icon: '◑' },
  review:      { label: '審核中', color: '#8B5CF6', bg: 'color-mix(in srgb, #8B5CF6 12%, transparent)', icon: '◎' },
  done:        { label: '已完成', color: '#10B981', bg: 'color-mix(in srgb, #10B981 12%, transparent)', icon: '●' },
  cancelled:   { label: '已取消', color: '#EF4444', bg: 'color-mix(in srgb, #EF4444 12%, transparent)', icon: '✕' },
};

const PRIORITY_META = {
  urgent: { label: '緊急', color: '#EF4444', dot: '#EF4444' },
  high:   { label: '高',   color: '#F97316', dot: '#F97316' },
  medium: { label: '中',   color: '#EAB308', dot: '#EAB308' },
  low:    { label: '低',   color: '#6B7280', dot: '#6B7280' },
};

// ── 健康度 ────────────────────────────────────────────────────
const HEALTH_META = {
  on_track:  { label: '進度正常', color: '#10B981', bg: 'color-mix(in srgb,#10B981 14%,transparent)', icon: '✓' },
  at_risk:   { label: '存在風險', color: '#F59E0B', bg: 'color-mix(in srgb,#F59E0B 14%,transparent)', icon: '⚠' },
  off_track: { label: '偏離進度', color: '#EF4444', bg: 'color-mix(in srgb,#EF4444 14%,transparent)', icon: '✕' },
};
function HealthBadge({ status, size = 'sm' }) {
  const m = HEALTH_META[status];
  if (!m) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: size === 'md' ? '4px 10px' : '2px 7px',
      borderRadius: 999, fontSize: size === 'md' ? 11 : 10,
      fontWeight: 700, color: m.color, background: m.bg,
      letterSpacing: '0.02em', flexShrink: 0,
    }}>
      {m.icon} {m.label}
    </span>
  );
}

// ── Date helpers ──────────────────────────────────────────────
function todayStart() {
  const d = new Date(); d.setHours(0,0,0,0); return d;
}
function isOverdue(ds) {
  if (!ds) return false;
  const d = new Date(ds); d.setHours(0,0,0,0);
  return d < todayStart();
}
function isToday(ds) {
  if (!ds) return false;
  const d = new Date(ds); d.setHours(0,0,0,0);
  return d.getTime() === todayStart().getTime();
}
function fmtDate(ds) {
  if (!ds) return '';
  if (isToday(ds)) return '今天';
  const d = new Date(ds);
  return `${d.getMonth()+1}/${d.getDate()}`;
}

// ── Group tasks by status ─────────────────────────────────────
const GROUP_ORDER = ['todo','in_progress','review','done'];
const GROUP_LABEL = { todo:'待處理', in_progress:'進行中', review:'審核中', done:'已完成' };

// ── TaskRow ───────────────────────────────────────────────────
function TaskRow({ task, isSelected, onClick, onToggleDone }) {
  const [hovered, setHovered] = useState(false);
  const sm = STATUS_META[task.status]   || STATUS_META.todo;
  const pm = PRIORITY_META[task.priority] || PRIORITY_META.medium;
  const overdue = isOverdue(task.dueDate) && task.status !== 'done';

  return (
    <div
      onClick={() => onClick(task)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px',
        background: isSelected ? BRAND.accentSurface : hovered ? BRAND.surfaceSoft : 'transparent',
        borderBottom: `1px solid ${BRAND.mist}`,
        cursor: 'pointer', transition: 'background .1s',
        borderLeft: isSelected ? `3px solid ${BRAND.crimson}` : '3px solid transparent',
      }}
    >
      {/* 狀態圓圈（可點擊快速切換完成/未完成）*/}
      <span
        title={task.status === 'done' ? '點擊標記為待處理' : '點擊標記為完成'}
        onClick={e => { e.stopPropagation(); onToggleDone(task); }}
        style={{
          fontSize: 16, color: sm.color, flexShrink: 0, width: 16, textAlign: 'center',
          cursor: 'pointer', transition: 'transform .1s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.3)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {sm.icon}
      </span>

      {/* 優先序點 */}
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: pm.dot, flexShrink: 0 }} />

      {/* 標題 */}
      <span style={{
        flex: 1, fontSize: 15, color: task.status === 'done' ? BRAND.muted : BRAND.ink,

        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {task.title}
      </span>

      {/* 專案標籤 */}
      {task.project?.name && (
        <span style={{
          fontSize: 12, padding: '2px 7px', borderRadius: 10,
          background: BRAND.surfaceSoft, color: BRAND.muted,
          border: `1px solid ${BRAND.mist}`, whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {task.project.name}
        </span>
      )}

      {/* 健康度 */}
      <HealthBadge status={task.healthStatus} />

      {/* 到期日 */}
      {task.dueDate && (
        <span style={{
          fontSize: 13, flexShrink: 0, fontWeight: overdue ? 700 : 400,
          color: overdue ? BRAND.danger : isToday(task.dueDate) ? BRAND.warning : BRAND.muted,
        }}>
          {fmtDate(task.dueDate)}
        </span>
      )}
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────
function DetailModal({ task, onClose, onUpdate, onDelete }) {
  if (!task) return null;
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDesc,  setEditDesc]  = useState(task.description || '');
  const pm      = PRIORITY_META[task.priority] || PRIORITY_META.medium;
  const overdue = isOverdue(task.dueDate) && task.status !== 'done';
  const isDone  = task.status === 'done';

  // 同步外部 task 變更
  useEffect(() => { setEditTitle(task.title); }, [task.title]);
  useEffect(() => { setEditDesc(task.description || ''); }, [task.description]);

  async function handleField(field, value) {
    if (saving) return;
    setSaving(true);
    await onUpdate(task.id, { [field]: value });
    setSaving(false);
  }

  async function handleDelete() {
    if (deleting || !window.confirm(`確定刪除任務「${task.title}」？此操作無法復原。`)) return;
    setDeleting(true);
    await onDelete(task.id);
    setDeleting(false);
  }

  function handleToggleDone() {
    handleField('status', isDone ? 'todo' : 'done');
  }

  const selectStyle = {
    padding: '6px 10px', borderRadius: 8, fontSize: 15, cursor: 'pointer',
    border: `1px solid ${BRAND.silver}`, background: BRAND.surfaceSoft,
    color: BRAND.carbon, width: '100%', outline: 'none',
  };
  const labelStyle = {
    fontSize: 13, color: BRAND.muted, marginBottom: 5, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', zIndex: 1000,
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '90%', maxWidth: 560,
        maxHeight: '85vh',
        background: BRAND.surface,
        borderRadius: 16,
        border: `1px solid ${BRAND.mist}`,
        boxShadow: '0 24px 64px rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 24px',
          borderBottom: `1px solid ${BRAND.mist}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* 標記完成按鈕 */}
            <button
              onClick={handleToggleDone}
              disabled={saving}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 8, fontSize: 14, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                border: `1px solid ${isDone ? BRAND.success : BRAND.silver}`,
                background: isDone
                  ? 'color-mix(in srgb, var(--xc-success) 12%, transparent)'
                  : BRAND.surfaceSoft,
                color: isDone ? BRAND.success : BRAND.carbon,
                transition: 'all .15s',
              }}
            >
              {isDone ? '✓ 已完成' : '⊙ 標記完成'}
            </button>
            {saving && <span style={{ fontSize: 13, color: BRAND.muted }}>儲存中…</span>}
          </div>
          <button
            onClick={onClose}
            style={{
              background: BRAND.surfaceSoft, border: `1px solid ${BRAND.mist}`,
              cursor: 'pointer', color: BRAND.muted, fontSize: 16,
              width: 28, height: 28, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* 可編輯標題 */}
          <input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onBlur={() => {
              const trimmed = editTitle.trim();
              if (trimmed && trimmed !== task.title) handleField('title', trimmed);
              else setEditTitle(task.title);
            }}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
            style={{
              width: '100%', fontSize: 20, fontWeight: 800, color: BRAND.ink,
              lineHeight: 1.4, margin: '0 0 20px', padding: '4px 0',
              border: 'none', borderBottom: '2px solid transparent',
              background: 'transparent', outline: 'none',
              transition: 'border-color .15s',

            }}
            onFocus={e => { e.target.style.borderBottomColor = BRAND.crimson; }}
            onBlurCapture={e => { e.target.style.borderBottomColor = 'transparent'; }}
            disabled={saving}
            placeholder="輸入任務標題…"
          />

          {/* ── 可編輯欄位（雙欄佈局）── */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: 16 }}>
            {/* 截止日期 */}
            <div>
              <label style={labelStyle}>截止日期</label>
              <input
                type="date"
                defaultValue={task.dueDate || ''}
                onBlur={e => {
                  const val = e.target.value || null;
                  if (val !== (task.dueDate || null)) handleField('dueDate', val);
                }}
                style={{
                  ...selectStyle,
                  color: overdue ? BRAND.danger : BRAND.carbon,
                  fontWeight: overdue ? 700 : 400,
                }}
                disabled={saving}
              />
              {overdue && (
                <span style={{ fontSize: 12, color: BRAND.danger, marginTop: 3, display: 'block' }}>⚠ 已逾期</span>
              )}
            </div>

            {/* 優先序 */}
            <div>
              <label style={labelStyle}>優先度</label>
              <select
                value={task.priority || 'medium'}
                onChange={e => handleField('priority', e.target.value)}
                style={{ ...selectStyle, color: pm.dot, fontWeight: 600 }}
                disabled={saving}
              >
                {Object.entries(PRIORITY_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}優先</option>
                ))}
              </select>
            </div>
          </div>

          {/* 唯讀資訊（雙欄）*/}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: 16 }}>
            {task.project?.name && (
              <div>
                <span style={labelStyle}>所屬專案</span>
                <span style={{ fontSize: 15, color: BRAND.carbon }}>{task.project.name}</span>
              </div>
            )}
            {task.assignee?.name && (
              <div>
                <span style={labelStyle}>負責人</span>
                <span style={{ fontSize: 15, color: BRAND.carbon }}>{task.assignee.name}</span>
              </div>
            )}
            <div>
              <span style={labelStyle}>健康度</span>
              <HealthBadge status={task.healthStatus} size="md" />
            </div>
          </div>

          {/* 分隔線 */}
          <div style={{ borderTop: `1px solid ${BRAND.mist}`, margin: '4px 0 16px' }} />

          {/* 可編輯說明 */}
          <div>
            <label style={labelStyle}>說明</label>
            <textarea
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              onBlur={() => {
                if (editDesc !== (task.description || '')) handleField('description', editDesc);
              }}
              placeholder="輸入任務說明…"
              rows={4}
              style={{
                width: '100%', fontSize: 15, color: BRAND.carbon, lineHeight: 1.7,
                padding: '8px 10px', borderRadius: 8, resize: 'vertical',
                border: `1px solid ${BRAND.silver}`, background: BRAND.surfaceSoft,
                outline: 'none', fontFamily: 'inherit',
                transition: 'border-color .15s',
              }}
              onFocus={e => { e.target.style.borderColor = BRAND.crimson; }}
              onBlurCapture={e => { e.target.style.borderColor = BRAND.silver; }}
              disabled={saving}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: `1px solid ${BRAND.mist}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 14, cursor: deleting ? 'not-allowed' : 'pointer',
              border: `1px solid ${BRAND.danger}`, background: 'transparent',
              color: BRAND.danger, opacity: deleting ? 0.5 : 1, fontWeight: 600,
            }}
          >
            {deleting ? '刪除中…' : '🗑 刪除任務'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '7px 20px', borderRadius: 8, fontSize: 14, cursor: 'pointer',
              border: `1px solid ${BRAND.mist}`, background: BRAND.surfaceSoft,
              color: BRAND.carbon, fontWeight: 600,
            }}
          >
            關閉
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function MyTasksPage() {
  const isMobile = useIsMobile();
  const { user, authFetch } = useAuth();
  const [tasks,      setTasks]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);
  const [filterStatus, setFilterStatus] = useState('active'); // all | active | done
  const [filterPri,    setFilterPri]    = useState('all');
  const [search,       setSearch]       = useState('');
  const [groupBy,      setGroupBy]      = useState('status'); // status | project | priority
  const [sortBy,       setSortBy]       = useState('dueDate'); // dueDate | title | priority | project

  // ── Load ──
  const load = useCallback(async () => {
    if (!user?.companyId || !authFetch) return;
    setLoading(true);
    try {
      const res  = await authFetch(`/api/tasks?companyId=${user.companyId}&assigneeId=${user.id}`);
      const json = await res.json();
      const data = json.success ? json.data : (Array.isArray(json) ? json : []);
      setTasks(data);
    } catch (e) {
      console.error('[MyTasksPage load]', e);
    } finally {
      setLoading(false);
    }
  }, [user?.companyId, user?.id, authFetch]);

  useEffect(() => { load(); }, [load]);

  // ── 更新任務（PATCH /api/my-tasks/:id）──
  const updateTask = useCallback(async (id, fields) => {
    try {
      const res  = await authFetch(`/api/my-tasks/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(fields),
      });
      const json = await res.json();
      if (json.success) {
        // 樂觀更新：合併到 tasks 列表
        setTasks(prev => prev.map(t => t.id === id ? { ...t, ...json.data } : t));
        // 若是當前選取的任務，同步更新 selected
        setSelected(prev => prev?.id === id ? { ...prev, ...json.data } : prev);
      } else {
        console.error('[MyTasksPage updateTask]', json.error);
      }
    } catch (e) {
      console.error('[MyTasksPage updateTask]', e);
    }
  }, [authFetch]);

  // ── 刪除任務（DELETE /api/my-tasks/:id）──
  const deleteTask = useCallback(async (id) => {
    // 樂觀移除
    setTasks(prev => prev.filter(t => t.id !== id));
    setSelected(prev => prev?.id === id ? null : prev);
    try {
      const res  = await authFetch(`/api/my-tasks/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) {
        console.error('[MyTasksPage deleteTask] 失敗，重新載入資料');
        await load();
      }
    } catch (e) {
      console.error('[MyTasksPage deleteTask]', e);
      await load();
    }
  }, [authFetch, load]);

  // ── 快速切換完成/待處理 ──
  const toggleDone = useCallback((task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    updateTask(task.id, { status: newStatus });
  }, [updateTask]);

  // ── Derived stats ──
  const stats = useMemo(() => ({
    total:      tasks.length,
    active:     tasks.filter(t => !['done','cancelled'].includes(t.status)).length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    overdue:    tasks.filter(t => isOverdue(t.dueDate) && t.status !== 'done').length,
    done:       tasks.filter(t => t.status === 'done').length,
    today:      tasks.filter(t => isToday(t.dueDate) && t.status !== 'done').length,
  }), [tasks]);

  // ── Filter + Sort pipeline ──
  const isSearching = search.trim().length > 0;
  const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
  const filtered = useMemo(() => {
    let list = tasks;
    // 搜尋時跨所有狀態查找，否則依狀態篩選
    if (!isSearching) {
      if (filterStatus === 'active') list = list.filter(t => !['done','cancelled'].includes(t.status));
      if (filterStatus === 'done')   list = list.filter(t => t.status === 'done');
    }
    if (filterPri !== 'all')       list = list.filter(t => t.priority === filterPri);
    if (isSearching) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.project?.name?.toLowerCase().includes(q) ||
        t.assignee?.name?.toLowerCase().includes(q)
      );
    }
    // 排序
    list = [...list].sort((a, b) => {
      if (sortBy === 'dueDate') {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }
      if (sortBy === 'title')    return (a.title || '').localeCompare(b.title || '', 'zh-Hant');
      if (sortBy === 'priority') return (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
      if (sortBy === 'project')  return (a.project?.name || '').localeCompare(b.project?.name || '', 'zh-Hant');
      return 0;
    });
    return list;
  }, [tasks, filterStatus, filterPri, search, isSearching, sortBy]);

  // ── Group ──
  const groups = useMemo(() => {
    if (groupBy === 'status') {
      const map = {};
      GROUP_ORDER.forEach(s => { map[s] = []; });
      filtered.forEach(t => { (map[t.status] || (map['todo'] = map['todo'] || []) ) && (map[t.status] ? map[t.status].push(t) : map.todo.push(t)); });
      return GROUP_ORDER
        .filter(s => map[s]?.length > 0)
        .map(s => ({ key: s, label: GROUP_LABEL[s], color: STATUS_META[s].color, tasks: map[s] }));
    }
    if (groupBy === 'project') {
      const map = {};
      filtered.forEach(t => {
        const k = t.project?.name || '無專案';
        if (!map[k]) map[k] = [];
        map[k].push(t);
      });
      return Object.entries(map).sort((a,b) => a[0].localeCompare(b[0])).map(([k,v]) => ({ key: k, label: k, color: BRAND.info, tasks: v }));
    }
    if (groupBy === 'priority') {
      const order = ['urgent','high','medium','low'];
      const map = {};
      filtered.forEach(t => {
        const k = t.priority || 'medium';
        if (!map[k]) map[k] = [];
        map[k].push(t);
      });
      return order.filter(k => map[k]?.length).map(k => ({ key: k, label: `${PRIORITY_META[k].label}優先`, color: PRIORITY_META[k].dot, tasks: map[k] }));
    }
    return [{ key: 'all', label: '全部', color: BRAND.carbon, tasks: filtered }];
  }, [filtered, groupBy]);

  const kpis = [
    { label: '總任務', value: stats.total },
    { label: '進行中', value: stats.inProgress },
    { label: '今日到期', value: stats.today },
    { label: '已逾期', value: stats.overdue },
  ];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: BRAND.paper, fontFamily: 'inherit', overflow: 'hidden' }}>

      {/* ── Hero ── */}
      <div style={{ background: BRAND.heroBg, padding: isMobile ? '14px 16px 12px' : '24px 32px 20px', color: '#fff', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', opacity: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>
          my tasks
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 3px', letterSpacing: '-0.02em' }}>我的任務</h1>
        <p style={{ fontSize: 14, opacity: 0.7, margin: 0 }}>跨專案個人任務總覽，掌握進度一目瞭然</p>
        <div style={{ display: 'flex', gap: isMobile ? 14 : 28, marginTop: 16 }}>
          {kpis.map(k => (
            <div key={k.label}>
              <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{loading ? '—' : k.value}</div>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{
        padding: '10px 24px', borderBottom: `1px solid ${BRAND.mist}`,
        background: BRAND.surface, display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap',
      }}>
        {/* 搜尋 */}
        <div style={{ position: 'relative', flexShrink: 0, width: 220 }}>
          <span style={{
            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
            fontSize: 14, color: BRAND.muted, pointerEvents: 'none',
          }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜尋任務、專案、負責人…"
            style={{
              padding: '6px 12px 6px 28px', borderRadius: 6,
              border: `1px solid ${isSearching ? BRAND.crimson : BRAND.silver}`,
              background: BRAND.surfaceSoft, color: BRAND.ink, fontSize: 14,
              outline: 'none', width: '100%',
              transition: 'border-color .15s',
            }}
          />
          {isSearching && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: BRAND.muted, fontSize: 15, padding: '0 2px', lineHeight: 1,
              }}
              title="清除搜尋"
            >✕</button>
          )}
        </div>
        {/* 狀態篩選 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { k: 'active', label: '進行中' },
            { k: 'all',    label: '全部' },
            { k: 'done',   label: '已完成' },
          ].map(({ k, label }) => (
            <button key={k} onClick={() => setFilterStatus(k)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              border: `1px solid ${filterStatus === k ? BRAND.crimson : BRAND.silver}`,
              background: filterStatus === k ? BRAND.accentSurface : 'transparent',
              color: filterStatus === k ? BRAND.crimson : BRAND.carbon,
              fontWeight: filterStatus === k ? 700 : 400, transition: 'all .1s',
            }}>{label}</button>
          ))}
        </div>

        {/* 優先序篩選 */}
        <select
          value={filterPri}
          onChange={e => setFilterPri(e.target.value)}
          style={{
            padding: '5px 10px', borderRadius: 6, border: `1px solid ${BRAND.silver}`,
            background: BRAND.surfaceSoft, color: BRAND.carbon, fontSize: 13, cursor: 'pointer',
          }}
        >
          <option value="all">所有優先序</option>
          {Object.entries(PRIORITY_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}優先</option>
          ))}
        </select>

        {/* 排序 */}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            padding: '5px 10px', borderRadius: 6, border: `1px solid ${BRAND.silver}`,
            background: BRAND.surfaceSoft, color: BRAND.carbon, fontSize: 13, cursor: 'pointer',
          }}
        >
          <option value="dueDate">依截止日期排序</option>
          <option value="title">依標題排序</option>
          <option value="priority">依優先度排序</option>
          <option value="project">依專案排序</option>
        </select>

        {/* 分組 */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <span style={{ fontSize: 13, color: BRAND.muted, alignSelf: 'center' }}>分組：</span>
          {[
            { k: 'status',   label: '狀態' },
            { k: 'project',  label: '專案' },
            { k: 'priority', label: '優先序' },
          ].map(({ k, label }) => (
            <button key={k} onClick={() => setGroupBy(k)} style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              border: `1px solid ${groupBy === k ? BRAND.crimson : BRAND.silver}`,
              background: groupBy === k ? BRAND.accentSurface : 'transparent',
              color: groupBy === k ? BRAND.crimson : BRAND.carbon,
              fontWeight: groupBy === k ? 700 : 400, transition: 'all .1s',
            }}>{label}</button>
          ))}
        </div>

        <div style={{ fontSize: 13, color: isSearching ? BRAND.crimson : BRAND.muted, flexShrink: 0, fontWeight: isSearching ? 600 : 400 }}>
          {isSearching ? `搜尋到 ${filtered.length} 筆` : `${filtered.length} 筆`}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* 任務列表 */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: BRAND.muted, fontSize: 15 }}>載入中…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ fontSize: 34, marginBottom: 12 }}>{isSearching ? '🔍' : '✓'}</div>
              <div style={{ fontSize: 16, color: BRAND.muted }}>
                {isSearching
                  ? `找不到「${search.trim()}」的相關任務`
                  : filterStatus === 'active' ? '沒有進行中的任務' : '找不到符合的任務'
                }
              </div>
              {isSearching && (
                <button
                  onClick={() => setSearch('')}
                  style={{
                    marginTop: 12, padding: '6px 16px', borderRadius: 6,
                    border: `1px solid ${BRAND.silver}`, background: BRAND.surfaceSoft,
                    color: BRAND.carbon, fontSize: 14, cursor: 'pointer',
                  }}
                >清除搜尋</button>
              )}
            </div>
          ) : (
            groups.map(group => (
              <div key={group.key}>
                {/* 分組標題 */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 16px 6px',
                  borderBottom: `2px solid ${group.color}`,
                  background: BRAND.surfaceSoft,
                  position: 'sticky', top: 0, zIndex: 2,
                }}>
                  <span style={{
                    width: 9, height: 9, borderRadius: '50%',
                    background: group.color, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: BRAND.carbon }}>
                    {group.label}
                  </span>
                  <span style={{
                    fontSize: 12, padding: '1px 7px', borderRadius: 10,
                    background: `color-mix(in srgb, ${group.color} 14%, transparent)`,
                    color: group.color, fontWeight: 700,
                  }}>
                    {group.tasks.length}
                  </span>
                </div>

                {/* 任務列 */}
                {group.tasks.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    isSelected={selected?.id === task.id}
                    onClick={t => setSelected(prev => prev?.id === t.id ? null : t)}
                    onToggleDone={toggleDone}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {/* 右側詳情彈窗 */}
        {selected && (
          <DetailModal
            task={tasks.find(t => t.id === selected.id) || selected}
            onClose={() => setSelected(null)}
            onUpdate={updateTask}
            onDelete={deleteTask}
          />
        )}
      </div>
    </div>
  );
}
