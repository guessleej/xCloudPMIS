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

// ── 常數 ──────────────────────────────────────────────────────
const API_BASE        = 'http://localhost:3010';
const COMPANY_ID      = 2;
const CURRENT_USER_ID = 4;   // 模擬登入使用者：陳志明（admin）

// ── 分頁定義 ─────────────────────────────────────────────────
const TABS = [
  { id: 'company',  icon: '🏢', label: '公司資訊' },
  { id: 'profile',  icon: '👤', label: '個人資料' },
  { id: 'system',   icon: '📊', label: '系統狀態' },
  { id: 'stats',    icon: '🗄️', label: '資料統計' },
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
  const [company,  setCompany]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);
  const [newName,  setNewName]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [banner,   setBanner]   = useState({ type: '', message: '' });

  // 取得公司資訊
  const fetchCompany = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/api/settings/company?companyId=${COMPANY_ID}`);
      const data = await res.json();
      setCompany(data.company);
      setNewName(data.company.name);
    } catch {
      setBanner({ type: 'error', message: '無法載入公司資訊' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCompany(); }, [fetchCompany]);

  // 儲存公司名稱
  const handleSave = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res  = await fetch(`${API_BASE}/api/settings/company/${company.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: newName.trim() }),
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

          {/* 識別代碼（唯讀） */}
          <Field label="識別代碼（Slug）" hint="系統內部使用，不可修改">
            <div style={{
              padding:      '8px 12px',
              background:   '#f3f4f6',
              border:       '1px solid #e5e7eb',
              borderRadius: 8,
              fontSize:     14,
              color:        '#6b7280',
              fontFamily:   'monospace',
            }}>
              {company.slug}
            </div>
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
                onClick={() => { setEditing(false); setNewName(company.name); }}
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
              ✏️ 編輯公司名稱
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
function ProfileTab() {
  const [profile,  setProfile]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [banner,   setBanner]   = useState({ type: '', message: '' });

  // 基本資料表單
  const [infoForm, setInfoForm] = useState({ name: '', email: '' });
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
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/api/settings/profile?userId=${CURRENT_USER_ID}`);
      const data = await res.json();
      setProfile(data.profile);
      setInfoForm({ name: data.profile.name, email: data.profile.email });
    } catch {
      setBanner({ type: 'error', message: '無法載入個人資料' });
    } finally {
      setLoading(false);
    }
  }, []);

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
      const res  = await fetch(`${API_BASE}/api/settings/profile/${CURRENT_USER_ID}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: infoForm.name, email: infoForm.email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新失敗');
      setProfile({ ...profile, name: data.profile.name, email: data.profile.email });
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
      const res  = await fetch(`${API_BASE}/api/settings/profile/${CURRENT_USER_ID}`, {
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
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [lastFetch, setLastFetch] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`${API_BASE}/api/settings/system?companyId=${COMPANY_ID}`);
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
          公司 ID：{COMPANY_ID} 的完整資料統計
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
// 主頁面元件
// ════════════════════════════════════════════════════════════
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('company');

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
          {activeTab === 'company' && <CompanyTab />}
          {activeTab === 'profile' && <ProfileTab />}
          {(activeTab === 'system' || activeTab === 'stats') && (
            <SystemStatsTab activeTab={activeTab} />
          )}
        </div>
      </div>
    </div>
  );
}
