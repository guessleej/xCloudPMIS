-- ============================================================
-- xCloudPMIS — PostgreSQL Row-Level Security (RLS) 政策
-- P0 多租戶安全第二道防線
--
-- 目的：
--   即使應用層的 companyId 過濾被繞過，資料庫層仍能阻擋跨租戶存取。
--
-- 架構：
--   - pmis_user (table owner)：應用程式服務帳號，FORCE RLS 後需明確 policy
--   - pmis_readonly：未來報表/BI 工具用，只能讀取自己公司的資料
--
-- 使用方式：
--   應用程式每次 DB session 開始時執行：
--   SELECT set_config('app.current_company_id', '1', true);
--   RLS policy 即自動過濾對應公司的資料列
-- ============================================================

-- ── 建立唯讀報表帳號（未來 BI 工具使用） ────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pmis_readonly') THEN
    CREATE ROLE pmis_readonly NOLOGIN;
  END IF;
END$$;

GRANT CONNECT ON DATABASE pmis_db TO pmis_readonly;
GRANT USAGE ON SCHEMA public TO pmis_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pmis_readonly;

-- ── 啟用 RLS（核心業務表格） ─────────────────────────────────
-- FORCE：即使是 table owner (pmis_user) 也必須符合 policy
ALTER TABLE companies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces  ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE companies   FORCE ROW LEVEL SECURITY;
ALTER TABLE users       FORCE ROW LEVEL SECURITY;
ALTER TABLE projects    FORCE ROW LEVEL SECURITY;
ALTER TABLE workspaces  FORCE ROW LEVEL SECURITY;
ALTER TABLE teams       FORCE ROW LEVEL SECURITY;
ALTER TABLE tasks       FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE activity_logs FORCE ROW LEVEL SECURITY;

-- ── pmis_user 應用層 Policy（完整存取，依 session 變數過濾） ─
-- app.current_company_id 由應用程式在每個 session 設定
-- true 表示：若未設定 session 變數，允許存取（向後相容，遷移期間）

CREATE POLICY app_companies ON companies
  FOR ALL TO pmis_user
  USING (
    id = COALESCE(
      NULLIF(current_setting('app.current_company_id', true), '')::int,
      id  -- fallback：未設定時允許，保持向後相容
    )
  );

CREATE POLICY app_users ON users
  FOR ALL TO pmis_user
  USING (
    company_id = COALESCE(
      NULLIF(current_setting('app.current_company_id', true), '')::int,
      company_id
    )
  );

CREATE POLICY app_projects ON projects
  FOR ALL TO pmis_user
  USING (
    company_id = COALESCE(
      NULLIF(current_setting('app.current_company_id', true), '')::int,
      company_id
    )
  );

CREATE POLICY app_workspaces ON workspaces
  FOR ALL TO pmis_user
  USING (
    company_id = COALESCE(
      NULLIF(current_setting('app.current_company_id', true), '')::int,
      company_id
    )
  );

CREATE POLICY app_teams ON teams
  FOR ALL TO pmis_user
  USING (
    workspace_id IN (
      SELECT id FROM workspaces
      WHERE company_id = COALESCE(
        NULLIF(current_setting('app.current_company_id', true), '')::int,
        company_id
      )
    )
  );

-- tasks 透過 project 的 company_id 隔離
CREATE POLICY app_tasks ON tasks
  FOR ALL TO pmis_user
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE company_id = COALESCE(
        NULLIF(current_setting('app.current_company_id', true), '')::int,
        company_id
      )
    )
  );

CREATE POLICY app_notifications ON notifications
  FOR ALL TO pmis_user
  USING (
    recipient_id IN (
      SELECT id FROM users
      WHERE company_id = COALESCE(
        NULLIF(current_setting('app.current_company_id', true), '')::int,
        company_id
      )
    )
  );

CREATE POLICY app_activity_logs ON activity_logs
  FOR ALL TO pmis_user
  USING (
    user_id IN (
      SELECT id FROM users
      WHERE company_id = COALESCE(
        NULLIF(current_setting('app.current_company_id', true), '')::int,
        company_id
      )
    )
  );

-- ── pmis_readonly 嚴格 Policy（需明確設定 session 變數）───────
-- 不設定 session 變數 → 拒絕存取（安全優先）

CREATE POLICY readonly_companies ON companies
  FOR SELECT TO pmis_readonly
  USING (
    id = NULLIF(current_setting('app.current_company_id', true), '')::int
  );

CREATE POLICY readonly_users ON users
  FOR SELECT TO pmis_readonly
  USING (
    company_id = NULLIF(current_setting('app.current_company_id', true), '')::int
  );

CREATE POLICY readonly_projects ON projects
  FOR SELECT TO pmis_readonly
  USING (
    company_id = NULLIF(current_setting('app.current_company_id', true), '')::int
  );

CREATE POLICY readonly_tasks ON tasks
  FOR SELECT TO pmis_readonly
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE company_id = NULLIF(current_setting('app.current_company_id', true), '')::int
    )
  );
