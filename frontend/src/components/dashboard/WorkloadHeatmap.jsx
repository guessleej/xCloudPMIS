/**
 * WorkloadHeatmap — 分組垂直長條圖 (#12)
 *
 * 顯示每位成員的任務分布
 *
 * Props:
 *   workload  { users: [{ userId, name, totalTasks, taskCounts, overdueTasks }] }
 *   loading   boolean
 */

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { useIsMobile } from '../../hooks/useResponsive';

const STATUS_COLORS = {
  todo:        '#94a3b8',
  in_progress: '#3b82f6',
  review:      '#a78bfa',
  done:        '#22c55e',
};

const STATUS_LABELS = {
  todo:        '待辦',
  in_progress: '進行中',
  review:      '審核中',
  done:        '已完成',
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div style={{
      background:   'var(--xc-surface)',
      border:       '1px solid var(--xc-border)',
      borderRadius: '8px',
      padding:      '10px 14px',
      boxShadow:    '0 4px 12px rgba(0,0,0,.12)',
      fontSize: '14px',
      minWidth:     '140px',
    }}>
      <div style={{ fontWeight: 600, color: 'var(--xc-text)', marginBottom: '6px', fontSize: '15px' }}>
        {label}
      </div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: 'var(--xc-text-soft)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px',
              background: entry.fill, display: 'inline-block' }} />
            {STATUS_LABELS[entry.dataKey] || entry.dataKey}
          </span>
          <strong style={{ color: 'var(--xc-text)' }}>{entry.value}</strong>
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--xc-border)', marginTop: '6px', paddingTop: '6px',
        display: 'flex', justifyContent: 'space-between', color: 'var(--xc-text-soft)' }}>
        <span>合計</span>
        <strong style={{ color: 'var(--xc-text)' }}>{total}</strong>
      </div>
    </div>
  );
}

function SkeletonBars() {
  return (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', height: '160px' }}>
      {[80,120,60,140,100,90].map((h, i) => (
        <div key={i} style={{ flex: 1, height: `${h}px`, borderRadius: '6px 6px 0 0',
          background: 'var(--xc-surface-strong)' }} />
      ))}
    </div>
  );
}

export default function WorkloadHeatmap({ workload, loading }) {
  if (loading) return <SkeletonBars />;

  const users = Array.isArray(workload?.users) ? workload.users
    : Array.isArray(workload) ? workload : [];

  if (users.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--xc-text-muted)', fontSize: '15px' }}>
        尚無成員工作負載資料
      </div>
    );
  }

  const chartData = users.slice(0, 10).map(u => ({
    name:        u.name?.split(' ')[0] || `成員`,
    fullName:    u.name || '未知',
    todo:        u.taskCounts?.todo || 0,
    in_progress: u.taskCounts?.in_progress || 0,
    review:      u.taskCounts?.review || 0,
    done:        u.taskCounts?.done || 0,
    overdue:     u.overdueTasks || 0,
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barSize={14}>
          <CartesianGrid vertical={false} stroke="var(--xc-border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 13, fill: 'var(--xc-text-soft)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 13, fill: 'var(--xc-text-muted)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--xc-surface-strong)', opacity: 0.5 }} />
          <Legend
            iconType="square"
            iconSize={8}
            formatter={(v) => <span style={{ fontSize: '13px', color: 'var(--xc-text-soft)' }}>{STATUS_LABELS[v] || v}</span>}
          />
          <Bar dataKey="todo"        stackId="a" fill={STATUS_COLORS.todo}        radius={0} />
          <Bar dataKey="in_progress" stackId="a" fill={STATUS_COLORS.in_progress} radius={0} />
          <Bar dataKey="review"      stackId="a" fill={STATUS_COLORS.review}      radius={0} />
          <Bar dataKey="done"        stackId="a" fill={STATUS_COLORS.done}        radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* 逾期預警列表 */}
      {users.some(u => u.overdueTasks > 0) && (
        <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {users.filter(u => u.overdueTasks > 0).map(u => (
            <div key={u.userId} style={{
              display:      'flex',
              alignItems:   'center',
              gap:          '4px',
              padding:      '3px 8px',
              borderRadius: '20px',
              background:   'color-mix(in srgb, var(--xc-danger) 12%, var(--xc-surface))',
              border:       '1px solid color-mix(in srgb, var(--xc-danger) 30%, transparent)',
              fontSize: '13px',
              color:        'var(--xc-danger)',
            }}>
              ⚠️ {u.name} · {u.overdueTasks} 逾期
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
