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
const STATUS_CONFIG = {
  pending:     { color: '#6b7280', bg: '#f3f4f6', label: '待執行' },
  staging:     { color: '#d97706', bg: '#fffbeb', label: '待批准' },
  approved:    { color: '#2563eb', bg: '#eff6ff', label: '已批准' },
  executing:   { color: '#7c3aed', bg: '#f5f3ff', label: '執行中' },
  completed:   { color: '#059669', bg: '#ecfdf5', label: '已完成' },
  rejected:    { color: '#dc2626', bg: '#fef2f2', label: '已拒絕' },
  rolled_back: { color: '#92400e', bg: '#fffbeb', label: '已回滾' },
  failed:      { color: '#dc2626', bg: '#fee2e2', label: '失敗'   },
};

const RISK_CONFIG = {
  1: { color: '#059669', bg: '#d1fae5', label: 'L1 自動' },
  2: { color: '#d97706', bg: '#fef3c7', label: 'L2 需批准' },
  3: { color: '#ea580c', bg: '#ffedd5', label: 'L3 人工審查' },
  4: { color: '#dc2626', bg: '#fee2e2', label: 'L4 禁止' },
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
  const cfg = STATUS_CONFIG[status] || { color: '#6b7280', bg: '#f3f4f6', label: status };
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
      color: stats.stagingCount > 0 ? '#d97706' : '#6b7280',
      bg:    stats.stagingCount > 0 ? '#fffbeb' : '#f9fafb',
      desc:  '需要您審核批准',
      urgent: stats.stagingCount > 0,
    },
    {
      label: '今日自動完成',
      value: stats.completedToday,
      icon:  '✅',
      color: '#059669',
      bg:    '#ecfdf5',
      desc:  'L1 自動執行成功',
    },
    {
      label: '歷史回滾次數',
      value: stats.rolledBackTotal,
      icon:  '↩️',
      color: '#92400e',
      bg:    '#fffbeb',
      desc:  '已還原的操作',
    },
    {
      label: '執行失敗',
      value: stats.failedTotal,
      icon:  '❌',
      color: stats.failedTotal > 0 ? '#dc2626' : '#6b7280',
      bg:    stats.failedTotal > 0 ? '#fef2f2' : '#f9fafb',
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
            border:       `1px solid ${card.urgent ? card.color : '#e5e7eb'}`,
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
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginTop: 4 }}>
            {card.label}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
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
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 14 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
          目前沒有待批准的 AI 決策，一切正常！
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...s.card, borderColor: '#f59e0b', boxShadow: '0 0 0 2px #fef3c733' }}>
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
      border: '1px solid #fcd34d',
      borderRadius: 8,
      background: '#fffbeb',
      overflow: 'hidden',
    }}>
      {/* 頂部：類型 + 風險等級 + 時間 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        background: 'rgba(253,230,138,0.3)',
        borderBottom: '1px solid #fcd34d',
      }}>
        <span style={{ fontSize: 16 }}>{agent.emoji}</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#92400e' }}>
          [{agent.label}] {d.decisionType}
        </span>
        <RiskBadge level={d.riskLevel} />
        {d.project && (
          <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 'auto' }}>
            📁 {d.project.name}
          </span>
        )}
        <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>
          {formatRelTime(d.createdAt)}
        </span>
      </div>

      {/* 中間：影響任務 + 推理摘要 */}
      <div style={{ padding: '10px 14px' }}>
        {d.task && (
          <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>
            <span style={{ color: '#6b7280' }}>影響任務：</span>
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
              border: '1px solid #fca5a5', fontSize: 12,
              fontFamily: 'inherit', resize: 'none', outline: 'none',
            }}
          />
        </div>
      )}

      {/* 操作按鈕 */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px 14px',
        background: 'rgba(255,255,255,0.6)',
        borderTop: '1px solid #fef3c7',
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
    <div style={{ fontSize: 12, color: '#78350f', background: '#fef9c3', borderRadius: 4, padding: '4px 8px' }}>
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
          <span style={{ fontSize: 12, color: '#9ca3af', alignSelf: 'center' }}>
            ⏳ 載入中⋯
          </span>
        )}
      </div>

      {/* 表格 */}
      <div style={{ overflowX: 'auto' }}>
        <table style={s.table}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['#', '代理', '決策類型', '關聯', '風險', '狀態', '時間', '操作'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {decisions.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', fontSize: 13 }}>
                  {loading ? '載入中⋯' : '目前沒有符合條件的決策記錄'}
                </td>
              </tr>
            )}
            {decisions.map(d => {
              const agent = AGENT_CONFIG[d.agentType] || { emoji: '🤖', label: d.agentLabel };
              return (
                <tr key={d.id} style={s.tr}>
                  <td style={s.td}>
                    <span style={{ color: '#6b7280', fontSize: 12 }}>#{d.id}</span>
                  </td>
                  <td style={s.td}>
                    <span title={agent.label}>{agent.emoji} {agent.label}</span>
                  </td>
                  <td style={s.td}>
                    <span style={{ fontSize: 13 }}>{d.decisionType}</span>
                  </td>
                  <td style={s.td}>
                    {d.project
                      ? <span style={{ fontSize: 12, color: '#374151' }}>📁 {d.project.name}</span>
                      : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                    }
                    {d.task && (
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
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
                    <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
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
          <span style={{ fontSize: 13, color: '#6b7280', alignSelf: 'center', padding: '0 8px' }}>
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
        background: 'white',
        borderRadius: 12,
        width: '100%', maxWidth: 760,
        maxHeight: '85vh',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>
            {AGENT_CONFIG[detail.agentType]?.emoji || '🤖'}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>
              決策 #{detail.id}：{detail.decisionType}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {detail.agentLabel} · {new Date(detail.createdAt).toLocaleString('zh-TW')}
              {detail.project && ` · 📁 ${detail.project.name}`}
            </div>
          </div>
          <StatusBadge status={detail.status} />
          <RiskBadge level={detail.riskLevel} />
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280', padding: 4 }}
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
              <pre style={{ ...s.pre, background: '#f0fdf4', color: '#166534' }}>
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
                      background: log.success ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${log.success ? '#bbf7d0' : '#fecaca'}`,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: log.success ? '#166534' : '#991b1b' }}>
                        {log.success ? '✅' : '❌'} {log.toolName}
                      </span>
                      <span style={{ color: '#9ca3af', fontSize: 11 }}>
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
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>

      {/* ── 頁面標題列 ──────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#111827' }}>
            🤖 AI 決策中心
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
            Human-in-the-Loop 控制台 · 每 30 秒自動刷新
            {stats?.stagingCount > 0 && (
              <span style={{ color: '#d97706', fontWeight: 700, marginLeft: 8 }}>
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
            onClick={() => setSettingsOpen(true)}
            style={{ ...s.btn.secondary }}
            title="AI 模型設定"
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
          background: '#eff6ff', border: '1px solid #93c5fd',
          borderRadius: 8, fontSize: 13, color: '#1d4ed8',
        }}>
          ℹ️ {runMessage}
        </div>
      )}

      {(actionError || error) && (
        <div style={{
          marginBottom: 16, padding: '10px 14px',
          background: '#fef2f2', border: '1px solid #fca5a5',
          borderRadius: 8, fontSize: 13, color: '#dc2626',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>❌ {actionError || error}</span>
          <button
            onClick={clearActionError}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── 統計卡片 ──────────────────────────────────────────── */}
      {loading && !stats ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
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
  );
}

// ════════════════════════════════════════════════════════════
// 子元件小工具
// ════════════════════════════════════════════════════════════

function SectionTitle({ icon, title, count, urgent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{title}</span>
      {count != null && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700,
          background: urgent ? '#fef3c7' : '#f3f4f6',
          color:      urgent ? '#92400e' : '#6b7280',
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
      <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 6 }}>{title}</div>
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
    background:   'white',
    border:       '1px solid #e5e7eb',
    borderRadius: 10,
    padding:      '18px 20px',
    boxShadow:    '0 1px 3px rgba(0,0,0,0.04)',
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
    color:      '#374151',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid #e5e7eb',
  },
  td: {
    padding:     '9px 10px',
    borderBottom: '1px solid #f3f4f6',
    verticalAlign: 'middle',
  },
  tr: {
    transition: 'background 0.1s',
  },
  select: {
    padding:      '6px 10px',
    border:       '1px solid #d1d5db',
    borderRadius: 6,
    fontSize:     13,
    color:        '#374151',
    background:   'white',
    cursor:       'pointer',
    outline:      'none',
  },
  pre: {
    fontSize:    12,
    color:       '#374151',
    background:  '#f8fafc',
    border:      '1px solid #e2e8f0',
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
      background:   '#3b82f6',
      color:        'white',
      border:       'none',
      borderRadius: 8,
      padding:      '8px 16px',
      fontSize:     13,
      fontWeight:   600,
      cursor:       'pointer',
    },
    secondary: {
      background:   'white',
      color:        '#374151',
      border:       '1px solid #d1d5db',
      borderRadius: 8,
      padding:      '8px 14px',
      fontSize:     13,
      cursor:       'pointer',
    },
    approve: {
      background:   '#059669',
      color:        'white',
      border:       'none',
      borderRadius: 6,
      padding:      '7px 14px',
      fontSize:     12,
      fontWeight:   700,
      cursor:       'pointer',
    },
    reject: {
      background:   'white',
      color:        '#dc2626',
      border:       '1px solid #fca5a5',
      borderRadius: 6,
      padding:      '7px 14px',
      fontSize:     12,
      fontWeight:   700,
      cursor:       'pointer',
    },
    cancel: {
      background:   '#f3f4f6',
      color:        '#6b7280',
      border:       'none',
      borderRadius: 6,
      padding:      '7px 12px',
      fontSize:     12,
      cursor:       'pointer',
    },
    icon: {
      background:   'none',
      border:       '1px solid #e5e7eb',
      borderRadius: 5,
      padding:      '3px 6px',
      fontSize:     13,
      cursor:       'pointer',
    },
    page: {
      background:   'white',
      color:        '#374151',
      border:       '1px solid #d1d5db',
      borderRadius: 6,
      padding:      '6px 14px',
      fontSize:     13,
      cursor:       'pointer',
    },
  },
};
