# xCloudPMIS — 企業級 AI 專案管理系統

> 整合 AI 自主代理、即時協作、Microsoft 365 的企業級專案管理平台
> 採用 Docker 全容器化架構，支援地端部署與 Azure 雲端部署

[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![OpenAI](https://img.shields.io/badge/OpenAI-Compatible-412991?logo=openai&logoColor=white)](https://openai.com)

---

## 目錄

- [系統介紹](#系統介紹)
- [系統架構圖](#系統架構圖)
- [資料庫關聯圖](#資料庫關聯圖)
- [使用者操作流程圖](#使用者操作流程圖)
- [技術堆疊](#技術堆疊)
- [快速啟動（開發環境）](#快速啟動開發環境)
- [生產部署](#生產部署)
- [部署文件導覽](#部署文件導覽)
- [服務清單](#服務清單)
- [API 文件](#api-文件)
- [功能模組](#功能模組)
- [專案目錄結構](#專案目錄結構)
- [開發歷程](#開發歷程)

---

## 系統介紹

**xCloudPMIS** 是一套整合 AI 自主決策能力的企業級專案管理資訊系統，以政府機關與中大型企業為核心使用場景，提供從任務規劃到執行監控的完整生命週期管理。

### 核心功能模組

| 模組 | 頁面 | 說明 |
|------|------|------|
| **執行儀表板** | Dashboard | 紅黃綠燈健康狀態、人力熱力圖、可行動洞察；統計卡片可點擊快速導航 |
| **專案管理** | Projects | 建立、追蹤、管理多個工程專案；支援列表 / 看板 / 甘特多視圖 |
| **任務看板** | Tasks (Kanban) | 拖拉式看板，支援 To-Do / In-Progress / Review / Done |
| **我的任務** | My Tasks | 個人任務彙整，依截止日期自動分組；支援刪除、編輯、截止日期與優先度修改 |
| **甘特圖** | Gantt | 時間軸視覺化，任務相依性連線 |
| **時間記錄** | Time Tracking | 即時計時器 + 手動工時登錄 |
| **工作負載** | Workload | 未來 14 天人力分配熱力圖 |
| **報表** | Reports | 多維度統計分析；列表列可點擊開啟詳情、支援 CSV 匯出 |
| **專案集** | Portfolios | 多專案健康監控；狀態 Dropdown 正常切換、點擊專案名稱導航 |
| **團隊管理** | Team | 成員管理、角色設定 |
| **收件匣** | Inbox | 通知中心（任務指派、@提及、截止日提醒） |
| **AI 決策中心** | AI Decision Center | ReAct 自主代理決策記錄與審核 |
| **AI 模型設定** | AI Settings | 支援 OpenAI / Ollama / LM Studio / Azure 等 |
| **MCP 控制台** | MCP Console | Claude Desktop 直接操作系統工具 |
| **檔案管理** | Files API | 附件上傳下載；繁體中文檔名正確儲存（UTF-8 修復） |

---

## 系統架構圖

### 全系統容器架構

```mermaid
graph TD
    subgraph CLIENT["👤 使用者端"]
        B["瀏覽器\nChrome / Edge / Safari"]
    end

    subgraph GATEWAY["🔀 入口層"]
        NG["Nginx Reverse Proxy\n:443 HTTPS / :80 redirect\nSSL 終止 · WAF Headers · Gzip"]
    end

    subgraph FRONTEND["🖥️ 前端層"]
        FE["pmis-frontend\nReact 18 + Vite\nNginx 靜態服務 :80\nSPA 21 個頁面模組"]
    end

    subgraph BACKEND["⚙️ 後端層"]
        BE["pmis-backend\nNode.js 20 + Express\nREST API :3010\nPrisma ORM · JWT Auth"]
        CO["pmis-collab\nYjs Hocuspocus\nWebSocket :1234\n即時多人協作"]
        MO["pmis-monitor\nAI 風險掃描代理\nCron 排程背景執行\nOpenAI API 整合"]
    end

    subgraph DATA["🗄️ 資料層"]
        DB[("pmis-db\nPostgreSQL 15\n:5432\n17 個資料表\n6 個 Dashboard View")]
        RD[("pmis-redis\nRedis 7\n:6379\nAPI 快取 60s TTL\nSession · Collab 狀態")]
    end

    subgraph EXTERNAL["☁️ 外部服務"]
        OAI["OpenAI API\nGPT-4o / Compatible"]
        MS365["Microsoft 365\nGraph API\nOAuth 2.0"]
    end

    B -->|"HTTPS :443"| NG
    NG -->|"/ → :80"| FE
    NG -->|"/api/* → :3010"| BE
    NG -->|"/auth/* → :3010"| BE
    NG -->|"/collab/* → :1234\nWebSocket Upgrade"| CO

    BE --> DB
    BE --> RD
    CO --> RD
    CO --> DB
    MO --> DB
    MO --> OAI
    BE --> OAI
    BE --> MS365

    style CLIENT fill:#e8f4fd,stroke:#2196F3
    style GATEWAY fill:#fff3e0,stroke:#FF9800
    style FRONTEND fill:#e8f5e9,stroke:#4CAF50
    style BACKEND fill:#f3e5f5,stroke:#9C27B0
    style DATA fill:#fce4ec,stroke:#E91E63
    style EXTERNAL fill:#e0f2f1,stroke:#009688
```

### 請求路由流程

```mermaid
sequenceDiagram
    participant 瀏覽器
    participant Nginx
    participant Frontend
    participant Backend
    participant Redis
    participant PostgreSQL

    瀏覽器->>Nginx: HTTPS GET /
    Nginx->>Frontend: 路由至 pmis-frontend:80
    Frontend-->>瀏覽器: React SPA HTML/JS/CSS

    瀏覽器->>Nginx: HTTPS GET /api/dashboard/executive-summary
    Nginx->>Backend: 轉發至 pmis-backend:3010
    Backend->>Redis: 查詢快取 TTL 60s
    alt 快取命中
        Redis-->>Backend: 回傳快取資料
    else 快取未命中
        Backend->>PostgreSQL: queryRaw 複雜聚合查詢
        PostgreSQL-->>Backend: 原始資料
        Backend->>Redis: 寫入快取
    end
    Backend-->>Nginx: JSON 回應 success/data/meta
    Nginx-->>瀏覽器: 回傳資料
```

### 開發 vs 生產環境對照

```mermaid
graph LR
    subgraph DEV["🛠️ 開發環境 docker-compose.yml"]
        direction TB
        D1["Frontend :3001\nVite HMR 熱更新\nSource Code 掛載"]
        D2["Backend :3010\nNodemon 熱重載\nSource Code 掛載"]
        D3["PgAdmin :8080\n資料庫管理 GUI"]
        D4["PostgreSQL :5432\nRedis :6379"]
    end

    subgraph PROD["🚀 生產環境 docker-compose.prod.yml"]
        direction TB
        P0["Nginx :443/:80\nSSL + 反向代理"]
        P1["Frontend :80\nMulti-Stage Build\nNginx 靜態服務"]
        P2["Backend :3010\n非 root 用戶\n只含生產依賴"]
        P3["Collaboration :1234\nMonitor 背景代理"]
        P4["PostgreSQL + Redis\nNamed Volume 持久化"]
    end

    DEV -->|"切換至生產模式"| PROD

    style DEV fill:#e3f2fd,stroke:#1976D2
    style PROD fill:#e8f5e9,stroke:#388E3C
```

---

## 資料庫關聯圖

### 完整 ER 關聯圖（17 個資料表）

```mermaid
erDiagram
    Company {
        int     id          PK
        string  name
        string  slug        UK
        boolean isActive
    }
    User {
        int     id          PK
        int     companyId   FK
        string  name
        string  email       UK
        enum    role        "admin|pm|member"
        boolean isActive
    }
    Project {
        int     id          PK
        int     companyId   FK
        int     ownerId     FK
        string  name
        enum    status      "planning|active|on_hold|completed|cancelled"
        decimal budget
        date    startDate
        date    endDate
    }
    Task {
        int     id             PK
        int     projectId      FK
        int     assigneeId     FK
        int     createdById    FK
        string  title
        enum    status         "todo|in_progress|review|done"
        enum    priority       "low|medium|high|urgent"
        decimal estimatedHours
        decimal actualHours
        date    dueDate
    }
    Milestone {
        int     id          PK
        int     projectId   FK
        string  name
        date    dueDate
        boolean isAchieved
        enum    color       "red|yellow|green"
    }
    TaskDependency {
        int     id              PK
        int     taskId          FK
        int     dependsOnTaskId FK
        enum    type            "finish_to_start|start_to_start|finish_to_finish"
    }
    TimeEntry {
        int      id              PK
        int      taskId          FK
        int      userId          FK
        datetime startedAt
        datetime endedAt
        int      durationMinutes
        date     date
    }
    Attachment {
        int    id           PK
        int    taskId       FK
        int    uploadedById FK
        string originalName
        string mimeType
        int    fileSizeBytes
    }
    Comment {
        int     id       PK
        int     taskId   FK
        int     userId   FK
        int     parentId FK
        string  content
        json    mentions
        boolean isEdited
    }
    Tag {
        int    id        PK
        int    companyId FK
        string name
        string color
    }
    TaskTag {
        int taskId PK-FK
        int tagId  PK-FK
    }
    Notification {
        int     id          PK
        int     recipientId FK
        enum    type        "task_assigned|deadline_approaching|mentioned|comment_added|task_completed|milestone_achieved"
        string  title
        boolean isRead
    }
    ActivityLog {
        int    id      PK
        int    taskId  FK
        int    userId  FK
        string action
        json   oldValue
        json   newValue
    }
    OAuthToken {
        int      id           PK
        int      userId       UK-FK
        string   provider     "microsoft"
        string   accessToken
        string   refreshToken
        datetime expiresAt
        boolean  isActive
    }
    AiDecision {
        int    id           PK
        int    projectId    FK
        int    taskId       FK
        string agentType    "scheduler|risk|communication|quality"
        json   observations
        string reasoning
        int    riskLevel    "1-4"
        enum   status       "pending|staging|approved|executing|completed|rejected|rolled_back|failed"
    }
    AiAgentLog {
        int     id         PK
        int     decisionId FK
        string  toolName
        json    toolInput
        json    toolOutput
        boolean success
        int     durationMs
    }
    AiModelConfig {
        int     id        PK
        int     companyId FK
        string  provider  "openai|azure|ollama|lm_studio|groq|custom"
        string  baseUrl
        string  modelHeavy
        string  modelLight
        boolean isActive
    }

    Company        ||--o{ User           : "擁有"
    Company        ||--o{ Project        : "擁有"
    Company        ||--o{ Tag            : "擁有"
    Company        ||--o{ AiModelConfig  : "設定"
    User           ||--o{ Task           : "負責"
    User           ||--o{ TimeEntry      : "記錄"
    User           ||--o{ Comment        : "發表"
    User           ||--o{ Notification   : "接收"
    User           ||--o{ ActivityLog    : "執行"
    User           ||--o{ Attachment     : "上傳"
    User           |o--|| OAuthToken     : "授權"
    Project        ||--o{ Task           : "包含"
    Project        ||--o{ Milestone      : "設定"
    Project        ||--o{ AiDecision     : "監控"
    Task           ||--o{ TaskDependency : "依賴"
    Task           ||--o{ TimeEntry      : "計時"
    Task           ||--o{ Attachment     : "附件"
    Task           ||--o{ Comment        : "評論"
    Task           ||--o{ ActivityLog    : "歷史"
    Task           ||--o{ TaskTag        : "標記"
    Task           ||--o{ AiDecision     : "分析"
    Tag            ||--o{ TaskTag        : "使用"
    Comment        ||--o{ Comment        : "回覆"
    AiDecision     ||--o{ AiAgentLog     : "日誌"
```

### 資料表模組分層架構

```mermaid
graph TB
    subgraph CORE["🏢 核心層 — 組織架構"]
        CO[Company 公司]
        US[User 使用者]
        PR[Project 專案]
    end

    subgraph WORK["📋 工作層 — 任務管理"]
        TA[Task 任務]
        MS[Milestone 里程碑]
        TD[TaskDependency 相依]
    end

    subgraph COLLAB["💬 協作層 — 團隊溝通"]
        CM[Comment 評論]
        AT[Attachment 附件]
        TG[Tag / TaskTag 標籤]
    end

    subgraph TRACK["⏱️ 追蹤層 — 執行記錄"]
        TE[TimeEntry 工時]
        NF[Notification 通知]
        AL[ActivityLog 歷史]
    end

    subgraph AI["🤖 AI 層 — 智能代理"]
        AD[AiDecision 決策]
        AGL[AiAgentLog 工具日誌]
        AMC[AiModelConfig 模型設定]
        OT[OAuthToken M365 授權]
    end

    CORE --> WORK
    WORK --> COLLAB
    WORK --> TRACK
    CORE --> AI
    WORK --> AI

    style CORE fill:#e3f2fd,stroke:#1565C0
    style WORK fill:#e8f5e9,stroke:#2E7D32
    style COLLAB fill:#fff8e1,stroke:#F57F17
    style TRACK fill:#fce4ec,stroke:#880E4F
    style AI fill:#f3e5f5,stroke:#4A148C
```

---

## 使用者操作流程圖

### 流程一：專案建立與啟動

```mermaid
flowchart TD
    START([開始]) --> LOGIN
    LOGIN["登入系統\n帳號密碼 / Microsoft SSO"]
    LOGIN --> DASH["Dashboard 首頁\n查看健康摘要與待辦洞察"]
    DASH --> NEW_PROJ["點擊 + 建立新專案\n填入名稱、說明、預算、期程"]
    NEW_PROJ --> SET_TEAM["設定專案成員\n指定 PM 與執行人員"]
    SET_TEAM --> SET_MILESTONE["建立里程碑\n設定關鍵節點與目標日期"]
    SET_MILESTONE --> CREATE_TASK["建立任務清單\n輸入標題、優先度、預估工時"]
    CREATE_TASK --> ASSIGN["指派任務\n選擇負責人與截止日"]
    ASSIGN --> SET_DEP["設定任務相依\nFinish-to-Start 相依關係"]
    SET_DEP --> ADD_TAG["新增標籤\nBug / Feature / 文件等分類"]
    ADD_TAG --> NOTIFY{"自動通知\n被指派成員"}
    NOTIFY --> GANTT["甘特圖確認\n時間軸視覺化驗收"]
    GANTT --> ACTIVE[/"專案正式啟動\n狀態 Active"/]

    style START fill:#4CAF50,color:#fff
    style ACTIVE fill:#2196F3,color:#fff
    style NOTIFY fill:#FF9800,color:#fff
```

### 流程二：任務執行與時間記錄

```mermaid
flowchart TD
    MYTASK["My Tasks\n查看本人所有任務"] --> SELECT["選擇任務\n點擊開啟側邊詳情面板"]
    SELECT --> STATUS_CHECK{任務狀態？}
    STATUS_CHECK -->|"todo"| START_WORK["點擊 開始計時\nTimeEntry startedAt 建立"]
    STATUS_CHECK -->|"in_progress"| WORKING["繼續執行"]
    START_WORK --> CHANGE_STATUS["更新狀態\ntodo → in_progress"]
    CHANGE_STATUS --> WORKING
    WORKING --> STOP_TIMER["點擊 停止計時\ndurationMinutes 自動計算"]
    STOP_TIMER --> LOG_SAVED["工時記錄儲存\nTimeEntry endedAt 填入"]
    LOG_SAVED --> COMMENT{需要協作？}
    COMMENT -->|是| WRITE_COMMENT["新增評論\n@提及相關成員"]
    WRITE_COMMENT --> MENTION_NOTIFY["系統自動發通知\nNotification type=mentioned"]
    MENTION_NOTIFY --> REVIEW_STATUS
    COMMENT -->|否| REVIEW_STATUS["更新狀態\n→ review 待審核"]
    REVIEW_STATUS --> PM_REVIEW{PM 審核}
    PM_REVIEW -->|通過| DONE[/"任務完成\nstatus=done\ncompletedAt 記錄"/]
    PM_REVIEW -->|退回| REWORK["退回修改\n新增評論說明原因"]
    REWORK --> WORKING

    style DONE fill:#4CAF50,color:#fff
    style MENTION_NOTIFY fill:#FF9800,color:#fff
```

### 流程三：AI 自主代理決策流程

```mermaid
flowchart TD
    CRON["Cron 排程觸發\n每日 08:00 執行"] --> OBSERVE
    OBSERVE["Observe 蒐集資料\n掃描所有 Active 專案\n任務逾期率 / 工時偏差 / 里程碑距離"]
    OBSERVE --> REASON["Reason AI 推理\nGPT-4o Chain-of-Thought\n分析風險與優先順序"]
    REASON --> PLAN["Plan 制定計劃\n產生可執行的建議動作清單"]
    PLAN --> RISK{風險等級判斷}
    RISK -->|"Level 1 低風險"| AUTO["自動執行\n更新任務優先度\n重新分配工作量"]
    RISK -->|"Level 2 中風險"| STAGING["進入 Staging\n通知 PM 審核"]
    RISK -->|"Level 3-4 高風險"| HUMAN["Human-in-the-Loop\n必須 PM 人工審查修改"]
    STAGING --> PM_APPROVE{PM 決定}
    PM_APPROVE -->|批准| EXECUTE
    PM_APPROVE -->|拒絕| REJECT["決策被拒絕\n記錄拒絕原因\nAI 學習反饋"]
    HUMAN --> PM_EDIT["PM 修改建議內容"] --> EXECUTE
    AUTO --> EXECUTE["Act 執行動作\nDatabase 寫入\n每步驟記錄 AiAgentLog"]
    EXECUTE --> REFLECT["Reflect 反思\n評估決策效果\noutcomeScore 記錄"]
    REFLECT --> INSIGHT["Dashboard 更新\n可行動洞察卡片顯示"]
    EXECUTE -->|"發現錯誤"| ROLLBACK["一鍵回滾\n從 snapshotData 還原"]

    style CRON fill:#607D8B,color:#fff
    style AUTO fill:#4CAF50,color:#fff
    style HUMAN fill:#F44336,color:#fff
    style ROLLBACK fill:#FF5722,color:#fff
    style INSIGHT fill:#2196F3,color:#fff
```

### 流程四：通知與收件匣管理

```mermaid
flowchart LR
    subgraph TRIGGERS["通知觸發事件"]
        T1["任務被指派"]
        T2["截止日 24h 前"]
        T3["評論中被 @提及"]
        T4["所屬任務有新評論"]
        T5["指派任務已完成"]
        T6["里程碑達成"]
    end

    subgraph SYSTEM["系統處理"]
        DB_WRITE["寫入 Notification 表\ntype / title / message\nresourceType + resourceId"]
    end

    subgraph INBOX["收件匣 InboxPage"]
        TAB1["活動 Tab\n所有通知列表"]
        TAB2["書籤 Tab\n已加星號通知"]
        TAB3["@提及 Tab\n僅顯示 mentioned"]
        TAB4["封存 Tab\n已處理通知"]
        CUSTOM["自訂 Tab\n使用者自定義篩選"]
    end

    subgraph ACTION["使用者操作"]
        READ["標記已讀"]
        BOOKMARK["加入書籤"]
        ARCHIVE["封存"]
        JUMP["跳轉至來源\n任務/評論/里程碑"]
    end

    TRIGGERS --> DB_WRITE --> TAB1
    TAB1 --> READ
    TAB1 --> BOOKMARK
    TAB1 --> ARCHIVE
    TAB1 --> JUMP
    BOOKMARK --> TAB2
    ARCHIVE --> TAB4

    style TRIGGERS fill:#e3f2fd,stroke:#1565C0
    style SYSTEM fill:#f3e5f5,stroke:#4A148C
    style INBOX fill:#e8f5e9,stroke:#2E7D32
    style ACTION fill:#fff8e1,stroke:#F57F17
```

### 流程五：Microsoft 365 OAuth 整合

```mermaid
sequenceDiagram
    participant 使用者
    participant 前端
    participant Backend
    participant AzureAD as Azure AD
    participant M365 as Microsoft Graph

    使用者->>前端: 點擊連結 Microsoft 帳號
    前端->>Backend: GET /auth/microsoft
    Backend->>AzureAD: 重導至 OAuth 授權頁
    AzureAD-->>使用者: 顯示 Microsoft 登入畫面
    使用者->>AzureAD: 輸入帳號密碼並授權
    AzureAD->>Backend: Callback + Authorization Code
    Backend->>AzureAD: 換取 Access Token + Refresh Token
    Backend->>Backend: AES-256-GCM 加密後存入 OAuthToken 表
    Backend-->>前端: 授權成功

    Note over Backend,M365: 後續 API 呼叫使用已儲存的 Token
    Backend->>M365: 代表用戶傳送郵件 / 讀取行事曆
    M365-->>Backend: 成功回應

    alt Access Token 過期 1小時後
        Backend->>AzureAD: 使用 Refresh Token 自動更新
        AzureAD-->>Backend: 新的 Access Token
        Backend->>Backend: 更新 OAuthToken 表記錄
    end
```

---

## 技術堆疊

| 層級 | 技術 | 版本 | 說明 |
|------|------|------|------|
| **前端框架** | React | 18 | UI 元件框架，Hooks 架構 |
| **前端構建** | Vite | 5 | 開發 HMR + 生產多階段 Build |
| **前端樣式** | Inline Styles | — | 無 Tailwind，全 JS 行內樣式 |
| **圖表** | Recharts | 2 | PieChart / Heatmap 等視覺化 |
| **即時協作** | Tiptap + Yjs | — | 多人同步編輯 + CRDT |
| **後端框架** | Express | 4 | RESTful API + Middleware |
| **執行環境** | Node.js | 20 | Alpine 映像，非 root 運行 |
| **ORM** | Prisma | 5 | Schema-first + `$queryRaw` |
| **主資料庫** | PostgreSQL | 15 | 17 張表 + 6 個 Dashboard VIEW |
| **快取** | Redis | 7 | API 快取 60s TTL + AOF 持久化 |
| **AI** | OpenAI Compatible | — | GPT-4o / Ollama / LM Studio |
| **身份驗證** | JWT + MSAL | — | 本地 JWT + Microsoft OAuth 2.0 |
| **容器** | Docker | 24+ | 多階段 Build，Named Volume |
| **容器編排** | Docker Compose | v2 | 開發 + 生產雙模式 |
| **反向代理** | Nginx | 1.25 | SSL 終止 + 路由分發 |

---

## 快速啟動（開發環境）

### 前置需求

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) ≥ 24.0
- Git

### 步驟

```bash
# 1. Clone 專案
git clone https://github.com/your-org/xCloudPMIS.git
cd xCloudPMIS

# 2. 複製環境變數（開發環境使用預設值即可）
cp .env.example .env

# 3. 啟動所有服務（首次約需 3–5 分鐘建置映像）
docker compose up -d

# 4. 確認服務狀態（等待全部 healthy）
docker compose ps

# 5. 初始化資料庫 Schema
docker exec pmis-backend npx prisma migrate deploy

# 6. 建立範例資料
docker exec pmis-backend npx prisma db seed

# 7. 開啟瀏覽器
open http://localhost:3001
```

### 常用開發指令

```bash
# 查看即時日誌
docker compose logs -f pmis-backend

# 重新啟動後端
docker compose restart pmis-backend

# 進入資料庫
docker exec -it pmis-db psql -U pmis_user pmis_db

# 停止（保留資料）
docker compose down

# 完全重設（含刪除所有資料）⚠️
docker compose down -v
```

---

## 生產部署

### 地端 Docker 一鍵部署

```bash
# 1. 複製並設定環境變數
cp .env.production.example .env
nano .env   # 填入真實密碼

# 2. 執行部署腳本（自動安裝 Docker、SSL、Migration）
sudo bash deploy/onprem/setup.sh
```

→ 詳見 **[地端 Docker 部署手冊](docs/部署手冊/地端Docker部署手冊.md)**

### Azure 雲端部署

```bash
# 設定環境變數
export SUBSCRIPTION_ID="your-subscription-id"
export RESOURCE_GROUP="pmis-prod-rg"
export DB_ADMIN_PASSWORD="YourStrongPassword123!"

# 執行 Azure 資源一鍵建立（約 20–30 分鐘）
bash deploy/azure/azure-setup.sh
```

→ 詳見 **[Azure 部署手冊](docs/部署手冊/Azure部署手冊.md)**

---

## 服務清單

### 開發環境

| 服務 | 網址 | 帳號 | 密碼 |
|------|------|------|------|
| 前端 Dashboard | http://localhost:3001 | — | — |
| 後端 API | http://localhost:3010 | — | — |
| pgAdmin | http://localhost:8080 | admin@pmis.com | admin123 |
| PostgreSQL | localhost:5432 | pmis_user | pmis_password |
| Redis | localhost:6379 | — | redis123 |
| Yjs 協作 | ws://localhost:1234 | — | — |

### 健康檢查端點

```bash
curl http://localhost:3010/health
# → {"status":"ok","service":"pmis-backend","uptime":...}

curl http://localhost:3010/api/status
# → {"backend":{"status":"ok"},"database":{"status":"ok"},"cache":{"status":"ok"}}
```

---

## API 文件

### 統一回應格式

```json
{
  "success": true,
  "data": {},
  "meta": { "total": 10, "page": 1 },
  "timestamp": "2026-03-15T00:00:00.000Z"
}
```

### 主要 API 端點

| 分類 | 方法 | 路徑 | 說明 |
|------|------|------|------|
| **健康** | GET | `/health` | 服務存活檢查 |
| **健康** | GET | `/api/status` | DB + Redis 連線狀態 |
| **儀表板** | GET | `/api/dashboard/executive-summary` | 全公司摘要（紅黃綠燈數量） |
| **儀表板** | GET | `/api/dashboard/projects-health` | 各專案健康狀態列表 |
| **儀表板** | GET | `/api/dashboard/workload` | 14 天人力負載熱力圖 |
| **儀表板** | GET | `/api/dashboard/actionable-insights` | 可行動洞察卡片 |
| **專案** | GET | `/api/projects` | 取得所有專案（含 Redis 快取） |
| **專案** | POST | `/api/projects` | 建立新專案 |
| **任務** | GET | `/api/tasks` | 個人任務列表（純陣列） |
| **使用者** | GET | `/api/users` | 公司成員列表 |
| **甘特** | GET | `/api/gantt/:projectId` | 甘特圖資料（任務 + 相依） |
| **時間** | GET | `/api/time-tracking` | 工時記錄列表 |
| **報表** | GET | `/api/reports/summary` | 專案統計報表 |
| **設定** | GET | `/api/settings/ai-model` | AI 模型設定 |
| **AI** | GET | `/api/ai-decisions` | AI 決策記錄列表 |
| **認證** | GET | `/auth/microsoft` | Microsoft OAuth 2.0 授權 |
| **檔案** | POST | `/api/files/upload` | 上傳附件（繁體中文檔名支援） |
| **檔案** | GET | `/api/files/:id` | 下載附件 |
| **檔案** | GET | `/api/files` | 取得檔案列表 |

---

## 功能模組

```
前端頁面模組（22 個元件目錄）：
├── dashboard/          執行儀表板（摘要卡 + 圓餅圖 + 熱力圖 + 洞察；統計卡片可點擊導航）
├── projects/           專案列表與詳情
├── tasks/              任務看板（Kanban 四欄拖拉）
├── mytasks/            個人任務（依截止日自動分組；側面板支援刪除、截止日、優先度編輯）
├── gantt/              甘特圖（時間軸 + 相依連線）
├── team/               團隊成員管理
├── timetracking/       工時計時器 + 手動登錄
├── workload/           工作負載熱力圖（14 天）
├── reports/            統計報表（列表可點擊、CSV 匯出）
├── inbox/              收件匣（活動/書籤/封存/@提及 + 自訂 Tab）
├── goals/              目標管理 OKR
├── portfolios/         專案集監控（狀態 Dropdown 修復；點擊專案名稱可導航）
├── workflow/           工作流程圖
├── customfields/       自訂欄位管理
├── forms/              表單設計器
├── rules/              自動化規則設定
├── settings/           系統設定
├── ai/                 AI 決策中心 + AI 模型設定
├── mcp/                MCP 控制台（Claude Desktop 整合）
├── discovery/          內容探索頁
├── auth/               登入頁面（帳密 / Microsoft SSO）
└── RealtimeEditor      Yjs 即時多人協作編輯器
```

---

## 專案目錄結構

```
xCloudPMIS/
├── docker-compose.yml              # 開發環境（7 服務，含 HMR）
├── docker-compose.prod.yml         # 生產環境（含 Nginx 反向代理）
├── docker-compose.mcp.yml          # MCP Server 擴充設定
├── .env.example                    # 開發環境變數範本
├── .env.production.example         # 生產環境變數範本
│
├── docker/                         # 生產 Docker 設定
│   ├── frontend/
│   │   ├── Dockerfile.prod         # 多階段構建：Vite build → Nginx
│   │   └── nginx.conf              # SPA 路由 + 靜態快取設定
│   ├── backend/
│   │   └── Dockerfile.prod         # 多階段構建：非 root 用戶
│   └── nginx/
│       └── nginx.conf              # 反向代理 + SSL + WebSocket
│
├── deploy/                         # 部署腳本
│   ├── onprem/
│   │   ├── setup.sh                # 地端一鍵部署腳本
│   │   └── backup.sh               # 自動備份腳本
│   └── azure/
│       ├── azure-setup.sh          # Azure 資源一鍵建立
│       └── acr-build-push.sh       # ACR 映像建置推送
│
├── backend/                        # Node.js Express 後端
│   ├── Dockerfile                  # 開發用 Dockerfile
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma           # 17 張資料表定義
│   │   └── seed.js                 # 範例資料
│   ├── src/
│   │   ├── index.js                # Express 應用進入點（16 個路由）
│   │   ├── middleware/
│   │   │   └── oauthAuth.js        # Microsoft OAuth 中介層
│   │   ├── routes/                 # 14 個 API 路由模組（含 files.js 附件管理）
│   │   └── services/               # 商業邏輯（AI / Email / Cache）
│   ├── mcp/                        # MCP Server（Claude 工具整合）
│   ├── services/                   # 協作伺服器 + 自主代理
│   └── jobs/                       # 背景工作（AI 風險掃描）
│
├── frontend/                       # React + Vite 前端
│   ├── Dockerfile                  # 開發用 Dockerfile
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── hooks/                  # useAiDecisions, useRealtimeTask
│       └── components/             # 21 個頁面模組
│
├── database/                       # 資料庫腳本
│   ├── init/01_create_tables.sql   # Docker 初始化 SQL
│   ├── dashboard_views.sql         # 6 個 Dashboard PostgreSQL VIEW
│   └── schema_reference.sql        # Schema 參考文件
│
└── docs/                           # 技術文件
    ├── 部署手冊/
    │   ├── 地端Docker部署手冊.md   # 完整地端部署指南（15 章）
    │   └── Azure部署手冊.md        # 完整 Azure 雲端部署指南（16 章）
    ├── EXCHANGE_SETUP.md           # Microsoft 365 郵件設定
    └── MCP_USAGE.md                # Claude Desktop MCP 整合指南
```

---

## 開發歷程

### ✅ Phase 1 — 基礎架構
- Docker Compose 五服務環境（PostgreSQL、pgAdmin、Redis、Express、React）
- Prisma ORM 初始 Schema（Company、User、Project、Task）

### ✅ Phase 2 — 核心 CRUD
- 專案與任務的完整 CRUD API
- Redis 快取層（60 秒 TTL，AOF 持久化）
- 前端列表與表單元件

### ✅ Phase 3 — 進階協作功能
- 8 張新資料表（Milestone、TimeEntry、Attachment、Comment、Tag、TaskDependency、Notification、ActivityLog）
- 任務相依性（Finish-to-Start、Start-to-Start、Finish-to-Finish）
- @mention 通知系統（PostgreSQL JSONB）
- 即時計時器（防重複計時 Partial Unique Index）

### ✅ Phase 4 — 執行儀表板 + AI 整合
- 6 個 PostgreSQL Dashboard VIEW（紅黃綠健康燈號三重判斷）
- AI 自主代理架構（ReAct 推理鏈 + Human-in-the-Loop）
- Microsoft 365 OAuth 整合（AES-256-GCM Token 加密）
- AI 模型設定管理（支援 OpenAI / Azure / Ollama / 地端模型）
- MCP Server（Claude Desktop 直接操作系統）

### ✅ Phase 5 — 前端完整化 + Bug 修復
- 21 個前端頁面模組全部完成
- 收件匣完整重寫（自訂 Tab + 書籤 + 封存 + @提及）
- MyTasksPage 物件型別相容修復（assignee / project 巢狀物件）
- Dashboard Decimal 精確度修復（Prisma bundled Decimal，constructor.name = 'i'）
- 可行動洞察擴展（多種洞察類型，移除健康狀態限制）

### ✅ Phase 6 — 生產部署架構
- 多階段 Dockerfile（Frontend Nginx + Backend 非 root）
- 生產 docker-compose.prod.yml（Nginx 反向代理入口）
- 地端部署自動化腳本 + 備份腳本
- Azure 雲端部署腳本（Container Apps + PostgreSQL + Redis）
- 完整部署手冊（地端 15 章 + Azure 16 章）

### ✅ Phase 7 — UX 全面改善 + Bug 修復
- **檔案上傳中文檔名修復**：multer 以 Latin-1 解碼 HTTP Header，改以 `Buffer.from(name,'latin1').toString('utf8')` 正確還原繁體中文檔名
- **首頁統計卡片可點擊**：四張摘要卡片加上 `onClick` 導航（我的任務 / 工作負載 / 專案）及 hover 邊框效果
- **報表列點擊開啟編輯**：`<tr>` 加上 `cursor: pointer` + `onClick` 觸發編輯彈窗；✏️🗑️ 按鈕加 `e.stopPropagation()` 防止冒泡
- **我的任務刪除與修改**：SidePanel 新增「🗑 刪除」按鈕 + 確認對話框；截止日期改為 `<input type="date">`，優先度改為 `<select>` 可編輯
- **專案集狀態 Dropdown 修復**：`StatusBadge` 改用 `position: fixed` + React `createPortal` 渲染至 `document.body`，解決父容器 `overflow: hidden` 裁切問題
- **專案集名稱可點擊導航**：點擊表格中的專案名稱直接跳轉至「所有專案」頁面，hover 顯示品牌色底線

### ✅ Phase 8 — QA 驗收 + 安全加固（2026-03-22）
- **JWT 完整前端認證整合**：登入系統實作（bcrypt 密碼驗證、JWT 簽發、AuthContext、authFetch 攔截器、登出）
- **dev-token 資安修正**：`/api/auth/dev-token` 改為 production 環境完全不掛載（Node.js 條件 require）
- **Dashboard 即時進度**：專案清單新增水平進度條（紅 / 橙 / 綠三色依完成率），30 秒自動輪詢 + 🔄 手動刷新
- **程式碼清理**：移除孤立元件（RealtimeEditor、DiscoveryPage）、重複服務目錄、孤立 `.ts` 型別檔
- **依賴修正**：前端移除 `@tiptap/*`、`yjs` 系列（~500 KB）；後端補宣告 `dotenv`、`multer`、`uuid`，移除 `express-validator`、`typescript`、`ts-node`
- **dev seed 整理**：財政部示範資料移至 `backend/scripts/seeds/`，明確標示不可用於 production

---

## 部署文件導覽

| 手冊 | 說明 | 連結 |
|------|------|------|
| 地端 Docker 部署 | Ubuntu/RHEL 伺服器，含 SSL、備份、升版 | [地端Docker部署手冊.md](docs/部署手冊/地端Docker部署手冊.md) |
| Azure 雲端部署 | Container Apps + PostgreSQL + Redis + ACR | [Azure部署手冊.md](docs/部署手冊/Azure部署手冊.md) |
| Microsoft 365 整合 | Exchange Online / Graph API 設定 | [EXCHANGE_SETUP.md](docs/EXCHANGE_SETUP.md) |
| MCP 整合 | Claude Desktop 工具使用說明 | [MCP_USAGE.md](docs/MCP_USAGE.md) |

---

## 授權

MIT License © xCloud Team
