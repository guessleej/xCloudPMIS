/**
 * frontend/src/components/mcp/McpConsolePage.jsx
 * ─────────────────────────────────────────────────────────────
 * MCP 統一控制台
 *
 * 包含：
 *   - 總覽儀表板（服務狀態 + 圖表 + 最近活動）
 *   - Microsoft 服務整合狀態（Outlook / Teams / SharePoint / OneDrive / Loop）
 *   - 外部 MCP 平台（Sessions + Tools）
 *   - API 金鑰管理（CRUD）
 *   - 工具呼叫日誌
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

const API = 'http://localhost:3010';

// ════════════════════════════════════════════════════════════
// 常數 / 主題
// ════════════════════════════════════════════════════════════

const COLORS = {
  primary:   '#3b82f6',
  success:   '#22c55e',
  warning:   '#f59e0b',
  danger:    '#ef4444',
  muted:     '#94a3b8',
  bg:        '#f8fafc',
  card:      '#ffffff',
  border:    '#e2e8f0',
  sidebar:   '#1e293b',
  text:      '#1e293b',
  textLight: '#64748b',
};

const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

const MS_SERVICES = [
  { key: 'outlook',    icon: '📧', label: 'Outlook Mail',    desc: 'Mail.ReadWrite / Mail.Send' },
  { key: 'teams',      icon: '💬', label: 'Microsoft Teams', desc: 'Chat.ReadWrite / ChannelMessage.Send' },
  { key: 'sharepoint', icon: '📂', label: 'SharePoint',      desc: 'Sites.ReadWrite.All' },
  { key: 'onedrive',   icon: '☁️', label: 'OneDrive',        desc: 'Files.ReadWrite.All' },
  { key: 'loop',       icon: '🔄', label: 'Loop',            desc: 'Notes.ReadWrite.All' },
];

const SUB_NAV = [
  { id: 'overview',  label: '📊 總覽' },
  { id: 'microsoft', label: '🏢 Microsoft 整合' },
  { id: 'notify',    label: '🔔 通知整合' },
  { id: 'external',  label: '🔌 外部 MCP 平台' },
  { id: 'apikeys',   label: '🔑 API 金鑰' },
  { id: 'logs',      label: '📋 工具日誌' },
];

const NOTIFY_SERVICES = [
  {
    key: 'telegram', icon: '✈️', label: 'Telegram Bot',
    envKey: 'TELEGRAM_BOT_TOKEN',
    desc: '透過 Bot API 發送訊息到頻道或個人',
    features: ['📢 廣播通知至頻道', '👤 私訊特定用戶', '🤖 /status /tasks 指令', '📎 傳送檔案/截圖'],
    setupUrl: 'https://t.me/BotFather', docsLabel: '@BotFather',
    color: '#0088cc',
  },
  {
    key: 'line', icon: '💚', label: 'LINE Messaging API',
    envKey: 'LINE_CHANNEL_ACCESS_TOKEN',
    desc: '推播通知至 LINE 群組或個人帳號',
    features: ['📢 推播至群組', '👤 傳送個人訊息', '🎨 Flex Message 圖文卡片', '🔔 任務截止日提醒'],
    setupUrl: 'https://developers.line.biz/', docsLabel: 'LINE Developers',
    color: '#06c755',
  },
];

// ════════════════════════════════════════════════════════════
// 工具元件
// ════════════════════════════════════════════════════════════

function StatusDot({ status, size = 10 }) {
  const color = status === 'online'  || status === 'ok'          ? COLORS.success
              : status === 'warning' || status === 'degraded'    ? COLORS.warning
              : status === 'offline' || status === 'expired'
              || status === 'disconnected'                        ? COLORS.danger
              : status === 'no_scope'                             ? COLORS.muted
              : COLORS.muted;
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      borderRadius: '50%', background: color, flexShrink: 0,
      boxShadow: status === 'online' || status === 'ok' ? `0 0 6px ${color}88` : 'none',
    }} />
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: COLORS.card, borderRadius: 12,
      border: `1px solid ${COLORS.border}`,
      padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      ...style,
    }}>
      {children}
    </div>
  );
}

function Badge({ label, color = COLORS.primary }) {
  return (
    <span style={{
      background: color + '18', color, fontSize: 11, fontWeight: 600,
      padding: '2px 8px', borderRadius: 20, border: `1px solid ${color}44`,
    }}>
      {label}
    </span>
  );
}

function StatCard({ icon, label, value, sub, color = COLORS.primary }) {
  return (
    <Card style={{ flex: 1, minWidth: 150 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.text, lineHeight: 1 }}>{value}</div>
          {sub && <div style={{ fontSize: 12, color: COLORS.textLight, marginTop: 4 }}>{sub}</div>}
        </div>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: color + '18', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 20,
        }}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 16, fontWeight: 700, color: COLORS.text,
      marginBottom: 14, paddingBottom: 10,
      borderBottom: `1px solid ${COLORS.border}`,
    }}>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: COLORS.textLight }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
      <div style={{ fontSize: 14 }}>載入中...</div>
    </div>
  );
}

function EmptyState({ icon = '📭', text = '暫無資料' }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: COLORS.textLight }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 13 }}>{text}</div>
    </div>
  );
}

function StatusLabel({ status }) {
  const map = {
    online:       { text: '運行中',    color: COLORS.success },
    ok:           { text: '正常',      color: COLORS.success },
    offline:      { text: '離線',      color: COLORS.danger  },
    warning:      { text: '警告',      color: COLORS.warning },
    expired:      { text: 'Token 已過期', color: COLORS.danger  },
    disconnected: { text: '未連線',    color: COLORS.muted   },
    no_scope:     { text: '無此授權',  color: COLORS.muted   },
    critical:     { text: '即將過期',  color: COLORS.warning },
  };
  const s = map[status] || { text: status, color: COLORS.muted };
  return <Badge label={s.text} color={s.color} />;
}

// ════════════════════════════════════════════════════════════
// 自訂 Tooltip
// ════════════════════════════════════════════════════════════

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#1e293b', color: 'white', borderRadius: 8,
      padding: '10px 14px', fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}：{p.value}
        </div>
      ))}
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// Tab 1 — 總覽
// ════════════════════════════════════════════════════════════

function OverviewTab({ data, chart, loading }) {
  if (loading) return <Spinner />;
  if (!data) return <EmptyState icon="❌" text="無法載入狀態資料，請確認服務是否正常運行" />;

  const { services, stats, recentActivity } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── 統計卡片列 ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <StatCard icon="📞" label="今日工具呼叫"   value={stats.totalCallsToday}
          sub="次" color={COLORS.primary} />
        <StatCard icon="✅" label="成功率"         value={`${stats.successRate}%`}
          sub="最近 24 小時" color={COLORS.success} />
        <StatCard icon="⚡" label="平均延遲"        value={`${stats.avgLatency}`}
          sub="毫秒" color={COLORS.warning} />
        <StatCard icon="🔌" label="活躍連線"        value={stats.activeSessions}
          sub="個 SSE Session" color={COLORS.primary} />
        <StatCard icon="🤖" label="待審核 AI 決策"  value={services.aiAgent.pendingDecisions}
          sub="個決策待審" color={services.aiAgent.pendingDecisions > 0 ? COLORS.warning : COLORS.success} />
      </div>

      {/* ── 服務狀態卡片 ────────────────────────────────────────── */}
      <Card>
        <SectionTitle>🏥 服務狀態總覽</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>

          {/* MCP External Server */}
          <ServiceCard
            icon="🔌" name="MCP External Server"
            status={services.mcpExternalServer.status}
            meta={[
              `Sessions: ${services.mcpExternalServer.sessions}`,
              `Uptime: ${Math.floor(services.mcpExternalServer.uptime / 60)} 分鐘`,
              `版本: v${services.mcpExternalServer.version}`,
            ]}
          />

          {/* Microsoft Graph */}
          <ServiceCard
            icon="🏢" name="Microsoft Graph API"
            status={services.microsoft.status}
            meta={[
              `Token 狀態: ${services.microsoft.tokenStatus}`,
              services.microsoft.tokenExpiry
                ? `到期：${new Date(services.microsoft.tokenExpiry).toLocaleString('zh-TW')}`
                : '尚未連線',
            ]}
          />

          {/* AI Agent */}
          <ServiceCard
            icon="🤖" name="AI Agent（ReAct）"
            status={services.aiAgent.status}
            meta={[
              `今日決策: ${services.aiAgent.todayDecisions} 件`,
              `完成率: ${services.aiAgent.successRate}%`,
              `待審: ${services.aiAgent.pendingDecisions} 件`,
            ]}
          />
        </div>
      </Card>

      {/* ── 圖表區 ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* 24 小時呼叫趨勢 */}
        <Card>
          <SectionTitle>📈 過去 24 小時呼叫趨勢</SectionTitle>
          {chart?.hourly?.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chart.hourly} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={COLORS.success}  stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.success}  stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={COLORS.danger}   stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.danger}   stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: COLORS.textLight }}
                  interval={3} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: COLORS.textLight }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="success" name="成功" stroke={COLORS.success}
                  fill="url(#gradSuccess)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="failed"  name="失敗" stroke={COLORS.danger}
                  fill="url(#gradFailed)"  strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon="📊" text="今日尚無呼叫記錄" />
          )}
        </Card>

        {/* Tool 使用分佈 */}
        <Card>
          <SectionTitle>🛠️ 工具使用分佈（今日）</SectionTitle>
          {chart?.toolBreakdown?.length > 0 ? (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', height: 220 }}>
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={chart.toolBreakdown} dataKey="count" nameKey="name"
                    cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                    {chart.toolBreakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {chart.toolBreakdown.slice(0, 6).map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span style={{ flex: 1, color: COLORS.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={t.name}>{t.name}</span>
                    <span style={{ fontWeight: 700, color: COLORS.text }}>{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState icon="🛠️" text="今日尚無工具呼叫" />
          )}
        </Card>
      </div>

      {/* ── 平均延遲趨勢 ───────────────────────────────────────── */}
      {chart?.hourly?.some(h => h.avgMs > 0) && (
        <Card>
          <SectionTitle>⚡ 平均回應延遲（毫秒）</SectionTitle>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chart.hourly} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: COLORS.textLight }}
                interval={3} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: COLORS.textLight }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="avgMs" name="平均延遲(ms)" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* ── 最近活動 ─────────────────────────────────────────── */}
      <Card>
        <SectionTitle>🕐 最近工具呼叫記錄</SectionTitle>
        {recentActivity.length === 0 ? (
          <EmptyState icon="📭" text="最近 24 小時無呼叫記錄" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: COLORS.bg }}>
                  {['工具名稱', '狀態', '延遲', '時間', '決策 #'].map(h => (
                    <th key={h} style={{
                      padding: '8px 12px', textAlign: 'left', fontWeight: 600,
                      color: COLORS.textLight, borderBottom: `1px solid ${COLORS.border}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((row, i) => (
                  <tr key={row.id} style={{
                    background: i % 2 === 0 ? COLORS.card : COLORS.bg,
                    borderBottom: `1px solid ${COLORS.border}33`,
                  }}>
                    <td style={{ padding: '8px 12px' }}>
                      <code style={{ fontSize: 12, background: '#e2e8f0', padding: '2px 6px', borderRadius: 4 }}>
                        {row.tool}
                      </code>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <StatusDot status={row.success ? 'online' : 'offline'} />
                      <span style={{ marginLeft: 6, color: row.success ? COLORS.success : COLORS.danger }}>
                        {row.success ? '成功' : '失敗'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: COLORS.textLight }}>
                      {row.latency != null ? `${row.latency} ms` : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: COLORS.textLight }}>
                      {new Date(row.time).toLocaleTimeString('zh-TW')}
                    </td>
                    <td style={{ padding: '8px 12px', color: COLORS.textLight }}>
                      {row.decisionId ? `#${row.decisionId}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ServiceCard({ icon, name, status, meta = [] }) {
  return (
    <div style={{
      background: COLORS.bg, borderRadius: 10,
      border: `1px solid ${COLORS.border}`, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>{name}</div>
        </div>
        <StatusLabel status={status} />
      </div>
      {meta.map((m, i) => (
        <div key={i} style={{ fontSize: 12, color: COLORS.textLight, marginTop: 3 }}>
          {m}
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Tab 2 — Microsoft 整合
// ════════════════════════════════════════════════════════════

function MicrosoftTab({ data, loading }) {
  if (loading) return <Spinner />;
  const ms = data?.services?.microsoft;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Token 狀態總覽 */}
      <Card>
        <SectionTitle>🔐 Microsoft Graph API Token 狀態</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusDot status={ms?.status || 'offline'} size={14} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {ms?.status === 'online' ? '已連線' : ms?.status === 'disconnected' ? '未連線' : ms?.status}
            </span>
          </div>
          {ms?.tokenExpiry && (
            <div style={{ fontSize: 13, color: ms.tokenStatus === 'warning' ? COLORS.warning : COLORS.textLight }}>
              Token 到期時間：{new Date(ms.tokenExpiry).toLocaleString('zh-TW')}
              {ms.tokenStatus === 'warning' && ' ⚠️ 即將過期'}
              {ms.tokenStatus === 'expired'  && ' 🚨 已過期'}
            </div>
          )}
          {ms?.status === 'disconnected' && (
            <div style={{ fontSize: 13, color: COLORS.danger }}>
              請前往「系統設定 → Microsoft 帳戶連線」完成 OAuth 授權
            </div>
          )}
        </div>
      </Card>

      {/* 各服務狀態 */}
      <Card>
        <SectionTitle>🏢 Microsoft 365 服務整合</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {MS_SERVICES.map(svc => {
            const svcData = ms?.services?.[svc.key] || { status: 'disconnected' };
            return (
              <div key={svc.key} style={{
                background: COLORS.bg, borderRadius: 10, padding: '16px',
                border: `1px solid ${svcData.status === 'online' ? COLORS.success + '44' : COLORS.border}`,
                transition: 'border 0.2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10, fontSize: 22,
                    background: COLORS.card, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', border: `1px solid ${COLORS.border}`,
                  }}>
                    {svc.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>{svc.label}</div>
                    <div style={{ fontSize: 11, color: COLORS.textLight, marginTop: 2 }}>{svc.desc}</div>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <StatusLabel status={svcData.status} />
                  </div>
                </div>

                {/* MCP 工具功能說明 */}
                <MicrosoftToolHints service={svc.key} status={svcData.status} />
              </div>
            );
          })}
        </div>
      </Card>

      {/* Scope 需求說明 */}
      <Card>
        <SectionTitle>📋 授權 Scope 需求</SectionTitle>
        <div style={{ fontSize: 13, color: COLORS.textLight, lineHeight: 1.8 }}>
          <p>若需完整啟用所有 Microsoft 整合，請在 Azure AD 應用程式設定以下 API 權限：</p>
          <div style={{
            background: '#1e293b', color: '#e2e8f0', borderRadius: 8,
            padding: '14px 18px', fontFamily: 'monospace', fontSize: 12,
            lineHeight: 2, marginTop: 12,
          }}>
            {[
              '# Outlook',   'Mail.ReadWrite', 'Mail.Send', 'Calendars.ReadWrite',
              '# Teams',     'Chat.ReadWrite', 'ChannelMessage.Send', 'Team.ReadBasic.All',
              '# SharePoint','Sites.ReadWrite.All', 'Sites.Selected',
              '# OneDrive',  'Files.ReadWrite.All', 'Files.Selected',
              '# Loop',      'Notes.ReadWrite.All',
              '# Common',    'User.Read', 'offline_access',
            ].map((s, i) => (
              <div key={i} style={{ color: s.startsWith('#') ? '#94a3b8' : '#86efac' }}>
                {s}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function MicrosoftToolHints({ service, status }) {
  const tools = {
    outlook:    ['📧 發送郵件', '📬 讀取收件匣', '📅 建立行事曆事件'],
    teams:      ['💬 發送頻道訊息', '🔔 傳送 @mention 通知', '📞 建立會議連結'],
    sharepoint: ['📄 上傳/下載文件', '🔍 搜尋網站內容', '📝 更新清單項目'],
    onedrive:   ['📂 管理個人文件', '🔗 建立分享連結', '📊 讀取 Excel 資料'],
    loop:       ['📝 建立 Loop 工作區', '✅ 同步任務進度', '🔄 協作文件更新'],
  };
  const list = tools[service] || [];

  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 6 }}>MCP 工具功能：</div>
      {list.map((t, i) => (
        <div key={i} style={{
          fontSize: 12, color: status === 'online' ? COLORS.text : COLORS.muted,
          marginBottom: 3, paddingLeft: 4,
          opacity: status === 'no_scope' || status === 'disconnected' ? 0.5 : 1,
        }}>
          {status !== 'online' && status !== 'ok' ? '🔒 ' : ''}{t}
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Tab 3 — 通知整合（Telegram / LINE）
// ════════════════════════════════════════════════════════════

function NotifyTab({ data, loading }) {
  const [testInput, setTestInput]   = useState({ telegram: { chatId: '' }, line: { userId: '' } });
  const [testResult, setTestResult] = useState({});
  const [testing, setTesting]       = useState({});

  if (loading) return <Spinner />;

  const notify = data?.services?.notify || {};

  const handleTest = async (svc) => {
    setTesting(t => ({ ...t, [svc]: true }));
    setTestResult(tr => ({ ...tr, [svc]: null }));
    try {
      const extra = svc === 'telegram'
        ? { chatId:  testInput.telegram.chatId  || undefined }
        : { userId:  testInput.line.userId       || undefined };

      const r = await fetch(`${API}/api/admin/mcp/notify/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: svc, ...extra }),
      });
      const d = await r.json();
      setTestResult(tr => ({ ...tr, [svc]: d }));
    } catch (e) {
      setTestResult(tr => ({ ...tr, [svc]: { success: false, error: e.message } }));
    }
    setTesting(t => ({ ...t, [svc]: false }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── 整體說明 ─────────────────────────────────────────── */}
      <Card>
        <SectionTitle>🔔 通知整合概覽</SectionTitle>
        <p style={{ fontSize: 13, color: COLORS.textLight, margin: '0 0 16px', lineHeight: 1.8 }}>
          透過 MCP 工具（<code style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: 4 }}>notify_telegram</code>、
          <code style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: 4 }}>notify_line</code>），
          AI Agent 可在任務狀態變更、截止日提醒、專案風險警示時，自動推播通知至外部渠道。
        </p>

        {/* 服務狀態總覽 */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {NOTIFY_SERVICES.map(svc => {
            const svcData = notify[svc.key] || {};
            return (
              <div key={svc.key} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 18px', borderRadius: 10,
                background: svcData.configured ? svc.color + '12' : COLORS.bg,
                border: `1.5px solid ${svcData.configured ? svc.color + '55' : COLORS.border}`,
                minWidth: 220,
              }}>
                <span style={{ fontSize: 22 }}>{svc.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>{svc.label}</div>
                  {svcData.botName && (
                    <div style={{ fontSize: 11, color: COLORS.textLight }}>@{svcData.botName}</div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <StatusDot status={svcData.status || 'disconnected'} size={12} />
                  <Badge
                    label={svcData.status === 'online' ? '已連線' : svcData.status === 'warning' ? 'Token 異常' : '未設定'}
                    color={svcData.status === 'online' ? COLORS.success : svcData.status === 'warning' ? COLORS.warning : COLORS.muted}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── 各服務詳情卡片 ─────────────────────────────────── */}
      {NOTIFY_SERVICES.map(svc => {
        const svcData = notify[svc.key] || {};
        const result  = testResult[svc.key];
        const isTesting = !!testing[svc.key];
        const inputVal  = svc.key === 'telegram'
          ? testInput.telegram.chatId
          : testInput.line.userId;
        const inputPlaceholder = svc.key === 'telegram' ? '@channel_name 或 123456789' : 'U1234abc...';
        const inputLabel       = svc.key === 'telegram' ? 'Chat ID（可選）' : 'User / Group ID（可選）';

        return (
          <Card key={svc.key} style={{ borderTop: `4px solid ${svc.color}`, overflow: 'hidden' }}>
            {/* 標題列 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: svc.color, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 26,
                boxShadow: `0 4px 12px ${svc.color}44`,
              }}>
                {svc.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 18, color: COLORS.text }}>{svc.label}</div>
                <div style={{ fontSize: 13, color: COLORS.textLight }}>{svc.desc}</div>
              </div>
              <StatusLabel status={svcData.status === 'online' ? 'online' : svcData.status === 'warning' ? 'warning' : 'disconnected'} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              {/* ── 左欄：功能清單 ──────────────────────────── */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textLight, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  🛠️ 支援功能
                </div>
                {svc.features.map((f, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 13, color: svcData.configured ? COLORS.text : COLORS.muted,
                    marginBottom: 7, opacity: svcData.configured ? 1 : 0.6,
                  }}>
                    <span>{f}</span>
                  </div>
                ))}

                {/* MCP 工具提示 */}
                <div style={{
                  marginTop: 14, padding: '10px 14px',
                  background: COLORS.bg, borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  fontSize: 12, color: COLORS.textLight,
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>🤖 MCP 工具呼叫</div>
                  <code style={{ fontSize: 11 }}>
                    {svc.key === 'telegram'
                      ? 'notify_telegram({ chatId, message })'
                      : 'notify_line({ userId, message })'}
                  </code>
                  <div style={{ marginTop: 4 }}>
                    所需權限：<code style={{ color: COLORS.primary }}>write:notifications</code>
                  </div>
                </div>
              </div>

              {/* ── 右欄：設定 & 測試 ───────────────────────── */}
              <div>
                {svcData.configured ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                    {/* Token 已設定 */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textLight, marginBottom: 8 }}>
                        🔑 環境變數狀態
                      </div>
                      <div style={{
                        background: COLORS.bg, borderRadius: 8, padding: '10px 14px',
                        fontFamily: 'monospace', fontSize: 12,
                        border: `1px solid ${svcData.status === 'online' ? COLORS.success + '55' : COLORS.warning + '55'}`,
                      }}>
                        <div style={{ color: COLORS.textLight }}>{svc.envKey}</div>
                        <div style={{ color: COLORS.text, marginTop: 2 }}>{svcData.masked || '已設定'}</div>
                        {svcData.botName && (
                          <div style={{ color: COLORS.success, marginTop: 4 }}>✅ Bot: @{svcData.botName}</div>
                        )}
                      </div>
                    </div>

                    {/* 測試發送 */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textLight, marginBottom: 8 }}>
                        🧪 測試發送（可選）
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <input
                          value={inputVal}
                          onChange={e => setTestInput(prev => ({
                            ...prev,
                            [svc.key]: { ...prev[svc.key],
                              [svc.key === 'telegram' ? 'chatId' : 'userId']: e.target.value
                            },
                          }))}
                          placeholder={inputPlaceholder}
                          style={{
                            flex: 1, padding: '7px 10px', borderRadius: 6, fontSize: 12,
                            border: `1px solid ${COLORS.border}`, outline: 'none',
                          }}
                        />
                      </div>
                      <button
                        onClick={() => handleTest(svc.key)}
                        disabled={isTesting}
                        style={{
                          width: '100%', padding: '8px 14px',
                          background: isTesting ? '#94a3b8' : svc.color,
                          color: 'white', border: 'none', borderRadius: 7,
                          cursor: isTesting ? 'not-allowed' : 'pointer',
                          fontSize: 13, fontWeight: 600,
                        }}
                      >
                        {isTesting ? '⏳ 測試中...' : (inputVal ? `📤 發送測試訊息` : '🔍 驗證連線')}
                      </button>

                      {/* 測試結果 */}
                      {result && (
                        <div style={{
                          marginTop: 10, padding: '10px 12px', borderRadius: 7,
                          background: result.success ? '#ecfdf5' : '#fff5f5',
                          border: `1px solid ${result.success ? COLORS.success + '55' : COLORS.danger + '55'}`,
                          fontSize: 12,
                        }}>
                          {result.success ? (
                            <div style={{ color: COLORS.success }}>
                              ✅ {result.message}
                              {result.bot?.displayName && (
                                <div style={{ marginTop: 4, color: COLORS.textLight }}>
                                  Bot：{result.bot.displayName}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ color: COLORS.danger }}>
                              ❌ {result.error || result.message}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                ) : (
                  /* ── 設定指引 ──────────────────────────────── */
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textLight, marginBottom: 10 }}>
                      🚀 快速設定
                    </div>

                    {/* Step 1 */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: COLORS.text, marginBottom: 6 }}>
                        Step 1：申請 {svc.key === 'telegram' ? 'Bot Token' : 'Channel Access Token'}
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 6 }}>
                        {svc.key === 'telegram'
                          ? '在 Telegram 搜尋 @BotFather，輸入 /newbot，依指示建立 Bot 並取得 Token'
                          : '前往 LINE Developers Console，建立 Messaging API Channel，複製 Channel Access Token'}
                      </div>
                      <a
                        href={svc.setupUrl} target="_blank" rel="noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          fontSize: 12, color: svc.color, textDecoration: 'none',
                          padding: '5px 10px', border: `1px solid ${svc.color}44`,
                          borderRadius: 6, background: svc.color + '10',
                        }}
                      >
                        🔗 {svc.docsLabel} →
                      </a>
                    </div>

                    {/* Step 2：env var */}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: COLORS.text, marginBottom: 6 }}>
                        Step 2：設定環境變數
                      </div>
                      <div style={{
                        background: '#1e293b', color: '#86efac',
                        borderRadius: 8, padding: '12px 16px',
                        fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8,
                      }}>
                        <div style={{ color: '#94a3b8' }}># .env</div>
                        <div>{svc.envKey}=your_token_here</div>
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.textLight, marginTop: 6 }}>
                        設定後重啟後端服務即可生效
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}

      {/* ── 整合場景說明 ─────────────────────────────────────── */}
      <Card>
        <SectionTitle>📋 AI Agent 通知場景</SectionTitle>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
        }}>
          {[
            { icon: '⏰', title: '截止日提醒', desc: '任務到期前 24 小時自動提醒負責人' },
            { icon: '🔴', title: '風險警示',   desc: '專案健康度變為紅燈時通知主管' },
            { icon: '✅', title: '任務完成',   desc: '里程碑達成時推播成就通知' },
            { icon: '📌', title: '任務指派',   desc: '新任務指派給成員時即時通知' },
            { icon: '📊', title: '週報摘要',   desc: '每週一早晨自動推播進度摘要' },
            { icon: '🚨', title: '逾期警報',   desc: '逾期任務每日彙整通知給 PM' },
          ].map(s => (
            <div key={s.title} style={{
              padding: '14px 16px', borderRadius: 10,
              background: COLORS.bg, border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.text, marginBottom: 4 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: COLORS.textLight }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Tab 4 — 外部 MCP 平台
// ════════════════════════════════════════════════════════════

function ExternalTab({ toolsData, loadingTools }) {
  if (loadingTools) return <Spinner />;
  const { tools = [], serverOnline = false } = toolsData || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card>
        <SectionTitle>
          🔌 外部 MCP Server 狀態
          <span style={{ marginLeft: 10 }}>
            <StatusLabel status={serverOnline ? 'online' : 'offline'} />
          </span>
        </SectionTitle>

        {/* ── 連線備注（端點速查） ── */}
        <div style={{
          background:   '#0f172a',
          borderRadius: 10,
          padding:      '16px 20px',
          fontFamily:   'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize:     13,
          lineHeight:   1.9,
          marginTop:    4,
          border:       '1px solid #1e293b',
          userSelect:   'text',
        }}>
          {/* Banner 標題列 */}
          <div style={{ color: '#94a3b8', marginBottom: 6, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            ╔══ xCloudPMIS MCP External Server &nbsp;
            <span style={{ color: '#38bdf8', fontWeight: 700 }}>v1.0.0</span>
            &nbsp;══╗
          </div>

          {/* 端點列表 */}
          {[
            { method: 'GET ', color: '#4ade80', path: '/mcp/discovery', note: '服務發現（能力列表）' },
            { method: 'GET ', color: '#4ade80', path: '/mcp/sse',       note: 'SSE 長連線（事件推播）' },
            { method: 'POST', color: '#fb923c', path: '/mcp/messages',  note: '工具呼叫入口' },
          ].map(({ method, color, path, note }) => (
            <div key={path} style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
              <span style={{ color: '#475569', minWidth: 18 }}>║ </span>
              <span style={{ color, minWidth: 44, fontWeight: 700 }}>{method}</span>
              <span style={{ color: '#e2e8f0' }}>
                http://localhost:<span style={{ color: '#f59e0b' }}>3100</span>
                <span style={{ color: '#a78bfa' }}>{path}</span>
              </span>
              <span style={{ color: '#475569', marginLeft: 10, fontSize: 11 }}>// {note}</span>
            </div>
          ))}

          <div style={{ color: '#94a3b8', marginTop: 6, fontSize: 11 }}>
            ╚═══════════════════════════════════════════════╝
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>🛠️ 已開放工具清單（{tools.length} 個）</SectionTitle>
        {tools.length === 0 ? (
          <EmptyState icon="🔌" text="無法取得工具清單，請確認 MCP Server 正在運行" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: COLORS.bg }}>
                  {['工具名稱', '說明', '今日呼叫', '平均延遲', '授權範圍', '狀態'].map(h => (
                    <th key={h} style={{
                      padding: '8px 12px', textAlign: 'left', fontWeight: 600,
                      color: COLORS.textLight, borderBottom: `1px solid ${COLORS.border}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tools.map((t, i) => (
                  <tr key={t.name} style={{
                    background: i % 2 === 0 ? COLORS.card : COLORS.bg,
                    borderBottom: `1px solid ${COLORS.border}33`,
                  }}>
                    <td style={{ padding: '8px 12px' }}>
                      <code style={{ fontSize: 12, background: '#e2e8f0', padding: '2px 6px', borderRadius: 4 }}>
                        {t.name}
                      </code>
                    </td>
                    <td style={{ padding: '8px 12px', color: COLORS.textLight, maxWidth: 240,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={t.description}>
                      {t.description}
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{t.callsToday}</td>
                    <td style={{ padding: '8px 12px', color: COLORS.textLight }}>
                      {t.avgLatency > 0 ? `${t.avgLatency} ms` : '—'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {t.scopes.map(s => (
                          <span key={s} style={{
                            fontSize: 10, background: COLORS.primary + '15', color: COLORS.primary,
                            padding: '1px 6px', borderRadius: 10, border: `1px solid ${COLORS.primary}33`,
                          }}>{s}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <Badge label={t.enabled ? '啟用' : '停用'}
                        color={t.enabled ? COLORS.success : COLORS.danger} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Tab 4 — API 金鑰管理
// ════════════════════════════════════════════════════════════

function ApiKeysTab() {
  const [keys, setKeys]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setCreate] = useState(false);
  const [newKey, setNewKey]     = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    systemName: '', companyId: '1',
    scopes: ['read:projects', 'read:tasks'],
  });

  const ALL_SCOPES = [
    'read:projects','write:projects','read:tasks','write:tasks',
    'read:team','write:team','read:reports','write:notifications',
    'rpa:execute',
  ];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/mcp/api-keys`);
      const d = await r.json();
      setKeys(d.data || []);
    } catch { setKeys([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.systemName) return;
    setCreating(true);
    try {
      const r = await fetch(`${API}/api/admin/mcp/api-keys`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, companyId: parseInt(form.companyId) }),
      });
      const d = await r.json();
      if (d.success) {
        setNewKey(d.data);
        setCreate(false);
        setForm({ systemName: '', companyId: '1', scopes: ['read:projects','read:tasks'] });
        load();
      }
    } catch {}
    setCreating(false);
  };

  const handleRevoke = async (id) => {
    if (!confirm('確定要撤銷此 API Key？操作無法復原。')) return;
    await fetch(`${API}/api/admin/mcp/api-keys/${id}`, { method: 'DELETE' });
    load();
  };

  const toggleScope = (s) => {
    setForm(f => ({
      ...f,
      scopes: f.scopes.includes(s) ? f.scopes.filter(x => x !== s) : [...f.scopes, s],
    }));
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* 新建 Key 成功提示 */}
      {newKey && (
        <div style={{
          background: '#ecfdf5', border: `1px solid ${COLORS.success}`,
          borderRadius: 10, padding: '16px 20px',
        }}>
          <div style={{ fontWeight: 700, color: COLORS.success, marginBottom: 8 }}>
            ✅ API Key 建立成功！請立即複製保存（只顯示一次）
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <code style={{
              flex: 1, background: '#fff', padding: '8px 12px', borderRadius: 6,
              fontSize: 13, border: `1px solid ${COLORS.success}44`, fontFamily: 'monospace',
            }}>
              {newKey.apiKey}
            </code>
            <button
              onClick={() => { navigator.clipboard?.writeText(newKey.apiKey); }}
              style={{
                padding: '8px 14px', background: COLORS.success, color: 'white',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}
            >
              📋 複製
            </button>
            <button
              onClick={() => setNewKey(null)}
              style={{
                padding: '8px 14px', background: '#e2e8f0', color: COLORS.text,
                border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
              }}
            >
              關閉
            </button>
          </div>
        </div>
      )}

      {/* 標題 + 建立按鈕 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>API 金鑰管理（{keys.length} 個）</div>
        <button
          onClick={() => setCreate(v => !v)}
          style={{
            padding: '8px 18px', background: COLORS.primary, color: 'white',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          ＋ 建立新金鑰
        </button>
      </div>

      {/* 建立表單 */}
      {showCreate && (
        <Card style={{ border: `2px solid ${COLORS.primary}44` }}>
          <SectionTitle>🔑 建立新 API Key</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ flex: 2 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textLight, display: 'block', marginBottom: 6 }}>
                  系統名稱 *
                </label>
                <input
                  value={form.systemName}
                  onChange={e => setForm(f => ({ ...f, systemName: e.target.value }))}
                  placeholder="例：Slack Bot、GitHub Webhook"
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 13,
                    border: `1px solid ${COLORS.border}`, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textLight, display: 'block', marginBottom: 6 }}>
                  Company ID
                </label>
                <input
                  value={form.companyId}
                  onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}
                  type="number" min="1"
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 13,
                    border: `1px solid ${COLORS.border}`, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textLight, display: 'block', marginBottom: 8 }}>
                權限範圍（Scopes）
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ALL_SCOPES.map(s => (
                  <label key={s} style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    background: form.scopes.includes(s) ? COLORS.primary + '18' : COLORS.bg,
                    border: `1px solid ${form.scopes.includes(s) ? COLORS.primary : COLORS.border}`,
                    borderRadius: 6, padding: '5px 10px', fontSize: 12,
                  }}>
                    <input
                      type="checkbox" checked={form.scopes.includes(s)}
                      onChange={() => toggleScope(s)} style={{ cursor: 'pointer' }}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setCreate(false)}
                style={{
                  padding: '8px 16px', background: '#e2e8f0', color: COLORS.text,
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                }}
              >
                取消
              </button>
              <button
                onClick={handleCreate} disabled={creating || !form.systemName}
                style={{
                  padding: '8px 18px',
                  background: creating || !form.systemName ? '#94a3b8' : COLORS.primary,
                  color: 'white', border: 'none', borderRadius: 6,
                  cursor: creating || !form.systemName ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                {creating ? '建立中...' : '建立 API Key'}
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Key 列表 */}
      <Card>
        {keys.length === 0 ? (
          <EmptyState icon="🔑" text="尚無 API Key，點擊上方按鈕建立第一個" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: COLORS.bg }}>
                  {['名稱', 'Key 前綴', '公司 ID', '權限範圍', '最後使用', '狀態', '操作'].map(h => (
                    <th key={h} style={{
                      padding: '8px 12px', textAlign: 'left', fontWeight: 600,
                      color: COLORS.textLight, borderBottom: `1px solid ${COLORS.border}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map((k, i) => (
                  <tr key={k.id} style={{
                    background: i % 2 === 0 ? COLORS.card : COLORS.bg,
                    borderBottom: `1px solid ${COLORS.border}33`,
                    opacity: k.is_active === false ? 0.5 : 1,
                  }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{k.system_name}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <code style={{ fontSize: 12, background: '#e2e8f0', padding: '2px 6px', borderRadius: 4 }}>
                        {k.key_prefix}
                      </code>
                    </td>
                    <td style={{ padding: '8px 12px', color: COLORS.textLight }}>#{k.company_id}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 280 }}>
                        {(k.scopes || []).slice(0, 3).map(s => (
                          <span key={s} style={{
                            fontSize: 10, background: COLORS.primary + '15', color: COLORS.primary,
                            padding: '1px 6px', borderRadius: 10,
                          }}>{s}</span>
                        ))}
                        {k.scopes?.length > 3 && (
                          <span style={{ fontSize: 10, color: COLORS.textLight }}>+{k.scopes.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px', color: COLORS.textLight, fontSize: 12 }}>
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleString('zh-TW') : '從未使用'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <Badge label={k.is_active !== false ? '啟用' : '已撤銷'}
                        color={k.is_active !== false ? COLORS.success : COLORS.danger} />
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {k.is_active !== false && (
                        <button
                          onClick={() => handleRevoke(k.id)}
                          style={{
                            padding: '4px 10px', background: COLORS.danger + '18',
                            color: COLORS.danger, border: `1px solid ${COLORS.danger}44`,
                            borderRadius: 6, cursor: 'pointer', fontSize: 12,
                          }}
                        >
                          撤銷
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Tab 5 — 工具日誌
// ════════════════════════════════════════════════════════════

function LogsTab() {
  const [logs, setLogs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);
  const [filter, setFilter] = useState({ success: '', tool: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (filter.success !== '') params.set('success', filter.success);
      if (filter.tool)           params.set('tool', filter.tool);
      const r = await fetch(`${API}/api/admin/mcp/logs?${params}`);
      const d = await r.json();
      setLogs(d.data || []);
      setTotal(d.pagination?.total || 0);
    } catch { setLogs([]); }
    setLoading(false);
  }, [page, filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* 篩選列 */}
      <Card style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={filter.success}
            onChange={e => { setFilter(f => ({ ...f, success: e.target.value })); setPage(1); }}
            style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${COLORS.border}`, fontSize: 13 }}
          >
            <option value="">全部狀態</option>
            <option value="true">✅ 成功</option>
            <option value="false">❌ 失敗</option>
          </select>
          <input
            value={filter.tool}
            onChange={e => { setFilter(f => ({ ...f, tool: e.target.value })); setPage(1); }}
            placeholder="篩選工具名稱..."
            style={{
              padding: '6px 10px', borderRadius: 6, border: `1px solid ${COLORS.border}`,
              fontSize: 13, width: 200,
            }}
          />
          <button onClick={load} style={{
            padding: '6px 14px', background: COLORS.primary, color: 'white',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
          }}>
            🔍 查詢
          </button>
          <span style={{ fontSize: 12, color: COLORS.textLight }}>共 {total} 筆</span>
        </div>
      </Card>

      {/* 日誌列表 */}
      <Card>
        {loading ? <Spinner /> : logs.length === 0 ? <EmptyState icon="📋" text="無符合的日誌記錄" /> : (
          <div>
            {logs.map(log => (
              <div key={log.id} style={{
                borderBottom: `1px solid ${COLORS.border}`,
                background: !log.success ? '#fff5f5' : 'transparent',
              }}>
                <div
                  onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 4px', cursor: 'pointer',
                  }}
                >
                  <StatusDot status={log.success ? 'online' : 'offline'} />
                  <code style={{
                    fontSize: 12, background: '#e2e8f0', padding: '2px 6px',
                    borderRadius: 4, minWidth: 200,
                  }}>
                    {log.toolName}
                  </code>
                  <span style={{ fontSize: 12, color: COLORS.textLight, flex: 1 }}>
                    {new Date(log.executedAt).toLocaleString('zh-TW')}
                  </span>
                  {log.durationMs && (
                    <span style={{ fontSize: 12, color: COLORS.textLight }}>{log.durationMs} ms</span>
                  )}
                  {!log.success && (
                    <span style={{ fontSize: 12, color: COLORS.danger, maxWidth: 240,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      ❌ {log.errorMessage}
                    </span>
                  )}
                  <span style={{ color: COLORS.textLight, fontSize: 12 }}>
                    {expanded === log.id ? '▲' : '▼'}
                  </span>
                </div>

                {expanded === log.id && (
                  <div style={{
                    background: '#1e293b', borderRadius: 6, padding: '12px 16px',
                    margin: '4px 0 12px', fontSize: 11, fontFamily: 'monospace',
                    color: '#e2e8f0', overflowX: 'auto', maxHeight: 300, overflowY: 'auto',
                  }}>
                    <div style={{ color: '#94a3b8', marginBottom: 8 }}>── Input ──</div>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(log.toolInput, null, 2)}
                    </pre>
                    {log.toolOutput && (
                      <>
                        <div style={{ color: '#94a3b8', margin: '8px 0' }}>── Output ──</div>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                          {JSON.stringify(log.toolOutput, null, 2)}
                        </pre>
                      </>
                    )}
                    {log.errorMessage && (
                      <>
                        <div style={{ color: '#f87171', margin: '8px 0' }}>── Error ──</div>
                        <pre style={{ margin: 0, color: '#f87171', whiteSpace: 'pre-wrap' }}>
                          {log.errorMessage}
                        </pre>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* 分頁 */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${COLORS.border}`,
                  cursor: page === 1 ? 'not-allowed' : 'pointer', background: COLORS.card, fontSize: 13 }}>
                ← 上一頁
              </button>
              <span style={{ padding: '6px 12px', fontSize: 13, color: COLORS.textLight }}>
                第 {page} 頁，共 {Math.ceil(total / 20)} 頁
              </span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 20)}
                style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${COLORS.border}`,
                  cursor: page >= Math.ceil(total / 20) ? 'not-allowed' : 'pointer', background: COLORS.card, fontSize: 13 }}>
                下一頁 →
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 主頁面元件
// ════════════════════════════════════════════════════════════

export default function McpConsolePage() {
  const [activeTab,   setActiveTab]   = useState('overview');
  const [status,      setStatus]      = useState(null);
  const [chart,       setChart]       = useState(null);
  const [toolsData,   setToolsData]   = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [loadingTools, setLoadingTools] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const refreshTimer = useRef(null);

  const loadStatus = useCallback(async () => {
    try {
      const [statusRes, chartRes] = await Promise.all([
        fetch(`${API}/api/admin/mcp/status`),
        fetch(`${API}/api/admin/mcp/chart/hourly`),
      ]);
      const [statusData, chartData] = await Promise.all([statusRes.json(), chartRes.json()]);
      setStatus(statusData);
      setChart(chartData);
      setLastRefresh(new Date());
    } catch {}
    setLoading(false);
  }, []);

  const loadTools = useCallback(async () => {
    setLoadingTools(true);
    try {
      const r = await fetch(`${API}/api/admin/mcp/tools`);
      setToolsData(await r.json());
    } catch {}
    setLoadingTools(false);
  }, []);

  useEffect(() => {
    loadStatus();
    loadTools();
    // 每 30 秒自動刷新
    refreshTimer.current = setInterval(loadStatus, 30_000);
    return () => clearInterval(refreshTimer.current);
  }, [loadStatus, loadTools]);

  return (
    <div style={{ padding: '24px 28px', background: COLORS.bg, minHeight: '100vh' }}>

      {/* ── 頁面標題 ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: COLORS.text }}>
            🌐 MCP 統一控制台
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: COLORS.textLight }}>
            管理 Microsoft 365 整合、外部開放平台、API 金鑰、Telegram / LINE 通知
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastRefresh && (
            <span style={{ fontSize: 12, color: COLORS.textLight }}>
              最後更新：{lastRefresh.toLocaleTimeString('zh-TW')}
            </span>
          )}
          <button
            onClick={() => { setLoading(true); loadStatus(); loadTools(); }}
            style={{
              padding: '7px 14px', background: COLORS.card, color: COLORS.text,
              border: `1px solid ${COLORS.border}`, borderRadius: 8,
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            🔄 刷新
          </button>
        </div>
      </div>

      {/* ── 服務狀態指示燈（頂部） ──────────────────────────── */}
      {status && (
        <div style={{
          display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap',
          padding: '12px 16px', background: COLORS.card,
          borderRadius: 10, border: `1px solid ${COLORS.border}`,
        }}>
          {[
            { label: 'MCP Server',   s: status.services.mcpExternalServer.status },
            { label: 'Microsoft',    s: status.services.microsoft.status },
            { label: 'AI Agent',     s: status.services.aiAgent.status },
            { label: 'Outlook',      s: status.services.microsoft.services?.outlook?.status },
            { label: 'Teams',        s: status.services.microsoft.services?.teams?.status },
            { label: 'SharePoint',   s: status.services.microsoft.services?.sharepoint?.status },
            { label: 'OneDrive',     s: status.services.microsoft.services?.onedrive?.status },
            { label: 'Loop',      s: status.services.microsoft.services?.loop?.status },
            { label: 'Telegram',  s: status.services.notify?.telegram?.status },
            { label: 'LINE',      s: status.services.notify?.line?.status },
          ].map(({ label, s }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
              <StatusDot status={s || 'offline'} />
              <span style={{ color: COLORS.textLight }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 子導覽 ──────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 24, overflowX: 'auto',
        borderBottom: `2px solid ${COLORS.border}`, paddingBottom: 0,
      }}>
        {SUB_NAV.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 18px', border: 'none', background: 'transparent',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
              color:       activeTab === tab.id ? COLORS.primary : COLORS.textLight,
              borderBottom: activeTab === tab.id ? `2px solid ${COLORS.primary}` : '2px solid transparent',
              marginBottom: -2,
              transition:  'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab 內容 ────────────────────────────────────────── */}
      {activeTab === 'overview'  && <OverviewTab   data={status} chart={chart} loading={loading} />}
      {activeTab === 'microsoft' && <MicrosoftTab  data={status} loading={loading} />}
      {activeTab === 'notify'    && <NotifyTab     data={status} loading={loading} />}
      {activeTab === 'external'  && <ExternalTab   toolsData={toolsData} loadingTools={loadingTools} />}
      {activeTab === 'apikeys'   && <ApiKeysTab />}
      {activeTab === 'logs'      && <LogsTab />}
    </div>
  );
}
