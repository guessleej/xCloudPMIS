-- ============================================================
-- Phase 1 Core Model Refactor Migration
-- Target scope:
--   1. Workspace -> Team -> Project hierarchy
--   2. Task <-> Project many-to-many bridge
--   3. Unlimited subtasks via adjacency list
--   4. Custom field definition/value system
--   5. Compatibility backfill for legacy project/task rows
--
-- Important:
-- - This SQL intentionally targets the current runtime naming in schema.prisma
--   so legacy code paths can keep working while Phase 1 rolls out.
-- - Later Phase 3 / automation / AI tables are intentionally excluded.
-- - Custom fields previously stored in frontend localStorage are not auto-imported;
--   only the database structures are created here.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Enums
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regtype('"WorkspaceVisibility"') IS NULL THEN
    CREATE TYPE "WorkspaceVisibility" AS ENUM ('company', 'private');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('"WorkspaceMemberRole"') IS NULL THEN
    CREATE TYPE "WorkspaceMemberRole" AS ENUM ('admin', 'member', 'guest');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('"TeamPrivacy"') IS NULL THEN
    CREATE TYPE "TeamPrivacy" AS ENUM ('open', 'closed', 'private');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('"TeamMemberRole"') IS NULL THEN
    CREATE TYPE "TeamMemberRole" AS ENUM ('lead', 'member', 'guest');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('"ProjectAccess"') IS NULL THEN
    CREATE TYPE "ProjectAccess" AS ENUM ('team', 'private');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('"ProjectMemberRole"') IS NULL THEN
    CREATE TYPE "ProjectMemberRole" AS ENUM ('owner', 'editor', 'commenter', 'viewer');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('"DependencyType"') IS NULL THEN
    CREATE TYPE "DependencyType" AS ENUM ('finish_to_start', 'start_to_start', 'finish_to_finish');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('"CustomFieldScope"') IS NULL THEN
    CREATE TYPE "CustomFieldScope" AS ENUM ('workspace', 'team', 'project');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('"CustomFieldEntityType"') IS NULL THEN
    CREATE TYPE "CustomFieldEntityType" AS ENUM ('task', 'project');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('"CustomFieldType"') IS NULL THEN
    CREATE TYPE "CustomFieldType" AS ENUM (
      'text',
      'number',
      'currency',
      'percent',
      'checkbox',
      'date',
      'datetime',
      'single_select',
      'multi_select',
      'people'
    );
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Base column changes on legacy tables
-- ------------------------------------------------------------
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "workspace_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "team_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "access" "ProjectAccess" NOT NULL DEFAULT 'team',
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "parent_task_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "progress_percent" INTEGER NOT NULL DEFAULT 0;

-- If the runtime has already created these columns, keep the existing values.
UPDATE "tasks"
SET "progress_percent" = CASE
  WHEN "status" = 'done' THEN 100
  ELSE COALESCE("progress_percent", 0)
END
WHERE "progress_percent" IS NULL
   OR ("status" = 'done' AND "progress_percent" = 0);

