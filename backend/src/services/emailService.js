/**
 * services/emailService.js
 * ─────────────────────────────────────────────────────────────
 * Microsoft Graph API 郵件發送服務
 *
 * 功能：
 *   - 透過 Exchange Online 發送 HTML 格式郵件
 *   - 支援任務提醒、逾期警告、週報等業務場景
 *   - 自動 Token 重試（401 時清除快取再重試一次）
 *   - 速率限制保護（避免觸發 Microsoft Graph 限流）
 *   - 批次發送（大量郵件時分批處理）
 *   - 網域白名單（防止誤發到外部網域）
 *
 * 使用方式：
 *   const email = require('./emailService');
 *   await email.sendTaskReminder('user@company.com', taskDetails);
 *
 * Microsoft Graph API 限制（參考）：
 *   - 每分鐘最多 10,000 個請求（租用戶等級）
 *   - 每個使用者每分鐘最多 1,200 封郵件
 *   - 建議批次發送間隔：每封間隔 200ms 以上
 */

'use strict';

const axios          = require('axios');
const { getAccessToken, clearTokenCache } = require('./graphAuth');

// ════════════════════════════════════════════════════════════
// 設定常數
// ════════════════════════════════════════════════════════════

/** Microsoft Graph API 的基礎 URL */
const GRAPH_API = 'https://graph.microsoft.com/v1.0';

/** 發件人信箱（共享信箱或一般信箱，需有 Mail.Send 權限） */
const SENDER_EMAIL = process.env.O365_SENDER_EMAIL;

/**
 * 允許發信的網域白名單
 * 留空陣列 [] 代表允許所有網域（測試用）
 * 生產環境應填入如 ['company.com', 'partner.com']
 */
const ALLOWED_DOMAINS = process.env.EMAIL_ALLOWED_DOMAINS
  ? process.env.EMAIL_ALLOWED_DOMAINS.split(',').map(d => d.trim().toLowerCase())
  : [];

/** 批次發送時，每封郵件的間隔毫秒數（避免觸發速率限制） */
const BATCH_DELAY_MS = parseInt(process.env.EMAIL_BATCH_DELAY_MS) || 300;

/** 最大重試次數（401 Token 過期情況） */
const MAX_RETRY = 2;

// ════════════════════════════════════════════════════════════
// 工具函式
// ════════════════════════════════════════════════════════════

/**
 * 延遲等待工具（用於批次發送間隔）
 * @param {number} ms - 等待毫秒數
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 驗證 Email 格式（基本驗證，非完整 RFC 5322）
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * 檢查信箱是否在允許的發送網域內
 * @param {string} email - 收件人信箱
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkDomainWhitelist(email) {
  // 允許清單為空 → 允許所有網域（通常用於開發環境）
  if (ALLOWED_DOMAINS.length === 0) return { allowed: true };

  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return { allowed: false, reason: '無效的信箱格式' };

  const ok = ALLOWED_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`));
  if (!ok) {
    return {
      allowed: false,
      reason: `網域 @${domain} 不在允許清單中。允許的網域：${ALLOWED_DOMAINS.join(', ')}`,
    };
  }
  return { allowed: true };
}

/**
 * 格式化 Graph API 的收件人物件
 * @param {string|string[]} to - 單一或多個信箱地址
 * @returns {Array<{ emailAddress: { address: string } }>}
 */
function formatRecipients(to) {
  const list = Array.isArray(to) ? to : [to];
  return list.map(addr => ({
    emailAddress: { address: addr.trim() },
  }));
}

// ════════════════════════════════════════════════════════════
// 核心發送函式（帶重試機制）
// ════════════════════════════════════════════════════════════

/**
 * 呼叫 Graph API 發送郵件（內部函式）
 * 當收到 401 錯誤時，自動清除 Token 快取並重試一次
 *
 * @param {Object} messagePayload - Graph API 的 message 物件
 * @param {number} retryCount - 目前重試次數（內部遞迴用）
 * @throws {Error} 超過最大重試次數或非 Token 類型錯誤
 */
