'use strict';
/**
 * services/autonomous-agent/agents/riskAgent.js
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS — AI 風險分析代理
 *
 * 職責：
 *   1. 計算每個專案的風險分數（0-100）
 *   2. 識別高風險指標（任務延誤、資源超載、里程碑風險等）
 *   3. Monte Carlo 模擬預測完成日期（P50/P85）
 *   4. 生成全公司風險報告（按分數排序）
 *   5. 提供「預警機制」（提前識別潛在問題、給出具體建議）
 *
 * 風險分數組成（加權總計 100 分）：
 *   逾期任務佔比         30 分
 *   高/緊急優先度逾期數   20 分
 *   里程碑風險（7天內）   20 分
 *   資源超載程度          15 分
 *   近期截止日密集度      10 分
 *   時程壓力（工時/剩餘天）5 分
 *
 * 風險等級：
 *   critical (>=80)  — 立即行動
 *   high     (>=60)  — 本週處理
 *   medium   (>=40)  — 本週關注
 *   low      (<40)   — 正常追蹤
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../../../.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['error'] });

// ── 風險評分權重設定 ─────────────────────────────────────────
const RISK_WEIGHTS = {
  overdueTasksRatio:     30, // 逾期任務佔進行中任務的比率
  criticalOverdueTasks:  20, // 高/緊急優先度逾期任務數
  milestoneAtRisk:       20, // 7 天內即將到期的里程碑
  resourceOverload:      15, // 超載人員佔比
  upcomingDeadlines:     10, // 7 天內到期任務密集度
  projectDuration:        5, // 剩餘工時 vs 剩餘時間壓力
};

// ── 風險等級閾值 ─────────────────────────────────────────────
const RISK_LEVELS = {
  critical: 80,
  high:     60,
  medium:   40,
  low:       0,
};

// ════════════════════════════════════════════════════════════
// 核心：單一專案風險分析
// ════════════════════════════════════════════════════════════

/**
 * 分析單一專案的完整風險狀況
 * @param {number} projectId
 * @returns {Promise<Object>} 詳細風險分析結果
 */
async function analyzeProjectRisk(projectId) {
  const now = new Date();

  const [project, tasks, milestones, workloadUsers] = await Promise.all([
    prisma.project.findUnique({
      where:   { id: projectId },
      include: { owner: { select: { id: true, name: true } } },
    }),
    prisma.task.findMany({
      where:   { projectId, deletedAt: null },
      include: { assignee: { select: { id: true, name: true } } },
    }),
    prisma.milestone.findMany({
      where:   { projectId, isAchieved: false },
      orderBy: { dueDate: 'asc' },
    }),
    // 計算此專案相關成員的工作負荷
    prisma.user.findMany({
      where: { assignedTasks: { some: { projectId, deletedAt: null } } },
      include: {
        assignedTasks: {
          where:  { deletedAt: null, status: { not: 'done' } },
          select: {
            id: true, priority: true, dueDate: true,
            estimatedHours: true, projectId: true,
          },
        },
      },
    }),
  ]);

  if (!project) throw new Error(`專案 #${projectId} 不存在`);

  const totalTasks = tasks.length;
  const doneTasks  = tasks.filter(t => t.status === 'done').length;

  // 計算各項風險指標
  const indicators = calculateRiskIndicators(project, tasks, milestones, workloadUsers, now);
  const riskScore  = calculateRiskScore(indicators);
  const riskLevel  = getRiskLevel(riskScore);

  // Monte Carlo 完成日期預測
  const prediction = predictCompletionDate(tasks, project);

  return {
    projectId,
    projectName:      project.name,
    projectOwner:     project.owner?.name || '未指派',
    riskScore,
    riskLevel,
    completionRate:   totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0,
    indicators,
    prediction,
    overdueTaskCount: indicators.details.overdueTasks,
    activeTaskCount:  indicators.details.activeTasks,
    upcomingMilestones: milestones
      .filter(m => {
        const daysLeft = (new Date(m.dueDate) - now) / 86400_000;
        return daysLeft >= -1 && daysLeft <= 14; // -1 天內（含昨天逾期）到 14 天內
      })
      .map(m => ({
        name:    m.name,
        dueDate: m.dueDate,
        daysLeft: Math.ceil((new Date(m.dueDate) - now) / 86400_000),
        color:   m.color,
      })),
    recommendations: generateRecommendations(indicators, riskScore, riskLevel),
    analyzedAt:       now.toISOString(),
  };
}

// ════════════════════════════════════════════════════════════
// 風險指標計算
// ════════════════════════════════════════════════════════════

/**
 * 計算各項風險指標（0-1 正規化）
 *
 * @param {Object} project
 * @param {Array}  tasks
 * @param {Array}  milestones
 * @param {Array}  workloadUsers
 * @param {Date}   now
 * @returns {Object} indicators + details
 */
