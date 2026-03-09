-- ============================================================
-- xCloudPMIS 初始資料庫結構
-- 此檔案在 PostgreSQL 容器首次啟動時自動執行
-- ============================================================

-- 專案資料表
CREATE TABLE IF NOT EXISTS projects (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    status      VARCHAR(50)  DEFAULT 'active',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 插入示範資料
INSERT INTO projects (name, description) VALUES
    ('xCloudPMIS 開發', '企業級專案管理系統主專案'),
    ('UI 設計稿', '前端介面設計與規劃');

-- 顯示初始化完成訊息
DO $$
BEGIN
    RAISE NOTICE '✅ 資料庫初始化完成！已建立 projects 資料表';
END $$;