async function callGraphSendMail(messagePayload, retryCount = 0) {
  let token;
  try {
    token = await getAccessToken();
  } catch (authErr) {
    throw new Error(`認證失敗，無法發送郵件：${authErr.message}`);
  }

  try {
    // 使用「代理發送」端點：/users/{senderEmail}/sendMail
    // 需要 Mail.Send 應用程式權限（不需要使用者委派）
    const endpoint = `${GRAPH_API}/users/${encodeURIComponent(SENDER_EMAIL)}/sendMail`;

    await axios.post(endpoint, { message: messagePayload, saveToSentItems: true }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // 明確要求 Graph API 不要快取回應
        'Cache-Control': 'no-cache',
      },
      timeout: 15000, // 15 秒逾時
    });

  } catch (err) {
    const status   = err.response?.status;
    const graphErr = err.response?.data?.error;

    // ── 401 Token 過期 → 清快取、重試 ─────────────────────
    if (status === 401 && retryCount < MAX_RETRY) {
      console.warn(`⚠️ Token 已過期（401），清除快取後重試（第 ${retryCount + 1} 次）`);
      clearTokenCache();
      await sleep(500); // 等 500ms 後重試
      return callGraphSendMail(messagePayload, retryCount + 1);
    }

    // ── 429 速率限制 → 等待並重試 ─────────────────────────
    if (status === 429 && retryCount < MAX_RETRY) {
      const retryAfter = parseInt(err.response?.headers?.['retry-after'] || '5');
      console.warn(`⚠️ 超過速率限制（429），等待 ${retryAfter} 秒後重試`);
      await sleep(retryAfter * 1000);
      return callGraphSendMail(messagePayload, retryCount + 1);
    }

    // ── 其他錯誤：組合友善的錯誤訊息 ─────────────────────
    let friendlyMsg = '郵件發送失敗';
    if (status === 403) {
      friendlyMsg = '權限不足（403）— 請確認應用程式已獲得 Mail.Send 應用程式權限，且管理員已同意授權';
    } else if (status === 404) {
      friendlyMsg = `找不到發件人信箱（404）— 請確認 O365_SENDER_EMAIL="${SENDER_EMAIL}" 在此 Exchange 組織中存在`;
    } else if (graphErr) {
      friendlyMsg = `Graph API 錯誤 [${graphErr.code}]：${graphErr.message}`;
    } else if (err.code === 'ECONNABORTED') {
      friendlyMsg = '請求逾時（15秒）— Graph API 可能暫時不可用';
    } else if (err.code === 'ENOTFOUND') {
      friendlyMsg = '無法連線到 Microsoft Graph API — 請確認網路連線';
    }

    const error = new Error(friendlyMsg);
    error.code   = graphErr?.code || err.code || 'EMAIL_SEND_FAILED';
    error.status = status;
    console.error(`❌ ${friendlyMsg}`);
    throw error;
  }
}

// ════════════════════════════════════════════════════════════
// 公開 API
// ════════════════════════════════════════════════════════════

/**
 * 發送 Outlook 郵件（核心函式）
 *
 * @param {Object} options - 發送選項
 * @param {string|string[]} options.to         - 收件人信箱（一或多個）
 * @param {string}          options.subject    - 郵件主旨
 * @param {string}          options.htmlBody   - HTML 格式郵件內容
 * @param {string[]}        [options.cc]       - 副本收件人（選填）
 * @param {string[]}        [options.bcc]      - 密件副本收件人（選填）
 * @param {string}          [options.priority] - 重要性：'normal'|'high'|'low'（預設 normal）
 *
 * @returns {Promise<{ success: boolean, recipients: string[] }>}
 * @throws {Error} 驗證失敗或發送失敗
 *
 * @example
 * await sendOutlookEmail({
 *   to: 'user@company.com',
 *   subject: '任務提醒',
 *   htmlBody: '<p>您有一個任務即將到期</p>',
 *   priority: 'high',
 * });
 */
