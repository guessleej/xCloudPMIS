#!/usr/bin/env node
/**
 * 完整通知觸發器 E2E 測試 — 逐一測試 6 種通知類型
 *   1. 任務指派 (task_assigned)
 *   2. 到期提醒 (deadline_approaching)
 *   3. 逾期警示 (task_overdue)
 *   4. 任務完成 (task_completed)
 *   5. 被提及   (mentioned)
 *   6. 專案更新 / 里程碑達成 (milestone_achieved)
 *
 * 前置：資料庫已清空，只剩 admin + Eagle Wu
 */

const BASE = 'http://localhost:3000';

async function api(method, path, body, token) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  return r.json();
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0, testNum = 0;

function section(title) {
  testNum++;
  console.log(`\n${'─'.repeat(56)}`);
  console.log(`🧪 TEST ${testNum}: ${title}`);
  console.log('─'.repeat(56));
}

function assert(cond, label) {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else      { fail++; console.error(`  ❌ ${label}`); }
}

async function clearNotifs(token) {
  const res = await api('GET', '/api/notifications', null, token);
  for (const n of (res.data || [])) {
    await api('DELETE', `/api/notifications/${n.id}`, null, token);
  }
}

async function getNotifs(token) {
  const res = await api('GET', '/api/notifications', null, token);
  return res.data || [];
}

