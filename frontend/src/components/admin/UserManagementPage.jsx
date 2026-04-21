/**
 * UserManagementPage — 使用者帳號管理（系統管理員專用）
 * ─────────────────────────────────────────────────────────────
 *
 * 功能：
 *   - 使用者列表（搜尋 / 角色篩選 / 狀態篩選 / 分頁）
 *   - 統計卡（總人數 / 各角色數 / 本月新增）
 *   - 建立新使用者（姓名、Email、角色、部門、電話、職稱）
 *   - 編輯使用者資料
 *   - 停用 / 啟用帳號
 *   - 查看 OAuth 連結清單並取消連結
 *
 * 本系統僅支援 Microsoft OAuth 登入，不提供帳號密碼功能。
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useResponsive';

const API_BASE = '';

const ROLE_LABEL  = { admin: '系統管理員', pm: '專案經理', member: '一般成員' };
const ROLE_COLOR  = {
  admin:  { bg: 'rgba(196,18,48,0.12)', color: '#c41230' },
  pm:     { bg: 'rgba(59,130,246,0.12)', color: '#2563eb' },
  member: { bg: 'rgba(107,114,128,0.12)', color: '#6b7280' },
};
const PROVIDER_ICON = {
  microsoft: '🔷',
};

// ── 工具 ──────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// ════════════════════════════════════════════════════════════
// Sub-Components
// ════════════════════════════════════════════════════════════

// ── 統計卡 ────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background:   'var(--xc-surface-strong)',
      borderRadius: 12,
      padding:      '16px 20px',
      border:       '1px solid var(--xc-border)',
      flex:         '1 1 140px',
      minWidth:     0,
    }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent || 'var(--xc-brand)' }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--xc-text)', marginTop: 2 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 13, color: 'var(--xc-text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── 角色徽章 ─────────────────────────────────────────────────
function RoleBadge({ role }) {
  const c = ROLE_COLOR[role] || { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' };
  return (
    <span style={{
      padding:      '2px 8px',
      borderRadius: 6,
      fontSize: 13,
      fontWeight:   600,
      background:   c.bg,
      color:        c.color,
      whiteSpace:   'nowrap',
    }}>
      {ROLE_LABEL[role] || role}
    </span>
  );
}

// ── 狀態徽章 ─────────────────────────────────────────────────
function StatusBadge({ isActive }) {
  return (
    <span style={{
      padding:      '2px 8px',
      borderRadius: 6,
      fontSize: 13,
      fontWeight:   600,
      background:   isActive ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
      color:        isActive ? '#16a34a' : '#dc2626',
    }}>
      {isActive ? '啟用中' : '已停用'}
    </span>
  );
}

// ── 輸入框 ────────────────────────────────────────────────────
function Field({ label, required, error, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display:    'block',
        fontSize: 15,
        fontWeight: 600,
        color:      error ? 'var(--xc-danger)' : 'var(--xc-text-soft)',
        marginBottom: 6,
      }}>
        {label}{required && <span style={{ color: 'var(--xc-danger)', marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {error && (
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--xc-danger)' }}>⚠️ {error}</p>
      )}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', disabled }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      value={value || ''}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={()  => setFocused(false)}
      style={{
        width:        '100%',
        padding:      '9px 12px',
        boxSizing:    'border-box',
        border:       `1.5px solid ${focused ? 'var(--xc-brand)' : 'var(--xc-border)'}`,
        borderRadius: 8,
        fontSize: 16,
        color:        'var(--xc-text)',
        background:   disabled ? 'var(--xc-surface-soft)' : 'var(--xc-surface-strong)',
        outline:      'none',
        transition:   'border-color 0.15s',
        boxShadow:    focused ? '0 0 0 3px rgba(196,18,48,0.12)' : 'none',
      }}
    />
  );
}

function Select({ value, onChange, options, disabled }) {
  return (
    <select
      value={value || ''}
      onChange={onChange}
      disabled={disabled}
      style={{
        width:        '100%',
        padding:      '9px 12px',
        boxSizing:    'border-box',
        border:       '1.5px solid var(--xc-border)',
        borderRadius: 8,
        fontSize: 16,
        color:        'var(--xc-text)',
        background:   'var(--xc-surface-strong)',
        outline:      'none',
        cursor:       'pointer',
        appearance:   'auto',
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ── Modal 底板 ────────────────────────────────────────────────
function Modal({ title, onClose, children, width = 520 }) {
  return (
    <div
      style={{
        position:   'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display:    'flex', alignItems: 'center', justifyContent: 'center',
        padding:    '16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background:   'var(--xc-surface-strong)',
        borderRadius: 16,
        width:        '100%',
        maxWidth:     width,
        maxHeight:    '90vh',
        overflow:     'auto',
        boxShadow:    'var(--xc-shadow-strong)',
        animation:    'fadeIn 0.2s ease',
      }}>
        <div style={{
          display:      'flex', alignItems: 'center', justifyContent: 'space-between',
          padding:      '20px 24px 16px',
          borderBottom: '1px solid var(--xc-border)',
          position:     'sticky', top: 0,
          background:   'var(--xc-surface-strong)', zIndex: 1,
        }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--xc-text)' }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 6, borderRadius: 8, color: 'var(--xc-text-muted)',
              fontSize: 20, lineHeight: 1,
            }}
          >✕</button>
        </div>
        <div style={{ padding: '20px 24px 24px' }}>{children}</div>
      </div>
    </div>
  );
}

// ── 按鈕 ─────────────────────────────────────────────────────
function Btn({ onClick, disabled, variant = 'primary', children, small }) {
  const styles = {
    primary:   { bg: 'var(--xc-brand)', color: '#fff', border: 'none' },
    secondary: { bg: 'transparent',     color: 'var(--xc-text)', border: '1.5px solid var(--xc-border)' },
    danger:    { bg: 'rgba(220,38,38,0.1)', color: '#dc2626', border: '1.5px solid rgba(220,38,38,0.3)' },
    success:   { bg: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1.5px solid rgba(34,197,94,0.3)' },
  };
  const s = styles[variant] || styles.primary;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding:      small ? '6px 12px' : '9px 18px',
        borderRadius: 8,
        fontSize:     small ? 12 : 13,
        fontWeight:   600,
        cursor:       disabled ? 'not-allowed' : 'pointer',
        opacity:      disabled ? 0.6 : 1,
        transition:   'opacity 0.15s',
        background:   s.bg,
        color:        s.color,
        border:       s.border,
        whiteSpace:   'nowrap',
      }}
    >
      {children}
    </button>
  );
}

// ════════════════════════════════════════════════════════════
// CreateUserModal — 建立使用者
// ════════════════════════════════════════════════════════════
function CreateUserModal({ onClose, onCreated, authFetch }) {
  const [form, setForm] = useState({
    name: '', email: '',
    role: 'member', department: '', phone: '', jobTitle: '', joinedAt: '',
  });
  const [errors, setErrors]   = useState({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: '' })); };

  const validate = () => {
    const e = {};
    if (!form.name.trim())   e.name   = '姓名為必填';
    if (!form.email.trim())  e.email  = 'Email 為必填';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Email 格式不正確';
    return e;
  };

  const handleSubmit = async () => {
    setApiError('');
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/admin/users`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:       form.name.trim(),
          email:      form.email.trim().toLowerCase(),
          role:       form.role,
          department: form.department || undefined,
          phone:      form.phone      || undefined,
          jobTitle:   form.jobTitle   || undefined,
          joinedAt:   form.joinedAt   || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onCreated(data.data);
        onClose();
      } else {
        setApiError(data.error || '建立失敗');
      }
    } catch {
      setApiError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="建立新使用者" onClose={onClose}>
      {apiError && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontSize: 15,
        }}>⛔ {apiError}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <div style={{ gridColumn: 'span 2' }}>
          <Field label="姓名" required error={errors.name}>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="王小明" />
          </Field>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <Field label="Email" required error={errors.email}>
            <Input value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@company.com" type="email" />
          </Field>
        </div>
        <Field label="角色" required>
            <Select
              value={form.role}
              onChange={e => set('role', e.target.value)}
              options={[
                { value: 'member', label: '一般成員' },
                { value: 'pm',     label: '專案經理' },
                { value: 'admin',  label: '系統管理員' },
              ]}
            />
          </Field>
        <Field label="部門">
          <Input value={form.department} onChange={e => set('department', e.target.value)} placeholder="研發部" />
        </Field>
        <Field label="職稱">
          <Input value={form.jobTitle} onChange={e => set('jobTitle', e.target.value)} placeholder="資深工程師" />
        </Field>
        <Field label="電話">
          <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="0912-345-678" />
        </Field>
        <Field label="到職日期">
          <Input value={form.joinedAt} onChange={e => set('joinedAt', e.target.value)} type="date" />
        </Field>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--xc-border)' }}>
        <Btn variant="secondary" onClick={onClose} disabled={loading}>取消</Btn>
        <Btn onClick={handleSubmit} disabled={loading}>
          {loading ? '建立中...' : '建立帳號'}
        </Btn>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
// EditUserModal — 編輯使用者
// ════════════════════════════════════════════════════════════
function EditUserModal({ user, onClose, onUpdated, authFetch }) {
  const [form, setForm]     = useState({
    name:       user.name       || '',
    email:      user.email      || '',
    role:       user.role       || 'member',
    department: user.department || '',
    phone:      user.phone      || '',
    jobTitle:   user.jobTitle   || '',
    joinedAt:   user.joinedAt   || '',
  });
  const [errors, setErrors]   = useState({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // Azure AD 同步
  const [adSyncing, setAdSyncing] = useState(false);
  const [adProfile, setAdProfile] = useState(null);

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: '' })); };

  // 判斷使用者是否有 Microsoft OAuth 連結
  const hasMicrosoftOAuth = user.oauthAccounts?.some(a => a.provider === 'microsoft');

  const handleSyncAzureAD = async () => {
    setAdSyncing(true);
    setApiError('');
    try {
      const res = await authFetch(`${API_BASE}/api/admin/users/${user.id}/azure-profile`);
      const data = await res.json();
      if (!data.success) {
        setApiError(data.error || '無法取得 Azure AD 資料');
        return;
      }
      const profile = data.data;
      setAdProfile(profile);
      // 自動填入空白欄位
      const updates = {};
      if (profile.department  && !form.department) updates.department = profile.department;
      if (profile.jobTitle    && !form.jobTitle)   updates.jobTitle   = profile.jobTitle;
      if (profile.mobilePhone && !form.phone)      updates.phone      = profile.mobilePhone;
      if (Object.keys(updates).length > 0) {
        setForm(f => ({ ...f, ...updates }));
      }
    } catch {
      setApiError('同步 Azure AD 資料時發生錯誤');
    } finally {
      setAdSyncing(false);
    }
  };

  const handleSubmit = async () => {
    setApiError('');
    const e = {};
    if (!form.name.trim())  e.name  = '姓名為必填';
    if (!form.email.trim()) e.email = 'Email 為必填';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Email 格式不正確';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/admin/users/${user.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:       form.name.trim(),
          email:      form.email.trim().toLowerCase(),
          role:       form.role,
          department: form.department || null,
          phone:      form.phone      || null,
          jobTitle:   form.jobTitle   || null,
          joinedAt:   form.joinedAt   || null,
        }),
      });
      const data = await res.json();
      if (data.success) { onUpdated(data.data); onClose(); }
      else setApiError(data.error || '更新失敗');
    } catch {
      setApiError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={`編輯使用者：${user.name}`} onClose={onClose}>
      {apiError && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontSize: 15 }}>
          ⛔ {apiError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <div style={{ gridColumn: 'span 2' }}>
          <Field label="姓名" required error={errors.name}>
            <Input value={form.name} onChange={e => set('name', e.target.value)} />
          </Field>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <Field label="Email" required error={errors.email}>
            <Input value={form.email} onChange={e => set('email', e.target.value)} type="email" />
          </Field>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <Field label="角色" required>
            <Select value={form.role} onChange={e => set('role', e.target.value)}
              options={[
                { value: 'member', label: '一般成員' },
                { value: 'pm',     label: '專案經理' },
                { value: 'admin',  label: '系統管理員' },
              ]}
            />
          </Field>
        </div>
        <Field label="部門"><Input value={form.department} onChange={e => set('department', e.target.value)} /></Field>
        <Field label="職稱"><Input value={form.jobTitle}   onChange={e => set('jobTitle',   e.target.value)} /></Field>
        <Field label="電話"><Input value={form.phone}      onChange={e => set('phone',      e.target.value)} /></Field>
        <Field label="到職日期"><Input value={form.joinedAt} onChange={e => set('joinedAt', e.target.value)} type="date" /></Field>
      </div>

      {/* Azure AD 同步 */}
      {hasMicrosoftOAuth && (
        <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--xc-bg-soft)', borderRadius: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: adProfile ? 10 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🔷</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--xc-text-muted)' }}>Azure AD 組織資料</span>
            </div>
            <button
              type="button"
              onClick={handleSyncAzureAD}
              disabled={adSyncing}
              style={{
                background: 'var(--xc-brand-soft, rgba(0,120,212,0.1))',
                color:      'var(--xc-brand, #0078d4)',
                border:     '1px solid var(--xc-border)',
                borderRadius: 6,
                padding:    '3px 10px',
                fontSize: 13,
                fontWeight: 600,
                cursor:     adSyncing ? 'not-allowed' : 'pointer',
                opacity:    adSyncing ? 0.6 : 1,
              }}
            >
              {adSyncing ? '同步中…' : '🔄 從 Azure AD 同步'}
            </button>
          </div>
          {adProfile && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 14 }}>
              {adProfile.displayName    && <div><span style={{ color: 'var(--xc-text-muted)' }}>顯示名稱：</span>{adProfile.displayName}</div>}
              {adProfile.email          && <div><span style={{ color: 'var(--xc-text-muted)' }}>Email：</span>{adProfile.email}</div>}
              {adProfile.jobTitle       && <div><span style={{ color: 'var(--xc-text-muted)' }}>職稱：</span>{adProfile.jobTitle}</div>}
              {adProfile.department     && <div><span style={{ color: 'var(--xc-text-muted)' }}>部門：</span>{adProfile.department}</div>}
              {adProfile.officeLocation && <div><span style={{ color: 'var(--xc-text-muted)' }}>辦公室：</span>{adProfile.officeLocation}</div>}
              {adProfile.mobilePhone    && <div><span style={{ color: 'var(--xc-text-muted)' }}>行動電話：</span>{adProfile.mobilePhone}</div>}
            </div>
          )}
        </div>
      )}

      {/* OAuth 連結清單 */}
      {user.oauthAccounts?.length > 0 && (
        <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--xc-bg-soft)', borderRadius: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--xc-text-muted)', marginBottom: 8 }}>
            已連結的社群帳號
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {user.oauthAccounts.map(acc => (
              <span key={acc.id} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 14, fontWeight: 600,
                background: 'var(--xc-surface-strong)', border: '1px solid var(--xc-border)',
                color: 'var(--xc-text)',
              }}>
                {PROVIDER_ICON[acc.provider] || '🔗'} {acc.provider} · {acc.providerEmail || acc.displayName}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--xc-border)' }}>
        <Btn variant="secondary" onClick={onClose} disabled={loading}>取消</Btn>
        <Btn onClick={handleSubmit} disabled={loading}>{loading ? '儲存中...' : '儲存變更'}</Btn>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
