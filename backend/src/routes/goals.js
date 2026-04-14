/**
 * Goals API — OKR 目標與關鍵結果
 *
 * 資料儲存：Prisma + PostgreSQL（Goal / KeyResult 兩張資料表）
 * 取代原 /tmp/pmis-goals-{companyId}.json 輕量儲存，解決：
 *   - Docker 重啟資料清空問題
 *   - 並發寫入競態問題
 *   - 無備份機制問題
 *
 * GET    /api/goals?companyId=N&quarter=&year=
 * POST   /api/goals                  建立 Objective
 * GET    /api/goals/:id              取得單一 OKR（含 KR）
 * PATCH  /api/goals/:id              更新 Objective
 * DELETE /api/goals/:id              刪除 Objective（子目標升格，KR 連鎖刪除）
 *
 * POST   /api/goals/:id/key-results            新增 KR
 * PATCH  /api/goals/:id/key-results/:krId      更新 KR（含 currentValue）
 * DELETE /api/goals/:id/key-results/:krId      刪除 KR
 */

const express = require('express');
const router  = express.Router();
const prisma  = require('../lib/prisma');

// ── 工具函式 ─────────────────────────────────────────────────
const ok  = (res, data)         => res.json({ success: true, data, timestamp: new Date().toISOString() });
const err = (res, msg, s = 400) => res.status(s).json({ success: false, error: msg });

/** 計算 OKR 整體進度（各 KR 達成率平均值） */
function calcProgress(keyResults) {
  if (!keyResults || keyResults.length === 0) return 0;
  const sum = keyResults.reduce((s, kr) => {
    const p = kr.targetValue > 0
      ? Math.min(100, Math.round((kr.currentValue / kr.targetValue) * 100))
      : 0;
    return s + p;
  }, 0);
  return Math.round(sum / keyResults.length);
}

/**
 * 統一格式化 Goal 回傳物件
 * 確保前端收到的欄位與舊版 JSON 儲存時完全相同
 */
function formatGoal(g) {
  const krs = (g.keyResults || []).map(kr => ({
    id:           kr.id,
    title:        kr.title,
    unit:         kr.unit,
    targetValue:  kr.targetValue,
    currentValue: kr.currentValue,
    status:       kr.status,
  }));
  return {
    id:          g.id,
    companyId:   g.companyId,
    title:       g.title,
    description: g.description || '',
    quarter:     g.quarter,
    year:        g.year,
    status:      g.status,
    owner:       g.owner || '',
    parentId:    g.parentId ?? null,
    createdAt:   g.createdAt.toISOString(),
    updatedAt:   g.updatedAt.toISOString(),
    keyResults:  krs,
    progress:    calcProgress(krs),
  };
}



