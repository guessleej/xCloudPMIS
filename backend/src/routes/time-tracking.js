/**
 * 工時記錄路由
 *
 * 端點列表：
 *   GET    /api/time-tracking           → 取得工時記錄列表 + 統計摘要
 *   GET    /api/time-tracking/tasks     → 取得可選任務清單（供 Modal 下拉選單）
 *   POST   /api/time-tracking/start     → 開始計時
 *   PATCH  /api/time-tracking/:id/stop  → 停止計時
 *   POST   /api/time-tracking           → 手動新增工時記錄
 *   PATCH  /api/time-tracking/:id       → 更新工時記錄描述
 *   DELETE /api/time-tracking/:id       → 刪除工時記錄
 *
 * 注意：靜態路由（/tasks、/start）必須在動態路由（/:id）之前定義
 */

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma  = new PrismaClient();

// ── 工具函式 ────────────────────────────────────────────────

/**
 * 計算兩個 Date 物件之間相差的分鐘數（無條件進位到整數）
 */
const diffMinutes = (start, end) =>
  Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 60000);

/**
 * 取得某天的開始時間（00:00:00.000）
 */
const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * 取得某天的結束時間（23:59:59.999）
 */
const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

/**
 * 取得本週週一的 00:00:00
 */
const startOfWeek = () => {
  const now = new Date();
  const day = now.getDay(); // 0=週日, 1=週一, ...
  const diff = (day === 0 ? -6 : 1 - day); // 往回幾天到週一
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

/**
 * 取得本月 1 日的 00:00:00
 */
const startOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
};

/**
 * 將分鐘數轉為「X 小時 Y 分鐘」的顯示文字
 */
