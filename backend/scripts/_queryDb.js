const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const p = new PrismaClient();

(async () => {
  const companies = await p.company.findMany({ select: { id: true, name: true } });
  console.log('=== COMPANIES ===');
  console.log(JSON.stringify(companies, null, 2));

  const users = await p.user.findMany({ select: { id: true, name: true, email: true, role: true, companyId: true } });
  console.log('=== USERS ===');
  console.log(JSON.stringify(users, null, 2));

  const projects = await p.project.findMany({ select: { id: true, name: true, ownerId: true, companyId: true }, take: 5 });
  console.log('=== PROJECTS ===');
  console.log(JSON.stringify(projects, null, 2));

  const tasks = await p.task.findMany({ where: { deletedAt: null }, select: { id: true, title: true, assigneeId: true, projectId: true, status: true }, take: 5 });
  console.log('=== TASKS ===');
  console.log(JSON.stringify(tasks, null, 2));

  const members = await p.projectMember.findMany({ select: { projectId: true, userId: true, role: true }, take: 10 });
  console.log('=== PROJECT MEMBERS ===');
  console.log(JSON.stringify(members, null, 2));

  await p.$disconnect();
})();
