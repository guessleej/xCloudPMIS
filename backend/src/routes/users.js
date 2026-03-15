/**
 * 使用者 API 路由
 *
 * GET /api/users?companyId=2   取得公司成員列表（指派人選單 / ProjectsPage 用）
 *
 * 回應格式：{ success: true, data: [...], meta: { total: N } }
 * 此格式與 ProjectsPage 中 data?.data 的取值邏輯相容。
 */

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── 小工具：統一成功回應格式 ─────────────────────────────────
const ok = (res, data, meta = {}) =>
  res.json({ success: true, data, meta, timestamp: new Date().toISOString() });

// ── 小工具：統一錯誤回應格式 ─────────────────────────────────
const err = (res, message, status = 500) =>
  res.status(status).json({ success: false, error: message });

// ════════════════════════════════════════════════════════════
// GET /api/users?companyId=2
// 取得指定公司的所有啟用中成員
// ════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  const companyId = parseInt(req.query.companyId) || 2;

  try {
    const users = await prisma.user.findMany({
      where:   { companyId, isActive: true },
      select:  {
        id:        true,
        name:      true,
        email:     true,
        role:      true,
        avatarUrl: true,
      },
      orderBy: { name: 'asc' },
    });

    ok(res, users, { total: users.length });
  } catch (e) {
    console.error('[users] Prisma 查詢失敗:', e.message);
    err(res, e.message);
  }
});

module.exports = router;
