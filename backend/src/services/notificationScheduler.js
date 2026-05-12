/**
 * notificationScheduler — 到期提醒 / 逾期警示 / 定期摘要 / 每日進度提醒
 *
 * 使用 setInterval / setTimeout（免安裝 node-cron）。
 * 在 index.js 伺服器啟動後呼叫 startNotificationScheduler()。
 */

const prisma = require('../lib/prisma');
const {
  DEFAULT_NOTIFICATION_SETTINGS,
  scanDeadlineApproaching,
  scanTaskOverdue,
  generateDigestNotifications,
  generateDailyProgressReminderNotifications,
} = require('./notificationCenter');

const SCAN_INTERVAL_MS = parseInt(process.env.NOTIF_SCAN_INTERVAL_MS, 10) || 30 * 60 * 1000; // 預設 30 分鐘
const DIGEST_INTERVAL_MS = parseInt(process.env.DIGEST_SCAN_INTERVAL_MS, 10) || 60 * 60 * 1000; // 預設 60 分鐘
const PROGRESS_REMINDER_STARTUP_DELAY_MS = parseInt(process.env.PROGRESS_REMINDER_STARTUP_DELAY_MS, 10) || 15 * 1000;
const PROGRESS_REMINDER_SETTINGS_REFRESH_MS = parseInt(process.env.PROGRESS_REMINDER_SETTINGS_REFRESH_MS, 10) || 60 * 1000;
const TAIPEI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const DEFAULT_DAILY_PROGRESS_REMINDER_DAYS = [1, 2, 3, 4, 5, 6, 0];
let intervalId = null;
let digestIntervalId = null;
let progressReminderTimeoutId = null;
let progressReminderStopped = false;

function parseReminderTimeMinutes(value) {
  const match = String(value || '14:00').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 14 * 60;
  const hh = Math.min(Math.max(parseInt(match[1], 10), 0), 23);
  const mm = Math.min(Math.max(parseInt(match[2], 10), 0), 59);
  return hh * 60 + mm;
}

function normalizeReminderDays(value) {
  const source = Array.isArray(value) ? value : DEFAULT_DAILY_PROGRESS_REMINDER_DAYS;
  const days = [];

  for (const day of source) {
    const parsed = Number(day);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 && !days.includes(parsed)) {
      days.push(parsed);
    }
  }

  return days.length
    ? DEFAULT_DAILY_PROGRESS_REMINDER_DAYS.filter(day => days.includes(day))
    : [...DEFAULT_DAILY_PROGRESS_REMINDER_DAYS];
}

function getTaipeiCalendarParts(date = new Date()) {
  const taipei = new Date(date.getTime() + TAIPEI_UTC_OFFSET_MS);
  return {
    year: taipei.getUTCFullYear(),
    month: taipei.getUTCMonth(),
    day: taipei.getUTCDate(),
  };
}

function taipeiDateUtcMs(parts, dayOffset, minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return Date.UTC(parts.year, parts.month, parts.day + dayOffset, hour - 8, minute, 0, 0);
}

function taipeiWeekday(parts, dayOffset) {
  return new Date(Date.UTC(parts.year, parts.month, parts.day + dayOffset, 0, 0, 0, 0)).getUTCDay();
}

function normalizeNotificationSettings(settings = {}) {
  const merged = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...((settings && typeof settings === 'object') ? settings : {}),
  };

  return {
    ...merged,
    dailyProgressReminderDays: normalizeReminderDays(merged.dailyProgressReminderDays),
  };
}

function findNextProgressReminderRunAtForSettings(settings = {}, now = new Date()) {
  const prefs = normalizeNotificationSettings(settings);
  if (!prefs.dailyProgressReminder) return null;
  if (!prefs.pushNotifications && !prefs.emailNotifications) return null;

  const parts = getTaipeiCalendarParts(now);
  const reminderMinutes = parseReminderTimeMinutes(prefs.dailyProgressReminderTime);

  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const weekday = taipeiWeekday(parts, dayOffset);
    if (!prefs.dailyProgressReminderDays.includes(weekday)) continue;

    const runAtMs = taipeiDateUtcMs(parts, dayOffset, reminderMinutes);
    if (runAtMs > now.getTime()) return new Date(runAtMs);
  }

  return null;
}

async function getNextProgressReminderRunAt(prismaClient, now = new Date()) {
  const users = await prismaClient.user.findMany({
    where: { isActive: true },
    select: { settings: true },
  });

  let nextRunAt = null;
  for (const user of users) {
    const settings = (user.settings && typeof user.settings === 'object')
      ? (user.settings.notificationSettings || {})
      : {};
    const candidate = findNextProgressReminderRunAtForSettings(settings, now);
    if (candidate && (!nextRunAt || candidate < nextRunAt)) {
      nextRunAt = candidate;
    }
  }

  return nextRunAt;
}

