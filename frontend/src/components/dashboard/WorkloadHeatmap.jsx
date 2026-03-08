/**
 * WorkloadHeatmap — 人力負載熱力圖
 *
 * 顯示未來 14 天，每個人每天預估工時：
 *   🔴 紅色 = 過載（> 8 小時）
 *   🟢 綠色 = 正常（1~8 小時）
 *   ⬜ 灰色 = 空閒（0 小時）
 */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// 依工時決定顏色（顏色越深 = 工時越重）
function getCellColor(hours, loadStatus) {
  if (loadStatus === 'overloaded') return '#fca5a5'; // 紅：過載
  if (loadStatus === 'normal') {
    if (hours >= 6) return '#4ade80';   // 深綠：繁忙
    if (hours >= 3) return '#86efac';   // 中綠：正常
    return '#bbf7d0';                    // 淺綠：輕鬆
  }
  return '#f3f4f6'; // 灰：空閒
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

export default function WorkloadHeatmap({ workload }) {
  if (!workload?.dates?.length || !workload?.users?.length) {
    return (
      <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', fontSize: '14px' }}>
        無人力負載資料
      </div>
    );
  }

  const { dates, users } = workload;
  // 只顯示前 7 天（一週），避免畫面太長
  const displayDates = dates.slice(0, 7);

  return (
    <div>
      <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: '600', color: '#111827' }}>
        本週人力負載熱力圖
      </h3>
      <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#9ca3af' }}>
        🔴 過載（&gt;8h）　🟢 正常　⬜ 空閒
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{
          borderCollapse: 'separate', borderSpacing: '4px',
          width: '100%', fontSize: '12px',
        }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: '#6b7280', fontWeight: '500', width: '80px' }}>
                成員
              </th>
              {displayDates.map(date => (
                <th key={date} style={{
                  textAlign: 'center', padding: '4px',
                  color: '#6b7280', fontWeight: '500',
                  minWidth: '56px',
                }}>
                  {formatDate(date)}
                </th>
              ))}
              <th style={{ textAlign: 'center', padding: '4px', color: '#6b7280', fontWeight: '500' }}>
                週合計
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => {
              const weekTotal = displayDates.reduce((sum, date) => {
                return sum + (user.days[date]?.hours || 0);
              }, 0);
              const isWeekOverloaded = weekTotal > 40;

              return (
                <tr key={user.userId}>
                  {/* 成員名稱 */}
                  <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{
                        width: '24px', height: '24px',
                        borderRadius: '50%', background: '#e5e7eb',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', fontWeight: '600', color: '#6b7280',
                        flexShrink: 0,
                      }}>
                        {user.userName.charAt(0)}
                      </div>
                      <span style={{ color: '#374151', fontWeight: '500' }}>
                        {user.userName}
                      </span>
                    </div>
                  </td>

                  {/* 每天的熱力格 */}
                  {displayDates.map(date => {
                    const dayData = user.days[date];
                    const hours   = dayData?.hours || 0;
                    const status  = dayData?.loadStatus || 'idle';
                    const tasks   = dayData?.taskCount || 0;

                    return (
                      <td key={date} style={{ textAlign: 'center', padding: '2px' }}>
                        <div
                          title={`${user.userName} ${formatDate(date)}\n${hours.toFixed(1)} 小時 / ${tasks} 個任務`}
                          style={{
                            background:   getCellColor(hours, status),
                            borderRadius: '6px',
                            padding:      '6px 4px',
                            cursor:       'default',
                            transition:   'opacity 0.15s',
                          }}
                          onMouseOver={e => e.currentTarget.style.opacity = '0.7'}
                          onMouseOut={e => e.currentTarget.style.opacity = '1'}
                        >
                          <div style={{ fontWeight: '600', color: '#1f2937' }}>
                            {hours > 0 ? `${hours.toFixed(1)}h` : '-'}
                          </div>
                          {tasks > 0 && (
                            <div style={{ fontSize: '10px', color: '#6b7280' }}>
                              {tasks}件
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}

                  {/* 週合計 */}
                  <td style={{ textAlign: 'center', padding: '2px' }}>
                    <div style={{
                      background:   isWeekOverloaded ? '#fef2f2' : '#f9fafb',
                      border:       `1px solid ${isWeekOverloaded ? '#fca5a5' : '#e5e7eb'}`,
                      borderRadius: '6px',
                      padding:      '6px 4px',
                      fontWeight:   '600',
                      color:        isWeekOverloaded ? '#dc2626' : '#374151',
                    }}>
                      {weekTotal.toFixed(0)}h
                      {isWeekOverloaded && <div style={{ fontSize: '9px' }}>超載</div>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
