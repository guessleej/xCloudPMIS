/**
 * OverdueTasksChart — 逾期任務圖 (#26)
 *
 * 上半部：依優先度分組的水平長條圖（urgent/high/medium/low）
 * 下半部：逾期任務明細捲動清單，每項顯示逾期天數、優先度、專案、負責人
 *
 * Props:
 *   overdue          [{ id, title, priority, dueDate, daysOverdue, projectName, assignee }]
 *   overdueByPriority [{ priority, count }]
 *   loading          boolean
 *   onMarkDone       (taskId) => void  （選填，快速完成回呼）
 */

import { useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { useIsMobile } from '../../hooks/useResponsive';

// ── 常數 ─────────────────────────────────────────────────────
const PRIORITY_CFG = {
  urgent: { label: '緊急', color: '#ef4444', bg: 'rgba(239,68,68,.10)', textColor: '#dc2626' },
  high:   { label: '高',   color: '#f97316', bg: 'rgba(249,115,22,.10)', textColor: '#ea580c' },
  medium: { label: '中',   color: '#eab308', bg: 'rgba(234,179,8,.10)',  textColor: '#ca8a04' },
  low:    { label: '低',   color: '#94a3b8', bg: 'rgba(148,163,184,.10)', textColor: '#64748b' },
};

const STATUS_LABEL = { todo: '待辦', in_progress: '進行中', review: '審核中' };

function OverdueBadge({ days }) {
  const severity = days >= 14 ? 'critical' : days >= 7 ? 'high' : days >= 3 ? 'medium' : 'low';
  const colors = {
    critical: { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' },
    high:     { bg: '#fff7ed', text: '#c2410c', border: '#fdba74' },
    medium:   { bg: '#fffbeb', text: '#b45309', border: '#fcd34d' },
    low:      { bg: '#f8fafc', text: '#64748b', border: '#cbd5e1' },
  };
  const c = colors[severity];
  return (
    <span style={{
      display:      'inline-flex', alignItems: 'center', gap: '2px',
      padding:      '2px 7px', borderRadius: '10px',
      background:   c.bg, border: `1px solid ${c.border}`,
      color:        c.text, fontSize: '13px', fontWeight: 600,
      flexShrink:   0, whiteSpace: 'nowrap',
    }}>
      ⏰ 逾 {days} 天
    </span>
  );
}

function PriorityChip({ priority }) {
  const cfg = PRIORITY_CFG[priority] || PRIORITY_CFG.medium;
  return (
    <span style={{
      display:      'inline-block', padding: '1px 6px',
      borderRadius: '4px', fontSize: '12px', fontWeight: 700,
      background:   cfg.bg, color: cfg.textColor,
      flexShrink:   0,
    }}>
      {cfg.label}
    </span>
  );
}

function AvatarBubble({ name, url, size = 20 }) {
  const initials = (name || '?').slice(0, 1).toUpperCase();
  return url ? (
    <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: 'color-mix(in srgb, var(--xc-brand) 82%, #000000 18%)', color: '#ffffff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.5, fontWeight: 700, flexShrink: 0,
    }}>
      {initials}
    </span>
  );
}

function CustomBarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { priority, count } = payload[0].payload;
  const cfg = PRIORITY_CFG[priority] || PRIORITY_CFG.medium;
  return (
    <div style={{
      background: 'var(--xc-surface)', border: '1px solid var(--xc-border)',
      borderRadius: '8px', padding: '8px 12px', fontSize: '14px',
      boxShadow: '0 4px 12px rgba(0,0,0,.12)',
    }}>
      <span style={{ fontWeight: 600, color: cfg.color }}>{cfg.label}優先度</span>
      <span style={{ color: 'var(--xc-text-soft)' }}> · {count} 個逾期</span>
    </div>
  );
}

function SkeletonOverdue() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ height: '80px', borderRadius: '8px', background: 'var(--xc-surface-strong)' }} />
      {[0,1,2].map(i => (
        <div key={i} style={{ height: '52px', borderRadius: '8px', background: 'var(--xc-surface-strong)' }} />
      ))}
    </div>
  );
}

