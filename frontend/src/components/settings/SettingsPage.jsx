/**
 * 系統設定頁面
 *
 * 四個分頁：
 *   🏢 公司資訊   — 顯示 / 編輯公司名稱
 *   👤 個人資料   — 編輯姓名、Email；修改密碼
 *   📊 系統狀態   — Backend / PostgreSQL / Redis 健康卡片
 *   🗄️ 資料統計   — 各資料表計數總覽
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

// ── 常數 ──────────────────────────────────────────────────────
// API 使用相對路徑，由 Vite proxy 轉發到後端（見 vite.config.js）
const API_BASE = '';
// COMPANY_ID 與 CURRENT_USER_ID 已改由 useAuth() 動態取得

// ── 分頁定義 ─────────────────────────────────────────────────
const TABS = [
  { id: 'company',      icon: '🏢', label: '公司資訊' },
  { id: 'profile',      icon: '👤', label: '個人資料' },
  { id: 'integrations', icon: '🔗', label: '整合服務' },
  { id: 'system',       icon: '📊', label: '系統狀態' },
  { id: 'stats',        icon: '🗄️', label: '資料統計' },
];

// ════════════════════════════════════════════════════════════
// 共用元件
// ════════════════════════════════════════════════════════════

/** 卡片容器 */
function Card({ title, children, extra }) {
  return (
    <div style={{
      background:   '#fff',
      border:       '1px solid #e5e7eb',
      borderRadius: 12,
      padding:      24,
      marginBottom: 20,
    }}>
      {(title || extra) && (
        <div style={{
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
          marginBottom: 18,
        }}>
          {title && (
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111827' }}>
              {title}
            </h3>
          )}
          {extra}
        </div>
      )}
      {children}
    </div>
  );
}

/** 輸入框（帶標籤） */
function Field({ label, required, children, hint, error }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display:    'block',
        fontSize:   13,
        fontWeight: 500,
        color:      '#374151',
        marginBottom: 6,
      }}>
        {label}
        {required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && !error && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>{hint}</p>
      )}
      {error && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444' }}>{error}</p>
      )}
    </div>
  );
}

/** 文字輸入框 */
function Input({ value, onChange, placeholder, type = 'text', disabled }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width:        '100%',
        padding:      '8px 12px',
        border:       '1px solid #d1d5db',
        borderRadius: 8,
        fontSize:     14,
        color:        '#111827',
        background:   disabled ? '#f9fafb' : '#fff',
        cursor:       disabled ? 'not-allowed' : 'text',
        boxSizing:    'border-box',
        outline:      'none',
      }}
    />
  );
}

/** 主要按鈕 */
function PrimaryBtn({ onClick, disabled, loading, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding:       '9px 20px',
        background:    (disabled || loading) ? '#d1d5db' : '#2563eb',
        color:         '#fff',
        border:        'none',
        borderRadius:  8,
        fontSize:      14,
        fontWeight:    500,
        cursor:        (disabled || loading) ? 'not-allowed' : 'pointer',
        display:       'inline-flex',
        alignItems:    'center',
        gap:           6,
      }}
    >
      {loading && (
        <span style={{
          width: 14, height: 14,
          border: '2px solid rgba(255,255,255,0.4)',
          borderTop: '2px solid #fff',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          display: 'inline-block',
        }} />
      )}
      {children}
    </button>
  );
}

/** 成功 / 錯誤 提示橫幅 */
function Banner({ type, message, onClose }) {
  if (!message) return null;
  const isSuccess = type === 'success';
  return (
    <div style={{
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'space-between',
      padding:      '10px 14px',
      borderRadius: 8,
      marginBottom: 16,
      background:   isSuccess ? '#f0fdf4' : '#fef2f2',
      border:       `1px solid ${isSuccess ? '#86efac' : '#fca5a5'}`,
      color:        isSuccess ? '#15803d' : '#dc2626',
      fontSize:     13,
    }}>
      <span>{isSuccess ? '✅ ' : '❌ '}{message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'inherit', fontSize: 16, padding: 0, lineHeight: 1,
        }}
      >×</button>
    </div>
  );
}

/** 狀態徽章 */
function StatusBadge({ status }) {
  const ok = status === 'ok';
  return (
    <span style={{
      display:    'inline-flex',
      alignItems: 'center',
      gap:        5,
      padding:    '3px 10px',
      borderRadius: 20,
      fontSize:   12,
      fontWeight: 600,
      background: ok ? '#dcfce7' : '#fee2e2',
      color:      ok ? '#15803d' : '#dc2626',
    }}>
      <span style={{
        width: 7, height: 7,
        borderRadius: '50%',
        background: ok ? '#22c55e' : '#ef4444',
        display: 'inline-block',
      }} />
      {ok ? '正常' : '異常'}
    </span>
  );
}

