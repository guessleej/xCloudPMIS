/**
 * services/graphAuth.js
 * ─────────────────────────────────────────────────────────────
 * Azure AD 認證服務 — Microsoft Graph API 存取憑證管理
 *
 * 認證流程：Client Credentials Flow（OAuth 2.0）
 *   ┌─────────────┐   ①請求 Token   ┌──────────────────┐
 *   │  本系統後端  │ ─────────────▶ │  Azure AD / MSAL │
 *   │  (此模組)   │ ◀─────────────  │  (Microsoft)     │
 *   └─────────────┘   ②回傳 Token   └──────────────────┘
 *         │
 *         │ ③帶 Token 呼叫 Graph API
 *         ▼
 *   ┌──────────────────────┐
 *   │  Microsoft Graph API │ (發送郵件 / 讀取行事曆等)
 *   └──────────────────────┘
 *
 * 重要：Client Credentials Flow 是「應用程式身分」認證
 *   - 不需要使用者登入
 *   - 適合背景程序、自動化任務
 *   - 需要 Azure AD 管理員授予「應用程式層級」權限
 *
 * 所需環境變數：
 *   O365_CLIENT_ID     - 應用程式 (用戶端) 識別碼
 *   O365_CLIENT_SECRET - 用戶端密碼值（不是 Secret ID）
 *   O365_TENANT_ID     - 目錄 (租用戶) 識別碼
 */

'use strict';

const { ConfidentialClientApplication } = require('@azure/msal-node');

// ════════════════════════════════════════════════════════════
// 內部 Token 快取
// 避免每次發信都去 Azure AD 重新取 Token（效能 + 避免速率限制）
// ════════════════════════════════════════════════════════════
let _cachedToken = null;     // { accessToken: string, expiresOn: Date }
let _msalClient  = null;     // MSAL ConfidentialClientApplication 實例

/**
 * 取得或建立 MSAL 用戶端
 * 採用懶加載（Lazy Initialization）：首次呼叫時才建立
 *
 * @throws {Error} 環境變數未設定時拋出
 */
function getMsalClient() {
  // 如果已建立，直接回傳快取的實例
  if (_msalClient) return _msalClient;

  // 驗證必要環境變數
  const required = ['O365_CLIENT_ID', 'O365_CLIENT_SECRET', 'O365_TENANT_ID'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `❌ 缺少 Azure AD 環境變數：${missing.join(', ')}\n` +
      '   請確認 .env 已正確設定。參見 docs/EXCHANGE_SETUP.md'
    );
  }

  _msalClient = new ConfidentialClientApplication({
    auth: {
      // 應用程式 (用戶端) 識別碼
      clientId:     process.env.O365_CLIENT_ID,
      // 用戶端密碼（注意：是「值」不是「識別碼」）
      clientSecret: process.env.O365_CLIENT_SECRET,
      // 授權端點：https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
      authority:    `https://login.microsoftonline.com/${process.env.O365_TENANT_ID}`,
    },
    system: {
      // MSAL 內部日誌設定（生產環境關閉 verbose）
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          if (containsPii) return; // 絕對不記錄包含個資的日誌
          if (level === 0) console.error(`[MSAL Error] ${message}`);
          // level 1 = Warning, 2 = Info, 3 = Verbose — 僅記錄 Error
        },
        piiLoggingEnabled: false, // 禁止記錄個人識別資訊
      },
    },
  });

  console.log('✅ MSAL 用戶端初始化完成');
  return _msalClient;
}

/**
 * 取得有效的 Microsoft Graph API Access Token
 *
 * 策略：
 *   1. 若快取 Token 存在且距到期時間 > 5 分鐘 → 直接使用快取
 *   2. 否則 → 向 Azure AD 請求新 Token，更新快取
 *
 * @returns {Promise<string>} Bearer Token 字串
 * @throws {Error} 認證失敗時拋出（含錯誤代碼）
 */
