/**
 * 通知 API 路由
 *
 * GET    /api/notifications              取得目前用戶通知列表（含分頁、篩選）
 * GET    /api/notifications/unread-count 取得未讀通知數量
 * PATCH  /api/notifications/:id/read     標記單則通知已讀
 * PATCH  /api/notifications/read-all    標記全部已讀
 * POST   /api/notifications              建立通知（系統內部/測試用）
 * DELETE /api/notifications/:id          刪除通知
 */

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ok  = (res, data, meta = {}) =>
  res.json({ success: true, data, meta, timestamp: new Date().toISOString() });

const err = (res, message, status = 500) =>
  res.status(status).json({ success: false, error: message });

// DB 通知 type → 前端 type 對照（前端用 'mention' 不是 'mentioned'）
const TYPE_MAP = {
  task_assigned:        'task_assigned',
  deadline_approaching: 'task_due',
  mentioned:            'mention',
  comment_added:        'comment',
  task_completed:       'done',
  milestone_achieved:   'milestone',
};

// ── GET /api/notifications ─────────────────────────────────────
// Query Params:
//   companyId  - 公司 ID（必填）
//   recipientId - 接收者 ID（不填則取 companyId 下的第一個 user，實際應從 JWT 取得）
//   type       - 篩選類型（可選：mention/task_assigned/comment/done/task_due）
//   unread     - 'true' 只取未讀
//   limit      - 筆數（預設 50）
//   offset     - 偏移（預設 0）
router.get('/', async (req, res) => {
  try {
    const companyId   = parseInt(req.query.companyId   || '1');
    const recipientId = parseInt(req.query.recipientId || '0');
    const filterType  = req.query.type;
    const onlyUnread  = req.query.unread === 'true';
    const limit       = Math.min(parseInt(req.query.limit  || '50'), 200);
    const offset      = parseInt(req.query.offset || '0');

    // 若沒有指定 recipientId，取該 company 的第一個有效 user
    let targetId = recipientId;
    if (!targetId) {
      const first = await prisma.user.findFirst({
        where: { companyId, isActive: true },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      targetId = first?.id ?? 0;
    }

    if (!targetId) return ok(res, [], { total: 0 });

    // 建構 where 條件
    const where = { recipientId: targetId };
    if (onlyUnread)  where.isRead = false;
    if (filterType) {
      // 前端 type → DB type 逆映射
      const reverseMap = {
        mention:      'mentioned',
        task_assigned:'task_assigned',
        comment:      'comment_added',
        done:         'task_completed',
        task_due:     'deadline_approaching',
        milestone:    'milestone_achieved',
      };
      const dbType = reverseMap[filterType] || filterType;
      where.type = dbType;
    }

    const [total, rows] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          recipient: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
    ]);

    // 轉換為前端期望的格式
    const data = rows.map(n => ({
      id:           n.id,
      type:         TYPE_MAP[n.type] || n.type,
      dbType:       n.type,
      title:        n.title,
      body:         n.message,
      sender:       { name: '系統通知' },   // DB 目前無 sender 欄位，可後續擴充
      time:         n.createdAt.toISOString(),
      read:         n.isRead,
      readAt:       n.readAt?.toISOString() || null,
      bookmarked:   false,   // DB 無此欄位，由前端 localStorage 管理
      archived:     false,   // DB 無此欄位，由前端 localStorage 管理
      resourceType: n.resourceType,
      resourceId:   n.resourceId,
    }));

    return ok(res, data, {
      total,
      unreadCount: data.filter(n => !n.read).length,
      limit,
      offset,
      recipientId: targetId,
    });
  } catch (e) {
    console.error('[notifications GET]', e.message);
    return ok(res, [], { total: 0, error: e.message });
  }
});

// ── GET /api/notifications/unread-count ───────────────────────
router.get('/unread-count', async (req, res) => {
  try {
    const companyId   = parseInt(req.query.companyId   || '1');
    const recipientId = parseInt(req.query.recipientId || '0');

    let targetId = recipientId;
    if (!targetId) {
      const first = await prisma.user.findFirst({
        where: { companyId, isActive: true },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      targetId = first?.id ?? 0;
    }

    if (!targetId) return ok(res, { count: 0 });

    const count = await prisma.notification.count({
      where: { recipientId: targetId, isRead: false },
    });

    return ok(res, { count, recipientId: targetId });
  } catch (e) {
    console.error('[notifications unread-count]', e.message);
    return ok(res, { count: 0 });
  }
});

// ── PATCH /api/notifications/:id/read ─────────────────────────
// 標記單則通知 已讀/未讀（toggle）
router.patch('/:id/read', async (req, res) => {
  try {
    const id     = parseInt(req.params.id);
    const isRead = req.body.isRead !== undefined ? Boolean(req.body.isRead) : true;

    const updated = await prisma.notification.update({
      where: { id },
      data:  {
        isRead,
        readAt: isRead ? new Date() : null,
      },
    });

    return ok(res, {
      id:     updated.id,
      isRead: updated.isRead,
      readAt: updated.readAt?.toISOString() || null,
    });
  } catch (e) {
    console.error('[notifications PATCH read]', e.message);
    return err(res, e.message);
  }
});

// ── PATCH /api/notifications/read-all ─────────────────────────
// 標記所有通知為已讀
router.patch('/read-all', async (req, res) => {
  try {
    const recipientId = parseInt(req.body.recipientId || req.query.recipientId || '0');
    if (!recipientId) return err(res, 'recipientId 必填', 400);

    const result = await prisma.notification.updateMany({
      where:  { recipientId, isRead: false },
      data:   { isRead: true, readAt: new Date() },
    });

    return ok(res, { updated: result.count });
  } catch (e) {
    console.error('[notifications read-all]', e.message);
    return err(res, e.message);
  }
});

// ── POST /api/notifications ────────────────────────────────────
// 建立新通知（系統內部觸發或測試用）
router.post('/', async (req, res) => {
  try {
    const {
      recipientId, type, title, message,
      resourceType, resourceId,
    } = req.body;

    if (!recipientId || !type || !title || !message) {
      return err(res, 'recipientId, type, title, message 為必填', 400);
    }

    const validTypes = [
      'task_assigned', 'deadline_approaching', 'mentioned',
      'comment_added', 'task_completed', 'milestone_achieved',
    ];
    if (!validTypes.includes(type)) {
      return err(res, `type 必須為：${validTypes.join(', ')}`, 400);
    }

    const notif = await prisma.notification.create({
      data: {
        recipientId: parseInt(recipientId),
        type,
        title,
        message,
        resourceType: resourceType || null,
        resourceId:   resourceId ? parseInt(resourceId) : null,
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        id:           notif.id,
        type:         TYPE_MAP[notif.type] || notif.type,
        title:        notif.title,
        body:         notif.message,
        time:         notif.createdAt.toISOString(),
        read:         false,
        resourceType: notif.resourceType,
        resourceId:   notif.resourceId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[notifications POST]', e.message);
    return err(res, e.message);
  }
});

// ── DELETE /api/notifications/:id ─────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.notification.delete({ where: { id } });
    return ok(res, { deleted: true, id });
  } catch (e) {
    console.error('[notifications DELETE]', e.message);
    return err(res, e.message);
  }
});

module.exports = router;
