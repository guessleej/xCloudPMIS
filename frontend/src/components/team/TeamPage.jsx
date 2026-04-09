/**
 * TeamPage — 團隊成員管理
 * GET /api/team?companyId=N
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

const BRAND = {
  crimson:      '#C70018',
  crimsonDeep:  '#6E0615',
  crimsonNight: '#161112',
  ink:    'var(--xc-text)',
  carbon: 'var(--xc-text-soft)',
  muted:  'var(--xc-text-muted)',
  paper:  'var(--xc-bg)',
  mist:   'var(--xc-border)',
  silver: 'var(--xc-border-strong)',
  surface:      'var(--xc-surface)',
  surfaceSoft:  'var(--xc-surface-soft)',
  surfaceMuted: 'var(--xc-surface-muted)',
  white:  'var(--xc-surface-strong)',
  accentSoft:    'color-mix(in srgb, #C70018 12%, var(--xc-surface-soft))',
  accentSurface: 'color-mix(in srgb, #C70018  8%, var(--xc-surface))',
  accentBorder:  'color-mix(in srgb, #C70018 28%, var(--xc-border))',
  heroBg: 'linear-gradient(135deg, #161112 0%, #6E0615 44%, #C70018 100%)',
  success: 'var(--xc-success)',
  warning: 'var(--xc-warning)',
  danger:  'var(--xc-danger)',
  info:    'var(--xc-info)',
};

const btnPrimary = { padding: '7px 16px', borderRadius: 7, border: 'none', background: BRAND.crimson, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnGhost   = { padding: '7px 16px', borderRadius: 7, border: `1px solid ${BRAND.silver}`, background: 'transparent', color: BRAND.carbon, fontSize: 13, cursor: 'pointer' };

const ROLE_LABEL = { admin: '管理員', pm: '專案經理', member: '成員' };
const ROLE_COLOR = { admin: '#C70018', pm: '#3B82F6', member: '#6B7280' };
const ROLE_BG    = { admin: 'color-mix(in srgb, #C70018 12%, transparent)', pm: 'color-mix(in srgb, #3B82F6 12%, transparent)', member: 'color-mix(in srgb, #6B7280 10%, transparent)' };

const DEPT_COLOR = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B',
  '#EF4444', '#06B6D4', '#EC4899', '#14B8A6',
];

function Avatar({ name, avatarUrl, size = 36 }) {
  const initials = (name || '?').slice(0, 2);
  const color = DEPT_COLOR[(name?.charCodeAt(0) || 0) % DEPT_COLOR.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: avatarUrl ? 'transparent' : color,
      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {avatarUrl
        ? <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ color: '#fff', fontWeight: 700, fontSize: size * 0.38 }}>{initials}</span>
      }
    </div>
  );
}

function MemberCard({ member, onClick }) {
  const [hover, setHover] = useState(false);
  const joinDate = member.joinedAt
    ? new Date(member.joinedAt).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' })
    : '—';
  const lastLogin = member.lastLoginAt
    ? new Date(member.lastLoginAt).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })
    : '從未登入';

  return (
    <div
      onClick={() => onClick(member)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? BRAND.accentSurface : BRAND.surface,
        border: `1px solid ${hover ? BRAND.accentBorder : BRAND.mist}`,
        borderRadius: 12,
        padding: '20px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* 頭像 + 基本資訊 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <Avatar name={member.name} avatarUrl={member.avatarUrl} size={44} />
          <span style={{
            position: 'absolute', bottom: 0, right: -2,
            width: 11, height: 11, borderRadius: '50%',
            background: member.isActive ? 'var(--xc-success)' : BRAND.muted,
            border: `2px solid ${BRAND.surface}`,
          }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {member.name}
          </div>
          <div style={{ fontSize: 11, color: BRAND.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {member.jobTitle}
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
          background: ROLE_BG[member.role],
          color: ROLE_COLOR[member.role],
          flexShrink: 0,
        }}>
          {ROLE_LABEL[member.role]}
        </span>
      </div>

      {/* 部門 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', borderRadius: 6,
        background: BRAND.surfaceSoft, border: `1px solid ${BRAND.mist}`,
        fontSize: 11, color: BRAND.carbon,
      }}>
        <span style={{ opacity: 0.6 }}>🏢</span>
        {member.department}
      </div>

      {/* 任務統計 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {[
          { label: '總任務', value: member.taskStats?.total ?? 0, color: BRAND.info },
          { label: '進行中', value: member.taskStats?.active ?? 0, color: BRAND.warning },
          { label: '已完成', value: member.taskStats?.completed ?? 0, color: BRAND.success },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center', padding: '6px 4px', borderRadius: 6, background: BRAND.surfaceSoft }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: BRAND.muted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 加入時間 + 最後登入 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: BRAND.muted, borderTop: `1px solid ${BRAND.mist}`, paddingTop: 10 }}>
        <span>📅 加入 {joinDate}</span>
        <span>🔑 {lastLogin}</span>
      </div>
    </div>
  );
}

function MemberDrawer({ member, onClose, onRoleChange }) {
  const [editRole, setEditRole] = useState(member?.role || 'member');
  const [saving, setSaving] = useState(false);
  const { authFetch } = useAuth();

  useEffect(() => {
    if (member) setEditRole(member.role);
  }, [member]);

  if (!member) return null;

  const joinDate   = member.joinedAt    ? new Date(member.joinedAt).toLocaleDateString('zh-TW')    : '—';
  const lastLogin  = member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '從未登入';

  async function save() {
    if (editRole === member.role) { onClose(); return; }
    setSaving(true);
    try {
      await authFetch(`/api/team/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: editRole }),
      });
      onRoleChange(member.id, editRole);
      onClose();
    } catch (e) {
      console.error('[TeamPage save role]', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 100 }} />
      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 400, maxWidth: '95vw', maxHeight: '90vh',
        background: BRAND.surface, borderRadius: 16,
        zIndex: 101, display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,.25), 0 0 0 1px rgba(0,0,0,.08)',
        overflow: 'hidden', animation: 'memberModalIn .22s ease',
      }}>
        <style>{`
          @keyframes memberModalIn {
            from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
            to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          }
        `}</style>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${BRAND.mist}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: BRAND.ink }}>成員詳情</span>
          <button onClick={onClose} style={{ ...btnGhost, padding: '4px 10px', fontSize: 12 }}>關閉</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* 頭像區 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 24, padding: 20, background: BRAND.surfaceSoft, borderRadius: 12, border: `1px solid ${BRAND.mist}` }}>
            <Avatar name={member.name} avatarUrl={member.avatarUrl} size={64} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.ink }}>{member.name}</div>
              <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 3 }}>{member.jobTitle}</div>
              <span style={{
                display: 'inline-block', marginTop: 8,
                fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 4,
                background: ROLE_BG[member.role], color: ROLE_COLOR[member.role],
              }}>
                {ROLE_LABEL[member.role]}
              </span>
            </div>
          </div>

          {/* 資訊列表 */}
          {[
            { label: '電子郵件', value: member.email, icon: '📧' },
            { label: '部門',     value: member.department, icon: '🏢' },
            { label: '加入日期', value: joinDate, icon: '📅' },
            { label: '最後登入', value: lastLogin, icon: '🔑' },
            { label: '狀態',     value: member.isActive ? '啟用中' : '已停用', icon: '🟢' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: `1px solid ${BRAND.mist}` }}>
              <span style={{ fontSize: 14 }}>{r.icon}</span>
              <div>
                <div style={{ fontSize: 10, color: BRAND.muted }}>{r.label}</div>
                <div style={{ fontSize: 13, color: BRAND.carbon, marginTop: 2 }}>{r.value || '—'}</div>
              </div>
            </div>
          ))}

          {/* 任務統計 */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.carbon, marginBottom: 10 }}>任務統計</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: '總任務', value: member.taskStats?.total ?? 0, color: BRAND.info },
                { label: '進行中', value: member.taskStats?.active ?? 0, color: BRAND.warning },
                { label: '已完成', value: member.taskStats?.completed ?? 0, color: BRAND.success },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center', padding: '10px 6px', borderRadius: 8, background: BRAND.surfaceSoft, border: `1px solid ${BRAND.mist}` }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: BRAND.muted }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 角色編輯 */}
          <div style={{ marginTop: 24, padding: 16, background: BRAND.accentSurface, borderRadius: 10, border: `1px solid ${BRAND.accentBorder}` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.carbon, marginBottom: 10 }}>變更角色</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {VALID_ROLES_LIST.map(r => (
                <button
                  key={r}
                  onClick={() => setEditRole(r)}
                  style={{
                    flex: 1, padding: '7px 0', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    border: `1px solid ${editRole === r ? ROLE_COLOR[r] : BRAND.silver}`,
                    background: editRole === r ? ROLE_BG[r] : 'transparent',
                    color: editRole === r ? ROLE_COLOR[r] : BRAND.muted,
                    fontWeight: editRole === r ? 700 : 400,
                    transition: 'all 0.12s',
                  }}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${BRAND.mist}`, display: 'flex', gap: 10 }}>
          <button onClick={save} disabled={saving} style={{ ...btnPrimary, flex: 1 }}>
            {saving ? '儲存中…' : '儲存變更'}
          </button>
          <button onClick={onClose} style={btnGhost}>取消</button>
        </div>
      </div>
    </>
  );
}

const VALID_ROLES_LIST = ['admin', 'pm', 'member'];

export default function TeamPage() {
  const { user, authFetch } = useAuth();
  const [members,  setMembers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);
  const [search,   setSearch]   = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');

  const load = useCallback(async () => {
    if (!user?.companyId || !authFetch) return;
    setLoading(true);
    try {
      const res  = await authFetch(`/api/team?companyId=${user.companyId}`);
      const json = await res.json();
      if (json.success) setMembers(json.data || []);
    } catch (e) {
      console.error('[TeamPage load]', e);
    } finally {
      setLoading(false);
    }
  }, [user?.companyId, authFetch]);

  useEffect(() => { load(); }, [load]);

  const departments = [...new Set(members.map(m => m.department).filter(Boolean))].sort();

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    const matchSearch = !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || (m.department || '').toLowerCase().includes(q);
    const matchRole = roleFilter === 'all' || m.role === roleFilter;
    const matchDept = deptFilter === 'all' || m.department === deptFilter;
    return matchSearch && matchRole && matchDept;
  });

  const kpis = [
    { label: '成員總數', value: members.length },
    { label: '啟用中',   value: members.filter(m => m.isActive).length },
    { label: '專案經理', value: members.filter(m => m.role === 'pm').length },
    { label: '部門數量', value: departments.length },
  ];

  function handleRoleChange(id, newRole) {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, role: newRole } : m));
  }

  return (
    <div style={{ minHeight: '100vh', background: BRAND.paper, fontFamily: 'inherit', display: 'flex', flexDirection: 'column' }}>
      {/* Hero */}
      <div style={{ background: BRAND.heroBg, padding: '28px 32px 24px', color: '#fff', flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', opacity: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
          team
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em' }}>團隊成員</h1>
        <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>管理成員角色、部門配置與任務分配</p>
        <div style={{ display: 'flex', gap: 32, marginTop: 20, alignItems: 'flex-end' }}>
          {kpis.map(k => (
            <div key={k.label}>
              <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{loading ? '—' : k.value}</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 3 }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 工具列 */}
      <div style={{ padding: '16px 32px', borderBottom: `1px solid ${BRAND.mist}`, background: BRAND.surface, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* 搜尋 */}
        <input
          type="text"
          placeholder="搜尋姓名、Email、部門…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 200, maxWidth: 320,
            padding: '7px 12px', borderRadius: 7,
            border: `1px solid ${BRAND.silver}`, background: BRAND.surfaceSoft,
            color: BRAND.ink, fontSize: 13, outline: 'none',
          }}
        />

        {/* 角色篩選 */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ k: 'all', label: '全部' }, ...VALID_ROLES_LIST.map(r => ({ k: r, label: ROLE_LABEL[r] }))].map(({ k, label }) => (
            <button
              key={k}
              onClick={() => setRoleFilter(k)}
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                border: `1px solid ${roleFilter === k ? BRAND.crimson : BRAND.silver}`,
                background: roleFilter === k ? BRAND.accentSurface : 'transparent',
                color: roleFilter === k ? BRAND.crimson : BRAND.carbon,
                fontWeight: roleFilter === k ? 700 : 400,
                transition: 'all .12s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 部門篩選 */}
        <select
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          style={{
            padding: '7px 10px', borderRadius: 7,
            border: `1px solid ${BRAND.silver}`, background: BRAND.surfaceSoft,
            color: BRAND.carbon, fontSize: 12, cursor: 'pointer',
          }}
        >
          <option value="all">所有部門</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <div style={{ marginLeft: 'auto', fontSize: 12, color: BRAND.muted }}>
          共 {filtered.length} 位成員
        </div>
      </div>

      {/* 內容區 */}
      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: BRAND.muted, fontSize: 13 }}>載入中…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: BRAND.muted, fontSize: 13 }}>找不到符合的成員</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {filtered.map(m => (
              <MemberCard key={m.id} member={m} onClick={setSelected} />
            ))}
          </div>
        )}
      </div>

      {/* 部門分佈統計（底部） */}
      {!loading && departments.length > 0 && (
        <div style={{ padding: '16px 32px', borderTop: `1px solid ${BRAND.mist}`, background: BRAND.surface }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            部門分佈
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {departments.map((dept, i) => {
              const count = members.filter(m => m.department === dept).length;
              return (
                <div
                  key={dept}
                  onClick={() => setDeptFilter(deptFilter === dept ? 'all' : dept)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                    border: `1px solid ${deptFilter === dept ? DEPT_COLOR[i % DEPT_COLOR.length] : BRAND.mist}`,
                    background: deptFilter === dept ? `color-mix(in srgb, ${DEPT_COLOR[i % DEPT_COLOR.length]} 12%, transparent)` : BRAND.surfaceSoft,
                    transition: 'all .12s',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: DEPT_COLOR[i % DEPT_COLOR.length], flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: BRAND.carbon }}>{dept}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: DEPT_COLOR[i % DEPT_COLOR.length] }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 側抽屜 */}
      {selected && (
        <MemberDrawer
          member={selected}
          onClose={() => setSelected(null)}
          onRoleChange={handleRoleChange}
        />
      )}
    </div>
  );
}
