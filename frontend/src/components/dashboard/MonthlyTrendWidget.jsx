/**
 * MonthlyTrendWidget — P1#33 按月完成趨勢線（管理層最常看）
 *
 * 大尺寸獨立 widget，展示 12 個月的任務完成 vs 新建趨勢
 * 包含：
 *   - 完成率折線圖（主）
 *   - 新建 vs 完成對比面積圖
 *   - 月環比變化指標
 *   - MoM 增減 badge
 */

import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useState } from 'react';

function formatMonth(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const names = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  return `${y.slice(2)}/${names[(parseInt(m, 10) - 1)]}`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background:   'var(--xc-surface)',
      border:       '1px solid var(--xc-border)',
      borderRadius: '10px',
      padding:      '12px 16px',
      boxShadow:    '0 8px 24px rgba(0,0,0,.14)',
      fontSize:     '12px',
      minWidth:     '160px',
    }}>
      <div style={{ fontWeight: 700, color: 'var(--xc-text)', marginBottom: '8px', fontSize: '13px' }}>
        {formatMonth(label)}
      </div>
      {payload.map((entry) => {
        const labels = { completed: '已完成', created: '新建立', completionRate: '完成率' };
        const isRate = entry.dataKey === 'completionRate';
        return (
          <div key={entry.dataKey} style={{
            display: 'flex', justifyContent: 'space-between', gap: '16px',
            marginBottom: '4px',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--xc-text-soft)' }}>
              <span style={{
                width: '8px', height: isRate ? '2px' : '8px',
                background: entry.stroke || entry.fill,
                display: 'inline-block',
                borderRadius: isRate ? '0' : '2px',
              }} />
              {labels[entry.dataKey] || entry.dataKey}
            </span>
            <strong style={{ color: entry.stroke || entry.fill }}>
              {isRate ? `${entry.value}%` : entry.value}
            </strong>
          </div>
        );
      })}
    </div>
  );
}

// 計算月環比 (Month-over-Month)
function calcMoM(trend) {
  if (!trend || trend.length < 2) return null;
  const last = trend[trend.length - 1];
  const prev = trend[trend.length - 2];
  if (!prev || prev.completed === 0) return null;
  const diff = last.completed - prev.completed;
  const pct  = Math.round((diff / prev.completed) * 100);
  return { diff, pct, month: last.month };
}

