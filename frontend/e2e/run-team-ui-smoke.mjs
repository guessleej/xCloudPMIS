import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3838/#team';
const ADMIN_EMAIL = process.env.PMIS_TEST_EMAIL;
const ADMIN_PASSWORD = process.env.PMIS_TEST_PASSWORD;
const TARGET_TEAM_SIZE = 10;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error('請先設定 PMIS_TEST_EMAIL 與 PMIS_TEST_PASSWORD，再執行 UI smoke test');
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

function parseSummaryCount(text) {
  const match = text.match(/全部（(\d+)）/);
  if (!match) {
    throw new Error(`無法從團隊頁解析成員總數: ${text}`);
  }
  return Number(match[1]);
}

async function readCurrentCount(page) {
  const text = await page.getByRole('button', { name: /全部（\d+）/ }).textContent();
  return parseSummaryCount(text || '');
}

async function waitForCount(page, expectedCount) {
  await page.waitForFunction((count) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.some((button) => button.textContent?.trim() === `全部（${count}）`);
  }, expectedCount, { timeout: 30000 });
}

async function waitForEmail(page, email) {
  await page.waitForFunction((value) => document.body.innerText.includes(value), email, {
    timeout: 30000,
  });
}

async function selectRole(page, role) {
  const roleLabelMap = {
    admin: '👑 系統管理員',
    pm: '📋 專案經理',
    member: '👤 一般成員',
  };
  const label = roleLabelMap[role] || roleLabelMap.member;
  await page.getByRole('button', { name: label, exact: true }).click();
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
const page = await context.newPage();

try {
  console.log(`[UI] 開啟 ${BASE_URL}`);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  console.log('[UI] 使用管理員帳號登入');
  await page.getByLabel('Email 帳號').fill(ADMIN_EMAIL);
  await page.getByLabel('密碼').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: '登入系統' }).click();

  await page.getByRole('heading', { name: '團隊管理' }).waitFor({ timeout: 30000 });
  let currentCount = await readCurrentCount(page);
  const beforeCount = currentCount;
  console.log(`[UI] 目前團隊人數: ${beforeCount}`);

  const existingPageText = await page.locator('main').textContent();
  const existingEmails = new Set(
    candidateMembers
      .filter((member) => existingPageText?.includes(member.email))
      .map((member) => member.email)
  );

  const createdMembers = [];
  for (const member of candidateMembers) {
    if (currentCount >= TARGET_TEAM_SIZE) break;
    if (existingEmails.has(member.email)) continue;

    console.log(`[UI] 新增成員: ${member.name} <${member.email}> (${member.role})`);
    await page.getByRole('button', { name: '➕ 新增成員', exact: true }).first().click();
    await page.getByPlaceholder('例：張小華').fill(member.name);
    await page.getByPlaceholder('例：xiaohua@company.com').fill(member.email);
    await selectRole(page, member.role);
    await page.getByRole('button', { name: '➕ 新增成員', exact: true }).last().click();

    await waitForEmail(page, member.email);
    currentCount += 1;
    await waitForCount(page, currentCount);
    createdMembers.push(member);
    console.log(`[UI] 已新增，團隊人數 -> ${currentCount}`);
  }

  const finalCount = await readCurrentCount(page);
  const artifactDir = path.join(process.cwd(), 'qa', 'artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  const screenshotPath = path.join(artifactDir, 'pmis-team-ui-smoke.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(JSON.stringify({
    project: 'pmis開發案',
    beforeCount,
    afterCount: finalCount,
    targetTeamSize: TARGET_TEAM_SIZE,
    createdMembers,
    screenshot: screenshotPath,
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
