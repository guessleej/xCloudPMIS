-- ============================================================
-- Phase 4 — 主管決策儀表板：SQL 聚合查詢設計
--
-- 這份文件說明「紅黃綠燈」系統的計算邏輯。
-- 實際執行由後端 API 用 Prisma.$queryRaw 呼叫，
-- 這裡的 VIEW 是讓你理解背後的 SQL 結構。
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 設計原則說明
--
-- 為什麼不用 Prisma ORM 直接查？
--   因為這種多表 JOIN + 複雜條件的聚合查詢，
--   用原生 SQL 寫起來比 Prisma 的 groupBy 更清晰、效能更好。
--   Prisma 的 $queryRaw 可以直接執行 SQL，同時保有 type safety。
--
-- 假設時薪：1,000 元/小時（實際應存在 users 表或公司設定中）
--   後面用常數 1000 代入，未來可改成 u.hourly_rate 欄位
-- ────────────────────────────────────────────────────────────


-- ============================================================
-- VIEW 1：專案任務統計
-- 計算每個專案的任務完成率、逾期數量、估計工時
-- ============================================================
CREATE OR REPLACE VIEW v_project_task_stats AS
SELECT
    t.project_id,

    -- 總任務數（排除已軟刪除的）
    COUNT(*)                                            AS total_tasks,

    -- 已完成任務數
    COUNT(*) FILTER (WHERE t.status = 'done')           AS done_tasks,

    -- 進行中任務數
    COUNT(*) FILTER (WHERE t.status = 'in_progress')    AS in_progress_tasks,

    -- 逾期任務數：截止日 < 今天 且 還沒完成
    COUNT(*) FILTER (
        WHERE t.due_date < CURRENT_DATE
          AND t.status NOT IN ('done')
          AND t.deleted_at IS NULL
    )                                                   AS overdue_tasks,

    -- 本週新增任務數
    COUNT(*) FILTER (
        WHERE t.created_at >= DATE_TRUNC('week', NOW())
    )                                                   AS new_tasks_this_week,

    -- 總預估工時（NULL 視為 0）
    COALESCE(SUM(t.estimated_hours), 0)                 AS total_estimated_hours,

    -- 總實際工時（從 actual_hours 欄位，會從 time_entries 匯總後寫入）
    COALESCE(SUM(t.actual_hours), 0)                    AS total_actual_hours,

    -- 完成率（0~100 的小數，例如 75.5 表示完成 75.5%）
    CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(
            COUNT(*) FILTER (WHERE t.status = 'done')::NUMERIC
            / COUNT(*) * 100
        , 1)
    END                                                 AS completion_pct

FROM tasks t
WHERE t.deleted_at IS NULL
GROUP BY t.project_id;


-- ============================================================
-- VIEW 2：專案實際工時（從 time_entries 即時計算）
--
-- 說明：為什麼有兩個工時來源？
--   tasks.actual_hours：手動填入或程式匯總寫入，速度快
--   time_entries：計時器記錄，最準確但需要 JOIN 計算
-- ============================================================
CREATE OR REPLACE VIEW v_project_time_logged AS
SELECT
    t.project_id,

    -- 已記錄的總工時（分鐘轉小時）
    COALESCE(SUM(te.duration_minutes), 0) / 60.0       AS logged_hours,

    -- 推算出的總費用（時薪 × 工時）
    -- 假設平均時薪 1,000 元，正式版可改為 u.hourly_rate
    COALESCE(SUM(te.duration_minutes), 0) / 60.0 * 1000 AS estimated_cost,

    -- 有幾個人在這個專案上記錄了工時
    COUNT(DISTINCT te.user_id)                          AS contributor_count

FROM time_entries te
JOIN tasks t ON te.task_id = t.id
WHERE te.ended_at IS NOT NULL    -- 只算「已結束」的計時，不算進行中的
GROUP BY t.project_id;


-- ============================================================
-- VIEW 3：專案里程碑統計
-- ============================================================
CREATE OR REPLACE VIEW v_project_milestone_stats AS
SELECT
    m.project_id,
    COUNT(*)                                            AS total_milestones,
    COUNT(*) FILTER (WHERE m.is_achieved = true)        AS achieved_milestones,

    -- 下一個未達成里程碑的到期日（最近的那個）
    MIN(m.due_date) FILTER (WHERE m.is_achieved = false) AS next_milestone_date,

    -- 下一個里程碑距今幾天（負數 = 已逾期）
    (MIN(m.due_date) FILTER (WHERE m.is_achieved = false)) - CURRENT_DATE
                                                        AS days_to_next_milestone

FROM milestones m
GROUP BY m.project_id;


