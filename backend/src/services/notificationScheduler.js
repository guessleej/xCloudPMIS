/**
 * notificationScheduler — 到期提醒 / 逾期警示 / 定期摘要 定時掃描
 *
 * 使用 setInterval（免安裝 node-cron），預設每 30 分鐘掃描一次。
 * 在 index.js 伺服器啟動後呼叫 startNotificationScheduler()。
 */

const { PrismaClient } = require('@prisma/client');
const {
  scanDeadlineApproaching,
  scanTaskOverdue,
  generateDigestNotifications,
} = require('./notificationCenter');

const SCAN_INTERVAL_MS = parseInt(process.env.NOTIF_SCAN_INTERVAL_MS, 10) || 30 * 60 * 1000; // 預設 30 分鐘
const DIGEST_INTERVAL_MS = parseInt(process.env.DIGEST_SCAN_INTERVAL_MS, 10) || 60 * 60 * 1000; // 預設 60 分鐘
let intervalId = null;
let digestIntervalId = null;
let prisma = null;           // 延遲建立，避免 import side-effect

function getPrisma() {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

async function runScan() {
  const p = getPrisma();
  try {
    const approaching = await scanDeadlineApproaching(p);
    const overdue     = await scanTaskOverdue(p);
    if (approaching || overdue) {
      console.log(`[notificationScheduler] 掃描完成：到期提醒 ${approaching} 筆、逾期警示 ${overdue} 筆`);
    }
  } catch (e) {
    console.warn('[notificationScheduler] 掃描失敗:', e.message);
  }
}

async function runDigestScan() {
  const p = getPrisma();
  try {
    const created = await generateDigestNotifications(p);
    if (created > 0) {
      console.log(`[notificationScheduler] 摘要報告產生完成：${created} 筆`);
    }
  } catch (e) {
    console.warn('[notificationScheduler] 摘要掃描失敗:', e.message);
  }
}

function startNotificationScheduler() {
  if (intervalId) return; // 已在執行
  console.log(`⏰ 通知排程器已啟動（每 ${SCAN_INTERVAL_MS / 60000} 分鐘掃描到期/逾期，每 ${DIGEST_INTERVAL_MS / 60000} 分鐘掃描摘要）`);
  // 啟動後延遲 10 秒先跑一次
  setTimeout(() => runScan(), 10_000);
  setTimeout(() => runDigestScan(), 15_000);
  intervalId = setInterval(runScan, SCAN_INTERVAL_MS);
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
  if (prisma) {
    prisma.$disconnect().catch(() => {});
    prisma = null;
  }
  console.log('[notificationScheduler] 排程器已停止');
}

module.exports = { startNotificationScheduler, stopNotificationScheduler };