const minutesToDisplay = (minutes) => {
  if (!minutes || minutes <= 0) return '0 分鐘';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} 分鐘`;
  if (m === 0) return `${h} 小時`;
  return `${h} 小時 ${m} 分鐘`;
};

// ════════════════════════════════════════════════════════════
// 靜態路由（必須在 /:id 之前）
// ════════════════════════════════════════════════════════════

/**
 * GET /api/time-tracking/tasks?companyId=2
 * 取得可選任務清單（供 Modal 下拉選單使用）
 * 只回傳未刪除、狀態不是 done 的任務（還有得做的任務）
 */
router.get('/tasks', async (req, res) => {
  try {
    const companyId = parseInt(req.query.companyId) || 2;

    const tasks = await prisma.task.findMany({
      where: {
        deletedAt: null,
        project: {
          companyId,
          deletedAt: null,
          status: { not: 'cancelled' },
        },
      },
      select: {
        id:    true,
        title: true,
        status: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: [
        { project: { name: 'asc' } },
        { title: 'asc' },
      ],
    });

    res.json({ tasks });
  } catch (err) {
    console.error('❌ 取得任務清單失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

/**
 * POST /api/time-tracking/start
 * 開始計時
 * Body: { taskId, userId, description? }
 *
 * 防止重複計時：若該 userId 已有進行中的計時記錄，回傳 409
 */
router.post('/start', async (req, res) => {
  try {
    const { taskId, userId, description = '' } = req.body;

    if (!taskId || !userId) {
      return res.status(400).json({ error: '缺少必要欄位：taskId、userId' });
    }

    // 檢查是否已有進行中的計時
    const activeEntry = await prisma.timeEntry.findFirst({
      where: { userId: parseInt(userId), endedAt: null },
      include: {
        task: { select: { id: true, title: true } },
      },
    });

    if (activeEntry) {
      return res.status(409).json({
        error: '您已有正在進行的計時記錄',
        activeEntry: {
          id:        activeEntry.id,
          taskId:    activeEntry.taskId,
          taskTitle: activeEntry.task.title,
          startedAt: activeEntry.startedAt,
        },
      });
    }

    const now  = new Date();
    const entry = await prisma.timeEntry.create({
      data: {
        taskId:      parseInt(taskId),
        userId:      parseInt(userId),
        startedAt:   now,
        endedAt:     null,
        description: description.trim(),
        date:        startOfDay(now),
      },
      include: {
        task: {
          select: {
            id:    true,
            title: true,
            project: { select: { id: true, name: true } },
          },
        },
        user: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ entry });
  } catch (err) {
    console.error('❌ 開始計時失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// 動態路由（/:id 及其子路由）
// ════════════════════════════════════════════════════════════

/**
 * PATCH /api/time-tracking/:id/stop
 * 停止計時
 * 自動計算 durationMinutes = now - startedAt（無條件進位到整分鐘）
 */
router.patch('/:id/stop', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const entry = await prisma.timeEntry.findUnique({ where: { id } });
    if (!entry) {
      return res.status(404).json({ error: `找不到工時記錄 #${id}` });
    }
    if (entry.endedAt !== null) {
      return res.status(400).json({ error: '此計時記錄已停止' });
    }

    const now     = new Date();
    const minutes = diffMinutes(entry.startedAt, now);

    const updated = await prisma.timeEntry.update({
      where: { id },
      data: {
        endedAt:         now,
        durationMinutes: minutes,
      },
      include: {
        task: {
          select: {
            id:    true,
            title: true,
            project: { select: { id: true, name: true } },
          },
        },
        user: { select: { id: true, name: true } },
      },
    });

    res.json({ entry: updated });
  } catch (err) {
    console.error('❌ 停止計時失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

/**
 * PATCH /api/time-tracking/:id
 * 更新工時記錄（支援描述、任務、開始／結束時間）
 * Body: { description?, taskId?, startedAt?, endedAt? }
 *
 * 若同時傳入 startedAt / endedAt，會自動重算 durationMinutes 與 date
 */
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { description, taskId, startedAt, endedAt } = req.body;

    const entry = await prisma.timeEntry.findUnique({ where: { id } });
    if (!entry) {
      return res.status(404).json({ error: `找不到工時記錄 #${id}` });
    }

    const data = {};

    // 描述
    if (description !== undefined) data.description = description.trim();

    // 任務
    if (taskId !== undefined) data.taskId = parseInt(taskId);

    // 時間欄位（需要重算 durationMinutes 與 date）
    const newStart = startedAt !== undefined ? new Date(startedAt) : entry.startedAt;
    const newEnd   = endedAt   !== undefined ? new Date(endedAt)   : entry.endedAt;

    if (startedAt !== undefined) {
      data.startedAt = newStart;
      data.date      = startOfDay(newStart); // date 跟隨開始時間
    }
    if (endedAt !== undefined) {
      data.endedAt = newEnd;
    }
    // 只要時間有任何一個改變，且 endedAt 不是 null，就重算時長
    if ((startedAt !== undefined || endedAt !== undefined) && newEnd) {
      data.durationMinutes = diffMinutes(newStart, newEnd);
    }

    const updated = await prisma.timeEntry.update({
      where: { id },
      data,
      include: {
        task: {
          select: {
            id:    true,
            title: true,
            project: { select: { id: true, name: true } },
          },
        },
        user: { select: { id: true, name: true } },
      },
    });

    res.json({ entry: updated });
  } catch (err) {
    console.error('❌ 更新工時記錄失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

/**
 * DELETE /api/time-tracking/:id
 * 刪除工時記錄
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const entry = await prisma.timeEntry.findUnique({ where: { id } });
    if (!entry) {
      return res.status(404).json({ error: `找不到工時記錄 #${id}` });
    }

    await prisma.timeEntry.delete({ where: { id } });

    res.json({ success: true, message: `工時記錄 #${id} 已刪除` });
  } catch (err) {
    console.error('❌ 刪除工時記錄失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// 主要列表端點
// ════════════════════════════════════════════════════════════

/**
 * GET /api/time-tracking?companyId=2&startDate=2026-03-01&endDate=2026-03-09&userId=2
 * 取得工時記錄列表 + 統計摘要
 *
 * 查詢參數：
 *   companyId: 公司 ID（預設 2）
 *   startDate: 起始日期（選填，預設本月 1 日）
 *   endDate:   結束日期（選填，預設今天）
 *   userId:    使用者 ID（選填，不傳則顯示所有人）
 */
router.get('/', async (req, res) => {
  try {
    const companyId = parseInt(req.query.companyId) || 2;
    const userId    = req.query.userId ? parseInt(req.query.userId) : null;

    // 解析日期範圍（預設：本月）
    const now   = new Date();
    const start = req.query.startDate
      ? startOfDay(new Date(req.query.startDate))
      : startOfMonth();
    const end   = req.query.endDate
      ? endOfDay(new Date(req.query.endDate))
      : endOfDay(now);

    // ── 查詢工時記錄 ─────────────────────────────────────────
    const where = {
      task: {
        project: {
          companyId,
          deletedAt: null,
        },
      },
      OR: [
        // 計時已結束：date 在範圍內
        { endedAt: { not: null }, date: { gte: start, lte: end } },
        // 計時進行中：永遠顯示
        { endedAt: null },
      ],
      ...(userId && { userId }),
    };

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        task: {
          select: {
            id:    true,
            title: true,
            project: { select: { id: true, name: true } },
          },
        },
        user: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: 'desc' },
    });

    // ── 計算統計摘要 ─────────────────────────────────────────
    const todayStart = startOfDay(now);
    const weekStart  = startOfWeek();
    const monthStart = startOfMonth();

    // 只統計已結束的記錄
    const completedEntries = entries.filter(e => e.endedAt !== null);

    const todayMinutes = completedEntries
      .filter(e => new Date(e.date) >= todayStart)
      .reduce((sum, e) => sum + (e.durationMinutes || 0), 0);

    const weekMinutes = completedEntries
      .filter(e => new Date(e.date) >= weekStart)
      .reduce((sum, e) => sum + (e.durationMinutes || 0), 0);

    const monthMinutes = completedEntries
      .filter(e => new Date(e.date) >= monthStart)
      .reduce((sum, e) => sum + (e.durationMinutes || 0), 0);

    const activeCount = entries.filter(e => e.endedAt === null).length;

    // ── 格式化記錄（轉換 Date 為字串） ───────────────────────
    const formattedEntries = entries.map(e => ({
      id:              e.id,
      taskId:          e.taskId,
      taskTitle:       e.task.title,
      projectId:       e.task.project.id,
      projectName:     e.task.project.name,
      userId:          e.userId,
      userName:        e.user.name,
      startedAt:       e.startedAt.toISOString(),
      endedAt:         e.endedAt ? e.endedAt.toISOString() : null,
      durationMinutes: e.durationMinutes,
      durationDisplay: minutesToDisplay(e.durationMinutes),
      description:     e.description,
      date:            e.date instanceof Date
        ? e.date.toISOString().split('T')[0]
        : String(e.date).split('T')[0],
      isActive:        e.endedAt === null,
    }));

    res.json({
      entries: formattedEntries,
      summary: {
        todayMinutes,
        weekMinutes,
        monthMinutes,
        activeCount,
        todayDisplay:  minutesToDisplay(todayMinutes),
        weekDisplay:   minutesToDisplay(weekMinutes),
        monthDisplay:  minutesToDisplay(monthMinutes),
      },
      range: {
        start: start.toISOString().split('T')[0],
        end:   end.toISOString().split('T')[0],
      },
      generatedAt: now.toISOString(),
    });

  } catch (err) {
    console.error('❌ 工時記錄 API 錯誤:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

/**
 * POST /api/time-tracking
 * 手動新增工時記錄
 * Body: { taskId, userId, startedAt, endedAt, description?, date? }
 */
router.post('/', async (req, res) => {
  try {
    const { taskId, userId, startedAt, endedAt, description = '' } = req.body;

    if (!taskId || !userId || !startedAt || !endedAt) {
      return res.status(400).json({ error: '缺少必要欄位：taskId、userId、startedAt、endedAt' });
    }

    const start = new Date(startedAt);
    const end   = new Date(endedAt);

    if (end <= start) {
      return res.status(400).json({ error: '結束時間必須晚於開始時間' });
    }

    const minutes = diffMinutes(start, end);

    const entry = await prisma.timeEntry.create({
      data: {
        taskId:          parseInt(taskId),
        userId:          parseInt(userId),
        startedAt:       start,
        endedAt:         end,
        durationMinutes: minutes,
        description:     description.trim(),
        date:            startOfDay(start),
      },
      include: {
        task: {
          select: {
            id:    true,
            title: true,
            project: { select: { id: true, name: true } },
          },
        },
        user: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ entry });
  } catch (err) {
    console.error('❌ 手動新增工時記錄失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

module.exports = router;
