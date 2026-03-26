/**
 * 任務 API 路由（我的任務頁面專用）
 *
 * GET /api/tasks?companyId=2   取得登入者的任務列表（純陣列格式）
 *
 * 注意：回應格式為純 JSON 陣列（非 {success, data} 包裝格式），
 * 因為 MyTasksPage 使用 Array.isArray(data) 判斷資料是否存在。
 */

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── 判斷任務的時間分區 ───────────────────────────────────────
// section 值對應前端的分組標籤：
//   today     → 今天執行
//   upcoming  → 近期指派（7 天內）
//   next_week → 下週執行（8～14 天）
//   later     → 稍後執行（14 天以上或無截止日）
function deriveSection(dueDate) {
  if (!dueDate) return 'later';

  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due   = new Date(dueDate);
  const dueMidnight = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const diffMs   = dueMidnight - today;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0)               return 'today';
  if (diffDays >= 1 && diffDays <= 7)  return 'upcoming';
  if (diffDays >= 8 && diffDays <= 14) return 'next_week';
  return 'later';
}

// ════════════════════════════════════════════════════════════
// GET /api/tasks?companyId=2
// 取得該公司所有任務，以純陣列格式回傳（MyTasksPage 相容格式）
// ════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  const companyId = parseInt(req.query.companyId) || 2;

  try {
    // 取得該公司旗下所有未刪除專案的 ID
    const projects = await prisma.project.findMany({
      where:  { companyId, deletedAt: null },
      select: { id: true, name: true },
    });
    const projectIds = projects.map(p => p.id);

    if (projectIds.length === 0) {
      // 公司下無專案，直接回傳空陣列
      return res.json([]);
    }

    // 查詢所有未刪除任務
    const tasks = await prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        deletedAt: null,
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate:  'asc'  },
        { createdAt: 'asc' },
      ],
      include: {
        assignee: { select: { id: true, name: true } },
        project:  { select: { id: true, name: true } },
      },
    });

    // 格式化成 MyTasksPage 期望的欄位結構，並加入 section 分區
    const result = tasks.map(t => ({
      id:       t.id,
      title:    t.title,
      status:   t.status,
      priority: t.priority,
      dueDate:  t.dueDate ? t.dueDate.toISOString().split('T')[0] : null,
      project:  t.project,
      assignee: t.assignee,
      section:  deriveSection(t.dueDate),
    }));

    // 直接回傳陣列，MyTasksPage 以 Array.isArray() 判斷
    res.json(result);
  } catch (e) {
    // 查詢失敗時回傳空陣列，讓前端使用 Demo 資料，避免頁面崩潰
    console.error('[tasks] Prisma 查詢失敗，回傳空陣列:', e.message);
    res.json([]);
  }
});

module.exports = router;