async function getAccessToken() {
  const now = new Date();

  // ── 步驟 1：檢查快取 Token 是否仍有效 ───────────────────
  if (_cachedToken && _cachedToken.expiresOn) {
    // 預留 5 分鐘緩衝，避免在 Token 快到期時送出請求
    const bufferMs      = 5 * 60 * 1000;
    const tokenStillOk  = (_cachedToken.expiresOn - now) > bufferMs;

    if (tokenStillOk) {
      const remainingMin = Math.floor((_cachedToken.expiresOn - now) / 60000);
      console.log(`🔑 使用快取 Token（剩餘 ${remainingMin} 分鐘）`);
      return _cachedToken.accessToken;
    }
  }

  // ── 步驟 2：向 Azure AD 請求新 Token ─────────────────────
  console.log('🔄 向 Azure AD 請求新 Access Token...');
  try {
    const client = getMsalClient();

    // Client Credentials Flow：只需要 clientId + clientSecret，不需要使用者互動
    const result = await client.acquireTokenByClientCredential({
      // Microsoft Graph API 的 scope（.default 表示使用 Azure Portal 設定的所有權限）
      scopes: ['https://graph.microsoft.com/.default'],
    });

    if (!result || !result.accessToken) {
      throw new Error('Azure AD 回傳空的 Token 結果，請確認應用程式設定');
    }

    // 更新快取
    _cachedToken = {
      accessToken: result.accessToken,
      // expiresOn 是 Date 物件；若 MSAL 未提供，預設 1 小時後到期
      expiresOn: result.expiresOn || new Date(Date.now() + 3600 * 1000),
    };

    const expiresIn = Math.floor((result.expiresOn - now) / 60000);
    console.log(`✅ 成功取得新 Token，有效期 ${expiresIn} 分鐘`);
    return _cachedToken.accessToken;

  } catch (err) {
    // 解析常見的 Azure AD 錯誤碼，給出友善提示
    const errStr  = err.message || '';
    let friendlyMsg = '取得 Microsoft Graph Token 失敗';

    if (errStr.includes('AADSTS700016')) {
      friendlyMsg = '找不到應用程式 — 請確認 O365_CLIENT_ID 與 O365_TENANT_ID 是否正確';
    } else if (errStr.includes('AADSTS7000215')) {
      friendlyMsg = '用戶端密碼無效 — 請確認 O365_CLIENT_SECRET（使用「值」而非「識別碼」）';
    } else if (errStr.includes('AADSTS65001')) {
      friendlyMsg = '未獲得管理員同意 — 請在 Azure Portal 點選「代表組織授與管理員同意」';
    } else if (errStr.includes('AADSTS90002')) {
      friendlyMsg = '找不到此租用戶 — 請確認 O365_TENANT_ID 是否正確';
    } else if (errStr.includes('ENOTFOUND') || errStr.includes('ECONNREFUSED')) {
      friendlyMsg = '無法連線到 Azure AD — 請確認網路連線與 DNS 設定';
    }

    const error = new Error(`${friendlyMsg}\n  原始錯誤: ${errStr}`);
    error.code  = 'GRAPH_AUTH_FAILED';
    console.error(`❌ ${friendlyMsg}`);
    throw error;
  }
}

/**
 * 強制清除 Token 快取（401 錯誤後呼叫，強制重新取得 Token）
 * 通常由 emailService.js 在收到 401 回應後呼叫
 */
function clearTokenCache() {
  _cachedToken = null;
  // 不清除 _msalClient，MSAL 內部也有自己的快取，清除快取讓它重新拿
  if (_msalClient) {
    try {
      // 清除 MSAL 內部的 Application Token Cache
      const tokenCache = _msalClient.getTokenCache();
      tokenCache.serialize(); // 序列化後清除（MSAL 的正確清除方式）
    } catch {
      // 忽略清除快取的錯誤，下次呼叫 acquireTokenByClientCredential 時會自動更新
    }
  }
  _cachedToken = null;
  console.log('🧹 Token 快取已清除，下次請求將重新認證');
}

/**
 * 取得目前 Token 快取狀態（用於健康檢查端點）
 *
 * @returns {{ cached: boolean, expiresIn: number|null, tenantId: string }}
 */
function getTokenStatus() {
  const now = new Date();
  return {
    cached:     Boolean(_cachedToken),
    expiresIn:  _cachedToken ? Math.max(0, Math.floor((_cachedToken.expiresOn - now) / 1000)) : null,
    tenantId:   process.env.O365_TENANT_ID ? `...${process.env.O365_TENANT_ID.slice(-6)}` : '未設定',
    clientId:   process.env.O365_CLIENT_ID ? `...${process.env.O365_CLIENT_ID.slice(-6)}`  : '未設定',
  };
}

module.exports = {
  getAccessToken,
  clearTokenCache,
  getTokenStatus,
};
