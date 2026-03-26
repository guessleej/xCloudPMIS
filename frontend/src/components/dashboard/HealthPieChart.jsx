/**
 * HealthPieChart — 環形圖 + 清單 (#13)
 *
 * 顯示專案健康狀態分布（綠/黃/紅）
 *
 * Props:
 *   projects  [{ health_status: 'green'|'yellow'|'red', name, completionRate }]
 *   loading   boolean
 */

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const STATUS_CONFIG = {
  green:  { label: '健康',   color: '#22c55e', darkColor: '#16a34a' },
  yellow: { label: '待關注', color: '#f59e0b', darkColor: '#d97706' },
  red:    { label: '高風險', color: '#ef4444', darkColor: '#dc2626' },
};

const RADIAN = Math.PI / 180;

function CustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.06) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
      fontSize={12} fontWeight={600}>
      {Math.round(percent * 100)}%
    </text>
  );
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value, color } = payload[0].payload;
  return (
    <div style={{
      background:   'var(--xc-surface)',
      border:       '1px solid var(--xc-border)',
      borderRadius: '8px',
      padding:      '8px 12px',
      boxShadow:    '0 4px 12px rgba(0,0,0,.12)',
      fontSize:     '13px',
      color:        'var(--xc-text)',
    }}>
      <span style={{ display: 'inline-block', width: '10px', height: '10px',
        borderRadius: '50%', background: color, marginRight: '6px' }} />
      <strong>{name}</strong>：{value} 個專案
    </div>
  );
}

function SkeletonDonut() {
  return (
    <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
      <div style={{ width: '160px', height: '160px', borderRadius: '50%',
        background: 'var(--xc-surface-strong)', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%',
              background: 'var(--xc-surface-strong)' }} />
            <div style={{ flex: 1, height: '14px', borderRadius: '4px',
              background: 'var(--xc-surface-strong)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HealthPieChart({ projects = [], loading }) {
  if (loading) return <SkeletonDonut />;

  // 統計各健康狀態數量
  const counts = { green: 0, yellow: 0, red: 0 };
  for (const p of projects) {
    const h = p.health_status || 'green';
    counts[h] = (counts[h] || 0) + 1;
  }

  const total   = projects.length;
  const pieData = Object.entries(STATUS_CONFIG)
    .map(([key, cfg]) => ({
      name:  cfg.label,
      value: counts[key] || 0,
      color: cfg.color,
      key,
    }))
    .filter(d => d.value > 0);

  if (total === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--xc-text-muted)', fontSize: '13px' }}>
        尚無專案資料
      </div>
    );
  }

  // 按健康狀態排序的清單
  const sortedProjects = [...projects].sort((a, b) => {
    const order = { red: 0, yellow: 1, green: 2 };
    return (order[a.health_status] ?? 3) - (order[b.health_status] ?? 3);
  });

  return (
    <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
      {/* 環形圖 */}
      <div style={{ width: 160, height: 160, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={46}
              outerRadius={72}
              paddingAngle={2}
              dataKey="value"
              labelLine={false}
              label={CustomLabel}
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* 右側：圖例 + 清單 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 圖例 */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%',
                background: cfg.color, display: 'inline-block' }} />
              <span style={{ color: 'var(--xc-text-soft)' }}>
                {cfg.label} <strong style={{ color: cfg.color }}>{counts[key]}</strong>
              </span>
            </div>
          ))}
        </div>

        {/* 專案清單（最多 6 條） */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {sortedProjects.slice(0, 6).map((p) => {
            const cfg  = STATUS_CONFIG[p.health_status] || STATUS_CONFIG.green;
            return (
              <div key={p.id} style={{
                display:       'flex',
                alignItems:    'center',
                gap:           '8px',
                padding:       '5px 8px',
                borderRadius:  '6px',
                background:    'var(--xc-surface-soft)',
                fontSize:      '12px',
              }}>
                <span style={{
                  width:        '8px',
                  height:       '8px',
                  borderRadius: '50%',
                  background:   cfg.color,
                  flexShrink:   0,
                }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', color: 'var(--xc-text)' }}>
                  {p.name}
                </span>
                <span style={{ color: 'var(--xc-text-muted)', flexShrink: 0 }}>
                  {p.completionRate ?? 0}%
                </span>
              </div>
            );
          })}
          {sortedProjects.length > 6 && (
            <div style={{ fontSize: '11px', color: 'var(--xc-text-muted)', paddingLeft: '16px' }}>
              還有 {sortedProjects.length - 6} 個專案…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
