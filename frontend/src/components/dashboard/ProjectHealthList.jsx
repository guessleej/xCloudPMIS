/**
 * ProjectHealthList — 水平堆疊長條圖 (#12)
 *
 * 顯示每個專案的任務狀態分布（todo / in_progress / review / done）
 *
 * Props:
 *   projects  [{ id, name, taskCounts, totalTasks, completionRate, health_status }]
 *   loading   boolean
 */

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
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

const HEALTH_COLORS = {
  green:  '#22c55e',
  yellow: '#f59e0b',
  red:    '#ef4444',
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
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
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: entry.fill, display: 'inline-block' }} />
            {STATUS_LABELS[entry.dataKey] || entry.dataKey}
          </span>
          <strong style={{ color: 'var(--xc-text)' }}>{entry.value}</strong>
        </div>
      ))}
    </div>
  );
}

function SkeletonBar() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {[0,1,2,3].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '80px', height: '12px', borderRadius: '4px', background: 'var(--xc-surface-strong)', flexShrink: 0 }} />
          <div style={{ flex: 1, height: '20px', borderRadius: '4px', background: 'var(--xc-surface-strong)' }} />
        </div>
      ))}
    </div>
  );
}

export default function ProjectHealthList({ projects = [], loading }) {
  if (loading) return <SkeletonBar />;

  if (projects.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--xc-text-muted)', fontSize: '15px' }}>
        尚無專案資料
      </div>
    );
  }

  // 整理為 Recharts 需要的格式（最多顯示 8 個專案）
  const chartData = projects
    .filter(p => p.totalTasks > 0)
    .slice(0, 8)
    .map(p => ({
      name:        p.name.length > 10 ? p.name.slice(0, 10) + '…' : p.name,
      fullName:    p.name,
      todo:        p.taskCounts?.todo || 0,
      in_progress: p.taskCounts?.in_progress || 0,
      review:      p.taskCounts?.review || 0,
      done:        p.taskCounts?.done || 0,
      health:      p.health_status || 'green',
    }));

  if (chartData.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--xc-text-muted)', fontSize: '15px' }}>
        所有專案皆無任務
      </div>
    );
  }

  const chartHeight = Math.max(180, chartData.length * 44);

  return (
    <div>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 12, left: 4, bottom: 0 }}
          barSize={16}
        >
          <CartesianGrid horizontal={false} stroke="var(--xc-border)" strokeDasharray="3 3" />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fontSize: 13, fill: 'var(--xc-text-muted)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={88}
            tick={({ x, y, payload }) => {
              const item = chartData.find(d => d.name === payload.value);
              const color = HEALTH_COLORS[item?.health] || '#22c55e';
              return (
                <g transform={`translate(${x},${y})`}>
                  <circle cx={-8} cy={0} r={4} fill={color} />
                  <text x={-18} y={0} dy="0.35em" textAnchor="end"
                    fontSize={11} fill="var(--xc-text-soft)">
                    {payload.value}
                  </text>
                </g>
              );
            }}
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
          <Bar dataKey="done"        stackId="a" fill={STATUS_COLORS.done}        radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
