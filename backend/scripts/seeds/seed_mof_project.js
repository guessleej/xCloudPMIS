/**
 * 財政部地端AI專案規劃 — 資料庫種子腳本
 * 建立 18 位成員 + 專案 + 任務 + 里程碑
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const COMPANY_ID = parseInt(process.env.SEED_COMPANY_ID) || 1;

async function main() {
  console.log('🌱 開始建立財政部地端AI專案資料...');

  // ── 1. 建立 18 位成員（跳過已存在的） ──────────────────
  const members = [
    { name: '李偉業', email: 'admin@example.com',        role: 'admin',  seed: 'admin'    }, // 已存在
    { name: '林雅婷', email: 'linyating@example.com',   role: 'pm',     seed: 'linyating' },
    { name: '張志明', email: 'zhangzhiming@example.com', role: 'member', seed: 'zhang'    },
    { name: '陳美華', email: 'chenmeihua@example.com',   role: 'member', seed: 'chen1'    },
    { name: '林志遠', email: 'linzhiyuan@example.com',   role: 'member', seed: 'lin2'     },
    { name: '王建國', email: 'wangjianguo@example.com',  role: 'member', seed: 'wang2'    },
    { name: '劉家豪', email: 'liujiahao@example.com',    role: 'member', seed: 'liu'      },
    { name: '黃佳欣', email: 'huangjiaxin@example.com',  role: 'member', seed: 'huang'    },
    { name: '吳雅婷', email: 'wuyating@example.com',     role: 'member', seed: 'wu'       },
    { name: '蔡承翰', email: 'caichenghan@example.com',  role: 'member', seed: 'cai'      },
    { name: '許志豪', email: 'xuzhihao@example.com',     role: 'member', seed: 'xu'       },
    { name: '鄭雅文', email: 'zhengyawen@example.com',   role: 'member', seed: 'zheng'    },
    { name: '郭建宏', email: 'guojianhong@example.com',  role: 'member', seed: 'guo'      },
    { name: '林淑芬', email: 'linshufeng@example.com',   role: 'member', seed: 'lin3'     },
    { name: '賴志明', email: 'laizhiming@example.com',   role: 'member', seed: 'lai'      },
    { name: '洪雅萍', email: 'hongyaping@example.com',   role: 'member', seed: 'hong'     },
    { name: '曾建志', email: 'zengjjanzhi@example.com',  role: 'member', seed: 'zeng'     },
    { name: '謝佳穎', email: 'xiejiaying@example.com',   role: 'member', seed: 'xie'      },
    { name: '莊志豪', email: 'zhuangzhihao@example.com', role: 'member', seed: 'zhuang'  },
  ];

  const userMap = {};
  for (const m of members) {
    const existing = await prisma.user.findUnique({ where: { email: m.email } });
    if (existing) {
      userMap[m.name] = existing.id;
      console.log(`  ✓ 已存在：${m.name} (id=${existing.id})`);
    } else {
      const u = await prisma.user.create({
        data: {
          companyId: COMPANY_ID,
          name:      m.name,
          email:     m.email,
          role:      m.role,
          isActive:  true,
          avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.seed}`,
        },
      });
      userMap[m.name] = u.id;
      console.log(`  + 建立：${m.name} (id=${u.id})`);
    }
  }

  // ── 2. 建立財政部地端AI專案 ───────────────────────────
  const pmId  = userMap['林雅婷'] || userMap['李偉業'];
  const pm2Id = userMap['李偉業'];

  let project = await prisma.project.findFirst({
    where: { companyId: COMPANY_ID, name: '財政部地端AI推論平台建置' },
  });
  if (!project) {
    project = await prisma.project.create({
      data: {
        companyId:   COMPANY_ID,
        name:        '財政部地端AI推論平台建置',
        description: '建置財政部內部封閉網路（Air-Gapped）環境之生成式 AI 推論平台，整合資料治理、零信任資安架構與業務自動化工作流。預計 2026 年 12 月完成驗收。',
        status:      'active',
        budget:      18000000,
        startDate:   new Date('2026-03-15'),
        endDate:     new Date('2026-12-31'),
        ownerId:     pm2Id,
        createdById: pm2Id,
      },
    });
    console.log(`\n✅ 建立專案：${project.name} (id=${project.id})`);
  } else {
    console.log(`\n✓ 已存在專案：${project.name} (id=${project.id})`);
  }

  const pid = project.id;

  // ── 3. 建立里程碑 ────────────────────────────────────
  const milestones = [
    { name: 'Phase 1 完成 — 基礎架構驗收',     dueDate: '2026-05-31', isAchieved: false },
    { name: 'Phase 2 完成 — AI 推論引擎上線',   dueDate: '2026-08-31', isAchieved: false },
    { name: 'Phase 3 完成 — 業務整合測試',       dueDate: '2026-10-31', isAchieved: false },
    { name: 'Phase 4 完成 — 正式上線驗收',       dueDate: '2026-12-31', isAchieved: false },
  ];
  for (const ms of milestones) {
    const exists = await prisma.milestone.findFirst({ where: { projectId: pid, name: ms.name } });
    if (!exists) {
      await prisma.milestone.create({
        data: { projectId: pid, name: ms.name, dueDate: new Date(ms.dueDate), isAchieved: ms.isAchieved },
      });
      console.log(`  🎯 里程碑：${ms.name}`);
    }
  }

  // ── 4. 建立專案任務 ──────────────────────────────────
  const tasks = [
    // Phase 1 — 基礎架構
    { title: '地端伺服器硬體採購規格書撰寫',       assignee: '洪雅萍', priority: 'urgent', status: 'done',        dueDate: '2026-03-22', estimatedHours: 16 },
    { title: '零信任網路架構設計',                 assignee: '郭建宏', priority: 'urgent', status: 'in_progress', dueDate: '2026-04-15', estimatedHours: 40 },
    { title: 'Kubernetes 叢集部署與驗證',           assignee: '許志豪', priority: 'high',   status: 'in_progress', dueDate: '2026-04-30', estimatedHours: 60 },
    { title: '資料分類與標記政策制定',             assignee: '林淑芬', priority: 'high',   status: 'todo',        dueDate: '2026-04-20', estimatedHours: 24 },
    { title: 'PostgreSQL + pgvector 向量資料庫建置',assignee: '賴志明', priority: 'high',   status: 'todo',        dueDate: '2026-05-10', estimatedHours: 32 },
    { title: '現有系統整合需求訪談（15個業務單位）', assignee: '曾建志', priority: 'medium', status: 'in_progress', dueDate: '2026-04-10', estimatedHours: 48 },
    // Phase 2 — AI 推論引擎
    { title: 'LLM 模型評估與選型報告',             assignee: '張志明', priority: 'urgent', status: 'todo',        dueDate: '2026-05-15', estimatedHours: 40 },
    { title: 'RAG 系統架構設計與 PoC',             assignee: '林志遠', priority: 'high',   status: 'todo',        dueDate: '2026-06-01', estimatedHours: 80 },
    { title: '業務資料前處理 Pipeline 開發',        assignee: '陳美華', priority: 'high',   status: 'todo',        dueDate: '2026-06-30', estimatedHours: 64 },
    { title: 'API Gateway 安全閘道開發',            assignee: '王建國', priority: 'high',   status: 'todo',        dueDate: '2026-06-15', estimatedHours: 48 },
    { title: '推論服務 REST API 開發',              assignee: '劉家豪', priority: 'high',   status: 'todo',        dueDate: '2026-07-15', estimatedHours: 56 },
    { title: '模型微調（LoRA）— 財政法規領域',      assignee: '陳美華', priority: 'medium', status: 'todo',        dueDate: '2026-07-31', estimatedHours: 96 },
    // Phase 3 — 業務整合
    { title: '管理後台介面開發',                   assignee: '吳雅婷', priority: 'medium', status: 'todo',        dueDate: '2026-08-15', estimatedHours: 80 },
    { title: '使用者查詢介面開發',                 assignee: '蔡承翰', priority: 'medium', status: 'todo',        dueDate: '2026-08-31', estimatedHours: 64 },
    { title: 'CI/CD Pipeline 建立',                assignee: '鄭雅文', priority: 'medium', status: 'todo',        dueDate: '2026-09-15', estimatedHours: 40 },
    { title: '資料加密與稽核日誌系統',             assignee: '林淑芬', priority: 'high',   status: 'todo',        dueDate: '2026-09-30', estimatedHours: 48 },
    { title: '整合測試計畫撰寫與執行',             assignee: '謝佳穎', priority: 'high',   status: 'todo',        dueDate: '2026-10-15', estimatedHours: 64 },
    { title: '壓力測試與資安滲透測試',             assignee: '莊志豪', priority: 'high',   status: 'todo',        dueDate: '2026-10-31', estimatedHours: 80 },
    // Phase 4 — 驗收
    { title: '系統操作手冊撰寫',                   assignee: '曾建志', priority: 'medium', status: 'todo',        dueDate: '2026-11-15', estimatedHours: 32 },
    { title: '教育訓練課程設計與執行',             assignee: '洪雅萍', priority: 'medium', status: 'todo',        dueDate: '2026-11-30', estimatedHours: 48 },
    { title: '正式環境部署與切換',                 assignee: '許志豪', priority: 'urgent', status: 'todo',        dueDate: '2026-12-15', estimatedHours: 24 },
    { title: '專案結案報告',                        assignee: '林雅婷', priority: 'medium', status: 'todo',        dueDate: '2026-12-31', estimatedHours: 16 },
  ];

  let created = 0;
  for (const t of tasks) {
    const assigneeId = userMap[t.assignee];
    if (!assigneeId) { console.warn(`  ⚠️ 找不到成員：${t.assignee}`); continue; }
    const exists = await prisma.task.findFirst({ where: { projectId: pid, title: t.title } });
    if (!exists) {
      await prisma.task.create({
        data: {
          projectId:      pid,
          assigneeId,
          createdById:    pm2Id,
          title:          t.title,
          status:         t.status,
          priority:       t.priority,
          estimatedHours: t.estimatedHours,
          dueDate:        new Date(t.dueDate),
          startedAt:      t.status !== 'todo' ? new Date('2026-03-15') : null,
          completedAt:    t.status === 'done'  ? new Date('2026-03-20') : null,
        },
      });
      created++;
    }
  }
  console.log(`\n✅ 建立 ${created} 個任務`);
  console.log('\n🎉 財政部地端AI專案資料建立完成！');

  const stats = await prisma.user.count({ where: { companyId: COMPANY_ID } });
  const projCount = await prisma.project.count({ where: { companyId: COMPANY_ID } });
  const taskCount = await prisma.task.count({ where: { project: { companyId: COMPANY_ID } } });
  console.log(`\n📊 目前資料庫：${stats} 位使用者 | ${projCount} 個專案 | ${taskCount} 個任務`);
}

main()
  .catch(e => { console.error('❌ 錯誤:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
