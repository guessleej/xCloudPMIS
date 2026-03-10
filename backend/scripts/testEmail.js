#!/usr/bin/env node
/**
 * scripts/testEmail.js
 * ─────────────────────────────────────────────────────────────
 * Microsoft Graph API 郵件發送測試腳本
 *
 * 使用方式：
 *   node scripts/testEmail.js
 *   node scripts/testEmail.js --to=your@email.com
 *   node scripts/testEmail.js --type=reminder
 *   node scripts/testEmail.js --type=overdue
 *   node scripts/testEmail.js --type=weekly
 *   node scripts/testEmail.js --type=token  （只測試認證，不發信）
 *
 * 執行前請確認 .env 已設定以下變數：
 *   O365_CLIENT_ID, O365_CLIENT_SECRET, O365_TENANT_ID, O365_SENDER_EMAIL
 */

'use strict';

// 載入 .env（從 backend 根目錄往上找兩層）
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
// 若 .env 在 backend 目錄
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { getAccessToken, getTokenStatus } = require('../src/services/graphAuth');
const emailService = require('../src/services/emailService');

// ── 解析命令列參數 ────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace(/^--/, '').split('=');
  acc[key] = val ?? true;
  return acc;
}, {});

const TEST_TO   = args.to   || process.env.TEST_EMAIL || process.env.O365_SENDER_EMAIL;
const TEST_TYPE = args.type || 'assignment';

// ════════════════════════════════════════════════════════════
// 測試資料（模擬真實場景）
// ════════════════════════════════════════════════════════════

const mockTask = {
  id:          999,
  title:       '完成第三季度銷售報告並提交主管審核',
  projectName: 'Q3 業績達成計畫',
  priority:    'high',
  status:      'in_progress',
  dueDate:     new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 天後
  description: '需要彙整 7~9 月的銷售數據，製作 PPT 並在週五前提交給副理審核。',
  assignerName: '張副理',
};

const mockOverdueTask = {
  ...mockTask,
  title:   '更新客戶資料庫聯絡資訊',
  dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 天前
  priority: 'urgent',
};

const mockWeeklyReport = {
  weekLabel:     '2026/03/10 ~ 2026/03/14',
  summary: {
    totalActive: 42,
    completed:   18,
    overdue:     7,
    upcoming:    12,
  },
  overdueList: [
    { title: '客戶 A 提案準備',        assignee: '王小明', daysOverdue: 8 },
    { title: '年度採購合約更新',        assignee: '林雅婷', daysOverdue: 5 },
    { title: 'IT 資安稽核報告提交',    assignee: '陳志明', daysOverdue: 3 },
    { title: '員工績效評核系統設定',   assignee: '王小明', daysOverdue: 2 },
  ],
  upcomingList: [
    { title: 'Q1 財報數據整理',        assignee: '林雅婷', daysLeft: 2 },
    { title: '新版官網上線測試',        assignee: '陳志明', daysLeft: 3 },
    { title: '年度預算提報',           assignee: '王小明', daysLeft: 5 },
  ],
  completedList: [
    { title: '供應商合約審查',         assignee: '林雅婷' },
    { title: 'Docker 環境升級',        assignee: '陳志明' },
    { title: '員工教育訓練規劃',       assignee: '王小明' },
  ],
};

// ════════════════════════════════════════════════════════════
// 測試函式
// ════════════════════════════════════════════════════════════

async function testTokenOnly() {
  console.log('\n🔐 測試 Azure AD Token 取得...\n');
  const status = getTokenStatus();
  console.log('Token 快取狀態:', status);

  try {
    const token = await getAccessToken();
    console.log('✅ Token 取得成功！');
    console.log(`   前 20 字元：${token.substring(0, 20)}...`);
    console.log(`   長度：${token.length} 字元`);
    const statusAfter = getTokenStatus();
    console.log(`   快取剩餘有效期：${statusAfter.expiresIn} 秒`);
  } catch (err) {
    console.error('❌ Token 取得失敗:', err.message);
    process.exit(1);
  }
}

async function testAssignment() {
  console.log('\n📋 測試任務指派通知郵件...\n');
  console.log(`發送至：${TEST_TO}`);
  await emailService.sendTaskAssignmentNotification(TEST_TO, '測試用戶', mockTask);
  console.log('✅ 任務指派通知發送成功！請至 Outlook 收信匣查看。');
}

async function testReminder() {
  console.log('\n⏰ 測試任務截止提醒郵件...\n');
  console.log(`發送至：${TEST_TO}`);
  await emailService.sendTaskReminder(TEST_TO, '測試用戶', mockTask);
  console.log('✅ 截止提醒郵件發送成功！');
}

