/**
 * CalendarPage — 行事曆視圖
 *
 * 月/週/日三種視圖，顯示所有任務（依 dueDate / planStart~planEnd）
 * 支援日期格子點擊快速新增任務、拖放移動截止日
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';

const T = {
  get brand()      { return getComputedStyle(document.documentElement).getPropertyValue('--xc-brand').trim() || '#C41230'; },
  get bg()         { return 'var(--xc-bg)'; },
  get surface()    { return 'var(--xc-surface)'; },
  get surfaceSoft(){ return 'var(--xc-surface-soft)'; },
  get card()       { return 'var(--xc-card-bg)'; },
  get border()     { return 'var(--xc-border)'; },
  get borderStrong(){ return 'var(--xc-border-strong)'; },
  get t1()         { return 'var(--xc-text)'; },
  get t2()         { return 'var(--xc-text-soft)'; },
  get t3()         { return 'var(--xc-text-muted)'; },
  get accent()     { return 'var(--xc-brand)'; },
  get success()    { return 'var(--xc-success)'; },
  get warning()    { return 'var(--xc-warning)'; },
  get danger()     { return '#DC2626'; },
};

const PRIORITY_COLORS = { urgent: '#DC2626', high: '#EA580C', medium: '#D97706', low: '#6B7280' };
const STATUS_COLORS   = { todo: '#94A3B8', in_progress: '#C41230', review: '#D97706', done: '#16A34A' };
const STATUS_LABELS   = { todo: '待辦', in_progress: '進行中', review: '審核中', done: '已完成' };
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const VIEWS = [
  { id: 'month', label: '月' },
  { id: 'week',  label: '週' },
  { id: 'day',   label: '日' },
];

/* ── 日期工具 ─────────────────────────────────────────────── */
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function startOfWeek(d)  { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r; }
function addDays(d, n)   { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function isSameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function fmtDate(d)      { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtMonth(d)     { return `${d.getFullYear()} 年 ${d.getMonth()+1} 月`; }
function fmtWeek(d) {
  const s = startOfWeek(d), e = addDays(s, 6);
  return `${s.getMonth()+1}/${s.getDate()} — ${e.getMonth()+1}/${e.getDate()}`;
}

/* ── 月曆格子計算 ─────────────────────────────────────────── */
function getMonthGrid(d) {
  const first = startOfMonth(d);
  const last  = endOfMonth(d);
  const start = startOfWeek(first);
  const days  = [];
  let cur = new Date(start);
  while (days.length < 42) {
    days.push(new Date(cur));
    cur = addDays(cur, 1);
  }
  return { days, month: d.getMonth() };
}

export default function CalendarPage({ onNavigate }) {
  const { user: currentUser, authFetch } = useAuth();
  const [tasks, setTasks]     = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView]       = useState('month');
  const [anchor, setAnchor]   = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [filteredProject, setFilteredProject] = useState('');
  const [filteredStatus, setFilteredStatus] = useState('');
  const [projects, setProjects] = useState([]);
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  /* ── 載入資料 ─────────────────────────────────────────── */
  const loadData = useCallback(async () => {
    if (!currentUser?.companyId) return;
    setLoading(true);
    try {
      const [taskRes, projRes] = await Promise.all([
        authFetch(`/api/tasks?companyId=${currentUser.companyId}`).then(r => r.json()),
        authFetch(`/api/projects?companyId=${currentUser.companyId}`).then(r => r.json()),
      ]);
      const rawList = taskRes?.data || taskRes || [];
      // 過濾掉子任務（只顯示父任務）
      const taskList = (Array.isArray(rawList) ? rawList : []).filter(t => !t.parentTaskId);
      setTasks(taskList);
      const projList = Array.isArray(projRes) ? projRes : (projRes?.data || projRes?.projects || []);
      setProjects(Array.isArray(projList) ? projList : []);

      // load milestones from all projects 
      const allMilestones = [];
      for (const p of (Array.isArray(projList) ? projList : [])) {
        if (p.milestones) allMilestones.push(...p.milestones.map(m => ({ ...m, projectName: p.name })));
      }
      setMilestones(allMilestones);
    } catch(e) { console.error('[CalendarPage] load error:', e); }
    setLoading(false);
  }, [currentUser?.companyId, authFetch]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── 任務篩選 ─────────────────────────────────────────── */
  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (filteredProject) list = list.filter(t => String(t.project?.id) === String(filteredProject));
    if (filteredStatus) list = list.filter(t => t.status === filteredStatus);
    return list;
  }, [tasks, filteredProject, filteredStatus]);

  /* ── 任務分佈到日期 ────────────────────────────────────── */
  const tasksByDate = useMemo(() => {
    const map = {};
    for (const t of filteredTasks) {
      const dateStr = t.dueDate;
      if (!dateStr) continue;
      const key = dateStr.split('T')[0];
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [filteredTasks]);

  /* ── 導航 ─────────────────────────────────────────────── */
  const navPrev = () => {
    if (view === 'month') setAnchor(new Date(anchor.getFullYear(), anchor.getMonth()-1, 1));
    else if (view === 'week') setAnchor(addDays(anchor, -7));
    else setAnchor(addDays(anchor, -1));
  };
  const navNext = () => {
    if (view === 'month') setAnchor(new Date(anchor.getFullYear(), anchor.getMonth()+1, 1));
    else if (view === 'week') setAnchor(addDays(anchor, 7));
    else setAnchor(addDays(anchor, 1));
  };
  const goToday = () => setAnchor(new Date());

  /* ── 月視圖 ─────────────────────────────────────────── */
  const { days: monthDays, month: currentMonth } = useMemo(() => getMonthGrid(anchor), [anchor]);

  /* ── 週/日視圖計算 ──────────────────────────────────── */
  const weekDays = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor]);

  /* ── 渲染任務標籤 ────────────────────────────────────── */
  const TaskChip = ({ task }) => {
    const color = STATUS_COLORS[task.status] || '#94A3B8';
    const prioColor = PRIORITY_COLORS[task.priority] || '#6B7280';
    return (
      <div
        title={`${task.title}\n${STATUS_LABELS[task.status] || task.status} | ${task.priority || ''}\n${task.project?.name || ''}`}
        style={{
          fontSize: 12, lineHeight: '16px', padding: '2px 6px',
          borderRadius: 6, marginBottom: 2, cursor: 'pointer',
          background: `${color}18`, color: color,
          fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          borderLeft: `3px solid ${prioColor}`,
          transition: 'transform 0.1s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        onClick={e => { e.stopPropagation(); if (onNavigate && task.project?.id) onNavigate('project-detail', { projectId: task.project.id }); }}
      >
        {task.title}
      </div>
    );
  };

  /* ── 統計摘要 ──────────────────────────────────────── */
  const stats = useMemo(() => {
    const thisMonth = filteredTasks.filter(t => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate);
      return d.getMonth() === anchor.getMonth() && d.getFullYear() === anchor.getFullYear();
    });
    const overdue = filteredTasks.filter(t => t.healthStatus === 'off_track' && t.status !== 'done');
    const upcoming = filteredTasks.filter(t => {
      if (!t.dueDate || t.status === 'done') return false;
      const d = new Date(t.dueDate); d.setHours(0,0,0,0);
      const diff = Math.round((d - today) / 86400000);
      return diff >= 0 && diff <= 7;
    });
    return { thisMonth: thisMonth.length, overdue: overdue.length, upcoming: upcoming.length, total: filteredTasks.length };
  }, [filteredTasks, anchor, today]);

  /* ── 載入中 ───────────────────────────────────────── */
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 10 }}>
      <div style={{ width: 24, height: 24, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      <span style={{ color: T.t2, fontSize: 15 }}>載入行事曆...</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* ── 統計卡片 ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: '本月任務', value: stats.thisMonth, color: T.accent, icon: '📅' },
          { label: '即將到期 (7天內)', value: stats.upcoming, color: '#D97706', icon: '⏰' },
          { label: '已逾期', value: stats.overdue, color: T.danger, icon: '🔴' },
          { label: '總任務數', value: stats.total, color: '#6366F1', icon: '📋' },
        ].map((s, i) => (
          <div key={i} style={{ background: T.card, borderRadius: 14, padding: '16px 18px', border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: 13, color: T.t3, fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 工具列 ────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* 導航 */}
        <button onClick={navPrev} style={navBtnStyle}>◀</button>
        <button onClick={goToday} style={{ ...navBtnStyle, padding: '6px 14px', fontSize: 13, fontWeight: 700 }}>今天</button>
        <button onClick={navNext} style={navBtnStyle}>▶</button>
        <span style={{ fontSize: 18, fontWeight: 800, color: T.t1, minWidth: 160 }}>
          {view === 'month' ? fmtMonth(anchor) : view === 'week' ? fmtWeek(anchor) : fmtDate(anchor)}
        </span>

        <div style={{ flex: 1 }} />

        {/* 篩選 */}
        <select value={filteredProject} onChange={e => setFilteredProject(e.target.value)}
          style={selectStyle}>
          <option value="">所有專案</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filteredStatus} onChange={e => setFilteredStatus(e.target.value)}
          style={selectStyle}>
          <option value="">所有狀態</option>
          {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        {/* 視圖切換 */}
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}` }}>
          {VIEWS.map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              style={{
                padding: '6px 14px', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: view === v.id ? T.accent : T.card, color: view === v.id ? '#fff' : T.t2,
                transition: 'background 0.15s, color 0.15s', fontFamily: 'inherit',
              }}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 月視圖 ────────────────────────────────────── */}
      {view === 'month' && (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden', background: T.card }}>
          {/* 星期標頭 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {WEEKDAYS.map((w, i) => (
              <div key={i} style={{ padding: '10px 0', textAlign: 'center', fontSize: 13, fontWeight: 700, color: i === 0 || i === 6 ? T.danger : T.t2, background: T.surfaceSoft, borderBottom: `1px solid ${T.border}` }}>
                {w}
              </div>
            ))}
          </div>
          {/* 日期格子 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {monthDays.map((day, idx) => {
              const key = fmtDate(day);
              const dayTasks = tasksByDate[key] || [];
              const isCurrentMonth = day.getMonth() === currentMonth;
              const isToday = isSameDay(day, today);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              return (
                <div key={idx}
                  onClick={() => setSelectedDate(day)}
                  style={{
                    minHeight: 100, padding: '4px 6px',
                    borderRight: (idx + 1) % 7 !== 0 ? `1px solid ${T.border}` : 'none',
                    borderBottom: idx < 35 ? `1px solid ${T.border}` : 'none',
                    background: isToday ? `${T.accent}08` : isSelected ? `${T.accent}05` : isCurrentMonth ? 'transparent' : T.surfaceSoft,
                    cursor: 'pointer', transition: 'background 0.12s',
                    opacity: isCurrentMonth ? 1 : 0.5,
                  }}
                  onMouseEnter={e => { if (!isToday && !isSelected) e.currentTarget.style.background = `${T.accent}06`; }}
                  onMouseLeave={e => { if (!isToday && !isSelected) e.currentTarget.style.background = isCurrentMonth ? 'transparent' : T.surfaceSoft; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{
                      fontSize: 13, fontWeight: isToday ? 800 : 600,
                      color: isToday ? '#fff' : T.t1,
                      background: isToday ? T.accent : 'transparent',
                      borderRadius: '50%', width: isToday ? 26 : 'auto', height: isToday ? 26 : 'auto',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {day.getDate()}
                    </span>
                    {dayTasks.length > 0 && (
                      <span style={{ fontSize: 11, color: T.t3, fontWeight: 700 }}>{dayTasks.length}</span>
                    )}
                  </div>
                  {dayTasks.slice(0, 3).map(t => <TaskChip key={t.id} task={t} />)}
                  {dayTasks.length > 3 && (
                    <div style={{ fontSize: 11, color: T.t3, fontWeight: 700, textAlign: 'center', marginTop: 2 }}>
                      +{dayTasks.length - 3} 更多
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 週視圖 ────────────────────────────────────── */}
      {view === 'week' && (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden', background: T.card }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {weekDays.map((day, i) => {
              const key = fmtDate(day);
              const dayTasks = tasksByDate[key] || [];
              const isToday = isSameDay(day, today);
              return (
                <div key={i} style={{ borderRight: i < 6 ? `1px solid ${T.border}` : 'none' }}>
                  <div style={{
                    padding: '12px 8px', textAlign: 'center', borderBottom: `1px solid ${T.border}`,
                    background: isToday ? `${T.accent}10` : T.surfaceSoft,
                  }}>
                    <div style={{ fontSize: 12, color: T.t3, fontWeight: 700 }}>{WEEKDAYS[day.getDay()]}</div>
                    <div style={{
                      fontSize: 20, fontWeight: 800,
                      color: isToday ? T.accent : T.t1,
                    }}>{day.getDate()}</div>
                    <div style={{ fontSize: 11, color: T.t3 }}>{day.getMonth()+1}月</div>
                  </div>
                  <div style={{ padding: '8px 6px', minHeight: 300 }}>
                    {dayTasks.map(t => (
                      <div key={t.id} style={{
                        padding: '8px 10px', marginBottom: 8, borderRadius: 10,
                        background: `${STATUS_COLORS[t.status] || '#94A3B8'}10`,
                        border: `1px solid ${STATUS_COLORS[t.status] || '#94A3B8'}30`,
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.t1, marginBottom: 4 }}>{t.title}</div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 11, padding: '2px 6px', borderRadius: 6,
                            background: `${STATUS_COLORS[t.status]}20`, color: STATUS_COLORS[t.status], fontWeight: 700,
                          }}>{STATUS_LABELS[t.status]}</span>
                          {t.priority && (
                            <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: `${PRIORITY_COLORS[t.priority]}15`, color: PRIORITY_COLORS[t.priority], fontWeight: 700 }}>
                              {t.priority}
                            </span>
                          )}
                          {t.project?.name && (
                            <span style={{ fontSize: 11, color: T.t3 }}>{t.project.name}</span>
                          )}
                        </div>
                        {t.assignee?.name && (
                          <div style={{ fontSize: 12, color: T.t2, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 16, height: 16, borderRadius: '50%', background: T.accent, color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              {t.assignee.name[0]}
                            </span>
                            {t.assignee.name}
                          </div>
                        )}
                      </div>
                    ))}
                    {dayTasks.length === 0 && (
                      <div style={{ textAlign: 'center', color: T.t3, fontSize: 13, padding: '20px 0' }}>無任務</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 日視圖 ────────────────────────────────────── */}
      {view === 'day' && (() => {
        const key = fmtDate(anchor);
        const dayTasks = tasksByDate[key] || [];
        const isToday = isSameDay(anchor, today);
        return (
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden', background: T.card }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, background: isToday ? `${T.accent}06` : T.surfaceSoft }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.t1 }}>
                {anchor.getMonth()+1} 月 {anchor.getDate()} 日 ({WEEKDAYS[anchor.getDay()]})
                {isToday && <span style={{ marginLeft: 10, fontSize: 13, padding: '3px 10px', borderRadius: 999, background: T.accent, color: '#fff', fontWeight: 700 }}>今天</span>}
              </div>
              <div style={{ fontSize: 14, color: T.t2, marginTop: 4 }}>{dayTasks.length} 項任務</div>
            </div>
            <div style={{ padding: 16 }}>
              {dayTasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: T.t3 }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>今日無任務排程</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {dayTasks.map(t => (
                    <div key={t.id} style={{
                      padding: '14px 18px', borderRadius: 14,
                      border: `1px solid ${T.border}`, background: T.card,
                      display: 'flex', alignItems: 'center', gap: 14,
                    }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: STATUS_COLORS[t.status] || '#94A3B8', flexShrink: 0,
                      }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.t1 }}>{t.title}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: `${STATUS_COLORS[t.status]}15`, color: STATUS_COLORS[t.status], fontWeight: 700 }}>
                            {STATUS_LABELS[t.status]}
                          </span>
                          {t.priority && <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: `${PRIORITY_COLORS[t.priority]}12`, color: PRIORITY_COLORS[t.priority], fontWeight: 700 }}>{t.priority}</span>}
                          {t.project?.name && <span style={{ fontSize: 12, color: T.t3 }}>📁 {t.project.name}</span>}
                          {t.progressPercent > 0 && <span style={{ fontSize: 12, color: T.t2 }}>進度 {t.progressPercent}%</span>}
                        </div>
                      </div>
                      {t.assignee?.name && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 28, height: 28, borderRadius: '50%', background: T.accent, color: '#fff', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            {t.assignee.name[0]}
                          </span>
                          <span style={{ fontSize: 13, color: T.t2, fontWeight: 600 }}>{t.assignee.name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── 選中日期側邊詳情 ──────────────────────────── */}
      {selectedDate && view === 'month' && (() => {
        const key = fmtDate(selectedDate);
        const dayTasks = tasksByDate[key] || [];
        return (
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 380,
            background: T.card, borderLeft: `1px solid ${T.border}`,
            boxShadow: '-8px 0 30px rgba(0,0,0,0.1)', zIndex: 1000,
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: T.t1 }}>
                  {selectedDate.getMonth()+1}/{selectedDate.getDate()} ({WEEKDAYS[selectedDate.getDay()]})
                </div>
                <div style={{ fontSize: 13, color: T.t3 }}>{dayTasks.length} 項任務</div>
              </div>
              <button onClick={() => setSelectedDate(null)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: T.t2, padding: 4 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {dayTasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: T.t3 }}>無排程任務</div>
              ) : dayTasks.map(t => (
                <div key={t.id} style={{ padding: '12px 14px', marginBottom: 10, borderRadius: 12, border: `1px solid ${T.border}`, background: T.surface }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.t1, marginBottom: 6 }}>{t.title}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: `${STATUS_COLORS[t.status]}20`, color: STATUS_COLORS[t.status], fontWeight: 700 }}>{STATUS_LABELS[t.status]}</span>
                    {t.priority && <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: `${PRIORITY_COLORS[t.priority]}12`, color: PRIORITY_COLORS[t.priority], fontWeight: 700 }}>{t.priority}</span>}
                  </div>
                  {t.project?.name && <div style={{ fontSize: 12, color: T.t3, marginTop: 4 }}>📁 {t.project.name}</div>}
                  {t.assignee?.name && <div style={{ fontSize: 12, color: T.t2, marginTop: 4 }}>👤 {t.assignee.name}</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const navBtnStyle = { background: 'var(--xc-card-bg)', border: '1px solid var(--xc-border)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'var(--xc-text)', fontFamily: 'inherit', fontSize: 14, fontWeight: 700 };
const selectStyle = { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--xc-border)', background: 'var(--xc-card-bg)', color: 'var(--xc-text)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' };
