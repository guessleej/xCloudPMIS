const prisma = require('../src/lib/prisma');

(async () => {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, lastLoginAt: true },
    orderBy: { id: 'asc' },
  });

  const tokens = await prisma.oAuthToken.findMany({
    where: { provider: 'microsoft', isActive: true },
    select: { userId: true, microsoftEmail: true, expiresAt: true, scopes: true },
  });

  const tokenMap = new Map(tokens.map(t => [t.userId, t]));

  console.log('=== M365 Delegated Token 綁定狀態 ===');
  for (const u of users) {
    const t = tokenMap.get(u.id);
    const status = t ? '✅ 已綁定' : '❌ 未綁定';
    const detail = t ? `(${t.microsoftEmail}, scopes=${t.scopes.split(' ').length})` : '';
    console.log(`${u.id} | ${u.name} | ${u.email} | ${status} ${detail}`);
  }
  console.log('---');
  console.log(`總計: ${users.length} 人, 已綁定: ${tokens.length} 人, 未綁定: ${users.length - tokens.length} 人`);

  await prisma.$disconnect();
})();