async function sendOutlookEmail({ to, subject, htmlBody, cc = [], bcc = [], priority = 'normal' }) {
  // ── 前置驗證 ─────────────────────────────────────────────
  if (!SENDER_EMAIL) {
    throw new Error('環境變數 O365_SENDER_EMAIL 未設定，請確認 .env 設定');
  }
  if (!to || (Array.isArray(to) && to.length === 0)) {
    throw new Error('收件人信箱不得為空');
  }
  if (!subject?.trim()) {
    throw new Error('郵件主旨不得為空');
  }

  const recipients = Array.isArray(to) ? to : [to];

  // 驗證所有收件人信箱格式與網域白名單
  for (const addr of recipients) {
    if (!isValidEmail(addr)) {
      throw new Error(`無效的收件人信箱格式：${addr}`);
    }
    const { allowed, reason } = checkDomainWhitelist(addr);
    if (!allowed) {
      throw new Error(`發送受限：${reason}`);
    }
  }

  // ── 組建 Graph API Payload ────────────────────────────────
  const message = {
    subject,
    importance: priority === 'high' ? 'high' : priority === 'low' ? 'low' : 'normal',
    body: {
      contentType: 'HTML',
      content:     htmlBody,
    },
    toRecipients:  formatRecipients(recipients),
    ccRecipients:  cc.length  > 0 ? formatRecipients(cc)  : [],
    bccRecipients: bcc.length > 0 ? formatRecipients(bcc) : [],
    // 回覆地址指向發件人（方便收件人回覆）
    replyTo: [{ emailAddress: { address: SENDER_EMAIL } }],
  };

  // ── 發送 ─────────────────────────────────────────────────
  console.log(`📧 發送郵件 → ${recipients.join(', ')} | 主旨：${subject}`);
  await callGraphSendMail(message);
  console.log(`✅ 郵件發送成功 → ${recipients.join(', ')}`);

  return { success: true, recipients };
}

// ════════════════════════════════════════════════════════════
// HTML 郵件模板
// ════════════════════════════════════════════════════════════

/**
 * 取得郵件外層包裝 HTML（Outlook 相容的表格布局）
 * @param {Object} opts
 * @param {string} opts.title       - 頁首大標題
 * @param {string} opts.accentColor - 主題色（十六進位）
 * @param {string} opts.content     - 主要內容 HTML
 * @param {string} [opts.footer]    - 頁尾附加文字
 */
