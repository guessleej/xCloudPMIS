#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 *  通知偏好設定 — 真實 API 端到端嚴格測試
 * ═══════════════════════════════════════════════════════════════════
 *
 * 流程：
 *   1. 用 admin (id=1) 的 JWT 建立一個測試專案
 *   2. 把 member (id=2) 加入專案
 *   3. 針對每個通知項目：
 *      a. PATCH 設定 member 的偏好（開啟 or 關閉）
 *      b. 用 admin 透過 API 觸發真實事件（建立任務/留言/完成任務等）
 *      c. 查詢 member 的通知，檢查是否正確收到/被擋住
 *   4. 測試通知管道（pushNotifications 關閉 = 全擋）
 *   5. 測試摘要報告設定的讀寫
 *   6. 清理測試資料
 *
 * 覆蓋：
 *   ① task_assigned（建立+更新指派）
 *   ② comment_added（留言通知）
 *   ③ task_completed（任務完成 via taskRuleEngine）
 *   ④ deadline_approaching（直接 createNotifications，DB 無 API 觸發）
 *   ⑤ mentioned（直接 createNotifications，DB 無 API 觸發）
 *   ⑥ milestone_achieved（直接 createNotifications，DB 無 API 觸發）
 *   ⑦ pushNotifications 管道開關
 *   ⑧ emailNotifications 設定讀寫
 *   ⑨ 摘要報告 weeklyDigest + digestFrequency
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { JWT_SECRET } = require('../src/config/jwt');
const {
  createNotifications,
  getUserNotificationSettings,
  updateUserNotificationSettings,
} = require('../src/services/notificationCenter');

const prisma = new PrismaClient();
const BASE = 'http://localhost:3000';

const ADMIN_ID = 1;
const MEMBER_ID = 2;
const COMPANY_ID = 1;

// JWT tokens
const adminToken = jwt.sign(
  { id: ADMIN_ID, email: 'admin@company.com', role: 'admin', companyId: COMPANY_ID },
  JWT_SECRET,
  { expiresIn: '1h' },
);
const memberToken = jwt.sign(
  { id: MEMBER_ID, email: 'eagle_w@cloudinfo.com.tw', role: 'member', companyId: COMPANY_ID },
  JWT_SECRET,
  { expiresIn: '1h' },
);

const adminHeaders = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
const memberHeaders = { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' };

let passed = 0;
let failed = 0;
const results = [];

// ── 測試資源追蹤 ─────────────────────────────────────────
let testProjectId = null;
const testTaskIds = [];

function assert(testName, condition, detail = '') {
  if (condition) {
    passed++;
    results.push({ testName, status: '✅ PASS', detail });
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    results.push({ testName, status: '❌ FAIL', detail });
    console.log(`  ❌ ${testName}  (${detail})`);
  }
}

// ── Helper ───────────────────────────────────────────────
async function api(method, path, body = null, headers = adminHeaders) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

/** 從 API 回應中取得資源 ID（API 格式: { success, data: { id } }） */
function getId(apiResult) {
  const d = apiResult?.data;
  return d?.data?.id || d?.id || null;
}

/** 清除 member 的所有通知 */
async function clearNotifications() {
  await prisma.notification.deleteMany({ where: { recipientId: MEMBER_ID } });
}

/** 取得 member 的通知 */
async function getNotifications() {
  return prisma.notification.findMany({
    where: { recipientId: MEMBER_ID },
    orderBy: { createdAt: 'desc' },
  });
}

/** 重置 member 通知設定	 */
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

/** 設定 member 的某個偏好 */
async function setSetting(key, value) {
  await updateUserNotificationSettings(prisma, MEMBER_ID, { [key]: value });
}

/** 等待一小段時間讓 fire-and-forget 通知寫入完畢 */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════════
// SETUP：建立測試專案
// ═══════════════════════════════════════════════════════════
async function setup() {
  console.log('\n🔧 建立測試專案與成員…');

  // 建立專案
  const { status, data } = await api('POST', '/api/projects', {
    name: `__E2E_通知測試_${Date.now()}`,
    description: 'E2E 通知偏好測試用專案（測試後刪除）',
    status: 'active',
    companyId: COMPANY_ID,
    ownerId: ADMIN_ID,
  });

  if (status !== 200 && status !== 201) {
    console.error('❌ 無法建立測試專案:', JSON.stringify(data));
    process.exit(1);
  }

  testProjectId = data?.data?.id || data?.id;
  if (!testProjectId) {
    console.error('❌ 無法取得專案 ID:', JSON.stringify(data));
    process.exit(1);
  }
  console.log(`   ✓ 專案 ID: ${testProjectId}`);

  // member 會在第一次被指派任務時自動加入專案（projectMember.upsert）
  // 這裡先手動加入，確保 buildNotificationContext 能抓到
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: testProjectId, userId: MEMBER_ID } },
    update: {},
    create: { projectId: testProjectId, userId: MEMBER_ID, role: 'editor' },
  });
  console.log(`   ✓ 已將 member(id=${MEMBER_ID}) 加入專案`);

  // 重置通知設定
  await resetSettings();
  await clearNotifications();
  console.log('   ✓ 通知設定已重置、舊通知已清除\n');
}

