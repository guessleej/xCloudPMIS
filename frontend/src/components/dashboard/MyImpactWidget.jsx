/**
 * MyImpactWidget — P2#35 個人化 My Impact 小工具
 *
 * 呼叫 GET /api/dashboard/my-impact?companyId=N&userId=N
 * 展示個人貢獻統計：本月完成、逾期、本週完成、月環比、6 月趨勢
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useIsMobile } from '../../hooks/useResponsive';

function formatMonth(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const names = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  return names[(parseInt(m, 10) - 1)] || ym;
}

const PRIORITY_COLOR = {
  urgent: '#ef4444',
  high:   '#f97316',
  medium: '#eab308',
  low:    '#6b7280',
};

const PRIORITY_LABEL = {
  urgent: '緊急',
  high:   '高',
  medium: '中',
  low:    '低',
};

export default function MyImpactWidget() {
  const { user, authFetch } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    if (!user?.companyId || !user?.id || !authFetch) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res  = await authFetch(`/api/dashboard/my-impact?companyId=${user.companyId}&userId=${user.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.data || json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user?.companyId, user?.id, authFetch]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--xc-text-muted)', fontSize: '15px' }}>
      載入個人資料…
    </div>
  );

  if (error) return (
    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--xc-danger)', fontSize: '15px' }}>
      無法載入：{error}
      <button onClick={load} style={{
        marginTop: '8px', display: 'block', margin: '8px auto 0',
        padding: '6px 12px', borderRadius: '6px',
        border: '1px solid var(--xc-border)', background: 'var(--xc-surface)',
        cursor: 'pointer', fontSize: '14px', color: 'var(--xc-text)',
      }}>重試</button>
    </div>
  );

  if (!data) return null;

  const { user: u, stats = {}, contributionTrend = [], recentCompleted = [] } = data;

  const kpis = [
    { label: '本月完成', value: stats.completedThisMonth ?? 0, color: 'var(--xc-brand)', icon: '🎯' },
    { label: '本週完成', value: stats.completedThisWeek  ?? 0, color: 'var(--xc-success)', icon: '✅' },
    { label: '活躍任務', value: stats.activeCount        ?? 0, color: 'var(--xc-info)', icon: '🔄' },
    { label: '逾期任務', value: stats.overdueCount       ?? 0, color: 'var(--xc-danger)', icon: '⏰' },
  ];

  const momPct = stats.monthOverMonth;
  const momPos = momPct > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 使用者資訊列 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '50%',
          background: u?.avatarUrl ? 'transparent' : 'var(--xc-brand)',
          overflow: 'hidden', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {u?.avatarUrl
            ? <img src={u.avatarUrl} alt={u.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ color: '#fff', fontWeight: 700, fontSize: '20px' }}>
                {u?.name?.[0]?.toUpperCase() || '?'}
              </span>
          }
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--xc-text)' }}>{u?.name}</div>
          <div style={{ fontSize: '14px', color: 'var(--xc-text-muted)' }}>
            {u?.department} · {u?.jobTitle || '成員'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: '13px', color: 'var(--xc-text-muted)' }}>累計完成</div>
          <div style={{ fontWeight: 800, fontSize: '22px', color: 'var(--xc-brand)' }}>
            {stats.totalCompleted ?? 0}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--xc-text-muted)' }}>項任務</div>
        </div>
      </div>

      {/* KPI 卡片列 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
        {kpis.map(k => (
          <div key={k.label} style={{
            background:   'var(--xc-surface-soft)',
            border:       '1px solid var(--xc-border)',
            borderRadius: '10px',
            padding:      '10px 12px',
            textAlign:    'center',
          }}>
            <div style={{ fontSize: '17px', marginBottom: '4px' }}>{k.icon}</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--xc-text-muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* 月環比 */}
      {momPct !== undefined && momPct !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 12px', borderRadius: '8px',
          background: momPos
            ? 'color-mix(in srgb, var(--xc-success) 8%, var(--xc-surface))'
            : 'color-mix(in srgb, var(--xc-danger) 8%, var(--xc-surface))',
          border: '1px solid var(--xc-border)',
          fontSize: '14px',
        }}>
          <span style={{ fontWeight: 700, color: momPos ? 'var(--xc-success)' : 'var(--xc-danger)' }}>
            {momPos ? '▲' : '▼'} {Math.abs(momPct)}%
          </span>
          <span style={{ color: 'var(--xc-text-soft)' }}>
            相較上月，本月完成 {momPos ? '增加' : '減少'} {Math.abs(momPct)}%
          </span>
        </div>
      )}

      {/* 6 個月貢獻趨勢 */}
      {contributionTrend.length > 0 && (
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--xc-text-soft)', marginBottom: '10px' }}>
            📈 個人完成趨勢（近 6 個月）
          </div>
          <ResponsiveContainer width="100%" height={100}>
            <AreaChart data={contributionTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="myImpactGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--xc-brand)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--xc-brand)" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--xc-border)" vertical={false} />
              <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 12, fill: 'var(--xc-text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--xc-text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                formatter={(v) => [v, '完成']}
                labelFormatter={formatMonth}
                contentStyle={{ background: 'var(--xc-surface)', border: '1px solid var(--xc-border)', borderRadius: '8px', fontSize: '13px' }}
              />
              <Area type="monotone" dataKey="completed" stroke="var(--xc-brand)" strokeWidth={2} fill="url(#myImpactGrad)" dot={{ r: 3, fill: 'var(--xc-brand)' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 近期完成任務 */}
      {recentCompleted.length > 0 && (
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--xc-text-soft)', marginBottom: '8px' }}>
            ✅ 近 7 天完成
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
            {recentCompleted.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '7px 10px', borderRadius: '8px',
                background: 'var(--xc-surface-soft)',
                border: '1px solid var(--xc-border)',
              }}>
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: PRIORITY_COLOR[t.priority] || '#6b7280',
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--xc-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.title}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--xc-text-muted)' }}>
                    {t.projectName}
                  </div>
                </div>
                <span style={{
                  fontSize: '12px', padding: '2px 6px', borderRadius: '4px',
                  background: 'color-mix(in srgb, var(--xc-success) 12%, transparent)',
                  color: 'var(--xc-success)', fontWeight: 600,
                }}>
                  {PRIORITY_LABEL[t.priority] || t.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
