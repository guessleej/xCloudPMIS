/**
 * UpcomingDeadlines — 即將截止面板 (#27)
 *
 * 以「時間分組」呈現未來 N 天內即將到期的任務
 *   今天 / 3天內 / 本週 / 稍後
 *
 * 每項任務顯示：截止倒數、優先度、專案名、負責人
 * 並附帶小型「截止分佈」橫條統計
 *
 * Props:
 *   upcoming  [{ id, title, priority, dueDate, daysLeft, urgencyGroup, projectName, assignee }]
 *   loading   boolean
 */

import { useState } from 'react';
import { useIsMobile } from '../../hooks/useResponsive';

// ── 時間分組設定 ───────────────────────────────────────────
const GROUP_CFG = {
  today:      { label: '今天截止', icon: '🔴', color: '#ef4444', bg: 'rgba(239,68,68,.08)',  border: 'rgba(239,68,68,.25)'  },
  three_days: { label: '3 天內',   icon: '🟠', color: '#f97316', bg: 'rgba(249,115,22,.08)', border: 'rgba(249,115,22,.25)' },
  this_week:  { label: '本週內',   icon: '🟡', color: '#eab308', bg: 'rgba(234,179,8,.08)',  border: 'rgba(234,179,8,.25)'  },
  later:      { label: '稍後',     icon: '🟢', color: '#22c55e', bg: 'rgba(34,197,94,.08)',  border: 'rgba(34,197,94,.25)'  },
};

const GROUP_ORDER = ['today', 'three_days', 'this_week', 'later'];

const PRIORITY_COLOR = {
  urgent: '#ef4444',
  high:   '#f97316',
  medium: '#eab308',
  low:    '#94a3b8',
};

const PRIORITY_LABEL = { urgent: '緊急', high: '高', medium: '中', low: '低' };
const STATUS_LABEL   = { todo: '待辦', in_progress: '進行中', review: '審核中' };