function wrapEmailTemplate({ title, accentColor, content, footer = '' }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Microsoft JhengHei','微軟正黑體',Arial,sans-serif;">

<!-- 外層容器 -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f9;">
  <tr>
    <td align="center" style="padding:30px 20px;">

      <!-- 郵件主體 (最大寬度 600px) -->
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <!-- 頂部色條 -->
        <tr>
          <td style="background-color:${accentColor};height:5px;border-radius:6px 6px 0 0;"></td>
        </tr>

        <!-- 頁首 -->
        <tr>
          <td style="background-color:#ffffff;padding:28px 36px 20px;border-radius:0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <span style="font-size:22px;color:#1a202c;font-weight:700;letter-spacing:-0.5px;">
                    🏗️ xCloud<span style="color:${accentColor};">PMIS</span>
                  </span>
                </td>
                <td align="right">
                  <span style="font-size:12px;color:#9ca3af;">專案管理系統</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- 分隔線 -->
        <tr>
          <td style="background-color:#ffffff;padding:0 36px;">
            <div style="height:1px;background-color:#e5e7eb;"></div>
          </td>
        </tr>

        <!-- 主要內容 -->
        <tr>
          <td style="background-color:#ffffff;padding:28px 36px;">
            ${content}
          </td>
        </tr>

        <!-- 底部說明 -->
        <tr>
          <td style="background-color:#f8fafc;border-top:1px solid #e5e7eb;padding:18px 36px;border-radius:0 0 6px 6px;">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
              此郵件由 xCloudPMIS 系統自動發送，請勿直接回覆。
              ${footer ? `<br>${footer}` : ''}
              <br>若有疑問，請聯繫您的系統管理員。
              <br><br>© ${year} xCloudPMIS. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * 狀態徽章 HTML（顯示任務/專案狀態）
 * @param {string} text  - 顯示文字
 * @param {string} color - 文字顏色
 * @param {string} bg    - 背景顏色
 */
function statusBadge(text, color, bg) {
  return `<span style="display:inline-block;background:${bg};color:${color};font-size:12px;font-weight:600;padding:3px 10px;border-radius:12px;">${text}</span>`;
}

/** 優先度 → 徽章樣式 */
const PRIORITY_BADGE = {
  urgent: () => statusBadge('🔴 緊急', '#dc2626', '#fee2e2'),
  high:   () => statusBadge('🟠 高', '#c2410c', '#ffedd5'),
  medium: () => statusBadge('🟡 中', '#a16207', '#fef9c3'),
  low:    () => statusBadge('⚪ 低', '#6b7280', '#f3f4f6'),
};

/** 任務狀態 → 徽章樣式 */
const TASK_STATUS_BADGE = {
  todo:        () => statusBadge('待處理', '#6b7280', '#f3f4f6'),
  in_progress: () => statusBadge('進行中', '#1d4ed8', '#dbeafe'),
  review:      () => statusBadge('審查中', '#d97706', '#fef3c7'),
  done:        () => statusBadge('已完成', '#065f46', '#d1fae5'),
};

/**
 * 格式化日期為 YYYY/MM/DD（台灣格式）
 * @param {string|Date} dateInput
 */
function formatDate(dateInput) {
  if (!dateInput) return '未設定';
  const d = new Date(dateInput);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 計算距今天數（負數 = 已過期）
 * @param {string|Date} dueDate
 */
function calcDaysLeft(dueDate) {
  if (!dueDate) return null;
  const diff = new Date(dueDate) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ════════════════════════════════════════════════════════════
// 業務場景郵件函式
// ════════════════════════════════════════════════════════════

/**
 * 發送任務指派通知（立即觸發，任務被指派時呼叫）
 *
 * @param {string} userEmail - 被指派人信箱
 * @param {Object} taskDetails - 任務詳情
 * @param {number}  taskDetails.id          - 任務 ID
 * @param {string}  taskDetails.title       - 任務名稱
 * @param {string}  taskDetails.projectName - 所屬專案名稱
 * @param {string}  taskDetails.priority    - 優先度（urgent/high/medium/low）
 * @param {string}  taskDetails.status      - 狀態（todo/in_progress/review/done）
 * @param {string}  [taskDetails.dueDate]   - 到期日
 * @param {string}  [taskDetails.description] - 任務說明
 * @param {string}  [taskDetails.assignerName] - 指派人姓名
 * @param {string}  userEmail - 被指派人信箱
 * @param {string}  userName  - 被指派人姓名（顯示在信中）
 */
async function sendTaskAssignmentNotification(userEmail, userName, taskDetails) {
  const priorityBadge = (PRIORITY_BADGE[taskDetails.priority] || PRIORITY_BADGE.medium)();
  const statusBadgeHtml = (TASK_STATUS_BADGE[taskDetails.status] || TASK_STATUS_BADGE.todo)();
  const daysLeft = calcDaysLeft(taskDetails.dueDate);
  const dueDateDisplay = formatDate(taskDetails.dueDate);

  // 截止日提示
  let dueDateHint = '';
  if (daysLeft !== null) {
    if (daysLeft < 0) {
      dueDateHint = `<br><span style="color:#dc2626;font-weight:600;">⚠️ 此任務已逾期 ${Math.abs(daysLeft)} 天！</span>`;
    } else if (daysLeft === 0) {
      dueDateHint = `<br><span style="color:#d97706;font-weight:600;">⚠️ 此任務今日到期，請盡快處理！</span>`;
    } else if (daysLeft <= 3) {
      dueDateHint = `<br><span style="color:#d97706;font-weight:600;">⏰ 距截止日還有 ${daysLeft} 天，請優先處理。</span>`;
    }
  }

  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#1a202c;font-weight:700;">
      您有新的任務指派 📋
    </h2>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
      ${taskDetails.assignerName ? `由 <strong>${taskDetails.assignerName}</strong> 指派` : '系統指派'} · ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
    </p>

    <!-- 問候語 -->
    <p style="font-size:15px;color:#374151;margin:0 0 20px;">
      ${userName} 您好，<br>
      以下任務已指派給您，請查看詳情並盡快處理：
    </p>

    <!-- 任務資訊卡 -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:20px;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:0.1em;text-transform:uppercase;">任務名稱</p>
          <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#1a202c;">${taskDetails.title}</p>

          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="50%" style="padding-bottom:12px;">
                <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;font-weight:600;">所屬專案</p>
                <p style="margin:0;font-size:14px;color:#374151;font-weight:600;">📁 ${taskDetails.projectName || '未指定'}</p>
              </td>
              <td width="50%" style="padding-bottom:12px;">
                <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;font-weight:600;">優先度</p>
                <p style="margin:0;">${priorityBadge}</p>
              </td>
            </tr>
            <tr>
              <td width="50%">
                <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;font-weight:600;">目前狀態</p>
                <p style="margin:0;">${statusBadgeHtml}</p>
              </td>
              <td width="50%">
                <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;font-weight:600;">截止日期</p>
                <p style="margin:0;font-size:14px;color:#374151;font-weight:600;">📅 ${dueDateDisplay}${dueDateHint}</p>
              </td>
            </tr>
          </table>

          ${taskDetails.description ? `
          <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb;">
            <p style="margin:0 0 6px;font-size:11px;color:#9ca3af;font-weight:600;">任務說明</p>
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${taskDetails.description}</p>
          </div>` : ''}
        </td>
      </tr>
    </table>

    <!-- CTA 按鈕 -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding:10px 0 24px;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}"
             style="display:inline-block;background:#3b82f6;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 32px;border-radius:8px;">
            前往系統查看 →
          </a>
        </td>
      </tr>
    </table>
  `;

  const subject = taskDetails.priority === 'urgent'
    ? `🔴 [緊急] 新任務指派：${taskDetails.title}`
    : `📋 新任務指派：${taskDetails.title}`;

  return sendOutlookEmail({
    to:       userEmail,
    subject,
    htmlBody: wrapEmailTemplate({
      title:       subject,
      accentColor: taskDetails.priority === 'urgent' ? '#dc2626' : '#3b82f6',
      content,
    }),
    priority: taskDetails.priority === 'urgent' ? 'high' : 'normal',
  });
}

/**
 * 發送任務截止提醒（排程每日早上 9 點觸發）
 *
 * @param {string} userEmail - 負責人信箱
 * @param {string} userName  - 負責人姓名
 * @param {Object} taskDetails - 任務詳情（同 sendTaskAssignmentNotification）
 */
async function sendTaskReminder(userEmail, userName, taskDetails) {
  const priorityBadge = (PRIORITY_BADGE[taskDetails.priority] || PRIORITY_BADGE.medium)();
  const daysLeft = calcDaysLeft(taskDetails.dueDate);
  const dueDateDisplay = formatDate(taskDetails.dueDate);

  let urgencyMsg = '您有一個任務即將到期，請注意。';
  let accentColor = '#f59e0b';
  let subjectPrefix = '⏰ [任務提醒]';

  if (daysLeft !== null) {
    if (daysLeft < 0) {
      urgencyMsg = `此任務已逾期 <strong style="color:#dc2626;">${Math.abs(daysLeft)} 天</strong>，請盡速處理！`;
      accentColor = '#dc2626';
      subjectPrefix = '🚨 [逾期警告]';
    } else if (daysLeft === 0) {
      urgencyMsg = '此任務<strong style="color:#dc2626;">今日到期</strong>，請於今日完成！';
      accentColor = '#dc2626';
      subjectPrefix = '⚠️ [今日到期]';
    } else if (daysLeft === 1) {
      urgencyMsg = '此任務<strong style="color:#d97706;">明日到期</strong>，請把握時間！';
      accentColor = '#f59e0b';
    } else {
      urgencyMsg = `此任務將於 <strong>${daysLeft} 天後</strong>（${dueDateDisplay}）到期。`;
    }
  }

  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#1a202c;font-weight:700;">
      任務截止提醒 ⏰
    </h2>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
      系統自動提醒 · ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
    </p>

    <p style="font-size:15px;color:#374151;margin:0 0 20px;">
      ${userName} 您好，${urgencyMsg}
    </p>

    <!-- 任務資訊卡 -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc;border:2px solid ${accentColor};border-radius:8px;margin-bottom:20px;">
      <tr>
        <td style="background:${accentColor};padding:10px 20px;border-radius:6px 6px 0 0;">
          <span style="color:white;font-size:13px;font-weight:700;">📌 任務詳情</span>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 10px;font-size:17px;font-weight:700;color:#1a202c;">${taskDetails.title}</p>

          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;color:#374151;">
            <tr>
              <td width="50%" style="padding:6px 0;">📁 <strong>專案：</strong>${taskDetails.projectName || '未指定'}</td>
              <td width="50%" style="padding:6px 0;">🎯 <strong>優先度：</strong>${priorityBadge}</td>
            </tr>
            <tr>
              <td width="50%" style="padding:6px 0;">📅 <strong>截止日：</strong>${dueDateDisplay}</td>
              <td width="50%" style="padding:6px 0;">
                <strong>距到期：</strong>
                <span style="color:${daysLeft !== null && daysLeft < 0 ? '#dc2626' : daysLeft === 0 ? '#dc2626' : daysLeft <= 2 ? '#d97706' : '#374151'};font-weight:700;">
                  ${daysLeft === null ? '未設定' : daysLeft < 0 ? `已逾期 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? '今日到期' : `${daysLeft} 天`}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding:10px 0 24px;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}"
             style="display:inline-block;background:${accentColor};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 32px;border-radius:8px;">
            立即前往處理 →
          </a>
        </td>
      </tr>
    </table>

    <p style="font-size:13px;color:#9ca3af;margin:0;">
      💡 提示：請登入 xCloudPMIS 系統更新任務狀態，確保進度即時同步。
    </p>
  `;

  const subject = `${subjectPrefix} ${taskDetails.title}`;
  return sendOutlookEmail({
    to:       userEmail,
    subject,
    htmlBody: wrapEmailTemplate({ title: subject, accentColor, content }),
    priority: daysLeft !== null && daysLeft <= 0 ? 'high' : 'normal',
  });
}

/**
 * 發送逾期警告（適用於已超過截止日的任務）
 * 與 sendTaskReminder 相似，但視覺上更緊急（紅色主題）
 *
 * @param {string} userEmail
 * @param {string} userName
 * @param {Object} taskDetails
 */
async function sendOverdueWarning(userEmail, userName, taskDetails) {
  const daysOverdue = Math.abs(calcDaysLeft(taskDetails.dueDate) || 0);

  const content = `
    <!-- 紅色警示橫幅 -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;margin-bottom:20px;">
      <tr>
        <td style="padding:16px 20px;text-align:center;">
          <p style="margin:0;font-size:20px;">🚨</p>
          <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#dc2626;">任務逾期警告</p>
          <p style="margin:4px 0 0;font-size:13px;color:#991b1b;">已逾期 <strong>${daysOverdue} 天</strong></p>
        </td>
      </tr>
    </table>

    <p style="font-size:15px;color:#374151;margin:0 0 20px;">
      ${userName} 您好，<br>
      以下任務已超過截止日期，請立即更新狀態或與主管溝通延期事宜：
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#1a202c;">${taskDetails.title}</p>
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">專案：${taskDetails.projectName || '未指定'}</p>
          <p style="margin:0;font-size:13px;color:#dc2626;font-weight:600;">
            原定截止：${formatDate(taskDetails.dueDate)}（已逾期 ${daysOverdue} 天）
          </p>
        </td>
      </tr>
    </table>

    <p style="font-size:14px;color:#374151;margin:0 0 20px;">
      <strong>建議行動：</strong>
    </p>
    <ol style="font-size:14px;color:#374151;margin:0 0 24px;padding-left:20px;line-height:1.8;">
      <li>登入系統更新任務最新進度</li>
      <li>若任務已完成，請將狀態改為「已完成」</li>
      <li>若需延期，請聯繫專案負責人調整截止日期</li>
    </ol>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding-bottom:24px;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}"
             style="display:inline-block;background:#dc2626;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 32px;border-radius:8px;">
            立即更新任務狀態 →
          </a>
        </td>
      </tr>
    </table>
  `;

  const subject = `🚨 [逾期警告] ${taskDetails.title}（已逾期 ${daysOverdue} 天）`;
  return sendOutlookEmail({
    to:       userEmail,
    subject,
    htmlBody: wrapEmailTemplate({ title: subject, accentColor: '#dc2626', content }),
    priority: 'high',
  });
}

/**
 * 發送週報（每週五下午 5 點，給主管）
 *
 * @param {string} managerEmail - 主管信箱
 * @param {string} managerName  - 主管姓名
 * @param {Object} reportData   - 週報資料
 * @param {string}   reportData.weekLabel       - 週期標籤，如「2026/03/10 ~ 2026/03/14」
 * @param {Object}   reportData.summary         - 摘要數字
 * @param {number}     reportData.summary.totalActive    - 進行中任務總數
 * @param {number}     reportData.summary.completed     - 本週完成任務數
 * @param {number}     reportData.summary.overdue        - 逾期任務數
 * @param {number}     reportData.summary.upcoming       - 下週到期任務數
 * @param {Array}    reportData.overdueList     - 逾期任務列表（{title, assignee, daysOverdue}[]）
 * @param {Array}    reportData.upcomingList    - 即將到期列表
 * @param {Array}    reportData.completedList   - 本週完成列表
 */
async function sendWeeklyReport(managerEmail, managerName, reportData) {
  const { weekLabel, summary, overdueList = [], upcomingList = [], completedList = [] } = reportData;

  // 逾期任務表格
  const overdueRows = overdueList.slice(0, 10).map(t => `
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:10px 12px;font-size:13px;color:#1a202c;">${t.title}</td>
      <td style="padding:10px 12px;font-size:13px;color:#6b7280;">${t.assignee || '未指定'}</td>
      <td style="padding:10px 12px;font-size:13px;color:#dc2626;font-weight:600;">+${t.daysOverdue} 天</td>
    </tr>
  `).join('');

  // 即將到期表格
  const upcomingRows = upcomingList.slice(0, 10).map(t => `
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:10px 12px;font-size:13px;color:#1a202c;">${t.title}</td>
      <td style="padding:10px 12px;font-size:13px;color:#6b7280;">${t.assignee || '未指定'}</td>
      <td style="padding:10px 12px;font-size:13px;color:#d97706;font-weight:600;">${t.daysLeft} 天</td>
    </tr>
  `).join('');

  const content = `
    <h2 style="margin:0 0 4px;font-size:20px;color:#1a202c;font-weight:700;">
      📊 專案管理週報
    </h2>
    <p style="margin:0 0 28px;font-size:14px;color:#9ca3af;">
      統計期間：${weekLabel}
    </p>

    <p style="font-size:15px;color:#374151;margin:0 0 24px;">
      ${managerName} 您好，以下是本週的專案管理摘要報告：
    </p>

    <!-- 4 個摘要數字卡片 -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        ${[
          { label: '進行中任務', value: summary.totalActive, color: '#3b82f6', icon: '🔵' },
          { label: '本週完成',   value: summary.completed,   color: '#10b981', icon: '✅' },
          { label: '目前逾期',   value: summary.overdue,     color: '#dc2626', icon: '🔴' },
          { label: '下週到期',   value: summary.upcoming,    color: '#f59e0b', icon: '⚠️' },
        ].map(card => `
          <td width="25%" style="padding:0 6px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;border-top:3px solid ${card.color};">
              <tr>
                <td style="padding:14px 16px;text-align:center;">
                  <p style="margin:0;font-size:22px;font-weight:800;color:${card.color};">${card.value}</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">${card.icon} ${card.label}</p>
                </td>
              </tr>
            </table>
          </td>
        `).join('')}
      </tr>
    </table>

    ${overdueList.length > 0 ? `
    <!-- 逾期任務 -->
    <h3 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#dc2626;">🚨 逾期任務（${overdueList.length} 項）</h3>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border:1px solid #fca5a5;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <tr style="background:#fee2e2;">
        <th style="padding:10px 12px;text-align:left;font-size:12px;color:#991b1b;font-weight:700;">任務名稱</th>
        <th style="padding:10px 12px;text-align:left;font-size:12px;color:#991b1b;font-weight:700;">負責人</th>
        <th style="padding:10px 12px;text-align:left;font-size:12px;color:#991b1b;font-weight:700;">逾期天數</th>
      </tr>
      ${overdueRows}
    </table>` : ''}

    ${upcomingList.length > 0 ? `
    <!-- 即將到期 -->
    <h3 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#d97706;">⚠️ 下週即將到期（${upcomingList.length} 項）</h3>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border:1px solid #fed7aa;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <tr style="background:#fff7ed;">
        <th style="padding:10px 12px;text-align:left;font-size:12px;color:#c2410c;font-weight:700;">任務名稱</th>
        <th style="padding:10px 12px;text-align:left;font-size:12px;color:#c2410c;font-weight:700;">負責人</th>
        <th style="padding:10px 12px;text-align:left;font-size:12px;color:#c2410c;font-weight:700;">剩餘天數</th>
      </tr>
      ${upcomingRows}
    </table>` : ''}

    ${completedList.length > 0 ? `
    <!-- 本週完成 -->
    <h3 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#10b981;">✅ 本週完成（${completedList.length} 項）</h3>
    <ul style="margin:0 0 24px;padding:0 0 0 20px;font-size:14px;color:#374151;line-height:2;">
      ${completedList.slice(0, 10).map(t => `<li>${t.title}${t.assignee ? ` <span style="color:#9ca3af;">—${t.assignee}</span>` : ''}</li>`).join('')}
    </ul>` : ''}

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding-top:8px;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}/reports"
             style="display:inline-block;background:#3b82f6;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 32px;border-radius:8px;">
            查看完整報表 →
          </a>
        </td>
      </tr>
    </table>
  `;

  const subject = `📊 xCloudPMIS 週報 ${weekLabel}`;
  return sendOutlookEmail({
    to:       managerEmail,
    subject,
    htmlBody: wrapEmailTemplate({ title: subject, accentColor: '#3b82f6', content }),
  });
}

/**
 * 批次發送郵件（適用於通知多名使用者，自動控制速率）
 *
 * @param {Array<Function>} emailJobs  - 各郵件的 async 函式陣列
 * @param {number}          [batchSize=10] - 每批次數量
 *
 * @returns {Promise<{ sent: number, failed: number, errors: Array }>}
 *
 * @example
 * const jobs = users.map(user =>
 *   () => sendTaskReminder(user.email, user.name, taskDetails)
 * );
 * const result = await batchSendEmails(jobs, 5);
 * console.log(`成功 ${result.sent} 封，失敗 ${result.failed} 封`);
 */
async function batchSendEmails(emailJobs, batchSize = 10) {
  const result = { sent: 0, failed: 0, errors: [] };

  console.log(`📬 開始批次發送 ${emailJobs.length} 封郵件（每批 ${batchSize} 封，間隔 ${BATCH_DELAY_MS}ms）`);

  for (let i = 0; i < emailJobs.length; i++) {
    try {
      await emailJobs[i]();
      result.sent++;
    } catch (err) {
      result.failed++;
      result.errors.push({ index: i, message: err.message });
      console.error(`❌ 第 ${i + 1} 封郵件發送失敗：${err.message}`);
    }

    // 每封間隔（避免速率限制），最後一封不需要等待
    if (i < emailJobs.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }

    // 每批次完成後記錄進度
    if ((i + 1) % batchSize === 0) {
      console.log(`📊 批次進度：${i + 1}/${emailJobs.length}（成功 ${result.sent}，失敗 ${result.failed}）`);
    }
  }

  console.log(`✅ 批次發送完成：共 ${emailJobs.length} 封，成功 ${result.sent}，失敗 ${result.failed}`);
  return result;
}

// ── 模組匯出 ─────────────────────────────────────────────────
module.exports = {
  sendOutlookEmail,
  sendTaskAssignmentNotification,
  sendTaskReminder,
  sendOverdueWarning,
  sendWeeklyReport,
  batchSendEmails,
};
