/**
 * /api/notifications — 通知路由
 * 使用 Prisma Notification 模型
 */
const express = require('express');
const router  = express.Router();

const ok  = (res, data, meta = {}) => res.json({ success: true, data, meta, timestamp: new Date().toISOString() });
const err = (res, msg, s = 500)   => res.status(s).json({ success: false, error: msg });

function getPrisma() {
  try {
    const { PrismaClient } = require('@prisma/client');
    return new PrismaClient();
  } catch {
    return null;
  }
}

// seed 示範通知已移除 — 改由真實業務流程產生通知

// GET /api/notifications/unread-count — 未讀數量（需放在 /:id 之前）
router.get('/unread-count', async (req, res) => {
  // userId 優先從 JWT (req.user.id)，備用 query param
  const userId = parseInt(req.user?.id || req.user?.userId || req.query.userId || '0');
  if (!userId) return err(res, 'userId 為必填', 400);

  const prisma = getPrisma();
  if (!prisma) return err(res, 'Prisma 未設定', 503);

  try {
    const count = await prisma.notification.count({
      where: { recipientId: userId, isRead: false },
    });
    return ok(res, { count });
  } catch (e) {
    console.error('[notifications unread-count]', e.message);
    return err(res, e.message);
  } finally {
    await prisma.$disconnect();
  }
});

// GET /api/notifications?userId=N&companyId=N — 列出通知（最近 50 筆）
router.get('/', async (req, res) => {
  // userId 優先從 JWT，備用 query param（相容舊呼叫方式）
  const userId    = parseInt(req.user?.id || req.user?.userId || req.query.userId || '0');
  const companyId = parseInt(req.query.companyId);
  const limit     = Math.min(parseInt(req.query.limit) || 50, 100);
  if (!userId) return err(res, 'userId 為必填', 400);

  const prisma = getPrisma();
  if (!prisma) return err(res, 'Prisma 未設定', 503);

  try {
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where:   { recipientId: userId },
        orderBy: { createdAt: 'desc' },
        take:    limit,
      }),
      prisma.notification.count({ where: { recipientId: userId, isRead: false } }),
    ]);

    return ok(res, items, { unreadCount });
  } catch (e) {
    console.error('[notifications GET]', e.message);
    return err(res, e.message);
  } finally {
    await prisma.$disconnect();
  }
});

// PATCH /api/notifications/:id/read — 標記為已讀
router.patch('/:id/read', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return err(res, '無效的 id', 400);

  const prisma = getPrisma();
  if (!prisma) return err(res, 'Prisma 未設定', 503);

  try {
    const item = await prisma.notification.update({
      where: { id },
      data:  { isRead: true, readAt: new Date() },
    });
    return ok(res, item);
  } catch (e) {
    console.error('[notifications PATCH read]', e.message);
    return err(res, e.message);
  } finally {
    await prisma.$disconnect();
  }
});

// POST /api/notifications/mark-all-read — 全部標為已讀
router.post('/mark-all-read', async (req, res) => {
  // 優先從 JWT 取 userId，備用 body（相容舊版呼叫）
  const userId = parseInt(req.user?.id || req.user?.userId || req.body.userId || '0');
  if (!userId) return err(res, 'userId 為必填', 400);

  const prisma = getPrisma();
  if (!prisma) return err(res, 'Prisma 未設定', 503);

  try {
    const result = await prisma.notification.updateMany({
      where: { recipientId: userId, isRead: false },
      data:  { isRead: true, readAt: new Date() },
    });
    return ok(res, { updated: result.count });
  } catch (e) {
    console.error('[notifications mark-all-read]', e.message);
    return err(res, e.message);
  } finally {
    await prisma.$disconnect();
  }
});

// DELETE /api/notifications/delete-all — 一鍵刪除當前使用者所有通知
router.delete('/delete-all', async (req, res) => {
  const userId = parseInt(req.user?.id || req.user?.userId || req.query.userId || '0');
  if (!userId) return err(res, 'userId 為必填', 400);

  const prisma = getPrisma();
  if (!prisma) return err(res, 'Prisma 未設定', 503);

  try {
    const result = await prisma.notification.deleteMany({
      where: { recipientId: userId },
    });
    return ok(res, { deleted: result.count });
  } catch (e) {
    console.error('[notifications delete-all]', e.message);
    return err(res, e.message);
  } finally {
    await prisma.$disconnect();
  }
});

// DELETE /api/notifications/:id — 刪除通知（只能刪自己的通知）
router.delete('/:id', async (req, res) => {
  const id     = parseInt(req.params.id);
  const userId = parseInt(req.user?.id || req.user?.userId || req.query.userId || '0');
  if (!id) return err(res, '無效的 id', 400);

  const prisma = getPrisma();
  if (!prisma) return err(res, 'Prisma 未設定', 503);

  try {
    // 先確認通知存在且屬於當前使用者（防止越權刪除）
    if (userId) {
      const item = await prisma.notification.findFirst({
        where: { id, recipientId: userId },
      });
      if (!item) return err(res, '找不到該通知或無權限刪除', 404);
    }
    await prisma.notification.delete({ where: { id } });
    return ok(res, { id });
  } catch (e) {
    // P2025 = record not found（已被刪除），視為成功
    if (e.code === 'P2025') return ok(res, { id });
    console.error('[notifications DELETE]', e.message);
    return err(res, e.message);
  } finally {
    await prisma.$disconnect();
  }
});

module.exports = router;