// ═══════════════════════════════════════════════════════════
// ① task_assigned — 建立任務指派
// ═══════════════════════════════════════════════════════════
async function test_taskAssigned_ON() {
  await clearNotifications();
  await resetSettings();
  await setSetting('taskAssigned', true);

  const res1 = await api('POST', `/api/projects/${testProjectId}/tasks`, {
    title: '測試任務指派（開啟）',
    description: '通知偏好開啟，member 應收到',
    priority: 'medium',
    status: 'todo',
    assigneeId: MEMBER_ID,
  });
  const taskId = getId(res1);
  if (taskId) testTaskIds.push(taskId);

  await sleep(800);
  const notifs = await getNotifications();
  assert(
    '① 任務指派（開啟）→ 收到通知',
    notifs.length === 1 && notifs[0].type === 'task_assigned',
    `通知數=${notifs.length}, type=${notifs[0]?.type}, taskId=${taskId}, apiStatus=${res1.status}`,
  );
}

async function test_taskAssigned_OFF() {
  await clearNotifications();
  await resetSettings();
  await setSetting('taskAssigned', false);

  const res1 = await api('POST', `/api/projects/${testProjectId}/tasks`, {
    title: '測試任務指派（關閉）',
    description: '通知偏好關閉，member 不應收到',
    priority: 'low',
    status: 'todo',
    assigneeId: MEMBER_ID,
  });
  const taskId = getId(res1);
  if (taskId) testTaskIds.push(taskId);

  await sleep(500);
  const notifs = await getNotifications();
  assert(
    '① 任務指派（關閉）→ 不收到通知',
    notifs.length === 0,
    `通知數=${notifs.length}`,
  );
}

// ═══════════════════════════════════════════════════════════
// ① task_assigned — 更新任務改指派人
// ═══════════════════════════════════════════════════════════
async function test_taskAssigned_Update_ON() {
  await clearNotifications();
  await resetSettings();
  await setSetting('taskAssigned', true);

  // 先建一個不指派的任務
  const r1 = await api('POST', `/api/projects/${testProjectId}/tasks`, {
    title: '測試更新指派（開啟）',
    priority: 'medium',
    status: 'todo',
  });
  const taskId = getId(r1);
  if (taskId) testTaskIds.push(taskId);

  await clearNotifications(); // 清掉建立時的通知

  // 更新指派人
  await api('PATCH', `/api/projects/tasks/${taskId}`, {
    assigneeId: MEMBER_ID,
  });

  await sleep(800);
  const notifs = await getNotifications();
  assert(
    '① 更新指派人（開啟）→ 收到通知',
    notifs.length === 1 && notifs[0].type === 'task_assigned',
    `通知數=${notifs.length}, type=${notifs[0]?.type}, taskId=${taskId}`,
  );
}

async function test_taskAssigned_Update_OFF() {
  await clearNotifications();
  await resetSettings();
  await setSetting('taskAssigned', false);

  const r1 = await api('POST', `/api/projects/${testProjectId}/tasks`, {
    title: '測試更新指派（關閉）',
    priority: 'medium',
    status: 'todo',
  });
  const taskId = getId(r1);
  if (taskId) testTaskIds.push(taskId);

  await clearNotifications();

  await api('PATCH', `/api/projects/tasks/${taskId}`, {
    assigneeId: MEMBER_ID,
  });

  await sleep(800);
  const notifs = await getNotifications();
  assert(
    '① 更新指派人（關閉）→ 不收到通知',
    notifs.length === 0,
    `通知數=${notifs.length}`,
  );
}

