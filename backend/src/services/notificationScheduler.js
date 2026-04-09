/**
 * notificationScheduler — 到期提醒 / 逾期警示 / 定期摘要 定時掃描
 *
 * 使用 setInterval（免安裝 node-cron），預設每 30 分鐘掃描一次。
 * 在 index.js 伺服器啟動後呼叫 startNotificationScheduler()。
 */

const prisma = require('../lib/prisma');
const {
  scanDeadlineApproaching,
  scanTaskOverdue,
  generateDigestNotifications,
} = require('./notificationCenter');

const SCAN_INTERVAL_MS = parseInt(process.env.NOTIF_SCAN_INTERVAL_MS, 10) || 30 * 60 * 1000; // 預設 30 分鐘
const DIGEST_INTERVAL_MS = parseInt(process.env.DIGEST_SCAN_INTERVAL_MS, 10) || 60 * 60 * 1000; // 預設 60 分鐘
let intervalId = null;
let digestIntervalId = null;

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

function startNotificationScheduler() {
  if (intervalId) return; // 已在執行

  const isDev = process.env.NODE_ENV !== 'production';

  console.log(`⏰ 通知排程器已啟動（每 ${SCAN_INTERVAL_MS / 60000} 分鐘掃描到期/逾期，每 ${DIGEST_INTERVAL_MS / 60000} 分鐘掃描摘要）`);

  // 到期/逾期掃描：啟動後延遲 10 秒先跑一次
  setTimeout(() => runScan(), 10_000);
  intervalId = setInterval(runScan, SCAN_INTERVAL_MS);

  // 摘要掃描：正式環境啟動 30 秒後跑第一次；開發環境只靠 interval 不立即觸發
  if (!isDev) {
    setTimeout(() => runDigestScan(), 30_000);
  }
  digestIntervalId = setInterval(runDigestScan, DIGEST_INTERVAL_MS);
}

function stopNotificationScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (digestIntervalId) {
    clearInterval(digestIntervalId);
    digestIntervalId = null;
  }
  console.log('[notificationScheduler] 排程器已停止');
}

module.exports = { startNotificationScheduler, stopNotificationScheduler };
