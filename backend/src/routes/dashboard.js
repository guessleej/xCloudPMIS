/**
 * 主管決策儀表板 API 路由
 *
 * 端點清單：
 *   GET /api/dashboard/executive-summary   全公司執行摘要（紅黃綠燈數量）
 *   GET /api/dashboard/projects-health     各專案健康狀態列表
 *   GET /api/dashboard/workload            未來 14 天人力負載
 *   GET /api/dashboard/actionable-insights 本週優先行動建議
 */

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ────────────────────────────────────────────────────────────
// 小工具：統一的成功回應格式
// ────────────────────────────────────────────────────────────
const ok = (res, data, meta = {}) =>
  res.json({ success: true, data, meta, timestamp: new Date().toISOString() });

const fail = (res, message, status = 500) =>
  res.status(status).json({ success: false, error: message });

// ────────────────────────────────────────────────────────────
// 取得 companyId（暫時從查詢參數取，之後換成身分驗證令牌）
// 例：GET /api/dashboard/... ?companyId=2
// ────────────────────────────────────────────────────────────
const getCompanyId = (req) => {
  const id = parseInt(req.query.companyId || '1', 10);
  return isNaN(id) ? 1 : id;
};


// ════════════════════════════════════════════════════════════
// GET /api/dashboard/executive-summary
//
// 全公司執行摘要：一個請求取得所有關鍵數字
// 前端用這個渲染首頁的「數字卡片」和「圓餅圖」
// ════════════════════════════════════════════════════════════
router.get('/executive-summary', async (req, res) => {
  try {
    const companyId = getCompanyId(req);

    // 從 VIEW 查詢（我們在 dashboard_views.sql 建立的）
    const [summary] = await prisma.$queryRaw`
      SELECT
        total_projects,
        red_projects,
        yellow_projects,
        green_projects,
        active_projects,
        due_this_month,
        total_tasks,
        done_tasks,
        total_overdue_tasks,
        overall_completion_pct,
        total_budget,
        total_cost,
        total_logged_hours,
        calculated_at
      FROM v_executive_summary
      WHERE company_id = ${companyId}
    `;

    // Prisma $queryRaw 回傳的數字是 BigInt 或 Decimal，需要轉換
    // 這個函數把所有 BigInt 和 Decimal 轉成 JavaScript 的數值型別
    const normalize = (obj) =>
      Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [
          k,
          typeof v === 'bigint' ? Number(v)
          : v?.constructor?.name === 'Decimal' ? parseFloat(v.toString())
          : v
        ])
      );

    ok(res, normalize(summary || {}));

  } catch (err) {
    console.error('[dashboard] executive-summary 錯誤:', err);
    fail(res, '載入執行摘要失敗');
  }
});


// ════════════════════════════════════════════════════════════
// GET /api/dashboard/projects-health
//
// 各專案健康狀態：給圓餅圖點擊後的詳細列表用
// 支援 ?status=red（紅）|yellow（黃）|green（綠）篩選
// ════════════════════════════════════════════════════════════
router.get('/projects-health', async (req, res) => {
  try {
    const companyId    = getCompanyId(req);
    const statusFilter = req.query.status; // 選填：red / yellow / green

    const rows = await prisma.$queryRaw`
      SELECT
        project_id,
        project_name,
        status,
        owner_name,
        owner_avatar,
        total_tasks,
        done_tasks,
        in_progress_tasks,
        overdue_tasks,
        completion_pct,
        estimated_hours,
        logged_hours,
        estimated_cost,
        budget,
        budget_usage_pct,
        budget_remaining,
        days_to_deadline,
        days_overdue,
        schedule_progress_pct,
        total_milestones,
        achieved_milestones,
        next_milestone_date,
        days_to_next_milestone,
        health_status,
        health_reason
      FROM v_project_health
      WHERE company_id = ${companyId}
        AND (${statusFilter}::TEXT IS NULL OR health_status = ${statusFilter}::TEXT)
      ORDER BY
        CASE health_status
          WHEN 'red'    THEN 1
          WHEN 'yellow' THEN 2
          WHEN 'green'  THEN 3
        END,
        days_to_deadline ASC NULLS LAST
    `;

    // 轉換大整數（BigInt）和小數（Decimal）型別
    const projects = rows.map(row =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [
          k,
          typeof v === 'bigint' ? Number(v)
          : v?.constructor?.name === 'Decimal' ? parseFloat(v.toString())
          : v instanceof Date ? v.toISOString()
          : v
        ])
      )
    );

    ok(res, projects, { total: projects.length, filter: statusFilter || 'all' });

  } catch (err) {
    console.error('[dashboard] projects-health 錯誤:', err);
    fail(res, '載入專案健康狀態失敗');
  }
});


