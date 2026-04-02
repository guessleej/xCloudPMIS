#!/usr/bin/env node
/**
 * 以管理員身份建立完整工作流程，讓 Eagle Wu 收件匣收到所有類型的通知
 */
'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../src/config/jwt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE = 'http://localhost:3000';
const ADMIN_ID = 1;
const MEMBER_ID = 2;

const adminToken = jwt.sign({ id: ADMIN_ID, companyId: 1, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return res.json().catch(() => ({}));
}

function getId(r) { return r?.data?.id || r?.id || null; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  try {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  為 Eagle Wu 建立完整工作流程通知                 ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    // 0. 清除所有舊通知
    await prisma.notification.deleteMany({ where: { recipientId: MEMBER_ID } });
    console.log('🧹 已清除所有舊通知\n');

    // 1. 確保通知全開
    const eagle = await prisma.user.findUnique({ where: { id: MEMBER_ID } });
    console.log(`👤 目標帳號: ${eagle.name} (${eagle.email})`);
    await prisma.user.update({
      where: { id: MEMBER_ID },
      data: {
        settings: {
          ...(eagle.settings || {}),
          notificationSettings: {
            pushNotifications: true, emailNotifications: true,
            taskAssigned: true, taskCompleted: true, taskDueReminder: true,
            mentioned: true, projectUpdate: true,
            digestEnabled: false, digestFrequency: 'daily',
          },
        },
      },
    });
    console.log('✅ 通知偏好已全部開啟\n');

    // 2. 建立專案
    const proj = await api('POST', '/api/projects', {
      name: '🏗️ 新北市智慧交通建設專案',
      description: '包含號誌優化、路口感測器佈建、中央監控平台建置',
      status: 'active', priority: 'high',
    });
    const projectId = getId(proj);
    console.log(`📁 專案: "${proj.data?.name}" (ID: ${projectId})`);

    // 加入成員
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: MEMBER_ID } },
      create: { projectId, userId: MEMBER_ID, role: 'editor' },
      update: { role: 'editor' },
    });
    console.log('👥 Eagle Wu 已加入專案\n');

    // ── ① 任務指派 (task_assigned) × 3 ──
    console.log('━━ ① 建立任務 → task_assigned ━━');

    const t1 = await api('POST', `/api/projects/${projectId}/tasks`, {
      title: '📋 完成路口感測器規格書',
      description: '彙整現有感測器規格，撰寫本專案技術規格書',
      status: 'in_progress', priority: 'high', assigneeId: MEMBER_ID,
    });
    console.log(`   ✓ 任務 #${getId(t1)}: ${t1.data?.title}`);

    const t2 = await api('POST', `/api/projects/${projectId}/tasks`, {
      title: '📊 編製第一季進度報告',
      description: '統整各分項工程進度，製作甘特圖並產出月報',
      status: 'todo', priority: 'medium', assigneeId: MEMBER_ID,
    });
    console.log(`   ✓ 任務 #${getId(t2)}: ${t2.data?.title}`);

    const t3 = await api('POST', `/api/projects/${projectId}/tasks`, {
      title: '🔧 協調號誌系統廠商進場時程',
      description: '聯繫三家廠商確認進場時間與施工配合事項',
      status: 'in_progress', priority: 'high', assigneeId: MEMBER_ID,
    });
    console.log(`   ✓ 任務 #${getId(t3)}: ${t3.data?.title}`);
    console.log('   📨 → 3 筆 task_assigned 通知\n');

    await sleep(800);

    // ── ② 留言通知 (comment_added) × 2 ──
    console.log('━━ ② 在任務上留言 → comment_added ━━');

    await api('POST', `/api/projects/tasks/${getId(t1)}/comments`, {
      content: '@Eagle Wu 規格書初稿已放在共用資料夾，請抽空 review，週五前需要定版。有問題隨時討論！',
    });
    console.log(`   ✓ 在「完成路口感測器規格書」留言`);

    await api('POST', `/api/projects/tasks/${getId(t2)}/comments`, {
      content: '進度報告模板已更新到最新版，請用新模板製作。另外記得加上風險評估那頁。',
    });
    console.log(`   ✓ 在「編製第一季進度報告」留言`);
    console.log('   📨 → 2 筆 comment_added 通知\n');

    await sleep(500);

    // ── ③ 任務完成 (task_completed) ──
    console.log('━━ ③ 完成任務 → task_completed ━━');

    const t4 = await api('POST', `/api/projects/${projectId}/tasks`, {
      title: '✅ 確認監控平台伺服器規格',
      description: '與資訊部確認伺服器硬體規格與網路架構',
      status: 'in_progress', priority: 'low', assigneeId: MEMBER_ID,
    });
    console.log(`   ✓ 建立任務 #${getId(t4)}: ${t4.data?.title}`);

    await sleep(500);
    await api('PATCH', `/api/projects/tasks/${getId(t4)}`, { status: 'done' });
    console.log(`   ✓ 任務已標記為完成`);
    console.log('   📨 → 1 筆 task_assigned + 1 筆 task_completed 通知\n');

    await sleep(2000);

    // ── ④ 再指派一個有期限的任務 ──
    console.log('━━ ④ 建立有期限的任務 → task_assigned ━━');
    const t5 = await api('POST', `/api/projects/${projectId}/tasks`, {
      title: '📅 提交環評報告初稿',
      description: '整理環境影響評估資料並提交初稿給環保局',
      status: 'todo', priority: 'critical', assigneeId: MEMBER_ID,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    });
    console.log(`   ✓ 任務 #${getId(t5)}: ${t5.data?.title}`);
    console.log('   📨 → 1 筆 task_assigned 通知\n');

    await sleep(500);

    // ── ⑤ 更多留言 ──
    console.log('━━ ⑤ 更多留言 → comment_added ━━');
    await api('POST', `/api/projects/tasks/${getId(t3)}/comments`, {
      content: '廠商 A 已確認下週一可進場，廠商 B 需要再協調，請幫忙追蹤。',
    });
    console.log(`   ✓ 在「協調號誌系統廠商進場時程」留言`);
    console.log('   📨 → 1 筆 comment_added 通知\n');

    await sleep(1000);

    // ── 統計結果 ──
    const notifs = await prisma.notification.findMany({
      where: { recipientId: MEMBER_ID },
      orderBy: { createdAt: 'desc' },
    });

    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║           Eagle Wu 收件匣通知總覽                ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    const byType = {};
    notifs.forEach(n => { byType[n.type] = (byType[n.type] || 0) + 1; });
    const emoji = { task_assigned: '📋', comment_added: '💬', task_completed: '✅' };
    const label = { task_assigned: '任務指派', comment_added: '留言通知', task_completed: '任務完成' };

    console.log(`  📬 總通知數: ${notifs.length}\n`);
    Object.entries(byType).forEach(([t, c]) => {
      console.log(`  ${emoji[t] || '🔔'} ${label[t] || t}: ${c} 則`);
    });

    console.log('\n  ── 通知列表 ──');
    notifs.forEach((n, i) => {
      console.log(`  ${i + 1}. ${emoji[n.type] || '🔔'} [${label[n.type] || n.type}] ${n.title}`);
    });

    console.log('\n🎉 請到 http://localhost:3838 重新整理收件匣頁面！');

  } catch (e) {
    console.error('❌ 錯誤:', e);
  } finally {
    await prisma.$disconnect();
  }
})();
