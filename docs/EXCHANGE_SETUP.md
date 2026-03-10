# Microsoft Exchange Online 設定指南

> 本文件說明如何在 Azure Portal 設定 Microsoft 365 應用程式，
> 使 xCloudPMIS 後端能透過 Microsoft Graph API 發送 Outlook 郵件。

---

## 前提條件

- 您必須擁有 **Microsoft 365 商務版** 或 **Microsoft 365 企業版** 訂閱
- 您的帳號需具備 **Azure AD 全域管理員** 或 **應用程式管理員** 角色
- 有一個可以接收郵件的 Exchange Online 信箱（作為發件人）

---

## 第一部分：Azure AD 應用程式註冊

### 步驟 1：前往 Azure Portal

1. 開啟瀏覽器，前往 [https://portal.azure.com](https://portal.azure.com)
2. 使用您的 Microsoft 365 管理員帳號登入

### 步驟 2：建立新的應用程式註冊

1. 在頂部搜尋欄輸入 **「應用程式註冊」** 或 **「App registrations」**
2. 點選搜尋結果中的 **「Microsoft Entra ID > 應用程式註冊」**
3. 點選左上角的 **「+ 新增註冊」（New registration）**

4. 填寫以下資訊：

   | 欄位 | 填入值 |
   |------|--------|
   | 名稱 | `xCloudPMIS Email Service`（可自訂） |
   | 支援的帳戶類型 | **僅此組織目錄中的帳戶**（單一租用戶） |
   | 重新導向 URI | 留白不填（Client Credentials 不需要） |

5. 點選 **「註冊」（Register）** 按鈕

### 步驟 3：記錄重要識別碼

應用程式建立後，在 **「概觀」（Overview）** 頁面記錄以下兩個值：

```
應用程式 (用戶端) 識別碼 → O365_CLIENT_ID
目錄 (租用戶) 識別碼     → O365_TENANT_ID
```

> ⚠️ 這兩個值都是 UUID 格式（例如：`a1b2c3d4-e5f6-7890-abcd-ef1234567890`）

---

## 第二部分：設定 API 權限

### 步驟 4：新增 Mail.Send 應用程式權限

1. 在左側選單點選 **「API 權限」（API permissions）**
2. 點選 **「+ 新增權限」（Add a permission）**
3. 選擇 **「Microsoft Graph」**
4. 選擇 **「應用程式權限」（Application permissions）**
   > ⚠️ 必須選「應用程式權限」，不是「委派的權限」！
5. 在搜尋欄輸入 **`Mail`**
6. 展開 **「Mail」** 分類，勾選以下權限：

   | 權限名稱 | 說明 | 必要性 |
   |----------|------|--------|
   | `Mail.Send` | 以任何使用者身分發送郵件 | **必要** |

7. 點選 **「新增權限」（Add permissions）**

### 步驟 5：管理員同意授權（關鍵步驟）

> 應用程式層級的權限需要管理員明確同意，這一步非常重要！

1. 回到 **「API 權限」** 頁面
2. 確認權限清單中有 `Mail.Send`，且狀態為「**未授與...** 」
3. 點選 **「代表 [您的組織] 授與管理員同意」（Grant admin consent for...）**
4. 在確認對話框中點選 **「是」（Yes）**
5. 確認 `Mail.Send` 狀態變為 **「已授與...」（Granted for...）**，並顯示綠色勾勾 ✅

> ❌ 若此步驟未執行，發送郵件時會收到 **403 Forbidden** 錯誤！

---

## 第三部分：建立用戶端密碼

### 步驟 6：產生 Client Secret

1. 在左側選單點選 **「憑證和祕密」（Certificates & secrets）**
2. 點選 **「+ 新增用戶端祕密」（New client secret）**
3. 填寫：
   - **描述**：`xCloudPMIS Production 2026`（方便識別）
   - **到期時間**：建議選 **24 個月**（最長，減少維護頻率）
4. 點選 **「新增」（Add）**

5. ⚠️ **立即複製「值」欄位！**（不是「祕密識別碼」）

   | 欄位名稱 | 用途 |
   |----------|------|
   | 值（Value）| → `O365_CLIENT_SECRET`（**這個才是要複製的**） |
   | 祕密識別碼（Secret ID）| 不需要，無需複製 |

   > ⚠️ 密碼**只在建立當下**完整顯示，離開頁面後只會顯示部分，請務必立即複製！

---

## 第四部分：設定發件人信箱

### 步驟 7：確認發件人信箱

您需要一個 Exchange Online 的信箱作為發件人。有兩種選擇：

#### 選項 A：使用共享信箱（建議）
```
優點：不佔用授權、專門用於系統通知、可多人存取
建立方式：Microsoft 365 管理中心 → 群組 → 共用信箱 → 新增共用信箱
建議命名：noreply@yourcompany.com 或 pmis-notify@yourcompany.com
```

#### 選項 B：使用一般使用者信箱
```
優點：不需要額外設定
缺點：佔用一個授權、收件匣可能混雜
注意：此信箱必須已啟用 Exchange Online 服務
```

### 步驟 8：更新 .env 設定

```bash
# 將以下三個值填入 .env
O365_CLIENT_ID=a1b2c3d4-e5f6-7890-abcd-ef1234567890      # 步驟 3 取得
O365_CLIENT_SECRET=your~secret~value~copied~in~step~6    # 步驟 6 取得（是值不是ID）
O365_TENANT_ID=f9e8d7c6-b5a4-3210-fedc-ba9876543210      # 步驟 3 取得
O365_SENDER_EMAIL=noreply@yourcompany.com                 # 步驟 7 確認的信箱
```

---

## 第五部分：測試與驗證

### 步驟 9：安裝依賴並執行測試

```bash
# 在 backend 目錄安裝新套件
cd backend
npm install

# 測試 Token 取得（不發信）
node scripts/testEmail.js --type=token

# 發送測試郵件（替換為您的信箱）
node scripts/testEmail.js --to=your@email.com

# 或使用 npm script
npm run test:email -- --to=your@email.com
```

### 步驟 10：驗證測試結果

成功輸出應如下：

```
═══════════════════════════════════════════════
  xCloudPMIS — Microsoft Graph API 郵件測試
═══════════════════════════════════════════════
  測試類型：assignment
  發送目標：your@email.com
═══════════════════════════════════════════════

✅ 環境變數檢查通過
   CLIENT_ID   : ...789abc
   TENANT_ID   : ...def012
   SENDER_EMAIL: noreply@yourcompany.com

📋 測試任務指派通知郵件...

🔄 向 Azure AD 請求新 Access Token...
✅ 成功取得新 Token，有效期 59 分鐘
📧 發送郵件 → your@email.com | 主旨：📋 新任務指派：完成第三季度銷售報告...
✅ 郵件發送成功 → your@email.com

⏱️  總耗時：2.34 秒
```

---

## 常見錯誤排查

### ❌ 401 Unauthorized

**原因**：Token 無效或過期。

**排查步驟**：
1. 確認 `O365_CLIENT_ID` 是「應用程式 (用戶端) 識別碼」（不是租用戶 ID）
2. 確認 `O365_CLIENT_SECRET` 是「值」欄位（不是「祕密識別碼」）
3. 確認 `O365_TENANT_ID` 是「目錄 (租用戶) 識別碼」
4. 確認密碼未過期（Azure Portal → 憑證和祕密，查看到期日）

### ❌ 403 Forbidden

**原因**：管理員未同意 API 權限。

**排查步驟**：
1. 前往 Azure Portal → 應用程式註冊 → 您的應用程式 → API 權限
2. 確認 `Mail.Send` 狀態顯示為 **「已授與」（Granted）**
3. 若未授與，點選「代表組織授與管理員同意」並確認

### ❌ 404 Not Found

**原因**：發件人信箱不存在於此 Exchange 組織。

**排查步驟**：
1. 確認 `O365_SENDER_EMAIL` 的信箱帳號實際存在
2. 前往 Microsoft 365 管理中心，確認此信箱已啟用 Exchange Online
3. 若是共享信箱，確認是在「群組 → 共用信箱」中建立的

### ❌ AADSTS7000215

**原因**：Client Secret 不正確。

**解決方式**：重新到 Azure Portal 建立新的 Client Secret，並確認複製的是「值」欄位。

### ❌ AADSTS65001 / 403 + 管理員同意錯誤

**原因**：應用程式層級的 Mail.Send 需要管理員同意。

**解決方式**：
請 Azure AD 全域管理員登入 Azure Portal，到該應用程式的 API 權限頁面，
點選「代表 [組織名稱] 授與管理員同意」。

### ⚠️ 郵件進入垃圾郵件匣

**原因**：新設定的應用程式或共享信箱可能被標記為不受信任。

**解決方式**：
1. 先到垃圾郵件匣確認郵件是否在那裡
2. 在 Outlook 中將發件人加入安全寄件者清單
3. 聯繫 IT 管理員，將發件人 IP / 網域加入組織的安全清單

---

## 安全最佳實務

### Client Secret 管理

```bash
# ✅ 正確：使用環境變數
O365_CLIENT_SECRET=your-secret-value

# ❌ 錯誤：Hard-code 在程式碼中
const secret = "your-secret-value"; // 絕對不要這樣做！
```

### 生產環境建議

1. **定期輪換 Secret**：建議每年更新一次 Client Secret
2. **最小權限原則**：只申請必要的 `Mail.Send` 權限，不申請 `Mail.ReadWrite` 等過多權限
3. **網域白名單**：在 `.env` 設定 `EMAIL_ALLOWED_DOMAINS` 限制只能發給組織內信箱
4. **使用共享信箱**：避免使用真實員工信箱作為發件人
5. **使用 Docker Secrets**（進階）：生產環境可改用 Docker Secrets 管理敏感憑證

### 監控與告警

建議監控以下指標：
- 郵件發送成功率（應接近 100%）
- 403 錯誤次數（Secret 過期前兆）
- 每日發送量（避免超過 Microsoft 限額）

---

## 權限清單摘要

| 權限名稱 | 類型 | 用途 | 必要 |
|----------|------|------|------|
| `Mail.Send` | 應用程式 | 代表任何使用者發送郵件 | ✅ 必要 |

> 本系統只需要 `Mail.Send` 一個權限即可完整運作。

---

## 相關資源

- [Microsoft Graph API 文件 - 發送郵件](https://learn.microsoft.com/zh-tw/graph/api/user-sendmail)
- [Azure AD 應用程式註冊](https://learn.microsoft.com/zh-tw/entra/identity-platform/quickstart-register-app)
- [Client Credentials Flow 說明](https://learn.microsoft.com/zh-tw/entra/identity-platform/v2-oauth2-client-creds-grant-flow)
- [Graph Explorer（測試工具）](https://developer.microsoft.com/zh-tw/graph/graph-explorer)
