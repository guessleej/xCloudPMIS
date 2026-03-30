/**
 * 甘特圖路由
 *
 * GET /api/gantt?companyId=2
 *   返回所有專案（含任務、里程碑）的時間線資料，供前端繪製甘特圖
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { getRedis } = require('../services/cache');
const prisma = new PrismaClient();

const GANTT_CACHE_TTL = 30; // 秒

// ── 工具函式 ────────────────────────────────────────────────
/**
 * 將 Date 物件格式化為 YYYY-MM-DD 字串
 * Prisma 回傳的 Date 型別需要轉換，才能作為 JSON 回應
 */
const toDateStr = (d) => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
};

// ── 甘特圖資料端點 ──────────────────────────────────────────
/**
 * GET /api/gantt
 * 查詢參數：
 *   companyId: 公司 ID（預設 2）
 *   status:    只顯示特定狀態的專案（可選，不傳則顯示全部非取消專案）
 */
router.get('/', async (req, res) => {
  try {
    const companyId = parseInt(req.query.companyId);
    if (!companyId) {
      return res.status(400).json({ error: 'companyId 為必填參數' });
    }

    // ── Redis 快取層（TTL 30 秒，避免高頻重複計算） ───────────
    const cacheKey = `gantt:company:${companyId}`;
    try {
      const redis = await getRedis();
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    } catch (_) { /* Redis 不可用時跳過快取，直接查 DB */ }

    // ── 查詢所有未刪除、未取消的專案，含任務與里程碑 ─────────
    const projects = await prisma.project.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { not: 'cancelled' }, // 已取消的專案不顯示在甘特圖
      },
      include: {
        owner: { select: { id: true, name: true } },
        tasks: {
          where: { deletedAt: null },
          include: {
            assignee: { select: { id: true, name: true } },
          },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        },
        milestones: {
          orderBy: { dueDate: 'asc' },
        },
      },
      orderBy: { startDate: 'asc' }, // 依開始日期由舊到新排列
    });

    // ── 計算整體日期範圍 ─────────────────────────────────────
    // 收集所有日期點，取最小值為 rangeStart、最大值為 rangeEnd
    const allDateMs = [];

    for (const p of projects) {
      if (p.startDate)  allDateMs.push(new Date(p.startDate).getTime());
      if (p.endDate)    allDateMs.push(new Date(p.endDate).getTime());

      for (const t of p.tasks) {
        if (t.startedAt)   allDateMs.push(new Date(t.startedAt).getTime());
        if (t.dueDate)     allDateMs.push(new Date(t.dueDate).getTime());
        if (t.completedAt) allDateMs.push(new Date(t.completedAt).getTime());
      }

      for (const m of p.milestones) {
        if (m.dueDate)    allDateMs.push(new Date(m.dueDate).getTime());
        if (m.achievedAt) allDateMs.push(new Date(m.achievedAt).getTime());
      }
    }

    const now = new Date();
    const year = now.getFullYear();

    // 若沒有任何日期資料，預設為當年整年
    let rangeStart = allDateMs.length > 0
      ? new Date(Math.min(...allDateMs))
      : new Date(year, 0, 1);
    let rangeEnd = allDateMs.length > 0
      ? new Date(Math.max(...allDateMs))
      : new Date(year, 11, 31);

    // 確保今天在可視範圍內
    if (now.getTime() < rangeStart.getTime()) rangeStart = new Date(now);
    if (now.getTime() > rangeEnd.getTime())   rangeEnd   = new Date(now);

    // 前後各加一段緩衝，讓甘特圖有呼吸空間
    rangeStart.setDate(rangeStart.getDate() - 14);  // 往前 2 週
    rangeEnd.setDate(rangeEnd.getDate() + 30);       // 往後 1 個月

    const totalDays = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86400000);

    // ── 格式化專案資料 ───────────────────────────────────────
    const formattedProjects = projects.map(p => {
      // 格式化任務
      const tasks = p.tasks.map(t => ({
        id:          t.id,
        title:       t.title,
        status:      t.status,
        priority:    t.priority,
        assignee:    t.assignee,
        // 計劃開始 / 結束（來自任務的 plan_start / plan_end 欄位）
        planStart:   toDateStr(t.planStart),
        planEnd:     toDateStr(t.planEnd),
        // 實際開始 / 結束
        actualStart: toDateStr(t.startedAt),
        actualEnd:   toDateStr(t.completedAt),
        // 截止日期
        dueDate:     toDateStr(t.dueDate),
      }));

      return {
        id:        p.id,
        name:      p.name,
        status:    p.status,
        startDate: toDateStr(p.startDate),
        endDate:   toDateStr(p.endDate),
        owner:     p.owner,
        taskCount: tasks.length,
        doneCount: tasks.filter(t => t.status === 'done').length,
        tasks,
        milestones: p.milestones.map(m => ({
          id:         m.id,
          name:       m.name,
          dueDate:    toDateStr(m.dueDate),
          isAchieved: m.isAchieved,
          achievedAt: toDateStr(m.achievedAt),
          color:      m.color,
        })),
      };
    });

    // ── 回傳結果（同時寫入 Redis 快取） ─────────────────────
    const payload = {
      projects: formattedProjects,
      range: {
        start:     toDateStr(rangeStart),
        end:       toDateStr(rangeEnd),
        totalDays,
      },
      generatedAt: now.toISOString(),
    };

    try {
      const redis = await getRedis();
      await redis.set(cacheKey, JSON.stringify(payload), { EX: GANTT_CACHE_TTL });
    } catch (_) { /* Redis 寫入失敗不影響回應 */ }

    res.json(payload);

  } catch (err) {
    console.error('❌ 甘特圖 API 錯誤:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

module.exports = router;
