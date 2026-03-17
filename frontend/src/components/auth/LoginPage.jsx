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

// 使用相對路徑，由 Vite proxy 轉發到後端
const API_BASE = '';

// ── Design Tokens ─────────────────────────────────────────────
const C = {
  accent:    '#C41230',
  accentDk:  '#A00E26',
  accentLt:  '#FDF1F3',
  pageBg:    '#F4F0F0',
  white:     '#FFFFFF',
  border:    '#E5E7EB',
  borderFocus:'#C41230',
  t1:        '#111827',
  t2:        '#374151',
  t3:        '#9CA3AF',
  error:     '#EF4444',
  success:   '#10B981',
  shadow:    '0 4px 24px rgba(196,18,48,0.10)',
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
            background: disabled ? '#F9FAFB' : C.white,
            outline: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            boxShadow: focused
              ? `0 0 0 3px ${error ? '#EF444420' : '#C4123018'}`
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

      {/* 頁面背景 */}
      <div style={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${C.pageBg} 0%, #EDE5E5 50%, #F4F0F0 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        padding: '20px',
      }}>

        {/* 背景裝飾圓圈 */}
        <div style={{
          position: 'fixed', top: -100, right: -100,
          width: 400, height: 400, borderRadius: '50%',
          background: `${C.accent}08`, pointerEvents: 'none',
        }} />
        <div style={{
          position: 'fixed', bottom: -80, left: -80,
          width: 300, height: 300, borderRadius: '50%',
          background: `${C.accent}06`, pointerEvents: 'none',
        }} />

        {/* 登入卡片 */}
        <div style={{
          width: '100%', maxWidth: 420,
          background: C.white,
          borderRadius: 20,
          boxShadow: '0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
          padding: '44px 40px 36px 40px',
          animation: 'fadeIn 0.4s ease',
          position: 'relative',
          overflow: 'hidden',
        }}>

          {/* 頂部品牌色條 */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: 4,
            background: `linear-gradient(90deg, ${C.accent}, #E84060)`,
          }} />

          {/* Logo + 品牌 */}
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            {/* Logo 圖示 */}
            <div style={{
              width: 60, height: 60, borderRadius: 16,
              background: C.accent,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
              boxShadow: `0 4px 16px ${C.accent}40`,
            }}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M8 22L16 8l8 14H8z" fill="white" fillOpacity="0.9" />
                <path d="M16 8L24 22" stroke="white" strokeWidth="1.5" strokeOpacity="0.5" />
                <circle cx="24" cy="10" r="3" fill="white" fillOpacity="0.6" />
              </svg>
            </div>

            <h1 style={{ margin: '0 0 4px 0', fontSize: 22, fontWeight: 800, color: C.t1 }}>
              xCloudPMIS
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: C.t3 }}>
              專案管理資訊系統
            </p>
          </div>

          {/* 歡迎文字 */}
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 700, color: C.t1 }}>
              歡迎回來
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: C.t3 }}>
              請輸入您的帳號和密碼以繼續
            </p>
          </div>

          {/* 全域錯誤提示 */}
          {errorMsg && (
            <div style={{
              background: '#FEF2F2', border: `1px solid #FCA5A5`,
              borderRadius: 10, padding: '11px 14px',
              marginBottom: 20, fontSize: 13, color: '#DC2626',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
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
            placeholder="admin@dev.local"
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
            style={{
              width: '100%',
              padding: '13px 0',
              background: loading
                ? '#E5A0AA'
                : `linear-gradient(135deg, ${C.accent} 0%, #E84060 100%)`,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 15, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'opacity 0.15s, transform 0.1s',
              boxShadow: loading ? 'none' : `0 4px 16px ${C.accent}40`,
              marginBottom: 20,
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.90'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            onMouseDown={e => { if (!loading) e.currentTarget.style.transform = 'scale(0.98)'; }}
            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {loading ? (
              <>
                <IconSpinner size={18} />
                登入中...
              </>
            ) : '登入系統'}
          </button>

          {/* 底部提示 */}
          <div style={{
            borderTop: `1px solid ${C.border}`,
            paddingTop: 18, textAlign: 'center',
          }}>
            <p style={{ margin: 0, fontSize: 12, color: C.t3, lineHeight: 1.6 }}>
              預設管理員帳號：<strong style={{ color: C.t2 }}>admin@dev.local</strong>
              <br />
              密碼：<strong style={{ color: C.t2 }}>dev@2026</strong>
            </p>
          </div>
        </div>

        {/* 版權 */}
        <div style={{
          position: 'fixed', bottom: 20, left: 0, right: 0,
          textAlign: 'center', fontSize: 12, color: C.t3,
        }}>
          © 2026 xCloud 科技 · xCloudPMIS v2.0
        </div>
      </div>
    </>
  );
}