export default function MonthlyTrendWidget({ monthlyTrend = [], loading = false }) {
  const [mode, setMode] = useState('both'); // 'both' | 'rate'

  // 計算完成率
  const data = monthlyTrend.map(d => ({
    ...d,
    completionRate: d.created > 0 ? Math.round((d.completed / d.created) * 100) : 0,
  }));

  const mom = calcMoM(monthlyTrend);
  const maxVal = Math.max(...monthlyTrend.map(d => Math.max(d.completed || 0, d.created || 0)), 1);
  const avgCompleted = monthlyTrend.length > 0
    ? Math.round(monthlyTrend.reduce((s, d) => s + (d.completed || 0), 0) / monthlyTrend.length)
    : 0;

  const last = monthlyTrend[monthlyTrend.length - 1] || {};
  const totalCompleted = monthlyTrend.reduce((s, d) => s + (d.completed || 0), 0);
  const totalCreated   = monthlyTrend.reduce((s, d) => s + (d.created  || 0), 0);
  const overallRate    = totalCreated > 0 ? Math.round((totalCompleted / totalCreated) * 100) : 0;

  const pills = [
    { label: '近12月完成率', value: `${overallRate}%`, color: 'var(--xc-brand)' },
    { label: '本月完成', value: last.completed ?? '—', color: 'var(--xc-success)' },
    { label: '12月均值', value: avgCompleted, color: 'var(--xc-info)' },
    {
      label: '月環比',
      value: mom ? `${mom.pct > 0 ? '+' : ''}${mom.pct}%` : '—',
      color: mom?.pct > 0 ? 'var(--xc-success)' : mom?.pct < 0 ? 'var(--xc-danger)' : 'var(--xc-text-muted)',
    },
  ];

  return (
    <div>
      {/* 指標摘要列 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '12px',
        marginBottom: '20px',
      }}>
        {pills.map((p) => (
          <div key={p.label} style={{
            background:   'var(--xc-surface-soft)',
            border:       '1px solid var(--xc-border)',
            borderRadius: '10px',
            padding:      '12px 14px',
            textAlign:    'center',
          }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: p.color }}>
              {loading ? '—' : p.value}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--xc-text-muted)', marginTop: '3px' }}>
              {p.label}
            </div>
          </div>
        ))}
      </div>

      {/* 圖表切換 */}
      <div style={{
        display: 'flex', gap: '6px', marginBottom: '16px', justifyContent: 'flex-end',
      }}>
        {[
          { k: 'both', label: '完成 vs 新建' },
          { k: 'rate', label: '完成率趨勢' },
        ].map(({ k, label }) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            style={{
              padding: '4px 10px', borderRadius: '6px', fontSize: '11px',
              border: '1px solid var(--xc-border)', cursor: 'pointer',
              background: mode === k ? 'var(--xc-brand)' : 'var(--xc-surface)',
              color: mode === k ? '#fff' : 'var(--xc-text-soft)',
              fontWeight: mode === k ? 700 : 400,
              transition: 'all .15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 圖表 */}
      {loading ? (
        <div style={{
          height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--xc-text-muted)', fontSize: '13px',
        }}>
          載入中…
        </div>
      ) : data.length === 0 ? (
        <div style={{
          height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--xc-text-muted)', fontSize: '13px',
        }}>
          尚無月度趨勢資料
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          {mode === 'rate' ? (
            <ComposedChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--xc-brand)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--xc-brand)" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--xc-border)" vertical={false} />
              <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 11, fill: 'var(--xc-text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: 'var(--xc-text-muted)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={avgCompleted > 0 ? Math.round((avgCompleted / maxVal) * 100) : 50} stroke="var(--xc-text-muted)" strokeDasharray="4 4" label={{ value: '平均', position: 'insideTopRight', fontSize: 10, fill: 'var(--xc-text-muted)' }} />
              <Area type="monotone" dataKey="completionRate" stroke="var(--xc-brand)" strokeWidth={2.5} fill="url(#rateGrad)" dot={false} activeDot={{ r: 5 }} name="完成率" />
            </ComposedChart>
          ) : (
            <ComposedChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--xc-success)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--xc-success)" stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="createdGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--xc-info)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--xc-info)" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--xc-border)" vertical={false} />
              <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 11, fill: 'var(--xc-text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--xc-text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(v) => ({ completed: '已完成', created: '新建立', completionRate: '完成率' }[v] || v)}
                wrapperStyle={{ fontSize: '11px', color: 'var(--xc-text-soft)' }}
              />
              <Area type="monotone" dataKey="created"   stroke="var(--xc-info)"    strokeWidth={1.5} fill="url(#createdGrad)"   dot={false} activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="completed" stroke="var(--xc-success)" strokeWidth={2.5} fill="url(#completedGrad)" dot={{ r: 3, fill: 'var(--xc-success)' }} activeDot={{ r: 5 }} />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      )}

      {/* MoM 說明 */}
      {mom && !loading && (
        <div style={{
          marginTop: '12px',
          padding:   '8px 12px',
          borderRadius: '8px',
          background: mom.pct > 0
            ? 'color-mix(in srgb, var(--xc-success) 8%, var(--xc-surface))'
            : mom.pct < 0
              ? 'color-mix(in srgb, var(--xc-danger) 8%, var(--xc-surface))'
              : 'var(--xc-surface-soft)',
          border: '1px solid var(--xc-border)',
          fontSize: '12px',
          color: 'var(--xc-text-soft)',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <span style={{
            fontWeight: 700,
            color: mom.pct > 0 ? 'var(--xc-success)' : mom.pct < 0 ? 'var(--xc-danger)' : 'var(--xc-text-muted)',
          }}>
            {mom.pct > 0 ? '▲' : mom.pct < 0 ? '▼' : '—'} 月環比 {Math.abs(mom.pct)}%
          </span>
          {mom.pct > 0
            ? `本月完成 ${last.completed} 件，較上月增加 ${Math.abs(mom.diff)} 件`
            : mom.pct < 0
              ? `本月完成 ${last.completed} 件，較上月減少 ${Math.abs(mom.diff)} 件`
              : '本月與上月完成數量持平'
          }
        </div>
      )}
    </div>
  );
}
