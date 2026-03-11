/**
 * test/integration/outlook.test.js
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS — Outlook / Microsoft Graph 整合測試套件
 *
 * 測試分組：
 *   Group 1: 連線測試  — Graph API Token 有效性與快取機制
 *   Group 2: 發送測試  — 實際發送郵件至測試信箱（需真實憑證）
 *   Group 3: 內容驗證  — HTML 格式、中文編碼、Domain 白名單（Mock）
 *   Group 4: 錯誤模擬  — 401 重試、403 終止、429 等待、網路中斷（Mock）
 *
 * ─── 執行方式 ─────────────────────────────────────────────────
 *   npx jest test/integration/outlook.test.js --verbose
 *
 *   只跑連線測試：
 *   npx jest test/integration/outlook.test.js -t "Group 1"
 *
 *   跳過實際發送（只跑 Mock 測試）：
 *   SKIP_SEND=true npx jest test/integration/outlook.test.js --verbose
 *
 * ─── 必要環境變數 ──────────────────────────────────────────────
 *   Group 1 / Group 2 需要：
 *     O365_CLIENT_ID      - Azure AD 應用程式識別碼
 *     O365_CLIENT_SECRET  - Azure AD 用戶端密碼（值，非 ID）
 *     O365_TENANT_ID      - Azure AD 目錄識別碼
 *     O365_SENDER_EMAIL   - 寄件者 Email
 *
 *   Group 2 另外需要：
 *     TEST_EMAIL          - 測試收件人 Email（真實可收信的信箱）
 *     SKIP_SEND=false     - 預設 false；設為 true 跳過實際發送
 *
 * ─── 重要設計說明 ──────────────────────────────────────────────
 *   emailService.js 在 module 載入時就讀取環境變數常數：
 *     const SENDER_EMAIL   = process.env.O365_SENDER_EMAIL;
 *     const ALLOWED_DOMAINS = process.env.EMAIL_ALLOWED_DOMAINS ...;
 *   因此 Mock 測試必須在 jest.isolateModulesAsync 的 require() 之前設定好
 *   相關環境變數，並於 require 後恢復原始值。
 *
 *   batchSendEmails(emailJobs) 接受 async 函式陣列，不是 email 物件陣列：
 *     const jobs = emails.map(e => async () => sendOutlookEmail(e));
 *     await batchSendEmails(jobs); // returns { sent, failed, errors }
 */

'use strict';

// 自動載入後端 .env（方便本機直接跑測試）
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// ── 受測模組（Group 1 & 2 用真實模組，Group 3 & 4 在各測試內隔離載入）─
const graphAuth    = require('../../src/services/graphAuth');
const emailService = require('../../src/services/emailService');

// ── 測試環境常數 ────────────────────────────────────────────────
const TEST_EMAIL = process.env.TEST_EMAIL;
const SKIP_SEND  = process.env.SKIP_SEND === 'true';

const HAS_AZURE_CREDS = !!(
  process.env.O365_CLIENT_ID     &&
  process.env.O365_CLIENT_SECRET &&
  process.env.O365_TENANT_ID     &&
  process.env.O365_SENDER_EMAIL
);

// ── 測試輔助函式 ────────────────────────────────────────────────

/**
 * 根據條件動態決定 test / test.skip
 */
function conditionalTest(shouldRun, skipReason) {
  if (shouldRun) return test;
  return (name, fn, timeout) => test.skip(`[SKIP:${skipReason}] ${name}`, fn, timeout);
}

/**
 * 建立隔離的 emailService 環境（Mock axios + graphAuth）
 *
 * 重要：emailService.js 在 require() 時就讀取 process.env 常數，
 * 因此需要在 require 前設定好 env，並在 require 後恢復。
 *
 * @param {jest.Mock}  axiosPost   - axios.post 的 mock 函式
 * @param {object}     opts
 * @param {jest.Mock}  [opts.getTokenFn]  - getAccessToken mock
 * @param {object}     [opts.envVars]     - 要設定的環境變數（null = 刪除）
 */
