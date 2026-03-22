const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const CID = 2;
const DEFAULT_PW = '$2b$10$placeholder.hash.for.dev.use.only.xxxxxxxxxxx';

async function run() {
  console.log('建立財政部地端AI專案資料...');

  // 已建立的成員
  const users = await p.user.findMany({ where: { companyId: CID }, select: { id: true, name: true } });
  console.log('現有成員:', users.map(u => u.name).join(', '));

  const umap = Object.fromEntries(users.map(u => [u.name, u.id]));
  const adminId = umap['李偉業'];

  // 建立專案
  let proj = await p.project.findFirst({ where: { companyId: CID, name: '財政部地端AI推論平台建置' } });
  if (!proj) {
    proj = await p.project.create({
      data: {
        companyId: CID,
        name: '財政部地端AI推論平台建置',
        description: '財政部內部封閉網路AI推論平台，整合零信任資安架構與業務自動化。',
        status: 'active',
        budget: 18000000,
        startDate: new Date('2026-03-15'),
        endDate: new Date('2026-12-31'),
        ownerId: adminId,
      },
    });
    console.log('建立專案 id=' + proj.id);
  } else {
    console.log('已存在專案 id=' + proj.id);
  }

  // 里程碑
  const msData = [
    ['Phase 1 基礎架構驗收', '2026-05-31'],
    ['Phase 2 AI推論引擎上線', '2026-08-31'],
    ['Phase 3 業務整合測試', '2026-10-31'],
    ['Phase 4 正式驗收上線', '2026-12-31'],
  ];
  for (const ms of msData) {
    const ex = await p.milestone.findFirst({ where: { projectId: proj.id, name: ms[0] } });
    if (!ex) {
      await p.milestone.create({ data: { projectId: proj.id, name: ms[0], dueDate: new Date(ms[1]), isAchieved: false } });
      console.log('里程碑: ' + ms[0]);
    }
  }

  // 任務
  const tasks = [
    ['地端伺服器採購規格書', '洪雅萍', 'urgent', 'done', '2026-03-22', 16],
    ['零信任網路架構設計', '郭建宏', 'urgent', 'in_progress', '2026-04-15', 40],
    ['Kubernetes叢集部署', '許志豪', 'high', 'in_progress', '2026-04-30', 60],
    ['資料分類與標記政策', '林淑芬', 'high', 'todo', '2026-04-20', 24],
    ['pgvector向量資料庫建置', '賴志明', 'high', 'todo', '2026-05-10', 32],
    ['業務需求訪談15單位', '曾建志', 'medium', 'in_progress', '2026-04-10', 48],
    ['LLM模型評估選型報告', '張志明', 'urgent', 'todo', '2026-05-15', 40],
    ['RAG系統架構設計PoC', '林志遠', 'high', 'todo', '2026-06-01', 80],
    ['資料前處理Pipeline', '陳美華', 'high', 'todo', '2026-06-30', 64],
    ['API Gateway安全閘道', '王建國', 'high', 'todo', '2026-06-15', 48],
    ['推論服務REST API', '劉家豪', 'high', 'todo', '2026-07-15', 56],
    ['模型微調LoRA財政法規', '陳美華', 'medium', 'todo', '2026-07-31', 96],
    ['管理後台介面開發', '吳雅婷', 'medium', 'todo', '2026-08-15', 80],
    ['使用者查詢介面開發', '蔡承翰', 'medium', 'todo', '2026-08-31', 64],
    ['CICD Pipeline建立', '鄭雅文', 'medium', 'todo', '2026-09-15', 40],
    ['加密與稽核日誌系統', '林淑芬', 'high', 'todo', '2026-09-30', 48],
    ['整合測試計畫執行', '謝佳穎', 'high', 'todo', '2026-10-15', 64],
    ['壓力測試滲透測試', '莊志豪', 'high', 'todo', '2026-10-31', 80],
    ['系統操作手冊撰寫', '曾建志', 'medium', 'todo', '2026-11-15', 32],
    ['教育訓練課程執行', '洪雅萍', 'medium', 'todo', '2026-11-30', 48],
    ['正式環境部署切換', '許志豪', 'urgent', 'todo', '2026-12-15', 24],
    ['專案結案報告', '林雅婷', 'medium', 'todo', '2026-12-31', 16],
  ];
  let cnt = 0;
  for (const t of tasks) {
    const aid = umap[t[1]];
    if (!aid) { console.warn('找不到成員: ' + t[1]); continue; }
    const ex = await p.task.findFirst({ where: { projectId: proj.id, title: t[0] } });
    if (!ex) {
      await p.task.create({
        data: {
          projectId: proj.id,
          assigneeId: aid,
          title: t[0],
          priority: t[2],
          status: t[3],
          dueDate: new Date(t[4]),
          estimatedHours: t[5],
          startedAt: t[3] !== 'todo' ? new Date('2026-03-15') : null,
          completedAt: t[3] === 'done' ? new Date('2026-03-22') : null,
        },
      });
      cnt++;
    }
  }
  console.log('建立 ' + cnt + ' 個任務');

  const uc = await p.user.count({ where: { companyId: CID } });
  const pc = await p.project.count({ where: { companyId: CID } });
  const tc = await p.task.count({ where: { project: { companyId: CID } } });
  console.log('最終統計：' + uc + ' 位成員 | ' + pc + ' 個專案 | ' + tc + ' 個任務');
}

run()
  .catch(e => { console.error('錯誤: ' + e.message); process.exit(1); })
  .finally(() => p.$disconnect());
