/**
 * LoginPage — 系統登入頁面
 *
 * 設計風格：xCloud 品牌色 #C41230，乾淨專業的企業登入介面
 * 功能：
 *   - Microsoft OAuth 單一登入
 *   - OAuth 錯誤提示
 *   - 明暗模式切換
 *
 * 本系統僅支援 Microsoft（Azure AD / Entra ID）OAuth 登入。
 */

import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import './LoginPage.css';
import { useIsMobile } from '../../hooks/useResponsive';

// ── SVG 圖示 ──────────────────────────────────────────────────
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

// ── 主元件 ────────────────────────────────────────────────────
export default function LoginPage() {
  const isMobile = useIsMobile();
  const { oauthError, clearOauthError } = useAuth();
  const { mode, toggleMode } = useTheme();

  const [loading, setLoading] = useState(false);

  const handleMicrosoftLogin = () => {
    setLoading(true);
    window.location.href = '/api/auth/microsoft';
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
                使用你的 Microsoft 組織帳號進入工作台。登入後會直接回到個人首頁與工作區。
              </p>
            </div>

          {/* OAuth 錯誤提示 */}
          {oauthError && (
            <div className="login-page__error" style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 17 }}>⛔</span>
                {oauthError}
              </span>
              <button
                type="button"
                onClick={clearOauthError}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'inherit', fontSize: 16, padding: '0 2px', lineHeight: 1,
                }}
              >✕</button>
            </div>
          )}

          {/* Microsoft OAuth 登入按鈕 */}
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="login-page__submit"
              onClick={handleMicrosoftLogin}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
            >
              {loading ? (
                <>
                  <IconSpinner size={18} />
                  正在跳轉至 Microsoft 登入...
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                  </svg>
                  以 Microsoft 帳號登入
                </>
              )}
            </button>
          </div>

          {/* 底部提示 */}
          <div className="login-page__credentials">
            <p style={{ margin: 0 }}>
              請使用公司的 Microsoft 組織帳號登入。
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
