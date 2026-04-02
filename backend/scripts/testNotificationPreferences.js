#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });
/**
 * 通知偏好設定 — 嚴格整合測試
 *
 * 測試項目：
 *   ① 事件通知：taskAssigned / taskDueReminder / taskOverdue / taskCompleted / mentioned / projectUpdate
 *   ② 通知管道：pushNotifications / emailNotifications
 *   ③ 摘要報告：weeklyDigest / digestFrequency
 *
 * 策略：
 *   用 userId=1 (admin) 去指派任務給 userId=2 (member)
 *   在每個 case 前先用 PATCH 設定 userId=2 的偏好
 *   然後呼叫 createTaskAssignmentNotifications 模擬事件
 *   最後檢查 DB 是否有對應的 notification 記錄（或被過濾掉）
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const {
  createNotifications,
  createTaskAssignmentNotifications,
  createTaskCommentNotifications,
  getUserNotificationSettings,
  updateUserNotificationSettings,
} = require('../src/services/notificationCenter');

const ADMIN_ID  = 1;
const MEMBER_ID = 2;

let passed = 0;
let failed = 0;
const results = [];

function assert(testName, condition, detail = '') {
  if (condition) {
    passed++;
    results.push({ testName, status: '✅ PASS', detail });
  } else {
    failed++;
    results.push({ testName, status: '❌ FAIL', detail });
  }
}

/** 清除 member 的所有測試通知 */
async function clearTestNotifications() {
  await prisma.notification.deleteMany({ where: { recipientId: MEMBER_ID } });
}

/** 重置 member 的通知設定為全部開啟 */
async function resetSettings() {
  await updateUserNotificationSettings(prisma, MEMBER_ID, {
    taskAssigned:       true,
    taskDueReminder:    true,
    taskOverdue:        true,
    taskCompleted:      true,
    mentioned:          true,
    projectUpdate:      true,
    weeklyDigest:       true,
    emailNotifications: false,
    pushNotifications:  true,
    digestFrequency:    'weekly',
  });
}

/** 取得 member 最新的通知數量 */
async function getNotificationCount() {
  return prisma.notification.count({ where: { recipientId: MEMBER_ID } });
}

/** 找到一個有效的 taskId 做測試用 */
async function getTestTaskId() {
  const task = await prisma.task.findFirst({ select: { id: true } });
  return task?.id || null;
}

// ═══════════════════════════════════════════════════════════
// 測試群組 1：事件通知
// ═══════════════════════════════════════════════════════════

async function testEventNotification(settingKey, notificationType, label) {
  // ── Case A：開啟 → 應收到通知 ──
  await clearTestNotifications();
  await resetSettings();
  await updateUserNotificationSettings(prisma, MEMBER_ID, { [settingKey]: true });

  await createNotifications({
    prisma,
    recipients:   [MEMBER_ID],
    type:         notificationType,
    title:        `測試 ${label} 通知（開啟）`,
    message:      `這是 ${label} 的測試通知`,
    resourceType: 'task',
    resourceId:   1,
  });

  const countOn = await getNotificationCount();
  assert(
    `${label}（開啟）→ 應收到通知`,
    countOn === 1,
    `預期 1 筆通知，實際 ${countOn} 筆`,
  );

  // ── Case B：關閉 → 不應收到通知 ──
  await clearTestNotifications();
  await updateUserNotificationSettings(prisma, MEMBER_ID, { [settingKey]: false });

  await createNotifications({
    prisma,
    recipients:   [MEMBER_ID],
    type:         notificationType,
    title:        `測試 ${label} 通知（關閉）`,
    message:      `這是 ${label} 的測試通知`,
    resourceType: 'task',
    resourceId:   1,
  });

  const countOff = await getNotificationCount();
  assert(
    `${label}（關閉）→ 不應收到通知`,
    countOff === 0,
    `預期 0 筆通知，實際 ${countOff} 筆`,
  );
}

// ═══════════════════════════════════════════════════════════
// 測試群組 2：通知管道
// ═══════════════════════════════════════════════════════════

