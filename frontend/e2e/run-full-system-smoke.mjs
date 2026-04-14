import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const APP_URL = 'http://localhost:3838';
const API_URL = 'http://localhost:3010';
const ADMIN_EMAIL = process.env.PMIS_TEST_EMAIL;
const ADMIN_PASSWORD = process.env.PMIS_TEST_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error('請先設定 PMIS_TEST_EMAIL 與 PMIS_TEST_PASSWORD，再執行 full system smoke test');
}

const ROUTE_SMOKES = [
  { id: 'home', label: '首頁', checks: ['我的一週', '已完成任務'] },
  { id: 'inbox', label: '收件匣', checks: ['收件匣摘要'] },
  { id: 'my-tasks', label: '我的任務', checks: ['個人任務總覽 · 跨專案統一檢視'] },
  { id: 'projects', label: '專案', checks: ['管理所有進行中的專案'] },
  { id: 'tasks', label: '任務看板', checks: ['Kanban 任務追蹤'] },
  { id: 'gantt', label: '時程規劃', checks: ['甘特圖 · 里程碑管理'] },
  { id: 'reports', label: '報告', checks: ['產生各類分析報表，支援 CSV 格式下載'] },
  { id: 'portfolios', label: '專案集', checks: ['多專案健康監控 · 進度一覽'] },
  { id: 'goals', label: '目標', checks: ['OKR 目標與關鍵結果追蹤'] },
  { id: 'workload', label: '工作負載', checks: ['成員任務分配視覺化'] },
  { id: 'rules', label: '自動化規則', checks: ['觸發條件 → 動作 · 工作流程自動化'] },
  { id: 'forms', label: '表單', checks: ['標準化請求入口 · 提交即建任務'] },
  { id: 'custom-fields', label: '自訂欄位', checks: ['追蹤優先度 · 階段 · 工時等資料'] },
  { id: 'workflow', label: '工作流程圖', checks: ['泳道圖 · 視覺化流程設計'] },
  { id: 'time', label: '工時記錄', checks: ['人員工時統計'] },
  { id: 'team', label: '團隊', checks: ['成員與角色設定'] },
  { id: 'settings', label: '設定', checks: ['偏好與整合設定'] },
  { id: 'profile', label: '個人資料', checks: ['帳戶設定'] },
];

function artifactPath(name) {
  return path.join(process.cwd(), 'qa', 'artifacts', name);
}

function artifactDir() {
  return path.join(process.cwd(), 'qa', 'artifacts');
}

async function apiLogin() {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const json = await res.json();
  if (!res.ok || !json.success || !json.token) {
    throw new Error(`API 登入失敗: ${JSON.stringify(json)}`);
  }
  return json;
}

async function apiRequest(pathname, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API_URL}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { ok: res.ok, status: res.status, json, text };
}