-- ------------------------------------------------------------
-- 3. New hierarchy tables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" SERIAL NOT NULL,
  "company_id" INTEGER NOT NULL,
  "created_by_id" INTEGER,
  "name" VARCHAR(255) NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "visibility" "WorkspaceVisibility" NOT NULL DEFAULT 'company',
  "is_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspaces_company_id_slug_key" UNIQUE ("company_id", "slug"),
  CONSTRAINT "workspaces_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspaces_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "workspace_members" (
  "workspace_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "role" "WorkspaceMemberRole" NOT NULL DEFAULT 'member',
  "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("workspace_id", "user_id"),
  CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "teams" (
  "id" SERIAL NOT NULL,
  "workspace_id" INTEGER NOT NULL,
  "created_by_id" INTEGER,
  "name" VARCHAR(255) NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "privacy" "TeamPrivacy" NOT NULL DEFAULT 'private',
  "color" VARCHAR(20),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "teams_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "teams_workspace_id_slug_key" UNIQUE ("workspace_id", "slug"),
  CONSTRAINT "teams_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "teams_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "team_members" (
  "team_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "role" "TeamMemberRole" NOT NULL DEFAULT 'member',
  "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_members_pkey" PRIMARY KEY ("team_id", "user_id"),
  CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "project_members" (
  "project_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "role" "ProjectMemberRole" NOT NULL DEFAULT 'editor',
  "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id", "user_id"),
  CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ------------------------------------------------------------
-- 4. Task multi-project + multi-assignee bridge tables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "task_projects" (
  "task_id" INTEGER NOT NULL,
  "project_id" INTEGER NOT NULL,
  "added_by_id" INTEGER,
  "position" INTEGER NOT NULL DEFAULT 0,
  "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_projects_pkey" PRIMARY KEY ("task_id", "project_id"),
  CONSTRAINT "task_projects_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_projects_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "task_assignees" (
  "task_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "assigned_by_id" INTEGER,
  "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("task_id", "user_id"),
  CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_assignees_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "task_dependencies" (
  "id" SERIAL NOT NULL,
  "task_id" INTEGER NOT NULL,
  "depends_on_task_id" INTEGER NOT NULL,
  "dependency_type" "DependencyType" NOT NULL DEFAULT 'finish_to_start',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_dependencies_task_id_depends_on_task_id_key" UNIQUE ("task_id", "depends_on_task_id"),
  CONSTRAINT "task_dependencies_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_dependencies_depends_on_task_id_fkey" FOREIGN KEY ("depends_on_task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ------------------------------------------------------------
-- 5. Custom field system
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "custom_field_definitions" (
  "id" SERIAL NOT NULL,
  "workspace_id" INTEGER,
  "created_by_id" INTEGER,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "field_type" "CustomFieldType" NOT NULL,
  "entity_type" "CustomFieldEntityType" NOT NULL DEFAULT 'task',
  "scope" "CustomFieldScope" NOT NULL DEFAULT 'project',
  "is_required" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_archived" BOOLEAN NOT NULL DEFAULT FALSE,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "currency_code" VARCHAR(3),
  "settings_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "custom_field_definitions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "custom_field_definitions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "custom_field_options" (
  "id" SERIAL NOT NULL,
  "definition_id" INTEGER NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "color" VARCHAR(20),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_archived" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "custom_field_options_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "custom_field_options_definition_id_name_key" UNIQUE ("definition_id", "name"),
  CONSTRAINT "custom_field_options_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "custom_field_definitions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "project_custom_fields" (
  "project_id" INTEGER NOT NULL,
  "definition_id" INTEGER NOT NULL,
  "is_pinned" BOOLEAN NOT NULL DEFAULT FALSE,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_custom_fields_pkey" PRIMARY KEY ("project_id", "definition_id"),
  CONSTRAINT "project_custom_fields_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_custom_fields_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "custom_field_definitions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "custom_field_values" (
  "id" SERIAL NOT NULL,
  "definition_id" INTEGER NOT NULL,
  "task_id" INTEGER,
  "project_id" INTEGER,
  "text_value" TEXT,
  "number_value" DECIMAL(18,4),
  "boolean_value" BOOLEAN,
  "date_value" DATE,
  "datetime_value" TIMESTAMP(3),
  "user_value_id" INTEGER,
  "option_value_id" INTEGER,
  "json_value" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "custom_field_values_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "custom_field_values_definition_id_task_id_key" UNIQUE ("definition_id", "task_id"),
  CONSTRAINT "custom_field_values_definition_id_project_id_key" UNIQUE ("definition_id", "project_id"),
  CONSTRAINT "custom_field_values_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "custom_field_definitions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "custom_field_values_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "custom_field_values_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "custom_field_values_user_value_id_fkey" FOREIGN KEY ("user_value_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "custom_field_values_option_value_id_fkey" FOREIGN KEY ("option_value_id") REFERENCES "custom_field_options" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "custom_field_value_options" (
  "value_id" INTEGER NOT NULL,
  "option_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "custom_field_value_options_pkey" PRIMARY KEY ("value_id", "option_id"),
  CONSTRAINT "custom_field_value_options_value_id_fkey" FOREIGN KEY ("value_id") REFERENCES "custom_field_values" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "custom_field_value_options_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "custom_field_options" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ------------------------------------------------------------
-- 6. Indexes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "workspaces_company_id_idx" ON "workspaces" ("company_id");
CREATE INDEX IF NOT EXISTS "workspaces_created_by_id_idx" ON "workspaces" ("created_by_id");
CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_default_company_idx" ON "workspaces" ("company_id") WHERE "is_default" = TRUE;

CREATE INDEX IF NOT EXISTS "workspace_members_user_id_idx" ON "workspace_members" ("user_id");

CREATE INDEX IF NOT EXISTS "teams_workspace_id_idx" ON "teams" ("workspace_id");
CREATE INDEX IF NOT EXISTS "teams_created_by_id_idx" ON "teams" ("created_by_id");

CREATE INDEX IF NOT EXISTS "team_members_user_id_idx" ON "team_members" ("user_id");
CREATE INDEX IF NOT EXISTS "project_members_user_id_idx" ON "project_members" ("user_id");

CREATE INDEX IF NOT EXISTS "projects_workspace_id_idx" ON "projects" ("workspace_id");
CREATE INDEX IF NOT EXISTS "projects_team_id_idx" ON "projects" ("team_id");
CREATE INDEX IF NOT EXISTS "projects_access_idx" ON "projects" ("access");

CREATE INDEX IF NOT EXISTS "tasks_parent_task_id_idx" ON "tasks" ("parent_task_id");

CREATE INDEX IF NOT EXISTS "task_projects_project_id_position_idx" ON "task_projects" ("project_id", "position");
CREATE INDEX IF NOT EXISTS "task_projects_added_by_id_idx" ON "task_projects" ("added_by_id");
CREATE UNIQUE INDEX IF NOT EXISTS "task_projects_one_primary_per_task_idx" ON "task_projects" ("task_id") WHERE "is_primary" = TRUE;

CREATE INDEX IF NOT EXISTS "task_assignees_user_id_idx" ON "task_assignees" ("user_id");
CREATE INDEX IF NOT EXISTS "task_assignees_assigned_by_id_idx" ON "task_assignees" ("assigned_by_id");
CREATE UNIQUE INDEX IF NOT EXISTS "task_assignees_one_primary_per_task_idx" ON "task_assignees" ("task_id") WHERE "is_primary" = TRUE;

CREATE INDEX IF NOT EXISTS "task_dependencies_task_id_idx" ON "task_dependencies" ("task_id");
CREATE INDEX IF NOT EXISTS "task_dependencies_depends_on_task_id_idx" ON "task_dependencies" ("depends_on_task_id");

CREATE INDEX IF NOT EXISTS "custom_field_definitions_workspace_entity_idx" ON "custom_field_definitions" ("workspace_id", "entity_type");
CREATE INDEX IF NOT EXISTS "custom_field_definitions_created_by_id_idx" ON "custom_field_definitions" ("created_by_id");
CREATE INDEX IF NOT EXISTS "custom_field_definitions_scope_idx" ON "custom_field_definitions" ("scope");
CREATE INDEX IF NOT EXISTS "custom_field_options_definition_sort_idx" ON "custom_field_options" ("definition_id", "sort_order");
CREATE INDEX IF NOT EXISTS "project_custom_fields_definition_id_idx" ON "project_custom_fields" ("definition_id");
CREATE INDEX IF NOT EXISTS "custom_field_values_task_id_idx" ON "custom_field_values" ("task_id");
CREATE INDEX IF NOT EXISTS "custom_field_values_project_id_idx" ON "custom_field_values" ("project_id");
CREATE INDEX IF NOT EXISTS "custom_field_values_user_value_id_idx" ON "custom_field_values" ("user_value_id");
CREATE INDEX IF NOT EXISTS "custom_field_values_option_value_id_idx" ON "custom_field_values" ("option_value_id");
CREATE INDEX IF NOT EXISTS "custom_field_value_options_option_id_idx" ON "custom_field_value_options" ("option_id");

-- ------------------------------------------------------------
-- 7. Additional constraints on altered legacy tables
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_workspace_id_fkey'
  ) THEN
    ALTER TABLE "projects"
      ADD CONSTRAINT "projects_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_team_id_fkey'
  ) THEN
    ALTER TABLE "projects"
      ADD CONSTRAINT "projects_team_id_fkey"
      FOREIGN KEY ("team_id") REFERENCES "teams" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tasks_parent_task_id_fkey'
  ) THEN
    ALTER TABLE "tasks"
      ADD CONSTRAINT "tasks_parent_task_id_fkey"
      FOREIGN KEY ("parent_task_id") REFERENCES "tasks" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'custom_field_values_target_xor_chk'
  ) THEN
    ALTER TABLE "custom_field_values"
      ADD CONSTRAINT "custom_field_values_target_xor_chk"
      CHECK (num_nonnulls("task_id", "project_id") = 1);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'custom_field_values_single_scalar_payload_chk'
  ) THEN
    ALTER TABLE "custom_field_values"
      ADD CONSTRAINT "custom_field_values_single_scalar_payload_chk"
      CHECK (
        num_nonnulls(
          "text_value",
          "number_value",
          "boolean_value",
          "date_value",
          "datetime_value",
          "user_value_id",
          "option_value_id",
          "json_value"
        ) <= 1
      );
  END IF;
END $$;

-- ------------------------------------------------------------
-- 8. Backfill: default workspaces and memberships
-- ------------------------------------------------------------
INSERT INTO "workspaces" (
  "company_id",
  "created_by_id",
  "name",
  "slug",
  "description",
  "visibility",
  "is_default",
  "created_at",
  "updated_at"
)
SELECT
  c."id" AS "company_id",
  seed_user."id" AS "created_by_id",
  c."name" || ' Workspace' AS "name",
  c."slug" || '-main' AS "slug",
  'Auto-created during Phase 1 core model migration.' AS "description",
  'company'::"WorkspaceVisibility" AS "visibility",
  TRUE AS "is_default",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "companies" c
LEFT JOIN LATERAL (
  SELECT u."id"
  FROM "users" u
  WHERE u."company_id" = c."id"
  ORDER BY
    CASE
      WHEN u."role" = 'admin' THEN 0
      WHEN u."role" = 'pm' THEN 1
      ELSE 2
    END,
    u."id"
  LIMIT 1
) seed_user ON TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM "workspaces" w
  WHERE w."company_id" = c."id"
    AND w."is_default" = TRUE
);

INSERT INTO "workspace_members" (
  "workspace_id",
  "user_id",
  "role",
  "joined_at"
)
SELECT
  w."id" AS "workspace_id",
  u."id" AS "user_id",
  CASE
    WHEN u."role" = 'admin' THEN 'admin'::"WorkspaceMemberRole"
    ELSE 'member'::"WorkspaceMemberRole"
  END AS "role",
  COALESCE(u."joined_at", u."created_at", CURRENT_TIMESTAMP) AS "joined_at"
FROM "users" u
JOIN "workspaces" w
  ON w."company_id" = u."company_id"
 AND w."is_default" = TRUE
ON CONFLICT ("workspace_id", "user_id") DO NOTHING;

-- ------------------------------------------------------------
-- 9. Backfill: project hierarchy + memberships
-- ------------------------------------------------------------
UPDATE "projects" p
SET "workspace_id" = w."id"
FROM "workspaces" w
WHERE p."workspace_id" IS NULL
  AND w."company_id" = p."company_id"
  AND w."is_default" = TRUE;

INSERT INTO "project_members" (
  "project_id",
  "user_id",
  "role",
  "joined_at"
)
SELECT
  p."id" AS "project_id",
  p."owner_id" AS "user_id",
  'owner'::"ProjectMemberRole" AS "role",
  COALESCE(p."created_at", CURRENT_TIMESTAMP) AS "joined_at"
FROM "projects" p
WHERE p."owner_id" IS NOT NULL
ON CONFLICT ("project_id", "user_id") DO NOTHING;

-- ------------------------------------------------------------
-- 10. Backfill: task <-> project and task assignees
-- ------------------------------------------------------------
INSERT INTO "task_projects" (
  "task_id",
  "project_id",
  "added_by_id",
  "position",
  "is_primary",
  "created_at",
  "updated_at"
)
SELECT
  t."id" AS "task_id",
  t."project_id" AS "project_id",
  t."created_by" AS "added_by_id",
  COALESCE(t."position", 0) AS "position",
  TRUE AS "is_primary",
  COALESCE(t."created_at", CURRENT_TIMESTAMP) AS "created_at",
  COALESCE(t."updated_at", CURRENT_TIMESTAMP) AS "updated_at"
FROM "tasks" t
WHERE t."project_id" IS NOT NULL
ON CONFLICT ("task_id", "project_id") DO NOTHING;

INSERT INTO "task_assignees" (
  "task_id",
  "user_id",
  "assigned_by_id",
  "is_primary",
  "assigned_at"
)
SELECT
  t."id" AS "task_id",
  t."assignee_id" AS "user_id",
  t."created_by" AS "assigned_by_id",
  TRUE AS "is_primary",
  COALESCE(t."updated_at", t."created_at", CURRENT_TIMESTAMP) AS "assigned_at"
FROM "tasks" t
WHERE t."assignee_id" IS NOT NULL
ON CONFLICT ("task_id", "user_id") DO NOTHING;

INSERT INTO "project_members" (
  "project_id",
  "user_id",
  "role",
  "joined_at"
)
SELECT DISTINCT
  tp."project_id",
  ta."user_id",
  'editor'::"ProjectMemberRole" AS "role",
  COALESCE(t."created_at", CURRENT_TIMESTAMP) AS "joined_at"
FROM "task_projects" tp
JOIN "task_assignees" ta
  ON ta."task_id" = tp."task_id"
JOIN "tasks" t
  ON t."id" = tp."task_id"
ON CONFLICT ("project_id", "user_id") DO NOTHING;

-- ------------------------------------------------------------
-- 11. Maintenance: keep updated_at deterministic after backfill
-- ------------------------------------------------------------
UPDATE "projects"
SET "updated_at" = CURRENT_TIMESTAMP
WHERE "workspace_id" IS NOT NULL
  AND "updated_at" < CURRENT_TIMESTAMP;

UPDATE "tasks"
SET "updated_at" = CURRENT_TIMESTAMP
WHERE "progress_percent" IS NOT NULL
  AND "updated_at" < CURRENT_TIMESTAMP;
