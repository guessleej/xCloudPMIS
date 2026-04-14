/**
 * SummaryCards — KPI 數字卡 (#15)
 *
 * Props:
 *   summary  { totalTasks, completedTasks, overdueTasks, activeProjects,
 *              totalMembers, completionRate }
 *   loading  boolean
 */

const KPI_DEFS = [
  {
    key:     'completionRate',
    label:   '整體完成率',
    unit:    '%',
    icon:    '✅',
    tone:    'success',
    hint:    (v) => v >= 80 ? '表現優異' : v >= 50 ? '穩定進行中' : '需要加油',
  },
  {
    key:     'activeProjects',
    label:   '進行中專案',
    unit:    '個',
    icon:    '🏗️',
    tone:    'brand',
    hint:    (v) => `${v} 個專案正在執行`,
  },
  {
    key:     'overdueTasks',
    label:   '逾期任務',
    unit:    '項',
    icon:    '⚠️',
    tone:    'danger',
    hint:    (v) => v === 0 ? '無逾期，控制良好' : '需要優先處理',
  },
  {
    key:     'totalMembers',
    label:   '團隊成員',
    unit:    '人',
    icon:    '👥',
    tone:    'info',
    hint:    (v) => `${v} 位成員協作中`,
  },
];

const TONE_COLORS = {
  success: { bg: 'color-mix(in srgb, var(--xc-success) 12%, var(--xc-surface))', accent: 'var(--xc-success)', text: 'var(--xc-success-dark, #15803d)' },
  brand:   { bg: 'color-mix(in srgb, var(--xc-brand)   12%, var(--xc-surface))', accent: 'var(--xc-brand)',   text: 'var(--xc-brand-dark)' },
  danger:  { bg: 'color-mix(in srgb, var(--xc-danger)  12%, var(--xc-surface))', accent: 'var(--xc-danger)',  text: 'var(--xc-danger-dark, #b91c1c)' },
  info:    { bg: 'color-mix(in srgb, var(--xc-info)    12%, var(--xc-surface))', accent: 'var(--xc-info)',    text: 'var(--xc-info-dark, #1d4ed8)' },
};

function SkeletonCard() {
  return (
    <div style={{
      background:    'var(--xc-surface)',
      border:        '1px solid var(--xc-border)',
      borderRadius:  '12px',
      padding:       '20px 24px',
      display:       'flex',
      flexDirection: 'column',
      gap:           '12px',
      animation:     'pulse 1.5s ease-in-out infinite',
    }}>
      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--xc-surface-strong)' }} />
      <div style={{ width: '60%', height: '14px', borderRadius: '6px', background: 'var(--xc-surface-strong)' }} />
      <div style={{ width: '40%', height: '28px', borderRadius: '6px', background: 'var(--xc-surface-strong)' }} />
    </div>
  );
}

export default function SummaryCards({ summary, loading }) {
  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {KPI_DEFS.map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap:                 '16px',
    }}>
      {KPI_DEFS.map((kpi) => {
        const value   = summary?.[kpi.key] ?? 0;
        const colors  = TONE_COLORS[kpi.tone] || TONE_COLORS.brand;
        const hintTxt = kpi.hint(value);

        return (
          <div
            key={kpi.key}
            style={{
              background:    colors.bg,
              border:        `1px solid color-mix(in srgb, ${colors.accent} 25%, var(--xc-border))`,
              borderRadius:  '12px',
              padding:       '20px 24px',
              display:       'flex',
              flexDirection: 'column',
              gap:           '8px',
              position:      'relative',
              overflow:      'hidden',
            }}
          >
            {/* 裝飾圓 */}
            <div style={{
              position:     'absolute',
              top:          '-20px',
              right:        '-20px',
              width:        '80px',
              height:       '80px',
              borderRadius: '50%',
              background:   `color-mix(in srgb, ${colors.accent} 12%, transparent)`,
            }} />

            {/* Icon */}
            <div style={{ fontSize: '24px', lineHeight: 1 }}>{kpi.icon}</div>

            {/* Label */}
            <div style={{
              fontSize: '14px',
              fontWeight: 600,
              color:      'var(--xc-text-soft)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              {kpi.label}
            </div>

            {/* Value */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{
                fontSize: '34px',
                fontWeight: 700,
                color:      colors.text,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {value.toLocaleString()}
              </span>
              <span style={{ fontSize: '16px', color: colors.text, opacity: 0.7 }}>
                {kpi.unit}
              </span>
            </div>

            {/* Hint */}
            <div style={{ fontSize: '13px', color: 'var(--xc-text-muted)', marginTop: '2px' }}>
              {hintTxt}
            </div>

            {/* 完成率進度條 */}
            {kpi.key === 'completionRate' && (
              <div style={{
                height:       '4px',
                borderRadius: '2px',
                background:   'var(--xc-surface-strong)',
                marginTop:    '4px',
                overflow:     'hidden',
              }}>
                <div style={{
                  height:       '100%',
                  width:        `${Math.min(value, 100)}%`,
                  borderRadius: '2px',
                  background:   colors.accent,
                  transition:   'width 0.6s ease',
                }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
