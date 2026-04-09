/**
 * services/userOutlookService.js
 * ─────────────────────────────────────────────────────────────
 * Microsoft Graph API 委派操作服務（Delegated Permissions）
 *
 * 本模組代表已授權 OAuth 的用戶執行 Graph API 操作：
 *   - 從用戶信箱發送 Email（/me/sendMail）
 *   - 讀取 / 建立行事曆事件（/me/calendarView、/me/events）
 *   - 智慧通知路由：OAuth Delegated → Application 降級
 *
 * 設計原則：
 *   1. 所有操作透過 tokenManager.getValidToken() 取得解密後的 Bearer Token
 *   2. 401 回應自動標記 Token 撤銷並拋出 needsReauth: true
 *   3. 業務邏輯錯誤（403、404）附帶 graphCode 以便前端處理
 *   4. sendNotification() 實作 Delegated → Application 降級策略
 *
 * 依賴：
 *   tokenManager.js ← Token 管理（解密、自動更新）
 *   emailService.js ← Application 層級 Email 降級 fallback
 *
 * 所需環境變數：（由 tokenManager 處理，此模組不直接讀取）
 *   OAUTH_TOKEN_ENCRYPTION_KEY, OAUTH_MICROSOFT_CLIENT_ID, etc.
 */

'use strict';

const axios = require('axios');
const { getValidToken, revokeUserTokens } = require('./tokenManager');

// 延遲載入 emailService，避免循環依賴問題
// （emailService 可能在某些測試中被 mock，延遲載入確保 mock 生效）
const getEmailService = () => require('./emailService');

// ── Microsoft Graph API 基底 URL ─────────────────────────────
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';


// ════════════════════════════════════════════════════════════
// 核心 HTTP Helper
// ════════════════════════════════════════════════════════════

/**
 * 向 Microsoft Graph API 發出請求
 *
 * @param {string}  accessToken   Bearer Token（已解密）
 * @param {string}  method        HTTP 方法（GET / POST / PATCH / DELETE）
 * @param {string}  path          Graph API 路徑（以 / 開頭）
 * @param {object}  [body]        請求主體（POST / PATCH 使用）
 * @param {object}  [params]      URL 查詢參數（GET 使用）
 * @returns {Promise<object|null>}  Graph API 回應資料；204 No Content 回傳 null
 *
 * @throws {Error} 帶有 code、status、graphCode 屬性的結構化錯誤
 */
async function graphRequest(accessToken, method, path, body = null, params = null) {
  try {
    const config = {
      method,
      url: `${GRAPH_BASE}${path}`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    };
    if (body)   config.data   = body;
    if (params) config.params = params;

    const resp = await axios(config);

    // 204 No Content（sendMail 的正常回應）→ 回傳 null
    if (resp.status === 204) return null;
    return resp.data;

  } catch (err) {
    const status   = err.response?.status;
    const errBody  = err.response?.data?.error;
    const graphCode = errBody?.code    || 'UNKNOWN';
    const graphMsg  = errBody?.message || err.message;

    if (status === 401) {
      // Token 失效（過期、被撤銷、或租戶設定變更）
      throw Object.assign(
        new Error('Microsoft Graph API 授權失效，請重新連接 Microsoft 帳號'),
        { code: 'GRAPH_UNAUTHORIZED', status: 401, graphCode, needsReauth: true }
      );
    }

    if (status === 403) {
      // 已認證但缺少必要權限（應用程式 scope 不足，或目標資源不允許）
      throw Object.assign(
        new Error(`Microsoft Graph 權限不足 [${graphCode}]：${graphMsg}`),
        { code: 'GRAPH_FORBIDDEN', status: 403, graphCode }
      );
    }

    if (status === 404) {
      throw Object.assign(
        new Error(`Microsoft Graph 資源不存在 [${graphCode}]：${graphMsg}`),
        { code: 'GRAPH_NOT_FOUND', status: 404, graphCode }
      );
    }

    if (status >= 400 && status < 500) {
      throw Object.assign(
        new Error(`Microsoft Graph 請求錯誤 [HTTP ${status}] [${graphCode}]：${graphMsg}`),
        { code: 'GRAPH_CLIENT_ERROR', status, graphCode }
      );
    }

    // 500 / 網路錯誤
    throw Object.assign(
      new Error(`Microsoft Graph 服務錯誤 [${status || 'NETWORK'}]：${graphMsg}`),
      { code: 'GRAPH_ERROR', status, graphCode }
    );
  }
}

