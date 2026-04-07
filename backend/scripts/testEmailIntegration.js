#!/usr/bin/env node
/**
 * testEmailIntegration.js — 測試 Email 通知串接
 *
 * 驗證：
 *  1. emailNotifications=false 時不觸發 email
 *  2. emailNotifications=true 時觸發 email（但因為沒設 O365 會 graceful 失敗）
 *  3. 各通知類型都正確觸發 dispatchEmailNotifications
 *  4. 摘要也會嘗試發送 email
 *
 * 注意：此測試不真的發信（除非設定了 O365 環境變數），
 *       而是驗證邏輯流程正確 + console.log 輸出正確
 */

const { PrismaClient } = require('@prisma/client');
const {
  createNotifications,
  createTaskAssignmentNotifications,
  generateDigestNotifications,
  getUserNotificationSettings,
  updateUserNotificationSettings,
} = require('../src/services/notificationCenter');

const prisma = new PrismaClient();

let pass = 0;
let fail = 0;
const logs = [];

// 攔截 console.log / console.warn 來檢測 email 觸發
const origLog  = console.log;
const origWarn = console.warn;

function startCapture() {
  logs.length = 0;
  console.log = (...args) => {
    logs.push(args.join(' '));
    origLog(...args);
  };
  console.warn = (...args) => {
    logs.push(args.join(' '));
    origWarn(...args);
  };
}

function stopCapture() {
  console.log  = origLog;
  console.warn = origWarn;
}

function hasLog(keyword) {
  return logs.some(l => l.includes(keyword));
}

function ok(name, result, expected) {
  if (result === expected) {
    origLog(`  ✅ ${name}`);
    pass++;
  } else {
    origLog(`  ❌ ${name} — 預期 ${expected}，實際 ${result}`);
    fail++;
  }
}

async function cleanup() {
  await prisma.notification.deleteMany({
    where: { recipientId: 2 },
  });
}

async function main() {
  origLog('\n🧪 Email 通知串接測試\n');
  origLog('═'.repeat(50));

  const userId = 2; // Eagle Wu

  // ── 測試 1：emailNotifications=false 時不觸發 email ─────
  origLog('\n📌 測試 1：emailNotifications=false 不觸發 email');
  await cleanup();
  await updateUserNotificationSettings(prisma, userId, {
    emailNotifications: false,
    taskAssigned: true,
    pushNotifications: true,
  });

  startCapture();
  await createNotifications({
    prisma,
    recipients:   [userId],
    type:         'task_assigned',
    title:        'Email 測試任務',
    message:      '測試用',
    resourceType: 'task',
    resourceId:   1,
  });
  // 等待一下讓 fire-and-forget 完成
  await new Promise(r => setTimeout(r, 500));
  stopCapture();

  const emailTriggered1 = hasLog('觸發 Email 發送');
  ok('emailNotifications=false → 不觸發 email', emailTriggered1, false);

  // 確認通知仍然建立
  const notif1 = await prisma.notification.findFirst({
    where: { recipientId: userId, type: 'task_assigned', title: 'Email 測試任務' },
  });
  ok('通知仍正常建立', !!notif1, true);

  // ── 測試 2：emailNotifications=true 時觸發 email ────────
  origLog('\n📌 測試 2：emailNotifications=true 觸發 email');
  await cleanup();
  await updateUserNotificationSettings(prisma, userId, {
    emailNotifications: true,
  });

  startCapture();
  await createNotifications({
    prisma,
    recipients:   [userId],
    type:         'task_assigned',
    title:        'Email 觸發測試',
    message:      '應該觸發 email',
    resourceType: 'task',
    resourceId:   1,
  });
  await new Promise(r => setTimeout(r, 1000));
  stopCapture();

  const emailTriggered2 = hasLog('觸發 Email 發送');
  ok('emailNotifications=true → 觸發 email', emailTriggered2, true);

  // ── 測試 3：各通知類型都觸發 email ──────────────────────
  origLog('\n📌 測試 3：各通知類型都觸發 email');
  const testTypes = [
    { type: 'task_assigned',        title: '任務指派 email 測試' },
    { type: 'deadline_approaching', title: '截止提醒 email 測試' },
    { type: 'task_overdue',         title: '逾期警示 email 測試' },
    { type: 'mentioned',            title: '提及 email 測試' },
    { type: 'comment_added',        title: '評論 email 測試' },
    { type: 'task_completed',       title: '完成 email 測試' },
    { type: 'milestone_achieved',   title: '里程碑 email 測試' },
  ];

  let allTriggered = true;
  for (const { type, title } of testTypes) {
    await cleanup();

    startCapture();
    await createNotifications({
      prisma,
      recipients:   [userId],
      type,
      title,
      message:      '各類型 email 測試',
      resourceType: 'task',
      resourceId:   1,
    });
    await new Promise(r => setTimeout(r, 500));
    stopCapture();

    const triggered = hasLog('觸發 Email 發送');
    if (!triggered) {
      origLog(`  ⚠️ ${type} 未觸發 email`);
      allTriggered = false;
    }
  }
  ok('所有 7 種通知類型都觸發 email', allTriggered, true);

  // ── 測試 4：摘要也觸發 email ─────────────────────────────
  origLog('\n📌 測試 4：摘要通知也觸發 email');
  await cleanup();
  await prisma.notification.deleteMany({ where: { type: 'system_digest' } });
  await updateUserNotificationSettings(prisma, userId, {
    weeklyDigest: true,
    digestFrequency: 'daily',
    emailNotifications: true,
  });

  startCapture();
  await generateDigestNotifications(prisma);
  await new Promise(r => setTimeout(r, 1000));
  stopCapture();

  // 摘要 email 發送會在 log 中出現 📧 或嘗試（即使失敗也 ok）
  const digestEmailAttempted = hasLog('發送郵件') || hasLog('摘要郵件') || hasLog('O365_SENDER_EMAIL');
  ok('摘要也嘗試發送 email', digestEmailAttempted, true);

  // ── 測試 5：emailNotifications=false 時摘要不發 email ───
  origLog('\n📌 測試 5：emailNotifications=false 摘要不觸發 email');
  await prisma.notification.deleteMany({ where: { type: 'system_digest' } });
  await updateUserNotificationSettings(prisma, userId, {
    emailNotifications: false,
  });

  startCapture();
  await generateDigestNotifications(prisma);
  await new Promise(r => setTimeout(r, 500));
  stopCapture();

  const digestEmailOff = hasLog('發送郵件') || hasLog('📧');
  ok('emailNotifications=false → 摘要不發 email', digestEmailOff, false);

  // ── 清理 & 恢復 ─────────────────────────────────────────
  await cleanup();
  await prisma.notification.deleteMany({ where: { type: 'system_digest' } });
  await updateUserNotificationSettings(prisma, userId, {
    emailNotifications: false,
    weeklyDigest: true,
    digestFrequency: 'weekly',
  });

  origLog('\n' + '═'.repeat(50));
  origLog(`\n📊 結果：${pass + fail} 個測試，✅ ${pass} 通過，❌ ${fail} 失敗\n`);

  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  origLog(e);
  prisma.$disconnect();
  process.exit(1);
});