// ════════════════════════════════════════════════════════════
// Tab 1：公司資訊
// ════════════════════════════════════════════════════════════
function CompanyTab() {
  const { user } = useAuth();
  const companyId = user?.companyId;

  const [company,  setCompany]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);
  const [newName,  setNewName]  = useState('');
  const [newSlug,  setNewSlug]  = useState('');
  const [slugErr,  setSlugErr]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [banner,   setBanner]   = useState({ type: '', message: '' });

  // 取得公司資訊
  const fetchCompany = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/api/settings/company?companyId=${companyId}`);
      const data = await res.json();
      setCompany(data.company);
      setNewName(data.company.name);
      setNewSlug(data.company.slug);
    } catch {
      setBanner({ type: 'error', message: '無法載入公司資訊' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCompany(); }, [fetchCompany]);

  // Slug 格式即時驗證
  const validateSlug = (val) => {
    if (!val) { setSlugErr('識別代碼不能為空'); return false; }
    if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(val)) {
      setSlugErr('只允許英文小寫、數字與連字號（-），長度 3–50，不可以連字號開頭或結尾');
      return false;
    }
    setSlugErr('');
    return true;
  };

  // 儲存
  const handleSave = async () => {
    if (!newName.trim()) return;
    if (!validateSlug(newSlug)) return;
    setSaving(true);
    try {
      const res  = await fetch(`${API_BASE}/api/settings/company/${company.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: newName.trim(), slug: newSlug.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新失敗');
      setCompany({ ...company, ...data.company });
      setEditing(false);
      setBanner({ type: 'success', message: data.message });
    } catch (err) {
      setBanner({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setNewName(company.name);
    setNewSlug(company.slug);
    setSlugErr('');
  };

  if (loading) return <p style={{ color: '#9ca3af', fontSize: 14 }}>載入中…</p>;

  return (
    <div>
      <Banner type={banner.type} message={banner.message} onClose={() => setBanner({ type: '', message: '' })} />

      <Card title="公司基本資訊">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* 公司名稱 */}
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="公司名稱" required>
              {editing ? (
                <Input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="請輸入公司名稱"
                />
              ) : (
                <div style={{
                  padding:      '8px 12px',
                  background:   '#f9fafb',
                  border:       '1px solid #e5e7eb',
                  borderRadius: 8,
                  fontSize:     14,
                  color:        '#111827',
                }}>
                  {company.name}
                </div>
              )}
            </Field>
          </div>

          {/* 識別代碼（可編輯） */}
          <Field
            label="識別代碼（Slug）"
            hint={editing ? '英文小寫、數字與連字號，長度 3–50 字元' : '系統唯一識別碼，可在編輯模式修改'}
          >
            {editing ? (
              <div>
                <input
                  value={newSlug}
                  onChange={e => { setNewSlug(e.target.value.toLowerCase()); validateSlug(e.target.value.toLowerCase()); }}
                  placeholder="例：my-company"
                  style={{
                    width: '100%', padding: '8px 12px',
                    border: `1px solid ${slugErr ? '#fca5a5' : '#d1d5db'}`,
                    borderRadius: 8, fontSize: 14,
                    fontFamily: 'monospace', outline: 'none',
                    boxSizing: 'border-box',
                    background: slugErr ? '#fff5f5' : 'white',
                  }}
                />
                {slugErr && (
                  <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{slugErr}</div>
                )}
              </div>
            ) : (
              <div style={{
                padding:      '8px 12px',
                background:   '#f3f4f6',
                border:       '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize:     14,
                color:        '#374151',
                fontFamily:   'monospace',
                display:      'flex',
                alignItems:   'center',
                gap:          8,
              }}>
                <span>{company.slug}</span>
                <span style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'sans-serif' }}>（點「編輯」可修改）</span>
              </div>
            )}
          </Field>

          {/* 狀態 */}
          <Field label="帳號狀態">
            <div style={{ paddingTop: 4 }}>
              <span style={{
                padding:    '4px 12px',
                borderRadius: 20,
                fontSize:   13,
                fontWeight: 500,
                background: company.isActive ? '#dcfce7' : '#fee2e2',
                color:      company.isActive ? '#15803d' : '#dc2626',
              }}>
                {company.isActive ? '✅ 啟用中' : '❌ 已停用'}
              </span>
            </div>
          </Field>

          {/* 建立時間 */}
          <Field label="建立時間">
            <div style={{
              padding:      '8px 12px',
              background:   '#f9fafb',
              border:       '1px solid #e5e7eb',
              borderRadius: 8,
              fontSize:     14,
              color:        '#6b7280',
            }}>
              {new Date(company.createdAt).toLocaleString('zh-TW')}
            </div>
          </Field>
        </div>

        {/* 操作按鈕 */}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          {editing ? (
            <>
              <PrimaryBtn onClick={handleSave} loading={saving} disabled={!newName.trim()}>
                💾 儲存變更
              </PrimaryBtn>
              <button
                onClick={handleCancel}
                style={{
                  padding:      '9px 16px',
                  background:   '#fff',
                  border:       '1px solid #d1d5db',
                  borderRadius: 8,
                  fontSize:     14,
                  cursor:       'pointer',
                  color:        '#374151',
                }}
              >
                取消
              </button>
            </>
          ) : (
            <PrimaryBtn onClick={() => setEditing(true)}>
              ✏️ 編輯公司資訊
            </PrimaryBtn>
          )}
        </div>
      </Card>

      {/* 更新記錄 */}
      <Card title="最後更新">
        <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
          {new Date(company.updatedAt).toLocaleString('zh-TW')}
        </p>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Tab 2：個人資料