async function testOverdue() {
  console.log('\n🚨 測試逾期警告郵件...\n');
  console.log(`發送至：${TEST_TO}`);
  await emailService.sendOverdueWarning(TEST_TO, '測試用戶', mockOverdueTask);
  console.log('✅ 逾期警告郵件發送成功！');
}

async function testWeekly() {
  console.log('\n📊 測試週報郵件...\n');
  console.log(`發送至：${TEST_TO}`);
  await emailService.sendWeeklyReport(TEST_TO, '測試主管', mockWeeklyReport);
  console.log('✅ 週報郵件發送成功！');
}

async function testBatch() {
  console.log('\n📬 測試批次發送（3 封）...\n');
  const jobs = [
    () => emailService.sendTaskReminder(TEST_TO, '測試用戶 A', { ...mockTask, title: '批次測試任務 #1' }),
    () => emailService.sendTaskReminder(TEST_TO, '測試用戶 B', { ...mockTask, title: '批次測試任務 #2' }),
    () => emailService.sendTaskReminder(TEST_TO, '測試用戶 C', { ...mockTask, title: '批次測試任務 #3' }),
  ];
  const result = await emailService.batchSendEmails(jobs, 3);
  console.log(`✅ 批次發送完成：成功 ${result.sent}，失敗 ${result.failed}`);
}

// ════════════════════════════════════════════════════════════
// 環境變數檢查
// ════════════════════════════════════════════════════════════

function checkEnvVars() {
  const required = {
    O365_CLIENT_ID:     '應用程式 (用戶端) 識別碼',
    O365_CLIENT_SECRET: '用戶端密碼值',
    O365_TENANT_ID:     '目錄 (租用戶) 識別碼',
    O365_SENDER_EMAIL:  '發件人信箱',
  };

  const missing = Object.entries(required)
    .filter(([k]) => !process.env[k])
    .map(([k, desc]) => `  ${k}（${desc}）`);

  if (missing.length > 0) {
    console.error('❌ 以下必要環境變數未設定，請確認 .env 檔案：\n');
    missing.forEach(m => console.error(m));
    console.error('\n請參考 docs/EXCHANGE_SETUP.md 完成 Azure AD 設定。');
    process.exit(1);
  }

  console.log('✅ 環境變數檢查通過');
  console.log(`   CLIENT_ID   : ...${process.env.O365_CLIENT_ID.slice(-6)}`);
  console.log(`   TENANT_ID   : ...${process.env.O365_TENANT_ID.slice(-6)}`);
  console.log(`   SENDER_EMAIL: ${process.env.O365_SENDER_EMAIL}`);
  console.log(`   發送目標    : ${TEST_TO || '（未指定，請用 --to=your@email.com）'}`);
}

// ════════════════════════════════════════════════════════════
// 主程式
// ════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  xCloudPMIS — Microsoft Graph API 郵件測試');
  console.log('═══════════════════════════════════════════════');
  console.log(`  測試類型：${TEST_TYPE}`);
  console.log(`  發送目標：${TEST_TO || '未設定'}`);
  console.log('═══════════════════════════════════════════════\n');

  // 只測試 Token 時不需要收件人
  if (TEST_TYPE !== 'token') {
    if (!TEST_TO) {
      console.error('❌ 請指定收件人信箱：');
      console.error('   node scripts/testEmail.js --to=your@email.com');
      console.error('   或在 .env 中設定 TEST_EMAIL=your@email.com\n');
      process.exit(1);
    }
    checkEnvVars();
  }

  const startTime = Date.now();

  try {
    switch (TEST_TYPE) {
      case 'token':      await testTokenOnly();  break;
      case 'assignment': await testAssignment(); break;
      case 'reminder':   await testReminder();   break;
      case 'overdue':    await testOverdue();    break;
      case 'weekly':     await testWeekly();     break;
      case 'batch':      await testBatch();      break;
      default:
        console.error(`❌ 未知的測試類型：${TEST_TYPE}`);
        console.error('   可用類型：token | assignment | reminder | overdue | weekly | batch');
        process.exit(1);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n⏱️  總耗時：${elapsed} 秒`);
    console.log('\n📨 請至 Outlook 收信匣確認郵件（若未收到請也檢查垃圾郵件匣）');
    console.log('\n常見問題排查：');
    console.log('  401 Unauthorized → Token 過期或設定錯誤，請重新確認 CLIENT_ID/SECRET/TENANT_ID');
    console.log('  403 Forbidden    → 管理員尚未同意 Mail.Send 權限，請至 Azure Portal 授權');
    console.log('  404 Not Found    → 發件人信箱不存在，請確認 O365_SENDER_EMAIL');

  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`\n❌ 測試失敗（${elapsed}秒後）：${err.message}`);
    if (err.status) console.error(`   HTTP 狀態碼：${err.status}`);
    if (err.code)   console.error(`   錯誤代碼：${err.code}`);
    process.exit(1);
  }
}

main();
