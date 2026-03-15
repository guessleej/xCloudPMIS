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

// ── 常數 ─────────────────────────────────────────────────────
const API_BASE   = 'http://localhost:3010';
const COMPANY_ID = 2;

// ── 角色樣式對照 ──────────────────────────────────────────────
const ROLE_STYLE = {
  admin:  { bg: '#fef3c7', text: '#92400e', label: '系統管理員', icon: '👑' },
  pm:     { bg: '#dbeafe', text: '#1e40af', label: '專案經理',  icon: '📋' },
  member: { bg: '#f3f4f6', text: '#374151', label: '一般成員',  icon: '👤' },
};

// ── 任務狀態樣式 ──────────────────────────────────────────────
const STATUS_STYLE = {
  todo:        { bg: '#f3f4f6', text: '#6b7280', label: '待處理' },
  in_progress: { bg: '#dbeafe', text: '#1d4ed8', label: '進行中' },
  review:      { bg: '#fef3c7', text: '#d97706', label: '審查中' },
  done:        { bg: '#d1fae5', text: '#065f46', label: '已完成' },
};
const PRIORITY_STYLE = {
  urgent: { text: '#dc2626', label: '緊急' },
  high:   { text: '#ea580c', label: '高'   },
  medium: { text: '#ca8a04', label: '中'   },
  low:    { text: '#6b7280', label: '低'   },
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
        flex: 1, height: '4px', background: '#e5e7eb', borderRadius: '2px',
      }}>
        <div style={{
          width:      `${pct}%`,
          height:     '100%',
          background: pct >= 80 ? '#10b981' : pct >= 40 ? '#3b82f6' : '#f59e0b',
          borderRadius: '2px',
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: '11px', color: '#9ca3af', minWidth: '28px' }}>
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
        background:   'white',
        border:       `2px solid ${isSelected ? '#3b82f6' : '#e5e7eb'}`,
        borderRadius: '14px',
        padding:      '20px',
        cursor:       'pointer',
        boxShadow:    isSelected
          ? '0 0 0 3px rgba(59,130,246,0.15)'
          : '0 1px 3px rgba(0,0,0,0.05)',
        transition:   'all 0.15s',
        position:     'relative',
        opacity:      member.isActive ? 1 : 0.6,
      }}
      onMouseOver={e => {
        if (!isSelected) e.currentTarget.style.borderColor = '#93c5fd';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
      }}
      onMouseOut={e => {
        if (!isSelected) e.currentTarget.style.borderColor = '#e5e7eb';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = isSelected
          ? '0 0 0 3px rgba(59,130,246,0.15)'
          : '0 1px 3px rgba(0,0,0,0.05)';
      }}
    >
      {/* 停用標籤 */}
      {!member.isActive && (
        <div style={{
          position:   'absolute',
          top:        '10px',
          right:      '10px',
          background: '#fee2e2',
          color:      '#dc2626',
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
            fontSize: '15px', fontWeight: '700', color: '#111827',
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
        color:       '#9ca3af',
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
            fontSize: '11px', color: '#9ca3af', marginBottom: '4px',
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
            background: '#f8fafc', borderRadius: '6px', padding: '6px 4px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '16px', marginBottom: '1px' }}>{stat.icon}</div>
            <div style={{
              fontSize: '11px', fontWeight: '700', color: '#374151',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '10px', color: '#9ca3af' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* 參與專案標籤 */}
      {member.projects.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {member.projects.slice(0, 2).map(p => (
            <span key={p.id} style={{
              background: '#eff6ff', color: '#1d4ed8',
              fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
              maxWidth: '120px', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {p.name}
            </span>
          ))}
          {member.projects.length > 2 && (
            <span style={{
              background: '#f3f4f6', color: '#9ca3af',
              fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
            }}>
              +{member.projects.length - 2}
            </span>
          )}
        </div>
      ) : (
        <div style={{ fontSize: '11px', color: '#d1d5db' }}>尚未參與任何專案</div>
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
      <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <Avatar name={member.name} id={member.id} size={64} />
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#111827' }}>
              {member.name}
              {!member.isActive && (
                <span style={{
                  marginLeft: '8px', background: '#fee2e2', color: '#dc2626',
                  fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: '600',
                }}>已停用</span>
              )}
            </div>
            <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>{member.email}</div>
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
            { label: '待處理', value: member.taskCounts.todo,        bg: '#f3f4f6', text: '#6b7280' },
            { label: '進行中', value: member.taskCounts.in_progress,  bg: '#dbeafe', text: '#1d4ed8' },
            { label: '審查中', value: member.taskCounts.review,       bg: '#fef3c7', text: '#d97706' },
            { label: '已完成', value: member.taskCounts.done,         bg: '#d1fae5', text: '#065f46' },
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
          background: '#f8fafc', borderRadius: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '13px', color: '#6b7280' }}>⏱️ 累計工時</span>
          <span style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>
            {member.totalTimeDisplay}
          </span>
        </div>
      </div>

      {/* ── 操作按鈕 ─────────────────────────────────────── */}
      <div style={{
        padding:  '12px 20px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex', gap: '8px', flexWrap: 'wrap',
      }}>
        {/* 角色快速切換 */}
        {['admin', 'pm', 'member'].map(r => (
          <button
            key={r}
            onClick={() => onRoleChange(member.id, r)}
            disabled={member.role === r}
            style={{
              background:   member.role === r ? `${ROLE_STYLE[r].bg}` : 'white',
              color:        member.role === r ? ROLE_STYLE[r].text : '#6b7280',
              border:       `1px solid ${member.role === r ? 'transparent' : '#e5e7eb'}`,
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
            background:   member.isActive ? '#fef2f2' : '#f0fdf4',
            color:        member.isActive ? '#dc2626' : '#16a34a',
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
        display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#f8fafc',
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
              background: tab === t.id ? 'white' : 'transparent',
              border:     'none',
              borderBottom: tab === t.id ? '2px solid #3b82f6' : '2px solid transparent',
              fontSize:   '12px',
              fontWeight: tab === t.id ? '600' : '400',
              color:      tab === t.id ? '#1d4ed8' : '#9ca3af',
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
              borderBottom: '1px solid #f3f4f6',
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
                  fontSize: '13px', color: '#111827', fontWeight: '500',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {t.title}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px', display: 'flex', gap: '8px' }}>
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
              borderBottom: '1px solid #f3f4f6',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '13px', color: '#111827', fontWeight: '500', flex: 1, marginRight: '8px' }}>
                  {e.taskTitle}
                </div>
                <div style={{
                  fontSize: '13px', fontWeight: '700', color: '#374151',
                  whiteSpace: 'nowrap',
                }}>
                  {e.durationDisplay}
                </div>
              </div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px', display: 'flex', gap: '8px' }}>
                <span>{e.projectName}</span>
                <span>{e.date}</span>
              </div>
              {e.description && (
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px', fontStyle: 'italic' }}>
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
              borderBottom: '1px solid #f3f4f6',
              display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: p.status === 'active' ? '#10b981'
                  : p.status === 'completed' ? '#3b82f6'
                  : '#9ca3af',
              }} />
              <span style={{ fontSize: '14px', color: '#111827', fontWeight: '500' }}>
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
      background:   'white',
      borderLeft:   '1px solid #e5e7eb',
      display:      'flex',
      flexDirection: 'column',
      overflow:     'hidden',
      boxShadow:    '-4px 0 20px rgba(0,0,0,0.06)',
    }}>
      {/* 面板標頭 */}
      <div style={{
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding:    '16px 20px',
        borderBottom: '1px solid #e5e7eb',
        background: '#f8fafc',
      }}>
        <span style={{ fontWeight: '700', fontSize: '15px', color: '#111827' }}>{title}</span>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '20px', color: '#9ca3af', lineHeight: 1, padding: '2px 4px',
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
      <div style={{ fontSize: '13px', color: '#9ca3af' }}>{text}</div>
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
    const result = await onSubmit({ ...form, companyId: COMPANY_ID });
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
          background: 'white', borderRadius: '16px',
          width: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        {/* 標頭 */}
        <div style={{
          padding: '20px 24px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#111827' }}>
            👥 新增成員
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '22px', color: '#9ca3af', lineHeight: 1,
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
                      border:     `2px solid ${form.role === r ? rs.text : '#e5e7eb'}`,
                      borderRadius: '10px',
                      background: form.role === r ? rs.bg : 'white',
                      color:      form.role === r ? rs.text : '#9ca3af',
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
            background: '#fffbeb',
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
              background: '#fee2e2', color: '#dc2626',
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
  color: '#374151', marginBottom: '6px',
};
const inputStyle = {
  width: '100%', padding: '9px 12px',
  border: '1px solid #d1d5db', borderRadius: '8px',
  fontSize: '14px', color: '#111827',
  outline: 'none', boxSizing: 'border-box',
};
const primaryBtnStyle = {
  background: '#3b82f6', color: 'white',
  border: 'none', borderRadius: '8px',
  padding: '9px 20px', fontSize: '14px',
  fontWeight: '600', cursor: 'pointer',
};
const cancelBtnStyle = {
  background: '#f3f4f6', color: '#374151',
  border: 'none', borderRadius: '8px',
  padding: '9px 20px', fontSize: '14px',
  fontWeight: '500', cursor: 'pointer',
};

// ════════════════════════════════════════════════════════════
// 主元件：TeamPage
// ════════════════════════════════════════════════════════════
export default function TeamPage() {
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
        body: JSON.stringify(form),
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
      background:    '#f8fafc',
    }}>
      {/* ── 頁面標題列 ─────────────────────────────────── */}
      <div style={{
        background:   'white',
        borderBottom: '1px solid #e5e7eb',
        padding:      '14px 24px',
        flexShrink:   0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: summary ? '14px' : 0,
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#111827' }}>
              👥 團隊管理
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#9ca3af' }}>
              管理公司成員、角色與工作量分配
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              background: '#3b82f6', color: 'white',
              border: 'none', borderRadius: '8px',
              padding: '8px 18px', fontSize: '13px', fontWeight: '600',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
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
              <div key={i} style={{ fontSize: '13px', color: '#6b7280' }}>
                <span style={{ fontWeight: '700', color: '#111827', marginRight: '4px' }}>
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
                  background:   filterRole === f.id ? '#3b82f6' : 'white',
                  color:        filterRole === f.id ? 'white'   : '#6b7280',
                  border:       '1px solid #e5e7eb',
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
              <div style={{ color: '#9ca3af' }}>載入中...</div>
            </div>
          )}

          {/* 錯誤 */}
          {!loading && error && (
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              height: '200px', flexDirection: 'column', gap: '12px',
            }}>
              <div style={{ fontSize: '40px' }}>😢</div>
              <div style={{ color: '#dc2626' }}>{error}</div>
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
                  <div style={{ color: '#9ca3af' }}>此分類尚無成員</div>
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
