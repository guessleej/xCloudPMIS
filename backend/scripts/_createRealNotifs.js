#!/usr/bin/env node
/**
 * 使用管理員帳號透過真實 API 建立專案/任務/留言，
 * 讓 Eagle Wu (member id=2) 的收件匣收到即時通知。
 */
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../src/config/jwt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE = 'http://localhost:3000';
const ADMIN_ID = 1;
const MEMBER_ID = 2; // Eagle Wu

// ── helpers ──────────────────────────────────────────────
function makeToken(userId) {
  return jwt.sign({ id: userId, companyId: 1, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
}
const adminToken = makeToken(ADMIN_ID);

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

function getId(r) {
  return r?.data?.id || r?.id || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── main ─────────────────────────────────────────────────
(async () => {
  try {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  為 Eagle Wu 建立真實通知（收件匣驗證）           ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    // 0. 確認使用者
    const eagle = await prisma.user.findUnique({ where: { id: MEMBER_ID } });
    console.log(`👤 目標帳號: ${eagle.name} (${eagle.email})\n`);

    // 1. 確保所有通知開關都開啟
    const defaultSettings = {
      pushNotifications: true,
      emailNotifications: true,
      taskAssigned: true,
      taskCompleted: true,
      taskDueReminder: true,
      mentioned: true,
      projectUpdate: true,
      digestEnabled: false,
      digestFrequency: 'daily',
    };
    await prisma.user.update({
      where: { id: MEMBER_ID },
      data: {
        settings: {
          ...(eagle.settings || {}),
          notificationSettings: defaultSettings,
        },
      },
    });
    console.log('✅ 已確保 Eagle Wu 所有通知偏好為開啟狀態\n');

    // 2. 建立專案
    const projRes = await api('POST', '/api/projects', {
      name: '🏗️ 新北市智慧交通建設專案',
      description: '包含號誌優化、路口感測器佈建、中央監控平台建置',
      status: 'active',
      priority: 'high',
    });
    const projectId = getId(projRes);
    console.log(`📁 已建立專案: "${projRes.data?.name}" (ID: ${projectId})`);

    // 3. 將 Eagle Wu 加入專案
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: MEMBER_ID } },
      create: { projectId, userId: MEMBER_ID, role: 'editor' },
      update: { role: 'editor' },
    });
    console.log(`👥 已將 Eagle Wu 加入專案\n`);

    // ── 通知 1: 任務指派 (task_assigned) ──
    console.log('━━ 建立任務 → 觸發「任務指派」通知 ━━');
    const task1Res = await api('POST', `/api/projects/${projectId}/tasks`, {
      title: '📋 完成路口感測器規格書',
      description: '請彙整台北市、桃園市的現有感測器規格，並撰寫本專案技術規格書',
      status: 'in_progress',
      priority: 'high',
      assigneeId: MEMBER_ID,
    });
    const task1Id = getId(task1Res);
    console.log(`   ✓ 任務 #${task1Id}: "${task1Res.data?.title}" → 指派給 Eagle Wu`);
    console.log('   📨 → 應觸發 task_assigned 通知\n');

    await sleep(500);

    // ── 通知 2: 第二個任務指派 ──
    console.log('━━ 建立第二個任務 → 觸發「任務指派」通知 ━━');
    const task2Res = await api('POST', `/api/projects/${projectId}/tasks`, {
      title: '📊 編製第一季進度報告',
      description: '統整各分項工程進度，製作甘特圖並產出月報',
      status: 'todo',
      priority: 'medium',
      assigneeId: MEMBER_ID,
    });
    const task2Id = getId(task2Res);
    console.log(`   ✓ 任務 #${task2Id}: "${task2Res.data?.title}" → 指派給 Eagle Wu`);
    console.log('   📨 → 應觸發 task_assigned 通知\n');

    await sleep(500);

    // ── 通知 3: 留言 (comment_added) ──
    console.log('━━ 在任務上留言 → 觸發「留言通知」 ━━');
    const commentRes = await api('POST', `/api/projects/tasks/${task1Id}/comments`, {
      content: '@Eagle Wu 規格書初稿已經放在共用資料夾了，請抽空 review 一下，週五前需要定版。有問題隨時討論！',
    });
    console.log(`   ✓ 已在任務 #${task1Id} 新增留言`);
    console.log('   📨 → 應觸發 comment_added 通知\n');

    await sleep(500);

    // ── 通知 4: 再一則留言 ──
    console.log('━━ 第二則留言 → 觸發「留言通知」 ━━');
    const comment2Res = await api('POST', `/api/projects/tasks/${task2Id}/comments`, {
      content: '進度報告模板已更新到最新版，請用新模板來製作。另外記得加上風險評估那頁。',
    });
    console.log(`   ✓ 已在任務 #${task2Id} 新增留言`);
    console.log('   📨 → 應觸發 comment_added 通知\n');

    await sleep(500);

    // ── 通知 5: 任務完成 (task_completed via taskRuleEngine) ──
    console.log('━━ 建立並完成任務 → 觸發「任務完成」通知 ━━');
    const task3Res = await api('POST', `/api/projects/${projectId}/tasks`, {
      title: '✅ 確認監控平台伺服器規格',
      description: '與資訊部確認伺服器硬體規格與網路架構',
      status: 'in_progress',
      priority: 'low',
      assigneeId: MEMBER_ID,
    });
    const task3Id = getId(task3Res);
    console.log(`   ✓ 任務 #${task3Id}: "${task3Res.data?.title}"`);

    await sleep(500);

    // 把任務標記為完成 → taskRuleEngine 會觸發 task_completed 通知
    await api('PATCH', `/api/projects/tasks/${task3Id}`, {
      status: 'done',
    });
    console.log(`   ✓ 任務 #${task3Id} 已標記為完成`);
    console.log('   📨 → 應觸發 task_completed 通知\n');

    await sleep(2000); // taskRuleEngine 用 setImmediate，多等一下

    // ── 查看通知數量 ──
    const notifs = await prisma.notification.findMany({
      where: { recipientId: MEMBER_ID },
      orderBy: { createdAt: 'desc' },
    });

    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║            Eagle Wu 收件匣通知統計               ║');
    console.log('╚══════════════════════════════════════════════════╝\n');
    console.log(`  📬 總通知數: ${notifs.length}`);
    console.log('');

    const byType = {};
    notifs.forEach((n) => {
      byType[n.type] = (byType[n.type] || 0) + 1;
    });
    Object.entries(byType).forEach(([type, count]) => {
      const emoji = {
        task_assigned: '📋',
        comment_added: '💬',
        task_completed: '✅',
      }[type] || '🔔';
      console.log(`  ${emoji} ${type}: ${count} 則`);
    });

    console.log('\n  ── 最新通知列表 ──');
    notifs.forEach((n, i) => {
      const emoji = {
        task_assigned: '📋',
        comment_added: '💬',
        task_completed: '✅',
      }[n.type] || '🔔';
      console.log(`  ${i + 1}. ${emoji} [${n.type}] ${n.title}`);
      if (n.message) console.log(`     ${n.message.slice(0, 60)}${n.message.length > 60 ? '…' : ''}`);
    });

    console.log('\n🎉 完成！請到前端 http://localhost:3838 登入 Eagle Wu 帳號查看收件匣。');

  } catch (e) {
    console.error('❌ 錯誤:', e);
  } finally {
    await prisma.$disconnect();
  }
})();
