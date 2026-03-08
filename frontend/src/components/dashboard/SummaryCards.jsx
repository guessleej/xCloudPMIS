/**
 * SummaryCards — 頂部關鍵數字卡片列
 * 顯示：紅黃綠燈數量、任務完成率、總工時、預算使用
 */

export default function SummaryCards({ summary }) {
  if (!summary) return null;

  const cards = [
    {
      label:   '🔴 危險專案',
      value:   summary.red_projects ?? 0,
      sub:     `共 ${summary.total_projects} 個專案`,
      bg:      summary.red_projects > 0 ? '#fef2f2' : '#f9fafb',
      border:  summary.red_projects > 0 ? '#fca5a5' : '#e5e7eb',
      color:   summary.red_projects > 0 ? '#dc2626' : '#6b7280',
    },
    {
      label:   '🟡 需關注',
      value:   summary.yellow_projects ?? 0,
      sub:     `${summary.active_projects} 個進行中`,
      bg:      summary.yellow_projects > 0 ? '#fffbeb' : '#f9fafb',
      border:  summary.yellow_projects > 0 ? '#fcd34d' : '#e5e7eb',
      color:   summary.yellow_projects > 0 ? '#d97706' : '#6b7280',
    },
    {
      label:   '🟢 正常',
      value:   summary.green_projects ?? 0,
      sub:     `${summary.due_this_month} 個本月到期`,
      bg:      '#f0fdf4',
      border:  '#86efac',
      color:   '#16a34a',
    },
    {
      label:   '✅ 整體完成率',
      value:   `${summary.overall_completion_pct ?? 0}%`,
      sub:     `${summary.done_tasks ?? 0} / ${summary.total_tasks ?? 0} 個任務`,
      bg:      '#eff6ff',
      border:  '#93c5fd',
      color:   '#1d4ed8',
    },
    {
      label:   '⏱️ 累計工時',
      value:   `${Number(summary.total_logged_hours ?? 0).toFixed(0)}h`,
      sub:     `逾期任務 ${summary.total_overdue_tasks ?? 0} 個`,
      bg:      '#faf5ff',
      border:  '#c4b5fd',
      color:   '#7c3aed',
    },
    {
      label:   '💰 預算執行',
      value:   summary.total_budget
               ? `${((Number(summary.total_cost) / Number(summary.total_budget)) * 100).toFixed(1)}%`
               : 'N/A',
      sub:     summary.total_budget
               ? `NT$ ${Number(summary.total_cost).toLocaleString()} / ${Number(summary.total_budget).toLocaleString()}`
               : '未設定預算',
      bg:      '#fff7ed',
      border:  '#fdba74',
      color:   '#c2410c',
    },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: '12px',
      marginBottom: '24px',
    }}>
      {cards.map((card) => (
        <div key={card.label} style={{
          background:   card.bg,
          border:       `1px solid ${card.border}`,
          borderRadius: '12px',
          padding:      '16px',
          textAlign:    'center',
        }}>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>
            {card.label}
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: card.color }}>
            {card.value}
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
            {card.sub}
          </div>
        </div>
      ))}
    </div>
  );
}
