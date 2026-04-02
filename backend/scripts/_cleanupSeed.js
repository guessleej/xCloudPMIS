require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // 刪除舊 seed 假通知（title 為硬編碼的那 3 筆）
  const result = await p.notification.deleteMany({
    where: {
      recipientId: 2,
      OR: [
        { title: '你被指派了新任務' },
        { title: '@你：請確認設計稿' },
        { title: '任務截止日提醒' },
      ],
    },
  });
  console.log(`已刪除 ${result.count} 筆舊 seed 假通知`);

  // 同時刪除第一批跑腳本時產生的重複通知（從專案 7 產生的），保留專案 8 的即可
  const dupes = await p.notification.deleteMany({
    where: {
      recipientId: 2,
      resourceId: { in: [21, 22, 23] }, // 專案 7 的任務
    },
  });
  console.log(`已刪除 ${dupes.count} 筆重複通知（專案 7）`);

  // 顯示剩餘通知
  const remaining = await p.notification.findMany({
    where: { recipientId: 2 },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`\n剩餘 ${remaining.length} 筆通知：`);
  remaining.forEach((n, i) => {
    console.log(`  ${i + 1}. [${n.type}] ${n.title} (id=${n.id}, resourceId=${n.resourceId})`);
  });

  await p.$disconnect();
})();
