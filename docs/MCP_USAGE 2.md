# xCloudPMIS — MCP Server 使用指南

> 本文件說明如何設定 Claude Desktop 與 xCloudPMIS 的 MCP 整合，
> 讓 Claude AI 能直接查詢專案狀態、管理任務、發送提醒郵件。

---

## 什麼是 MCP？

**Model Context Protocol（MCP）** 是 Anthropic 推出的開放標準，
讓 Claude 能透過標準化介面存取外部資料與服務。

```
Claude Desktop
    │
    │（stdio 通訊）
    ▼
xCloudPMIS MCP Server（Node.js 程序）
    │
    ├── Prisma ORM → PostgreSQL（讀寫任務/專案/用戶資料）
    └── Email Service → Microsoft Graph API（發送 Outlook 郵件）
```

---

## 提供的工具（Tools）

| 工具名稱 | 說明 | 典型用途 |
|----------|------|----------|
| `get_project_status` | 查詢專案狀態與健康指標 | 主管問「目前哪些專案有問題？」 |
| `get_overdue_tasks` | 查詢逾期任務清單 | 了解誰有待處理的延遲任務 |
| `send_reminder_email` | 發送任務提醒/警告郵件 | 批次提醒有逾期任務的成員 |
| `get_user_workload` | 查詢用戶工作量 | 確認成員負載是否均衡 |
| `create_task` | 建立新任務 | 快速從對話中新增任務 |

---

## 安裝與設定

### 前提條件

1. **Claude Desktop** 已安裝（v0.7.0 以上版本）
2. **後端依賴** 已安裝：
   ```bash
   cd backend
   npm install
   ```
3. **`.env` 環境變數** 已設定（至少需要 `DATABASE_URL`）
4. **PostgreSQL** 可連線（本機或 Docker）

---

### 步驟 1：設定 Claude Desktop

開啟終端機，編輯 Claude Desktop 設定檔：

```bash
# macOS
open ~/Library/Application\ Support/Claude/

# Windows（在 PowerShell 中執行）
explorer $env:APPDATA\Claude\
```

找到（或建立）`claude_desktop_config.json`，加入以下設定：

#### 選項 A：本機開發模式（直接執行 Node.js）

