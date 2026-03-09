-- ============================================================
-- xCloudPMIS 資料庫 Schema 參考文件
-- 這個檔案是「教育用途」，讓你看到實際的 SQL 長什麼樣子
-- 實際建表是由 Prisma 的 migrate 指令自動執行
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 觀念說明：什麼是資料庫關聯？
--
-- 想像一個公司的組織圖：
--   公司 (companies) ─┬─ 員工 (users)
--                    └─ 專案 (projects) ─── 任務 (tasks)
--
-- 外鍵 (Foreign Key) = 「這筆資料屬於另一張表的哪一筆」
-- 例如：tasks.project_id = 3，代表這個任務屬於第 3 號專案
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- 表格 1：companies（公司）
-- 這是整個系統的「根」，所有資料都屬於某間公司
-- ────────────────────────────────────────────────────────────
CREATE TABLE companies (
    -- SERIAL = 自動遞增的整數（1, 2, 3...）
    -- PRIMARY KEY = 主鍵，每筆資料的唯一識別碼
    id         SERIAL PRIMARY KEY,

    -- VARCHAR(255) = 最多 255 個字元的文字
    -- NOT NULL = 這個欄位不能是空的（必填）
    name       VARCHAR(255) NOT NULL,

    -- UNIQUE = 不能有兩筆資料有相同的 slug
    slug       VARCHAR(100) NOT NULL UNIQUE,

    -- TEXT = 長文字（沒有長度限制）
    logo_url   TEXT,

    -- BOOLEAN = 只能是 true 或 false
    -- DEFAULT TRUE = 如果沒有填，預設是 true
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,

    -- TIMESTAMP WITH TIME ZONE = 含時區的時間戳記
    -- NOW() = 資料庫函數，回傳「現在的時間」
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 表格 2：users（使用者）
-- ────────────────────────────────────────────────────────────

-- 先建立「角色」型別（PostgreSQL 特有功能：CHECK CONSTRAINT）
-- 確保 role 只能是這三個值之一
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,

    -- REFERENCES companies(id) = 外鍵，連結到 companies 表的 id
    -- ON DELETE CASCADE = 如果公司被刪了，該公司的使用者也自動刪除
    company_id    INTEGER NOT NULL
                  REFERENCES companies(id) ON DELETE CASCADE,

    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,   -- 登入帳號，不能重複

    -- 密碼「絕對不能」存原始文字！要存加密後的雜湊值
    -- 例如：「abc123」→ 存成「$2b$10$...」這樣的雜湊
    password_hash VARCHAR(255) NOT NULL,

    -- CHECK 約束：只允許這三個值
    role          VARCHAR(20) NOT NULL DEFAULT 'member'
                  CHECK (role IN ('admin', 'pm', 'member')),

    avatar_url    TEXT,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,       -- 最後登入時間（可以是空的）
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 索引（Index）= 書的目錄
-- 有了索引，查詢就像查目錄，不用一頁一頁翻
-- 沒有索引 = 全表掃描（Table Scan），資料量大時非常慢
CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_email      ON users(email);

-- ────────────────────────────────────────────────────────────
-- 表格 3：projects（專案）
-- ────────────────────────────────────────────────────────────
CREATE TABLE projects (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    -- ON DELETE SET NULL = 負責人帳號被刪除時，這裡設為 NULL（而非刪掉整個專案）
    owner_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,

    name        VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',

    -- 專案狀態的約束（只允許這五種）
    status      VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),

    -- DECIMAL(15, 2) = 最多 15 位數字，小數點後 2 位
    -- 例如：9,999,999,999,999.99（約一百兆元）
    budget      DECIMAL(15, 2),

    -- DATE = 只有日期，沒有時間（YYYY-MM-DD 格式）
    start_date  DATE,
    end_date    DATE,

    -- 軟刪除欄位
    -- NULL = 正常（沒被刪除）
    -- 有時間戳 = 已被刪除
    -- 好處：可以查看歷史記錄、可以還原刪除的資料
    deleted_at  TIMESTAMP WITH TIME ZONE,

    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_company_id ON projects(company_id);
CREATE INDEX idx_projects_owner_id   ON projects(owner_id);
CREATE INDEX idx_projects_status     ON projects(status);
CREATE INDEX idx_projects_deleted_at ON projects(deleted_at);

-- ────────────────────────────────────────────────────────────
-- 表格 4：tasks（任務）
-- 這是系統最核心的資料表
-- ────────────────────────────────────────────────────────────
CREATE TABLE tasks (
    id             SERIAL PRIMARY KEY,
    project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assignee_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- 指派給誰
    created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- 誰建立的

    title          VARCHAR(500) NOT NULL,
    description    TEXT NOT NULL DEFAULT '',

    -- 任務狀態（看板的四個欄位）
    status         VARCHAR(20) NOT NULL DEFAULT 'todo'
                   CHECK (status IN ('todo', 'in_progress', 'review', 'done')),

    -- 優先級
    priority       VARCHAR(20) NOT NULL DEFAULT 'medium'
                   CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

    -- DECIMAL(6, 2) = 最多 6 位，2 位小數，例如 9999.99 小時
    estimated_hours DECIMAL(6, 2),
    due_date       DATE,

    -- 看板卡片排序用的位置（數字越小越靠上）
    position       INTEGER NOT NULL DEFAULT 0,

    deleted_at     TIMESTAMP WITH TIME ZONE,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_project_id  ON tasks(project_id);
CREATE INDEX idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX idx_tasks_status      ON tasks(status);
CREATE INDEX idx_tasks_priority    ON tasks(priority);
CREATE INDEX idx_tasks_deleted_at  ON tasks(deleted_at);

-- ────────────────────────────────────────────────────────────
-- 驗證查詢範例（看完 schema 後可以在 pgAdmin 試試看）
-- ────────────────────────────────────────────────────────────

-- 查詢某公司的所有進行中專案
-- SELECT * FROM projects
-- WHERE company_id = 1
--   AND status = 'active'
--   AND deleted_at IS NULL;  -- 重要！過濾掉已刪除的

-- 查詢某專案的所有未完成任務（含負責人名字）
-- SELECT t.title, t.status, t.priority, u.name AS assignee_name
-- FROM tasks t
-- LEFT JOIN users u ON t.assignee_id = u.id
-- WHERE t.project_id = 1
--   AND t.status != 'done'
--   AND t.deleted_at IS NULL
-- ORDER BY t.priority DESC, t.due_date ASC;
