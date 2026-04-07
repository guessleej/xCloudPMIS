#!/usr/bin/env node
/**
 * E2E 測試：4 個新通知觸發器
 *   1. @提及 (mentioned) — 評論中 @某人
 *   2. 里程碑達成 (milestone_achieved) — PATCH isAchieved=true
 *   3. 到期提醒 (deadline_approaching) — scanDeadlineApproaching
 *   4. 逾期警示 (task_overdue) — scanTaskOverdue
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
let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else      { fail++; console.error(`  ❌ ${label}`); }
}

(async () => {
  console.log('🔐 登入...');
  const login = await api('POST', '/api/auth/login', { email: 'admin@company.com', password: 'test1234' });
  const token = login.data?.token || login.token;
  if (!token) { console.error('登入失敗', login); process.exit(1); }

  // Eagle Wu userId
  const usersRes = await api('GET', '/api/users?companyId=1', null, token);
  const eagleWu = usersRes.data?.find(u => u.name?.includes('Eagle Wu'));
  const eagleId = eagleWu?.id;
  if (!eagleId) { console.error('找不到 Eagle Wu'); process.exit(1); }
  console.log(`  Eagle Wu id=${eagleId}`);

  // 清除 Eagle Wu 所有舊通知
  const oldNotifs = await api('GET', '/api/notifications', null, token);
  // 先用 admin token（因為通知 API 會用 req.user）

  // ── 登入 Eagle Wu ─────────────────────────────────────
  const eagleLogin = await api('POST', '/api/auth/login', { email: 'eagle_w@cloudinfo.com.tw', password: 'test1234' });
  const eagleToken = eagleLogin.data?.token || eagleLogin.token;
  if (!eagleToken) { console.error('Eagle Wu 登入失敗', eagleLogin); process.exit(1); }

  // 清除 Eagle Wu 通知
  const eagleNotifs = await api('GET', '/api/notifications', null, eagleToken);
  if (eagleNotifs.data) {
    for (const n of eagleNotifs.data) {
      await api('DELETE', `/api/notifications/${n.id}`, null, eagleToken);
    }
  }
  console.log('  已清除 Eagle Wu 所有舊通知');

  // ═══════════════════════════════════════════════════════
  // 準備：建專案 + 把 Eagle Wu 加入 + 建任務
  // ═══════════════════════════════════════════════════════
  console.log('\n📦 建立測試資料...');
  const projRes = await api('POST', '/api/projects', {
    name: `通知觸發器測試 ${Date.now()}`,
    status: 'active',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  }, token);
  const projectId = projRes.data?.id;
  console.log(`  專案 id=${projectId}`);

  // 加入 Eagle Wu 為專案成員（透過建立指派任務）
  const memberTask = await api('POST', `/api/projects/${projectId}/tasks`, {
    title: '成員綁定用任務',
    status: 'todo',
    priority: 'low',
    assigneeId: eagleId,
  }, token);
  console.log(`  建立指派任務以綁定成員: taskId=${memberTask.data?.id}`);
  await sleep(300); // 等指派通知寫入

  // 清除 Eagle Wu 通知
  const preClean = await api('GET', '/api/notifications', null, eagleToken);
  for (const n of (preClean.data || [])) {
    await api('DELETE', `/api/notifications/${n.id}`, null, eagleToken);
  }

  // ═══════════════════════════════════════════════════════
  // TEST 1: @提及 (mentioned)
  // ═══════════════════════════════════════════════════════
  console.log('\n🧪 TEST 1: @提及通知 (mentioned)');
  const taskRes1 = await api('POST', `/api/projects/${projectId}/tasks`, {
    title: '提及測試任務',
    status: 'todo',
    priority: 'medium',
  }, token);
  const taskId1 = taskRes1.data?.id;
  console.log(`  任務 id=${taskId1}`);

  // admin 留言，@Eagle Wu
  const commentRes = await api('POST', `/api/projects/tasks/${taskId1}/comments`, {
    content: `請 @Eagle Wu 吳柏緯 看一下這個任務的進度`,
  }, token);
  console.log(`  留言 id=${commentRes.data?.id}`);

  await sleep(500);
  const notifs1 = await api('GET', '/api/notifications', null, eagleToken);
  const mentionNotif = notifs1.data?.find(n => n.type === 'mentioned');
  assert(!!mentionNotif, '@提及通知已送達 Eagle Wu');
  if (mentionNotif) {
    assert(mentionNotif.title.includes('被提及'), '通知標題含「被提及」');
    assert(mentionNotif.resourceId === taskId1, 'resourceId 指向正確任務');
  }

  // ═══════════════════════════════════════════════════════
  // TEST 2: 里程碑達成 (milestone_achieved)
  // ═══════════════════════════════════════════════════════
  console.log('\n🧪 TEST 2: 里程碑達成通知 (milestone_achieved)');
  const msRes = await api('POST', `/api/projects/${projectId}/milestones`, {
    name: '第一階段交付',
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    color: 'green',
  }, token);
  const milestoneId = msRes.data?.id;
  console.log(`  里程碑 id=${milestoneId}`);

  // 清除前面的通知
  const notifs1b = await api('GET', '/api/notifications', null, eagleToken);
  for (const n of (notifs1b.data || [])) {
    await api('DELETE', `/api/notifications/${n.id}`, null, eagleToken);
  }

  // PATCH: 達成里程碑
  const patchRes = await api('PATCH', `/api/projects/milestones/${milestoneId}`, { isAchieved: true }, token);
  console.log(`  Milestone PATCH 結果: isAchieved=${patchRes.data?.isAchieved}`);

  await sleep(1000);
  const notifs2 = await api('GET', '/api/notifications', null, eagleToken);
  const msNotif = notifs2.data?.find(n => n.type === 'milestone_achieved');
  assert(!!msNotif, '里程碑達成通知已送達 Eagle Wu');
  if (msNotif) {
    assert(msNotif.title.includes('第一階段交付'), '通知標題含里程碑名稱');
    assert(msNotif.resourceId === milestoneId, 'resourceId 指向正確里程碑');
  }

  // ═══════════════════════════════════════════════════════
  // TEST 3: 到期提醒 (deadline_approaching) — 直接呼叫 scan
  // ═══════════════════════════════════════════════════════
  console.log('\n🧪 TEST 3: 到期提醒 (deadline_approaching)');

  // 清除通知
  const notifs2b = await api('GET', '/api/notifications', null, eagleToken);
  for (const n of (notifs2b.data || [])) {
    await api('DELETE', `/api/notifications/${n.id}`, null, eagleToken);
  }

  // 建立明天到期的任務
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const taskRes3 = await api('POST', `/api/projects/${projectId}/tasks`, {
    title: '明天到期的任務',
    status: 'todo',
    priority: 'high',
    dueDate: tomorrow.toISOString().slice(0, 10),
    assigneeId: eagleId,
  }, token);
  const taskId3 = taskRes3.data?.id;
  console.log(`  任務 id=${taskId3}，到期 ${tomorrow.toISOString().slice(0, 10)}`);

  // 清 assignment 通知
  await sleep(300);
  const notifs3pre = await api('GET', '/api/notifications', null, eagleToken);
  for (const n of (notifs3pre.data || [])) {
    await api('DELETE', `/api/notifications/${n.id}`, null, eagleToken);
  }

  // 直接呼叫 scanner（透過 require）
  // 改用 API 呼叫不行，幸好我們可以用一個小腳本來 require
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const { scanDeadlineApproaching } = require('../src/services/notificationCenter');
  const apprCount = await scanDeadlineApproaching(prisma);
  console.log(`  scanDeadlineApproaching 產生 ${apprCount} 筆通知`);

  const notifs3 = await api('GET', '/api/notifications', null, eagleToken);
  const deadlineNotif = notifs3.data?.find(n => n.type === 'deadline_approaching' && n.resourceId === taskId3);
  assert(!!deadlineNotif, '到期提醒通知已送達 Eagle Wu');
  if (deadlineNotif) {
    assert(deadlineNotif.title.includes('明天到期的任務'), '通知標題含任務名稱');
  }

  // ═══════════════════════════════════════════════════════
  // TEST 4: 逾期警示 (task_overdue) — 直接呼叫 scan
  // ═══════════════════════════════════════════════════════
  console.log('\n🧪 TEST 4: 逾期警示 (task_overdue)');

  // 清除通知
  const notifs3b = await api('GET', '/api/notifications', null, eagleToken);
  for (const n of (notifs3b.data || [])) {
    await api('DELETE', `/api/notifications/${n.id}`, null, eagleToken);
  }

  // 建立昨天已逾期的任務
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 2);
  const taskRes4 = await api('POST', `/api/projects/${projectId}/tasks`, {
    title: '已超過期限的任務',
    status: 'in_progress',
    priority: 'urgent',
    dueDate: yesterday.toISOString().slice(0, 10),
    assigneeId: eagleId,
  }, token);
  const taskId4 = taskRes4.data?.id;
  console.log(`  任務 id=${taskId4}，到期 ${yesterday.toISOString().slice(0, 10)}（已逾期）`);

  // 清 assignment 通知
  await sleep(300);
  const notifs4pre = await api('GET', '/api/notifications', null, eagleToken);
  for (const n of (notifs4pre.data || [])) {
    await api('DELETE', `/api/notifications/${n.id}`, null, eagleToken);
  }

  const { scanTaskOverdue } = require('../src/services/notificationCenter');
  const overdueCount = await scanTaskOverdue(prisma);
  console.log(`  scanTaskOverdue 產生 ${overdueCount} 筆通知`);

  const notifs4 = await api('GET', '/api/notifications', null, eagleToken);
  const overdueNotif = notifs4.data?.find(n => n.type === 'task_overdue' && n.resourceId === taskId4);
  assert(!!overdueNotif, '逾期警示通知已送達 Eagle Wu');
  if (overdueNotif) {
    assert(overdueNotif.title.includes('已超過期限的任務'), '通知標題含任務名稱');
    assert(overdueNotif.message.includes('逾期'), '通知訊息含「逾期」');
  }

  // ═══════════════════════════════════════════════════════
  // TEST 5: 去重 — 同一任務 24h 內不重複通知（需在 TEST 4 之後立刻跑）
  // ═══════════════════════════════════════════════════════
  console.log('\n🧪 TEST 5: 去重 — 24h 內不重複通知');
  // 記錄目前 task_overdue 通知數量
  const beforeCount = await prisma.notification.count({ where: { type: 'task_overdue' } });
  await scanTaskOverdue(prisma);
  const afterCount = await prisma.notification.count({ where: { type: 'task_overdue' } });
  assert(afterCount === beforeCount, `重複掃描不產生新通知（前=${beforeCount} 後=${afterCount}）`);

  // ═══════════════════════════════════════════════════════
  // TEST 6: 偏好設定關閉後不送
  // ═══════════════════════════════════════════════════════
  console.log('\n🧪 TEST 6: 偏好設定關閉 → 不送通知');

  // 關閉 Eagle Wu 的 mentioned 偏好
  const settingsRes = await api('PATCH', `/api/settings/notifications/${eagleId}`, { mentioned: false }, eagleToken);
  console.log(`  設定更新結果: ${settingsRes.success ? '成功' : JSON.stringify(settingsRes)}`);

  // 清除通知
  const notifs5pre = await api('GET', '/api/notifications', null, eagleToken);
  for (const n of (notifs5pre.data || [])) {
    await api('DELETE', `/api/notifications/${n.id}`, null, eagleToken);
  }

  // admin 再次 @Eagle Wu
  await api('POST', `/api/projects/tasks/${taskId1}/comments`, {
    content: `再次 @Eagle Wu 吳柏緯 確認一下`,
  }, token);
  await sleep(500);

  const notifs5 = await api('GET', '/api/notifications', null, eagleToken);
  const blockedMention = notifs5.data?.find(n => n.type === 'mentioned');
  assert(!blockedMention, '偏好關閉時 @提及通知不送出');

  // 恢復設定
  await api('PATCH', `/api/settings/notifications/${eagleId}`, { mentioned: true }, eagleToken);

  await prisma.$disconnect();

  // ═══════════════════════════════════════════════════════
  // 結果
  // ═══════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ 通過: ${pass}   ❌ 失敗: ${fail}   合計: ${pass + fail}`);
  if (fail) process.exit(1);
  console.log('🎉 所有觸發器測試通過！');
})();
