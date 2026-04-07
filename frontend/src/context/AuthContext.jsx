/**
 * AuthContext — 身份驗證狀態管理
 *
 * 提供：
 *   user        當前使用者物件（null = 未登入）
 *   token       JWT token 字串（null = 未登入）
 *   loading     初始驗證中
 *   login       ({ token, user }) => void
 *   logout      () => void
 *   updateUser  (partial) => void
 *   authFetch   (url, options?) => Promise<Response>  帶 Authorization header 的 fetch
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const AuthContext = createContext(null);

const TOKEN_KEY = 'xcloud-auth-token';
const USER_KEY  = 'xcloud-auth-user';
const API_BASE  = '';

export function AuthProvider({ children }) {
  const [token,      setToken]      = useState(null);
  const [user,       setUser]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [oauthError, setOauthError] = useState(null);

  // ── 啟動時：處理 OAuth callback 或從 localStorage 恢復 session ──
  useEffect(() => {
    (async () => {
      try {
        // 1. 檢查 URL 是否帶有 OAuth 結果參數
        const urlParams   = new URLSearchParams(window.location.search);
        const oauthToken  = urlParams.get('oauthToken');
        const oauthErrMsg = urlParams.get('oauthError');

        // 清除 URL 參數（不留在網址列）
        if (oauthToken || oauthErrMsg) {
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }

        // OAuth 錯誤處理
        if (oauthErrMsg) {
          setOauthError(decodeURIComponent(oauthErrMsg));
          setLoading(false);
          return;
        }

        // OAuth 成功：用 token 向後端取得完整使用者資料
        if (oauthToken) {
          const decoded = decodeURIComponent(oauthToken);
          const res = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { Authorization: `Bearer ${decoded}` },
          });
          if (res.ok) {
            const data = await res.json();
            const userData = data.user;
            setToken(decoded);
            setUser(userData);
            try {
              localStorage.setItem(TOKEN_KEY, decoded);
              localStorage.setItem(USER_KEY, JSON.stringify(userData));
            } catch (_) {}
          } else {
            setOauthError('OAuth 登入驗證失敗，請重試');
          }
          setLoading(false);
          return;
        }

        // 2. 一般啟動：從 localStorage 恢復 session
        const savedToken = localStorage.getItem(TOKEN_KEY);
        const savedUser  = localStorage.getItem(USER_KEY);
        if (savedToken && savedUser) {
          // 向後端驗證 token 是否仍有效
          const res = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { Authorization: `Bearer ${savedToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            setToken(savedToken);
            setUser(data.user || JSON.parse(savedUser));
          } else {
            // token 已過期，清除
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
          }
        }
      } catch (_) {
        // 網路錯誤時嘗試使用快取 user（離線友好）
        try {
          const savedToken = localStorage.getItem(TOKEN_KEY);
          const savedUser  = localStorage.getItem(USER_KEY);
          if (savedToken && savedUser) {
            setToken(savedToken);
            setUser(JSON.parse(savedUser));
          }
        } catch (__) {}
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── 登入 ──────────────────────────────────────────────────
  const login = useCallback(({ token: newToken, user: newUser }) => {
    setToken(newToken);
    setUser(newUser);
    try {
      localStorage.setItem(TOKEN_KEY, newToken);
      localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    } catch (_) {}
  }, []);

  // ── 登出 ──────────────────────────────────────────────────
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (_) {}
  }, []);

  // ── 更新 user（部分欄位） ──────────────────────────────────
  const updateUser = useCallback((partial) => {
    setUser(prev => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem(USER_KEY, JSON.stringify(next));
      } catch (_) {}
      return next;
    });
  }, []);

  // ── 帶 Authorization header 的 fetch ──────────────────────
  const authFetch = useCallback(async (url, options = {}) => {
    const headers = {
      // body 為字串（JSON.stringify）時自動補上 Content-Type，避免 express.json() 無法解析
      ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(url, { ...options, headers });
  }, [token]);

  // ── 清除 OAuth 錯誤 ────────────────────────────────────────
  const clearOauthError = useCallback(() => setOauthError(null), []);

  const isAdmin = user?.role === 'admin';

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    updateUser,
    authFetch,
    isAdmin,
    oauthError,
    clearOauthError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
