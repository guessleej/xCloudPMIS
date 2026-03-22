import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

// ─── Brand Colors ───────────────────────────────────────────────────────────
const BRAND = {
  accent: '#C41230',
  pageBg: '#F7F2F2',
};

const LOAD_COLOR = {
  none: 'transparent',
  low: '#16A34A',    // 1–3 tasks
  mid: '#D97706',    // 4–6 tasks
  high: '#DC2626',   // 7+ tasks
};

function getLoadColor(count) {
  if (count === 0) return LOAD_COLOR.none;
  if (count <= 3) return LOAD_COLOR.low;
  if (count <= 6) return LOAD_COLOR.mid;
  return LOAD_COLOR.high;
}

function getLoadLabel(count) {
  if (count === 0) return 'none';
  if (count <= 3) return 'low';
  if (count <= 6) return 'mid';
  return 'high';
}

// ─── Static Mock Data ────────────────────────────────────────────────────────
const MOCK_MEMBERS = [
  { id: 1, name: '陳小明', role: '前端工程師', avatar: null },
  { id: 2, name: '李美玲', role: '後端工程師', avatar: null },
  { id: 3, name: '王大偉', role: '產品經理', avatar: null },
  { id: 4, name: '張雅婷', role: 'UI 設計師', avatar: null },
  { id: 5, name: '林志遠', role: 'DevOps 工程師', avatar: null },
];

function generateMockTasks(members) {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday

  const taskNames = [
    '修復登入頁面 Bug', '設計首頁原型', 'API 文件撰寫', '資料庫優化',
    'CI/CD 流程設定', '使用者測試', 'Sprint 計畫會議', '程式碼審查',
    '效能優化', '安全性稽核', '新功能開發', '系統部署', 'UI 元件設計',
    '需求分析報告', 'Docker 容器化', '後端 API 整合', '前端路由設定',
    '資料遷移腳本', '監控儀表板設定', '文件更新',
  ];

  const tasks = [];
  let taskId = 1;

  members.forEach((member) => {
    // each member gets 2–5 tasks spread across this week
    const count = Math.floor(Math.random() * 4) + 2;
    for (let i = 0; i < count; i++) {
      const dayOffset = Math.floor(Math.random() * 7);
      const taskDate = new Date(weekStart);
      taskDate.setDate(weekStart.getDate() + dayOffset);
      const dueDate = new Date(taskDate);
      dueDate.setDate(taskDate.getDate() + Math.floor(Math.random() * 3) + 1);

      tasks.push({
        id: taskId++,
        name: taskNames[(taskId + member.id) % taskNames.length],
        assigneeId: member.id,
        startDate: taskDate.toISOString().split('T')[0],
        dueDate: dueDate.toISOString().split('T')[0],
        estimatedHours: Math.floor(Math.random() * 8) + 1,
        project: ['xCloud PMIS', '行銷官網', '內部工具', '客戶專案A'][Math.floor(Math.random() * 4)],
        priority: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)],
      });
    }
  });

  return tasks;
}