-- ============================================================
-- VIEW 4：主角！專案健康度綜合評估
--
-- 紅黃綠燈判斷邏輯：
--
--  🔴 紅燈（危險）——任一條件符合即觸發：
--    條件1：專案已逾期（end_date < 今天 且 狀態非完成/取消）
--    條件2：預算超支 > 10%（實際成本 > 預算 × 1.1）
--    條件3：逾期任務占比 > 30%（超過 3 成任務都逾期）
--
--  🟡 黃燈（注意）——紅燈條件都不符合，但以下任一觸發：
--    條件1：7 天內到期
--    條件2：預算使用率 > 80%
--    條件3：完成率 < 30% 且 已過了計畫時程的一半
--    條件4：有未達成里程碑且 3 天內到期
--
--  🟢 綠燈（正常）——以上都不符合
-- ============================================================
CREATE OR REPLACE VIEW v_project_health AS
SELECT
    -- ── 基本資訊 ──────────────────────────────────────────
    p.id                    AS project_id,
    p.company_id,
    p.name                  AS project_name,
    p.status,
    p.budget,
    p.start_date,
    p.end_date,
    u.name                  AS owner_name,
    u.email                 AS owner_email,
    u.avatar_url            AS owner_avatar,

    -- ── 任務統計 ──────────────────────────────────────────
    COALESCE(ts.total_tasks, 0)           AS total_tasks,
    COALESCE(ts.done_tasks, 0)            AS done_tasks,
    COALESCE(ts.in_progress_tasks, 0)     AS in_progress_tasks,
    COALESCE(ts.overdue_tasks, 0)         AS overdue_tasks,
    COALESCE(ts.completion_pct, 0)        AS completion_pct,
    COALESCE(ts.total_estimated_hours, 0) AS estimated_hours,

    -- ── 工時與成本 ────────────────────────────────────────
    COALESCE(pt.logged_hours, 0)          AS logged_hours,
    COALESCE(pt.estimated_cost, 0)        AS estimated_cost,

    -- 預算使用率（%）：實際費用 / 預算 × 100
    CASE
        WHEN p.budget IS NULL OR p.budget = 0 THEN NULL
        ELSE ROUND(
            COALESCE(pt.estimated_cost, 0) / p.budget::NUMERIC * 100
        , 1)
    END                                   AS budget_usage_pct,

    -- 預算剩餘金額
    CASE
        WHEN p.budget IS NULL THEN NULL
        ELSE p.budget - COALESCE(pt.estimated_cost, 0)
    END                                   AS budget_remaining,

    -- ── 時程資訊 ──────────────────────────────────────────
    -- 距截止日幾天（負數 = 已逾期幾天）
    (p.end_date - CURRENT_DATE)           AS days_to_deadline,

    -- 已逾期幾天（只在逾期時才有值，否則 0）
    GREATEST(CURRENT_DATE - p.end_date, 0) AS days_overdue,

    -- 時程進度（以日曆時間計算，非任務完成率）
    -- 例：計畫 100 天，已過 60 天 → 60%
    CASE
        WHEN p.start_date IS NULL OR p.end_date IS NULL THEN NULL
        WHEN p.end_date = p.start_date THEN 100
        ELSE ROUND(
            LEAST(
                (CURRENT_DATE - p.start_date)::NUMERIC
                / (p.end_date - p.start_date) * 100
            , 100)   -- 最多 100%，不顯示超過
        , 1)
    END                                   AS schedule_progress_pct,

    -- ── 里程碑資訊 ────────────────────────────────────────
    COALESCE(ms.total_milestones, 0)      AS total_milestones,
    COALESCE(ms.achieved_milestones, 0)   AS achieved_milestones,
    ms.next_milestone_date,
    ms.days_to_next_milestone,

    -- ── 🚦 紅黃綠燈判斷（核心邏輯）──────────────────────
    CASE

        -- ──────── 🔴 紅燈：危險 ────────────────────────
        -- 條件1：專案已逾期（end_date < 今天，且狀態不是完成/取消）
        WHEN p.end_date < CURRENT_DATE
         AND p.status NOT IN ('completed', 'cancelled')
            THEN 'red'

        -- 條件2：預算超支超過 10%
        WHEN p.budget > 0
         AND COALESCE(pt.estimated_cost, 0) > p.budget::NUMERIC * 1.1
            THEN 'red'

        -- 條件3：超過 30% 的任務都逾期（品質問題）
        WHEN ts.total_tasks > 0
         AND (ts.overdue_tasks::NUMERIC / ts.total_tasks) > 0.3
            THEN 'red'

        -- ──────── 🟡 黃燈：注意 ────────────────────────
        -- 條件1：7 天內截止，且尚未完成
        WHEN p.end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days')
         AND p.status NOT IN ('completed', 'cancelled')
            THEN 'yellow'

        -- 條件2：預算使用率超過 80%
        WHEN p.budget > 0
         AND COALESCE(pt.estimated_cost, 0) > p.budget::NUMERIC * 0.8
            THEN 'yellow'

        -- 條件3：時程過半但完成率不足 30%（進度嚴重落後）
        WHEN p.start_date IS NOT NULL AND p.end_date IS NOT NULL
         AND (CURRENT_DATE - p.start_date) > (p.end_date - p.start_date) / 2
         AND COALESCE(ts.completion_pct, 0) < 30
         AND p.status NOT IN ('completed', 'cancelled')
            THEN 'yellow'

        -- 條件4：有里程碑將在 3 天內到期且尚未達成
        WHEN ms.days_to_next_milestone BETWEEN 0 AND 3
            THEN 'yellow'

        -- ──────── 🟢 綠燈：正常 ────────────────────────
        ELSE 'green'

    END                                   AS health_status,

    -- ── 燈號說明文字（給前端 tooltip 用）────────────────
    CASE
        WHEN p.end_date < CURRENT_DATE
         AND p.status NOT IN ('completed', 'cancelled')
            THEN '專案已逾期 ' || (CURRENT_DATE - p.end_date) || ' 天'

        WHEN p.budget > 0
         AND COALESCE(pt.estimated_cost, 0) > p.budget::NUMERIC * 1.1
            THEN '預算超支 ' ||
                 ROUND((COALESCE(pt.estimated_cost, 0) / p.budget::NUMERIC - 1) * 100, 1)
                 || '%'

        WHEN ts.total_tasks > 0
         AND (ts.overdue_tasks::NUMERIC / ts.total_tasks) > 0.3
            THEN ts.overdue_tasks || ' 個任務逾期（占比 ' ||
                 ROUND(ts.overdue_tasks::NUMERIC / ts.total_tasks * 100, 0) || '%）'

        WHEN p.end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days')
         AND p.status NOT IN ('completed', 'cancelled')
            THEN '距截止日僅剩 ' || (p.end_date - CURRENT_DATE) || ' 天'

        WHEN p.budget > 0
         AND COALESCE(pt.estimated_cost, 0) > p.budget::NUMERIC * 0.8
            THEN '預算已使用 ' ||
                 ROUND(COALESCE(pt.estimated_cost, 0) / p.budget::NUMERIC * 100, 1) || '%'

        WHEN ms.days_to_next_milestone BETWEEN 0 AND 3
            THEN '里程碑「' || '（下個）' || '」' || ms.days_to_next_milestone || ' 天後到期'

        ELSE '進行正常'
    END                                   AS health_reason,

    p.created_at,
    p.updated_at

