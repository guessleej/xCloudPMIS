import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const APP_URL = 'http://localhost:3838/#my-tasks';
const API_URL = 'http://localhost:3010';
const ADMIN_EMAIL = process.env.PMIS_TEST_EMAIL;
const ADMIN_PASSWORD = process.env.PMIS_TEST_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error('請先設定 PMIS_TEST_EMAIL 與 PMIS_TEST_PASSWORD，再執行我的任務 smoke test');
}

function artifactDir() {
  return path.join(process.cwd(), 'qa', 'artifacts');
}

function artifactPath(name) {
  return path.join(artifactDir(), name);
}

async function apiRequest(pathname, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${API_URL}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok || json?.success === false) {
    throw new Error(`${method} ${pathname} failed: ${response.status} ${text}`);
  }

  return json;
}

async function apiLogin() {
  const payload = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
  });

  if (!payload?.token || !payload?.user) {
    throw new Error(`登入回應不完整: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function createSeedData(token) {
  const stamp = Date.now();
  const listName = `QA 排序清單 ${stamp}`;
  const firstTitle = `QA 排序任務 A ${stamp}`;
  const secondTitle = `QA 排序任務 B ${stamp}`;

  const list = await apiRequest('/api/my-tasks/lists', {
    method: 'POST',
    token,
    body: { name: listName, color: '#C41230' },
  });

  const firstTask = await apiRequest('/api/my-tasks/tasks', {
    method: 'POST',
    token,
    body: { title: firstTitle, listId: list.data.id },
  });

  const secondTask = await apiRequest('/api/my-tasks/tasks', {
    method: 'POST',
    token,
    body: { title: secondTitle, listId: list.data.id },
  });

  return {
    listId: list.data.id,
    listName,
    firstTaskId: firstTask.data.id,
    firstTitle,
    secondTaskId: secondTask.data.id,
    secondTitle,
  };
}

async function cleanupSeedData(token, seeded) {
  if (!seeded) return;

  if (seeded.firstTaskId) {
    await apiRequest(`/api/my-tasks/tasks/${seeded.firstTaskId}`, {
      method: 'DELETE',
      token,
    }).catch(() => {});
  }

  if (seeded.secondTaskId) {
    await apiRequest(`/api/my-tasks/tasks/${seeded.secondTaskId}`, {
      method: 'DELETE',
      token,
    }).catch(() => {});
  }

  if (seeded.listId) {
    await apiRequest(`/api/my-tasks/lists/${seeded.listId}`, {
      method: 'DELETE',
      token,
    }).catch(() => {});
  }
}

function listSectionLocator(page, listName) {
  return page.locator('section', {
    has: page.getByText(listName, { exact: true }),
  }).first();
}

function taskRowLocator(listSection, taskTitle) {
  return listSection.locator('div[draggable="true"]', { hasText: taskTitle }).first();
}

function taskDropTargetLocator(listSection, taskTitle) {
  return listSection.getByText(taskTitle, { exact: true }).first();
}

async function taskRowY(listSection, taskTitle) {
  const row = taskRowLocator(listSection, taskTitle);
  await row.waitFor({ timeout: 30000 });
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  if (!box) throw new Error(`找不到任務列位置: ${taskTitle}`);
  return box.y;
}

async function assertOrder(listSection, upperTitle, lowerTitle, stage) {
  const upperY = await taskRowY(listSection, upperTitle);
  const lowerY = await taskRowY(listSection, lowerTitle);

  if (!(upperY < lowerY)) {
    throw new Error(`${stage} 驗證失敗：預期「${upperTitle}」在「${lowerTitle}」上方，但 y=${upperY}, ${lowerY}`);
  }

  return {
    upperTitle,
    lowerTitle,
    upperY,
    lowerY,
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', error => pageErrors.push(error.message));

const report = {
  project: 'pmis開發案',
  executedAt: new Date().toISOString(),
  status: 'passed',
  pageErrors,
  consoleErrors,
};

let token = null;
let seeded = null;

try {
  const login = await apiLogin();
  token = login.token;
  seeded = await createSeedData(token);

  console.log(`[UI] 已建立測試清單 ${seeded.listName} 與兩筆任務`);

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email 帳號').fill(ADMIN_EMAIL);
  await page.getByLabel('密碼').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: '登入系統' }).click();

  await page.getByText(seeded.listName, { exact: true }).first().waitFor({ timeout: 30000 });
  const listSection = listSectionLocator(page, seeded.listName);
  await listSection.waitFor({ timeout: 30000 });
  await listSection.scrollIntoViewIfNeeded();

  report.beforeDrag = await assertOrder(listSection, seeded.firstTitle, seeded.secondTitle, '拖曳前');
  console.log('[UI] 拖曳前順序正確');

  const sourceRow = taskRowLocator(listSection, seeded.secondTitle);
  const targetDropArea = taskDropTargetLocator(listSection, seeded.firstTitle);
  await sourceRow.dragTo(targetDropArea);

  await page.getByText('任務排序已儲存', { exact: true }).waitFor({ timeout: 30000 });
  report.afterDrag = await assertOrder(listSection, seeded.secondTitle, seeded.firstTitle, '拖曳後');
  console.log('[UI] 拖曳後順序已更新');

  await page.reload({ waitUntil: 'domcontentloaded' });
  const reloadedListSection = listSectionLocator(page, seeded.listName);
  await reloadedListSection.waitFor({ timeout: 30000 });
  await reloadedListSection.scrollIntoViewIfNeeded();

  report.afterReload = await assertOrder(reloadedListSection, seeded.secondTitle, seeded.firstTitle, '重新整理後');
  console.log('[UI] 重新整理後順序仍然正確');

  fs.mkdirSync(artifactDir(), { recursive: true });
  report.screenshot = artifactPath('pmis-my-tasks-reorder-ui-smoke.png');
  report.jsonPath = artifactPath('pmis-my-tasks-reorder-ui-smoke.json');
  await page.screenshot({ path: report.screenshot, fullPage: true });
  fs.writeFileSync(report.jsonPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  fs.mkdirSync(artifactDir(), { recursive: true });
  report.screenshot = artifactPath('pmis-my-tasks-reorder-ui-smoke-failed.png');
  report.jsonPath = artifactPath('pmis-my-tasks-reorder-ui-smoke.json');
  await page.screenshot({ path: report.screenshot, fullPage: true }).catch(() => {});
  fs.writeFileSync(report.jsonPath, JSON.stringify(report, null, 2));
  console.error(error.stack || error.message);
  process.exitCode = 1;
} finally {
  await cleanupSeedData(token, seeded);
  await context.close();
  await browser.close();
}