// ═══════════════════════════════════════════════════════════
// ② comment_added — 留言通知
// ═══════════════════════════════════════════════════════════
async function test_commentAdded_ON() {
  await clearNotifications();
  await resetSettings();
  await setSetting('mentioned', true); // comment_added 映射到 mentioned

  // 建一個指派給 member 的任務
  const r1 = await api('POST', `/api/projects/${testProjectId}/tasks`, {
    title: '測試留言通知（開啟）',
    status: 'in_progress',
    assigneeId: MEMBER_ID,
  });
  const taskId = getId(r1);
  if (taskId) testTaskIds.push(taskId);

  await sleep(800); // 等待非同步 task_assigned 通知完成寫入
  await clearNotifications(); // 清掉建立任務時的指派通知

  // admin 在任務上留言 → member 是 assignee，應收到通知
  await api('POST', `/api/projects/tasks/${taskId}/comments`, {
    content: '這是一則測試留言，member 應該收到通知',
  });

  await sleep(800);
  const notifs = await getNotifications();
  assert(
    '② 留言通知（開啟）→ 收到通知',
    notifs.length === 1 && notifs[0].type === 'comment_added',
    `通知數=${notifs.length}, type=${notifs[0]?.type}`,
  );
}

async function test_commentAdded_OFF() {
  await clearNotifications();
  await resetSettings();
  await setSetting('mentioned', false); // 關閉 mentioned → comment_added 也被擋

  // 建一個指派給 member 的任務
  const r1 = await api('POST', `/api/projects/${testProjectId}/tasks`, {
    title: '測試留言通知（關閉）',
    status: 'in_progress',
    assigneeId: MEMBER_ID,
  });
  const taskId = getId(r1);
  if (taskId) testTaskIds.push(taskId);

  await sleep(800); // 等待非同步 task_assigned 通知完成寫入
  await clearNotifications();

  await api('POST', `/api/projects/tasks/${taskId}/comments`, {
    content: '這則留言不應產生通知',
  });

  await sleep(800);
  const notifs = await getNotifications();
  assert(
    '② 留言通知（關閉）→ 不收到通知',
    notifs.length === 0,
    `通知數=${notifs.length}`,
  );
}

// ═══════════════════════════════════════════════════════════
// ③ task_completed — 任務完成（via taskRuleEngine）
// ═══════════════════════════════════════════════════════════
async function test_taskCompleted_ON() {
  await clearNotifications();
  await resetSettings();
  await setSetting('taskCompleted', true);

  // 建一個指派給 member 的任務
  const r1 = await api('POST', `/api/projects/${testProjectId}/tasks`, {
    title: '測試任務完成通知（開啟）',
    status: 'in_progress',
    assigneeId: MEMBER_ID,
  });
  const taskId = getId(r1);
  if (taskId) testTaskIds.push(taskId);

  await clearNotifications(); // 清掉建立時的指派通知

  // admin 把任務標記為完成 → taskRuleEngine 觸發 task_completed
  await api('PATCH', `/api/projects/tasks/${taskId}`, {
    status: 'done',
  });

  // task_completed 用 setImmediate fire-and-forget，等久一點
  await sleep(2000);
  const notifs = await getNotifications();
  assert(
    '③ 任務完成（開啟）→ 收到通知',
    notifs.some(n => n.type === 'task_completed'),
    `通知數=${notifs.length}, types=${notifs.map(n => n.type).join(',')}`,
  );
}

async function test_taskCompleted_OFF() {
  await clearNotifications();
  await resetSettings();
  await setSetting('taskCompleted', false);

  const r1 = await api('POST', `/api/projects/${testProjectId}/tasks`, {
    title: '測試任務完成通知（關閉）',
    status: 'in_progress',
    assigneeId: MEMBER_ID,
  });
  const taskId = getId(r1);
  if (taskId) testTaskIds.push(taskId);

  await clearNotifications();

  await api('PATCH', `/api/projects/tasks/${taskId}`, {
    status: 'done',
  });

  await sleep(2000);
  const notifs = await getNotifications();
  const completedNotifs = notifs.filter(n => n.type === 'task_completed');
  assert(
    '③ 任務完成（關閉）→ 不收到通知',
    completedNotifs.length === 0,
    `task_completed 通知數=${completedNotifs.length}`,
  );
}

