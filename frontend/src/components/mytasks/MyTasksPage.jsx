/**
 * MyTasksPage — 我的任務（完整重新設計）
 * GET /api/tasks?companyId=N&assigneeId=N
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';

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
          fontSize: 14, color: sm.color, flexShrink: 0, width: 16, textAlign: 'center',
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
        flex: 1, fontSize: 13, color: task.status === 'done' ? BRAND.muted : BRAND.ink,
        textDecoration: task.status === 'done' ? 'line-through' : 'none',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {task.title}
      </span>

      {/* 專案標籤 */}
      {task.project?.name && (
        <span style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 10,
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
          fontSize: 11, flexShrink: 0, fontWeight: overdue ? 700 : 400,
          color: overdue ? BRAND.danger : isToday(task.dueDate) ? BRAND.warning : BRAND.muted,
        }}>
          {fmtDate(task.dueDate)}
        </span>
      )}
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────
function DetailPanel({ task, onClose, onUpdate, onDelete }) {
  if (!task) return null;
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const sm      = STATUS_META[task.status]    || STATUS_META.todo;
  const pm      = PRIORITY_META[task.priority] || PRIORITY_META.medium;
  const overdue = isOverdue(task.dueDate) && task.status !== 'done';

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

  const selectStyle = {
    padding: '5px 8px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
    border: `1px solid ${BRAND.silver}`, background: BRAND.surfaceSoft,
    color: BRAND.carbon, width: '100%', outline: 'none',
  };
  const labelStyle = {
    fontSize: 10, color: BRAND.muted, marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block',
  };

  return (
    <div style={{
      width: 340, flexShrink: 0,
      borderLeft: `1px solid ${BRAND.mist}`,
      background: BRAND.surface,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${BRAND.mist}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.carbon }}>任務詳情</span>
          {saving && <span style={{ fontSize: 10, color: BRAND.muted }}>儲存中…</span>}
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: BRAND.muted, fontSize: 16, padding: '0 4px' }}
        >✕</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {/* 標題 */}
        <h2 style={{ fontSize: 15, fontWeight: 700, color: BRAND.ink, margin: '0 0 20px', lineHeight: 1.4 }}>
          {task.title}
        </h2>

        {/* ── 可編輯欄位 ── */}

        {/* 狀態 */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>狀態</label>
          <select
            value={task.status}
            onChange={e => handleField('status', e.target.value)}
            style={{ ...selectStyle, color: sm.color, fontWeight: 600 }}
            disabled={saving}
          >
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>{v.icon} {v.label}</option>
            ))}
          </select>
        </div>

        {/* 優先序 */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>優先序</label>
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

        {/* 截止日期 */}
        <div style={{ marginBottom: 14 }}>
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
            <span style={{ fontSize: 10, color: BRAND.danger, marginTop: 3, display: 'block' }}>⚠ 已逾期</span>
          )}
        </div>

        {/* 分隔線 */}
        <div style={{ borderTop: `1px solid ${BRAND.mist}`, margin: '18px 0' }} />

        {/* 唯讀資訊 */}
        {task.project?.name && (
          <div style={{ marginBottom: 12 }}>
            <span style={labelStyle}>所屬專案</span>
            <span style={{ fontSize: 13, color: BRAND.carbon }}>{task.project.name}</span>
          </div>
        )}
        {task.assignee?.name && (
          <div style={{ marginBottom: 12 }}>
            <span style={labelStyle}>負責人</span>
            <span style={{ fontSize: 13, color: BRAND.carbon }}>{task.assignee.name}</span>
          </div>
        )}

        {/* 健康度 */}
        <div style={{ marginBottom: 12 }}>
          <span style={labelStyle}>健康度</span>
          <HealthBadge status={task.healthStatus} size="md" />
        </div>

        {/* 說明 */}
        {task.description && (
          <div style={{ marginTop: 6 }}>
            <span style={labelStyle}>說明</span>
            <p style={{ fontSize: 13, color: BRAND.carbon, lineHeight: 1.6, margin: 0 }}>{task.description}</p>
          </div>
        )}
      </div>

      {/* Footer：刪除 */}
      <div style={{
        padding: '12px 20px',
        borderTop: `1px solid ${BRAND.mist}`,
        display: 'flex', justifyContent: 'flex-end',
      }}>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: deleting ? 'not-allowed' : 'pointer',
            border: `1px solid ${BRAND.danger}`, background: 'transparent',
            color: BRAND.danger, opacity: deleting ? 0.5 : 1, fontWeight: 600,
          }}
        >
          {deleting ? '刪除中…' : '🗑 刪除任務'}
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function MyTasksPage() {
  const { user, authFetch } = useAuth();
  const [tasks,      setTasks]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);
  const [filterStatus, setFilterStatus] = useState('active'); // all | active | done
  const [filterPri,    setFilterPri]    = useState('all');
  const [search,       setSearch]       = useState('');
  const [groupBy,      setGroupBy]      = useState('status'); // status | project | priority

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

  // ── Filter pipeline ──
  const filtered = useMemo(() => {
    let list = tasks;
    if (filterStatus === 'active') list = list.filter(t => !['done','cancelled'].includes(t.status));
    if (filterStatus === 'done')   list = list.filter(t => t.status === 'done');
    if (filterPri !== 'all')       list = list.filter(t => t.priority === filterPri);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || t.project?.name?.toLowerCase().includes(q));
    }
    return list;
  }, [tasks, filterStatus, filterPri, search]);

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
      <div style={{ background: BRAND.heroBg, padding: '24px 32px 20px', color: '#fff', flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', opacity: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>
          my tasks
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 3px', letterSpacing: '-0.02em' }}>我的任務</h1>
        <p style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>跨專案個人任務總覽，掌握進度一目瞭然</p>
        <div style={{ display: 'flex', gap: 28, marginTop: 16 }}>
          {kpis.map(k => (
            <div key={k.label}>
              <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{loading ? '—' : k.value}</div>
              <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>{k.label}</div>
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
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜尋任務或專案…"
          style={{
            padding: '6px 12px', borderRadius: 6, border: `1px solid ${BRAND.silver}`,
            background: BRAND.surfaceSoft, color: BRAND.ink, fontSize: 12,
            outline: 'none', width: 200, flexShrink: 0,
          }}
        />

        {/* 狀態篩選 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { k: 'active', label: '進行中' },
            { k: 'all',    label: '全部' },
            { k: 'done',   label: '已完成' },
          ].map(({ k, label }) => (
            <button key={k} onClick={() => setFilterStatus(k)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
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
            background: BRAND.surfaceSoft, color: BRAND.carbon, fontSize: 11, cursor: 'pointer',
          }}
        >
          <option value="all">所有優先序</option>
          {Object.entries(PRIORITY_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}優先</option>
          ))}
        </select>

        {/* 分組 */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <span style={{ fontSize: 11, color: BRAND.muted, alignSelf: 'center' }}>分組：</span>
          {[
            { k: 'status',   label: '狀態' },
            { k: 'project',  label: '專案' },
            { k: 'priority', label: '優先序' },
          ].map(({ k, label }) => (
            <button key={k} onClick={() => setGroupBy(k)} style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
              border: `1px solid ${groupBy === k ? BRAND.crimson : BRAND.silver}`,
              background: groupBy === k ? BRAND.accentSurface : 'transparent',
              color: groupBy === k ? BRAND.crimson : BRAND.carbon,
              fontWeight: groupBy === k ? 700 : 400, transition: 'all .1s',
            }}>{label}</button>
          ))}
        </div>

        <div style={{ fontSize: 11, color: BRAND.muted, flexShrink: 0 }}>
          {filtered.length} 筆
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* 任務列表 */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: BRAND.muted, fontSize: 13 }}>載入中…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
              <div style={{ fontSize: 14, color: BRAND.muted }}>
                {filterStatus === 'active' ? '沒有進行中的任務' : '找不到符合的任務'}
              </div>
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
                  <span style={{ fontSize: 12, fontWeight: 700, color: BRAND.carbon }}>
                    {group.label}
                  </span>
                  <span style={{
                    fontSize: 10, padding: '1px 7px', borderRadius: 10,
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

        {/* 右側詳情面板（互動式：可改狀態/優先度/截止日/刪除）*/}
        {selected && (
          <DetailPanel
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
