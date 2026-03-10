#!/usr/bin/env node
/**
 * scripts/testAiAgent.js
 * ─────────────────────────────────────────────────────────────
 * AI Agent 服務測試腳本
 *
 * 使用方式：
 *   node scripts/testAiAgent.js --type=breakdown
 *   node scripts/testAiAgent.js --type=risk
 *   node scripts/testAiAgent.js --type=report
 *   node scripts/testAiAgent.js --type=health    （快速計算，不呼叫 AI）
 *   node scripts/testAiAgent.js --type=schedule
 *   node scripts/testAiAgent.js --type=all       （執行所有測試）
 *
 * 執行前確認：
 *   1. .env 中已設定 OPENAI_API_KEY=sk-...
 *   2. 已執行 npm install
 *
 * 費用估算（GPT-4o，2025 年定價）：
 *   - breakdown 測試：約 $0.02 ~ $0.05
 *   - risk 測試：    約 $0.02 ~ $0.04
 *   - report 測試：  約 $0.001（使用 gpt-4o-mini）
 *   - schedule 測試：約 $0.02 ~ $0.04
 */

'use strict';

const path = require('path');
// 載入環境變數（支援多種執行路徑）
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../backend/.env') });

const aiAgent = require('../src/services/aiAgent');

// ── CLI 參數解析 ────────────────────────────────────────────
const args  = process.argv.slice(2);
const type  = (args.find(a => a.startsWith('--type='))  || '--type=breakdown').split('=')[1];

// ── 顏色輸出 ────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
};

function title(text) {
  const line = '═'.repeat(60);
  console.log(`\n${c.cyan}${line}`);
  console.log(`  ${c.bold}${text}${c.reset}${c.cyan}`);
  console.log(`${line}${c.reset}\n`);
}

function ok(label, value) {
  console.log(`${c.green}✅ ${c.bold}${label}${c.reset}`);
  if (value !== undefined) {
    if (typeof value === 'object') {
      console.log(c.gray + JSON.stringify(value, null, 2).slice(0, 800) + c.reset);
    } else {
      console.log(c.gray + String(value).slice(0, 500) + c.reset);
    }
  }
  console.log('');
}

function fail(label, err) {
  console.error(`${c.red}❌ ${c.bold}${label}${c.reset}`);
  console.error(`${c.red}   ${err.message}${c.reset}\n`);
}

function info(label, value) {
  console.log(`${c.blue}ℹ️  ${label}${c.reset}：${c.yellow}${value}${c.reset}`);
}

// ════════════════════════════════════════════════════════════
// 測試資料（Mock Data）
// ════════════════════════════════════════════════════════════

/** 模擬專案資料（風險偏高，方便觀察 AI 如何分析）*/
const MOCK_PROJECT = {
  id:          42,
  name:        'Q2 電商平台重構專案',
  status:      'active',
  endDate:     new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 週後
  budget:      500000,
  tasks: [
    // 已完成
    { id: 1, title: '需求訪談', status: 'done', priority: 'high', dueDate: new Date('2026-02-01'), assignee: { id: 1, name: '王小明', email: 'wang@company.com' } },
    { id: 2, title: '系統架構設計', status: 'done', priority: 'high', dueDate: new Date('2026-02-10'), assignee: { id: 1, name: '王小明', email: 'wang@company.com' } },

    // 逾期任務（有問題）
    { id: 3, title: '後端 API 開發', status: 'in_progress', priority: 'urgent', dueDate: new Date('2026-02-28'), assignee: { id: 2, name: '李大華', email: 'li@company.com' } },
    { id: 4, title: '資料庫 Schema 設計', status: 'in_progress', priority: 'high', dueDate: new Date('2026-02-20'), assignee: { id: 2, name: '李大華', email: 'li@company.com' } },
    { id: 5, title: '第三方金流串接', status: 'todo', priority: 'urgent', dueDate: new Date('2026-02-25'), assignee: { id: 3, name: '陳美玲', email: 'chen@company.com' } },

    // 正常進行中
    { id: 6, title: '前端 UI 切版', status: 'in_progress', priority: 'medium', dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), assignee: { id: 4, name: '張偉', email: 'zhang@company.com' } },
    { id: 7, title: '購物車功能', status: 'todo', priority: 'high', dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), assignee: { id: 4, name: '張偉', email: 'zhang@company.com' } },
    { id: 8, title: '搜尋功能', status: 'todo', priority: 'medium', dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), assignee: { id: 3, name: '陳美玲', email: 'chen@company.com' } },

    // 未指派任務
    { id: 9,  title: '整合測試', status: 'todo', priority: 'high', dueDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000), assignee: null },
    { id: 10, title: '效能優化', status: 'todo', priority: 'medium', dueDate: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000), assignee: null },
  ],
  milestones: [
    { id: 1, name: 'API 完成', dueDate: new Date('2026-02-28'), isAchieved: false },
    { id: 2, name: '前端完成', dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), isAchieved: false },
    { id: 3, name: '上線', dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), isAchieved: false },
  ],
  team: [
    { id: 1, name: '王小明', email: 'wang@company.com', taskCount: 2, overdueCount: 0 },
    { id: 2, name: '李大華', email: 'li@company.com',   taskCount: 2, overdueCount: 2 },
    { id: 3, name: '陳美玲', email: 'chen@company.com', taskCount: 2, overdueCount: 1 },
    { id: 4, name: '張偉',   email: 'zhang@company.com', taskCount: 2, overdueCount: 0 },
  ],
};