// ════════════════════════════════════════════════════════════
// GET /api/goals?companyId=N[&quarter=Q1&year=2024&status=active]
// 取得全部目標（前端做 client-side 篩選；server-side 篩選為選填）
// ════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  const companyId = parseInt(req.query.companyId, 10);
  if (!companyId) return err(res, 'companyId 為必填');

  try {
    // 選用的伺服器端篩選（前端通常不傳這些參數，靠 client-side 過濾）
    const where = { companyId };
    if (req.query.quarter) where.quarter = req.query.quarter;
    if (req.query.year)    where.year    = parseInt(req.query.year, 10);
    if (req.query.status)  where.status  = req.query.status;

    const goals = await prisma.goal.findMany({
      where,
      include: { keyResults: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
      orderBy: { createdAt: 'asc' },
    });

    const result      = goals.map(formatGoal);
    const total       = result.length;
    const active      = result.filter(g => g.status === 'active').length;
    const completed   = result.filter(g => g.status === 'completed').length;
    const avgProgress = total > 0
      ? Math.round(result.reduce((s, g) => s + g.progress, 0) / total)
      : 0;

    ok(res, { goals: result, meta: { total, active, completed, avgProgress } });
  } catch (e) {
    console.error('[goals GET /]', e.message);
    err(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/goals — 建立 Objective
// ════════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  const { companyId, title, description, quarter, year, owner, status = 'active', parentId } = req.body;
  if (!companyId || !title) return err(res, 'companyId, title 為必填');

  try {
    const goal = await prisma.goal.create({
      data: {
        companyId: parseInt(companyId, 10),
        title:     String(title).trim(),
        description: description || null,
        quarter:   quarter   || `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`,
        year:      parseInt(year, 10) || new Date().getFullYear(),
        status,
        owner:     owner || null,
        parentId:  parentId ? parseInt(parentId, 10) : null,
      },
      include: { keyResults: true },
    });
    ok(res, formatGoal(goal));
  } catch (e) {
    console.error('[goals POST /]', e.message);
    err(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/goals/:id — 取得單一目標（含 KR）
// ════════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return err(res, '無效的目標 ID');

  try {
    const goal = await prisma.goal.findUnique({
      where:   { id },
      include: { keyResults: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
    });
    if (!goal) return err(res, '找不到目標', 404);
    ok(res, formatGoal(goal));
  } catch (e) {
    console.error('[goals GET /:id]', e.message);
    err(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════
// PATCH /api/goals/:id — 更新 Objective
// ════════════════════════════════════════════════════════════
router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return err(res, '無效的目標 ID');

  const { title, description, quarter, year, status, owner, parentId } = req.body;

  try {
    // 確認目標存在
    const existing = await prisma.goal.findUnique({ where: { id } });
    if (!existing) return err(res, '找不到目標', 404);

    // 只更新有傳入的欄位
    const data = {};
    if (title       !== undefined) data.title       = String(title).trim();
    if (description !== undefined) data.description = description || null;
    if (quarter     !== undefined) data.quarter     = quarter;
    if (year        !== undefined) data.year        = parseInt(year, 10);
    if (status      !== undefined) data.status      = status;
    if (owner       !== undefined) data.owner       = owner || null;
    // parentId：明確傳入 null 代表移除父目標；傳入數字代表設定父目標
    if ('parentId' in req.body) {
      data.parentId = parentId ? parseInt(parentId, 10) : null;
    }

    const updated = await prisma.goal.update({
      where:   { id },
      data,
      include: { keyResults: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
    });
    ok(res, formatGoal(updated));
  } catch (e) {
    console.error('[goals PATCH /:id]', e.message);
    err(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════
// DELETE /api/goals/:id — 刪除 Objective
// 子目標 parentId 設為 NULL（升格頂層，不連鎖刪除）
// KR 透過 Cascade 自動刪除
// ════════════════════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return err(res, '無效的目標 ID');

  try {
    await prisma.goal.delete({ where: { id } });
    ok(res, { deleted: true });
  } catch (e) {
    // P2025 = record not found，視為已刪除
    if (e.code === 'P2025') return ok(res, { deleted: true });
    console.error('[goals DELETE /:id]', e.message);
    err(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/goals/:id/key-results — 新增 KR
// ════════════════════════════════════════════════════════════
router.post('/:id/key-results', async (req, res) => {
  const goalId = parseInt(req.params.id, 10);
  if (isNaN(goalId)) return err(res, '無效的目標 ID');

  const { title, targetValue, currentValue = 0, unit = '', status = 'in_progress' } = req.body;
  if (!title) return err(res, 'title 為必填');

  try {
    const goal = await prisma.goal.findUnique({ where: { id: goalId } });
    if (!goal) return err(res, '找不到目標', 404);

    // position = 現有 KR 數量（新 KR 排最後）
    const krCount = await prisma.keyResult.count({ where: { goalId } });

    await prisma.keyResult.create({
      data: {
        goalId,
        title:        String(title).trim(),
        unit:         unit || '',
        targetValue:  parseFloat(targetValue)  || 0,
        currentValue: parseFloat(currentValue) || 0,
        status,
        position:     krCount,
      },
    });

    // 回傳完整 Goal（含新 KR）
    const updated = await prisma.goal.findUnique({
      where:   { id: goalId },
      include: { keyResults: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
    });
    ok(res, formatGoal(updated));
  } catch (e) {
    console.error('[goals POST /:id/key-results]', e.message);
    err(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════
// PATCH /api/goals/:id/key-results/:krId — 更新 KR
// ════════════════════════════════════════════════════════════
router.patch('/:id/key-results/:krId', async (req, res) => {
  const goalId = parseInt(req.params.id,   10);
  const krId   = parseInt(req.params.krId, 10);
  if (isNaN(goalId) || isNaN(krId)) return err(res, '無效的 ID');

  const { title, targetValue, currentValue, unit, status } = req.body;

  try {
    // 確認 KR 存在且屬於該 Goal
    const kr = await prisma.keyResult.findFirst({ where: { id: krId, goalId } });
    if (!kr) return err(res, '找不到 Key Result', 404);

    const data = {};
    if (title        !== undefined) data.title        = String(title).trim();
    if (unit         !== undefined) data.unit         = unit;
    if (status       !== undefined) data.status       = status;
    if (targetValue  !== undefined) data.targetValue  = parseFloat(targetValue);
    if (currentValue !== undefined) data.currentValue = parseFloat(currentValue);

    await prisma.keyResult.update({ where: { id: krId }, data });

    // 回傳完整 Goal（含更新後的 KR）
    const updated = await prisma.goal.findUnique({
      where:   { id: goalId },
      include: { keyResults: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
    });
    ok(res, formatGoal(updated));
  } catch (e) {
    console.error('[goals PATCH /:id/key-results/:krId]', e.message);
    err(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════
// DELETE /api/goals/:id/key-results/:krId — 刪除 KR
// ════════════════════════════════════════════════════════════
router.delete('/:id/key-results/:krId', async (req, res) => {
  const goalId = parseInt(req.params.id,   10);
  const krId   = parseInt(req.params.krId, 10);
  if (isNaN(goalId) || isNaN(krId)) return err(res, '無效的 ID');

  try {
    await prisma.keyResult.delete({ where: { id: krId } });

    // 回傳完整 Goal（含剩餘 KR）
    const updated = await prisma.goal.findUnique({
      where:   { id: goalId },
      include: { keyResults: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
    });
    if (!updated) return ok(res, { deleted: true });
    ok(res, formatGoal(updated));
  } catch (e) {
    if (e.code === 'P2025') {
      // KR 已不存在；仍回傳 Goal 當前狀態
      try {
        const updated = await prisma.goal.findUnique({
          where:   { id: goalId },
          include: { keyResults: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
        });
        return ok(res, updated ? formatGoal(updated) : { deleted: true });
      } catch { return ok(res, { deleted: true }); }
    }
    console.error('[goals DELETE /:id/key-results/:krId]', e.message);
    err(res, e.message, 500);
  }
});

module.exports = router;