async function seedUiSmokeData(token, user) {
  const stamp = Date.now();
  const taskTitle = `QA Full UI Smoke Task ${stamp}`;
  const notificationTitle = `QA 全系統 Smoke 通知 ${stamp}`;
  const myTasksListName = `QA Full Smoke 排序清單 ${stamp}`;
  const myTasksFirstTitle = `QA Full Smoke 排序任務 A ${stamp}`;
  const myTasksSecondTitle = `QA Full Smoke 排序任務 B ${stamp}`;

  const notificationRes = await apiRequest('/api/notifications', {
    method: 'POST',
    token,
    body: {
      recipientId: user.id,
      type: 'comment_added',
      title: notificationTitle,
      message: '這是一筆用來驗證收件匣與通知流的全系統 smoke 測試資料。',
      resourceType: 'task',
      resourceId: 7,
    },
  });
  if (!notificationRes.ok) {
    throw new Error(`建立測試通知失敗: ${notificationRes.text}`);
  }

  const taskRes = await apiRequest('/api/projects/7/tasks', {
    method: 'POST',
    token,
    body: {
      title: taskTitle,
      status: 'todo',
      priority: 'medium',
      assigneeId: user.id,
    },
  });
  if (!taskRes.ok) {
    throw new Error(`建立測試任務失敗: ${taskRes.text}`);
  }

  const myTasksListRes = await apiRequest('/api/my-tasks/lists', {
    method: 'POST',
    token,
    body: {
      name: myTasksListName,
      color: '#C41230',
    },
  });
  if (!myTasksListRes.ok) {
    throw new Error(`建立我的任務測試清單失敗: ${myTasksListRes.text}`);
  }

  const myTasksFirstRes = await apiRequest('/api/my-tasks/tasks', {
    method: 'POST',
    token,
    body: {
      title: myTasksFirstTitle,
      listId: myTasksListRes.json?.data?.id,
    },
  });
  if (!myTasksFirstRes.ok) {
    throw new Error(`建立我的任務排序測試任務 A 失敗: ${myTasksFirstRes.text}`);
  }

  const myTasksSecondRes = await apiRequest('/api/my-tasks/tasks', {
    method: 'POST',
    token,
    body: {
      title: myTasksSecondTitle,
      listId: myTasksListRes.json?.data?.id,
    },
  });
  if (!myTasksSecondRes.ok) {
    throw new Error(`建立我的任務排序測試任務 B 失敗: ${myTasksSecondRes.text}`);
  }

  return {
    notificationId: notificationRes.json?.data?.id,
    notificationTitle,
    taskId: taskRes.json?.data?.id,
    taskTitle,
    myTasksListId: myTasksListRes.json?.data?.id,
    myTasksListName,
    myTasksFirstTaskId: myTasksFirstRes.json?.data?.id,
    myTasksFirstTitle,
    myTasksSecondTaskId: myTasksSecondRes.json?.data?.id,
    myTasksSecondTitle,
  };
}

async function cleanupUiSmokeData(token, seeded) {
  if (seeded?.notificationId) {
    await apiRequest(`/api/notifications/${seeded.notificationId}`, {
      method: 'DELETE',
      token,
    });
  }

  if (seeded?.taskId) {
    await apiRequest(`/api/projects/tasks/${seeded.taskId}`, {
      method: 'DELETE',
      token,
    });
  }

  if (seeded?.myTasksFirstTaskId) {
    await apiRequest(`/api/my-tasks/tasks/${seeded.myTasksFirstTaskId}`, {
      method: 'DELETE',
      token,
    }).catch(() => {});
  }

  if (seeded?.myTasksSecondTaskId) {
    await apiRequest(`/api/my-tasks/tasks/${seeded.myTasksSecondTaskId}`, {
      method: 'DELETE',
      token,
    }).catch(() => {});
  }

  if (seeded?.myTasksListId) {
    await apiRequest(`/api/my-tasks/lists/${seeded.myTasksListId}`, {
      method: 'DELETE',
      token,
    }).catch(() => {});
  }
}

async function waitForTexts(page, texts) {
  for (const text of texts) {
    await page.getByText(text, { exact: false }).first().waitFor({ timeout: 20000 });
  }
}