// ════════════════════════════════════════════════════════════
// GET /api/dashboard/workload
//
// 未來 14 天人力負載熱力圖資料
// 回傳格式：{ dates（日期列表）: [...], users（成員列表）: [...], matrix（負載矩陣）: [[...]] }
// 前端用此資料繪製熱力圖
// ════════════════════════════════════════════════════════════
router.get('/workload', async (req, res) => {
  try {
    const companyId = getCompanyId(req);

    const rows = await prisma.$queryRaw`
      SELECT
        w.work_date,
        w.user_id,
        w.user_name,
        w.avatar_url,
        w.role,
        w.task_count,
        ROUND(w.estimated_daily_hours::NUMERIC, 2) AS daily_hours,
        w.load_status
      FROM v_workload_14days w
      JOIN users u ON u.id = w.user_id
      WHERE u.company_id = ${companyId}
      ORDER BY w.work_date, w.user_name
    `;

    // 整理成前端熱力圖容易使用的格式
    const datesSet  = new Set();
    const usersMap  = new Map();

    rows.forEach(row => {
      const date = row.work_date instanceof Date
        ? row.work_date.toISOString().split('T')[0]
        : String(row.work_date).split('T')[0];

      datesSet.add(date);

      if (!usersMap.has(row.user_id)) {
        usersMap.set(row.user_id, {
          userId:    Number(row.user_id),
          userName:  row.user_name,
          avatarUrl: row.avatar_url,
          role:      row.role,
          days:      {},
        });
      }

      usersMap.get(row.user_id).days[date] = {
        hours:      parseFloat(row.daily_hours || 0),
        taskCount:  Number(row.task_count || 0),
        loadStatus: row.load_status,
      };
    });

    const dates = Array.from(datesSet).sort();
    const users = Array.from(usersMap.values());

    ok(res, { dates, users });

  } catch (err) {
    console.error('[dashboard] workload 錯誤:', err);
    fail(res, '載入人力負載資料失敗');
  }
});