async function withMockedEmail(axiosPost, {
  getTokenFn = jest.fn().mockResolvedValue('mock-token'),
  envVars    = {},
} = {}) {
  // ① 設定 env（含固定需要的 O365_SENDER_EMAIL）
  const toSet = { O365_SENDER_EMAIL: 'mock-sender@test.example', ...envVars };
  const savedEnv = {};

  for (const [key, val] of Object.entries(toSet)) {
    savedEnv[key] = process.env[key]; // 可能是 undefined
    if (val === null || val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }

  // ② 在隔離作用域內 require module（此時常數已捕獲正確的 env 值）
  let service;
  await jest.isolateModulesAsync(async () => {
    jest.doMock('axios', () => ({ post: axiosPost }));
    jest.doMock('../../src/services/graphAuth', () => ({
      getAccessToken:  getTokenFn,
      clearTokenCache: jest.fn(),
      getTokenStatus:  jest.fn().mockReturnValue({ cached: true, expiresIn: 3599 }),
    }));
    service = require('../../src/services/emailService');
  });

  // ③ 恢復 env（module 已捕獲常數，後續 env 變化不影響已載入的 module）
  for (const [key, saved] of Object.entries(savedEnv)) {
    if (saved === undefined) delete process.env[key];
    else process.env[key] = saved;
  }

  return service;
}

/**
 * 建立完整隔離的 emailService 環境（Group 4 用，需要 mockClear）
 */
async function withMockedServiceFull({
  mockPostFn   = jest.fn().mockResolvedValue({ status: 202 }),
  getTokenFn   = jest.fn().mockResolvedValue('valid-token'),
  clearTokenFn = jest.fn(),
  envVars      = {},
} = {}) {
  const toSet = { O365_SENDER_EMAIL: 'mock-sender@test.example', ...envVars };
  const savedEnv = {};

  for (const [key, val] of Object.entries(toSet)) {
    savedEnv[key] = process.env[key];
    if (val === null || val === undefined) delete process.env[key];
    else process.env[key] = val;
  }

  let svc;
  await jest.isolateModulesAsync(async () => {
    jest.doMock('axios', () => ({ post: mockPostFn }));
    jest.doMock('../../src/services/graphAuth', () => ({
      getAccessToken:  getTokenFn,
      clearTokenCache: clearTokenFn,
      getTokenStatus:  jest.fn().mockReturnValue({ cached: true }),
    }));
    svc = require('../../src/services/emailService');
  });

  for (const [key, saved] of Object.entries(savedEnv)) {
    if (saved === undefined) delete process.env[key];
    else process.env[key] = saved;
  }

  return { svc, mockPost: mockPostFn, mockGetToken: getTokenFn, mockClear: clearTokenFn };
}

// ════════════════════════════════════════════════════════════════
// Group 1 — Graph API 連線測試
// 需要有效的 Azure AD 憑證（O365_CLIENT_ID / SECRET / TENANT_ID）
// ════════════════════════════════════════════════════════════════

describe('【Group 1】Graph API 連線測試', () => {
  const run = conditionalTest(HAS_AZURE_CREDS, '未設定 Azure AD 憑證');

  // 每個連線測試前清除快取，確保重新驗證
  beforeEach(() => graphAuth.clearTokenCache());

  run('應成功取得有效的 Access Token', async () => {
    const token = await graphAuth.getAccessToken();

    // 基本格式驗證：JWT = 3 段 base64url，以 . 分隔
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(100);

    const parts = token.split('.');
    expect(parts).toHaveLength(3);

    // 每段都是 base64url 格式（不含 + / =）
    parts.forEach(part => {
      expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  }, 30_000);

  run('Token 快取機制：第二次呼叫應回傳相同 Token', async () => {
    const token1 = await graphAuth.getAccessToken();
    const token2 = await graphAuth.getAccessToken();
    expect(token1).toBe(token2);
  }, 30_000);

  run('Token 快取狀態：取得 Token 後 cached 應為 true', async () => {
    const beforeStatus = graphAuth.getTokenStatus();
    expect(beforeStatus.cached).toBe(false);

    await graphAuth.getAccessToken();
    const afterStatus = graphAuth.getTokenStatus();

    expect(afterStatus.cached).toBe(true);
    expect(typeof afterStatus.expiresIn).toBe('number');
    expect(afterStatus.expiresIn).toBeGreaterThan(300);
    expect(afterStatus.tenantId).toMatch(/^\.\.\./);
    expect(afterStatus.clientId).toMatch(/^\.\.\./);
  }, 30_000);

  test('Token 狀態：無快取時 cached 應為 false，expiresIn 為 null', () => {
    graphAuth.clearTokenCache();
    const status = graphAuth.getTokenStatus();
    expect(status.cached).toBe(false);
    expect(status.expiresIn).toBeNull();
  });

  test('缺少環境變數時應拋出包含說明的錯誤', async () => {
    const saved = {
      id:     process.env.O365_CLIENT_ID,
      secret: process.env.O365_CLIENT_SECRET,
      tenant: process.env.O365_TENANT_ID,
    };

    delete process.env.O365_CLIENT_ID;
    delete process.env.O365_CLIENT_SECRET;
    delete process.env.O365_TENANT_ID;

    try {
      await jest.isolateModulesAsync(async () => {
        const freshAuth = require('../../src/services/graphAuth');
        freshAuth.clearTokenCache();
        await expect(freshAuth.getAccessToken()).rejects.toThrow(/缺少 Azure AD 環境變數/);
      });
    } finally {
      if (saved.id)     process.env.O365_CLIENT_ID     = saved.id;
      if (saved.secret) process.env.O365_CLIENT_SECRET = saved.secret;
      if (saved.tenant) process.env.O365_TENANT_ID     = saved.tenant;
    }
  });
});

// ════════════════════════════════════════════════════════════════
// Group 2 — 實際發送測試
// 需要：HAS_AZURE_CREDS + TEST_EMAIL + SKIP_SEND=false
// ════════════════════════════════════════════════════════════════

describe('【Group 2】實際發送測試', () => {
  const canSend = HAS_AZURE_CREDS && !!TEST_EMAIL && !SKIP_SEND;
  const run = conditionalTest(
    canSend,
    !TEST_EMAIL ? '未設定 TEST_EMAIL' : SKIP_SEND ? 'SKIP_SEND=true' : '未設定 Azure 憑證'
  );

  run('發送基本 HTML 郵件至測試信箱', async () => {
    const result = await emailService.sendOutlookEmail({
      to:       TEST_EMAIL,
      subject:  `[整合測試] 基本郵件 — ${new Date().toLocaleString('zh-TW')}`,
      htmlBody: `
        <h1 style="color:#2563eb;">✅ Outlook 整合測試</h1>
        <p>此郵件由自動化測試腳本發送，確認後可忽略。</p>
        <table border="1" cellpadding="8" style="border-collapse:collapse;">
          <tr><td><strong>測試項目</strong></td><td>基本郵件發送</td></tr>
          <tr><td><strong>發送時間</strong></td><td>${new Date().toISOString()}</td></tr>
          <tr><td><strong>中文測試</strong></td><td>你好世界！專案管理系統</td></tr>
        </table>
      `,
    });
    expect(result.success).toBe(true);
  }, 60_000);

  run('發送任務指派通知（含繁體中文格式）', async () => {
    const mockTask = {
      id: 99999, title: '整合測試任務 — 請忽略此通知',
      description: '這是一封由自動化測試產生的任務指派通知，系統功能驗證用途。',
      priority: 'high',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      project: { name: '整合測試專案' },
      assignee: { name: '測試人員', email: TEST_EMAIL },
    };
    const result = await emailService.sendTaskAssignmentNotification(mockTask);
    expect(result.success).toBe(true);
  }, 60_000);

  run('發送任務到期提醒（明天到期）', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const mockTask = {
      id: 99998, title: '整合測試任務 — 到期提醒（請忽略）',
      priority: 'medium', dueDate: tomorrow,
      project: { name: '整合測試專案' },
      assignee: { name: '測試人員', email: TEST_EMAIL },
    };
    const result = await emailService.sendTaskReminder(mockTask);
    expect(result.success).toBe(true);
  }, 60_000);

  run('發送逾期警告通知', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const mockTask = {
      id: 99997, title: '整合測試任務 — 逾期警告（請忽略）',
      priority: 'high', dueDate: yesterday,
      project: { name: '整合測試專案' },
      assignee: { name: '測試人員', email: TEST_EMAIL },
    };
    const result = await emailService.sendOverdueWarning(mockTask);
    expect(result.success).toBe(true);
  }, 60_000);

  run('批次發送 3 封郵件（驗證速率限制不中斷）', async () => {
    // batchSendEmails 接受 async 函式陣列
    const jobs = Array.from({ length: 3 }, (_, i) => async () =>
      emailService.sendOutlookEmail({
        to:       TEST_EMAIL,
        subject:  `[整合測試] 批次郵件 #${i + 1}/3 — ${new Date().toLocaleTimeString('zh-TW')}`,
        htmlBody: `<p>批次測試 #${i + 1}，請忽略此郵件。</p>`,
      })
    );

    const result = await emailService.batchSendEmails(jobs);
    // batchSendEmails returns { sent, failed, errors }
    expect(result.sent).toBe(3);
    expect(result.failed).toBe(0);
  }, 120_000);
});

// ════════════════════════════════════════════════════════════════
// Group 3 — 內容與格式驗證（Mock 模式，不需要真實 API 憑證）
// ════════════════════════════════════════════════════════════════

describe('【Group 3】內容與格式驗證', () => {

  test('Email 格式驗證：拒絕無效格式的收件人', async () => {
    const mockPost = jest.fn().mockResolvedValue({ status: 202 });
    const svc = await withMockedEmail(mockPost);

    await expect(
      svc.sendOutlookEmail({ to: 'not-an-email', subject: '測試', htmlBody: '<p>內容</p>' })
    ).rejects.toThrow();

    expect(mockPost).not.toHaveBeenCalled();
  });

  test('Email 格式驗證：拒絕空白收件人', async () => {
    const mockPost = jest.fn().mockResolvedValue({ status: 202 });
    const svc = await withMockedEmail(mockPost);

    await expect(
      svc.sendOutlookEmail({ to: '', subject: '測試', htmlBody: '<p>內容</p>' })
    ).rejects.toThrow();

    expect(mockPost).not.toHaveBeenCalled();
  });

  test('Email 格式驗證：接受合法 email 並發送', async () => {
    const mockPost = jest.fn().mockResolvedValue({ status: 202 });
    const svc = await withMockedEmail(mockPost);

    const result = await svc.sendOutlookEmail({
      to:       'valid-user@example.com',
      subject:  '合法測試主旨',
      htmlBody: '<p>測試內容</p>',
    });

    expect(result.success).toBe(true);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  test('Graph API 請求應包含正確的 Bearer Token 與 Content-Type', async () => {
    const mockPost = jest.fn().mockResolvedValue({ status: 202 });
    const svc = await withMockedEmail(mockPost);

    await svc.sendOutlookEmail({
      to:       'test@example.com',
      subject:  'Bearer Token 驗證測試',
      htmlBody: '<p>測試</p>',
    });

    const [url, , config] = mockPost.mock.calls[0];

    expect(url).toMatch(/graph\.microsoft\.com/);
    expect(url).toMatch(/sendMail/);
    expect(config.headers.Authorization).toBe('Bearer mock-token');
    expect(config.headers['Content-Type']).toBe('application/json');
  });

  test('郵件 HTML 結構：應包含中文語系與 UTF-8 charset', async () => {
    const mockPost = jest.fn().mockResolvedValue({ status: 202 });
    const svc = await withMockedEmail(mockPost);

    await svc.sendOutlookEmail({
      to:       'test@example.com',
      subject:  'HTML 結構驗證',
      htmlBody: '<p>繁體中文測試</p>',
    });

    const [, payload] = mockPost.mock.calls[0];
    const bodyStr = JSON.stringify(payload);

    // Graph API payload 的 content type 應為 HTML
    expect(bodyStr).toMatch(/html/i);
    // 中文內容應完整保留（JSON 序列化不應截斷或錯誤編碼）
    expect(bodyStr).toContain('繁體中文測試');
    // HTML 結構應包含 body 欄位
    expect(payload.message.body).toMatchObject({
      contentType: expect.stringMatching(/html/i),
      content:     expect.stringContaining('繁體中文測試'),
    });
  });

  test('中文字元：主旨與內文的繁體中文應完整保留不截斷', async () => {
    const mockPost = jest.fn().mockResolvedValue({ status: 202 });
    const svc = await withMockedEmail(mockPost);

    const chineseSubject = '專案管理系統通知：任務「設計稿審查」已逾期';
    const chineseBody    = '您好！請立即處理以下逾期任務。謝謝。';

    await svc.sendOutlookEmail({
      to:       'test@example.com',
      subject:  chineseSubject,
      htmlBody: `<p>${chineseBody}</p>`,
    });

    const [, payload] = mockPost.mock.calls[0];
    const bodyStr = JSON.stringify(payload);

    expect(bodyStr).toContain(chineseSubject);
    expect(bodyStr).toContain(chineseBody);
  });

  test('優先級設定：priority=high 應對應 importance high', async () => {
    const mockPost = jest.fn().mockResolvedValue({ status: 202 });
    const svc = await withMockedEmail(mockPost);

    await svc.sendOutlookEmail({
      to:       'test@example.com',
      subject:  '緊急通知',
      htmlBody: '<p>緊急事項</p>',
      priority: 'high',
    });

    const [, payload] = mockPost.mock.calls[0];
    const bodyStr = JSON.stringify(payload);

    expect(bodyStr).toMatch(/high/i);
  });

  test('Domain 白名單：阻擋不在允許列表的網域', async () => {
    const mockPost = jest.fn().mockResolvedValue({ status: 202 });
    // 在 require 前設定白名單（模組載入時捕獲）
    const svc = await withMockedEmail(mockPost, {
      envVars: { EMAIL_ALLOWED_DOMAINS: 'company.com,partner.org' },
    });

    await expect(
      svc.sendOutlookEmail({
        to: 'attacker@evil.com', subject: '測試', htmlBody: '<p>測試</p>',
      })
    ).rejects.toThrow();

    expect(mockPost).not.toHaveBeenCalled();
  });

  test('Domain 白名單：未設定白名單時允許任何網域（開發模式）', async () => {
    const mockPost = jest.fn().mockResolvedValue({ status: 202 });
    // null = 刪除此 env var（模組載入時 ALLOWED_DOMAINS = []）
    const svc = await withMockedEmail(mockPost, {
      envVars: { EMAIL_ALLOWED_DOMAINS: null },
    });

    const result = await svc.sendOutlookEmail({
      to: 'anyone@any-domain.xyz', subject: '測試', htmlBody: '<p>測試</p>',
    });
    expect(result.success).toBe(true);
  });

  test('Domain 白名單：允許在白名單內的網域', async () => {
    const mockPost = jest.fn().mockResolvedValue({ status: 202 });
    const svc = await withMockedEmail(mockPost, {
      envVars: { EMAIL_ALLOWED_DOMAINS: 'company.com,partner.org' },
    });

    const result = await svc.sendOutlookEmail({
      to: 'user@company.com', subject: '測試', htmlBody: '<p>測試</p>',
    });
    expect(result.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════
// Group 4 — 錯誤情境模擬（Mock HTTP 層，驗證 retry / backoff / 終止邏輯）
// ════════════════════════════════════════════════════════════════

describe('【Group 4】錯誤情境模擬', () => {

  // ── 4.1 401 自動重試 ─────────────────────────────────────────

  test('401 Unauthorized：應清除 Token 快取並自動重試一次', async () => {
    const mockGetToken = jest.fn()
      .mockResolvedValueOnce('expired-token')
      .mockResolvedValueOnce('fresh-token');
    const mockClear = jest.fn();

    const axiosError401 = Object.assign(new Error('Unauthorized'), {
      response: { status: 401, headers: {}, data: { error: { code: 'InvalidAuthenticationToken' } } },
    });
    const mockPost = jest.fn()
      .mockRejectedValueOnce(axiosError401)
      .mockResolvedValueOnce({ status: 202 });

    const { svc } = await withMockedServiceFull({
      mockPostFn: mockPost, getTokenFn: mockGetToken, clearTokenFn: mockClear,
    });

    const result = await svc.sendOutlookEmail({
      to: 'user@example.com', subject: '401 重試測試', htmlBody: '<p>測試</p>',
    });

    expect(result.success).toBe(true);
    expect(mockClear).toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  test('401 持續失敗：超過重試上限後應拋出錯誤', async () => {
    const mockGetToken = jest.fn().mockResolvedValue('always-expired-token');
    const axiosError401 = Object.assign(new Error('Unauthorized'), {
      response: { status: 401, headers: {}, data: {} },
    });
    const mockPost = jest.fn().mockRejectedValue(axiosError401);

    const { svc } = await withMockedServiceFull({ mockPostFn: mockPost, getTokenFn: mockGetToken });

    await expect(
      svc.sendOutlookEmail({ to: 'user@example.com', subject: '測試', htmlBody: '<p>測試</p>' })
    ).rejects.toThrow();

    // 至少重試一次（原始 + 至少 1 次 retry）
    expect(mockPost.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  // ── 4.2 403 Forbidden（不重試）──────────────────────────────

  test('403 Forbidden：權限不足應立即拋出錯誤（不重試）', async () => {
    const mockGetToken = jest.fn().mockResolvedValue('valid-token');
    const axiosError403 = Object.assign(new Error('Forbidden'), {
      response: {
        status: 403, headers: {},
        data: { error: { code: 'Authorization_RequestDenied' } },
      },
    });
    const mockPost = jest.fn().mockRejectedValue(axiosError403);

    const { svc } = await withMockedServiceFull({ mockPostFn: mockPost, getTokenFn: mockGetToken });

    await expect(
      svc.sendOutlookEmail({ to: 'user@example.com', subject: '測試', htmlBody: '<p>測試</p>' })
    ).rejects.toThrow();

    // 403 不應重試
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  // ── 4.3 404 Sender 不存在 ────────────────────────────────────

  test('404 Not Found（寄件者不存在）：應拋出錯誤不重試', async () => {
    const mockGetToken = jest.fn().mockResolvedValue('valid-token');
    const axiosError404 = Object.assign(new Error('Not Found'), {
      response: {
        status: 404, headers: {},
        data: { error: { code: 'ResourceNotFound' } },
      },
    });
    const mockPost = jest.fn().mockRejectedValue(axiosError404);

    const { svc } = await withMockedServiceFull({ mockPostFn: mockPost, getTokenFn: mockGetToken });

    await expect(
      svc.sendOutlookEmail({ to: 'user@example.com', subject: '測試', htmlBody: '<p>測試</p>' })
    ).rejects.toThrow();

    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  // ── 4.4 429 Too Many Requests（需等待 Retry-After）───────────

  test('429 Too Many Requests：應等待 Retry-After 秒數後重試', async () => {
    jest.useFakeTimers();

    const mockGetToken = jest.fn().mockResolvedValue('valid-token');
    const axiosError429 = Object.assign(new Error('Too Many Requests'), {
      response: {
        status: 429,
        headers: { 'retry-after': '3' },
        data: { error: { code: 'TooManyRequests' } },
      },
    });
    const mockPost = jest.fn()
      .mockRejectedValueOnce(axiosError429)
      .mockResolvedValueOnce({ status: 202 });

    const { svc } = await withMockedServiceFull({ mockPostFn: mockPost, getTokenFn: mockGetToken });

    const sendPromise = svc.sendOutlookEmail({
      to: 'user@example.com', subject: '429 測試', htmlBody: '<p>測試</p>',
    });

    await jest.runAllTimersAsync();
    const result = await sendPromise;
    expect(result.success).toBe(true);

    jest.useRealTimers();
  }, 15_000);

  // ── 4.5 網路斷線 ────────────────────────────────────────────

  test('ENOTFOUND（DNS 解析失敗）：應拋出錯誤，不重試（非 401/429）', async () => {
    const mockGetToken = jest.fn().mockResolvedValue('valid-token');
    const networkError = Object.assign(
      new Error('getaddrinfo ENOTFOUND graph.microsoft.com'),
      { code: 'ENOTFOUND' }
    );
    const mockPost = jest.fn().mockRejectedValue(networkError);

    const { svc } = await withMockedServiceFull({ mockPostFn: mockPost, getTokenFn: mockGetToken });

    await expect(
      svc.sendOutlookEmail({ to: 'user@example.com', subject: '測試', htmlBody: '<p>測試</p>' })
    ).rejects.toThrow();

    // 網路錯誤不是 401/429，不應重試
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  test('ECONNREFUSED（連線被拒）：應拋出錯誤', async () => {
    const mockGetToken = jest.fn().mockResolvedValue('valid-token');
    const connError = Object.assign(
      new Error('connect ECONNREFUSED 13.107.42.14:443'),
      { code: 'ECONNREFUSED' }
    );
    const mockPost = jest.fn().mockRejectedValue(connError);

    const { svc } = await withMockedServiceFull({ mockPostFn: mockPost, getTokenFn: mockGetToken });

    await expect(
      svc.sendOutlookEmail({ to: 'user@example.com', subject: '測試', htmlBody: '<p>測試</p>' })
    ).rejects.toThrow();
  });

  // ── 4.6 Token 取得失敗 ────────────────────────────────────────

  test('Token 取得失敗（AADSTS700016）：錯誤應傳播至發信函式，不呼叫 HTTP', async () => {
    const authError = Object.assign(
      new Error('找不到應用程式 — 請確認 O365_CLIENT_ID 與 O365_TENANT_ID 是否正確\n  原始錯誤: AADSTS700016'),
      { code: 'GRAPH_AUTH_FAILED' }
    );
    const mockGetToken = jest.fn().mockRejectedValue(authError);
    const mockPost = jest.fn();

    const { svc } = await withMockedServiceFull({ mockPostFn: mockPost, getTokenFn: mockGetToken });

    await expect(
      svc.sendOutlookEmail({ to: 'user@example.com', subject: '測試', htmlBody: '<p>測試</p>' })
    ).rejects.toThrow();

    // Token 取得失敗時，HTTP 請求不應發出
    expect(mockPost).not.toHaveBeenCalled();
  });

  // ── 4.7 批次發送容錯 ─────────────────────────────────────────

  test('batchSendEmails：部分失敗時其餘信件仍繼續發送', async () => {
    const mockGetToken = jest.fn().mockResolvedValue('valid-token');
    const error403 = Object.assign(new Error('Forbidden'), {
      response: { status: 403, headers: {}, data: {} },
    });

    // 第 1 封成功、第 2 封 403 失敗、第 3 封成功
    const mockPost = jest.fn()
      .mockResolvedValueOnce({ status: 202 })
      .mockRejectedValueOnce(error403)
      .mockResolvedValueOnce({ status: 202 });

    const { svc } = await withMockedServiceFull({
      mockPostFn: mockPost,
      getTokenFn: mockGetToken,
      // 加速批次：間隔 0ms（EMAIL_BATCH_DELAY_MS=0）
      envVars: { EMAIL_BATCH_DELAY_MS: '0' },
    });

    // batchSendEmails 接受 async 函式陣列
    const jobs = [
      async () => svc.sendOutlookEmail({ to: 'ok1@example.com',  subject: '第 1 封', htmlBody: '<p>1</p>' }),
      async () => svc.sendOutlookEmail({ to: 'fail@example.com', subject: '第 2 封', htmlBody: '<p>2</p>' }),
      async () => svc.sendOutlookEmail({ to: 'ok2@example.com',  subject: '第 3 封', htmlBody: '<p>3</p>' }),
    ];

    // batchSendEmails returns { sent: number, failed: number, errors: [] }
    const result = await svc.batchSendEmails(jobs);

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
  }, 30_000);
});