// ─── Utility Helpers ─────────────────────────────────────────────────────────
function isoDate(d) {
  return d.toISOString().split('T')[0];
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function getWeekDays(anchor) {
  // Returns Mon–Sun for the week containing anchor
  const day = anchor.getDay(); // 0=Sun
  const monday = addDays(anchor, day === 0 ? -6 : 1 - day);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function getMonthDays(anchor) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = [];
  for (let d = new Date(first); d <= last; d = addDays(d, 1)) {
    days.push(new Date(d));
  }
  return days;
}

function formatDateHeader(date, mode) {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  if (mode === 'week') {
    return { top: `${date.getMonth() + 1}/${date.getDate()}`, bottom: weekdays[date.getDay()] };
  }
  return { top: `${date.getDate()}`, bottom: weekdays[date.getDay()] };
}

function formatRangeLabel(days, mode) {
  if (days.length === 0) return '';
  const first = days[0];
  const last = days[days.length - 1];
  if (mode === 'week') {
    return `${first.getFullYear()} 年 ${first.getMonth() + 1} 月 ${first.getDate()} 日 – ${last.getMonth() + 1} 月 ${last.getDate()} 日`;
  }
  return `${first.getFullYear()} 年 ${first.getMonth() + 1} 月`;
}

// ─── Avatar Component ─────────────────────────────────────────────────────────
function Avatar({ member, size = 32 }) {
  const colors = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
  const bg = colors[member.id % colors.length];
  const initial = member.name ? member.name[0] : '?';

  if (member.avatar) {
    return (
      <img
        src={member.avatar}
        alt={member.name}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}

// ─── Tooltip Component ────────────────────────────────────────────────────────
function TaskTooltip({ task, onClose, onNavigate }) {
  const priorityColor = { high: '#DC2626', medium: '#D97706', low: '#16A34A' };
  const priorityLabel = { high: '高', medium: '中', low: '低' };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.2)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 12, padding: 20,
          minWidth: 280, maxWidth: 360,
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 18, color: '#9CA3AF',
          }}
        >
          ✕
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 12, paddingRight: 24 }}>
          {task.name}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Row label="專案" value={task.project || '—'} />
          <Row label="開始" value={task.startDate || '—'} />
          <Row label="截止" value={task.dueDate || '—'} />
          <Row label="預估工時" value={task.estimatedHours ? `${task.estimatedHours} hr` : '—'} />
          <Row
            label="優先級"
            value={
              <span style={{
                color: priorityColor[task.priority] || '#6B7280',
                fontWeight: 600,
              }}>
                {priorityLabel[task.priority] || task.priority || '—'}
              </span>
            }
          />
        </div>
        <button
          onClick={() => {
            if (task.projectId) {
              sessionStorage.setItem('xcloud-open-project', String(task.projectId));
            }
            onClose();
            if (onNavigate) onNavigate('projects');
          }}
          style={{
            marginTop: 16, width: '100%', padding: '8px 0',
            background: BRAND.accent, color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontSize: 14, fontWeight: 600,
          }}
        >
          查看任務詳情
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={{ color: '#6B7280', fontSize: 13, minWidth: 70 }}>{label}</span>
      <span style={{ color: '#111', fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

// ─── Gantt View ───────────────────────────────────────────────────────────────
function GanttView({ members, tasks, days, expandedMembers, onToggleMember, onNavigate }) {
  const [tooltip, setTooltip] = useState(null);
  const today = isoDate(new Date());
  const LEFT_COL = 220;
  const DAY_W = 52;

  // Group tasks by assigneeId and date
  const taskMap = {};
  tasks.forEach((t) => {
    if (!t.assigneeId) return;
    if (!taskMap[t.assigneeId]) taskMap[t.assigneeId] = {};
    // A task spans from startDate to dueDate (or just startDate if no dueDate)
    const start = t.startDate ? new Date(t.startDate) : null;
    const end = t.dueDate ? new Date(t.dueDate) : start;
    if (!start) return;

    days.forEach((day) => {
      const dayIso = isoDate(day);
      if (dayIso >= t.startDate && (!t.dueDate || dayIso <= t.dueDate)) {
        if (!taskMap[t.assigneeId][dayIso]) taskMap[t.assigneeId][dayIso] = [];
        taskMap[t.assigneeId][dayIso].push(t);
      }
    });
  });

  return (
    <div style={{ position: 'relative' }}>
      {tooltip && <TaskTooltip task={tooltip} onClose={() => setTooltip(null)} onNavigate={onNavigate} />}

      {/* Scroll wrapper */}
      <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
        <div style={{ minWidth: LEFT_COL + DAY_W * days.length, fontFamily: 'inherit' }}>

          {/* Sticky header */}
          <div style={{
            display: 'flex', position: 'sticky', top: 0, zIndex: 10,
            background: '#fff', borderBottom: '2px solid #E5E7EB',
          }}>
            {/* Left corner */}
            <div style={{
              width: LEFT_COL, flexShrink: 0,
              borderRight: '1px solid #E5E7EB',
              padding: '8px 16px',
              display: 'flex', alignItems: 'center',
              fontSize: 12, fontWeight: 600, color: '#6B7280',
            }}>
              成員
            </div>
            {/* Day headers */}
            {days.map((day) => {
              const iso = isoDate(day);
              const isToday = iso === today;
              const { top, bottom } = formatDateHeader(day, days.length <= 7 ? 'week' : 'month');
              return (
                <div
                  key={iso}
                  style={{
                    width: DAY_W, flexShrink: 0, textAlign: 'center',
                    padding: '6px 2px',
                    background: isToday ? '#EFF6FF' : 'transparent',
                    borderRight: '1px solid #F3F4F6',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: 11, color: isToday ? '#2563EB' : '#9CA3AF', fontWeight: 600 }}>{top}</span>
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: isToday ? '#2563EB' : '#374151',
                  }}>{bottom}</span>
                  {isToday && (
                    <div style={{ width: 20, height: 3, borderRadius: 2, background: '#2563EB', marginTop: 2 }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Member rows */}
          {members.map((member) => {
            const memberTasks = taskMap[member.id] || {};
            const totalTasks = tasks.filter((t) => t.assigneeId === member.id).length;
            const totalHours = tasks
              .filter((t) => t.assigneeId === member.id)
              .reduce((s, t) => s + (t.estimatedHours || 0), 0);
            const isExpanded = expandedMembers.has(member.id);

            return (
              <div key={member.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                {/* Row */}
                <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 56 }}>
                  {/* Left: member info */}
                  <div
                    style={{
                      width: LEFT_COL, flexShrink: 0,
                      borderRight: '1px solid #E5E7EB',
                      padding: '8px 12px',
                      display: 'flex', alignItems: 'center', gap: 10,
                      cursor: 'pointer',
                      background: isExpanded ? '#FEF2F2' : '#fff',
                      transition: 'background 0.15s',
                    }}
                    onClick={() => onToggleMember(member.id)}
                  >
                    <Avatar member={member} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {member.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>
                        {totalTasks} 任務 · {totalHours}h
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: '#9CA3AF', flexShrink: 0 }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>

                  {/* Right: day cells */}
                  {days.map((day) => {
                    const iso = isoDate(day);
                    const isToday = iso === today;
                    const dayTasks = memberTasks[iso] || [];
                    const count = dayTasks.length;
                    const color = getLoadColor(count);

                    return (
                      <div
                        key={iso}
                        style={{
                          width: DAY_W, flexShrink: 0,
                          borderRight: '1px solid #F3F4F6',
                          background: isToday ? '#EFF6FF' : 'transparent',
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center',
                          padding: '4px 2px', gap: 2,
                        }}
                      >
                        {dayTasks.map((task) => (
                          <div
                            key={task.id}
                            title={task.name}
                            onClick={() => setTooltip(task)}
                            style={{
                              width: '90%', minHeight: 18,
                              background: color,
                              borderRadius: 4,
                              cursor: 'pointer',
                              display: 'flex', alignItems: 'center',
                              padding: '1px 4px',
                              overflow: 'hidden',
                              transition: 'opacity 0.15s',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                          >
                            <span style={{
                              fontSize: 10, color: '#fff', fontWeight: 600,
                              whiteSpace: 'nowrap', overflow: 'hidden',
                              textOverflow: 'ellipsis', width: '100%',
                            }}>
                              {task.name}
                            </span>
                          </div>
                        ))}
                        {count === 0 && (
                          <div style={{ width: '90%', height: 18, borderRadius: 4, background: '#F3F4F6' }} />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Expanded task list */}
                {isExpanded && (
                  <div style={{ background: '#FEF9F9', borderTop: '1px solid #FCE7E7', padding: '8px 12px 8px', paddingLeft: LEFT_COL + 12 }}>
                    {tasks.filter((t) => t.assigneeId === member.id).length === 0 ? (
                      <div style={{ color: '#9CA3AF', fontSize: 13 }}>本週無任務</div>
                    ) : (
                      tasks.filter((t) => t.assigneeId === member.id).map((task) => (
                        <div
                          key={task.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '6px 0', borderBottom: '1px solid #F3F4F6',
                            cursor: 'pointer',
                          }}
                          onClick={() => { console.log('Navigate to task:', task.id, task.name); }}
                        >
                          <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: getLoadColor(tasks.filter((t2) => t2.assigneeId === member.id).length),
                            flexShrink: 0,
                          }} />
                          <span style={{ fontSize: 13, color: '#374151', flex: 1 }}>{task.name}</span>
                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>{task.dueDate}</span>
                          <span style={{ fontSize: 11, color: '#6B7280' }}>{task.estimatedHours}h</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Card View ────────────────────────────────────────────────────────────────
function CardView({ members, tasks, days }) {
  const [expandedCards, setExpandedCards] = useState(new Set());

  const toggleCard = (id) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const todayIso = isoDate(new Date());
  const dayIsos = days.map(isoDate);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: 20, padding: '4px 0',
    }}>
      {members.map((member) => {
        const memberTasks = tasks.filter((t) => t.assigneeId === member.id);
        const weekTasks = memberTasks.filter((t) => dayIsos.includes(t.startDate) || dayIsos.includes(t.dueDate));
        const totalHours = weekTasks.reduce((s, t) => s + (t.estimatedHours || 0), 0);
        const count = weekTasks.length;
        const loadLabel = getLoadLabel(count);
        const loadColor = getLoadColor(count);
        const isExpanded = expandedCards.has(member.id);

        const loadBarColors = {
          none: '#E5E7EB',
          low: '#16A34A',
          mid: '#D97706',
          high: '#DC2626',
        };
        const loadTextColors = {
          none: '#6B7280',
          low: '#15803D',
          mid: '#B45309',
          high: '#B91C1C',
        };
        const loadLabels = { none: '無任務', low: '負載正常', mid: '負載偏高', high: '過載' };

        const previewTasks = isExpanded ? memberTasks : memberTasks.slice(0, 3);

        return (
          <div
            key={member.id}
            style={{
              background: '#fff', borderRadius: 16,
              boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
              overflow: 'hidden',
              border: loadLabel === 'high' ? `2px solid ${LOAD_COLOR.high}` : '2px solid transparent',
              transition: 'box-shadow 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.13)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.07)'; }}
          >
            {/* Card header */}
            <div style={{ background: BRAND.pageBg, padding: '20px 20px 16px', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                <Avatar member={member} size={56} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>{member.name}</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{member.role}</div>
            </div>

            {/* Stats */}
            <div style={{ padding: '12px 20px 0' }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1, textAlign: 'center', background: '#F9FAFB', borderRadius: 8, padding: '8px 4px' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#111' }}>{count}</div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>本週任務</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', background: '#F9FAFB', borderRadius: 8, padding: '8px 4px' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#111' }}>{totalHours}</div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>預估工時 (h)</div>
                </div>
              </div>

              {/* Load bar */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>工作負載</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: loadTextColors[loadLabel] }}>
                    {loadLabels[loadLabel]}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: '#E5E7EB' }}>
                  <div style={{
                    height: 6, borderRadius: 3,
                    background: loadBarColors[loadLabel],
                    width: loadLabel === 'none' ? '0%' : loadLabel === 'low' ? '33%' : loadLabel === 'mid' ? '66%' : '100%',
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>

              {/* Task list */}
              <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 8 }}>
                {memberTasks.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#9CA3AF', padding: '8px 0', textAlign: 'center' }}>
                    目前無任務
                  </div>
                ) : (
                  previewTasks.map((task) => (
                    <div
                      key={task.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 0', borderBottom: '1px solid #F9FAFB',
                        cursor: 'pointer',
                      }}
                      onClick={() => { console.log('Navigate to task:', task.id, task.name); }}
                    >
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: loadColor || '#E5E7EB', flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 13, color: '#374151', flex: 1,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {task.name}
                      </span>
                      <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>
                        {task.estimatedHours}h
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Expand toggle */}
            {memberTasks.length > 3 && (
              <button
                onClick={() => toggleCard(member.id)}
                style={{
                  width: '100%', padding: '10px 0',
                  background: 'none', border: 'none',
                  borderTop: '1px solid #F3F4F6',
                  cursor: 'pointer', color: BRAND.accent,
                  fontSize: 13, fontWeight: 600,
                }}
              >
                {isExpanded ? '收合 ▲' : `查看全部 (${memberTasks.length}) ▼`}
              </button>
            )}
            {memberTasks.length <= 3 && <div style={{ height: 12 }} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────
function SummaryBar({ members, tasks }) {
  const overloaded = members.filter((m) => {
    const c = tasks.filter((t) => t.assigneeId === m.id).length;
    return c >= 7;
  }).length;
  const ok = members.filter((m) => {
    const c = tasks.filter((t) => t.assigneeId === m.id).length;
    return c > 0 && c < 7;
  }).length;

  const stats = [
    { label: '總成員數', value: members.length, color: '#374151' },
    { label: '過載成員', value: overloaded, color: LOAD_COLOR.high },
    { label: '負載正常', value: ok, color: LOAD_COLOR.low },
    { label: '本週總任務', value: tasks.length, color: '#2563EB' },
  ];

  return (
    <div style={{
      display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24,
    }}>
      {stats.map((s) => (
        <div
          key={s.label}
          style={{
            background: '#fff', borderRadius: 12,
            padding: '12px 20px', flex: '1 1 140px',
            boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
          <div style={{ fontSize: 12, color: '#6B7280' }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Member Filter Dropdown ───────────────────────────────────────────────────
function MemberFilterDropdown({ members, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const allSelected = selected.size === 0 || selected.size === members.length;

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next.size === members.length ? new Set() : next);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 8,
          border: '1.5px solid #E5E7EB', background: '#fff',
          cursor: 'pointer', fontSize: 13, color: '#374151',
          fontWeight: 500,
        }}
      >
        篩選成員
        <span style={{ color: BRAND.accent, fontWeight: 700 }}>
          {allSelected ? '全部' : `${selected.size} 位`}
        </span>
        <span style={{ fontSize: 10 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          background: '#fff', borderRadius: 10, padding: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          minWidth: 180, zIndex: 100,
          border: '1px solid #E5E7EB',
        }}>
          <div
            style={{
              padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
              fontSize: 13, color: allSelected ? BRAND.accent : '#374151',
              fontWeight: allSelected ? 700 : 500,
              background: allSelected ? '#FEF2F2' : 'transparent',
              marginBottom: 4,
            }}
            onClick={() => { onChange(new Set()); setOpen(false); }}
          >
            全部成員
          </div>
          {members.map((m) => {
            const checked = selected.size === 0 || selected.has(m.id);
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 10px', borderRadius: 6,
                  cursor: 'pointer',
                  background: checked && selected.size > 0 ? '#FEF2F2' : 'transparent',
                }}
                onClick={() => toggle(m.id)}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  style={{ accentColor: BRAND.accent, width: 14, height: 14 }}
                />
                <Avatar member={m} size={22} />
                <span style={{ fontSize: 13, color: '#374151' }}>{m.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main WorkloadPage ────────────────────────────────────────────────────────
export default function WorkloadPage({ onNavigate }) {
  const { user } = useAuth();
  const companyId = user?.companyId;

  const [mode, setMode] = useState('week'); // 'week' | 'month' | 'custom'
  const [anchor, setAnchor] = useState(new Date());
  const [view, setView] = useState('gantt'); // 'gantt' | 'card'
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState(new Set());
  const [expandedMembers, setExpandedMembers] = useState(new Set());

  // Compute visible days
  const days = mode === 'week' ? getWeekDays(anchor) : getMonthDays(anchor);
  const rangeLabel = formatRangeLabel(days, mode);

  // Filter members
  const visibleMembers = selectedMembers.size === 0
    ? members
    : members.filter((m) => selectedMembers.has(m.id));

  // Load data
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const [membersRes, tasksRes] = await Promise.all([
          fetch(`/api/projects/users?companyId=${companyId}`),
          fetch(`/api/projects/tasks?companyId=${companyId}`),
        ]);

        if (!membersRes.ok || !tasksRes.ok) throw new Error('API error');

        const membersData = await membersRes.json();
        const tasksData = await tasksRes.json();

        if (!cancelled) {
          // members: { success, data: [...] }
          const memberList = Array.isArray(membersData)
            ? membersData
            : Array.isArray(membersData?.data)
              ? membersData.data
              : Array.isArray(membersData?.members)
                ? membersData.members
                : [];

          // tasks: { success, data: { tasks: [...] } } or { success, data: [...] }
          const rawTasks = Array.isArray(tasksData)
            ? tasksData
            : Array.isArray(tasksData?.data)
              ? tasksData.data
              : Array.isArray(tasksData?.data?.tasks)
                ? tasksData.data.tasks
                : Array.isArray(tasksData?.tasks)
                  ? tasksData.tasks
                  : [];

          // Normalize member shape: API uses avatarUrl, component expects avatar
          const normalizedMembers = memberList.map(m => ({
            ...m,
            avatar: m.avatar ?? m.avatarUrl ?? null,
            role: m.role || m.jobTitle || '',
          }));

          // Normalize task shape: API uses title + assignee obj, component expects name + assigneeId
          const normalizedTasks = rawTasks.map(t => ({
            ...t,
            name: t.name ?? t.title ?? '(無標題)',
            assigneeId: t.assigneeId ?? t.assignee?.id ?? null,
            startDate: t.startDate ?? (t.startedAt ? t.startedAt.split('T')[0] : null),
            dueDate: t.dueDate ? t.dueDate.split('T')[0] : null,
            estimatedHours: t.estimatedHours ?? 0,
            projectId: t.projectId ?? t.project?.id ?? null,
            project: t.project?.name ?? t.projectName ?? (typeof t.project === 'string' ? t.project : null) ?? '—',
            priority: t.priority ?? 'medium',
          }));

          setMembers(normalizedMembers);
          setTasks(normalizedTasks);
        }
      } catch {
        if (!cancelled) {
          const mockMembers = MOCK_MEMBERS;
          setMembers(mockMembers);
          setTasks(generateMockTasks(mockMembers));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [companyId]);

  const navigate = (dir) => {
    setAnchor((prev) => {
      if (mode === 'week') return addDays(prev, dir * 7);
      const d = new Date(prev);
      d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const toggleMember = useCallback((id) => {
    setExpandedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div style={{
      minHeight: '100vh', background: BRAND.pageBg,
      padding: '28px 32px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* ── Page Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16, marginBottom: 24,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#111' }}>
            工作負載
          </h1>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>{rangeLabel}</div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Mode buttons */}
          <div style={{
            display: 'flex', background: '#fff', borderRadius: 8,
            border: '1.5px solid #E5E7EB', overflow: 'hidden',
          }}>
            {['week', 'month'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: '7px 16px', border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: mode === m ? BRAND.accent : 'transparent',
                  color: mode === m ? '#fff' : '#6B7280',
                  transition: 'all 0.15s',
                }}
              >
                {m === 'week' ? '本週' : '本月'}
              </button>
            ))}
          </div>

          {/* Nav arrows */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => navigate(-1)}
              style={{
                width: 34, height: 34, borderRadius: 8,
                border: '1.5px solid #E5E7EB', background: '#fff',
                cursor: 'pointer', fontSize: 16, color: '#374151',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ‹
            </button>
            <button
              onClick={() => { setAnchor(new Date()); }}
              style={{
                padding: '0 12px', height: 34, borderRadius: 8,
                border: '1.5px solid #E5E7EB', background: '#fff',
                cursor: 'pointer', fontSize: 12, color: '#374151', fontWeight: 600,
              }}
            >
              今天
            </button>
            <button
              onClick={() => navigate(1)}
              style={{
                width: 34, height: 34, borderRadius: 8,
                border: '1.5px solid #E5E7EB', background: '#fff',
                cursor: 'pointer', fontSize: 16, color: '#374151',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ›
            </button>
          </div>

          {/* Member filter */}
          <MemberFilterDropdown
            members={members}
            selected={selectedMembers}
            onChange={setSelectedMembers}
          />

          {/* View toggle */}
          <div style={{
            display: 'flex', background: '#fff', borderRadius: 8,
            border: '1.5px solid #E5E7EB', overflow: 'hidden',
          }}>
            <button
              onClick={() => setView('gantt')}
              title="甘特式"
              style={{
                padding: '7px 14px', border: 'none', cursor: 'pointer',
                fontSize: 16,
                background: view === 'gantt' ? BRAND.accent : 'transparent',
                color: view === 'gantt' ? '#fff' : '#6B7280',
                transition: 'all 0.15s',
              }}
            >
              ▦
            </button>
            <button
              onClick={() => setView('card')}
              title="卡片式"
              style={{
                padding: '7px 14px', border: 'none', cursor: 'pointer',
                fontSize: 16,
                background: view === 'card' ? BRAND.accent : 'transparent',
                color: view === 'card' ? '#fff' : '#6B7280',
                transition: 'all 0.15s',
              }}
            >
              ⊞
            </button>
          </div>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 200, color: '#9CA3AF', fontSize: 15,
        }}>
          載入中…
        </div>
      ) : (
        <>
          {/* ── Summary Bar ── */}
          <SummaryBar members={members} tasks={tasks} />

          {/* ── Legend ── */}
          <div style={{
            display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: '#6B7280' }}>負載說明：</span>
            {[
              { label: '無任務', color: '#E5E7EB', text: '#6B7280' },
              { label: '1–3 任務', color: LOAD_COLOR.low, text: '#fff' },
              { label: '4–6 任務', color: LOAD_COLOR.mid, text: '#fff' },
              { label: '7+ 任務（過載）', color: LOAD_COLOR.high, text: '#fff' },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, background: item.color }} />
                <span style={{ fontSize: 12, color: '#6B7280' }}>{item.label}</span>
              </div>
            ))}
          </div>

          {/* ── Main View ── */}
          <div style={{
            background: '#fff', borderRadius: 16,
            boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
            overflow: 'hidden',
          }}>
            {view === 'gantt' ? (
              <GanttView
                members={visibleMembers}
                tasks={tasks}
                days={days}
                expandedMembers={expandedMembers}
                onToggleMember={toggleMember}
                onNavigate={onNavigate}
              />
            ) : (
              <div style={{ padding: 20 }}>
                <CardView members={visibleMembers} tasks={tasks} days={days} />
              </div>
            )}

            {visibleMembers.length === 0 && (
              <div style={{
                padding: 60, textAlign: 'center',
                color: '#9CA3AF', fontSize: 15,
              }}>
                沒有符合條件的成員
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