async function testPushNotificationsChannel() {
  // pushNotifications 關閉 → 即使事件類型開啟，也不應建立通知
  await clearTestNotifications();
  await resetSettings();
  await updateUserNotificationSettings(prisma, MEMBER_ID, {
    taskAssigned:      true,
    pushNotifications: false,  // 關閉系統內通知管道
  });

  await createNotifications({
    prisma,
    recipients:   [MEMBER_ID],
    type:         'task_assigned',
    title:        '測試管道關閉',
    message:      '系統內通知管道關閉，不應收到',
    resourceType: 'task',
    resourceId:   1,
  });

  const count = await getNotificationCount();
  assert(
    '系統內通知（關閉）→ 任何事件都不應收到通知',
    count === 0,
    `預期 0 筆通知，實際 ${count} 筆`,
  );

  // pushNotifications 開啟 → 正常收到
  await clearTestNotifications();
  await updateUserNotificationSettings(prisma, MEMBER_ID, {
    taskAssigned:      true,
    pushNotifications: true,  // 開啟
  });

  await createNotifications({
    prisma,
    recipients:   [MEMBER_ID],
    type:         'task_assigned',
    title:        '測試管道開啟',
    message:      '系統內通知管道開啟，應收到',
    resourceType: 'task',
    resourceId:   1,
  });

  const count2 = await getNotificationCount();
  assert(
    '系統內通知（開啟）→ 正常收到通知',
    count2 === 1,
    `預期 1 筆通知，實際 ${count2} 筆`,
  );
}

async function testEmailNotificationsChannel() {
  // Email 通知管道的設定目前只是保存偏好值
  // 驗證 API 能正確讀寫
  await resetSettings();

  // 開啟
  await updateUserNotificationSettings(prisma, MEMBER_ID, { emailNotifications: true });
  let settings = await getUserNotificationSettings(prisma, MEMBER_ID);
  assert(
    'Email 通知（開啟）→ 設定值為 true',
    settings.emailNotifications === true,
    `實際值: ${settings.emailNotifications}`,
  );

  // 關閉
  await updateUserNotificationSettings(prisma, MEMBER_ID, { emailNotifications: false });
  settings = await getUserNotificationSettings(prisma, MEMBER_ID);
  assert(
    'Email 通知（關閉）→ 設定值為 false',
    settings.emailNotifications === false,
    `實際值: ${settings.emailNotifications}`,
  );
}

// ═══════════════════════════════════════════════════════════
// 測試群組 3：摘要報告
// ═══════════════════════════════════════════════════════════

async function testWeeklyDigest() {
  await resetSettings();

  // 開啟
  await updateUserNotificationSettings(prisma, MEMBER_ID, { weeklyDigest: true });
  let s = await getUserNotificationSettings(prisma, MEMBER_ID);
  assert(
    '定期摘要（開啟）→ 設定值為 true',
    s.weeklyDigest === true,
    `實際值: ${s.weeklyDigest}`,
  );

  // 關閉
  await updateUserNotificationSettings(prisma, MEMBER_ID, { weeklyDigest: false });
  s = await getUserNotificationSettings(prisma, MEMBER_ID);
  assert(
    '定期摘要（關閉）→ 設定值為 false',
    s.weeklyDigest === false,
    `實際值: ${s.weeklyDigest}`,
  );
}

async function testDigestFrequency() {
  await resetSettings();

  for (const freq of ['daily', 'weekly', 'monthly']) {
    await updateUserNotificationSettings(prisma, MEMBER_ID, { digestFrequency: freq });
    const s = await getUserNotificationSettings(prisma, MEMBER_ID);
    assert(
      `摘要頻率 → ${freq}`,
      s.digestFrequency === freq,
      `實際值: ${s.digestFrequency}`,
    );
  }
}

// ═══════════════════════════════════════════════════════════
// 測試群組 4：實際任務指派流程（端到端）
// ═══════════════════════════════════════════════════════════

async function testRealTaskAssignment() {
  const taskId = await getTestTaskId();
  if (!taskId) {
    results.push({ testName: '任務指派端到端測試', status: '⚠️ SKIP', detail: '無可用的 task' });
    return;
  }

  // 開啟 taskAssigned → 應收到
  await clearTestNotifications();
  await resetSettings();
  await createTaskAssignmentNotifications(prisma, {
    taskId,
    projectId:   1,
    recipientId: MEMBER_ID,
    actorId:     ADMIN_ID,
  });

  let count = await getNotificationCount();
  assert(
    '任務指派 E2E（開啟）→ 收到通知',
    count === 1,
    `預期 1 筆通知，實際 ${count} 筆`,
  );

  // 關閉 taskAssigned → 不應收到
  await clearTestNotifications();
  await updateUserNotificationSettings(prisma, MEMBER_ID, { taskAssigned: false });
  await createTaskAssignmentNotifications(prisma, {
    taskId,
    projectId:   1,
    recipientId: MEMBER_ID,
    actorId:     ADMIN_ID,
  });

  count = await getNotificationCount();
  assert(
    '任務指派 E2E（關閉）→ 不收到通知',
    count === 0,
    `預期 0 筆通知，實際 ${count} 筆`,
  );
}

