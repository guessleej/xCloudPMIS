/**
 * ProjectHealthList — 專案健康狀態列表
 * 顯示每個專案的：燈號、進度條、截止日、預算使用率
 */

const STATUS_BADGE = {
  active:    { label: '進行中', bg: '#dcfce7', color: '#16a34a' },
  planning:  { label: '規劃中', bg: '#dbeafe', color: '#1d4ed8' },
  on_hold:   { label: '暫停中', bg: '#fef9c3', color: '#854d0e' },
  completed: { label: '已完成', bg: '#f3f4f6', color: '#6b7280' },
  cancelled: { label: '已取消', bg: '#fee2e2', color: '#dc2626' },
};

const HEALTH_DOT = {
  red:    { dot: '🔴', bg: '#fef2f2', border: '#fca5a5' },
  yellow: { dot: '🟡', bg: '#fffbeb', border: '#fcd34d' },
  green:  { dot: '🟢', bg: '#f0fdf4', border: '#86efac' },
};

function ProgressBar({ pct, color = '#3b82f6' }) {
  return (
    <div style={{
      background: '#f3f4f6', borderRadius: '4px',
      height: '6px', width: '100%', overflow: 'hidden',
    }}>
      <div style={{
        width: `${Math.min(pct, 100)}%`,
        background: color,
        height: '100%',
        borderRadius: '4px',
        transition: 'width 0.5s ease',
      }} />
    </div>
  );
}

export default function ProjectHealthList({ projects }) {
  if (!projects?.length) {
    return (
      <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', fontSize: '14px' }}>
        目前沒有符合條件的專案
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '600', color: '#111827' }}>
        各專案詳情（共 {projects.length} 個）
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {projects.map((p) => {
          const health     = HEALTH_DOT[p.health_status] || HEALTH_DOT.green;
          const statusBadge = STATUS_BADGE[p.status]   || STATUS_BADGE.active;
          const daysText   = p.days_to_deadline < 0
            ? `逾期 ${Math.abs(p.days_to_deadline)} 天`
            : p.days_to_deadline === 0
              ? '今天截止'
              : `剩 ${p.days_to_deadline} 天`;
          const daysColor  = p.days_to_deadline < 0 ? '#dc2626'
            : p.days_to_deadline <= 7 ? '#d97706'
            : '#6b7280';

          return (
            <div key={p.project_id} style={{
              background: health.bg,
              border:     `1px solid ${health.border}`,
              borderRadius: '10px',
              padding:    '14px 16px',
            }}>
              {/* 第一行：燈號 + 專案名稱 + 狀態標籤 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ fontSize: '16px' }}>{health.dot}</span>
                <span style={{ fontWeight: '600', fontSize: '14px', color: '#111827', flex: 1 }}>
                  {p.project_name}
                </span>
                <span style={{
                  fontSize: '11px', fontWeight: '600',
                  background: statusBadge.bg, color: statusBadge.color,
                  padding: '2px 8px', borderRadius: '12px',
                }}>
                  {statusBadge.label}
                </span>
              </div>

              {/* 第二行：進度條 */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>
                  <span>任務完成率</span>
                  <span>{p.completion_pct}%（{p.done_tasks}/{p.total_tasks}）</span>
                </div>
                <ProgressBar pct={Number(p.completion_pct)} color="#3b82f6" />
              </div>

              {/* 預算進度（若有設定預算）*/}
              {p.budget && (
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>
                    <span>預算使用率</span>
                    <span>{p.budget_usage_pct ?? 0}%</span>
                  </div>
                  <ProgressBar
                    pct={Number(p.budget_usage_pct ?? 0)}
                    color={Number(p.budget_usage_pct) > 90 ? '#ef4444' : Number(p.budget_usage_pct) > 70 ? '#f59e0b' : '#22c55e'}
                  />
                </div>
              )}

              {/* 第三行：截止日、負責人、逾期任務 */}
              <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: '#6b7280' }}>
                <span style={{ color: daysColor, fontWeight: '500' }}>📅 {daysText}</span>
                {p.owner_name && <span>👤 {p.owner_name}</span>}
                {p.overdue_tasks > 0 && (
                  <span style={{ color: '#dc2626', fontWeight: '500' }}>
                    ⚠️ {p.overdue_tasks} 個任務逾期
                  </span>
                )}
                {p.total_milestones > 0 && (
                  <span>🎯 {p.achieved_milestones}/{p.total_milestones} 里程碑</span>
                )}
              </div>

              {/* 燈號說明 */}
              {p.health_reason && p.health_reason !== '進行正常' && (
                <div style={{
                  marginTop: '8px',
                  fontSize: '11px',
                  color: '#6b7280',
                  background: 'rgba(255,255,255,0.7)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                }}>
                  ℹ️ {p.health_reason}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
