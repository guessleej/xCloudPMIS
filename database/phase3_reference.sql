-- ============================================================
-- Phase 3 資料庫 Schema — 教育參考用 SQL
-- 實際建表由 Prisma 自動處理，這份是讓你了解背後的 SQL 結構
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 修改既有 tasks 表（新增 3 個欄位）
-- ────────────────────────────────────────────────────────────
ALTER TABLE tasks
  -- 實際花費工時（從 time_entries 彙總，快速查詢用）
  ADD COLUMN IF NOT EXISTS actual_hours     DECIMAL(6,2),
  -- 任務實際開始時間
  ADD COLUMN IF NOT EXISTS started_at       TIMESTAMP WITH TIME ZONE,
  -- 任務實際完成時間
  ADD COLUMN IF NOT EXISTS completed_at     TIMESTAMP WITH TIME ZONE;

-- ────────────────────────────────────────────────────────────
-- 表格：task_dependencies（任務依賴）
--
-- 設計重點：
--   task_id + depends_on_task_id 設為 UNIQUE，防止重複建依賴
--   CHECK 約束確保一個任務不能依賴自己（task_id != depends_on_task_id）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_dependencies (
    id                  SERIAL PRIMARY KEY,
    task_id             INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type     VARCHAR(20) NOT NULL DEFAULT 'finish_to_start'
                        CHECK (dependency_type IN ('finish_to_start', 'start_to_start', 'finish_to_finish')),
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- 防止同樣的依賴被建立兩次（A依賴B 只能有一筆）
    CONSTRAINT uq_task_dependency UNIQUE (task_id, depends_on_task_id),
    -- 防止任務依賴自己（A 不能依賴 A）
    CONSTRAINT chk_no_self_dependency CHECK (task_id != depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_dep_task_id ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dep_depends_on ON task_dependencies(depends_on_task_id);

-- ────────────────────────────────────────────────────────────
-- 循環依賴檢查（應用程式層，非 SQL Trigger）
-- 說明：用 DFS（深度優先搜尋）演算法
--
-- 假設現有依賴：B depends_on A，C depends_on B
-- 現在要新增：A depends_on C
-- 檢查流程：從 C 出發，沿著依賴鏈往前追：C → B → A
-- 發現 A 已在鏈上，因此「A depends_on C」會形成循環 → 拒絕！
--
-- 對應的 JavaScript 程式在：backend/src/utils/dependencyCheck.js
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- 表格：milestones（里程碑）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestones (
    id          SERIAL PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_date    DATE NOT NULL,
    is_achieved BOOLEAN NOT NULL DEFAULT FALSE,
    achieved_at TIMESTAMP WITH TIME ZONE,
    -- 顏色標籤：綠=正常、黃=注意、紅=延誤風險
    color       VARCHAR(10) NOT NULL DEFAULT 'green'
                CHECK (color IN ('red', 'yellow', 'green')),
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_due_date   ON milestones(due_date);

-- ────────────────────────────────────────────────────────────
-- 表格：time_entries（工時計時記錄）
--
-- 關鍵設計：ended_at 為 NULL 表示計時進行中
-- 防呆機制：同一 user_id 同時只能有一筆 ended_at IS NULL
--           （在應用程式層用 unique partial index 實作）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_entries (
    id               SERIAL PRIMARY KEY,
    task_id          INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at       TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at         TIMESTAMP WITH TIME ZONE,          -- NULL = 計時進行中
    duration_minutes INTEGER,                           -- 停止後才填入
    description      TEXT NOT NULL DEFAULT '',
    date             DATE NOT NULL,                     -- 記錄日期（方便統計）
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- 防呆：duration 不能超過 24 小時（= 1440 分鐘）
    CONSTRAINT chk_duration_max CHECK (duration_minutes IS NULL OR duration_minutes <= 1440),
    -- 防呆：結束時間不能早於開始時間
    CONSTRAINT chk_end_after_start CHECK (ended_at IS NULL OR ended_at > started_at)
);

-- 關鍵索引：找某使用者「進行中」的計時（只能有一筆）
-- PARTIAL INDEX：只對 ended_at IS NULL 的資料建索引，節省空間
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entry_active_per_user
    ON time_entries(user_id)
    WHERE ended_at IS NULL;
-- 解讀：同一個 user_id，ended_at IS NULL 的記錄最多只能有 1 筆
-- 效果：應用程式層不用特別處理，資料庫層就會擋掉重複計時

CREATE INDEX IF NOT EXISTS idx_time_entries_task_id ON time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date    ON time_entries(date);

-- ────────────────────────────────────────────────────────────
-- 表格：attachments（任務附件）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attachments (
    id              SERIAL PRIMARY KEY,
    task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    uploaded_by     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name   VARCHAR(255) NOT NULL,  -- 使用者的原始檔名
    stored_name     VARCHAR(255) NOT NULL,  -- 實際儲存的 UUID 檔名
    file_path       TEXT NOT NULL,          -- 本機路徑或 S3 URL
    mime_type       VARCHAR(100) NOT NULL,  -- 例：image/jpeg, application/pdf
    file_size_bytes INTEGER NOT NULL,
    thumbnail_path  TEXT,                   -- 圖片才有縮圖
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_task_id ON attachments(task_id);

-- ────────────────────────────────────────────────────────────
-- 表格：comments（評論與回覆串）
--
-- 巢狀結構說明：
--   SELECT * FROM comments WHERE task_id = 1 AND parent_id IS NULL
--   ↑ 取頂層留言
--   SELECT * FROM comments WHERE parent_id = 5
--   ↑ 取 ID=5 留言的所有回覆
--
-- mentions 欄位：
--   JSONB 類型，儲存被@提及的使用者 ID 陣列
--   例如：[2, 5] 代表提及了 ID 為 2 和 5 的使用者
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
    id          SERIAL PRIMARY KEY,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id   INTEGER REFERENCES comments(id),  -- 自我參照（回覆功能）
    content     TEXT NOT NULL,
    mentions    JSONB NOT NULL DEFAULT '[]',       -- 被提及的 user_id 陣列
    is_edited   BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at   TIMESTAMP WITH TIME ZONE,
    deleted_at  TIMESTAMP WITH TIME ZONE,          -- 軟刪除
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_task_id  ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
-- GIN 索引：讓 JSONB 欄位可以快速查詢（例如：找誰被提及了）
CREATE INDEX IF NOT EXISTS idx_comments_mentions ON comments USING GIN(mentions);

-- ────────────────────────────────────────────────────────────
-- 表格：tags（標籤）和 task_tags（多對多中間表）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(50) NOT NULL,
    color       VARCHAR(20) NOT NULL DEFAULT '#6b7280',  -- 十六進位顏色碼
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_tag_name_per_company UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_company_id ON tags(company_id);

CREATE TABLE IF NOT EXISTS task_tags (
    task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (task_id, tag_id)  -- 複合主鍵
);

-- ────────────────────────────────────────────────────────────
-- 表格：notifications（使用者通知）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id            SERIAL PRIMARY KEY,
    recipient_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type          VARCHAR(30) NOT NULL
                  CHECK (type IN (
                      'task_assigned', 'deadline_approaching', 'mentioned',
                      'comment_added', 'task_completed', 'milestone_achieved'
                  )),
    title         VARCHAR(255) NOT NULL,
    message       TEXT NOT NULL,
    is_read       BOOLEAN NOT NULL DEFAULT FALSE,
    read_at       TIMESTAMP WITH TIME ZONE,
    resource_type VARCHAR(50),   -- 'task' | 'project' | 'comment'
    resource_id   INTEGER,       -- 點擊通知後要跳轉到的資源 ID
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read   ON notifications(recipient_id, is_read);

-- ────────────────────────────────────────────────────────────
-- 表格：activity_logs（任務變更歷史）
--
-- JSONB 的優勢：
--   - 可以儲存任意結構的資料，不同操作有不同欄位格式
--   - 支援 GIN 索引，可以做 JSON 欄位查詢
--   - 比 TEXT 更好，因為可以查詢內容
--
-- 使用範例：
--   查詢某任務的所有狀態變更記錄：
--   SELECT * FROM activity_logs
--   WHERE task_id = 1 AND action = 'status_changed'
--   ORDER BY created_at DESC;
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
    id         SERIAL PRIMARY KEY,
    task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action     VARCHAR(50) NOT NULL,
    -- JSONB 可以儲存任意 JSON 結構，例如：{"status": "todo", "priority": "medium"}
    old_value  JSONB,
    new_value  JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_task_id   ON activity_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id   ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created   ON activity_logs(created_at);
-- GIN 索引：讓 JSONB 欄位可以快速搜尋
CREATE INDEX IF NOT EXISTS idx_activity_logs_new_value ON activity_logs USING GIN(new_value);

-- ────────────────────────────────────────────────────────────
-- 驗證查詢範例
-- ────────────────────────────────────────────────────────────

-- 查詢某任務的完整活動歷史（含使用者名稱）：
-- SELECT al.action, al.old_value, al.new_value, u.name, al.created_at
-- FROM activity_logs al
-- JOIN users u ON al.user_id = u.id
-- WHERE al.task_id = 1
-- ORDER BY al.created_at DESC;

-- 統計某專案每個成員的本週工時：
-- SELECT u.name, SUM(te.duration_minutes) / 60.0 AS hours
-- FROM time_entries te
-- JOIN users u ON te.user_id = u.id
-- JOIN tasks t  ON te.task_id = t.id
-- WHERE t.project_id = 1
--   AND te.date >= DATE_TRUNC('week', NOW())
--   AND te.ended_at IS NOT NULL
-- GROUP BY u.id, u.name
-- ORDER BY hours DESC;

-- 查詢某使用者未讀通知數：
-- SELECT COUNT(*) FROM notifications
-- WHERE recipient_id = 1 AND is_read = FALSE;
