#!/usr/bin/env node
/**
 * testDigest.js — 測試定期摘要產生器
 *
 * 測試案例：
 *  1. 產生摘要通知（首次 — 無歷史摘要）
 *  2. 去重機制（間隔未到不重複產生）
 *  3. 摘要通知內容正確（包含統計數據）
 *  4. 使用者關閉摘要後不再產生
 *  5. 不同頻率設定（daily / weekly / monthly）
 */

const { PrismaClient } = require('@prisma/client');
const {
  generateDigestNotifications,
  getUserNotificationSettings,
  updateUserNotificationSettings,
} = require('../src/services/notificationCenter');

const prisma = new PrismaClient();

let pass = 0;
let fail = 0;

function ok(name, result, expected) {
  if (result === expected) {
    console.log(`  ✅ ${name}`);
    pass++;
  } else {
    console.log(`  ❌ ${name} — 預期 ${expected}，實際 ${result}`);
    fail++;
  }
}

function okGte(name, result, min) {
  if (result >= min) {
    console.log(`  ✅ ${name} (${result} >= ${min})`);
    pass++;
  } else {
    console.log(`  ❌ ${name} — 預期 >= ${min}，實際 ${result}`);
    fail++;
  }
}

function okContains(name, text, keyword) {
  if (text && text.includes(keyword)) {
    console.log(`  ✅ ${name}`);
    pass++;
  } else {
    console.log(`  ❌ ${name} — 內容未包含「${keyword}」`);
    fail++;
  }
}

async function cleanDigestNotifications() {
  await prisma.notification.deleteMany({ where: { type: 'system_digest' } });
}

async function main() {
  console.log('\n🧪 定期摘要產生器測試\n');
  console.log('═'.repeat(50));

  // 準備：清除所有 digest 通知
  await cleanDigestNotifications();

  // 取得測試用使用者（Eagle Wu, id=2）
  const userId = 2;

  // ── 測試 1：首次產生摘要 ─────────────────────
  console.log('\n📌 測試 1：首次產生摘要');
  // 先確保 weeklyDigest = true, digestFrequency = 'daily'（方便測試）
  await updateUserNotificationSettings(prisma, userId, {
    weeklyDigest: true,
    digestFrequency: 'daily',
  });

  const created1 = await generateDigestNotifications(prisma);
  okGte('首次產生摘要', created1, 1);

  // 驗證通知存在
  const digest1 = await prisma.notification.findFirst({
    where: { recipientId: userId, type: 'system_digest' },
    orderBy: { createdAt: 'desc' },
  });
  ok('摘要通知已建立', !!digest1, true);
  okContains('標題包含「摘要報告」', digest1?.title, '摘要報告');
  okContains('內容包含「未讀通知」', digest1?.message, '未讀通知');
  okContains('內容包含「待辦」', digest1?.message, '待辦');
  okContains('內容包含「逾期任務」', digest1?.message, '逾期任務');
  okContains('內容包含「期間完成」', digest1?.message, '期間完成');
  ok('resourceType 為 digest', digest1?.resourceType, 'digest');

  // ── 測試 2：去重機制 ──────────────────────────
  console.log('\n📌 測試 2：去重機制（間隔未到不重複產生）');
  const countBefore = await prisma.notification.count({
    where: { recipientId: userId, type: 'system_digest' },
  });
  const created2 = await generateDigestNotifications(prisma);
  const countAfter = await prisma.notification.count({
    where: { recipientId: userId, type: 'system_digest' },
  });
  // daily 間隔是 24h，剛產生過的不應再產生
  ok('去重：不重複產生', countAfter, countBefore);

  // ── 測試 3：使用者關閉摘要 ────────────────────
  console.log('\n📌 測試 3：使用者關閉摘要');
  await cleanDigestNotifications(); // 清除歷史，讓間隔條件通過
  await updateUserNotificationSettings(prisma, userId, {
    weeklyDigest: false,
  });
  const created3 = await generateDigestNotifications(prisma);
  const digestAfterOff = await prisma.notification.findFirst({
    where: { recipientId: userId, type: 'system_digest' },
  });
  ok('關閉摘要後不產生通知', digestAfterOff, null);

  // 恢復設定
  await updateUserNotificationSettings(prisma, userId, {
    weeklyDigest: true,
    digestFrequency: 'weekly',
  });

  // ── 測試 4：頻率標籤正確 ─────────────────────
  console.log('\n📌 測試 4：不同頻率的標題正確');
  await cleanDigestNotifications();

  // daily
  await updateUserNotificationSettings(prisma, userId, {
    weeklyDigest: true,
    digestFrequency: 'daily',
  });
  await generateDigestNotifications(prisma);
  const dailyDigest = await prisma.notification.findFirst({
    where: { recipientId: userId, type: 'system_digest' },
    orderBy: { createdAt: 'desc' },
  });
  okContains('daily 標題包含「每日」', dailyDigest?.title, '每日');
  okContains('daily 內容包含「每日」', dailyDigest?.message, '每日');

  // 清除並切 weekly
  await cleanDigestNotifications();
  await updateUserNotificationSettings(prisma, userId, {
    digestFrequency: 'weekly',
  });
  await generateDigestNotifications(prisma);
  const weeklyDigest = await prisma.notification.findFirst({
    where: { recipientId: userId, type: 'system_digest' },
    orderBy: { createdAt: 'desc' },
  });
  okContains('weekly 標題包含「每週」', weeklyDigest?.title, '每週');

  // 清除並切 monthly
  await cleanDigestNotifications();
  await updateUserNotificationSettings(prisma, userId, {
    digestFrequency: 'monthly',
  });
  await generateDigestNotifications(prisma);
  const monthlyDigest = await prisma.notification.findFirst({
    where: { recipientId: userId, type: 'system_digest' },
    orderBy: { createdAt: 'desc' },
  });
  okContains('monthly 標題包含「每月」', monthlyDigest?.title, '每月');

  // ── 測試 5：admin 也會收到摘要 ────────────────
  console.log('\n📌 測試 5：admin 使用者也會收到摘要');
  await cleanDigestNotifications();
  await updateUserNotificationSettings(prisma, 1, {
    weeklyDigest: true,
    digestFrequency: 'daily',
  });
  await updateUserNotificationSettings(prisma, userId, {
    weeklyDigest: true,
    digestFrequency: 'daily',
  });
  const created5 = await generateDigestNotifications(prisma);
  okGte('多位使用者都收到摘要', created5, 2);

  // ── 清理 & 結果 ──────────────────────────────
  await cleanDigestNotifications();
  // 恢復 Eagle Wu 的設定
  await updateUserNotificationSettings(prisma, userId, {
    weeklyDigest: true,
    digestFrequency: 'weekly',
  });

  console.log('\n' + '═'.repeat(50));
  console.log(`\n📊 結果：${pass + fail} 個測試，✅ ${pass} 通過，❌ ${fail} 失敗\n`);

  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