// 主頁面元件
// ════════════════════════════════════════════════════════════
export default function UserManagementPage() {
  const isMobile = useIsMobile();
  const { authFetch, isAdmin } = useAuth();

  const [users,    setUsers]    = useState([]);
  const [stats,    setStats]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [meta,     setMeta]     = useState({ total: 0, pages: 1, page: 1 });
  const [error,    setError]    = useState(null);

  // 篩選狀態
  const [search,   setSearch]   = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [page,     setPage]     = useState(1);

  // Modal 狀態
  const [showCreate, setShowCreate] = useState(false);
  const [editUser,   setEditUser]   = useState(null);
  const [toast,      setToast]      = useState(null);

  // ── Toast 通知 ───────────────────────────────────────────
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── 載入使用者列表 ───────────────────────────────────────
  const loadUsers = useCallback(async (opts = {}) => {
    const p      = opts.page     ?? page;
    const s      = opts.search   ?? search;
    const role   = opts.role     ?? roleFilter;
    const active = opts.active   ?? activeFilter;

    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: p, pageSize: 200, search: s,
        ...(role   ? { role }            : {}),
        ...(active !== '' ? { isActive: active } : {}),
        sortBy:  'department',
        sortDir: 'asc',
      }).toString();

      const res  = await authFetch(`${API_BASE}/api/admin/users?${qs}`);
      const data = await res.json();

      if (data.success) {
        setUsers(data.data);
        setMeta(data.meta);
      } else {
        setError(data.error || '載入使用者列表失敗');
        showToast(data.error || '載入使用者列表失敗', 'error');
      }
    } catch (e) {
      console.error('[UserManagement] 載入失敗:', e);
      setError(`載入失敗：${e.message}`);
      showToast(`載入失敗：${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, activeFilter, authFetch]);

  // ── 載入統計 ─────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const res  = await authFetch(`${API_BASE}/api/admin/users/stats`);
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch {}
  }, [authFetch]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadUsers(); loadStats(); }, [authFetch]);

  // ── 停用 / 啟用 ──────────────────────────────────────────
  const handleToggle = async (user) => {
    if (user.role === 'admin' && user.isActive) {
      const adminCount = users.filter(u => u.role === 'admin' && u.isActive).length;
      if (adminCount <= 1) {
        showToast('系統中至少需要保留一位啟用的管理員', 'error');
        return;
      }
    }
    try {
      const res  = await authFetch(`${API_BASE}/api/admin/users/${user.id}/toggle`, { method: 'PATCH' });
      const data = await res.json();
      if (data.success) {
        setUsers(p => p.map(u => u.id === user.id ? data.data : u));
        showToast(`已${data.data.isActive ? '啟用' : '停用'} ${user.name} 的帳號`);
        loadStats();
      } else {
        showToast(data.error || '操作失敗', 'error');
      }
    } catch {
      showToast('網路錯誤', 'error');
    }
  };

  // ── 搜尋 ─────────────────────────────────────────────────
  const handleSearch = (e) => {
    const v = e.target.value;
    setSearch(v);
    setPage(1);
    loadUsers({ search: v, page: 1 });
  };

  // ── 篩選 ─────────────────────────────────────────────────
  const handleFilter = (key, val) => {
    if (key === 'role')   { setRoleFilter(val);   loadUsers({ role: val,   page: 1 }); }
    if (key === 'active') { setActiveFilter(val); loadUsers({ active: val, page: 1 }); }
    setPage(1);
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--xc-text-muted)' }}>
        🔒 此頁面僅限系統管理員存取
      </div>
    );
  }

  return (
    <>
      <style>{`@keyframes fadeIn { from { opacity:0;transform:translateY(8px) } to { opacity:1;transform:translateY(0) } }`}</style>

      <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto', fontFamily: 'var(--xc-font-sans)' }}>

        {/* ── 標題列 ─────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--xc-text)' }}>
              👥 使用者管理
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 15, color: 'var(--xc-text-muted)' }}>
              管理公司成員帳號、角色與 OAuth 社群登入連結
            </p>
          </div>
          <Btn onClick={() => setShowCreate(true)}>+ 建立使用者</Btn>
        </div>

        {/* ── 統計卡 ─────────────────────────────────────── */}
        {stats && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
            <StatCard label="總成員數" value={stats.total} />
            <StatCard label="啟用中"   value={stats.active}   accent="var(--xc-success)" />
            <StatCard label="已停用"   value={stats.inactive} accent="var(--xc-danger)" />
            <StatCard label="管理員"   value={stats.byRole.admin}  accent="#c41230" />
            <StatCard label="專案經理" value={stats.byRole.pm}     accent="#2563eb" />
            <StatCard label="一般成員" value={stats.byRole.member} accent="#6b7280" />
            <StatCard label="本月新增" value={stats.thisMonth} sub="本月建立" accent="var(--xc-brand)" />
          </div>
        )}

        {/* ── 工具列 ─────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16,
          padding: '12px 16px',
          background: 'var(--xc-surface-strong)',
          borderRadius: 12, border: '1px solid var(--xc-border)',
        }}>
          {/* 搜尋 */}
          <input
            value={search}
            onChange={handleSearch}
            placeholder="搜尋姓名 / Email / 部門 / 職稱..."
            style={{
              flex: '1 1 200px', padding: '8px 12px',
              border: '1.5px solid var(--xc-border)', borderRadius: 8,
              fontSize: 15, color: 'var(--xc-text)', background: 'var(--xc-bg)',
              outline: 'none',
            }}
          />
          {/* 角色篩選 */}
          <select
            value={roleFilter}
            onChange={e => handleFilter('role', e.target.value)}
            style={{
              padding: '8px 12px', border: '1.5px solid var(--xc-border)',
              borderRadius: 8, fontSize: 15, color: 'var(--xc-text)',
              background: 'var(--xc-bg)', outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="">全部角色</option>
            <option value="admin">系統管理員</option>
            <option value="pm">專案經理</option>
            <option value="member">一般成員</option>
          </select>
          {/* 狀態篩選 */}
          <select
            value={activeFilter}
            onChange={e => handleFilter('active', e.target.value)}
            style={{
              padding: '8px 12px', border: '1.5px solid var(--xc-border)',
              borderRadius: 8, fontSize: 15, color: 'var(--xc-text)',
              background: 'var(--xc-bg)', outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="">全部狀態</option>
            <option value="true">啟用中</option>
            <option value="false">已停用</option>
          </select>
          <Btn variant="secondary" small onClick={() => {
            setSearch(''); setRoleFilter(''); setActiveFilter(''); setPage(1);
            loadUsers({ search: '', role: '', active: '', page: 1 });
          }}>清除篩選</Btn>
        </div>

        {/* ── 錯誤提示 ─────────────────────────────────── */}
        {error && (
          <div style={{
            padding:      '12px 16px',
            marginBottom: 16,
            background:   'rgba(220,38,38,0.08)',
            border:       '1px solid rgba(220,38,38,0.25)',
            borderRadius: 10,
            color:        '#dc2626',
            fontSize: 15,
            display:      'flex',
            alignItems:   'center',
            gap:          10,
          }}>
            <span>⚠️ {error}</span>
            <Btn variant="danger" small onClick={() => loadUsers()}>重新載入</Btn>
          </div>
        )}

        {/* ── 使用者列表 ─────────────────────────────────── */}
        <div style={{
          background:   'var(--xc-surface-strong)',
          borderRadius: 12,
          border:       '1px solid var(--xc-border)',
          overflow:     'hidden',
        }}>
          {/* 表頭 */}
          <div style={{
            display:         'grid',
            gridTemplateColumns: 'minmax(180px,2fr) minmax(140px,1.5fr) 100px 80px 80px 110px 120px',
            padding:         '10px 16px',
            borderBottom:    '1px solid var(--xc-border)',
            background:      'var(--xc-bg-soft)',
            fontSize: 13,
            fontWeight:      700,
            color:           'var(--xc-text-muted)',
            textTransform:   'uppercase',
            letterSpacing:   '0.05em',
            gap:             12,
            alignItems:      'center',
          }}>
            <span>姓名 / Email</span>
            <span>部門 / 職稱</span>
            <span>角色</span>
            <span>狀態</span>
            <span>社群連結</span>
            <span>最後登入</span>
            <span>操作</span>
          </div>

          {/* 資料列 */}
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--xc-text-muted)' }}>
              載入中...
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--xc-text-muted)' }}>
              沒有符合條件的使用者
            </div>
          ) : (() => {
              const ROLE_RANK = { admin: 0, pm: 1, member: 2 };
              const DEPT_PRIORITY = { '管理部': 0 };
              const sortedUsers = [...users].sort((a, b) => {
                const pA = DEPT_PRIORITY[a.department] ?? 999;
                const pB = DEPT_PRIORITY[b.department] ?? 999;
                if (pA !== pB) return pA - pB;
                const dA = (a.department || '').toLowerCase();
                const dB = (b.department || '').toLowerCase();
                if (dA !== dB) return dA.localeCompare(dB, 'zh-TW');
                const rA = ROLE_RANK[a.role] ?? 3;
                const rB = ROLE_RANK[b.role] ?? 3;
                if (rA !== rB) return rA - rB;
                return (a.name || '').localeCompare(b.name || '', 'zh-TW');
              });
              return sortedUsers.map((user, idx) => (
              <div key={user.id} style={{
                display:         'grid',
                gridTemplateColumns: 'minmax(180px,2fr) minmax(140px,1.5fr) 100px 80px 80px 110px 120px',
                padding:         '12px 16px',
                borderBottom:    idx < sortedUsers.length - 1 ? '1px solid var(--xc-border)' : 'none',
                alignItems:      'center',
                gap:             12,
                opacity:         user.isActive ? 1 : 0.6,
                transition:      'background 0.1s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--xc-bg-soft)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* 姓名 / Email */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
                  ) : (
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--xc-brand)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 15, fontWeight: 700,
                    }}>
                      {user.name?.[0] || '?'}
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--xc-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--xc-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
                  </div>
                </div>
                {/* 部門 / 職稱 */}
                <div style={{ fontSize: 14, color: 'var(--xc-text-soft)' }}>
                  {user.department && <div style={{ fontWeight: 500 }}>{user.department}</div>}
                  {user.jobTitle   && <div style={{ color: 'var(--xc-text-muted)' }}>{user.jobTitle}</div>}
                  {!user.department && !user.jobTitle && <span style={{ color: 'var(--xc-text-muted)' }}>—</span>}
                </div>
                {/* 角色 */}
                <div><RoleBadge role={user.role} /></div>
                {/* 狀態 */}
                <div><StatusBadge isActive={user.isActive} /></div>
                {/* 社群連結 */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(user.oauthProviders || []).map(p => (
                    <span key={p} title={p} style={{ fontSize: 17 }}>{PROVIDER_ICON[p] || '🔗'}</span>
                  ))}
                  {(!user.oauthProviders || user.oauthProviders.length === 0) && (
                    <span style={{ fontSize: 13, color: 'var(--xc-text-muted)' }}>—</span>
                  )}
                </div>
                {/* 最後登入 */}
                <div style={{ fontSize: 13, color: 'var(--xc-text-muted)' }}>
                  {fmtDate(user.lastLoginAt)}
                </div>
                {/* 操作按鈕 */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn variant="secondary" small onClick={() => setEditUser(user)}>編輯</Btn>
                  <Btn
                    variant={user.isActive ? 'danger' : 'success'}
                    small
                    onClick={() => handleToggle(user)}
                  >
                    {user.isActive ? '停用' : '啟用'}
                  </Btn>
                </div>
              </div>
            ));
          })()}
        </div>

        {/* ── 分頁 ───────────────────────────────────────── */}
        {meta.pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <Btn variant="secondary" disabled={page <= 1} onClick={() => { setPage(p => p - 1); loadUsers({ page: page - 1 }); }}>
              上一頁
            </Btn>
            <span style={{ padding: '8px 16px', fontSize: 15, color: 'var(--xc-text-muted)' }}>
              第 {meta.page} / {meta.pages} 頁（共 {meta.total} 筆）
            </span>
            <Btn variant="secondary" disabled={page >= meta.pages} onClick={() => { setPage(p => p + 1); loadUsers({ page: page + 1 }); }}>
              下一頁
            </Btn>
          </div>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────── */}
      {showCreate && (
        <CreateUserModal
          authFetch={authFetch}
          onClose={() => setShowCreate(false)}
          onCreated={(u) => {
            setUsers(p => [u, ...p]);
            loadStats();
            showToast(`已成功建立 ${u.name} 的帳號`);
          }}
        />
      )}

      {editUser && (
        <EditUserModal
          user={editUser}
          authFetch={authFetch}
          onClose={() => setEditUser(null)}
          onUpdated={(u) => {
            setUsers(p => p.map(x => x.id === u.id ? u : x));
            showToast(`已更新 ${u.name} 的資料`);
          }}
        />
      )}

      {/* ── Toast ────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position:   'fixed', bottom: 24, right: 24, zIndex: 9999,
          padding:    '12px 20px', borderRadius: 10,
          background: toast.type === 'error' ? '#dc2626' : 'var(--xc-success)',
          color:      '#fff', fontSize: 15, fontWeight: 600,
          boxShadow:  '0 4px 20px rgba(0,0,0,0.2)',
          animation:  'fadeIn 0.2s ease',
        }}>
          {toast.type === 'error' ? '⛔' : '✅'} {toast.msg}
        </div>
      )}
    </>
  );
}
