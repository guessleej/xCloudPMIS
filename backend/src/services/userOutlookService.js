/**
 * services/userOutlookService.js
 * ─────────────────────────────────────────────────────────────
 * Microsoft Graph API 委派操作服務（Delegated Permissions）
 *
 * 本模組代表已授權 OAuth 的用戶執行 Graph API 操作：
 *   - 從用戶信箱發送 Email（/me/sendMail）
 *   - 讀取 / 建立行事曆事件（/me/calendarView、/me/events）
 *   - 建立 Teams 線上會議（/me/onlineMeetings）
 *   - 同步任務到 Outlook To Do（/me/todo/lists/*/tasks）
 *   - 尋找會議空檔（/me/findMeetingTimes）
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

// PMIS 專用的 Outlook To Do 清單名稱
const PMIS_TODO_LIST_NAME = 'PMIS 任務';

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
// Teams Meeting（/me/onlineMeetings）
// ════════════════════════════════════════════════════════════

/**
 * 建立 Teams 線上會議
 *
 * @param {number} userId
 * @param {object} meetingData
 * @param {string}   meetingData.title
 * @param {Date|string} meetingData.startDateTime
 * @param {Date|string} meetingData.endDateTime
 * @param {Array<string|{email, name?}>} [meetingData.attendees]
 * @param {string}   [meetingData.description]
 * @returns {Promise<{id, joinUrl, subject, startDate, endDate, audioDialIn, conferenceId}>}
 */
async function createTeamsMeeting(userId, {
  title,
  startDateTime,
  endDateTime,
  attendees   = [],
  description,
}) {
  const { accessToken } = await getTokenOrThrow(userId);

  const payload = {
    subject:       title,
    startDateTime: new Date(startDateTime).toISOString(),
    endDateTime:   new Date(endDateTime).toISOString(),
    ...(description && { description }),
  };

  // onlineMeetings API 使用 participants.attendees 格式
  if (attendees.length > 0) {
    payload.participants = {
      attendees: attendees.map((a) => ({
        upn:  typeof a === 'string' ? a : (a.email || a.upn),
        role: 'attendee',
      })),
    };
  }

  const meeting = await withAuthRetry(userId, () =>
    graphRequest(accessToken, 'POST', '/me/onlineMeetings', payload)
  );

  console.log(`🎥 用戶 ${userId} 建立 Teams 會議：「${title}」`);
  return {
    id:          meeting.id,
    joinUrl:     meeting.joinWebUrl,
    subject:     meeting.subject,
    startDate:   meeting.startDateTime,
    endDate:     meeting.endDateTime,
    audioDialIn:  meeting.audioConferencing?.tollNumber    || null,
    conferenceId: meeting.audioConferencing?.conferenceId  || null,
  };
}

// ════════════════════════════════════════════════════════════
// Outlook Tasks / To Do（/me/todo/lists/*/tasks）
// ════════════════════════════════════════════════════════════

/**
 * 取得或建立「PMIS 任務」To Do 清單，回傳 listId
 *
 * @private
 * @param {string} accessToken
 * @param {number} userId        用於日誌記錄
 * @returns {Promise<string>}    listId
 */
async function _getOrCreatePmisTaskList(accessToken, userId) {
  const data = await graphRequest(accessToken, 'GET',
    '/me/todo/lists?$select=id,displayName'
  );

  const existing = (data?.value || []).find(
    (l) => l.displayName === PMIS_TODO_LIST_NAME
  );
  if (existing) return existing.id;

  // 清單不存在 → 自動建立
  const newList = await graphRequest(accessToken, 'POST', '/me/todo/lists', {
    displayName: PMIS_TODO_LIST_NAME,
  });

  console.log(`📋 用戶 ${userId} 自動建立 Outlook To Do 清單：「${PMIS_TODO_LIST_NAME}」`);
  return newList.id;
}

/**
 * 將 PMIS 任務同步到 Outlook To Do
 *
 * @param {number} userId
 * @param {object} taskData
 * @param {string}   taskData.title
 * @param {Date|string} [taskData.dueDate]
 * @param {'low'|'normal'|'high'} [taskData.priority]
 * @param {string}   [taskData.notes]
 * @param {string}   [taskData.projectName]   顯示在備註中的專案名稱
 * @param {number}   [taskData.pmisTaskId]    PMIS 任務 ID（附在備註）
 * @param {'notStarted'|'inProgress'|'completed'|'waitingOnOthers'|'deferred'} [taskData.status]
 * @returns {Promise<{outlookTaskId, listId, title, status, dueDate}>}
 */
