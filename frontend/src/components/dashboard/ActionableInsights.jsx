/**
 * ActionableInsights — 本週優先行動建議
 *
 * 顯示「建議卡片」而不是單純的資料表格
 * 主管看到就知道該做什麼
 */

const TYPE_STYLE = {
  danger:  { border: '#fca5a5', bg: '#fef2f2', icon: '🚨', label: '緊急' },
  warning: { border: '#fcd34d', bg: '#fffbeb', icon: '⚠️',  label: '注意' },
  info:    { border: '#93c5fd', bg: '#eff6ff', icon: 'ℹ️',  label: '資訊' },
};

function InsightCard({ insight }) {
  const style = TYPE_STYLE[insight.type] || TYPE_STYLE.info;
  return (
    <div style={{
      border:       `1px solid ${style.border}`,
      background:   style.bg,
      borderRadius: '10px',
      padding:      '14px 16px',
      display:      'flex',
      gap:          '12px',
      alignItems:   'flex-start',
    }}>
      <span style={{ fontSize: '22px', flexShrink: 0, lineHeight: '1.2' }}>
        {insight.icon}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: '600', fontSize: '14px', color: '#111827', marginBottom: '4px' }}>
          {insight.title}
        </div>
        <div style={{ fontSize: '13px', color: '#4b5563', lineHeight: '1.5', marginBottom: '10px' }}>
          {insight.message}
        </div>
        <button
          onClick={() => {
            // 之後換成頁面路由的跳轉功能
            alert(`導向：${insight.actionUrl}`);
          }}
          style={{
            background:   insight.type === 'danger' ? '#dc2626'
                          : insight.type === 'warning' ? '#d97706'
                          : '#2563eb',
            color:        'white',
            border:       'none',
            borderRadius: '6px',
            padding:      '6px 14px',
            fontSize:     '12px',
            fontWeight:   '600',
            cursor:       'pointer',
          }}
        >
          {insight.action} →
        </button>
      </div>
      <span style={{
        fontSize:     '10px',
        fontWeight:   '600',
        color:        insight.type === 'danger' ? '#dc2626'
                      : insight.type === 'warning' ? '#d97706'
                      : '#2563eb',
        background:   'white',
        padding:      '2px 6px',
        borderRadius: '4px',
        flexShrink:   0,
      }}>
        {style.label}
      </span>
    </div>
  );
}

export default function ActionableInsights({ insights }) {
  if (!insights?.length) {
    return (
      <div style={{
        textAlign: 'center', padding: '32px',
        background: '#f0fdf4', borderRadius: '12px',
        border: '1px solid #86efac',
      }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎉</div>
        <div style={{ fontWeight: '600', color: '#16a34a', marginBottom: '4px' }}>
          本週一切正常！
        </div>
        <div style={{ fontSize: '13px', color: '#4ade80' }}>
          目前沒有需要立即處理的問題，繼續保持！
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '600', color: '#111827' }}>
        本週優先行動清單（{insights.length} 項）
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {insights.map(insight => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  );
}