```json
{
  "mcpServers": {
    "xcloudpmis": {
      "command": "node",
      "args": [
        "/絕對路徑/到您的/xCloudPMIS/backend/mcp/server.js"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

> ⚠️ **請替換** `/絕對路徑/到您的/xCloudPMIS/backend/mcp/server.js` 為實際路徑

#### 選項 B：Docker 模式（正式環境）

```json
{
  "mcpServers": {
    "xcloudpmis": {
      "command": "docker",
      "args": [
        "exec", "--interactive",
        "pmis-backend",
        "node", "mcp/server.js"
      ]
    }
  }
}
```

> ⚠️ 使用 Docker 模式前，請先確認容器已啟動：
> ```bash
> docker compose up -d
> docker ps | grep pmis-backend
> ```

---

### 步驟 2：重新啟動 Claude Desktop

完全退出並重新開啟 Claude Desktop。
進入 **設定（⚙️）→ Developer → MCP Servers**，確認 `xcloudpmis` 出現且狀態為 **Connected**。

---

### 步驟 3：測試連線

在 Claude 對話框中輸入：

```
請使用 get_project_status 查詢所有專案的目前狀態
```

如果設定正確，Claude 會呼叫 MCP 工具並回傳專案清單。

---

## 使用範例

### 📊 查詢所有專案狀態

```
請幫我查詢 xCloudPMIS 所有進行中的專案健康狀況，
列出哪些有逾期任務、進度落後的專案。
```

**Claude 將會：**
1. 呼叫 `get_project_status`（status: "active"）
2. 整理並呈現有健康問題的專案

---

### 🚨 查詢逾期任務並發送提醒

```
請先查詢所有逾期超過 3 天的任務，
然後對每個負責人分別發送逾期警告郵件。
```

**Claude 將會：**
1. 呼叫 `get_overdue_tasks`（取得逾期清單）
2. 依指派人分組
3. 對每個人呼叫 `send_reminder_email`（emailType: "overdue"）

---

### 👤 檢查團隊工作量

```
請查詢所有團隊成員的工作量，
找出負載最高（未完成任務最多）的 3 位成員，
並看看他們有哪些即將到期的任務。
```

**Claude 將會：**
1. 呼叫 `get_user_workload` 取得全員摘要
2. 找出負載最高的用戶
3. 呼叫 `get_user_workload`（userId: X）查詢個人詳情

---

### ➕ 從對話建立任務

```
幫我在「Q2 產品開發」專案下建立一個新任務：
標題：完成 API 文件撰寫
指派給：用戶 ID 3（王小明）
截止日期：2026-03-31
優先級：高
建立後發送指派通知給他
```

**Claude 將會：**
呼叫 `create_task`（並帶 sendNotification: true）

---

### 🤖 自動化週例行工作

```
幫我做每週五的例行工作：
1. 查看本週有哪些新的逾期任務
2. 對所有逾期超過 5 天的任務負責人發送警告
3. 告訴我整體的專案健康狀況摘要
```

---

## 工具詳細說明

### `get_project_status`

| 參數 | 型別 | 說明 | 預設值 |
|------|------|------|--------|
| `companyId` | number | 公司 ID | 2 |
| `projectId` | number | 查詢單一專案（省略則查全部） | — |
| `status` | string | 按狀態過濾 | — |

**status 可選值：** `planning`、`active`、`on_hold`、`completed`、`cancelled`

---

### `get_overdue_tasks`

| 參數 | 型別 | 說明 | 預設值 |
|------|------|------|--------|
| `companyId` | number | 公司 ID | 2 |
| `assigneeId` | number | 只查指定用戶 | — |
| `projectId` | number | 只查指定專案 | — |
| `limit` | number | 最多回傳幾筆 | 20 |

---

### `send_reminder_email`

| 參數 | 型別 | 說明 | 必填 |
|------|------|------|------|
| `emailType` | string | `reminder` 或 `overdue` | ✅ |
| `taskId` | number | 自動查任務資訊（選項 A） | — |
| `userEmail` | string | 手動指定收件人（選項 B） | 選項B必填 |
| `userName` | string | 收件人姓名 | — |
| `taskTitle` | string | 任務標題（選項 B）| 選項B必填 |
| `taskDueDate` | string | 截止日期（ISO 8601）| — |
| `projectName` | string | 專案名稱 | — |

> 💡 **選項 A vs 選項 B**：
> - 若已知 `taskId`，使用選項 A（自動查資料庫）
> - 若要發給任意人，使用選項 B（手動指定）

---

### `get_user_workload`

| 參數 | 型別 | 說明 | 預設值 |
|------|------|------|--------|
| `companyId` | number | 公司 ID | 2 |
| `userId` | number | 查單一用戶（省略則查全員摘要）| — |
| `days` | number | 「即將到期」的天數範圍 | 7 |

---

### `create_task`

| 參數 | 型別 | 說明 | 必填 |
|------|------|------|------|
| `projectId` | number | 專案 ID | ✅ |
| `title` | string | 任務標題 | ✅ |
| `description` | string | 詳細說明 | — |
| `assigneeId` | number | 指派人 ID | — |
| `dueDate` | string | 截止日（ISO 8601）| — |
| `priority` | string | `low`/`medium`/`high`/`urgent` | medium |
| `creatorId` | number | 建立者 ID | 1 |
| `sendNotification` | boolean | 建立後發送指派通知 | false |

---

## 常見問題排查

### ❌ Claude Desktop 看不到 MCP Server

1. 確認 `claude_desktop_config.json` JSON 格式正確（無語法錯誤）
2. 確認 Node.js 路徑正確：
   ```bash
   which node   # macOS/Linux
   where node   # Windows
   ```
3. 確認 `mcp/server.js` 存在且路徑絕對正確
4. 完全退出 Claude Desktop 後重新開啟（不是重新整理）

---

### ❌ 工具呼叫失敗（資料庫相關）

**錯誤訊息**：`Can't reach database server at...`

```bash
# 確認 .env 中 DATABASE_URL 設定正確
cat backend/.env | grep DATABASE_URL

# 確認資料庫可連線
cd backend && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.\$queryRaw\`SELECT 1\`.then(() => console.log('DB OK')).catch(e => console.error(e.message));
"
```

---

### ❌ 郵件發送失敗（send_reminder_email）

1. 確認 `.env` 中 O365 相關設定已填寫
2. 先執行 Phase 1 的測試腳本確認郵件功能正常：
   ```bash
   cd backend
   node scripts/testEmail.js --type=token
   ```
3. 詳細排查請參考 [docs/EXCHANGE_SETUP.md](./EXCHANGE_SETUP.md)

---

### ⚠️ Docker 模式：找不到容器

```bash
# 確認容器名稱（與 docker-compose.yml 中的 container_name 一致）
docker ps --format "{{.Names}}"

# 確認容器內 node 可用
docker exec pmis-backend node --version
```

---

## 安全注意事項

1. **`claude_desktop_config.json` 不包含任何密碼**
   — 所有敏感資訊應放在 `.env` 中，且 `.env` 不應提交到 Git

2. **MCP Server 有資料庫寫入權限**（`create_task` 工具）
   — 只在受信任的環境中開啟此整合

3. **郵件發送是真實的**
   — 呼叫 `send_reminder_email` 後會立即發送郵件，請確認對象與內容無誤

4. **companyId 隔離**
   — 所有查詢都受 `companyId` 過濾，確保只存取本公司資料

---

## 相關文件

- [Exchange Online 郵件設定](./EXCHANGE_SETUP.md) — Azure AD 設定指南
- [MCP 官方文件](https://modelcontextprotocol.io/)
- [Claude Desktop 設定指南](https://docs.anthropic.com/en/claude/claude-desktop)
