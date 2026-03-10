'use strict';
/**
 * src/routes/aiDecisions.js
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS — AI 決策中心 REST API
 *
 * 提供前端「AI 決策中心」頁面所需的所有端點：
 *   GET  /api/ai/decisions          — 分頁列出 AI 決策記錄
 *   GET  /api/ai/decisions/stats    — 統計數字（儀表板卡片用）
 *   GET  /api/ai/decisions/:id      — 取得單一決策完整資訊（含 Logs）
 *   POST /api/ai/decisions/:id/approve — 批准 Staging 決策
 *   POST /api/ai/decisions/:id/reject  — 拒絕 Staging 決策
 *   POST /api/ai/decisions/:id/rollback — 回滾已執行決策
 *   POST /api/ai/agent/run          — 手動觸發 Agent Loop（立即執行一次）
 *
 * 設計原則：
 *   - Human-in-the-Loop：L2+ 風險等級需人類批准才執行
 *   - 完整審計軌跡：所有操作記錄到 AiAgentLog
 *   - 可回滾：批准前會有 snapshotData 備份
 */

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['error'] });

// ── 統一回應格式 ──────────────────────────────────────────────
const ok  = (res, data, meta = {}) =>
  res.json({ success: true, data, meta, timestamp: new Date().toISOString() });

const fail = (res, message, status = 500) =>
  res.status(status).json({ success: false, error: message });

// ── 決策狀態中文對照 ──────────────────────────────────────────
const STATUS_LABEL = {
  pending:     '待執行',
  staging:     '待批准',
  approved:    '已批准',
  executing:   '執行中',
  completed:   '已完成',
  rejected:    '已拒絕',
  rolled_back: '已回滾',
  failed:      '失敗',
};

// ── 風險等級標籤 ───────────────────────────────────────────────
const RISK_LABEL = {
  1: { label: 'L1 自動執行', color: 'green'  },
  2: { label: 'L2 需批准',   color: 'yellow' },
  3: { label: 'L3 人工審查', color: 'orange' },
  4: { label: 'L4 禁止',     color: 'red'    },
};

// ── Agent 類型中文對照 ─────────────────────────────────────────
const AGENT_LABEL = {
  scheduler:     '排程代理',
  risk:          '風險代理',
  communication: '溝通代理',
  quality:       '品質代理',
  main:          '主代理',
};

/**
 * ──────────────────────────────────────────────────────────────
 * GET /api/ai/decisions/stats
 * 統計數字（Dashboard 卡片用）
 * ──────────────────────────────────────────────────────────────
 */
