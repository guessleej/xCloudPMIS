### 檔案六：xCloudPMIS_Microsoft365_OAuth串接說明.md

```markdown
# xCloudPMIS Microsoft 365 OAuth 帳號串接指南 [cite: 1488, 1489]
**技術版本**：v1.0 [cite: 1492] | **OAuth 標準**：MSAL Node 2.x (Auth Code Flow + PKCE) [cite: 1494]

---

## 1. 整合總覽 [cite: 1495]
支援 Azure Active Directory (Entra ID) 單一登入，讓使用者直接以公司帳號登入系統 [cite: 1496]。
架構採用 Authorization Code Flow 交換 `access_token` 與 `id_token`，再由系統發放 JWT Session Token 並將 OAuth Token 以 AES-256-GCM 加密儲存 [cite: 1498, 1513, 1517, 1518]。

## 2. Azure AD 應用程式註冊 [cite: 1523]
需於 Azure Portal 取得以下識別碼並設定至 `.env` [cite: 1530, 1539, 1540]：
* `OAUTH_MICROSOFT_CLIENT_ID`
* `OAUTH_MICROSOFT_TENANT_ID`
* `OAUTH_MICROSOFT_CLIENT_SECRET` [cite: 1546]
* **Redirect URI** 必須與程式碼完全一致（如 `https://yourdomain.com/api/auth/microsoft/callback`） [cite: 1536]。

### API 權限設定 [cite: 1547]
需申請以下委派權限（Delegated Permissions）：`openid`, `profile`, `email`, `User.Read`, `offline_access` [cite: 1549]。

## 3. 環境變數與加密實作 [cite: 1558, 1601]
後端需配置 32 bytes hex 的 `OAUTH_TOKEN_ENCRYPTION_KEY` 用於加密 Token [cite: 1567, 1568]。
加密模組利用 Node.js `crypto` 模組的 `aes-256-gcm` 演算法進行 `encrypt` 與 `decrypt` [cite: 1606, 1617, 1629]。

## 4. OAuth 路由流程 [cite: 1664]
1.  **發起授權 (`/microsoft`)**：產生隨機 `state` 防 CSRF，導向微軟登入頁面 [cite: 1677, 1680, 1690]。
2.  **回調處理 (`/microsoft/callback`)**：驗證 `state`，使用 `code` 換取 Tokens [cite: 1696, 1704, 1710]。
3.  **使用者處理**：比對或建立使用者資料，加密儲存 Access Token，簽發系統專用 JWT Token [cite: 1723, 1750, 1757]。
4.  **前端接收**：前端從 URL Fragment (`#token=...`) 取得 JWT 並儲存於 localStorage [cite: 1763, 1881, 1883]。

## 5. 安全最佳實踐 [cite: 2056]
* 所有 OAuth 機密僅存放於 `.env` 或 Azure Key Vault [cite: 2058, 2059]。
* 存入 DB 的 Token **必須**加密 [cite: 2063]。
* 新登入的 OAuth 使用者預設角色為 `VIEWER`（最低權限） [cite: 2072]。
* 正式環境 **必須使用 HTTPS**，確保 Redirect URI 與 Cookie 正常運作 [cite: 2048]。