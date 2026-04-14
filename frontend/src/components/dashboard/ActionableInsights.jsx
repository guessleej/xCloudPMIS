/**
 * ActionableInsights — 折線圖（月度趨勢）+ 洞察卡片 (#14)
 *
 * Props:
 *   insights      [{ type, title, body }]
 *   monthlyTrend  [{ month: 'YYYY-MM', completed: N, created: N }]
 *   loading       boolean
 */

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Area, AreaChart,
} from 'recharts';
import { useIsMobile } from '../../hooks/useResponsive';

const INSIGHT_STYLES = {
  success: { icon: '✅', bg: 'color-mix(in srgb, var(--xc-success) 10%, var(--xc-surface))', border: 'color-mix(in srgb, var(--xc-success) 30%, transparent)', color: 'var(--xc-success)' },
  warning: { icon: '⚠️', bg: 'color-mix(in srgb, #f59e0b 10%, var(--xc-surface))',          border: 'color-mix(in srgb, #f59e0b 30%, transparent)',          color: '#d97706' },
  danger:  { icon: '🚨', bg: 'color-mix(in srgb, var(--xc-danger) 10%, var(--xc-surface))', border: 'color-mix(in srgb, var(--xc-danger) 30%, transparent)', color: 'var(--xc-danger)' },
  info:    { icon: 'ℹ️', bg: 'color-mix(in srgb, var(--xc-info) 10%, var(--xc-surface))',   border: 'color-mix(in srgb, var(--xc-info) 30%, transparent)',   color: 'var(--xc-info)' },
};

function formatMonth(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  return monthNames[(parseInt(m, 10) - 1)] || ym;
}

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
      <div style={{ fontWeight: 600, color: 'var(--xc-text)', marginBottom: '6px' }}>
        {formatMonth(label)}
      </div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--xc-text-soft)' }}>
            <span style={{ width: '8px', height: '2px', background: entry.stroke, display: 'inline-block' }} />
            {entry.dataKey === 'completed' ? '已完成' : '新建立'}
          </span>
          <strong style={{ color: entry.stroke }}>{entry.value}</strong>
        </div>
      ))}
    </div>
  );
}

function SkeletonChart() {
  return (
    <div>
      <div style={{ width: '100%', height: '140px', borderRadius: '8px',
        background: 'var(--xc-surface-strong)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
        {[0,1].map(i => (
          <div key={i} style={{ height: '48px', borderRadius: '8px',
            background: 'var(--xc-surface-strong)' }} />
        ))}
      </div>
    </div>
  );
}

export default function ActionableInsights({ insights = [], monthlyTrend = [], loading }) {
  if (loading) return <SkeletonChart />;

  // 格式化月度趨勢資料
  const trendData = monthlyTrend.map(d => ({
    month:     d.month,
    completed: d.completed || 0,
    created:   d.created || 0,
  }));

  const hasData = trendData.some(d => d.completed > 0 || d.created > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 折線圖：月度趨勢 */}
      {hasData ? (
        <div>
          <div style={{ fontSize: '14px', color: 'var(--xc-text-muted)', marginBottom: '8px' }}>
            過去 6 個月任務趨勢
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="completedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}   />
                </linearGradient>
                <linearGradient id="createdGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--xc-border)" vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonth}
                tick={{ fontSize: 12, fill: 'var(--xc-text-muted)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: 'var(--xc-text-muted)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                iconType="circle"
                iconSize={6}
                formatter={(v) => (
                  <span style={{ fontSize: '13px', color: 'var(--xc-text-soft)' }}>
                    {v === 'completed' ? '已完成' : '新建立'}
                  </span>
                )}
              />
              <Area
                type="monotone"
                dataKey="created"
                stroke="#3b82f6"
                strokeWidth={1.5}
                fill="url(#createdGradient)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Area
                type="monotone"
                dataKey="completed"
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#completedGradient)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--xc-text-muted)', fontSize: '14px',
          background: 'var(--xc-surface-soft)', borderRadius: '8px' }}>
          尚無月度趨勢資料
        </div>
      )}

      {/* 洞察卡片 */}
      {insights.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '12px', color: 'var(--xc-text-muted)', fontSize: '14px',
          background: 'var(--xc-surface-soft)', borderRadius: '8px' }}>
          目前無特別提醒 🎉
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {insights.slice(0, 4).map((item, i) => {
            const style = INSIGHT_STYLES[item.type] || INSIGHT_STYLES.info;
            return (
              <div key={i} style={{
                display:      'flex',
                gap:          '10px',
                padding:      '10px 12px',
                borderRadius: '8px',
                background:   style.bg,
                border:       `1px solid ${style.border}`,
              }}>
                <span style={{ fontSize: '17px', flexShrink: 0 }}>{style.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: style.color, marginBottom: '2px' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--xc-text-soft)', lineHeight: 1.5 }}>
                    {item.body}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