export default function OverdueTasksChart({ overdue = [], overdueByPriority = [], loading, onMarkDone }) {
  const [hovered, setHovered] = useState(null);

  const handleMarkDone = useCallback(async (taskId) => {
    if (!onMarkDone) return;
    onMarkDone(taskId);
  }, [onMarkDone]);

  if (loading) return <SkeletonOverdue />;

  // 圖表資料只顯示有逾期任務的優先度
  const chartData = overdueByPriority.filter(d => d.count > 0);

  const totalOverdue = overdue.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* 總覽數字 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{
          fontSize: '30px', fontWeight: 800, lineHeight: 1,
          color: totalOverdue > 0 ? '#ef4444' : 'var(--xc-success)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {totalOverdue}
        </span>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--xc-text)' }}>
            {totalOverdue === 0 ? '無逾期任務 🎉' : '個任務逾期中'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--xc-text-muted)' }}>
            {totalOverdue > 0 ? '需要優先處理，避免影響專案進度' : '所有任務均在截止日期內'}
          </div>
        </div>
      </div>

      {/* 優先度分組長條圖 */}
      {chartData.length > 0 && (
        <div style={{ background: 'var(--xc-surface-soft)', borderRadius: '8px', padding: '12px 12px 4px' }}>
          <div style={{ fontSize: '13px', color: 'var(--xc-text-muted)', marginBottom: '8px' }}>
            依優先度分組
          </div>
          <ResponsiveContainer width="100%" height={Math.max(60, chartData.length * 32)}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 32, left: 0, bottom: 0 }}
              barSize={14}
            >
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="priority"
                width={30}
                tickFormatter={p => PRIORITY_CFG[p]?.label || p}
                tick={{ fontSize: 13, fill: 'var(--xc-text-soft)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'transparent' }} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={PRIORITY_CFG[entry.priority]?.color || '#94a3b8'} />
                ))}
                <LabelList dataKey="count" position="right"
                  style={{ fontSize: 13, fill: 'var(--xc-text-soft)', fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 逾期清單 */}
      {totalOverdue === 0 ? (
        <div style={{
          textAlign: 'center', padding: '24px', borderRadius: '10px',
          background: 'color-mix(in srgb, var(--xc-success) 8%, var(--xc-surface))',
          border: '1px solid color-mix(in srgb, var(--xc-success) 20%, transparent)',
          color: 'var(--xc-success)', fontSize: '15px',
        }}>
          ✅ 沒有逾期任務，進度控制良好！
        </div>
      ) : (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '6px',
          maxHeight: '320px', overflowY: 'auto',
          paddingRight: '2px',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--xc-border) transparent',
        }}>
          {overdue.map((task) => (
            <div
              key={task.id}
              onMouseEnter={() => setHovered(task.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '10px 12px', borderRadius: '8px',
                background: hovered === task.id ? 'var(--xc-surface-strong)' : 'var(--xc-surface-soft)',
                border: `1px solid ${hovered === task.id ? 'var(--xc-border-strong)' : 'var(--xc-border)'}`,
                transition: 'all 0.15s ease',
                cursor: 'default',
              }}
            >
              {/* 優先度色條 */}
              <div style={{
                width: '3px', minHeight: '36px', borderRadius: '2px', flexShrink: 0,
                background: PRIORITY_CFG[task.priority]?.color || '#94a3b8',
                alignSelf: 'stretch',
              }} />

              {/* 主要內容 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <span style={{
                    fontSize: '15px', fontWeight: 600, color: 'var(--xc-text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: '200px',
                  }}>
                    {task.title}
                  </span>
                  <PriorityChip priority={task.priority} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', color: 'var(--xc-text-muted)' }}>
                    📁 {task.projectName}
                  </span>
                  {task.assignee && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--xc-text-muted)' }}>
                      <AvatarBubble name={task.assignee.name} url={task.assignee.avatarUrl} size={14} />
                      {task.assignee.name}
                    </span>
                  )}
                  <span style={{ fontSize: '13px', color: 'var(--xc-text-muted)' }}>
                    {STATUS_LABEL[task.status] || task.status}
                  </span>
                </div>
              </div>

              {/* 右側：逾期天數 + 快速操作 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px', flexShrink: 0 }}>
                <OverdueBadge days={task.daysOverdue} />
                {onMarkDone && hovered === task.id && (
                  <button
                    onClick={() => handleMarkDone(task.id)}
                    style={{
                      padding: '3px 8px', borderRadius: '5px', border: 'none',
                      background: 'var(--xc-success)', color: '#fff',
                      fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    ✓ 完成
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