// ═══════════════════════════════════════════════════════════
// ④ deadline_approaching — 直接 DB 層測試（無 API 觸發點）
// ═══════════════════════════════════════════════════════════
async function test_deadlineApproaching_ON() {
  await clearNotifications();
  await resetSettings();
  await setSetting('taskDueReminder', true);

  await createNotifications({
    prisma,
    recipients:   [MEMBER_ID],
    type:         'deadline_approaching',
    title:        '即將到期：測試任務',
    message:      '這個任務快到截止日了',
    resourceType: 'task',
    resourceId:   1,
  });

  const notifs = await getNotifications();
  assert(
    '④ 到期提醒（開啟）→ 收到通知',
    notifs.length === 1 && notifs[0].type === 'deadline_approaching',
    `通知數=${notifs.length}`,
  );
}

async function test_deadlineApproaching_OFF() {
  await clearNotifications();
  await resetSettings();
  await setSetting('taskDueReminder', false);

  await createNotifications({
    prisma,
    recipients:   [MEMBER_ID],
    type:         'deadline_approaching',
    title:        '即將到期：測試任務',
    message:      '這個任務快到截止日了',
    resourceType: 'task',
    resourceId:   1,
  });

  const notifs = await getNotifications();
  assert(
    '④ 到期提醒（關閉）→ 不收到通知',
    notifs.length === 0,
    `通知數=${notifs.length}`,
  );
}

// ═══════════════════════════════════════════════════════════
// ⑤ mentioned — 直接 DB 層測試（程式碼中 @提及走 comment_added）
// ═══════════════════════════════════════════════════════════
async function test_mentioned_ON() {
  await clearNotifications();
  await resetSettings();
  await setSetting('mentioned', true);

  await createNotifications({
    prisma,
    recipients:   [MEMBER_ID],
    type:         'mentioned',
    title:        '你被 @提及了',
    message:      '有人在評論中 @你',
    resourceType: 'task',
    resourceId:   1,
  });

  const notifs = await getNotifications();
  assert(
    '⑤ 被提及（開啟）→ 收到通知',
    notifs.length === 1 && notifs[0].type === 'mentioned',
    `通知數=${notifs.length}`,
  );
}

async function test_mentioned_OFF() {
  await clearNotifications();
  await resetSettings();
  await setSetting('mentioned', false);

  await createNotifications({
    prisma,
    recipients:   [MEMBER_ID],
    type:         'mentioned',
    title:        '你被 @提及了',
    message:      '有人在評論中 @你',
    resourceType: 'task',
    resourceId:   1,
  });

  const notifs = await getNotifications();
  assert(
    '⑤ 被提及（關閉）→ 不收到通知',
    notifs.length === 0,
    `通知數=${notifs.length}`,
  );
}

// ═══════════════════════════════════════════════════════════
// ⑥ milestone_achieved — 直接 DB 層（里程碑 API 未接通知）
// ═══════════════════════════════════════════════════════════
async function test_milestoneAchieved_ON() {
  await clearNotifications();
  await resetSettings();
  await setSetting('projectUpdate', true);

  await createNotifications({
    prisma,
    recipients:   [MEMBER_ID],
    type:         'milestone_achieved',
    title:        '里程碑已達成：Alpha 版本',
    message:      '恭喜！里程碑已達成',
    resourceType: 'project',
    resourceId:   testProjectId,
  });

  const notifs = await getNotifications();
  assert(
    '⑥ 里程碑達成（開啟）→ 收到通知',
    notifs.length === 1 && notifs[0].type === 'milestone_achieved',
    `通知數=${notifs.length}`,
  );
}

async function test_milestoneAchieved_OFF() {
  await clearNotifications();
  await resetSettings();
  await setSetting('projectUpdate', false);

  await createNotifications({
    prisma,
    recipients:   [MEMBER_ID],
    type:         'milestone_achieved',
    title:        '里程碑已達成：Alpha 版本',
    message:      '恭喜！里程碑已達成',
    resourceType: 'project',
    resourceId:   testProjectId,
  });

  const notifs = await getNotifications();
  assert(
    '⑥ 里程碑達成（關閉）→ 不收到通知',
    notifs.length === 0,
    `通知數=${notifs.length}`,
  );
}

// ═══════════════════════════════════════════════════════════
// ⑦ pushNotifications 管道開關（關閉 = 全擋）
// ═══════════════════════════════════════════════════════════
async function test_pushChannel_OFF() {
  await clearNotifications();
  await resetSettings();
  await setSetting('taskAssigned', true);
  await setSetting('pushNotifications', false); // 管道關閉

  const r1 = await api('POST', `/api/projects/${testProjectId}/tasks`, {
    title: '測試管道關閉',
    status: 'todo',
    assigneeId: MEMBER_ID,
  });
  const taskId = getId(r1);
  if (taskId) testTaskIds.push(taskId);

  await sleep(800);
  const notifs = await getNotifications();
  assert(
    '⑦ 系統內通知管道（關閉）→ 全部被擋',
    notifs.length === 0,
    `通知數=${notifs.length}`,
  );
}

