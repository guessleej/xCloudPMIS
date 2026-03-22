/**
 * Prisma 資料庫初始化腳本（最小化版本）
 *
 * 用途：建立系統啟動所需的基礎資料
 * 執行：npx prisma db seed
 *       或 node_modules/.bin/prisma db seed
 *
 * 預設管理員帳號：
 *   Email    : admin@dev.local
 *   密碼     : dev@2026
 *   公司     : xCloud 科技
 *   部門     : 資訊技術部
 *   電話     : +886 912-345-678
 *   加入日期 : 2023-01-15
 *
 * ⚠️  注意：此 seed 只建立最基本的公司與管理員帳號。
 *           專案、任務等業務資料請由使用者在登入後自行建立。
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════╗');
  console.log('║     xCloudPMIS 資料庫初始化中       ║');
  console.log('╚════════════════════════════════════╝');
  console.log('');

  // ── 步驟 1：清空所有資料（從子表開始，避免外鍵衝突）──────────
  console.log('🗑️  清空舊資料...');
  await prisma.aiAgentLog.deleteMany();
  await prisma.aiDecision.deleteMany();
  await prisma.aiModelConfig.deleteMany();
  await prisma.oAuthToken.deleteMany();
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
  console.log('   ✅ 完成！\n');

  // ── 步驟 2：建立公司 ────────────────────────────────────────
  console.log('🏢 建立公司：xCloud 科技...');
  const company = await prisma.company.create({
    data: {
      name:    'xCloud 科技',
      slug:    'xcloud',
      isActive: true,
    },
  });
  console.log(`   ✅ ${company.name}（ID: ${company.id}）\n`);

  // ── 步驟 3：建立預設管理員帳號 ──────────────────────────────
  console.log('👤 建立管理員帳號：admin@dev.local...');
  const passwordHash = await bcrypt.hash('dev@2026', 12);

  const admin = await prisma.user.create({
    data: {
      companyId:   company.id,
      name:        '系統管理員',
      email:       'admin@dev.local',
      passwordHash,
      role:        'admin',
      isActive:    true,
      department:  '資訊技術部',
      phone:       '+886 912-345-678',
      jobTitle:    '系統管理員',
      joinedAt:    new Date('2023-01-15'),
    },
  });
  console.log(`   ✅ ${admin.name}（${admin.email}）\n`);

  // ── 完成 ────────────────────────────────────────────────────
  console.log('╔════════════════════════════════════╗');
  console.log('║     資料庫初始化完成！               ║');
  console.log('╚════════════════════════════════════╝');
  console.log('');
  console.log('📋 預設帳號資訊：');
  console.log(`   Email  ：admin@dev.local`);
  console.log(`   密碼   ：dev@2026`);
  console.log(`   角色   ：系統管理員 (admin)`);
  console.log(`   公司 ID：${company.id}`);
  console.log(`   使用者 ID：${admin.id}`);
  console.log('');
  console.log('💡 提示：請在瀏覽器開啟系統，使用上方帳號登入。');
  console.log('');
}

main()
  .catch(e => {
    console.error('\n❌ Seed 失敗：', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