async function goToRoute(page, routeId) {
  const url = routeId === 'home' ? `${APP_URL}/` : `${APP_URL}/#${routeId}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
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
  if (!box) {
    throw new Error(`找不到任務列位置: ${taskTitle}`);
  }
  return box.y;
}

async function assertTaskOrder(listSection, upperTitle, lowerTitle, stage) {
  const upperY = await taskRowY(listSection, upperTitle);
  const lowerY = await taskRowY(listSection, lowerTitle);

  if (!(upperY < lowerY)) {
    throw new Error(`${stage} 驗證失敗：預期「${upperTitle}」在「${lowerTitle}」上方，但 y=${upperY}, ${lowerY}`);
  }

  return { upperTitle, lowerTitle, upperY, lowerY };
}

async function reorderMyTasksAndVerify(page, seeded) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const listSection = listSectionLocator(page, seeded.myTasksListName);
    await listSection.waitFor({ timeout: 20000 });
    await listSection.scrollIntoViewIfNeeded();

    const sourceRow = taskRowLocator(listSection, seeded.myTasksSecondTitle);
    const targetDropArea = taskDropTargetLocator(listSection, seeded.myTasksFirstTitle);
    await sourceRow.dragTo(targetDropArea);
    await page.waitForTimeout(350);

    try {
      await page.getByText('任務排序已儲存', { exact: true }).waitFor({ timeout: 5000 });
    } catch {
      // 某些情況訊息很快消失或未顯示，不阻斷後續位置驗證。
    }

    try {
      return await assertTaskOrder(listSection, seeded.myTasksSecondTitle, seeded.myTasksFirstTitle, `拖曳後（第 ${attempt} 次）`);
    } catch (error) {
      lastError = error;
      await goToRoute(page, 'my-tasks');
      await page.getByText(seeded.myTasksListName, { exact: true }).first().waitFor({ timeout: 20000 });
    }
  }

  throw lastError || new Error('我的任務拖曳排序驗證失敗');
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
const page = await context.newPage();

const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    consoleErrors.push(msg.text());
  }
});

const report = {
  project: 'pmis開發案',
  executedAt: new Date().toISOString(),
  uiSmoke: [],
  deepChecks: [],
  pageErrors,
  consoleErrors,
};

let token = null;
let currentUser = null;
let seeded = null;

try {
  const login = await apiLogin();
  token = login.token;
  currentUser = login.user;
  seeded = await seedUiSmokeData(token, currentUser);

  console.log(`[UI] 使用 ${currentUser.email} 登入，建立測試通知與任務`);

  await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email 帳號').fill(ADMIN_EMAIL);
  await page.getByLabel('密碼').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: '登入系統' }).click();
  await page.getByRole('button', { name: '設定', exact: true }).waitFor({ timeout: 30000 });

  for (const route of ROUTE_SMOKES) {
    const entry = { route: route.id, label: route.label, status: 'passed' };
    try {
      await goToRoute(page, route.id);
      await waitForTexts(page, route.checks);
      console.log(`[UI] 頁面載入通過: ${route.label}`);
    } catch (error) {
      entry.status = 'failed';
      entry.error = error.message;
      console.log(`[UI] 頁面載入失敗: ${route.label} -> ${error.message}`);
    }
    report.uiSmoke.push(entry);
  }

  try {
    await goToRoute(page, 'my-tasks');
    await page.getByText(seeded.myTasksListName, { exact: true }).first().waitFor({ timeout: 20000 });
    const myTasksSection = listSectionLocator(page, seeded.myTasksListName);
    await myTasksSection.waitFor({ timeout: 20000 });
    const beforeDrag = await assertTaskOrder(myTasksSection, seeded.myTasksFirstTitle, seeded.myTasksSecondTitle, '拖曳前');
    const afterDrag = await reorderMyTasksAndVerify(page, seeded);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const reloadedSection = listSectionLocator(page, seeded.myTasksListName);
    await reloadedSection.waitFor({ timeout: 20000 });
    const afterReload = await assertTaskOrder(reloadedSection, seeded.myTasksSecondTitle, seeded.myTasksFirstTitle, '重新整理後');
    report.deepChecks.push({
      module: 'my-tasks-reorder',
      status: 'passed',
      detail: '我的任務拖曳排序可寫回資料庫，重新整理後順序維持不變',
      beforeDrag,
      afterDrag,
      afterReload,
    });
    console.log('[UI] 深度檢查通過: 我的任務拖曳排序持久化');
  } catch (error) {
    report.deepChecks.push({ module: 'my-tasks-reorder', status: 'failed', detail: error.message });
  }

  try {
    await goToRoute(page, 'team');
    await page.getByRole('button', { name: /全部（10）/ }).waitFor({ timeout: 20000 });
    report.deepChecks.push({ module: 'team', status: 'passed', detail: '團隊管理頁顯示 10 位成員' });
    console.log('[UI] 深度檢查通過: 團隊頁人數 10');
  } catch (error) {
    report.deepChecks.push({ module: 'team', status: 'failed', detail: error.message });
  }

  try {
    await goToRoute(page, 'projects');
    await page.getByText('xCloudPMIS 系統上線專案').waitFor({ timeout: 20000 });
    report.deepChecks.push({ module: 'projects', status: 'passed', detail: '專案列表可讀取實際專案' });
    console.log('[UI] 深度檢查通過: 專案列表');
  } catch (error) {
    report.deepChecks.push({ module: 'projects', status: 'failed', detail: error.message });
  }

  try {
    await goToRoute(page, 'tasks');
    await page.getByText(seeded.taskTitle).waitFor({ timeout: 20000 });
    await page.getByText(seeded.taskTitle).click();
    await page.getByText('自定義欄位', { exact: false }).first().waitFor({ timeout: 20000 });
    await page.getByRole('heading', { name: '子任務' }).waitFor({ timeout: 20000 });
    await page.getByRole('heading', { name: '活動紀錄' }).waitFor({ timeout: 20000 });
    await page.keyboard.press('Escape');
    report.deepChecks.push({ module: 'tasks', status: 'passed', detail: '任務看板與詳情側邊欄可正常開啟' });
    console.log('[UI] 深度檢查通過: 任務看板 + 詳情面板');
  } catch (error) {
    report.deepChecks.push({ module: 'tasks', status: 'failed', detail: error.message });
  }

  try {
    await goToRoute(page, 'inbox');
    await page.getByText(seeded.notificationTitle, { exact: false }).waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: '管理通知' }).click();
    await waitForTexts(page, ['電子郵件通知', 'App 通知']);
    await page.keyboard.press('Escape').catch(() => {});
    report.deepChecks.push({ module: 'inbox', status: 'passed', detail: '收件匣讀取通知且管理面板可開啟' });
    console.log('[UI] 深度檢查通過: 收件匣 + 管理通知');
  } catch (error) {
    report.deepChecks.push({ module: 'inbox', status: 'failed', detail: error.message });
  }

  try {
    await goToRoute(page, 'settings');
    await page.getByText('xCloud 科技').waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: /個人資料/ }).click();
    await page.getByText(currentUser.email, { exact: true }).waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: /整合服務/ }).click();
    await page.getByText('Microsoft 365 / Azure AD 連線').waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: /系統狀態/ }).click();
    await page.getByText('後端服務').waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: /資料統計/ }).click();
    await page.getByText('完整資料統計').waitFor({ timeout: 20000 });
    report.deepChecks.push({ module: 'settings', status: 'passed', detail: '公司/個人/整合/系統/統計分頁皆可載入' });
    console.log('[UI] 深度檢查通過: 設定頁各分頁');
  } catch (error) {
    report.deepChecks.push({ module: 'settings', status: 'failed', detail: error.message });
  }

  try {
    await goToRoute(page, 'rules');
    await page.getByText('拖曳到已完成欄位').waitFor({ timeout: 20000 });
    report.deepChecks.push({ module: 'rules', status: 'passed', detail: '自動化規則頁顯示系統規則 spotlight' });
    console.log('[UI] 深度檢查通過: 自動化規則');
  } catch (error) {
    report.deepChecks.push({ module: 'rules', status: 'failed', detail: error.message });
  }

  fs.mkdirSync(artifactDir(), { recursive: true });
  const screenshot = artifactPath('pmis-full-system-ui-smoke.png');
  const jsonPath = artifactPath('pmis-full-system-ui-smoke.json');
  await page.screenshot({ path: screenshot, fullPage: true });
  fs.writeFileSync(jsonPath, JSON.stringify({ ...report, screenshot }, null, 2));

  console.log(JSON.stringify({
    screenshot,
    jsonPath,
    uiSmokePassed: report.uiSmoke.filter((item) => item.status === 'passed').length,
    uiSmokeFailed: report.uiSmoke.filter((item) => item.status === 'failed').length,
    deepChecksPassed: report.deepChecks.filter((item) => item.status === 'passed').length,
    deepChecksFailed: report.deepChecks.filter((item) => item.status === 'failed').length,
  }, null, 2));
} finally {
  if (token && seeded) {
    await cleanupUiSmokeData(token, seeded);
  }
  await context.close();
  await browser.close();
}
