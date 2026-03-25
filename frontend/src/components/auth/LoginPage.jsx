/**
 * LoginPage — 系統登入頁面
 *
 * 設計風格：xCloud 品牌色 #C41230，乾淨專業的企業登入介面
 * 功能：
 *   - Email / 密碼表單
 *   - 顯示/隱藏密碼切換
 *   - 錯誤提示（API 回傳 or 欄位驗證）
 *   - 「記住我」（7 天 token 有效）
 *   - 登入中 loading 狀態
 *   - Enter 鍵送出
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import './LoginPage.css';

// 使用相對路徑，由 Vite proxy 轉發到後端
const API_BASE = '';

// ── Design Tokens ─────────────────────────────────────────────
const C = {
  accent:    'var(--xc-brand)',
  accentDk:  'var(--xc-brand-dark)',
  accentLt:  'var(--xc-brand-soft-strong)',
  pageBg:    'var(--xc-bg)',
  white:     'var(--xc-surface-strong)',
  border:    'var(--xc-border)',
  borderFocus:'var(--xc-brand)',
  t1:        'var(--xc-text)',
  t2:        'var(--xc-text-soft)',
  t3:        'var(--xc-text-muted)',
  error:     'var(--xc-danger)',
  success:   'var(--xc-success)',
  shadow:    'var(--xc-shadow)',
};

// ── SVG 圖示 ──────────────────────────────────────────────────
function IconEye({ size = 18, color = '#9CA3AF' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff({ size = 18, color = '#9CA3AF' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function IconLock({ size = 18, color = '#9CA3AF' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function IconMail({ size = 18, color = '#9CA3AF' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function IconSpinner({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'spin 0.8s linear infinite' }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function IconSun({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" />
    </svg>
  );
}

function IconMoon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3c0 5 4 9 9 9 .27 0 .53-.01.79-.03A6.78 6.78 0 0021 12.79z" />
    </svg>
  );
}

// ── OAuth 社群登入按鈕 ────────────────────────────────────────
function OAuthButton({ href, icon, label }) {
  return (
    <a
      href={href}
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            10,
        padding:        '10px 16px',
        border:         `1.5px solid ${C.border}`,
        borderRadius:   10,
        background:     C.white,
        color:          C.t1,
        fontSize:       13,
        fontWeight:     500,
        textDecoration: 'none',
        cursor:         'pointer',
        transition:     'border-color 0.15s, background 0.15s',
        userSelect:     'none',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = C.borderFocus;
        e.currentTarget.style.background  = 'var(--xc-bg-soft)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = C.border;
        e.currentTarget.style.background  = C.white;
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex' }}>{icon}</span>
      <span>{label}</span>
    </a>
  );
}

// ── 輸入框元件 ────────────────────────────────────────────────
function InputField({ id, label, type, value, onChange, placeholder, icon, rightSlot, error, disabled, onKeyDown }) {
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ marginBottom: 20 }}>
      <label htmlFor={id} style={{
        display: 'block', fontSize: 14, fontWeight: 600,
        color: error ? C.error : C.t2, marginBottom: 6,
      }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        {/* 左側圖示 */}
        <div style={{
          position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          pointerEvents: 'none', display: 'flex', alignItems: 'center',
        }}>
          {icon}
        </div>
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={type === 'password' ? 'current-password' : 'email'}
          style={{
            width: '100%',
            padding: '11px 40px 11px 40px',
            boxSizing: 'border-box',
            border: `1.5px solid ${error ? C.error : focused ? C.borderFocus : C.border}`,
            borderRadius: 10,
            fontSize: 14, color: C.t1,
            background: disabled ? 'var(--xc-surface-soft)' : C.white,
            outline: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            boxShadow: focused
              ? `0 0 0 3px ${error ? 'rgba(220, 38, 38, 0.14)' : 'rgba(196, 18, 48, 0.14)'}`
              : 'none',
          }}
        />
        {/* 右側插槽（密碼顯示切換）*/}
        {rightSlot && (
          <div style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          }}>
            {rightSlot}
          </div>
        )}
      </div>
      {error && (
        <p style={{ margin: '5px 0 0', fontSize: 12, color: C.error, display: 'flex', alignItems: 'center', gap: 4 }}>
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}

// ── 主元件 ────────────────────────────────────────────────────
export default function LoginPage() {
  const { login } = useAuth();
  const { mode, toggleMode } = useTheme();

  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPwd,     setShowPwd]     = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [errorMsg,    setErrorMsg]    = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // ── 欄位驗證 ─────────────────────────────────────────────────
  const validate = () => {
    const errors = {};
    if (!email.trim()) errors.email = '請輸入 Email';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Email 格式不正確';
    if (!password) errors.password = '請輸入密碼';
    else if (password.length < 4) errors.password = '密碼至少 4 個字元';
    return errors;
  };

  // ── 送出登入 ─────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setErrorMsg('');
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email:    email.trim().toLowerCase(),
          password,
        }),
      });
      const data = await res.json();

      if (data.success) {
        login({ token: data.token, user: data.user });
        // App.jsx 會自動偵測 user 變化並切換到主頁面
      } else {
        setErrorMsg(data.error || '登入失敗，請確認帳號密碼');
      }
    } catch {
      setErrorMsg('無法連線到伺服器，請確認系統是否正常運作');
    } finally {
      setLoading(false);
    }
  }, [email, password, login]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <>
      {/* CSS 動畫 */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="login-page">
        <div className="login-page__shell">
          <section className="login-page__brand" style={{ animation: 'fadeIn 0.4s ease' }}>
            <div>
              <div className="login-page__mode-bar">
                <div className="login-page__brand-badge">
                  <span className="login-page__brand-dot" />
                  xCloudPMIS Workspace
                </div>

                <button
                  type="button"
                  className="login-page__mode-toggle"
                  onClick={toggleMode}
                >
                  {mode === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
                  {mode === 'dark' ? '開燈模式' : '關燈模式'}
                </button>
              </div>

              <h1 className="login-page__brand-title">
                專案管理，少一點表演，多一點進度。
              </h1>

              <p className="login-page__brand-copy">
                給正在處理真實工作的人用的 PMIS。任務、專案、流程、工時與報告放在同一個系統裡，資訊一致，決策才會穩。
              </p>

              <div className="login-page__feature-list">
                {[
                  ['01', '任務與專案在同一條資料線上', '不用在不同工具之間手動比對狀態，進度與責任歸屬自然能接起來。'],
                  ['02', '管理者與執行者看到的是同一套事實', '首頁、報告、工作台與收件匣共享資料來源，減少認知落差。'],
                  ['03', '系統的節奏是幫助工作，而不是干擾工作', '把常用入口、搜尋與個人工作台放在第一層，維持日常操作的流暢度。'],
                ].map(([index, title, copy]) => (
                  <div key={index} className="login-page__feature">
                    <div className="login-page__feature-index">{index}</div>
                    <div>
                      <div className="login-page__feature-title">{title}</div>
                      <div className="login-page__feature-copy">{copy}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="login-page__brand-footer">
              <div className="login-page__brand-pill">任務、專案、流程、工時</div>
              <div className="login-page__brand-pill">繁體中文企業協作介面</div>
              <div className="login-page__brand-pill">xCloud 科技內部工作台</div>
            </div>
          </section>

          <section className="login-page__card" style={{ animation: 'fadeIn 0.4s ease' }}>
            <div className="login-page__logo-wrap">
              <div className="login-page__logo-row">
                <div className="login-page__logo-box">
                  <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                    <path d="M8 22L16 8l8 14H8z" fill="white" fillOpacity="0.9" />
                    <path d="M16 8L24 22" stroke="white" strokeWidth="1.5" strokeOpacity="0.5" />
                    <circle cx="24" cy="10" r="3" fill="white" fillOpacity="0.6" />
                  </svg>
                </div>

                <div>
                  <p className="login-page__eyebrow">{mode === 'dark' ? 'Night Workspace' : 'Secure Sign In'}</p>
                  <h1 className="login-page__heading">登入 xCloudPMIS</h1>
                </div>
              </div>

              <p className="login-page__subheading">
                使用你的系統帳號進入工作台。登入後會直接回到個人首頁與工作區。
              </p>
            </div>

          {/* 全域錯誤提示 */}
          {errorMsg && (
            <div className="login-page__error">
              <span style={{ fontSize: 16 }}>⛔</span>
              {errorMsg}
            </div>
          )}

          {/* Email 欄位 */}
          <InputField
            id="email"
            label="Email 帳號"
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setFieldErrors(p => ({...p, email: ''})); setErrorMsg(''); }}
            placeholder="name@company.com"
            icon={<IconMail size={16} color={fieldErrors.email ? C.error : C.t3} />}
            error={fieldErrors.email}
            disabled={loading}
            onKeyDown={handleKeyDown}
          />

          {/* 密碼欄位 */}
          <InputField
            id="password"
            label="密碼"
            type={showPwd ? 'text' : 'password'}
            value={password}
            onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({...p, password: ''})); setErrorMsg(''); }}
            placeholder="請輸入密碼"
            icon={<IconLock size={16} color={fieldErrors.password ? C.error : C.t3} />}
            error={fieldErrors.password}
            disabled={loading}
            onKeyDown={handleKeyDown}
            rightSlot={
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 4, display: 'flex', alignItems: 'center',
                  borderRadius: 4, color: C.t3,
                }}
                onMouseEnter={e => e.currentTarget.style.color = C.t2}
                onMouseLeave={e => e.currentTarget.style.color = C.t3}
                tabIndex={-1}
              >
                {showPwd ? <IconEyeOff size={17} color="currentColor" /> : <IconEye size={17} color="currentColor" />}
              </button>
            }
          />

          {/* 登入按鈕 */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="login-page__submit"
          >
            {loading ? (
              <>
                <IconSpinner size={18} />
                登入中...
              </>
            ) : '登入系統'}
          </button>

          {/* OAuth 社群帳號登入 */}
          <div style={{ margin: '4px 0 16px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
            }}>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <span style={{ fontSize: 12, color: C.t3, whiteSpace: 'nowrap', fontWeight: 500 }}>
                或使用社群帳號登入
              </span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Google 登入 */}
              <OAuthButton
                href="/api/auth/google"
                label="使用 Google 帳號登入"
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                }
              />

              {/* GitHub 登入 */}
              <OAuthButton
                href="/api/auth/github"
                label="使用 GitHub 帳號登入"
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                  </svg>
                }
              />

              {/* Microsoft 登入 */}
              <OAuthButton
                href="/api/auth/microsoft-login"
                label="使用 Microsoft 帳號登入"
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#F25022" d="M1 1h10v10H1z"/>
                    <path fill="#00A4EF" d="M13 1h10v10H13z"/>
                    <path fill="#7FBA00" d="M1 13h10v10H1z"/>
                    <path fill="#FFB900" d="M13 13h10v10H13z"/>
                  </svg>
                }
              />
            </div>
          </div>

          {/* 底部提示 */}
          <div className="login-page__credentials">
            <p style={{ margin: 0 }}>
              請使用系統管理員建立的正式帳號登入。
              <br />
              若尚未取得帳號，請聯絡貴單位系統管理員。
            </p>
          </div>

          <div className="login-page__footer">
            © 2026 xCloud 科技 · xCloudPMIS v2.0
          </div>
        </section>
        </div>
      </div>
    </>
  );
}
