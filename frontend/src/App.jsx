/**
 * App.jsx — 應用程式根元件
 *
 * 架構：
 *   AuthProvider 包裹整個應用
 *   ↓
 *   AuthGuard 檢查登入狀態
 *     ├─ loading 中   → 顯示啟動載入畫面
 *     ├─ 未登入       → 顯示 <LoginPage />
 *     └─ 已登入       → 顯示 <Dashboard />（主系統）
 */

import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import LoginPage    from './components/auth/LoginPage';
import OAuthCallback from './components/auth/OAuthCallback';
import Dashboard    from './components/dashboard/Dashboard';

// ── 啟動載入畫面（驗證 token 時顯示）────────────────────────
function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, var(--xc-bg) 0%, var(--xc-bg-soft) 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--xc-font-sans)',
      gap: 20,
      color: 'var(--xc-text)',
    }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(0.96); }
        }
      `}</style>

      {/* Logo */}
      <div style={{
        width: 64, height: 64, borderRadius: 18,
        background: 'var(--xc-brand)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'pulse 1.4s ease-in-out infinite',
        boxShadow: 'var(--xc-shadow-strong)',
      }}>
        <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
          <path d="M8 22L16 8l8 14H8z" fill="white" fillOpacity="0.9" />
          <path d="M16 8L24 22" stroke="white" strokeWidth="1.5" strokeOpacity="0.5" />
          <circle cx="24" cy="10" r="3" fill="white" fillOpacity="0.6" />
        </svg>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--xc-text)', marginBottom: 4 }}>
          xCloudPMIS
        </div>
        <div style={{ fontSize: 13, color: 'var(--xc-text-muted)' }}>
          正在準備工作台...
        </div>
      </div>
    </div>
  );
}

// ── 偵測是否為 OAuth 回呼路由 ─────────────────────────────────
// URL hash 格式：/#/oauth/callback?token=xxx
function isOAuthCallbackRoute() {
  return window.location.hash.startsWith('#/oauth/callback');
}

// ── 路由守衛 ──────────────────────────────────────────────────
function AuthGuard() {
  const { user, loading } = useAuth();
  const [isOAuthCallback, setIsOAuthCallback] = useState(isOAuthCallbackRoute);

  // 監聽 hash 變化（OAuthCallback 處理完成後 hash 會被清除）
  useEffect(() => {
    const handler = () => setIsOAuthCallback(isOAuthCallbackRoute());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  // ── OAuth 回呼頁（最高優先，不管登入狀態）─────────────────
  if (isOAuthCallback) {
    return (
      <OAuthCallback
        onBack={() => {
          // 清除 hash，回到登入頁
          window.history.replaceState(null, '', window.location.pathname);
          setIsOAuthCallback(false);
        }}
      />
    );
  }

  // 正在驗證 token（初始化中）
  if (loading) return <LoadingScreen />;

  // 未登入 → 顯示登入頁
  if (!user)   return <LoginPage />;

  // 已登入 → 顯示主系統
  return <Dashboard />;
}

// ── 根元件 ────────────────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthGuard />
      </AuthProvider>
    </ThemeProvider>
  );
}
