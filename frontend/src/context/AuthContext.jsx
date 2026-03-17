/**
 * AuthContext — 全域身分驗證狀態管理
 *
 * 提供：
 *   auth.user        — 當前登入使用者資訊（null = 未登入）
 *   auth.token       — JWT Token
 *   auth.loading     — 初始化驗證中（true 時不要渲染頁面）
 *   auth.login(data) — 登入成功後更新狀態（data = { token, user }）
 *   auth.logout()    — 清除狀態並呼叫後端 logout
 *   auth.updateUser(fields) — 更新部分 user 資訊（例如改名後）
 *
 * Token 儲存：localStorage 的 'xcloud-auth-token'
 *
 * 使用方式：
 *   import { useAuth } from '../context/AuthContext';
 *   const { user, logout } = useAuth();
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_BASE = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
  ? import.meta.env.VITE_API_URL
  : 'http://localhost:3010';

const TOKEN_KEY = 'xcloud-auth-token';

// ── Context 建立 ──────────────────────────────────────────────
const AuthContext = createContext(null);

// ── Provider ──────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(() => localStorage.getItem(TOKEN_KEY) || null);
  const [loading, setLoading] = useState(true);  // 初始化驗證中

  // ── 初始化：從 localStorage 取得 token 並驗證 ──────────────
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (!storedToken) {
      setLoading(false);
      return;
    }

    // 呼叫 /api/auth/me 驗證 token 是否有效
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${storedToken}` },
    })
      .then(r => r.json())
      .then(json => {
        if (json.success && json.user) {
          setUser(json.user);
          setToken(storedToken);
        } else {
          // Token 無效 → 清除
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
        }
      })
      .catch(() => {
        // 網路錯誤時保留 token，讓使用者能在 backend 恢復後繼續使用
        // 但不設定 user（需等待 backend 回應）
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── 登入（Login API 成功後呼叫）────────────────────────────
  const login = useCallback(({ token: newToken, user: newUser }) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  // ── 登出 ────────────────────────────────────────────────────
  const logout = useCallback(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    // 通知後端（非同步，不等待結果）
    if (t) {
      fetch(`${API_BASE}/api/auth/logout`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${t}` },
      }).catch(() => {});
    }
    // 清除本地狀態
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // ── 更新部分使用者資訊（改名、改電話等）────────────────────
  const updateUser = useCallback((fields) => {
    setUser(prev => prev ? { ...prev, ...fields } : prev);
  }, []);

  // ── authFetch：自動夾帶 Authorization Header 的 fetch 包裝 ─
  const authFetch = useCallback((url, options = {}) => {
    const t = localStorage.getItem(TOKEN_KEY);
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    };
    return fetch(url, { ...options, headers });
  }, []);

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    updateUser,
    authFetch,
    isAdmin: user?.role === 'admin',
    isPM:    user?.role === 'pm' || user?.role === 'admin',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth 必須在 <AuthProvider> 內部使用');
  }
  return ctx;
}

export default AuthContext;