/** 模擬週報資料 */
const MOCK_REPORT_DATA = {
  projectName:      'Q2 電商平台重構專案',
  weekRange:        '2026/03/04 ~ 2026/03/10',
  totalHoursLogged: 87,
  completedThisWeek: [
    { title: '需求訪談報告撰寫', assignee: '王小明', dueDate: '2026/03/05' },
    { title: '資料庫 ERD 設計', assignee: '李大華', dueDate: '2026/03/07' },
    { title: '登入/登出功能開發', assignee: '陳美玲', dueDate: '2026/03/08' },
  ],
  inProgress: [
    { title: '後端 API 開發（購物車模組）', assignee: '李大華', progress: '60%' },
    { title: '前端 UI 切版（商品列表頁）', assignee: '張偉', progress: '40%' },
    { title: '第三方金流 API 串接研究', assignee: '陳美玲', progress: '20%' },
  ],
  blocked: [
    { title: '金流串接開發', blockReason: '等待綠界科技提供測試帳號，預計下週一收到' },
  ],
  highlights: [
    '資料庫設計提前 2 天完成，品質超出預期',
    '成功導入 CI/CD 流程，自動化測試覆蓋率達 80%',
  ],
  nextWeekPlan: [
    '完成後端購物車 API（週三前）',
    '開始金流串接（週三後）',
    '前端完成商品詳情頁與購物車頁',
    '準備第一次 UAT 測試環境',
  ],
  audience: '技術主管與 PM',
  style:    'formal',
};

// ════════════════════════════════════════════════════════════
// 測試函式
// ════════════════════════════════════════════════════════════

async function testBreakdown() {
  title('測試 1：任務拆解（Task Breakdown）');
  info('模型', 'gpt-4o');
  info('測試目標', '「建立公司內部人資請假系統」');
  console.log('');

  const start = Date.now();
  try {
    const result = await aiAgent.breakdownTask(
      '建立公司內部人資請假系統，員工可申請年假、病假、特休，主管可審核，HR 可查看所有人的假勤記錄',
      {
        teamSize:  4,
        techStack: 'React + Node.js + PostgreSQL',
        duration:  '8 週',
      }
    );

    ok(`完成！耗時 ${((Date.now() - start) / 1000).toFixed(1)}s`);
    info('總估算工時', `${result.totalEstimatedHours} 人時`);
    info('建議時程', result.suggestedDuration);
    info('拆解任務數', `${result.tasks?.length || 0} 個`);
    console.log('\n摘要：', result.summary);
    console.log('\n前 3 個任務預覽：');
    (result.tasks || []).slice(0, 3).forEach(t => {
      console.log(`  ${t.order}. [${t.priority}] ${t.title} — ${t.estimatedHours} 人時`);
    });
    info('API 費用估算', `$${aiAgent._estimateCost('gpt-4o', result._meta?.promptTokens || 0, result._meta?.completionTokens || 0).toFixed(5)} USD`);
  } catch (err) {
    fail('任務拆解失敗', err);
  }
}

async function testRiskAnalysis() {
  title('測試 2：風險分析（Risk Analysis）');
  info('模型', 'gpt-4o');
  info('測試專案', MOCK_PROJECT.name);
  info('專案狀態', '逾期任務 3 個 / 共 10 個任務，2 週後截止');
  console.log('');

  const start = Date.now();
  try {
    const result = await aiAgent.analyzeRisk(MOCK_PROJECT);

    ok(`完成！耗時 ${((Date.now() - start) / 1000).toFixed(1)}s`);
    info('風險分數', `${result.riskScore} / 100`);
    info('風險等級', result.riskLevelLabel);
    console.log('\n摘要：', result.summary);
    console.log('\n風險因素（前 2 個）：');
    (result.factors || []).slice(0, 2).forEach(f => {
      console.log(`  [${f.severity}] ${f.title}（${f.categoryLabel}）`);
      console.log(`    → ${f.description.slice(0, 100)}...`);
    });
    console.log('\n最優先建議：');
    const top = result.recommendations?.[0];
    if (top) {
      console.log(`  1. ${top.action}`);
      console.log(`     負責人：${top.owner}，時限：${top.timeline}`);
    }
  } catch (err) {
    fail('風險分析失敗', err);
  }
}