function calculateRiskIndicators(project, tasks, milestones, workloadUsers, now) {
  const activeTasks     = tasks.filter(t => t.status !== 'done');
  const overdueTasks    = activeTasks.filter(t => t.dueDate && new Date(t.dueDate) < now);
  const criticalOverdue = overdueTasks.filter(t => t.priority === 'urgent' || t.priority === 'high');

  // 指標 1：逾期任務佔活躍任務比率（0-1）
  const overdueRatio = activeTasks.length > 0 ? overdueTasks.length / activeTasks.length : 0;

  // 指標 2：高優先度逾期任務（每 3 個 = 1，最高 1）
  const criticalScore = Math.min(1, criticalOverdue.length / 3);

  // 指標 3：里程碑風險（7 天內有未達成里程碑）
  const nearMilestones = milestones.filter(m => {
    const daysLeft = (new Date(m.dueDate) - now) / 86400_000;
    return daysLeft >= -1 && daysLeft <= 7;
  });
  const milestoneRisk = nearMilestones.length > 0 ? Math.min(1, nearMilestones.length / 2) : 0;

  // 指標 4：資源超載（有超載成員的比率）
  const overloadedCount = workloadUsers.filter(u => {
    const projTasks = u.assignedTasks.filter(t => t.projectId === project.id);
    // 超載定義：此專案有 urgent 任務 OR 任務數超過 5 個
    return projTasks.some(t => t.priority === 'urgent') || projTasks.length > 5;
  }).length;
  const resourceRisk = workloadUsers.length > 0
    ? Math.min(1, overloadedCount / workloadUsers.length)
    : 0;

  // 指標 5：近期截止密集度（7 天內到期的活躍任務比率）
  const dueThisWeek      = activeTasks.filter(t =>
    t.dueDate && new Date(t.dueDate) <= new Date(now.getTime() + 7 * 86400_000)
  );
  const deadlineDensity = activeTasks.length > 0
    ? Math.min(1, dueThisWeek.length / activeTasks.length)
    : 0;

  // 指標 6：時程壓力（剩餘工時 / 剩餘工作時數）
  let durationPressure = 0;
  if (project.endDate) {
    const daysLeft        = Math.max(1, (new Date(project.endDate) - now) / 86400_000);
    const remainingHours  = activeTasks.reduce((s, t) => s + parseFloat(t.estimatedHours || 8), 0);
    const availableHours  = daysLeft * 8; // 每天 8 小時
    durationPressure      = Math.min(1, remainingHours / availableHours);
  }

  return {
    overdueTasksRatio:     overdueRatio,
    criticalOverdueTasks:  criticalScore,
    milestoneAtRisk:       milestoneRisk,
    resourceOverload:      resourceRisk,
    upcomingDeadlines:     deadlineDensity,
    projectDuration:       durationPressure,

    // 詳細數字（供前端顯示）
    details: {
      totalTasks:       tasks.length,
      activeTasks:      activeTasks.length,
      overdueTasks:     overdueTasks.length,
      criticalOverdue:  criticalOverdue.length,
      nearMilestones:   nearMilestones.length,
      overloadedMembers: overloadedCount,
      dueThisWeek:      dueThisWeek.length,
    },
  };
}

/**
 * 計算加權風險分數（0-100）
 */
function calculateRiskScore(indicators) {
  let score = 0;
  score += (indicators.overdueTasksRatio    || 0) * RISK_WEIGHTS.overdueTasksRatio;
  score += (indicators.criticalOverdueTasks || 0) * RISK_WEIGHTS.criticalOverdueTasks;
  score += (indicators.milestoneAtRisk      || 0) * RISK_WEIGHTS.milestoneAtRisk;
  score += (indicators.resourceOverload     || 0) * RISK_WEIGHTS.resourceOverload;
  score += (indicators.upcomingDeadlines    || 0) * RISK_WEIGHTS.upcomingDeadlines;
  score += (indicators.projectDuration      || 0) * RISK_WEIGHTS.projectDuration;
  return Math.min(100, Math.round(score));
}

/**
 * 根據分數返回風險等級標籤
 */
function getRiskLevel(score) {
  if (score >= RISK_LEVELS.critical) return 'critical';
  if (score >= RISK_LEVELS.high)     return 'high';
  if (score >= RISK_LEVELS.medium)   return 'medium';
  return 'low';
}

// ════════════════════════════════════════════════════════════
// Monte Carlo 完成日期模擬
// ════════════════════════════════════════════════════════════

