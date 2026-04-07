/**
 * notificationScheduler — 到期提醒 / 逾期警示 定時掃描
 *
 * 使用 setInterval（免安裝 node-cron），預設每 30 分鐘掃描一次。
 * 在 index.js 伺服器啟動後呼叫 startNotificationScheduler()。
 */

const { PrismaClient } = require('@prisma/client');
const {
  scanDeadlineApproaching,
  scanTaskOverdue,
} = require('./notificationCenter');

const SCAN_INTERVAL_MS = parseInt(process.env.NOTIF_SCAN_INTERVAL_MS, 10) || 30 * 60 * 1000; // 預設 30 分鐘
let intervalId = null;
let prisma = null;           // 延遲建立，避免 import side-effect

async function runScan() {
  if (!prisma) prisma = new PrismaClient();
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

function startNotificationScheduler() {
  if (intervalId) return; // 已在執行
  console.log(`⏰ 通知排程器已啟動（每 ${SCAN_INTERVAL_MS / 60000} 分鐘掃描一次到期 / 逾期任務）`);
  // 啟動後延遲 10 秒先跑一次
  setTimeout(() => runScan(), 10_000);
  intervalId = setInterval(runScan, SCAN_INTERVAL_MS);
}

function stopNotificationScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[notificationScheduler] 排程器已停止');
  }
  if (prisma) {
    prisma.$disconnect().catch(() => {});
    prisma = null;
  }
}

module.exports = { startNotificationScheduler, stopNotificationScheduler };
