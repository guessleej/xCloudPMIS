#!/usr/bin/env node
/**
 * 真實通知發信測試 — 透過 API 模擬真實使用者操作
 * 逐一觸發 6 種通知，每步驟等候後查收件匣驗證
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

(async () => {
  console.log('═══════════════════════════════════════════════════');
  console.log('  📬 真實通知發信測試');
  console.log('═══════════════════════════════════════════════════\n');

  // ── 登入 ──────────────────────────────────────────────
  const adminLogin = await api('POST', '/api/auth/login', { email: 'admin@company.com', password: 'test1234' });
  const adminToken = adminLogin.data?.token || adminLogin.token;
  if (!adminToken) { console.error('❌ admin 登入失敗'); process.exit(1); }

  const eagleLogin = await api('POST', '/api/auth/login', { email: 'eagle_w@cloudinfo.com.tw', password: 'test1234' });
  const eagleToken = eagleLogin.data?.token || eagleLogin.token;
  if (!eagleToken) { console.error('❌ Eagle Wu 登入失敗'); process.exit(1); }

  const usersRes = await api('GET', '/api/users?companyId=1', null, adminToken);
  const eagleId = usersRes.data?.find(u => u.name?.includes('Eagle Wu'))?.id;
  console.log(`✔ admin 已登入 | Eagle Wu id=${eagleId}\n`);

  // 確保通知偏好全開
  await api('PATCH', `/api/settings/notifications/${eagleId}`, {
    taskAssigned: true, taskDueReminder: true, taskOverdue: true,
    taskCompleted: true, mentioned: true, projectUpdate: true,
  }, eagleToken);

  // 清空收件匣
  const old = await api('GET', '/api/notifications', null, eagleToken);
  for (const n of (old.data || [])) await api('DELETE', `/api/notifications/${n.id}`, null, eagleToken);

  // ── 建立真實專案 ─────────────────────────────────────
  console.log('📦 [admin] 建立專案「新北市智慧交通建設專案」...');
  const proj = await api('POST', '/api/projects', {
    name: '🏗️ 新北市智慧交通建設專案',
    description: '建置新北市 200 個路口智慧號誌系統，整合即時交通監控平台',
    status: 'active',
    startDate: '2026-04-01',
    endDate: '2026-12-31',
  }, adminToken);
  const projectId = proj.data?.id;
  console.log(`  → 專案 id=${projectId}\n`);

  // ══════════════════════════════════════════════════════
  // ① 任務指派 (task_assigned)
  // ══════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('① [admin] 指派任務給 Eagle Wu → task_assigned');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const t1 = await api('POST', `/api/projects/${projectId}/tasks`, {
    title: '📋 完成路口感測器規格書',
    description: '撰寫 IoT 感測器的技術規格文件，含通訊協定、安裝規範',
    status: 'todo',
    priority: 'high',
    assigneeId: eagleId,
    dueDate: '2026-04-15',
  }, adminToken);
  console.log(`  → 任務 id=${t1.data?.id}`);
  await sleep(1000);

  let inbox = await api('GET', '/api/notifications', null, eagleToken);
  let found = inbox.data?.find(n => n.type === 'task_assigned');
  console.log(found
    ? `  📨 收到！「${found.title}」\n     ${found.message}\n`
    : '  ⚠️ 未收到 task_assigned 通知\n');

  // ══════════════════════════════════════════════════════
  // ② 到期提醒 (deadline_approaching)
  // ══════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('② [admin] 建立明天到期任務 → deadline_approaching (排程掃描)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const t2 = await api('POST', `/api/projects/${projectId}/tasks`, {
    title: '📊 編製第一季進度報告',
    description: '統計 Q1 施工進度，含照片、數據分析',
    status: 'in_progress',
    priority: 'urgent',
    assigneeId: eagleId,
    dueDate: tomorrow.toISOString().slice(0, 10),
  }, adminToken);
  console.log(`  → 任務 id=${t2.data?.id}，截止 ${tomorrow.toISOString().slice(0, 10)}`);
  await sleep(500);

  // 觸發排程掃描
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const { scanDeadlineApproaching, scanTaskOverdue } = require('../src/services/notificationCenter');
  console.log('  🔄 執行排程掃描 scanDeadlineApproaching()...');
  const cnt2 = await scanDeadlineApproaching(prisma);
  console.log(`  → 產生 ${cnt2} 筆到期提醒`);
  await sleep(500);

  inbox = await api('GET', '/api/notifications', null, eagleToken);
  found = inbox.data?.find(n => n.type === 'deadline_approaching');
  console.log(found
    ? `  📨 收到！「${found.title}」\n     ${found.message}\n`
    : '  ⚠️ 未收到 deadline_approaching 通知\n');

  // ══════════════════════════════════════════════════════
  // ③ 逾期警示 (task_overdue)
  // ══════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('③ [admin] 建立已逾期任務 → task_overdue (排程掃描)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const past = new Date();
  past.setDate(past.getDate() - 5);
  const t3 = await api('POST', `/api/projects/${projectId}/tasks`, {
    title: '🔧 協調號誌系統廠商進場時程',
    description: '與三家廠商協調進場施工排程，確認材料到場日期',
    status: 'in_progress',
    priority: 'urgent',
    assigneeId: eagleId,
    dueDate: past.toISOString().slice(0, 10),
  }, adminToken);
  console.log(`  → 任務 id=${t3.data?.id}，截止 ${past.toISOString().slice(0, 10)}（已逾期 5 天）`);
  await sleep(500);

  console.log('  🔄 執行排程掃描 scanTaskOverdue()...');
  const cnt3 = await scanTaskOverdue(prisma);
  console.log(`  → 產生 ${cnt3} 筆逾期警示`);
  await sleep(500);

  inbox = await api('GET', '/api/notifications', null, eagleToken);
  found = inbox.data?.find(n => n.type === 'task_overdue');
  console.log(found
    ? `  📨 收到！「${found.title}」\n     ${found.message}\n`
    : '  ⚠️ 未收到 task_overdue 通知\n');

  // ══════════════════════════════════════════════════════
  // ④ 任務完成 (task_completed)
  // ══════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('④ [admin] 將任務標為完成 → task_completed');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const t4 = await api('POST', `/api/projects/${projectId}/tasks`, {
    title: '✅ 確認監控平台伺服器規格',
    description: '確認採購清單：CPU、記憶體、硬碟、網卡規格',
    status: 'review',
    priority: 'medium',
    assigneeId: eagleId,
  }, adminToken);
  const taskId4 = t4.data?.id;
  console.log(`  → 建立任務 id=${taskId4}（狀態 review）`);
  await sleep(500);

  console.log('  → [admin] PATCH status=done...');
  await api('PATCH', `/api/projects/tasks/${taskId4}`, { status: 'done' }, adminToken);
  await sleep(1500);

  inbox = await api('GET', '/api/notifications', null, eagleToken);
  found = inbox.data?.find(n => n.type === 'task_completed' && n.resourceId === taskId4);
  console.log(found
    ? `  📨 收到！「${found.title}」\n     ${found.message}\n`
    : '  ⚠️ 未收到 task_completed 通知\n');

  // ══════════════════════════════════════════════════════
  // ⑤ 被提及 (mentioned)
  // ══════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⑤ [admin] 在留言中 @Eagle Wu → mentioned');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const taskForComment = t1.data?.id;
  const comment = await api('POST', `/api/projects/tasks/${taskForComment}/comments`, {
    content: '@Eagle Wu 吳柏緯 感測器規格書初稿已上傳 SharePoint，請協助審閱並回饋修改意見，謝謝！',
  }, adminToken);
  console.log(`  → 留言 id=${comment.data?.id}`);
  await sleep(1000);

  inbox = await api('GET', '/api/notifications', null, eagleToken);
  found = inbox.data?.find(n => n.type === 'mentioned');
  console.log(found
    ? `  📨 收到！「${found.title}」\n     ${found.message}\n`
    : '  ⚠️ 未收到 mentioned 通知\n');

  // ══════════════════════════════════════════════════════
  // ⑥ 里程碑達成 (milestone_achieved)
  // ══════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⑥ [admin] 里程碑達成 → milestone_achieved');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const ms = await api('POST', `/api/projects/${projectId}/milestones`, {
    name: '🎯 Phase 1：感測器部署完成',
    dueDate: '2026-06-30',
    color: 'green',
  }, adminToken);
  const milestoneId = ms.data?.id;
  console.log(`  → 里程碑 id=${milestoneId}`);

  console.log('  → [admin] PATCH isAchieved=true...');
  await api('PATCH', `/api/projects/milestones/${milestoneId}`, { isAchieved: true }, adminToken);
  await sleep(1000);

  inbox = await api('GET', '/api/notifications', null, eagleToken);
  found = inbox.data?.find(n => n.type === 'milestone_achieved');
  console.log(found
    ? `  📨 收到！「${found.title}」\n     ${found.message}\n`
    : '  ⚠️ 未收到 milestone_achieved 通知\n');

  // ── 最終收件匣狀態 ───────────────────────────────────
  console.log('═══════════════════════════════════════════════════');
  console.log('  📥 Eagle Wu 收件匣最終狀態');
  console.log('═══════════════════════════════════════════════════');
  const final = await api('GET', '/api/notifications', null, eagleToken);
  const msgs = final.data || [];
  const unread = msgs.filter(n => !n.isRead).length;
  console.log(`  共 ${msgs.length} 則通知，${unread} 則未讀\n`);

  const typeOrder = ['task_assigned', 'deadline_approaching', 'task_overdue', 'task_completed', 'mentioned', 'milestone_achieved'];
  const typeLabel = {
    task_assigned: '📝 任務指派', deadline_approaching: '⏰ 到期提醒',
    task_overdue: '🚨 逾期警示', task_completed: '✅ 任務完成',
    mentioned: '💬 被提及', milestone_achieved: '🎯 里程碑達成',
  };

  // 按類型排列顯示
  for (const type of typeOrder) {
    const items = msgs.filter(n => n.type === type);
    if (items.length === 0) {
      console.log(`  ${typeLabel[type] || type}: ──（無）`);
    }
    for (const n of items) {
      const time = new Date(n.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
      const read = n.isRead ? '已讀' : '🔴未讀';
      console.log(`  ${typeLabel[n.type] || n.type} [${read}] ${time}`);
      console.log(`    標題: ${n.title}`);
      console.log(`    內容: ${n.message}`);
      console.log();
    }
  }

  await prisma.$disconnect();
  console.log('═══════════════════════════════════════════════════');
  console.log('  ✅ 真實發信測試完成！請開啟前端收件匣頁面確認');
  console.log('     http://localhost:3838 → 收件匣');
  console.log('═══════════════════════════════════════════════════');
})();