/**
 * 使用 Monte Carlo 方法模擬專案完成日期
 *
 * 方法：
 *   1. 收集歷史任務的「實際工時 / 預估工時」效率比率
 *   2. 計算效率比率的均值（μ）和標準差（σ）
 *   3. 用 Box-Muller 正態分佈對每個未完成任務的工時進行抽樣
 *   4. 重複模擬 1000 次，統計完成天數分布
 *   5. 取 P50（中位數）和 P85（悲觀目標）
 *
 * @param {Array}  tasks      - 所有任務
 * @param {Object} project    - 專案資料（含 endDate）
 * @param {number} iterations - 模擬次數（預設 1000）
 * @returns {Object} 預測結果
 */
function predictCompletionDate(tasks, project, iterations = 1000) {
  const now         = new Date();
  const activeTasks = tasks.filter(t => t.status !== 'done');

  if (activeTasks.length === 0) {
    return {
      p50Date: null, p85Date: null,
      expectedDays: 0, confidence: 'high',
      note: '所有任務已完成',
    };
  }

  // ── 計算效率因子（實際 / 預估 = 效率比率）──────────────
  const completedWithData = tasks.filter(t =>
    t.status === 'done' &&
    t.estimatedHours && parseFloat(t.estimatedHours) > 0 &&
    t.actualHours    && parseFloat(t.actualHours) > 0
  );

  const efficiencyRatios = completedWithData.map(t =>
    parseFloat(t.actualHours) / parseFloat(t.estimatedHours)
  );

  // 預設效率假設：實際通常比預估多花 20%（業界常識）
  const avgEfficiency = efficiencyRatios.length > 0
    ? efficiencyRatios.reduce((a, b) => a + b, 0) / efficiencyRatios.length
    : 1.2;

  const efficiencyStd = efficiencyRatios.length > 1
    ? Math.sqrt(
        efficiencyRatios.reduce((sum, r) => sum + (r - avgEfficiency) ** 2, 0) /
        efficiencyRatios.length
      )
    : 0.3; // 預設標準差 0.3

  // ── 計算每個任務的預估工時 ────────────────────────────────
  const taskHours = activeTasks.map(t => Math.max(1, parseFloat(t.estimatedHours || 8)));

  // ── Monte Carlo 模擬 ─────────────────────────────────────
  const simulatedDays = [];

  for (let i = 0; i < iterations; i++) {
    let totalHours = 0;

    for (const hours of taskHours) {
      // Box-Muller 轉換：生成正態分佈隨機數
      const u1 = Math.max(1e-10, Math.random()); // 避免 log(0)
      const u2 = Math.random();
      const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

      // 效率因子（最低 0.5，最高 3.0，避免極端值）
      const efficiency = Math.max(0.5, Math.min(3.0, avgEfficiency + efficiencyStd * z));
      totalHours += hours * efficiency;
    }

    // 假設並行執行（最多同時 3 個任務進行）
    const parallelFactor = Math.min(activeTasks.length, 3);
    const days = Math.ceil(totalHours / (8 * parallelFactor));
    simulatedDays.push(days);
  }

  simulatedDays.sort((a, b) => a - b);

  const p50Days  = simulatedDays[Math.floor(iterations * 0.50)];
  const p85Days  = simulatedDays[Math.floor(iterations * 0.85)];
  const p50Date  = new Date(now.getTime() + p50Days * 86400_000);
  const p85Date  = new Date(now.getTime() + p85Days * 86400_000);

  // 與計劃截止日比較
  const scheduledEnd = project.endDate ? new Date(project.endDate) : null;
  const delayRisk    = scheduledEnd
    ? Math.ceil((p50Date - scheduledEnd) / 86400_000)
    : null;

  return {
    p50Date:          p50Date.toISOString().split('T')[0],
    p85Date:          p85Date.toISOString().split('T')[0],
    p50Days,
    p85Days,
    scheduledEndDate: scheduledEnd ? scheduledEnd.toISOString().split('T')[0] : null,
    delayRisk:        delayRisk !== null ? delayRisk : 'N/A',
    confidence:       efficiencyRatios.length >= 5 ? 'high'
                    : efficiencyRatios.length >= 2 ? 'medium'
                    : 'low', // 歷史資料少時信心度低
    note: delayRisk === null      ? '⚠️ 專案無截止日，無法比較'
        : delayRisk > 7           ? `🔴 P50 預測將超出計劃 ${delayRisk} 天`
        : delayRisk > 0           ? `🟡 P50 預測將超出計劃 ${delayRisk} 天`
        : delayRisk === 0         ? '🟢 預計準時完成'
        :                           `🟢 預計提前 ${Math.abs(delayRisk)} 天完成`,
    simulationBasis: {
      iterations,
      activeTasks:    activeTasks.length,
      avgEfficiency:  `${Math.round(avgEfficiency * 100)}%`,
      efficiencyStd:  `±${Math.round(efficiencyStd * 100)}%`,
      historicalData: completedWithData.length,
    },
  };
}

// ════════════════════════════════════════════════════════════
// 建議生成
// ════════════════════════════════════════════════════════════