// ════════════════════════════════════════════════════════════
function ProfileTab({ onGoToCompany }) {
  const { user, updateUser, logout } = useAuth();
  const userId = user?.id;

  const [profile,  setProfile]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [banner,   setBanner]   = useState({ type: '', message: '' });

  // 基本資料表單（含部門、電話、職稱、加入日期）
  const [infoForm, setInfoForm] = useState({
    name:       '',
    email:      '',
    department: '',
    phone:      '',
    jobTitle:   '',
    joinedAt:   '',
  });
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoErrors, setInfoErrors] = useState({});

  // 密碼表單
  const [pwdForm, setPwdForm] = useState({
    currentPassword: '',
    newPassword:     '',
    confirmPassword: '',
  });
  const [pwdSaving,  setPwdSaving]  = useState(false);
  const [pwdErrors,  setPwdErrors]  = useState({});
  const [showPwd,    setShowPwd]    = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/api/settings/profile?userId=${userId}`);
      const data = await res.json();
      setProfile(data.profile);
      setInfoForm({
        name:       data.profile.name       || '',
        email:      data.profile.email      || '',
        department: data.profile.department || '',
        phone:      data.profile.phone      || '',
        jobTitle:   data.profile.jobTitle   || '',
        joinedAt:   data.profile.joinedAt   || '',
      });
    } catch {
      setBanner({ type: 'error', message: '無法載入個人資料' });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  // 更新基本資料
  const handleInfoSave = async () => {
    const errs = {};
    if (!infoForm.name.trim())  errs.name  = '姓名不能為空';
    if (!infoForm.email.trim()) errs.email = 'Email 不能為空';
    if (Object.keys(errs).length) { setInfoErrors(errs); return; }
    setInfoErrors({});
    setInfoSaving(true);
    try {
      const res  = await fetch(`${API_BASE}/api/settings/profile/${userId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:       infoForm.name,
          email:      infoForm.email,
          department: infoForm.department,
          phone:      infoForm.phone,
          jobTitle:   infoForm.jobTitle,
          joinedAt:   infoForm.joinedAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新失敗');
      setProfile(p => ({ ...p, ...data.profile }));
      // 同步更新 AuthContext 中的使用者資訊
      updateUser({
        name:       data.profile.name,
        email:      data.profile.email,
        department: data.profile.department,
        phone:      data.profile.phone,
        jobTitle:   data.profile.jobTitle,
        joinedAt:   data.profile.joinedAt,
      });
      setBanner({ type: 'success', message: data.message });
    } catch (err) {
      setBanner({ type: 'error', message: err.message });
    } finally {
      setInfoSaving(false);
    }
  };

  // 修改密碼
  const handlePwdSave = async () => {
    const errs = {};
    if (!pwdForm.currentPassword) errs.currentPassword = '請輸入目前密碼';
    if (!pwdForm.newPassword)     errs.newPassword     = '請輸入新密碼';
    else if (pwdForm.newPassword.length < 6) errs.newPassword = '新密碼至少 6 個字元';
    if (pwdForm.newPassword !== pwdForm.confirmPassword) errs.confirmPassword = '兩次密碼不一致';
    if (Object.keys(errs).length) { setPwdErrors(errs); return; }
    setPwdErrors({});
    setPwdSaving(true);
    try {
      const res  = await fetch(`${API_BASE}/api/settings/profile/${userId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          currentPassword: pwdForm.currentPassword,
          newPassword:     pwdForm.newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '密碼更新失敗');
      setBanner({ type: 'success', message: '✅ 密碼已成功修改' });
      setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setBanner({ type: 'error', message: err.message });
    } finally {
      setPwdSaving(false);
    }
  };

  if (loading) return <p style={{ color: '#9ca3af', fontSize: 14 }}>載入中…</p>;

  return (
    <div>
      <Banner type={banner.type} message={banner.message} onClose={() => setBanner({ type: '', message: '' })} />

      {/* 頭像 + 角色 */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{
            width:      68,
            height:     68,
            borderRadius: '50%',
            background:   '#2563eb',
            color:        '#fff',
            fontSize:     28,
            fontWeight:   700,
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            flexShrink:   0,
          }}>
            {profile.name.slice(0, 1)}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#111827' }}>
              {profile.name}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>
              {profile.email}
            </div>
            <div style={{ marginTop: 6 }}>
              <span style={{
                padding:      '3px 10px',
                borderRadius: 20,
                fontSize:     12,
                fontWeight:   600,
                background:   profile.role === 'admin' ? '#fef3c7'
                            : profile.role === 'pm'    ? '#dbeafe'
                            : '#f0fdf4',
                color:        profile.role === 'admin' ? '#92400e'
                            : profile.role === 'pm'    ? '#1e40af'
                            : '#15803d',
              }}>
                {profile.roleLabel}
              </span>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>上次登入</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              {profile.lastLoginAt
                ? new Date(profile.lastLoginAt).toLocaleString('zh-TW')
                : '尚未記錄'}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>帳號建立</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              {new Date(profile.createdAt).toLocaleDateString('zh-TW')}
            </div>
          </div>
        </div>
      </Card>

      {/* 基本資料 */}
      <Card title="基本資料">
        <div style={{ maxWidth: 480 }}>
          <Field label="姓名" required error={infoErrors.name}>
            <Input
              value={infoForm.name}
              onChange={e => setInfoForm({ ...infoForm, name: e.target.value })}
              placeholder="請輸入姓名"
            />
          </Field>
          <Field label="電子郵件" required error={infoErrors.email}>
            <Input
              type="email"
              value={infoForm.email}
              onChange={e => setInfoForm({ ...infoForm, email: e.target.value })}
              placeholder="請輸入 Email"
            />
          </Field>
          {/* 所屬公司：唯讀資訊卡，公司名稱在「公司資訊」分頁管理 */}
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block', fontSize: 13, fontWeight: 500,
              color: '#374151', marginBottom: 6,
            }}>
              所屬公司
            </label>
            <div style={{
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'space-between',
              padding:      '10px 14px',
              background:   '#F8FAFC',
              border:       '1.5px solid #E2E8F0',
              borderRadius: 10,
              gap:          12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>🏢</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                  {profile?.company?.name || user?.company?.name || '—'}
                </span>
              </div>
              <button
                type="button"
                onClick={onGoToCompany}
                style={{
                  background:   '#EFF6FF',
                  color:        '#2563EB',
                  border:       '1px solid #BFDBFE',
                  borderRadius: 7,
                  padding:      '5px 12px',
                  fontSize:     12,
                  fontWeight:   600,
                  cursor:       'pointer',
                  whiteSpace:   'nowrap',
                  flexShrink:   0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#DBEAFE'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#EFF6FF'; }}
              >
                修改公司名稱 →
              </button>
            </div>
            <p style={{ margin: '5px 0 0', fontSize: 12, color: '#9CA3AF' }}>
              公司名稱由組織統一管理，請至「🏢 公司資訊」分頁修改
            </p>
          </div>

          <Field label="部門">
            <Input
              value={infoForm.department}
              onChange={e => setInfoForm({ ...infoForm, department: e.target.value })}
              placeholder="例：資訊技術部"
            />
          </Field>
          <Field label="職稱">
            <Input
              value={infoForm.jobTitle}
              onChange={e => setInfoForm({ ...infoForm, jobTitle: e.target.value })}
              placeholder="例：系統管理員"
            />
          </Field>
          <Field label="聯絡電話">
            <Input
              value={infoForm.phone}
              onChange={e => setInfoForm({ ...infoForm, phone: e.target.value })}
              placeholder="例：+886 912-345-678"
            />
          </Field>
          <Field label="加入日期" hint="格式：YYYY-MM-DD">
            <Input
              type="date"
              value={infoForm.joinedAt}
              onChange={e => setInfoForm({ ...infoForm, joinedAt: e.target.value })}
            />
          </Field>
          <Field label="角色" hint="角色由管理員設定，無法自行修改">
            <Input value={profile.roleLabel} disabled />
          </Field>
          <div style={{ marginTop: 4 }}>
            <PrimaryBtn
              onClick={handleInfoSave}
              loading={infoSaving}
              disabled={
                infoForm.name === profile.name &&
                infoForm.email === profile.email
              }
            >
              💾 儲存基本資料
            </PrimaryBtn>
          </div>
        </div>
      </Card>

      {/* 修改密碼 */}
      <Card
        title="修改密碼"
        extra={
          <button
            onClick={() => setShowPwd(v => !v)}
            style={{
              background: 'none', border: '1px solid #d1d5db',
              borderRadius: 6, padding: '4px 10px',
              fontSize: 12, cursor: 'pointer', color: '#6b7280',
            }}
          >
            {showPwd ? '▲ 收起' : '▼ 展開'}
          </button>
        }
      >
        {showPwd && (
          <div style={{ maxWidth: 480 }}>
            <Field label="目前密碼" required error={pwdErrors.currentPassword}>
              <Input
                type="password"
                value={pwdForm.currentPassword}
                onChange={e => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
                placeholder="請輸入目前使用的密碼"
              />
            </Field>
            <Field
              label="新密碼"
              required
              error={pwdErrors.newPassword}
              hint="至少 6 個字元"
            >
              <Input
                type="password"
                value={pwdForm.newPassword}
                onChange={e => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                placeholder="請設定新密碼"
              />
            </Field>
            <Field label="確認新密碼" required error={pwdErrors.confirmPassword}>
              <Input
                type="password"
                value={pwdForm.confirmPassword}
                onChange={e => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
                placeholder="再次輸入新密碼"
              />
            </Field>

            {/* 密碼強度提示 */}
            {pwdForm.newPassword && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>密碼強度</div>
                <div style={{
                  height: 4, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    borderRadius: 4,
                    width: pwdForm.newPassword.length >= 12 ? '100%'
                         : pwdForm.newPassword.length >= 8  ? '66%'
                         : pwdForm.newPassword.length >= 6  ? '33%'
                         : '10%',
                    background: pwdForm.newPassword.length >= 12 ? '#22c55e'
                              : pwdForm.newPassword.length >= 8  ? '#eab308'
                              : '#ef4444',
                    transition: 'all 0.3s',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
                  {pwdForm.newPassword.length >= 12 ? '強'
                 : pwdForm.newPassword.length >= 8  ? '中等'
                 : pwdForm.newPassword.length >= 6  ? '弱'
                 : '太短'}
                </div>
              </div>
            )}

            <PrimaryBtn onClick={handlePwdSave} loading={pwdSaving}>
              🔒 更新密碼
            </PrimaryBtn>
          </div>
        )}
        {!showPwd && (
          <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>
            點選「展開」以修改登入密碼
          </p>
        )}
      </Card>

      {/* 登出 */}
      <Card title="帳號操作">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
              登出系統
            </div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              登出後需重新輸入帳號密碼才能使用系統
            </div>
          </div>
          <button
            onClick={() => { if (window.confirm('確定要登出嗎？')) logout(); }}
            style={{
              padding:      '9px 20px',
              background:   '#fef2f2',
              color:        '#dc2626',
              border:       '1px solid #fca5a5',
              borderRadius: 8,
              fontSize:     14,
              fontWeight:   600,
              cursor:       'pointer',
              whiteSpace:   'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; }}
          >
            🚪 登出系統
          </button>
        </div>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Tab 3 + 4：系統狀態 & 資料統計（共用同一個 API）
// ════════════════════════════════════════════════════════════

/** 系統健康卡片 */
function HealthCard({ icon, title, status, version, latency, extra }) {
  const isOk = status === 'ok';
  return (
    <div style={{
      background:   '#fff',
      border:       `1px solid ${isOk ? '#e5e7eb' : '#fca5a5'}`,
      borderRadius: 12,
      padding:      20,
      position:     'relative',
      overflow:     'hidden',
    }}>
      {/* 左側色條 */}
      <div style={{
        position:   'absolute',
        left:       0,
        top:        0,
        bottom:     0,
        width:      4,
        background: isOk ? '#22c55e' : '#ef4444',
      }} />
      <div style={{ paddingLeft: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>{icon}</span>
            <span style={{ fontWeight: 600, fontSize: 15, color: '#111827' }}>{title}</span>
          </div>
          <StatusBadge status={status} />
        </div>
        {version && (
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
            版本：<span style={{ fontFamily: 'monospace', color: '#374151' }}>{version}</span>
          </div>
        )}
        {latency !== undefined && (
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
            延遲：
            <span style={{
              fontFamily: 'monospace',
              color: latency < 50 ? '#15803d' : latency < 200 ? '#92400e' : '#dc2626',
            }}>
              {latency} ms
            </span>
          </div>
        )}
        {extra && extra.map((item, i) => (
          <div key={i} style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>
            {item.label}：<span style={{ color: '#374151' }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 統計數字卡片 */
function StatCard({ icon, label, value, sub, color = '#2563eb' }) {
  return (
    <div style={{
      background:   '#fff',
      border:       '1px solid #e5e7eb',
      borderRadius: 12,
      padding:      18,
      textAlign:    'center',
    }}>
      <div style={{ fontSize: 26, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, marginBottom: 2 }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>{label}</div>
      {sub && (
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

function SystemStatsTab({ activeTab }) {
  const { user } = useAuth();
  const companyId = user?.companyId;

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [lastFetch, setLastFetch] = useState(null);

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`${API_BASE}/api/settings/system?companyId=${companyId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '查詢失敗');
      setData(json);
      setLastFetch(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <p style={{ color: '#9ca3af', fontSize: 14 }}>載入中…</p>;
  if (error)   return (
    <div>
      <Banner type="error" message={error} onClose={() => setError('')} />
      <PrimaryBtn onClick={fetchData}>重新載入</PrimaryBtn>
    </div>
  );

  const { health, stats, lastActivity, generatedAt } = data;

  // ── 系統狀態分頁 ──────────────────────────────────────────
  if (activeTab === 'system') {
    return (
      <div>
        {/* 重新整理 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
            查詢時間：{lastFetch?.toLocaleString('zh-TW') || '-'}
          </p>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              padding:      '7px 14px',
              background:   '#fff',
              border:       '1px solid #d1d5db',
              borderRadius: 8,
              fontSize:     13,
              cursor:       'pointer',
              color:        '#374151',
              display:      'flex',
              alignItems:   'center',
              gap:          5,
            }}
          >
            🔄 重新整理
          </button>
        </div>

        {/* 健康卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
          <HealthCard
            icon="⚙️"
            title="後端服務"
            status={health.backend.status}
            version={health.backend.version}
            latency={health.backend.latencyMs}
            extra={[
              { label: 'Node.js', value: health.backend.nodeVersion },
              { label: '運行時間', value: health.backend.uptime },
            ]}
          />
          <HealthCard
            icon="🐘"
            title="PostgreSQL"
            status={health.database.status}
            version={health.database.version}
            latency={health.database.latencyMs}
          />
        </div>

        {/* 最後操作時間 */}
        <Card title="最後操作記錄">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {[
              { label: '最後更新任務', value: lastActivity.taskUpdatedAt },
              { label: '最後工時記錄', value: lastActivity.timeEntryUpdatedAt },
              { label: '最後更新專案', value: lastActivity.projectUpdatedAt },
            ].map(item => (
              <div key={item.label} style={{
                padding: '12px 16px',
                background: '#f9fafb',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
              }}>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>
                  {item.value ? new Date(item.value).toLocaleString('zh-TW') : '—'}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'right', margin: 0 }}>
          資料產生時間：{new Date(generatedAt).toLocaleString('zh-TW')}
        </p>
      </div>
    );
  }

  // ── 資料統計分頁 ──────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
          公司 ID：{companyId} 的完整資料統計
        </p>
        <button
          onClick={fetchData}
          style={{
            padding:      '7px 14px',
            background:   '#fff',
            border:       '1px solid #d1d5db',
            borderRadius: 8,
            fontSize:     13,
            cursor:       'pointer',
            color:        '#374151',
          }}
        >
          🔄 重新整理
        </button>
      </div>

      {/* 使用者 */}
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>
          👥 使用者
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          <StatCard icon="👥" label="總人數"   value={stats.users.total}  color="#2563eb" />
          <StatCard icon="✅" label="啟用中"   value={stats.users.active} color="#16a34a"
            sub={`${stats.users.total > 0 ? Math.round(stats.users.active / stats.users.total * 100) : 0}%`}
          />
        </div>
      </div>

      {/* 專案 & 任務 */}
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>
          📁 專案 & 任務
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          <StatCard icon="📁" label="專案總數" value={stats.projects.total} color="#7c3aed" />
          <StatCard icon="📋" label="任務總數" value={stats.tasks.total}    color="#2563eb" />
          <StatCard icon="✅" label="已完成任務" value={stats.tasks.done}   color="#16a34a"
            sub={`完成率 ${stats.tasks.doneRate}%`}
          />
        </div>
      </div>

      {/* 里程碑 */}
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>
          🏁 里程碑
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          <StatCard icon="🏁" label="里程碑總數"   value={stats.milestones.total}    color="#0891b2" />
          <StatCard icon="🎯" label="已達成"       value={stats.milestones.achieved} color="#16a34a"
            sub={`${stats.milestones.total > 0 ? Math.round(stats.milestones.achieved / stats.milestones.total * 100) : 0}%`}
          />
        </div>
      </div>

      {/* 工時記錄 */}
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>
          ⏱️ 工時記錄
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          <StatCard icon="⏱️" label="記錄總筆數" value={stats.timeEntries.total}     color="#2563eb" />
          <StatCard icon="✅" label="已結束"     value={stats.timeEntries.completed} color="#16a34a" />
          <StatCard icon="🔄" label="進行中"     value={stats.timeEntries.active}    color="#f59e0b" />
        </div>
      </div>

      {/* 其他 */}
      <div style={{ marginBottom: 8 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>
          🗂️ 其他資料
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          <StatCard icon="🏷️" label="標籤"         value={stats.tags}         color="#6b7280" />
          <StatCard icon="💬" label="留言"         value={stats.comments}     color="#6b7280" />
          <StatCard icon="📝" label="活動記錄"     value={stats.activityLogs} color="#6b7280" />
        </div>
      </div>

      <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'right', margin: '12px 0 0' }}>
        資料產生時間：{new Date(generatedAt).toLocaleString('zh-TW')}
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Tab 5：整合服務（Microsoft OAuth）
// ════════════════════════════════════════════════════════════

/** 資訊列（label + value 二欄） */
function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}

/** 旋轉 Spinner（小尺寸） */
function Spinner({ color = '#fff' }) {
  return (
    <span style={{
      width: 12, height: 12,
      border: `2px solid ${color}44`,
      borderTop: `2px solid ${color}`,
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      display: 'inline-block',
    }} />
  );
}

function IntegrationsTab({ callbackState }) {
  const [msStatus,    setMsStatus]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [connecting,  setConnecting]  = useState(false);
  const [revoking,    setRevoking]    = useState(false);
  const [banner,      setBanner]      = useState({ type: '', message: '' });
  const [jwtToken,    setJwtToken]    = useState(null);

  // ── Azure OAuth 快速設定表單 ────────────────────────────────
  const [oauthForm,    setOauthForm]    = useState({ clientId: '', clientSecret: '' });
  const [savingConfig, setSavingConfig] = useState(false);

  // ── 取得開發用 JWT ─────────────────────────────────────────
  const getJwt = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/auth/dev-token`);
      const data = await res.json();
      if (data.token) {
        setJwtToken(data.token);
        return data.token;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // ── 查詢 Microsoft 連線狀態 ────────────────────────────────
  const fetchMsStatus = useCallback(async (token) => {
    try {
      const res  = await fetch(`${API_BASE}/auth/microsoft/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMsStatus(data);
    } catch {
      setMsStatus({ connected: false, configured: false });
    } finally {
      setLoading(false);
    }
  }, []);

  // ── 掛載：讀取回呼狀態 + 初始化 ───────────────────────────
  useEffect(() => {
    if (callbackState?.msConnected === '1') {
      setBanner({
        type: 'success',
        message: `✅ Microsoft 帳號已成功連線${callbackState.msEmail ? `（${callbackState.msEmail}）` : ''}`,
      });
    } else if (callbackState?.msError) {
      // 後端錯誤碼（大寫）→ 使用者可理解的中文說明
      const ERROR_MAP = {
        // ── 後端回呼處理錯誤 ──────────────────────────────────
        MISSING_CALLBACK_PARAMS:   '回呼參數不完整，請重新點擊「連接 Microsoft 帳號」',
        INVALID_OR_EXPIRED_STATE:  'OAuth 授權已逾時（需在 10 分鐘內完成），請重試',
        STATE_PARSE_ERROR:         '授權狀態解析失敗，請重試',
        INCOMPLETE_TOKEN_RESPONSE: 'Microsoft 回傳 Token 不完整，請重試',
        TOKEN_SAVE_FAILED:         'Token 儲存失敗，請確認資料庫連線正常後重試',
        STATE_COLLISION:           '狀態碼產生衝突，請重試',
        OAUTH_NOT_CONFIGURED:      '⚠️ Azure AD 尚未完成設定，請先填入 OAUTH_MICROSOFT_CLIENT_ID 和 OAUTH_MICROSOFT_CLIENT_SECRET',
        // ── Microsoft 回傳的 OAuth 錯誤（大寫化） ─────────────
        ACCESS_DENIED:             '您已取消 Microsoft 帳號授權',
        INVALID_CLIENT:            'Azure Client ID 無效，請確認 .env 中的 OAUTH_MICROSOFT_CLIENT_ID 設定正確',
        UNAUTHORIZED_CLIENT:       'Azure 應用程式未授權此操作，請確認 API 權限設定',
        CONSENT_REQUIRED:          '需要管理員授予同意（Admin Consent），請聯絡 IT 管理員',
        INTERACTION_REQUIRED:      '需要用戶額外互動（可能需要 MFA），請重試',
        TEMPORARILY_UNAVAILABLE:   'Microsoft 服務暫時不可用，請稍後重試',
        SERVER_ERROR:              'Microsoft 伺服器發生錯誤，請稍後重試',
      };
      const errMsg = ERROR_MAP[callbackState.msError]
        // ms_message 是後端 errorRedirect 附帶的詳細說明（備援）
        || callbackState.msMessage
        || `連線失敗（${callbackState.msError}）`;
      setBanner({ type: 'error', message: errMsg });
    }
    (async () => {
      const token = await getJwt();
      if (token) await fetchMsStatus(token);
      else setLoading(false);
    })();
  }, [callbackState, getJwt, fetchMsStatus]);

  // ── 發起 OAuth 授權 ────────────────────────────────────────
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const token = jwtToken || await getJwt();
      if (!token) throw new Error('無法取得認證 token，請確認後端已啟動（docker-compose up）');
      const res  = await fetch(`${API_BASE}/auth/microsoft`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept:        'application/json',
        },
      });
      const data = await res.json();
      if (!res.ok) {
        // 後端回傳的結構化錯誤（含 detail 詳細說明）
        const msg = data.detail || data.error || '無法取得授權連結';
        throw new Error(msg);
      }
      if (!data.authorizationUrl) throw new Error('回應中缺少授權 URL，請確認後端設定');
      // 導向 Microsoft 登入頁
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setBanner({ type: 'error', message: err.message });
      setConnecting(false);
    }
  };

  // ── 撤銷授權 ──────────────────────────────────────────────
  const handleRevoke = async () => {
    if (!window.confirm('確定要解除 Microsoft 帳號授權嗎？\n解除後 AI Agent 將無法存取 Email 和行事曆。')) return;
    setRevoking(true);
    try {
      const token = jwtToken || await getJwt();
      const res   = await fetch(`${API_BASE}/auth/microsoft/revoke`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '撤銷失敗');
      setBanner({ type: 'success', message: '已成功解除 Microsoft 帳號授權' });
      await fetchMsStatus(token);
    } catch (err) {
      setBanner({ type: 'error', message: err.message });
    } finally {
      setRevoking(false);
    }
  };

  // ── 儲存 Azure OAuth 設定 ──────────────────────────────────
  const handleSaveConfig = async () => {
    if (!oauthForm.clientId.trim()) {
      setBanner({ type: 'error', message: '請填入「應用程式 (用戶端) 識別碼」' });
      return;
    }
    if (!oauthForm.clientSecret.trim()) {
      setBanner({ type: 'error', message: '請填入「用戶端密碼值」' });
      return;
    }
    setSavingConfig(true);
    try {
      const token = jwtToken || await getJwt();
      if (!token) throw new Error('無法取得認證 token，請確認後端已啟動');
      const res  = await fetch(`${API_BASE}/auth/microsoft/config`, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept:         'application/json',
        },
        body: JSON.stringify({
          clientId:     oauthForm.clientId.trim(),
          clientSecret: oauthForm.clientSecret.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '設定更新失敗');
      setBanner({ type: 'success', message: data.message });
      setOauthForm({ clientId: '', clientSecret: '' });
      // 重新取得連線狀態（configured 應變為 true）
      if (token) await fetchMsStatus(token);
    } catch (err) {
      setBanner({ type: 'error', message: err.message });
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading) return <p style={{ color: '#9ca3af', fontSize: 14 }}>載入連線狀態中…</p>;

  const connected     = msStatus?.connected === true;
  const isConfigured  = msStatus?.configured !== false;

  return (
    <div>
      <Banner
        type={banner.type}
        message={banner.message}
        onClose={() => setBanner({ type: '', message: '' })}
      />

      {/* ── Microsoft 365 連線卡片 ── */}
      <Card
        title="🔵 Microsoft 365 / Azure AD 連線"
        extra={
          <span style={{
            padding:    '3px 10px',
            borderRadius: 20,
            fontSize:   12,
            fontWeight: 600,
            background: connected ? '#dcfce7' : '#f1f5f9',
            color:      connected ? '#15803d' : '#64748b',
            display:    'inline-flex',
            alignItems: 'center',
            gap:        5,
          }}>
            <span style={{
              width: 7, height: 7,
              borderRadius: '50%',
              display: 'inline-block',
              background: connected ? '#22c55e' : '#94a3b8',
            }} />
            {connected ? '已連線' : '未連線'}
          </span>
        }
      >
        {connected ? (
          /* 已連線 */
          <div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 14,
              background: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: 10,
              padding: '16px 20px',
              marginBottom: 20,
            }}>
              <InfoRow label="帳號 Email"   value={msStatus.email        || '—'} />
              <InfoRow label="顯示名稱"     value={msStatus.displayName  || '—'} />
              <InfoRow label="Token 到期"   value={
                msStatus.tokenExpiresAt
                  ? new Date(msStatus.tokenExpiresAt).toLocaleString('zh-TW')
                  : '—'
              } />
              <InfoRow label="授權範圍" value={
                Array.isArray(msStatus.scopes) && msStatus.scopes.length > 0
                  ? msStatus.scopes.join(', ')
                  : (msStatus.scope || '—')
              } />
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={handleRevoke}
                disabled={revoking}
                style={{
                  padding:      '8px 18px',
                  background:   revoking ? '#f9fafb' : '#fef2f2',
                  color:        revoking ? '#9ca3af' : '#dc2626',
                  border:       '1px solid',
                  borderColor:  revoking ? '#e5e7eb' : '#fca5a5',
                  borderRadius: 8,
                  fontSize:     14,
                  fontWeight:   500,
                  cursor:       revoking ? 'not-allowed' : 'pointer',
                  display:      'inline-flex',
                  alignItems:   'center',
                  gap:          6,
                }}
              >
                {revoking && <Spinner color="#dc2626" />}
                {revoking ? '解除中…' : '🔓 解除授權'}
              </button>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>
                解除後 AI Agent 將無法存取 Email 和行事曆
              </span>
            </div>
          </div>
        ) : (
          /* 未連線 */
          <div>
            <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151', lineHeight: 1.7 }}>
              連接 Microsoft 帳號後，AI Agent 可以代您：
            </p>
            <ul style={{ margin: '0 0 20px 0', paddingLeft: 22, fontSize: 14, color: '#374151', lineHeight: 2 }}>
              <li>📬 讀取並摘要 Outlook 郵件（含附件分析）</li>
              <li>📅 查詢 / 建立 Teams 行事曆邀請</li>
              <li>📁 讀取 SharePoint / OneDrive 文件</li>
              <li>👥 查詢同事資訊（Teams 通訊錄）</li>
            </ul>

            {!isConfigured && (
              <>
                {/* 警告提示 */}
                <div style={{
                  padding:      '10px 14px',
                  background:   '#fffbeb',
                  border:       '1px solid #fcd34d',
                  borderRadius: 8,
                  marginBottom: 14,
                  fontSize:     13,
                  color:        '#92400e',
                  lineHeight:   1.6,
                }}>
                  ⚠️ <strong>Azure 應用程式尚未設定。</strong>
                  請至 <a href="https://portal.azure.com" target="_blank" rel="noreferrer"
                    style={{ color: '#b45309' }}>Azure Portal</a> 取得憑證後填入下方表單，或參考「設定指引」手動編輯 <code>.env</code>。
                </div>

                {/* 快速設定表單 */}
                <div style={{
                  background:   '#f8fafc',
                  border:       '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding:      '16px 18px',
                  marginBottom: 16,
                }}>
                  <p style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
                    🔑 填入 Azure 應用程式憑證
                  </p>

                  <div style={{ maxWidth: 480 }}>
                    <Field
                      label="應用程式 (用戶端) 識別碼"
                      hint="Azure Portal → 應用程式註冊 → 複製「應用程式 (用戶端) 識別碼」"
                    >
                      <Input
                        value={oauthForm.clientId}
                        onChange={e => setOauthForm({ ...oauthForm, clientId: e.target.value })}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      />
                    </Field>

                    <Field
                      label="用戶端密碼（Value）"
                      hint="Azure Portal → 憑證及秘密 → 新增用戶端密碼 → 複製「值」欄（不是 ID）"
                    >
                      <Input
                        type="password"
                        value={oauthForm.clientSecret}
                        onChange={e => setOauthForm({ ...oauthForm, clientSecret: e.target.value })}
                        placeholder="請輸入密碼的「值」（Value），不是識別碼（ID）"
                      />
                    </Field>

                    <PrimaryBtn
                      onClick={handleSaveConfig}
                      loading={savingConfig}
                      disabled={!oauthForm.clientId.trim() || !oauthForm.clientSecret.trim()}
                    >
                      💾 儲存並立即套用
                    </PrimaryBtn>

                    <p style={{ margin: '10px 0 0', fontSize: 12, color: '#64748b' }}>
                      💡 設定儲存後立即生效，無需重啟後端服務。
                    </p>
                  </div>
                </div>
              </>
            )}

            <PrimaryBtn
              onClick={handleConnect}
              disabled={connecting || !isConfigured}
              loading={connecting}
            >
              {connecting ? '正在跳轉至 Microsoft 登入…' : '🔵 連接 Microsoft 帳號'}
            </PrimaryBtn>
          </div>
        )}

        {/* 所需授權範圍說明 */}
        <div style={{
          marginTop:    20,
          padding:      '10px 14px',
          background:   '#f8fafc',
          border:       '1px solid #e2e8f0',
          borderRadius: 8,
          fontSize:     12,
          color:        '#64748b',
        }}>
          <strong>所需授權範圍（Scopes）：</strong>
          <span style={{ marginLeft: 6 }}>
            User.Read、Mail.Read、Mail.Send、Calendars.ReadWrite、Files.Read.All、offline_access
          </span>
        </div>
      </Card>

      {/* ── Azure 應用程式設定指引 ── */}
      <Card title="🔧 Azure 應用程式設定指引">
        <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.8 }}>

          {/* ── Step 1：Azure Portal ── */}
          <p style={{ margin: '0 0 10px', fontWeight: 600, color: '#111827' }}>設定步驟（僅需一次）：</p>
          <ol style={{ margin: '0 0 20px', paddingLeft: 20 }}>
            <li>
              登入{' '}
              <a href="https://portal.azure.com" target="_blank" rel="noreferrer"
                style={{ color: '#2563eb' }}>Azure Portal</a>，進入「應用程式註冊」→「新增註冊」
            </li>
            <li>
              選「Web」平台，「重新導向 URI」可同時填入多個（每行一筆）：
              <div style={{
                background: '#1e293b', color: '#e2e8f0', borderRadius: 7,
                padding: '10px 14px', fontFamily: 'monospace', fontSize: 12,
                lineHeight: 1.9, margin: '8px 0 4px',
              }}>
                <div style={{ color: '#94a3b8' }}># 開發環境</div>
                <div style={{ color: '#86efac' }}>http://localhost:3010/auth/microsoft/callback</div>
                <div style={{ color: '#94a3b8', marginTop: 6 }}># 正式環境（換成貴公司實際網域）</div>
                <div style={{ color: '#38bdf8' }}>https://backend.your-company.com/auth/microsoft/callback</div>
              </div>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                ✅ Azure 支援同時登錄多個 URI，開發 / 正式環境可共用同一個 App 設定。
              </span>
            </li>
            <li>複製「應用程式（用戶端）識別碼」→ 填入 <code>.env</code> 的 <code>OAUTH_MICROSOFT_CLIENT_ID</code></li>
            <li>建立「用戶端密碼」→ 填入 <code>OAUTH_MICROSOFT_CLIENT_SECRET</code></li>
            <li>
              設定 <code>OAUTH_MICROSOFT_TENANT_ID</code>：
              單一租用戶填租用戶 ID，多租用戶（含外部使用者）填 <code>common</code>
            </li>
            <li>
              在「API 權限」→「新增權限」→「Microsoft Graph」→「委派的權限」加入：
              User.Read、Mail.Read、Mail.Send、Calendars.ReadWrite、Files.Read.All
            </li>
            <li>重啟後端服務後，點擊上方「連接 Microsoft 帳號」</li>
          </ol>

          {/* ── 正式環境 .env 設定範例 ── */}
          <div style={{
            background: '#fffbeb', border: '1px solid #fcd34d',
            borderRadius: 8, padding: '12px 16px', marginBottom: 16,
          }}>
            <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#92400e', fontSize: 13 }}>
              🚀 部署到正式環境時，需同步更新 <code>.env</code> 的以下兩個變數：
            </p>
            <div style={{
              background: '#1e293b', color: '#e2e8f0', borderRadius: 6,
              padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, lineHeight: 2,
            }}>
              <div>
                <span style={{ color: '#94a3b8' }}># 後端 API 的對外網址（OAuth 回呼路徑）</span>
              </div>
              <div>
                <span style={{ color: '#f59e0b' }}>OAUTH_REDIRECT_URI</span>
                <span style={{ color: '#e2e8f0' }}>=</span>
                <span style={{ color: '#38bdf8' }}>https://backend.your-company.com/auth/microsoft/callback</span>
              </div>
              <div style={{ marginTop: 4 }}>
                <span style={{ color: '#94a3b8' }}># 前端的對外網址（OAuth 授權完成後跳回）</span>
              </div>
              <div>
                <span style={{ color: '#f59e0b' }}>FRONTEND_URL</span>
                <span style={{ color: '#e2e8f0' }}>=</span>
                <span style={{ color: '#38bdf8' }}>https://app.your-company.com</span>
              </div>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#92400e' }}>
              ⚠️ <code>OAUTH_REDIRECT_URI</code> 必須與 Azure Portal 中登錄的 URI 完全一致（包含 http/https、port、路徑），否則 OAuth 會報錯。
            </p>
          </div>

        </div>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 主頁面元件
