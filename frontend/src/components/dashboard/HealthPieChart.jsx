/**
 * HealthPieChart — 專案健康度圓餅圖
 *
 * 使用 Recharts 的 PieChart：
 *   - 圓餅圖顯示紅黃綠比例
 *   - 點擊扇形篩選右側的專案列表
 */

import { useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const COLORS = {
  red:    '#ef4444',
  yellow: '#f59e0b',
  green:  '#22c55e',
};

const LABELS = {
  red:    '🔴 危險',
  yellow: '🟡 注意',
  green:  '🟢 正常',
};

// 自訂 Tooltip（滑鼠停在扇形上顯示的提示框）
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '8px 12px',
      fontSize: '13px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    }}>
      <strong>{LABELS[name] || name}</strong>：{value} 個專案
    </div>
  );
};

export default function HealthPieChart({ summary, onFilter }) {
  const [activeStatus, setActiveStatus] = useState(null);

  if (!summary) return null;

  const data = [
    { name: 'red',    value: summary.red_projects    || 0 },
    { name: 'yellow', value: summary.yellow_projects || 0 },
    { name: 'green',  value: summary.green_projects  || 0 },
  ].filter(d => d.value > 0);  // 只顯示有值的扇形

  // 全部都是 0 時顯示空狀態
  if (data.length === 0 || data.every(d => d.value === 0)) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
        目前沒有任何專案
      </div>
    );
  }

  const handleClick = (entry) => {
    const status = entry.name;
    const next = activeStatus === status ? null : status;
    setActiveStatus(next);
    onFilter?.(next);    // 通知父元件篩選
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '600', color: '#111827' }}>
        專案健康度總覽
      </h3>

      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}   // 甜甜圈圖（中間有洞）
            outerRadius={95}
            dataKey="value"
            onClick={handleClick}
            style={{ cursor: 'pointer' }}
          >
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={COLORS[entry.name]}
                opacity={activeStatus && activeStatus !== entry.name ? 0.3 : 1}
                stroke={activeStatus === entry.name ? '#1f2937' : 'none'}
                strokeWidth={activeStatus === entry.name ? 2 : 0}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => LABELS[value] || value}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* 中心文字（ResponsiveContainer 無法直接放文字，用 CSS 相對定位實現）*/}
      <p style={{
        textAlign: 'center',
        marginTop: '-10px',
        fontSize: '12px',
        color: '#9ca3af',
      }}>
        {activeStatus ? `點擊空白處取消篩選` : `點擊扇形篩選專案`}
      </p>
    </div>
  );
}