async function testWeeklyReport() {
  title('測試 3：週報生成（Weekly Report）');
  info('模型', 'gpt-4o-mini（較便宜）');
  info('時間範圍', MOCK_REPORT_DATA.weekRange);
  console.log('');

  const start = Date.now();
  try {
    const result = await aiAgent.generateWeeklyReport(MOCK_REPORT_DATA);

    ok(`完成！耗時 ${((Date.now() - start) / 1000).toFixed(1)}s`);
    info('Email 主旨', result.subjectLine);
    console.log('\n── 週報內容預覽（前 500 字）──');
    console.log(result.reportPlainText?.slice(0, 500) || result.reportMarkdown?.slice(0, 500));
    console.log('...');
  } catch (err) {
    fail('週報生成失敗', err);
  }
}

async function testHealthScore() {
  title('測試 4：健康度快速計算（Health Score，不呼叫 AI）');
  info('模式', '純公式計算（同步，無 API 費用）');
  console.log('');

  const start = Date.now();
  const result = aiAgent.computeHealthScore(MOCK_PROJECT);
  ok(`完成！耗時 ${Date.now() - start}ms`);
  info('健康分數', `${result.score} / 100`);
  info('狀態',     result.levelLabel);
  console.log('\n詳細指標：', result.breakdown);
}

async function testScheduleOptimize() {
  title('測試 5：排程優化建議（Schedule Optimizer）');
  info('模型', 'gpt-4o');
  info('測試專案', MOCK_PROJECT.name);
  console.log('');

  const start = Date.now();
  try {
    const result = await aiAgent.optimizeSchedule(MOCK_PROJECT);

    ok(`完成！耗時 ${((Date.now() - start) / 1000).toFixed(1)}s`);
    info('可行性', result.feasibility);
    console.log('\n關鍵路徑：', result.criticalPath?.join(' → ') || '未識別');
    console.log('\n前 2 個排程建議：');
    (result.suggestions || []).slice(0, 2).forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.taskTitle}`);
      console.log(`     ${s.currentDueDate} → ${s.suggestedDueDate}（${s.action}）`);
      console.log(`     原因：${s.reason.slice(0, 80)}`);
    });
  } catch (err) {
    fail('排程優化失敗', err);
  }
}

// ════════════════════════════════════════════════════════════
// 主程式
// ════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${c.bold}${c.cyan}xCloudPMIS AI Agent 測試腳本${c.reset}`);
  console.log(`${c.gray}--type=${type}${c.reset}`);

  // 驗證 API Key
  if (type !== 'health') {
    if (!process.env.OPENAI_API_KEY) {
      console.error(`\n${c.red}❌ 缺少 OPENAI_API_KEY！${c.reset}`);
      console.error('   請在 .env 中設定：OPENAI_API_KEY=sk-...');
      process.exit(1);
    }
    console.log(`${c.green}✅ OPENAI_API_KEY 已設定（${process.env.OPENAI_API_KEY.slice(0, 7)}...）${c.reset}`);
    console.log(`${c.yellow}⚠️  此測試會呼叫 OpenAI API，將產生少量費用${c.reset}\n`);
  }

  const testMap = {
    breakdown: testBreakdown,
    risk:      testRiskAnalysis,
    report:    testWeeklyReport,
    health:    testHealthScore,
    schedule:  testScheduleOptimize,
    all: async () => {
      await testHealthScore();        // 先跑免費的
      await testWeeklyReport();      // 最便宜
      await testRiskAnalysis();      // 中等
      await testScheduleOptimize();  // 中等
      await testBreakdown();         // 最貴（prompt 最長）
    },
  };

  const testFn = testMap[type];
  if (!testFn) {
    console.error(`${c.red}❌ 未知測試類型：${type}${c.reset}`);
    console.error(`   可用類型：${Object.keys(testMap).join(', ')}`);
    process.exit(1);
  }

  const globalStart = Date.now();
  await testFn();

  const elapsed = ((Date.now() - globalStart) / 1000).toFixed(1);
  console.log(`\n${c.green}${c.bold}✅ 測試完成！總耗時：${elapsed}s${c.reset}\n`);
}

main().catch(err => {
  console.error(`\n${c.red}${c.bold}程式錯誤：${err.message}${c.reset}`);
  console.error(err.stack);
  process.exit(1);
});