// ════════════════════════════════════════════════════════════
export default function SettingsPage({ initialTab, callbackState }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'company');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f9fafb' }}>
      {/* CSS 動畫 */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        input:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
        }
      `}</style>

      {/* 頁面標題 */}
      <div style={{ padding: '20px 28px 0', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700, color: '#111827' }}>
          ⚙️ 系統設定
        </h2>

        {/* 分頁標籤 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding:       '9px 18px',
                border:        'none',
                borderBottom:  activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
                background:    'none',
                cursor:        'pointer',
                fontSize:      14,
                fontWeight:    activeTab === tab.id ? 600 : 400,
                color:         activeTab === tab.id ? '#2563eb' : '#6b7280',
                borderRadius:  '6px 6px 0 0',
                display:       'flex',
                alignItems:    'center',
                gap:           6,
                transition:    'all 0.15s',
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 內容區域 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        <div style={{ maxWidth: 720 }}>
          {activeTab === 'company'      && <CompanyTab />}
          {activeTab === 'profile'      && <ProfileTab onGoToCompany={() => setActiveTab('company')} />}
          {activeTab === 'integrations' && <IntegrationsTab callbackState={callbackState} />}
          {(activeTab === 'system' || activeTab === 'stats') && (
            <SystemStatsTab activeTab={activeTab} />
          )}
        </div>
      </div>
    </div>
  );
}
