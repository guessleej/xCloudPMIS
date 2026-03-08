/**
 * Prisma Seed 腳本（Phase 3 完整版）
 *
 * 用途：往資料庫插入初始測試資料
 * 執行：node_modules/.bin/prisma db seed
 *
 * 測試帳號：
 *   主管｜admin@xcloud.com  ／ Admin@123
 *   PM  ｜pm@xcloud.com     ／ PM@123
 *   成員｜member@xcloud.com ／ Member@123
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 開始建立測試資料（Phase 3）...\n');

  // ── 步驟 1：清空舊資料（從子表開始，避免外鍵衝突）──────────
  console.log('🗑️  清空舊資料...');
  await prisma.activityLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.taskTag.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
  console.log('   完成！\n');

  // ── 步驟 2：建立測試公司 ────────────────────────────────────
  console.log('🏢 建立測試公司...');
  const company = await prisma.company.create({
    data: {
      name: 'xCloud 科技股份有限公司',
      slug: 'xcloud',
    },
  });
  console.log(`   ${company.name}（ID: ${company.id}）\n`);

  // ── 步驟 3：建立測試使用者 ──────────────────────────────────
  console.log('👥 建立測試使用者...');

  const adminPassword  = await bcrypt.hash('Admin@123',  10);
  const pmPassword     = await bcrypt.hash('PM@123',     10);
  const memberPassword = await bcrypt.hash('Member@123', 10);

  const admin = await prisma.user.create({
    data: {
      companyId:    company.id,
      name:         '陳志明',
      email:        'admin@xcloud.com',
      passwordHash: adminPassword,
      role:         'admin',
      avatarUrl:    'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
    },
  });

  const pm = await prisma.user.create({
    data: {
      companyId:    company.id,
      name:         '林雅婷',
      email:        'pm@xcloud.com',
      passwordHash: pmPassword,
      role:         'pm',
      avatarUrl:    'https://api.dicebear.com/7.x/avataaars/svg?seed=pm',
    },
  });

  const member = await prisma.user.create({
    data: {
      companyId:    company.id,
      name:         '王小明',
      email:        'member@xcloud.com',
      passwordHash: memberPassword,
      role:         'member',
      avatarUrl:    'https://api.dicebear.com/7.x/avataaars/svg?seed=member',
    },
  });

  console.log(`   主管：${admin.name}  <${admin.email}>`);
  console.log(`   PM  ：${pm.name}  <${pm.email}>`);
  console.log(`   成員：${member.name}  <${member.email}>\n`);

  // ── 步驟 4：建立測試標籤（公司級別）────────────────────────
  console.log('🏷️  建立標籤...');
  const [tagBug, tagFrontend, tagBackend, tagUrgent, tagDesign] = await Promise.all([
    prisma.tag.create({ data: { companyId: company.id, name: 'Bug',      color: '#ef4444' } }),
    prisma.tag.create({ data: { companyId: company.id, name: '前端',     color: '#3b82f6' } }),
    prisma.tag.create({ data: { companyId: company.id, name: '後端',     color: '#8b5cf6' } }),
    prisma.tag.create({ data: { companyId: company.id, name: '緊急',     color: '#f97316' } }),
    prisma.tag.create({ data: { companyId: company.id, name: 'UI/UX設計', color: '#ec4899' } }),
  ]);
  console.log('   建立 5 個標籤（Bug、前端、後端、緊急、UI/UX設計）\n');

  // ── 步驟 5：建立測試專案 ────────────────────────────────────
  console.log('📁 建立測試專案...');

  const projectA = await prisma.project.create({
    data: {
      companyId:   company.id,
      ownerId:     pm.id,
      name:        '電商平台重構計畫',
      description: '將現有電商系統從單體架構遷移到微服務架構，提升系統穩定性和可擴展性。預計在 Q2 完成核心模組重構。',
      status:      'active',
      budget:      1500000,
      startDate:   new Date('2026-01-01'),
      endDate:     new Date('2026-06-30'),
    },
  });

  const projectB = await prisma.project.create({
    data: {
      companyId:   company.id,
      ownerId:     pm.id,
      name:        '行動應用程式 v2.0',
      description: '開發全新 iOS 和 Android 行動應用程式，新增 AI 推薦功能和社群分享功能。',
      status:      'completed',
      budget:      800000,
      startDate:   new Date('2025-09-01'),
      endDate:     new Date('2026-01-31'),
    },
  });

  console.log(`   專案 A：${projectA.name}（${projectA.status}）`);
  console.log(`   專案 B：${projectB.name}（${projectB.status}）\n`);

  // ── 步驟 6：建立里程碑 ──────────────────────────────────────
  console.log('🎯 建立里程碑...');

  const [milestoneA1, milestoneA2] = await Promise.all([
    prisma.milestone.create({
      data: {
        projectId:   projectA.id,
        name:        'Phase 1 完成 — 架構分析與設計',
        description: '完成現有系統分析、微服務拆分方案設計、API Gateway 架構確認',
        dueDate:     new Date('2026-03-31'),
        isAchieved:  true,
        achievedAt:  new Date('2026-03-28'),
        color:       'green',
      },
    }),
    prisma.milestone.create({
      data: {
        projectId:   projectA.id,
        name:        'Phase 2 完成 — 核心服務上線',
        description: '使用者服務、商品服務、訂單服務完成遷移並上線',
        dueDate:     new Date('2026-05-31'),
        isAchieved:  false,
        color:       'yellow',  // 注意：快到期了
      },
    }),
    prisma.milestone.create({
      data: {
        projectId:   projectB.id,
        name:        'App Store 上架成功',
        description: 'iOS 和 Android 版本均通過審核並成功上架',
        dueDate:     new Date('2026-01-31'),
        isAchieved:  true,
        achievedAt:  new Date('2026-01-29'),
        color:       'green',
      },
    }),
  ]);

  console.log('   專案 A：2 個里程碑（1 已達成、1 進行中）');
  console.log('   專案 B：1 個里程碑（已達成）\n');

  // ── 步驟 7：建立任務（需個別建立以取得 ID，用於建依賴關係）──
  console.log('📝 建立任務...');

  // 專案 A：5 個任務，有先後依賴關係
  const taskA1 = await prisma.task.create({
    data: {
      projectId:      projectA.id,
      createdById:    admin.id,
      assigneeId:     member.id,
      title:          '分析現有系統架構，整理技術文件',
      description:    '對現有的單體架構進行全面分析，找出效能瓶頸和架構問題，輸出技術分析報告。',
      status:         'done',
      priority:       'high',
      estimatedHours: 16,
      actualHours:    18.5,   // Phase 3 新欄位：實際花費比預估多
      dueDate:        new Date('2026-02-15'),
      startedAt:      new Date('2026-02-01'),
      completedAt:    new Date('2026-02-14'),
      position:       1,
    },
  });

  const taskA2 = await prisma.task.create({
    data: {
      projectId:      projectA.id,
      createdById:    pm.id,
      assigneeId:     member.id,
      title:          '設計微服務拆分方案',
      description:    '根據業務邊界設計服務拆分策略，定義各服務的介面和通訊方式。',
      status:         'in_progress',
      priority:       'urgent',
      estimatedHours: 24,
      dueDate:        new Date('2026-03-20'),
      startedAt:      new Date('2026-02-20'),
      position:       1,
    },
  });

  const taskA3 = await prisma.task.create({
    data: {
      projectId:      projectA.id,
      createdById:    pm.id,
      assigneeId:     pm.id,
      title:          '建立 API Gateway 基礎架構',
      description:    '使用 Kong 或 AWS API Gateway 建立統一的 API 入口，實作認證、限流、監控功能。',
      status:         'review',
      priority:       'high',
      estimatedHours: 20,
      dueDate:        new Date('2026-03-31'),
      position:       1,
    },
  });

  const taskA4 = await prisma.task.create({
    data: {
      projectId:      projectA.id,
      createdById:    pm.id,
      assigneeId:     member.id,
      title:          '遷移使用者服務到獨立微服務',
      description:    '將使用者認證、授權、個人資料等功能拆分為獨立服務，確保資料一致性。',
      status:         'todo',
      priority:       'medium',
      estimatedHours: 40,
      dueDate:        new Date('2026-04-30'),
      position:       1,
    },
  });

  const taskA5 = await prisma.task.create({
    data: {
      projectId:      projectA.id,
      createdById:    admin.id,
      assigneeId:     member.id,
      title:          '撰寫系統整合測試',
      description:    '針對各微服務間的介面撰寫整合測試，確保服務間通訊正確，覆蓋率達 80% 以上。',
      status:         'todo',
      priority:       'medium',
      estimatedHours: 16,
      dueDate:        new Date('2026-05-31'),
      position:       2,
    },
  });

  // 專案 B：5 個任務（全部完成）
  const taskB1 = await prisma.task.create({
    data: {
      projectId: projectB.id, createdById: pm.id, assigneeId: member.id,
      title: '設計 App UI/UX 原型', status: 'done', priority: 'high',
      estimatedHours: 32, actualHours: 30, dueDate: new Date('2025-10-15'),
      startedAt: new Date('2025-09-10'), completedAt: new Date('2025-10-12'), position: 1,
    },
  });

  const taskB2 = await prisma.task.create({
    data: {
      projectId: projectB.id, createdById: pm.id, assigneeId: member.id,
      title: '開發 iOS 版本', status: 'done', priority: 'high',
      estimatedHours: 80, actualHours: 85, dueDate: new Date('2025-11-30'),
      startedAt: new Date('2025-10-15'), completedAt: new Date('2025-11-28'), position: 1,
    },
  });

  const taskB3 = await prisma.task.create({
    data: {
      projectId: projectB.id, createdById: pm.id, assigneeId: member.id,
      title: '開發 Android 版本', status: 'done', priority: 'high',
      estimatedHours: 80, actualHours: 82, dueDate: new Date('2025-11-30'),
      startedAt: new Date('2025-10-15'), completedAt: new Date('2025-11-29'), position: 2,
    },
  });

  const taskB4 = await prisma.task.create({
    data: {
      projectId: projectB.id, createdById: admin.id, assigneeId: pm.id,
      title: '整合 AI 推薦引擎', status: 'done', priority: 'medium',
      estimatedHours: 24, actualHours: 28, dueDate: new Date('2025-12-31'),
      startedAt: new Date('2025-12-01'), completedAt: new Date('2025-12-28'), position: 1,
    },
  });

  const taskB5 = await prisma.task.create({
    data: {
      projectId: projectB.id, createdById: admin.id, assigneeId: pm.id,
      title: '上架 App Store 與 Google Play', status: 'done', priority: 'urgent',
      estimatedHours: 8, actualHours: 6, dueDate: new Date('2026-01-31'),
      startedAt: new Date('2026-01-20'), completedAt: new Date('2026-01-29'), position: 1,
    },
  });

  console.log('   專案 A：5 個任務');
  console.log('   專案 B：5 個任務（全部完成）\n');

  // ── 步驟 8：建立任務依賴關係 ─────────────────────────────────
  console.log('🔗 建立任務依賴關係...');

  // 專案 A 的依賴鏈：
  //   A1（分析）→ A2（設計）→ A3（Gateway）→ A4（遷移）→ A5（測試）
  //   意思是：A2 依賴 A1 完成後才能開始（finish_to_start）
  await prisma.taskDependency.createMany({
    data: [
      // A2 必須等 A1 完成後才能開始
      { taskId: taskA2.id, dependsOnTaskId: taskA1.id, dependencyType: 'finish_to_start' },
      // A3 必須等 A2 完成後才能開始
      { taskId: taskA3.id, dependsOnTaskId: taskA2.id, dependencyType: 'finish_to_start' },
      // A4 必須等 A2 完成後才能開始（與 A3 平行，都依賴 A2）
      { taskId: taskA4.id, dependsOnTaskId: taskA2.id, dependencyType: 'finish_to_start' },
      // A5 必須等 A4 完成後才能開始
      { taskId: taskA5.id, dependsOnTaskId: taskA4.id, dependencyType: 'finish_to_start' },
    ],
  });

  // 專案 B 的依賴鏈：
  //   B1（設計）→ B2（iOS）→ B4（AI）→ B5（上架）
  //             ↘ B3（Android）↗
  await prisma.taskDependency.createMany({
    data: [
      { taskId: taskB2.id, dependsOnTaskId: taskB1.id, dependencyType: 'finish_to_start' },
      { taskId: taskB3.id, dependsOnTaskId: taskB1.id, dependencyType: 'finish_to_start' },
      { taskId: taskB4.id, dependsOnTaskId: taskB2.id, dependencyType: 'finish_to_start' },
      { taskId: taskB4.id, dependsOnTaskId: taskB3.id, dependencyType: 'finish_to_start' },
      { taskId: taskB5.id, dependsOnTaskId: taskB4.id, dependencyType: 'finish_to_start' },
    ],
  });

  console.log('   專案 A：4 條依賴（線性鏈結）');
  console.log('   專案 B：5 條依賴（菱形結構，需等兩個前置任務）\n');

  // ── 步驟 9：建立工時記錄 ─────────────────────────────────────
  console.log('⏱️  建立工時記錄...');

  await prisma.timeEntry.createMany({
    data: [
      // A1 任務的工時記錄（已完成）
      {
        taskId:          taskA1.id,
        userId:          member.id,
        startedAt:       new Date('2026-02-01 09:00:00'),
        endedAt:         new Date('2026-02-01 17:00:00'),
        durationMinutes: 480,   // 8 小時
        description:     '第一天：閱讀現有架構文件，繪製系統架構圖',
        date:            new Date('2026-02-01'),
      },
      {
        taskId:          taskA1.id,
        userId:          member.id,
        startedAt:       new Date('2026-02-02 09:00:00'),
        endedAt:         new Date('2026-02-02 16:00:00'),
        durationMinutes: 420,   // 7 小時
        description:     '第二天：效能測試和瓶頸分析',
        date:            new Date('2026-02-02'),
      },
      // A2 任務的工時記錄（進行中）
      {
        taskId:          taskA2.id,
        userId:          member.id,
        startedAt:       new Date('2026-02-20 09:00:00'),
        endedAt:         new Date('2026-02-20 18:00:00'),
        durationMinutes: 540,   // 9 小時
        description:     '設計微服務邊界，參考 DDD 領域驅動設計原則',
        date:            new Date('2026-02-20'),
      },
      // A2 目前正在計時的記錄（ended_at 為 NULL = 計時進行中）
      {
        taskId:    taskA2.id,
        userId:    member.id,
        startedAt: new Date('2026-03-08 09:00:00'),
        endedAt:   null,     // NULL = 計時進行中！
        description: '撰寫 API 契約文件',
        date:      new Date('2026-03-08'),
      },
    ],
  });

  console.log('   建立 4 筆工時記錄（1 筆計時進行中）\n');

  // ── 步驟 10：建立評論（含回覆與 @提及）───────────────────────
  console.log('💬 建立評論...');

  // 頂層評論
  const comment1 = await prisma.comment.create({
    data: {
      taskId:   taskA2.id,
      userId:   pm.id,
      content:  `@王小明 這個任務的優先級非常高，請本週五前完成微服務邊界設計。
需要參考 Netflix 的微服務架構模式，特別是 Circuit Breaker 和 Service Mesh 的部分。`,
      mentions: [member.id],  // @王小明
    },
  });

  // 回覆評論（parent_id = comment1.id）
  await prisma.comment.create({
    data: {
      taskId:   taskA2.id,
      userId:   member.id,
      parentId: comment1.id,   // 回覆 comment1
      content:  `@林雅婷 收到，我已經開始參考 Netflix OSS 的文件了。
初步想法是把以下幾塊先拆出來：
1. User Service（用戶認證）
2. Product Service（商品管理）
3. Order Service（訂單處理）

預計明天可以出初稿，請 Review。`,
      mentions: [pm.id],   // @林雅婷
    },
  });

  // 另一個頂層評論（管理員也說了話）
  await prisma.comment.create({
    data: {
      taskId:   taskA2.id,
      userId:   admin.id,
      content:  `@林雅婷 @王小明 提醒大家，這個拆分方案需要在下週的架構評審會議上報告，請確保文件完整。`,
      mentions: [pm.id, member.id],  // @兩個人
    },
  });

  console.log('   建立 3 則評論（含 1 則回覆、多個 @提及）\n');

  // ── 步驟 11：建立任務標籤 ───────────────────────────────────
  console.log('🏷️  建立任務標籤關聯...');

  await prisma.taskTag.createMany({
    data: [
      // A2 任務：後端 + 緊急
      { taskId: taskA2.id, tagId: tagBackend.id },
      { taskId: taskA2.id, tagId: tagUrgent.id  },
      // A3 任務：後端
      { taskId: taskA3.id, tagId: tagBackend.id  },
      // B1 任務：UI/UX設計
      { taskId: taskB1.id, tagId: tagDesign.id   },
      // B2 任務：前端
      { taskId: taskB2.id, tagId: tagFrontend.id },
      // B3 任務：前端
      { taskId: taskB3.id, tagId: tagFrontend.id },
    ],
  });

  console.log('   建立 6 個任務-標籤關聯\n');

  // ── 步驟 12：建立通知 ───────────────────────────────────────
  console.log('🔔 建立通知...');

  await prisma.notification.createMany({
    data: [
      // 成員被分配任務 → 通知成員
      {
        recipientId:  member.id,
        type:         'task_assigned',
        title:        '你被分派了新任務',
        message:      '林雅婷 將「設計微服務拆分方案」分派給你',
        isRead:       false,
        resourceType: 'task',
        resourceId:   taskA2.id,
      },
      // 被 @提及 → 通知成員（來自評論 1）
      {
        recipientId:  member.id,
        type:         'mentioned',
        title:        '有人在評論中提到你',
        message:      '林雅婷 在「設計微服務拆分方案」中提到你：「這個任務的優先級非常高...」',
        isRead:       false,
        resourceType: 'task',
        resourceId:   taskA2.id,
      },
      // PM 被 @提及 → 通知 PM（來自評論 2）
      {
        recipientId:  pm.id,
        type:         'mentioned',
        title:        '有人在評論中提到你',
        message:      '王小明 回覆了「設計微服務拆分方案」的評論',
        isRead:       true,
        readAt:       new Date('2026-03-07 10:30:00'),
        resourceType: 'task',
        resourceId:   taskA2.id,
      },
      // 里程碑達成通知
      {
        recipientId:  pm.id,
        type:         'milestone_achieved',
        title:        '🎉 里程碑達成！',
        message:      '「Phase 1 完成 — 架構分析與設計」已成功達成',
        isRead:       true,
        readAt:       new Date('2026-03-29 09:00:00'),
        resourceType: 'project',
        resourceId:   projectA.id,
      },
      // 截止日期即將到來
      {
        recipientId:  member.id,
        type:         'deadline_approaching',
        title:        '任務截止日期即將到來',
        message:      '「設計微服務拆分方案」將於 3 天後截止（2026-03-20）',
        isRead:       false,
        resourceType: 'task',
        resourceId:   taskA2.id,
      },
    ],
  });

  console.log('   建立 5 則通知（2 已讀、3 未讀）\n');

  // ── 步驟 13：建立活動日誌 ───────────────────────────────────
  console.log('📋 建立活動日誌...');

  await prisma.activityLog.createMany({
    data: [
      // A1 任務：狀態從 in_progress → done
      {
        taskId:   taskA1.id,
        userId:   member.id,
        action:   'status_changed',
        oldValue: { status: 'in_progress' },
        newValue: { status: 'done' },
      },
      // A2 任務：優先級被調升
      {
        taskId:   taskA2.id,
        userId:   pm.id,
        action:   'priority_changed',
        oldValue: { priority: 'high' },
        newValue: { priority: 'urgent' },
      },
      // A2 任務：被分派給王小明
      {
        taskId:   taskA2.id,
        userId:   pm.id,
        action:   'assignee_changed',
        oldValue: { assigneeId: null, assigneeName: null },
        newValue: { assigneeId: member.id, assigneeName: '王小明' },
      },
      // A2 任務：估計工時被修改
      {
        taskId:   taskA2.id,
        userId:   pm.id,
        action:   'field_updated',
        oldValue: { estimatedHours: 16, field: 'estimatedHours' },
        newValue: { estimatedHours: 24, field: 'estimatedHours' },
      },
    ],
  });

  console.log('   建立 4 筆活動日誌\n');

  // ── 最終摘要 ────────────────────────────────────────────────
  const counts = await Promise.all([
    prisma.company.count(),
    prisma.user.count(),
    prisma.project.count(),
    prisma.task.count(),
    prisma.milestone.count(),
    prisma.taskDependency.count(),
    prisma.timeEntry.count(),
    prisma.comment.count(),
    prisma.tag.count(),
    prisma.notification.count(),
    prisma.activityLog.count(),
  ]);

  const [companies, users, projects, tasks, milestones, deps, timeEntries, comments, tags, notifications, logs] = counts;

  console.log('✅ 測試資料建立完成！');
  console.log('═══════════════════════════════════════');
  console.log(`  公司         ：${companies} 間`);
  console.log(`  使用者       ：${users} 人`);
  console.log(`  專案         ：${projects} 個`);
  console.log(`  任務         ：${tasks} 個`);
  console.log(`  里程碑       ：${milestones} 個`);
  console.log(`  任務依賴     ：${deps} 條`);
  console.log(`  工時記錄     ：${timeEntries} 筆`);
  console.log(`  評論         ：${comments} 則`);
  console.log(`  標籤         ：${tags} 個`);
  console.log(`  通知         ：${notifications} 則`);
  console.log(`  活動日誌     ：${logs} 筆`);
  console.log('═══════════════════════════════════════');
  console.log('\n📋 測試帳號：');
  console.log('  主管｜admin@xcloud.com  ／ Admin@123');
  console.log('  PM  ｜pm@xcloud.com     ／ PM@123');
  console.log('  成員｜member@xcloud.com ／ Member@123');
}

main()
  .catch((e) => {
    console.error('❌ 建立測試資料失敗：', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
