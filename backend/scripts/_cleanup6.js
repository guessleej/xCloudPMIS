const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  await p.project.updateMany({ where: { id: 6 }, data: { deletedAt: new Date() } });
  console.log('cleaned up project #6');
  await p.$disconnect();
})();
