/**
 * components/ai/AiDecisionCenter.jsx
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS — AI 決策中心（Human-in-the-Loop 控制台）
 *
 * 版面配置：
 *   ┌──────────────────────────────────────────────────────┐
 *   │  頂部標題列（含「立即執行」按鈕 + 自動刷新指示）        │
 *   ├──────────┬──────────┬──────────┬────────────────────┤
 *   │ 待批准   │ 今日完成  │ 歷史回滾 │ 失敗次數            │
 *   ├──────────┴──────────┴──────────┴────────────────────┤
 *   │ 待批准決策佇列（Staging Queue）                        │
 *   │   [每筆：決策類型、影響範圍、推理摘要、批准/拒絕按鈕] │
 *   ├────────────────────────────────────────────────────┤
 *   │ 所有決策歷史（表格：可篩選狀態/Agent 類型/分頁）      │
 *   └──────────────────────────────────────────────────────┘
 *
 * 樣式：inline style（與專案其他元件一致，不依賴 Tailwind）
 */

import { useState, useCallback } from 'react';
import { useAiDecisions } from '../../hooks/useAiDecisions';
import AiModelSettingsModal from './AiModelSettingsModal';

// ── 常數 ───────────────────────────────────────────────────────
const T = {
  pageBg: 'linear-gradient(180deg, color-mix(in srgb, var(--xc-brand) 10%, var(--xc-bg) 90%) 0%, var(--xc-bg) 20%, var(--xc-bg-soft) 100%)',
  surface: 'var(--xc-surface)',
  surfaceSoft: 'var(--xc-surface-soft)',
  surfaceMuted: 'var(--xc-surface-muted)',
  surfaceStrong: 'var(--xc-surface-strong)',
  border: 'var(--xc-border)',
  borderStrong: 'var(--xc-border-strong)',
  text: 'var(--xc-text)',
  textSoft: 'var(--xc-text-soft)',
  textMuted: 'var(--xc-text-muted)',
  shadow: 'var(--xc-shadow)',
  shadowStrong: 'var(--xc-shadow-strong)',
  accent: 'var(--xc-brand)',
  accentDeep: 'var(--xc-brand-dark)',
  accentSoft: 'var(--xc-brand-soft)',
  success: 'var(--xc-success)',
  successSoft: 'var(--xc-success-soft)',
  warning: 'var(--xc-warning)',
  warningSoft: 'var(--xc-warning-soft)',
  danger: 'var(--xc-danger)',
  dangerSoft: 'var(--xc-danger-soft)',
  info: 'var(--xc-info)',
  infoSoft: 'var(--xc-info-soft)',
  panel: 'color-mix(in srgb, var(--xc-surface) 94%, transparent)',
  panelStrong: 'color-mix(in srgb, var(--xc-surface-strong) 84%, var(--xc-surface) 16%)',
};
const STATUS_CONFIG = {
  pending:     { color: 'var(--xc-text-soft)', bg: 'var(--xc-surface-muted)', label: '待執行' },
  staging:     { color: 'var(--xc-warning)', bg: 'color-mix(in srgb, var(--xc-warning) 16%, var(--xc-surface-strong))', label: '待批准' },
  approved:    { color: 'var(--xc-info)', bg: 'color-mix(in srgb, var(--xc-info) 16%, var(--xc-surface-strong))', label: '已批准' },
  executing:   { color: '#7c3aed', bg: 'color-mix(in srgb, #7c3aed 16%, var(--xc-surface-strong))', label: '執行中' },
  completed:   { color: 'var(--xc-success)', bg: 'color-mix(in srgb, var(--xc-success) 14%, var(--xc-surface-strong))', label: '已完成' },
  rejected:    { color: 'var(--xc-danger)', bg: 'color-mix(in srgb, var(--xc-danger) 14%, var(--xc-surface-strong))', label: '已拒絕' },
  rolled_back: { color: '#92400e', bg: 'color-mix(in srgb, var(--xc-warning) 16%, var(--xc-surface-strong))', label: '已回滾' },
  failed:      { color: 'var(--xc-danger)', bg: 'color-mix(in srgb, var(--xc-danger) 16%, var(--xc-surface-strong))', label: '失敗'   },
};