// ── 倒數徽章 ─────────────────────────────────────────────
function CountdownBadge({ daysLeft, urgencyGroup }) {
  const cfg = GROUP_CFG[urgencyGroup] || GROUP_CFG.later;
  const text = daysLeft === 0 ? '今天！' : `${daysLeft} 天`;
  return (
    <div style={{
      display:      'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center',
      width:        '44px', height: '44px', borderRadius: '10px', flexShrink: 0,
      background:   cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      <span style={{ fontSize: daysLeft === 0 ? '9px' : '14px', fontWeight: 800, color: cfg.color, lineHeight: 1 }}>
        {daysLeft === 0 ? '今天' : daysLeft}
      </span>
      {daysLeft !== 0 && (
        <span style={{ fontSize: '11px', color: cfg.color, opacity: 0.7, lineHeight: 1, marginTop: '1px' }}>天後</span>
      )}
    </div>
  );
}

// ── 迷你進度條（顯示任務各分組比例）──────────────────────
function DistributionBar({ upcoming }) {
  const total = upcoming.length;
  if (total === 0) return null;
  const counts = {};
  for (const g of GROUP_ORDER) counts[g] = upcoming.filter(t => t.urgencyGroup === g).length;

  return (
    <div>
      <div style={{ display: 'flex', gap: '2px', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
        {GROUP_ORDER.map(g => {
          const pct = (counts[g] / total) * 100;
          if (pct === 0) return null;
          return (
            <div key={g} style={{ width: `${pct}%`, background: GROUP_CFG[g].color, transition: 'width .4s' }} />
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '10px', marginTop: '5px', flexWrap: 'wrap' }}>
        {GROUP_ORDER.map(g => counts[g] > 0 && (
          <span key={g} style={{ fontSize: '12px', color: 'var(--xc-text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '2px', background: GROUP_CFG[g].color, display: 'inline-block' }} />
            {GROUP_CFG[g].label} {counts[g]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── 任務行 ────────────────────────────────────────────────
function TaskRow({ task }) {
  const [hovered, setHovered] = useState(false);

  const formatDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '9px 10px', borderRadius: '8px',
        background: hovered ? 'var(--xc-surface-strong)' : 'transparent',
        transition: 'background 0.12s ease', cursor: 'default',
      }}
    >
      {/* 倒數方塊 */}
      <CountdownBadge daysLeft={task.daysLeft} urgencyGroup={task.urgencyGroup} />

      {/* 主體 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
          {/* 優先度小點 */}
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
            background: PRIORITY_COLOR[task.priority] || '#94a3b8',
          }} />
          <span style={{
            fontSize: '15px', fontWeight: 600, color: 'var(--xc-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {task.title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--xc-text-muted)' }}>
          <span>📁 {task.projectName}</span>
          {task.assignee && <span>👤 {task.assignee.name}</span>}
          <span style={{ color: 'var(--xc-text-muted)', opacity: 0.7 }}>
            {STATUS_LABEL[task.status] || task.status}
          </span>
        </div>
      </div>

      {/* 截止日期 + 優先度標籤 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', flexShrink: 0 }}>
        <span style={{
          fontSize: '13px', fontWeight: 600, color: 'var(--xc-text-soft)',
        }}>
          {formatDate(task.dueDate)}
        </span>
        <span style={{
          fontSize: '12px', padding: '1px 5px', borderRadius: '4px',
          background: `${PRIORITY_COLOR[task.priority]}18`,
          color: PRIORITY_COLOR[task.priority],
          fontWeight: 700,
        }}>
          {PRIORITY_LABEL[task.priority] || '中'}
        </span>
      </div>
    </div>
  );
}

// ── 分組區塊 ─────────────────────────────────────────────
function GroupSection({ groupKey, tasks }) {
  const cfg = GROUP_CFG[groupKey];
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{
      borderRadius: '10px',
      border: `1px solid ${cfg.border}`,
      background: cfg.bg,
      overflow: 'hidden',
    }}>
      {/* 群組標頭 */}
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
          padding: '9px 12px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '15px' }}>{cfg.icon}</span>
        <span style={{ flex: 1, fontSize: '14px', fontWeight: 700, color: cfg.color }}>
          {cfg.label}
        </span>
        <span style={{
          fontSize: '13px', fontWeight: 700, padding: '2px 8px',
          borderRadius: '10px', background: cfg.color + '22', color: cfg.color,
        }}>
          {tasks.length}
        </span>
        <span style={{ fontSize: '13px', color: cfg.color, opacity: 0.6 }}>
          {collapsed ? '▸' : '▾'}
        </span>
      </button>

      {/* 任務列表 */}
      {!collapsed && (
        <div style={{ borderTop: `1px solid ${cfg.border}`, padding: '4px 2px' }}>
          {tasks.map(t => <TaskRow key={t.id} task={t} />)}
        </div>
      )}
    </div>
  );
}

// ── 空白佔位 ─────────────────────────────────────────────
function SkeletonUpcoming() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ height: '10px', width: '100%', borderRadius: '4px', background: 'var(--xc-surface-strong)' }} />
      {[0,1,2,3].map(i => (
        <div key={i} style={{ display: 'flex', gap: '10px', padding: '10px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'var(--xc-surface-strong)', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ height: '13px', width: '60%', borderRadius: '4px', background: 'var(--xc-surface-strong)' }} />
            <div style={{ height: '11px', width: '40%', borderRadius: '4px', background: 'var(--xc-surface-strong)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 主元件 ────────────────────────────────────────────────
export default function UpcomingDeadlines({ upcoming = [], loading }) {
  if (loading) return <SkeletonUpcoming />;

  if (upcoming.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '32px 16px',
        color: 'var(--xc-text-muted)', fontSize: '15px',
        background: 'var(--xc-surface-soft)', borderRadius: '10px',
      }}>
        <div style={{ fontSize: '30px', marginBottom: '8px' }}>📅</div>
        未來 14 天內沒有即將截止的任務
      </div>
    );
  }

  // 依分組整理
  const groups = {};
  for (const g of GROUP_ORDER) {
    const tasks = upcoming.filter(t => t.urgencyGroup === g);
    if (tasks.length > 0) groups[g] = tasks;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* 分佈橫條 */}
      <DistributionBar upcoming={upcoming} />

      {/* 分組清單 */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '8px',
        maxHeight: '380px', overflowY: 'auto',
        paddingRight: '2px',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--xc-border) transparent',
      }}>
        {GROUP_ORDER.filter(g => groups[g]).map(g => (
          <GroupSection key={g} groupKey={g} tasks={groups[g]} />
        ))}
      </div>

      {/* 總數摘要 */}
      <div style={{
        fontSize: '13px', color: 'var(--xc-text-muted)', textAlign: 'right',
        borderTop: '1px solid var(--xc-border)', paddingTop: '8px',
      }}>
        共 {upcoming.length} 個任務在未來 14 天內截止
      </div>
    </div>
  );
}
