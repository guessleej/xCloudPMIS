/**
 * TeamPage — 團隊管理頁面
 *
 * 版面配置：
 *   ┌──────────────────────────────────────────────────────┐
 *   │ 頁面標題 + 統計摘要列 + 新增成員按鈕                  │
 *   ├──────────────────────────────────────────────────────┤
 *   │ 成員卡片網格                                          │
 *   │  ┌─────────────────┐  ┌─────────────────┐  ...      │
 *   │  │ 大頭貼（字母）    │  │ 大頭貼（字母）    │          │
 *   │  │ 姓名 + 角色徽章   │  │ ...              │          │
 *   │  │ Email            │  │                  │          │
 *   │  │ 工作量指標列      │  │                  │          │
 *   │  │ 參與專案標籤      │  │                  │          │
 *   │  └─────────────────┘  └─────────────────┘          │
 *   └──────────────────────────────────────────────────────┘
 *
 *   點擊成員卡片 → 右側滑出詳情面板（任務列表 + 最近工時記錄）
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

// ── 常數 ─────────────────────────────────────────────────────
const API_BASE   = '';

const T = {
  pageBg: 'linear-gradient(180deg, color-mix(in srgb, var(--xc-brand) 10%, var(--xc-bg) 90%) 0%, var(--xc-bg) 18%, var(--xc-bg-soft) 100%)',
  surface: 'var(--xc-surface)',
  surfaceStrong: 'var(--xc-surface-strong)',
  surfaceSoft: 'var(--xc-surface-soft)',
  surfaceMuted: 'var(--xc-surface-muted)',
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
  danger: 'var(--xc-danger)',
  dangerSoft: 'var(--xc-danger-soft)',
  warning: 'var(--xc-warning)',
  warningSoft: 'var(--xc-warning-soft)',
  panel: 'color-mix(in srgb, var(--xc-surface) 94%, transparent)',
  panelStrong: 'color-mix(in srgb, var(--xc-surface-strong) 84%, var(--xc-surface) 16%)',
};

// ── 角色樣式對照 ──────────────────────────────────────────────
const ROLE_STYLE = {
  admin:  { bg: 'color-mix(in srgb, var(--xc-warning) 16%, var(--xc-surface-strong))', text: '#92400e', label: '系統管理員', icon: '👑' },
  pm:     { bg: 'color-mix(in srgb, var(--xc-info) 16%, var(--xc-surface-strong))', text: '#1e40af', label: '專案經理',  icon: '📋' },
  member: { bg: 'var(--xc-surface-muted)', text: 'var(--xc-text-soft)', label: '一般成員',  icon: '👤' },
};

// ── 任務狀態樣式 ──────────────────────────────────────────────
const STATUS_STYLE = {
  todo:        { bg: 'var(--xc-surface-muted)', text: 'var(--xc-text-soft)', label: '待處理' },
  in_progress: { bg: 'color-mix(in srgb, var(--xc-info) 16%, var(--xc-surface-strong))', text: '#1d4ed8', label: '進行中' },
  review:      { bg: 'color-mix(in srgb, var(--xc-warning) 16%, var(--xc-surface-strong))', text: '#d97706', label: '審查中' },
  done:        { bg: 'color-mix(in srgb, var(--xc-success) 16%, var(--xc-surface-strong))', text: '#065f46', label: '已完成' },
};
const PRIORITY_STYLE = {
  urgent: { text: 'var(--xc-danger)', label: '緊急' },
  high:   { text: '#ea580c', label: '高'   },
  medium: { text: '#ca8a04', label: '中'   },
  low:    { text: 'var(--xc-text-soft)', label: '低'   },
};

// ── 大頭貼背景色（依 ID 循環） ───────────────────────────────
const AVATAR_COLORS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#14b8a6', '#f97316',
];
const avatarColor = (id) => AVATAR_COLORS[id % AVATAR_COLORS.length];

// ── 工具函式 ─────────────────────────────────────────────────
const fmtTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-TW', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// ════════════════════════════════════════════════════════════
// 成員大頭貼元件（顯示姓名首字）
// ════════════════════════════════════════════════════════════
function Avatar({ name, id, size = 48 }) {
  const initial = name ? name.slice(0, 1) : '?';
  return (
    <div style={{
      width:          size,
      height:         size,
      borderRadius:   '50%',
      background:     avatarColor(id),
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      color:          'white',
      fontSize:       size * 0.4,
      fontWeight:     '700',
      flexShrink:     0,
      userSelect:     'none',
    }}>
      {initial}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 工作量進度條（任務完成比例）
// ════════════════════════════════════════════════════════════
function WorkloadBar({ done, total }) {
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{
        flex: 1, height: '4px', background: T.surfaceMuted, borderRadius: '2px',
      }}>
        <div style={{
          width:      `${pct}%`,
          height:     '100%',
          background: pct >= 80 ? T.success : pct >= 40 ? T.accent : '#f59e0b',
          borderRadius: '2px',
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: '11px', color: T.textMuted, minWidth: '28px' }}>
        {pct}%
      </span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 成員卡片
// ════════════════════════════════════════════════════════════
function MemberCard({ member, isSelected, onClick }) {
  const role  = ROLE_STYLE[member.role]  || ROLE_STYLE.member;

  return (
    <div
      onClick={onClick}
      style={{
        background:   T.panelStrong,
        border:       `2px solid ${isSelected ? T.accent : T.border}`,
        borderRadius: '14px',
        padding:      '20px',
        cursor:       'pointer',
        boxShadow:    isSelected
          ? '0 0 0 3px color-mix(in srgb, var(--xc-brand) 18%, transparent)'
          : T.shadow,
        transition:   'all 0.15s',
        position:     'relative',
        opacity:      member.isActive ? 1 : 0.6,
      }}
      onMouseOver={e => {
        if (!isSelected) e.currentTarget.style.borderColor = T.borderStrong;
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = T.shadowStrong;
      }}
      onMouseOut={e => {
        if (!isSelected) e.currentTarget.style.borderColor = T.border;
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = isSelected
          ? '0 0 0 3px color-mix(in srgb, var(--xc-brand) 18%, transparent)'
          : T.shadow;
      }}
    >
      {/* 停用標籤 */}
      {!member.isActive && (
        <div style={{
          position:   'absolute',
          top:        '10px',
          right:      '10px',
          background: T.dangerSoft,
          color:      T.danger,
          fontSize:   '10px',
          fontWeight: '600',
          padding:    '2px 6px',
          borderRadius: '4px',
        }}>
          已停用
        </div>
      )}

      {/* 頂部：大頭貼 + 姓名 + 角色 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
        <Avatar name={member.name} id={member.id} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '15px', fontWeight: '700', color: T.text,
            marginBottom: '4px',
          }}>
            {member.name}
          </div>
          {/* 角色徽章 */}
          <span style={{
            background: role.bg, color: role.text,
            fontSize: '11px', fontWeight: '600',
            padding: '2px 8px', borderRadius: '10px',
          }}>
            {role.icon} {role.label}
          </span>
        </div>
      </div>

      {/* Email */}
      <div style={{
        fontSize:    '12px',
        color:       T.textMuted,
        marginBottom: '12px',
        overflow:    'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:  'nowrap',
      }}>
        ✉️ {member.email}
      </div>

      {/* 工作量進度條 */}
      {member.totalTasks > 0 && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: '11px', color: T.textMuted, marginBottom: '4px',
          }}>
            <span>任務完成率</span>
            <span>{member.completedTasks}/{member.totalTasks}</span>
          </div>
          <WorkloadBar done={member.completedTasks} total={member.totalTasks} />
        </div>
      )}

      {/* 統計指標格 */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap:                 '6px',
        marginBottom:        '12px',
      }}>
        {[
          { icon: '📋', value: member.totalTasks,       label: '任務' },
          { icon: '🔵', value: member.activeTasks,      label: '進行中' },
          { icon: '⏱️', value: member.totalTimeDisplay, label: '工時' },
        ].map((stat, i) => (
          <div key={i} style={{
            background: T.surfaceSoft, borderRadius: '6px', padding: '6px 4px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '16px', marginBottom: '1px' }}>{stat.icon}</div>
            <div style={{
              fontSize: '11px', fontWeight: '700', color: T.textSoft,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '10px', color: T.textMuted }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* 參與專案標籤 */}
      {member.projects.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {member.projects.slice(0, 2).map(p => (
            <span key={p.id} style={{
              background: T.accentSoft, color: T.accentDeep,
              fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
              maxWidth: '120px', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {p.name}
            </span>
          ))}
          {member.projects.length > 2 && (
            <span style={{
              background: T.surfaceMuted, color: T.textMuted,
              fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
            }}>
              +{member.projects.length - 2}
            </span>
          )}
        </div>
      ) : (
        <div style={{ fontSize: '11px', color: T.textMuted }}>尚未參與任何專案</div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 成員詳情側邊面板
// ════════════════════════════════════════════════════════════
function DetailPanel({ memberId, companyId, onClose, onRoleChange, onToggleActive }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('tasks'); // tasks | timelog | projects

  useEffect(() => {
    if (!memberId) return;
    setLoading(true);
    fetch(`${API_BASE}/api/team/${memberId}?companyId=${companyId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [memberId, companyId]);

  if (loading) return (
    <PanelShell onClose={onClose} title="載入中...">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', fontSize: '32px' }}>
        ⏳
      </div>
    </PanelShell>
  );
  if (!data) return null;

  const { member, tasks, recentEntries, ownedProjects } = data;
  const role = ROLE_STYLE[member.role] || ROLE_STYLE.member;

  return (
    <PanelShell onClose={onClose} title={member.name}>
      {/* ── 成員基本資料 ──────────────────────────────────── */}
      <div style={{ padding: '20px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <Avatar name={member.name} id={member.id} size={64} />
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: T.text }}>
              {member.name}
              {!member.isActive && (
                <span style={{
                  marginLeft: '8px', background: T.dangerSoft, color: T.danger,
                  fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: '600',
                }}>已停用</span>
              )}
            </div>
            <div style={{ fontSize: '13px', color: T.textMuted, marginTop: '2px' }}>{member.email}</div>
            <div style={{ marginTop: '6px' }}>
              <span style={{
                background: role.bg, color: role.text,
                fontSize: '12px', fontWeight: '600',
                padding: '3px 10px', borderRadius: '10px',
              }}>
                {role.icon} {role.label}
              </span>
            </div>
          </div>
        </div>

        {/* 任務統計小卡 */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px',
        }}>
          {[
            { label: '待處理', value: member.taskCounts.todo,        bg: STATUS_STYLE.todo.bg, text: STATUS_STYLE.todo.text },
            { label: '進行中', value: member.taskCounts.in_progress,  bg: STATUS_STYLE.in_progress.bg, text: STATUS_STYLE.in_progress.text },
            { label: '審查中', value: member.taskCounts.review,       bg: STATUS_STYLE.review.bg, text: STATUS_STYLE.review.text },
            { label: '已完成', value: member.taskCounts.done,         bg: STATUS_STYLE.done.bg, text: STATUS_STYLE.done.text },
          ].map((s, i) => (
            <div key={i} style={{
              background: s.bg, borderRadius: '8px', padding: '8px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: s.text }}>{s.value}</div>
              <div style={{ fontSize: '10px', color: s.text, opacity: 0.8 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* 工時 */}
        <div style={{
          marginTop: '10px', padding: '10px 14px',
          background: T.surfaceSoft, borderRadius: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '13px', color: T.textMuted }}>⏱️ 累計工時</span>
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>
            {member.totalTimeDisplay}
          </span>
        </div>
      </div>

      {/* ── 操作按鈕 ─────────────────────────────────────── */}
      <div style={{
        padding:  '12px 20px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', gap: '8px', flexWrap: 'wrap',
      }}>
        {/* 角色快速切換 */}
        {['admin', 'pm', 'member'].map(r => (
          <button
            key={r}
            onClick={() => onRoleChange(member.id, r)}
            disabled={member.role === r}
            style={{
              background:   member.role === r ? `${ROLE_STYLE[r].bg}` : T.surfaceStrong,
              color:        member.role === r ? ROLE_STYLE[r].text : T.textMuted,
              border:       `1px solid ${member.role === r ? 'transparent' : T.border}`,
              borderRadius: '6px',
              padding:      '5px 12px',
              fontSize:     '12px',
              fontWeight:   member.role === r ? '600' : '400',
              cursor:       member.role === r ? 'default' : 'pointer',
            }}
          >
            {ROLE_STYLE[r].icon} {ROLE_STYLE[r].label}
          </button>
        ))}
        {/* 啟用/停用 */}
        <button
          onClick={() => onToggleActive(member.id, !member.isActive)}
          style={{
            marginLeft:   'auto',
            background:   member.isActive ? T.dangerSoft : T.successSoft,
            color:        member.isActive ? T.danger : T.success,
            border:       'none',
            borderRadius: '6px',
            padding:      '5px 12px',
            fontSize:     '12px',
            fontWeight:   '600',
            cursor:       'pointer',
          }}
        >
          {member.isActive ? '⛔ 停用帳號' : '✅ 重新啟用'}
        </button>
      </div>

      {/* ── Tab 切換 ─────────────────────────────────────── */}
      <div style={{
        display: 'flex', borderBottom: `1px solid ${T.border}`, background: T.surfaceSoft,
      }}>
        {[
          { id: 'tasks',    label: `任務（${tasks.length}）` },
          { id: 'timelog',  label: `工時（${recentEntries.length}）` },
          { id: 'projects', label: `專案（${ownedProjects.length}）` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex:       1,
              padding:    '10px',
              background: tab === t.id ? T.surfaceStrong : 'transparent',
              border:     'none',
              borderBottom: tab === t.id ? `2px solid ${T.accent}` : '2px solid transparent',
              fontSize:   '12px',
              fontWeight: tab === t.id ? '600' : '400',
              color:      tab === t.id ? T.accentDeep : T.textMuted,
              cursor:     'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab 內容 ─────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>

        {/* 任務列表 */}
        {tab === 'tasks' && (
          tasks.length === 0 ? (
            <EmptyState icon="📭" text="尚無指派任務" />
          ) : tasks.map(t => (
            <div key={t.id} style={{
              padding: '12px 20px',
              borderBottom: `1px solid ${T.border}`,
              display: 'flex', alignItems: 'flex-start', gap: '10px',
            }}>
              <span style={{
                background: STATUS_STYLE[t.status]?.bg,
                color:      STATUS_STYLE[t.status]?.text,
                fontSize:   '10px', fontWeight: '600',
                padding:    '2px 6px', borderRadius: '4px',
                whiteSpace: 'nowrap', marginTop: '2px',
              }}>
                {STATUS_STYLE[t.status]?.label}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '13px', color: T.text, fontWeight: '500',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {t.title}
                </div>
                <div style={{ fontSize: '11px', color: T.textMuted, marginTop: '2px', display: 'flex', gap: '8px' }}>
                  <span>{t.projectName}</span>
                  <span style={{ color: PRIORITY_STYLE[t.priority]?.text }}>
                    ● {t.priorityLabel}
                  </span>
                  {t.dueDate && <span>截止 {t.dueDate}</span>}
                </div>
              </div>
            </div>
          ))
        )}

        {/* 工時記錄 */}
        {tab === 'timelog' && (
          recentEntries.length === 0 ? (
            <EmptyState icon="⏱️" text="尚無工時記錄" />
          ) : recentEntries.map(e => (
            <div key={e.id} style={{
              padding: '12px 20px',
              borderBottom: `1px solid ${T.border}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '13px', color: T.text, fontWeight: '500', flex: 1, marginRight: '8px' }}>
                  {e.taskTitle}
                </div>
                <div style={{
                  fontSize: '13px', fontWeight: '700', color: T.textSoft,
                  whiteSpace: 'nowrap',
                }}>
                  {e.durationDisplay}
                </div>
              </div>
              <div style={{ fontSize: '11px', color: T.textMuted, marginTop: '3px', display: 'flex', gap: '8px' }}>
                <span>{e.projectName}</span>
                <span>{e.date}</span>
              </div>
              {e.description && (
                <div style={{ fontSize: '11px', color: T.textSoft, marginTop: '3px', fontStyle: 'italic' }}>
                  {e.description}
                </div>
              )}
            </div>
          ))
        )}

        {/* 管理的專案 */}
        {tab === 'projects' && (
          ownedProjects.length === 0 ? (
            <EmptyState icon="📁" text="未管理任何專案" />
          ) : ownedProjects.map(p => (
            <div key={p.id} style={{
              padding: '14px 20px',
              borderBottom: `1px solid ${T.border}`,
              display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: p.status === 'active' ? T.success
                  : p.status === 'completed' ? T.accent
                  : T.textMuted,
              }} />
              <span style={{ fontSize: '14px', color: T.text, fontWeight: '500' }}>
                {p.name}
              </span>
            </div>
          ))
        )}
      </div>
    </PanelShell>
  );
}

// 側邊面板外框
function PanelShell({ children, onClose, title }) {
  return (
    <div style={{
      width:        '380px',
      flexShrink:   0,
      background:   T.panelStrong,
      borderLeft:   `1px solid ${T.border}`,
      display:      'flex',
      flexDirection: 'column',
      overflow:     'hidden',
      boxShadow:    T.shadowStrong,
    }}>
      {/* 面板標頭 */}
      <div style={{
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding:    '16px 20px',
        borderBottom: `1px solid ${T.border}`,
        background: T.surfaceSoft,
      }}>
        <span style={{ fontWeight: '700', fontSize: '15px', color: T.text }}>{title}</span>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '20px', color: T.textMuted, lineHeight: 1, padding: '2px 4px',
          }}
        >
          ×
        </button>
      </div>
      {children}
    </div>
  );
}

// 空狀態
function EmptyState({ icon, text }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '48px 0', gap: '10px',
    }}>
      <div style={{ fontSize: '36px' }}>{icon}</div>
      <div style={{ fontSize: '13px', color: T.textMuted }}>{text}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 新增成員 Modal
// ════════════════════════════════════════════════════════════
function AddMemberModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'member' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const update = (k, v) => { setForm(p => ({ ...p, [k]: v })); setError(''); };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError('姓名與 Email 為必填欄位');
      return;
    }
    setSubmitting(true);
    const result = await onSubmit(form);
    if (result?.error) setError(result.error);
    setSubmitting(false);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.panelStrong, borderRadius: '16px',
          width: '440px', boxShadow: T.shadowStrong, border: `1px solid ${T.border}`,
        }}
      >
        {/* 標頭 */}
        <div style={{
          padding: '20px 24px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: T.text }}>
            👥 新增成員
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '22px', color: T.textMuted, lineHeight: 1,
          }}>×</button>
        </div>

        <div style={{ padding: '20px 24px 24px' }}>
          {/* 姓名 */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>姓名 *</label>
            <input
              type="text" value={form.name}
              onChange={e => update('name', e.target.value)}
              placeholder="例：張小華"
              style={inputStyle}
            />
          </div>

          {/* Email */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Email *</label>
            <input
              type="email" value={form.email}
              onChange={e => update('email', e.target.value)}
              placeholder="例：xiaohua@company.com"
              style={inputStyle}
            />
          </div>

          {/* 角色 */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>角色</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['admin', 'pm', 'member'].map(r => {
                const rs = ROLE_STYLE[r];
                return (
                  <button
                    key={r}
                    onClick={() => update('role', r)}
                    style={{
                      flex:       1,
                      padding:    '10px 8px',
                      border:     `2px solid ${form.role === r ? rs.text : T.border}`,
                      borderRadius: '10px',
                      background: form.role === r ? rs.bg : T.surfaceStrong,
                      color:      form.role === r ? rs.text : T.textMuted,
                      cursor:     'pointer',
                      fontSize:   '12px',
                      fontWeight: form.role === r ? '700' : '400',
                      textAlign:  'center',
                    }}
                  >
                    <div style={{ fontSize: '18px', marginBottom: '4px' }}>{rs.icon}</div>
                    <div>{rs.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 預設密碼提示 */}
          <div style={{
            padding: '10px 14px',
            background: T.warningSoft,
            borderRadius: '8px',
            fontSize: '12px', color: '#92400e',
            marginBottom: '16px',
          }}>
            🔑 預設密碼：<strong>Welcome@123</strong>（首次登入請立即修改）
          </div>

          {/* 錯誤訊息 */}
          {error && (
            <div style={{
              padding: '8px 12px',
              background: T.dangerSoft, color: T.danger,
              borderRadius: '6px', fontSize: '13px',
              marginBottom: '14px',
            }}>
              {error}
            </div>
          )}

          {/* 按鈕 */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={cancelBtnStyle}>取消</button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                ...primaryBtnStyle,
                opacity: submitting ? 0.6 : 1,
                cursor:  submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? '⏳ 新增中...' : '➕ 新增成員'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 共用按鈕樣式 ─────────────────────────────────────────────
const labelStyle = {
  display: 'block', fontSize: '13px', fontWeight: '600',
  color: T.textSoft, marginBottom: '6px',
};
const inputStyle = {
  width: '100%', padding: '9px 12px',
  border: `1px solid ${T.borderStrong}`, borderRadius: '8px',
  fontSize: '14px', color: T.text,
  outline: 'none', boxSizing: 'border-box', background: T.surfaceStrong,
};
const primaryBtnStyle = {
  background: T.accent, color: 'white',
  border: 'none', borderRadius: '8px',
  padding: '9px 20px', fontSize: '14px',
  fontWeight: '600', cursor: 'pointer',
};
const cancelBtnStyle = {
  background: T.surfaceMuted, color: T.textSoft,
  border: `1px solid ${T.border}`, borderRadius: '8px',
  padding: '9px 20px', fontSize: '14px',
  fontWeight: '500', cursor: 'pointer',
};

// ════════════════════════════════════════════════════════════
// 主元件：TeamPage
// ════════════════════════════════════════════════════════════
export default function TeamPage() {
  const { user } = useAuth();
  const COMPANY_ID = user?.companyId;

  const [members,     setMembers]     = useState([]);
  const [summary,     setSummary]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [selectedId,  setSelectedId]  = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterRole,  setFilterRole]  = useState('all'); // all | admin | pm | member

  // ── 載入成員列表 ─────────────────────────────────────────
  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${API_BASE}/api/team?companyId=${COMPANY_ID}`);
      if (!res.ok) throw new Error('資料載入失敗');
      const data = await res.json();
      setMembers(data.members);
      setSummary(data.summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMembers(); }, []);

  // ── 新增成員 ─────────────────────────────────────────────
  const handleAddMember = async (form) => {
    try {
      const res  = await fetch(`${API_BASE}/api/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, companyId: COMPANY_ID }),
      });
      const json = await res.json();
      if (!res.ok) return { error: json.error || '新增失敗' };
      setShowAddModal(false);
      await loadMembers();
      return null;
    } catch {
      return { error: '網路錯誤，請稍後再試' };
    }
  };

  // ── 變更角色 ─────────────────────────────────────────────
  const handleRoleChange = async (id, role) => {
    try {
      const res = await fetch(`${API_BASE}/api/team/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) { alert('角色更新失敗'); return; }
      await loadMembers();
    } catch {
      alert('網路錯誤');
    }
  };

  // ── 啟用/停用帳號 ────────────────────────────────────────
  const handleToggleActive = async (id, isActive) => {
    const action = isActive ? '重新啟用' : '停用';
    const target = members.find(m => m.id === id);
    if (!target) return;
    if (!window.confirm(`確定要${action}「${target.name}」的帳號嗎？`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/team/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) { alert(`${action}失敗`); return; }
      await loadMembers();
    } catch {
      alert('網路錯誤');
    }
  };

  // ── 篩選後的成員列表 ─────────────────────────────────────
  const filteredMembers = filterRole === 'all'
    ? members
    : members.filter(m => m.role === filterRole);

  // ═══════════════════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════════════════
  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      height:        '100vh',
      background:    T.pageBg,
    }}>
      {/* ── 頁面標題列 ─────────────────────────────────── */}
      <div style={{
        background:   T.panelStrong,
        borderBottom: `1px solid ${T.border}`,
        padding:      '14px 24px',
        flexShrink:   0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: summary ? '14px' : 0,
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: T.text }}>
              👥 團隊管理
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: T.textMuted }}>
              管理公司成員、角色與工作量分配
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              background: T.accent, color: 'white',
              border: 'none', borderRadius: '8px',
              padding: '8px 18px', fontSize: '13px', fontWeight: '600',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              boxShadow: '0 8px 20px rgba(199,0,24,0.22)',
            }}
          >
            ➕ 新增成員
          </button>
        </div>

        {/* 統計摘要列 */}
        {summary && (
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {[
              { label: '成員總數',     value: summary.totalMembers },
              { label: '系統管理員',   value: summary.adminCount },
              { label: '專案經理',     value: summary.pmCount },
              { label: '一般成員',     value: summary.memberCount },
              { label: '已分配任務',   value: summary.totalTasksAssigned },
              { label: '累計工時',     value: summary.totalHoursLogged },
            ].map((s, i) => (
              <div key={i} style={{ fontSize: '13px', color: T.textMuted }}>
                <span style={{ fontWeight: '700', color: T.text, marginRight: '4px' }}>
                  {s.value}
                </span>
                {s.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 主要內容區 ─────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* 左側：成員網格 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* 角色篩選 Tab */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '18px' }}>
            {[
              { id: 'all',    label: `全部（${members.length}）` },
              { id: 'admin',  label: `👑 管理員（${members.filter(m => m.role === 'admin').length}）` },
              { id: 'pm',     label: `📋 專案經理（${members.filter(m => m.role === 'pm').length}）` },
              { id: 'member', label: `👤 一般成員（${members.filter(m => m.role === 'member').length}）` },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilterRole(f.id)}
                style={{
                  background:   filterRole === f.id ? T.accent : T.surfaceStrong,
                  color:        filterRole === f.id ? 'white'   : T.textMuted,
                  border:       `1px solid ${T.border}`,
                  borderRadius: '8px',
                  padding:      '6px 14px',
                  fontSize:     '13px',
                  fontWeight:   filterRole === f.id ? '600' : '400',
                  cursor:       'pointer',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* 載入中 */}
          {loading && (
            <div style={{
              display: 'flex', justifyContent: 'center',
              alignItems: 'center', height: '200px',
              flexDirection: 'column', gap: '16px',
            }}>
              <div style={{ fontSize: '40px' }}>⏳</div>
              <div style={{ color: T.textMuted }}>載入中...</div>
            </div>
          )}

          {/* 錯誤 */}
          {!loading && error && (
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              height: '200px', flexDirection: 'column', gap: '12px',
            }}>
              <div style={{ fontSize: '40px' }}>😢</div>
              <div style={{ color: T.danger }}>{error}</div>
              <button onClick={loadMembers} style={primaryBtnStyle}>重試</button>
            </div>
          )}

          {/* 成員網格 */}
          {!loading && !error && (
            <>
              {filteredMembers.length === 0 ? (
                <div style={{
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  height: '200px', flexDirection: 'column', gap: '12px',
                }}>
                  <div style={{ fontSize: '40px' }}>👤</div>
                  <div style={{ color: T.textMuted }}>此分類尚無成員</div>
                </div>
              ) : (
                <div style={{
                  display:             'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap:                 '14px',
                }}>
                  {filteredMembers.map(m => (
                    <MemberCard
                      key={m.id}
                      member={m}
                      isSelected={selectedId === m.id}
                      onClick={() => setSelectedId(prev => prev === m.id ? null : m.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 右側：詳情面板（有選中成員時顯示） */}
        {selectedId && (
          <DetailPanel
            memberId={selectedId}
            companyId={COMPANY_ID}
            onClose={() => setSelectedId(null)}
            onRoleChange={async (id, role) => {
              await handleRoleChange(id, role);
            }}
            onToggleActive={async (id, isActive) => {
              await handleToggleActive(id, isActive);
            }}
          />
        )}
      </div>

      {/* ── 新增成員 Modal ─────────────────────────────── */}
      {showAddModal && (
        <AddMemberModal
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddMember}
        />
      )}
    </div>
  );
}
