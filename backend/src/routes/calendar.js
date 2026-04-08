/**
 * 行事曆整合 API 路由
 *
 * GET  /api/calendar/task/:taskId/ics   → 下載任務 ICS 檔（從郵件一鍵加入行事曆）
 * POST /api/calendar/task/:taskId       → 透過 Graph API 加入 Outlook 行事曆（需登入 + OAuth）
 * GET  /api/calendar/events             → 取得用戶 Outlook 行事曆事件
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { JWT_SECRET }   = require('../config/jwt');
const requireAuth      = require('../middleware/requireAuth');
const { createCalendarEvent, getUserCalendarEvents } = require('../services/userOutlookService');

const prisma = new PrismaClient();

const FRONTEND_URL = () => process.env.FRONTEND_URL || 'http://localhost:3838';

// ════════════════════════════════════════════════════════════
// GET /api/calendar/task/:taskId/ics?token=<jwt>
// 從郵件點擊後下載 ICS 檔（不需登入，透過 signed token 驗證）
// ════════════════════════════════════════════════════════════
router.get('/task/:taskId/ics', async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  if (isNaN(taskId)) return res.status(400).send('無效的任務 ID');

  // 驗證簽名 token（從信件連結帶來）
  const { token } = req.query;
  if (!token) return res.status(401).send('缺少驗證 token');

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
    if (payload.purpose !== 'calendar-add' || payload.taskId !== taskId) {
      return res.status(403).send('token 無效');
    }
  } catch {
    return res.status(403).send('token 已過期或無效');
  }

  // 查詢任務資料
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true, title: true, description: true, dueDate: true,
        project: { select: { name: true } },
      },
    });
    if (!task) return res.status(404).send('找不到任務');

    // 若無截止日，預設使用明天
    const dueDate = task.dueDate ? new Date(task.dueDate) : new Date(Date.now() + 86400000);
    const startDate = new Date(dueDate);
    startDate.setHours(9, 0, 0, 0);
    const endDate = new Date(dueDate);
    endDate.setHours(10, 0, 0, 0);

    const uid = `pmis-task-${task.id}@xcloudpmis`;
    const now = new Date();

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//xCloudPMIS//Task Calendar//ZH',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${formatIcsDate(now)}`,
      `DTSTART;VALUE=DATE:${formatIcsDateOnly(startDate)}`,
      `DTEND;VALUE=DATE:${formatIcsDateOnly(endDate)}`,
      `SUMMARY:📋 ${escapeIcs(task.title)}`,
      `DESCRIPTION:${escapeIcs(`專案：${task.project?.name || '未指定'}\\n${task.description || ''}\\n\\n🔗 ${FRONTEND_URL()}`)}`,
      `URL:${FRONTEND_URL()}`,
      'STATUS:CONFIRMED',
      `ORGANIZER;CN=xCloudPMIS:mailto:${process.env.ACS_SENDER_EMAIL || 'noreply@pmis.local'}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      `DESCRIPTION:任務「${escapeIcs(task.title)}」即將到期`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="task-${task.id}.ics"`);
    return res.send(icsContent);
  } catch (err) {
    console.error('[calendar] ICS 產生失敗:', err.message);
    return res.status(500).send('行事曆檔案產生失敗');
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/calendar/task/:taskId/add?token=<jwt>
// 智慧端點：先嘗試 Graph API 直接加入 Outlook，失敗則降級為 ICS 下載
// ════════════════════════════════════════════════════════════
router.get('/task/:taskId/add', async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  if (isNaN(taskId)) return res.status(400).send('無效的任務 ID');

  const { token } = req.query;
  if (!token) return res.status(401).send('缺少驗證 token');

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
    if (payload.purpose !== 'calendar-add' || payload.taskId !== taskId) {
      return res.status(403).send('token 無效');
    }
  } catch {
    return res.status(403).send('token 已過期或無效');
  }

  const userId = payload.userId;
  const icsUrl = `${FRONTEND_URL()}/api/calendar/task/${taskId}/ics?token=${encodeURIComponent(token)}`;

  // 查詢任務資料
  let task;
  try {
    task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true, title: true, description: true, dueDate: true,
        project: { select: { name: true } },
      },
    });
    if (!task) return res.status(404).send('找不到任務');
  } catch (err) {
    console.error('[calendar/add] 查詢任務失敗:', err.message);
    return res.redirect(icsUrl);
  }

  // 嘗試透過 Graph API 直接加入 Outlook 行事曆
  try {
    const dueDate = task.dueDate ? new Date(task.dueDate) : new Date(Date.now() + 86400000);
    const startDateTime = new Date(dueDate);
    startDateTime.setHours(9, 0, 0, 0);
    const endDateTime = new Date(dueDate);
    endDateTime.setHours(10, 0, 0, 0);

    await createCalendarEvent(userId, {
      subject: `📋 ${task.title}`,
      startDateTime,
      endDateTime,
      body: `<p>專案：${task.project?.name || '未指定'}</p><p>${task.description || ''}</p><p><a href="${FRONTEND_URL()}">前往 xCloudPMIS</a></p>`,
      location: task.project?.name || undefined,
    });

    // Graph API 成功 → 顯示成功頁面
    return res.send(calendarResultPage({
      success: true,
      title: task.title,
      message: '已自動加入您的 Outlook 行事曆！',
      icsUrl: null,
    }));
  } catch (graphErr) {
    console.log('[calendar/add] Graph API 失敗，降級為 ICS:', graphErr.message);

    // Graph API 失敗 → 顯示頁面並自動觸發 ICS 下載
    return res.send(calendarResultPage({
      success: false,
      title: task.title,
      message: '無法自動加入行事曆（尚未連結 Microsoft 帳號），已為您下載行事曆檔案。',
      icsUrl,
    }));
  }
});

/**
 * 產出行事曆操作結果 HTML 頁面
 * success=true  → 顯示成功訊息
 * success=false → 顯示訊息 + 自動觸發 ICS 下載
 */