async function test_pushChannel_ON() {
  await clearNotifications();
  await resetSettings();
  await setSetting('taskAssigned', true);
  await setSetting('pushNotifications', true); // 管道開啟

  const r1 = await api('POST', `/api/projects/${testProjectId}/tasks`, {
    title: '測試管道開啟',
    status: 'todo',
    assigneeId: MEMBER_ID,
  });
  const taskId = getId(r1);
  if (taskId) testTaskIds.push(taskId);

  await sleep(800);
  const notifs = await getNotifications();
  assert(
    '⑦ 系統內通知管道（開啟）→ 正常收到',
    notifs.length === 1,
    `通知數=${notifs.length}`,
  );
}

// ═══════════════════════════════════════════════════════════
// ⑧ Email 通知管道讀寫（HTTP API）
// ═══════════════════════════════════════════════════════════
async function test_emailChannel() {
  // 開啟
  const { status: s1 } = await api('PATCH', `/api/settings/notifications/${MEMBER_ID}`, {
    emailNotifications: true,
  }, memberHeaders);
  assert('⑧ HTTP PATCH Email 開啟 → 200', s1 === 200, `status=${s1}`);

  const { data: d1 } = await api('GET', '/api/settings/notifications', null, memberHeaders);
  assert(
    '⑧ Email 通知（開啟）→ 設定值為 true',
    d1?.settings?.emailNotifications === true,
    `actual=${d1?.settings?.emailNotifications}`,
  );

  // 關閉
  await api('PATCH', `/api/settings/notifications/${MEMBER_ID}`, {
    emailNotifications: false,
  }, memberHeaders);

  const { data: d2 } = await api('GET', '/api/settings/notifications', null, memberHeaders);
  assert(
    '⑧ Email 通知（關閉）→ 設定值為 false',
    d2?.settings?.emailNotifications === false,
    `actual=${d2?.settings?.emailNotifications}`,
  );
}

// ═══════════════════════════════════════════════════════════
// ⑨ 摘要報告設定讀寫（HTTP API）
// ═══════════════════════════════════════════════════════════
async function test_digest() {
  // weeklyDigest 開
  await api('PATCH', `/api/settings/notifications/${MEMBER_ID}`, { weeklyDigest: true }, memberHeaders);
  let { data } = await api('GET', '/api/settings/notifications', null, memberHeaders);
  assert('⑨ 定期摘要（開啟）→ true', data?.settings?.weeklyDigest === true, `actual=${data?.settings?.weeklyDigest}`);

  // weeklyDigest 關
  await api('PATCH', `/api/settings/notifications/${MEMBER_ID}`, { weeklyDigest: false }, memberHeaders);
  ({ data } = await api('GET', '/api/settings/notifications', null, memberHeaders));
  assert('⑨ 定期摘要（關閉）→ false', data?.settings?.weeklyDigest === false, `actual=${data?.settings?.weeklyDigest}`);

  // digestFrequency
  for (const freq of ['daily', 'weekly', 'monthly']) {
    await api('PATCH', `/api/settings/notifications/${MEMBER_ID}`, { digestFrequency: freq }, memberHeaders);
    ({ data } = await api('GET', '/api/settings/notifications', null, memberHeaders));
    assert(`⑨ 摘要頻率 → ${freq}`, data?.settings?.digestFrequency === freq, `actual=${data?.settings?.digestFrequency}`);
  }
}

// ═══════════════════════════════════════════════════════════
// ⑩ 權限控制：不能改別人的設定
// ═══════════════════════════════════════════════════════════
async function test_authorization() {
  const { status } = await api('PATCH', `/api/settings/notifications/${ADMIN_ID}`, {
    taskAssigned: false,
  }, memberHeaders);
  assert('⑩ 改別人設定 → 403 禁止', status === 403, `status=${status}`);
}

