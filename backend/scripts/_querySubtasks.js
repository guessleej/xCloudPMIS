const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // 找 Brocade 相關任務
  const tasks = await p.task.findMany({
    where: { title: { contains: 'Brocade' } },
    select: { id: true, title: true, parentTaskId: true, status: true, projectId: true },
  });
  console.log('=== Brocade 任務 ===');
  console.log(JSON.stringify(tasks, null, 2));

  // 找這些任務的子任務
  for (const t of tasks) {
    const subs = await p.task.findMany({
      where: { parentTaskId: t.id, deletedAt: null },
      select: { id: true, title: true, status: true, parentTaskId: true },
    });
    if (subs.length > 0) {
      console.log(`\n=== 任務 ${t.id} "${t.title}" 的子任務 ===`);
      console.log(JSON.stringify(subs, null, 2));
    } else {
      console.log(`\n任務 ${t.id} "${t.title}" — 無子任務`);
    }
  }
}

main().catch(console.error).finally(() => p.$disconnect());
