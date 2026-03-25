CREATE TABLE IF NOT EXISTS "my_task_lists" (
  "id" SERIAL NOT NULL,
  "company_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "color" VARCHAR(20),
  "is_system" BOOLEAN NOT NULL DEFAULT FALSE,
  "system_key" VARCHAR(50),
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "my_task_lists_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "my_task_lists_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "my_task_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "my_task_list_tasks" (
  "id" SERIAL NOT NULL,
  "list_id" INTEGER NOT NULL,
  "task_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "my_task_list_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "my_task_list_tasks_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "my_task_lists" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "my_task_list_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "my_task_list_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "my_task_lists_user_id_system_key_key"
  ON "my_task_lists" ("user_id", "system_key");

CREATE INDEX IF NOT EXISTS "my_task_lists_company_id_idx"
  ON "my_task_lists" ("company_id");

CREATE INDEX IF NOT EXISTS "my_task_lists_user_id_position_idx"
  ON "my_task_lists" ("user_id", "position");

CREATE UNIQUE INDEX IF NOT EXISTS "my_task_list_tasks_user_id_task_id_key"
  ON "my_task_list_tasks" ("user_id", "task_id");

CREATE INDEX IF NOT EXISTS "my_task_list_tasks_list_id_position_idx"
  ON "my_task_list_tasks" ("list_id", "position");

CREATE INDEX IF NOT EXISTS "my_task_list_tasks_task_id_idx"
  ON "my_task_list_tasks" ("task_id");