/**
 * 取得用戶有效 Token 或拋出「需要授權」錯誤
 *
 * @param {number} userId
 * @returns {Promise<{accessToken: string, microsoftEmail: string, scopes: string}>}
 */
async function getTokenOrThrow(userId) {
  const token = await getValidToken(userId);
  if (!token) {
    throw Object.assign(
      new Error(`用戶 ${userId} 尚未連接 Microsoft 帳號，請先完成 OAuth 授權`),
      { code: 'NO_OAUTH_TOKEN', needsReauth: true }
    );
  }
  return token;
}

/**
 * 包裝 Graph 操作，在 401 時自動標記 Token 撤銷
 *
 * @param {number}   userId
 * @param {Function} fn  - () => Promise<T>
 * @returns {Promise<T>}
 */
async function withAuthRetry(userId, fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.code === 'GRAPH_UNAUTHORIZED') {
      // 在 DB 中標記 Token 失效，讓前端下次能偵測到需要重授權
      await revokeUserTokens(userId).catch((e) =>
        console.warn(`⚠️  標記用戶 ${userId} Token 失效時發生錯誤：${e.message}`)
      );
    }
    throw err;
  }
}

// ════════════════════════════════════════════════════════════
// Email（Delegated: /me/sendMail）
// ════════════════════════════════════════════════════════════

/**
 * 代表用戶從其信箱發送 Email
 *
 * @param {number} userId
 * @param {object} emailData
 * @param {string|string[]} emailData.to         收件人（單一或多個）
 * @param {string}           emailData.subject    主旨
 * @param {string}           emailData.htmlBody   HTML 內容
 * @param {string|string[]} [emailData.cc]        副本
 * @param {string|string[]} [emailData.bcc]       密件副本
 * @param {Array<{filename: string, content: Buffer|string, contentType?: string}>} [emailData.attachments]
 * @returns {Promise<{success: boolean, sentBy: 'delegated'}>}
 */
async function sendEmailOnBehalfOfUser(userId, {
  to,
  subject,
  htmlBody,
  cc,
  bcc,
  attachments = [],
}) {
  const { accessToken } = await getTokenOrThrow(userId);

  // 轉換地址為 Graph API 格式
  const toArray  = Array.isArray(to)  ? to  : [to];
  const ccArray  = cc  ? (Array.isArray(cc)  ? cc  : [cc] ) : [];
  const bccArray = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [];

  const toRecipient  = (addr) => ({ emailAddress: { address: addr } });

  const message = {
    subject,
    body: { contentType: 'HTML', content: htmlBody },
    toRecipients:  toArray.map(toRecipient),
    ...(ccArray.length  > 0 && { ccRecipients:  ccArray.map(toRecipient)  }),
    ...(bccArray.length > 0 && { bccRecipients: bccArray.map(toRecipient) }),
  };

  // 附件（base64 編碼）
  if (attachments.length > 0) {
    message.attachments = attachments.map((att) => ({
      '@odata.type':  '#microsoft.graph.fileAttachment',
      name:           att.filename,
      contentType:    att.contentType || 'application/octet-stream',
      contentBytes:   Buffer.isBuffer(att.content)
        ? att.content.toString('base64')
        : att.content,
    }));
  }

  await withAuthRetry(userId, () =>
    graphRequest(accessToken, 'POST', '/me/sendMail', {
      message,
      saveToSentItems: true,
    })
  );

  const toDisplay = toArray.join(', ');
  console.log(`📧 [Delegated] 用戶 ${userId} 代發郵件至 ${toDisplay}`);
  return { success: true, sentBy: 'delegated' };
}

// ════════════════════════════════════════════════════════════
// Calendar（/me/calendarView、/me/events）
// ════════════════════════════════════════════════════════════