(async () => {
  console.log('═'.repeat(56));
  console.log('  📬 xCloudPMIS 通知觸發器完整測試');
  console.log('═'.repeat(56));

  // ═══════════════════════════════════════════════════════
  // 登入
  // ═══════════════════════════════════════════════════════
  console.log('\n🔐 登入 admin & Eagle Wu...');
  const adminLogin = await api('POST', '/api/auth/login', { email: 'admin@company.com', password: 'test1234' });
  const adminToken = adminLogin.data?.token || adminLogin.token;
  if (!adminToken) { console.error('❌ admin 登入失敗', adminLogin); process.exit(1); }
  console.log('  admin ✔');

  const eagleLogin = await api('POST', '/api/auth/login', { email: 'eagle_w@cloudinfo.com.tw', password: 'test1234' });
  const eagleToken = eagleLogin.data?.token || eagleLogin.token;
  if (!eagleToken) { console.error('❌ Eagle Wu 登入失敗', eagleLogin); process.exit(1); }

  const usersRes = await api('GET', '/api/users?companyId=1', null, adminToken);
  const eagleId = usersRes.data?.find(u => u.name?.includes('Eagle Wu'))?.id;
  const adminId = usersRes.data?.find(u => u.email === 'admin@company.com')?.id;
  console.log(`  Eagle Wu id=${eagleId} ✔`);
  console.log(`  admin    id=${adminId} ✔`);

  // 確保 Eagle Wu 所有通知偏好都開啟
  await api('PATCH', `/api/settings/notifications/${eagleId}`, {
    taskAssigned: true, taskDueReminder: true, taskOverdue: true,
    taskCompleted: true, mentioned: true, projectUpdate: true,
  }, eagleToken);
  console.log('  Eagle Wu 通知偏好已全開 ✔');

  // ═══════════════════════════════════════════════════════
  // 建立測試專案
  // ═══════════════════════════════════════════════════════
  console.log('\n📦 建立測試專案...');
  const projRes = await api('POST', '/api/projects', {
    name: `📬 通知完整測試 ${new Date().toLocaleTimeString('zh-TW')}`,
    status: 'active',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
  }, adminToken);
  const projectId = projRes.data?.id;
  if (!projectId) { console.error('❌ 建立專案失敗', projRes); process.exit(1); }
  console.log(`  專案 id=${projectId} ✔`);

  // 先清除所有通知
  await clearNotifs(eagleToken);
  await clearNotifs(adminToken);

  // ═══════════════════════════════════════════════════════
  // TEST 1: 任務指派 (task_assigned)
  // ═══════════════════════════════════════════════════════
  section('任務指派通知 (task_assigned)');

  const task1 = await api('POST', `/api/projects/${projectId}/tasks`, {
    title: '📝 撰寫系統需求規格書',
    status: 'todo',
    priority: 'high',
    assigneeId: eagleId,
  }, adminToken);
  const taskId1 = task1.data?.id;
  console.log(`  建立任務 id=${taskId1}，指派給 Eagle Wu`);

  await sleep(800);
  const notifs1 = await getNotifs(eagleToken);
  const assignNotif = notifs1.find(n => n.type === 'task_assigned');
  assert(!!assignNotif, '收到 task_assigned 通知');
  if (assignNotif) {
    assert(assignNotif.title.includes('撰寫系統需求規格書'), '通知標題含任務名稱');
    assert(assignNotif.resourceType === 'task', 'resourceType = task');
    assert(assignNotif.resourceId === taskId1, `resourceId = ${taskId1}`);
    console.log(`  📨 標題: ${assignNotif.title}`);
    console.log(`  📨 內容: ${assignNotif.message}`);
  }

  // 清通知
  await clearNotifs(eagleToken);

  // ═══════════════════════════════════════════════════════
  // TEST 2: 到期提醒 (deadline_approaching)
  // ═══════════════════════════════════════════════════════
  section('到期提醒通知 (deadline_approaching)');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const task2 = await api('POST', `/api/projects/${projectId}/tasks`, {
    title: '⏰ 明天截止的技術評估報告',
    status: 'in_progress',
    priority: 'urgent',
    dueDate: tomorrow.toISOString().slice(0, 10),
    assigneeId: eagleId,
  }, adminToken);
  const taskId2 = task2.data?.id;
  console.log(`  建立任務 id=${taskId2}，到期日 ${tomorrow.toISOString().slice(0, 10)}`);

  // 清掉 assignment 通知
  await sleep(500);
  await clearNotifs(eagleToken);

  // 直接呼叫 scanner
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const { scanDeadlineApproaching, scanTaskOverdue } = require('../src/services/notificationCenter');

  const apprCount = await scanDeadlineApproaching(prisma);
  console.log(`  scanDeadlineApproaching → ${apprCount} 筆通知`);

  await sleep(300);
  const notifs2 = await getNotifs(eagleToken);
  const deadlineNotif = notifs2.find(n => n.type === 'deadline_approaching');
  assert(!!deadlineNotif, '收到 deadline_approaching 通知');
  if (deadlineNotif) {
    assert(deadlineNotif.title.includes('明天截止的技術評估報告'), '通知標題含任務名稱');
    assert(deadlineNotif.resourceType === 'task', 'resourceType = task');
    assert(deadlineNotif.resourceId === taskId2, `resourceId = ${taskId2}`);
    console.log(`  📨 標題: ${deadlineNotif.title}`);
    console.log(`  📨 內容: ${deadlineNotif.message}`);
  }

  await clearNotifs(eagleToken);

  // ═══════════════════════════════════════════════════════
  // TEST 3: 逾期警示 (task_overdue)
  // ═══════════════════════════════════════════════════════
  section('逾期警示通知 (task_overdue)');

  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 3);
  const task3 = await api('POST', `/api/projects/${projectId}/tasks`, {
    title: '🚨 三天前就該完成的環境建置',
    status: 'in_progress',
    priority: 'urgent',
    dueDate: pastDate.toISOString().slice(0, 10),
    assigneeId: eagleId,
  }, adminToken);
  const taskId3 = task3.data?.id;
  console.log(`  建立任務 id=${taskId3}，到期日 ${pastDate.toISOString().slice(0, 10)}（已逾期）`);

  await sleep(500);
  await clearNotifs(eagleToken);

  const overdueCount = await scanTaskOverdue(prisma);
  console.log(`  scanTaskOverdue → ${overdueCount} 筆通知`);

  await sleep(300);
  const notifs3 = await getNotifs(eagleToken);
  const overdueNotif = notifs3.find(n => n.type === 'task_overdue');
  assert(!!overdueNotif, '收到 task_overdue 通知');
  if (overdueNotif) {
    assert(overdueNotif.title.includes('三天前就該完成的環境建置'), '通知標題含任務名稱');
    assert(overdueNotif.message.includes('逾期'), '通知訊息含「逾期」');
    assert(overdueNotif.resourceType === 'task', 'resourceType = task');
    assert(overdueNotif.resourceId === taskId3, `resourceId = ${taskId3}`);
    console.log(`  📨 標題: ${overdueNotif.title}`);
    console.log(`  📨 內容: ${overdueNotif.message}`);
  }

  await clearNotifs(eagleToken);

  // ═══════════════════════════════════════════════════════
  // TEST 4: 任務完成 (task_completed)
  // ═══════════════════════════════════════════════════════
  section('任務完成通知 (task_completed)');

  // 建立一個任務給 Eagle Wu，然後由 admin 將其標記為完成
  const task4 = await api('POST', `/api/projects/${projectId}/tasks`, {
    title: '✅ 完成 API 文件撰寫',
    status: 'in_progress',
    priority: 'medium',
    assigneeId: eagleId,
  }, adminToken);
  const taskId4 = task4.data?.id;
  console.log(`  建立任務 id=${taskId4}，狀態 in_progress`);

  await sleep(500);
  await clearNotifs(eagleToken);

  // admin 把任務標記為 done → 觸發 task_completed via taskRuleEngine
  const updateRes = await api('PATCH', `/api/projects/tasks/${taskId4}`, {
    status: 'done',
  }, adminToken);
  console.log(`  PATCH status=done → 回應 status=${updateRes.data?.status}`);

  // task_completed 是 fire-and-forget (setImmediate)，需要等久一點
  await sleep(1500);
  const notifs4 = await getNotifs(eagleToken);
  const completedNotif = notifs4.find(n => n.type === 'task_completed');
  assert(!!completedNotif, '收到 task_completed 通知');
  if (completedNotif) {
    assert(completedNotif.title.includes('完成 API 文件撰寫'), '通知標題含任務名稱');
    assert(completedNotif.resourceType === 'task', 'resourceType = task');
    assert(completedNotif.resourceId === taskId4, `resourceId = ${taskId4}`);
    console.log(`  📨 標題: ${completedNotif.title}`);
    console.log(`  📨 內容: ${completedNotif.message}`);
  }

  await clearNotifs(eagleToken);

  // ═══════════════════════════════════════════════════════
  // TEST 5: 被提及 (mentioned)
  // ═══════════════════════════════════════════════════════
  section('被提及通知 (mentioned)');

  const task5 = await api('POST', `/api/projects/${projectId}/tasks`, {
    title: '💬 討論前端架構選型',
    status: 'todo',
    priority: 'medium',
  }, adminToken);
  const taskId5 = task5.data?.id;
  console.log(`  建立任務 id=${taskId5}`);

  await sleep(300);
  await clearNotifs(eagleToken);

  // admin 留言 @Eagle Wu
  const commentRes = await api('POST', `/api/projects/tasks/${taskId5}/comments`, {
    content: '請 @Eagle Wu 吳柏緯 提供前端框架的技術評估意見',
  }, adminToken);
  console.log(`  留言 id=${commentRes.data?.id}，內容含 @Eagle Wu 吳柏緯`);

  await sleep(800);
  const notifs5 = await getNotifs(eagleToken);
  const mentionNotif = notifs5.find(n => n.type === 'mentioned');
  assert(!!mentionNotif, '收到 mentioned 通知');
  if (mentionNotif) {
    assert(mentionNotif.title.includes('被提及'), '通知標題含「被提及」');
    assert(mentionNotif.resourceType === 'task', 'resourceType = task');
    assert(mentionNotif.resourceId === taskId5, `resourceId = ${taskId5}`);
    console.log(`  📨 標題: ${mentionNotif.title}`);
    console.log(`  📨 內容: ${mentionNotif.message}`);
  }

  // 也驗證是否有 comment_added 通知（因為留言也會觸發）
  const commentNotif = notifs5.find(n => n.type === 'comment_added');
  console.log(`  💡 comment_added 通知: ${commentNotif ? '有' : '無'}（留言通知是獨立的）`);

  await clearNotifs(eagleToken);

  // ═══════════════════════════════════════════════════════
  // TEST 6: 專案更新 / 里程碑達成 (milestone_achieved)
  // ═══════════════════════════════════════════════════════
  section('里程碑達成通知 (milestone_achieved)');

  const msRes = await api('POST', `/api/projects/${projectId}/milestones`, {
    name: '🎯 Phase 1 核心功能交付',
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    color: 'green',
  }, adminToken);
  const milestoneId = msRes.data?.id;
  console.log(`  建立里程碑 id=${milestoneId}`);

  await sleep(300);
  await clearNotifs(eagleToken);

  // admin 將里程碑標為達成
  const msPatch = await api('PATCH', `/api/projects/milestones/${milestoneId}`, {
    isAchieved: true,
  }, adminToken);
  console.log(`  PATCH isAchieved=true → 回應 isAchieved=${msPatch.data?.isAchieved}`);

  await sleep(1000);
  const notifs6 = await getNotifs(eagleToken);
  const msNotif = notifs6.find(n => n.type === 'milestone_achieved');
  assert(!!msNotif, '收到 milestone_achieved 通知');
  if (msNotif) {
    assert(msNotif.title.includes('Phase 1 核心功能交付'), '通知標題含里程碑名稱');
    assert(msNotif.resourceType === 'milestone', 'resourceType = milestone');
    assert(msNotif.resourceId === milestoneId, `resourceId = ${milestoneId}`);
    console.log(`  📨 標題: ${msNotif.title}`);
    console.log(`  📨 內容: ${msNotif.message}`);
  }

  // ═══════════════════════════════════════════════════════
  // 額外驗證：24h 去重（不清除通知，利用 TEST 3 已產生的 task_overdue 通知）
  // ═══════════════════════════════════════════════════════
  section('24h 去重驗證');
  // 先確認目前 DB 中有通知（前面的 clearNotifs 只透過 API 刪，直接查 DB count）
  const beforeDedupe = await prisma.notification.count({ where: { recipientId: eagleId, type: 'task_overdue' } });
  console.log(`  目前 task_overdue 通知筆數: ${beforeDedupe}`);
  // 重新產生一筆（如果前面被清掉了），確保有東西可驗證
  const overdueCount2 = await scanTaskOverdue(prisma);
  const midDedupe = await prisma.notification.count({ where: { recipientId: eagleId, type: 'task_overdue' } });
  console.log(`  第一次掃描後: ${midDedupe} 筆 (新增 ${overdueCount2})`);
  // 再掃一次，不應新增
  const overdueCount3 = await scanTaskOverdue(prisma);
  const afterDedupe = await prisma.notification.count({ where: { recipientId: eagleId, type: 'task_overdue' } });
  console.log(`  第二次掃描後: ${afterDedupe} 筆 (新增 ${overdueCount3})`);
  assert(afterDedupe === midDedupe, `逾期掃描去重成功（掃描前=${midDedupe}，掃描後=${afterDedupe}）`);

  const beforeDedupe2 = await prisma.notification.count({ where: { recipientId: eagleId, type: 'deadline_approaching' } });
  const apprCount2 = await scanDeadlineApproaching(prisma);
  const midDedupe2 = await prisma.notification.count({ where: { recipientId: eagleId, type: 'deadline_approaching' } });
  console.log(`  目前 deadline_approaching: ${midDedupe2} 筆`);
  await scanDeadlineApproaching(prisma);
  const afterDedupe2 = await prisma.notification.count({ where: { recipientId: eagleId, type: 'deadline_approaching' } });
  assert(afterDedupe2 === midDedupe2, `到期掃描去重成功（掃描前=${midDedupe2}，掃描後=${afterDedupe2}）`);

  // ═══════════════════════════════════════════════════════
  // 額外驗證：偏好關閉後不送
  // ═══════════════════════════════════════════════════════
  section('偏好設定關閉 → 不送通知');
  await clearNotifs(eagleToken);

  // 關閉 mentioned 偏好
  await api('PATCH', `/api/settings/notifications/${eagleId}`, { mentioned: false }, eagleToken);
  console.log('  已關閉 Eagle Wu 的 mentioned 偏好');

  await api('POST', `/api/projects/tasks/${taskId5}/comments`, {
    content: '再次 @Eagle Wu 吳柏緯 確認進度',
  }, adminToken);
  await sleep(800);

  const notifs7 = await getNotifs(eagleToken);
  const blocked = notifs7.find(n => n.type === 'mentioned');
  assert(!blocked, '偏好關閉時不收到 mentioned 通知');

  // 恢復偏好
  await api('PATCH', `/api/settings/notifications/${eagleId}`, { mentioned: true }, eagleToken);
  console.log('  已恢復 Eagle Wu 的 mentioned 偏好');

  await prisma.$disconnect();

  // ═══════════════════════════════════════════════════════
  // 結果彙整
  // ═══════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(56)}`);
  console.log(`  📊 測試結果：✅ ${pass} 通過   ❌ ${fail} 失敗   合計 ${pass + fail}`);
  console.log('═'.repeat(56));
  if (fail > 0) {
    console.log('⚠️  有失敗的測試，請檢查上方輸出');
    process.exit(1);
  }
  console.log('🎉 全部通知觸發器測試通過！');
})();