/**
 * 根據風險指標生成具體、可執行的建議
 */
function generateRecommendations(indicators, riskScore, riskLevel) {
  const recs = [];

  if (indicators.overdueTasksRatio > 0.3) {
    recs.push({
      priority: 'P0',
      action:   '緊急處理逾期任務',
      detail:
        `超過 ${Math.round(indicators.overdueTasksRatio * 100)}% 的進行中任務已逾期，` +
        `建議立即召開緊急站立會議，確認阻礙原因並重新分配工作。`,
    });
  }

  if (indicators.criticalOverdueTasks > 0.3) {
    recs.push({
      priority: 'P0',
      action:   '高優先度任務救火',
      detail:
        '有高/緊急優先度任務逾期，可能影響客戶交付承諾，' +
        '建議立即調配額外資源或縮小任務範疇（scope reduction）。',
    });
  }

  if (indicators.milestoneAtRisk > 0) {
    recs.push({
      priority: 'P1',
      action:   '里程碑風險確認',
      detail:
        `本週有 ${indicators.details.nearMilestones} 個里程碑即將到期，` +
        `請確認完成度並評估是否需要與利益關係人溝通調整。`,
    });
  }

  if (indicators.resourceOverload > 0.5) {
    recs.push({
      priority: 'P1',
      action:   '資源重新分配',
      detail:
        `${indicators.details.overloadedMembers} 名成員超載，` +
        `考慮跨專案調配人力、延遲低優先度任務，或評估外包可行性。`,
    });
  }

  if (indicators.upcomingDeadlines > 0.5) {
    recs.push({
      priority: 'P2',
      action:   '截止日密集預警',
      detail:
        `本週有 ${indicators.details.dueThisWeek} 個任務到期，截止日過於密集，` +
        `評估是否有任務可延期、合併或並行執行。`,
    });
  }

  if (indicators.projectDuration > 0.8) {
    recs.push({
      priority: 'P1',
      action:   '時程壓力過高',
      detail:
        '剩餘工時遠超過可用工作時間，建議重新評估範疇（MVP 優先）' +
        '或與管理層討論延期/增加資源。',
    });
  }

  if (recs.length === 0) {
    recs.push({
      priority: 'P2',
      action:   '保持正常監控',
      detail:   `專案狀態良好（風險分數 ${riskScore}），繼續正常追蹤進度即可。`,
    });
  }

  return recs;
}

// ════════════════════════════════════════════════════════════
// 全公司風險報告
// ════════════════════════════════════════════════════════════

/**
 * 生成全公司風險報告（所有進行中的專案）
 * @param {number} companyId
 * @returns {Promise<Object>}
 */
async function generateRiskReport(companyId) {
  const projects = await prisma.project.findMany({
    where: {
      companyId,
      deletedAt: null,
      status:    { in: ['planning', 'active', 'on_hold'] },
    },
    select: { id: true },
  });

  // 並行分析所有專案（錯誤不中斷其他專案的分析）
  const analyses = await Promise.all(
    projects.map(p =>
      analyzeProjectRisk(p.id).catch(err => ({
        projectId:   p.id,
        error:       err.message,
        riskScore:   0,
        riskLevel:   'unknown',
        indicators:  {},
        recommendations: [],
      }))
    )
  );

  const sorted = analyses.sort((a, b) => b.riskScore - a.riskScore);

  return {
    companyId,
    generatedAt:    new Date().toISOString(),
    totalProjects:  projects.length,
    riskDistribution: {
      critical: sorted.filter(p => p.riskLevel === 'critical').length,
      high:     sorted.filter(p => p.riskLevel === 'high').length,
      medium:   sorted.filter(p => p.riskLevel === 'medium').length,
      low:      sorted.filter(p => p.riskLevel === 'low').length,
    },
    avgRiskScore: sorted.length > 0
      ? Math.round(sorted.reduce((s, p) => s + (p.riskScore || 0), 0) / sorted.length)
      : 0,
    projects:     sorted,
    topRisks:     sorted.filter(p => p.riskScore >= 60).slice(0, 5),
    allClear:     sorted.every(p => p.riskScore < 40),
  };
}

// ════════════════════════════════════════════════════════════
// 工具函式
// ════════════════════════════════════════════════════════════

function log(level, msg) {
  const icons = { info: '🔍', warn: '⚠️', error: '❌', success: '✅' };
  process.stderr.write(`[RiskAgent] ${icons[level] || '•'} ${msg}\n`);
}

// ── 對外匯出 ──────────────────────────────────────────────
module.exports = {
  analyzeProjectRisk,
  calculateRiskScore,
  calculateRiskIndicators,
  predictCompletionDate,
  generateRiskReport,
  getRiskLevel,
  RISK_WEIGHTS,
  RISK_LEVELS,
};