/**
 * 取得用戶行事曆事件（指定時間範圍）
 *
 * @param {number}      userId
 * @param {Date|string} startDate   起始時間
 * @param {Date|string} endDate     結束時間
 * @returns {Promise<Array<CalendarEvent>>}
 *
 * @typedef {object} CalendarEvent
 * @property {string}  id
 * @property {string}  subject
 * @property {string}  start
 * @property {string}  end
 * @property {string|null} location
 * @property {boolean} isOnlineMeeting
 * @property {string|null} teamsLink
 * @property {Array<{name, email, type}>} attendees
 * @property {string}  bodyPreview
 * @property {boolean} isAllDay
 * @property {boolean} isCancelled
 */
async function getUserCalendarEvents(userId, startDate, endDate) {
  const { accessToken } = await getTokenOrThrow(userId);

  const start = new Date(startDate).toISOString();
  const end   = new Date(endDate).toISOString();

  const selectFields = [
    'id', 'subject', 'start', 'end', 'location',
    'isOnlineMeeting', 'onlineMeeting', 'attendees',
    'bodyPreview', 'isAllDay', 'isCancelled',
  ].join(',');

  const data = await withAuthRetry(userId, () =>
    graphRequest(
      accessToken,
      'GET',
      `/me/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}&$orderby=start/dateTime&$top=100&$select=${selectFields}`
    )
  );

  return (data?.value || []).map((evt) => ({
    id:              evt.id,
    subject:         evt.subject,
    start:           evt.start?.dateTime,
    end:             evt.end?.dateTime,
    location:        evt.location?.displayName || null,
    isOnlineMeeting: Boolean(evt.isOnlineMeeting),
    teamsLink:       evt.onlineMeeting?.joinUrl || null,
    attendees:       (evt.attendees || []).map((a) => ({
      name:  a.emailAddress?.name  || null,
      email: a.emailAddress?.address || null,
      type:  a.type || 'required',
    })),
    bodyPreview: evt.bodyPreview || '',
    isAllDay:    Boolean(evt.isAllDay),
    isCancelled: Boolean(evt.isCancelled),
  }));
}

/**
 * 在用戶行事曆建立新事件
 *
 * @param {number} userId
 * @param {object} eventData
 * @param {string}   eventData.subject
 * @param {Date|string} eventData.startDateTime
 * @param {Date|string} eventData.endDateTime
 * @param {Array<string|{email, name?, type?}>} [eventData.attendees]
 * @param {string}   [eventData.body]             HTML 描述
 * @param {string}   [eventData.location]         地點顯示名稱
 * @param {boolean}  [eventData.isOnlineMeeting]  是否產生 Teams 連結
 * @param {string}   [eventData.timeZone]         IANA 時區（預設 Asia/Taipei）
 * @returns {Promise<{id, subject, webLink, teamsLink, start, end}>}
 */
async function createCalendarEvent(userId, {
  subject,
  startDateTime,
  endDateTime,
  attendees   = [],
  body,
  location,
  isOnlineMeeting = false,
  timeZone        = 'Asia/Taipei',
}) {
  const { accessToken } = await getTokenOrThrow(userId);

  // ISO 格式但移除 Z（Graph API 需搭配 timeZone 欄位）
  const toLocalIso = (dt) => new Date(dt).toISOString().replace(/Z$/, '');

  const payload = {
    subject,
    start: { dateTime: toLocalIso(startDateTime), timeZone },
    end:   { dateTime: toLocalIso(endDateTime),   timeZone },
    ...(body      && { body:     { contentType: 'HTML', content: body } }),
    ...(location  && { location: { displayName: location } }),
    isOnlineMeeting,
  };

  if (attendees.length > 0) {
    payload.attendees = attendees.map((a) => ({
      emailAddress: {
        address: typeof a === 'string' ? a : a.email,
        ...(typeof a === 'object' && a.name && { name: a.name }),
      },
      type: (typeof a === 'object' && a.type) ? a.type : 'required',
    }));
  }

  const event = await withAuthRetry(userId, () =>
    graphRequest(accessToken, 'POST', '/me/events', payload)
  );

  console.log(`📅 用戶 ${userId} 建立行事曆事件：「${subject}」`);
  return {
    id:        event.id,
    subject:   event.subject,
    webLink:   event.webLink,
    teamsLink: event.onlineMeeting?.joinUrl || null,
    start:     event.start?.dateTime,
    end:       event.end?.dateTime,
  };
}