// ═══════════════════════════════════════════════════════════
// CLEANUP：刪除測試資料
// ═══════════════════════════════════════════════════════════
async function cleanup() {
  console.log('\n🧹 清理測試資料…');

  await clearNotifications();

  // 軟刪除測試任務
  for (const taskId of testTaskIds) {
    try {
      await prisma.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });
    } catch { /* 略 */ }
  }
  console.log(`   ✓ 已軟刪除 ${testTaskIds.length} 個測試任務`);

  // 刪除測試專案的留言
  if (testProjectId) {
    const tasks = await prisma.task.findMany({ where: { projectId: testProjectId }, select: { id: true } });
    const taskIds = tasks.map(t => t.id);
    if (taskIds.length) {
      await prisma.comment.deleteMany({ where: { taskId: { in: taskIds } } });
    }

    // 刪除專案成員
    await prisma.projectMember.deleteMany({ where: { projectId: testProjectId } });

    // 軟刪除測試專案
    await prisma.project.update({ where: { id: testProjectId }, data: { deletedAt: new Date() } });
    console.log(`   ✓ 已軟刪除測試專案 #${testProjectId}`);
  }

  // 重置通知設定
  await resetSettings();
  console.log('   ✓ 通知設定已重置');
}

// ═══════════════════════════════════════════════════════════
// 主程式
// ═══════════════════════════════════════════════════════════
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  通知偏好設定 — 真實 API 端到端嚴格測試           ║');
  console.log('╚══════════════════════════════════════════════════╝');

  try {
    await setup();

    // ── ① task_assigned（建立 + 更新指派）────────────
    console.log('━━ ① task_assigned（任務指派）━━━━━━━━━━━━━━━━');
    await test_taskAssigned_ON();
    await test_taskAssigned_OFF();
    await test_taskAssigned_Update_ON();
    await test_taskAssigned_Update_OFF();

    // ── ② comment_added（留言通知）───────────────────
    console.log('\n━━ ② comment_added（留言通知）━━━━━━━━━━━━━━━');
    await test_commentAdded_ON();
    await test_commentAdded_OFF();

    // ── ③ task_completed（任務完成 via Rule Engine）──
    console.log('\n━━ ③ task_completed（任務完成）━━━━━━━━━━━━━━');
    await test_taskCompleted_ON();
    await test_taskCompleted_OFF();

    // ── ④ deadline_approaching（到期提醒，DB 層）─────
    console.log('\n━━ ④ deadline_approaching（到期提醒）━━━━━━━━');
    await test_deadlineApproaching_ON();
    await test_deadlineApproaching_OFF();

    // ── ⑤ mentioned（被提及，DB 層）──────────────────
    console.log('\n━━ ⑤ mentioned（被提及）━━━━━━━━━━━━━━━━━━━━');
    await test_mentioned_ON();
    await test_mentioned_OFF();

    // ── ⑥ milestone_achieved（里程碑達成，DB 層）─────
    console.log('\n━━ ⑥ milestone_achieved（里程碑達成）━━━━━━━━');
    await test_milestoneAchieved_ON();
    await test_milestoneAchieved_OFF();

    // ── ⑦ pushNotifications 管道 ─────────────────────
    console.log('\n━━ ⑦ pushNotifications 管道開關 ━━━━━━━━━━━━');
    await test_pushChannel_OFF();
    await test_pushChannel_ON();

    // ── ⑧ emailNotifications 讀寫 ───────────────────
    console.log('\n━━ ⑧ emailNotifications 設定讀寫 ━━━━━━━━━━━');
    await test_emailChannel();

    // ── ⑨ 摘要報告 ──────────────────────────────────
    console.log('\n━━ ⑨ 摘要報告設定 ━━━━━━━━━━━━━━━━━━━━━━━━━');
    await test_digest();

    // ── ⑩ 權限控制 ──────────────────────────────────
    console.log('\n━━ ⑩ 權限控制 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await test_authorization();

  } catch (err) {
    console.error('\n💥 測試執行錯誤:', err);
    failed++;
    results.push({ testName: '未預期錯誤', status: '❌ FAIL', detail: err.message });
  }

  await cleanup();

  // ── 最終報告 ───────────────────────────────────────
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║               測 試 結 果 總 報 告               ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  for (const r of results) {
    console.log(`  ${r.status}  ${r.testName}`);
    if (r.detail) console.log(`           ${r.detail}`);
  }
  console.log('');
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  通過: ${passed}    失敗: ${failed}    總計: ${passed + failed}`);
  if (failed === 0) {
    console.log('  🎉 全部通過！所有通知偏好設定運作正常');
  }
  console.log('');

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main();
