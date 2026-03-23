/**
 * OAuthCallback — OAuth 登入回呼處理頁
 * ─────────────────────────────────────────────────────────────
 *
 * 由後端 OAuth callback 重導向至此頁面
 * URL 格式（hash fragment 模式，不經過 server）：
 *   /#/oauth/callback?token=xxx&provider=google   → 登入成功
 *   /#/oauth/callback?error=xxx                  → 登入失敗
 *
 * 流程：
 *   1. 解析 URL 中的 token 或 error 參數
 *   2. 成功 → 呼叫 AuthContext.login() 儲存 token → 重導向首頁
 *   3. 失敗 → 顯示錯誤訊息，3 秒後回到登入頁
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const API_BASE = '';

const PROVIDER_LABEL = {
  google:    'Google',
  github:    'GitHub',
  microsoft: 'Microsoft',
  oauth:     '社群帳號',
};

// ── SVG 圖示 ──────────────────────────────────────────────────
function IconSpinner({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="var(--xc-brand)" strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'spin 0.8s linear infinite' }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function IconCheck({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="var(--xc-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function IconError({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="var(--xc-danger)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

// ── 主元件 ────────────────────────────────────────────────────
export default function OAuthCallback({ onBack }) {
  const { login } = useAuth();
  const [status, setStatus]   = useState('loading'); // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');
  const [provider, setProvider] = useState('oauth');
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    // 解析 URL hash 中的 query 參數
    // URL 格式：/#/oauth/callback?token=xxx&provider=google
    const hash = window.location.hash; // e.g., "#/oauth/callback?token=xxx"
    const qIndex = hash.indexOf('?');
    const params = new URLSearchParams(qIndex >= 0 ? hash.slice(qIndex + 1) : '');

    const token    = params.get('token');
    const error    = params.get('error');
    const prov     = params.get('provider') || 'oauth';

    setProvider(prov);

    if (error) {
      setStatus('error');
      setMessage(decodeURIComponent(error));
      return;
    }

    if (!token) {
      setStatus('error');
      setMessage('登入回呼參數不完整，請重新嘗試');
      return;
    }

    // ── 用 token 呼叫 /api/auth/me 取得完整使用者資訊 ────────
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(json => {
        if (json.success && json.user) {
          login({ token, user: json.user });
          setStatus('success');
          setMessage(`歡迎回來，${json.user.name}！`);
        } else {
          setStatus('error');
          setMessage(json.error || '登入驗證失敗，請重新嘗試');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('無法連線到伺服器，請確認系統正常後再試');
      });
  }, [login]);

  // ── 錯誤時倒數回登入頁 ──────────────────────────────────────
  useEffect(() => {
    if (status !== 'error') return;
    if (countdown <= 0) {
      onBack?.();
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [status, countdown, onBack]);

  const providerLabel = PROVIDER_LABEL[provider] || '社群帳號';

  return (
    <>
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

      <div style={{
        minHeight:      '100vh',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     'var(--xc-bg)',
        fontFamily:     'var(--xc-font-sans)',
        padding:        '24px',
      }}>
        <div style={{
          background:   'var(--xc-surface-strong)',
          borderRadius: 20,
          padding:      '48px 40px',
          maxWidth:     440,
          width:        '100%',
          textAlign:    'center',
          animation:    'fadeIn 0.3s ease',
          boxShadow:    'var(--xc-shadow-strong)',
          border:       '1px solid var(--xc-border)',
        }}>

          {/* Logo */}
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'var(--xc-brand)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 24,
          }}>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <path d="M8 22L16 8l8 14H8z" fill="white" fillOpacity="0.9" />
              <circle cx="24" cy="10" r="3" fill="white" fillOpacity="0.6" />
            </svg>
          </div>

          {/* 狀態圖示 */}
          <div style={{ marginBottom: 20 }}>
            {status === 'loading' && <IconSpinner size={40} />}
            {status === 'success' && <IconCheck size={40} />}
            {status === 'error'   && <IconError size={40} />}
          </div>

          {/* 標題 */}
          <h2 style={{
            margin: '0 0 12px',
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--xc-text)',
          }}>
            {status === 'loading' && `正在驗證 ${providerLabel} 身分...`}
            {status === 'success' && '登入成功'}
            {status === 'error'   && '登入失敗'}
          </h2>

          {/* 說明 */}
          <p style={{
            margin: '0 0 28px',
            fontSize: 14,
            lineHeight: 1.6,
            color: status === 'error' ? 'var(--xc-danger)' : 'var(--xc-text-soft)',
          }}>
            {status === 'loading' && `正在透過 ${providerLabel} 驗證您的身分，請稍候...`}
            {status === 'success' && `${message} 正在進入工作台...`}
            {status === 'error'   && message}
          </p>

          {/* 錯誤時：倒數重導向 + 手動返回按鈕 */}
          {status === 'error' && (
            <>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--xc-text-muted)' }}>
                {countdown} 秒後自動返回登入頁...
              </p>
              <button
                onClick={onBack}
                style={{
                  padding:      '10px 24px',
                  borderRadius: 10,
                  border:       '1.5px solid var(--xc-border)',
                  background:   'transparent',
                  color:        'var(--xc-text)',
                  fontSize:     14,
                  fontWeight:   600,
                  cursor:       'pointer',
                  transition:   'all 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--xc-brand)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--xc-border)'}
              >
                返回登入頁
              </button>
            </>
          )}

          {/* 成功時進度提示 */}
          {status === 'success' && (
            <div style={{
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              gap:          8,
              fontSize:     13,
              color:        'var(--xc-text-muted)',
            }}>
              <IconSpinner size={14} />
              正在載入工作台...
            </div>
          )}

        </div>
      </div>
    </>
  );
}