// ════════════════════════════════════════════════════════════
// 智慧通知路由（Delegated → Application fallback）
// ════════════════════════════════════════════════════════════

/**
 * 智慧通知：優先用用戶 OAuth 信箱發送，若未授權或授權失效則降級到系統信箱
 *
 * 決策流程：
 *   ① getValidToken(userId) → 有效 Token → sendEmailOnBehalfOfUser（Delegated）
 *   ② Token 不存在 / needsReauth → emailService.sendOutlookEmail（Application）
 *   ③ 其他非預期錯誤 → 直接拋出（不降級，避免靜默失敗）
 *
 * @param {number} userId
 * @param {object} emailData
 * @param {string|string[]} emailData.to
 * @param {string}           emailData.subject
 * @param {string}           emailData.htmlBody
 * @param {string|string[]} [emailData.cc]
 * @returns {Promise<{success: boolean, sentBy: 'delegated'|'application_fallback'}>}
 */
async function sendNotification(userId, { to, subject, htmlBody, cc }) {
  // ── 嘗試 Delegated 發送 ──────────────────────────────────
  try {
    const token = await getValidToken(userId);
    if (token) {
      return await sendEmailOnBehalfOfUser(userId, { to, subject, htmlBody, cc });
    }
    // token 為 null → 未授權，直接降級
    console.log(`📧 [Fallback] 用戶 ${userId} 未連接 Microsoft 帳號，使用系統信箱`);
  } catch (err) {
    if (err.needsReauth) {
      // OAuth 失效（invalid_grant、Token 解密失敗 等）
      console.warn(`⚠️  [Fallback] 用戶 ${userId} OAuth Token 失效，降級到系統信箱：${err.message}`);
    } else {
      // 非授權相關錯誤（網路問題、Graph API 服務錯誤）→ 不降級，直接拋出
      throw err;
    }
  }

  // ── Application 降級（Client Credentials）────────────────
  const { sendOutlookEmail } = getEmailService();
  await sendOutlookEmail({ to, subject, htmlBody, cc });

  console.log(`📧 [Application Fallback] 用戶 ${userId} 通知已透過系統信箱發送`);
  return { success: true, sentBy: 'application_fallback' };
}

// ════════════════════════════════════════════════════════════
// User Profile（/me）
// ════════════════════════════════════════════════════════════

/**
 * 取得用戶的 Microsoft Graph 個人資料
 *
 * @param {number} userId
 * @returns {Promise<{microsoftId, displayName, email, userPrincipalName, jobTitle, department, officeLocation, mobilePhone}>}
 */
async function getMicrosoftProfile(userId) {
  const { accessToken } = await getTokenOrThrow(userId);

  const selectFields = [
    'id', 'displayName', 'mail', 'userPrincipalName',
    'jobTitle', 'department', 'officeLocation', 'mobilePhone',
  ].join(',');

  const profile = await withAuthRetry(userId, () =>
    graphRequest(accessToken, 'GET', `/me?$select=${selectFields}`)
  );

  return {
    microsoftId:       profile.id,
    displayName:       profile.displayName,
    email:             profile.mail || profile.userPrincipalName,
    userPrincipalName: profile.userPrincipalName,
    jobTitle:          profile.jobTitle       || null,
    department:        profile.department     || null,
    officeLocation:    profile.officeLocation || null,
    mobilePhone:       profile.mobilePhone    || null,
  };
}

// ════════════════════════════════════════════════════════════
// Exports
// ════════════════════════════════════════════════════════════

module.exports = {
  // Email
  sendEmailOnBehalfOfUser,

  // Calendar
  getUserCalendarEvents,
  createCalendarEvent,

  // Smart routing
  sendNotification,

  // Profile
  getMicrosoftProfile,
};
