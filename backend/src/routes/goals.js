/**
 * Goals API — OKR 目標與關鍵結果
 *
 * 輕量 JSON 檔案儲存（無需 Prisma migration）
 * 資料路徑：/tmp/pmis-goals-{companyId}.json
 *
 * GET    /api/goals?companyId=N&quarter=&year=
 * POST   /api/goals                 建立 Objective
 * GET    /api/goals/:id             取得單一 OKR
 * PATCH  /api/goals/:id             更新 Objective
 * DELETE /api/goals/:id             刪除 Objective
 *
 * POST   /api/goals/:id/key-results            新增 KR
 * PATCH  /api/goals/:id/key-results/:krId      更新 KR（含 currentValue）
 * DELETE /api/goals/:id/key-results/:krId      刪除 KR
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

// ── 工具函式 ─────────────────────────────────────────────
const ok  = (res, data)        => res.json({ success: true, data, timestamp: new Date().toISOString() });
const err = (res, msg, s = 400) => res.status(s).json({ success: false, error: msg });

function dataPath(companyId) {
  const dir = '/tmp';
  return path.join(dir, `pmis-goals-${companyId}.json`);
}

function loadGoals(companyId) {
  try {
    const p = dataPath(companyId);
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return []; }
}

function saveGoals(companyId, goals) {
  fs.writeFileSync(dataPath(companyId), JSON.stringify(goals, null, 2));
}

function calcProgress(keyResults) {
  if (!keyResults || keyResults.length === 0) return 0;
  const sum = keyResults.reduce((s, kr) => {
    const p = kr.targetValue > 0 ? Math.min(100, Math.round((kr.currentValue / kr.targetValue) * 100)) : 0;
    return s + p;
  }, 0);
  return Math.round(sum / keyResults.length);
}

// ── 種子資料（首次讀取時注入） ───────────────────────────
function seedIfEmpty(companyId) {
  const goals = loadGoals(companyId);
  if (goals.length > 0) return;
  const now   = new Date().toISOString();
  const year  = new Date().getFullYear();
  const quarter = `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;

  const seed = [
    {
      id: uuidv4(),
      companyId,
      title: '提升產品開發效率',
      description: '透過流程優化與工具整合，提升整體開發速度與品質。',
      quarter, year,
      status: 'active',
      owner: 'Admin',
      createdAt: now,
      updatedAt: now,
      keyResults: [
        { id: uuidv4(), title: '將平均任務完成週期縮短至 5 天以內', targetValue: 5, currentValue: 6.5, unit: '天', status: 'in_progress' },
        { id: uuidv4(), title: '新增自動化測試覆蓋率達 80%',         targetValue: 80, currentValue: 42, unit: '%', status: 'in_progress' },
        { id: uuidv4(), title: 'Sprint 完成率維持 90% 以上',         targetValue: 90, currentValue: 78, unit: '%', status: 'in_progress' },
      ],
    },
    {
      id: uuidv4(),
      companyId,
      title: '強化客戶滿意度',
      description: '透過需求回應速度與品質改善，提升 NPS 分數。',
      quarter, year,
      status: 'active',
      owner: 'Admin',
      createdAt: now,
      updatedAt: now,
      keyResults: [
        { id: uuidv4(), title: 'NPS 分數達到 45 分',   targetValue: 45, currentValue: 38, unit: '分', status: 'in_progress' },
        { id: uuidv4(), title: '客戶反映問題 24h 內回應率達 95%', targetValue: 95, currentValue: 82, unit: '%', status: 'in_progress' },
      ],
    },
    {
      id: uuidv4(),
      companyId,
      title: '建立團隊知識共享文化',
      description: '定期分享會 + 內部文件庫，降低知識孤島問題。',
      quarter, year,
      status: 'completed',
      owner: 'Admin',
      createdAt: now,
      updatedAt: now,
      keyResults: [
        { id: uuidv4(), title: '每月 Knowledge Sharing 場次 ≥ 2',      targetValue: 2, currentValue: 2, unit: '場', status: 'done' },
        { id: uuidv4(), title: '內部文件數量達 50 篇',                  targetValue: 50, currentValue: 50, unit: '篇', status: 'done' },
        { id: uuidv4(), title: '新進成員 Onboarding 評分 ≥ 4.5',       targetValue: 4.5, currentValue: 4.7, unit: '分', status: 'done' },
      ],
    },
  ];
  saveGoals(companyId, seed);
}

// ════════════════════════════════════════════════════════════
// GET /api/goals
// ════════════════════════════════════════════════════════════
router.get('/', (req, res) => {
  const companyId = parseInt(req.query.companyId, 10);
  if (!companyId) return err(res, 'companyId 為必填');
  seedIfEmpty(companyId);

  let goals = loadGoals(companyId);

  // 篩選
  if (req.query.quarter) goals = goals.filter(g => g.quarter === req.query.quarter);
  if (req.query.year)    goals = goals.filter(g => String(g.year) === String(req.query.year));
  if (req.query.status)  goals = goals.filter(g => g.status === req.query.status);

  // 計算進度
  const result = goals.map(g => ({
    ...g,
    progress: calcProgress(g.keyResults),
  }));

  // 統計摘要
  const total     = result.length;
  const active    = result.filter(g => g.status === 'active').length;
  const completed = result.filter(g => g.status === 'completed').length;
  const avgProgress = total > 0 ? Math.round(result.reduce((s, g) => s + g.progress, 0) / total) : 0;

  ok(res, {
    goals: result,
    meta: { total, active, completed, avgProgress },
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/goals
// ════════════════════════════════════════════════════════════
router.post('/', (req, res) => {
  const { companyId, title, description, quarter, year, owner, status = 'active' } = req.body;
  if (!companyId || !title) return err(res, 'companyId, title 為必填');

  const goals = loadGoals(companyId);
  const now   = new Date().toISOString();
  const goal  = {
    id: uuidv4(),
    companyId: parseInt(companyId, 10),
    title, description, quarter,
    year: parseInt(year, 10) || new Date().getFullYear(),
    status, owner,
    createdAt: now, updatedAt: now,
    keyResults: [],
  };
  goals.push(goal);
  saveGoals(companyId, goals);
  ok(res, { ...goal, progress: 0 });
});

// ════════════════════════════════════════════════════════════
// GET /api/goals/:id
// ════════════════════════════════════════════════════════════
router.get('/:id', (req, res) => {
  const companyId = parseInt(req.query.companyId, 10);
  const goals     = loadGoals(companyId);
  const goal      = goals.find(g => g.id === req.params.id);
  if (!goal) return err(res, '找不到目標', 404);
  ok(res, { ...goal, progress: calcProgress(goal.keyResults) });
});

// ════════════════════════════════════════════════════════════
// PATCH /api/goals/:id
// ════════════════════════════════════════════════════════════
router.patch('/:id', (req, res) => {
  const companyId = parseInt(req.body.companyId || req.query.companyId, 10);
  const goals     = loadGoals(companyId);
  const idx       = goals.findIndex(g => g.id === req.params.id);
  if (idx < 0) return err(res, '找不到目標', 404);

  const allowed = ['title','description','quarter','year','status','owner'];
  allowed.forEach(k => { if (req.body[k] !== undefined) goals[idx][k] = req.body[k]; });
  goals[idx].updatedAt = new Date().toISOString();
  saveGoals(companyId, goals);
  ok(res, { ...goals[idx], progress: calcProgress(goals[idx].keyResults) });
});

// ════════════════════════════════════════════════════════════
// DELETE /api/goals/:id
// ════════════════════════════════════════════════════════════
router.delete('/:id', (req, res) => {
  const companyId = parseInt(req.query.companyId, 10);
  let goals = loadGoals(companyId);
  goals = goals.filter(g => g.id !== req.params.id);
  saveGoals(companyId, goals);
  ok(res, { deleted: true });
});

// ════════════════════════════════════════════════════════════
// POST /api/goals/:id/key-results
// ════════════════════════════════════════════════════════════
router.post('/:id/key-results', (req, res) => {
  const { companyId, title, targetValue, currentValue = 0, unit = '', status = 'in_progress' } = req.body;
  if (!companyId || !title) return err(res, 'companyId, title 為必填');

  const goals = loadGoals(companyId);
  const idx   = goals.findIndex(g => g.id === req.params.id);
  if (idx < 0) return err(res, '找不到目標', 404);

  const kr = {
    id: uuidv4(),
    title, unit,
    targetValue:  parseFloat(targetValue) || 0,
    currentValue: parseFloat(currentValue) || 0,
    status,
  };
  goals[idx].keyResults.push(kr);
  goals[idx].updatedAt = new Date().toISOString();
  saveGoals(companyId, goals);
  ok(res, { ...goals[idx], progress: calcProgress(goals[idx].keyResults) });
});

// ════════════════════════════════════════════════════════════
// PATCH /api/goals/:id/key-results/:krId
// ════════════════════════════════════════════════════════════
router.patch('/:id/key-results/:krId', (req, res) => {
  const { companyId } = req.body;
  const goals = loadGoals(parseInt(companyId, 10));
  const gIdx  = goals.findIndex(g => g.id === req.params.id);
  if (gIdx < 0) return err(res, '找不到目標', 404);

  const krIdx = goals[gIdx].keyResults.findIndex(k => k.id === req.params.krId);
  if (krIdx < 0) return err(res, '找不到 Key Result', 404);

  const allowed = ['title','targetValue','currentValue','unit','status'];
  allowed.forEach(k => { if (req.body[k] !== undefined) goals[gIdx].keyResults[krIdx][k] = req.body[k]; });
  goals[gIdx].updatedAt = new Date().toISOString();
  saveGoals(parseInt(companyId, 10), goals);
  ok(res, { ...goals[gIdx], progress: calcProgress(goals[gIdx].keyResults) });
});

// ════════════════════════════════════════════════════════════
// DELETE /api/goals/:id/key-results/:krId
// ════════════════════════════════════════════════════════════
router.delete('/:id/key-results/:krId', (req, res) => {
  const companyId = parseInt(req.query.companyId, 10);
  const goals     = loadGoals(companyId);
  const gIdx      = goals.findIndex(g => g.id === req.params.id);
  if (gIdx < 0) return err(res, '找不到目標', 404);

  goals[gIdx].keyResults = goals[gIdx].keyResults.filter(k => k.id !== req.params.krId);
  goals[gIdx].updatedAt = new Date().toISOString();
  saveGoals(companyId, goals);
  ok(res, { ...goals[gIdx], progress: calcProgress(goals[gIdx].keyResults) });
});

module.exports = router;