router.get('/decisions/stats', async (req, res) => {
  try {
    const companyId = req.query.companyId ? parseInt(req.query.companyId) : null;

    // 取得今日時間範圍
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 基礎 where 條件（含公司篩選）
    const baseWhere = companyId
      ? { project: { companyId } }
      : {};

    // 平行取得所有統計
    const [
      stagingCount,
      completedToday,
      rolledBackTotal,
      failedTotal,
      riskBreakdown,
      recentActivity,
    ] = await Promise.all([
      // 待批准數量
      prisma.aiDecision.count({
        where: { ...baseWhere, status: 'staging' },
      }),

      // 今日自動完成數
      prisma.aiDecision.count({
        where: {
          ...baseWhere,
          status: 'completed',
          createdAt: { gte: today, lt: tomorrow },
        },
      }),

      // 歷史回滾次數
      prisma.aiDecision.count({
        where: { ...baseWhere, status: 'rolled_back' },
      }),

      // 失敗次數
      prisma.aiDecision.count({
        where: { ...baseWhere, status: 'failed' },
      }),

      // 依風險等級分組統計
      prisma.aiDecision.groupBy({
        by: ['riskLevel'],
        where: baseWhere,
        _count: true,
        orderBy: { riskLevel: 'asc' },
      }),

      // 最後 7 天每日執行數
      prisma.$queryRaw`
        SELECT
          DATE(created_at) AS date,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'staging')   AS staging
        FROM ai_decisions
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,
    ]);

    ok(res, {
      stagingCount,
      completedToday,
      rolledBackTotal,
      failedTotal,
      riskBreakdown: riskBreakdown.map(r => ({
        riskLevel: r.riskLevel,
        label:     RISK_LABEL[r.riskLevel]?.label || `L${r.riskLevel}`,
        color:     RISK_LABEL[r.riskLevel]?.color || 'gray',
        count:     r._count,
      })),
      recentActivity: recentActivity.map(row => ({
        date:      row.date,
        total:     Number(row.total),
        completed: Number(row.completed),
        staging:   Number(row.staging),
      })),
    });
  } catch (e) {
    console.error('[AI Decisions] stats error:', e);
    fail(res, e.message);
  }
});

/**
 * ──────────────────────────────────────────────────────────────
 * GET /api/ai/decisions
 * 分頁列出 AI 決策記錄
 *
 * Query params:
 *   companyId   — 篩選公司（可選）
 *   status      — 篩選狀態（可選，逗號分隔多值）
 *   agentType   — 篩選 Agent 類型（可選）
 *   riskLevel   — 篩選風險等級 1-4（可選）
 *   page        — 頁碼（預設 1）
 *   limit       — 每頁筆數（預設 20，最大 100）
 * ──────────────────────────────────────────────────────────────
 */
router.get('/decisions', async (req, res) => {
  try {
    const {
      companyId,
      status,
      agentType,
      riskLevel,
      page  = '1',
      limit = '20',
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    // 建立 where 條件
    const where = {};

    if (companyId) {
      where.project = { companyId: parseInt(companyId) };
    }

    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      where.status = { in: statuses };
    }

    if (agentType) {
      where.agentType = agentType;
    }

    if (riskLevel) {
      where.riskLevel = parseInt(riskLevel);
    }

    const [decisions, total] = await Promise.all([
      prisma.aiDecision.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        include: {
          project: {
            select: { id: true, name: true },
          },
          task: {
            select: { id: true, title: true },
          },
          _count: {
            select: { logs: true },
          },
        },
      }),
      prisma.aiDecision.count({ where }),
    ]);

    ok(res, decisions.map(d => formatDecision(d)), {
      total,
      page:     pageNum,
      limit:    limitNum,
      pages:    Math.ceil(total / limitNum),
    });
  } catch (e) {
    console.error('[AI Decisions] list error:', e);
    fail(res, e.message);
  }
});

/**
 * ──────────────────────────────────────────────────────────────
 * GET /api/ai/decisions/:id
 * 取得單一決策完整資訊（含 Chain of Thought + Logs）
 * ──────────────────────────────────────────────────────────────
 */
router.get('/decisions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return fail(res, '無效的 ID', 400);

    const decision = await prisma.aiDecision.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        task:    { select: { id: true, title: true } },
        logs: {
          orderBy: { executedAt: 'asc' },
        },
      },
    });

    if (!decision) return fail(res, '找不到此決策記錄', 404);

    ok(res, {
      ...formatDecision(decision),
      // 完整欄位（列表只顯示摘要）
      observations: decision.observations,
      reasoning:    decision.reasoning,
      plan:         decision.plan,
      actions:      decision.actions,
      reflection:   decision.reflection,
      snapshotData: decision.snapshotData,
      logs: decision.logs.map(log => ({
        id:           log.id,
        toolName:     log.toolName,
        toolInput:    log.toolInput,
        toolOutput:   log.toolOutput,
        success:      log.success,
        errorMessage: log.errorMessage,
        executedAt:   log.executedAt,
        durationMs:   log.durationMs,
      })),
    });
  } catch (e) {
    console.error('[AI Decisions] get detail error:', e);
    fail(res, e.message);
  }
});

/**
 * ──────────────────────────────────────────────────────────────
 * POST /api/ai/decisions/:id/approve
 * 批准 Staging 決策（觸發執行）
 *
 * Body: { userId: number, note?: string }
 * ──────────────────────────────────────────────────────────────
 */
router.post('/decisions/:id/approve', async (req, res) => {
  try {
    const id     = parseInt(req.params.id);
    const userId = parseInt(req.body.userId || 0);

    if (isNaN(id)) return fail(res, '無效的 ID', 400);
    if (!userId)  return fail(res, '必須提供 userId', 400);

    const decision = await prisma.aiDecision.findUnique({ where: { id } });
    if (!decision)          return fail(res, '找不到此決策記錄', 404);
    if (decision.status !== 'staging')
      return fail(res, `此決策狀態為 ${STATUS_LABEL[decision.status]}，無法批准`, 409);

    // 呼叫 SafetyGuard 的批准流程
    const SafetyGuard = require('../../services/autonomous-agent/decisionEngine/safetyGuard');
    const result = await SafetyGuard.approveAction(id, userId);

    ok(res, {
      id,
      status:    result.status,
      message:   `決策 #${id} 已批准，執行中⋯`,
    });
  } catch (e) {
    console.error('[AI Decisions] approve error:', e);
    fail(res, e.message);
  }
});

/**
 * ──────────────────────────────────────────────────────────────
 * POST /api/ai/decisions/:id/reject
 * 拒絕 Staging 決策
 *
 * Body: { userId: number, note: string }
 * ──────────────────────────────────────────────────────────────
 */