function calendarResultPage({ success, title, message, icsUrl }) {
  const icon = success ? '✅' : '📥';
  const autoDownload = !success && icsUrl
    ? `<script>setTimeout(function(){ window.location.href = "${icsUrl}"; }, 1500);</script>`
    : '';
  const manualLink = !success && icsUrl
    ? `<p style="margin-top:16px;"><a href="${icsUrl}" style="color:#0078d4;text-decoration:underline;font-size:14px;">若未自動下載，請點此手動下載 .ics 檔案</a></p>`
    : '';
  const backLink = `<p style="margin-top:24px;"><a href="${FRONTEND_URL()}" style="color:#0078d4;text-decoration:none;font-size:14px;">← 返回 xCloudPMIS</a></p>`;

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>行事曆 - xCloudPMIS</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
  .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); padding: 40px 48px; text-align: center; max-width: 420px; }
  .icon { font-size: 48px; margin-bottom: 16px; }
  h2 { margin: 0 0 8px; color: #1a1a1a; font-size: 20px; }
  .task-name { color: #666; font-size: 14px; margin-bottom: 16px; }
  .msg { color: #333; font-size: 15px; line-height: 1.6; }
</style>
</head>
<body>
<div class="card">
  <div class="icon">${icon}</div>
  <h2>行事曆整合</h2>
  <p class="task-name">📋 ${title}</p>
  <p class="msg">${message}</p>
  ${manualLink}
  ${backLink}
</div>
${autoDownload}
</body></html>`;
}

// ════════════════════════════════════════════════════════════
// POST /api/calendar/task/:taskId
// 透過 Graph API 直接加入 Outlook 行事曆（需登入 + OAuth）
// ════════════════════════════════════════════════════════════
router.post('/task/:taskId', requireAuth, async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  const userId = req.user?.userId || req.user?.id;
  if (isNaN(taskId)) return res.status(400).json({ success: false, error: '無效的任務 ID' });

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true, title: true, description: true, dueDate: true,
        project: { select: { name: true } },
      },
    });
    if (!task) return res.status(404).json({ success: false, error: '找不到任務' });

    const dueDate = task.dueDate ? new Date(task.dueDate) : new Date(Date.now() + 86400000);
    const startDateTime = new Date(dueDate);
    startDateTime.setHours(9, 0, 0, 0);
    const endDateTime = new Date(dueDate);
    endDateTime.setHours(10, 0, 0, 0);

    const result = await createCalendarEvent(userId, {
      subject: `📋 ${task.title}`,
      startDateTime,
      endDateTime,
      body: `<p>專案：${task.project?.name || '未指定'}</p><p>${task.description || ''}</p><p><a href="${FRONTEND_URL()}">前往 xCloudPMIS</a></p>`,
      location: task.project?.name || undefined,
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[calendar] 加入行事曆失敗:', err.message);
    if (err.needsReauth) {
      return res.status(401).json({ success: false, error: '請先連結 Microsoft 帳號', needsReauth: true });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/calendar/project/:projectId
// 將專案截止日加入 Outlook 行事曆（含更新/建立邏輯）
// ════════════════════════════════════════════════════════════
router.post('/project/:projectId', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const userId = req.user?.userId || req.user?.id;
  if (isNaN(projectId)) return res.status(400).json({ success: false, error: '無效的專案 ID' });

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, description: true, endDate: true, startDate: true },
    });
    if (!project) return res.status(404).json({ success: false, error: '找不到專案' });
    if (!project.endDate) return res.status(400).json({ success: false, error: '專案尚未設定截止日' });

    const endDate = new Date(project.endDate);
    const startDateTime = new Date(endDate);
    startDateTime.setHours(9, 0, 0, 0);
    const endDateTime = new Date(endDate);
    endDateTime.setHours(18, 0, 0, 0);

    const result = await createCalendarEvent(userId, {
      subject: `📁 專案截止：${project.name}`,
      startDateTime,
      endDateTime,
      body: `<p>${project.description || ''}</p><p><a href="${FRONTEND_URL()}">前往 xCloudPMIS</a></p>`,
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[calendar] 專案行事曆失敗:', err.message);
    if (err.needsReauth) {
      return res.status(401).json({ success: false, error: '請先連結 Microsoft 帳號', needsReauth: true });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/calendar/events
// 取得用戶 Outlook 行事曆事件
// ════════════════════════════════════════════════════════════
router.get('/events', requireAuth, async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ success: false, error: '請提供 startDate 和 endDate' });
  }

  try {
    const events = await getUserCalendarEvents(userId, startDate, endDate);
    return res.json({ success: true, data: events });
  } catch (err) {
    console.error('[calendar] 取得行事曆失敗:', err.message);
    if (err.needsReauth) {
      return res.status(401).json({ success: false, error: '請先連結 Microsoft 帳號', needsReauth: true });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── ICS 工具函式 ──────────────────────────────────────────
function formatIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function formatIcsDateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function escapeIcs(text) {
  if (!text) return '';
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/**
 * 產生「加入行事曆」的簽名 token（供郵件使用）
 * @param {number} userId   收件者 ID
 * @param {number} taskId   任務 ID
 * @returns {string}        JWT token（7 天有效）
 */
function generateCalendarToken(userId, taskId) {
  return jwt.sign(
    { userId, taskId, purpose: 'calendar-add' },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

/**
 * 產生完整的「加入行事曆」URL（智慧端點：自動嘗試 Graph API → 降級 ICS）
 * 使用 FRONTEND_URL（前端 nginx 會反向代理 /api/ 到後端）
 * @param {number} userId
 * @param {number} taskId
 * @returns {string}
 */
function getCalendarAddUrl(userId, taskId) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3838';
  const token = generateCalendarToken(userId, taskId);
  return `${baseUrl}/api/calendar/task/${taskId}/add?token=${token}`;
}

module.exports = router;
module.exports.generateCalendarToken = generateCalendarToken;
module.exports.getCalendarAddUrl = getCalendarAddUrl;