FROM projects p
LEFT JOIN users u                   ON p.owner_id = u.id
LEFT JOIN v_project_task_stats ts   ON ts.project_id = p.id
LEFT JOIN v_project_time_logged pt  ON pt.project_id = p.id
LEFT JOIN v_project_milestone_stats ms ON ms.project_id = p.id
WHERE p.deleted_at IS NULL;


-- ============================================================
-- VIEW 5：主管執行摘要（一個數字看全局）
--
-- 這個 VIEW 把所有專案彙總成一行，
-- 讓主管一眼看到「現在全公司有幾個紅燈？」
-- ============================================================
CREATE OR REPLACE VIEW v_executive_summary AS
SELECT
    company_id,

    -- 總專案數
    COUNT(*)                                                AS total_projects,

    -- 各燈號計數
    COUNT(*) FILTER (WHERE health_status = 'red')           AS red_projects,
    COUNT(*) FILTER (WHERE health_status = 'yellow')        AS yellow_projects,
    COUNT(*) FILTER (WHERE health_status = 'green')         AS green_projects,

    -- 活躍專案（排除已完成和取消的）
    COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled')) AS active_projects,

    -- 本月到期的專案
    COUNT(*) FILTER (
        WHERE end_date BETWEEN CURRENT_DATE
          AND DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day'
          AND status NOT IN ('completed', 'cancelled')
    )                                                       AS due_this_month,

    -- 全公司任務統計
    SUM(total_tasks)                                        AS total_tasks,
    SUM(done_tasks)                                         AS done_tasks,
    SUM(overdue_tasks)                                      AS total_overdue_tasks,

    -- 全公司整體完成率
    CASE
        WHEN SUM(total_tasks) = 0 THEN 0
        ELSE ROUND(SUM(done_tasks)::NUMERIC / SUM(total_tasks) * 100, 1)
    END                                                     AS overall_completion_pct,

    -- 全公司總預算 vs 實際花費
    SUM(budget)                                             AS total_budget,
    SUM(estimated_cost)                                     AS total_cost,

    -- 全公司總投入工時
    SUM(logged_hours)                                       AS total_logged_hours,

    NOW()                                                   AS calculated_at