// ═══════════════════════════════════════════════════════════
// HTTP API 測試（走完 GET/PATCH 端點）
// ═══════════════════════════════════════════════════════════

async function testHTTPApi() {
  const jwt = require('jsonwebtoken');
  const { JWT_SECRET } = require('../src/config/jwt');
  const token = jwt.sign({ id: MEMBER_ID, email: 'eagle_w@cloudinfo.com.tw', role: 'member', companyId: 1 }, JWT_SECRET, { expiresIn: '1h' });
  const base = 'http://localhost:3000';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // GET
  const getRes = await fetch(`${base}/api/settings/notifications`, { headers });
  const getData = await getRes.json();
  assert(
    'HTTP GET 通知設定 → 200',
    getRes.status === 200,
    `status=${getRes.status}`,
  );
  assert(
    'HTTP GET 回傳 settings 物件',
    getData.settings && typeof getData.settings === 'object',
    `keys: ${Object.keys(getData.settings || {}).join(', ')}`,
  );

  // PATCH — 更新成功
  const patchRes = await fetch(`${base}/api/settings/notifications/${MEMBER_ID}`, {
    method:  'PATCH',
    headers,
    body:    JSON.stringify({ taskAssigned: false, emailNotifications: true }),
  });
  const patchData = await patchRes.json();
  assert(
    'HTTP PATCH 更新設定 → 200',
    patchRes.status === 200,
    `status=${patchRes.status}`,
  );
  assert(
    'HTTP PATCH 回傳已更新的 settings',
    patchData.settings?.taskAssigned === false && patchData.settings?.emailNotifications === true,
    `taskAssigned=${patchData.settings?.taskAssigned}, emailNotifications=${patchData.settings?.emailNotifications}`,
  );

  // PATCH — 不能改別人的設定
  const patchOtherRes = await fetch(`${base}/api/settings/notifications/${ADMIN_ID}`, {
    method:  'PATCH',
    headers,
    body:    JSON.stringify({ taskAssigned: false }),
  });
  assert(
    'HTTP PATCH 改別人設定 → 403',
    patchOtherRes.status === 403,
    `status=${patchOtherRes.status}`,
  );
}

// ═══════════════════════════════════════════════════════════
// 主程式
// ═══════════════════════════════════════════════════════════

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   通知偏好設定 — 嚴格整合測試             ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  try {
    // ── 事件通知（6 種） ──────────────────────────
    console.log('━━ ① 事件通知 ━━━━━━━━━━━━━━━━━━━━━━━━━━');
    // 使用與 Prisma NotificationType enum 一致的 type
    await testEventNotification('taskAssigned',    'task_assigned',        '任務指派');
    await testEventNotification('taskDueReminder', 'deadline_approaching', '到期提醒');
    await testEventNotification('taskCompleted',   'task_completed',       '任務完成');
    await testEventNotification('mentioned',       'mentioned',            '被提及');
    await testEventNotification('mentioned',       'comment_added',        '留言通知（歸類至被提及）');
    await testEventNotification('projectUpdate',   'milestone_achieved',   '里程碑達成（歸類至專案更新）');

    // ── 通知管道 ─────────────────────────────────
    console.log('━━ ② 通知管道 ━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await testPushNotificationsChannel();
    await testEmailNotificationsChannel();

    // ── 摘要報告 ─────────────────────────────────
    console.log('━━ ③ 摘要報告 ━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await testWeeklyDigest();
    await testDigestFrequency();

    // ── 端到端任務指派 ───────────────────────────
    console.log('━━ ④ 任務指派端到端 ━━━━━━━━━━━━━━━━━━━━');
    await testRealTaskAssignment();

    // ── HTTP API ─────────────────────────────────
    console.log('━━ ⑤ HTTP API 測試 ━━━━━━━━━━━━━━━━━━━━━');
    await testHTTPApi();

  } catch (err) {
    console.error('測試執行錯誤:', err);
    failed++;
    results.push({ testName: '未預期錯誤', status: '❌ FAIL', detail: err.message });
  }

  // 清理
  await clearTestNotifications();
  await resetSettings();

  // 輸出結果
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║            測 試 結 果 報 告              ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  for (const r of results) {
    console.log(`  ${r.status}  ${r.testName}`);
    if (r.detail) console.log(`           ${r.detail}`);
  }
  console.log('');
  console.log(`  ─────────────────────────────────`);
  console.log(`  通過: ${passed}    失敗: ${failed}    總計: ${passed + failed}`);
  console.log('');

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main();