const RISK_CONFIG = {
  1: { color: 'var(--xc-success)', bg: 'color-mix(in srgb, var(--xc-success) 16%, var(--xc-surface-strong))', label: 'L1 自動' },
  2: { color: 'var(--xc-warning)', bg: 'color-mix(in srgb, var(--xc-warning) 16%, var(--xc-surface-strong))', label: 'L2 需批准' },
  3: { color: '#ea580c', bg: 'color-mix(in srgb, #ea580c 16%, var(--xc-surface-strong))', label: 'L3 人工審查' },
  4: { color: 'var(--xc-danger)', bg: 'color-mix(in srgb, var(--xc-danger) 16%, var(--xc-surface-strong))', label: 'L4 禁止' },
};

const AGENT_CONFIG = {
  scheduler: { emoji: '📅', label: '排程代理' },
  risk:      { emoji: '⚠️', label: '風險代理' },
  main:      { emoji: '🤖', label: '主代理' },
};

// ════════════════════════════════════════════════════════════
// 子元件：Badge
// ════════════════════════════════════════════════════════════

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { color: T.textSoft, bg: T.surfaceMuted, label: status };
  return (
    <span style={{
      display:      'inline-block',
      padding:      '2px 8px',
      borderRadius: 12,
      fontSize:     11,
      fontWeight:   700,
      color:        cfg.color,
      background:   cfg.bg,
      whiteSpace:   'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

function RiskBadge({ level }) {
  const cfg = RISK_CONFIG[level] || RISK_CONFIG[1];
  return (
    <span style={{
      display:      'inline-block',
      padding:      '2px 8px',
      borderRadius: 12,
      fontSize:     11,
      fontWeight:   700,
      color:        cfg.color,
      background:   cfg.bg,
      whiteSpace:   'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

// ════════════════════════════════════════════════════════════
// 子元件：統計卡片
// ════════════════════════════════════════════════════════════

function StatsCards({ stats }) {
  if (!stats) return null;

  const cards = [
    {
      label: '待批准決策',
      value: stats.stagingCount,
      icon:  '⏳',
      color: stats.stagingCount > 0 ? T.warning : T.textSoft,
      bg:    stats.stagingCount > 0 ? 'color-mix(in srgb, var(--xc-warning) 14%, var(--xc-surface-strong))' : T.panelStrong,
      desc:  '需要您審核批准',
      urgent: stats.stagingCount > 0,
    },
    {
      label: '今日自動完成',
      value: stats.completedToday,
      icon:  '✅',
      color: T.success,
      bg:    'color-mix(in srgb, var(--xc-success) 14%, var(--xc-surface-strong))',
      desc:  'L1 自動執行成功',
    },
    {
      label: '歷史回滾次數',
      value: stats.rolledBackTotal,
      icon:  '↩️',
      color: '#92400e',
      bg:    'color-mix(in srgb, var(--xc-warning) 12%, var(--xc-surface-strong))',
      desc:  '已還原的操作',
    },
    {
      label: '執行失敗',
      value: stats.failedTotal,
      icon:  '❌',
      color: stats.failedTotal > 0 ? T.danger : T.textSoft,
      bg:    stats.failedTotal > 0 ? 'color-mix(in srgb, var(--xc-danger) 14%, var(--xc-surface-strong))' : T.panelStrong,
      desc:  '需要檢查日誌',
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
      {cards.map(card => (
        <div
          key={card.label}
          style={{
            background:   card.bg,
            border:       `1px solid ${card.urgent ? card.color : T.border}`,
            borderRadius: 10,
            padding:      '16px 18px',
            position:     'relative',
            boxShadow:    card.urgent ? `0 0 0 2px ${card.color}33` : 'none',
            transition:   'box-shadow 0.2s',
          }}
        >
          {card.urgent && (
            <span style={{
              position: 'absolute', top: 10, right: 10,
              width: 8, height: 8, borderRadius: '50%',
              background: card.color,
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
          )}
          <div style={{ fontSize: 24, marginBottom: 4 }}>{card.icon}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: card.color, lineHeight: 1 }}>
            {card.value ?? '—'}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.textSoft, marginTop: 4 }}>
            {card.label}
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
            {card.desc}
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 子元件：Staging 佇列（待批准決策列表）
// ════════════════════════════════════════════════════════════

function StagingQueue({ decisions, onApprove, onReject, actionLoading }) {
  const staging = decisions.filter(d => d.status === 'staging');

  if (staging.length === 0) {
    return (
      <div style={s.card}>
        <SectionTitle icon="⏳" title="待批准決策佇列" count={0} />
        <div style={{ textAlign: 'center', padding: '32px 0', color: T.textMuted, fontSize: 14 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
          目前沒有待批准的 AI 決策，一切正常！
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...s.card, borderColor: T.warning, boxShadow: '0 0 0 2px color-mix(in srgb, var(--xc-warning) 18%, transparent)' }}>
      <SectionTitle icon="⏳" title="待批准決策佇列" count={staging.length} urgent />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {staging.map(d => (
          <StagingCard
            key={d.id}
            decision={d}
            onApprove={onApprove}
            onReject={onReject}
            disabled={actionLoading}
          />
        ))}
      </div>
    </div>
  );
}

function StagingCard({ decision: d, onApprove, onReject, disabled }) {
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const agent = AGENT_CONFIG[d.agentType] || { emoji: '🤖', label: d.agentLabel };

  const handleReject = useCallback(async () => {
    if (!rejectNote.trim()) return;
    const ok = await onReject(d.id, 1, rejectNote);
    if (ok) {
      setRejectMode(false);
      setRejectNote('');
    }
  }, [d.id, rejectNote, onReject]);

  return (
    <div style={{
      border: `1px solid color-mix(in srgb, var(--xc-warning) 24%, var(--xc-border))`,
      borderRadius: 8,
      background: 'color-mix(in srgb, var(--xc-warning) 10%, var(--xc-surface-strong))',
      overflow: 'hidden',
    }}>
      {/* 頂部：類型 + 風險等級 + 時間 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        background: 'color-mix(in srgb, var(--xc-warning) 18%, var(--xc-surface-strong))',
        borderBottom: `1px solid color-mix(in srgb, var(--xc-warning) 24%, var(--xc-border))`,
      }}>
        <span style={{ fontSize: 16 }}>{agent.emoji}</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#92400e' }}>
          [{agent.label}] {d.decisionType}
        </span>
        <RiskBadge level={d.riskLevel} />
        {d.project && (
        <span style={{ fontSize: 11, color: T.textSoft, marginLeft: 'auto' }}>
            📁 {d.project.name}
          </span>
        )}
        <span style={{ fontSize: 11, color: T.textMuted, whiteSpace: 'nowrap' }}>
          {formatRelTime(d.createdAt)}
        </span>
      </div>

      {/* 中間：影響任務 + 推理摘要 */}
      <div style={{ padding: '10px 14px' }}>
        {d.task && (
          <div style={{ fontSize: 12, color: T.textSoft, marginBottom: 6 }}>
            <span style={{ color: T.textSoft }}>影響任務：</span>
            <span style={{ fontWeight: 600 }}>#{d.task.id} {d.task.title}</span>
          </div>
        )}
        <DecisionTypeHint type={d.decisionType} />
      </div>

      {/* 拒絕原因輸入框 */}
      {rejectMode && (
        <div style={{ padding: '0 14px 10px' }}>
          <textarea
            value={rejectNote}
            onChange={e => setRejectNote(e.target.value)}
            placeholder="請輸入拒絕原因（必填）⋯"
            rows={2}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px', borderRadius: 6,
              border: `1px solid color-mix(in srgb, var(--xc-danger) 24%, var(--xc-border))`, fontSize: 12,
              fontFamily: 'inherit', resize: 'none', outline: 'none',
              background: T.surfaceStrong, color: T.text,
            }}
          />
        </div>
      )}

      {/* 操作按鈕 */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px 14px',
        background: T.panelStrong,
        borderTop: `1px solid color-mix(in srgb, var(--xc-warning) 24%, var(--xc-border))`,
      }}>
        {!rejectMode ? (
          <>
            <button
              onClick={() => onApprove(d.id, 1)}
              disabled={disabled}
              style={{ ...s.btn.approve, flex: 1 }}
            >
              ✅ 批准執行
            </button>
            <button
              onClick={() => setRejectMode(true)}
              disabled={disabled}
              style={{ ...s.btn.reject, flex: 1 }}
            >
              ❌ 拒絕
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleReject}
              disabled={disabled || !rejectNote.trim()}
              style={{
                ...s.btn.reject,
                flex: 1,
                opacity: rejectNote.trim() ? 1 : 0.5,
              }}
            >
              確認拒絕
            </button>
            <button
              onClick={() => { setRejectMode(false); setRejectNote(''); }}
              style={s.btn.cancel}
            >
              取消
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// 依決策類型顯示對應提示文字
function DecisionTypeHint({ type }) {
  const hints = {
    auto_firefight:     '🚒 自動救火：重新排程受影響任務並通知相關人員',
    reschedule_project: '📅 重新排程：調整專案時程以適應最新進度',
    risk_alert:         '⚠️  風險預警：偵測到高風險因子，建議預防措施',
    resource_rebalance: '👥 資源調配：重新分配工作負載以提升效率',
    deadline_warning:   '⏰ 截止日預警：關鍵里程碑即將到期',
  };
  const hint = hints[type];
  return hint ? (
    <div style={{ fontSize: 12, color: '#78350f', background: 'color-mix(in srgb, var(--xc-warning) 18%, var(--xc-surface-strong))', borderRadius: 4, padding: '4px 8px' }}>
      {hint}
    </div>
  ) : null;
}

// ════════════════════════════════════════════════════════════
// 子元件：決策歷史表格
// ════════════════════════════════════════════════════════════

function DecisionTable({
  decisions, total, pages, page, loading,
  status, agentType,
  setPage, setStatus, setAgentType,
  onRollback, onViewDetail,
  actionLoading,
}) {
  return (
    <div style={s.card}>
      <SectionTitle icon="📋" title="決策歷史" count={total} />

      {/* 篩選列 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1); }}
          style={s.select}
        >
          <option value="">全部狀態</option>
          <option value="staging">待批准</option>
          <option value="completed">已完成</option>
          <option value="rejected">已拒絕</option>
          <option value="rolled_back">已回滾</option>
          <option value="failed">失敗</option>
        </select>

        <select
          value={agentType}
          onChange={e => { setAgentType(e.target.value); setPage(1); }}
          style={s.select}
        >
          <option value="">全部代理</option>
          <option value="main">主代理</option>
          <option value="scheduler">排程代理</option>
          <option value="risk">風險代理</option>
        </select>

        {loading && (
          <span style={{ fontSize: 12, color: T.textMuted, alignSelf: 'center' }}>
            ⏳ 載入中⋯
          </span>
        )}
      </div>

      {/* 表格 */}
      <div style={{ overflowX: 'auto' }}>
        <table style={s.table}>
          <thead>
            <tr style={{ background: T.surfaceSoft }}>
              {['#', '代理', '決策類型', '關聯', '風險', '狀態', '時間', '操作'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {decisions.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: T.textMuted, fontSize: 13 }}>
                  {loading ? '載入中⋯' : '目前沒有符合條件的決策記錄'}
                </td>
              </tr>
            )}
            {decisions.map(d => {
              const agent = AGENT_CONFIG[d.agentType] || { emoji: '🤖', label: d.agentLabel };
              return (
                <tr key={d.id} style={s.tr}>
                  <td style={s.td}>
                    <span style={{ color: T.textSoft, fontSize: 12 }}>#{d.id}</span>
                  </td>
                  <td style={s.td}>
                    <span title={agent.label}>{agent.emoji} {agent.label}</span>
                  </td>
                  <td style={s.td}>
                    <span style={{ fontSize: 13 }}>{d.decisionType}</span>
                  </td>
                  <td style={s.td}>
                    {d.project
                      ? <span style={{ fontSize: 12, color: T.textSoft }}>📁 {d.project.name}</span>
                      : <span style={{ color: T.textMuted, fontSize: 12 }}>—</span>
                    }
                    {d.task && (
                      <div style={{ fontSize: 11, color: T.textSoft, marginTop: 2 }}>
                        ✅ {d.task.title?.slice(0, 20)}{d.task.title?.length > 20 ? '…' : ''}
                      </div>
                    )}
                  </td>
                  <td style={s.td}>
                    <RiskBadge level={d.riskLevel} />
                  </td>
                  <td style={s.td}>
                    <StatusBadge status={d.status} />
                  </td>
                  <td style={s.td}>
                    <span style={{ fontSize: 12, color: T.textSoft, whiteSpace: 'nowrap' }}>
                      {formatRelTime(d.createdAt)}
                    </span>
                  </td>
                  <td style={s.td}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {/* 查看詳情 */}
                      <button
                        onClick={() => onViewDetail(d.id)}
                        title="查看推理鏈詳情"
                        style={s.btn.icon}
                      >
                        🔍
                      </button>
                      {/* 回滾（只有 completed 且有 snapshotData）*/}
                      {d.status === 'completed' && d.snapshotData && (
                        <button
                          onClick={() => {
                            if (window.confirm(`確定要回滾決策 #${d.id}？此操作將恢復執行前的狀態。`))
                              onRollback(d.id, 1);
                          }}
                          disabled={actionLoading}
                          title="回滾到執行前狀態"
                          style={{ ...s.btn.icon, fontSize: 14 }}
                        >
                          ↩️
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 分頁 */}
      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 14 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{ ...s.btn.page, opacity: page <= 1 ? 0.4 : 1 }}
          >
            ‹ 上一頁
          </button>
          <span style={{ fontSize: 13, color: T.textSoft, alignSelf: 'center', padding: '0 8px' }}>
            第 {page} / {pages} 頁
          </span>
          <button
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page >= pages}
            style={{ ...s.btn.page, opacity: page >= pages ? 0.4 : 1 }}
          >
            下一頁 ›
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 子元件：決策詳情彈窗（Modal）
// ════════════════════════════════════════════════════════════

function DecisionDetailModal({ detail, onClose }) {
  if (!detail) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: T.surface,
        borderRadius: 12,
        width: '100%', maxWidth: 760,
        maxHeight: '85vh',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: T.shadowStrong,
        border: `1px solid ${T.border}`,
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>
            {AGENT_CONFIG[detail.agentType]?.emoji || '🤖'}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>
              決策 #{detail.id}：{detail.decisionType}
            </div>
            <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2 }}>
              {detail.agentLabel} · {new Date(detail.createdAt).toLocaleString('zh-TW')}
              {detail.project && ` · 📁 ${detail.project.name}`}
            </div>
          </div>
          <StatusBadge status={detail.status} />
          <RiskBadge level={detail.riskLevel} />
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: T.textSoft, padding: 4 }}
          >
            ✕
          </button>
        </div>

        {/* Body（滾動區） */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {/* CoT 推理過程 */}
          <Section title="🧠 推理過程（Chain of Thought）">
            <pre style={s.pre}>{detail.reasoning || '（無推理記錄）'}</pre>
          </Section>

          {/* 計劃 */}
          {detail.plan && (
            <Section title="📋 計劃動作">
              <pre style={s.pre}>{JSON.stringify(detail.plan, null, 2)}</pre>
            </Section>
          )}

          {/* 執行結果 */}
          {detail.actions && Array.isArray(detail.actions) && detail.actions.length > 0 && (
            <Section title="⚡ 執行結果">
              <pre style={s.pre}>{JSON.stringify(detail.actions, null, 2)}</pre>
            </Section>
          )}

          {/* 反思 */}
          {detail.reflection && (
            <Section title="💭 反思">
              <pre style={{ ...s.pre, background: 'var(--xc-success-soft)', color: '#166534' }}>
                {detail.reflection}
              </pre>
            </Section>
          )}

          {/* 執行日誌 */}
          {detail.logs?.length > 0 && (
            <Section title={`📜 工具呼叫日誌（${detail.logs.length} 筆）`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {detail.logs.map(log => (
                  <div
                    key={log.id}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: log.success ? 'color-mix(in srgb, var(--xc-success) 12%, var(--xc-surface-strong))' : 'color-mix(in srgb, var(--xc-danger) 12%, var(--xc-surface-strong))',
                      border: `1px solid ${log.success ? 'color-mix(in srgb, var(--xc-success) 22%, var(--xc-border))' : 'color-mix(in srgb, var(--xc-danger) 22%, var(--xc-border))'}`,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: log.success ? '#166534' : '#991b1b' }}>
                        {log.success ? '✅' : '❌'} {log.toolName}
                      </span>
                      <span style={{ color: T.textMuted, fontSize: 11 }}>
                        {log.durationMs != null ? `${log.durationMs}ms` : ''}
                        {' '}· {new Date(log.executedAt).toLocaleTimeString('zh-TW')}
                      </span>
                    </div>
                    {log.errorMessage && (
                      <div style={{ color: '#dc2626', fontSize: 11, marginTop: 2 }}>
                        {log.errorMessage}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 主元件：AiDecisionCenter
// ════════════════════════════════════════════════════════════

export default function AiDecisionCenter() {
  const {
    stats, decisions, total, pages,
    loading, error, actionLoading, actionError,
    page, status, agentType,
    setPage, setStatus, setAgentType,
    refresh, approveDecision, rejectDecision,
    rollbackDecision, getDecisionDetail, runAgentNow,
    clearActionError,
  } = useAiDecisions({ autoRefresh: true });

  // 詳情彈窗狀態
  const [detailModal, setDetailModal] = useState(null);

  // AI 模型設定 Modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [runMessage, setRunMessage] = useState('');

  const handleViewDetail = useCallback(async (id) => {
    setDetailLoading(true);
    const data = await getDecisionDetail(id);
    setDetailModal(data);
    setDetailLoading(false);
  }, [getDecisionDetail]);

  const handleRunNow = useCallback(async (dryRun) => {
    const msg = await runAgentNow(dryRun);
    if (msg) {
      setRunMessage(msg);
      setTimeout(() => setRunMessage(''), 8000);
    }
  }, [runAgentNow]);

  return (
    <div style={{ minHeight: '100%', background: T.pageBg, padding: '24px clamp(18px, 3vw, 32px) 32px', color: T.text }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* ── 頁面標題列 ──────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
          padding: '20px 22px',
          borderRadius: 24,
          background: T.panel,
          border: `1px solid ${T.border}`,
          boxShadow: T.shadow,
        }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: T.text }}>
              🤖 AI 決策中心
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: T.textSoft }}>
              Human-in-the-Loop 控制台 · 每 30 秒自動刷新
              {stats?.stagingCount > 0 && (
                <span style={{ color: T.warning, fontWeight: 700, marginLeft: 8 }}>
                  ⚠️ {stats.stagingCount} 個決策等待您的審核
                </span>
              )}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleRunNow(true)}
              disabled={actionLoading}
              title="分析模式：只分析不執行，安全測試用"
              style={{ ...s.btn.secondary, fontSize: 12 }}
            >
              🔍 分析模式
            </button>
            <button
              onClick={() => handleRunNow(false)}
              disabled={actionLoading}
              title="立即觸發 AI Agent Loop 執行一次"
              style={{ ...s.btn.primary }}
            >
              {actionLoading ? '⏳ 執行中⋯' : '▶️ 立即執行 Agent'}
            </button>
            <button
              onClick={refresh}
              disabled={loading}
              style={{ ...s.btn.secondary }}
              title="手動刷新"
            >
              🔄
            </button>
            <button
              onClick={() => setSettingsOpen(v => !v)}
              style={{
                ...s.btn.secondary,
                ...(settingsOpen ? { border: `1px solid ${T.accent}`, color: T.accent } : {}),
              }}
              title={settingsOpen ? '收起設定' : 'AI 模型設定'}
            >
              ⚙️
            </button>
          </div>
        </div>

        {/* ── AI 模型設定 Modal ──────────────────────────────────── */}
        <AiModelSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          companyId={2}
        />

        {/* ── 操作結果提示 ──────────────────────────────────────── */}
        {runMessage && (
          <div style={{
            marginBottom: 16, padding: '10px 14px',
            background: T.infoSoft, border: `1px solid ${T.borderStrong}`,
            borderRadius: 8, fontSize: 13, color: T.info,
          }}>
            ℹ️ {runMessage}
          </div>
        )}

        {(actionError || error) && (
          <div style={{
            marginBottom: 16, padding: '10px 14px',
            background: T.dangerSoft, border: `1px solid color-mix(in srgb, var(--xc-danger) 22%, var(--xc-border))`,
            borderRadius: 8, fontSize: 13, color: T.danger,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>❌ {actionError || error}</span>
            <button
              onClick={clearActionError}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ── 統計卡片 ──────────────────────────────────────────── */}
        {loading && !stats ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: T.textMuted }}>
            ⏳ 載入中⋯
          </div>
        ) : (
          <StatsCards stats={stats} />
        )}

        {/* ── 待批准佇列 ─────────────────────────────────────────── */}
        <StagingQueue
          decisions={decisions}
          onApprove={approveDecision}
          onReject={rejectDecision}
          actionLoading={actionLoading}
        />

        {/* 間距 */}
        <div style={{ height: 16 }} />

        {/* ── 決策歷史表格 ───────────────────────────────────────── */}
        <DecisionTable
          decisions={decisions}
          total={total}
          pages={pages}
          page={page}
          loading={loading}
          status={status}
          agentType={agentType}
          setPage={setPage}
          setStatus={setStatus}
          setAgentType={setAgentType}
          onRollback={rollbackDecision}
          onViewDetail={handleViewDetail}
          actionLoading={actionLoading || detailLoading}
        />

        {/* ── 詳情彈窗 ───────────────────────────────────────────── */}
        {detailModal && (
          <DecisionDetailModal
            detail={detailModal}
            onClose={() => setDetailModal(null)}
          />
        )}

        {/* 注入動畫 CSS */}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%  { opacity: 0.5; transform: scale(1.2); }
          }
        `}</style>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 子元件小工具
// ════════════════════════════════════════════════════════════

function SectionTitle({ icon, title, count, urgent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{title}</span>
      {count != null && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700,
          background: urgent ? T.warningSoft : T.surfaceMuted,
          color:      urgent ? '#92400e' : T.textSoft,
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: T.textSoft, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 工具函式
// ════════════════════════════════════════════════════════════

function formatRelTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return '剛才';
  if (mins < 60) return `${mins} 分鐘前`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24) return `${hrs} 小時前`;
  return new Date(iso).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
}

// ════════════════════════════════════════════════════════════
// 樣式物件
// ════════════════════════════════════════════════════════════

const s = {
  card: {
    background:   T.surface,
    border:       `1px solid ${T.border}`,
    borderRadius: 10,
    padding:      '18px 20px',
    boxShadow:    T.shadow,
  },
  table: {
    width:           '100%',
    borderCollapse:  'collapse',
    fontSize:        13,
  },
  th: {
    padding:    '8px 10px',
    textAlign:  'left',
    fontWeight: 600,
    fontSize:   12,
    color:      T.textSoft,
    whiteSpace: 'nowrap',
    borderBottom: `1px solid ${T.border}`,
  },
  td: {
    padding:     '9px 10px',
    borderBottom: `1px solid ${T.border}`,
    verticalAlign: 'middle',
  },
  tr: {
    transition: 'background 0.1s',
  },
  select: {
    padding:      '6px 10px',
    border:       `1px solid ${T.borderStrong}`,
    borderRadius: 6,
    fontSize:     13,
    color:        T.textSoft,
    background:   T.surfaceStrong,
    cursor:       'pointer',
    outline:      'none',
  },
  pre: {
    fontSize:    12,
    color:       T.textSoft,
    background:  T.surfaceSoft,
    border:      `1px solid ${T.border}`,
    borderRadius: 6,
    padding:     10,
    margin:      0,
    overflowX:   'auto',
    whiteSpace:  'pre-wrap',
    wordBreak:   'break-word',
    maxHeight:   300,
    overflowY:   'auto',
  },
  btn: {
    primary: {
      background:   T.accent,
      color:        'white',
      border:       'none',
      borderRadius: 8,
      padding:      '8px 16px',
      fontSize:     13,
      fontWeight:   600,
      cursor:       'pointer',
    },
    secondary: {
      background:   T.surfaceStrong,
      color:        T.textSoft,
      border:       `1px solid ${T.borderStrong}`,
      borderRadius: 8,
      padding:      '8px 14px',
      fontSize:     13,
      cursor:       'pointer',
    },
    approve: {
      background:   T.success,
      color:        'white',
      border:       'none',
      borderRadius: 6,
      padding:      '7px 14px',
      fontSize:     12,
      fontWeight:   700,
      cursor:       'pointer',
    },
    reject: {
      background:   T.surfaceStrong,
      color:        T.danger,
      border:       `1px solid color-mix(in srgb, var(--xc-danger) 22%, var(--xc-border))`,
      borderRadius: 6,
      padding:      '7px 14px',
      fontSize:     12,
      fontWeight:   700,
      cursor:       'pointer',
    },
    cancel: {
      background:   T.surfaceMuted,
      color:        T.textSoft,
      border:       `1px solid ${T.border}`,
      borderRadius: 6,
      padding:      '7px 12px',
      fontSize:     12,
      cursor:       'pointer',
    },
    icon: {
      background:   'none',
      border:       `1px solid ${T.border}`,
      borderRadius: 5,
      padding:      '3px 6px',
      fontSize:     13,
      cursor:       'pointer',
    },
    page: {
      background:   T.surfaceStrong,
      color:        T.textSoft,
      border:       `1px solid ${T.borderStrong}`,
      borderRadius: 6,
      padding:      '6px 14px',
      fontSize:     13,
      cursor:       'pointer',
    },
  },
};
