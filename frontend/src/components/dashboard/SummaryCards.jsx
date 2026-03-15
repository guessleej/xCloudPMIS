/**
 * SummaryCards — 頂部關鍵數字卡片列
 *
 * UI 重設計 v2：NexAdmin Design System
 *   - 白底卡片 + 彩色圖示容器
 *   - Hover 上浮效果
 *   - 清晰的標籤 / 數值 / 趨勢三層結構
 */

export default function SummaryCards({ summary }) {
  if (!summary) return null;

  const budgetPct = summary.total_budget
    ? ((Number(summary.total_cost) / Number(summary.total_budget)) * 100).toFixed(1)
    : null;

  const cards = [
    {
      label:      '危險專案',
      value:      summary.red_projects ?? 0,
      sub:        `共 ${summary.total_projects ?? 0} 個專案`,
      trend:      summary.red_projects > 0 ? `⚠ ${summary.red_projects} 需立即處理` : '✓ 全數正常',
      trendOk:    !(summary.red_projects > 0),
      iconBg:     summary.red_projects > 0 ? '#FEF2F2' : '#F0FDF4',
      iconColor:  summary.red_projects > 0 ? '#EF4444' : '#22C55E',
      valueColor: summary.red_projects > 0 ? '#EF4444' : '#1e293b',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      ),
    },
    {
      label:      '需關注',
      value:      summary.yellow_projects ?? 0,
      sub:        `${summary.active_projects ?? 0} 個進行中`,
      trend:      summary.yellow_projects > 0 ? `${summary.yellow_projects} 個需跟進` : '✓ 無需關注',
      trendOk:    !(summary.yellow_projects > 0),
      iconBg:     summary.yellow_projects > 0 ? '#FFFBEB' : '#F0FDF4',
      iconColor:  summary.yellow_projects > 0 ? '#F59E0B' : '#22C55E',
      valueColor: summary.yellow_projects > 0 ? '#D97706' : '#1e293b',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ),
    },
    {
      label:      '正常運行',
      value:      summary.green_projects ?? 0,
      sub:        `${summary.due_this_month ?? 0} 個本月到期`,
      trend:      '✓ 健康狀態良好',
      trendOk:    true,
      iconBg:     '#F0FDF4',
      iconColor:  '#22C55E',
      valueColor: '#16A34A',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      ),
    },
    {
      label:      '整體完成率',
      value:      `${summary.overall_completion_pct ?? 0}%`,
      sub:        `${summary.done_tasks ?? 0} / ${summary.total_tasks ?? 0} 個任務`,
      trend:      `逾期 ${summary.total_overdue_tasks ?? 0} 個`,
      trendOk:    !(summary.total_overdue_tasks > 0),
      iconBg:     '#FFF0F2',
      iconColor:  '#C41230',
      valueColor: '#C41230',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
          <polyline points="17 6 23 6 23 12"/>
        </svg>
      ),
    },
    {
      label:      '累計工時',
      value:      `${Number(summary.total_logged_hours ?? 0).toFixed(0)}h`,
      sub:        '本期已記錄',
      trend:      '已同步更新',
      trendOk:    true,
      iconBg:     '#FAF5FF',
      iconColor:  '#7C3AED',
      valueColor: '#7C3AED',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      ),
    },
    {
      label:      '預算執行',
      value:      budgetPct != null ? `${budgetPct}%` : 'N/A',
      sub:        summary.total_budget
                  ? `NT$ ${Number(summary.total_cost).toLocaleString()} / ${Number(summary.total_budget).toLocaleString()}`
                  : '未設定預算',
      trend:      budgetPct != null
                  ? (Number(budgetPct) > 90 ? '⚠ 接近上限' : '✓ 使用率正常')
                  : '尚未設定',
      trendOk:    budgetPct == null || Number(budgetPct) <= 90,
      iconBg:     '#FFF7ED',
      iconColor:  '#EA580C',
      valueColor: budgetPct != null && Number(budgetPct) > 90 ? '#EA580C' : '#1e293b',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23"/>
          <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
        </svg>
      ),
    },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: '14px',
      marginBottom: '20px',
    }}>
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            background: 'white',
            border: '1px solid #E8EDF4',
            borderRadius: '14px',
            padding: '18px',
            transition: 'transform 0.15s, box-shadow 0.15s',
            cursor: 'default',
          }}
          onMouseOver={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.07)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          {/* 標籤 + 圖示 */}
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: '12px',
          }}>
            <span style={{
              fontSize: '11px', color: '#94A3B8', fontWeight: '600',
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              {card.label}
            </span>
            <div style={{
              width: '34px', height: '34px', borderRadius: '9px',
              background: card.iconBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: card.iconColor,
            }}>
              {card.icon}
            </div>
          </div>

          {/* 主數值 */}
          <div style={{
            fontSize: '26px', fontWeight: '800',
            color: card.valueColor, lineHeight: '1', marginBottom: '5px',
          }}>
            {card.value}
          </div>

          {/* 副標 */}
          <div style={{ fontSize: '11.5px', color: '#94A3B8', marginBottom: '6px' }}>
            {card.sub}
          </div>

          {/* 趨勢指示 */}
          <div style={{
            fontSize: '11.5px', fontWeight: '500',
            color: card.trendOk ? '#22C55E' : '#F59E0B',
          }}>
            {card.trend}
          </div>
        </div>
      ))}
    </div>
  );
}
