const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const CID = 2;
const DEFAULT_PW = '$2b$10$placeholder.hash.for.dev.use.only.xxxxxxxxxxx';

async function main() {
  console.log('建立財政部地端AI專案資料...');
  const members = [
    { name:'林雅婷',  email:'linyating@mof.gov.tw',   role:'pm',     seed:'linyating'},
    { name:'張志明',  email:'zhangzhiming@mof.gov.tw', role:'member', seed:'zhang'},
    { name:'陳美華',  email:'chenmeihua@mof.gov.tw',   role:'member', seed:'chen1'},
    { name:'林志遠',  email:'linzhiyuan@mof.gov.tw',   role:'member', seed:'lin2'},
    { name:'王建國',  email:'wangjianguo@mof.gov.tw',  role:'member', seed:'wang2'},
    { name:'劉家豪',  email:'liujiahao@mof.gov.tw',    role:'member', seed:'liu'},
    { name:'黃佳欣',  email:'huangjiaxin@mof.gov.tw',  role:'member', seed:'huang'},
    { name:'吳雅婷',  email:'wuyating@mof.gov.tw',     role:'member', seed:'wu'},
    { name:'蔡承翰',  email:'caichenghan@mof.gov.tw',  role:'member', seed:'cai'},
    { name:'許志豪',  email:'xuzhihao@mof.gov.tw',     role:'member', seed:'xu'},
    { name:'鄭雅文',  email:'zhengyawen@mof.gov.tw',   role:'member', seed:'zheng'},
    { name:'郭建宏',  email:'guojianhong@mof.gov.tw',  role:'member', seed:'guo'},
    { name:'林淑芬',  email:'linshufeng@mof.gov.tw',   role:'member', seed:'lin3'},
    { name:'賴志明',  email:'laizhiming@mof.gov.tw',   role:'member', seed:'lai'},
    { name:'洪雅萍',  email:'hongyaping@mof.gov.tw',   role:'member', seed:'hong'},
    { name:'曾建志',  email:'zengjjanzhi@mof.gov.tw',  role:'member', seed:'zeng'},
    { name:'謝佳穎',  email:'xiejiaying@mof.gov.tw',   role:'member', seed:'xie'},
    { name:'莊志豪',  email:'zhuangzhihao@mof.gov.tw', role:'member', seed:'zhuang'},
  ];
  const userMap = {};
  const admin = await prisma.user.findUnique({where:{email:'admin@xcloud.com'}});
  userMap['李偉業'] = admin.id;
  for(const m of members){
    const ex = await prisma.user.findUnique({where:{email:m.email}});
    if(ex){ userMap[m.name]=ex.id; console.log('  已存在:'+m.name); continue; }
    const u = await prisma.user.create({data:{
      companyId:CID, name:m.name, email:m.email, passwordHash:DEFAULT_PW,
      role:m.role, isActive:true,
      avatarUrl:`https://api.dicebear.com/7.x/avataaars/svg?seed=${m.seed}`,
    }});
    userMap[m.name]=u.id;
    console.log('  +建立:'+m.name+'(id='+u.id+')');
  }
  // 建立專案
  let proj = await prisma.project.findFirst({where:{companyId:CID,name:'財政部地端AI推論平台建置'}});
  if(!proj){
    proj = await prisma.project.create({data:{
      companyId:CID, name:'財政部地端AI推論平台建置',
      description:'財政部內部封閉網路AI推論平台，整合零信任資安架構與業務自動化。',
      status:'active', budget:18000000,
      startDate:new Date('2026-03-15'), endDate:new Date('2026-12-31'),
      ownerId:admin.id, createdById:admin.id,
    }});
    console.log('建立專案 id='+proj.id);
  }
  // 里程碑
  for(const ms of [
    ['Phase 1 — 基礎架構驗收','2026-05-31'],
    ['Phase 2 — AI推論引擎上線','2026-08-31'],
    ['Phase 3 — 業務整合測試','2026-10-31'],
    ['Phase 4 — 正式驗收上線','2026-12-31'],
  ]){
    const ex = await prisma.milestone.findFirst({where:{projectId:proj.id,name:ms[0]}});
    if(!ex) await prisma.milestone.create({data:{projectId:proj.id,name:ms[0],dueDate:new Date(ms[1]),isAchieved:false}});
  }
  // 任務
  const taskDefs = [
    ['地端伺服器採購規格書','洪雅萍','urgent','done',       '2026-03-22',16],
    ['零信任網路架構設計',   '郭建宏','urgent','in_progress','2026-04-15',40],
    ['Kubernetes叢集部署',  '許志豪','high',  'in_progress','2026-04-30',60],
    ['資料分類與標記政策',   '林淑芬','high',  'todo',       '2026-04-20',24],
    ['pgvector向量資料庫建置','賴志明','high', 'todo',       '2026-05-10',32],
    ['業務需求訪談（15單位）','曾建志','medium','in_progress','2026-04-10',48],
    ['LLM模型評估選型報告',  '張志明','urgent','todo',       '2026-05-15',40],
    ['RAG系統架構設計PoC',   '林志遠','high',  'todo',       '2026-06-01',80],
    ['資料前處理Pipeline',   '陳美華','high',  'todo',       '2026-06-30',64],
    ['API Gateway安全閘道',  '王建國','high',  'todo',       '2026-06-15',48],
    ['推論服務REST API開發',  '劉家豪','high',  'todo',       '2026-07-15',56],
    ['模型微調(LoRA)財政法規','陳美華','medium','todo',       '2026-07-31',96],
    ['管理後台介面開發',      '吳雅婷','medium','todo',       '2026-08-15',80],
    ['使用者查詢介面開發',    '蔡承翰','medium','todo',       '2026-08-31',64],
    ['CI/CD Pipeline建立',   '鄭雅文','medium','todo',       '2026-09-15',40],
    ['加密與稽核日誌系統',    '林淑芬','high',  'todo',       '2026-09-30',48],
    ['整合測試計畫執行',      '謝佳穎','high',  'todo',       '2026-10-15',64],
    ['壓力測試滲透測試',      '莊志豪','high',  'todo',       '2026-10-31',80],
    ['系統操作手冊撰寫',      '曾建志','medium','todo',       '2026-11-15',32],
    ['教育訓練課程執行',      '洪雅萍','medium','todo',       '2026-11-30',48],
    ['正式環境部署切換',      '許志豪','urgent','todo',       '2026-12-15',24],
    ['專案結案報告',          '林雅婷','medium','todo',       '2026-12-31',16],
  ];
  let cnt=0;
  for(const t of taskDefs){
    const aid = userMap[t[1]];
    if(!aid){console.warn('找不到:'+t[1]);continue;}
    const ex = await prisma.task.findFirst({where:{projectId:proj.id,title:t[0]}});
    if(!ex){
      await prisma.task.create({data:{
        projectId:proj.id, assigneeId:aid, createdById:admin.id,
        title:t[0], priority:t[2], status:t[3],
        dueDate:new Date(t[4]), estimatedHours:t[5],
        startedAt:t[3]!=='todo'?new Date('2026-03-15'):null,
        completedAt:t[3]==='done'?new Date('2026-03-22'):null,
      }});
      cnt++;
    }
  }
  console.log('建立 '+cnt+' 個任務');
  const uc = await prisma.user.count({where:{companyId:CID}});
  const pc = await prisma.project.count({where:{companyId:CID}});
  const tc = await prisma.task.count({where:{project:{companyId:CID}}});
  console.log('最終統計：'+uc+' 位成員 | '+pc+' 個專案 | '+tc+' 個任務');
}
main().catch(e=>{console.error(e.message);process.exit(1);}).finally(()=>prisma.$disconnect());
