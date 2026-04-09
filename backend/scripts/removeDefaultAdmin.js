/**
 * 移除 seed 建立的預設管理員（admin@company.com）
 * 執行：node scripts/removeDefaultAdmin.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'admin@company.com' },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    console.log('✅ admin@company.com 不存在，無需刪除');
    return;
  }

  console.log(`找到使用者: ${user.name} (${user.email}), ID=${user.id}`);

  // 先刪除關聯資料
  await prisma.notification.deleteMany({ where: { recipientId: user.id } });
  await prisma.oAuthToken.deleteMany({ where: { userId: user.id } });
  await prisma.activityLog.deleteMany({ where: { userId: user.id } });
  await prisma.comment.deleteMany({ where: { userId: user.id } });
  await prisma.timeEntry.deleteMany({ where: { userId: user.id } });

  // 刪除使用者
  await prisma.user.delete({ where: { id: user.id } });
  console.log(`✅ 已刪除預設管理員: ${user.email}`);
}

main()
  .catch(e => console.error('❌', e.message))
  .finally(() => prisma.$disconnect());
