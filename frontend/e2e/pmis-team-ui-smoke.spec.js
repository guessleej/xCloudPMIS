import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3838/#team';
const ADMIN_EMAIL = process.env.PMIS_TEST_EMAIL;
const ADMIN_PASSWORD = process.env.PMIS_TEST_PASSWORD;
const TARGET_TEAM_SIZE = 10;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error('請先設定 PMIS_TEST_EMAIL 與 PMIS_TEST_PASSWORD，再執行 Playwright smoke test');
}

const candidateMembers = [
  { name: 'PMIS 測試成員 01', email: 'pmis.qa.member01@outlook.com', role: 'member' },
  { name: 'PMIS 測試成員 02', email: 'pmis.qa.member02@outlook.com', role: 'member' },
  { name: 'PMIS 測試成員 03', email: 'pmis.qa.member03@outlook.com', role: 'member' },
  { name: 'PMIS 測試成員 04', email: 'pmis.qa.member04@outlook.com', role: 'member' },
  { name: 'PMIS 測試成員 05', email: 'pmis.qa.member05@outlook.com', role: 'member' },
  { name: 'PMIS 測試成員 06', email: 'pmis.qa.member06@outlook.com', role: 'pm' },
  { name: 'PMIS 測試成員 07', email: 'pmis.qa.member07@outlook.com', role: 'member' },
  { name: 'PMIS 測試成員 08', email: 'pmis.qa.member08@outlook.com', role: 'member' },
  { name: 'PMIS 測試成員 09', email: 'pmis.qa.member09@outlook.com', role: 'member' },
  { name: 'PMIS 測試成員 10', email: 'pmis.qa.member10@outlook.com', role: 'member' },
];

test.setTimeout(180000);

function parseSummaryCount(text) {
  const match = text.match(/全部（(\d+)）/);
  if (!match) {
    throw new Error(`無法從團隊頁解析成員總數: ${text}`);
  }
  return Number(match[1]);
}

async function selectRole(scope, role) {
  const labelMap = {
    admin: '👑 系統管理員',
    pm: '📋 專案經理',
    member: '👤 一般成員',
  };
  const roleLabel = labelMap[role] || labelMap.member;
  await scope.getByRole('button', { name: roleLabel, exact: true }).click();
}

test('pmis開發案可透過 UI 補齊 10 人團隊並完成新增成員 smoke test', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('歡迎回來')).toBeVisible();
  await page.getByLabel('Email 帳號').fill(ADMIN_EMAIL);
  await page.getByLabel('密碼').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: '登入系統' }).click();

  await expect(page.getByRole('heading', { name: '團隊管理' })).toBeVisible({ timeout: 30000 });

  const allFilter = page.getByRole('button', { name: /全部（\d+）/ });
  await expect(allFilter).toBeVisible();

  const beforeText = await allFilter.textContent();
  const beforeCount = parseSummaryCount(beforeText || '');

  const existingEmails = new Set();
  for (const member of candidateMembers) {
    if (await page.getByText(member.email, { exact: true }).count()) {
      existingEmails.add(member.email);
    }
  }

  let currentCount = beforeCount;
  const createdMembers = [];
  for (const member of candidateMembers) {
    if (currentCount >= TARGET_TEAM_SIZE) break;
    if (existingEmails.has(member.email)) continue;

    await page.getByRole('button', { name: '新增成員' }).first().click();

    const modal = page.getByRole('heading', { name: '新增成員' });
    await expect(modal).toBeVisible();
    await page.getByPlaceholder('例：張小華').fill(member.name);
    await page.getByPlaceholder('例：xiaohua@company.com').fill(member.email);
    await selectRole(page, member.role);
    await page.getByRole('button', { name: /新增成員/ }).last().click();

    await expect(page.getByText(member.email)).toBeVisible({ timeout: 30000 });
    currentCount += 1;
    createdMembers.push(member);
  }

  const expectedCount = Math.max(beforeCount, TARGET_TEAM_SIZE);
  await expect(allFilter).toHaveText(new RegExp(`全部（${expectedCount}）`), { timeout: 30000 });

  const artifactDir = path.join(process.cwd(), 'qa', 'artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  await page.screenshot({
    path: path.join(artifactDir, 'pmis-team-ui-smoke.png'),
    fullPage: true,
  });

  console.log(JSON.stringify({
    project: 'pmis開發案',
    beforeCount,
    afterCount: expectedCount,
    createdMembers,
    targetTeamSize: TARGET_TEAM_SIZE,
    screenshot: path.join(artifactDir, 'pmis-team-ui-smoke.png'),
  }, null, 2));
});
