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

import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage  from './components/auth/LoginPage';
import Dashboard  from './components/dashboard/Dashboard';

// ── 啟動載入畫面（驗證 token 時顯示）────────────────────────
function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #f3eee8 0%, #f6f2ee 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Avenir Next", "Segoe UI", "PingFang TC", "Noto Sans TC", sans-serif',
      gap: 20,
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
        background: '#C41230',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'pulse 1.4s ease-in-out infinite',
        boxShadow: '0 10px 24px rgba(196,18,48,0.16)',
      }}>
        <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
          <path d="M8 22L16 8l8 14H8z" fill="white" fillOpacity="0.9" />
          <path d="M16 8L24 22" stroke="white" strokeWidth="1.5" strokeOpacity="0.5" />
          <circle cx="24" cy="10" r="3" fill="white" fillOpacity="0.6" />
        </svg>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>
          xCloudPMIS
        </div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          正在準備工作台...
        </div>
      </div>
    </div>
  );
}

// ── 路由守衛 ──────────────────────────────────────────────────
function AuthGuard() {
  const { user, loading } = useAuth();

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
    <AuthProvider>
      <AuthGuard />
    </AuthProvider>
  );
}