function scheduleProgressReminderTimeout(delayMs, shouldRunScan) {
  if (progressReminderTimeoutId) clearTimeout(progressReminderTimeoutId);
  progressReminderTimeoutId = setTimeout(async () => {
    progressReminderTimeoutId = null;
    if (progressReminderStopped) return;

    if (shouldRunScan) {
      await runProgressReminderScan();
    }
    await scheduleNextProgressReminderScan();
  }, Math.max(1000, delayMs));
}

async function scheduleNextProgressReminderScan() {
  if (progressReminderStopped) return;

  try {
    const now = new Date();
    const nextRunAt = await getNextProgressReminderRunAt(prisma, now);
    if (!nextRunAt) {
      scheduleProgressReminderTimeout(PROGRESS_REMINDER_SETTINGS_REFRESH_MS, false);
      return;
    }

    const delayMs = nextRunAt.getTime() - now.getTime();
    const shouldRunScan = delayMs <= PROGRESS_REMINDER_SETTINGS_REFRESH_MS;
    scheduleProgressReminderTimeout(
      shouldRunScan ? delayMs : PROGRESS_REMINDER_SETTINGS_REFRESH_MS,
      shouldRunScan,
    );
  } catch (e) {
    console.warn('[notificationScheduler] 每日進度提醒下次排程計算失敗:', e.message);
    scheduleProgressReminderTimeout(PROGRESS_REMINDER_SETTINGS_REFRESH_MS, false);
  }
}

async function runScan() {
  try {
    const approaching = await scanDeadlineApproaching(prisma);
    const overdue     = await scanTaskOverdue(prisma);
    if (approaching || overdue) {
      console.log(`[notificationScheduler] 掃描完成：到期提醒 ${approaching} 筆、逾期警示 ${overdue} 筆`);
    }
  } catch (e) {
    console.warn('[notificationScheduler] 掃描失敗:', e.message);
  }
}

async function runDigestScan() {
  try {
    const created = await generateDigestNotifications(prisma);
    if (created > 0) {
      console.log(`[notificationScheduler] 摘要報告產生完成：${created} 筆`);
    }
  } catch (e) {
    console.warn('[notificationScheduler] 摘要掃描失敗:', e.message);
  }
}

async function runProgressReminderScan() {
  try {
    const created = await generateDailyProgressReminderNotifications(prisma);
    if (created > 0) {
      console.log(`[notificationScheduler] 每日進度提醒產生完成：${created} 筆`);
    }
  } catch (e) {
    console.warn('[notificationScheduler] 每日進度提醒掃描失敗:', e.message);
  }
}

function startNotificationScheduler() {
  if (intervalId) return; // 已在執行

  const isDev = process.env.NODE_ENV !== 'production';
  progressReminderStopped = false;

  console.log(`⏰ 通知排程器已啟動（每 ${SCAN_INTERVAL_MS / 60000} 分鐘掃描到期/逾期，每 ${DIGEST_INTERVAL_MS / 60000} 分鐘掃描摘要；每日進度提醒依使用者時間精準排程，設定每 ${PROGRESS_REMINDER_SETTINGS_REFRESH_MS / 1000} 秒刷新）`);

  // 到期/逾期掃描：啟動後延遲 10 秒先跑一次
  setTimeout(() => runScan(), 10_000);
  intervalId = setInterval(runScan, SCAN_INTERVAL_MS);

  setTimeout(async () => {
    await runProgressReminderScan();
    await scheduleNextProgressReminderScan();
  }, PROGRESS_REMINDER_STARTUP_DELAY_MS);

  // 摘要掃描：僅正式環境啟動（開發環境不跑，避免重啟時誤寄信件）
  if (!isDev) {
    setTimeout(() => runDigestScan(), 30_000);
    digestIntervalId = setInterval(runDigestScan, DIGEST_INTERVAL_MS);
  } else {
    console.log('  ℹ️  開發環境：摘要排程已停用（每日進度提醒仍會掃描）');
  }
}

function stopNotificationScheduler() {
  progressReminderStopped = true;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (digestIntervalId) {
    clearInterval(digestIntervalId);
    digestIntervalId = null;
  }
  if (progressReminderTimeoutId) {
    clearTimeout(progressReminderTimeoutId);
    progressReminderTimeoutId = null;
  }
  console.log('[notificationScheduler] 排程器已停止');
}

module.exports = {
  startNotificationScheduler,
  stopNotificationScheduler,
  __testing: {
    findNextProgressReminderRunAtForSettings,
    getTaipeiCalendarParts,
    normalizeReminderDays,
    parseReminderTimeMinutes,
    taipeiDateUtcMs,
    taipeiWeekday,
  },
};