router.post('/decisions/:id/reject', async (req, res) => {
  try {
    const id   = parseInt(req.params.id);
    const { userId, note } = req.body;

    if (isNaN(id))   return fail(res, '無效的 ID', 400);
    if (!userId)     return fail(res, '必須提供 userId', 400);
    if (!note?.trim()) return fail(res, '必須提供拒絕原因 note', 400);

    const decision = await prisma.aiDecision.findUnique({ where: { id } });
    if (!decision)          return fail(res, '找不到此決策記錄', 404);
    if (!['staging', 'pending'].includes(decision.status))
      return fail(res, `此決策狀態為 ${STATUS_LABEL[decision.status]}，無法拒絕`, 409);

    const SafetyGuard = require('../../services/autonomous-agent/decisionEngine/safetyGuard');
    await SafetyGuard.rejectAction(id, parseInt(userId), note.trim());

    ok(res, {
      id,
      status:  'rejected',
      message: `決策 #${id} 已拒絕`,
    });
  } catch (e) {
    console.error('[AI Decisions] reject error:', e);
    fail(res, e.message);
  }
});

/**
 * ──────────────────────────────────────────────────────────────
 * POST /api/ai/decisions/:id/rollback
 * 回滾已完成的決策（恢復執行前快照）
 *
 * Body: { userId: number, reason?: string }
 * ──────────────────────────────────────────────────────────────
 */
router.post('/decisions/:id/rollback', async (req, res) => {
  try {
    const id     = parseInt(req.params.id);
    const userId = parseInt(req.body.userId || 0);

    if (isNaN(id)) return fail(res, '無效的 ID', 400);
    if (!userId)  return fail(res, '必須提供 userId', 400);

    const decision = await prisma.aiDecision.findUnique({ where: { id } });
    if (!decision)         return fail(res, '找不到此決策記錄', 404);
    if (decision.status !== 'completed')
      return fail(res, `只有已完成的決策才可回滾（目前狀態：${STATUS_LABEL[decision.status]}）`, 409);
    if (!decision.snapshotData)
      return fail(res, '此決策無快照資料，無法回滾', 422);

    const SafetyGuard = require('../../services/autonomous-agent/decisionEngine/safetyGuard');
    await SafetyGuard.rollback(id, userId);

    ok(res, {
      id,
      status:  'rolled_back',
      message: `決策 #${id} 已回滾至執行前狀態`,
    });
  } catch (e) {
    console.error('[AI Decisions] rollback error:', e);
    fail(res, e.message);
  }
});

/**
 * ──────────────────────────────────────────────────────────────
 * POST /api/ai/agent/run
 * 手動觸發 Agent Loop（立即執行一次，不等排程）
 *
 * Body: { companyId?: number, dryRun?: boolean }
 * ──────────────────────────────────────────────────────────────
 */
router.post('/agent/run', async (req, res) => {
  try {
    const { companyId, dryRun = false } = req.body;

    // 非同步執行 Agent Loop（不阻塞 HTTP 回應）
    // Agent Loop 是長時間操作，立即回應 202 Accepted
    res.status(202).json({
      success:   true,
      message:   dryRun
        ? 'AI Agent 分析模式已啟動（DryRun，不執行實際操作）'
        : 'AI Agent Loop 已觸發，正在背景分析⋯',
      companyId: companyId || '全公司',
      dryRun,
      timestamp: new Date().toISOString(),
    });

    // 背景執行（使用子進程避免阻塞主進程）
    const { fork } = require('child_process');
    const path = require('path');
    const agentPath = path.join(__dirname, '../../services/autonomous-agent/core/agentLoop.js');

    const env = { ...process.env };
    if (companyId) env.AGENT_COMPANY_ID = String(companyId);
    if (dryRun)    env.AGENT_DRY_RUN = 'true';

    const child = fork(agentPath, ['--run-now'], {
      env,
      detached: true,
      stdio:    'ignore',
    });
    child.unref();

  } catch (e) {
    console.error('[AI Decisions] agent run error:', e);
    fail(res, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// 工具函式
// ════════════════════════════════════════════════════════════

/** 格式化決策記錄（列表摘要版）*/
function formatDecision(d) {
  return {
    id:           d.id,
    sessionId:    d.sessionId,
    agentType:    d.agentType,
    agentLabel:   AGENT_LABEL[d.agentType] || d.agentType,
    decisionType: d.decisionType,
    status:       d.status,
    statusLabel:  STATUS_LABEL[d.status] || d.status,
    riskLevel:    d.riskLevel,
    riskLabel:    RISK_LABEL[d.riskLevel]?.label  || `L${d.riskLevel}`,
    riskColor:    RISK_LABEL[d.riskLevel]?.color  || 'gray',
    project:      d.project  || null,
    task:         d.task     || null,
    logCount:     d._count?.logs ?? 0,
    approvedBy:   d.approvedBy  || null,
    rejectedBy:   d.rejectedBy  || null,
    rolledBackBy: d.rolledBackBy || null,
    executedAt:   d.executedAt  || null,
    createdAt:    d.createdAt,
    updatedAt:    d.updatedAt,
  };
}

module.exports = router;