// ════════════════════════════════════════════════════════════
// GET /api/dashboard/actionable-insights
//
// 本週優先行動建議（主管儀表板最重要的功能）
//
// 什麼是即時行動建議？
//   不是單純的資料，而是具體「建議」：
//   「A 專案已逾期 3 天，建議安排緊急會議」
//   「B 成員本週工時預估超載，建議重新分配」
//   「C 里程碑將在 3 天後到期，目前進度僅 60%」
// ════════════════════════════════════════════════════════════
router.get('/actionable-insights', async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const insights  = [];

    // ── 查詢所有紅燈和黃燈專案 ───────────────────────────
    const projects = await prisma.$queryRaw`
      SELECT project_id, project_name, status, health_status, health_reason,
             days_overdue, days_to_deadline, completion_pct,
             budget_usage_pct, overdue_tasks, total_tasks,
             days_to_next_milestone, next_milestone_date,
             schedule_progress_pct, owner_name
      FROM v_project_health
      WHERE company_id = ${companyId}
        AND health_status IN ('red', 'yellow')
        AND status NOT IN ('completed', 'cancelled')
    `;

    // ── 查詢本週工時超載的成員 ──────────────────────────
    const overloadedUsers = await prisma.$queryRaw`
      SELECT
        w.user_id,
        w.user_name,
        SUM(w.estimated_daily_hours) AS week_hours,
        COUNT(*) FILTER (WHERE w.load_status = 'overloaded') AS overloaded_days
      FROM v_workload_14days w
      JOIN users u ON u.id = w.user_id
      WHERE u.company_id = ${companyId}
        AND w.work_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '6 days'
      GROUP BY w.user_id, w.user_name
      HAVING SUM(w.estimated_daily_hours) > 40  -- 本週超過 40 小時
      ORDER BY week_hours DESC
    `;

    // ── 產生專案相關的行動建議 ──────────────────────────
    for (const p of projects) {
      const daysOverdue      = Number(p.days_overdue || 0);
      const daysToDeadline   = Number(p.days_to_deadline || 999);
      const completionPct    = parseFloat(p.completion_pct || 0);
      const budgetUsagePct   = parseFloat(p.budget_usage_pct || 0);
      const daysToMilestone  = Number(p.days_to_next_milestone ?? 999);
      const schedProgress    = parseFloat(p.schedule_progress_pct || 0);

      // 🔴 已逾期
      if (p.health_status === 'red' && daysOverdue > 0) {
        insights.push({
          id:       `overdue-${p.project_id}`,
          type:     'danger',             // 危險
          icon:     '🚨',
          priority: 1,
          project:  { id: Number(p.project_id), name: p.project_name },
          title:    `《${p.project_name}》已逾期 ${daysOverdue} 天`,
          message:  `專案原定截止日已過，建議立即與 ${p.owner_name || 'PM'} 安排緊急會議，重新評估時程。`,
          action:   '安排緊急會議',
          actionUrl: `/projects/${p.project_id}`,
        });
      }

      // 🔴 預算超支
      if (budgetUsagePct > 110) {
        insights.push({
          id:       `budget-${p.project_id}`,
          type:     'danger',
          icon:     '💸',
          priority: 1,
          project:  { id: Number(p.project_id), name: p.project_name },
          title:    `《${p.project_name}》預算超支 ${Math.round(budgetUsagePct - 100)}%`,
          message:  `實際花費已超過預算上限，需要立即審查費用並決定是否申請追加預算。`,
          action:   '查看財務明細',
          actionUrl: `/projects/${p.project_id}/budget`,
        });
      }

      // 🟡 7 天內截止但進度落後
      if (daysToDeadline >= 0 && daysToDeadline <= 7 && completionPct < 80) {
        insights.push({
          id:       `deadline-${p.project_id}`,
          type:     'warning',            // 注意
          icon:     '⏰',
          priority: 2,
          project:  { id: Number(p.project_id), name: p.project_name },
          title:    `《${p.project_name}》${daysToDeadline} 天後截止，完成率僅 ${completionPct}%`,
          message:  `目前完成率與預期有落差，建議檢視剩餘任務是否可在期限內完成，或與客戶溝通調整時程。`,
          action:   '查看任務進度',
          actionUrl: `/projects/${p.project_id}/tasks`,
        });
      }

      // 🟡 里程碑即將到期
      if (daysToMilestone >= 0 && daysToMilestone <= 3) {
        insights.push({
          id:       `milestone-${p.project_id}`,
          type:     'warning',
          icon:     '🎯',
          priority: 2,
          project:  { id: Number(p.project_id), name: p.project_name },
          title:    `《${p.project_name}》里程碑將在 ${daysToMilestone} 天後到期`,
          message:  `目前專案完成率 ${completionPct}%，請確認里程碑達成標準是否已滿足。`,
          action:   '查看里程碑',
          actionUrl: `/projects/${p.project_id}/milestones`,
        });
      }

      // 🟡 進度嚴重落後（時程過半但完成率不到 30%）
      if (schedProgress > 50 && completionPct < 30 && p.status === 'active') {
        insights.push({
          id:       `behind-schedule-${p.project_id}`,
          type:     'warning',
          icon:     '📉',
          priority: 3,
          project:  { id: Number(p.project_id), name: p.project_name },
          title:    `《${p.project_name}》進度嚴重落後`,
          message:  `計畫時程已過 ${Math.round(schedProgress)}%，但任務完成率只有 ${completionPct}%，建議重新分配資源或縮減範疇。`,
          action:   '重新規劃時程',
          actionUrl: `/projects/${p.project_id}`,
        });
      }
    }

    // ── 產生人力超載建議 ────────────────────────────────
    for (const user of overloadedUsers) {
      const weekHours     = parseFloat(user.week_hours || 0).toFixed(0);
      const overloadDays  = Number(user.overloaded_days || 0);
      insights.push({
        id:       `overload-${user.user_id}`,
        type:     'info',               // 資訊
        icon:     '👤',
        priority: 3,
        project:  null,
        title:    `${user.user_name} 本週工時預估超載`,
        message:  `本週預估工時約 ${weekHours} 小時（其中 ${overloadDays} 天超過 8 小時），建議重新分配部分任務給其他成員，避免品質下降。`,
        action:   '查看工時分配',
        actionUrl: `/team/workload?userId=${user.user_id}`,
      });
    }

    // 依優先級排序，最重要的排最前面
    insights.sort((a, b) => a.priority - b.priority);

    ok(res, insights, {
      total:   insights.length,
      danger:  insights.filter(i => i.type === 'danger').length,
      warning: insights.filter(i => i.type === 'warning').length,
      info:    insights.filter(i => i.type === 'info').length,
    });

  } catch (err) {
    console.error('[dashboard] actionable-insights 錯誤:', err);
    fail(res, '載入行動建議失敗');
  }
});


module.exports = router;