FROM v_project_health
GROUP BY company_id;


-- ============================================================
-- VIEW 6：人力負載分析（未來 14 天每人工時）
--
-- 用途：熱力圖的資料來源
-- 邏輯：找出未來 14 天每個人被分派的「估計工時 / 任務天數」
-- ============================================================
CREATE OR REPLACE VIEW v_workload_14days AS
WITH
-- 產生未來 14 天的日期序列（generate_series 是 PostgreSQL 的特殊函數）
date_series AS (
    SELECT generate_series(
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '13 days',
        INTERVAL '1 day'
    )::DATE AS work_date
),

-- 找出未來 14 天內截止的任務
upcoming_tasks AS (
    SELECT
        t.id          AS task_id,
        t.assignee_id AS user_id,
        t.project_id,
        t.title,
        t.priority,
        t.status,
        t.estimated_hours,
        -- 如果任務已有開始時間用開始時間，否則用今天
        COALESCE(t.started_at::DATE, CURRENT_DATE) AS task_start,
        -- 如果任務有截止日用截止日，否則用 14 天後
        COALESCE(t.due_date, CURRENT_DATE + INTERVAL '14 days')::DATE AS task_end
    FROM tasks t
    WHERE t.assignee_id IS NOT NULL
      AND t.deleted_at IS NULL
      AND t.status NOT IN ('done')
      AND COALESCE(t.due_date, CURRENT_DATE + INTERVAL '14 days') >= CURRENT_DATE
      AND COALESCE(t.started_at::DATE, CURRENT_DATE) <= CURRENT_DATE + INTERVAL '13 days'
)

-- 計算每天每人的工時
SELECT
    d.work_date,
    u.id             AS user_id,
    u.name           AS user_name,
    u.avatar_url,
    u.role,

    -- 計算這一天這個人有幾個任務
    COUNT(ut.task_id)                                       AS task_count,

    -- 估計這天的工時
    -- 邏輯：把任務的估計工時平均分散到任務的每一天
    -- 例：40小時的任務跑 5 天 → 每天 8 小時
    COALESCE(SUM(
        ut.estimated_hours::NUMERIC
        / GREATEST(ut.task_end - ut.task_start + 1, 1)
    ), 0)                                                   AS estimated_daily_hours,

    -- 負載狀態（依每天工時判斷）
    CASE
        WHEN COALESCE(SUM(
            ut.estimated_hours::NUMERIC
            / GREATEST(ut.task_end - ut.task_start + 1, 1)
        ), 0) > 8  THEN 'overloaded'   -- 超過 8 小時：過載（紅色）
        WHEN COALESCE(SUM(
            ut.estimated_hours::NUMERIC
            / GREATEST(ut.task_end - ut.task_start + 1, 1)
        ), 0) > 0  THEN 'normal'       -- 有排工時：正常（綠色）
        ELSE 'idle'                    -- 沒有排任何工時：空閒（灰色）
    END                                                     AS load_status

FROM date_series d
CROSS JOIN users u     -- 每個日期 × 每個使用者（笛卡兒積）
LEFT JOIN upcoming_tasks ut
    ON ut.user_id = u.id
    AND d.work_date BETWEEN ut.task_start AND ut.task_end
WHERE u.is_active = true
GROUP BY d.work_date, u.id, u.name, u.avatar_url, u.role
ORDER BY d.work_date, u.name;


-- ============================================================
-- 驗證查詢範例
-- ============================================================

-- 查看所有專案健康狀態（你剛插入的測試資料）：
-- SELECT project_id, project_name, status, completion_pct,
--        days_to_deadline, budget_usage_pct, health_status, health_reason
-- FROM v_project_health
-- WHERE company_id = 1
-- ORDER BY health_status, days_to_deadline;

-- 查看全公司執行摘要：
-- SELECT * FROM v_executive_summary WHERE company_id = 1;

-- 查看未來 14 天人力負載：
-- SELECT work_date, user_name, estimated_daily_hours, load_status
-- FROM v_workload_14days
-- WHERE work_date <= CURRENT_DATE + INTERVAL '6 days'  -- 先看一週
-- ORDER BY work_date, user_name;

-- 本週優先行動清單（給主管的建議）：
-- SELECT
--   project_name,
--   health_status,
--   health_reason,
--   days_to_deadline,
--   overdue_tasks,
--   completion_pct
-- FROM v_project_health
-- WHERE company_id = 1
--   AND health_status IN ('red', 'yellow')
-- ORDER BY
--   CASE health_status WHEN 'red' THEN 1 WHEN 'yellow' THEN 2 END,
--   days_to_deadline;