async function syncTaskToOutlook(userId, {
  title,
  dueDate,
  priority    = 'normal',
  notes,
  projectName,
  pmisTaskId,
  status      = 'notStarted',
}) {
  const { accessToken } = await getTokenOrThrow(userId);

  // 取得 listId（含 401 保護）
  const listId = await withAuthRetry(userId, () =>
    _getOrCreatePmisTaskList(accessToken, userId)
  );

  // 組合備註內容
  const noteLines = [
    notes || '',
    projectName ? `📁 專案：${projectName}` : '',
    pmisTaskId  ? `🔗 PMIS 任務 ID：${pmisTaskId}` : '',
  ].filter(Boolean);
  const bodyContent = noteLines.join('\n').trim();

  const importanceMap = { high: 'high', low: 'low', normal: 'normal' };

  const payload = {
    title,
    status,
    importance: importanceMap[priority] || 'normal',
    ...(dueDate && {
      dueDateTime: {
        dateTime: new Date(dueDate).toISOString().replace(/Z$/, ''),
        timeZone: 'Asia/Taipei',
      },
    }),
    ...(bodyContent && {
      body: { contentType: 'text', content: bodyContent },
    }),
  };

  const task = await withAuthRetry(userId, () =>
    graphRequest(accessToken, 'POST', `/me/todo/lists/${listId}/tasks`, payload)
  );

  console.log(`✅ 用戶 ${userId} 任務「${title}」已同步至 Outlook To Do`);
  return {
    outlookTaskId: task.id,
    listId,
    title:   task.title,
    status:  task.status,
    dueDate: task.dueDateTime?.dateTime || null,
  };
}

/**
 * 更新 Outlook To Do 任務（PMIS 任務狀態變更時雙向同步）
 *
 * @param {number} userId
 * @param {string} listId       從 syncTaskToOutlook 取得的 listId
 * @param {string} taskId       Outlook Task ID
 * @param {object} updates
 * @param {'notStarted'|'inProgress'|'completed'|'waitingOnOthers'|'deferred'} [updates.status]
 * @param {string}   [updates.title]
 * @param {Date|string|null} [updates.dueDate]  null = 移除截止日
 * @param {string}   [updates.notes]
 * @returns {Promise<{outlookTaskId, status, completedDateTime}>}
 */
async function updateOutlookTask(userId, listId, taskId, {
  status,
  title,
  dueDate,
  notes,
}) {
  const { accessToken } = await getTokenOrThrow(userId);

  const patch = {};
  if (status !== undefined) patch.status = status;
  if (title  !== undefined) patch.title  = title;
  if (notes  !== undefined) patch.body   = { contentType: 'text', content: notes };
  if (dueDate !== undefined) {
    patch.dueDateTime = dueDate
      ? {
          dateTime: new Date(dueDate).toISOString().replace(/Z$/, ''),
          timeZone: 'Asia/Taipei',
        }
      : null;
  }

  const task = await withAuthRetry(userId, () =>
    graphRequest(accessToken, 'PATCH',
      `/me/todo/lists/${listId}/tasks/${taskId}`, patch
    )
  );

  return {
    outlookTaskId:     task.id,
    status:            task.status,
    completedDateTime: task.completedDateTime?.dateTime || null,
  };
}

// ════════════════════════════════════════════════════════════
// Scheduling Assistant（/me/findMeetingTimes）
// ════════════════════════════════════════════════════════════

/**
 * 尋找所有與會者的共同空閒時段（Scheduling Assistant）
 *
 * @param {number}   userId
 * @param {Array<string|{email: string}>} attendees  與會者 Email 清單
 * @param {number}   [durationMinutes]  會議長度（分鐘，預設 60）
 * @param {object}   [options]
 * @param {Date|string} [options.searchFrom]  搜尋起始時間（預設：現在）
 * @param {Date|string} [options.searchTo]    搜尋結束時間（預設：7 天後）
 * @param {number}   [options.maxSuggestions] 最多建議數量（預設 5）
 * @returns {Promise<{suggestionQuality: string, suggestions: Array}>}
 */
async function findMeetingTimes(userId, attendees, durationMinutes = 60, {
  searchFrom,
  searchTo,
  maxSuggestions = 5,
} = {}) {
  const { accessToken } = await getTokenOrThrow(userId);

  const now     = new Date();
  const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const payload = {
    attendees: attendees.map((a) => ({
      emailAddress: {
        address: typeof a === 'string' ? a : a.email,
      },
      type: 'required',
    })),
    timeConstraint: {
      activityDomain: 'work',
      timeSlots: [{
        start: {
          dateTime: new Date(searchFrom || now).toISOString(),
          timeZone: 'Asia/Taipei',
        },
        end: {
          dateTime: new Date(searchTo || weekOut).toISOString(),
          timeZone: 'Asia/Taipei',
        },
      }],
    },
    meetingDuration:          `PT${durationMinutes}M`,
    maxCandidates:            maxSuggestions,
    isOrganizerOptional:      false,
    returnSuggestionReasons:  true,
    minimumAttendeePercentage: 100,
  };

  const data = await withAuthRetry(userId, () =>
    graphRequest(accessToken, 'POST', '/me/findMeetingTimes', payload)
  );

  return {
    suggestionQuality: data.emptySuggestionsReason || 'available',
    suggestions: (data.meetingTimeSuggestions || []).map((s) => ({
      confidence: s.confidence,
      start:      s.meetingTimeSlot?.start?.dateTime,
      end:        s.meetingTimeSlot?.end?.dateTime,
      reason:     s.suggestionReason,
      attendeeAvailability: (s.attendeeAvailability || []).map((a) => ({
        email:        a.attendee?.emailAddress?.address,
        availability: a.availability,
      })),
    })),
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

  // Teams
  createTeamsMeeting,

  // Tasks
  syncTaskToOutlook,
  updateOutlookTask,

  // Scheduling
  findMeetingTimes,

  // Smart routing
  sendNotification,

  // Profile
  getMicrosoftProfile,
};
